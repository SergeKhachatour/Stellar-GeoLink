// Lazy load database connection to avoid startup issues
let pool;
const getPool = () => {
    if (!pool) {
        pool = require('../config/database');
    }
    return pool;
};

/**
 * PostGIS Geography Utilities for Stellar GeoLink
 * 
 * This module provides comprehensive PostGIS functions for geospatial operations
 * using the Geography column in wallet_locations table.
 */

class PostGISUtils {
    
    /**
     * Create a PostGIS Geography point from latitude and longitude
     * @param {number} longitude - Longitude coordinate
     * @param {number} latitude - Latitude coordinate
     * @param {number} srid - Spatial Reference System ID (default: 4326 for WGS84)
     * @returns {string} PostGIS Geography point
     */
    static createGeographyPoint(longitude, latitude, srid = 4326) {
        return `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), ${srid})`;
    }

    /**
     * Find locations within a radius using PostGIS Geography
     * @param {number} centerLat - Center latitude
     * @param {number} centerLon - Center longitude
     * @param {number} radiusMeters - Search radius in meters
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with locations and distances
     */
    static async findLocationsWithinRadius(centerLat, centerLon, radiusMeters, tableName = 'wallet_locations') {
        const query = `
            SELECT 
                *,
                ST_Distance(
                    location,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) as distance_meters,
                ST_AsText(location) as location_wkt
            FROM ${tableName}
            WHERE location IS NOT NULL
            AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ORDER BY distance_meters ASC
        `;
        
        return await pool.query(query, [centerLat, centerLon, radiusMeters]);
    }

    /**
     * Find the nearest location to a given point
     * @param {number} centerLat - Center latitude
     * @param {number} centerLon - Center longitude
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with nearest location
     */
    static async findNearestLocation(centerLat, centerLon, tableName = 'wallet_locations') {
        const query = `
            SELECT 
                *,
                ST_Distance(
                    location,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) as distance_meters,
                ST_AsText(location) as location_wkt
            FROM ${tableName}
            WHERE location IS NOT NULL
            ORDER BY distance_meters ASC
            LIMIT 1
        `;
        
        return await pool.query(query, [centerLat, centerLon]);
    }

    /**
     * Calculate distance between two points using PostGIS Geography
     * @param {number} lat1 - First point latitude
     * @param {number} lon1 - First point longitude
     * @param {number} lat2 - Second point latitude
     * @param {number} lon2 - Second point longitude
     * @returns {Object} Query result with distance in meters
     */
    static async calculateDistance(lat1, lon1, lat2, lon2) {
        const query = `
            SELECT ST_Distance(
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
            ) as distance_meters
        `;
        
        return await pool.query(query, [lat1, lon1, lat2, lon2]);
    }

    /**
     * Find locations within a bounding box
     * @param {number} minLat - Minimum latitude
     * @param {number} minLon - Minimum longitude
     * @param {number} maxLat - Maximum latitude
     * @param {number} maxLon - Maximum longitude
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with locations in bounding box
     */
    static async findLocationsInBoundingBox(minLat, minLon, maxLat, maxLon, tableName = 'wallet_locations') {
        const query = `
            SELECT 
                *,
                ST_AsText(location) as location_wkt
            FROM ${tableName}
            WHERE location IS NOT NULL
            AND ST_Within(
                location,
                ST_MakeEnvelope($2, $1, $4, $3, 4326)::geography
            )
        `;
        
        return await pool.query(query, [minLat, minLon, maxLat, maxLon]);
    }

    /**
     * Get geospatial statistics for locations
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with geospatial statistics
     */
    static async getGeospatialStats(tableName = 'wallet_locations') {
        const query = `
            SELECT 
                COUNT(*) as total_locations,
                ST_Extent(location) as bounding_box,
                ST_Centroid(ST_Collect(location)) as geographic_center,
                ST_Area(ST_ConvexHull(ST_Collect(location))) as coverage_area
            FROM ${tableName}
            WHERE location IS NOT NULL
        `;
        
        return await pool.query(query);
    }

    /**
     * Find locations along a route (within a buffer of a line)
     * @param {Array} routePoints - Array of {lat, lon} points defining the route
     * @param {number} bufferMeters - Buffer distance in meters
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with locations along route
     */
    static async findLocationsAlongRoute(routePoints, bufferMeters, tableName = 'wallet_locations') {
        // Create a line string from route points
        const points = routePoints.map(point => `${point.lon} ${point.lat}`).join(',');
        const lineString = `ST_SetSRID(ST_MakeLine(ARRAY[${points}]), 4326)`;
        
        const query = `
            SELECT 
                *,
                ST_Distance(
                    location,
                    ${lineString}::geography
                ) as distance_to_route
            FROM ${tableName}
            WHERE location IS NOT NULL
            AND ST_DWithin(
                location,
                ${lineString}::geography,
                $1
            )
            ORDER BY distance_to_route ASC
        `;
        
        return await pool.query(query, [bufferMeters]);
    }

    /**
     * Cluster nearby locations using PostGIS
     * @param {number} clusterDistanceMeters - Distance threshold for clustering
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with clustered locations
     */
    static async clusterLocations(clusterDistanceMeters, tableName = 'wallet_locations') {
        const query = `
            SELECT 
                ST_ClusterDBSCAN(location, $1, 1) OVER() as cluster_id,
                *
            FROM ${tableName}
            WHERE location IS NOT NULL
            ORDER BY cluster_id
        `;
        
        return await pool.query(query, [clusterDistanceMeters]);
    }

    /**
     * Update location geography column from latitude/longitude
     * @param {number} id - Record ID
     * @param {number} latitude - Latitude coordinate
     * @param {number} longitude - Longitude coordinate
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result
     */
    static async updateLocationGeography(id, latitude, longitude, tableName = 'wallet_locations') {
        const query = `
            UPDATE ${tableName}
            SET location = ST_SetSRID(ST_MakePoint($2, $1), 4326)
            WHERE id = $3
            RETURNING *
        `;
        
        return await pool.query(query, [latitude, longitude, id]);
    }

    /**
     * Migrate existing latitude/longitude data to geography column
     * @param {string} tableName - Table name (default: 'wallet_locations')
     * @returns {Object} Query result with migration statistics
     */
    static async migrateToGeography(tableName = 'wallet_locations') {
        const query = `
            UPDATE ${tableName}
            SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL 
            AND location IS NULL
            RETURNING COUNT(*) as migrated_count
        `;
        
        return await pool.query(query);
    }
}

module.exports = PostGISUtils;
