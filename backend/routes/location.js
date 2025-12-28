const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');

// Basic API key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        // First check wallet_providers (using JOIN with api_keys table)
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
            return next();
        }

        // Then check data_consumers (they use api_keys table directly)
        const consumerResult = await pool.query(
            `SELECT dc.id, ak.user_id FROM data_consumers dc
             JOIN api_keys ak ON ak.user_id = dc.user_id
             WHERE ak.api_key = $1 AND dc.status = true`,
            [apiKey]
        );

        if (consumerResult.rows.length > 0) {
            req.consumerId = consumerResult.rows[0].id;
            req.userId = consumerResult.rows[0].user_id;
            req.userType = 'data_consumer';
            return next();
        }

        return res.status(401).json({ error: 'Invalid or inactive API key' });
    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * @swagger
 * /api/location/nearby:
 *   get:
 *     summary: Find wallets near a location
 *     description: Returns wallet locations within a specified radius of given coordinates
 *     tags: [Location]
 *     security:
 *       - DataConsumerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *           minimum: -90
 *           maximum: 90
 *         description: Latitude of the center point (-90 to 90)
 *         example: 40.7128
 *       - in: query
 *         name: lon
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *           minimum: -180
 *           maximum: 180
 *         description: Longitude of the center point (-180 to 180)
 *         example: -74.0060
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 100000
 *         description: Search radius in meters (default 1000)
 *         example: 1000
 *     responses:
 *       200:
 *         description: List of nearby wallet locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   public_key:
 *                     type: string
 *                     example: "GABC123..."
 *                   blockchain:
 *                     type: string
 *                     example: "Stellar"
 *                   latitude:
 *                     type: number
 *                     example: 40.7128
 *                   longitude:
 *                     type: number
 *                     example: -74.0060
 *                   last_updated:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-01-15T10:30:00Z"
 *                   provider_name:
 *                     type: string
 *                     example: "XYZ Wallet"
 */
