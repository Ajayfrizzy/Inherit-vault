import { describe, expect, it } from "vitest";
import { DEFAULT_NETWORK, isVaultScriptsReady } from "../../config";
import {
  assertVaultScriptsReady,
  buildScriptedVaultLockFromArgs,
  buildScriptedVaultType,
  getVaultLockDeployment,
  getScriptedVaultTypeArgs,
  getVaultTypeDeployment,
} from "../vaultScripts";

describe("vault script configuration helpers", () => {
  it("reports testnet scripts as ready after deployment metadata is configured", () => {
    expect(isVaultScriptsReady(DEFAULT_NETWORK)).toBe(true);
    expect(getVaultLockDeployment(DEFAULT_NETWORK)).toMatchObject({
      codeHash:
        "0x723b155f49d446868674b2d944b7a5b2005ed6743f031adcb9b6ba993bfc1a9d",
      hashType: "type",
      outPoint: {
        txHash:
          "0x6aed899f75a4257bb17ae20043f53261ab896585b2cd9027e6f6aef0cad23de9",
        index: 0,
      },
      depType: "code",
    });
    expect(getVaultTypeDeployment(DEFAULT_NETWORK)).toMatchObject({
      codeHash:
        "0x79319d084289125a3b8434d70353d44b39b164908d94f5b5f6b186733bbeabd5",
      hashType: "type",
      outPoint: {
        txHash:
          "0x6aed899f75a4257bb17ae20043f53261ab896585b2cd9027e6f6aef0cad23de9",
        index: 1,
      },
      depType: "code",
    });
  });

  it("builds the configured scripted vault lock and type metadata", () => {
    expect(() => assertVaultScriptsReady(DEFAULT_NETWORK)).not.toThrow();
    expect(
      buildScriptedVaultLockFromArgs(
        "0x1234567890abcdef1234567890abcdef12345678",
        DEFAULT_NETWORK
      )
    ).toEqual({
      codeHash:
        "0x723b155f49d446868674b2d944b7a5b2005ed6743f031adcb9b6ba993bfc1a9d",
      hashType: "type",
      args: "0x1234567890abcdef1234567890abcdef12345678",
    });

    expect(getScriptedVaultTypeArgs(DEFAULT_NETWORK)).toBe(
      "0x723b155f49d446868674b2d944b7a5b2005ed6743f031adcb9b6ba993bfc1a9d"
    );

    expect(buildScriptedVaultType(DEFAULT_NETWORK)).toEqual({
      codeHash:
        "0x79319d084289125a3b8434d70353d44b39b164908d94f5b5f6b186733bbeabd5",
      hashType: "type",
      args: "0x723b155f49d446868674b2d944b7a5b2005ed6743f031adcb9b6ba993bfc1a9d",
    });
  });
});
