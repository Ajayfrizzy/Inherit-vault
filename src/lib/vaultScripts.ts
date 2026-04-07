import { ccc } from "@ckb-ccc/connector-react";
import {
  getVaultScriptConfig,
  isVaultScriptsReady,
  type Network,
  type ScriptDeployment,
} from "../config";
import type { CkbScript } from "../types";

function getPublicClient(network: Network) {
  return network === "testnet"
    ? new ccc.ClientPublicTestnet()
    : new ccc.ClientPublicMainnet();
}

export function getNetworkFromClient(client: { addressPrefix?: string }): Network {
  return client.addressPrefix === "ckb" ? "mainnet" : "testnet";
}

export function getVaultLockDeployment(network: Network): ScriptDeployment | null {
  return getVaultScriptConfig(network).lock;
}

export function getVaultTypeDeployment(network: Network): ScriptDeployment | null {
  return getVaultScriptConfig(network).type;
}

export function assertVaultScriptsReady(network: Network): void {
  if (!isVaultScriptsReady(network)) {
    throw new Error(
      `Vault scripts are not configured for ${network}. Deploy the contracts and update src/config.ts before creating scripted vaults.`
    );
  }
}

export function toCellDep(deployment: ScriptDeployment) {
  return {
    outPoint: deployment.outPoint,
    depType: deployment.depType,
  };
}

export function toIndexerScript(script: {
  codeHash: string;
  hashType: string;
  args: string;
}): CkbScript {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType as CkbScript["hash_type"],
    args: script.args,
  };
}

function matchesDeployment(
  script: { code_hash?: string; hash_type?: string; args?: string } | null | undefined,
  deployment: ScriptDeployment | null,
  expectedArgs?: string
): boolean {
  if (!script || !deployment) return false;
  return (
    script.code_hash === deployment.codeHash &&
    script.hash_type === deployment.hashType &&
    (expectedArgs == null || script.args === expectedArgs)
  );
}

export function isScriptedVaultLock(
  script: { code_hash?: string; hash_type?: string; args?: string } | null | undefined,
  network: Network
): boolean {
  return matchesDeployment(script, getVaultLockDeployment(network));
}

export function getScriptedVaultTypeArgs(network: Network): string {
  const lockDeployment = getVaultLockDeployment(network);
  if (!lockDeployment) {
    throw new Error(`Vault lock script is not configured for ${network}.`);
  }

  return lockDeployment.codeHash;
}

export function isScriptedVaultType(
  script: { code_hash?: string; hash_type?: string; args?: string } | null | undefined,
  network: Network
): boolean {
  try {
    return matchesDeployment(
      script,
      getVaultTypeDeployment(network),
      getScriptedVaultTypeArgs(network)
    );
  } catch {
    return false;
  }
}

async function getSecpScriptInfo(client: any) {
  return client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
}

export async function getStandardSecpArgsFromAddress(
  address: string,
  client: any
): Promise<string> {
  const addressObj = await ccc.Address.fromString(address, client);
  const script = addressObj.script;
  const secpInfo = await getSecpScriptInfo(client);

  if (
    script.codeHash !== secpInfo.codeHash ||
    script.hashType !== secpInfo.hashType
  ) {
    throw new Error(
      "Only standard secp256k1-blake160 beneficiary addresses are supported for scripted vaults right now."
    );
  }

  if (script.args.length !== 42) {
    throw new Error("Unsupported beneficiary lock args length.");
  }

  return script.args;
}

export async function getStandardSecpLockFromAddress(address: string, client: any) {
  const beneficiaryArgs = await getStandardSecpArgsFromAddress(address, client);
  const secpInfo = await getSecpScriptInfo(client);

  return {
    codeHash: secpInfo.codeHash,
    hashType: secpInfo.hashType,
    args: beneficiaryArgs,
  };
}

export async function getStandardSecpAddressFromArgs(
  beneficiaryArgs: string,
  network: Network
): Promise<string> {
  const client = getPublicClient(network);
  const secpInfo = await getSecpScriptInfo(client);

  return ccc.Address.fromScript(
    {
      codeHash: secpInfo.codeHash,
      hashType: secpInfo.hashType,
      args: beneficiaryArgs,
    },
    client
  ).toString();
}

export function buildScriptedVaultLockFromArgs(
  beneficiaryArgs: string,
  network: Network
) {
  const deployment = getVaultLockDeployment(network);
  if (!deployment) {
    throw new Error(`Vault lock script is not configured for ${network}.`);
  }

  return {
    codeHash: deployment.codeHash,
    hashType: deployment.hashType,
    args: beneficiaryArgs,
  };
}

export async function getScriptedVaultLockFromAddress(
  address: string,
  client: any,
  network: Network
) {
  const beneficiaryArgs = await getStandardSecpArgsFromAddress(address, client);
  return buildScriptedVaultLockFromArgs(beneficiaryArgs, network);
}

export function buildScriptedVaultType(network: Network) {
  const deployment = getVaultTypeDeployment(network);
  if (!deployment) {
    throw new Error(`Vault type script is not configured for ${network}.`);
  }

  return {
    codeHash: deployment.codeHash,
    hashType: deployment.hashType,
    args: getScriptedVaultTypeArgs(network),
  };
}
