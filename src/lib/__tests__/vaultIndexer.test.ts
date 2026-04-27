import { describe, expect, it } from "vitest";
import { getVaultRecordStatus } from "../vaultIndexer";

describe("vault record status mapping", () => {
  it("marks pending transactions as pending", () => {
    expect(getVaultRecordStatus("pending", "unknown")).toBe("pending");
    expect(getVaultRecordStatus("proposed", "unknown")).toBe("pending");
  });

  it("maps committed live and spent cells correctly", () => {
    expect(getVaultRecordStatus("committed", "live")).toBe("live");
    expect(getVaultRecordStatus("committed", "spent")).toBe("spent");
  });

  it("keeps uncertain committed lookups as unknown", () => {
    expect(getVaultRecordStatus("committed", "unknown")).toBe("unknown");
  });

  it("falls back to the cached status for non-committed terminal responses", () => {
    expect(getVaultRecordStatus("rejected", "unknown", "pending")).toBe("pending");
    expect(getVaultRecordStatus("unknown", "unknown")).toBe("unknown");
  });
});
