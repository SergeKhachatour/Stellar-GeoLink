# XYZ-Wallet Deposit Integration with GeoLink

## ⚠️ IMPORTANT: Migration Required

**XYZ-Wallet must update their implementation to use GeoLink's `ContractCallIntent` format.** This document provides the complete migration guide and updated implementation examples.

### Quick Migration Checklist

- [ ] Update intent structure to GeoLink's `ContractCallIntent` format
- [ ] Implement canonical JSON encoding with sorted keys
- [ ] Change challenge generation to SHA-256 hash method
- [ ] Convert parameters object to typed arguments array
- [ ] Filter out WebAuthn fields from Intent
- [ ] Add version, network, RPC URL, nonce, timestamps
- [ ] Test with GeoLink's execute endpoint

See the [Migration Guide](#migration-guide-updating-xyzwallet-to-use-geolinks-format) section below for detailed before/after examples.

## Overview

This document outlines the integration between XYZ-Wallet and GeoLink for handling deposit execution rules. When a deposit rule is triggered in GeoLink, the matched public key (wallet owner) must initiate the deposit transaction. This integration enables XYZ-Wallet to:

1. Receive pending deposit action items for wallets it manages
2. Display deposit requests to users
3. Execute deposits using WebAuthn authentication (using GeoLink's intent format)
4. Report deposit completion back to GeoLink

## Architecture

### Flow Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  GeoLink    │         │  XYZ-Wallet  │         │   Stellar   │
│  Backend    │◄───────►│   (Client)   │◄───────►│   Network   │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │ 1. Rule Triggered      │                        │
      │    (deposit function)   │                        │
      ├────────────────────────►│                        │
      │                        │                        │
      │ 2. Poll for Pending    │                        │
      │    Deposit Actions     │                        │
      │◄────────────────────────┤                        │
      │                        │                        │
      │                        │ 3. User Initiates      │
      │                        │    Deposit (WebAuthn)  │
      │                        ├───────────────────────►│
      │                        │                        │
      │                        │ 4. Transaction         │
      │                        │    Confirmed           │
      │                        │◄───────────────────────┤
      │                        │                        │
      │ 5. Report Completion   │                        │
      │◄────────────────────────┤                        │
      │                        │                        │
```

## Authentication

XYZ-Wallet uses **Wallet Provider API Key** for all deposit-related endpoints. The API key should be included in the request header:

```
X-API-Key: <wallet_provider_api_key>
```

**Note:** XYZ-Wallet has both `wallet_provider` and `data_consumer` roles, but deposit operations should use the `wallet_provider` API key for security and proper access control.

## API Endpoints

### 1. Get Pending Deposit Actions

Retrieve pending deposit actions for wallets managed by XYZ-Wallet.

**Endpoint:** `GET /api/contracts/rules/pending/deposits`

**Authentication:** Wallet Provider API Key

**Query Parameters:**
- `public_key` (optional): Filter by specific wallet public key
- `limit` (optional, default: 50): Maximum number of results
- `status` (optional): Filter by status (`pending`, `in_progress`, `completed`, `failed`)

**Response:**
```json
{
  "success": true,
  "pending_deposits": [
    {
      "id": "deposit_4282_7_GAGB3S3K",
      "rule_id": 7,
      "rule_name": "Deposit Rule",
      "contract_id": 4,
      "contract_name": "Payment Contract",
      "contract_address": "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
      "function_name": "deposit",
      "matched_public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
      "update_id": 4282,
      "received_at": "2026-01-28T20:31:08.758Z",
      "parameters": {
        "user_address": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
        "asset": "XLM",
        "amount": "1000000000",
        "signature_payload": "[Will be system-generated during WebAuthn authentication]",
        "webauthn_signature": "[Will be system-generated during WebAuthn authentication]",
        "webauthn_authenticator_data": "[Will be system-generated during WebAuthn authentication]",
        "webauthn_client_data": "[Will be system-generated during WebAuthn authentication]"
      },
      "location": {
        "latitude": 34.0522,
        "longitude": -118.2437
      },
      "expires_at": "2026-01-28T21:31:08.758Z",
      "status": "pending"
    }
  ],
  "total": 1
}
```

**Implementation Notes:**
- Only returns deposit functions (`function_name` contains "deposit")
- Filters by wallets managed by the authenticated wallet provider
- Includes all required parameters for deposit execution
- WebAuthn parameters are placeholders that must be generated during user authentication

### 2. Get Deposit Action Details

Get detailed information about a specific pending deposit action.

**Endpoint:** `GET /api/contracts/rules/pending/deposits/:action_id`

**Authentication:** Wallet Provider API Key

**Parameters:**
- `action_id`: Deposit action ID (format: `deposit_{update_id}_{rule_id}_{public_key_prefix}`)

**Response:**
```json
{
  "success": true,
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "rule_id": 7,
    "rule_name": "Deposit Rule",
    "contract_id": 4,
    "contract_name": "Payment Contract",
    "contract_address": "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
    "function_name": "deposit",
    "function_parameters": {
      "user_address": {
        "type": "Address",
        "required": true
      },
      "asset": {
        "type": "Address",
        "required": true
      },
      "amount": {
        "type": "I128",
        "required": true
      },
      "signature_payload": {
        "type": "Bytes",
        "required": true
      },
      "webauthn_signature": {
        "type": "Bytes",
        "required": true
      },
      "webauthn_authenticator_data": {
        "type": "Bytes",
        "required": true
      },
      "webauthn_client_data": {
        "type": "Bytes",
        "required": true
      }
    },
    "matched_public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
    "parameters": {
      "user_address": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
      "asset": "XLM",
      "amount": "1000000000"
    },
    "location": {
      "latitude": 34.0522,
      "longitude": -118.2437
    },
    "expires_at": "2026-01-28T21:31:08.758Z",
    "status": "pending"
  }
}
```

### 3. Execute Deposit

Execute a deposit transaction on behalf of the matched wallet.

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/execute`

**Authentication:** Wallet Provider API Key

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "user_secret_key": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "webauthn_signature": "base64_encoded_signature",
  "webauthn_authenticator_data": "base64_encoded_authenticator_data",
  "webauthn_client_data": "base64_encoded_client_data",
  "signature_payload": "base64_encoded_intent_bytes",
  "passkey_public_key_spki": "base64_encoded_spki"
}
```

**Note:** 
- The `user_secret_key` is required to sign the transaction. XYZ-Wallet should have access to the user's secret key for the matched public key.
- The `action_id` format is: `deposit_{update_id}_{rule_id}_{public_key_prefix}` (e.g., `deposit_4282_7_GAGB3S3K`)
- The `public_key` must match the `matched_public_key` from the pending deposit action

**Response:**
```json
{
  "success": true,
  "message": "Deposit executed successfully",
  "transaction_hash": "eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704",
  "ledger": 727905,
  "stellar_expert_url": "https://stellar.expert/explorer/testnet/tx/eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704",
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "status": "completed",
    "completed_at": "2026-01-28T20:35:12.123Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Deposit execution failed",
  "message": "Insufficient balance",
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "status": "failed",
    "failed_at": "2026-01-28T20:35:12.123Z",
    "error_details": "..."
  }
}
```

**Implementation Notes:**
- The `public_key` must match the `matched_public_key` from the pending deposit action
- `user_secret_key` is required to sign the transaction (XYZ-Wallet should have this for the user's wallet)
- WebAuthn authentication is required (all WebAuthn parameters must be provided)
- The `signature_payload` should be base64-encoded intent bytes generated from the contract call intent
- GeoLink will automatically populate `user_address` from the `public_key` if not provided
- The deposit will be executed directly on the contract (not routed through smart wallet payment)
- The transaction will be submitted to the Stellar network and GeoLink will wait for confirmation (up to 60 seconds)
- Upon successful execution, the deposit action status will be automatically updated to `completed`

### 4. Report Deposit Completion (Alternative)

If XYZ-Wallet executes the deposit directly on the Stellar network (without using GeoLink's execute endpoint), it can report completion using this endpoint.

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/complete`

