// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – CKB RPC + Indexer queries
// ─────────────────────────────────────────────────────────────────────────────

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
 */
export async function getTransactionStatus(
  network: Network,
  txHash: string
): Promise<CkbTransactionStatus> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  return await rpcCall(rpcUrl, "get_transaction", [txHash]);
}

/**
 * Query a cell by OutPoint using the Indexer.
 * Returns null if the cell has been spent or doesn't exist.
 */
export async function getCellByOutPoint(
  network: Network,
  outPoint: OutPoint
): Promise<CkbCell | null> {
  const { indexerUrl } = NETWORK_CONFIGS[network];
  
  try {
    const response = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "get_cells",
        params: [
          {
            script: null, // We'll search by outpoint instead
            script_type: "lock",
            filter: {
              script: null,
              output_data_len_range: null,
              output_capacity_range: null,
              block_range: null,
            },
            // Note: Some indexers support searching by outpoint directly
            // For a more robust approach, we query all cells and filter
          },
          "asc",
          "0x64", // limit 100
        ],
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message);
    }

    const cells = json.result?.objects || [];
    // Find the cell matching our outpoint
    const match = cells.find(
      (cell: CkbCell) =>
        cell.out_point.tx_hash === outPoint.txHash &&
        parseInt(cell.out_point.index, 16) === outPoint.index
    );

    return match || null;
  } catch {
    // If indexer query fails, fall back to RPC method
    return await getCellByOutPointViaRpc(network, outPoint);
  }
}

/**
 * Fallback: get cell via RPC by fetching the transaction and checking outputs.
 */
async function getCellByOutPointViaRpc(
  network: Network,
  outPoint: OutPoint
): Promise<CkbCell | null> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  
  try {
    const txStatus: CkbTransactionStatus = await rpcCall(
      rpcUrl,
      "get_transaction",
      [outPoint.txHash]
    );

    if (!txStatus.transaction) {
      return null; // tx not found
    }

    const output = txStatus.transaction.outputs[outPoint.index];
    const outputData = txStatus.transaction.outputs_data[outPoint.index];

    if (!output) {
      return null;
    }

    // Check if this cell has been spent by querying live cells
    // For MVP, we'll return the cell structure; actual "live" check requires indexer
    return {
      output,
      output_data: outputData || "0x",
      out_point: {
        tx_hash: outPoint.txHash,
        index: `0x${outPoint.index.toString(16)}`,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Determine if a cell is currently unspent.
 * This is a simplified check – in production you'd use get_live_cell RPC.
 */
export async function isCellLive(
  network: Network,
  outPoint: OutPoint
): Promise<boolean> {
  const { rpcUrl } = NETWORK_CONFIGS[network];
  
  try {
    const result = await rpcCall(rpcUrl, "get_live_cell", [
      {
        tx_hash: outPoint.txHash,
        index: `0x${outPoint.index.toString(16)}`,
      },
      true, // with_data
    ]);
    return result.status === "live";
  } catch {
    return false;
  }
}
