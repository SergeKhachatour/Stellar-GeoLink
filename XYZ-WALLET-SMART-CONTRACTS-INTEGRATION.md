# XYZ-Wallet Smart Contracts Integration Guide

## Overview

GeoLink now supports displaying **Smart Contract Execution Rules** on the map alongside NFTs. This document explains how XYZ-Wallet should integrate this new feature to display and allow users to interact with nearby smart contracts.

## What Changed

Previously, XYZ-Wallet only displayed **NFTs** on the map using the `/api/nft/nearby` endpoint. Now, GeoLink also provides **Smart Contract Execution Rules** that can be displayed on the map.

### Smart Contract Execution Rules

These are location-based rules that trigger smart contract functions when a user is within a specified radius. Examples:
- **Payment Rules**: Automatically send payments when user enters a location
- **Check-in Rules**: Execute contract functions when user arrives at a location
- **Data Collection Rules**: Collect location data and execute contract functions

## API Endpoints

### 1. Get Nearby Smart Contracts

**Endpoint**: `GET /api/contracts/nearby`

**Authentication**: None required (public endpoint)

**Query Parameters**:
- `latitude` (required): Center latitude
- `longitude` (required): Center longitude
- `radius` (optional): Search radius in meters (default: 1000)

**Example Request**:
```bash
GET /api/contracts/nearby?latitude=34.0164&longitude=-118.4951&radius=1000
```

**Response Format**:
```json
{
  "contracts": [
    {
      "id": 7,
      "rule_name": "Santa Monica - Send Payment",
      "rule_type": "location",
      "contract_name": "Smart Wallet",
      "contract_address": "CC74XDT7UVLUZCELKBIYXFYIX6A6LGPWURJVUXGRPQO745RWX7WEURMA",
      "function_name": "execute_payment",
      "latitude": 34.0164,
      "longitude": -118.4951,
      "radius_meters": 50000,
      "distance": 0.0,
      "network": "testnet",
      "trigger_on": "within",
      "auto_execute": true,
      "requires_webauthn": true,
      "use_smart_wallet": true,
      "function_mappings": {
    "execute_payment": {
      "destination": "string",
      "amount": "i128",
      "asset": "address"
    }
  },
      "discovered_functions": [...]
    }
  ],
  "count": 1,
  "search_center": {
    "latitude": 34.0164,
    "longitude": -118.4951
  },
  "radius": 1000
}
```

### 2. Combined Endpoint (Recommended)

**Option A**: Call both endpoints separately
- `/api/nft/nearby` for NFTs
- `/api/contracts/nearby` for smart contracts

**Option B**: Use existing `/api/nft/nearby` endpoint (it already includes contract info for NFTs)

**Recommended**: Use **Option A** for better separation and clarity.

## Response Fields Explained

### Core Fields
- `id`: Unique rule ID
- `rule_name`: Human-readable rule name (e.g., "Santa Monica - Send Payment")
- `contract_name`: Name of the smart contract
- `contract_address`: Stellar contract address (Soroban)
- `function_name`: Contract function to execute (e.g., "execute_payment", "test")
- `latitude` / `longitude`: Center coordinates of the rule
- `radius_meters`: Radius in meters where rule is active
- `distance`: Distance from search center to rule center (in meters)

### Execution Fields
- `trigger_on`: When rule triggers ("within", "exit", "enter")
- `auto_execute`: Whether rule executes automatically (true) or requires manual execution (false)
- `requires_webauthn`: Whether WebAuthn/passkey is required for execution
- `use_smart_wallet`: Whether this rule uses smart wallet routing

### Contract Details
- `function_mappings`: JSON object mapping function names to their parameter schemas
- `discovered_functions`: Array of all functions available on the contract
- `network`: Network name ("testnet" or "mainnet")

## Display on Map

### Visual Differentiation

**Smart Contracts** should be displayed differently from NFTs:

1. **Icon/Color**: Use a different icon (e.g., ⚡ or 🔗) and color (e.g., blue/purple) to distinguish from NFTs
2. **Marker Type**: Set `marker_type: "smart_contract"` or `type: "contract_rule"`
3. **Info Window**: Show contract-specific information:
   - Rule name
   - Contract name and address
   - Function name
   - Radius (draw circle on map)
   - Auto-execute status
   - WebAuthn requirement

### Map Marker Example

```javascript
{
  id: 7,
  type: "smart_contract", // or "contract_rule"
  latitude: 34.0164,
  longitude: -118.4951,
  radius_meters: 50000,
  // ... other fields
}
```

## User Interactions

### 1. View Contract Details

When user taps/clicks a smart contract marker:
- Show rule name
- Show contract address (with link to Stellar Explorer)
- Show function name and parameters
- Show radius circle on map
- Show execution status (auto-execute vs manual)

### 2. Execute Contract Function

If `auto_execute: false`, provide a button to manually execute the contract function.

**Execution Flow**:
1. Check if `requires_webauthn: true`
   - If yes: Prompt user for WebAuthn/passkey authentication
   - If no: Proceed directly
2. Check if `use_smart_wallet: true`
   - If yes: Route through smart wallet payment endpoint
   - If no: Execute contract function directly
3. Call appropriate GeoLink API endpoint (see below)

### 3. Execution API Endpoints

#### For Regular Contract Functions:
**Endpoint**: `POST /api/contracts/:contract_id/execute`

**Authentication**: JWT token (user must be logged in)

**Request Body**:
```json
{
  "function_name": "execute_payment",
  "parameters": {
    "destination": "GABC123...",
    "amount": 10000000,
    "asset": "native"
  },
  "user_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA",
  "webauthn_signature": "...",
  "webauthn_authenticator_data": "...",
  "webauthn_client_data": "...",
  "signature_payload": "..."
}
```

