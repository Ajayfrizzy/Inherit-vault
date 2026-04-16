import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { loadVaults, addVault, updateVault } from "../lib/storage";
import { fetchVaultFromTransaction } from "../lib/vaultIndexer";
import { getTipHeader } from "../lib/ckb";
import { isUnlockConditionSatisfied } from "../lib/ccc";
import { sendVaultClaimableEmail } from "../lib/email";
import { DEFAULT_NETWORK } from "../config";
import {
  describeUnlock,
  formatAddress,
  formatDateTime,
  formatUnlock,
} from "../lib/display";
import type { VaultRecord } from "../types";

type VaultFilter = "all" | "ready" | "live" | "pending" | "spent";
type VaultSort = "recent" | "unlock" | "amount";

function getStatusCopy(
  vault: VaultRecord,
  currentBlockHeight: number,
  currentTimestamp: number
) {
  const isReady =
    vault.status === "live" &&
    isUnlockConditionSatisfied(vault.unlock, currentBlockHeight, currentTimestamp);

  if (isReady) {
    return {
      label: "Ready to claim",
      className: "status-banner-success",
    };
  }

  if (vault.status === "pending") {
    return {
      label: "Pending confirmation",
      className: "status-banner-warning",
    };
  }

  if (vault.status === "spent") {
    return {
      label: "Spent",
      className: "status-banner-danger",
    };
  }

  return {
    label: "Live",
    className: "status-banner-neutral",
  };
}

