# Update Dispatcher Contract ID

After deploying the WebAuthn Dispatcher contract using Stellar Lab, follow these steps to configure it in GeoLink.

## Step 1: Deploy Contract

1. Go to Stellar Lab: https://laboratory.stellar.org/
2. Navigate to **Soroban** → **Deploy Contract**
3. Upload the WASM file: `soroban-contracts/webauthn-dispatcher/target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm`
4. Deploy to **Testnet**
5. **Copy the Contract ID** (you'll need this)

## Step 2: Initialize Contract

After deployment, initialize the contract with the WebAuthn Verifier contract address:

**WebAuthn Verifier Contract ID**: `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`

In Stellar Lab:
1. Go to **Soroban** → **Invoke Contract**
2. Select your deployed dispatcher contract
3. Call function: `initialize`
4. Parameter: `verifier_contract` = `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L` (as Address)

## Step 3: Update Configuration

Once you have the deployed contract ID, provide it to update the configuration files.

**Files that will be updated:**
1. `backend/config/contracts.js` - Add `WEBAUTHN_DISPATCHER_CONTRACT_ID`
2. `frontend/src/services/executionEngine.js` - Use dispatcher contract ID
3. Environment variables documentation

## Step 4: Environment Variables

Add to your `.env` file:

```bash
# Backend
WEBAUTHN_DISPATCHER_CONTRACT_ID=<YOUR_DEPLOYED_CONTRACT_ID>

# Frontend
REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID=<YOUR_DEPLOYED_CONTRACT_ID>
```

## Ready to Update

Once you provide the deployed contract ID, I will:
1. ✅ Update `backend/config/contracts.js`
2. ✅ Update `frontend/src/services/executionEngine.js` 
3. ✅ Update environment variable documentation
4. ✅ Ensure all references are properly configured

**Please provide the deployed contract ID when ready!**
