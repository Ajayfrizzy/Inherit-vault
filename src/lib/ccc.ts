// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – CCC (Common Chain Connector) Adapter
//
// This module wraps CCC SDK calls for wallet connection, address management,
// and transaction building/signing/sending.
//
// ⚠️ IMPORTANT: Since exact CCC method names may vary, places where the exact
// CCC API is uncertain are marked with TODO comments. These should be replaced
// with the correct CCC calls after consulting the official CCC documentation.
// ─────────────────────────────────────────────────────────────────────────────

import type { ccc } from "@ckb-ccc/connector-react";
import type { Network } from "../config";
import type { UnlockCondition } from "../types";
import { encodeVaultCellData } from "./codec";
import type { IndexerScript } from "./vaultIndexer";

// ============================================================================
// WALLET CONNECTION & ADDRESS
// ============================================================================

/**
 * Get the currently connected wallet's CKB address (if any).
 * Uses the CCC signer object from the React hook.
 * 
 * @param signer - The CCC signer instance from useSigner() or useCcc()
 * @returns The recommended address string, or null if not connected
 */
export async function getWalletAddress(
  signer: ReturnType<typeof ccc.useSigner> | undefined
): Promise<string | null> {
  if (!signer) return null;

  try {
    // TODO: Verify exact CCC method name
    // Based on docs, this should be:
    const address = await signer.getRecommendedAddress();
    return address;
  } catch (error) {
    console.error("Failed to get wallet address:", error);
    return null;
  }
}

/**
 * Get the lock script for a given CKB address.
 * This is needed for building transactions.
 * 
 * @param address - A CKB address string
 * @param signer - The CCC signer instance
 * @returns The lock script object
 */
export async function getLockScriptFromAddress(
  address: string,
  signer: any
): Promise<any> {
  try {
    const { ccc } = await import("@ckb-ccc/connector-react");
    const addressObj = await ccc.Address.fromString(address, signer.client);
    return addressObj.script;
  } catch (error) {
    console.error("Failed to convert address to lock script:", error);
    throw new Error("Invalid CKB address format");
  }
}

/**
 * Get the lock script for a CKB address in the RPC/Indexer snake_case format.
 * Useful for indexer queries.
 */
