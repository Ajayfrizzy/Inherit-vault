import { Routes, Route, Link, NavLink } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useState } from "react";
import HomePage from "./pages/HomePage";
import CreateVaultPage from "./pages/CreateVaultPage";
import VaultListPage from "./pages/VaultListPage";
import VaultDetailPage from "./pages/VaultDetailPage";
import BeneficiaryPage from "./pages/BeneficiaryPage";
import { getActiveNetwork, getNetworkLabel } from "./lib/network";

export default function App() {
  const { open, wallet, disconnect, client } = ccc.useCcc();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = [
    { to: "/create", label: "Create Vault" },
    { to: "/vaults", label: "My Vaults" },
    { to: "/beneficiary", label: "Beneficiary" },
  ];
  const networkLabel = getNetworkLabel(getActiveNetwork(client));

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(0,212,170,0.12),transparent_56%)]" />
      <div className="pointer-events-none absolute right-[-7rem] top-24 h-72 w-72 rounded-full bg-[#f2c66d]/10 blur-3xl" />

      <div className="relative flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071311]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex flex-col">
                <span className="text-xl font-semibold text-[#f2fffb] md:text-2xl">
                  InheritVault
                </span>
                <span className="text-xs text-[#8db5ac]">
                  Time-locked CKB planning
                </span>
              </Link>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#a6cbc2] md:inline-flex">
                {networkLabel}
              </span>
            </div>

            <div className="hidden items-center gap-4 lg:flex">
              <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `nav-pill ${isActive ? "nav-pill-active" : ""}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              {wallet ? (
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  <div className="pr-2">
                    <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                      Wallet
                    </div>
                    <div className="text-sm font-medium text-[#f2fffb]">
                      {wallet.name}
                    </div>
                  </div>
                  <button className="button-ghost" onClick={open}>
                    Change
                  </button>
                  <button className="button-ghost" onClick={() => disconnect()}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button className="button-primary" onClick={open}>
                  Connect Wallet
                </button>
              )}
            </div>

            <button
              className="button-ghost !px-3 !py-3 lg:hidden"
              onClick={() => setMobileMenuOpen((openValue) => !openValue)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg
                className="h-5 w-5"
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
            <div className="border-t border-white/10 lg:hidden">
              <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `panel-muted !p-4 text-sm font-medium ${
                          isActive ? "text-white" : "text-[#a6cbc2]"
                        }`
                      }
                      onClick={closeMobileMenu}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>

                <div className="panel-muted !p-4">
                  {wallet ? (
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                          Connected wallet
                        </div>
                        <div className="mt-1 text-sm font-medium text-[#f2fffb]">
                          {wallet.name}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button className="button-secondary" onClick={open}>
                          Change Wallet
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => {
                            disconnect();
                            closeMobileMenu();
                          }}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="button-primary w-full"
                      onClick={() => {
                        open();
                        closeMobileMenu();
                      }}
                    >
                      Connect Wallet
                    </button>
                  )}
                </div>
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

        <footer className="border-t border-white/10 bg-black/10">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-[#8db5ac] md:px-6">
            <div>
              <p className="font-semibold text-[#effffb]">InheritVault</p>
              <p className="mt-1">
                A calmer way to prepare beneficiary-ready CKB vaults.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
