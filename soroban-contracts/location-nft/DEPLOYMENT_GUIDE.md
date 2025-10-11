# LocationNFT Contract Deployment Guide

## Real Blockchain Deployment

### Step 1: Deploy Contract via Stellar CLI

Since you already have the `nft-manager` identity set up with your wallet, deploy the contract:

```bash
cd soroban-contracts/location-nft

# Deploy the contract to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/location_nft.wasm \
  --source-account nft-manager \
  --network testnet \
  --alias location_nft
```

This will output a contract ID like: `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

### Step 2: Initialize the Contract

```bash
stellar contract invoke \
  --id <CONTRACT_ID_FROM_STEP_1> \
  --source-account nft-manager \
  --network testnet \
  -- \
  initialize \
  --admin GD2RR33QESEPOALSU3JGCMJ45FLFJJR5P2PIOVDIOMOKXFZ3VWJSP3VM \
  --name StellarGeoLinkNFT \
  --symbol SGL
```

### Step 3: Use the Contract ID in Frontend

Once deployed, add the contract ID to your frontend by updating the deployed contracts in the database or configuration.

## Why CLI Deployment?

Browser-based Soroban contract deployment is complex due to:
- WASM format requirements
- Transaction structure complexity
- Soroban RPC specifics
- SDK limitations

The Stellar CLI handles all these complexities and is the recommended approach for production deployments.

## Frontend Integration

After CLI deployment, the frontend can:
- ✅ Mint NFTs using the deployed contract
- ✅ Transfer NFTs between wallets
- ✅ Query NFT metadata and ownership
- ✅ Display real blockchain data

All using your NFT Manager wallet!

