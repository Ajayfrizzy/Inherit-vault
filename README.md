# InheritVault – CKB Timelock Inheritance MVP

A web application for creating time-locked inheritance vaults on Nervos CKB using React + TypeScript + Vite and CCC (Common Chain Connector).

## 📋 Overview

InheritVault allows users to:
- **Create vaults** that lock CKB for a beneficiary until a specified unlock time
- **List and view** created vaults (stored in localStorage)
- **Claim funds** when the unlock condition is met (beneficiary only)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- A CCC-compatible CKB wallet (JoyID, MetaMask, etc.)
- CKB testnet tokens for testing

### Installation

```bash
# Navigate to the project directory
cd mvp

# Install dependencies
npm install
# or
pnpm install

# Start the development server
npm run dev
# or
pnpm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
# or
pnpm run build

# Preview the production build
npm run preview
```

## ⚙️ Configuration

### Network Endpoints

Edit `src/config.ts` to configure RPC and Indexer endpoints:

```typescript
export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  testnet: {
    rpcUrl: "https://testnet.ckb.dev/rpc",
    indexerUrl: "https://testnet.ckb.dev/indexer",
    explorerTxUrl: "https://pudge.explorer.nervos.org/transaction/",
    label: "Testnet (Pudge)",
  },
  mainnet: {
    rpcUrl: "https://mainnet.ckb.dev/rpc",
    indexerUrl: "https://mainnet.ckb.dev/indexer",
    explorerTxUrl: "https://explorer.nervos.org/transaction/",
    label: "Mainnet",
  },
};
```

### Default Network

Change the default network in `src/config.ts`:

```typescript
export const DEFAULT_NETWORK: Network = "testnet"; // or "mainnet"
```

## 📖 How It Works

### 1. Vault Creation

When you create a vault:

1. **User inputs**:
   - Beneficiary CKB address
   - Amount of CKB to lock (minimum 200 CKB)
   - Unlock type (block height or timestamp)
   - Unlock value (specific block or Unix timestamp)
   - Optional memo

2. **Transaction building**:
   - A transaction is built with an output cell containing:
     - **Lock script**: The beneficiary's lock script (who can spend it)
     - **Capacity**: The amount of CKB locked
     - **Data**: Can store metadata (currently minimal for MVP)
   - The timelock is encoded in the transaction's `since` field on inputs (applied during claim)

3. **On-chain storage**:
   - The vault cell is created on CKB
   - Transaction hash and output index (OutPoint) are saved to localStorage

### 2. Finding the Vault Cell

The app uses the CKB Indexer to find vault cells:

1. **By OutPoint**: Each vault record stores `txHash` and `index`
2. **RPC fallback**: If indexer fails, uses `get_transaction` RPC to fetch the cell
3. **Status check**: Uses `get_live_cell` RPC to determine if spent/unspent

### 3. Claiming a Vault

When the beneficiary claims:

1. **Validation**:
   - Current wallet address must match beneficiary address
   - Current block height/timestamp must satisfy unlock condition
   - Vault cell must be unspent (status = "live")

2. **Transaction building**:
   - Input: The vault cell's OutPoint
   - Input's `since` field: Encoded timelock value
   - Output: Beneficiary's address with the vault capacity (minus fees)

3. **Signing & sending**:
   - The beneficiary signs with their wallet
   - Transaction is broadcast to CKB network

### Since Field & Timelock

CKB uses the `since` field on transaction inputs to enforce timelocks (see [RFC 0017](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)):

- **Block height**: `since = 0x0000000000000000 | blockHeight` (absolute)
- **Timestamp**: `since = 0x4000000000000000 | timestamp` (median time based)

For this MVP:
- Block-height locks are simpler and recommended
- Timestamp locks require encoding as "median time" (see RFC for details)

## ⚠️ Important Notes

### MVP Limitations

This is a **demonstration MVP** with the following limitations:

1. **Simplified Timelock Implementation**:
   - The vault uses standard CKB locks with transaction `since` fields
   - This is a simplified approach suitable for learning/testing
   - Production systems should use custom lock scripts that enforce both beneficiary AND timelock on-chain