#### For Smart Wallet Payments:
**Endpoint**: `POST /api/smart-wallet/execute-payment`

**Authentication**: JWT token

**Request Body**:
```json
{
  "destination": "GABC123...",
  "amount": 10000000,
  "asset": "native",
  "user_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA",
  "user_secret_key": "S...",
  "webauthn_signature": "...",
  "webauthn_authenticator_data": "...",
  "webauthn_client_data": "...",
  "signature_payload": "...",
  "rule_id": 7,
  "update_id": 1234,
  "matched_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA"
}
```

## Implementation Steps for XYZ-Wallet

### Step 1: Update Map Data Fetching

Modify your map data fetching logic to call both endpoints:

```javascript
// Fetch nearby NFTs
const nftResponse = await fetch(`${GEO_LINK_API}/nft/nearby?latitude=${lat}&longitude=${lng}&radius=${radius}`);
const nftData = await nftResponse.json();

// Fetch nearby smart contracts
const contractResponse = await fetch(`${GEO_LINK_API}/contracts/nearby?latitude=${lat}&longitude=${lng}&radius=${radius}`);
const contractData = await contractResponse.json();

// Combine for map display
const allMarkers = [
  ...nftData.nfts.map(nft => ({ ...nft, type: 'nft' })),
  ...contractData.contracts.map(contract => ({ ...contract, type: 'smart_contract' }))
];
```

### Step 2: Update Map Rendering

Add logic to render smart contract markers differently:

```javascript
// In your map rendering code
allMarkers.forEach(marker => {
  if (marker.type === 'nft') {
    // Render NFT marker (existing logic)
    renderNFTMarker(marker);
  } else if (marker.type === 'smart_contract') {
    // Render smart contract marker (new logic)
    renderContractMarker(marker);
  }
});
```

### Step 3: Add Contract Info Window

Create a new component for smart contract info windows:

```javascript
function ContractInfoWindow({ contract }) {
  return (
    <div className="contract-info-window">
      <h3>{contract.rule_name}</h3>
      <p><strong>Contract:</strong> {contract.contract_name}</p>
      <p><strong>Function:</strong> {contract.function_name}</p>
      <p><strong>Address:</strong> {contract.contract_address.substring(0, 16)}...</p>
      <p><strong>Radius:</strong> {contract.radius_meters}m</p>
      {!contract.auto_execute && (
        <button onClick={() => executeContract(contract)}>
          Execute {contract.function_name}
        </button>
      )}
    </div>
  );
}
```

### Step 4: Implement Contract Execution

Add function to execute contract when user clicks button:

```javascript
async function executeContract(contract) {
  // Check if WebAuthn is required
  if (contract.requires_webauthn) {
    // Prompt for WebAuthn authentication
    const webauthnData = await promptWebAuthn();
    // Include webauthnData in request
  }
  
  // Check if smart wallet routing is needed
  if (contract.use_smart_wallet) {
    // Call smart wallet endpoint
    await fetch(`${GEO_LINK_API}/smart-wallet/execute-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        destination: contract.function_mappings.execute_payment.destination,
        amount: contract.function_mappings.execute_payment.amount,
        asset: contract.function_mappings.execute_payment.asset,
        user_public_key: userPublicKey,
        user_secret_key: userSecretKey, // Required for smart wallet
        webauthnData: webauthnData,
        rule_id: contract.id
      })
    });
  } else {
    // Call regular contract execution endpoint
    await fetch(`${GEO_LINK_API}/contracts/${contract.contract_id}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        function_name: contract.function_name,
        parameters: contract.function_mappings[contract.function_name],
        user_public_key: userPublicKey,
        webauthnData: webauthnData
      })
    });
  }
}
```

## Key Differences: NFTs vs Smart Contracts

| Feature | NFTs | Smart Contracts |
|---------|------|-----------------|
| **Type** | Digital collectibles | Executable rules |
| **Action** | Collect/view | Execute function |
| **Location** | Single point | Circle (radius) |
| **Interaction** | View details, collect | Execute, view pending rules |
| **Authentication** | Usually not required | May require WebAuthn |
| **Auto-execution** | N/A | Yes/No (configurable) |

## Testing Checklist

- [ ] Smart contracts appear on map with different icon/color
- [ ] Contract info window shows correct details
- [ ] Radius circle is drawn on map for each contract
- [ ] Manual execution button appears for non-auto-execute rules
- [ ] WebAuthn prompt appears when required
- [ ] Smart wallet routing works for payment functions
- [ ] Regular contract execution works for non-payment functions
- [ ] Error handling for failed executions
- [ ] Success feedback after execution

## Error Handling

Common errors and how to handle them:

1. **400 Bad Request**: Invalid parameters or missing required fields
   - Check request body matches function_mappings schema
   - Ensure all required fields are present

2. **401 Unauthorized**: Missing or invalid JWT token
   - Prompt user to log in
   - Refresh token if expired

3. **403 Forbidden**: User doesn't have permission
   - Show error message to user
   - Check user's role/permissions

4. **500 Internal Server Error**: Backend error
   - Log error details
   - Show generic error message to user
   - Retry if appropriate

## Questions?

If you have questions about integrating smart contracts into XYZ-Wallet, please contact the GeoLink development team.

## API Base URL

- **Testnet**: `https://testnet.stellargeolink.com/api`
- **Mainnet**: `https://stellargeolink.com/api` (when available)

## Version

This document is for GeoLink API version 1.0 with Protocol 25 (X-Ray) support.

Last updated: January 2026
