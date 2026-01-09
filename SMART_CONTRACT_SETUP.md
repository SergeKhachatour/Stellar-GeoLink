# Smart Contract Integration - Setup & Database Changes

## 📋 Database Migration

### Migration File
**Location:** `database/migrations/004_create_custom_contracts.sql`

### How to Run
```bash
# For local database
psql -U your_username -d your_database_name -f database/migrations/004_create_custom_contracts.sql

# Or using psql interactively
psql -U your_username -d your_database_name
\i database/migrations/004_create_custom_contracts.sql
```

### Database Changes Summary

#### 1. New Table: `custom_contracts`
Stores user-defined smart contract configurations.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, REFERENCES users(id) ON DELETE CASCADE)
- `contract_address` (TEXT, NOT NULL) - Stellar contract address (56 chars)
- `contract_name` (TEXT) - Friendly name for the contract
- `network` (TEXT, DEFAULT 'testnet') - 'testnet' or 'mainnet'
- `wasm_file_path` (TEXT) - Path to uploaded WASM file (optional)
- `wasm_file_name` (TEXT) - Original WASM filename (optional)
- `wasm_file_size` (BIGINT) - WASM file size in bytes (optional)
- `wasm_uploaded_at` (TIMESTAMP) - When WASM was uploaded (optional)
- `wasm_source` (TEXT, CHECK IN ('stellarexpert', 'local', 'manual')) - Source of WASM file (optional)
- `wasm_hash` (TEXT) - SHA256 hash of WASM file for verification (optional)
- `discovered_functions` (JSONB, DEFAULT '{}') - Discovered functions with signatures
- `function_mappings` (JSONB, DEFAULT '{}') - GeoLink field to contract parameter mappings
- `use_smart_wallet` (BOOLEAN, DEFAULT false)
- `smart_wallet_contract_id` (TEXT) - Smart wallet contract address
- `payment_function_name` (TEXT) - e.g., "execute_payment"
- `requires_webauthn` (BOOLEAN, DEFAULT false)
- `webauthn_verifier_contract_id` (TEXT)
- `created_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
- `is_active` (BOOLEAN, DEFAULT true)

**Constraints:**
- UNIQUE(user_id, contract_address) - Prevents duplicate contract addresses for the same user
  - **IMPORTANT**: Users can have **UNLIMITED** different contracts
  - This constraint only prevents adding the same contract address twice (which is correct behavior)
  - Example: User can have Contract A, Contract B, Contract C, etc. - no limit!

**Indexes:**
- `idx_custom_contracts_user` on `user_id`
- `idx_custom_contracts_address` on `contract_address`
- `idx_custom_contracts_active` on `(user_id, is_active)` WHERE `is_active = true`

#### 2. New Table: `contract_function_mappings`
Stores detailed function mappings for custom contracts.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `contract_id` (INTEGER, REFERENCES custom_contracts(id) ON DELETE CASCADE)
- `function_name` (TEXT, NOT NULL) - e.g., "mint", "transfer"
- `geolink_field_mappings` (JSONB, DEFAULT '{}') - Maps GeoLink fields to contract parameters
- `call_config` (JSONB, DEFAULT '{}') - Payment requirements, WebAuthn settings, etc.
- `created_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)

**Constraints:**
- UNIQUE(contract_id, function_name) - One function mapping per contract

**Indexes:**
- `idx_contract_function_mappings_contract` on `contract_id`

#### 3. Modified Table: `pinned_nfts`
Added optional reference to custom contracts. **Supports both NFT workflows.**

**New Column:**
- `custom_contract_id` (INTEGER, REFERENCES custom_contracts(id) ON DELETE SET NULL)

**New Index:**
- `idx_pinned_nfts_custom_contract` on `custom_contract_id`

