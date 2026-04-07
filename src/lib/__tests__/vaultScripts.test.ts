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
        "0xf6898d947d866763e5e51560940354554abed36060bc63a3a4b6abab4df7fee1",
      hashType: "type",
      outPoint: {
        txHash:
          "0x090f54d28a1863879d88fbc37a83c7ce61724993d5095cc7e9470a0c94b588fc",
        index: 0,
      },
      depType: "code",
    });
    expect(getVaultTypeDeployment(DEFAULT_NETWORK)).toMatchObject({
      codeHash:
        "0x43142c6355bbe4db242f423cd8e4411c397b57cc6880d17fd3d054ae3c3e0c0e",
      hashType: "type",
      outPoint: {
        txHash:
          "0x090f54d28a1863879d88fbc37a83c7ce61724993d5095cc7e9470a0c94b588fc",
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
        "0xf6898d947d866763e5e51560940354554abed36060bc63a3a4b6abab4df7fee1",
      hashType: "type",
      args: "0x1234567890abcdef1234567890abcdef12345678",
    });

    expect(getScriptedVaultTypeArgs(DEFAULT_NETWORK)).toBe(
      "0xf6898d947d866763e5e51560940354554abed36060bc63a3a4b6abab4df7fee1"
    );

    expect(buildScriptedVaultType(DEFAULT_NETWORK)).toEqual({
      codeHash:
        "0x43142c6355bbe4db242f423cd8e4411c397b57cc6880d17fd3d054ae3c3e0c0e",
      hashType: "type",
      args: "0xf6898d947d866763e5e51560940354554abed36060bc63a3a4b6abab4df7fee1",
    });
  });
});
