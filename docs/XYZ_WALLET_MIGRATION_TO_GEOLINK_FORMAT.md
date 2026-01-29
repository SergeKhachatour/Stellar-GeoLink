# XYZ-Wallet Migration Guide: Updating to GeoLink's ContractCallIntent Format

## Overview

This document provides the exact changes needed to update XYZ-Wallet's implementation guide to use GeoLink's standardized `ContractCallIntent` format for deposit integration.

## Section to Update: "GeoLink Deposit Integration"

Replace the entire "GeoLink Deposit Integration" section in your implementation guide with the following:

---

## GeoLink Deposit Integration

### ⚠️ CRITICAL: Migration Required

**XYZ-Wallet must update their implementation to use GeoLink's `ContractCallIntent` format.** The examples below show the correct implementation using GeoLink's standardized format.

### Key Changes Required

1. **Intent Structure**: Use GeoLink's `ContractCallIntent` format (not simple JSON)
2. **Encoding Method**: Canonical JSON with sorted keys
3. **Challenge Generation**: SHA-256 hash of intent bytes (not first 32 bytes directly)
4. **Parameters Format**: Typed arguments array (not simple object)
5. **WebAuthn Fields**: Excluded from Intent (they're in AuthProof)

### Complete Implementation Example

```typescript
const executeDepositViaGeoLink = async (
  actionId: string,
  depositAction: PendingDepositAction
): Promise<boolean> => {
  try {
    // 1. Decrypt secret key on-demand
    const encryptedData = encryptionService.getEncryptedWalletData();
    const passkeyData = await passkeyService.getStoredPasskeyData();
    const kekParams = {
      srpSecret: passkeyData.id,
      salt: btoa(depositAction.matched_public_key)
    };
    const userSecretKey = await encryptionService.decryptSecretKey(
      encryptedData,
      kekParams
    );
    
    // 2. Helper function to generate 32-byte hex nonce
    function generateNonce(): string {
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      return Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    
    // 3. Filter out WebAuthn fields from parameters
    const webauthnFieldNames = [
      'signature_payload',
      'webauthn_signature',
      'webauthn_authenticator_data',
      'webauthn_client_data',
      'webauthn_client_data_json'
    ];
    const intentParams = {};
    for (const [key, value] of Object.entries(depositAction.parameters || {})) {
      if (!webauthnFieldNames.includes(key) && 
          value && 
          typeof value === 'string' && 
          !value.includes('[Will be') && 
          !value.includes('system-generated')) {
        intentParams[key] = value;
      }
    }
    
    // 4. Create typed arguments array
    // Note: Ideally use contract introspection for actual types (Address, I128, etc.)
    const typedArgs = Object.entries(intentParams).map(([name, value]) => ({
      name,
      type: 'String', // Default - use contract introspection if available
      value
    }));
    
    // 5. Create ContractCallIntent (GeoLink format)
    const now = Math.floor(Date.now() / 1000);
    const intent = {
      v: 1, // Version
      network: depositAction.network || 'testnet',
      rpcUrl: depositAction.network === 'mainnet' 
        ? 'https://rpc.mainnet.stellar.org:443'
        : 'https://soroban-testnet.stellar.org:443',
      contractId: depositAction.contract_address, // Stellar contract address (starts with C)
      fn: depositAction.function_name, // e.g., "deposit"
      args: typedArgs, // Array of {name, type, value} objects
      signer: depositAction.matched_public_key, // User's Stellar public key
      ruleBinding: depositAction.rule_id ? depositAction.rule_id.toString() : null, // Optional rule ID
      nonce: generateNonce(), // 32-byte hex string (64 characters)
      iat: now, // Issued at (seconds since epoch)
      exp: now + 300 // Expiration (5 minutes from now)
      // Note: authMode is NOT part of canonical Intent
    };
    
    // 6. Encode intent to canonical JSON bytes
    const canonical = {
      v: intent.v,
      network: intent.network,
      rpcUrl: intent.rpcUrl,
      contractId: intent.contractId,
      fn: intent.fn,
      args: intent.args.map(arg => ({
        name: arg.name,
        type: arg.type,
        value: arg.value
      })),
      signer: intent.signer,
      ...(intent.ruleBinding && { ruleBinding: intent.ruleBinding }),
      nonce: intent.nonce,
      iat: intent.iat,
      exp: intent.exp
    };
    
    // Convert to canonical JSON string (sorted keys for deterministic encoding)
    const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());
    
    // Encode as UTF-8 bytes
    const intentBytes = new TextEncoder().encode(jsonString);
    
    // Convert to base64 for signature_payload
    const signaturePayload = Buffer.from(intentBytes).toString('base64');
    
    // 7. Generate WebAuthn Challenge (GeoLink Method: SHA-256 hash)
    const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
    const hash = new Uint8Array(hashBuffer);
    const challenge = hash.slice(0, 32); // SHA-256 is already 32 bytes
    
    // 8. Authenticate with passkey
    const authResult = await passkeyService.authenticatePasskey(
      passkeyData.id,
      challenge // Pass as Uint8Array
    );
    
    // 9. Execute deposit via GeoLink
    const response = await fetch(
      `https://geolink-api.com/api/contracts/rules/pending/deposits/${actionId}/execute`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': WALLET_PROVIDER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          public_key: depositAction.matched_public_key,
          user_secret_key: userSecretKey,
          webauthn_signature: authResult.signature,
          webauthn_authenticator_data: authResult.authenticatorData,
          webauthn_client_data: authResult.clientDataJSON,
          signature_payload: signaturePayload,
          passkey_public_key_spki: passkeyData.publicKey
        })
      }
    );
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error executing deposit:', error);
    return false;
  }
};
```

### What Changed from Old Implementation

**OLD (Incorrect - DO NOT USE):**
```typescript
// ❌ Simple JSON object
const depositData = {
  source: publicKey,
  asset: asset,
  amount: amount,
  action: 'deposit',
  timestamp: Date.now()
};
const depositDataJSON = JSON.stringify(depositData);