**NFT Workflow Support:**
- **Workflow 1 (Direct Blockchain Mint)**: RealPinNFT component mints directly on blockchain, uses `custom_contract_id` to track which contract was used
- **Workflow 2 (IPFS Server Workflow)**: EnhancedPinNFT component uploads to IPFS server first, then pins with `nft_upload_id`, `ipfs_server_id`, `pin_id` - can also use `custom_contract_id` for blockchain operations
- Both workflows can use custom contracts for minting and operations

#### 4. New Table: `contract_execution_rules`
Stores location/geofence-based rules for automatically executing contract functions **when ANY WALLET enters/exits/is within specific areas**.

**IMPORTANT**: This is for **WALLET-BASED** contract execution, not just NFT collection. Any wallet location update can trigger contract function execution.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, REFERENCES users(id) ON DELETE CASCADE) - User who created the rule
- `contract_id` (INTEGER, REFERENCES custom_contracts(id) ON DELETE CASCADE) - Contract to execute
- `rule_name` (TEXT, NOT NULL) - Friendly name for the rule
- `rule_type` (TEXT, CHECK IN ('location', 'geofence', 'proximity'))
- `center_latitude` (NUMERIC) - For location/proximity rules
- `center_longitude` (NUMERIC) - For location/proximity rules
- `radius_meters` (INTEGER) - For location/proximity rules
- `geofence_id` (INTEGER, REFERENCES geofences(id)) - For geofence rules
- `function_name` (TEXT, NOT NULL) - Contract function to execute
- `function_parameters` (JSONB, DEFAULT '{}') - Parameters for the function
- `trigger_on` (TEXT, DEFAULT 'enter', CHECK IN ('enter', 'exit', 'within', 'proximity'))
- `auto_execute` (BOOLEAN, DEFAULT false) - Auto-execute without confirmation
- `requires_confirmation` (BOOLEAN, DEFAULT true) - Require user confirmation
- `target_wallet_public_key` (TEXT) - **Optional**: If specified, only this wallet triggers the rule. If NULL, **ANY wallet** within the area triggers the rule.
- `use_smart_wallet` (BOOLEAN, DEFAULT false)
- `payment_amount` (NUMERIC) - Payment in XLM
- `payment_asset_address` (TEXT) - For custom assets
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP)

**Use Cases:**
- Execute payment contract when any wallet enters a store location
- Execute reward contract when specific wallet is within a park
- Execute any custom contract function based on wallet location/geofence
- Not limited to NFTs - works for ANY contract function

**Indexes:**
- `idx_contract_execution_rules_user` on `user_id`
- `idx_contract_execution_rules_contract` on `contract_id`
- `idx_contract_execution_rules_geofence` on `geofence_id`
- `idx_contract_execution_rules_active` on `(user_id, is_active)` WHERE `is_active = true`
- `idx_contract_execution_rules_target_wallet` on `target_wallet_public_key` WHERE `target_wallet_public_key IS NOT NULL`
- `idx_contract_execution_rules_location` - GIST index for spatial queries

