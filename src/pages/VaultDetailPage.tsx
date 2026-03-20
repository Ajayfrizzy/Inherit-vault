import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { getVaultByOutPoint, updateVault, deleteVault } from "../lib/storage";
import { getTipHeader } from "../lib/ckb";
import {
  buildClaimVaultTransaction,
  signAndSendTransaction,
  isUnlockConditionSatisfied,
} from "../lib/ccc";
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

  useEffect(() => {
    if (!txHash) return;

    (async () => {
      try {
        const cached = getVaultByOutPoint(txHash, vaultIndex);
        if (cached) setVault(cached);

        const chainResult = await fetchVaultFromTransaction(network, txHash, vaultIndex);

        if (chainResult) {
          setOnChainData(chainResult);
          setVerified(true);

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
            beneficiaryAddress:
              chainResult.beneficiaryAddress || cached?.beneficiaryAddress || "",
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

          if (cached) updateVault(record);
        } else if (!cached) {
          setVault(null);
        }

        const tip = await getTipHeader(network);
        setCurrentBlockHeight(tip.blockNumber);
        setCurrentTimestamp(tip.timestamp);

        const unlock: UnlockCondition =
          chainResult?.data.unlock || cached?.unlock || { type: "blockHeight", value: 0 };
        setIsUnlocked(isUnlockConditionSatisfied(unlock, tip.blockNumber, tip.timestamp));
      } catch (err) {
        console.error("Failed to load vault:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [txHash, vaultIndex, network]);

  useEffect(() => {
    if (!vault || !signer) {
      setCanClaim(false);
      return;
    }

    (async () => {
      try {
        const userAddress = await signer.getRecommendedAddress();
        const isBeneficiary =
          !!vault.beneficiaryAddress &&
          userAddress.toLowerCase() === vault.beneficiaryAddress.toLowerCase();
        const isLive = onChainData?.isLive ?? vault.status === "live";
        setCanClaim(isBeneficiary && isUnlocked && isLive);
      } catch {
        setCanClaim(false);
      }
    })();
  }, [vault, signer, isUnlocked, onChainData]);

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

      const updated = { ...vault, status: "spent" as const };
      setVault(updated);
      setCanClaim(false);
      setOnChainData((prev) =>
        prev
          ? {
              ...prev,
              isLive: false,
              txStatus: "committed",
            }
          : prev
      );
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

    if (confirm("Remove this vault from your local list?\nThe on-chain cell is not affected.")) {
      deleteVault(vault.txHash, vault.index);
      navigate("/vaults");
    }
  };

  const formatUnlock = () => {
    if (!vault) return "";
    return vault.unlock.type === "blockHeight"
      ? `Block ${vault.unlock.value.toLocaleString()}`
      : new Date(vault.unlock.value * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="spinner" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
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
  const statusTone =
    vault.status === "spent"
      ? "border-red-500/40 bg-red-500/10 text-red-300"
      : vault.status === "pending"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";

  const unlockTone = isUnlocked ? "text-emerald-300" : "text-yellow-200";

  let actionTitle = "Claim Status";
  let actionBody = "Connect the beneficiary wallet to claim when the vault is unlocked.";

  if (vault.status === "spent") {
    actionTitle = "Vault Resolved";
    actionBody = "This vault has already been claimed or otherwise spent on-chain.";
  } else if (canClaim) {
    actionTitle = "Ready To Claim";
    actionBody = "The beneficiary wallet is connected, the unlock condition is satisfied, and the vault is still live on-chain.";
  } else if (!wallet) {
    actionTitle = "Connect Beneficiary Wallet";
    actionBody = "Connect the beneficiary wallet address to unlock the claim action.";
  } else if (!isUnlocked) {
    actionTitle = "Still Locked";
    actionBody = "The vault is verified, but the unlock condition has not been met yet.";
  } else {
    actionTitle = "Wrong Wallet";
    actionBody = "The connected wallet does not match the beneficiary address recorded in this vault.";
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 text-[#d9fff8]">
      <div className="mb-6">
        <Link to="/vaults" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">
          {"<- Back to Vaults"}
        </Link>
      </div>

      {verified && (
        <div className="flex items-center gap-2 mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-200">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-sm font-semibold">
            Verified on-chain - this vault&apos;s data is being read directly from the CKB blockchain.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-800/90 p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-[#7debd6] opacity-80">Vault Detail</p>
              <h1 className="mt-2 text-3xl md:text-5xl font-semibold text-[#00f0c8]">
                {vault.amountCKB} CKB
              </h1>
              <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-300">
                A beneficiary-facing summary of who created this vault, who can claim it, and whether the funds are available right now.
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${statusTone}`}>
              {vault.status === "live" ? "Live" : vault.status === "pending" ? "Pending" : "Spent"}
            </span>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Created By</div>
              <div className="mt-3 text-xl font-semibold text-white">
                {vault.ownerName || "Unknown"}
              </div>
              {vault.ownerAddress && (
                <div className="mt-2 break-all font-mono text-xs text-slate-400">
                  {vault.ownerAddress}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Beneficiary</div>
              <div className="mt-3 break-all font-mono text-sm text-white">
                {vault.beneficiaryAddress || "Unavailable"}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Only this address should be able to submit the claim transaction.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Unlock Condition</div>
              <div className="mt-3 text-base font-semibold text-white">{formatUnlock()}</div>
              <div className={`mt-2 text-sm font-medium ${unlockTone}`}>
                {isUnlocked ? "Unlocked and eligible for claim flow" : "Still waiting for unlock"}
              </div>
            </div>
          </div>

          {(vault.memo || vault.txHash) && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Memo</div>
                <div className="mt-3 text-sm md:text-base text-slate-200">
                  {vault.memo || "No memo was attached to this vault."}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Transaction Hash</div>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block break-all font-mono text-xs text-[#7debd6] hover:underline"
                >
                  {vault.txHash}
                </a>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-slate-700 bg-slate-900/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Claim Panel</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">{actionTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{actionBody}</p>

            <div className="mt-6 flex flex-col gap-3">
              {canClaim && vault.status === "live" && (
                <button
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#00d4aa] px-5 py-3 font-semibold text-black transition-colors hover:bg-[#22e4bd] disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming && <span className="spinner-inline" aria-hidden="true" />}
                  <span>{claiming ? "Submitting Claim..." : "Claim Vault"}</span>
                </button>
              )}

              {!canClaim && vault.status === "live" && (
                <button
                  className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-300 opacity-80"
                  disabled
                >
                  {!wallet
                    ? "Connect Wallet to Claim"
                    : !isUnlocked
                      ? "Not Yet Unlocked"
                      : "Not Beneficiary"}
                </button>
              )}

              {vault.status === "spent" && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-medium text-red-200">
                  This vault has been claimed or spent.
                </div>
              )}

              <button
                className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
                onClick={handleDelete}
              >
                Delete Record
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Network</div>
              <div className="mt-2 text-base font-semibold text-white capitalize">{vault.network}</div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Created</div>
              <div className="mt-2 text-base font-semibold text-white">
                {new Date(vault.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current Block</div>
              <div className="mt-2 text-base font-semibold text-white">
                {currentBlockHeight.toLocaleString()}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current Time</div>
              <div className="mt-2 text-base font-semibold text-white">
                {new Date(currentTimestamp * 1000).toLocaleString()}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
