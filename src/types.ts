// -----------------------------------------------------------------------------
// InheritVault - Shared Types
// -----------------------------------------------------------------------------

import type { Network } from "./config";

// ---------------------------------------------------------------------------
// Unlock condition stored with a vault record
// ---------------------------------------------------------------------------
export type UnlockType = "blockHeight" | "timestamp";
export type VaultRecordStatus = "pending" | "live" | "spent" | "unknown";
export type LiveCellStatus = "live" | "spent" | "unknown";

export interface UnlockCondition {
  type: UnlockType;
  /**
   * When type === "blockHeight": an absolute CKB block height (number).
   * When type === "timestamp": a Unix timestamp in seconds.
   */
  value: number;
}

export type VaultFormat = "legacy" | "scripted";
export type VaultAuthenticity = "legacy" | "verified";

// ---------------------------------------------------------------------------
// CKB OutPoint (pointer to a specific cell)
// ---------------------------------------------------------------------------
export interface OutPoint {
  txHash: string;
  index: number;
}

// ---------------------------------------------------------------------------
// Vault record - lightweight reference stored in localStorage.
// The real vault data lives on-chain in the cell's output_data.
// ---------------------------------------------------------------------------
export interface VaultRecord {
  /** Transaction hash of the create-vault transaction. */
  txHash: string;

  /** Output index of the vault cell within the transaction. */
  index: number;

  /** Network on which the vault was created. */
  network: Network;

  /** ISO-8601 timestamp of when the vault was created locally. */
  createdAt: string;

  /** CKB address of the beneficiary. */
  beneficiaryAddress: string;

  /** Amount locked in the vault, in CKB (decimal string, e.g. "200"). */
  amountCKB: string;

  /** Timelock condition. */
  unlock: UnlockCondition;

  /** Optional memo stored in cell data on-chain. */
  memo?: string;

  /** Beneficiary email for notifications (stored locally, not on-chain). */
  beneficiaryEmail?: string;

  /** Whether a "vault claimable" email has been sent (prevents duplicates). */
  claimableEmailSent?: boolean;

  /** Owner's CKB address (the wallet that funded the vault). */
  ownerAddress?: string;

  /** Owner's chosen display name. */
  ownerName?: string;

  /** Whether the vault uses the new scripted format or the old compatibility flow. */
  format?: VaultFormat;

  /** Whether the vault is an authenticated typed/scripted vault or a legacy compatibility record. */
  authenticity?: VaultAuthenticity;

  /**
   * Cached status (refreshed when the vault detail page is viewed).
   * "pending" - tx not yet confirmed
   * "live" - cell is unspent
   * "spent" - cell has been spent (claimed or otherwise)
   * "unknown" - chain status could not be confirmed
   */
  status?: VaultRecordStatus;
}

// ---------------------------------------------------------------------------
// CKB RPC types (minimal, for what we actually use)
// ---------------------------------------------------------------------------

export interface CkbScript {
  code_hash: string;
  hash_type: "type" | "data" | "data1" | "data2";
  args: string;
}

export interface CkbCellOutput {
  capacity: string;
  lock: CkbScript;
  type?: CkbScript | null;
}

export interface CkbCell {
  output: CkbCellOutput;
  output_data: string;
  out_point: {
    tx_hash: string;
    index: string;
  };
  block_number?: string;
  tx_index?: string;
}

export interface CkbTransactionStatus {
  transaction?: {
    hash: string;
    outputs: CkbCellOutput[];
    outputs_data: string[];
  };
  tx_status: {
    status: "pending" | "proposed" | "committed" | "rejected" | "unknown";
    block_hash?: string | null;
    block_number?: string | null;
    reason?: string | null;
  };
}

export interface TipHeader {
  blockNumber: number;
  timestamp: number;
}
