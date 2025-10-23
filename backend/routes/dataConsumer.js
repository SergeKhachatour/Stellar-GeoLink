const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser, requireRole } = require('../middleware/authUser');
const { findNearbyLocations, getGeospatialStats } = require('../utils/postgisUtils-simple');

/**
 * @swagger
 * components:
 *   schemas:
 *     LocationInsight:
 *       type: object
 *       properties:
 *         location_id:
 *           type: integer
 *         public_key:
 *           type: string
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         distance_meters:
 *           type: number
 *         last_updated:
 *           type: string
 *         provider_info:
 *           type: object
 *     MarketAnalysis:
 *       type: object
 *       properties:
 *         region:
 *           type: string
 *         wallet_density:
 *           type: number
 *         activity_level:
 *           type: string
 *         market_potential:
 *           type: string
 */

/**
 * @swagger
 * /api/data-consumer/location-insights:
 *   get:
 *     summary: Get location-based market insights
 *     description: Provides market insights based on wallet location data
 *     tags: [Data Consumer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center latitude for analysis
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center longitude for analysis
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 5000
 *         description: Analysis radius in meters
 *     responses:
 *       200:
 *         description: Location insights retrieved successfully
 */
router.get('/location-insights', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { latitude, longitude, radius = 5000 } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        
        // Get nearby wallet locations with provider info
        const nearbyWallets = await pool.query(`
            SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.last_updated,
                wl.blockchain,
                ST_Distance(
                    wl.location,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) as distance_meters,
                wp.id as provider_id,
                u.public_key as provider_public_key,
                ST_AsText(wl.location) as location_wkt
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wp.id = wl.wallet_provider_id
            JOIN users u ON u.id = wp.user_id
            WHERE wl.location IS NOT NULL
            AND ST_DWithin(
                wl.location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ORDER BY distance_meters ASC
        `, [latitude, longitude, radius]);
        
        // Get market density analysis
        const densityAnalysis = await pool.query(`
            WITH density_grid AS (
                SELECT 
                    ST_X(location::geometry) as lon,
                    ST_Y(location::geometry) as lat,
                    COUNT(*) as wallet_count,
                    COUNT(DISTINCT wallet_provider_id) as provider_count
                FROM wallet_locations
                WHERE location IS NOT NULL
                AND ST_DWithin(
                    location,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                    $3
                )
                GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
            )
            SELECT 
                lon,
                lat,
                wallet_count,
                provider_count,
                CASE 
                    WHEN wallet_count >= 10 THEN 'high_density'
                    WHEN wallet_count >= 5 THEN 'medium_density'
                    ELSE 'low_density'
                END as density_level
            FROM density_grid
            ORDER BY wallet_count DESC
        `, [latitude, longitude, radius]);
        
        // Get temporal activity patterns
        const activityPatterns = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM last_updated) as hour,
                COUNT(*) as activity_count,
                COUNT(DISTINCT public_key) as unique_wallets,
                COUNT(DISTINCT wallet_provider_id) as active_providers
            FROM wallet_locations
            WHERE location IS NOT NULL
            AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            AND last_updated > NOW() - INTERVAL '7 days'
            GROUP BY EXTRACT(HOUR FROM last_updated)
            ORDER BY hour
        `, [latitude, longitude, radius]);
        
        // Calculate market insights
        const totalWallets = nearbyWallets.rows.length;
        const uniqueProviders = new Set(nearbyWallets.rows.map(w => w.provider_id)).size;
        const avgDistance = nearbyWallets.rows.reduce((sum, w) => sum + parseFloat(w.distance_meters), 0) / totalWallets;
        
        const marketInsights = {
            total_wallets: totalWallets,
            unique_providers: uniqueProviders,
            average_distance_meters: Math.round(avgDistance),
            density_level: totalWallets >= 20 ? 'high' : totalWallets >= 10 ? 'medium' : 'low',
            market_potential: totalWallets >= 15 ? 'high' : totalWallets >= 8 ? 'medium' : 'low'
        };
        
        res.json({
            market_insights: marketInsights,
            nearby_wallets: nearbyWallets.rows,
            density_analysis: densityAnalysis.rows,
            activity_patterns: activityPatterns.rows,
            analysis_center: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                radius: parseFloat(radius)
            }
        });
        
    } catch (error) {
        console.error('Error getting location insights:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/data-consumer/market-analysis:
 *   get:
 *     summary: Get comprehensive market analysis
 *     description: Provides detailed market analysis for business intelligence
 *     tags: [Data Consumer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Geographic region to analyze
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Analysis period in days
 *     responses:
 *       200:
 *         description: Market analysis completed
 */
router.get('/market-analysis', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { region, days = 30 } = req.query;
        
        console.log('📊 Fetching market analysis for data consumer...');
        console.log('📊 Analysis period:', days, 'days');
        
        // Get basic global statistics (simplified)
        const globalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(DISTINCT public_key) as unique_wallets,
                COUNT(DISTINCT wallet_provider_id) as active_providers
            FROM wallet_locations
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${parseInt(days)} days'
        `);
        
        // Get provider market share (simplified)
        const providerMarketShare = await pool.query(`
            SELECT 
                wp.id as provider_id,
                u.email as provider_name,
                COUNT(wl.id) as location_count,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                MAX(wl.last_updated) as last_activity
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id 
                AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
                AND wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days'
            WHERE wp.status = true
            GROUP BY wp.id, u.email
            ORDER BY location_count DESC
            LIMIT 10
        `);
        
        // Get basic growth trends
        const growthTrends = await pool.query(`
            SELECT 
                DATE_TRUNC('day', last_updated) as date,
                COUNT(*) as daily_locations,
                COUNT(DISTINCT public_key) as daily_unique_wallets
            FROM wallet_locations
            WHERE location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE_TRUNC('day', last_updated)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        // Get NFT market data
        const nftMarketData = await pool.query(`
            SELECT 
                COUNT(DISTINCT pn.id) as total_nfts,
                COUNT(DISTINCT pn.collection_id) as total_collections,
                COUNT(DISTINCT pn.pinned_by_user) as unique_nft_managers,
                AVG(pn.radius_meters) as avg_radius,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                COUNT(CASE WHEN pn.created_at > NOW() - INTERVAL '${parseInt(days)} days' THEN 1 END) as recent_nfts
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
        `);
        
        // Get NFT collection distribution
        const nftCollectionDistribution = await pool.query(`
            SELECT 
                nc.id as collection_id,
                nc.name as collection_name,
                nc.description,
                COUNT(pn.id) as nft_count,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                AVG(pn.radius_meters) as avg_radius,
                MIN(pn.created_at) as first_nft,
                MAX(pn.created_at) as latest_nft
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON pn.collection_id = nc.id
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY nc.id, nc.name, nc.description
            ORDER BY nft_count DESC
            LIMIT 10
        `);
        
        // Get NFT rarity distribution
        const nftRarityDistribution = await pool.query(`
            SELECT 
                pn.rarity_requirements->>'rarity_level' as rarity_level,
                COUNT(*) as count,
                CAST((COUNT(*)::FLOAT / (SELECT COUNT(*) FROM pinned_nfts WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days')) * 100 AS DECIMAL(10,2)) as percentage
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            AND pn.rarity_requirements->>'rarity_level' IS NOT NULL
            GROUP BY pn.rarity_requirements->>'rarity_level'
            ORDER BY count DESC
        `);
        
        // Get NFT activity trends
        const nftActivityTrends = await pool.query(`
            SELECT 
                DATE_TRUNC('day', pn.created_at) as date,
                COUNT(*) as daily_nfts,
                COUNT(DISTINCT pn.collection_id) as daily_collections,
                COUNT(DISTINCT pn.pinned_by_user) as daily_managers
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE_TRUNC('day', pn.created_at)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        // Calculate market share percentages
        const totalLocations = parseInt(globalStats.rows[0]?.total_locations || 0);
        const providerData = providerMarketShare.rows.map(provider => ({
            ...provider,
            market_share_percent: totalLocations > 0 ? 
                ((parseInt(provider.location_count) / totalLocations) * 100).toFixed(2) : '0.00'
        }));
        
        console.log('✅ Market analysis completed successfully');
        
        res.json({
            global_statistics: {
                total_locations: totalLocations,
                unique_wallets: parseInt(globalStats.rows[0]?.unique_wallets || 0),
                active_providers: parseInt(globalStats.rows[0]?.active_providers || 0)
            },
            provider_market_share: providerData,
            growth_trends: growthTrends.rows,
            nft_market_data: {
                total_nfts: parseInt(nftMarketData.rows[0]?.total_nfts || 0),
                total_collections: parseInt(nftMarketData.rows[0]?.total_collections || 0),
                unique_nft_managers: parseInt(nftMarketData.rows[0]?.unique_nft_managers || 0),
                active_nfts: parseInt(nftMarketData.rows[0]?.active_nfts || 0),
                recent_nfts: parseInt(nftMarketData.rows[0]?.recent_nfts || 0),
                avg_radius: parseFloat(nftMarketData.rows[0]?.avg_radius || 0)
            },
            nft_collection_distribution: nftCollectionDistribution.rows,
            nft_rarity_distribution: nftRarityDistribution.rows,
            nft_activity_trends: nftActivityTrends.rows,
            analysis_period_days: parseInt(days)
        });
        
    } catch (error) {
        console.error('❌ Error getting market analysis:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail
        });
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/data-consumer/competitive-analysis:
 *   get:
 *     summary: Get competitive analysis insights
 *     description: Analyze competitive landscape and market positioning
 *     tags: [Data Consumer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: focus_area
 *         schema:
 *           type: string
 *         description: Geographic focus area for analysis
 *     responses:
 *       200:
 *         description: Competitive analysis completed
 */
router.get('/competitive-analysis', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { focus_area } = req.query;
        
        // Get competitive landscape analysis
        const competitiveLandscape = await pool.query(`
            SELECT 
                wp.id as provider_id,
                u.public_key as provider_public_key,
                COUNT(wl.id) as total_locations,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                ST_Area(ST_ConvexHull(ST_Collect(wl.location))) as coverage_area,
                AVG(ST_Distance(
                    wl.location,
                    ST_Centroid(ST_Collect(wl.location))
                )) as avg_spread,
                COUNT(CASE WHEN wl.last_updated > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_activity,
                MAX(wl.last_updated) as last_activity
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id 
                AND wl.location IS NOT NULL
            WHERE wp.status = true
            GROUP BY wp.id, u.public_key
            ORDER BY total_locations DESC
        `);
        
        // Get market concentration analysis
        const marketConcentration = await pool.query(`
            WITH provider_stats AS (
                SELECT 
                    wp.id,
                    COUNT(wl.id) as location_count
                FROM wallet_providers wp
                LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id 
                    AND wl.location IS NOT NULL
                WHERE wp.status = true
                GROUP BY wp.id
            ),
            total_locations AS (
                SELECT SUM(location_count) as total FROM provider_stats
            )
            SELECT 
                ps.id as provider_id,
                ps.location_count,
                CAST((ps.location_count::FLOAT / tl.total) * 100 AS DECIMAL(10,2)) as market_share,
                CASE 
                    WHEN (ps.location_count::FLOAT / tl.total) > 0.3 THEN 'dominant'
                    WHEN (ps.location_count::FLOAT / tl.total) > 0.1 THEN 'significant'
                    ELSE 'niche'
                END as market_position
            FROM provider_stats ps
            CROSS JOIN total_locations tl
            ORDER BY market_share DESC
        `);
        
        // Get geographic distribution insights
        const geographicDistribution = await pool.query(`
            SELECT 
                ST_X(location::geometry) as longitude,
                ST_Y(location::geometry) as latitude,
                COUNT(*) as location_density,
                COUNT(DISTINCT wallet_provider_id) as provider_diversity,
                ARRAY_AGG(DISTINCT wallet_provider_id) as providers_present
            FROM wallet_locations
            WHERE location IS NOT NULL
            GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
            HAVING COUNT(*) >= 2
            ORDER BY location_density DESC
            LIMIT 20
        `);
        
        res.json({
            competitive_landscape: competitiveLandscape.rows,
            market_concentration: marketConcentration.rows,
            geographic_distribution: geographicDistribution.rows
        });
        
    } catch (error) {
        console.error('Error getting competitive analysis:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/data-consumer/provider-analytics:
 *   get:
 *     summary: Get wallet provider analytics
 *     description: Provides detailed analytics about wallet providers and their performance
 *     tags: [Data Consumer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Analysis period in days
 *     responses:
 *       200:
 *         description: Provider analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_providers:
 *                   type: integer
 *                 active_providers:
 *                   type: integer
 *                 provider_performance:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider_name:
 *                         type: string
 *                       total_wallets:
 *                         type: integer
 *                       active_wallets:
 *                         type: integer
 *                       coverage_area:
 *                         type: number
 *                       avg_activity:
 *                         type: number
 */
router.get('/provider-analytics', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        // Get total and active providers
        const providerStats = await pool.query(`
            SELECT 
                COUNT(DISTINCT wp.id) as total_providers,
                COUNT(DISTINCT CASE WHEN wp.status = true THEN wp.id END) as active_providers
            FROM wallet_providers wp
        `);
        
        // Get provider performance data
        const providerPerformance = await pool.query(`
            SELECT 
                wp.name as provider_name,
                COUNT(DISTINCT wl.public_key) as total_wallets,
                COUNT(DISTINCT CASE WHEN wl.tracking_status = true THEN wl.public_key END) as active_wallets,
                COUNT(DISTINCT CASE WHEN wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days' THEN wl.public_key END) as recent_activity,
                AVG(CASE WHEN wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days' THEN 1 ELSE 0 END) as activity_rate
            FROM wallet_providers wp
            LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id
            WHERE wp.status = true
            GROUP BY wp.id, wp.name
            ORDER BY total_wallets DESC
        `);
        
        res.json({
            total_providers: providerStats.rows[0].total_providers,
            active_providers: providerStats.rows[0].active_providers,
            provider_performance: providerPerformance.rows,
            analysis_period_days: parseInt(days)
        });
        
    } catch (error) {
        console.error('Error fetching provider analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/data-consumer/export/{format}:
 *   get:
 *     summary: Export wallet location data
 *     description: Export wallet location data in CSV or JSON format
 *     tags: [Data Consumer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *         description: Export format
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Data period in days
 *     responses:
 *       200:
 *         description: Data exported successfully
 *       400:
 *         description: Invalid format
 *       500:
 *         description: Internal server error
 */
router.get('/export/:format', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { format } = req.params;
        const { days = 30 } = req.query;
        
        if (!['csv', 'json'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format. Use csv or json' });
        }
        
        // Get wallet location data
        const result = await pool.query(`
            SELECT 
                wl.public_key,
                wl.blockchain,
                wl.latitude,
                wl.longitude,
                wl.tracking_status,
                wl.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name,
                ST_AsText(wl.location) as location_wkt
            FROM wallet_locations wl
            JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days'
            AND wl.location IS NOT NULL
            ORDER BY wl.last_updated DESC
        `);
        
        if (format === 'json') {
            res.json({
                export_date: new Date().toISOString(),
                period_days: parseInt(days),
                total_records: result.rows.length,
                data: result.rows
            });
        } else if (format === 'csv') {
            // Convert to CSV
            const headers = Object.keys(result.rows[0] || {});
            const csvContent = [
                headers.join(','),
                ...result.rows.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        return typeof value === 'string' && value.includes(',') 
                            ? `"${value}"` 
                            : value;
                    }).join(',')
                )
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="wallet_locations_${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);
        }
        
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get detailed wallet locations data for data consumers
router.get('/wallet-locations-details', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.description,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wp.name as provider_name,
                wt.name as wallet_type,
                wl.tracking_status
            FROM wallet_locations wl
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            ORDER BY wl.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM wallet_locations';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching wallet locations details:', error);
        res.status(500).json({ error: 'Failed to fetch wallet locations details' });
    }
});

// Get detailed wallet providers data for data consumers
router.get('/wallet-providers-details', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                wp.id,
                wp.name,
                u.email as contact_email,
                wp.api_key_id,
                wp.created_at,
                COUNT(wl.id) as location_count
            FROM wallet_providers wp
            LEFT JOIN users u ON wp.user_id = u.id
            LEFT JOIN wallet_locations wl ON wp.id = wl.wallet_provider_id
            GROUP BY wp.id, wp.name, u.email, wp.api_key_id, wp.created_at
            ORDER BY wp.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM wallet_providers';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching wallet providers details:', error);
        res.status(500).json({ error: 'Failed to fetch wallet providers details' });
    }
});

// Get detailed locations data for data consumers
router.get('/locations-details', authenticateUser, requireRole(['data_consumer']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.description,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wp.name as provider_name,
                wt.name as wallet_type,
                wl.tracking_status
            FROM wallet_locations wl
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            ORDER BY wl.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM wallet_locations';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching locations details:', error);
        res.status(500).json({ error: 'Failed to fetch locations details' });
    }
});

module.exports = router;
