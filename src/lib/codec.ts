// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Cell Data Codec
//
// Encodes/decodes vault metadata into the CKB cell's output_data field using
// standard Molecule serialization rules for `VaultCellData` table.
//
// table VaultCellData {
//     owner_address: Bytes,
//     owner_name: Bytes,
//     unlock_type: byte,
//     unlock_value: Uint64,
//     memo: Bytes,
// }
//
// This ensures strict compatibility with standard CKB ecosystem tools like ckb-std
// in the Rust contracts.
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlockType } from "../types";

export interface VaultCellPayload {
  ownerAddress: string;
  ownerName?: string;
  unlock: { type: UnlockType; value: number };
  memo?: string;
}

// ── Molecule Builders ───────────────────────────────────────────────────────

/** Pack a string into a dynamic-sized Molecule `Bytes` (vector <byte>). */
function packBytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  // Molecule vector <byte>: 4-byte length header (Uint32LE), followed by data.
  const buffer = new ArrayBuffer(4 + data.length);
  const view = new DataView(buffer);
  view.setUint32(0, data.length, true); // Little endian
  const out = new Uint8Array(buffer);
  out.set(data, 4);
  return out;
}

/** Pack a Uint64 into an 8-byte little-endian array. */
function packUint64(val: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  // Using BigInt for full 64-bit safety
  view.setBigUint64(0, BigInt(val), true);
  return new Uint8Array(buffer);
}

/** Format a Uint8Array as a 0x-prefixed hex string. */
function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Parse a 0x-prefixed hex string back into a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const noPrefix = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buffer = new Uint8Array(noPrefix.length / 2);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = parseInt(noPrefix.slice(i * 2, i * 2 + 2), 16);
  }
  return buffer;
}

// ── Encode ──────────────────────────────────────────────────────────────────

/** Encode vault metadata into a strict Molecule payload for cell output_data. */
export function encodeVaultCellData(payload: VaultCellPayload): string {
  const fOwnerAddress = packBytes(payload.ownerAddress);
  const fOwnerName = packBytes(payload.ownerName || "");
  const fUnlockType = new Uint8Array([payload.unlock.type === "timestamp" ? 1 : 0]);
  const fUnlockValue = packUint64(payload.unlock.value);
  const fMemo = packBytes(payload.memo || "");

  const fields = [fOwnerAddress, fOwnerName, fUnlockType, fUnlockValue, fMemo];
  
  // Table header: 4 bytes total size + (N * 4 bytes offset)
  const headerSize = 4 + fields.length * 4;
  const totalSize = headerSize + fields.reduce((sum, f) => sum + f.length, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // Set total size
  view.setUint32(0, totalSize, true);

  let currentOffset = headerSize;
  for (let i = 0; i < fields.length; i++) {
    // Write offset into header (at 4 + i*4)
    view.setUint32(4 + i * 4, currentOffset, true);
    // Write field
    out.set(fields[i], currentOffset);
    currentOffset += fields[i].length;
  }

  return bytesToHex(out);
}

// ── Decode ──────────────────────────────────────────────────────────────────

/** Decode a string from a Molecule `Bytes` slice. */
function unpackBytes(view: DataView, offset: number): string {
  // Vector <byte>: first 4 bytes is item count
  const length = view.getUint32(offset, true);
  const data = new Uint8Array(view.buffer, offset + 4, length);
  return new TextDecoder().decode(data);
}

/** Decode vault cell data from a Molecule hex payload. Returns null if malformed. */
export function decodeVaultCellData(hex: string): VaultCellPayload | null {
  try {
    const bytes = hexToBytes(hex);
    if (bytes.length < 24) return null; // Header must be at least 4 + 5*4 = 24 bytes

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const totalSize = view.getUint32(0, true);
    if (totalSize !== bytes.length) return null; // Malformed table

    // Extract offsets
    const oOwnerAddress = view.getUint32(4, true);
    const oOwnerName = view.getUint32(8, true);
    const oUnlockType = view.getUint32(12, true);
    const oUnlockValue = view.getUint32(16, true);
    const oMemo = view.getUint32(20, true);

    const ownerAddress = unpackBytes(view, oOwnerAddress);
    const ownerName = unpackBytes(view, oOwnerName);
    const unlockTypeByte = view.getUint8(oUnlockType);
    const unlockValueBigInt = view.getBigUint64(oUnlockValue, true);
    const memo = unpackBytes(view, oMemo);

    return {
      ownerAddress,
      ownerName: ownerName.length > 0 ? ownerName : undefined,
      unlock: {
        type: unlockTypeByte === 1 ? "timestamp" : "blockHeight",
        value: Number(unlockValueBigInt), // Safe enough for practical JS UI
      },
      memo: memo.length > 0 ? memo : undefined,
    };
  } catch (error) {
    console.error("Failed to decode Vault Molecule payload:", error);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compute the byte-length of the encoded cell data for a given payload. */
export function calculateDataSize(payload: VaultCellPayload): number {
  const encoded = encodeVaultCellData(payload);
  return (encoded.length - 2) / 2;
}

/**
 * Calculate the minimum CKB capacity needed for a vault cell.
 * Capacity includes: base capacity (8B) + lock script + type script + data.
 */
export function calculateMinCapacityCKB(payload: VaultCellPayload): number {
  const dataSize = calculateDataSize(payload);
  const CAPACITY_FIELD = 8;
  const LOCK_SCRIPT_APPROX = 65; // Extended size for standard lock
  const TYPE_SCRIPT_APPROX = 65; // Extended size for custom type script
  return CAPACITY_FIELD + LOCK_SCRIPT_APPROX + TYPE_SCRIPT_APPROX + dataSize;
}