export default function VaultListPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [importHash, setImportHash] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<VaultFilter>("all");
  const [sortBy, setSortBy] = useState<VaultSort>("recent");
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(
    Math.floor(Date.now() / 1000)
  );

  useEffect(() => {
    const refs = loadVaults();
    setVaults(refs);

    let cancelled = false;

    (async () => {
      const updated = [...refs];
      let changed = false;

      for (let index = 0; index < updated.length; index += 1) {
        const vault = updated[index];
        if (vault.status === "pending" || vault.status === "live") {
          try {
            const result = await fetchVaultFromTransaction(
              vault.network,
              vault.txHash,
              vault.index
            );
            if (result) {
              const newStatus =
                result.isLive
                  ? "live"
                  : result.txStatus === "committed"
                    ? "spent"
                    : result.txStatus === "pending" || result.txStatus === "proposed"
                      ? "pending"
                      : vault.status;

              const merged: VaultRecord = {
                ...vault,
                createdAt: result.blockTimestamp
                  ? new Date(result.blockTimestamp * 1000).toISOString()
                  : vault.createdAt,
                beneficiaryAddress: result.beneficiaryAddress || vault.beneficiaryAddress,
                amountCKB: result.capacityCKB,
                unlock: result.data.unlock,
                memo: result.data.memo,
                ownerAddress: result.data.ownerAddress,
                ownerName: result.data.ownerName,
                format: result.format,
                authenticity: result.authenticity,
                status: newStatus,
              };

              updated[index] = merged;
              updateVault(merged);
              changed = true;
            }
          } catch {
            // Keep cached state if refresh fails.
          }
        }
      }

      if (changed && !cancelled) {
        setVaults(updated);
      }

      try {
        const tip = await getTipHeader(DEFAULT_NETWORK);
        if (!cancelled) {
          setCurrentBlockHeight(tip.blockNumber);
          setCurrentTimestamp(tip.timestamp);
        }

        for (const vault of updated) {
          if (
            vault.beneficiaryEmail &&
            !vault.claimableEmailSent &&
            vault.status === "live" &&
            isUnlockConditionSatisfied(vault.unlock, tip.blockNumber, tip.timestamp)
          ) {
            sendVaultClaimableEmail({
              toEmail: vault.beneficiaryEmail,
              ownerName: vault.ownerName,
              amountCKB: vault.amountCKB,
              unlock: vault.unlock,
              txHash: vault.txHash,
              index: vault.index,
              network: vault.network,
            }).then((sent) => {
              if (sent && !cancelled) {
                const nextVault = { ...vault, claimableEmailSent: true };
                updateVault(nextVault);
                setVaults((previous) =>
                  previous.map((item) =>
                    item.txHash === vault.txHash && item.index === vault.index
                      ? nextVault
                      : item
                  )
                );
              }
            });
          }
        }
      } catch {
        // Claimable email checks are best effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isReady = (vault: VaultRecord) =>
    vault.status === "live" &&
    isUnlockConditionSatisfied(vault.unlock, currentBlockHeight, currentTimestamp);

  const readyCount = vaults.filter(isReady).length;
  const liveCount = vaults.filter((vault) => vault.status === "live").length;
  const pendingCount = vaults.filter((vault) => vault.status === "pending").length;
  const spentCount = vaults.filter((vault) => vault.status === "spent").length;

  const visibleVaults = [...vaults]
    .filter((vault) => {
      if (filter === "all") return true;
      if (filter === "ready") return isReady(vault);
      return vault.status === filter;
    })
    .sort((left, right) => {
      if (sortBy === "amount") {
        return parseFloat(right.amountCKB) - parseFloat(left.amountCKB);
      }
      if (sortBy === "unlock") {
        return left.unlock.value - right.unlock.value;
      }
      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });

  const handleImport = async () => {
    setImportError("");
    const hash = importHash.trim();

    if (!hash || !hash.startsWith("0x") || hash.length !== 66) {
      setImportError("Enter a valid 0x-prefixed transaction hash (66 characters).");
      return;
    }

    if (vaults.some((vault) => vault.txHash === hash)) {
      setImportError("This vault is already in your list.");
      return;
    }

    setImporting(true);
    try {
      const result = await fetchVaultFromTransaction(DEFAULT_NETWORK, hash, 0);
      if (!result) {
        setImportError("No compatible vault record was found at output index 0.");
        return;
      }

      const record: VaultRecord = {
        txHash: hash,
        index: 0,
        network: DEFAULT_NETWORK,
        createdAt: result.blockTimestamp
          ? new Date(result.blockTimestamp * 1000).toISOString()
          : new Date().toISOString(),
        beneficiaryAddress: result.beneficiaryAddress,
        amountCKB: result.capacityCKB,
        unlock: result.data.unlock,
        memo: result.data.memo,
        ownerAddress: result.data.ownerAddress,
        ownerName: result.data.ownerName,
        format: result.format,
        authenticity: result.authenticity,
        status: result.isLive ? "live" : "spent",
      };

      addVault(record);
      setVaults((previous) => [record, ...previous]);
      setImportHash("");
    } catch (err: any) {
      setImportError(err.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="mb-6">
        <Link to="/" className="inline-link">
          {"<- Back to Home"}
        </Link>
      </div>

      <section className="panel-strong">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-eyebrow">Owner dashboard</div>
            <h1 className="page-title mt-4">Track every saved vault in one place.</h1>
            <p className="page-subtitle mt-4">
              Review how much is locked, who it is for, whether the record is
              still pending or live, and when the unlock window is approaching.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/create" className="button-primary">
              Create New Vault
            </Link>
            <Link to="/beneficiary" className="button-secondary">
              Open Beneficiary View
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Saved vaults
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
              Live
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {liveCount}
            </div>
          </div>

          <div className="metric-card">
            <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
              Pending / spent
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {pendingCount + spentCount}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-eyebrow">Browse</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Filter by what matters right now
            </h2>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["ready", "Ready"],
                  ["live", "Live"],
                  ["pending", "Pending"],
                  ["spent", "Spent"],
                ] as Array<[VaultFilter, string]>
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

            <div className="flex items-center gap-3">
              <label className="text-sm text-[#9dbfb7]" htmlFor="vault-sort">
                Sort by
              </label>
              <select
                id="vault-sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as VaultSort)}
                className="input-base !w-auto !py-2"
              >
                <option value="recent">Most recent</option>
                <option value="unlock">Unlock soonest</option>
                <option value="amount">Highest amount</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {vaults.length === 0 ? (
        <section className="mt-6 panel text-center">
          <h2 className="text-2xl font-semibold text-white">
            No saved vaults yet
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#9dbfb7]">
            Once you create or re-import a vault, it will appear here with its
            status, unlock timing, and beneficiary summary.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/create" className="button-primary">
              Create Your First Vault
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          {visibleVaults.map((vault) => {
            const status = getStatusCopy(
              vault,
              currentBlockHeight,
              currentTimestamp
            );

            return (
              <Link
                key={`${vault.txHash}-${vault.index}`}
                to={`/vault/${vault.txHash}/${vault.index}`}
                className="block"
              >
                <article className="panel card-hover">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="section-eyebrow">Vault summary</div>
                      <h2 className="mt-3 text-3xl font-semibold text-white">
                        {vault.amountCKB} CKB
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-[#d7f6ef]">
                        {vault.memo || "No note was added to this vault."}
                      </p>
                    </div>

                    <div
                      className={`status-banner !py-2 !text-sm ${status.className}`}
                    >
                      {status.label}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="metric-card">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                        Beneficiary
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">
                        {vault.beneficiaryAddress
                          ? formatAddress(vault.beneficiaryAddress, 14, 10)
                          : "Unavailable"}
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                        Unlock
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">
                        {formatUnlock(vault.unlock)}
                      </div>
                      <div className="field-hint">
                        {describeUnlock(
                          vault.unlock,
                          currentBlockHeight,
                          currentTimestamp
                        )}
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                        Created
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">
                        {formatDateTime(vault.createdAt)}
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                        Format
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">
                        {vault.format === "scripted"
                          ? "Authenticated scripted"
                          : "Legacy compatibility"}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </section>
      )}

      <details className="disclosure mt-6">
        <summary className="disclosure-summary">
          <div>
            <div className="font-semibold text-white">Advanced tools</div>
            <div className="disclosure-copy">
              Re-import a vault from its transaction hash if your local list is
              missing.
            </div>
          </div>
          <span className="text-sm font-semibold text-[#83e8d4]">Open</span>
        </summary>

        <div className="border-t border-white/10 px-6 py-6">
          <div className="max-w-3xl">
            <label className="field-label">Transaction Hash</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={importHash}
                onChange={(event) => setImportHash(event.target.value)}
                placeholder="0x..."
                className="input-base flex-1"
              />
              <button
                onClick={handleImport}
                disabled={importing}
                className="button-primary whitespace-nowrap"
              >
                {importing ? "Importing..." : "Import Vault"}
              </button>
            </div>
            <div className="field-hint">
              This checks output index 0 first and restores the vault into your
              local list when it finds a matching record.
            </div>

            {importError && (
              <div className="status-banner status-banner-danger mt-4">
                {importError}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
