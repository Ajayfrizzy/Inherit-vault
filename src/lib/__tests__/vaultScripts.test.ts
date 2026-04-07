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
        "0x7ecd173ed7061f9fb68ea2dba0df5d16350f477448ebc2c3a409b624482dfcfe",
      hashType: "type",
      outPoint: {
        txHash:
          "0x7c570127a39da08f30ae0d7fef0226448abb3683beee927848f45dd531effbcc",
        index: 0,
      },
      depType: "code",
    });
    expect(getVaultTypeDeployment(DEFAULT_NETWORK)).toMatchObject({
      codeHash:
        "0x402a2566a51acbe72fbd043168cb5100e9a1c78f9201f50def5f3f4dd35080a6",
      hashType: "type",
      outPoint: {
        txHash:
          "0x5b80085bae3bb71db90f4ab0e9bf448c2d40824a8367e273f29da8d029688bbb",
        index: 0,
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
        "0x7ecd173ed7061f9fb68ea2dba0df5d16350f477448ebc2c3a409b624482dfcfe",
      hashType: "type",
      args: "0x1234567890abcdef1234567890abcdef12345678",
    });

    expect(getScriptedVaultTypeArgs(DEFAULT_NETWORK)).toBe(
      "0x7ecd173ed7061f9fb68ea2dba0df5d16350f477448ebc2c3a409b624482dfcfe"
    );

    expect(buildScriptedVaultType(DEFAULT_NETWORK)).toEqual({
      codeHash:
        "0x402a2566a51acbe72fbd043168cb5100e9a1c78f9201f50def5f3f4dd35080a6",
      hashType: "type",
      args: "0x7ecd173ed7061f9fb68ea2dba0df5d16350f477448ebc2c3a409b624482dfcfe",
    });
  });
});
