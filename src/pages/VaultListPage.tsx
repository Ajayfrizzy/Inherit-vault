import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { loadVaults, addVault, updateVault } from "../lib/storage";
import { fetchVaultFromTransaction } from "../lib/vaultIndexer";
import { getTipHeader } from "../lib/ckb";
import { isUnlockConditionSatisfied } from "../lib/ccc";
import { sendVaultClaimableEmail } from "../lib/email";
import { DEFAULT_NETWORK } from "../config";
import type { VaultRecord } from "../types";

function formatUnlock(vault: VaultRecord) {
  return vault.unlock.type === "blockHeight"
    ? `Block ${vault.unlock.value.toLocaleString()}`
    : new Date(vault.unlock.value * 1000).toLocaleString();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatBadge(vault: VaultRecord) {
  return vault.authenticity === "verified"
    ? {
        label: "Authenticated Scripted",
        className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      }
    : {
        label: "Legacy Compatibility",
        className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
      };
}

export default function VaultListPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [importHash, setImportHash] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const refs = loadVaults();
    setVaults(refs);

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
              changed = true;
            }
          } catch {
            // Keep cached state if the refresh fails.
          }
        }
      }

      if (changed) {
        setVaults(updated);
      }

      try {
        const tip = await getTipHeader(DEFAULT_NETWORK);
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
              if (sent) {
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
  }, []);

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
      const result = await fetchVaultFromTransaction("testnet", hash, 0);
      if (!result) {
        setImportError("No InheritVault-compatible cell was found at index 0.");
        return;
      }

      const record: VaultRecord = {
        txHash: hash,
        index: 0,
        network: "testnet",
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
    <div className="mx-auto max-w-4xl px-4 py-6 text-[#d9fff8] md:px-6 md:py-12">
      <div className="mb-6">
        <Link to="/" className="text-sm text-[#00d4aa] transition-colors hover:text-white md:text-base">
          {"<- Back to Home"}
        </Link>
      </div>

      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:mb-8 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold md:text-4xl">My Vaults ({vaults.length})</h1>
        <Link to="/create">
          <button className="rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#22e4bd]">
            Create New Vault
          </button>
        </Link>
      </div>

      {vaults.length === 0 && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
          <p className="mb-4 opacity-70">
            No vaults found.{" "}
            <Link to="/create" className="text-[#00d4aa] hover:underline">
              Create your first vault
            </Link>
          </p>
        </div>
      )}

      {vaults.length > 0 && (
        <div className="space-y-4">
          {vaults.map((vault) => {
            const badge = formatBadge(vault);

            return (
              <Link
                key={`${vault.txHash}-${vault.index}`}
                to={`/vault/${vault.txHash}/${vault.index}`}
                className="block"
              >
                <div
                  className={`rounded-lg border bg-gray-800 p-4 transition-all md:p-6 ${
                    vault.status === "live"
                      ? "border-emerald-500/40 hover:border-emerald-400"
                      : "border-gray-700 hover:border-[#00d4aa]"
                  }`}
                >
                  <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold md:text-2xl">
                          {vault.amountCKB} CKB
                        </h3>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      {vault.memo && (
                        <div className="text-sm opacity-70">{vault.memo}</div>
                      )}
                    </div>
                    <div>
                      {vault.status === "pending" && (
                        <span className="inline-block whitespace-nowrap text-xs text-yellow-300 md:text-sm">
                          Pending
                        </span>
                      )}
                      {vault.status === "live" && (
                        <span className="inline-block whitespace-nowrap text-xs text-emerald-300 md:text-sm">
                          Live
                        </span>
                      )}
                      {vault.status === "spent" && (
                        <span className="inline-block whitespace-nowrap text-xs text-red-300 md:text-sm">
                          Spent
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 md:text-base">
                    <div>
                      <div className="mb-1 opacity-70">Beneficiary</div>
                      <div className="break-all font-mono text-xs md:text-sm">
                        {vault.beneficiaryAddress
                          ? `${vault.beneficiaryAddress.slice(0, 16)}...${vault.beneficiaryAddress.slice(-8)}`
                          : "Unavailable"}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 opacity-70">Unlock</div>
                      <div>{formatUnlock(vault)}</div>
                    </div>
                    <div>
                      <div className="mb-1 opacity-70">Network</div>
                      <div className="capitalize">{vault.network}</div>
                    </div>
                    <div>
                      <div className="mb-1 opacity-70">Created</div>
                      <div>{formatDate(vault.createdAt)}</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-gray-700 bg-gray-800 p-4 md:p-6">
        <h2 className="mb-2 text-lg font-semibold md:text-xl">Import Vault</h2>
        <p className="mb-4 text-sm opacity-70">
          Lost your local vault list? Enter a transaction hash to re-import a
          vault you created. Scripted vaults will be marked as authenticated;
          legacy vaults will be preserved in compatibility mode.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={importHash}
            onChange={(e) => setImportHash(e.target.value)}
            placeholder="0x..."
            className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="whitespace-nowrap rounded-lg bg-[#00d4aa] px-6 py-2 font-semibold text-black transition-colors hover:bg-[#22e4bd] disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import"}
          </button>
        </div>
        {importError && (
          <div className="mt-3 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-white">
            {importError}
          </div>
        )}
      </div>
    </div>
  );
}
