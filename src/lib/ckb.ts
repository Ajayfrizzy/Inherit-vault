// -----------------------------------------------------------------------------
// InheritVault - CKB RPC + CCC transaction queries
// -----------------------------------------------------------------------------

import type {
  CkbCell,
  CkbTransactionStatus,
  LiveCellStatus,
  OutPoint,
  TipHeader,
} from "../types";
import { NETWORK_CONFIGS, type Network } from "../config";

interface JsonRpcError {
  message?: string;
}

interface JsonRpcResponse<T> {
  result: T;
  error?: JsonRpcError;
}

interface RpcLiveCellResponse {
  status?: "live" | "dead" | "unknown";
  cell?: {
    output?: CkbCell["output"];
    data?: {
      content?: string;
    };
  };
}

interface RpcTipHeader {
  number: string;
  timestamp: string;
}

interface RpcHeader {
  timestamp?: string;
}

interface ClientScriptLike {
  codeHash: string;
  hashType: CkbCell["output"]["lock"]["hash_type"];
  args: string;
}

interface ClientCellLike {
  cellOutput: {
    capacity: bigint;
    lock: ClientScriptLike;
    type?: ClientScriptLike | null;
  };
  outputData?: string;
}

/**
 * Simple JSON-RPC helper for CKB node.
 */
async function rpcCall<T>(
  url: string,
  method: string,
  params: unknown[]
): Promise<T> {
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
  const json = (await response.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(json.error.message || "RPC Error");
  }
  return json.result;
}

async function getPublicClient(network: Network) {
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

function normalizeRequiredScript(script: ClientScriptLike): CkbCell["output"]["lock"] {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

function normalizeOptionalScript(script: ClientScriptLike | null | undefined) {
  if (!script) return null;
  return normalizeRequiredScript(script);
}

function normalizeCellOutput(output: ClientCellLike["cellOutput"]): CkbCell["output"] {
  return {
    capacity: toRpcHex(output.capacity),
    lock: normalizeRequiredScript(output.lock),
    type: normalizeOptionalScript(output.type),
  };
}

function normalizeTransactionStatus(
  status: string
): CkbTransactionStatus["tx_status"]["status"] {
  if (status === "pending" || status === "proposed" || status === "committed") {
    return status;
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (status === "sent") {
    return "pending";
  }
  return "unknown";
}

function normalizeTransactionResponse(
  txHash: string,
  response: {
    transaction: {
      outputs: ClientCellLike["cellOutput"][];
      outputsData: Array<string | undefined>;
    };
    status: string;
    blockHash?: string | null;
    blockNumber?: bigint | number | null;
    reason?: string | null;
  }
): CkbTransactionStatus {
  return {
    transaction: {
      hash: txHash,
      outputs: response.transaction.outputs.map(normalizeCellOutput),
      outputs_data: response.transaction.outputsData.map((data) => data ?? "0x"),
    },
    tx_status: {
      status: normalizeTransactionStatus(response.status),
      block_hash: response.blockHash ?? null,
      block_number: response.blockNumber != null ? toRpcHex(response.blockNumber) : null,
      reason: response.reason ?? null,
    },
  };
}

function normalizeLiveCell(
  outPoint: OutPoint,
  liveCell: RpcLiveCellResponse
): CkbCell | null {
  if (liveCell?.status !== "live" || !liveCell.cell?.output) {
    return null;
  }

  return {
    output: liveCell.cell.output,
    output_data: liveCell.cell.data?.content ?? "0x",
    out_point: toRpcOutPoint(outPoint),
  };
}

function normalizeClientLiveCell(
  outPoint: OutPoint,
  liveCell: ClientCellLike
): CkbCell {
  return {
    output: normalizeCellOutput(liveCell.cellOutput),
    output_data: liveCell.outputData ?? "0x",
    out_point: toRpcOutPoint(outPoint),
  };
}

/**
 * Get the current tip header (block number + timestamp).
 */
export async function getTipHeader(network: Network): Promise<TipHeader> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  const header = await rpcCall<RpcTipHeader>(rpcUrl, "get_tip_header", []);
  return {
    blockNumber: parseInt(header.number, 16),
    timestamp: parseInt(header.timestamp, 16) / 1000, // CKB stores milliseconds
  };
}

/**
 * Get a block header timestamp by block hash.
 * Returns Unix timestamp in seconds.
 */
export async function getBlockTimestampByHash(
  network: Network,
  blockHash: string
): Promise<number | null> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  const header = await rpcCall<RpcHeader>(rpcUrl, "get_header", [blockHash]);
  if (!header?.timestamp) return null;

  return parseInt(header.timestamp, 16) / 1000;
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
    const liveCell = await rpcCall<RpcLiveCellResponse>(rpcUrl, "get_live_cell", [
      toRpcOutPoint(outPoint),
      true,
    ]);
    return normalizeLiveCell(outPoint, liveCell);
  } catch {
    try {
      const client = await getPublicClient(network);
      const liveCell = await client.getCellLive(outPoint, true, true);
      return liveCell ? normalizeClientLiveCell(outPoint, liveCell) : null;
    } catch {
      return null;
    }
  }
}

export async function getLiveCellStatus(
  network: Network,
  outPoint: OutPoint
): Promise<LiveCellStatus> {
  try {
    const { rpcUrl } = NETWORK_CONFIGS[network];
    const liveCell = await rpcCall<RpcLiveCellResponse>(rpcUrl, "get_live_cell", [
      toRpcOutPoint(outPoint),
      true,
    ]);

    if (liveCell.status === "live") {
      return "live";
    }
    if (liveCell.status === "dead") {
      return "spent";
    }
    return "unknown";
  } catch {
    try {
      const client = await getPublicClient(network);
      const liveCell = await client.getCellLive(outPoint, true, true);
      return liveCell ? "live" : "unknown";
    } catch {
      return "unknown";
    }
  }
}

/**
 * Determine if a cell is currently unspent.
 */
export async function isCellLive(
  network: Network,
  outPoint: OutPoint
): Promise<boolean> {
  return (await getLiveCellStatus(network, outPoint)) === "live";
}
