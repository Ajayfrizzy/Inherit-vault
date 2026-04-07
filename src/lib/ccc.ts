// -----------------------------------------------------------------------------
// InheritVault - CCC (Common Chain Connector) helpers
// -----------------------------------------------------------------------------

import type { ccc } from "@ckb-ccc/connector-react";
import { TIMESTAMP_CLAIM_BUFFER_SECONDS, type Network } from "../config";
import type { CkbScript, UnlockCondition, VaultFormat } from "../types";
import { encodeVaultCellData } from "./codec";
import {
  assertVaultScriptsReady,
  buildScriptedVaultLockFromArgs,
  buildScriptedVaultType,
  getNetworkFromClient,
  getScriptedVaultLockFromAddress,
  getStandardSecpArgsFromAddress,
  getStandardSecpAddressFromArgs,
  getStandardSecpLockFromAddress,
  toCellDep,
  toIndexerScript,
  getVaultLockDeployment,
  getVaultTypeDeployment,
} from "./vaultScripts";

export interface BuiltTransactionResult {
  tx: any;
  outPointIndex: number;
  requiresSignature: boolean;
}

export async function getWalletAddress(
  signer: ReturnType<typeof ccc.useSigner> | undefined
): Promise<string | null> {
  if (!signer) return null;

  try {
    return await signer.getRecommendedAddress();
  } catch (error) {
    console.error("Failed to get wallet address:", error);
    return null;
  }
}

export async function getLockScriptFromAddress(
  address: string,
  signerOrClient: any
): Promise<any> {
  try {
    const { ccc } = await import("@ckb-ccc/connector-react");
    const client = signerOrClient.client ?? signerOrClient;
    const addressObj = await ccc.Address.fromString(address, client);
    return addressObj.script;
  } catch (error) {
    console.error("Failed to convert address to lock script:", error);
    throw new Error("Invalid CKB address format");
  }
}

export async function getLockScriptForIndexer(
  address: string,
  signerOrClient: any
): Promise<CkbScript> {
  const script = await getLockScriptFromAddress(address, signerOrClient);
  return toIndexerScript(script);
}

export async function getScriptedVaultLockForIndexer(
  address: string,
  signerOrClient: any,
  network: Network
): Promise<CkbScript> {
  const client = signerOrClient.client ?? signerOrClient;
  const script = await getScriptedVaultLockFromAddress(address, client, network);
  return toIndexerScript(script);
}

export async function getAddressFromIndexerLock(
  lockScript: CkbScript,
  network: Network
): Promise<string> {
  const { ccc } = await import("@ckb-ccc/connector-react");
  const client =
    network === "testnet"
      ? new ccc.ClientPublicTestnet()
      : new ccc.ClientPublicMainnet();

  return ccc.Address.fromScript(
    {
      codeHash: lockScript.code_hash,
      hashType: lockScript.hash_type,
      args: lockScript.args,
    },
    client
  ).toString();
}

export async function getAddressFromCccScript(
  script: { codeHash: string; hashType: string; args: string },
  network: Network
): Promise<string> {
  return getAddressFromIndexerLock(
    {
      code_hash: script.codeHash,
      hash_type: script.hashType as CkbScript["hash_type"],
      args: script.args,
    },
    network
  );
}

export async function getBeneficiaryAddressFromScriptedLock(
  lockScript: CkbScript,
  network: Network
): Promise<string> {
  return getStandardSecpAddressFromArgs(lockScript.args, network);
}

export async function assertSupportedScriptedBeneficiary(
  address: string,
  signerOrClient: any
): Promise<string> {
  const client = signerOrClient.client ?? signerOrClient;
  return getStandardSecpArgsFromAddress(address, client);
}

function buildAbsoluteSince(cccApi: any, unlock: UnlockCondition) {
  return cccApi.Since.from({
    relative: "absolute",
    metric: unlock.type === "blockHeight" ? "blockNumber" : "timestamp",
    value: BigInt(unlock.value),
  });
}

export function buildScriptedVaultOutput(
  network: Network,
  beneficiaryArgs: string,
  capacity: bigint
) {
  return {
    lock: buildScriptedVaultLockFromArgs(beneficiaryArgs, network),
    type: buildScriptedVaultType(network),
    capacity,
  };
}

export function getScriptedClaimCellDeps(network: Network) {
  const lockDeployment = getVaultLockDeployment(network);
  const typeDeployment = getVaultTypeDeployment(network);

  if (!lockDeployment || !typeDeployment) {
    throw new Error(`Vault scripts are not configured for ${network}.`);
  }

  return [toCellDep(lockDeployment), toCellDep(typeDeployment)];
}

