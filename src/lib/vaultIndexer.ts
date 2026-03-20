// -----------------------------------------------------------------------------
// InheritVault - On-Chain Vault Indexer
//
// Queries the CKB Indexer for vault cells and decodes their metadata.
// This replaces localStorage as the source of truth for vault data.
// -----------------------------------------------------------------------------

import { getIndexerUrls, type Network } from "../config";
import { getAddressFromIndexerLock } from "./ccc";
import { getCellByOutPoint, getTransactionStatus } from "./ckb";
import {
  decodeVaultCellData,
  isVaultCell,
  VAULT_DATA_PREFIX,
  type VaultCellPayload,
} from "./codec";

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
  beneficiaryAddress: string;
  data: VaultCellPayload;
  txStatus: "pending" | "proposed" | "committed" | "rejected" | "unknown";
  isLive: boolean;
  blockNumber?: number;
}

const prefixSupportByIndexerUrl = new Map<string, boolean>();

function parseVaultCell(cell: any): OnChainVault | null {
  const decoded = decodeVaultCellData(cell.output_data);
  if (!decoded) return null;

  return {
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
  };
}

async function fetchVaultsForLockScriptFromIndexer(
  indexerUrl: string,
  lockScript: IndexerScript,
  usePrefixFilter: boolean
): Promise<OnChainVault[]> {
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

    if (usePrefixFilter) {
      searchKey.filter = {
        output_data: VAULT_DATA_PREFIX,
        output_data_filter_mode: "prefix",
      };
    }

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
      throw new Error(json.error.message || "Indexer query failed");
    }

    const objects: any[] = json.result?.objects ?? [];

    if (usePrefixFilter && objects.some((cell) => !isVaultCell(cell.output_data))) {
      throw new Error("INDEXER_PREFIX_FILTER_UNSUPPORTED");
    }

    for (const cell of objects) {
      if (!usePrefixFilter && !isVaultCell(cell.output_data)) continue;
      const parsed = parseVaultCell(cell);
      if (parsed) vaults.push(parsed);
    }

    cursor = json.result?.last_cursor ?? null;
    if (objects.length < 100) break;
  }

  return vaults;
}

/**
 * Fetch all live vault cells whose lock script matches the given one.
 * Useful for the beneficiary dashboard: "show me all vaults destined for me."
 */
export async function fetchVaultsForLockScript(
  network: Network,
  lockScript: IndexerScript
): Promise<OnChainVault[]> {
  for (const indexerUrl of getIndexerUrls(network)) {
    try {
      if (prefixSupportByIndexerUrl.get(indexerUrl) === false) {
        continue;
      }

      const vaults = await fetchVaultsForLockScriptFromIndexer(
        indexerUrl,
        lockScript,
        true
      );
      prefixSupportByIndexerUrl.set(indexerUrl, true);
      return vaults;
    } catch (err) {
      if (err instanceof Error && err.message === "INDEXER_PREFIX_FILTER_UNSUPPORTED") {
        prefixSupportByIndexerUrl.set(indexerUrl, false);
        console.warn(
          `Indexer ${indexerUrl} ignored output_data_filter_mode="prefix"; trying the next configured endpoint.`
        );
        continue;
      }

      console.error(`Indexer fetch failed for ${indexerUrl}:`, err);
    }
  }

  return fetchVaultsForLockScriptFallback(network, lockScript);
}

/**
 * Fallback when the indexer doesn't support output_data filtering.
 * Fetches all cells for the lock script and filters client-side by magic bytes.
 */
async function fetchVaultsForLockScriptFallback(
  network: Network,
  lockScript: IndexerScript
): Promise<OnChainVault[]> {
  let lastError: Error | null = null;

  for (const indexerUrl of getIndexerUrls(network)) {
    try {
      return await fetchVaultsForLockScriptFromIndexer(indexerUrl, lockScript, false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown indexer error");
      console.error(`Fallback indexer fetch failed for ${indexerUrl}:`, error);
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

/**
 * Fetch vault data from a transaction (works even if the cell is already spent).
 * Also checks whether the cell is currently live.
 */
export async function fetchVaultFromTransaction(
  network: Network,
  txHash: string,
  index: number
): Promise<VaultFromTx | null> {
  const txResult = await getTransactionStatus(network, txHash);
  if (!txResult.transaction) return null;

  const output = txResult.transaction.outputs[index];
  const outputData = txResult.transaction.outputs_data[index];
  if (!output || !outputData) return null;
  if (!isVaultCell(outputData)) return null;

  const decoded = decodeVaultCellData(outputData);
  if (!decoded) return null;

  const txStatus = txResult.tx_status?.status ?? "unknown";
  const beneficiaryLock = {
    code_hash: output.lock.code_hash,
    hash_type: output.lock.hash_type,
    args: output.lock.args,
  };
  const beneficiaryAddress = await getAddressFromIndexerLock(
    beneficiaryLock,
    network
  ).catch(() => "");
  const liveCell = txStatus === "committed"
    ? await getCellByOutPoint(network, { txHash, index })
    : null;

  return {
    outPoint: { txHash, index },
    capacityCKB: (parseInt(output.capacity, 16) / 1e8).toString(),
    beneficiaryLock,
    beneficiaryAddress,
    data: decoded,
    txStatus,
    isLive: liveCell !== null,
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
