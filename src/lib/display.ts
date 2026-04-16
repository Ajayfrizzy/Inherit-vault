import type { UnlockCondition } from "../types";

export function formatAddress(
  address: string,
  lead = 12,
  tail = 8
): string {
  if (!address) return "Not available";
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

export function formatDateTime(value: string | number): string {
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return date.toLocaleString();
}

export function formatUnlock(unlock: UnlockCondition): string {
  return unlock.type === "blockHeight"
    ? `Block ${unlock.value.toLocaleString()}`
    : new Date(unlock.value * 1000).toLocaleString();
}

function formatDuration(totalSeconds: number): string {
  const absoluteSeconds = Math.max(1, Math.abs(totalSeconds));
  const units: Array<[label: string, size: number]> = [
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [label, size] of units) {
    if (absoluteSeconds >= size) {
      const rounded = Math.round(absoluteSeconds / size);
      return `${rounded.toLocaleString()} ${label}${rounded === 1 ? "" : "s"}`;
    }
  }

  return "1 second";
}

export function describeUnlock(
  unlock: UnlockCondition,
  currentBlockHeight?: number,
  currentTimestamp?: number
): string {
  if (unlock.type === "blockHeight") {
    if (!currentBlockHeight) {
      return `Unlocks at block ${unlock.value.toLocaleString()}`;
    }

    const blocksRemaining = unlock.value - currentBlockHeight;
    return blocksRemaining <= 0
      ? "Ready to claim now"
      : `${blocksRemaining.toLocaleString()} blocks remaining`;
  }

  const now =
    currentTimestamp && currentTimestamp > 0
      ? currentTimestamp
      : Math.floor(Date.now() / 1000);
  const secondsRemaining = unlock.value - now;

  return secondsRemaining <= 0
    ? `Opened ${formatDuration(secondsRemaining)} ago`
    : `Opens in ${formatDuration(secondsRemaining)}`;
}
