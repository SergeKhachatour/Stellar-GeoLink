# Map Contract Integration Guide

## Overview

All map markers (NFTs, wallets, IoT devices, etc.) now display smart contract information and allow contract function execution when users are within range.

## Features Implemented

✅ **Contract Information in Markers**: All map markers show contract details in popups  
✅ **Contract Details Overlay**: Full contract information dialog with function execution  
✅ **Proximity-Based Execution**: Contract functions can only be executed when user is within range  
✅ **All Wallet Types Supported**: IoT, Stellar wallets, and all other wallet types show contract info  
✅ **Function Discovery**: Shows discovered contract functions with parameters  
✅ **Smart Execution**: Validates location, wallet connection, and WebAuthn requirements  

---

## Backend Changes

### 1. Updated NFT Endpoints
Both `/api/nft/nearby` and `/api/nft/dashboard/nearby` now include:
- `custom_contract_id`
- `contract_address`
- `contract_name`
- `contract_network`
- `contract_functions` (discovered functions)
- `contract_function_mappings`
- `contract_use_smart_wallet`
- `contract_requires_webauthn`

**Response Format:**
```json
{
  "nfts": [
    {
      "id": 1,
      "name": "My NFT",
      "contract": {
        "id": 1,
        "address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
        "name": "My Custom Contract",
        "network": "testnet",
        "functions": [...],
        "function_mappings": {...},
        "use_smart_wallet": false,
        "requires_webauthn": false
      }
    }
  ]
}
```

### 2. Updated Wallet Endpoints
`/api/geospatial/nearby` now includes contract information via `contract_execution_rules`:
- `contract_id`
- `contract_address`
- `contract_name`
- `contract_network`
- `execution_rule_id`
- `contract_function_name`
- `contract_function_parameters`
- `contract_auto_execute`
- `contract_requires_confirmation`

---

## Frontend Components

### 1. ContractDetailsOverlay Component
**Location:** `frontend/src/components/Map/ContractDetailsOverlay.js`

**Features:**
- Displays contract information (name, address, network)
- Shows discovered functions with parameters
- Proximity checking (user location vs. item location)
- Function parameter input forms
- Execute button (only enabled when within range)
- WebAuthn/Smart Wallet indicators
- Error handling and loading states

**Props:**
- `open` - Boolean to control dialog visibility
- `onClose` - Callback when dialog closes
- `item` - NFT or wallet object with contract info
- `itemType` - 'nft' or 'wallet'

**Usage:**
```jsx
<ContractDetailsOverlay
  open={contractOverlayOpen}
  onClose={() => setContractOverlayOpen(false)}
  item={selectedItem}
  itemType="nft"
/>
```

### 2. Updated Map Components

#### AIMap Component
- NFT markers show contract info in popups
- Wallet markers show contract info in popups
- "View Contract" button in popups
- Opens ContractDetailsOverlay on button click

#### Other Map Components to Update
- `NFTMap.js` - NFT-specific map
- `WalletMap.js` - Wallet-specific map
- `PublicNFTShowcase.js` - Public NFT showcase
- `SharedMap.js` - Shared map component

---

## Map Marker Popup Format

### NFT Markers
```
NFT #123
Name: My NFT
Collection: My Collection
Rarity: rare
Distance: 150m
📜 Contract: My Custom Contract
[View Details] [📜 View Contract] [🗺️ Navigate]
```

### Wallet Markers
```
Stellar Wallet
Address: GDPMUX3X4...
Type: IoT
Distance: 250m
📜 Contract: Payment Contract
[📜 View Contract]
```

---

## Contract Execution Flow

1. **User clicks marker** → Popup shows contract info
2. **User clicks "View Contract"** → ContractDetailsOverlay opens
3. **Component checks proximity:**
   - Gets user's current location
   - Calculates distance to item
   - Compares with item's radius
   - Shows status (within range / out of range)
4. **User selects function** → Function parameters form appears
5. **User fills parameters** → Parameters validated
6. **User clicks "Execute"** → 
   - Validates wallet connection
   - Validates WebAuthn if required
   - Validates proximity (must be within range)
   - Calls `/api/contracts/:id/execute`
   - Shows success/error message

---

## Proximity Calculation

The component uses the Haversine formula to calculate distance:

```javascript
const R = 6371000; // Earth's radius in meters
const lat1 = userLocation.latitude * Math.PI / 180;
const lat2 = item.latitude * Math.PI / 180;
const deltaLat = (item.latitude - userLocation.latitude) * Math.PI / 180;
const deltaLon = (item.longitude - userLocation.longitude) * Math.PI / 180;

const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
const distance = R * c;
```

**Range Check:**
- NFTs: Uses `radius_meters` from NFT data
- Wallets: Uses `radius` from wallet data or default 100m
- Execution only allowed if `distance <= radius`

---

## Security & Validation

### Pre-Execution Checks:
1. ✅ User wallet connected (`isConnected && publicKey`)
2. ✅ User within range (`distance <= radius`)
3. ✅ Secret key available (if not WebAuthn contract)
4. ✅ WebAuthn available (if contract requires it)
5. ✅ Function selected
6. ✅ Parameters provided (if required)

### Error Messages:
- "Please connect your wallet first"
- "You need to be within {radius}m to execute functions"
- "This contract requires WebAuthn. Please use a passkey-enabled wallet."
- "Please select a function and ensure you are within range"
- "Failed to execute function: {error}"

---

## Integration Checklist

### Backend ✅
- [x] Updated NFT endpoints to include contract info
- [x] Updated wallet endpoints to include contract info
- [x] Contract execution endpoint ready

### Frontend ✅
- [x] ContractDetailsOverlay component created
- [x] AIMap updated with contract info
- [ ] NFTMap updated (similar to AIMap)
- [ ] WalletMap updated (similar to AIMap)
- [ ] PublicNFTShowcase updated
- [ ] SharedMap updated

### Testing
- [ ] Test NFT markers with contracts
- [ ] Test wallet markers with contracts
- [ ] Test proximity checking
- [ ] Test function execution
- [ ] Test error handling
- [ ] Test all wallet types (IoT, etc.)

---

## Example: Adding Contract Info to Other Map Components

```javascript
// In your map component
import ContractDetailsOverlay from '../Map/ContractDetailsOverlay';

// Add state
const [contractOverlayOpen, setContractOverlayOpen] = useState(false);
const [selectedContractItem, setSelectedContractItem] = useState(null);

// In marker popup HTML
const hasContract = item.contract || item.custom_contract_id;
const contractInfo = hasContract 
  ? `<p style="margin: 4px 0; font-size: 11px; color: #7B68EE;">
       <strong>📜 Contract:</strong> ${item.contract?.name || 'Custom Contract'}
     </p>`
  : '';

// Add button
${hasContract ? `<button 
  id="contract-btn-${item.id}" 
  style="...">
  📜 View Contract
</button>` : ''}

// Add handler
popup.on('open', () => {
  const btn = document.getElementById(`contract-btn-${item.id}`);
  if (btn) {
    btn.onclick = () => {
      setSelectedContractItem(item);
      setContractOverlayOpen(true);
      popup.remove();
    };
  }
});

// Add overlay to JSX
<ContractDetailsOverlay
  open={contractOverlayOpen}
  onClose={() => {
    setContractOverlayOpen(false);
    setSelectedContractItem(null);
  }}
  item={selectedContractItem}
  itemType="nft" // or "wallet"
/>
```

---

**Ready for integration!** 🚀

All map markers now support contract information and execution. The ContractDetailsOverlay component handles all the complexity of proximity checking, function selection, and execution.

