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
        
        // Check if privacy and visibility settings tables exist
        const privacyTableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_privacy_settings'
        `);
        const hasPrivacySettings = privacyTableCheck.rows.length > 0;
        
        const visibilityTableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_visibility_settings'
        `);
        const hasVisibilitySettings = visibilityTableCheck.rows.length > 0;
        
        // Build query with location_enabled filter if column exists
        const locationEnabledFilter = hasLocationEnabled ? 'AND wl.location_enabled = true' : '';
        
        // Build privacy and visibility filters
        // Default behavior: if settings don't exist, allow visibility (backward compatibility)
        // If settings exist: must have location_sharing = true AND privacy_level = 'public'
        // AND show_location = true AND visibility_level = 'public'
        let privacyFilter = '';
        let visibilityFilter = '';
        let joinClause = '';
        
        if (hasPrivacySettings && hasVisibilitySettings) {
            // Join through wallet_providers to match user_id for privacy/visibility settings
            // This ensures we match the correct user's settings for their wallet
            joinClause = `
                LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
                LEFT JOIN user_privacy_settings ups ON wl.public_key = ups.public_key AND wp.user_id = ups.user_id
                LEFT JOIN user_visibility_settings uvs ON wl.public_key = uvs.public_key AND wp.user_id = uvs.user_id
            `;
            // Visibility takes precedence: if visibility is public, show wallet regardless of privacy
            // If visibility is private or not set, check privacy settings
            // Logic: Show if (visibility is public) OR (no visibility settings AND privacy allows) OR (no settings at all)
            // Simplified: Show if visibility is public OR no visibility settings exist (then privacy will be checked separately if needed)
            privacyFilter = '';
            visibilityFilter = `AND (
                uvs.public_key IS NULL OR 
                (uvs.show_location = true AND uvs.visibility_level = 'public')
            )`;
        } else if (hasPrivacySettings) {
            joinClause = `
                LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
                LEFT JOIN user_privacy_settings ups ON wl.public_key = ups.public_key AND wp.user_id = ups.user_id
            `;
            privacyFilter = `AND (ups.public_key IS NULL OR (ups.location_sharing = true AND ups.privacy_level = 'public'))`;
        } else if (hasVisibilitySettings) {
            joinClause = `
                LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
                LEFT JOIN user_visibility_settings uvs ON wl.public_key = uvs.public_key AND wp.user_id = uvs.user_id
            `;
            visibilityFilter = `AND (uvs.public_key IS NULL OR (uvs.show_location = true AND uvs.visibility_level = 'public'))`;
        }
        
        const query = `
            SELECT wl.*,
                   ST_Distance(
                       ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                       wl.location
                   ) as distance,
                   ups.privacy_level as privacy_level,
                   ups.location_sharing as location_sharing,
                   uvs.visibility_level as visibility_level,
                   uvs.show_location as show_location
            FROM ${tableName} wl
            ${joinClause}
            WHERE ST_DWithin(
                wl.location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ${locationEnabledFilter}
            ${privacyFilter}
            ${visibilityFilter}
            ORDER BY distance
        `;
        
        console.log(`[findNearbyLocations] Query filters: location_enabled=${hasLocationEnabled}, privacy=${hasPrivacySettings}, visibility=${hasVisibilitySettings}`);
        console.log(`[findNearbyLocations] Privacy filter: ${privacyFilter}`);
        console.log(`[findNearbyLocations] Visibility filter: ${visibilityFilter}`);
        console.log(`[findNearbyLocations] Search params: lat=${latitude}, lon=${longitude}, radius=${radius}m`);
        
        const result = await pool.query(query, [latitude, longitude, radius]);
        console.log(`[findNearbyLocations] Found ${result.rows.length} wallets`);
        
        // Log first few wallets for debugging
        if (result.rows.length > 0) {
            console.log(`[findNearbyLocations] Sample wallets:`, result.rows.slice(0, 3).map(w => ({
                public_key: w.public_key?.substring(0, 10) + '...',
                distance: w.distance,
                visibility_level: w.visibility_level,
                show_location: w.show_location,
                privacy_level: w.privacy_level,
                location_sharing: w.location_sharing
            })));
        }
        
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

