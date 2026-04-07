// -----------------------------------------------------------------------------
// InheritVault - Molecule-backed cell data codec
// -----------------------------------------------------------------------------

import { mol } from "@ckb-cobuild/molecule";
import type { CkbScript, UnlockType } from "../types";

export interface VaultCellPayload {
  ownerLock: {
    codeHash: string;
    hashType: CkbScript["hash_type"];
    args: string;
  };
  ownerAddress?: string;
  ownerName?: string;
  unlock: { type: UnlockType; value: number };
  memo?: string;
}

const Byte32 = mol.byteArray("Byte32", 32);
const Bytes = mol.byteFixvec("Bytes");
const ScriptCodec = mol.table(
  "Script",
  {
    code_hash: Byte32,
    hash_type: mol.byte,
    args: Bytes,
  },
  ["code_hash", "hash_type", "args"]
);
const VaultCellDataCodec = mol.table(
  "VaultCellData",
  {
    owner_lock: ScriptCodec,
    owner_name: Bytes,
    unlock_type: mol.byte,
    unlock_value: mol.Uint64,
    memo: Bytes,
  },
  ["owner_lock", "owner_name", "unlock_type", "unlock_value", "memo"]
);

const HASH_TYPE_TO_BYTE: Record<CkbScript["hash_type"], number> = {
  data: 0x00,
  type: 0x01,
  data1: 0x02,
  data2: 0x04,
};

const BYTE_TO_HASH_TYPE: Record<number, CkbScript["hash_type"]> = {
  0x00: "data",
  0x01: "type",
  0x02: "data1",
  0x04: "data2",
};

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToText(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function hexToBytes(hex: string): Uint8Array {
  const source = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (source.length % 2 !== 0) {
    throw new Error("Invalid hex length");
  }

  const bytes = new Uint8Array(source.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(source.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHashTypeByte(hashType: CkbScript["hash_type"]): number {
  return HASH_TYPE_TO_BYTE[hashType];
}

function toHashType(byte: number): CkbScript["hash_type"] {
  const hashType = BYTE_TO_HASH_TYPE[byte];
  if (!hashType) {
    throw new Error(`Unsupported hash type byte: ${byte}`);
  }
  return hashType;
}

function normalizeBytesHex(hex: string, expectedLength?: number): string {
  const bytes = hexToBytes(hex);
  if (expectedLength != null && bytes.length !== expectedLength) {
    throw new Error(
      `Expected ${expectedLength} bytes, found ${bytes.length}`
    );
  }
  return bytesToHex(bytes);
}

export function exportVaultMoleculeSchema(): string {
  return Array.from(VaultCellDataCodec.exportSchema().values()).join("\n");
}

export function encodeVaultCellData(payload: VaultCellPayload): string {
  const packed = VaultCellDataCodec.pack({
    owner_lock: {
      code_hash: hexToBytes(normalizeBytesHex(payload.ownerLock.codeHash, 32)),
      hash_type: toHashTypeByte(payload.ownerLock.hashType),
      args: hexToBytes(normalizeBytesHex(payload.ownerLock.args)),
    },
    owner_name: textToBytes(payload.ownerName || ""),
    unlock_type: payload.unlock.type === "timestamp" ? 1 : 0,
    unlock_value: BigInt(payload.unlock.value),
    memo: textToBytes(payload.memo || ""),
  });

  return bytesToHex(packed);
}

export function decodeVaultCellData(hex: string): VaultCellPayload | null {
  try {
    const decoded = VaultCellDataCodec.unpack(hexToBytes(hex), true);
    return {
      ownerLock: {
        codeHash: bytesToHex(decoded.owner_lock.code_hash),
        hashType: toHashType(decoded.owner_lock.hash_type),
        args: bytesToHex(decoded.owner_lock.args),
      },
      ownerName: bytesToText(decoded.owner_name) || undefined,
      unlock: {
        type: decoded.unlock_type === 1 ? "timestamp" : "blockHeight",
        value: Number(decoded.unlock_value),
      },
      memo: bytesToText(decoded.memo) || undefined,
    };
  } catch (error) {
    console.error("Failed to decode Vault Molecule payload:", error);
    return null;
  }
}

export function calculateDataSize(payload: VaultCellPayload): number {
  const encoded = encodeVaultCellData(payload);
  return (encoded.length - 2) / 2;
}

export function calculateMinCapacityCKB(payload: VaultCellPayload): number {
  const dataSize = calculateDataSize(payload);
  const capacityField = 8;
  const scriptedLockApprox = 65;
  const typeScriptApprox = 97;
  return capacityField + scriptedLockApprox + typeScriptApprox + dataSize;
}
