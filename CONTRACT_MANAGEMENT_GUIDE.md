# Contract Management Guide

## Overview

GeoLink now supports comprehensive smart contract management for **ALL ROLES**:
- **NFT Manager**: Manage contracts for NFT minting
- **Data Consumer**: Manage contracts for data processing
- **Wallet Provider**: Manage contracts for wallet integrations  
- **Admin**: Full access to all contract management

## Features

### 1. WASM File Upload
- Upload WASM files from **StellarExpert** (download from contract explorer)
- Upload **locally compiled** WASM files
- Link WASM files to deployed contract addresses
- SHA256 hash verification for file integrity

### 2. Contract Management (CRUD)
All roles can perform full CRUD operations:
- **Create**: Add new contracts (with or without WASM files)
- **Read**: View all contracts, get specific contract details
- **Update**: Update contract configurations, function mappings, WASM files
- **Delete**: Deactivate contracts

### 3. Contract Discovery
- Auto-discover contract functions
- Manual function configuration
- Parameter type detection

### 4. Contract Execution
- Execute contract functions dynamically
- Location/geofence-based automatic execution
- Smart wallet integration

---

## API Endpoints

### WASM File Upload
```
POST /api/contracts/upload-wasm
Content-Type: multipart/form-data
Body:
  - wasm: (file) - WASM file (.wasm)
  - contract_address: (optional) - Link to existing contract
  - wasm_source: (optional) - 'stellarexpert', 'local', or 'manual'

Response: {
  "success": true,
  "wasm_file": {
    "path": "/uploads/contract-wasm/wasm-1234567890.wasm",
    "filename": "my_contract.wasm",
    "size": 123456,
    "hash": "sha256_hash...",
    "source": "stellarexpert"
  },
  "contract_id": 123,
  "message": "WASM file uploaded and linked to contract"
}
```

### Download WASM File
```
GET /api/contracts/:id/wasm
Response: File download (WASM file)
```

### All Other Endpoints
All contract endpoints are available to **ALL ROLES**:
- `POST /api/contracts/discover` - Discover functions
- `POST /api/contracts` - Save contract
- `GET /api/contracts` - Get user's contracts
- `GET /api/contracts/:id` - Get specific contract
- `PUT /api/contracts/:id/mappings` - Update mappings
- `DELETE /api/contracts/:id` - Delete contract
- `POST /api/contracts/:id/execute` - Execute function

---

## Usage Workflows

### Workflow 1: Upload WASM from StellarExpert

1. Go to StellarExpert contract explorer
2. Find your contract
3. Download the WASM file
4. In GeoLink dashboard:
   - Go to Contracts section
   - Click "Upload WASM"
   - Select the downloaded WASM file
   - Optionally provide contract address to link
   - Set `wasm_source` to "stellarexpert"

### Workflow 2: Upload Locally Compiled WASM

1. Compile your Soroban contract locally
2. Get the `.wasm` file from `target/wasm32v1-none/release/`
3. In GeoLink dashboard:
   - Go to Contracts section
   - Click "Upload WASM"
   - Select your compiled WASM file
   - Set `wasm_source` to "local"
   - Link to deployed contract address

### Workflow 3: Copy-Paste Contract Address (No WASM)

1. Get contract address from StellarExpert or deployment
2. In GeoLink dashboard:
   - Go to Contracts section
   - Click "Add Contract"
   - Paste contract address
   - Discover functions
   - Save contract

---

## Dashboard Integration

Each role's dashboard should include a **Contracts** section with:

### Contract List View
- Table/card view of all user's contracts
- Columns: Name, Address, Network, WASM Status, Actions
- Filter by: Network, Active/Inactive, Has WASM

### Add Contract Dialog
- Contract address input
- Contract name (optional)
- Network selection (testnet/mainnet)
- WASM file upload option
- Discover functions button
- Save button

### Contract Details View
- Contract information
- Discovered functions list
- Function mappings editor
- WASM file info (if uploaded)
- Download WASM button
- Edit/Delete actions

### WASM Upload Dialog
- File picker (accepts .wasm files)
- Source selection (StellarExpert/Local/Manual)
- Contract address linking (optional)
- Upload progress
- Hash verification display

---

## Database Schema Updates

### New Fields in `custom_contracts`:
- `wasm_file_path` - Server path to WASM file
- `wasm_file_name` - Original filename
- `wasm_file_size` - File size in bytes
- `wasm_uploaded_at` - Upload timestamp
- `wasm_source` - Source type (stellarexpert/local/manual)
- `wasm_hash` - SHA256 hash for verification

---

## File Storage

### Local Development
- Path: `backend/uploads/contract-wasm/`
- Files stored with unique names: `wasm-{timestamp}-{random}.wasm`

### Azure Deployment
- Path: `/home/uploads/contract-wasm/`
- Persistent storage across deployments

### File Limits
- Max file size: 50MB
- Allowed types: `.wasm`, `application/wasm`, `application/octet-stream`

---

## Security & Access Control

### Authentication
- All endpoints require JWT authentication
- Users can only access their own contracts

### File Security
- WASM files stored in user-specific directories (future enhancement)
- SHA256 hash verification prevents tampering
- File access restricted to contract owner

### Role-Based Access
- **All roles** have equal access to contract management
- No role restrictions on contract CRUD operations
- Each user manages their own contracts independently

---

## Example: Complete Contract Setup

1. **Upload WASM File**
   ```bash
   POST /api/contracts/upload-wasm
   - wasm: contract.wasm (from StellarExpert)
   - wasm_source: stellarexpert
   ```

2. **Save Contract with WASM**
   ```bash
   POST /api/contracts
   {
     "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
     "contract_name": "My NFT Contract",
     "network": "testnet",
     "wasm_file_path": "/uploads/contract-wasm/wasm-1234567890.wasm",
     "wasm_file_name": "contract.wasm",
     "wasm_source": "stellarexpert"
   }
   ```

3. **Discover Functions**
   ```bash
   POST /api/contracts/discover
   {
     "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q"
   }
   ```

4. **Use Contract**
   - Select contract in NFT minting
   - Execute contract functions
   - Set up location-based execution rules

---

## Next Steps for Frontend

1. **Add Contracts Section to Each Dashboard**
   - NFT Manager Dashboard
   - Data Consumer Dashboard
   - Wallet Provider Dashboard
   - Admin Dashboard

2. **Create Contract Management Components**
   - `ContractList.js` - List all contracts
   - `ContractForm.js` - Add/Edit contract
   - `WasmUploadDialog.js` - Upload WASM files
   - `ContractDetails.js` - View contract details
   - `FunctionMappingEditor.js` - Edit function mappings

3. **Integrate with Existing Flows**
   - NFT minting: Use `CustomContractSelector`
   - Contract execution: Use contract selection
   - Location rules: Link to contracts

---

**Ready for implementation!** 🚀