export async function getLockScriptForIndexer(
  address: string,
  signer: any
): Promise<IndexerScript> {
  const { ccc } = await import("@ckb-ccc/connector-react");
  const addressObj = await ccc.Address.fromString(address, signer.client);
  const script = addressObj.script;
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

export async function getAddressFromIndexerLock(
  lockScript: IndexerScript,
  network: Network
): Promise<string> {
  const { ccc } = await import("@ckb-ccc/connector-react");
  const client = network === "testnet"
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

function buildAbsoluteSince(cccApi: any, unlock: UnlockCondition) {
  return cccApi.Since.from({
    relative: "absolute",
    metric: unlock.type === "blockHeight" ? "blockNumber" : "timestamp",
    value: BigInt(unlock.value),
  });
}

// ============================================================================
// TRANSACTION BUILDING – CREATE VAULT
// ============================================================================

/**
 * Build a transaction that creates a vault cell.
 *
 * The vault cell:
 *  - Has the beneficiary's lock script
 *  - Contains the specified amount of CKB in capacity
 *  - Stores vault metadata (owner, unlock condition, memo) in output_data
 *
 * @param signer - The CCC signer (creator/funder of the vault)
 * @param beneficiaryAddress - CKB address of the person who can claim
 * @param amountCKB - Amount to lock (in CKB, e.g. 250)
 * @param unlock - The timelock condition
 * @param ownerAddress - CKB address of the vault creator
 * @param ownerName - Optional display name of the creator
 * @param memo - Optional memo stored on-chain
 * @returns An object with { tx, outPointIndex }
 */
export async function buildCreateVaultTransaction(
  signer: any,
  beneficiaryAddress: string,
  amountCKB: number,
  unlock: UnlockCondition,
  ownerAddress: string,
  ownerName?: string,
  memo?: string
): Promise<{ tx: any; outPointIndex: number }> {

  try {
    const { ccc } = await import("@ckb-ccc/connector-react");

    // Get beneficiary lock script from address
    const beneficiaryLock = await getLockScriptFromAddress(beneficiaryAddress, signer);

    // Encode vault metadata into cell data
    const cellData = encodeVaultCellData({
      ownerAddress,
      ownerName: ownerName || undefined,
      unlock,
      memo: memo || undefined,
    });

    // Create transaction with vault output + on-chain data
    const tx = ccc.Transaction.from({
      outputs: [
        {
          lock: beneficiaryLock,
          capacity: ccc.fixedPointFrom(amountCKB),
        },
      ],
      outputsData: [cellData],
    });

    // Complete inputs from creator's wallet to cover capacity + fees
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    // The vault output is the first output (index 0)
    return { tx, outPointIndex: 0 };

  } catch (error) {
    console.error("Failed to build create vault transaction:", error);
    throw error;
  }
}

// ============================================================================
// TRANSACTION BUILDING – CLAIM VAULT
// ============================================================================

/**
 * Build a transaction that claims (spends) a vault cell.
 * 
 * The transaction:
 *  - Spends the vault cell as an input
 *  - Sets the input's "since" field to satisfy the timelock
 *  - Sends the capacity to the beneficiary's address (or another destination)
 * 
 * @param signer - The CCC signer (must be the beneficiary)
 * @param vaultOutPoint - The OutPoint of the vault cell
 * @param unlock - The timelock condition (used to set "since")
 * @param recipientAddress - Where to send the claimed CKB (usually beneficiary's own address)
 * @returns The built transaction
 */
export async function buildClaimVaultTransaction(
  signer: any,
  vaultOutPoint: { txHash: string; index: number },
  unlock: UnlockCondition,
  recipientAddress: string
): Promise<any> {
  
  try {
    const { ccc } = await import("@ckb-ccc/connector-react");
    
    // Get recipient lock script
    const recipientLock = await getLockScriptFromAddress(recipientAddress, signer);
    const since = buildAbsoluteSince(ccc, unlock);
    
    // Create cell dependency for the vault cell
    const vaultCell = await signer.client.getCell({
      txHash: vaultOutPoint.txHash,
      index: vaultOutPoint.index,
    });
    
    if (!vaultCell) {
      throw new Error("Vault cell not found");
    }
    
    // Build transaction
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
    });
    
    // Complete fee (may add change output)
    await tx.completeFeeBy(signer);
    
    return tx;

  } catch (error) {
    console.error("Failed to build claim vault transaction:", error);
    throw error;
  }
}

// ============================================================================
// TRANSACTION SIGNING & SENDING
// ============================================================================

/**
 * Sign and send a transaction using the connected wallet.
 * 
 * @param signer - The CCC signer
 * @param tx - The transaction to sign and send
 * @returns The transaction hash
 */
export async function signAndSendTransaction(
  signer: any,
  tx: any
): Promise<string> {
  try {
    const txHash = await signer.sendTransaction(tx);
    return txHash;
  } catch (error) {
    console.error("Failed to sign and send transaction:", error);
    throw error;
  }
}

// ============================================================================
// HELPER: Check if timelock is satisfied
// ============================================================================

/**
 * Check if the current chain state satisfies the unlock condition.
 * 
 * @param unlock - The unlock condition
 * @param currentBlockHeight - Current tip block height
 * @param currentTimestamp - Current tip timestamp (Unix seconds)
 * @returns true if unlocked, false otherwise
 */
export function isUnlockConditionSatisfied(
  unlock: UnlockCondition,
  currentBlockHeight: number,
  currentTimestamp: number
): boolean {
  if (unlock.type === "blockHeight") {
    return currentBlockHeight >= unlock.value;
  } else {
    return currentTimestamp >= unlock.value;
  }
}
