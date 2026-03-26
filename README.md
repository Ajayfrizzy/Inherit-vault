# InheritVault

InheritVault is a React + TypeScript + Vite MVP for creating time-locked inheritance vaults on Nervos CKB. A vault is created as a CKB cell locked to the beneficiary's address, while vault metadata such as the owner address, owner name, unlock condition, and optional memo are written into the cell's `output_data`.

This project is built as a learning/demo app. It focuses on simple wallet-driven flows with CCC (Common Chain Connector), on-chain verification, and optional beneficiary email notifications.

## Features

- Create a vault for any valid CKB address
- Choose an unlock condition by block height or timestamp
- Store owner name and memo on-chain inside the vault cell data
- View created vaults from a local owner index stored in `localStorage`
- Re-import a vault by transaction hash if the local index is lost
- Scan the chain for vaults created for the connected beneficiary wallet
- Verify a vault directly from its transaction hash and output index
- Claim a live vault once the unlock condition is satisfied
- Send optional "vault created" and "vault claimable" emails through a Vercel serverless function backed by Resend

## How It Works

1. The owner connects a CCC-compatible wallet and creates a vault.
2. The app builds a transaction with:
   - a lock script derived from the beneficiary address
   - the vault capacity in CKB
   - encoded vault metadata in the output data
3. The owner signs and broadcasts the transaction from the connected wallet.
4. The beneficiary can later:
   - discover live vaults for their address from the indexer
   - verify any vault from its transaction hash
   - claim the vault after the unlock condition is met

The app uses CKB's native `since` field during the claim transaction to enforce the unlock timing.

## What Is Stored Where

### On-chain

- Owner address
- Optional owner display name
- Unlock type and unlock value
- Optional memo
- Locked CKB capacity

### Local browser storage

- Owner vault references (`txHash`, `index`, cached status, timestamps)
- Optional beneficiary email for notifications
- Whether a claimable email has already been sent
- Saved owner display name
- Beneficiary dismissed/hidden vaults

The vault metadata source of truth is on-chain. Local storage is only a convenience index for the UI.

## Tech Stack

- React 18
- TypeScript
- Vite 6
- React Router 6
- Tailwind CSS 4
- `@ckb-ccc/connector-react`
- Vercel Serverless Functions
- Resend

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A CCC-compatible CKB wallet
- Testnet CKB if you want to try the full create/claim flow

### Install

```bash
npm install
```

### Run the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### Optional: enable email notifications locally

The frontend proxies `/api/*` requests to `http://localhost:3000`, so if you want email notifications during local development, run the Vercel API locally in a second terminal:

```bash
npx vercel dev --listen 3000
```

Set these server-side environment variables for the Vercel process:

```bash
RESEND_API_KEY=your_resend_key
RESEND_FROM="InheritVault <noreply@yourdomain.com>"
```

If you are using a separately hosted backend instead, set:

```bash
VITE_EMAIL_API_URL=https://your-backend.example.com/api/send-email
```

You can use the included `.env.example` as a reference.

## Available Scripts

- `npm run dev` starts the Vite dev server
- `npm run build` runs TypeScript compilation and creates a production build
- `npm run preview` previews the production build locally

## Configuration

Most app-level settings live in `src/config.ts`.

### Network configuration

You can change:

- `DEFAULT_NETWORK`
- `rpcUrl`
- `indexerUrl`
- fallback `indexerUrls`
- explorer URL prefixes

The default is:

```ts
export const DEFAULT_NETWORK: Network = "testnet";
```

### Minimum vault size

`MIN_VAULT_CKB` is set to `250` as a safe floor. The UI also calculates a dynamic minimum based on the actual encoded metadata size for the vault payload.

### Email API endpoint

Frontend email requests use:

```ts
export const EMAIL_API_URL =
  import.meta.env.VITE_EMAIL_API_URL ?? "/api/send-email";
```

On Vercel, the default relative path works with the bundled serverless function.

## Routes

- `/` home page and wallet summary
- `/create` create a new vault
- `/vaults` owner vault list and import flow
- `/vault/:txHash/:index` vault detail and claim page
- `/beneficiary` beneficiary dashboard and verification flow

## Project Structure

```text
mvp/
|-- api/
|   `-- send-email.ts        # Vercel function for Resend-backed notifications
|-- src/
|   |-- config.ts            # Network and email configuration
|   |-- types.ts             # Shared app types
|   |-- lib/
|   |   |-- ccc.ts           # Wallet helpers and transaction building
|   |   |-- ckb.ts           # RPC helpers
|   |   |-- codec.ts         # Vault cell data encoder/decoder
|   |   |-- email.ts         # Frontend email client
|   |   |-- storage.ts       # localStorage helpers
|   |   `-- vaultIndexer.ts  # On-chain vault discovery and verification
|   |-- pages/
|   |   |-- HomePage.tsx
|   |   |-- CreateVaultPage.tsx
|   |   |-- VaultListPage.tsx
|   |   |-- VaultDetailPage.tsx
|   |   `-- BeneficiaryPage.tsx
|   |-- App.tsx
|   |-- main.tsx
|   `-- index.css
|-- .env.example
|-- package.json
|-- vercel.json
`-- README.md
```

## Deployment

This project is set up for Vercel:

1. Deploy the repo to Vercel.
2. Add `RESEND_API_KEY` and `RESEND_FROM` in the Vercel project environment variables if you want email notifications.
3. Build the frontend normally; Vercel will also expose `api/send-email`.

`vercel.json` rewrites non-API routes to `index.html` so client-side routing works in production.

## Limitations

- This is an MVP and not production-audited.
- The app currently defaults to testnet usage.
- Vault discovery depends on configured indexer endpoints being available.
- Owner vault lists are convenience records in `localStorage`; clearing browser storage removes the local index, not the on-chain vault.
- Email addresses are stored locally in the browser only and are not written on-chain.
- The timelock flow uses standard CKB behavior via `since`; this is not a custom inheritance lock script.

## Security Notes

- Double-check the beneficiary address before creating a vault.
- Do not use this app with meaningful mainnet funds without deeper review, testing, and audits.
- Keep wallet seed phrases and private keys private; this app never asks for them directly.

## Learn More

- [Nervos CKB Documentation](https://docs.nervos.org/)
- [CKB RFC 0017: Transaction Valid Since](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)
- [CCC Documentation](https://docs.ckbccc.com/)
- [CCC GitHub Repository](https://github.com/ckb-devrel/ccc)

## License

This repository is provided as an educational demo. Use it at your own risk.
