# WebAuthn & Encryption Implementation

This document describes the improved WebAuthn and encryption implementation for GeoLink, based on XYZ-Wallet-v1 but with critical security improvements.

## Overview

GeoLink now implements a secure, generic contract execution system with two authentication lanes:

1. **Classic Lane**: Decrypt secret key locally, sign transactions locally, submit
2. **WebAuthn Lane**: Create deterministic intent, sign with passkey, submit with on-chain WebAuthn verification

## Key Improvements Over XYZ-Wallet

### 1. Deterministic Intent Encoding
- **Problem**: XYZ-Wallet used first 32 bytes of JSON string as challenge (non-deterministic)
- **Solution**: SHA-256 hash of canonical JSON, then first 32 bytes
- **File**: `frontend/src/services/intentService.js`

### 2. Proper Challenge Derivation
- **Problem**: Challenge derived from first 32 bytes of JSON (unstable)
- **Solution**: `challenge32 = SHA-256(intentBytes).slice(0, 32)`
- **File**: `frontend/src/services/intentService.js`

### 3. Anti-Replay Protection
- **Problem**: No nonce or expiration in XYZ-Wallet
- **Solution**: Intent includes `nonce` (32 bytes, hex) and `exp` (expiration timestamp)
- **File**: `frontend/src/services/intentService.js`

### 4. Signature Normalization
- **Problem**: DER signatures not properly normalized
- **Solution**: `normalizeWebAuthnSignatureToRaw64()` converts DER to raw64 (r || s, 64 bytes)
- **File**: `frontend/src/services/passkeyService.js`

### 5. SPKI Pubkey Extraction
- **Problem**: Inconsistent extraction of 65-byte public key from SPKI
- **Solution**: `extractUncompressedP256PubKey65FromSPKI()` with validation
- **File**: `frontend/src/services/passkeyService.js`

### 6. PRF Extension Support
- **Problem**: No use of WebAuthn PRF extension for key derivation
- **Solution**: Priority: PRF > PBKDF2(passphrase) > Fallback (with warnings)
- **File**: `frontend/src/services/keyVaultService.js`

### 7. Never Send Secret Keys to Backend
- **Problem**: Some flows sent secret keys to backend
- **Solution**: All secret key operations happen client-side only
- **Files**: All execution modules

### 8. Generic Contract Execution
- **Problem**: XYZ-Wallet hardcoded to smart-wallet contract
- **Solution**: Uses contract introspection for any contract/function
- **File**: `frontend/src/services/executionEngine.js`

## Module Structure

### 1. Intent Service (`intentService.js`)

**Purpose**: Create and encode contract call intents deterministically

**Key Functions**:
- `createContractCallIntent()` - Create intent with nonce, exp, etc.
- `encodeIntentBytes()` - Deterministic encoding (canonical JSON)
- `challengeFromIntent()` - SHA-256 hash for WebAuthn challenge
- `validateIntent()` - Check expiration, required fields

### 2. Passkey Service (`passkeyService.js`)

**Purpose**: WebAuthn registration and authentication with improved security

**Key Functions**:
- `registerPasskey()` - Register new passkey (with PRF support)
- `authenticatePasskey()` - Authenticate with passkey (returns raw64 signature)
- `normalizeWebAuthnSignatureToRaw64()` - Convert DER to raw64
- `extractUncompressedP256PubKey65FromSPKI()` - Extract 65-byte pubkey

### 3. Key Vault Service (`keyVaultService.js`)

**Purpose**: Encrypted secret key storage with WebAuthn-gated access

**Key Functions**:
- `encryptAndStoreSecretKey()` - Encrypt and store secret key
- `decryptSecretKey()` - Decrypt secret key (requires keying material)
- `deriveKEK()` - Derive Key Encryption Key (PRF > PBKDF2 > Fallback)

### 4. Execution Engine (`executionEngine.js`)

**Purpose**: Execute contract calls via classic or WebAuthn lanes

**Key Functions**:
- `executeContractCall()` - Main execution function
- `executeClassic()` - Classic lane (decrypt, sign, submit)
- `executeWebAuthn()` - WebAuthn lane (intent, passkey, submit)

## UI Integration

### PasskeyManager
- ✅ Uses new `passkeyService` with PRF support
- ✅ Shows PRF availability status
- ✅ Shows key derivation method (PRF/PBKDF2/Fallback)
- ✅ Shows encrypted wallet status
- ✅ Auto-encrypts wallet when passkey is registered with PRF

### IntentPreview Component
- ✅ Shows ContractCallIntent details before execution
- ✅ Displays intent structure, arguments, security details
- ✅ Shows challenge derivation (SHA-256 hash)
- ✅ Shows nonce, expiration, timestamps
- ✅ Copy-to-clipboard functionality

### ContractManagement Integration
- ✅ Creates intent before execution (if enabled)
- ✅ Shows intent preview dialog
- ✅ Executes using ExecutionEngine (classic or WebAuthn lanes)
- ✅ Falls back to backend execution if ExecutionEngine fails
- ✅ Enable via `REACT_APP_USE_EXECUTION_ENGINE=true`

## Security Considerations

### ✅ Implemented

- ✅ Deterministic intent encoding (canonical JSON)
- ✅ SHA-256 challenge derivation
- ✅ Anti-replay (nonce + exp)
- ✅ DER signature normalization
- ✅ PRF extension support
- ✅ PBKDF2 fallback with passphrase
- ✅ Never send secret keys to backend
- ✅ Generic contract execution

### ⚠️ Warnings

- **Fallback Key Derivation**: If PRF and passphrase are unavailable, uses credentialId (less secure, but functional)
- **Dispatcher Contract**: For contracts not WebAuthn-aware, requires a dispatcher contract (optional)

## Files Created

- `frontend/src/services/intentService.js` - Intent creation and encoding
- `frontend/src/services/passkeyService.js` - Improved WebAuthn service
- `frontend/src/services/keyVaultService.js` - Encrypted key storage
- `frontend/src/services/executionEngine.js` - Execution engine with two lanes
- `frontend/src/components/Contracts/IntentPreview.js` - Intent visualization component
- `frontend/src/utils/contractExecutionHelper.js` - Execution helper wrapper
- `frontend/src/utils/walletEncryptionHelper.js` - Wallet encryption helper
- `frontend/src/utils/validationScripts.js` - Validation tests

## References

- XYZ-Wallet-v1: Reference implementation
- WebAuthn Spec: https://www.w3.org/TR/webauthn-2/
- Stellar Soroban: https://soroban.stellar.org/
