// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – On-Chain Vault Indexer
//
// Queries the CKB Indexer for vault cells and decodes their metadata.
// This replaces localStorage as the source of truth for vault data.
// ─────────────────────────────────────────────────────────────────────────────

import { NETWORK_CONFIGS, type Network } from "../config";
import {
  decodeVaultCellData,
  isVaultCell,
  VAULT_DATA_PREFIX,
  type VaultCellPayload,
} from "./codec";

// ── Types ───────────────────────────────────────────────────────────────────

/** Lock script in CKB-RPC snake_case format (for indexer queries). */
export interface IndexerScript {
  code_hash: string;
  hash_type: string;
  args: string;
}

/** A vault that exists on-chain as a live cell. */
export interface OnChainVault {
  outPoint: { txHash: string; index: number };
  capacityCKB: string;
  beneficiaryLock: IndexerScript;
  data: VaultCellPayload;
  blockNumber?: number;
  status: "live";
}

/** A vault read from a transaction (may or may not still be live). */
export interface VaultFromTx {
  outPoint: { txHash: string; index: number };
  capacityCKB: string;
  beneficiaryLock: IndexerScript;
  data: VaultCellPayload;
  txStatus: "pending" | "proposed" | "committed" | "rejected" | "unknown";
  isLive: boolean;
  blockNumber?: number;
}

// ── Indexer: fetch live vault cells for a lock script ────────────────────────

/**
 * Fetch all live vault cells whose lock script matches the given one.
 * Useful for the beneficiary dashboard: "show me all vaults destined for me."
 */
export async function fetchVaultsForLockScript(
  network: Network,
  lockScript: IndexerScript
): Promise<OnChainVault[]> {
  const { indexerUrl } = NETWORK_CONFIGS[network];
  const vaults: OnChainVault[] = [];
  let cursor: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const searchKey: Record<string, unknown> = {
      script: {
        code_hash: lockScript.code_hash,
        hash_type: lockScript.hash_type,
        args: lockScript.args,
      },
      script_type: "lock",
      filter: {
        output_data: VAULT_DATA_PREFIX,
        output_data_filter_mode: "prefix",
      },
      with_data: true,
    };

    const params: unknown[] = [searchKey, "desc", "0x64"]; // limit 100
    if (cursor) params.push(cursor);

    try {
      const res = await fetch(indexerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "get_cells",
          params,
        }),
      });

      const json = await res.json();

      if (json.error) {
        console.error("Indexer error:", json.error);
        // Fallback: try without output_data filter (client-side filtering)
        return await fetchVaultsForLockScriptFallback(network, lockScript);
      }

      const objects: any[] = json.result?.objects ?? [];

      for (const cell of objects) {
        const decoded = decodeVaultCellData(cell.output_data);
        if (!decoded) continue;

        vaults.push({
          outPoint: {
            txHash: cell.out_point.tx_hash,
            index: parseInt(cell.out_point.index, 16),
          },
          capacityCKB: (parseInt(cell.output.capacity, 16) / 1e8).toString(),
          beneficiaryLock: {
            code_hash: cell.output.lock.code_hash,
            hash_type: cell.output.lock.hash_type,
            args: cell.output.lock.args,
          },
          data: decoded,
          blockNumber: cell.block_number
            ? parseInt(cell.block_number, 16)
            : undefined,
          status: "live",
        });
      }

      cursor = json.result?.last_cursor ?? null;
      if (objects.length < 100) break; // no more pages
    } catch (err) {
      console.error("Indexer fetch failed:", err);
      return await fetchVaultsForLockScriptFallback(network, lockScript);
    }
  }

  return vaults;
}

/**
 * Fallback when the indexer doesn't support output_data filtering.
 * Fetches all cells for the lock script and filters client-side by magic bytes.
 */
async function fetchVaultsForLockScriptFallback(
  network: Network,
  lockScript: IndexerScript
): Promise<OnChainVault[]> {
  const { indexerUrl } = NETWORK_CONFIGS[network];
  const vaults: OnChainVault[] = [];
  let cursor: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const searchKey: Record<string, unknown> = {
      script: {
        code_hash: lockScript.code_hash,
        hash_type: lockScript.hash_type,
        args: lockScript.args,
      },
      script_type: "lock",
      with_data: true,
    };

    const params: unknown[] = [searchKey, "desc", "0x64"];
    if (cursor) params.push(cursor);

    const res = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "get_cells",
        params,
      }),
    });

    const json = await res.json();
    if (json.error) {
      console.error("Fallback indexer error:", json.error);
      break;
    }

    const objects: any[] = json.result?.objects ?? [];

    for (const cell of objects) {
      if (!isVaultCell(cell.output_data)) continue;
      const decoded = decodeVaultCellData(cell.output_data);
      if (!decoded) continue;

      vaults.push({
        outPoint: {
          txHash: cell.out_point.tx_hash,
          index: parseInt(cell.out_point.index, 16),
        },
        capacityCKB: (parseInt(cell.output.capacity, 16) / 1e8).toString(),
        beneficiaryLock: {
          code_hash: cell.output.lock.code_hash,
          hash_type: cell.output.lock.hash_type,
          args: cell.output.lock.args,
        },
        data: decoded,
        blockNumber: cell.block_number
          ? parseInt(cell.block_number, 16)
          : undefined,
        status: "live",
      });
    }

    cursor = json.result?.last_cursor ?? null;
    if (objects.length < 100) break;
  }

  return vaults;
}

// ── RPC: fetch a single vault from its transaction ──────────────────────────

/**
 * Fetch vault data from a transaction (works even if the cell is already spent).
 * Also checks whether the cell is currently live.
 */
export async function fetchVaultFromTransaction(
  network: Network,
  txHash: string,
  index: number
): Promise<VaultFromTx | null> {
  const { rpcUrl } = NETWORK_CONFIGS[network];

  // 1. Get the transaction
  const txRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "get_transaction",
      params: [txHash],
    }),
  });
  const txJson = await txRes.json();
  if (txJson.error) throw new Error(txJson.error.message);

  const txResult = txJson.result;
  if (!txResult?.transaction) return null;

  const output = txResult.transaction.outputs[index];
  const outputData = txResult.transaction.outputs_data[index];
  if (!output || !outputData) return null;
  if (!isVaultCell(outputData)) return null;

  const decoded = decodeVaultCellData(outputData);
  if (!decoded) return null;

  const txStatus = txResult.tx_status?.status ?? "unknown";

  // 2. Check if cell is still live
  let isLive = false;
  if (txStatus === "committed") {
    try {
      const liveRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "get_live_cell",
          params: [
            { tx_hash: txHash, index: `0x${index.toString(16)}` },
            false,
          ],
        }),
      });
      const liveJson = await liveRes.json();
      isLive = liveJson.result?.status === "live";
    } catch {
      // assume not live
    }
  }

  return {
    outPoint: { txHash, index },
    capacityCKB: (parseInt(output.capacity, 16) / 1e8).toString(),
    beneficiaryLock: {
      code_hash: output.lock.code_hash,
      hash_type: output.lock.hash_type,
      args: output.lock.args,
    },
    data: decoded,
    txStatus,
    isLive,
    blockNumber: txResult.tx_status?.block_number
      ? parseInt(txResult.tx_status.block_number, 16)
      : undefined,
  };
}

/**
 * Verify that a vault is authentic by reading on-chain data.
 * Returns the full vault info if valid, or null if not a valid InheritVault cell.
 */
export async function verifyVault(
  network: Network,
  txHash: string,
  index: number
): Promise<VaultFromTx | null> {
  return fetchVaultFromTransaction(network, txHash, index);
}
