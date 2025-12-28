const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser, requireRole } = require('../middleware/authUser');
const { findNearbyLocations, calculateDistance, getBoundingBox, performDBSCAN, getGeospatialStats } = require('../utils/postgisUtils-simple');

// API key authentication middleware for wallet providers (similar to location.js)
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        // Check wallet_providers (using JOIN with api_keys table)
        const providerResult = await pool.query(
            `SELECT wp.id, wp.user_id FROM wallet_providers wp
             JOIN api_keys ak ON ak.id = wp.api_key_id
             WHERE ak.api_key = $1 AND wp.status = true`,
            [apiKey]
        );

        if (providerResult.rows.length > 0) {
            req.providerId = providerResult.rows[0].id;
            req.userId = providerResult.rows[0].user_id;
            req.userType = 'wallet_provider';
            // Set req.user for compatibility with existing code
            req.user = { id: providerResult.rows[0].user_id };
            return next();
        }

        return res.status(401).json({ error: 'Invalid or inactive API key' });
    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Combined authentication: supports both JWT and API key
const authenticateWalletProvider = async (req, res, next) => {
    // First try API key authentication
    const apiKey = req.header('X-API-Key');
    if (apiKey) {
        try {
            // Check wallet_providers (using JOIN with api_keys table)
            const providerResult = await pool.query(
                `SELECT wp.id, wp.user_id FROM wallet_providers wp
                 JOIN api_keys ak ON ak.id = wp.api_key_id
                 WHERE ak.api_key = $1 AND wp.status = true`,
                [apiKey]
            );

            if (providerResult.rows.length > 0) {
                req.providerId = providerResult.rows[0].id;
                req.userId = providerResult.rows[0].user_id;
                req.userType = 'wallet_provider';
                // Set req.user for compatibility with existing code (including role)
                req.user = { 
                    id: providerResult.rows[0].user_id,
                    role: 'wallet_provider'
                };
                return next();
            }

            return res.status(401).json({ error: 'Invalid or inactive API key' });
        } catch (error) {
            console.error('API key authentication error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
    
    // If no API key, try JWT authentication
    return authenticateUser(req, res, (err) => {
        if (err) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // Check if user has wallet_provider role
        if (!req.user || !req.user.role || req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Wallet provider role required' });
        }
        return next();
    });
};

/**
 * @swagger
 * components:
 *   schemas:
 *     LocationAnalytics:
 *       type: object
 *       properties:
 *         total_locations:
 *           type: integer
 *         coverage_area:
 *           type: number
 *         geographic_center:
 *           type: string
 *         bounding_box:
 *           type: string
 *         recent_activity:
 *           type: array
 *           items:
 *             type: object
 *     LocationHeatmap:
 *       type: object
 *       properties:
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         intensity:
 *           type: number
 *         timestamp:
 *           type: string
 */

/**
 * @swagger
 * /api/wallet-provider/analytics:
 *   get:
 *     summary: Get comprehensive location analytics for wallet provider
 *     description: Provides detailed geospatial analytics for the wallet provider's locations
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Location analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LocationAnalytics'
 */
router.get('/analytics', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get wallet provider ID
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [userId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Wallet provider not found' });
        }
        
        const providerId = providerResult.rows[0].id;
        
        // Get comprehensive analytics
        const analytics = await pool.query(`
            SELECT 
                COUNT(*) as total_locations,
                ST_Extent(location) as bounding_box,
                ST_Centroid(ST_Collect(location)) as geographic_center,
                ST_Area(ST_ConvexHull(ST_Collect(location))) as coverage_area,
                AVG(ST_Distance(
                    location,
                    ST_Centroid(ST_Collect(location))
                )) as avg_distance_from_center
            FROM wallet_locations
            WHERE wallet_provider_id = $1 
            AND location IS NOT NULL
        `, [providerId]);
        
        // Get recent activity (last 24 hours)
        const recentActivity = await pool.query(`
            SELECT 
                public_key,
                latitude,
                longitude,
                last_updated,
                ST_AsText(location) as location_wkt
            FROM wallet_locations
            WHERE wallet_provider_id = $1 
            AND location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '24 hours'
            ORDER BY last_updated DESC
            LIMIT 10
        `, [providerId]);
        
        // Get location distribution by time of day
        const timeDistribution = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM last_updated) as hour,
                COUNT(*) as location_count
            FROM wallet_locations
            WHERE wallet_provider_id = $1 
            AND location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '7 days'
            GROUP BY EXTRACT(HOUR FROM last_updated)
            ORDER BY hour
        `, [providerId]);
        
        res.json({
            analytics: analytics.rows[0],
            recent_activity: recentActivity.rows,
            time_distribution: timeDistribution.rows
        });
        
    } catch (error) {
        console.error('Error getting wallet provider analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/locations-details:
 *   get:
 *     summary: Get detailed wallet locations for the provider
 *     description: Provides paginated list of wallet locations managed by the provider
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Wallet locations retrieved successfully
 */
router.get('/locations-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const providerId = req.user.id;

        // First get the wallet_provider_id for this user
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [providerId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.json({
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            });
        }
        
        const walletProviderId = providerResult.rows[0].id;

        const result = await pool.query(`
            SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.description,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wl.tracking_status,
                wp.name as provider_name,
                wt.name as wallet_type
            FROM wallet_locations wl
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            WHERE wl.wallet_provider_id = $1
            ORDER BY wl.created_at DESC
            LIMIT $2 OFFSET $3
        `, [walletProviderId, limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(*) as total FROM wallet_locations 
            WHERE wallet_provider_id = $1
        `, [walletProviderId]);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching wallet locations details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/wallet-locations-details:
 *   get:
 *     summary: Get detailed wallet locations with unique wallets
 *     description: Provides paginated list of unique wallet locations
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Unique wallet locations retrieved successfully
 */
router.get('/wallet-locations-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const providerId = req.user.id;

        // First get the wallet_provider_id for this user
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [providerId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.json({
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            });
        }
        
        const walletProviderId = providerResult.rows[0].id;

        const result = await pool.query(`
            SELECT DISTINCT
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.description,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wp.name as provider_name,
                wt.name as wallet_type
            FROM wallet_locations wl
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            WHERE wl.wallet_provider_id = $1
            ORDER BY wl.created_at DESC
            LIMIT $2 OFFSET $3
        `, [walletProviderId, limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(DISTINCT public_key) as total FROM wallet_locations 
            WHERE wallet_provider_id = $1
        `, [walletProviderId]);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching unique wallet locations details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/api-calls-details:
 *   get:
 *     summary: Get detailed API calls for the provider
 *     description: Provides paginated list of API calls made by the provider
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: API calls retrieved successfully
 */
router.get('/api-calls-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const providerId = req.user.id;

        // First get the wallet_provider_id for this user
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [providerId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.json({
                data: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            });
        }
        
        const walletProviderId = providerResult.rows[0].id;

        const result = await pool.query(`
            SELECT 
                aul.id,
                aul.endpoint,
                aul.method,
                aul.status_code,
                aul.response_time,
                aul.created_at,
                aul.ip_address,
                aul.user_agent,
                wp.name as provider_name
            FROM api_usage_logs aul
            LEFT JOIN wallet_providers wp ON aul.wallet_provider_id = wp.id
            WHERE aul.wallet_provider_id = $1
            ORDER BY aul.created_at DESC
            LIMIT $2 OFFSET $3
        `, [walletProviderId, limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(*) as total FROM api_usage_logs 
            WHERE wallet_provider_id = $1
        `, [walletProviderId]);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching API calls details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/nft-details:
 *   get:
 *     summary: Get detailed NFT data for the provider
 *     description: Provides paginated list of NFTs managed by the provider
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: NFT details retrieved successfully
 */
router.get('/nft-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const providerId = req.user.id;

        // Get all NFTs in the market (like the map shows)
        const result = await pool.query(`
            SELECT 
                pn.id,
                pn.latitude,
                pn.longitude,
                pn.ipfs_hash,
                pn.server_url,
                pn.created_at,
                pn.is_active,
                pn.radius_meters,
                nc.name as collection_name,
                nc.description as collection_description,
                u.email as manager_email
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            LEFT JOIN users u ON pn.pinned_by_user = u.email
            ORDER BY pn.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(*) as total FROM pinned_nfts
        `);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching NFT details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/collections-details:
 *   get:
 *     summary: Get detailed NFT collections for the provider
 *     description: Provides paginated list of NFT collections managed by the provider
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: NFT collections retrieved successfully
 */
router.get('/collections-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const providerId = req.user.id;

        // Get collections that have NFTs (consistent with market analysis)
        const result = await pool.query(`
            SELECT 
                nc.id,
                nc.name,
                nc.description,
                nc.created_at,
                COUNT(pn.id) as nft_count,
                u.email as manager_email
            FROM nft_collections nc
            INNER JOIN pinned_nfts pn ON nc.id = pn.collection_id
            LEFT JOIN users u ON u.email = pn.pinned_by_user
            GROUP BY nc.id, nc.name, nc.description, nc.created_at, u.email
            ORDER BY nc.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(DISTINCT nc.id) as total FROM nft_collections nc
            INNER JOIN pinned_nfts pn ON nc.id = pn.collection_id
        `);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching collections details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/nft-managers-details:
 *   get:
 *     summary: Get detailed NFT managers for the provider
 *     description: Provides paginated list of NFT managers
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: NFT managers retrieved successfully
 */
router.get('/nft-managers-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT DISTINCT
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.created_at,
                COUNT(pn.id) as nft_count
            FROM users u
            LEFT JOIN pinned_nfts pn ON u.email = pn.pinned_by_user
            WHERE u.role = 'nft_manager'
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(DISTINCT u.id) as total FROM users u
            WHERE u.role = 'nft_manager'
        `);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching NFT managers details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/active-nfts-details:
 *   get:
 *     summary: Get detailed active NFTs for the provider
 *     description: Provides paginated list of active NFTs
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Active NFTs retrieved successfully
 */
router.get('/active-nfts-details', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        // Get all active NFTs in the market (like the map shows)
        const result = await pool.query(`
            SELECT 
                pn.id,
                pn.latitude,
                pn.longitude,
                pn.ipfs_hash,
                pn.server_url,
                pn.created_at,
                pn.is_active,
                pn.radius_meters,
                nc.name as collection_name,
                nc.description as collection_description,
                u.email as manager_email
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            LEFT JOIN users u ON pn.pinned_by_user = u.email
            WHERE pn.is_active = true
            ORDER BY pn.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(*) as total FROM pinned_nfts 
            WHERE is_active = true
        `);

        const total = parseInt(countResult.rows[0].total);
        const pages = Math.ceil(total / limit);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });

    } catch (error) {
        console.error('Error fetching active NFTs details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/heatmap:
 *   get:
 *     summary: Get location heatmap data
 *     description: Provides heatmap data for visualization of location density
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to include in heatmap
 *     responses:
 *       200:
 *         description: Heatmap data retrieved successfully
 */
router.get('/heatmap', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 7;
        
        // Get wallet provider ID
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [userId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Wallet provider not found' });
        }
        
        const providerId = providerResult.rows[0].id;
        
        // Get heatmap data with clustering
        const heatmapData = await pool.query(`
            SELECT 
                ST_X(location::geometry) as longitude,
                ST_Y(location::geometry) as latitude,
                COUNT(*) as intensity,
                MAX(last_updated) as latest_activity,
                ARRAY_AGG(DISTINCT public_key) as wallet_addresses
            FROM wallet_locations
            WHERE wallet_provider_id = $1 
            AND location IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${days} days'
            GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
            ORDER BY intensity DESC
        `, [providerId]);
        
        res.json({
            heatmap_data: heatmapData.rows,
            period_days: days,
            total_points: heatmapData.rows.length
        });
        
    } catch (error) {
        console.error('Error getting heatmap data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/route-analysis:
 *   get:
 *     summary: Analyze movement patterns and routes
 *     description: Provides route analysis and movement patterns for wallet locations
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: public_key
 *         schema:
 *           type: string
 *         description: Specific wallet public key to analyze
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Route analysis completed
 */
router.get('/route-analysis', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const userId = req.user.id;
        const { public_key, days = 7 } = req.query;
        
        // Get wallet provider ID
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE user_id = $1',
            [userId]
        );
        
        if (providerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Wallet provider not found' });
        }
        
        const providerId = providerResult.rows[0].id;
        
        let whereClause = `wallet_provider_id = $1 AND location IS NOT NULL AND last_updated > NOW() - INTERVAL '${days} days'`;
        let params = [providerId];
        
        if (public_key) {
            whereClause += ' AND public_key = $2';
            params.push(public_key);
        }
        
        // Get route data ordered by time
        const routeData = await pool.query(`
            SELECT 
                public_key,
                latitude,
                longitude,
                last_updated,
                ST_AsText(location) as location_wkt
            FROM wallet_locations
            WHERE ${whereClause}
            ORDER BY public_key, last_updated ASC
        `, params);
        
        // Calculate route statistics
        const routeStats = await pool.query(`
            SELECT 
                public_key,
                COUNT(*) as location_count,
                MIN(last_updated) as first_seen,
                MAX(last_updated) as last_seen,
                ST_Distance(
                    (SELECT location FROM wallet_locations WHERE public_key = wl.public_key ORDER BY last_updated ASC LIMIT 1),
                    (SELECT location FROM wallet_locations WHERE public_key = wl.public_key ORDER BY last_updated DESC LIMIT 1)
                ) as total_distance_meters,
                ST_Length(ST_MakeLine(location ORDER BY last_updated)) as route_length_meters
            FROM wallet_locations wl
            WHERE ${whereClause}
            GROUP BY public_key
        `, params);
        
        res.json({
            route_data: routeData.rows,
            route_statistics: routeStats.rows,
            analysis_period_days: days
        });
        
    } catch (error) {
        console.error('Error analyzing routes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/nearby-wallets:
 *   get:
 *     summary: Find nearby wallet locations
 *     description: Find other wallet locations within a specified radius
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center latitude
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center longitude
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 1000
 *         description: Search radius in meters
 *     responses:
 *       200:
 *         description: Nearby wallets found
 */
router.get('/nearby-wallets', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        
        const result = await PostGISUtils.findLocationsWithinRadius(
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(radius)
        );
        
        res.json({
            nearby_wallets: result.rows,
            count: result.rows.length,
            search_center: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                radius: parseFloat(radius)
            }
        });
        
    } catch (error) {
        console.error('Error finding nearby wallets:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/privacy-settings:
 *   post:
 *     summary: Update wallet privacy settings
 *     description: Allows wallet providers to update privacy settings for their tracked wallets
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - privacy_level
 *             properties:
 *               public_key:
 *                 type: string
 *                 example: "GCQRBPKGIB6TQYW7BG6B6OMSYO4JEPM3CNJBHXBLWKDVKNOCV6V2323P"
 *               privacy_level:
 *                 type: string
 *                 enum: [public, private, restricted]
 *                 example: "private"
 *               location_sharing:
 *                 type: boolean
 *                 example: true
 *               data_retention_days:
 *                 type: integer
 *                 example: 30
 *     responses:
 *       200:
 *         description: Privacy settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 settings:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Wallet Provider role required
 *       500:
 *         description: Internal server error
 */
router.post('/privacy-settings', authenticateWalletProvider, async (req, res) => {
    try {
        const { public_key, privacy_level, location_sharing, data_retention_days } = req.body;
        
        if (!public_key || !privacy_level) {
            return res.status(400).json({ 
                error: 'public_key and privacy_level are required' 
            });
        }

        // Get user_id from either JWT (req.user.id) or API key (req.userId)
        const userId = req.user?.id || req.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unable to determine user ID' });
        }

        // Verify the public_key belongs to the authenticated wallet provider
        const verificationQuery = `
            SELECT wl.public_key
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wp.user_id = $1 AND wl.public_key = $2
            LIMIT 1
        `;
        const verificationResult = await pool.query(verificationQuery, [userId, public_key]);
        
        if (verificationResult.rows.length === 0) {
            return res.status(403).json({ 
                error: 'Access denied. Public key not associated with your wallet provider.' 
            });
        }

        // Update or insert privacy settings
        const upsertQuery = `
            INSERT INTO user_privacy_settings (user_id, public_key, privacy_level, location_sharing, data_retention_days, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, public_key)
            DO UPDATE SET
                privacy_level = EXCLUDED.privacy_level,
                location_sharing = EXCLUDED.location_sharing,
                data_retention_days = EXCLUDED.data_retention_days,
                updated_at = NOW()
            RETURNING *
        `;
        
        const result = await pool.query(upsertQuery, [
            userId,
            public_key,
            privacy_level,
            location_sharing !== undefined ? location_sharing : true,
            data_retention_days || 30
        ]);

        res.json({
            success: true,
            message: 'Privacy settings updated successfully',
            settings: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating privacy settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/visibility-settings:
 *   post:
 *     summary: Update wallet visibility settings
 *     description: Allows wallet providers to update visibility settings for their tracked wallets
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - visibility_level
 *             properties:
 *               public_key:
 *                 type: string
 *                 example: "GCQRBPKGIB6TQYW7BG6B6OMSYO4JEPM3CNJBHXBLWKDVKNOCV6V2323P"
 *               visibility_level:
 *                 type: string
 *                 enum: [public, private, friends_only]
 *                 example: "public"
 *               show_location:
 *                 type: boolean
 *                 example: true
 *               show_activity:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Visibility settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 settings:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Wallet Provider role required
 *       500:
 *         description: Internal server error
 */
router.post('/visibility-settings', authenticateWalletProvider, async (req, res) => {
    try {
        const { public_key, visibility_level, show_location, show_activity } = req.body;
        
        if (!public_key || !visibility_level) {
            return res.status(400).json({ 
                error: 'public_key and visibility_level are required' 
            });
        }

        // Get user_id from either JWT (req.user.id) or API key (req.userId)
        const userId = req.user?.id || req.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unable to determine user ID' });
        }

        // Verify the public_key belongs to the authenticated wallet provider
        const verificationQuery = `
            SELECT wl.public_key
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wp.user_id = $1 AND wl.public_key = $2
            LIMIT 1
        `;
        const verificationResult = await pool.query(verificationQuery, [userId, public_key]);
        
        if (verificationResult.rows.length === 0) {
            return res.status(403).json({ 
                error: 'Access denied. Public key not associated with your wallet provider.' 
            });
        }

        // Update or insert visibility settings
        const upsertQuery = `
            INSERT INTO user_visibility_settings (user_id, public_key, visibility_level, show_location, show_activity, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, public_key)
            DO UPDATE SET
                visibility_level = EXCLUDED.visibility_level,
                show_location = EXCLUDED.show_location,
                show_activity = EXCLUDED.show_activity,
                updated_at = NOW()
            RETURNING *
        `;
        
        const result = await pool.query(upsertQuery, [
            userId,
            public_key,
            visibility_level,
            show_location !== undefined ? show_location : true,
            show_activity !== undefined ? show_activity : false
        ]);

        res.json({
            success: true,
            message: 'Visibility settings updated successfully',
            settings: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating visibility settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/user-locations:
 *   get:
 *     summary: Get user locations for a specific public key
 *     description: Retrieves location history for a specific wallet public key
 *     tags: [Wallet Provider]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: public_key
 *         required: true
 *         schema:
 *           type: string
 *           example: "GCQRBPKGIB6TQYW7BG6B6OMSYO4JEPM3CNJBHXBLWKDVKNOCV6V2323P"
 *         description: The public key of the wallet to retrieve locations for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           example: 50
 *         description: Maximum number of locations to return
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           example: 30
 *         description: Number of days to look back for locations
 *     responses:
 *       200:
 *         description: User locations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 public_key:
 *                   type: string
 *                 locations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       latitude:
 *                         type: number
 *                       longitude:
 *                         type: number
 *                       last_updated:
 *                         type: string
 *                       blockchain:
 *                         type: string
 *                       status:
 *                         type: string
 *                 total_count:
 *                   type: integer
 *       400:
 *         description: Missing public_key parameter
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Wallet Provider role required or public key not associated
 *       500:
 *         description: Internal server error
 */
router.get('/user-locations', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { public_key, limit = 50, days = 30 } = req.query;

        if (!public_key) {
            return res.status(400).json({ error: 'public_key parameter is required' });
        }

        // Verify the public_key belongs to the authenticated wallet provider
        const verificationQuery = `
            SELECT wl.public_key
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wp.user_id = $1 AND wl.public_key = $2
            LIMIT 1
        `;
        const verificationResult = await pool.query(verificationQuery, [req.user.id, public_key]);
        
        if (verificationResult.rows.length === 0) {
            return res.status(403).json({ 
                error: 'Access denied. Public key not associated with your wallet provider.' 
            });
        }

        // Get locations for the public key
        const locationsQuery = `
            SELECT 
                id,
                latitude,
                longitude,
                last_updated,
                blockchain,
                status,
                description
            FROM wallet_locations
            WHERE public_key = $1
            AND last_updated >= NOW() - INTERVAL '${parseInt(days)} days'
            ORDER BY last_updated DESC
            LIMIT $2
        `;
        
        const result = await pool.query(locationsQuery, [public_key, parseInt(limit)]);

        res.json({
            public_key,
            locations: result.rows,
            total_count: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching user locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/wallet-provider/market-analysis:
 *   get:
 *     summary: Get market analysis for wallet provider
 *     description: Provides market analysis including NFT data for wallet providers
 *     tags: [Wallet Provider]
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
 *         description: Market analysis completed
 */
router.get('/market-analysis', authenticateUser, requireRole(['wallet_provider']), async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        console.log('📊 Fetching market analysis for wallet provider...');
        console.log('📊 Analysis period:', days, 'days');
        
        // Get provider's own statistics
        const providerStats = await pool.query(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                COUNT(CASE WHEN wl.last_updated > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_activity
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE u.id = $1 AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
            AND wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days'
        `, [req.user.id]);
        
        // Get NFT market data (all NFTs in the market, like the map shows)
        const nftMarketData = await pool.query(`
            SELECT 
                COUNT(DISTINCT pn.id) as total_nfts,
                COUNT(DISTINCT pn.collection_id) as total_collections,
                COUNT(DISTINCT pn.pinned_by_user) as unique_nft_managers,
                AVG(pn.radius_meters) as avg_radius,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
        `);
        
        // Get competitive analysis
        const competitiveAnalysis = await pool.query(`
            SELECT 
                wp.id as provider_id,
                u.email as provider_name,
                COUNT(wl.id) as location_count,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                COUNT(CASE WHEN wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL THEN 1 END) as coverage_area
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
        
        // Get NFT collection insights (all collections in the market)
        const nftCollectionInsights = await pool.query(`
            SELECT 
                nc.name as collection_name,
                COUNT(pn.id) as nft_count,
                AVG(pn.radius_meters) as avg_radius,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON pn.collection_id = nc.id
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY nc.id, nc.name
            ORDER BY nft_count DESC
            LIMIT 5
        `);
        
        console.log('✅ Wallet provider market analysis completed successfully');
        
        res.json({
            provider_statistics: {
                total_locations: parseInt(providerStats.rows[0]?.total_locations || 0),
                unique_wallets: parseInt(providerStats.rows[0]?.unique_wallets || 0),
                recent_activity: parseInt(providerStats.rows[0]?.recent_activity || 0)
            },
            nft_market_data: {
                total_nfts: parseInt(nftMarketData.rows[0]?.total_nfts || 0),
                total_collections: parseInt(nftMarketData.rows[0]?.total_collections || 0),
                unique_nft_managers: parseInt(nftMarketData.rows[0]?.unique_nft_managers || 0),
                active_nfts: parseInt(nftMarketData.rows[0]?.active_nfts || 0),
                avg_radius: parseFloat(nftMarketData.rows[0]?.avg_radius || 0)
            },
            competitive_analysis: competitiveAnalysis.rows,
            nft_collection_insights: nftCollectionInsights.rows,
            analysis_period_days: parseInt(days)
        });
        
    } catch (error) {
        console.error('❌ Error getting wallet provider market analysis:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;