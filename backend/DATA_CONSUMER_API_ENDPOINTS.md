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

### 3. Data Consumer Specific Services (`/api/data-consumer/`)

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
