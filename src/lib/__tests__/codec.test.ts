import { describe, expect, it } from "vitest";
import {
  decodeVaultCellData,
  encodeVaultCellData,
  exportVaultMoleculeSchema,
  type VaultCellPayload,
} from "../codec";

describe("Vault Codec Molecule Serialization", () => {
  it("encodes and decodes owner-authenticated vault payloads", () => {
    const payload: VaultCellPayload = {
      ownerLock: {
        codeHash:
          "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        args: "0x1234567890abcdef1234567890abcdef12345678",
      },
      ownerName: "Alice",
      unlock: { type: "timestamp", value: 1_700_000_000 },
      memo: "For Bob",
    };

    const encoded = encodeVaultCellData(payload);
    expect(encoded.startsWith("0x")).toBe(true);

    const decoded = decodeVaultCellData(encoded);
    expect(decoded).toEqual(payload);
  });

  it("encodes and decodes correctly with optional fields missing", () => {
    const payload: VaultCellPayload = {
      ownerLock: {
        codeHash:
          "0xb956207d69c488058fbb7d8c26b6ff4a6415ca19f0e69a75e17d959e2c53cb1a",
        hashType: "type",
        args: "0x",
      },
      unlock: { type: "blockHeight", value: 50_000 },
    };

    const encoded = encodeVaultCellData(payload);
    const decoded = decodeVaultCellData(encoded);

    expect(decoded).toEqual(payload);
  });

  it("fails on malformed payload gracefully", () => {
    expect(decodeVaultCellData("0x1234")).toBeNull();

    const emptyBuffer = new Uint8Array(24);
    new DataView(emptyBuffer.buffer).setUint32(0, 99_999, true);
    let hex = "0x";
    for (const byte of emptyBuffer) {
      hex += byte.toString(16).padStart(2, "0");
    }

    expect(decodeVaultCellData(hex)).toBeNull();
  });

  it("exports the current Molecule schema for the vault payload", () => {
    expect(exportVaultMoleculeSchema()).toBe(
      [
        "array Byte32 [byte; 32];",
        "vector Bytes <byte>;",
        "table Script {",
        "    code_hash: Byte32,",
        "    hash_type: byte,",
        "    args: Bytes,",
        "}",
        "array Uint64 [byte; 8];",
        "table VaultCellData {",
        "    owner_lock: Script,",
        "    owner_name: Bytes,",
        "    unlock_type: byte,",
        "    unlock_value: Uint64,",
        "    memo: Bytes,",
        "}",
      ].join("\n")
    );
  });
});
