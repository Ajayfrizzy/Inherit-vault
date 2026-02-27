// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Vercel Serverless API: Send Email via Resend
//
// POST /api/send-email
// Body: { type: "vault-created" | "vault-claimable", ...params }
//
// Environment variable (set in Vercel dashboard, NOT prefixed with VITE_):
//   RESEND_API_KEY   – your Resend API key
//   RESEND_FROM      – sender address, e.g. "InheritVault <noreply@yourdomain.com>"
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "InheritVault <onboarding@resend.dev>";

// ── HTML email builders ─────────────────────────────────────────────────────

function vaultCreatedHtml(p: {
  ownerName: string;
  amountCKB: string;
  unlockCondition: string;
  memo: string;
  vaultUrl: string;
  explorerUrl: string;
  txHash: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
    <h1 style="color: #00d4aa; margin-top: 0;">🔐 InheritVault</h1>
    <h2 style="color: #f1f5f9; margin-bottom: 8px;">A Vault Has Been Created For You</h2>
    <p style="color: #94a3b8; margin-top: 0;">${p.ownerName} has locked <strong style="color: #00d4aa;">${p.amountCKB} CKB</strong> in a time-locked vault for you.</p>

    <div style="background: #0f172a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; color: #cbd5e1; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #94a3b8;">From</td><td style="padding: 6px 0; text-align: right;">${p.ownerName}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Amount</td><td style="padding: 6px 0; text-align: right; color: #00d4aa; font-weight: bold;">${p.amountCKB} CKB</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Unlocks At</td><td style="padding: 6px 0; text-align: right;">${p.unlockCondition}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Tx Hash</td><td style="padding: 6px 0; text-align: right; font-family: monospace; font-size: 12px;">${p.txHash}</td></tr>
        ${p.memo !== "—" ? `<tr><td style="padding: 6px 0; color: #94a3b8;">Memo</td><td style="padding: 6px 0; text-align: right;">${p.memo}</td></tr>` : ""}
      </table>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${p.vaultUrl}" style="display: inline-block; background: #00d4aa; color: #0f172a; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">View Your Vault</a>
    </div>

    <p style="color: #64748b; font-size: 12px; text-align: center; margin-bottom: 0;">
      <a href="${p.explorerUrl}" style="color: #00d4aa;">View on CKB Explorer</a> · InheritVault – Timelock inheritance on Nervos CKB
    </p>
  </div>
</body>
</html>`;
}

function vaultClaimableHtml(p: {
  ownerName: string;
  amountCKB: string;
  unlockCondition: string;
  vaultUrl: string;
  explorerUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
    <h1 style="color: #00d4aa; margin-top: 0;">🔐 InheritVault</h1>
    <h2 style="color: #f1f5f9; margin-bottom: 8px;">Your Vault Is Now Claimable! 🎉</h2>
    <p style="color: #94a3b8; margin-top: 0;">Great news! The vault created by <strong>${p.ownerName}</strong> has reached its unlock condition and is now ready to claim.</p>

    <div style="background: #0f172a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; color: #cbd5e1; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #94a3b8;">From</td><td style="padding: 6px 0; text-align: right;">${p.ownerName}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Amount</td><td style="padding: 6px 0; text-align: right; color: #00d4aa; font-weight: bold;">${p.amountCKB} CKB</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Unlock Condition</td><td style="padding: 6px 0; text-align: right;">${p.unlockCondition}</td></tr>
      </table>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${p.vaultUrl}" style="display: inline-block; background: #00d4aa; color: #0f172a; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">Claim Your Vault</a>
    </div>

    <p style="color: #64748b; font-size: 12px; text-align: center; margin-bottom: 0;">
      <a href="${p.explorerUrl}" style="color: #00d4aa;">View on CKB Explorer</a> · InheritVault – Timelock inheritance on Nervos CKB
    </p>
  </div>
</body>
</html>`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  }

  const { type, ...params } = req.body || {};

  try {
    if (type === "vault-created") {
      const { toEmail, ownerName, amountCKB, unlockCondition, memo, vaultUrl, explorerUrl, txHash } = params;

      if (!toEmail) return res.status(400).json({ error: "toEmail is required" });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [toEmail],
        subject: `${ownerName || "Someone"} locked ${amountCKB} CKB for you on InheritVault`,
        html: vaultCreatedHtml({
          ownerName: ownerName || "Someone",
          amountCKB,
          unlockCondition,
          memo: memo || "—",
          vaultUrl,
          explorerUrl,
          txHash,
        }),
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    if (type === "vault-claimable") {
      const { toEmail, ownerName, amountCKB, unlockCondition, vaultUrl, explorerUrl } = params;

      if (!toEmail) return res.status(400).json({ error: "toEmail is required" });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [toEmail],
        subject: `Your InheritVault is now claimable – ${amountCKB} CKB ready!`,
        html: vaultClaimableHtml({
          ownerName: ownerName || "Someone",
          amountCKB,
          unlockCondition,
          vaultUrl,
          explorerUrl,
        }),
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown email type: ${type}` });
  } catch (err: any) {
    console.error("Send email failed:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