#### 5. New Table: `smart_wallet_collection_rules`
Stores rules for smart wallets to automatically collect nearby NFTs.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, REFERENCES users(id) ON DELETE CASCADE)
- `smart_wallet_contract_id` (TEXT, NOT NULL) - Smart wallet contract address
- `rule_name` (TEXT, NOT NULL) - Friendly name for the rule
- `trigger_type` (TEXT, CHECK IN ('location', 'geofence', 'proximity', 'all'))
- `center_latitude` (NUMERIC) - For location/proximity triggers
- `center_longitude` (NUMERIC) - For location/proximity triggers
- `radius_meters` (INTEGER) - For location/proximity triggers
- `geofence_id` (INTEGER, REFERENCES geofences(id)) - For geofence triggers
- `collection_contract_id` (INTEGER, REFERENCES custom_contracts(id)) - Contract to use for collection
- `collection_function_name` (TEXT, DEFAULT 'collect') - Function to call for collection
- `collection_parameters` (JSONB, DEFAULT '{}') - Parameters for collection
- `min_rarity` (TEXT, CHECK IN ('common', 'uncommon', 'rare', 'epic', 'legendary'))
- `max_distance_meters` (INTEGER) - Max distance to collect from
- `collection_limit` (INTEGER) - Max NFTs to collect per trigger
- `cooldown_seconds` (INTEGER) - Seconds between collections
- `max_payment_per_nft` (NUMERIC) - Max XLM to pay per NFT
- `payment_asset_address` (TEXT) - For custom assets
- `is_active` (BOOLEAN, DEFAULT true)
- `last_triggered_at` (TIMESTAMP)
- `trigger_count` (INTEGER, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_smart_wallet_collection_rules_user` on `user_id`
- `idx_smart_wallet_collection_rules_contract` on `collection_contract_id`
- `idx_smart_wallet_collection_rules_geofence` on `geofence_id`
- `idx_smart_wallet_collection_rules_active` on `(user_id, is_active)` WHERE `is_active = true`
- `idx_smart_wallet_collection_rules_location` - GIST index for spatial queries

---

## 🔌 API Endpoints

All contract endpoints are under `/api/contracts` (NOT `/api/nft/contracts`)

### 1. Discover Contract Functions
```
POST /api/contracts/discover
Authentication: Bearer Token (JWT)
Body: {
  "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
  "network": "testnet" // optional, default: "testnet"
}
Response: {
  "success": true,
  "contract_address": "...",
  "network": "testnet",
  "functions": [...],
  "discovered_count": 2
}
```

### 2. Save Custom Contract
```
POST /api/contracts
Authentication: Bearer Token (JWT)
Body: {
  "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
  "contract_name": "My Custom NFT Contract", // optional
  "network": "testnet", // optional, default: "testnet"
  "discovered_functions": {}, // optional
  "function_mappings": {}, // optional
  "use_smart_wallet": false, // optional
  "smart_wallet_contract_id": null, // optional
  "requires_webauthn": false // optional
}
Response: {
  "success": true,
  "contract": {...},
  "message": "Contract saved successfully"
}
```

### 3. Get User's Contracts
```
GET /api/contracts
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "contracts": [...],
  "count": 2
}
```

### 4. Get Specific Contract
```
GET /api/contracts/:id
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "contract": {...}
}
```

### 5. Update Function Mappings
```
PUT /api/contracts/:id/mappings
Authentication: Bearer Token (JWT)
Body: {
  "function_mappings": {
    "mint": {
      "function_name": "mint",
      "parameters": [...]
    }
  }
}
Response: {
  "success": true,
  "message": "Function mappings updated successfully"
}
```

### 6. Delete Contract
```
DELETE /api/contracts/:id
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "message": "Contract deactivated successfully"
}
```

### 7. Upload WASM File
```
POST /api/contracts/upload-wasm
Authentication: Bearer Token (JWT)
Content-Type: multipart/form-data
Body (form-data):
  - wasm: (file) - WASM file to upload
  - contract_address: (optional) - Link WASM to existing contract
  - wasm_source: (optional) - 'stellarexpert', 'local', or 'manual'
