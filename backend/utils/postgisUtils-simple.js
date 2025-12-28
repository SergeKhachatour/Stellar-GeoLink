// Simple PostGIS utilities that won't cause startup issues
const pool = require('../config/database');

// Function to find nearby locations using ST_DWithin
async function findNearbyLocations(latitude, longitude, radius, tableName = 'wallet_locations') {
    try {
        // Check if location_enabled column exists in the table
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = 'location_enabled'
        `, [tableName]);
        
        const hasLocationEnabled = columnCheck.rows.length > 0;
        
        // Build query with location_enabled filter if column exists
        const locationEnabledFilter = hasLocationEnabled ? 'AND location_enabled = true' : '';
        
        const query = `
            SELECT *,
                   ST_Distance(
                       ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                       location
                   ) as distance
            FROM ${tableName}
            WHERE ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ${locationEnabledFilter}
            ORDER BY distance
        `;
        const result = await pool.query(query, [latitude, longitude, radius]);
        return result.rows;
    } catch (error) {
        console.error('Error finding nearby locations:', error);
        throw error;
    }
}

// Function to calculate distance between two geography points
async function calculateDistance(lat1, lon1, lat2, lon2) {
    try {
        const query = `
            SELECT ST_Distance(
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
            ) as distance_meters;
        `;
        const result = await pool.query(query, [lat1, lon1, lat2, lon2]);
        return result.rows[0].distance_meters;
    } catch (error) {
        console.error('Error calculating distance:', error);
        throw error;
    }
}

// Function to get bounding box of all locations
async function getBoundingBox(tableName = 'wallet_locations') {
    try {
        const query = `
            SELECT ST_AsText(ST_Extent(location)) as bbox_wkt
            FROM ${tableName}
            WHERE location IS NOT NULL;
        `;
        const result = await pool.query(query);
        return result.rows[0]?.bbox_wkt;
    } catch (error) {
        console.error('Error getting bounding box:', error);
        throw error;
    }
}

// Function to perform DBSCAN clustering
async function performDBSCAN(minPoints, epsilon, tableName = 'wallet_locations') {
    try {
        const query = `
            SELECT 
                ST_ClusterDBSCAN(location, $1, $2) OVER () as cluster_id,
                public_key,
                latitude,
                longitude,
                ST_AsText(location) as location_wkt
            FROM ${tableName}
            WHERE location IS NOT NULL;
        `;
        const result = await pool.query(query, [epsilon, minPoints]);
        return result.rows;
    } catch (error) {
        console.error('Error performing DBSCAN clustering:', error);
        throw error;
    }
}

// Function to get geospatial statistics
async function getGeospatialStats(tableName = 'wallet_locations') {
    try {
        const query = `
            SELECT 
                COUNT(*) as total_locations,
                COUNT(DISTINCT public_key) as unique_public_keys,
                ST_AsText(ST_Centroid(ST_Collect(location))) as geographic_center_wkt,
                ST_Area(ST_MinimumBoundingCircle(ST_Collect(location))::geography) as coverage_area_sq_meters
            FROM ${tableName}
            WHERE location IS NOT NULL;
        `;
        const result = await pool.query(query);
        return result.rows[0];
    } catch (error) {
        console.error('Error getting geospatial statistics:', error);
        throw error;
    }
}

module.exports = {
    findNearbyLocations,
    calculateDistance,
    getBoundingBox,
    performDBSCAN,
    getGeospatialStats
};
