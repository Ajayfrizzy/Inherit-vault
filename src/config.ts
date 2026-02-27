// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Network Configuration
// Edit the URLs below to point to your preferred RPC / Indexer endpoints.
// ─────────────────────────────────────────────────────────────────────────────

export type Network = "testnet" | "mainnet";

export interface NetworkConfig {
  rpcUrl: string;
  indexerUrl: string;
  explorerTxUrl: string; // prefix – append txHash
  label: string;
}

export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  testnet: {
    rpcUrl: "https://testnet.ckb.dev/rpc",
    indexerUrl: "https://testnet.ckb.dev/indexer",
    explorerTxUrl: "https://pudge.explorer.nervos.org/transaction/",
    label: "Testnet (Pudge)",
  },
  mainnet: {
    rpcUrl: "https://mainnet.ckb.dev/rpc",
    indexerUrl: "https://mainnet.ckb.dev/indexer",
    explorerTxUrl: "https://explorer.nervos.org/transaction/",
    label: "Mainnet",
  },
};

export const DEFAULT_NETWORK: Network = "testnet";

// Minimum CKB capacity for a vault cell.
// Cell overhead ≈ 61 bytes (8 capacity + 53 lock script).
// Vault data ≈ 80-200 bytes (magic + version + JSON payload).
// Total ≈ 141-261 bytes → 141-261 CKB minimum.
// We set 250 CKB as the safe floor; the UI calculates the exact minimum
// dynamically based on the data payload size.
export const MIN_VAULT_CKB = 250;

// ─────────────────────────────────────────────────────────────────────────────
// Email notifications (Resend via Vercel serverless function)
// In production on Vercel this defaults to "/api/send-email".
// For local dev, set VITE_EMAIL_API_URL in .env.
// ─────────────────────────────────────────────────────────────────────────────
export const EMAIL_API_URL =
  import.meta.env.VITE_EMAIL_API_URL ?? "/api/send-email";
