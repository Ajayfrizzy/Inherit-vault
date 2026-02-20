// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

import type { VaultRecord } from "../types";

const STORAGE_KEY = "inherit_vault_records_v1";

/** Load all vault records from localStorage (returns [] if none / parse error). */
export function loadVaults(): VaultRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VaultRecord[];
  } catch {
    return [];
  }
}

/** Persist the full list of vault records to localStorage. */
function saveVaults(vaults: VaultRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
}

/** Append a new vault record. Returns the updated list. */
export function addVault(record: VaultRecord): VaultRecord[] {
  const vaults = loadVaults();
  vaults.unshift(record); // newest first
  saveVaults(vaults);
  return vaults;
}

/** Retrieve a single vault record by its id. */
export function getVaultById(id: string): VaultRecord | undefined {
  return loadVaults().find((v) => v.id === id);
}

/** Update an existing vault record (matched by id). */
export function updateVault(updated: VaultRecord): VaultRecord[] {
  const vaults = loadVaults().map((v) => (v.id === updated.id ? updated : v));
  saveVaults(vaults);
  return vaults;
}

/** Remove a vault record by id. */
export function deleteVault(id: string): VaultRecord[] {
  const vaults = loadVaults().filter((v) => v.id !== id);
  saveVaults(vaults);
  return vaults;
}

/** Generate a simple unique id (timestamp + random hex). */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
