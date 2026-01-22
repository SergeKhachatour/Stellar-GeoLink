# WebAuthn Dispatcher Contract - Deployment Steps

## ✅ Contract Status

The contract is built and ready. The message "This contract has no constructor" is **normal** - Soroban contracts don't use constructors. You can deploy it as-is.

## Step 1: Deploy Contract (No Constructor Needed)

1. Go to: https://laboratory.stellar.org/
2. Navigate to **Soroban** → **Deploy Contract**
3. Select **Testnet**
4. Upload the WASM file:
   ```
   soroban-contracts/webauthn-dispatcher/target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm
   ```
5. **Ignore the "no constructor" message** - this is normal for Soroban contracts
6. Click **Deploy** (you don't need to add any constructor arguments)
7. **Copy the Contract ID** (starts with `C...`)

## Step 2: Initialize Contract (After Deployment)

After deployment, you need to initialize the contract with the WebAuthn Verifier contract address:

1. In Stellar Lab, go to **Soroban** → **Invoke Contract**
2. Select your deployed dispatcher contract (the one you just deployed)
3. Function: `initialize`
4. Parameters:
   - `verifier_contract`: `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`
     - Type: **Address**
     - Value: `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`
5. Click **Invoke** to submit the transaction
6. Wait for transaction confirmation

## Step 3: Provide Contract ID

Once deployed and initialized, provide me with:
- **Dispatcher Contract ID** (from Step 1)

I will then:
- ✅ Update `backend/config/contracts.js`
- ✅ Update `frontend/src/services/executionEngine.js`
- ✅ Update environment variable documentation
- ✅ Ensure all references are properly configured

## Important Notes

- ✅ **"No constructor" message is normal** - Soroban contracts use `initialize` functions instead
- ✅ **Deploy without constructor arguments** - just upload and deploy
- ✅ **Initialize after deployment** - call `initialize` function with verifier contract address
- ✅ **Contract works without initialization** - but won't be able to verify signatures until initialized

## Quick Reference

**WebAuthn Verifier Contract ID** (for initialization):
```
CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L
```

**WASM File Location**:
```
soroban-contracts/webauthn-dispatcher/target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm
```