2. **No Custom Lock Script**:
   - True inheritance vaults require a custom lock script that:
     - Enforces beneficiary authorization
     - Enforces timelock constraints
   - This MVP uses standard CKB locks + transaction `since` fields
   - For production, implement a proper inheritance lock script

3. **LocalStorage only**:
   - Vault records are stored in browser localStorage
   - No backend or on-chain indexing
   - Clearing browser data will lose vault records (but not on-chain cells)

4. **Testnet only**:
   - Only use on testnet
   - Do not send mainnet funds without thorough testing and audits

5. **Minimal UI**:
   - Focus is on functionality, not UX polish
   - Error handling is basic

### Security Considerations

- **Beneficiary address**: Double-check before creating a vault
- **Unlock condition**: Ensure it's set correctly (future block/timestamp)
- **Private keys**: Never share or expose your seed phrases
- **Non-custodial**: This app never handles private keys

## ✅ Functional Implementation

The CCC transaction building functions in `src/lib/ccc.ts` are now fully implemented:

### Core Functions

1. **`buildCreateVaultTransaction`** ✓
   - Converts beneficiary address to lock script
   - Creates transaction with vault output
   - Completes inputs and calculates fees
   - Returns transaction ready to send

2. **`buildClaimVaultTransaction`** ✓
   - Encodes timelock in the `since` field
   - Fetches vault cell and creates spending transaction
   - Handles both block-height and timestamp locks
   - Returns signed transaction

3. **`getLockScriptFromAddress`** ✓
   - Parses CKB addresses using CCC
   - Validates address format
   - Returns proper lock script for transactions

### Enhanced Features

- **Comprehensive validation**: Address format, amounts, unlock values
- **User-friendly errors**: Clear messages for all error cases
- **Address validation**: Regex patterns for mainnet (ckb1...) and testnet (ckt1...)
- **Unlock value checking**: Ensures future timestamps and reasonable block heights

## 📁 Project Structure

```
mvp/
├── src/
│   ├── config.ts              # Network configuration
│   ├── types.ts               # TypeScript interfaces
│   ├── lib/
│   │   ├── storage.ts         # localStorage persistence
│   │   ├── ckb.ts             # CKB RPC + Indexer calls
│   │   └── ccc.ts             # CCC adapter (has TODOs)
│   ├── pages/
│   │   ├── HomePage.tsx       # Landing page
│   │   ├── CreateVaultPage.tsx # Create vault form
│   │   ├── VaultListPage.tsx  # List all vaults
│   │   └── VaultDetailPage.tsx # Vault detail + claim
│   ├── App.tsx                # Main app with routing
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🔗 Routes

- `/` – Home page (connect wallet, view info)
- `/create` – Create a new vault
- `/vaults` – List all vaults
- `/vault/:id` – Vault detail with claim functionality

## 🧪 Testing

1. Connect your wallet (testnet)
2. Create a vault with:
   - Your testnet address as beneficiary (to test claiming)
   - A current block height + 10 blocks (quick unlock for testing)
   - 200+ CKB
3. Wait ~10 blocks (~2.5 minutes)
4. View the vault detail page
5. Click "Claim Vault" when unlocked

## 📚 Learn More

- [Nervos CKB Documentation](https://docs.nervos.org/)
- [CKB RFC 0017 - Transaction Valid Since](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)
- [CCC Documentation](https://docs.ckbccc.com/)
- [CCC GitHub Repository](https://github.com/ckb-devrel/ccc)

## 📝 License

This is an educational MVP demonstration. Use at your own risk.

## 🤝 Contributing

This is a learning project. To improve it:
1. Implement the CCC adapter TODOs
2. Add comprehensive error handling
3. Improve UI/UX
4. Add unit tests
5. Create a custom inheritance lock script for production use

---

**⚠️ WARNING**: This is a demonstration MVP. Do not use on mainnet without extensive testing and security audits.
