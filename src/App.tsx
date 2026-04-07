import { Routes, Route, Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useState } from "react";
import HomePage from "./pages/HomePage";
import CreateVaultPage from "./pages/CreateVaultPage";
import VaultListPage from "./pages/VaultListPage";
import VaultDetailPage from "./pages/VaultDetailPage";
import BeneficiaryPage from "./pages/BeneficiaryPage";

export default function App() {
  const { open, wallet, disconnect } = ccc.useCcc();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-700 px-4 py-4 md:px-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-[#00d4aa] md:text-2xl">
            InheritVault
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <nav className="flex gap-6 text-[#00d4aa]">
              <Link to="/create" className="transition-colors hover:text-white">
                Create Vault
              </Link>
              <Link to="/vaults" className="transition-colors hover:text-white">
                My Vaults
              </Link>
              <Link to="/beneficiary" className="transition-colors hover:text-white">
                Beneficiary
              </Link>
            </nav>

            {wallet ? (
              <div className="flex items-center gap-4">
                <div className="text-sm text-[#00d4aa]/80">{wallet.name}</div>
                <button
                  className="rounded-lg border border-[#00d4aa] bg-gray-800 px-4 py-2 text-sm text-[#00d4aa] transition-colors hover:bg-gray-700"
                  onClick={open}
                >
                  Change
                </button>
                <button
                  className="rounded-lg border border-[#00d4aa] bg-gray-800 px-4 py-2 text-sm text-[#00d4aa] transition-colors hover:bg-gray-700"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                className="rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-6 py-2.5 font-semibold text-black transition-colors hover:bg-[#22e4bd]"
                onClick={open}
              >
                Connect Wallet
              </button>
            )}
          </div>

          <button
            className="p-2 text-[#00d4aa] md:hidden"
            onClick={() => setMobileMenuOpen((openValue) => !openValue)}
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mt-4 border-t border-gray-700 pt-4 md:hidden">
            <nav className="mb-4 flex flex-col gap-4">
              <Link
                to="/create"
                className="text-[#00d4aa] transition-colors hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                Create Vault
              </Link>
              <Link
                to="/vaults"
                className="text-[#00d4aa] transition-colors hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Vaults
              </Link>
              <Link
                to="/beneficiary"
                className="text-[#00d4aa] transition-colors hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                Beneficiary Dashboard
              </Link>
            </nav>

            <div className="border-t border-gray-700 pt-4">
              {wallet ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm text-[#00d4aa]/80">{wallet.name}</div>
                  <button
                    className="w-full rounded-lg border border-[#00d4aa] bg-gray-800 px-4 py-2 text-sm text-[#00d4aa] transition-colors hover:bg-gray-700"
                    onClick={open}
                  >
                    Change
                  </button>
                  <button
                    className="w-full rounded-lg border border-[#00d4aa] bg-gray-800 px-4 py-2 text-sm text-[#00d4aa] transition-colors hover:bg-gray-700"
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="w-full rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-6 py-2.5 font-semibold text-black transition-colors hover:bg-[#22e4bd]"
                  onClick={open}
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateVaultPage />} />
          <Route path="/vaults" element={<VaultListPage />} />
          <Route path="/vault/:txHash/:index" element={<VaultDetailPage />} />
          <Route path="/beneficiary" element={<BeneficiaryPage />} />
        </Routes>
      </main>

      <footer className="border-t border-gray-700 px-4 py-6 text-center text-xs opacity-70 md:px-8 md:text-sm">
        <p>InheritVault - scripted inheritance vaults on Nervos CKB</p>
      </footer>
    </div>
  );
}
