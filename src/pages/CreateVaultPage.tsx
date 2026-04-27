import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { addVault, getOwnerName, setOwnerName as saveOwnerName } from "../lib/storage";
import {
  assertSupportedScriptedBeneficiary,
  buildCreateVaultTransaction,
  getLockScriptFromAddress,
  signAndSendTransaction,
} from "../lib/ccc";
import {
  MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS,
  MIN_VAULT_CKB,
  isVaultScriptsReady,
} from "../config";
import { getTipHeader } from "../lib/ckb";
import { calculateMinCapacityCKB } from "../lib/codec";
import {
  sendVaultCreatedEmail,
  isEmailConfigured,
} from "../lib/email";
import {
  describeUnlock,
  formatAddress,
  formatDateTimeWithZone,
  formatRelativeTimeFromNow,
  formatUnlock,
} from "../lib/display";
import {
  buildVaultDetailPath,
  getActiveNetwork,
  getNetworkLabel,
} from "../lib/network";
import type { UnlockCondition, UnlockType } from "../types";

function padDateTimePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function toLocalDateTimeInputValue(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  const year = date.getFullYear();
  const month = padDateTimePart(date.getMonth() + 1);
  const day = padDateTimePart(date.getDate());
  const hours = padDateTimePart(date.getHours());
  const minutes = padDateTimePart(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function CreateVaultPage() {
  const navigate = useNavigate();
  const { wallet, open, client } = ccc.useCcc();
  const signer = ccc.useSigner();
  const activeNetwork = getActiveNetwork(signer?.client ?? client);
  const scriptsReady = isVaultScriptsReady(activeNetwork);
  const networkLabel = getNetworkLabel(activeNetwork);
  const emailEnabled = isEmailConfigured();

  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [amountCKB, setAmountCKB] = useState("");
  const [unlockType, setUnlockType] = useState<UnlockType>("blockHeight");
  const [unlockValue, setUnlockValue] = useState("");
  const [memo, setMemo] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [ownerLock, setOwnerLock] = useState<{
    codeHash: string;
    hashType: "type" | "data" | "data1" | "data2";
    args: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentChainTimestamp, setCurrentChainTimestamp] = useState(0);
  const [timingLoading, setTimingLoading] = useState(false);
  const [lastTimingSync, setLastTimingSync] = useState("");

  useEffect(() => {
    setOwnerDisplayName(getOwnerName());
  }, []);

  useEffect(() => {
    if (!signer) return;

    (async () => {
      try {
        const addr = await signer.getRecommendedAddress();
        setOwnerAddress(addr);
        const lock = await getLockScriptFromAddress(addr, signer.client);
        setOwnerLock({
          codeHash: lock.codeHash,
          hashType: lock.hashType,
          args: lock.args,
        });
      } catch {
        setOwnerLock(null);
      }
    })();
  }, [signer]);

  const refreshTimingReference = async () => {
    setTimingLoading(true);
    try {
      const tip = await getTipHeader(activeNetwork);
      setCurrentBlockHeight(tip.blockNumber);
      setCurrentChainTimestamp(tip.timestamp);
      setLastTimingSync(new Date().toISOString());
    } catch {
      // Keep existing values when the chain reference cannot be refreshed.
    } finally {
      setTimingLoading(false);
    }
  };

  useEffect(() => {
    if (!wallet) return;
    refreshTimingReference();
  }, [wallet, activeNetwork]);

  const dynamicMinCKB = useMemo(() => {
    if (!ownerLock) return MIN_VAULT_CKB;
    const min = calculateMinCapacityCKB({
      ownerLock,
      ownerName: ownerDisplayName || undefined,
      unlock: { type: unlockType, value: parseInt(unlockValue, 10) || 0 },
      memo: memo || undefined,
    });
    return Math.max(min, MIN_VAULT_CKB);
  }, [ownerLock, ownerDisplayName, unlockType, unlockValue, memo]);

  const minCapacityLabel = dynamicMinCKB.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  const selectedUnlock: UnlockCondition | null = unlockValue.trim()
    ? {
        type: unlockType,
        value: parseInt(unlockValue, 10) || 0,
      }
    : null;
  const unlockSummary = selectedUnlock
    ? formatUnlock(selectedUnlock)
    : "Choose when the vault should become claimable.";
  const unlockContext = selectedUnlock
    ? describeUnlock(selectedUnlock, currentBlockHeight, currentChainTimestamp)
    : "The beneficiary will only be able to claim after this moment.";
  const trimmedBeneficiaryAddress = beneficiaryAddress.trim();
  const parsedAmount = parseFloat(amountCKB);
  const parsedUnlockValue = parseInt(unlockValue, 10);
  const amountReady =
    !!amountCKB &&
    !Number.isNaN(parsedAmount) &&
    parsedAmount >= dynamicMinCKB;
  const amountShortfall =
    !Number.isNaN(parsedAmount) && parsedAmount < dynamicMinCKB
      ? dynamicMinCKB - parsedAmount
      : dynamicMinCKB;
  const minRecommendedTimestamp =
    Math.max(Math.floor(Date.now() / 1000), currentChainTimestamp) +
    MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS;
  const unlockReady = unlockType === "blockHeight"
    ? !!unlockValue.trim() &&
      !Number.isNaN(parsedUnlockValue) &&
      parsedUnlockValue > Math.max(currentBlockHeight, 0)
    : !!unlockValue.trim() &&
      !Number.isNaN(parsedUnlockValue) &&
      parsedUnlockValue >= minRecommendedTimestamp;
  const readinessChecks = [
    {
      label: "Beneficiary added",
      met: !!trimmedBeneficiaryAddress,
      detail: trimmedBeneficiaryAddress
        ? formatAddress(trimmedBeneficiaryAddress, 14, 10)
        : "Add the beneficiary address to keep going.",
    },
    {
      label: "Amount covers the current minimum",
      met: amountReady,
      detail: amountReady
        ? `${amountCKB} CKB selected`
        : `Add at least ${amountShortfall.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })} more CKB.`,
    },
    {
      label: "Unlock timing looks claim-safe",
      met: unlockReady,
      detail: selectedUnlock
        ? unlockType === "blockHeight"
          ? `Target block ${parsedUnlockValue.toLocaleString()}`
          : `${formatDateTimeWithZone(parsedUnlockValue)} (${formatRelativeTimeFromNow(
              parsedUnlockValue
            )})`
        : "Choose a future block height or date.",
    },
    {
      label: "Connected wallet is ready",
      met: !!ownerAddress,
      detail: ownerAddress
        ? formatAddress(ownerAddress, 14, 10)
        : "Waiting for the connected wallet address.",
    },
  ];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!signer) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!scriptsReady) {
      setError(
        `Vault creation is not available on ${networkLabel} right now.`
      );
      return;
    }

    if (!beneficiaryAddress.trim()) {
      setError("Beneficiary address is required.");
      return;
    }

    if (!ownerAddress.trim()) {
      setError("Unable to resolve the connected wallet address.");
      return;
    }

    const amount = parseFloat(amountCKB);
    if (!amountCKB || Number.isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    if (amount < dynamicMinCKB) {
      setError(
        `Amount must be at least ${minCapacityLabel} CKB to cover the vault cell and its stored details.`
      );
      return;
    }

    if (!unlockValue.trim()) {
      setError("Unlock value is required.");
      return;
    }

    const unlockVal = parseInt(unlockValue, 10);
    if (Number.isNaN(unlockVal) || unlockVal <= 0) {
      setError(
        `Invalid unlock value. Enter a positive ${
          unlockType === "blockHeight" ? "block number" : "timestamp"
        }.`
      );
      return;
    }

    if (unlockType === "blockHeight") {
      if (unlockVal < 1_000_000) {
        setError(
          "That block height looks too low. Please compare it with the current chain height before creating the vault."
        );
        return;
      }
    } else {
      const now = Math.floor(Date.now() / 1000);
      const tip = await getTipHeader(activeNetwork).catch(() => null);
      const minUnlock =
        Math.max(now, tip?.timestamp ?? 0) + MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS;

      if (unlockVal < now) {
        setError("Unlock timestamp must be in the future.");
        return;
      }
      if (unlockVal < 1_600_000_000) {
        setError("Please use a Unix timestamp in seconds, not milliseconds.");
        return;
      }
      if (unlockVal < minUnlock) {
        setError(
          `Choose a time at least ${MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS / 60} minutes in the future so the vault can confirm before it becomes claimable.`
        );
        return;
      }
    }

    setLoading(true);

    try {
      await assertSupportedScriptedBeneficiary(
        beneficiaryAddress.trim(),
        signer.client
      );

      if (ownerDisplayName) saveOwnerName(ownerDisplayName);

      const buildResult = await buildCreateVaultTransaction(
        signer,
        beneficiaryAddress.trim(),
        amount,
        { type: unlockType, value: unlockVal },
        ownerAddress,
        ownerDisplayName || undefined,
        memo || undefined
      );

      const txHash = await signAndSendTransaction(
        signer,
        buildResult.tx,
        buildResult.requiresSignature
      );

      const vaultRecord = {
        txHash,
        index: buildResult.outPointIndex,
        network: activeNetwork,
        createdAt: new Date().toISOString(),
        beneficiaryAddress: beneficiaryAddress.trim(),
        amountCKB,
        unlock: { type: unlockType, value: unlockVal },
        memo: memo || undefined,
        beneficiaryEmail: beneficiaryEmail.trim() || undefined,
        ownerAddress,
        ownerName: ownerDisplayName || undefined,
        format: "scripted" as const,
        authenticity: "verified" as const,
        status: "pending" as const,
      };

      addVault(vaultRecord);

      if (beneficiaryEmail.trim()) {
        sendVaultCreatedEmail({
          toEmail: beneficiaryEmail.trim(),
          ownerName: ownerDisplayName || undefined,
          amountCKB,
          unlock: { type: unlockType, value: unlockVal },
          memo: memo || undefined,
          txHash,
          index: buildResult.outPointIndex,
          network: activeNetwork,
        }).catch(() => {
          // Email delivery is best effort.
        });
      }

      navigate(buildVaultDetailPath(txHash, buildResult.outPointIndex, activeNetwork));
    } catch (err: any) {
      console.error("Failed to create vault:", err);

      let errorMessage = "Failed to create vault.";

      if (err.message?.includes("Only standard secp256k1-blake160")) {
        errorMessage =
          "This beneficiary address is not supported yet. Please use a standard secp256k1-blake160 CKB address.";
      } else if (err.message?.includes("Invalid CKB address")) {
        errorMessage =
          "The beneficiary address format is invalid. Please check it and try again.";
      } else if (err.message?.includes("Insufficient")) {
        errorMessage = "Insufficient CKB balance. Please check your wallet balance.";
      } else if (err.message?.includes("rejected")) {
        errorMessage = "Transaction was rejected. Please try again.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="page-shell">
        <div className="mb-6">
          <Link to="/" className="inline-link">
            {"<- Back to Home"}
          </Link>
        </div>

        <section className="panel-strong max-w-3xl">
          <div className="section-eyebrow">Create a vault</div>
          <h1 className="page-title mt-4">Connect your wallet to begin.</h1>
          <p className="page-subtitle mt-4">
            Once your wallet is connected, you can set the beneficiary, amount,
            unlock timing, and optional notification details from one guided
            flow.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button className="button-primary" onClick={open}>
              Connect Wallet
            </button>
            <Link to="/vaults" className="button-secondary">
              Review Saved Vaults
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="mb-6">
        <Link to="/" className="inline-link">
          {"<- Back to Home"}
        </Link>
      </div>

      <div className="mb-8">
        <div className="section-eyebrow">Create a vault</div>
        <h1 className="page-title mt-4">Set up the handoff in four decisions.</h1>
        <p className="hidden page-subtitle mt-4">
          We’ll walk through who should receive the vault, how much you want to
          lock, when it opens, and what optional note or notification details to
          include.
        </p>
        <p className="page-subtitle mt-4">
          We'll walk through who should receive the vault, how much you want to
          lock, when it opens, and what optional note or notification details to
          include.
        </p>
      </div>

      {!scriptsReady && (
        <div className="status-banner status-banner-warning mb-6">
          Vault creation is not available on {networkLabel} right now. You can
          still review saved vaults and use the beneficiary view.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="panel">
            <div className="section-eyebrow">1. Recipient</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              Who should receive this vault?
            </h2>
            <p className="field-hint">
              Add the beneficiary address first. Optional email notifications are
              handled off-chain and are only stored locally in your browser.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="field-label">
                  Beneficiary Address <span className="text-red-300">*</span>
                </label>
                <input
                  type="text"
                  value={beneficiaryAddress}
                  onChange={(event) => setBeneficiaryAddress(event.target.value)}
                  placeholder="ckt1..."
                  required
                  className="input-base"
                />
                <div className="field-hint">
                  Use a standard secp256k1-blake160 CKB address for the smoothest
                  claim flow.
                </div>
              </div>

              <div>
                <label className="field-label">
                  Beneficiary Email <span className="text-[#9dbfb7]">(optional)</span>
                </label>
                <input
                  type="email"
                  value={beneficiaryEmail}
                  onChange={(event) => setBeneficiaryEmail(event.target.value)}
                  placeholder="beneficiary@example.com"
                  className="input-base"
                />
                <div className="field-hint">
                  {emailEnabled
                    ? "If provided, the app will try to notify the beneficiary when the vault is created and again when it becomes claimable."
                    : "Email delivery is not active in this environment, so this field is optional for now."}
                </div>
              </div>
            </div>

            <div
              className={`status-banner mt-6 ${
                trimmedBeneficiaryAddress
                  ? "status-banner-success"
                  : "status-banner-neutral"
              }`}
            >
              {trimmedBeneficiaryAddress
                ? "Recipient details are in place. You can still update the address or leave email blank."
                : "Start with the beneficiary address so the live summary can reflect the final recipient."}
            </div>
          </section>

          <section className="panel">
            <div className="section-eyebrow">2. Amount</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              How much should be locked?
            </h2>
            <p className="field-hint">
              The minimum updates as you change the vault details so the record
              has enough capacity to store everything cleanly.
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <label className="field-label">
                  Amount (CKB) <span className="text-red-300">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={dynamicMinCKB}
                  value={amountCKB}
                  onChange={(event) => setAmountCKB(event.target.value)}
                  placeholder={`Minimum ${minCapacityLabel}`}
                  required
                  className="input-base"
                />
                <div className="field-hint">
                  {amountReady
                    ? "Amount covers the current vault minimum. Keep a little extra in the wallet for fees."
                    : `Enter at least ${minCapacityLabel} CKB before fees.`}
                </div>
              </div>

              <div className="metric-card min-w-[220px]">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Current minimum
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">
                  {minCapacityLabel} CKB
                </div>
                <div className="field-hint">
                  Based on your note, unlock settings, and saved display name.
                </div>
              </div>
            </div>

            <div
              className={`status-banner mt-6 ${
                amountReady ? "status-banner-success" : "status-banner-neutral"
              }`}
            >
              {amountReady
                ? "The selected amount is large enough for the current vault payload."
                : "The minimum can move a little as you change the note, unlock settings, or saved display name."}
            </div>
          </section>

          <section className="panel">
            <div className="section-eyebrow">3. Unlock timing</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              When should the beneficiary be able to claim?
            </h2>
            <p className="field-hint">
              Pick the format that feels easiest for you to review. A calendar
              time works well for planning, while a block height works well if
              you already monitor the chain.
            </p>

            <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Latest observed block
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {currentBlockHeight > 0
                      ? currentBlockHeight.toLocaleString()
                      : "Waiting..."}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Latest observed chain time
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {currentChainTimestamp > 0
                      ? formatDateTimeWithZone(currentChainTimestamp)
                      : "Waiting..."}
                  </div>
                  {lastTimingSync && (
                    <div className="field-hint">
                      Checked {formatDateTimeWithZone(lastTimingSync)}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="button-ghost self-start"
                onClick={refreshTimingReference}
                disabled={timingLoading}
              >
                {timingLoading ? "Refreshing..." : "Refresh timing"}
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`text-left ${
                  unlockType === "blockHeight"
                    ? "button-chip button-chip-active"
                    : "button-chip"
                }`}
                onClick={() => setUnlockType("blockHeight")}
                aria-pressed={unlockType === "blockHeight"}
              >
                Block height
              </button>
              <button
                type="button"
                className={`text-left ${
                  unlockType === "timestamp"
                    ? "button-chip button-chip-active"
                    : "button-chip"
                }`}
                onClick={() => setUnlockType("timestamp")}
                aria-pressed={unlockType === "timestamp"}
              >
                Date and time
              </button>
            </div>

            <div className="mt-6">
              <label className="field-label">
                {unlockType === "blockHeight"
                  ? "Unlock Block Height"
                  : "Unlock Date and Time"}{" "}
                <span className="text-red-300">*</span>
              </label>

              {unlockType === "blockHeight" ? (
                <input
                  type="number"
                  value={unlockValue}
                  onChange={(event) => setUnlockValue(event.target.value)}
                  placeholder="e.g. 12345678"
                  required
                  className="input-base"
                />
              ) : (
                <input
                  type="datetime-local"
                  value={
                    unlockValue
                      ? toLocalDateTimeInputValue(parseInt(unlockValue, 10))
                      : ""
                  }
                  onChange={(event) => {
                    if (event.target.value) {
                      const timestamp = Math.floor(
                        new Date(event.target.value).getTime() / 1000
                      );
                      setUnlockValue(timestamp.toString());
                    } else {
                      setUnlockValue("");
                    }
                  }}
                  min={toLocalDateTimeInputValue(minRecommendedTimestamp)}
                  required
                  className="input-base"
                />
              )}

              <div className="field-hint">
                {unlockType === "blockHeight"
                  ? currentBlockHeight > 0
                    ? `Choose a block higher than ${currentBlockHeight.toLocaleString()} so the vault has time to confirm first.`
                    : "Compare your chosen block height with the latest explorer height before submitting."
                  : selectedUnlock
                    ? `Selected date: ${formatUnlock(selectedUnlock)} (${formatRelativeTimeFromNow(
                        selectedUnlock.value
                      )})`
                    : "Choose a time comfortably in the future so the vault has time to confirm first."}
              </div>
            </div>

            <div
              className={`status-banner mt-6 ${
                unlockReady ? "status-banner-success" : "status-banner-warning"
              }`}
            >
              {unlockType === "blockHeight"
                ? unlockReady
                  ? "Unlock block is ahead of the latest observed chain height."
                  : "Set a future block height so the vault does not become claimable too early."
                : unlockReady
                  ? "Timestamp is far enough ahead of the latest observed chain time. A final chain-time buffer can still apply at claim time."
                  : `Choose a timestamp at least ${
                      MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS / 60
                    } minutes after the latest observed chain time.`}
            </div>

            {unlockType === "timestamp" && (
              <div className="status-banner status-banner-warning mt-4">
                Timestamp-based claims can still require about{" "}
                {MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS / 60} minutes of confirmation
                runway before the vault is safely live.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-eyebrow">4. Optional context</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              Add a human touch
            </h2>
            <p className="field-hint">
              These fields help the beneficiary recognize the vault when they
              review it later.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="field-label">
                  Your Display Name <span className="text-[#9dbfb7]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={ownerDisplayName}
                  onChange={(event) => setOwnerDisplayName(event.target.value)}
                  placeholder="e.g. Mom, Dad, Grandma"
                  maxLength={80}
                  className="input-base"
                />
                <div className="field-hint">
                  This is the name the beneficiary will see next to the vault.
                </div>
              </div>

              <div>
                <label className="field-label">
                  Memo <span className="text-[#9dbfb7]">(optional)</span>
                </label>
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Add a short note for the beneficiary"
                  rows={4}
                  className="textarea-base"
                />
                <div className="field-hint">
                  Keep it concise. This note becomes part of the on-chain vault
                  record.
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            {error && (
              <div className="status-banner status-banner-danger mb-5">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="submit"
                className="button-primary flex-1"
                disabled={loading || !scriptsReady}
              >
                {loading && <span className="spinner-inline" aria-hidden="true" />}
                <span>{loading ? "Creating..." : "Create Vault"}</span>
              </button>
              <button
                type="button"
                className="button-secondary flex-1"
                onClick={() => navigate("/")}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </section>
        </form>

        <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <section className="panel-strong">
            <div className="section-eyebrow">Live summary</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              Review the plan before you sign
            </h2>

            <div className="mt-6 space-y-3">
              {readinessChecks.map((check) => (
                <div key={check.label} className="metric-card">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                        check.met ? "bg-emerald-400" : "bg-yellow-300"
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-white">{check.label}</div>
                      <div className="field-hint">{check.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Beneficiary
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {beneficiaryAddress
                    ? formatAddress(beneficiaryAddress, 14, 10)
                    : "Not added yet"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Amount
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {amountCKB ? `${amountCKB} CKB` : "Not set"}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Unlock
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {unlockSummary}
                  </div>
                  <div className="field-hint">{unlockContext}</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Creator name
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {ownerDisplayName || "Not added"}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Notifications
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {beneficiaryEmail ? beneficiaryEmail : "No email added"}
                  </div>
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Network and minimum
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {networkLabel}
                </div>
                <div className="field-hint">
                  Minimum recommended amount right now: {minCapacityLabel} CKB.
                </div>
              </div>
            </div>
          </section>

          <section className="panel-muted">
            <div className="section-eyebrow">What happens next</div>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[#d7f6ef]">
              <li>Your wallet signs and broadcasts the vault transaction.</li>
              <li>The vault first appears as pending, then becomes live after confirmation.</li>
              <li>The beneficiary can review the vault details at any time, but claim only after unlock.</li>
            </ul>
          </section>

          <section className="panel-muted">
            <div className="section-eyebrow">Quick checks</div>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[#d7f6ef]">
              <li>Verify the beneficiary address one last time.</li>
              <li>Make sure your wallet has the vault amount plus fees.</li>
              <li>Keep the transaction hash so the vault can be recovered later.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
