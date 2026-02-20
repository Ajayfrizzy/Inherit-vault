import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { getVaultById, updateVault, deleteVault } from "../lib/storage";
import { getTipHeader, getTransactionStatus, isCellLive } from "../lib/ckb";
import { buildClaimVaultTransaction, signAndSendTransaction, isUnlockConditionSatisfied } from "../lib/ccc";
import { NETWORK_CONFIGS } from "../config";
import type { VaultRecord } from "../types";

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { wallet } = ccc.useCcc();
  const signer = ccc.useSigner();

  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [canClaim, setCanClaim] = useState(false);

  // Load vault and refresh status
  useEffect(() => {
    if (!id) return;

    const loadedVault = getVaultById(id);
    if (!loadedVault) {
      setLoading(false);
      return;
    }

    setVault(loadedVault);

    // Fetch current chain state and vault status
    (async () => {
      try {
        const tip = await getTipHeader(loadedVault.network);
        setCurrentBlockHeight(tip.blockNumber);
        setCurrentTimestamp(tip.timestamp);

        const unlocked = isUnlockConditionSatisfied(
          loadedVault.unlock,
          tip.blockNumber,
          tip.timestamp
        );
        setIsUnlocked(unlocked);

        // Check transaction status
        const txStatus = await getTransactionStatus(loadedVault.network, loadedVault.txHash);
        if (txStatus.tx_status.status === "committed") {
          // Check if cell is still live
          const isLive = await isCellLive(loadedVault.network, loadedVault.outPoint);
          const newStatus: "live" | "spent" = isLive ? "live" : "spent";
          
          if (loadedVault.status !== newStatus) {
            const updated: VaultRecord = { ...loadedVault, status: newStatus };
            setVault(updated);
            updateVault(updated);
          }
        } else if (txStatus.tx_status.status === "rejected") {
          const updated: VaultRecord = { ...loadedVault, status: "spent" as const };
          setVault(updated);
          updateVault(updated);
        }

      } catch (err) {
        console.error("Failed to fetch vault status:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Check if current user can claim
  useEffect(() => {
    if (!vault || !signer) {
      setCanClaim(false);
      return;
    }

    (async () => {
      try {
        const userAddress = await signer.getRecommendedAddress();
        const isBeneficiary = userAddress.toLowerCase() === vault.beneficiaryAddress.toLowerCase();
        setCanClaim(isBeneficiary && isUnlocked && vault.status === "live");
      } catch {
        setCanClaim(false);
      }
    })();
  }, [vault, signer, isUnlocked]);

  const handleClaim = async () => {
    if (!vault || !signer) return;

    // Double-check unlock condition is satisfied
    if (!isUnlocked) {
      setError("The vault is not yet unlocked. Please wait until the unlock condition is met.");
      return;
    }

    setClaiming(true);
    setError("");

    try {
      const userAddress = await signer.getRecommendedAddress();
      
      const tx = await buildClaimVaultTransaction(
        signer,
        vault.outPoint,
        vault.unlock,
        userAddress
      );

      const txHash = await signAndSendTransaction(signer, tx);

      // Update vault status
      const updated = { ...vault, status: "spent" as const };
      setVault(updated);
      updateVault(updated);

      alert(`Claim transaction sent!\nTx Hash: ${txHash}`);
    } catch (err: any) {
      console.error("Failed to claim vault:", err);
      
      let errorMessage = "Failed to claim vault";
      
      if (err.message?.includes("Immature")) {
        if (vault.unlock.type === "blockHeight") {
          errorMessage = `The vault is not yet unlocked. Current block: ${currentBlockHeight.toLocaleString()}, Required block: ${vault.unlock.value.toLocaleString()}. Please wait for ${(vault.unlock.value - currentBlockHeight).toLocaleString()} more blocks.`;
        } else {
          const requiredTime = new Date(vault.unlock.value * 1000).toLocaleString();
          const currentTime = new Date(currentTimestamp * 1000).toLocaleString();
          errorMessage = `The vault is not yet unlocked. Current time: ${currentTime}, Required time: ${requiredTime}. Please wait until the specified time.`;
        }
      } else if (err.message?.includes("not found")) {
        errorMessage = "Vault cell not found on chain. It may have already been spent.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setClaiming(false);
    }
  };

  const handleDelete = () => {
    if (!vault) return;
    
    if (confirm(`Delete this vault record from localStorage?\nThis will not affect the on-chain state.`)) {
      deleteVault(vault.id);
      navigate("/vaults");
    }
  };

  const formatUnlock = () => {
    if (!vault) return "";
    if (vault.unlock.type === "blockHeight") {
      return `Block ${vault.unlock.value.toLocaleString()}`;
    } else {
      return new Date(vault.unlock.value * 1000).toLocaleString();
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="spinner" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">Vault Not Found</h2>
          <p className="opacity-80 mb-4">The vault you're looking for doesn't exist in localStorage.</p>
          <Link to="/vaults">
            <button className="bg-primary hover:bg-primary-hover text-black font-semibold px-6 py-3 rounded-lg transition-colors">
              View All Vaults
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const explorerUrl = `${NETWORK_CONFIGS[vault.network].explorerTxUrl}${vault.txHash}`;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <Link to="/vaults" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">
          ← Back to Vaults
        </Link>
      </div>

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 flex flex-wrap items-center gap-4">
        <span>Vault Detail</span>
        {vault.status === "pending" && <span className="text-sm md:text-base text-yellow-500 whitespace-nowrap">⏳ Pending</span>}
        {vault.status === "live" && <span className="text-sm md:text-base text-[#00d4aa] whitespace-nowrap">✓ Live</span>}
        {vault.status === "spent" && <span className="text-sm md:text-base text-red-500 whitespace-nowrap">✗ Spent</span>}
      </h1>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6">
        <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Amount</h2>
        <div className="text-3xl md:text-4xl font-bold mb-6 md:mb-8">
          {vault.amountCKB} CKB
        </div>

        <div className="space-y-6">
          <div>
            <div className="text-xs md:text-sm opacity-70 mb-2">Beneficiary Address</div>
            <div className="font-mono text-xs md:text-sm break-all">
              {vault.beneficiaryAddress}
            </div>
          </div>

          <div>
            <div className="text-xs md:text-sm opacity-70 mb-2">Unlock Condition</div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <span>{formatUnlock()}</span>
              {isUnlocked ? (
                <span className="text-[#00d4aa] text-sm md:text-base">✓ Unlocked</span>
              ) : (
                <span className="text-gray-500 text-sm md:text-base">🔒 Locked</span>
              )}
            </div>
          </div>

          {vault.memo && (
            <div>
              <div className="text-xs md:text-sm opacity-70 mb-2">Memo</div>
              <div>{vault.memo}</div>
            </div>
          )}

          <div>
            <div className="text-xs md:text-sm opacity-70 mb-2">Transaction Hash</div>
            <div className="font-mono text-xs md:text-sm break-all">
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[#00d4aa] hover:underline">
                {vault.txHash}
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs md:text-sm opacity-70 mb-2">Network</div>
              <div className="capitalize">{vault.network}</div>
            </div>
            <div>
              <div className="text-xs md:text-sm opacity-70 mb-2">Created</div>
              <div>{new Date(vault.createdAt).toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs md:text-sm opacity-70 mb-2">Current Block</div>
              <div>{currentBlockHeight.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs md:text-sm opacity-70 mb-2">Current Time</div>
              <div>{new Date(currentTimestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500 bg-opacity-10 border border-white rounded-lg p-4 mt-4">
          <div className="text-white text-sm md:text-base break-words">{error}</div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mt-6 md:mt-8">
        {canClaim && (
          <button 
            className="flex-1 bg-gray-800 hover:bg-gray-500 text-[#00d4aa] font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleClaim} 
            disabled={claiming}
          >
            {claiming ? "Claiming..." : "Claim Vault"}
          </button>
        )}
        {!canClaim && vault.status === "live" && (
          <button className="flex-1 bg-gray-800 text-gray-200 px-6 py-3 rounded-lg border border-gray-700 cursor-not-allowed opacity-70" disabled>
            {!wallet
              ? "Connect Wallet to Claim"
              : !isUnlocked
              ? "🔒 Not Yet Unlocked"
              : "Not Beneficiary"}
          </button>
        )}
        {vault.status === "spent" && (
          <div className="flex-1 px-6 py-3 text-red-500 text-center">
            This vault has been claimed or spent
          </div>
        )}
        <button 
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 px-6 py-3 rounded-lg border border-gray-700 transition-colors"
          onClick={handleDelete}
        >
          Delete Record
        </button>
      </div>

      {canClaim && (
        <div className="bg-opacity-10 border border-green-500 rounded-lg p-4 md:p-6 mt-4">
          <h3 className="text-lg md:text-xl font-semibold text-[#00d4aa] mb-2">✓ Ready to Claim</h3>
          <p className="text-sm md:text-base">You are the beneficiary and the unlock condition has been met. Click "Claim Vault" to transfer the funds to your address.</p>
        </div>
      )}
    </div>
  );
}
