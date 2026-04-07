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
  DEFAULT_NETWORK,
  MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS,
  MIN_VAULT_CKB,
  isVaultScriptsReady,
} from "../config";
import { getTipHeader } from "../lib/ckb";
import { calculateMinCapacityCKB } from "../lib/codec";
import {
  sendVaultCreatedEmail,
  isEmailConfigured,
  getEmailConfigurationMessage,
} from "../lib/email";
import type { UnlockType } from "../types";

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
  const { wallet } = ccc.useCcc();
  const signer = ccc.useSigner();
  const scriptsReady = isVaultScriptsReady(DEFAULT_NETWORK);

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
        // Ignore wallet lookup failures here; submit handles them later.
        setOwnerLock(null);
      }
    })();
  }, [signer]);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!signer) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!scriptsReady) {
      setError(
        `Scripted vault creation is disabled on ${DEFAULT_NETWORK} until the deployed lock and type script metadata are configured in src/config.ts.`
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
        `Amount must be at least ${dynamicMinCKB} CKB to cover cell capacity, typed script overhead, and on-chain data.`
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
          unlockType === "blockHeight" ? "block number" : "Unix timestamp"
        }.`
      );
      return;
    }

    if (unlockType === "blockHeight") {
      if (unlockVal < 1_000_000) {
        setError(
          "Block height seems too low. Check the current CKB explorer height before creating the vault."
        );
        return;
      }
    } else {
      const now = Math.floor(Date.now() / 1000);
      const tip = await getTipHeader(DEFAULT_NETWORK).catch(() => null);
      const minUnlock = Math.max(now, tip?.timestamp ?? 0) + MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS;

      if (unlockVal < now) {
        setError("Unlock timestamp must be in the future.");
        return;
      }
      if (unlockVal < 1_600_000_000) {
        setError("Invalid timestamp. Use a Unix timestamp in seconds, not milliseconds.");
        return;
      }
      if (unlockVal < minUnlock) {
        setError(
          `Unlock timestamp must be at least ${MIN_TIMESTAMP_UNLOCK_LEAD_SECONDS / 60} minute(s) in the future so the vault can confirm on-chain before it becomes claimable.`
        );
        return;
      }
    }

    setLoading(true);

    try {
      await assertSupportedScriptedBeneficiary(beneficiaryAddress.trim(), signer.client);

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
        network: DEFAULT_NETWORK,
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
          network: DEFAULT_NETWORK,
        }).catch(() => {
          // Email delivery is best effort.
        });
      }

      navigate(`/vault/${txHash}/${buildResult.outPointIndex}`);
    } catch (err: any) {
      console.error("Failed to create vault:", err);

      let errorMessage = "Failed to create vault.";

      if (err.message?.includes("Only standard secp256k1-blake160")) {
        errorMessage =
          "This beneficiary address is not supported for the new scripted vault format yet. Use a standard secp256k1-blake160 CKB address.";
      } else if (err.message?.includes("Invalid CKB address")) {
        errorMessage = "The beneficiary address format is invalid. Please check and try again.";
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
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-12">
        <Link to="/" className="text-sm text-[#00d4aa] transition-colors hover:text-white md:text-base">
          {"<- Back to Home"}
        </Link>
        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-2 text-2xl font-semibold">Connect Wallet</h2>
          <p className="opacity-80">Please connect your wallet to create a vault.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-[#00d4aa] md:px-6 md:py-12">
      <div className="mb-6">
        <Link to="/" className="text-sm text-[#00d4aa] transition-colors hover:text-white md:text-base">
          {"<- Back to Home"}
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold md:mb-8 md:text-4xl">Create Vault</h1>

      <div
        className={`mb-4 rounded-lg border px-4 py-3 text-sm md:text-base ${
          scriptsReady
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            : "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
        }`}
      >
        {scriptsReady
          ? "Scripted vault creation is enabled. New vaults will use the custom lock, an owner-authenticated type script, and Molecule cell data."
          : `Scripted vault creation is disabled on ${DEFAULT_NETWORK} until the deployed lock and type scripts are configured in src/config.ts.`}
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-700 bg-gray-800 p-4 md:p-6">
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            Beneficiary Address <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={beneficiaryAddress}
            onChange={(e) => setBeneficiaryAddress(e.target.value)}
            placeholder="ckt1..."
            required
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          />
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            New scripted vaults currently support standard secp256k1-blake160 beneficiary addresses only.
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            Amount (CKB) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min={dynamicMinCKB}
            value={amountCKB}
            onChange={(e) => setAmountCKB(e.target.value)}
            placeholder={`Minimum ${dynamicMinCKB}`}
            required
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          />
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            Minimum {dynamicMinCKB} CKB covers the typed vault cell, scripted lock overhead, and on-chain metadata.
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            Unlock Type <span className="text-red-400">*</span>
          </label>
          <select
            value={unlockType}
            onChange={(e) => setUnlockType(e.target.value as UnlockType)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          >
            <option value="blockHeight">Block Height</option>
            <option value="timestamp">Timestamp</option>
          </select>
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            The claim transaction will still carry a CKB `since` value, and the scripted lock verifies that it satisfies the on-chain unlock value before the funds can move.
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            {unlockType === "blockHeight" ? "Unlock Block Height" : "Unlock Date and Time"}{" "}
            <span className="text-red-400">*</span>
          </label>
          {unlockType === "blockHeight" ? (
            <input
              type="number"
              value={unlockValue}
              onChange={(e) => setUnlockValue(e.target.value)}
              placeholder="e.g. 12345678"
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
            />
          ) : (
            <input
              type="datetime-local"
              value={unlockValue ? toLocalDateTimeInputValue(parseInt(unlockValue, 10)) : ""}
              onChange={(e) => {
                if (e.target.value) {
                  const timestamp = Math.floor(new Date(e.target.value).getTime() / 1000);
                  setUnlockValue(timestamp.toString());
                } else {
                  setUnlockValue("");
                }
              }}
              min={toLocalDateTimeInputValue(Math.floor(Date.now() / 1000))}
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base [color-scheme:dark]"
            />
          )}
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            {unlockType === "blockHeight"
              ? "Use the explorer to check the current chain height before choosing the unlock block."
              : unlockValue
                ? `Selected date: ${new Date(parseInt(unlockValue, 10) * 1000).toLocaleString()} (Unix: ${unlockValue})`
                : "Select the time when the scripted vault should become claimable."}
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            Your Display Name (optional)
          </label>
          <input
            type="text"
            value={ownerDisplayName}
            onChange={(e) => setOwnerDisplayName(e.target.value)}
            placeholder="e.g. Mom, Dad, Grandma"
            maxLength={80}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          />
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            Stored in the owner-authenticated vault payload so the beneficiary can identify who created the vault.
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">Memo (optional)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="A note the beneficiary will see on-chain"
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          />
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            Stored on-chain in the vault cell data.
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium md:text-base">
            Beneficiary Email (optional)
            {isEmailConfigured() && (
              <span className="ml-2 text-xs font-normal opacity-60">Notifications enabled</span>
            )}
          </label>
          <input
            type="email"
            value={beneficiaryEmail}
            onChange={(e) => setBeneficiaryEmail(e.target.value)}
            placeholder="beneficiary@example.com"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none md:px-4 md:py-3 md:text-base"
          />
          <div className="mt-2 text-xs opacity-70 md:text-sm">
            {getEmailConfigurationMessage()}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-white md:text-base">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <button
            type="submit"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#00d4aa] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#22e4bd] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || !scriptsReady}
          >
            {loading && <span className="spinner-inline" aria-hidden="true" />}
            <span>{loading ? "Creating..." : "Create Scripted Vault"}</span>
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-[#00d4aa] bg-gray-800 px-6 py-3 text-[#00d4aa] transition-colors hover:bg-gray-700 disabled:opacity-50"
            onClick={() => navigate("/")}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/70 p-4 md:p-6">
        <h3 className="mb-3 text-lg font-semibold text-yellow-300 md:text-xl">
          Before Creating
        </h3>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed md:text-base">
          <li>Double-check the beneficiary address and confirm it is a standard secp CKB address.</li>
          <li>Make sure you have enough CKB for the vault plus transaction fees.</li>
          <li>Remember that the scripted lock enforces the unlock condition on-chain.</li>
          <li>Your connected wallet lock is embedded into the vault data and authenticated by the type script at creation time.</li>
          <li>Update the deployed script metadata in src/config.ts before expecting scripted vault creation to succeed on-chain.</li>
        </ul>
      </div>
    </div>
  );
}