Response: {
  "success": true,
  "wasm_file": {
    "path": "...",
    "filename": "contract.wasm",
    "size": 123456,
    "hash": "sha256_hash...",
    "source": "stellarexpert"
  },
  "contract_id": 123,
  "message": "WASM file uploaded and linked to contract"
}
```

### 8. Download WASM File
```
GET /api/contracts/:id/wasm
Authentication: Bearer Token (JWT)
Response: WASM file download
```

### 9. Execute Contract Function
```
POST /api/contracts/:id/execute
Authentication: Bearer Token (JWT)
Body: {
  "function_name": "mint",
  "parameters": {...},
  "user_public_key": "G...",
  "user_secret_key": "S..."
}
Response: {
  "success": true,
  "contract_address": "...",
  "function_name": "mint",
  "mapped_parameters": [...],
  "scval_parameters": [...]
}
```

### 10. Create Contract Execution Rule (Wallet-Based)
```
POST /api/contracts/rules
Authentication: Bearer Token (JWT)
Body: {
  "contract_id": 1,
  "rule_name": "Execute payment when wallet enters store",
  "rule_type": "location", // or "geofence" or "proximity"
  "center_latitude": 34.0522,
  "center_longitude": -118.2437,
  "radius_meters": 100,
  "function_name": "execute_payment",
  "function_parameters": {"amount": "100", "recipient": "G..."},
  "trigger_on": "enter", // or "exit", "within", "proximity"
  "auto_execute": false,
  "requires_confirmation": true,
  "target_wallet_public_key": "G...", // NULL = any wallet, or specific wallet
  "use_smart_wallet": false,
  "payment_amount": 10.5,
  "payment_asset_address": null
}
Response: {
  "success": true,
  "message": "Contract execution rule created successfully",
  "rule": {...}
}
```

### 11. Get Contract Execution Rules
```
GET /api/contracts/rules
GET /api/contracts/rules?contract_id=1&is_active=true
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "rules": [...],
  "count": 5
}
```

### 12. Get Specific Rule
```
GET /api/contracts/rules/:id
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "rule": {...}
}
```

### 13. Update Contract Execution Rule
```
PUT /api/contracts/rules/:id
Authentication: Bearer Token (JWT)
Body: {
  "rule_name": "Updated rule name",
  "is_active": false,
  "target_wallet_public_key": "G...", // Can update to target specific wallet
  ...
}
Response: {
  "success": true,
  "message": "Rule updated successfully",
  "rule": {...}
}
```

### 14. Delete Contract Execution Rule
```
DELETE /api/contracts/rules/:id
Authentication: Bearer Token (JWT)
Response: {
  "success": true,
  "message": "Rule deactivated successfully"
}
```

### 15. Update Pinned NFT (Including Custom Contract)
```
PUT /api/nft/pinned/:id
Authentication: Bearer Token (JWT)
Body: {
  "custom_contract_id": 1, // NEW: Can update custom contract
  "latitude": 34.0522,
  "longitude": -118.2437,
  "radius_meters": 50,
  "is_active": true,
  ...
}
Response: {
  "message": "NFT updated successfully",
  "nft": {...}
}
```

---

## 🤖 AI Integration

The GeoLink AI now has access to these contract tools:

1. **geolink_discoverContract** - Discover functions in a smart contract
2. **geolink_getCustomContracts** - Get user's saved contracts
3. **geolink_saveCustomContract** - Save a custom contract
4. **geolink_executeContractFunction** - Execute a contract function

The AI also has access to ALL GeoLink APIs:
- Location services (findNearbyWallets, getGeospatialStats)
- NFT services (getNFTCollections, getPinnedNFTs, getNearbyNFTs, verifyNFTLocation, createNFTCollection)
- Smart wallet services (getSmartWalletBalance)
- WebAuthn services (getPasskeys)
- Analytics services (getAnalyticsStats, getBlockchainDistribution)
- Geofence services (getGeofences, createGeofence)

---

## 📁 New Files Created

### Backend
- `backend/routes/contracts.js` - Contract management API endpoints (available to ALL roles)
- `backend/services/contractIntrospection.js` - Contract discovery and introspection service

### Frontend
- `frontend/src/components/NFT/CustomContractDialog.js` - Dialog for adding/configuring contracts
- `frontend/src/components/NFT/CustomContractSelector.js` - Component for selecting contracts

### Database
- `database/migrations/004_create_custom_contracts.sql` - Database migration

## 👥 Role-Based Contract Management

**All roles can manage contracts:**
- **NFT Manager**: Manage contracts for NFT minting and operations
- **Data Consumer**: Manage contracts for data processing and analytics
- **Wallet Provider**: Manage contracts for wallet integrations
- **Admin**: Full access to all contract management features

**Each role's dashboard should include:**
- Contract list view (GET /api/contracts)
- Add new contract (POST /api/contracts)
- Edit contract (PUT /api/contracts/:id/mappings)
- Delete contract (DELETE /api/contracts/:id)
- Upload WASM files (POST /api/contracts/upload-wasm)
- Download WASM files (GET /api/contracts/:id/wasm)
- Discover functions (POST /api/contracts/discover)
- Execute functions (POST /api/contracts/:id/execute)

---

## 🔧 Modified Files

### Backend
- `backend/app.js` - Added `/api/contracts` route
- `backend/routes/nft.js` - Removed contract endpoints (moved to contracts.js)
- `backend/services/geolinkOperations.js` - Added contract operation functions
- `backend/services/azureOpenAIService.js` - Added AI tools for contract operations

### Frontend
- `frontend/src/components/NFT/CustomContractDialog.js` - Updated API endpoints
- `frontend/src/components/NFT/CustomContractSelector.js` - Updated API endpoints
- `frontend/src/components/IPFS/EnhancedPinNFT.js` - Updated API endpoints (if it uses contracts)

---

## ✅ Pre-Testing Checklist

### 1. Database Setup
- [ ] Run the migration: `004_create_custom_contracts.sql`
- [ ] Verify tables were created:
  ```sql
  SELECT * FROM custom_contracts LIMIT 1;
  SELECT * FROM contract_function_mappings LIMIT 1;
  SELECT custom_contract_id FROM pinned_nfts LIMIT 1;
  ```
- [ ] Check indexes were created:
  ```sql
  \d custom_contracts
  \d contract_function_mappings
  ```

### 2. Backend Setup
- [ ] Restart backend server to load new routes
- [ ] Verify `/api/contracts/discover` endpoint is accessible
- [ ] Check that `contractIntrospection.js` service initializes correctly
- [ ] Verify SorobanRpc is available (check console logs)

### 3. Environment Variables
Ensure these are set (if needed):
- `SOROBAN_RPC_URL` - Soroban RPC server URL (default: https://soroban-testnet.stellar.org:443)
- `STELLAR_NETWORK` - Network type (testnet/mainnet)
- `API_BASE_URL` - Base URL for API calls (for Azure deployments)

### 4. Frontend Setup
- [ ] Rebuild frontend if needed: `cd frontend && npm run build`
- [ ] Verify `CustomContractDialog` component loads
- [ ] Verify `CustomContractSelector` component loads

---

## 🧪 Testing Steps

### 1. Test Contract Discovery
```bash
# Using curl
curl -X POST http://localhost:4000/api/contracts/discover \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
    "network": "testnet"
  }'
