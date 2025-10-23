# PostGIS Implementation for Stellar GeoLink

## Overview
This document outlines the PostGIS Geography column implementation for the `wallet_locations` table, providing powerful geospatial capabilities for location-based operations.

## Database Changes Required

### 1. Column Addition
```sql
-- Add the Geography column to wallet_locations table
ALTER TABLE wallet_locations 
ADD COLUMN location GEOGRAPHY(POINT, 4326);
```

### 2. Migration Script
Run the migration script on both local and Azure databases:
```bash
# Local database
psql -h localhost -U postgres -d GeoLink -f scripts/migrate-to-postgis.sql

# Azure database (via SSH)
ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d GeoLink -f /tmp/migrate-to-postgis.sql"
```

## Implementation Details

### 1. API Endpoint Updates
The `/api/location/update` endpoint now automatically populates the `location` column:

```sql
-- INSERT with PostGIS Geography
INSERT INTO wallet_locations 
(public_key, blockchain, latitude, longitude, wallet_type_id, description, wallet_provider_id, location)
VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($4, $3), 4326))

-- UPDATE with PostGIS Geography
ON CONFLICT (public_key, blockchain) 
DO UPDATE SET 
    location = ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326)
```

### 2. New Geospatial API Endpoints

#### `/api/geospatial/nearby`
Find locations within a radius using PostGIS Geography:
```bash
GET /api/geospatial/nearby?latitude=34.2304879&longitude=-118.2321767&radius=1000
```

#### `/api/geospatial/nearest`
Find the nearest location to a point:
```bash
GET /api/geospatial/nearest?latitude=34.2304879&longitude=-118.2321767
```

#### `/api/geospatial/distance`
Calculate distance between two points:
```bash
GET /api/geospatial/distance?lat1=34.2304879&lon1=-118.2321767&lat2=34.2504879&lon2=-118.2521767
```

#### `/api/geospatial/stats`
Get comprehensive geospatial statistics:
```bash
GET /api/geospatial/stats
```

#### `/api/geospatial/migrate`
Migrate existing lat/lon data to geography column:
```bash
POST /api/geospatial/migrate
```

## PostGIS Capabilities

### 1. High-Performance Spatial Queries
- **ST_DWithin**: Find locations within a radius (much faster than Haversine)
- **ST_Distance**: Calculate accurate distances using ellipsoidal calculations
- **ST_MakePoint**: Create geometry points from coordinates
- **ST_SetSRID**: Set spatial reference system (4326 = WGS84)

### 2. Advanced Geospatial Operations
- **Bounding Box Queries**: Find locations within rectangular areas
- **Route Analysis**: Find locations along a path
- **Clustering**: Group nearby locations using DBSCAN
- **Convex Hull**: Calculate coverage areas
- **Centroid**: Find geographic center of locations

### 3. Automatic Triggers
The database includes triggers that automatically update the `location` column when `latitude` or `longitude` changes:

```sql
CREATE TRIGGER trigger_update_wallet_location_geography
    BEFORE INSERT OR UPDATE OF latitude, longitude ON wallet_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_location_geography();
```

## Performance Benefits

### 1. Indexed Spatial Queries
```sql
-- GIST index for fast spatial queries
CREATE INDEX idx_wallet_locations_location 
ON wallet_locations USING GIST (location);
```

### 2. Optimized Distance Calculations
- PostGIS uses optimized algorithms for distance calculations
- Supports both planar and ellipsoidal distance calculations
- Much faster than application-level Haversine calculations

### 3. Spatial Joins
```sql
-- Find NFTs near wallet locations
SELECT n.*, wl.public_key, ST_Distance(n.location, wl.location) as distance
FROM pinned_nfts n
JOIN wallet_locations wl ON ST_DWithin(n.location, wl.location, 1000)
```

## Database Synchronization

### Local Database
```bash
# Run migration on local database
psql -h localhost -U postgres -d GeoLink -f scripts/migrate-to-postgis.sql
```

### Azure Database
```bash
# Copy migration script to Azure server
scp scripts/migrate-to-postgis.sql Serge369x33@20.253.209.97:/tmp/

# Run migration on Azure database
ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d GeoLink -f /tmp/migrate-to-postgis.sql"
```

## API Usage Examples

### 1. Update Location (with PostGIS)
```javascript
// The API automatically populates the location column
POST /api/location/update
{
  "public_key": "GCQRBPKGIB6TQYW7BG6B6OMSYO4JEPM3CNJBHXBLWKDVKNOCV6V2323P",
  "blockchain": "Stellar",
  "latitude": 34.2304879,
  "longitude": -118.2321767
}
```

### 2. Find Nearby Locations
```javascript
// Find locations within 5km radius
GET /api/geospatial/nearby?latitude=34.2304879&longitude=-118.2321767&radius=5000
```

### 3. Calculate Distance
```javascript
// Calculate distance between two points
GET /api/geospatial/distance?lat1=34.2304879&lon1=-118.2321767&lat2=34.2504879&lon2=-118.2521767
```

## Monitoring and Maintenance

### 1. Check Migration Status
```sql
SELECT 
    COUNT(*) as total_records,
    COUNT(location) as records_with_geography,
    COUNT(*) - COUNT(location) as records_missing_geography
FROM wallet_locations;
```

### 2. Performance Monitoring
```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'wallet_locations';
```

### 3. Spatial Statistics
```sql
-- Get geospatial statistics
SELECT 
    ST_Extent(location) as bounding_box,
    ST_Centroid(ST_Collect(location)) as geographic_center,
    ST_Area(ST_ConvexHull(ST_Collect(location))) as coverage_area
FROM wallet_locations
WHERE location IS NOT NULL;
```

## Benefits of PostGIS Implementation

1. **Performance**: Spatial indexes (GIST) provide fast spatial queries
2. **Accuracy**: Ellipsoidal distance calculations for global accuracy
3. **Scalability**: Handles millions of locations efficiently
4. **Standards Compliance**: Uses OGC standard spatial functions
5. **Advanced Analytics**: Support for complex geospatial operations
6. **Automatic Updates**: Triggers ensure data consistency

## Next Steps

1. **Run Migration**: Execute the migration script on both databases
2. **Test APIs**: Verify the new geospatial endpoints work correctly
3. **Update Frontend**: Modify frontend to use the new PostGIS capabilities
4. **Monitor Performance**: Track query performance and optimize as needed
5. **Add More Features**: Implement advanced geospatial analytics

## Troubleshooting

### Common Issues
1. **PostGIS Extension**: Ensure PostGIS is installed and enabled
2. **SRID Mismatch**: Always use SRID 4326 for WGS84 coordinates
3. **Index Performance**: Monitor GIST index usage and rebuild if needed
4. **Memory Usage**: Large spatial operations may require more memory

### Debug Queries
```sql
-- Check PostGIS version
SELECT PostGIS_Version();

-- Check spatial reference systems
SELECT * FROM spatial_ref_sys WHERE srid = 4326;

-- Test spatial functions
SELECT ST_AsText(ST_SetSRID(ST_MakePoint(-118.2321767, 34.2304879), 4326));
```
