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
export const TIMESTAMP_CLAIM_BUFFER_SECONDS = 120;
export const MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS = 600;

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
        "0xf6898d947d866763e5e51560940354554abed36060bc63a3a4b6abab4df7fee1",
      hashType: "type",
      outPoint: {
        txHash:
          "0x090f54d28a1863879d88fbc37a83c7ce61724993d5095cc7e9470a0c94b588fc",
        index: 0,
      },
      depType: "code",
    },
    type: {
      codeHash:
        "0x43142c6355bbe4db242f423cd8e4411c397b57cc6880d17fd3d054ae3c3e0c0e",
      hashType: "type",
      outPoint: {
        txHash:
          "0x090f54d28a1863879d88fbc37a83c7ce61724993d5095cc7e9470a0c94b588fc",
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
