import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { addVault, generateId } from "../lib/storage";
import { buildCreateVaultTransaction, signAndSendTransaction } from "../lib/ccc";
import { MIN_VAULT_CKB, DEFAULT_NETWORK } from "../config";
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    if (amount < MIN_VAULT_CKB) {
      setError(`Amount must be at least ${MIN_VAULT_CKB} CKB to cover minimum cell capacity`);
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
      const { tx, outPointIndex } = await buildCreateVaultTransaction(
        signer,
        beneficiaryAddress.trim(),
        amount,
        { type: unlockType, value: unlockVal }
      );

      const txHash = await signAndSendTransaction(signer, tx);

      const vaultRecord = {
        id: generateId(),
        network: DEFAULT_NETWORK,
        beneficiaryAddress,
        amountCKB: amountCKB,
        unlock: { type: unlockType, value: unlockVal },
        memo: memo || undefined,
        txHash,
        outPoint: { txHash, index: outPointIndex },
        createdAt: new Date().toISOString(),
        status: "pending" as const,
      };

      addVault(vaultRecord);
      navigate(`/vault/${vaultRecord.id}`);
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
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">Connect Wallet</h2>
          <p className="opacity-80">Please connect your wallet to create a vault.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
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
            min={MIN_VAULT_CKB}
            value={amountCKB}
            onChange={(e) => setAmountCKB(e.target.value)}
            placeholder={`Minimum ${MIN_VAULT_CKB}`}
            required
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            Amount of CKB to lock (minimum {MIN_VAULT_CKB} CKB for cell capacity)
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
          <label className="block text-sm md:text-base font-medium mb-2">Memo (optional)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Note to yourself about this vault..."
            rows={3}
            className="w-full px-3 md:px-4 py-2 md:py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm md:text-base focus:outline-none focus:border-[#00d4aa] transition-colors resize-none"
          />
          <div className="text-xs md:text-sm opacity-70 mt-2">
            Stored locally only, not on-chain
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
