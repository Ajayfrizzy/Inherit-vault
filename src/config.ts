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
        "0x7ecd173ed7061f9fb68ea2dba0df5d16350f477448ebc2c3a409b624482dfcfe",
      hashType: "type",
      outPoint: {
        txHash:
          "0x7c570127a39da08f30ae0d7fef0226448abb3683beee927848f45dd531effbcc",
        index: 0,
      },
      depType: "code",
    },
    type: {
      codeHash:
        "0x402a2566a51acbe72fbd043168cb5100e9a1c78f9201f50def5f3f4dd35080a6",
      hashType: "type",
      outPoint: {
        txHash:
          "0x5b80085bae3bb71db90f4ab0e9bf448c2d40824a8367e273f29da8d029688bbb",
        index: 0,
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
