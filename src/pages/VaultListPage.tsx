import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { loadVaults, addVault } from "../lib/storage";
import { fetchVaultFromTransaction } from "../lib/vaultIndexer";
import type { VaultRecord } from "../types";

export default function VaultListPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [importHash, setImportHash] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const refs = loadVaults();
    setVaults(refs);

    // Refresh on-chain status in the background for committed vaults
    (async () => {
      const updated = [...refs];
      let changed = false;
      for (let i = 0; i < updated.length; i++) {
        const v = updated[i];
        if (v.status === "pending" || v.status === "live") {
          try {
            const result = await fetchVaultFromTransaction(
              v.network,
              v.txHash,
              v.index
            );
            if (result) {
              const newStatus = result.isLive
                ? "live"
                : result.txStatus === "committed"
                ? "spent"
                : result.txStatus === "pending" || result.txStatus === "proposed"
                ? "pending"
                : v.status;
              if (newStatus && newStatus !== v.status) {
                updated[i] = { ...v, status: newStatus as VaultRecord["status"] };
                changed = true;
              }
            }
          } catch {
            // keep cached status
          }
        }
      }
      if (changed) setVaults(updated);
    })();
  }, []);

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  const formatUnlock = (vault: VaultRecord) => {
    if (vault.unlock.type === "blockHeight") {
      return `Block ${vault.unlock.value.toLocaleString()}`;
    }
    return new Date(vault.unlock.value * 1000).toLocaleString();
  };

  // ── Import vault by tx hash ───────────────────────────────────────────
  const handleImport = async () => {
    setImportError("");
    const hash = importHash.trim();
    if (!hash || !hash.startsWith("0x") || hash.length !== 66) {
      setImportError("Enter a valid 0x-prefixed transaction hash (66 chars).");
      return;
    }
    // Check if already imported
    if (vaults.some((v) => v.txHash === hash)) {
      setImportError("This vault is already in your list.");
      return;
    }
    setImporting(true);
    try {
      const result = await fetchVaultFromTransaction("testnet", hash, 0);
      if (!result) {
        setImportError("No InheritVault cell found at this transaction (index 0).");
        return;
      }
      const record: VaultRecord = {
        txHash: hash,
        index: 0,
        network: "testnet",
        createdAt: new Date().toISOString(),
        beneficiaryAddress: "", // will be resolved from chain
        amountCKB: result.capacityCKB,
        unlock: result.data.unlock,
        memo: result.data.memo,
        ownerAddress: result.data.ownerAddress,
        ownerName: result.data.ownerName,
        status: result.isLive ? "live" : "spent",
      };
      addVault(record);
      setVaults((prev) => [record, ...prev]);
      setImportHash("");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (vaults.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="mb-6">
          <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
        </div>
        <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">My Vaults</h1>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="opacity-70 mb-4">
            No vaults found. <Link to="/create" className="text-primary hover:underline">Create your first vault</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
      <div className="mb-6">
        <Link to="/" className="text-sm md:text-base text-[#00d4aa] hover:underline transition-colors">← Back to Home</Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold">My Vaults ({vaults.length})</h1>
        <Link to="/create">
          <button className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-black font-semibold px-6 py-3 rounded-lg transition-colors">
            Create New Vault
          </button>
        </Link>
      </div>

      <div className="space-y-4">
        {vaults.map((vault) => (
          <Link
            key={`${vault.txHash}-${vault.index}`}
            to={`/vault/${vault.txHash}/${vault.index}`}
            className="block"
          >
            <div
              className={`bg-gray-800 border rounded-lg p-4 md:p-6 cursor-pointer transition-all hover:border-primary ${
                vault.status === "live" ? "border-green-500" : "border-gray-700"
              }`}
            >
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">
                    {vault.amountCKB} CKB
                  </h3>
                  {vault.memo && (
                    <div className="text-sm opacity-70">
                      {vault.memo}
                    </div>
                  )}
                </div>
                <div>
                  {vault.status === "pending" && (
                    <span className="inline-block text-xs md:text-sm text-yellow-500 whitespace-nowrap">⏳ Pending</span>
                  )}
                  {vault.status === "live" && (
                    <span className="inline-block text-xs md:text-sm text-green-500 whitespace-nowrap">✓ Live</span>
                  )}
                  {vault.status === "spent" && (
                    <span className="inline-block text-xs md:text-sm text-red-500 whitespace-nowrap">✗ Spent</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm md:text-base">
                <div>
                  <div className="opacity-70 mb-1">Beneficiary</div>
                  <div className="font-mono text-xs md:text-sm break-all">
                    {vault.beneficiaryAddress
                      ? `${vault.beneficiaryAddress.slice(0, 10)}...${vault.beneficiaryAddress.slice(-8)}`
                      : "On-chain"}
                  </div>
                </div>
                <div>
                  <div className="opacity-70 mb-1">Unlock</div>
                  <div>{formatUnlock(vault)}</div>
                </div>
                <div>
                  <div className="opacity-70 mb-1">Network</div>
                  <div className="capitalize">{vault.network}</div>
                </div>
                <div>
                  <div className="opacity-70 mb-1">Created</div>
                  <div>{formatDate(vault.createdAt)}</div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Import vault by tx hash */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mt-8">
        <h2 className="text-lg md:text-xl font-semibold mb-2">Import Vault</h2>
        <p className="text-sm opacity-70 mb-4">
          Lost your vault list? Enter a transaction hash to re-import a vault you created.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={importHash}
            onChange={(e) => setImportHash(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-[#00d4aa] transition-colors"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {importError && (
          <div className="text-red-400 text-sm mt-2">{importError}</div>
        )}
      </div>
    </div>
  );
}