```

### 2. Test Saving a Contract
```bash
curl -X POST http://localhost:4000/api/contracts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
    "contract_name": "Test Contract",
    "network": "testnet"
  }'
```

### 3. Test Getting Contracts
```bash
curl -X GET http://localhost:4000/api/contracts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Test Frontend Components
1. Log in as an NFT Manager
2. Navigate to NFT minting page
3. Look for "Add Contract" or contract selector
4. Try adding a new contract
5. Try discovering functions
6. Try saving the contract

### 5. Test AI Integration
1. Open AI chat
2. Ask: "Discover functions in contract CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q"
3. Ask: "Show me my custom contracts"
4. Ask: "Save a contract with address..."

---

## ⚠️ Important Notes

1. **Unlimited Contracts**: Users can have **UNLIMITED** different contracts. The UNIQUE constraint only prevents adding the same contract address twice, which is correct behavior.
2. **Contract Address Format**: Must be exactly 56 characters, uppercase alphanumeric (Stellar address format)
3. **Network**: Currently supports 'testnet' and 'mainnet'
4. **WASM File Upload**: Users can upload WASM files from StellarExpert or locally compiled contracts. WASM files can be linked to deployed contract addresses.
5. **Role-Based Access**: **ALL ROLES** (NFT Manager, Data Consumer, Wallet Provider, Admin) can manage contracts with full CRUD operations on their dashboards.
6. **Function Discovery**: May not discover all functions - manual configuration may be needed
7. **Smart Wallet Integration**: Requires smart wallet contract to be deployed and configured
8. **WebAuthn**: Requires WebAuthn verifier contract if enabled
9. **Location-Based Execution**: Contract execution rules allow automatic function execution when **ANY WALLET** (not just NFTs) enters specific locations or geofences. Can target specific wallets or apply to all wallets.
10. **Auto-Collection Rules**: Smart wallet collection rules enable automatic NFT collection based on location, geofence, or proximity triggers
11. **NFT Workflow Support**: Both Workflow 1 (direct blockchain mint) and Workflow 2 (IPFS server workflow) are fully supported with custom contracts
12. **Pinned NFT Updates**: You can update pinned NFTs including changing their `custom_contract_id` via `PUT /api/nft/pinned/:id`
13. **Wallet-Based Rules**: You can set contract execution rules for your connected wallet (or any wallet) via `/api/contracts/rules` endpoints. Set `target_wallet_public_key` to your wallet address to target your wallet specifically, or leave it NULL to apply to any wallet in the area.