export async function buildCreateVaultTransaction(
  signer: any,
  beneficiaryAddress: string,
  amountCKB: number,
  unlock: UnlockCondition,
  ownerAddress: string,
  ownerName?: string,
  memo?: string
): Promise<BuiltTransactionResult> {
  try {
    const { ccc } = await import("@ckb-ccc/connector-react");
    const network = getNetworkFromClient(signer.client);
    assertVaultScriptsReady(network);

    const beneficiaryArgs = await getStandardSecpArgsFromAddress(
      beneficiaryAddress,
      signer.client
    );
    const ownerLock = await getLockScriptFromAddress(ownerAddress, signer.client);
    const cellData = encodeVaultCellData({
      ownerLock: {
        codeHash: ownerLock.codeHash,
        hashType: ownerLock.hashType,
        args: ownerLock.args,
      },
      ownerName: ownerName || undefined,
      unlock,
      memo: memo || undefined,
    });

    const tx = ccc.Transaction.from({
      outputs: [
        buildScriptedVaultOutput(
          network,
          beneficiaryArgs,
          ccc.fixedPointFrom(amountCKB)
        ),
      ],
      outputsData: [cellData],
    });

    const typeDeployment = getVaultTypeDeployment(network);
    if (!typeDeployment) {
      throw new Error(`Vault type script is not configured for ${network}.`);
    }
    tx.addCellDeps(toCellDep(typeDeployment));

    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    return { tx, outPointIndex: 0, requiresSignature: true };
  } catch (error) {
    console.error("Failed to build create vault transaction:", error);
    throw error;
  }
}

export async function buildClaimVaultTransaction(
  signer: any,
  vaultOutPoint: { txHash: string; index: number },
  unlock: UnlockCondition,
  beneficiaryAddress: string,
  format: VaultFormat = "legacy"
): Promise<{ tx: any; requiresSignature: boolean }> {
  try {
    const { ccc } = await import("@ckb-ccc/connector-react");
    const network = getNetworkFromClient(signer.client);
    const since = buildAbsoluteSince(ccc, unlock);

    const vaultCell = await signer.client.getCell({
      txHash: vaultOutPoint.txHash,
      index: vaultOutPoint.index,
    });

    if (!vaultCell) {
      throw new Error("Vault cell not found");
    }

    if (format === "scripted") {
      assertVaultScriptsReady(network);

      const payoutLock = await getStandardSecpLockFromAddress(
        beneficiaryAddress,
        signer.client
      );

      const tx = ccc.Transaction.from({
        cellDeps: getScriptedClaimCellDeps(network),
        inputs: [
          {
            previousOutput: {
              txHash: vaultOutPoint.txHash,
              index: vaultOutPoint.index,
            },
            since,
          },
        ],
        outputs: [
          {
            lock: payoutLock,
            capacity: vaultCell.cellOutput.capacity,
          },
        ],
        outputsData: ["0x"],
      });

      const estimatedFee = tx.estimateFee(1000n);
      const inputCapacity = ccc.numFrom(vaultCell.cellOutput.capacity);
      const outputCapacity = inputCapacity - estimatedFee;

      if (outputCapacity <= 0n) {
        throw new Error("Claim transaction fee exceeds the vault capacity.");
      }

      tx.outputs[0].capacity = outputCapacity;
      return { tx, requiresSignature: false };
    }

    const recipientLock = await getLockScriptFromAddress(
      beneficiaryAddress,
      signer.client
    );
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: vaultOutPoint.txHash,
            index: vaultOutPoint.index,
          },
          since,
        },
      ],
      outputs: [
        {
          lock: recipientLock,
          capacity: vaultCell.cellOutput.capacity,
        },
      ],
      outputsData: ["0x"],
    });

    await tx.completeFeeBy(signer);
    return { tx, requiresSignature: true };
  } catch (error) {
    console.error("Failed to build claim vault transaction:", error);
    throw error;
  }
}

export async function signAndSendTransaction(
  signer: any,
  tx: any,
  requiresSignature = true
): Promise<string> {
  try {
    if (requiresSignature) {
      return await signer.sendTransaction(tx);
    }

    // Scripted claims don't require wallet signatures, so broadcast them
    // directly through a public RPC client to avoid wallet-specific tx rewriting.
    const { ccc } = await import("@ckb-ccc/connector-react");
    const network = getNetworkFromClient(signer.client);
    const publicClient =
      network === "testnet"
        ? new ccc.ClientPublicTestnet()
        : new ccc.ClientPublicMainnet();

    return await publicClient.sendTransaction(tx);
  } catch (error) {
    console.error("Failed to send transaction:", error);
    throw error;
  }
}

export function isUnlockConditionSatisfied(
  unlock: UnlockCondition,
  currentBlockHeight: number,
  currentTimestamp: number
): boolean {
  return unlock.type === "blockHeight"
    ? currentBlockHeight >= unlock.value
    : currentTimestamp >= unlock.value + TIMESTAMP_CLAIM_BUFFER_SECONDS;
}
