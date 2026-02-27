// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Email Notification Service (Resend via Vercel Serverless)
//
// Sends email notifications to beneficiaries via a Vercel serverless function
// that calls the Resend API. The API key is kept server-side — the frontend
// only sends a POST request with the email payload.
//
// Setup:
//   1. Create a free Resend account at https://resend.com (3,000 emails/month)
//   2. Get your API key from the Resend dashboard
//   3. Set env vars in the Vercel dashboard:
//        RESEND_API_KEY   – your Resend API key
//        RESEND_FROM      – sender address (e.g. "InheritVault <noreply@yourdomain.com>")
//   4. Optionally set VITE_EMAIL_API_URL in .env for local dev
// ─────────────────────────────────────────────────────────────────────────────

import {
  NETWORK_CONFIGS,
  EMAIL_API_URL,
  type Network,
} from "../config";
import type { UnlockCondition } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatUnlock(unlock: UnlockCondition): string {
  if (unlock.type === "blockHeight") {
    return `Block Height #${unlock.value.toLocaleString()}`;
  }
  return new Date(unlock.value * 1000).toLocaleString();
}

function vaultUrl(network: Network, txHash: string, index: number): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://inherit-vault.vercel.app";
  return `${origin}/vault/${txHash}/${index}`;
}

function explorerUrl(network: Network, txHash: string): string {
  return `${NETWORK_CONFIGS[network].explorerTxUrl}${txHash}`;
}

// ── API caller ──────────────────────────────────────────────────────────────

async function callEmailApi(body: Record<string, unknown>): Promise<boolean> {
  if (!EMAIL_API_URL) {
    console.warn(
      "[InheritVault] Email API URL not configured – skipping notification. " +
        "Set VITE_EMAIL_API_URL in .env or deploy to Vercel (uses /api/send-email by default)."
    );
    return false;
  }

  const res = await fetch(EMAIL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[InheritVault] Email API error:", err);
    return false;
  }

  return true;
}

// ── Email senders ───────────────────────────────────────────────────────────

/**
 * Send a "Vault Created" notification to the beneficiary.
 */
export async function sendVaultCreatedEmail(params: {
  toEmail: string;
  ownerName?: string;
  amountCKB: string;
  unlock: UnlockCondition;
  memo?: string;
  txHash: string;
  index: number;
  network: Network;
}): Promise<boolean> {
  try {
    const sent = await callEmailApi({
      type: "vault-created",
      toEmail: params.toEmail,
      ownerName: params.ownerName || "Someone",
      amountCKB: params.amountCKB,
      unlockCondition: formatUnlock(params.unlock),
      memo: params.memo || "—",
      vaultUrl: vaultUrl(params.network, params.txHash, params.index),
      explorerUrl: explorerUrl(params.network, params.txHash),
      txHash: `${params.txHash.slice(0, 10)}…${params.txHash.slice(-8)}`,
    });
    if (sent) console.log("[InheritVault] Vault Created email sent to", params.toEmail);
    return sent;
  } catch (err) {
    console.error("[InheritVault] Failed to send Vault Created email:", err);
    return false;
  }
}

/**
 * Send a "Vault Claimable" notification to the beneficiary.
 */
export async function sendVaultClaimableEmail(params: {
  toEmail: string;
  ownerName?: string;
  amountCKB: string;
  unlock: UnlockCondition;
  txHash: string;
  index: number;
  network: Network;
}): Promise<boolean> {
  try {
    const sent = await callEmailApi({
      type: "vault-claimable",
      toEmail: params.toEmail,
      ownerName: params.ownerName || "Someone",
      amountCKB: params.amountCKB,
      unlockCondition: formatUnlock(params.unlock),
      vaultUrl: vaultUrl(params.network, params.txHash, params.index),
      explorerUrl: explorerUrl(params.network, params.txHash),
    });
    if (sent) console.log("[InheritVault] Vault Claimable email sent to", params.toEmail);
    return sent;
  } catch (err) {
    console.error("[InheritVault] Failed to send Vault Claimable email:", err);
    return false;
  }
}

/**
 * Returns true if email notifications are configured (API URL is set).
 */
export function isEmailConfigured(): boolean {
  return !!EMAIL_API_URL;
}
