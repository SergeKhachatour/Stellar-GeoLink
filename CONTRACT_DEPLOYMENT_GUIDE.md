# Contract Deployment Guide - WebAuthn Improvements

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
- **Location**: `soroban-contracts/webauthn-dispatcher/`
- **Status**: ⚠️ **Optional** - Only needed for universal WebAuthn execution
- **Purpose**: Routes WebAuthn-verified calls to any target contract
- **When to Deploy**: Only if you want universal WebAuthn execution for contracts that don't have WebAuthn support built-in

**Deployment Steps** (if you choose to deploy):
```bash
cd soroban-contracts/webauthn-dispatcher
soroban contract build
soroban contract deploy --wasm target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm --source-account <deployer>
```

**After Deployment**:
1. Initialize with WebAuthn Verifier contract address
2. Contract ID: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`
3. Already configured in code (can override with environment variables):
   - Backend: `WEBAUTHN_DISPATCHER_CONTRACT_ID` (default: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`)
   - Frontend: `REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID` (default: `CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV`)

**Note**: The dispatcher is **optional**. Existing contracts work fine without it. It's only needed if you want to add WebAuthn support to contracts that don't have it built-in.

## Environment Variables

### No Changes Required

Your existing `.env` variables remain the same:

```bash
# Backend
SMART_WALLET_CONTRACT_ID=CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
WEBAUTHN_VERIFIER_CONTRACT_ID=CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L

# Frontend
REACT_APP_SMART_WALLET_CONTRACT_ID=CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID=CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L
```

### Optional: Dispatcher Contract

If you deploy the dispatcher contract, add (optional):
```bash
# Backend (optional)
WEBAUTHN_DISPATCHER_CONTRACT_ID=<deployed_contract_id>

# Frontend (optional)
REACT_APP_WEBAUTHN_DISPATCHER_CONTRACT_ID=<deployed_contract_id>
```

## How It Works

### Current System (No Changes)
1. **Smart Wallet Contract** uses **WebAuthn Verifier Contract** directly
2. Users register passkeys on Smart Wallet Contract
3. Payments execute through Smart Wallet Contract with WebAuthn verification
4. ✅ **Everything continues to work as before**

### With Dispatcher (Optional)
1. **Dispatcher Contract** uses **WebAuthn Verifier Contract** to verify signatures
2. Dispatcher routes verified calls to **any target contract**
3. Allows contracts without WebAuthn support to use WebAuthn execution
4. ⚠️ **Only needed if you want universal WebAuthn for all contracts**

## Summary

- ✅ **WebAuthn Verifier Contract**: No changes, no redeployment needed
- ✅ **Smart Wallet Contract**: No changes, no redeployment needed
- ⚠️ **Dispatcher Contract**: Optional, only deploy if you want universal WebAuthn execution
- ✅ **Environment Variables**: No changes needed (unless you deploy dispatcher)

**The improvements are backward compatible - all existing functionality continues to work!**
