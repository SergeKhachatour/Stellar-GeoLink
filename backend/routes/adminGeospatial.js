const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser, requireRole } = require('../middleware/authUser');
const { findNearbyLocations, calculateDistance, getBoundingBox, performDBSCAN, getGeospatialStats } = require('../utils/postgisUtils-simple');

/**
 * @swagger
 * components:
 *   schemas:
 *     GlobalAnalytics:
 *       type: object
 *       properties:
 *         total_locations:
 *           type: integer
 *         active_providers:
 *           type: integer
 *         coverage_area:
 *           type: number
 *         geographic_center:
 *           type: string
 *         density_analysis:
 *           type: object
 *     ProviderComparison:
 *       type: object
 *       properties:
 *         provider_id:
 *           type: integer
 *         provider_name:
 *           type: string
 *         location_count:
 *           type: integer
 *         coverage_area:
 *           type: number
 *         activity_score:
 *           type: number
 */

/**
 * @swagger
 * /api/admin/geospatial/global-analytics:
 *   get:
 *     summary: Get global geospatial analytics
 *     description: Comprehensive analytics for all wallet locations across all providers
 *     tags: [Admin Geospatial]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Global analytics retrieved successfully
 */
router.get('/global-analytics', authenticateUser, requireRole(['admin']), async (req, res) => {
    try {
        // Get comprehensive global analytics
        const globalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(DISTINCT wallet_provider_id) as active_providers,
                ST_AsText(ST_Extent(location::geometry)) as global_bounding_box,
                ST_AsText(ST_Centroid(ST_Collect(location::geometry))) as global_center,
                ST_Area(ST_ConvexHull(ST_Collect(location::geometry))::geography) as global_coverage_area
            FROM wallet_locations
            WHERE location IS NOT NULL
        `);
        
        // Get average distance separately to avoid nested aggregates
        const avgDistanceResult = await pool.query(`
            WITH center AS (
                SELECT ST_Centroid(ST_Collect(location::geometry))::geography as center_point
                FROM wallet_locations
                WHERE location IS NOT NULL
            )
            SELECT AVG(ST_Distance(location, center_point)) as avg_distance_from_center
            FROM wallet_locations, center
            WHERE location IS NOT NULL
        `);
        
        // Get provider comparison data
        const providerStats = await pool.query(`
            SELECT 
                wp.id as provider_id,
                u.public_key as provider_public_key,
                COUNT(wl.id) as location_count,
                ST_Area(ST_ConvexHull(ST_Collect(wl.location::geometry))::geography) as coverage_area,
                COUNT(CASE WHEN wl.last_updated > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_activity,
                MAX(wl.last_updated) as last_activity
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id AND wl.location IS NOT NULL
            WHERE wp.status = true
            GROUP BY wp.id, u.public_key
            ORDER BY location_count DESC
        `);
        
        // Get density analysis by geographic regions
        const densityAnalysis = await pool.query(`
            WITH density_grid AS (
                SELECT 
                    ST_X(location::geometry) as lon,
                    ST_Y(location::geometry) as lat,
                    COUNT(*) as density,
                    ST_AsText(location) as location_wkt
                FROM wallet_locations
                WHERE location IS NOT NULL
                GROUP BY ST_X(location::geometry), ST_Y(location::geometry), location
            )
            SELECT 
                lon,
                lat,
                density,
                location_wkt,
                CASE 
                    WHEN density >= 10 THEN 'high'
                    WHEN density >= 5 THEN 'medium'
                    ELSE 'low'
                END as density_level
            FROM density_grid
            ORDER BY density DESC
            LIMIT 50
        `);
        
        // Get temporal analysis
        const temporalAnalysis = await pool.query(`
            SELECT 
                DATE_TRUNC('hour', last_updated) as hour,
                COUNT(*) as location_count,
                COUNT(DISTINCT wallet_provider_id) as active_providers
            FROM wallet_locations
            WHERE location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '7 days'
            GROUP BY DATE_TRUNC('hour', last_updated)
            ORDER BY hour DESC
            LIMIT 168
        `);
        
        res.json({
            global_statistics: {
                ...globalStats.rows[0],
                avg_distance_from_center: avgDistanceResult.rows[0]?.avg_distance_from_center || 0
            },
            provider_comparison: providerStats.rows,
            density_analysis: densityAnalysis.rows,
            temporal_analysis: temporalAnalysis.rows
        });
        
    } catch (error) {
        console.error('Error getting global analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/admin/geospatial/provider-heatmap:
 *   get:
 *     summary: Get provider-specific heatmap data
 *     description: Heatmap data for specific wallet provider
 *     tags: [Admin Geospatial]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Wallet provider ID
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to include
 *     responses:
 *       200:
 *         description: Provider heatmap data retrieved
 */
router.get('/provider-heatmap', authenticateUser, requireRole(['admin']), async (req, res) => {
    try {
        const { provider_id, days = 7 } = req.query;
        
        if (!provider_id) {
            return res.status(400).json({ error: 'Provider ID is required' });
        }
        
        const heatmapData = await pool.query(`
            SELECT 
                ST_X(location::geometry) as longitude,
                ST_Y(location::geometry) as latitude,
                COUNT(*) as intensity,
                MAX(last_updated) as latest_activity,
                ARRAY_AGG(DISTINCT public_key) as wallet_addresses,
                COUNT(DISTINCT public_key) as unique_wallets
            FROM wallet_locations
            WHERE wallet_provider_id = $1 
            AND location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${days} days'
            GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
            ORDER BY intensity DESC
        `, [provider_id]);
        
        // Get provider info
        const providerInfo = await pool.query(`
            SELECT 
                wp.id,
                u.public_key,
                wp.status,
                wp.created_at
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            WHERE wp.id = $1
        `, [provider_id]);
        
        res.json({
            provider_info: providerInfo.rows[0],
            heatmap_data: heatmapData.rows,
            period_days: days,
            total_points: heatmapData.rows.length
        });
        
    } catch (error) {
        console.error('Error getting provider heatmap:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/admin/geospatial/cluster-analysis:
 *   get:
 *     summary: Perform cluster analysis on all locations
 *     description: Identify location clusters and patterns across all providers
 *     tags: [Admin Geospatial]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cluster_distance
 *         schema:
 *           type: number
 *           default: 1000
 *         description: Distance threshold for clustering in meters
 *     responses:
 *       200:
 *         description: Cluster analysis completed
 */
router.get('/cluster-analysis', authenticateUser, requireRole(['admin']), async (req, res) => {
    try {
        const clusterDistance = parseFloat(req.query.cluster_distance) || 1000;
        
        // Perform cluster analysis using PostGIS
        const clusterData = await pool.query(`
            WITH clustered_locations AS (
                SELECT 
                    id,
                    public_key,
                    latitude,
                    longitude,
                    location,
                    wallet_provider_id,
                    last_updated,
                    ST_ClusterDBSCAN(location, $1, 1) OVER() as cluster_id
                FROM wallet_locations
                WHERE location IS NOT NULL
            )
            SELECT 
                cluster_id,
                COUNT(*) as cluster_size,
                ST_Centroid(ST_Collect(location)) as cluster_center,
                ST_Area(ST_ConvexHull(ST_Collect(location))) as cluster_area,
                COUNT(DISTINCT wallet_provider_id) as providers_in_cluster,
                COUNT(DISTINCT public_key) as unique_wallets,
                MIN(last_updated) as earliest_activity,
                MAX(last_updated) as latest_activity
            FROM clustered_locations
            WHERE cluster_id IS NOT NULL
            GROUP BY cluster_id
            ORDER BY cluster_size DESC
        `, [clusterDistance]);
        
        // Get individual locations in clusters
        const clusterDetails = await pool.query(`
            WITH clustered_locations AS (
                SELECT 
                    id,
                    public_key,
                    latitude,
                    longitude,
                    location,
                    wallet_provider_id,
                    last_updated,
                    ST_ClusterDBSCAN(location, $1, 1) OVER() as cluster_id
                FROM wallet_locations
                WHERE location IS NOT NULL
            )
            SELECT 
                cluster_id,
                public_key,
                latitude,
                longitude,
                ST_AsText(location) as location_wkt,
                wallet_provider_id,
                last_updated
            FROM clustered_locations
            WHERE cluster_id IS NOT NULL
            ORDER BY cluster_id, last_updated DESC
        `, [clusterDistance]);
        
        res.json({
            cluster_summary: clusterData.rows,
            cluster_details: clusterDetails.rows,
            cluster_distance_meters: clusterDistance,
            total_clusters: clusterData.rows.length
        });
        
    } catch (error) {
        console.error('Error performing cluster analysis:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/admin/geospatial/geofence-analysis:
 *   get:
 *     summary: Analyze geofence interactions
 *     description: Analyze how wallet locations interact with defined geofences
 *     tags: [Admin Geospatial]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Geofence analysis completed
 */
router.get('/geofence-analysis', authenticateUser, requireRole(['admin']), async (req, res) => {
    try {
        // Get geofence interactions
        const geofenceInteractions = await pool.query(`
            SELECT 
                g.id as geofence_id,
                g.name as geofence_name,
                g.geofence_type,
                COUNT(wl.id) as location_count,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                COUNT(DISTINCT wl.wallet_provider_id) as providers,
                ST_Area(g.boundary) as geofence_area,
                AVG(ST_Distance(wl.location, ST_Centroid(g.boundary))) as avg_distance_from_center
            FROM geofences g
            LEFT JOIN wallet_locations wl ON ST_Within(wl.location, g.boundary)
            WHERE g.is_active = true
            GROUP BY g.id, g.name, g.geofence_type, g.boundary
            ORDER BY location_count DESC
        `);
        
        // Get geofence entry/exit patterns
        const entryExitPatterns = await pool.query(`
            SELECT 
                g.id as geofence_id,
                g.name as geofence_name,
                wl.public_key,
                wl.last_updated,
                CASE 
                    WHEN ST_Within(wl.location, g.boundary) THEN 'inside'
                    ELSE 'outside'
                END as status
            FROM geofences g
            JOIN wallet_locations wl ON ST_DWithin(wl.location, g.boundary, 1000)
            WHERE g.is_active = true
            ORDER BY g.id, wl.public_key, wl.last_updated DESC
        `);
        
        res.json({
            geofence_interactions: geofenceInteractions.rows,
            entry_exit_patterns: entryExitPatterns.rows
        });
        
    } catch (error) {
        console.error('Error analyzing geofences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
