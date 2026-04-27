import type { ccc } from "@ckb-ccc/connector-react";
import { DEFAULT_NETWORK, NETWORK_CONFIGS, type Network } from "../config";
import { getNetworkFromClient } from "./vaultScripts";

type ClientLike = Pick<ccc.Client, "addressPrefix">;

export function getActiveNetwork(client?: ClientLike | null): Network {
  if (!client) return DEFAULT_NETWORK;
  return getNetworkFromClient(client);
}

export function getNetworkLabel(network: Network): string {
  return NETWORK_CONFIGS[network].label;
}

export function parseNetwork(value: string | null | undefined): Network | null {
  if (value === "testnet" || value === "mainnet") {
    return value;
  }

  return null;
}

export function getExplorerTransactionUrl(
  network: Network,
  txHash: string
): string {
  return `${NETWORK_CONFIGS[network].explorerTxUrl}${txHash}`;
}

export function buildVaultDetailPath(
  txHash: string,
  index: number,
  network: Network
): string {
  return `/vault/${txHash}/${index}?network=${network}`;
}
