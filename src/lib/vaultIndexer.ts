// -----------------------------------------------------------------------------
// InheritVault - On-chain vault discovery and verification
// -----------------------------------------------------------------------------

import { getIndexerUrls, isVaultScriptsReady, type Network } from "../config";
import type {
  CkbCellOutput,
  CkbScript,
  LiveCellStatus,
  VaultAuthenticity,
  VaultFormat,
  VaultRecordStatus,
} from "../types";
import {
  getAddressFromCccScript,
  getAddressFromIndexerLock,
  getBeneficiaryAddressFromScriptedLock,
} from "./ccc";
import {
  getBlockTimestampByHash,
  getLiveCellStatus,
  getTransactionStatus,
} from "./ckb";
import {
  decodeVaultCellData,
  type VaultCellPayload,
} from "./codec";
import {
  getScriptedVaultTypeArgs,
  getVaultTypeDeployment,
  isScriptedVaultType,
} from "./vaultScripts";

export interface OnChainVault {
  outPoint: { txHash: string; index: number };
  capacityCKB: string;
  beneficiaryLock: CkbScript;
  beneficiaryAddress: string;
  data: VaultCellPayload;
  blockNumber?: number;
  blockTimestamp?: number;
  status: "live";
  format: "scripted";
  authenticity: "verified";
}

export interface VaultFromTx {
  outPoint: { txHash: string; index: number };
  capacityCKB: string;
  beneficiaryLock: CkbScript;
  beneficiaryAddress: string;
  data: VaultCellPayload;
  txStatus: "pending" | "proposed" | "committed" | "rejected" | "unknown";
  liveCellStatus: LiveCellStatus;
  isLive: boolean;
  blockNumber?: number;
  blockTimestamp?: number;
  format: VaultFormat;
  authenticity: VaultAuthenticity;
  isAuthentic: boolean;
}

export function getVaultRecordStatus(
  txStatus: VaultFromTx["txStatus"],
  liveCellStatus: LiveCellStatus,
  fallbackStatus?: VaultRecordStatus
): VaultRecordStatus {
  if (txStatus === "pending" || txStatus === "proposed") {
    return "pending";
  }

  if (txStatus !== "committed") {
    return fallbackStatus ?? "unknown";
  }

  if (liveCellStatus === "live") {
    return "live";
  }

  if (liveCellStatus === "spent") {
    return "spent";
  }

  return "unknown";
}

function capacityHexToCkb(capacityHex: string): string {
  return (parseInt(capacityHex, 16) / 1e8).toString();
}

function normalizeLock(output: CkbCellOutput): CkbScript {
  return {
    code_hash: output.lock.code_hash,
    hash_type: output.lock.hash_type,
    args: output.lock.args,
  };
}

async function hydrateVaultPayload(
  network: Network,
  payload: VaultCellPayload
): Promise<VaultCellPayload> {
  const ownerAddress = await getAddressFromCccScript(payload.ownerLock, network).catch(
    () => undefined
  );

  return {
    ...payload,
    ownerAddress,
  };
}

async function parseScriptedVaultCell(network: Network, cell: any): Promise<OnChainVault | null> {
  const decoded = decodeVaultCellData(cell.output_data);
  if (!decoded) return null;

  const beneficiaryLock = {
    code_hash: cell.output.lock.code_hash,
    hash_type: cell.output.lock.hash_type,
    args: cell.output.lock.args,
  } as CkbScript;

  return {
    outPoint: {
      txHash: cell.out_point.tx_hash,
      index: parseInt(cell.out_point.index, 16),
    },
    capacityCKB: capacityHexToCkb(cell.output.capacity),
    beneficiaryLock,
    beneficiaryAddress: await getBeneficiaryAddressFromScriptedLock(
      beneficiaryLock,
      network
    ).catch(() => ""),
    data: await hydrateVaultPayload(network, decoded),
    blockNumber: cell.block_number ? parseInt(cell.block_number, 16) : undefined,
    blockTimestamp: undefined,
    status: "live",
    format: "scripted",
    authenticity: "verified",
  };
}

