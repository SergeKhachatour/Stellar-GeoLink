# Contract Configuration Guide

This document explains how to update contract IDs when contracts are redeployed on Stellar testnet.

## Overview

All contract IDs are configured via environment variables, making it easy to update them without changing code. The application uses fallback values if environment variables are not set.

## Contract IDs

### 1. Smart Wallet Contract
- **Purpose**: Handles WebAuthn passkey registration and payment execution
- **Backend Variable**: `SMART_WALLET_CONTRACT_ID`
- **Frontend Variable**: `REACT_APP_SMART_WALLET_CONTRACT_ID`
- **Current Default**: `CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U`

### 2. WebAuthn Verifier Contract
- **Purpose**: Verifies secp256r1 signatures from WebAuthn/passkey authentication
- **Backend Variable**: `WEBAUTHN_VERIFIER_CONTRACT_ID`
- **Frontend Variable**: `REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID`
- **Current Default**: `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`

### 3. WebAuthn Dispatcher Contract
- **Purpose**: Routes WebAuthn-verified calls to any target contract (optional)
- **Backend Variable**: `WEBAUTHN_DISPATCHER_CONTRACT_ID`
- **Frontend Variable**: `REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID`
- **Current Default**: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`

### 4. Default LocationNFT Contract
- **Purpose**: Default contract for minting location-based NFTs
- **Backend Variable**: `DEFAULT_NFT_CONTRACT_ID`
- **Frontend Variable**: `REACT_APP_DEFAULT_CONTRACT_ADDRESS`
- **Current Default**: `CCDHRZSNWGW2KTRVPOW5QXR32DTWFLXHXDBC3OZO6CSW2JY7PYV2N4AQ`

## How to Update Contract IDs

### Local Development

1. **Create/Update `.env` file** in the project root:
   ```bash
   # Backend variables
   SMART_WALLET_CONTRACT_ID=YOUR_NEW_SMART_WALLET_CONTRACT_ID
   WEBAUTHN_VERIFIER_CONTRACT_ID=YOUR_NEW_WEBAUTHN_VERIFIER_CONTRACT_ID
   WEBAUTHN_DISPATCHER_CONTRACT_ID=YOUR_NEW_DISPATCHER_CONTRACT_ID
   DEFAULT_NFT_CONTRACT_ID=YOUR_NEW_NFT_CONTRACT_ID
   
   # Frontend variables (must be prefixed with REACT_APP_)
   REACT_APP_SMART_WALLET_CONTRACT_ID=YOUR_NEW_SMART_WALLET_CONTRACT_ID
   REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID=YOUR_NEW_WEBAUTHN_VERIFIER_CONTRACT_ID
   REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID=YOUR_NEW_DISPATCHER_CONTRACT_ID
   REACT_APP_DEFAULT_CONTRACT_ADDRESS=YOUR_NEW_NFT_CONTRACT_ID
   ```

2. **Restart the backend server** to load new environment variables:
   ```bash
   cd backend
   npm start
   ```

3. **Rebuild the frontend** (React environment variables are baked in at build time):
   ```bash
   cd frontend
   npm run build
   ```

### Azure Production Deployment

There are two ways to configure contract IDs for Azure deployment:

#### Option 1: GitHub Secrets (Recommended for Frontend)

Frontend contract IDs are baked into the build during GitHub Actions deployment. Set them as GitHub Secrets:

1. **Go to GitHub Repository** → Settings → Secrets and variables → Actions

2. **Add the following secrets**:
   - `REACT_APP_SMART_WALLET_CONTRACT_ID` = Your new contract ID
   - `REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID` = Your new contract ID
   - `REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID` = Your new dispatcher contract ID
   - `REACT_APP_DEFAULT_CONTRACT_ADDRESS` = Your new contract ID

3. **Push a commit** to trigger automatic rebuild and deployment:
   ```bash
   git commit --allow-empty -m "Trigger rebuild with new contract IDs"
   git push
   ```

The GitHub Actions workflow will automatically use these secrets during the frontend build.

#### Option 2: Azure Portal Application Settings (For Backend)

Backend contract IDs are runtime variables and should be set in Azure Portal:

1. **Go to Azure Portal** → Your Web App → Configuration → Application Settings

2. **Add/Update the following environment variables**:
   - `SMART_WALLET_CONTRACT_ID` = Your new contract ID
   - `WEBAUTHN_VERIFIER_CONTRACT_ID` = Your new contract ID
   - `WEBAUTHN_DISPATCHER_CONTRACT_ID` = Your new dispatcher contract ID
   - `DEFAULT_NFT_CONTRACT_ID` = Your new contract ID
   - `STELLAR_NETWORK` = `testnet` or `mainnet`

3. **Save** the configuration (Azure will restart the app automatically)

**Note**: Backend variables are read at runtime, so no redeployment is needed. Frontend variables must be set before building, so use GitHub Secrets (Option 1) for those.

## Where Contract IDs Are Used

### Backend
- `backend/config/contracts.js` - Central configuration file
- `backend/routes/smartWallet.js` - Smart wallet balance and payment endpoints
- `backend/routes/webauthn.js` - Passkey registration endpoint
- `backend/routes/nft.js` - NFT minting endpoint

### Frontend
- `frontend/src/services/webauthnService.js` - WebAuthn service
- `frontend/src/services/smartWalletService.js` - Smart wallet service
- `frontend/src/services/realNFTService.js` - NFT minting service

## Important Notes

1. **Frontend variables must be prefixed with `REACT_APP_`** - React only exposes environment variables that start with this prefix.

2. **Frontend variables are baked in at build time** - You must rebuild the frontend after changing `REACT_APP_*` variables. They are not read at runtime.

3. **Backend variables are read at runtime** - You only need to restart the backend server, not rebuild it.

4. **Fallback values** - If environment variables are not set, the code uses hardcoded default values. This is convenient for development but should be avoided in production.

5. **Network configuration** - The `STELLAR_NETWORK` variable controls which network (testnet/mainnet) is used. Set it to `testnet` or `mainnet`.

## Testing Contract IDs

After updating contract IDs, verify they're being used correctly:

1. **Check backend logs** on startup - should show contract IDs being loaded
2. **Check browser console** - frontend should log contract IDs on initialization
3. **Test endpoints**:
   - `GET /api/smart-wallet/balance?userPublicKey=YOUR_KEY` - Should use new smart wallet contract
   - `POST /api/webauthn/register` - Should register on new smart wallet contract
   - `POST /api/nft/pin` - Should mint on new NFT contract

## Quick Reference

| Contract | Backend Env Var | Frontend Env Var | Default Value |
|----------|----------------|------------------|---------------|
| Smart Wallet | `SMART_WALLET_CONTRACT_ID` | `REACT_APP_SMART_WALLET_CONTRACT_ID` | `CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U` |
| WebAuthn Verifier | `WEBAUTHN_VERIFIER_CONTRACT_ID` | `REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID` | `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L` |
| WebAuthn Dispatcher | `WEBAUTHN_DISPATCHER_CONTRACT_ID` | `REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID` | `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV` |
| LocationNFT | `DEFAULT_NFT_CONTRACT_ID` | `REACT_APP_DEFAULT_CONTRACT_ADDRESS` | `CCDHRZSNWGW2KTRVPOW5QXR32DTWFLXHXDBC3OZO6CSW2JY7PYV2N4AQ` |

