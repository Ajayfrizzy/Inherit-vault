// ─────────────────────────────────────────────────────────────────────────────
// InheritVault – Beneficiary Dashboard
//
// Allows a beneficiary to:
//   • See all live vault cells created for them (queried on-chain)
//   • Verify each vault's authenticity (on-chain proof)
//   • Navigate to vault detail / claim page
//   • Verify any vault by entering a transaction hash
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { DEFAULT_NETWORK, NETWORK_CONFIGS } from "../config";
import { getLockScriptForIndexer } from "../lib/ccc";
import {
  fetchVaultsForLockScript,
  verifyVault,
  type OnChainVault,
  type VaultFromTx,
} from "../lib/vaultIndexer";

export default function BeneficiaryPage() {
  const { wallet, open } = ccc.useCcc();
  const signer = ccc.useSigner();

  const [vaults, setVaults] = useState<OnChainVault[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");

  // ── Verify section state ──────────────────────────────────────────────
  const [verifyTxHash, setVerifyTxHash] = useState("");
  const [verifyIndex, setVerifyIndex] = useState("0");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VaultFromTx | null>(null);
  const [verifyError, setVerifyError] = useState("");

  // ── Fetch beneficiary's vaults from chain ─────────────────────────────
  useEffect(() => {
    if (!signer) return;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const addr = await signer.getRecommendedAddress();
        setAddress(addr);

        const lockScript = await getLockScriptForIndexer(addr, signer);
        const results = await fetchVaultsForLockScript(
          DEFAULT_NETWORK,
          lockScript
        );
        setVaults(results);
      } catch (err: any) {
        console.error("Failed to fetch beneficiary vaults:", err);
        setError(err.message || "Failed to query vaults from chain");
      } finally {
        setLoading(false);
      }
    })();
  }, [signer]);

  // ── Verify a vault by txHash ──────────────────────────────────────────
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
          "No InheritVault cell found at this transaction hash and index. " +
          "The vault may not exist or the transaction hash is incorrect."
        );
      } else {
        setVerifyResult(result);
      }
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const formatUnlock = (vault: OnChainVault | VaultFromTx) => {
    const { type, value } = vault.data.unlock;
    if (type === "blockHeight") {
      return `Block ${value.toLocaleString()}`;
    }
    return new Date(value * 1000).toLocaleString();
  };

  const explorerTxUrl = (txHash: string) =>
    `${NETWORK_CONFIGS[DEFAULT_NETWORK].explorerTxUrl}${txHash}`;

  // ── Not connected ─────────────────────────────────────────────────────
  if (!wallet) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
        <div className="mb-6">
          <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
        </div>
        <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
          Beneficiary Dashboard
        </h1>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
          <p className="opacity-80 mb-4">
            Connect your wallet to see vaults created for you.
          </p>
          <button
            onClick={open}
            className="bg-gray-800 hover:bg-gray-700 text-[#00d4aa] font-semibold px-6 py-3 rounded-lg border border-[#00d4aa] transition-colors"
          >
            Connect Wallet
          </button>
        </div>

        {/* Verify section available even without wallet */}
        {renderVerifySection()}
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
      <div className="mb-6">
        <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
      </div>
      <h1 className="text-2xl md:text-4xl font-bold mb-2">
        Beneficiary Dashboard
      </h1>
      <p className="text-sm opacity-70 mb-6 md:mb-8 break-all">
        Connected: {address.slice(0, 16)}...{address.slice(-8)}
      </p>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-500 bg-opacity-10 border border-red-500 rounded-lg p-4 mb-6 text-white text-sm">
          {error}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center mb-8">
          <div className="spinner mb-4" />
          <p className="opacity-70">Scanning the chain for your vaults…</p>
        </div>
      )}

      {/* ── Vault list ────────────────────────────────────────────────── */}
      {!loading && vaults.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center mb-8">
          <p className="opacity-70">
            No vaults found for your address on{" "}
            <span className="capitalize">{DEFAULT_NETWORK}</span>.
          </p>
          <p className="text-sm opacity-50 mt-2">
            If someone created a vault for you, it may take a few minutes to
            appear after the transaction is confirmed.
          </p>
        </div>
      )}

      {!loading && vaults.length > 0 && (
        <>
          <h2 className="text-xl md:text-2xl font-semibold mb-4">
            Your Vaults ({vaults.length})
          </h2>
          <div className="space-y-4 mb-8">
            {vaults.map((v) => (
              <Link
                key={`${v.outPoint.txHash}-${v.outPoint.index}`}
                to={`/vault/${v.outPoint.txHash}/${v.outPoint.index}`}
                className="block"
              >
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 hover:border-[#00d4aa] transition-all">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl md:text-2xl font-semibold mb-1">
                        {v.capacityCKB} CKB
                      </h3>
                      {v.data.memo && (
                        <p className="text-sm opacity-70">{v.data.memo}</p>
                      )}
                    </div>
                    <span className="text-xs md:text-sm text-green-500 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      On-Chain Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="opacity-70 mb-1">From</div>
                      <div className="font-semibold">
                        {v.data.ownerName || "Unknown"}
                      </div>
                      <div className="font-mono text-xs opacity-60 break-all">
                        {v.data.ownerAddress.slice(0, 12)}...
                        {v.data.ownerAddress.slice(-6)}
                      </div>
                    </div>
                    <div>
                      <div className="opacity-70 mb-1">Unlocks</div>
                      <div>{formatUnlock(v)}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ── Verify section ────────────────────────────────────────────── */}
      {renderVerifySection()}
    </div>
  );

  // ── Verify sub-component ──────────────────────────────────────────────
  function renderVerifySection() {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mt-4">
        <h2 className="text-xl md:text-2xl font-semibold mb-2">
          🔍 Verify a Vault
        </h2>
        <p className="text-sm opacity-70 mb-4">
          Received a notification about a vault? Enter the transaction hash to
          verify it's real and on-chain.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Transaction Hash
            </label>
            <input
              type="text"
              value={verifyTxHash}
              onChange={(e) => setVerifyTxHash(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-[#00d4aa] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Output Index (usually 0)
            </label>
            <input
              type="number"
              value={verifyIndex}
              onChange={(e) => setVerifyIndex(e.target.value)}
              min={0}
              className="w-32 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-[#00d4aa] transition-colors"
            />
          </div>
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Verify Vault"}
          </button>
        </div>

        {/* Verify error */}
        {verifyError && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 rounded-lg p-4 mt-4 text-white text-sm">
            ⚠️ {verifyError}
          </div>
        )}

        {/* Verify result */}
        {verifyResult && (
          <div className="mt-4 border border-green-600 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
              <span className="text-green-400 font-semibold">
                ✓ Vault Verified On-Chain
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="opacity-70">Amount: </span>
                <span className="font-semibold">
                  {verifyResult.capacityCKB} CKB
                </span>
              </div>
              <div>
                <span className="opacity-70">From: </span>
                <span className="font-semibold">
                  {verifyResult.data.ownerName || "Unknown"}{" "}
                </span>
                <span className="font-mono text-xs opacity-60 break-all">
                  ({verifyResult.data.ownerAddress.slice(0, 12)}...
                  {verifyResult.data.ownerAddress.slice(-6)})
                </span>
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
                <span className="opacity-70">Tx Status: </span>
                <span className="capitalize">{verifyResult.txStatus}</span>
              </div>
              <div>
                <span className="opacity-70">Cell: </span>
                <span>
                  {verifyResult.isLive ? (
                    <span className="text-green-400">Live (unclaimed)</span>
                  ) : (
                    <span className="text-red-400">
                      Spent (already claimed)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={explorerTxUrl(verifyResult.outPoint.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00d4aa] hover:underline text-sm"
                >
                  View on Explorer ↗
                </a>
                <Link
                  to={`/vault/${verifyResult.outPoint.txHash}/${verifyResult.outPoint.index}`}
                  className="text-[#00d4aa] hover:underline text-sm"
                >
                  View Details →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
