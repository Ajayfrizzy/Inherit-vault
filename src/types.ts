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
// Vault record – stored in localStorage
// ---------------------------------------------------------------------------
export interface VaultRecord {
  /** Unique identifier generated client-side (UUID-like). */
  id: string;

  /** Network on which the vault was created. */
  network: Network;

  /** CKB address of the beneficiary (lock args owner who can claim). */
  beneficiaryAddress: string;

  /** Amount locked in the vault, in CKB (decimal string, e.g. "200"). */
  amountCKB: string;

  /** Timelock condition. */
  unlock: UnlockCondition;

  /** Optional human-readable memo (stored locally only). */
  memo?: string;

  /** Transaction hash of the create-vault transaction. */
  txHash: string;

  /** OutPoint of the vault cell (txHash:index). */
  outPoint: OutPoint;

  /** ISO-8601 timestamp of when the vault record was saved locally. */
  createdAt: string;

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
