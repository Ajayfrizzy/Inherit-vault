import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useEffect, useState } from "react";
import CopyButton from "../components/CopyButton";
import { DEFAULT_NETWORK, NETWORK_CONFIGS, isVaultScriptsReady } from "../config";
import { formatAddress } from "../lib/display";

export default function HomePage() {
  const { wallet, open } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("");

  useEffect(() => {
    if (!signer) return;

    (async () => {
      try {
        const addr = await signer.getRecommendedAddress();
        setAddress(addr);

        const capacity = await signer.getBalance();
        setBalance(ccc.fixedPointToString(capacity));
      } catch (error) {
        console.error("Failed to fetch wallet info:", error);
      }
    })();
  }, [signer]);

  const scriptsReady = isVaultScriptsReady(DEFAULT_NETWORK);
  const networkLabel = NETWORK_CONFIGS[DEFAULT_NETWORK].label;
  const quickNotes = [
    "Choose who should receive the vault.",
    "Set the amount and the unlock moment.",
    "Track whether the vault is pending, live, or ready.",
  ];

  return (
    <div className="page-shell">
      <section className="panel-strong">
        <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
          <div>
            <div className="section-eyebrow">Digital inheritance planning</div>
            <h1 className="page-title mt-4">
              Prepare a secure CKB vault for the people you care about.
            </h1>
            <p className="page-subtitle mt-4">
              Set the amount, choose the beneficiary, and decide when the funds
              can be claimed. InheritVault keeps the flow readable so you can
              focus on the handoff, not the chain details.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="address-pill">Time-locked release</span>
              <span className="address-pill">Beneficiary-ready records</span>
              <span className="address-pill">Clear vault tracking</span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {wallet ? (
                <>
                  <Link to="/create" className="button-primary">
                    Create a Vault
                  </Link>
                  <Link to="/vaults" className="button-secondary">
                    Review My Vaults
                  </Link>
                </>
              ) : (
                <button className="button-primary" onClick={open}>
                  Connect Wallet to Begin
                </button>
              )}
              <Link to="/beneficiary" className="button-secondary">
                Beneficiary View
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {quickNotes.map((note, index) => (
                <div key={note} className="metric-card">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                    Step {index + 1}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d7f6ef]">{note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div
              className={`status-banner ${
                scriptsReady
                  ? "status-banner-success"
                  : "status-banner-warning"
              }`}
            >
              {scriptsReady
                ? `Vault creation is currently available on ${networkLabel}.`
                : `Vault creation is temporarily unavailable on ${networkLabel}. You can still review saved records and inspect existing vaults.`}
            </div>

            <div className="panel-muted">
              {wallet ? (
                <>
                  <div className="section-eyebrow">Connected wallet</div>
                  <div className="mt-4 text-2xl font-semibold text-[#f2fffb]">
                    Ready to create or review vaults
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="metric-card">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                        Address
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="address-pill mono-text">
                          {address ? formatAddress(address, 14, 10) : "Loading..."}
                        </span>
                        <CopyButton value={address} label="Copy address" />
                      </div>
                      {address && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm font-medium text-[#83e8d4]">
                            Show full address
                          </summary>
                          <div className="field-hint mono-text break-all">
                            {address}
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <div className="metric-card">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                          Balance
                        </div>
                        <div className="mt-3 break-all text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-tight text-white">
                          {balance || "..."}
                        </div>
                        <div className="mt-2 text-xl font-semibold text-white">
                          CKB
                        </div>
                      </div>

                      <div className="metric-card">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#83e8d4]">
                          Network
                        </div>
                        <div className="mt-3 break-words text-lg font-semibold text-white">
                          {networkLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="section-eyebrow">Before you start</div>
                  <div className="mt-4 text-2xl font-semibold text-[#f2fffb]">
                    Gather the details once, then create with confidence
                  </div>
                  <ul className="mt-5 space-y-3 text-sm leading-7 text-[#d7f6ef]">
                    <li>Confirm the beneficiary address carefully.</li>
                    <li>Pick an unlock date or block height that gives you a clear safety window.</li>
                    <li>Keep the transaction hash so the vault can always be verified later.</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel card-hover">
          <div className="section-eyebrow">1. Set it up</div>
          <h2 className="mt-4 text-2xl font-semibold text-white">
            Choose the beneficiary and the amount
          </h2>
          <p className="field-hint">
            The creation flow keeps the important decisions in plain language so
            the recipient, amount, and notifications are easy to review before
            you submit.
          </p>
        </div>

        <div className="panel card-hover">
          <div className="section-eyebrow">2. Lock it intentionally</div>
          <h2 className="mt-4 text-2xl font-semibold text-white">
            Pick the exact moment the vault becomes claimable
          </h2>
          <p className="field-hint">
            You can plan around a block height or a calendar time. The app
            keeps reminding you what the beneficiary will have to wait for.
          </p>
        </div>

        <div className="panel card-hover">
          <div className="section-eyebrow">3. Track the outcome</div>
          <h2 className="mt-4 text-2xl font-semibold text-white">
            Watch it move from pending to live to ready
          </h2>
          <p className="field-hint">
            Owner and beneficiary views both focus on status, unlock timing, and
            quick verification instead of making you decode raw chain data.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <div className="panel-muted max-w-3xl">
          <div className="section-eyebrow">Important note</div>
          <h2 className="mt-4 text-2xl font-semibold text-white">
            Use this carefully and verify the details.
          </h2>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-[#d7f6ef]">
            <li>Double-check every beneficiary address before creating a vault.</li>
            <li>Transaction fees apply when creating and claiming.</li>
            <li>Stick to testnet habits and verification steps before treating any flow as production-ready.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
