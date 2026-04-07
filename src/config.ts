// -----------------------------------------------------------------------------
// InheritVault - Network Configuration
// Edit the URLs below to point to your preferred RPC / Indexer endpoints.
// -----------------------------------------------------------------------------

export type Network = "testnet" | "mainnet";
export type ScriptHashType = "type" | "data" | "data1" | "data2";
export type DepType = "code" | "depGroup";

export interface ScriptDeployment {
  codeHash: string;
  hashType: ScriptHashType;
  outPoint: {
    txHash: string;
    index: number;
  };
  depType: DepType;
}

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

export interface VaultScriptConfig {
  lock: ScriptDeployment | null;
  type: ScriptDeployment | null;
}

export const VAULT_SCRIPT_DEPLOYMENTS: Record<Network, VaultScriptConfig> = {
  testnet: {
    lock: {
      codeHash:
        "0x723b155f49d446868674b2d944b7a5b2005ed6743f031adcb9b6ba993bfc1a9d",
      hashType: "type",
      outPoint: {
        txHash:
          "0x6aed899f75a4257bb17ae20043f53261ab896585b2cd9027e6f6aef0cad23de9",
        index: 0,
      },
      depType: "code",
    },
    type: {
      codeHash:
        "0x79319d084289125a3b8434d70353d44b39b164908d94f5b5f6b186733bbeabd5",
      hashType: "type",
      outPoint: {
        txHash:
          "0x6aed899f75a4257bb17ae20043f53261ab896585b2cd9027e6f6aef0cad23de9",
        index: 1,
      },
      depType: "code",
    },
  },
  mainnet: {
    lock: null,
    type: null,
  },
};

export function getVaultScriptConfig(network: Network): VaultScriptConfig {
  return VAULT_SCRIPT_DEPLOYMENTS[network];
}

export function isVaultScriptsReady(network: Network): boolean {
  const config = getVaultScriptConfig(network);
  return Boolean(config.lock && config.type);
}
