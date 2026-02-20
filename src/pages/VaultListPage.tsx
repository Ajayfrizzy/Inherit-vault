import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { loadVaults } from "../lib/storage";
import type { VaultRecord } from "../types";

export default function VaultListPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);

  useEffect(() => {
    setVaults(loadVaults());
  }, []);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  const formatUnlock = (vault: VaultRecord) => {
    if (vault.unlock.type === "blockHeight") {
      return `Block ${vault.unlock.value.toLocaleString()}`;
    } else {
      return new Date(vault.unlock.value * 1000).toLocaleString();
    }
  };

  if (vaults.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
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
            key={vault.id}
            to={`/vault/${vault.id}`}
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
                    {vault.beneficiaryAddress.slice(0, 10)}...{vault.beneficiaryAddress.slice(-8)}
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
    </div>
  );
}
