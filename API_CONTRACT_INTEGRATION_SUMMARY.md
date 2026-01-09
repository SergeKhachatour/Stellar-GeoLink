# API Contract Integration Summary

## ✅ Completed Updates

### 1. Contract Endpoints - API Key Authentication Support

**All contract endpoints now support:**
- ✅ JWT authentication (Bearer token)
- ✅ API key authentication for **Data Consumers** (`X-API-Key` header)
- ✅ API key authentication for **Wallet Providers** (`X-API-Key` header)

**New Authentication Middleware:**
- `authenticateContractUser` - Supports both JWT and API key authentication
- Automatically detects API key vs JWT
- Sets `req.userId` and `req.user` for compatibility

### 2. Updated Endpoints

All contract endpoints have been updated to use `authenticateContractUser`:

#### Contract Management
- ✅ `POST /api/contracts/upload-wasm` - Upload WASM files
- ✅ `GET /api/contracts/:id/wasm` - Download WASM files
- ✅ `POST /api/contracts/discover` - Discover contract functions
- ✅ `POST /api/contracts` - Save/create contract
- ✅ `GET /api/contracts` - Get user's contracts
- ✅ `GET /api/contracts/:id` - Get specific contract
- ✅ `PUT /api/contracts/:id/mappings` - Update function mappings
- ✅ `DELETE /api/contracts/:id` - Deactivate contract
- ✅ `POST /api/contracts/:id/execute` - Execute contract function

#### Contract Execution Rules
- ✅ `POST /api/contracts/rules` - Create execution rule
- ✅ `GET /api/contracts/rules` - Get all rules
- ✅ `GET /api/contracts/rules/:id` - Get specific rule
- ✅ `PUT /api/contracts/rules/:id` - Update rule
- ✅ `DELETE /api/contracts/rules/:id` - Deactivate rule

### 3. Swagger Documentation

**Added:**
- ✅ "Contracts" tag to Swagger
- ✅ Complete Swagger documentation for all contract endpoints
- ✅ `CustomContract` schema definition
- ✅ `ContractExecutionRule` schema definition
- ✅ Security schemes (BearerAuth, DataConsumerAuth, WalletProviderAuth) for all endpoints

**All endpoints documented with:**
- Request/response schemas
- Parameter descriptions
- Authentication requirements
- Example values

---

## 🔐 Authentication Methods

### For Data Consumers
```bash
# Using API Key
curl -X GET "https://api.geolink.com/api/contracts" \
  -H "X-API-Key: your-api-key-here"
```

### For Wallet Providers
```bash
# Using API Key
curl -X POST "https://api.geolink.com/api/contracts" \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
    "contract_name": "My Contract"
  }'
```

### For All Roles (JWT)
```bash
# Using JWT Token
curl -X GET "https://api.geolink.com/api/contracts" \
  -H "Authorization: Bearer your-jwt-token-here"
```

---

## 📋 API Endpoints Summary

### Contract Management (All Roles)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/contracts/upload-wasm` | POST | JWT/API Key | Upload WASM file |
| `/api/contracts/:id/wasm` | GET | JWT/API Key | Download WASM file |
| `/api/contracts/discover` | POST | JWT/API Key | Discover contract functions |
| `/api/contracts` | POST | JWT/API Key | Create/update contract |
| `/api/contracts` | GET | JWT/API Key | Get user's contracts |
| `/api/contracts/:id` | GET | JWT/API Key | Get specific contract |
| `/api/contracts/:id/mappings` | PUT | JWT/API Key | Update function mappings |
| `/api/contracts/:id` | DELETE | JWT/API Key | Deactivate contract |
| `/api/contracts/:id/execute` | POST | JWT/API Key | Execute function |

### Execution Rules (All Roles)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/contracts/rules` | POST | JWT/API Key | Create execution rule |
| `/api/contracts/rules` | GET | JWT/API Key | Get all rules |
| `/api/contracts/rules/:id` | GET | JWT/API Key | Get specific rule |
| `/api/contracts/rules/:id` | PUT | JWT/API Key | Update rule |
| `/api/contracts/rules/:id` | DELETE | JWT/API Key | Deactivate rule |

---

## 🔍 User ID Resolution

The middleware automatically resolves `userId` from either:
- **JWT**: `req.user.id` (from JWT token)
- **API Key**: `req.userId` (from API key lookup)

All endpoints now use:
```javascript
const userId = req.user?.id || req.userId;
```

This ensures compatibility with both authentication methods.

---

## 📚 Swagger Documentation

**Access Swagger UI:**
- Local: `http://localhost:4000/api-docs/`
- Azure: `https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api-docs/`

**New Tag:**
- **Contracts** - All contract management endpoints

**Schemas Added:**
- `CustomContract` - Contract object schema
- `ContractExecutionRule` - Execution rule schema

---

## ✅ Verification Checklist

- [x] All contract endpoints support API key authentication
- [x] Data Consumer API key authentication works
- [x] Wallet Provider API key authentication works
- [x] JWT authentication still works (backward compatible)
- [x] Swagger documentation updated
- [x] All endpoints documented with examples
- [x] User ID resolution works for both auth methods
- [x] Contract rules endpoints support API keys
- [x] WASM upload/download supports API keys

---

## 🚀 Ready for Use!

**Data Consumers and Wallet Providers can now:**
1. ✅ Manage contracts via API keys
2. ✅ Discover contract functions
3. ✅ Upload/download WASM files
4. ✅ Create/update/delete contracts
5. ✅ Set execution rules
6. ✅ Execute contract functions

**All functionality is available via:**
- Dashboard (JWT authentication)
- API (API key authentication)
- Swagger UI (interactive testing)

---

**All APIs are updated and documented!** 🎉