router.get('/nearby', authenticateApiKey, async (req, res) => {
    const { lat, lon, radius } = req.query;
    
    if (!lat || !lon || !radius) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
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
        
        // Build privacy and visibility filters
        let privacyFilter = '';
        let visibilityFilter = '';
        let joinClause = '';
        
        if (hasPrivacySettings && hasVisibilitySettings) {
            joinClause = `
                LEFT JOIN user_privacy_settings ups ON w.public_key = ups.public_key AND wp.user_id = ups.user_id
                LEFT JOIN user_visibility_settings uvs ON w.public_key = uvs.public_key AND wp.user_id = uvs.user_id
            `;
            // If settings don't exist (NULL), allow visibility (backward compatibility)
            // If settings exist, require: location_sharing = true AND privacy_level = 'public'
            // AND show_location = true AND visibility_level = 'public'
            privacyFilter = `AND (ups.public_key IS NULL OR (ups.location_sharing = true AND ups.privacy_level = 'public'))`;
            visibilityFilter = `AND (uvs.public_key IS NULL OR (uvs.show_location = true AND uvs.visibility_level = 'public'))`;
        } else if (hasPrivacySettings) {
            joinClause = `LEFT JOIN user_privacy_settings ups ON w.public_key = ups.public_key AND wp.user_id = ups.user_id`;
            privacyFilter = `AND (ups.public_key IS NULL OR (ups.location_sharing = true AND ups.privacy_level = 'public'))`;
        } else if (hasVisibilitySettings) {
            joinClause = `LEFT JOIN user_visibility_settings uvs ON w.public_key = uvs.public_key AND wp.user_id = uvs.user_id`;
            visibilityFilter = `AND (uvs.public_key IS NULL OR (uvs.show_location = true AND uvs.visibility_level = 'public'))`;
        }
        
        const result = await pool.query(
            `SELECT 
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.last_updated,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            ${joinClause}
            WHERE w.location_enabled = true
            AND ST_DWithin(
                ST_MakePoint(w.longitude, w.latitude)::geography,
                ST_MakePoint($1, $2)::geography,
                $3
            )
            ${privacyFilter}
            ${visibilityFilter}`,
            [lon, lat, radius]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching nearby locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/location/update:
 *   post:
 *     summary: Update wallet location
 *     description: Update or create a wallet location entry
 *     tags: [Location]
 *     security:
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - blockchain
 *               - latitude
 *               - longitude
 *             properties:
 *               public_key:
 *                 type: string
 *                 description: Stellar wallet public key
 *                 example: "GABC123..."
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "Stellar"
 *               latitude:
 *                 type: number
 *                 format: float
 *                 description: Latitude coordinate (-90 to 90)
 *                 example: 40.7128
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 format: float
 *                 description: Longitude coordinate (-180 to 180)
 *                 example: -74.0060
 *                 minimum: -180
 *                 maximum: 180
 *               wallet_type_id:
 *                 type: integer
 *                 description: Wallet type ID
 *                 example: 1
 *               description:
 *                 type: string
 *                 description: Location description
 *                 example: "User wallet location"
 *     responses:
 *       200:
 *         description: Location updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Access denied - wallet provider role required
 *       500:
 *         description: Internal server error
 */
router.post('/update', authenticateApiKey, async (req, res) => {
    if (req.userType !== 'wallet_provider') {
        return res.status(403).json({ error: 'Only wallet providers can update locations' });
    }

    const { public_key, blockchain, latitude, longitude, wallet_type_id, description } = req.body;
    
    if (!public_key || !blockchain || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields: public_key, blockchain, latitude, longitude' });
    }

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: 'Latitude and longitude must be valid numbers' });
    }

    if (latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
    }

    if (longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
    }

    try {
        // Get default wallet type if not provided
        let walletTypeId = wallet_type_id;
        if (!walletTypeId) {
            const defaultType = await pool.query('SELECT id FROM wallet_types ORDER BY id LIMIT 1');
            walletTypeId = defaultType.rows[0]?.id || 1;
        }

        console.log('📍 Updating location for:', {
            public_key: public_key.substring(0, 10) + '...',
            blockchain,
            latitude,
            longitude,
            wallet_type_id: walletTypeId,
            wallet_provider_id: req.providerId
        });

        const result = await pool.query(
            `INSERT INTO wallet_locations 
            (public_key, blockchain, latitude, longitude, wallet_type_id, description, wallet_provider_id, location, location_enabled)
            VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6, $7, ST_SetSRID(ST_MakePoint($4::numeric, $3::numeric), 4326)::geography, true)
            ON CONFLICT (public_key, blockchain) 
            DO UPDATE SET 
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                wallet_type_id = EXCLUDED.wallet_type_id,
                description = EXCLUDED.description,
                wallet_provider_id = EXCLUDED.wallet_provider_id,
                location = ST_SetSRID(ST_MakePoint(EXCLUDED.longitude::numeric, EXCLUDED.latitude::numeric), 4326)::geography,
                location_enabled = true,
                last_updated = CURRENT_TIMESTAMP
            RETURNING *`,
            [public_key, blockchain, parseFloat(latitude), parseFloat(longitude), walletTypeId, description || null, req.providerId]
        );

        console.log('✅ Location updated successfully');

        res.json({ 
            success: true, 
            message: 'Location updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error updating location:', error);
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

// Get specific wallet location
router.get('/:publicKey', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                wl.public_key,
                wl.blockchain,
                wl.description,
                wt.name as wallet_type,
                wl.latitude,
                wl.longitude,
                wl.location_enabled,
                wl.last_updated
            FROM wallet_locations wl
            JOIN wallet_types wt ON wt.id = wl.wallet_type_id
            WHERE wl.public_key = $1 AND wl.location_enabled = true`,
            [req.params.publicKey]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get location history
router.get('/:publicKey/history', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                latitude,
                longitude,
                recorded_at as last_updated
            FROM wallet_location_history wlh
            JOIN wallet_locations wl ON wlh.wallet_location_id = wl.id
            WHERE wl.public_key = $1
            ORDER BY recorded_at DESC
            LIMIT 100`,
            [req.params.publicKey]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching location history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update tracking status
router.patch('/:publicKey/tracking', authenticateApiKey, async (req, res) => {
    if (req.userType !== 'wallet_provider') {
        return res.status(403).json({ error: 'Only wallet providers can update tracking status' });
    }

    const { status } = req.body;
    
    if (!['active', 'paused', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await pool.query(
            `UPDATE wallet_locations 
            SET tracking_status = $1
            WHERE public_key = $2 AND wallet_provider_id = $3`,
            [status, req.params.publicKey, req.providerId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tracking status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint for wallet locations - accessible by data consumers
// JWT-authenticated version for dashboard use
router.get('/dashboard/wallet-locations', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                w.id,
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.tracking_status,
                w.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_types wt ON w.wallet_type_id = wt.id
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            WHERE w.location_enabled = true
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Failed to fetch wallet locations' });
    }
});

// API key authenticated version for external API use
router.get('/wallet-locations', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                w.id,
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.tracking_status,
                w.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_types wt ON w.wallet_type_id = wt.id
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            WHERE w.location_enabled = true
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint for wallet types list
router.get('/types/list', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, description, created_at
            FROM wallet_types
            ORDER BY name ASC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet types:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 