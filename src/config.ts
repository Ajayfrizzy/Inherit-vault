// -----------------------------------------------------------------------------
// InheritVault - Network Configuration
// Edit the URLs below to point to your preferred RPC / Indexer endpoints.
// -----------------------------------------------------------------------------

export type Network = "testnet" | "mainnet";

export interface NetworkConfig {
  rpcUrl: string;
  indexerUrl: string;
  indexerUrls: string[];
  explorerTxUrl: string; // prefix - append txHash
  label: string;
}

export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  testnet: {
    rpcUrl: "https://testnet.ckb.dev/rpc",
    indexerUrl: "https://testnet.ckb.dev/indexer",
    indexerUrls: [
      "https://testnet.ckb.dev/indexer",
      "https://testnet.ckbapp.dev/indexer",
    ],
    explorerTxUrl: "https://pudge.explorer.nervos.org/transaction/",
    label: "Testnet (Pudge)",
  },
  mainnet: {
    rpcUrl: "https://mainnet.ckb.dev/rpc",
    indexerUrl: "https://mainnet.ckb.dev/indexer",
    indexerUrls: [
      "https://mainnet.ckb.dev/indexer",
      "https://mainnet.ckbapp.dev/indexer",
    ],
    explorerTxUrl: "https://explorer.nervos.org/transaction/",
    label: "Mainnet",
  },
};

export const DEFAULT_NETWORK: Network = "testnet";

export function getIndexerUrls(network: Network): string[] {
  const { indexerUrl, indexerUrls } = NETWORK_CONFIGS[network];
  return Array.from(new Set([indexerUrl, ...indexerUrls]));
}

export const MIN_VAULT_CKB = 250;

export const EMAIL_API_URL =
  import.meta.env.VITE_EMAIL_API_URL ?? "/api/send-email";

// Deployment hashes for our custom Rust CKB scripts
export const VAULT_LOCK_SCRIPT = {
  codeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  hashType: "type" as const,
};

export const VAULT_TYPE_SCRIPT = {
  codeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  hashType: "type" as const,
};