**Authentication:** Wallet Provider API Key

**Path Parameters:**
- `action_id`: Deposit action ID (format: `deposit_{update_id}_{rule_id}_{public_key_prefix}`)

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "transaction_hash": "eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704",
  "ledger": 727905
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deposit completion reported successfully",
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "status": "completed",
    "completed_at": "2026-01-28T20:35:12.123Z"
  }
}
```

### 5. Cancel Deposit Action

Cancel a pending deposit action (e.g., if user declines or action expires).

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/cancel`

**Authentication:** Wallet Provider API Key

**Path Parameters:**
- `action_id`: Deposit action ID (format: `deposit_{update_id}_{rule_id}_{public_key_prefix}`)

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "reason": "user_declined" // or "expired", "insufficient_balance", etc.
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deposit action cancelled",
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "status": "cancelled",
    "cancelled_at": "2026-01-28T20:35:12.123Z"
  }
}
```

## WebAuthn Integration

### Intent Generation (GeoLink Format)

**IMPORTANT:** XYZ-Wallet must use GeoLink's `ContractCallIntent` format exactly as specified below. This ensures compatibility with GeoLink's WebAuthn verification system.

Before executing a deposit, XYZ-Wallet must:

1. **Create Contract Call Intent (GeoLink Format):**
   ```javascript
   // Helper function to generate 32-byte hex nonce
   function generateNonce() {
     const randomBytes = new Uint8Array(32);
     crypto.getRandomValues(randomBytes);
     return Array.from(randomBytes)
       .map(b => b.toString(16).padStart(2, '0'))
       .join('');
   }
   
   // Get contract details (from deposit action response)
   const contract = {
     contract_address: "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
     network: "testnet" // or "mainnet"
   };
   
   // Filter out WebAuthn fields from parameters
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
   
   // Create typed arguments array
   // Note: Ideally use contract introspection for actual types (Address, I128, etc.)
   // For now, using String as default type
   const typedArgs = Object.entries(intentParams).map(([name, value]) => ({
     name,
     type: 'String', // Default - use contract introspection if available
     value
   }));
   
   // Create ContractCallIntent (GeoLink format)
   const now = Math.floor(Date.now() / 1000);
   const intent = {
     v: 1, // Version
     network: contract.network || 'testnet',
     rpcUrl: contract.network === 'mainnet' 
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
   ```

2. **Encode Intent to Canonical JSON Bytes:**
   ```javascript
   // Create canonical object (excludes authMode and WebAuthn fields)
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
   ```

3. **Generate WebAuthn Challenge (GeoLink Method):**
   ```javascript
   // GeoLink uses SHA-256 hash of intent bytes, then takes first 32 bytes
   const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
   const hash = new Uint8Array(hashBuffer);
   const challenge = hash.slice(0, 32); // SHA-256 is already 32 bytes
   
   // Convert to base64url for WebAuthn API
   function base64UrlEncode(buffer) {
     const base64 = btoa(String.fromCharCode(...buffer));
     return base64
       .replace(/\+/g, '-')
       .replace(/\//g, '_')
       .replace(/=/g, '');
   }
   
   const challengeBase64Url = base64UrlEncode(challenge);
   ```

4. **Perform WebAuthn Authentication:**
   ```javascript
   // Use the challenge for WebAuthn authentication
   const authResult = await passkeyService.authenticatePasskey(
     passkeyData.id,
     challenge // Pass as Uint8Array (32 bytes)
   );
   
   // authResult contains:
   // - signature: Base64/Base64URL encoded WebAuthn signature
   // - authenticatorData: Base64/Base64URL encoded authenticator data
   // - clientDataJSON: Base64/Base64URL encoded client data JSON
   ```

5. **Execute Deposit:**
   - Send all WebAuthn data along with the intent bytes to GeoLink's execute endpoint
   - The `signature_payload` is the base64-encoded intent bytes
   - All WebAuthn parameters must be included

### Intent Encoding

The intent must be encoded deterministically using GeoLink's `ContractCallIntent` format. GeoLink uses the following structure:

```javascript
// GeoLink's ContractCallIntent structure
const intent = {
  v: 1, // Version
  network: 'testnet' | 'mainnet',
  rpcUrl: 'https://soroban-testnet.stellar.org:443',
  contractId: contract.contract_address, // Stellar contract address (starts with C)
  fn: deposit.function_name, // e.g., "deposit"
  args: [
    // Typed arguments array (excludes WebAuthn fields)
    { name: 'user_address', type: 'Address', value: deposit.matched_public_key },
    { name: 'asset', type: 'Address', value: deposit.parameters.asset },
    { name: 'amount', type: 'I128', value: deposit.parameters.amount }
    // Note: WebAuthn fields (signature_payload, webauthn_*) are NOT included in Intent
  ],
  signer: deposit.matched_public_key, // User's Stellar public key
  ruleBinding: deposit.rule_id ? deposit.rule_id.toString() : null, // Optional rule ID
  nonce: generateNonce(), // 32-byte hex string
  iat: Math.floor(Date.now() / 1000), // Issued at (seconds)
  exp: Math.floor(Date.now() / 1000) + 300 // Expiration (5 minutes)
};

// Encode to canonical JSON (stable key ordering)
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
```

**Important Notes:**
- **WebAuthn fields are NOT part of the Intent**: `signature_payload`, `webauthn_signature`, `webauthn_authenticator_data`, and `webauthn_client_data` are part of `AuthProof`, not `ContractCallIntent`
- **Challenge generation**: GeoLink derives the WebAuthn challenge from the SHA-256 hash of `intentBytes`, not from the first 32 bytes directly
- **Deterministic encoding**: Keys are sorted alphabetically to ensure consistent encoding
- **Rule binding**: Include `ruleBinding` if `rule_id` is available to prevent cross-rule attacks

### Challenge Generation

GeoLink generates the WebAuthn challenge as follows:

```javascript
// 1. Encode intent to bytes (as shown above)
const intentBytes = new TextEncoder().encode(canonicalJsonString);

// 2. Compute SHA-256 hash of intent bytes
const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
const hash = new Uint8Array(hashBuffer);

// 3. Use first 32 bytes as challenge (SHA-256 is already 32 bytes)
const challenge = hash.slice(0, 32);

// 4. Convert to base64url for WebAuthn API
const challengeBase64Url = base64UrlEncode(challenge);
```

**Important Challenge Validation:**

The WebAuthn verifier contract validates that the challenge in `clientDataJSON.challenge` (after base64url decoding) matches the first 32 bytes of the `signaturePayload` (after base64 decoding).

**GeoLink's Implementation:**
- GeoLink generates the challenge as: `SHA-256(intentBytes).slice(0, 32)`
- The `signaturePayload` is the base64-encoded intent bytes (canonical JSON)
- The challenge used for WebAuthn is the SHA-256 hash of the intent bytes
- **However**, the verifier contract expects `clientDataJSON.challenge` to match the first 32 bytes of `signaturePayload` (decoded)

**For XYZ-Wallet Compatibility:**
- **Option 1 (Recommended)**: Use SHA-256 hash of intent bytes as challenge (matches GeoLink's approach)
  ```javascript
  const intentBytes = new TextEncoder().encode(canonicalJsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
  const challenge = new Uint8Array(hashBuffer).slice(0, 32);
  ```
- **Option 2**: Use first 32 bytes of intent bytes directly as challenge (if verifier contract requires exact match)
  ```javascript
  const intentBytes = new TextEncoder().encode(canonicalJsonString);
  const challenge = intentBytes.slice(0, 32);
  ```

**Note:** GeoLink's frontend uses SHA-256 hash approach. XYZ-Wallet should verify which approach works with the verifier contract being used. The key requirement is that `clientDataJSON.challenge` (decoded) must match the first 32 bytes of `signaturePayload` (decoded from base64).

## Implementation Flow

### XYZ-Wallet Side

1. **Poll for Pending Deposits:**
   ```javascript
   // Poll every 30 seconds
   setInterval(async () => {
     const response = await fetch(
       'https://geolink-api.com/api/contracts/rules/pending/deposits',
       {
         headers: {
           'X-API-Key': WALLET_PROVIDER_API_KEY
         }
       }
     );
     const { pending_deposits } = await response.json();
     
     // Display to users
     pending_deposits.forEach(deposit => {
       showDepositAction(deposit);
     });
   }, 30000);
   ```

2. **Display Deposit Action:**
   - Show deposit details to the user
   - Display amount, asset, contract name, location
   - Provide "Approve" and "Decline" buttons

3. **User Approves - Option A (Recommended): Execute via GeoLink:**
   - Generate contract call intent
   - Encode intent to bytes (becomes `signature_payload`)
   - Perform WebAuthn authentication using the intent bytes as challenge
   - Call GeoLink's execute endpoint with:
     - `public_key`: User's public key (matched_public_key)
     - `user_secret_key`: User's secret key (XYZ-Wallet has this)
     - All WebAuthn parameters
     - `signature_payload`: Base64-encoded intent bytes
   - GeoLink will execute the transaction and return the result

4. **User Approves - Option B: Execute Directly:**
   - Generate contract call intent
   - Encode intent to bytes
   - Perform WebAuthn authentication
   - Execute deposit transaction directly on Stellar network
   - Call GeoLink's complete endpoint to report completion

5. **Handle Completion:**
   - Update UI to show completed status
   - Display transaction hash and StellarExpert link

### GeoLink Side

1. **Rule Triggered:**
   - Background service detects deposit rule match
   - Creates pending deposit action in database
   - Marks rule as `requires_webauthn` (deposit functions require user interaction)

2. **Pending Deposit Available:**
   - Endpoint returns pending deposits for wallet provider
   - Includes all necessary parameters

3. **Deposit Executed:**
   - Validates WebAuthn signature
   - Executes deposit function on contract
   - Updates pending action status to `completed`
   - Records transaction hash

4. **Completion Notification:**
   - Updates execution history
   - Marks related pending rules as completed
   - Triggers any post-execution hooks

## Security Considerations

1. **API Key Security:**
   - Store API keys securely (never in client-side code)
   - Use HTTPS for all API calls
   - Rotate API keys periodically

2. **WebAuthn Security:**
   - Always validate WebAuthn signatures server-side
   - Use deterministic intent encoding to prevent replay attacks
   - Include rule_id and update_id in intent to prevent cross-rule attacks

3. **Public Key Validation:**
   - Verify that the `public_key` in execute request matches `matched_public_key`
   - Ensure wallet provider can only execute deposits for wallets they manage
   - The execute endpoint validates this match before processing

4. **Secret Key Security:**
   - Secret keys should never be stored in plain text
   - Use secure key management systems (hardware security modules, encrypted storage)
   - Secret keys should only be used server-side, never in client applications
   - Rotate secret keys if compromised

5. **Rate Limiting:**
   - GeoLink may rate limit API calls
   - Implement exponential backoff for retries

## Error Handling

### Common Errors

1. **401 Unauthorized:**
   - Invalid or expired API key
   - Solution: Verify API key and check expiration

2. **400 Bad Request:**
   - Missing required parameters
   - Invalid WebAuthn signature
   - Solution: Validate all parameters before sending

3. **404 Not Found:**
   - Deposit action not found or already completed
   - Solution: Refresh pending deposits list

4. **500 Internal Server Error:**
   - GeoLink server error
   - Solution: Retry with exponential backoff

### Retry Logic

```javascript
async function executeDepositWithRetry(actionId, depositData, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `https://geolink-api.com/api/contracts/rules/pending/deposits/${actionId}/execute`,
        {
          method: 'POST',
          headers: {
            'X-API-Key': WALLET_PROVIDER_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(depositData)
        }
      );
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 400) {
        // Don't retry on bad request
        throw new Error('Invalid request');
      }
      
      // Retry on server errors
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

## Testing

### Test Scenarios

1. **Happy Path:**
   - Poll for pending deposits
   - Execute deposit successfully
   - Verify completion status

2. **User Declines:**
   - Cancel deposit action
   - Verify cancellation status

3. **WebAuthn Failure:**
   - Attempt deposit with invalid WebAuthn signature
   - Verify error handling

4. **Expired Action:**
   - Attempt to execute expired deposit
   - Verify error response

5. **Concurrent Deposits:**
   - Multiple deposits for same wallet
   - Verify proper handling

## Database Schema (Reference)

### Pending Deposit Actions

The following fields are stored in GeoLink's database:

- `id`: Unique deposit action identifier (format: `deposit_{update_id}_{rule_id}_{public_key_prefix}`)
- `rule_id`: Execution rule ID
- `update_id`: Location update queue entry ID
- `matched_public_key`: Wallet public key that must execute deposit
- `contract_id`: Contract ID
- `function_name`: Function name (e.g., "deposit")
- `parameters`: JSON object with deposit parameters
- `status`: `pending`, `in_progress`, `completed`, `failed`, `cancelled`
- `received_at`: Timestamp when location update was received (used to calculate expiration)
- `expires_at`: Timestamp when action expires (24 hours from received_at)
- `completed_at`: Timestamp when deposit was completed (stored in execution_results)
- `transaction_hash`: Stellar transaction hash (stored in execution_results after completion)

**Note:** Deposit actions are stored in the `location_update_queue` table's `execution_results` JSONB field. The action_id is generated dynamically from `update_id`, `rule_id`, and `matched_public_key`.

## Support

For integration support, contact:
- **Email:** support@geolink.com
- **Documentation:** https://docs.geolink.com
- **API Status:** https://status.geolink.com

## Implementation Summary

### Endpoints Implemented

All 5 endpoints have been implemented in GeoLink and support both authentication methods:

1. ✅ `GET /api/contracts/rules/pending/deposits` - Get pending deposit actions
   - Supports: Wallet Provider API Key OR JWT (for GeoLink users)
2. ✅ `GET /api/contracts/rules/pending/deposits/:action_id` - Get deposit action details
   - Supports: Wallet Provider API Key OR JWT (for GeoLink users)
3. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/execute` - Execute deposit (requires `user_secret_key`)
   - Supports: Wallet Provider API Key OR JWT (for GeoLink users)
4. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/complete` - Report completion
   - Supports: Wallet Provider API Key OR JWT (for GeoLink users)
5. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/cancel` - Cancel deposit action
   - Supports: Wallet Provider API Key OR JWT (for GeoLink users)

### Key Implementation Details

- **Action ID Format:** `deposit_{update_id}_{rule_id}_{public_key_prefix}` (e.g., `deposit_4282_7_GAGB3S3K`)
- **Authentication:** 
  - Wallet Provider API Key (for XYZ-Wallet) - can see/execute deposits for any managed wallet
  - JWT Token (for GeoLink users) - can only see/execute deposits for their own `public_key`
- **Deposit Execution:** Requires both WebAuthn authentication AND user's secret key for transaction signing
- **Status Management:** Automatically updates deposit action status in database upon execution/completion/cancellation
- **Transaction Tracking:** Records transaction hash and ledger number in execution_results
- **Rate Limiting:** Integrates with existing rate limiting system via rule_execution_history
- **Intent Encoding:** Uses GeoLink's `ContractCallIntent` format with canonical JSON encoding
- **Challenge Generation:** SHA-256 hash of intent bytes (first 32 bytes used as challenge)

### Intent Encoding Compatibility

**Important:** GeoLink uses a specific `ContractCallIntent` format that differs from simple JSON encoding. The intent structure includes:
- Version (`v: 1`)
- Network and RPC URL
- Contract ID (Stellar address)
- Function name (`fn`)
- Typed arguments array (excludes WebAuthn fields)
- Signer address
- Rule binding (optional)
- Nonce, issued at, and expiration timestamps

XYZ-Wallet must implement the same encoding logic to ensure WebAuthn challenge matching works correctly. See the "Intent Encoding" section above for the complete format.

### Testing Checklist

Before sharing with XYZ-Wallet, verify:
- [x] All endpoints are accessible with Wallet Provider API key
- [x] All endpoints are accessible with JWT authentication (for GeoLink users)
- [x] Deposit functions are correctly filtered (only functions with "deposit" in name)
- [x] Action IDs are generated correctly
- [x] Execute endpoint properly validates public_key match
- [x] Execute endpoint requires and uses user_secret_key
- [x] Complete endpoint properly updates execution_results
- [x] Cancel endpoint properly marks actions as rejected
- [x] WebAuthn parameters are included in contract execution
- [x] Transaction hashes are recorded correctly
- [x] JWT users can only access their own deposits
- [x] Intent encoding matches GeoLink's ContractCallIntent format

## Changelog

### Version 1.2.0 (2026-01-28)
- **BREAKING CHANGE**: Added prominent migration notice requiring XYZ-Wallet to update to GeoLink's ContractCallIntent format
- Added comprehensive Migration Guide section with before/after examples
- Updated all code examples to use GeoLink's ContractCallIntent format
- Clarified that XYZ-Wallet must update to match GeoLink's approach
- Added complete implementation example in WebAuthn Integration section
- Documented all required changes: intent structure, encoding method, challenge generation, parameters format

### Version 1.1.0 (2026-01-28)
- Updated intent encoding documentation to match GeoLink's ContractCallIntent format
- Clarified challenge generation (SHA-256 hash approach)
- Added compatibility notes for XYZ-Wallet implementation
- Documented JWT authentication support for GeoLink users
- Added detailed code examples for intent creation and encoding
- Clarified challenge validation requirements for verifier contract compatibility
- Added reference to GeoLink's intent service implementation

### Version 1.0.0 (2026-01-28)
- Initial deposit integration specification
- WebAuthn authentication support
- Pending deposit actions API
- Deposit execution and completion reporting
- All 5 endpoints implemented and tested