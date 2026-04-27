import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import CopyButton from "../components/CopyButton";
import { getVaultByOutPoint, updateVault, deleteVault } from "../lib/storage";
import { getTipHeader } from "../lib/ckb";
import {
  buildClaimVaultTransaction,
  signAndSendTransaction,
  isUnlockConditionSatisfied,
} from "../lib/ccc";
import {
  fetchVaultFromTransaction,
  getVaultRecordStatus,
  type VaultFromTx,
} from "../lib/vaultIndexer";
import { TIMESTAMP_CLAIM_BUFFER_SECONDS } from "../config";
import { sendVaultClaimableEmail } from "../lib/email";
import {
  describeUnlock,
  formatAddress,
  formatDateTime,
  formatUnlock,
} from "../lib/display";
import type { VaultRecord, UnlockCondition } from "../types";
import {
  getActiveNetwork,
  getExplorerTransactionUrl,
  parseNetwork,
} from "../lib/network";

function formatBadge(vault: VaultRecord) {
  return vault.authenticity === "verified"
    ? {
        label: "Authenticated scripted vault",
        className: "status-banner-success",
      }
    : {
        label: "Legacy compatibility record",
        className: "status-banner-warning",
      };
}

export default function VaultDetailPage() {
  const { txHash, index: indexParam } = useParams<{ txHash: string; index: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { wallet, open, disconnect, client } = ccc.useCcc();
  const signer = ccc.useSigner();

  const vaultIndex = parseInt(indexParam || "0", 10);
  const cachedVault = txHash ? getVaultByOutPoint(txHash, vaultIndex) : undefined;
  const network =
    parseNetwork(searchParams.get("network")) ??
    cachedVault?.network ??
    getActiveNetwork(signer?.client ?? client);

  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [onChainData, setOnChainData] = useState<VaultFromTx | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [successTxHash, setSuccessTxHash] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState("");

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    (async () => {
      if (!cancelled) {
        setRefreshing(true);
      }
      try {
        const cached = getVaultByOutPoint(txHash, vaultIndex);
        if (cached && !cancelled) setVault(cached);

        const chainResult = await fetchVaultFromTransaction(network, txHash, vaultIndex);

        if (chainResult) {
          const newStatus = getVaultRecordStatus(
            chainResult.txStatus,
            chainResult.liveCellStatus,
            cached?.status
          );

          const record: VaultRecord = {
            txHash,
            index: vaultIndex,
            network,
            createdAt: chainResult.blockTimestamp
              ? new Date(chainResult.blockTimestamp * 1000).toISOString()
              : cached?.createdAt || new Date().toISOString(),
            beneficiaryAddress:
              chainResult.beneficiaryAddress || cached?.beneficiaryAddress || "",
            amountCKB: chainResult.capacityCKB,
            unlock: chainResult.data.unlock,
            memo: chainResult.data.memo,
            ownerAddress: chainResult.data.ownerAddress,
            ownerName: chainResult.data.ownerName,
            beneficiaryEmail: cached?.beneficiaryEmail,
            claimableEmailSent: cached?.claimableEmailSent,
            format: chainResult.format,
            authenticity: chainResult.authenticity,
            status: newStatus,
          };

          if (!cancelled) {
            setOnChainData(chainResult);
            setVault(record);
          }

          if (cached) {
            updateVault(record);
          }
        } else if (!cached && !cancelled) {
          setVault(null);
        }

        const tip = await getTipHeader(network);
        const unlock: UnlockCondition =
          chainResult?.data.unlock || cached?.unlock || { type: "blockHeight", value: 0 };

        if (!cancelled) {
          setCurrentBlockHeight(tip.blockNumber);
          setCurrentTimestamp(tip.timestamp);
          setIsUnlocked(
            isUnlockConditionSatisfied(unlock, tip.blockNumber, tip.timestamp)
          );
        }
      } catch (err) {
        console.error("Failed to load vault:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [txHash, vaultIndex, network, refreshNonce]);

  useEffect(() => {
    if (!vault || !signer) {
      setCanClaim(false);
      setConnectedAddress("");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const userAddress = await signer.getRecommendedAddress();
        const isBeneficiary =
          !!vault.beneficiaryAddress &&
          userAddress.toLowerCase() === vault.beneficiaryAddress.toLowerCase();
        const isLive =
          onChainData?.liveCellStatus === "live" || vault.status === "live";

        if (!cancelled) {
          setConnectedAddress(userAddress);
          setCanClaim(isBeneficiary && isUnlocked && isLive);
        }
      } catch {
        if (!cancelled) {
          setConnectedAddress("");
          setCanClaim(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vault, signer, isUnlocked, onChainData]);

  useEffect(() => {
    if (
      !vault ||
      !isUnlocked ||
      vault.status !== "live" ||
      !vault.beneficiaryEmail ||
      vault.claimableEmailSent
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
      setError("This vault is still locked. Please wait for the unlock condition.");
      return;
    }

    setClaiming(true);
    setError("");
    setSuccessTxHash("");

    try {
      const result = await buildClaimVaultTransaction(
        signer,
        { txHash: vault.txHash, index: vault.index },
        vault.unlock,
        vault.beneficiaryAddress,
        vault.network,
        vault.format ?? "legacy"
      );

      const claimTxHash = await signAndSendTransaction(
        signer,
        result.tx,
        result.requiresSignature,
        vault.network
      );
      setCanClaim(false);
      setSuccessTxHash(claimTxHash);
    } catch (err: any) {
      console.error("Failed to claim vault:", err);

      let errorMessage = "Failed to claim vault.";

      if (err.message?.includes("Immature")) {
        if (vault.unlock.type === "blockHeight") {
          errorMessage = `The vault is still locked. Current block: ${currentBlockHeight.toLocaleString()}, target block: ${vault.unlock.value.toLocaleString()}.`;
        } else {
          const requiredTime = new Date(vault.unlock.value * 1000).toLocaleString();
          const currentTime = new Date(currentTimestamp * 1000).toLocaleString();
          errorMessage = `The chain still considers this vault locked. Current chain time: ${currentTime}. Unlock time: ${requiredTime}. Timestamp claims can need about ${TIMESTAMP_CLAIM_BUFFER_SECONDS / 60} extra minute(s).`;
        }
      } else if (
        err.message?.includes("error code -21") ||
        err.message?.includes("SinceMetricMismatch")
      ) {
        errorMessage =
          "The chain has not fully caught up to the unlock time yet. Wait a little longer, refresh the page, and try again.";
      } else if (err.message?.includes("not found")) {
        errorMessage =
          "Vault cell not found on-chain. It may already have been claimed or spent.";
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
    deleteVault(vault.txHash, vault.index);
    navigate("/vaults");
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div className="panel text-center">
          <div className="spinner mb-4" />
          <p className="text-sm text-[#9dbfb7]">Loading vault details...</p>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="page-shell">
        <section className="panel max-w-3xl">
          <h2 className="text-2xl font-semibold text-white">Vault not found</h2>
          <p className="mt-3 text-sm leading-7 text-[#9dbfb7]">
            No compatible vault record was found at this transaction output.
          </p>
          <div className="mt-6">
            <Link to="/vaults" className="button-primary">
              View Saved Vaults
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const explorerUrl = getExplorerTransactionUrl(vault.network, vault.txHash);
  const badge = formatBadge(vault);
  const claimSubmissionPending = !!successTxHash && vault.status === "live";
  const liveCellStatus = onChainData?.liveCellStatus;
  const isLive =
    liveCellStatus != null ? liveCellStatus === "live" : vault.status === "live";
  const beneficiaryMatches =
    !!connectedAddress &&
    !!vault.beneficiaryAddress &&
    connectedAddress.toLowerCase() === vault.beneficiaryAddress.toLowerCase();
  const unlockDescription = describeUnlock(
    vault.unlock,
    currentBlockHeight,
    currentTimestamp
  );
  const currentStatus =
    vault.status === "spent"
      ? {
          title: "Vault resolved",
          body: "This vault has already been claimed or otherwise spent on-chain.",
          tone: "status-banner-danger",
        }
      : vault.status === "pending"
        ? {
            title: "Awaiting confirmation",
            body: "This vault has been submitted, but the claim panel will stay unavailable until the chain confirms it as live.",
            tone: "status-banner-warning",
          }
      : claimSubmissionPending
        ? {
            title: "Claim submitted",
            body: "The claim transaction has been broadcast. Refresh this page after confirmation to see the vault marked as spent.",
            tone: "status-banner-warning",
          }
      : vault.status === "unknown"
        ? {
            title: "Status unavailable",
            body: "The vault transaction was found, but the live/spent state could not be confirmed from the chain right now.",
            tone: "status-banner-warning",
          }
      : canClaim
        ? {
            title: "Ready to claim",
            body: "The beneficiary wallet is connected, the unlock condition is satisfied, and the claim flow is ready.",
            tone: "status-banner-success",
          }
        : !wallet
          ? {
              title: "Connect beneficiary wallet",
              body: "Connect the wallet that matches the beneficiary address to unlock the claim action.",
              tone: "status-banner-warning",
            }
          : !isUnlocked
            ? {
                title: "Still locked",
                body: "The vault is live, but the unlock condition has not been reached yet.",
                tone: "status-banner-warning",
              }
            : {
                title: "Wrong wallet connected",
                body: "The connected wallet does not match the beneficiary recorded in this vault.",
                tone: "status-banner-warning",
              };
  const claimChecks = [
    {
      label: "Vault is still live on-chain",
      met: isLive,
      detail:
        liveCellStatus === "unknown" || vault.status === "unknown"
          ? "Chain state is temporarily unavailable."
          : isLive
            ? "Cell is unspent."
            : "Cell has already been spent.",
    },
    {
      label: "Unlock condition is satisfied",
      met: isUnlocked,
      detail: unlockDescription,
    },
    {
      label: "Connected wallet matches the beneficiary",
      met: beneficiaryMatches,
      detail: beneficiaryMatches
        ? "Beneficiary wallet detected."
        : wallet
          ? "A different wallet is currently connected."
          : "Connect the beneficiary wallet to continue.",
    },
  ];
  const timelineItems = [
    {
      step: "Created",
      detail: formatDateTime(vault.createdAt),
      state: "Recorded",
    },
    {
      step: "Unlock window",
      detail: formatUnlock(vault.unlock),
      state: unlockDescription,
    },
    {
      step: "Claim status",
      detail:
        vault.status === "spent"
          ? "Funds have already moved."
          : claimSubmissionPending
            ? "Claim transaction submitted."
          : vault.status === "unknown"
            ? "Waiting on a reliable chain refresh."
          : canClaim
            ? "Ready for claim submission."
            : "Waiting for the final requirements.",
      state:
        vault.status === "spent"
          ? "Complete"
          : claimSubmissionPending
            ? "Awaiting confirmation"
          : vault.status === "unknown"
            ? "Unavailable"
          : canClaim
            ? "Ready"
            : "In progress",
    },
  ];

  return (
    <div className="page-shell">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/vaults" className="inline-link">
          {"<- Back to Vaults"}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="button-ghost"
            onClick={() => setRefreshNonce((value) => value + 1)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-secondary"
          >
            View on Explorer
          </a>
        </div>
      </div>

      <section className="panel-strong">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="section-eyebrow">Vault detail</div>
            <h1 className="mt-4 text-4xl font-semibold text-white md:text-5xl">
              {vault.amountCKB} CKB
            </h1>
            <p className="page-subtitle mt-4">
              Review who created this vault, who it is for, when it unlocks, and
              whether the current wallet can claim it right now.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className={`status-banner ${badge.className}`}>{badge.label}</div>
            <div
              className={`status-banner ${
                vault.status === "spent"
                  ? "status-banner-danger"
                  : vault.status === "pending"
                    ? "status-banner-warning"
                    : vault.status === "unknown"
                      ? "status-banner-warning"
                    : "status-banner-neutral"
              }`}
            >
              {vault.status === "live"
                ? "Live"
                : vault.status === "pending"
                  ? "Pending"
                  : vault.status === "unknown"
                    ? "Unknown"
                    : "Spent"}
            </div>
          </div>
        </div>
      </section>

      {successTxHash && (
        <div className="status-banner status-banner-success mt-6">
          Claim transaction sent successfully.{" "}
          <a
            href={getExplorerTransactionUrl(vault.network, successTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            View transaction
          </a>
        </div>
      )}

      {error && (
        <div className="status-banner status-banner-danger mt-6">{error}</div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="panel">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Created by
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {vault.ownerName || "Unknown"}
                </div>
                {vault.ownerAddress ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="address-pill mono-text">
                        {formatAddress(vault.ownerAddress, 14, 10)}
                      </span>
                      <CopyButton value={vault.ownerAddress} label="Copy address" />
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-[#83e8d4]">
                        Show full address
                      </summary>
                      <div className="field-hint mono-text break-all">
                        {vault.ownerAddress}
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="field-hint">Owner address unavailable.</div>
                )}
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Beneficiary
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {vault.beneficiaryAddress
                    ? formatAddress(vault.beneficiaryAddress, 14, 10)
                    : "Unavailable"}
                </div>
                {vault.beneficiaryAddress && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <CopyButton value={vault.beneficiaryAddress} label="Copy address" />
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-[#83e8d4]">
                        Show full address
                      </summary>
                      <div className="field-hint mono-text break-all">
                        {vault.beneficiaryAddress}
                      </div>
                    </details>
                  </>
                )}
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Unlock
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {formatUnlock(vault.unlock)}
                </div>
                <div className="field-hint">{unlockDescription}</div>
                {vault.unlock.type === "blockHeight" && currentBlockHeight > 0 && (
                  <div className="field-hint">
                    Current block: {currentBlockHeight.toLocaleString()}
                  </div>
                )}
                {vault.unlock.type === "timestamp" && currentTimestamp > 0 && (
                  <div className="field-hint">
                    Current chain time: {formatDateTime(currentTimestamp)}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-eyebrow">Vault timeline</div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {timelineItems.map((item) => (
                <div key={item.step} className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    {item.step}
                  </div>
                  <div className="mt-3 text-base font-semibold text-white">
                    {item.detail}
                  </div>
                  <div className="field-hint">{item.state}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Memo
                </div>
                <div className="mt-3 text-sm leading-7 text-[#d7f6ef]">
                  {vault.memo || "No memo was added to this vault."}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Transaction hash
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="address-pill mono-text">
                    {formatAddress(vault.txHash, 14, 10)}
                  </span>
                  <CopyButton value={vault.txHash} label="Copy hash" />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-[#83e8d4]">
                    Show full hash
                  </summary>
                  <div className="field-hint mono-text break-all">{vault.txHash}</div>
                </details>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel">
            <div className="section-eyebrow">Claim panel</div>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              {currentStatus.title}
            </h2>
            <p className="field-hint mt-3">{currentStatus.body}</p>

            <div className="mt-6 space-y-3">
              {claimChecks.map((check) => (
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

            <div className="mt-6 flex flex-col gap-3">
              {!wallet && vault.status === "live" && (
                <button className="button-primary" onClick={open}>
                  Connect Beneficiary Wallet
                </button>
              )}

              {wallet && !beneficiaryMatches && vault.status === "live" && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="button-secondary" onClick={open}>
                    Switch Wallet
                  </button>
                  <button className="button-ghost" onClick={() => disconnect()}>
                    Disconnect Current Wallet
                  </button>
                </div>
              )}

              {canClaim && vault.status === "live" && !claimSubmissionPending && (
                <button
                  className="button-primary"
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming && <span className="spinner-inline" aria-hidden="true" />}
                  <span>{claiming ? "Submitting claim..." : "Claim Vault"}</span>
                </button>
              )}

              {claimSubmissionPending && vault.status === "live" && (
                <button className="button-secondary" disabled>
                  Claim Submitted - Awaiting Confirmation
                </button>
              )}

              {!canClaim &&
                wallet &&
                vault.status === "live" &&
                !claimSubmissionPending && (
                <button className="button-secondary" disabled>
                  {!isUnlocked
                    ? "Vault Is Still Locked"
                    : "Beneficiary Wallet Required"}
                </button>
              )}

              {vault.status === "spent" && (
                <div className="status-banner status-banner-danger">
                  This vault has already been claimed or spent.
                </div>
              )}

              {vault.unlock.type === "timestamp" && vault.status === "live" && (
                <div className="status-banner status-banner-warning">
                  Timestamp-based claims can require about{" "}
                  {TIMESTAMP_CLAIM_BUFFER_SECONDS / 60} extra minute(s) after the
                  displayed unlock time.
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Network
                </div>
                <div className="mt-3 text-base font-semibold text-white capitalize">
                  {vault.network}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Created
                </div>
                <div className="mt-3 text-base font-semibold text-white">
                  {formatDateTime(vault.createdAt)}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Format
                </div>
                <div className="mt-3 text-base font-semibold text-white">
                  {vault.format === "scripted" ? "Scripted" : "Legacy"}
                </div>
              </div>
            </div>
          </section>

          <details className="disclosure">
            <summary className="disclosure-summary">
              <div>
                <div className="font-semibold text-white">Local record tools</div>
                <div className="disclosure-copy">
                  Remove this vault from your local list without changing the
                  on-chain record.
                </div>
              </div>
              <span className="text-sm font-semibold text-[#83e8d4]">Open</span>
            </summary>

            <div className="border-t border-white/10 px-6 py-6">
              <button
                className="button-ghost"
                onClick={() => setConfirmDelete((value) => !value)}
              >
                {confirmDelete ? "Cancel" : "Remove from this browser"}
              </button>

              {confirmDelete && (
                <div className="status-banner status-banner-warning mt-4">
                  This only removes the saved reference from this browser. The
                  on-chain vault will remain unchanged and can still be restored
                  later from its transaction details.
                  <div className="mt-4">
                    <button className="button-danger" onClick={handleDelete}>
                      Remove From This Browser
                    </button>
                  </div>
                </div>
              )}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
