# Contract Deployment Guide

## Overview

The WebAuthn improvements **do NOT require** redeploying existing contracts. All existing contracts continue to work as before.

## Existing Contracts (No Changes Required)

### ✅ WebAuthn Verifier Contract
- **Current ID**: `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`
- **Status**: ✅ **No changes needed** - continues to work as before
- **Environment Variable**: 
  - Backend: `WEBAUTHN_VERIFIER_CONTRACT_ID`
  - Frontend: `REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID`
- **Purpose**: Verifies secp256r1 signatures from WebAuthn/passkey authentication
- **Used By**: Smart Wallet Contract, Dispatcher Contract (when deployed)

### ✅ Smart Wallet Contract
- **Current ID**: `CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U`
- **Status**: ✅ **No changes needed** - continues to work as before
- **Environment Variable**:
  - Backend: `SMART_WALLET_CONTRACT_ID`
  - Frontend: `REACT_APP_SMART_WALLET_CONTRACT_ID`
- **Purpose**: Handles WebAuthn passkey registration and payment execution
- **Compatibility**: Fully compatible with new improvements

## New Optional Contract

### 🆕 WebAuthn Dispatcher Contract (Optional)
- **Current ID**: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`
- **Location**: `soroban-contracts/webauthn-dispatcher/`
- **Status**: ⚠️ **Optional** - Only needed for universal WebAuthn execution
- **Purpose**: Routes WebAuthn-verified calls to any target contract
- **When to Deploy**: Only if you want universal WebAuthn execution for contracts that don't have WebAuthn support built-in

### Deployment Steps (if deploying new instance)

1. **Build Contract**:
   ```bash
   cd soroban-contracts/webauthn-dispatcher
   soroban contract build
   ```

2. **Deploy Using Stellar Lab**:
   - Go to: https://laboratory.stellar.org/
   - Navigate to **Soroban** → **Deploy Contract**
   - Select **Testnet**
   - Upload WASM file: `target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm`
   - **Note**: "No constructor" message is normal - Soroban contracts use `initialize` functions
   - Click **Deploy** (no constructor arguments needed)
   - Copy the Contract ID

3. **Initialize Contract**:
   - In Stellar Lab, go to **Soroban** → **Invoke Contract**
   - Select your deployed dispatcher contract
   - Function: `initialize`
   - Parameter: `verifier_contract` = `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L` (as Address)
   - Click **Invoke**

4. **Update Environment Variables**:
   ```bash
   # Backend
   WEBAUTHN_DISPATCHER_CONTRACT_ID=<your_deployed_contract_id>
   
   # Frontend
   REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID=<your_deployed_contract_id>
   ```

## Environment Variables

### Required (No Changes)
```bash
# Backend
SMART_WALLET_CONTRACT_ID=CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
WEBAUTHN_VERIFIER_CONTRACT_ID=CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L

# Frontend
REACT_APP_SMART_WALLET_CONTRACT_ID=CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID=CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L
```

### Optional: Dispatcher Contract
```bash
# Backend (optional)
WEBAUTHN_DISPATCHER_CONTRACT_ID=CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV

# Frontend (optional)
REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID=CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV
```

### Intent Preview (Always Enabled)
Intent preview is always shown before contract execution. No configuration needed.

## Summary

- ✅ **WebAuthn Verifier Contract**: No changes, no redeployment needed
- ✅ **Smart Wallet Contract**: No changes, no redeployment needed
- ⚠️ **Dispatcher Contract**: Optional, already deployed (ID: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`)
- ✅ **Environment Variables**: No changes needed (unless deploying new dispatcher instance)

**The improvements are backward compatible - all existing functionality continues to work!**
