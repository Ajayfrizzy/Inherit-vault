import { Routes, Route, Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useState } from "react";
import HomePage from "./pages/HomePage";
import CreateVaultPage from "./pages/CreateVaultPage";
import VaultListPage from "./pages/VaultListPage";
import VaultDetailPage from "./pages/VaultDetailPage";

export default function App() {
  const { open, wallet, disconnect } = ccc.useCcc();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-gray-700 px-4 md:px-8 py-4">
        {/* Desktop and Mobile Header Bar */}
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="text-xl md:text-2xl font-bold text-[#00d4aa]">
            🔐 InheritVault
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex gap-8 items-center">
            <nav className="flex gap-6 text-[#00d4aa]">
              <Link to="/create" className="hover:text-primary transition-colors hover:underline">
                Create Vault
              </Link>
              <Link to="/vaults" className="hover:text-primary transition-colors hover:underline">
                My Vaults
              </Link>
            </nav>

            <div>
              {wallet ? (
                <div className="flex gap-4 items-center">
                  <div className="text-sm opacity-80 text-[#00d4aa]">
                    {wallet.name}
                  </div>
                  <button 
                    className="bg-gray-800 hover:bg-gray-700 text-[#00d4aa] px-4 py-2 rounded-lg border border-[#00d4aa] transition-colors text-sm"
                    onClick={open}
                  >
                    Change
                  </button>
                  <button 
                    className="bg-gray-800 hover:bg-gray-700 text-[#00d4aa] px-4 py-2 rounded-lg border border-[#00d4aa] transition-colors text-sm"
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button 
                  className="bg-primary hover:bg-primary-hover text-[#00d4aa] font-semibold px-6 py-2.5 rounded-lg transition-colors border border-[#00d4aa] cursor-pointer"
                  onClick={open}
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>

          {/* Mobile Hamburger Button */}
          <button 
            className="md:hidden text-[#00d4aa] p-2 focus:outline-none"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg 
              className="w-6 h-6" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-700 pt-4">
            <nav className="flex flex-col gap-4 mb-4">
              <Link 
                to="/create" 
                className="text-[#00d4aa] hover:text-primary transition-colors hover:underline"
                onClick={() => setMobileMenuOpen(false)}
              >
                Create Vault
              </Link>
              <Link 
                to="/vaults" 
                className="text-[#00d4aa] hover:text-primary transition-colors hover:underline"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Vaults
              </Link>
            </nav>

            <div className="border-t border-gray-700 pt-4">
              {wallet ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm opacity-80 text-[#00d4aa]">
                    {wallet.name}
                  </div>
                  <button 
                    className="bg-gray-800 hover:bg-gray-700 text-[#00d4aa] px-4 py-2 rounded-lg border border-[#00d4aa] transition-colors text-sm w-full"
                    onClick={open}
                  >
                    Change
                  </button>
                  <button 
                    className="bg-gray-800 hover:bg-gray-700 text-[#00d4aa] px-4 py-2 rounded-lg border border-[#00d4aa] transition-colors text-sm w-full"
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button 
                  className="bg-primary hover:bg-primary-hover text-[#00d4aa] font-semibold px-6 py-2.5 rounded-lg transition-colors border border-[#00d4aa] cursor-pointer w-full"
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
          <Route path="/vault/:id" element={<VaultDetailPage />} />
        </Routes>
      </main>

      <footer className="border-t border-gray-700 px-4 md:px-8 py-6 text-center text-xs md:text-sm opacity-70">
        <p>
          InheritVault – Timelock inheritance on Nervos CKB
        </p>
      </footer>
    </div>
  );
}
