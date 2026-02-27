// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – localStorage persistence (v2)
//
// localStorage now stores lightweight *references* to vaults the owner
// created. The actual vault data lives on-chain (cell output_data).
// This index lets the owner quickly list their vaults without scanning the
// entire chain.  If the owner clears localStorage they can re-import vaults
// by transaction hash.
// ─────────────────────────────────────────────────────────────────────────────

import type { VaultRecord } from "../types";

const STORAGE_KEY = "inherit_vault_refs_v2";
const OWNER_NAME_KEY = "inherit_vault_owner_name";

// ── Vault reference CRUD ────────────────────────────────────────────────────

/** Load all vault references from localStorage (returns [] on error). */
export function loadVaults(): VaultRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VaultRecord[];
  } catch {
    return [];
  }
}

/** Persist the full list. */
function saveVaults(vaults: VaultRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
}

/** Add a new vault reference (newest first). */
export function addVault(record: VaultRecord): VaultRecord[] {
  const vaults = loadVaults();
  vaults.unshift(record);
  saveVaults(vaults);
  return vaults;
}

/** Find a vault by its on-chain outpoint (txHash + index). */
export function getVaultByOutPoint(
  txHash: string,
  index: number
): VaultRecord | undefined {
  return loadVaults().find(
    (v) => v.txHash === txHash && v.index === index
  );
}

/** Update an existing vault (matched by txHash + index). */
export function updateVault(updated: VaultRecord): VaultRecord[] {
  const vaults = loadVaults().map((v) =>
    v.txHash === updated.txHash && v.index === updated.index ? updated : v
  );
  saveVaults(vaults);
  return vaults;
}

/** Remove a vault by its outpoint. */
export function deleteVault(txHash: string, index: number): VaultRecord[] {
  const vaults = loadVaults().filter(
    (v) => !(v.txHash === txHash && v.index === index)
  );
  saveVaults(vaults);
  return vaults;
}

// ── Owner profile helpers ───────────────────────────────────────────────────

/** Get the saved owner display name (persists across sessions). */
export function getOwnerName(): string {
  return localStorage.getItem(OWNER_NAME_KEY) ?? "";
}

/** Save the owner display name. */
export function setOwnerName(name: string): void {
  localStorage.setItem(OWNER_NAME_KEY, name);
}

// ── Beneficiary hidden vaults ───────────────────────────────────────────────

const HIDDEN_VAULTS_KEY = "inherit_vault_hidden";

/** Get the set of hidden vault outpoint keys ("txHash:index"). */
export function getHiddenVaults(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_VAULTS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Hide a vault from the beneficiary dashboard. */
export function hideVault(txHash: string, index: number): void {
  const hidden = getHiddenVaults();
  hidden.add(`${txHash}:${index}`);
  localStorage.setItem(HIDDEN_VAULTS_KEY, JSON.stringify([...hidden]));
}

/** Unhide a vault (restore it). */
export function unhideVault(txHash: string, index: number): void {
  const hidden = getHiddenVaults();
  hidden.delete(`${txHash}:${index}`);
  localStorage.setItem(HIDDEN_VAULTS_KEY, JSON.stringify([...hidden]));
}
