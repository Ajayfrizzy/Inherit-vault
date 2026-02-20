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

// Minimum CKB capacity for a cell that holds a CKB address string in data
// (61 bytes lock + 8 bytes capacity + ~50 bytes data ≈ 119 bytes → 119 CKB minimum).
// We use 200 CKB as a safe minimum for vault cells.
export const MIN_VAULT_CKB = 200;