// ❌ First 32 bytes directly as challenge
const depositDataBytes = new TextEncoder().encode(depositDataJSON);
const challengeBytes = depositDataBytes.slice(0, 32);
const paddedChallenge = new Uint8Array(32);
paddedChallenge.set(challengeBytes, 0);
```

**NEW (Correct - GeoLink Format):**
```typescript
// ✅ GeoLink's ContractCallIntent format
const intent = {
  v: 1,
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org:443',
  contractId: contractAddress,
  fn: 'deposit',
  args: [
    { name: 'user_address', type: 'Address', value: publicKey },
    { name: 'asset', type: 'Address', value: asset },
    { name: 'amount', type: 'I128', value: amount }
  ],
  signer: publicKey,
  ruleBinding: ruleId?.toString(),
  nonce: generateNonce(), // 64-char hex string
  iat: Math.floor(Date.now() / 1000), // Seconds, not milliseconds
  exp: Math.floor(Date.now() / 1000) + 300
};

// ✅ Canonical JSON with sorted keys
const canonical = { /* ... */ };
const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());
const intentBytes = new TextEncoder().encode(jsonString);

// ✅ SHA-256 hash for challenge
const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
const challenge = new Uint8Array(hashBuffer).slice(0, 32);
```

### Key Differences Summary

| Aspect | Old (Incorrect) | New (GeoLink Format) |
|--------|----------------|---------------------|
| **Intent Structure** | Simple JSON object | `ContractCallIntent` with version, network, RPC URL, etc. |
| **Parameters** | Simple object `{asset, amount}` | Typed arguments array `[{name, type, value}]` |
| **Encoding** | `JSON.stringify()` | Canonical JSON with sorted keys |
| **Challenge** | First 32 bytes of JSON | SHA-256 hash of intent bytes |
| **Nonce** | Not included | 64-character hex string (required) |
| **Timestamps** | Milliseconds (`Date.now()`) | Seconds (`Math.floor(Date.now() / 1000)`) |
| **WebAuthn Fields** | Included in intent | Excluded from intent (part of AuthProof) |

### Migration Checklist

- [x] Intent structure uses GeoLink's `ContractCallIntent` format
- [x] Canonical JSON encoding with sorted keys
- [x] SHA-256 hash for challenge generation
- [x] Typed arguments array (not simple object)
- [x] WebAuthn fields excluded from Intent
- [x] Nonce generation (64-character hex string)
- [x] Timestamps in seconds (not milliseconds)
- [x] Rule binding included (if available)

### Reference Documentation

For complete API documentation and additional examples, see:
- **GeoLink Deposit Integration Guide**: `docs/XYZ_WALLET_DEPOSIT_INTEGRATION.md`
- **GeoLink Intent Service**: `frontend/src/services/intentService.js` in GeoLink codebase

---

## Update Your Implementation Guide

Replace the "GeoLink Deposit Integration" section in your XYZ-Wallet Implementation Guide with the content above. This ensures your documentation matches GeoLink's actual implementation and will work correctly with GeoLink's deposit execution endpoints.
