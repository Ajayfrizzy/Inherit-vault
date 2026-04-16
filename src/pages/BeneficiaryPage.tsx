import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import CopyButton from "../components/CopyButton";
import {
  DEFAULT_NETWORK,
  NETWORK_CONFIGS,
  isVaultScriptsReady,
} from "../config";
import { getTipHeader } from "../lib/ckb";
import { getScriptedVaultLockForIndexer, isUnlockConditionSatisfied } from "../lib/ccc";
import { getHiddenVaults, hideVault, unhideVault } from "../lib/storage";
import {
  fetchVaultsForLockScript,
  verifyVault,
  type OnChainVault,
  type VaultFromTx,
} from "../lib/vaultIndexer";
import {
  describeUnlock,
  formatAddress,
  formatUnlock,
} from "../lib/display";

type BeneficiaryFilter = "all" | "ready" | "locked";

function explorerTxUrl(txHash: string) {
  return `${NETWORK_CONFIGS[DEFAULT_NETWORK].explorerTxUrl}${txHash}`;
}

function vaultKey(vault: OnChainVault) {
  return `${vault.outPoint.txHash}:${vault.outPoint.index}`;
}

export default function BeneficiaryPage() {
  const { wallet, open } = ccc.useCcc();
  const signer = ccc.useSigner();
  const scriptsReady = isVaultScriptsReady(DEFAULT_NETWORK);

  const [vaults, setVaults] = useState<OnChainVault[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(getHiddenVaults());
  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilter] = useState<BeneficiaryFilter>("all");
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(
    Math.floor(Date.now() / 1000)
  );

  const [verifyTxHash, setVerifyTxHash] = useState("");
  const [verifyIndex, setVerifyIndex] = useState("0");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VaultFromTx | null>(null);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    if (!signer || !scriptsReady) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const [nextAddress, tip] = await Promise.all([
          signer.getRecommendedAddress(),
          getTipHeader(DEFAULT_NETWORK),
        ]);

        if (cancelled) return;

        setAddress(nextAddress);
        setCurrentBlockHeight(tip.blockNumber);
        setCurrentTimestamp(tip.timestamp);

        const scriptedLock = await getScriptedVaultLockForIndexer(
          nextAddress,
          signer,
          DEFAULT_NETWORK
        );

        const results = await fetchVaultsForLockScript(DEFAULT_NETWORK, scriptedLock);
        if (!cancelled) {
          setVaults(results);
        }
      } catch (err: any) {
        console.error("Failed to fetch beneficiary vaults:", err);
        if (!cancelled) {
          setError(err.message || "Failed to query vaults from chain.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer, scriptsReady]);

  const handleVerify = async () => {
    setVerifyError("");
    setVerifyResult(null);

    const hash = verifyTxHash.trim();
    if (!hash || !hash.startsWith("0x") || hash.length !== 66) {
      setVerifyError("Please enter a valid 0x-prefixed transaction hash.");
      return;
    }

    setVerifying(true);
    try {
      const result = await verifyVault(
        DEFAULT_NETWORK,
        hash,
        parseInt(verifyIndex || "0", 10)
      );
      if (!result) {
        setVerifyError("No compatible vault was found at that hash and output index.");
      } else {
        setVerifyResult(result);
      }
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const isReady = (vault: OnChainVault) =>
    isUnlockConditionSatisfied(
      vault.data.unlock,
      currentBlockHeight,
      currentTimestamp
    );

  const readyCount = vaults.filter(isReady).length;
  const hiddenCount = vaults.filter((vault) => hiddenKeys.has(vaultKey(vault))).length;
  const filteredVaults = vaults.filter((vault) => {
    if (filter === "all") return true;
    if (filter === "ready") return isReady(vault);
    return !isReady(vault);
  });
  const visibleVaults = filteredVaults.filter(
    (vault) => showHidden || !hiddenKeys.has(vaultKey(vault))
  );

  const handleHide = (vault: OnChainVault, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    hideVault(vault.outPoint.txHash, vault.outPoint.index);
    setHiddenKeys(new Set(getHiddenVaults()));
  };

  const handleUnhide = (vault: OnChainVault, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    unhideVault(vault.outPoint.txHash, vault.outPoint.index);
    setHiddenKeys(new Set(getHiddenVaults()));
  };

  const renderVerifySection = () => (
    <details className="disclosure mt-6">
      <summary className="disclosure-summary">
        <div>
          <div className="font-semibold text-white">Advanced tools</div>
          <div className="disclosure-copy">
            Verify a vault directly from its transaction hash and output index.
          </div>
        </div>
        <span className="text-sm font-semibold text-[#83e8d4]">Open</span>
      </summary>

      <div className="border-t border-white/10 px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="field-label">Transaction Hash</label>
            <input
              type="text"
              value={verifyTxHash}
              onChange={(event) => setVerifyTxHash(event.target.value)}
              placeholder="0x..."
              className="input-base"
            />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row lg:items-end">
            <div>
              <label className="field-label">Output Index</label>
              <input
                type="number"
                value={verifyIndex}
                onChange={(event) => setVerifyIndex(event.target.value)}
                min={0}
                className="input-base w-full sm:w-32"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={verifying}
              className="button-primary"
            >
              {verifying ? "Verifying..." : "Verify Vault"}
            </button>
          </div>
        </div>

        {verifyError && (
          <div className="status-banner status-banner-danger mt-4">
            {verifyError}
          </div>
        )}

        {verifyResult && (
          <div className="panel mt-6 !p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="section-eyebrow">Verification result</div>
                <h3 className="mt-3 text-2xl font-semibold text-white">
                  {verifyResult.capacityCKB} CKB
                </h3>
              </div>

              <div
                className={`status-banner !py-2 !text-sm ${
                  verifyResult.isAuthentic
                    ? "status-banner-success"
                    : "status-banner-warning"
                }`}
              >
                {verifyResult.isAuthentic
                  ? "Authenticated scripted vault"
                  : "Legacy compatibility record"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Created by
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {verifyResult.data.ownerName || "Unknown"}
                </div>
                <div className="field-hint mono-text break-all">
                  {verifyResult.data.ownerAddress || "Unavailable"}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Beneficiary
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {verifyResult.beneficiaryAddress || "Unavailable"}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Unlock
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {formatUnlock(verifyResult.data.unlock)}
                </div>
              </div>

              <div className="metric-card">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Cell status
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {verifyResult.isLive ? "Live" : "Spent"}
                </div>
              </div>
            </div>

            {verifyResult.data.memo && (
              <div className="metric-card mt-4">
                <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                  Memo
                </div>
                <div className="mt-3 text-sm leading-7 text-[#d7f6ef]">
                  {verifyResult.data.memo}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href={explorerTxUrl(verifyResult.outPoint.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="button-secondary"
              >
                View on Explorer
              </a>
              <Link
                to={`/vault/${verifyResult.outPoint.txHash}/${verifyResult.outPoint.index}`}
                className="button-secondary"
              >
                Open Detail View
              </Link>
            </div>
          </div>
        )}
      </div>
    </details>
  );

  if (!wallet) {
    return (
      <div className="page-shell">
        <div className="mb-6">
          <Link to="/" className="inline-link">
            {"<- Back to Home"}
          </Link>
        </div>

        <section className="panel-strong max-w-4xl">
          <div className="section-eyebrow">Beneficiary dashboard</div>
          <h1 className="page-title mt-4">
            Connect the beneficiary wallet to check incoming vaults.
          </h1>
          <p className="page-subtitle mt-4">
            Once connected, this view scans for vaults created for your address
            and highlights which ones are already claimable.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button onClick={open} className="button-primary">
              Connect Wallet
            </button>
            <Link to="/vaults" className="button-secondary">
              Review Owner View
            </Link>
          </div>
        </section>

        {renderVerifySection()}
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

      <section className="panel-strong">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <div className="section-eyebrow">Beneficiary dashboard</div>
            <h1 className="page-title mt-4">
              See what has been prepared for this wallet.
            </h1>
            <p className="page-subtitle mt-4">
              This view focuses on what you can act on: who created the vault,
              how much is there, and whether it is still locked or ready to
              claim.
            </p>
          </div>

          <div className="panel-muted !p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Connected address
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="address-pill mono-text">
                {address ? formatAddress(address, 14, 10) : "Loading..."}
              </span>
              <CopyButton value={address} label="Copy address" />
            </div>
            {address && (
              <div className="field-hint mono-text break-all">{address}</div>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Found vaults
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {vaults.length}
            </div>
          </div>

          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Ready now
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {readyCount}
            </div>
          </div>

          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Still locked
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {vaults.length - readyCount}
            </div>
          </div>

          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Dismissed
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {hiddenCount}
            </div>
          </div>
        </div>
      </section>

      {!scriptsReady && (
        <div className="status-banner status-banner-warning mt-6">
          Vault discovery is not available right now, but the advanced tools
          below can still verify a vault by transaction hash.
        </div>
      )}

      {error && (
        <div className="status-banner status-banner-danger mt-6">{error}</div>
      )}

      {loading && (
        <section className="panel mt-6 text-center">
          <div className="spinner mb-4" />
          <p className="text-sm text-[#9dbfb7]">
            Scanning the chain for vaults created for your address...
          </p>
        </section>
      )}

      {!loading && scriptsReady && (
        <>
          <section className="panel mt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="section-eyebrow">Browse</div>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Focus on what is claimable first
                </h2>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "All"],
                      ["ready", "Ready"],
                      ["locked", "Locked"],
                    ] as Array<[BeneficiaryFilter, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`${
                        filter === value
                          ? "button-chip button-chip-active"
                          : "button-chip"
                      }`}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => setShowHidden((value) => !value)}
                  >
                    {showHidden
                      ? "Hide dismissed"
                      : `Show ${hiddenCount} dismissed`}
                  </button>
                )}
              </div>
            </div>
          </section>

          {vaults.length === 0 ? (
            <section className="panel mt-6 text-center">
              <h2 className="text-2xl font-semibold text-white">
                No vaults found for this wallet yet
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#9dbfb7]">
                If someone just created one for you, give the transaction a bit
                of time to confirm before checking again.
              </p>
            </section>
          ) : visibleVaults.length === 0 ? (
            <section className="panel mt-6 text-center">
              <h2 className="text-2xl font-semibold text-white">
                No vaults match the current view
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#9dbfb7]">
                Try switching between ready, locked, or dismissed vaults to see
                the rest of your results.
              </p>
            </section>
          ) : (
            <section className="mt-6 space-y-4">
              {visibleVaults.map((vault) => {
                const ready = isReady(vault);
                const dismissed = hiddenKeys.has(vaultKey(vault));

                return (
                  <Link
                    key={`${vault.outPoint.txHash}-${vault.outPoint.index}`}
                    to={`/vault/${vault.outPoint.txHash}/${vault.outPoint.index}`}
                    className="block"
                  >
                    <article
                      className={`panel card-hover ${
                        dismissed ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="section-eyebrow">Vault for you</div>
                          <h2 className="mt-3 text-3xl font-semibold text-white">
                            {vault.capacityCKB} CKB
                          </h2>
                          {vault.data.memo && (
                            <p className="mt-3 text-sm leading-7 text-[#d7f6ef]">
                              {vault.data.memo}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div
                            className={`status-banner !py-2 !text-sm ${
                              ready
                                ? "status-banner-success"
                                : "status-banner-warning"
                            }`}
                          >
                            {ready ? "Claim now" : "Still locked"}
                          </div>

                          {dismissed ? (
                            <button
                              onClick={(event) => handleUnhide(vault, event)}
                              className="button-ghost !px-3 !py-1.5"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={(event) => handleHide(vault, event)}
                              className="button-ghost !px-3 !py-1.5"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="metric-card">
                          <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                            Created by
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">
                            {vault.data.ownerName || "Unknown"}
                          </div>
                          <div className="field-hint mono-text break-all">
                            {vault.data.ownerAddress || "Unavailable"}
                          </div>
                        </div>

                        <div className="metric-card">
                          <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                            Unlock
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">
                            {formatUnlock(vault.data.unlock)}
                          </div>
                          <div className="field-hint">
                            {describeUnlock(
                              vault.data.unlock,
                              currentBlockHeight,
                              currentTimestamp
                            )}
                          </div>
                        </div>

                        <div className="metric-card">
                          <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                            Transaction
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">
                            {formatAddress(vault.outPoint.txHash, 12, 8)}
                          </div>
                        </div>

                        <div className="metric-card">
                          <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                            Record type
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">
                            Authenticated scripted vault
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </section>
          )}
        </>
      )}

      {renderVerifySection()}
    </div>
  );
}
