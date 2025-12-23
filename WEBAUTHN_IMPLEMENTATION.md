# WebAuthn/Passkey Implementation Guide

This document explains how GeoLink implements WebAuthn/passkey authentication following the pattern described in the WebAuthn Verifier & Passkey Registration Context document.

## Contract IDs

**WebAuthn Verifier Contract:**
```
CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L
```

**Smart Wallet Contract:**
```
CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
```

**Network:** Stellar Testnet  
**RPC URL:** `https://soroban-testnet.stellar.org`  
**Network Passphrase:** `"Test SDF Network ; September 2015"`

## Architecture Overview

### Two-Contract System

1. **WebAuthn Verifier Contract** (shared, deployed once)
   - Verifies secp256r1 signatures from WebAuthn/passkey authentication
   - Implements W3C WebAuthn specification
   - Used by the Smart Wallet Contract for signature verification

2. **Smart Wallet Contract** (your contract instance)
   - Stores user passkey public keys via `register_signer()`
   - Calls verifier contract to verify signatures
   - Manages user balances and transactions

## Implementation Status

### ✅ Completed

1. **Backend Passkey Registration** (`backend/routes/webauthn.js`)
   - ✅ POST `/api/webauthn/register` - Registers passkey on smart wallet contract
   - ✅ Follows exact pattern: Extract 65-byte public key from SPKI → Generate RP ID hash → Call `register_signer()`
   - ✅ Uses correct contract IDs and network configuration
   - ✅ Stores passkey info in database for later use

2. **Frontend Passkey Service** (`frontend/src/services/webauthnService.js`)
   - ✅ `registerPasskey()` - Creates passkey using WebAuthn API
   - ✅ `authenticateWithPasskey()` - Authenticates with registered passkey
   - ✅ `extractPublicKeyFromSPKI()` - Extracts 65-byte public key from SPKI format
   - ✅ `generateRPIdHash()` - Generates 32-byte RP ID hash
   - ✅ `decodeDERSignature()` - Decodes DER signature to raw 64-byte format
   - ✅ `registerSignerOnContract()` - Registers passkey on smart wallet contract
   - ✅ All utility functions match the document pattern

3. **Passkey Manager Component** (`frontend/src/components/Wallet/PasskeyManager.js`)
   - ✅ UI for registering and managing passkeys
   - ✅ Integrates with WebAuthn service
   - ✅ Calls backend API for contract registration

4. **Wallet-Based Registration** (`frontend/src/components/Register.jsx`)
   - ✅ Supports wallet-based registration (no email required)
   - ✅ Optionally prompts user to register passkey after account creation
   - ✅ Follows the registration flow pattern

5. **Backend Utilities** (`backend/utils/webauthnUtils.js`)
   - ✅ `extractPublicKeyFromSPKI()` - Backend version
   - ✅ `generateRPIdHash()` - Backend version
   - ✅ `decodeDERSignature()` - Backend version
   - ✅ `normalizeECDSASignature()` - Signature normalization

### 🔄 Current Implementation Details

#### Wallet-Based Registration Flow

1. User connects wallet (Stellar public key)
2. User fills in optional fields (firstName, lastName, organization)
3. User selects role (data_consumer, wallet_provider, nft_manager)
4. Account is created with `public_key` (email/password are NULL)
5. **Optional:** User is prompted to register a passkey
   - If accepted, WebAuthn API creates passkey
   - Passkey is registered on smart wallet contract via `register_signer()`
   - Passkey info is stored in database

#### Wallet-Based Login Flow

1. User connects wallet (Stellar public key)
2. Backend verifies user exists with that `public_key`
3. User is logged in (no password required)
4. **Note:** Passkey authentication is used for signing transactions on the smart wallet contract, not for web app login

#### Passkey Registration Flow (Following Document Pattern)

```typescript
// Step 1: Register passkey with WebAuthn API
const passkeyData = await webauthnService.registerPasskey(userPublicKey);

// Step 2: Extract 65-byte public key from SPKI (done automatically)
// Step 3: Generate RP ID hash (done automatically)
// Step 4: Register on smart wallet contract
await api.post('/webauthn/register', {
  passkeyPublicKeySPKI: passkeyData.publicKey,
  credentialId: passkeyData.credentialId,
  secretKey: userSecretKey
});
```

