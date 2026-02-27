import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { getVaultByOutPoint, updateVault, deleteVault } from "../lib/storage";
import { getTipHeader } from "../lib/ckb";
import { buildClaimVaultTransaction, signAndSendTransaction, isUnlockConditionSatisfied } from "../lib/ccc";
import { fetchVaultFromTransaction, type VaultFromTx } from "../lib/vaultIndexer";
import { NETWORK_CONFIGS, DEFAULT_NETWORK } from "../config";
import { sendVaultClaimableEmail } from "../lib/email";
import type { VaultRecord, UnlockCondition } from "../types";

export default function VaultDetailPage() {
  const { txHash, index: indexParam } = useParams<{ txHash: string; index: string }>();
  const navigate = useNavigate();
  const { wallet } = ccc.useCcc();
  const signer = ccc.useSigner();

  const vaultIndex = parseInt(indexParam || "0", 10);
  const network = DEFAULT_NETWORK;

  // ── State ─────────────────────────────────────────────────────────────
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [onChainData, setOnChainData] = useState<VaultFromTx | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [verified, setVerified] = useState(false);

  // ── Load vault data (chain + localStorage cache) ─────────────────────
  useEffect(() => {
    if (!txHash) return;

    (async () => {
      try {
        // Try localStorage first (owner's cached data)
        const cached = getVaultByOutPoint(txHash, vaultIndex);
        if (cached) setVault(cached);

        // Fetch from chain (source of truth)
        const chainResult = await fetchVaultFromTransaction(network, txHash, vaultIndex);

        if (chainResult) {
          setOnChainData(chainResult);
          setVerified(true);

          // Build VaultRecord from on-chain data
          const newStatus: VaultRecord["status"] = chainResult.isLive
            ? "live"
            : chainResult.txStatus === "committed"
            ? "spent"
            : chainResult.txStatus === "pending" || chainResult.txStatus === "proposed"
            ? "pending"
            : "spent";

          const record: VaultRecord = {
            txHash,
            index: vaultIndex,
            network,
            createdAt: cached?.createdAt || new Date().toISOString(),
            beneficiaryAddress: cached?.beneficiaryAddress || "",
            amountCKB: chainResult.capacityCKB,
            unlock: chainResult.data.unlock,
            memo: chainResult.data.memo,
            ownerAddress: chainResult.data.ownerAddress,
            ownerName: chainResult.data.ownerName,
            status: newStatus,
            beneficiaryEmail: cached?.beneficiaryEmail,
            claimableEmailSent: cached?.claimableEmailSent,
          };
          setVault(record);

          // Update localStorage cache if we have a cached version
          if (cached) updateVault(record);
        } else if (!cached) {
          // No data anywhere
          setVault(null);
        }

        // Fetch chain tip for unlock check
        const tip = await getTipHeader(network);
        setCurrentBlockHeight(tip.blockNumber);
        setCurrentTimestamp(tip.timestamp);

        const unlock: UnlockCondition = chainResult?.data.unlock || cached?.unlock || { type: "blockHeight", value: 0 };
        const unlocked = isUnlockConditionSatisfied(unlock, tip.blockNumber, tip.timestamp);
        setIsUnlocked(unlocked);
      } catch (err) {
        console.error("Failed to load vault:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [txHash, vaultIndex]);

  // ── Check if current user can claim ───────────────────────────────────
  useEffect(() => {
    if (!vault || !signer) {
      setCanClaim(false);
      return;

    }

    (async () => {
      try {
        const userAddress = await signer.getRecommendedAddress();
        const isBeneficiary = userAddress.toLowerCase() === vault.beneficiaryAddress.toLowerCase();
        const isLive = onChainData?.isLive ?? vault.status === "live";
        setCanClaim(isBeneficiary && isUnlocked && isLive);
      } catch {
        setCanClaim(false);
      }
    })();
  }, [vault, signer, isUnlocked, onChainData]);

  // ── Send "Vault Claimable" email when unlock is detected ──────────────
  useEffect(() => {
    if (
      !vault ||
      !isUnlocked ||
      !vault.beneficiaryEmail ||
      vault.claimableEmailSent ||
      vault.status === "spent"
    ) {
      return;
    }

    sendVaultClaimableEmail({
      toEmail: vault.beneficiaryEmail,
      ownerName: vault.ownerName,
      amountCKB: vault.amountCKB,
      unlock: vault.unlock,
      txHash: vault.txHash,
      index: vault.index,
      network: vault.network,
    }).then((sent) => {
      if (sent) {
        const updated = { ...vault, claimableEmailSent: true };
        setVault(updated);
        updateVault(updated);
      }
    });
  }, [vault?.txHash, isUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

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
        { txHash: vault.txHash, index: vault.index },
        vault.unlock,
        userAddress
      );

      const claimTxHash = await signAndSendTransaction(signer, tx);

      // Update vault status
      const updated = { ...vault, status: "spent" as const };
      setVault(updated);
      updateVault(updated);

      alert(`Claim transaction sent!\nTx Hash: ${claimTxHash}`);
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
    
    if (confirm(`Remove this vault from your local list?\nThe on-chain cell is not affected.`)) {
      deleteVault(vault.txHash, vault.index);
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
          <p className="opacity-80 mb-4">No InheritVault cell found at this transaction.</p>
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
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
      <div className="mb-6 md:mb-8">
        <Link to="/vaults" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">
          ← Back to Vaults
        </Link>
      </div>

      {/* On-chain verification badge */}
      {verified && (
        <div className="flex items-center gap-2 mb-4 bg-green-900 bg-opacity-20 border border-green-700 rounded-lg px-4 py-2">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
          <span className="text-green-400 text-sm font-semibold">
            ✓ Verified on-chain — this vault's data is read directly from the CKB blockchain
          </span>
        </div>
      )}

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
          {/* Owner / Creator info */}
          {(vault.ownerName || vault.ownerAddress) && (
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <div className="text-xs md:text-sm opacity-70 mb-2">Created By</div>
              {vault.ownerName && (
                <div className="text-lg font-semibold mb-1">{vault.ownerName}</div>
              )}
              {vault.ownerAddress && (
                <div className="font-mono text-xs md:text-sm break-all opacity-80">
                  {vault.ownerAddress}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs md:text-sm opacity-70 mb-2">Beneficiary Address</div>
            <div className="font-mono text-xs md:text-sm break-all">
              {vault.beneficiaryAddress || "(read from cell lock script)"}
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
