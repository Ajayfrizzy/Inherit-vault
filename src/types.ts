// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Shared Types
// ─────────────────────────────────────────────────────────────────────────────

import type { Network } from "./config";

// ---------------------------------------------------------------------------
// Unlock condition stored with a vault record
// ---------------------------------------------------------------------------
export type UnlockType = "blockHeight" | "timestamp";

export interface UnlockCondition {
  type: UnlockType;
  /**
   * When type === "blockHeight": an absolute CKB block height (number).
   * When type === "timestamp":  a Unix timestamp in **seconds**.
   */
  value: number;
}

// ---------------------------------------------------------------------------
// CKB OutPoint (pointer to a specific cell)
// ---------------------------------------------------------------------------
export interface OutPoint {
  txHash: string; // 0x-prefixed 32-byte hex
  index: number;  // cell index within the transaction outputs (decimal)
}

// ---------------------------------------------------------------------------
// Vault record – lightweight reference stored in localStorage.
// The real vault data lives on-chain in the cell's output_data.
// This record is an *index* the owner keeps so they can quickly find their
// created vaults without scanning the entire chain.
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

  // ── Cached on-chain data (for display while tx is pending / offline) ──

  /** CKB address of the beneficiary. */
  beneficiaryAddress: string;

  /** Amount locked in the vault, in CKB (decimal string, e.g. "200"). */
  amountCKB: string;

  /** Timelock condition. */
  unlock: UnlockCondition;

  /** Optional memo stored in cell data on-chain. */
  memo?: string;

  /** Beneficiary email for notifications (stored locally, NOT on-chain). */
  beneficiaryEmail?: string;

  /** Whether a "vault claimable" email has been sent (prevents duplicates). */
  claimableEmailSent?: boolean;

  // ── Owner profile (stored in cell data on-chain) ──

  /** Owner's CKB address (the wallet that funded the vault). */
  ownerAddress?: string;

  /** Owner's chosen display name. */
  ownerName?: string;

  // ── Status cache ──

  /**
   * Cached status (refreshed when the vault detail page is viewed).
   * "pending"   – tx not yet confirmed
   * "live"      – cell is unspent
   * "spent"     – cell has been spent (claimed or otherwise)
   */
  status?: "pending" | "live" | "spent";
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
  capacity: string; // hex-encoded
  lock: CkbScript;
  type?: CkbScript | null;
}

export interface CkbCell {
  output: CkbCellOutput;
  output_data: string;
  out_point: {
    tx_hash: string;
    index: string; // hex
  };
  block_number?: string; // hex
  tx_index?: string;     // hex
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
  blockNumber: number;   // decimal
  timestamp: number;     // Unix seconds
}
