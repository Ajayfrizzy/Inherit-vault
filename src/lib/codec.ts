// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Cell Data Codec
//
// Encodes/decodes vault metadata into the CKB cell's output_data field.
//
// Format:
//   Bytes 0-3:  Magic identifier "IVLT" (0x49564C54)
//   Byte  4:    Version (0x01)
//   Bytes 5+:   JSON payload (UTF-8)
//
// JSON payload uses short keys to save on-chain capacity:
//   oa  – owner CKB address (string)
//   on  – owner display name (string, optional)
//   ut  – unlock type ("blockHeight" | "timestamp")
//   uv  – unlock value (number)
//   m   – memo (string, optional)
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlockType } from "../types";

const MAGIC_HEX = "49564c54"; // ASCII "IVLT"
const VERSION = 0x01;

/**
 * The data stored inside a vault cell's output_data (decoded form).
 */
export interface VaultCellPayload {
  ownerAddress: string;
  ownerName?: string;
  unlock: { type: UnlockType; value: number };
  memo?: string;
}

// ── Encode ──────────────────────────────────────────────────────────────────

/** Encode vault metadata into a 0x-prefixed hex string for cell output_data. */
export function encodeVaultCellData(payload: VaultCellPayload): string {
  const json: Record<string, unknown> = {
    oa: payload.ownerAddress,
    ut: payload.unlock.type,
    uv: payload.unlock.value,
  };
  if (payload.ownerName) json.on = payload.ownerName;
  if (payload.memo) json.m = payload.memo;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));

  // magic (4 B) + version (1 B) + JSON bytes
  let hex = MAGIC_HEX + VERSION.toString(16).padStart(2, "0");
  for (const b of jsonBytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return "0x" + hex;
}

// ── Decode ──────────────────────────────────────────────────────────────────

/** Decode vault cell data from a 0x-prefixed hex string. Returns null if invalid. */
export function decodeVaultCellData(hex: string): VaultCellPayload | null {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;

  // Minimum: magic (8) + version (2) + at least a few JSON chars
  if (data.length < 12) return null;

  // Check magic
  if (data.slice(0, 8).toLowerCase() !== MAGIC_HEX) return null;

  // Check version
  const version = parseInt(data.slice(8, 10), 16);
  if (version !== VERSION) return null;

  // Decode JSON bytes
  const jsonHex = data.slice(10);
  const bytes = new Uint8Array(jsonHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(jsonHex.slice(i * 2, i * 2 + 2), 16);
  }

  try {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return {
      ownerAddress: json.oa || "",
      ownerName: json.on || undefined,
      unlock: {
        type: json.ut as UnlockType,
        value: json.uv as number,
      },
      memo: json.m || undefined,
    };
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a hex cell data string starts with the IVLT magic. */
export function isVaultCell(hex: string): boolean {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  return data.length >= 8 && data.slice(0, 8).toLowerCase() === MAGIC_HEX;
}

/** The 0x-prefixed hex prefix used for indexer output_data filtering. */
export const VAULT_DATA_PREFIX = "0x" + MAGIC_HEX + VERSION.toString(16).padStart(2, "0");

/** Compute the byte-length of the encoded cell data for a given payload. */
export function calculateDataSize(payload: VaultCellPayload): number {
  const encoded = encodeVaultCellData(payload);
  return (encoded.length - 2) / 2; // subtract "0x", each hex pair = 1 byte
}

/**
 * Calculate the minimum CKB capacity needed for a vault cell.
 *
 * CKB rule: capacity (shannons) >= occupied_bytes × 10^8
 * Occupied bytes = 8 (capacity field) + lock_script_size + data_size
 * For secp256k1-blake160 lock: ~53 bytes
 */
export function calculateMinCapacityCKB(payload: VaultCellPayload): number {
  const dataSize = calculateDataSize(payload);
  const CAPACITY_FIELD = 8;
  const LOCK_SCRIPT_APPROX = 53; // secp256k1-blake160
  const MARGIN = 2;
  return CAPACITY_FIELD + LOCK_SCRIPT_APPROX + dataSize + MARGIN;
}
