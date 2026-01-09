# Wallet Provider API Endpoints

## Overview
This document lists all API endpoints available for wallet providers to manage wallet locations, privacy settings, and smart contracts.

## Authentication
Wallet providers use API key authentication with the `X-API-Key` header.

## Available Endpoints

### 1. Location Services (`/api/location/`)

#### POST `/api/location/update`
- **Purpose**: Update wallet location
- **Authentication**: API Key (`X-API-Key`)
- **Body**: 
  - `public_key` (required): Wallet public key
  - `blockchain` (required): Blockchain network
  - `latitude` (required): Latitude coordinate
  - `longitude` (required): Longitude coordinate
  - `wallet_type_id` (optional): Wallet type ID
  - `description` (optional): Wallet description
- **Response**: Updated wallet location

#### GET `/api/location/nearby`
- **Purpose**: Find wallets near a specific location
- **Authentication**: API Key (`X-API-Key`)
- **Parameters**: 
  - `lat` (required): Latitude (-90 to 90)
  - `lon` (required): Longitude (-180 to 180)
  - `radius` (optional): Search radius in meters (default: 1000)
- **Response**: Array of nearby wallet locations with contract info

### 2. Privacy & Visibility Settings (`/api/wallet-provider/`)

#### POST `/api/wallet-provider/privacy-settings`
- **Purpose**: Set privacy settings for wallets
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Privacy settings (privacy_level, location_sharing, etc.)
- **Response**: Updated privacy settings

#### POST `/api/wallet-provider/visibility-settings`
- **Purpose**: Set visibility settings for wallets
- **Authentication**: API Key (`X-API-Key`) or JWT
- **Body**: Visibility settings (visibility_level, show_location, etc.)
- **Response**: Updated visibility settings

### 3. Smart Contract Services (`/api/contracts/`)

**NEW**: All contract endpoints now support API key authentication for Wallet Providers!

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
- **Body**: Rule configuration (contract_id, rule_type, location, function_name, target_wallet_public_key, etc.)
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

### 5. Wallet Provider Analytics (`/api/wallet-provider/`)

#### GET `/api/wallet-provider/analytics`
- **Purpose**: Get analytics for wallet provider
- **Authentication**: JWT (Bearer token)
- **Response**: Analytics data (wallet counts, locations, etc.)

#### GET `/api/wallet-provider/locations-details`
- **Purpose**: Get detailed location information
- **Authentication**: JWT (Bearer token)
- **Response**: Location details with pagination

#### GET `/api/wallet-provider/wallet-locations-details`
- **Purpose**: Get wallet location details
- **Authentication**: JWT (Bearer token)
- **Response**: Wallet location details

#### GET `/api/wallet-provider/nearby-wallets`
- **Purpose**: Find nearby wallets
- **Authentication**: JWT (Bearer token)
- **Parameters**: latitude, longitude, radius
- **Response**: Nearby wallets with contract info

## New Contract Management Features

Wallet Providers can now:
- ✅ Discover contract functions
- ✅ Create and manage custom contracts
- ✅ Upload/download WASM files
- ✅ Set location-based execution rules for their wallets
- ✅ Execute contract functions
- ✅ All via API key authentication!

**Example: Create a Contract via API**
```bash
curl -X POST "https://api.geolink.com/api/contracts" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
    "contract_name": "Payment Contract",
    "network": "testnet"
  }'
```

**Example: Create Execution Rule for Specific Wallet**
```bash
curl -X POST "https://api.geolink.com/api/contracts/rules" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_id": 1,
    "rule_name": "Auto-pay for Wallet ABC",
    "rule_type": "location",
    "center_latitude": 34.0522,
    "center_longitude": -118.2437,
    "radius_meters": 50,
    "function_name": "execute_payment",
    "function_parameters": {"amount": "10"},
    "target_wallet_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA"
  }'
```

## Current Status
✅ **Working**: Location services, privacy/visibility settings, analytics
✅ **NEW**: Smart Contract Management via API key
✅ **NEW**: Contract execution rules for wallet-based triggers
✅ **NEW**: WASM file upload/download

## Swagger Documentation

All endpoints are documented in Swagger UI:
- Local: `http://localhost:4000/api-docs/`
- Azure: `https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api-docs/`

**New Tag**: "Contracts" - All contract management endpoints