---

## 🐛 Troubleshooting

### Contract Discovery Fails
- Check SorobanRpc server is accessible
- Verify contract address is correct format
- Check network matches contract deployment network
- Review console logs for detailed error messages

### Database Errors
- Ensure migration ran successfully
- Check user_id exists in users table
- Verify foreign key constraints

### API Endpoints Not Found
- Restart backend server
- Check `backend/app.js` has `/api/contracts` route registered
- Verify `backend/routes/contracts.js` exists and exports router

### Frontend Components Not Loading
- Check browser console for errors
- Verify API endpoints are correct (should be `/api/contracts`, not `/api/nft/contracts`)
- Rebuild frontend if needed

---

## 📚 Next Steps After Testing

1. Integrate `CustomContractSelector` into NFT minting components
2. Test with real Soroban contracts
3. Configure function mappings for specific contracts
4. Test smart wallet integration (if applicable)
5. Test AI contract discovery and execution

---

## 📝 Database Schema Diagram

```
users
  └── id (PK)
      │
      ├── custom_contracts (UNLIMITED per user)
      │   ├── id (PK)
      │   ├── user_id (FK → users.id)
      │   ├── contract_address (UNIQUE per user)
      │   ├── discovered_functions (JSONB)
      │   ├── function_mappings (JSONB)
      │   └── ...
      │   │
      │   ├── contract_function_mappings
      │   │   ├── id (PK)
      │   │   ├── contract_id (FK → custom_contracts.id)
      │   │   ├── function_name
      │   │   ├── geolink_field_mappings (JSONB)
      │   │   └── call_config (JSONB)
      │   │
      │   ├── contract_execution_rules
      │   │   ├── id (PK)
      │   │   ├── user_id (FK → users.id)
      │   │   ├── contract_id (FK → custom_contracts.id)
      │   │   ├── rule_type (location/geofence/proximity)
      │   │   ├── function_name
      │   │   └── function_parameters (JSONB)
      │   │
      │   └── pinned_nfts
      │       ├── id (PK)
      │       └── custom_contract_id (FK → custom_contracts.id, nullable)
      │
      └── smart_wallet_collection_rules
          ├── id (PK)
          ├── user_id (FK → users.id)
          ├── smart_wallet_contract_id
          ├── trigger_type (location/geofence/proximity/all)
          ├── collection_contract_id (FK → custom_contracts.id)
          └── collection_parameters (JSONB)

geofences
  └── id (PK)
      │
      ├── contract_execution_rules.geofence_id (FK)
      └── smart_wallet_collection_rules.geofence_id (FK)
```

---

**Ready to test!** 🚀