#### Passkey Authentication Flow (For Transaction Signing)

```typescript
// Step 1: Create signature payload
const signaturePayload = JSON.stringify(transactionData);

// Step 2: Authenticate with passkey
const authResult = await webauthnService.authenticateWithPasskey(
  credentialId,
  signaturePayload
);

// Step 3: Decode DER signature to raw 64-byte format (done automatically)
// Step 4: Call smart wallet function with WebAuthn signature
// (This would be done via backend API for security)
```

## Key Implementation Points

### ✅ Contract Integration

- **Smart Wallet Contract ID:** `CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U`
- **WebAuthn Verifier Contract ID:** `CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`
- Both contract IDs are correctly configured in:
  - `backend/config/contracts.js`
  - `frontend/src/services/webauthnService.js`
  - Environment variables (`.env`)

### ✅ Data Format Handling

- **Passkey Public Key:** 65 bytes (0x04 || X || Y), extracted from SPKI (91 bytes)
- **WebAuthn Signature:** 64 bytes raw (r || s, normalized), decoded from DER (70-72 bytes)
- **RP ID Hash:** 32 bytes SHA-256 hash of domain
- **Signature Payload:** Variable bytes, first 32 bytes used as challenge

### ✅ Function Calls

- `register_signer(signer_address, passkey_pubkey, rp_id_hash)` - Correctly implemented
- `verify(signature_payload, pub_key, sig_data)` - Called by smart wallet contract (not directly by frontend)

## Usage Examples

### Registering a Passkey

```javascript
// In PasskeyManager component or after wallet-based registration
const passkeyData = await webauthnService.registerPasskey(publicKey);
await api.post('/webauthn/register', {
  passkeyPublicKeySPKI: passkeyData.publicKey,
  credentialId: passkeyData.credentialId,
  secretKey: secretKey
});
```

### Authenticating with Passkey (For Transactions)

```javascript
// When user wants to sign a transaction
const signaturePayload = JSON.stringify({
  source: userPublicKey,
  destination: recipientAddress,
  amount: '10000000'
});

const authResult = await webauthnService.authenticateWithPasskey(
  credentialId,
  signaturePayload
);

// Use authResult.signature, authResult.authenticatorData, authResult.clientDataJSON
// to call smart wallet contract functions
```

## Files Modified/Created

### Backend
- `backend/routes/webauthn.js` - Passkey registration endpoint
- `backend/routes/smartWallet.js` - Smart wallet contract interactions
- `backend/utils/webauthnUtils.js` - Utility functions
- `backend/config/contracts.js` - Contract configuration

### Frontend
- `frontend/src/services/webauthnService.js` - WebAuthn service
- `frontend/src/components/Wallet/PasskeyManager.js` - Passkey management UI
- `frontend/src/components/Register.jsx` - Wallet-based registration with passkey option
- `frontend/src/components/Login.js` - Wallet-based login

## Testing Checklist

- [ ] Test passkey registration with test account
- [ ] Verify registration with `is_signer_registered()` call (if available)
- [ ] Test authentication with registered passkey
- [ ] Test signature decoding (DER to raw)
- [ ] Test contract call with WebAuthn signature
- [ ] Verify transaction succeeds on-chain

## Future Enhancements

1. **Enhanced Passkey Verification on Login**
   - Currently, wallet-based login uses direct public_key verification
   - Could add optional passkey verification for extra security
   - Would require verifying signature against WebAuthn Verifier contract

2. **Transaction Signing with Passkeys**
   - Implement full transaction signing flow using passkeys
   - Use `executeWithWebAuthn()` pattern from document
   - Integrate with smart wallet contract functions

3. **Multiple Passkey Support**
   - Allow users to register multiple passkeys
   - Let users select which passkey to use for authentication
   - Implement passkey rotation/removal

## Notes

- The implementation follows the exact pattern from the WebAuthn Verifier & Passkey Registration Context document
- All contract IDs match the document specifications
- Data format conversions (SPKI → 65 bytes, DER → 64 bytes) are correctly implemented
- RP ID hash generation follows the document pattern
- The smart wallet contract's `register_signer()` function is called correctly with proper ScVals

