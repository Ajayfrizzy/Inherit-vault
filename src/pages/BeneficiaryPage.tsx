import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { DEFAULT_NETWORK, NETWORK_CONFIGS, isVaultScriptsReady } from "../config";
import { getScriptedVaultLockForIndexer } from "../lib/ccc";
import { getHiddenVaults, hideVault, unhideVault } from "../lib/storage";
import {
  fetchVaultsForLockScript,
  verifyVault,
  type OnChainVault,
  type VaultFromTx,
} from "../lib/vaultIndexer";

function formatUnlock(vault: OnChainVault | VaultFromTx) {
  const { type, value } = vault.data.unlock;
  return type === "blockHeight"
    ? `Block ${value.toLocaleString()}`
    : new Date(value * 1000).toLocaleString();
}

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

  const [verifyTxHash, setVerifyTxHash] = useState("");
  const [verifyIndex, setVerifyIndex] = useState("0");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VaultFromTx | null>(null);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    if (!signer || !scriptsReady) return;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const nextAddress = await signer.getRecommendedAddress();
        setAddress(nextAddress);

        const scriptedLock = await getScriptedVaultLockForIndexer(
          nextAddress,
          signer,
          DEFAULT_NETWORK
        );

        const results = await fetchVaultsForLockScript(DEFAULT_NETWORK, scriptedLock);
        setVaults(results);
      } catch (err: any) {
        console.error("Failed to fetch beneficiary vaults:", err);
        setError(err.message || "Failed to query scripted vaults from chain.");
      } finally {
        setLoading(false);
      }
    })();
  }, [signer, scriptsReady]);

  const handleVerify = async () => {
    setVerifyError("");
    setVerifyResult(null);

    const hash = verifyTxHash.trim();
    if (!hash || !hash.startsWith("0x") || hash.length !== 66) {
      setVerifyError("Please enter a valid 0x-prefixed transaction hash (66 characters).");
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
        setVerifyError(
          "No InheritVault-compatible cell was found at that transaction hash and output index."
        );
      } else {
        setVerifyResult(result);
      }
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const visibleVaults = showHidden
    ? vaults
    : vaults.filter((vault) => !hiddenKeys.has(vaultKey(vault)));

  const hiddenCount = vaults.filter((vault) => hiddenKeys.has(vaultKey(vault))).length;

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
    <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800 p-4 md:p-6">
      <h2 className="mb-2 text-xl font-semibold md:text-2xl">Verify a Vault</h2>
      <p className="mb-4 text-sm opacity-70">
        Enter a transaction hash and output index to inspect a vault cell
        directly from the chain. Scripted vaults will be marked as
        owner-authenticated; legacy records will be shown in compatibility
        mode.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Transaction Hash</label>
          <input
            type="text"
            value={verifyTxHash}
            onChange={(e) => setVerifyTxHash(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Output Index (usually 0)
          </label>
          <input
            type="number"
            value={verifyIndex}
            onChange={(e) => setVerifyIndex(e.target.value)}
            min={0}
            className="w-32 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-[#00d4aa] focus:outline-none"
          />
        </div>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="rounded-lg bg-[#00d4aa] px-6 py-2 font-semibold text-black transition-colors hover:bg-[#22e4bd] disabled:opacity-50"
        >
          {verifying ? "Verifying..." : "Verify Vault"}
        </button>
      </div>

      {verifyError && (
        <div className="mt-4 rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-white">
          {verifyError}
        </div>
      )}

      {verifyResult && (
        <div className="mt-4 rounded-lg border border-gray-700 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                verifyResult.isAuthentic
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
              }`}
            >
              {verifyResult.isAuthentic ? "Authenticated Scripted Vault" : "Legacy Compatibility Record"}
            </span>
            <span className="text-xs text-slate-400 capitalize">
              {verifyResult.txStatus}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="opacity-70">Amount: </span>
              <span className="font-semibold">{verifyResult.capacityCKB} CKB</span>
            </div>
            <div>
              <span className="opacity-70">From: </span>
              <span className="font-semibold">{verifyResult.data.ownerName || "Unknown"}</span>{" "}
              <span className="break-all font-mono text-xs opacity-60">
                ({verifyResult.data.ownerAddress})
              </span>
            </div>
            <div>
              <span className="opacity-70">Beneficiary: </span>
              <span className="break-all font-mono">{verifyResult.beneficiaryAddress || "Unavailable"}</span>
            </div>
            <div>
              <span className="opacity-70">Unlocks: </span>
              <span>{formatUnlock(verifyResult)}</span>
            </div>
            {verifyResult.data.memo && (
              <div>
                <span className="opacity-70">Memo: </span>
                <span>{verifyResult.data.memo}</span>
              </div>
            )}
            <div>
              <span className="opacity-70">Cell: </span>
              {verifyResult.isLive ? (
                <span className="text-emerald-300">Live</span>
              ) : (
                <span className="text-red-300">Spent</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={explorerTxUrl(verifyResult.outPoint.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00d4aa] hover:underline"
              >
                View on Explorer
              </a>
              <Link
                to={`/vault/${verifyResult.outPoint.txHash}/${verifyResult.outPoint.index}`}
                className="text-[#00d4aa] hover:underline"
              >
                View Details
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!wallet) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-[#00d4aa] md:px-6 md:py-12">
        <div className="mb-6">
          <Link to="/" className="text-sm text-[#00d4aa] transition-colors hover:text-white md:text-base">
            {"<- Back to Home"}
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold md:mb-8 md:text-4xl">
          Beneficiary Dashboard
        </h1>
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6 text-center">
          <p className="mb-4 opacity-80">
            Connect your wallet to see scripted vaults created for you.
          </p>
          <button
            onClick={open}
            className="rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#22e4bd]"
          >
            Connect Wallet
          </button>
        </div>

        {renderVerifySection()}
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

      <h1 className="mb-2 text-2xl font-bold md:text-4xl">Beneficiary Dashboard</h1>
      <p className="mb-6 break-all text-sm opacity-70 md:mb-8">
        Connected: {address ? `${address.slice(0, 18)}...${address.slice(-8)}` : "Loading..."}
      </p>

      {!scriptsReady && (
        <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100 md:text-base">
          Scripted vault discovery is disabled until the deployed vault lock and
          type script metadata are configured in src/config.ts. You can still use
          the verification section below to inspect old and new vault records by
          transaction hash.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-white">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-8 rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
          <div className="spinner mb-4" />
          <p className="opacity-70">Scanning the chain for your scripted vaults...</p>
        </div>
      )}

      {!loading && scriptsReady && vaults.length === 0 && (
        <div className="mb-8 rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
          <p className="opacity-70">
            No scripted vaults were found for your address on{" "}
            <span className="capitalize">{DEFAULT_NETWORK}</span>.
          </p>
          <p className="mt-2 text-sm opacity-50">
            If someone recently created one for you, it may take a short time to
            appear after the transaction is confirmed.
          </p>
        </div>
      )}

      {!loading && vaults.length > 0 && (
        <>
          <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="text-xl font-semibold md:text-2xl">
              Your Scripted Vaults ({visibleVaults.length})
            </h2>
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden((value) => !value)}
                className="text-xs text-[#00d4aa] opacity-70 transition-opacity hover:opacity-100"
              >
                {showHidden ? "Hide dismissed" : `Show ${hiddenCount} dismissed`}
              </button>
            )}
          </div>

          <div className="mb-8 space-y-4">
            {visibleVaults.map((vault) => {
              const isHidden = hiddenKeys.has(vaultKey(vault));

              return (
                <Link
                  key={`${vault.outPoint.txHash}-${vault.outPoint.index}`}
                  to={`/vault/${vault.outPoint.txHash}/${vault.outPoint.index}`}
                  className="block"
                >
                  <div
                    className={`rounded-lg border p-4 transition-all md:p-6 ${
                      isHidden
                        ? "border-gray-600 bg-gray-800 opacity-50"
                        : "border-gray-700 bg-gray-800 hover:border-[#00d4aa]"
                    }`}
                  >
                    <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row">
                      <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold md:text-2xl">
                            {vault.capacityCKB} CKB
                          </h3>
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                            Authenticated Scripted Vault
                          </span>
                        </div>
                        {vault.data.memo && (
                          <p className="text-sm opacity-70">{vault.data.memo}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {isHidden ? (
                          <button
                            onClick={(event) => handleUnhide(vault, event)}
                            className="text-xs text-[#00d4aa] opacity-70 hover:underline hover:opacity-100"
                            title="Restore this vault"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={(event) => handleHide(vault, event)}
                            className="text-xs text-gray-500 transition-colors hover:text-red-400"
                            title="Dismiss this vault"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <div className="mb-1 opacity-70">From</div>
                        <div className="font-semibold">{vault.data.ownerName || "Unknown"}</div>
                        <div className="break-all font-mono text-xs opacity-60">
                          {vault.data.ownerAddress}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 opacity-70">Unlocks</div>
                        <div>{formatUnlock(vault)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {renderVerifySection()}
    </div>
  );
}
