// -----------------------------------------------------------------------------
// InheritVault - CKB RPC + CCC transaction queries
// -----------------------------------------------------------------------------

import type {
  CkbCell,
  CkbTransactionStatus,
  OutPoint,
  TipHeader,
} from "../types";
import { NETWORK_CONFIGS, type Network } from "../config";

/**
 * Simple JSON-RPC helper for CKB node.
 */
async function rpcCall(
  url: string,
  method: string,
  params: unknown[]
): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC Error");
  }
  return json.result;
}

async function getPublicClient(network: Network): Promise<any> {
  const { ccc } = await import("@ckb-ccc/connector-react");
  return network === "testnet"
    ? new ccc.ClientPublicTestnet()
    : new ccc.ClientPublicMainnet();
}

function toRpcHex(value: bigint | number): string {
  return `0x${BigInt(value).toString(16)}`;
}

function toRpcOutPoint(outPoint: OutPoint) {
  return {
    tx_hash: outPoint.txHash,
    index: toRpcHex(outPoint.index),
  };
}

function normalizeScript(script: any) {
  if (!script) return null;
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

function normalizeCellOutput(output: any) {
  return {
    capacity: toRpcHex(output.capacity),
    lock: normalizeScript(output.lock),
    type: normalizeScript(output.type),
  };
}

function normalizeTransactionResponse(
  txHash: string,
  response: any
): CkbTransactionStatus {
  return {
    transaction: {
      hash: txHash,
      outputs: response.transaction.outputs.map(normalizeCellOutput),
      outputs_data: response.transaction.outputsData.map((data: string) => data ?? "0x"),
    },
    tx_status: {
      status: response.status,
      block_hash: response.blockHash ?? null,
      block_number: response.blockNumber != null ? toRpcHex(response.blockNumber) : null,
      reason: response.reason ?? null,
    },
  };
}

function normalizeLiveCell(outPoint: OutPoint, liveCell: any): CkbCell | null {
  if (liveCell?.status !== "live" || !liveCell.cell?.output) {
    return null;
  }

  return {
    output: liveCell.cell.output,
    output_data: liveCell.cell.data?.content ?? "0x",
    out_point: toRpcOutPoint(outPoint),
  };
}

/**
 * Get the current tip header (block number + timestamp).
 */
export async function getTipHeader(network: Network): Promise<TipHeader> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  const header = await rpcCall(rpcUrl, "get_tip_header", []);
  return {
    blockNumber: parseInt(header.number, 16),
    timestamp: parseInt(header.timestamp, 16) / 1000, // CKB stores milliseconds
  };
}

/**
 * Get transaction status (to check if a vault tx is confirmed).
 * Uses CCC's getTransaction first, then falls back to raw RPC.
 */
export async function getTransactionStatus(
  network: Network,
  txHash: string
): Promise<CkbTransactionStatus> {
  try {
    const client = await getPublicClient(network);
    const response = await client.getTransaction(txHash);
    if (response) {
      return normalizeTransactionResponse(txHash, response);
    }
  } catch (error) {
    console.error("CCC transaction lookup failed, falling back to RPC:", error);
  }

  const { rpcUrl } = NETWORK_CONFIGS[network];
  return rpcCall(rpcUrl, "get_transaction", [txHash]);
}

/**
 * Query a specific live cell by OutPoint.
 * Returns null if the cell has been spent or doesn't exist.
 */
export async function getCellByOutPoint(
  network: Network,
  outPoint: OutPoint
): Promise<CkbCell | null> {
  try {
    const { rpcUrl } = NETWORK_CONFIGS[network];
    const liveCell = await rpcCall(rpcUrl, "get_live_cell", [
      toRpcOutPoint(outPoint),
      true,
    ]);
    return normalizeLiveCell(outPoint, liveCell);
  } catch {
    return getCellByOutPointViaTransaction(network, outPoint);
  }
}

/**
 * Fallback: inspect the output in the originating transaction via CCC/RPC.
 */
async function getCellByOutPointViaTransaction(
  network: Network,
  outPoint: OutPoint
): Promise<CkbCell | null> {
  try {
    const txStatus = await getTransactionStatus(network, outPoint.txHash);

    if (!txStatus.transaction) {
      return null;
    }

    const output = txStatus.transaction.outputs[outPoint.index];
    const outputData = txStatus.transaction.outputs_data[outPoint.index];
    if (!output) {
      return null;
    }

    return {
      output,
      output_data: outputData || "0x",
      out_point: toRpcOutPoint(outPoint),
    };
  } catch {
    return null;
  }
}

/**
 * Determine if a cell is currently unspent.
 */
export async function isCellLive(
  network: Network,
  outPoint: OutPoint
): Promise<boolean> {
  const { rpcUrl } = NETWORK_CONFIGS[network];

  try {
    const result = await rpcCall(rpcUrl, "get_live_cell", [
      toRpcOutPoint(outPoint),
      true,
    ]);
    return result.status === "live";
  } catch {
    return false;
  }
}
