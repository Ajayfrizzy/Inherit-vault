import { Link } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import { useEffect, useState } from "react";

export default function HomePage() {
  const { wallet, open } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

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

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12 text-[#00d4aa]">
      <section className="text-center py-8 md:py-12">
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          🔐 InheritVault
        </h1>
        <p className="text-lg md:text-xl opacity-80 mb-8">
          Create time-locked inheritance vaults on Nervos CKB
        </p>

        {wallet ? (
          <div className="bg-gray-800 border border-gray-700 text-[#00d4aa] rounded-lg p-4 md:p-6 max-w-2xl mx-auto">
            <h3 className="text-xl md:text-2xl font-semibold mb-4">Connected</h3>
            <div className="mb-4">
              <div className="text-xs md:text-sm opacity-70 mb-1">Address</div>
              <div className="font-mono text-xs md:text-sm break-all">
                {address || "Loading..."}
              </div>
            </div>
            <div className="mb-6">
              <div className="text-xs md:text-sm opacity-70 mb-1">Balance</div>
              <div className="text-2xl md:text-3xl font-bold">
                {balance || "..."} CKB
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/create">
                <button className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 font-semibold px-6 py-3 rounded-lg transition-colors border border-[#00d4aa] text-[#00d4aa] cursor-pointer">
                  Create Vault
                </button>
              </Link>
              <Link to="/vaults">
                <button className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg border border-[#00d4aa] text-[#00d4aa] cursor-pointer transition-colors">
                  My Vaults
                </button>
              </Link>
              <Link to="/beneficiary">
                <button className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg border border-[#00d4aa] text-[#00d4aa] cursor-pointer transition-colors">
                  Beneficiary Dashboard
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <button 
              className="bg-primary border border-[#00d4aa] font-semibold px-8 py-4 rounded-lg transition-colors text-base md:text-lg cursor-pointer"
              onClick={open}
            >
              Connect Wallet to Get Started
            </button>
          </div>
        )}
      </section>

      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mt-8 md:mt-12">
        <h2 className="text-xl md:text-2xl font-semibold mb-4">How It Works</h2>
        <ol className="space-y-3 md:space-y-4 pl-5 list-decimal text-sm md:text-base leading-relaxed">
          <li>
            <strong>Connect your CKB wallet</strong> using any CCC-compatible wallet (JoyID, MetaMask, etc.)
          </li>
          <li>
            <strong>Create a vault</strong> by specifying:
            <ul className="mt-2 pl-6 list-disc space-y-1">
              <li>Beneficiary's CKB address</li>
              <li>Amount of CKB to lock</li>
              <li>Unlock condition (block height or timestamp)</li>
            </ul>
          </li>
          <li>
            <strong>The vault is created on-chain</strong> as a cell with the beneficiary's lock – all metadata (owner, unlock condition, memo) is stored in the cell data
          </li>
          <li>
            <strong>The beneficiary can see pending vaults</strong> by connecting their wallet on the Beneficiary Dashboard – vaults are verified directly from the blockchain
          </li>
          <li>
            <strong>The beneficiary claims</strong> the funds after the unlock condition is met
          </li>
        </ol>
      </section>

      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mt-4">
        <h2 className="text-xl md:text-2xl font-semibold mb-4">⚠️ Important Notes</h2>
        <ul className="space-y-2 md:space-y-3 pl-5 list-disc text-sm md:text-base leading-relaxed">
          <li>This is an <strong>MVP demonstration</strong> – use testnet only</li>
          <li>Vault data is stored <strong>on-chain</strong> in cell output data – no more localStorage dependency</li>
          <li>Beneficiaries can <strong>verify any vault</strong> by checking its transaction hash on-chain</li>
          <li>The beneficiary must have access to their wallet to claim</li>
          <li>Transaction fees apply when creating and claiming vaults</li>
          <li>Double-check the beneficiary address before creating a vault</li>
        </ul>
      </section>
    </div>
  );
}
