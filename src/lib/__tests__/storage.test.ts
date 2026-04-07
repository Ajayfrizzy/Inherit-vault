import { describe, expect, it, beforeEach } from "vitest";
import { addVault, getVaultByOutPoint, loadVaults } from "../storage";

describe("vault storage normalization", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes imported legacy records", () => {
    localStorage.setItem(
      "inherit_vault_refs_v2",
      JSON.stringify([
        {
          txHash: "0xlegacy",
          index: 0,
          network: "testnet",
          createdAt: "2026-04-04T00:00:00.000Z",
          beneficiaryAddress: "ckt1legacy",
          amountCKB: "250",
          unlock: { type: "blockHeight", value: 123456 },
        },
      ])
    );

    const [record] = loadVaults();
    expect(record.format).toBe("legacy");
    expect(record.authenticity).toBe("legacy");
  });

  it("preserves scripted vault metadata when saving new records", () => {
    addVault({
      txHash: "0xscripted",
      index: 1,
      network: "testnet",
      createdAt: "2026-04-04T00:00:00.000Z",
      beneficiaryAddress: "ckt1scripted",
      amountCKB: "300",
      unlock: { type: "timestamp", value: 1_800_000_000 },
      format: "scripted",
      authenticity: "verified",
      status: "pending",
    });

    const record = getVaultByOutPoint("0xscripted", 1);
    expect(record?.format).toBe("scripted");
    expect(record?.authenticity).toBe("verified");
  });
});
