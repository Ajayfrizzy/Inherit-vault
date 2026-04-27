// -----------------------------------------------------------------------------
// InheritVault - localStorage persistence
// -----------------------------------------------------------------------------

import type {
  VaultAuthenticity,
  VaultFormat,
  VaultRecord,
  VaultRecordStatus,
} from "../types";

const STORAGE_KEY = "inherit_vault_refs_v2";
const OWNER_NAME_KEY = "inherit_vault_owner_name";
const HIDDEN_VAULTS_KEY = "inherit_vault_hidden";

function normalizeVaultRecord(record: Partial<VaultRecord>): VaultRecord {
  const format: VaultFormat =
    record.format === "scripted" ? "scripted" : "legacy";
  const authenticity: VaultAuthenticity =
    record.authenticity === "verified" || format === "scripted"
      ? "verified"
      : "legacy";
  const status: VaultRecordStatus | undefined =
    record.status === "pending" ||
    record.status === "live" ||
    record.status === "spent" ||
    record.status === "unknown"
      ? record.status
      : undefined;

  return {
    txHash: record.txHash ?? "",
    index: record.index ?? 0,
    network: record.network ?? "testnet",
    createdAt: record.createdAt ?? new Date().toISOString(),
    beneficiaryAddress: record.beneficiaryAddress ?? "",
    amountCKB: record.amountCKB ?? "0",
    unlock: record.unlock ?? { type: "blockHeight", value: 0 },
    memo: record.memo,
    beneficiaryEmail: record.beneficiaryEmail,
    claimableEmailSent: record.claimableEmailSent,
    ownerAddress: record.ownerAddress,
    ownerName: record.ownerName,
    format,
    authenticity,
    status,
  };
}

export function loadVaults(): VaultRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<VaultRecord>[];
    return parsed.map(normalizeVaultRecord);
  } catch {
    return [];
  }
}

function saveVaults(vaults: VaultRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
}

export function addVault(record: VaultRecord): VaultRecord[] {
  const nextRecord = normalizeVaultRecord(record);
  const vaults = loadVaults().filter(
    (vault) =>
      !(vault.txHash === nextRecord.txHash && vault.index === nextRecord.index)
  );
  vaults.unshift(nextRecord);
  saveVaults(vaults);
  return vaults;
}

export function getVaultByOutPoint(
  txHash: string,
  index: number
): VaultRecord | undefined {
  return loadVaults().find((vault) => vault.txHash === txHash && vault.index === index);
}

export function updateVault(updated: VaultRecord): VaultRecord[] {
  const normalized = normalizeVaultRecord(updated);
  const vaults = loadVaults().map((vault) =>
    vault.txHash === normalized.txHash && vault.index === normalized.index
      ? normalized
      : vault
  );
  saveVaults(vaults);
  return vaults;
}

export function deleteVault(txHash: string, index: number): VaultRecord[] {
  const vaults = loadVaults().filter(
    (vault) => !(vault.txHash === txHash && vault.index === index)
  );
  saveVaults(vaults);
  return vaults;
}

export function getOwnerName(): string {
  return localStorage.getItem(OWNER_NAME_KEY) ?? "";
}

export function setOwnerName(name: string): void {
  localStorage.setItem(OWNER_NAME_KEY, name);
}

export function getHiddenVaults(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_VAULTS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function hideVault(txHash: string, index: number): void {
  const hidden = getHiddenVaults();
  hidden.add(`${txHash}:${index}`);
  localStorage.setItem(HIDDEN_VAULTS_KEY, JSON.stringify([...hidden]));
}

export function unhideVault(txHash: string, index: number): void {
  const hidden = getHiddenVaults();
  hidden.delete(`${txHash}:${index}`);
  localStorage.setItem(HIDDEN_VAULTS_KEY, JSON.stringify([...hidden]));
}