async function parseVaultFromTransactionOutput(
  network: Network,
  txHash: string,
  index: number,
  output: CkbCellOutput,
  outputData: string,
  txStatus: VaultFromTx["txStatus"],
  liveCellStatus: LiveCellStatus,
  blockNumber?: number,
  blockTimestamp?: number
): Promise<VaultFromTx | null> {
  const decoded = decodeVaultCellData(outputData);
  if (!decoded) return null;

  const beneficiaryLock = normalizeLock(output);
  const scripted = isScriptedVaultType(output.type, network);

  const beneficiaryAddress = scripted
    ? await getBeneficiaryAddressFromScriptedLock(beneficiaryLock, network).catch(() => "")
    : await getAddressFromIndexerLock(beneficiaryLock, network).catch(() => "");

  return {
    outPoint: { txHash, index },
    capacityCKB: capacityHexToCkb(output.capacity),
    beneficiaryLock,
    beneficiaryAddress,
    data: await hydrateVaultPayload(network, decoded),
    txStatus,
    liveCellStatus,
    isLive: liveCellStatus === "live",
    blockNumber,
    blockTimestamp,
    format: scripted ? "scripted" : "legacy",
    authenticity: scripted ? "verified" : "legacy",
    isAuthentic: scripted,
  };
}

async function fetchVaultsForLockScriptFromIndexer(
  network: Network,
  indexerUrl: string,
  lockScript: CkbScript
): Promise<OnChainVault[]> {
  const typeDeployment = getVaultTypeDeployment(network);
  if (!typeDeployment) {
    throw new Error(
      `Vault scripts are not configured for ${network}. Beneficiary discovery is unavailable until the deployment metadata is added.`
    );
  }

  const vaults: OnChainVault[] = [];
  let cursor: string | null = null;

  while (true) {
    const searchKey: Record<string, unknown> = {
      script: {
        code_hash: typeDeployment.codeHash,
        hash_type: typeDeployment.hashType,
        args: getScriptedVaultTypeArgs(network),
      },
      script_type: "type",
      with_data: true,
      filter: {
        script: {
          code_hash: lockScript.code_hash,
          hash_type: lockScript.hash_type,
          args: lockScript.args,
        },
      },
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
      throw new Error(json.error.message || "Indexer query failed");
    }

    const objects: any[] = json.result?.objects ?? [];

    for (const cell of objects) {
      if (!isScriptedVaultType(cell.output.type, network)) continue;
      const parsed = await parseScriptedVaultCell(network, cell);
      if (parsed) vaults.push(parsed);
    }

    cursor = json.result?.last_cursor ?? null;
    if (objects.length < 100) break;
  }

  return vaults;
}

export async function fetchVaultsForLockScript(
  network: Network,
  lockScript: CkbScript
): Promise<OnChainVault[]> {
  if (!isVaultScriptsReady(network)) {
    throw new Error(
      `Vault scripts are not configured for ${network}. Beneficiary discovery is disabled until the deployment metadata is added.`
    );
  }

  let lastError: Error | null = null;
  for (const indexerUrl of getIndexerUrls(network)) {
    try {
      return await fetchVaultsForLockScriptFromIndexer(network, indexerUrl, lockScript);
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error("Unknown indexer error");
      console.error(`Indexer fetch failed for ${indexerUrl}:`, normalized);
      lastError = normalized;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function fetchVaultFromTransaction(
  network: Network,
  txHash: string,
  index: number
): Promise<VaultFromTx | null> {
  const txResult = await getTransactionStatus(network, txHash);
  if (!txResult.transaction) return null;

  const output = txResult.transaction.outputs[index];
  const outputData = txResult.transaction.outputs_data[index];
  if (!output || outputData === undefined) return null;

  const txStatus = txResult.tx_status?.status ?? "unknown";
  const liveCellStatus =
    txStatus === "committed"
      ? await getLiveCellStatus(network, { txHash, index })
      : "unknown";
  const blockTimestamp =
    txResult.tx_status?.block_hash && txStatus === "committed"
      ? await getBlockTimestampByHash(network, txResult.tx_status.block_hash).catch(
          () => null
        )
      : null;

  return parseVaultFromTransactionOutput(
    network,
    txHash,
    index,
    output,
    outputData,
    txStatus,
    liveCellStatus,
    txResult.tx_status?.block_number
      ? parseInt(txResult.tx_status.block_number, 16)
      : undefined,
    blockTimestamp ?? undefined
  );
}

export async function verifyVault(
  network: Network,
  txHash: string,
  index: number
): Promise<VaultFromTx | null> {
  return fetchVaultFromTransaction(network, txHash, index);
}
