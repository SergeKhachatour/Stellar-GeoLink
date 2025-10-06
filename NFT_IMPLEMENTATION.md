# Stellar-GeoLink NFT Implementation

This document describes the location-based NFT system implementation for Stellar-GeoLink.

## Overview

The NFT system enables users to pin NFTs to specific GPS coordinates and allows nearby users to collect them. The system includes rarity levels, location verification, and comprehensive analytics.

## Features Implemented

### 1. Database Schema
- **nft_collections**: Metadata about NFT types with rarity levels
- **pinned_nfts**: Location-based NFT instances with GPS coordinates
- **user_nft_ownership**: User ownership records
- **nft_transfers**: Transfer history and transactions
- **location_verifications**: GPS verification logs

### 2. User Roles
- Added `nft_manager` role with full NFT management capabilities
- Updated admin interface to include NFT manager role selection

### 3. API Endpoints

#### NFT Management
- `POST /api/nft/pin` - Pin NFT to location
- `GET /api/nft/nearby` - Get NFTs near user location
- `POST /api/nft/collect` - Collect nearby NFT
- `GET /api/nft/user-collection` - Get user's NFT collection
- `POST /api/nft/transfer` - Transfer NFT to another user
- `GET /api/nft/collection/:id` - Get specific NFT details
- `DELETE /api/nft/unpin/:id` - Unpin NFT from location

#### Location Verification
- `POST /api/location-verification/verify-nft` - Verify user is within NFT collection range
- `GET /api/location-verification/nft-range` - Check if user is within any NFT collection range
- `GET /api/location-verification/verification-history` - Get user's verification history
- `GET /api/location-verification/verification-stats` - Get verification statistics
- `POST /api/location-verification/bulk-verify` - Bulk location verification

#### NFT Analytics (NFT Manager/Admin only)
- `GET /api/nft-analytics/analytics` - NFT collection statistics
- `GET /api/nft-analytics/transfers` - Transfer history
- `GET /api/nft-analytics/rarity-stats` - Rarity distribution statistics
- `GET /api/nft-analytics/location-analytics` - Location-based analytics
- `GET /api/nft-analytics/user-analytics/:user_public_key` - User-specific analytics

### 4. Rarity System
- **Common**: Easy to collect, no special requirements (70% spawn rate)
- **Rare**: Requires verified GPS location (25% spawn rate)
- **Legendary**: Requires verified location within specific time window (5% spawn rate)

### 5. Location Verification
- GPS-based proximity verification using Haversine formula
- Configurable collection radius (default: 10 meters)
- Location verification logging for analytics
- Bulk verification for multiple NFTs

### 6. Frontend Components
- **NFTManager**: Main NFT management interface with tabs for different functions
- **NFTCollection**: User's NFT collection display
- **NFTMap**: Interactive map showing NFT locations with collection capabilities

## Installation & Setup

### 1. Run Database Migration
```bash
cd backend
node scripts/runNFTMigration.js
```

### 2. Update Environment Variables
Ensure your `.env` file includes:
```
REACT_APP_MAPBOX_TOKEN=your_mapbox_token
```

### 3. Install Frontend Dependencies
```bash
cd frontend
npm install mapbox-gl
```

### 4. Add Mapbox Script to HTML
Add to `frontend/public/index.html`:
```html
<script src='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js'></script>
<link href='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css' rel='stylesheet' />
```

## Usage Examples

### Pin an NFT to Location
```javascript
const response = await api.post('/api/nft/pin', {
    collection_id: 1,
    latitude: 40.7128,
    longitude: -74.0060,
    radius_meters: 10,
    ipfs_hash: 'QmXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx',
    smart_contract_address: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
});
```

### Collect a Nearby NFT
```javascript
const response = await api.post('/api/nft/collect', {
    nft_id: 123,
    user_latitude: 40.7128,
    user_longitude: -74.0060
});
```

### Get NFTs Near User
```javascript
const response = await api.get('/api/nft/nearby?latitude=40.7128&longitude=-74.0060&radius=1000');
```

## API Request/Response Examples

### Pin NFT Response
```json
{
    "message": "NFT pinned successfully",
    "nft": {
        "id": 123,
        "collection_id": 1,
        "latitude": 40.7128,
        "longitude": -74.0060,
        "radius_meters": 10,
        "pinned_by_user": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "pinned_at": "2024-01-01T12:00:00Z",
        "is_active": true
    }
}
```

### Collect NFT Response
```json
{
    "message": "NFT collected successfully",
    "ownership": {
        "id": 456,
        "user_public_key": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "nft_id": 123,
        "collected_at": "2024-01-01T12:00:00Z",
        "transfer_count": 0,
        "current_owner": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    },
    "verification": {
        "distance": 5.2,
        "isWithinRange": true,
        "radiusMeters": 10
    }
}
```

## Security Considerations

1. **Location Verification**: All location-based operations require GPS verification
2. **Role-based Access**: NFT management requires `nft_manager` or `admin` role
3. **API Rate Limiting**: All endpoints are protected by existing rate limiting
4. **Input Validation**: GPS coordinates and other inputs are validated
5. **Transaction Logging**: All transfers and collections are logged for audit

## Performance Optimizations

1. **Database Indexes**: Added spatial and performance indexes
2. **Location Caching**: Location verification results are cached
3. **Bulk Operations**: Support for bulk location verification
4. **Efficient Queries**: Optimized queries for nearby NFT searches

## Monitoring & Analytics

The system provides comprehensive analytics including:
- NFT collection statistics
- Transfer history and patterns
- Rarity distribution analysis
- Location-based success rates
- User behavior analytics
- Verification success rates

## Future Enhancements

1. **Smart Contract Integration**: Full Stellar smart contract integration
2. **IPFS Integration**: Automatic metadata storage on IPFS
3. **Advanced Rarity**: More complex rarity requirements
4. **Gamification**: Achievement system and leaderboards
5. **Mobile App**: Native mobile application for better location services

## Troubleshooting

### Common Issues

1. **Location Services Not Working**
   - Ensure HTTPS is enabled for geolocation API
   - Check browser permissions for location access

2. **Map Not Loading**
   - Verify Mapbox token is correctly set
   - Check network connectivity

3. **Database Migration Fails**
   - Ensure PostgreSQL is running
   - Check database connection settings
   - Verify user has CREATE privileges

4. **NFT Collection Fails**
   - Verify user is within collection radius
   - Check if NFT is still active
   - Ensure user meets rarity requirements

## Support

For issues or questions regarding the NFT implementation, please refer to the main project documentation or create an issue in the repository.
