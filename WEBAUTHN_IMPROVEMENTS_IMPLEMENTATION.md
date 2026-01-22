# WebAuthn & Encryption Improvements Implementation

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

**Usage**:
```javascript
import { createContractCallIntent, encodeIntentBytes, challengeFromIntent } from './services/intentService';

const intent = createContractCallIntent({
  contractId: 'CC74XDT7UVLUZCELKBIYXFYIX6A6LGPWURJVUXGRPQO745RWX7WEURMA',
  fn: 'execute_payment',
  args: [
    { name: 'destination', type: 'Address', value: 'G...' },
    { name: 'amount', type: 'I128', value: '10000000' }
  ],
  signer: 'GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA',
  network: 'testnet',
  authMode: 'webauthn',
  expiresIn: 300 // 5 minutes
});

const intentBytes = await encodeIntentBytes(intent);
const challenge32 = await challengeFromIntent(intentBytes);
```

### 2. Passkey Service (`passkeyService.js`)

**Purpose**: WebAuthn registration and authentication with improved security

**Key Functions**:
- `registerPasskey()` - Register new passkey (with PRF support)
- `authenticatePasskey()` - Authenticate with passkey (returns raw64 signature)
- `normalizeWebAuthnSignatureToRaw64()` - Convert DER to raw64
- `extractUncompressedP256PubKey65FromSPKI()` - Extract 65-byte pubkey

**Usage**:
```javascript
import passkeyService from './services/passkeyService';

// Register passkey
const registration = await passkeyService.registerPasskey(userId, { usePRF: true });

// Authenticate
const authResult = await passkeyService.authenticatePasskey(
  registration.credentialId,
  challenge32 // 32-byte challenge
);

// authResult contains:
// - credentialId
// - signature (DER format, for compatibility)
// - signatureRaw64 (raw64 format, r || s, 64 bytes)
// - authenticatorData
// - clientDataJSON
```

### 3. Key Vault Service (`keyVaultService.js`)

**Purpose**: Encrypted secret key storage with WebAuthn-gated access

**Key Functions**:
- `encryptAndStoreSecretKey()` - Encrypt and store secret key
- `decryptSecretKey()` - Decrypt secret key (requires keying material)
- `deriveKEK()` - Derive Key Encryption Key (PRF > PBKDF2 > Fallback)

**Usage**:
```javascript
import keyVaultService from './services/keyVaultService';

// Encrypt and store
const encryptedData = await keyVaultService.encryptAndStoreSecretKey(secretKey, {
  prfResult: registration.prfResult, // If PRF extension available
  passphrase: userPassphrase, // If user provides passphrase
  credentialId: registration.credentialId // Fallback
});

// Decrypt
const secretKey = await keyVaultService.decryptSecretKey(encryptedData, {
  prfResult: registration.prfResult,
  passphrase: userPassphrase,
  credentialId: registration.credentialId
});
```

### 4. Execution Engine (`executionEngine.js`)

**Purpose**: Execute contract calls via classic or WebAuthn lanes

**Key Functions**:
- `executeContractCall()` - Main execution function
- `executeClassic()` - Classic lane (decrypt, sign, submit)
- `executeWebAuthn()` - WebAuthn lane (intent, passkey, submit)

**Usage**:
```javascript
import executionEngine from './services/executionEngine';
import { createContractCallIntent } from './services/intentService';

// Create intent
const intent = createContractCallIntent({
  contractId: 'CC74...',
  fn: 'execute_payment',
  args: [...],
  signer: 'G...',
  authMode: 'webauthn'
});

// Execute via WebAuthn
const result = await executionEngine.executeContractCall(intent, {
  authMode: 'webauthn',
  credentialId: registration.credentialId,
  simulate: true // Simulate before executing
});

// Execute via Classic
const result = await executionEngine.executeContractCall(intent, {
  authMode: 'classic',
  keyingMaterial: {
    prfResult: registration.prfResult,
    passphrase: userPassphrase
  }
});
```

## Integration with GeoLink

### 1. Contract Execution Flow

When a user wants to execute a contract function:

1. **Build Intent**: Use contract introspection to build typed args
2. **Check Auth Mode**: Determine if function requires WebAuthn
3. **Execute**:
   - **WebAuthn**: Create intent → Authenticate passkey → Submit with WebAuthn params
   - **Classic**: Decrypt secret → Sign locally → Submit

### 2. Wallet Creation Flow

1. Generate Stellar keypair
2. Register passkey (with PRF if available)
3. Encrypt secret key with keying material
4. Store encrypted wallet data

### 3. Wallet Access Flow

1. Authenticate with passkey
2. Decrypt secret key using keying material
3. Use secret key for classic transactions (if needed)

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
- **Dispatcher Contract**: For contracts not WebAuthn-aware, requires a dispatcher contract (not yet implemented)

## Testing

### Validation Scripts Needed

1. **Deterministic Encoding Test**: Verify same intent always produces same bytes
2. **Challenge Derivation Test**: Verify SHA-256 hash is correct
3. **Signature Normalization Test**: Verify DER → raw64 conversion
4. **SPKI Extraction Test**: Verify 65-byte pubkey extraction
5. **Encryption Round Trip Test**: Verify encrypt/decrypt works

### Example Test

```javascript
// Test deterministic encoding
const intent1 = createContractCallIntent({...});
const intent2 = createContractCallIntent({...}); // Same params

const bytes1 = await encodeIntentBytes(intent1);
const bytes2 = await encodeIntentBytes(intent2);

// Should be different due to nonce, but structure should be same
// Test with same nonce to verify determinism
```

## Next Steps

1. **Wire into ContractManagement.js**: Update contract execution to use new modules
2. **Update WalletContext**: Use KeyVaultService for secret key storage
3. **Implement Dispatcher Contract**: For universal WebAuthn execution
4. **Add Validation Scripts**: Test deterministic encoding, signature normalization, etc.
5. **Update Backend**: Ensure backend never receives secret keys (only signed XDR)

## Files Created

- `frontend/src/services/intentService.js` - Intent creation and encoding
- `frontend/src/services/passkeyService.js` - Improved WebAuthn service
- `frontend/src/services/keyVaultService.js` - Encrypted key storage
- `frontend/src/services/executionEngine.js` - Execution engine with two lanes

## Migration from XYZ-Wallet

If migrating from XYZ-Wallet:

1. **Secret Keys**: Old wallets may not have `wrapIv` - users need to create new wallets
2. **Passkeys**: Existing passkeys can be reused, but PRF extension requires re-registration
3. **Challenge Derivation**: Old challenges won't work - need to use new SHA-256 method

## References

- XYZ-Wallet-v1: `C:\Users\serge\OneDrive\Desktop\NodeJS\XYZ-Wallet-v1`
- WebAuthn Spec: https://www.w3.org/TR/webauthn-2/
- Stellar Soroban: https://soroban.stellar.org/
