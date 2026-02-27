import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { addVault, getOwnerName, setOwnerName as saveOwnerName } from "../lib/storage";
import { buildCreateVaultTransaction, signAndSendTransaction } from "../lib/ccc";
import { MIN_VAULT_CKB, DEFAULT_NETWORK } from "../config";
import { calculateMinCapacityCKB } from "../lib/codec";
import { sendVaultCreatedEmail, isEmailConfigured } from "../lib/email";
import type { UnlockType } from "../types";

export default function CreateVaultPage() {
  const navigate = useNavigate();
  const { wallet } = ccc.useCcc();
  const signer = ccc.useSigner();

  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [amountCKB, setAmountCKB] = useState("");
  const [unlockType, setUnlockType] = useState<UnlockType>("blockHeight");
  const [unlockValue, setUnlockValue] = useState("");
  const [memo, setMemo] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load saved owner name & fetch connected address
  useEffect(() => {
    setOwnerDisplayName(getOwnerName());
  }, []);

  useEffect(() => {
    if (!signer) return;
    (async () => {
      try {
        const addr = await signer.getRecommendedAddress();
        setOwnerAddress(addr);
      } catch {}
    })();
  }, [signer]);

  // Dynamic minimum capacity based on payload size
  const dynamicMinCKB = useMemo(() => {
    if (!ownerAddress) return MIN_VAULT_CKB;
    const min = calculateMinCapacityCKB({
      ownerAddress,
      ownerName: ownerDisplayName || undefined,
      unlock: { type: unlockType, value: parseInt(unlockValue) || 0 },
      memo: memo || undefined,
    });
    return Math.max(min, MIN_VAULT_CKB);
  }, [ownerAddress, ownerDisplayName, unlockType, unlockValue, memo]);

  const validateAddress = (addr: string): boolean => {
    const mainnetPattern = /^ckb1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{42,}$/;
    const testnetPattern = /^ckt1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{42,}$/;
    return mainnetPattern.test(addr) || testnetPattern.test(addr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!signer) {
      setError("Please connect your wallet first");
      return;
    }

    if (!beneficiaryAddress.trim()) {
      setError("Beneficiary address is required");
      return;
    }

    if (!validateAddress(beneficiaryAddress.trim())) {
      setError("Invalid CKB address format. Must be a valid ckb1... (mainnet) or ckt1... (testnet) address");
      return;
    }

    const amount = parseFloat(amountCKB);
    if (!amountCKB || isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (amount < dynamicMinCKB) {
      setError(`Amount must be at least ${dynamicMinCKB} CKB to cover cell capacity (${MIN_VAULT_CKB} base + data overhead)`);
      return;
    }

    if (!unlockValue.trim()) {
      setError("Unlock value is required");
      return;
    }

    const unlockVal = parseInt(unlockValue, 10);
    if (isNaN(unlockVal) || unlockVal <= 0) {
      setError(`Invalid unlock value. Must be a positive ${unlockType === "blockHeight" ? "block number" : "Unix timestamp"}`);
      return;
    }

    if (unlockType === "blockHeight") {
      if (unlockVal < 1000000) {
        setError("Block height seems too low. Current CKB mainnet is over 10 million blocks. Please check the value.");
        return;
      }
    } else {
      const now = Math.floor(Date.now() / 1000);
      if (unlockVal < now) {
        setError("Unlock timestamp must be in the future");
        return;
      }
      if (unlockVal < 1600000000) {
        setError("Invalid timestamp. Please use Unix timestamp in seconds (not milliseconds)");
        return;
      }
    }

    setLoading(true);

    try {
      // Persist owner display name for future sessions
      if (ownerDisplayName) saveOwnerName(ownerDisplayName);

      const { tx, outPointIndex } = await buildCreateVaultTransaction(
        signer,
        beneficiaryAddress.trim(),
        amount,
        { type: unlockType, value: unlockVal },
        ownerAddress,
        ownerDisplayName || undefined,
        memo || undefined
      );

      const txHash = await signAndSendTransaction(signer, tx);

      // Save lightweight vault reference in localStorage
      const vaultRecord = {
        txHash,
        index: outPointIndex,
        network: DEFAULT_NETWORK,
        createdAt: new Date().toISOString(),
        beneficiaryAddress: beneficiaryAddress.trim(),
        amountCKB,
        unlock: { type: unlockType, value: unlockVal },
        memo: memo || undefined,
        beneficiaryEmail: beneficiaryEmail.trim() || undefined,
        ownerAddress,
        ownerName: ownerDisplayName || undefined,
        status: "pending" as const,
      };

      addVault(vaultRecord);

      // Send "Vault Created" email notification (fire-and-forget)
      if (beneficiaryEmail.trim()) {
        sendVaultCreatedEmail({
          toEmail: beneficiaryEmail.trim(),
          ownerName: ownerDisplayName || undefined,
          amountCKB,
          unlock: { type: unlockType, value: unlockVal },
          memo: memo || undefined,
          txHash,
          index: outPointIndex,
          network: DEFAULT_NETWORK,
        }).catch(() => {}); // non-blocking
      }

      navigate(`/vault/${txHash}/${outPointIndex}`);
    } catch (err: any) {
      console.error("Failed to create vault:", err);
      
      let errorMessage = "Failed to create vault";
      
      if (err.message?.includes("Invalid CKB address")) {
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
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mt-4">
          <h2 className="text-2xl font-semibold mb-2">Connect Wallet</h2>
          <p className="opacity-80">Please connect your wallet to create a vault.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
      <div className="mb-6">
        <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
      </div>
      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">Create Vault</h1>

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6">
        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">
            Beneficiary Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={beneficiaryAddress}
            onChange={(e) => setBeneficiaryAddress(e.target.value)}
            placeholder="ckb1q..."
            required
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            The CKB address that will be able to claim the funds after unlock
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">
            Amount (CKB) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min={dynamicMinCKB}
            value={amountCKB}
            onChange={(e) => setAmountCKB(e.target.value)}
            placeholder={`Minimum ${dynamicMinCKB}`}
            required
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            Amount of CKB to lock (minimum {dynamicMinCKB} CKB for cell capacity + on-chain data)
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">
            Unlock Type <span className="text-red-500">*</span>
          </label>
          <select 
            value={unlockType} 
            onChange={(e) => setUnlockType(e.target.value as UnlockType)}
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          >
            <option value="blockHeight">Block Height</option>
            <option value="timestamp">Timestamp</option>
          </select>
          <div className="text-xs md:text-sm opacity-70 mt-2">
            {unlockType === "blockHeight"
              ? "Unlock when CKB reaches a specific block height"
              : "Unlock at a specific date/time"}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">
            {unlockType === "blockHeight" ? "Unlock Block Height" : "Unlock Date & Time"} <span className="text-red-500">*</span>
          </label>
          {unlockType === "blockHeight" ? (
            <input
              type="number"
              value={unlockValue}
              onChange={(e) => setUnlockValue(e.target.value)}
              placeholder="e.g. 12345678"
              required
              className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
            />
          ) : (
            <input
              type="datetime-local"
              value={unlockValue ? new Date(parseInt(unlockValue) * 1000).toISOString().slice(0, 16) : ""}
              onChange={(e) => {
                if (e.target.value) {
                  const timestamp = Math.floor(new Date(e.target.value).getTime() / 1000);
                  setUnlockValue(timestamp.toString());
                } else {
                  setUnlockValue("");
                }
              }}
              min={new Date().toISOString().slice(0, 16)}
              required
              className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors [color-scheme:dark]"
            />
          )}
          <div className="text-xs md:text-sm opacity-70 mt-2">
            {unlockType === "blockHeight"
              ? "Block height when the vault unlocks (check current height on explorer)"
              : unlockValue 
                ? `Selected date: ${new Date(parseInt(unlockValue) * 1000).toLocaleString()} (Unix: ${unlockValue})`
                : "Select the date and time when the vault should unlock"}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">Your Display Name (optional)</label>
          <input
            type="text"
            value={ownerDisplayName}
            onChange={(e) => setOwnerDisplayName(e.target.value)}
            placeholder="e.g. Mom, Dad, Grandma..."
            maxLength={80}
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            Stored on-chain so the beneficiary can identify who created this vault
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">Memo (optional)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Happy 18th birthday! Love, Mom..."
            rows={3}
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors resize-none"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            Stored on-chain — the beneficiary will see this message
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm md:text-base font-medium mb-2">
            Beneficiary Email (optional)
            {isEmailConfigured() && (
              <span className="ml-2 text-xs font-normal opacity-60">📧 Notifications enabled</span>
            )}
          </label>
          <input
            type="email"
            value={beneficiaryEmail}
            onChange={(e) => setBeneficiaryEmail(e.target.value)}
            placeholder="beneficiary@example.com"
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            {isEmailConfigured()
              ? "The beneficiary will receive email notifications when the vault is created and when funds become claimable. Email is stored locally only — never on-chain."
              : "Email notifications are not configured yet. Add EmailJS credentials to your .env file to enable."}
          </div>
        </div>

        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-white px-4 py-3 rounded-lg mb-6 text-sm md:text-base break-words">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            type="submit" 
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-black font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Vault"}
          </button>
          <button
            type="button"
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-[#00d4aa] px-6 py-3 rounded-lg border border-[#00d4aa] transition-colors disabled:opacity-50"
            onClick={() => navigate("/")}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="bg-gray-800 bg-opacity-10 border border-gray-800 rounded-lg p-4 md:p-6 mt-4">
        <h3 className="text-lg md:text-xl font-semibold text-yellow-500 mb-3">⚠️ Before Creating</h3>
        <ul className="space-y-2 pl-5 list-disc text-sm md:text-base leading-relaxed">
          <li>Double-check the beneficiary address</li>
          <li>Ensure you have enough CKB for the vault + transaction fees</li>
          <li>Remember: funds will be locked until the unlock condition is met</li>
          {/* <li className="text-red-400 font-semibold">⚠️ IMPORTANT: Timestamp locks cannot be claimed in this MVP version. Please use Block Height for claimable vaults.</li> */}
          <li>For block height locks, check the current block height on the CKB explorer before setting your unlock value</li>
        </ul>
      </div>
    </div>
  );
}
