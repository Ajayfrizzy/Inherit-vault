import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useEffect, useState } from "react";
import { DEFAULT_NETWORK, isVaultScriptsReady } from "../config";

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-[#00d4aa] md:px-6 md:py-12">
      <section className="py-8 text-center md:py-12">
        <h1 className="mb-4 text-3xl font-bold md:text-5xl">InheritVault</h1>
        <p className="mb-4 text-lg opacity-80 md:text-xl">
          Create time-locked inheritance vaults on Nervos CKB.
        </p>
        <p className="mx-auto mb-8 max-w-2xl text-sm leading-6 text-[#c9fff4]/75 md:text-base">
          New vaults use a scripted lock, an owner-authenticated type script,
          and Molecule-encoded cell data. Legacy vault records can still be
          viewed for compatibility, but only the scripted format is treated as
          authenticated in beneficiary discovery.
        </p>

        {wallet ? (
          <div className="mx-auto max-w-2xl rounded-lg border border-gray-700 bg-gray-800 p-4 text-[#00d4aa] md:p-6">
            <h3 className="mb-4 text-xl font-semibold md:text-2xl">Connected</h3>
            <div className="mb-4">
              <div className="mb-1 text-xs opacity-70 md:text-sm">Address</div>
              <div className="break-all font-mono text-xs md:text-sm">
                {address || "Loading..."}
              </div>
            </div>
            <div className="mb-6">
              <div className="mb-1 text-xs opacity-70 md:text-sm">Balance</div>
              <div className="text-2xl font-bold md:text-3xl">
                {balance || "..."} CKB
              </div>
            </div>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link to="/create">
                <button className="w-full rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#22e4bd] sm:w-auto">
                  Create Vault
                </button>
              </Link>
              <Link to="/vaults">
                <button className="w-full rounded-lg border border-[#00d4aa] bg-gray-800 px-6 py-3 text-[#00d4aa] transition-colors hover:bg-gray-700 sm:w-auto">
                  My Vaults
                </button>
              </Link>
              <Link to="/beneficiary">
                <button className="w-full rounded-lg border border-[#00d4aa] bg-gray-800 px-6 py-3 text-[#00d4aa] transition-colors hover:bg-gray-700 sm:w-auto">
                  Beneficiary Dashboard
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <button
            className="rounded-lg border border-[#00d4aa] bg-[#00d4aa] px-8 py-4 text-base font-semibold text-black transition-colors hover:bg-[#22e4bd] md:text-lg"
            onClick={open}
          >
            Connect Wallet to Get Started
          </button>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-gray-700 bg-gray-800 p-4 md:mt-12 md:p-6">
        <h2 className="mb-4 text-xl font-semibold md:text-2xl">Security Status</h2>
        <div
          className={`rounded-lg border px-4 py-3 text-sm md:text-base ${
            scriptsReady
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
          }`}
        >
          {scriptsReady
            ? `Scripted vault creation is enabled for ${DEFAULT_NETWORK}.`
            : `Scripted vault creation is disabled for ${DEFAULT_NETWORK} until the deployed lock and type scripts are configured in src/config.ts.`}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-gray-700 bg-gray-800 p-4 md:p-6">
        <h2 className="mb-4 text-xl font-semibold md:text-2xl">How It Works</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed md:text-base md:space-y-4">
          <li>
            Connect a CCC-compatible wallet and choose a beneficiary address.
          </li>
          <li>
            Create a vault cell that stores the creator lock, owner note, unlock
            data, and memo in Molecule format.
          </li>
          <li>
            New vaults are tagged with a custom type script so beneficiary
            discovery can distinguish owner-authenticated scripted vaults from
            lookalike cells.
          </li>
          <li>
            The vault remains locked until the stored block height or timestamp
            is reached.
          </li>
          <li>
            After unlock, the claim flow pays the beneficiary address while
            preserving the scripted vault guarantees.
          </li>
        </ol>
      </section>

      <section className="mt-4 rounded-lg border border-gray-700 bg-gray-800 p-4 md:p-6">
        <h2 className="mb-4 text-xl font-semibold md:text-2xl">Important Notes</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed md:text-base md:space-y-3">
          <li>This remains a testnet-first MVP and should not be treated as audited mainnet software.</li>
          <li>Only standard secp256k1-blake160 beneficiary addresses are supported for new scripted vaults.</li>
          <li>Legacy vaults can still be surfaced in owner flows, but they are not treated as authenticated typed/scripted vaults.</li>
          <li>Double-check the beneficiary address before creating a vault.</li>
          <li>Transaction fees apply when creating and claiming vaults.</li>
        </ul>
      </section>
    </div>
  );
}
