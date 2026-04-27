import { describe, expect, it } from "vitest";
import {
  buildVaultDetailPath,
  getActiveNetwork,
  parseNetwork,
} from "../network";

describe("network helpers", () => {
  it("resolves known CCC address prefixes to app networks", () => {
    expect(getActiveNetwork({ addressPrefix: "ckt" })).toBe("testnet");
    expect(getActiveNetwork({ addressPrefix: "ckb" })).toBe("mainnet");
  });

  it("falls back to testnet for unknown prefixes", () => {
    expect(getActiveNetwork({ addressPrefix: "custom" })).toBe("testnet");
    expect(getActiveNetwork()).toBe("testnet");
  });

  it("parses network query values and builds detail routes", () => {
    expect(parseNetwork("mainnet")).toBe("mainnet");
    expect(parseNetwork("testnet")).toBe("testnet");
    expect(parseNetwork("devnet")).toBeNull();
    expect(buildVaultDetailPath("0xabc", 2, "mainnet")).toBe(
      "/vault/0xabc/2?network=mainnet"
    );
  });
});
