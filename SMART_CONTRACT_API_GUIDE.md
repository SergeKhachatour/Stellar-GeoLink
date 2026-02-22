# Smart Contract API Guide

**Complete API Reference for XYZ-Wallet, GeoTrust, and Other GeoLink Consumers**

This guide documents all smart contract endpoints available in the GeoLink API, designed for wallet providers and data consumers to integrate geo-driven smart contract execution rules.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Contract Discovery & Management](#contract-discovery--management)
3. [Execution Rules Management](#execution-rules-management)
4. [Location-Based Rule Discovery](#location-based-rule-discovery)
5. [Rule Execution](#rule-execution)
6. [Pending Rules Management](#pending-rules-management)
7. [Smart Wallet Integration](#smart-wallet-integration)
8. [WASM File Management](#wasm-file-management)
9. [Advanced Features](#advanced-features)

---

## Authentication

All endpoints support **two authentication methods**:

### 1. JWT Token (Bearer Token)
```http
Authorization: Bearer <your_jwt_token>
```

### 2. API Key (X-API-Key Header)
```http
X-API-Key: <your_api_key>
```

**Note**: API keys are available for:
- **Wallet Providers** (via `wallet_providers` table)
- **Data Consumers** (via `data_consumers` table)

---

## Contract Discovery & Management

### 1. Discover Contract Functions

**Endpoint**: `POST /api/contracts/discover`

**Description**: Auto-discover available functions in a Soroban smart contract.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
  "network": "testnet"  // Optional: "testnet" or "mainnet" (default: "testnet")
}
```

**Response**:
```json
{
  "success": true,
  "functions": [
    {
      "name": "execute_payment",
      "signature": "execute_payment(asset:Address, amount:I128, destination:Address, ...)",
      "parameters": [...],
      "returns": "Void"
    }
  ],
  "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
  "network": "testnet"
}
```

---

### 2. Create/Register Contract

**Endpoint**: `POST /api/contracts`

**Description**: Register a new smart contract configuration.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
  "contract_name": "My Payment Contract",
  "network": "testnet",
  "discovered_functions": {...},  // From discovery endpoint
  "function_mappings": {...},     // Optional: Parameter mappings
  "use_smart_wallet": false,
  "requires_webauthn": false,
  "is_active": true
}
```

**Response**:
```json
{
  "success": true,
  "contract": {
    "id": 1,
    "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
    "contract_name": "My Payment Contract",
    "network": "testnet",
    "discovered_functions": {...},
    "function_mappings": {...},
    "created_at": "2026-02-05T12:00:00Z"
  }
}
```

---

### 3. Get User's Contracts

**Endpoint**: `GET /api/contracts`

**Description**: Retrieve all contracts registered by the authenticated user.

**Authentication**: Required (JWT or API Key)

**Response**:
```json
{
  "success": true,
  "contracts": [
    {
      "id": 1,
      "contract_address": "...",
      "contract_name": "...",
      "network": "testnet",
      "is_active": true,
      ...
    }
  ],
  "count": 1
}
```

---

### 4. Get Specific Contract

**Endpoint**: `GET /api/contracts/:id`

**Description**: Get details for a specific contract.

**Authentication**: Required (JWT or API Key)

**Response**:
```json
{
  "success": true,
  "contract": {
    "id": 1,
    "contract_address": "...",
    "contract_name": "...",
    "discovered_functions": {...},
    "function_mappings": {...},
    ...
  }
}
```

---

### 5. Update Contract

**Endpoint**: `PUT /api/contracts/:id`

**Description**: Update contract configuration.

**Authentication**: Required (JWT or API Key)

**Request Body**: Same as POST, but all fields optional (only include fields to update)

---

### 6. Update Function Mappings

**Endpoint**: `PUT /api/contracts/:id/mappings`

**Description**: Update parameter mappings for contract functions.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "function_mappings": {
    "execute_payment": {
      "destination": "destination",
      "amount": "amount",
      "asset": "asset"
    }
  }
}
```

---

### 7. Delete/Deactivate Contract

**Endpoint**: `DELETE /api/contracts/:id`

**Description**: Deactivate a contract (soft delete - sets `is_active = false`).

**Authentication**: Required (JWT or API Key)

---

## Execution Rules Management

### 1. Create Execution Rule

**Endpoint**: `POST /api/contracts/rules`

**Description**: Create a new geo-driven execution rule.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "contract_id": 1,
  "rule_name": "Payment at Location X",
  "rule_type": "location",  // "location", "proximity", or "geofence"
  
  // Location-based (required for rule_type: "location" or "proximity")
  "center_latitude": 34.0164,
  "center_longitude": -118.4951,
  "radius_meters": 1000,
  
  // Geofence-based (required for rule_type: "geofence")
  "geofence_id": 5,  // Optional: if using geofence instead of radius
  
  // Function configuration
  "function_name": "execute_payment",
  "function_parameters": {
    "asset": "native",
    "amount": 10000000,
    "destination": "GABC123..."
  },
  
  // Trigger settings
  "trigger_on": "enter",  // "enter", "exit", or "both"
  "auto_execute": false,  // true = auto-execute, false = requires confirmation
  "requires_confirmation": true,
  
  // Target wallet filtering
  "target_wallet_public_key": null,  // null = any wallet, or specific public key
  
  // Quorum/multi-wallet support
  "required_wallet_public_keys": null,  // Array of public keys
  "minimum_wallet_count": null,        // Minimum wallets needed
  "quorum_type": "any",                // "any", "all", or "majority"
  
  // Rate limiting
  "max_executions_per_public_key": 1,
  "execution_time_window_seconds": 86400,  // 24 hours
  
  // Location duration requirement
  "min_location_duration_seconds": 60,  // Must be at location for 60 seconds
  
  // Auto-deactivation on balance threshold
  "auto_deactivate_on_balance_threshold": false,
  "balance_threshold_xlm": null,
  "balance_check_asset_address": null,
  "use_smart_wallet_balance": false,
  
  // Submit read-only functions to ledger
  "submit_readonly_to_ledger": false
}
```

**Response**:
```json
{
  "success": true,
  "rule": {
    "id": 1,
    "rule_name": "Payment at Location X",
    "rule_type": "location",
    "center_latitude": 34.0164,
    "center_longitude": -118.4951,
    "radius_meters": 1000,
    "function_name": "execute_payment",
    "is_active": true,
    "created_at": "2026-02-05T12:00:00Z"
  }
}
```

---

### 2. Get All Execution Rules

**Endpoint**: `GET /api/contracts/rules`

**Description**: Get all execution rules for the authenticated user.

**Authentication**: Required (JWT or API Key)

**Query Parameters**:
- `contract_id` (optional): Filter by contract ID
- `is_active` (optional): Filter by active status (true/false)

**Response**:
```json
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "rule_name": "Payment at Location X",
      "rule_type": "location",
      "contract_id": 1,
      "contract_name": "My Payment Contract",
      "function_name": "execute_payment",
      "is_active": true,
      ...
    }
  ],
  "count": 1
}
```

---

### 3. Get Specific Rule

**Endpoint**: `GET /api/contracts/rules/:id`

**Description**: Get details for a specific execution rule.

**Authentication**: Required (JWT or API Key)

---

### 4. Update Execution Rule

**Endpoint**: `PUT /api/contracts/rules/:id`

**Description**: Update an execution rule (all fields optional - only include fields to update).

**Authentication**: Required (JWT or API Key)

**Request Body**: Same as POST, but all fields optional

---

### 5. Delete Execution Rule

**Endpoint**: `DELETE /api/contracts/rules/:id`

**Description**: Delete an execution rule (hard delete).

**Authentication**: Required (JWT or API Key)

---

### 6. Get Rule Quorum Status

**Endpoint**: `GET /api/contracts/rules/:id/quorum`

**Description**: Get quorum status for multi-wallet rules.

**Authentication**: Required (JWT or API Key)

**Response**:
```json
{
  "success": true,
  "quorum_status": {
    "required_wallets": ["GABC...", "GDEF..."],
    "minimum_count": 2,
    "current_wallets": ["GABC..."],
    "quorum_met": false,
    "quorum_type": "any"
  }
}
```

---

## Location-Based Rule Discovery

### 1. Get Nearby Contracts (Public Endpoint)

**Endpoint**: `GET /api/contracts/nearby`

**Description**: **PUBLIC ENDPOINT** - Get **ONLY ACTIVE** contract execution rules within a specified radius. Inactive rules are not shown. This is the main endpoint for wallet apps to discover nearby smart contracts.

**Authentication**: **NONE REQUIRED** (Public endpoint)

**Query Parameters**:
- `latitude` (required): Center latitude
- `longitude` (required): Center longitude
- `radius` (optional): Search radius in meters (default: 1000, max: 100000)

**Example Request**:
```http
GET /api/contracts/nearby?latitude=34.0164&longitude=-118.4951&radius=2000
```

**Response**:
```json
{
  "contracts": [
    {
      "id": 1,
      "rule_name": "Payment at Location X",
      "rule_type": "location",
      "contract_name": "My Payment Contract",
      "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
      "function_name": "execute_payment",
      "latitude": 34.0164,
      "longitude": -118.4951,
      "radius_meters": 1000,
      "distance": 0.0,  // Distance from search center in meters
      "network": "testnet",
      "trigger_on": "enter",
      "auto_execute": false,
      "is_active": true  // ⚠️ NOTE: Only active rules are shown (inactive rules are filtered out)
      "requires_webauthn": false,
      "use_smart_wallet": false,
      "function_mappings": {...},
      "discovered_functions": [...]
    }
  ],
  "count": 1,
  "search_center": {
    "latitude": 34.0164,
    "longitude": -118.4951
  },
  "radius": 2000
}
```

**Important Notes**:
- ✅ **Only shows ACTIVE rules** - Inactive rules are completely filtered out
- ✅ Only filters out rules where the contract itself is inactive
- ✅ All returned rules will have `"is_active": true`

---

### 2. Get User's Rule Locations (Authenticated)

**Endpoint**: `GET /api/contracts/execution-rules/locations`

**Description**: Get all active location-based rules for the authenticated user (for map display).

**Authentication**: Required (JWT or API Key)

**Response**:
```json
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "type": "contract_rule",
      "rule_name": "Payment at Location X",
      "rule_type": "location",
      "latitude": 34.0164,
      "longitude": -118.4951,
      "radius_meters": 1000,
      "function_name": "execute_payment",
      "contract_name": "My Payment Contract",
      "contract_address": "...",
      "network": "testnet",
      "trigger_on": "enter",
      "auto_execute": false,
      "is_active": true
    }
  ]
}
```

---

## Rule Execution

### 1. Execute Contract Function

**Endpoint**: `POST /api/contracts/:id/execute`

**Description**: Execute a contract function directly (not via execution rule).

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "function_name": "execute_payment",
  "parameters": {
    "asset": "native",
    "amount": 10000000,
    "destination": "GABC123..."
  },
  "user_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA",
  
  // Option 1: Signed XDR (RECOMMENDED - most secure)
  "signedXDR": "AAAAA...",
  
  // Option 2: Secret key (less secure - backward compatibility)
  "user_secret_key": "S...",
  
  // Option 3: WebAuthn (for passkey-based authentication)
  "passkeyPublicKeySPKI": "...",
  "webauthnSignature": "...",
  "webauthnAuthenticatorData": "...",
  "webauthnClientData": "...",
  "signaturePayload": "...",
  
  // Optional: For rule-based execution
  "rule_id": 1,
  "update_id": 1234,
  "matched_public_key": "GDPMUX3X...",
  
  // Optional: Force read-only functions to be submitted to ledger
  "submit_to_ledger": false
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "txHash": "abc123...",
    "status": "SUCCESS",
    "returnValue": true,
    "ledger": 854521,
    "stellarExpertUrl": "https://stellar.expert/explorer/testnet/tx/abc123..."
  }
}
```

**Security Notes**:
- ✅ **Prefer `signedXDR`** - Secret key never leaves the client
- ⚠️ `user_secret_key` is supported for backward compatibility but less secure
- ✅ WebAuthn is supported for passkey-based authentication

---

### 2. Test Contract Function (Simulation)

**Endpoint**: `POST /api/contracts/:id/test-function`

**Description**: Simulate/test a contract function without submitting to the ledger.

**Authentication**: Required (JWT or API Key)

**Request Body**: Same as execute endpoint, but no signing required (simulation only)

**Response**: Returns simulation result without transaction hash

---

## Pending Rules Management

### 1. Get Pending Rules

**Endpoint**: `GET /api/contracts/rules/pending`

**Description**: Get all pending rules that require user confirmation/WebAuthn.

**Authentication**: Required (JWT or API Key)

**Query Parameters**:
- `public_key` (optional): Filter by public key
- `limit` (optional): Limit results (default: 100)

**Response**:
```json
{
  "success": true,
  "pending_rules": [
    {
      "rule_id": 1,
      "rule_name": "Payment at Location X",
      "function_name": "execute_payment",
      "function_parameters": {...},
      "contract_id": 1,
      "contract_name": "My Payment Contract",
      "contract_address": "...",
      "requires_webauthn": true,
      "update_id": 1234,
      "public_key": "GDPMUX3X...",
      "matched_public_key": "GDPMUX3X...",
      "latitude": 34.0164,
      "longitude": -118.4951,
      "received_at": "2026-02-05T12:00:00Z"
    }
  ],
  "count": 1
}
```

---

### 2. Get Pending Deposits

**Endpoint**: `GET /api/contracts/rules/pending/deposits`

**Description**: Get all pending deposit rules (specialized endpoint for deposit operations).

**Authentication**: Required (JWT or API Key)

**Response**: Same format as pending rules, but filtered to deposit functions

---

### 3. Get Specific Pending Deposit

**Endpoint**: `GET /api/contracts/rules/pending/deposits/:action_id`

**Description**: Get details for a specific pending deposit action.

**Authentication**: Required (JWT or API Key)

---

### 4. Execute Pending Deposit

**Endpoint**: `POST /api/contracts/rules/pending/deposits/:action_id/execute`

**Description**: Execute a pending deposit rule with WebAuthn authentication.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "signedXDR": "AAAAA...",  // Signed transaction XDR (RECOMMENDED)
  
  // OR WebAuthn data
  "passkeyPublicKeySPKI": "...",
  "webauthnSignature": "...",
  "webauthnAuthenticatorData": "...",
  "webauthnClientData": "...",
  "signaturePayload": "...",
  
  // Optional: For server-side signing (less secure)
  "user_public_key": "GDPMUX3X...",
  "user_secret_key": "S..."
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "txHash": "abc123...",
    "status": "SUCCESS",
    "returnValue": true,
    "contractLogs": [...],
    "stellarExpertUrl": "https://stellar.expert/explorer/testnet/tx/abc123..."
  }
}
```

---

### 5. Complete Pending Rule

**Endpoint**: `POST /api/contracts/rules/pending/:ruleId/complete`

**Description**: Mark a pending rule as completed (after manual execution).

**Authentication**: Required (JWT or API Key)

---

### 6. Reject Pending Rule

**Endpoint**: `POST /api/contracts/rules/pending/:ruleId/reject`

**Description**: Reject a pending rule (user declined execution).

**Authentication**: Required (JWT or API Key)

---

### 7. Get Completed Rules

**Endpoint**: `GET /api/contracts/rules/completed`

**Description**: Get history of completed rule executions.

**Authentication**: Required (JWT or API Key)

---

### 8. Get Rejected Rules

**Endpoint**: `GET /api/contracts/rules/rejected`

**Description**: Get history of rejected rule executions.

**Authentication**: Required (JWT or API Key)

---

## Smart Wallet Integration

### 1. Get Smart Wallet Balance

**Endpoint**: `GET /api/smart-wallet/balance`

**Description**: Get user's balance from smart wallet contract.

**Authentication**: Required (JWT)

**Query Parameters**:
- `userPublicKey` (required): User's Stellar public key
- `contractId` (optional): Smart wallet contract ID
- `assetAddress` (optional): Asset contract address (default: native XLM)

**Response**:
```json
{
  "balance": "1000000000",
  "balanceInXLM": "100",
  "contractId": "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
  "assetAddress": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
}
```

---

### 2. Deposit to Smart Wallet

**Endpoint**: `POST /api/smart-wallet/deposit`

**Description**: Deposit tokens to smart wallet contract.

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "user_public_key": "GDPMUX3X...",
  "amount": 330000000,  // In stroops (33 XLM)
  "asset": "native",    // or contract address
  
  // Option 1: Signed XDR (RECOMMENDED)
  "signedXDR": "AAAAA...",
  
  // Option 2: WebAuthn
  "passkeyPublicKeySPKI": "...",
  "webauthnSignature": "...",
  "webauthnAuthenticatorData": "...",
  "webauthnClientData": "...",
  "signaturePayload": "..."
}
```

**Response**:
```json
{
  "success": true,
  "txHash": "abc123...",
  "ledger": 854521,
  "stellarExpertUrl": "https://stellar.expert/explorer/testnet/tx/abc123..."
}
```

---

### 3. Get Vault Balance

**Endpoint**: `GET /api/smart-wallet/vault-balance`

**Description**: Get total vault balance (sum of all user deposits).

**Authentication**: Required (JWT)

**Query Parameters**:
- `contractId` (optional): Smart wallet contract ID
- `assetAddress` (optional): Asset contract address (default: native XLM)

**Response**:
```json
{
  "balance": "337640778913",
  "balanceInXLM": "33764",
  "contractId": "...",
  "assetAddress": "..."
}
```

---

## WASM File Management

### 1. Upload WASM File

**Endpoint**: `POST /api/contracts/upload-wasm`

**Description**: Upload a WASM file for a contract.

**Authentication**: Required (JWT or API Key)

**Content-Type**: `multipart/form-data`

**Form Data**:
- `wasm` (file): WASM file to upload
- `contract_id` (optional): Associate with existing contract

---

### 2. Upload WASM for Specific Contract

**Endpoint**: `POST /api/contracts/:id/upload-wasm`

**Description**: Upload WASM file for a specific contract.

**Authentication**: Required (JWT or API Key)

**Content-Type**: `multipart/form-data`

**Form Data**:
- `wasm` (file): WASM file to upload

---

### 3. Fetch WASM from Network

**Endpoint**: `POST /api/contracts/:id/fetch-wasm`

**Description**: Fetch WASM file directly from Stellar network.

**Authentication**: Required (JWT or API Key)

**Request Body**:
```json
{
  "network": "testnet"  // Optional: override contract's network
}
```

---

### 4. Get WASM File

**Endpoint**: `GET /api/contracts/:id/wasm`

**Description**: Download WASM file for a contract.

**Authentication**: Required (JWT or API Key)

**Response**: Binary WASM file

---

## Advanced Features

### 1. Agent Onboarding

**Endpoint**: `POST /api/contracts/agent-onboard`

**Description**: Onboard an AI agent for contract management.

**Authentication**: Required (JWT or API Key)

---

### 2. Cleanup Pending Rules

**Endpoint**: `POST /api/contracts/rules/pending/cleanup`

**Description**: Manually trigger cleanup of old pending rules.

**Authentication**: Required (JWT or API Key)

---

## How Geo-Driven Execution Works

### The Flow

1. **Location Update**: Wallet app sends location update via `POST /api/location/update`
2. **Background Processing**: GeoLink's background AI service processes the location update
3. **Rule Matching**: System checks if public key is within any execution rule's radius
4. **Qualification Checks**: Rule must pass:
   - ✅ Location within radius
   - ✅ Target wallet matches (if specified)
   - ✅ Rate limit not exceeded
   - ✅ Location duration requirement met (if specified)
   - ✅ Auto-execute setting allows execution
5. **Execution or Queuing**:
   - If `auto_execute = true` and no WebAuthn required → **Auto-executes**
   - If `auto_execute = false` or WebAuthn required → **Queued as pending rule**

### Rule Qualification Criteria

A public key qualifies for a rule when:

1. **Initial Qualification** (`getActiveRulesForLocation`):
   - ✅ Rule is active (`is_active = true`)
   - ✅ Contract is active (`is_active = true`)
   - ✅ Location is within radius (for location/proximity) OR within geofence
   - ✅ Target wallet matches (`target_wallet_public_key IS NULL` OR matches public key)

2. **Advanced Settings Evaluation**:
   - ✅ Target wallet check (double-checked)
   - ✅ Auto-execute check (`auto_execute = true` for auto-execution)
   - ✅ Rate limiting check (if configured)
   - ✅ Location duration check (if `min_location_duration_seconds` is set)
   - ✅ WebAuthn requirement (if contract requires WebAuthn)

### Important Notes

- **Rules match from ALL users**: When a location update is received, the system checks if the public key is within **ANY** user's execution rule radius, not just the user who sent the update.
- **Inactive rules are visible**: The `/api/contracts/nearby` endpoint shows both active and inactive rules (like `nearbyNFTs`). Wallet apps should check the `is_active` field.
- **Pending rules require action**: Rules that require WebAuthn or confirmation are queued and must be executed via the pending rules endpoints.

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "details": "Additional error details (in development mode)"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `201` - Created
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Best Practices

### 1. Use Signed XDR
Always prefer `signedXDR` over `user_secret_key` for better security.

### 2. Check Rule Status
When displaying nearby contracts, check `is_active` field and handle inactive rules appropriately.

### 3. Handle Pending Rules
Implement UI to show pending rules and allow users to execute/reject them.

### 4. Rate Limiting
Respect rate limits configured in execution rules.

### 5. Location Updates
Send location updates regularly (e.g., every 5-10 seconds) for accurate rule matching.

### 6. Error Handling
Always handle errors gracefully and provide user feedback.

---

## Example Integration Flow

### For Wallet Apps (XYZ-Wallet, GeoTrust)

1. **Discover Nearby Contracts**:
   ```javascript
   const response = await fetch(
     `${GEO_LINK_API}/contracts/nearby?latitude=${lat}&longitude=${lng}&radius=${radius}`
   );
   const data = await response.json();
   // Display contracts on map
   ```

2. **Show Pending Rules**:
   ```javascript
   const response = await fetch(
     `${GEO_LINK_API}/contracts/rules/pending`,
     {
       headers: {
         'Authorization': `Bearer ${token}`,
         // OR
         'X-API-Key': apiKey
       }
     }
   );
   const data = await response.json();
   // Show pending rules to user
   ```

3. **Execute Pending Rule**:
   ```javascript
   // Sign transaction on client
   const signedXDR = await signTransaction(tx);
   
   const response = await fetch(
     `${GEO_LINK_API}/contracts/rules/pending/deposits/${actionId}/execute`,
     {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         signedXDR: signedXDR
       })
     }
   );
   ```

---

## Support

For questions or issues, contact the GeoLink team or refer to the main API documentation.

**Last Updated**: February 5, 2026
