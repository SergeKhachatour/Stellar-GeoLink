# Data Consumer API Endpoints

## Overview
This document lists all API endpoints available for data consumers to access wallet location data, NFT data, and market insights.

## Authentication
Data consumers use API key authentication with the `X-API-Key` header.

## Available Endpoints

### 1. Location Services (`/api/location/`)

#### GET `/api/location/nearby`
- **Purpose**: Find wallets near a specific location
- **Authentication**: API Key (`X-API-Key`)
- **Parameters**: 
  - `lat` (required): Latitude (-90 to 90)
  - `lon` (required): Longitude (-180 to 180)
  - `radius` (optional): Search radius in meters (default: 1000)
- **Response**: Array of nearby wallet locations with provider info

#### GET `/api/location/wallet-locations`
- **Purpose**: Get all active wallet locations
- **Authentication**: API Key (`X-API-Key`)
- **Response**: Array of all active wallet locations with provider and type info

#### GET `/api/location/:publicKey`
- **Purpose**: Get specific wallet location by public key
- **Authentication**: API Key (`X-API-Key`)
- **Response**: Single wallet location details

#### GET `/api/location/:publicKey/history`
- **Purpose**: Get location history for a specific wallet
- **Authentication**: API Key (`X-API-Key`)
- **Response**: Array of historical location data

#### GET `/api/location/types/list`
- **Purpose**: Get list of available wallet types
- **Authentication**: None (public endpoint)
- **Response**: Array of wallet types

### 2. NFT Services (`/api/nft/`)

#### GET `/api/nft/nearby`
- **Purpose**: Find NFTs near a specific location
- **Authentication**: API Key (`X-API-Key`)
- **Parameters**:
  - `latitude` (required): Center latitude
  - `longitude` (required): Center longitude
  - `radius` (optional): Search radius in meters (default: 1000)
- **Response**: Array of nearby NFTs with location data

#### GET `/api/nft/public`
- **Purpose**: Get all public NFTs (no authentication required)
- **Authentication**: None (public endpoint)
- **Response**: Array of all public NFTs

### 3. Smart Contract Services (`/api/contracts/`)

**NEW**: All contract endpoints now support API key authentication for Data Consumers!

#### POST `/api/contracts/discover`
- **Purpose**: Discover functions in a custom smart contract
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Parameters**:
  - `contract_address` (required): Stellar contract address (56 characters)
  - `network` (optional): 'testnet' or 'mainnet' (default: 'testnet')
- **Response**: Discovered contract functions with signatures

#### POST `/api/contracts`
- **Purpose**: Save/create a custom contract configuration
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Contract configuration (address, name, network, functions, mappings, etc.)
- **Response**: Created/updated contract details

#### GET `/api/contracts`
- **Purpose**: Get all custom contracts for the authenticated user
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: Array of user's contracts

#### GET `/api/contracts/:id`
- **Purpose**: Get specific contract details
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: Contract details

#### PUT `/api/contracts/:id/mappings`
- **Purpose**: Update function mappings for a contract
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Function mappings object
- **Response**: Updated contract

#### DELETE `/api/contracts/:id`
- **Purpose**: Deactivate a custom contract
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: Success message

#### POST `/api/contracts/:id/execute`
- **Purpose**: Execute a contract function
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Function name, parameters, user keys
- **Response**: Execution result

#### POST `/api/contracts/upload-wasm`
- **Purpose**: Upload WASM file for a contract
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Content-Type**: multipart/form-data
- **Body**: WASM file, contract_address (optional), wasm_source
- **Response**: Uploaded WASM file details

#### GET `/api/contracts/:id/wasm`
- **Purpose**: Download WASM file for a contract
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: WASM file download

### 4. Contract Execution Rules (`/api/contracts/rules/`)

#### POST `/api/contracts/rules`
- **Purpose**: Create a contract execution rule (location/geofence-based)
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Rule configuration (contract_id, rule_type, location, function_name, etc.)
- **Response**: Created rule details

#### GET `/api/contracts/rules`
- **Purpose**: Get all contract execution rules
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Query Parameters**: `contract_id` (optional), `is_active` (optional)
- **Response**: Array of execution rules

#### GET `/api/contracts/rules/:id`
- **Purpose**: Get specific execution rule
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: Rule details

#### PUT `/api/contracts/rules/:id`
- **Purpose**: Update an execution rule
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Updated rule fields
- **Response**: Updated rule

#### DELETE `/api/contracts/rules/:id`
- **Purpose**: Deactivate an execution rule
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Response**: Success message

### 5. Data Consumer Specific Services (`/api/data-consumer/`)

#### GET `/api/data-consumer/location-insights`
- **Purpose**: Get location-based market insights
- **Authentication**: Bearer Token (JWT)
- **Parameters**:
  - `latitude` (required): Center latitude for analysis
  - `longitude` (required): Center longitude for analysis
  - `radius` (optional): Analysis radius in meters (default: 5000)
- **Response**: Market insights with nearby wallets and density analysis

#### GET `/api/data-consumer/market-analysis`
- **Purpose**: Get comprehensive market analysis
- **Authentication**: Bearer Token (JWT)
- **Parameters**:
  - `region` (optional): Specific region for analysis
  - `days` (optional): Analysis period in days (default: 30)
- **Response**: Market analysis with statistics and trends

#### GET `/api/data-consumer/competitive-analysis`
- **Purpose**: Get competitive analysis data
- **Authentication**: Bearer Token (JWT)
- **Parameters**:
  - `focus_area` (optional): Specific area for competitive analysis
- **Response**: Competitive analysis data

## Missing Endpoints for Data Consumers

### 1. NFT Data Access
- **Issue**: Data consumers cannot access NFT data via API key authentication
- **Current**: NFT endpoints require JWT authentication (user login)
- **Needed**: API key authentication for NFT endpoints

### 2. Wallet Provider Information
- **Issue**: Limited access to wallet provider details
- **Current**: Basic provider name in location data
- **Needed**: Detailed provider analytics and statistics

### 3. Real-time Data Streaming
- **Issue**: No real-time data streaming endpoints
- **Needed**: WebSocket or Server-Sent Events for real-time updates

### 4. Bulk Data Export
- **Issue**: No bulk data export capabilities
- **Needed**: CSV/JSON export endpoints for large datasets

## Recommendations

### 1. Add API Key Authentication to NFT Endpoints
```javascript
// Add to nft.js routes
router.get('/nearby', authenticateApiKey, async (req, res) => {
    // Allow data consumers to access NFT data
});
```

### 2. Add Wallet Provider Analytics Endpoint
```javascript
// New endpoint for data consumers
router.get('/api/data-consumer/provider-analytics', authenticateApiKey, async (req, res) => {
    // Provide detailed wallet provider statistics
});
```

### 3. Add Bulk Data Export Endpoint
```javascript
// New endpoint for data consumers
router.get('/api/data-consumer/export/:format', authenticateApiKey, async (req, res) => {
    // Export data in CSV/JSON format
});
```

### 4. Add Real-time Updates Endpoint
```javascript
// New WebSocket endpoint
router.ws('/api/data-consumer/stream', authenticateApiKey, (ws, req) => {
    // Real-time data streaming
});
```

## Current Status
✅ **Working**: Location services, basic market analysis
❌ **Missing**: NFT data access via API key, bulk export, real-time streaming
⚠️ **Limited**: Provider analytics, competitive analysis depth
