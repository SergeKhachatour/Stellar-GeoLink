const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateProviderApiKey, validateConsumerApiKey } = require('../middleware/apiKey');
const { validateLocationUpdate } = require('../middleware/validation');
const { locationUpdateLimiter } = require('../middleware/rateLimiter');
const { validateSignature } = require('../middleware/security');
const { cacheWalletLocation, getCachedWalletLocation } = require('../services/cache');
const { sendWebhook } = require('../services/webhook');
const crypto = require('crypto');
const locationService = require('../services/location');
const { cacheService } = require('../services/cache');
const { checkGeofences } = require('../services/geofence');
const geofenceService = require('../services/geofence');

/**
 * @swagger
 * /api/location/nearby:
 *   get:
 *     summary: Find wallets near a location
 *     description: Returns wallet locations within a specified radius of given coordinates
 *     tags: [Location]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude of the center point
 *       - in: query
 *         name: lon
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude of the center point
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *         description: Search radius in meters (default 1000)
 *     responses:
 *       200:
 *         description: List of nearby wallet locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WalletLocation'
 */
router.get('/nearby', validateConsumerApiKey, async (req, res) => {
    const { lat, lon, radius } = req.query;
    
    if (!lat || !lon || !radius) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const result = await pool.query(
            `SELECT 
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.last_updated,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_providers wp ON w.provider_id = wp.id
            WHERE ST_DWithin(
                ST_MakePoint(w.longitude, w.latitude)::geography,
                ST_MakePoint($1, $2)::geography,
                $3
            )`,
            [lon, lat, radius]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching nearby locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public endpoint for wallet providers to update locations
router.post('/update', 
    locationUpdateLimiter,
    validateProviderApiKey, 
    validateLocationUpdate,
    async (req, res) => {
        const { public_key, blockchain, latitude, longitude } = req.body;
        
        if (!public_key || !blockchain || !latitude || !longitude) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            await pool.query(
                `INSERT INTO wallet_locations 
                (public_key, blockchain, latitude, longitude, provider_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (public_key, blockchain) 
                DO UPDATE SET 
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    last_updated = CURRENT_TIMESTAMP`,
                [public_key, blockchain, latitude, longitude, req.providerId]
            );

            // Check geofence triggers
            await geofenceService.checkGeofenceTriggers(public_key, blockchain, latitude, longitude);

            res.json({ success: true });
        } catch (error) {
            console.error('Error updating location:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get wallet location with caching
router.get('/:publicKey', validateConsumerApiKey, async (req, res) => {
    try {
        // Try to get from cache first
        const cached = await cacheService.get(`location:${req.params.publicKey}`);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        const result = await pool.query(
            `SELECT 
                wl.public_key,
                wl.blockchain,
                wl.description,
                wt.name as wallet_type,
                wl.latitude,
                wl.longitude,
                ST_AsGeoJSON(wl.location)::json as geojson,
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

        // Cache the result
        await cacheService.set(
            `location:${req.params.publicKey}`,
            JSON.stringify(result.rows[0]),
            300 // Cache for 5 minutes
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// New endpoint to find wallets within a radius
router.get('/nearby/:latitude/:longitude/:radiusMeters', validateConsumerApiKey, async (req, res) => {
    const { latitude, longitude, radiusMeters } = req.params;
    
    try {
        const result = await pool.query(
            `SELECT 
                wl.public_key,
                wl.blockchain,
                wl.description,
                wt.name as wallet_type,
                wl.latitude,
                wl.longitude,
                ST_AsGeoJSON(wl.location)::json as geojson,
                ST_Distance(
                    wl.location, 
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) as distance
            FROM wallet_locations wl
            JOIN wallet_types wt ON wt.id = wl.wallet_type_id
            WHERE wl.location_enabled = true
            AND ST_DWithin(
                wl.location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ORDER BY distance`,
            [latitude, longitude, radiusMeters]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get wallet types (public endpoint)
router.get('/types/list', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, description FROM wallet_types ORDER BY id'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Batch update endpoint
router.post('/batch-update',
    locationUpdateLimiter,
    validateProviderApiKey,
    validateSignature,
    async (req, res) => {
        const { locations } = req.body;
        
        if (!Array.isArray(locations) || locations.length === 0) {
            return res.status(400).json({ error: 'Invalid locations array' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const results = await Promise.all(locations.map(async location => {
                const result = await client.query(
                    `INSERT INTO wallet_locations 
                    (public_key, blockchain, wallet_type_id, description, latitude, longitude, location_enabled, wallet_provider_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (public_key) 
                    DO UPDATE SET 
                        blockchain = EXCLUDED.blockchain,
                        wallet_type_id = EXCLUDED.wallet_type_id,
                        description = EXCLUDED.description,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        location_enabled = EXCLUDED.location_enabled,
                        last_updated = CURRENT_TIMESTAMP
                    RETURNING id, ST_AsGeoJSON(location)::json as geojson`,
                    [
                        location.public_key,
                        location.blockchain,
                        location.wallet_type_id,
                        location.description,
                        location.latitude,
                        location.longitude,
                        location.location_enabled ?? true,
                        req.providerId
                    ]
                );
                
                // Check geofences and send webhooks
                await checkGeofences(req.providerId, location);
                return result.rows[0];
            }));
            
            await client.query('COMMIT');
            res.json({ success: true, results });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in batch update:', error);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    }
);

// Analytics endpoint
router.get('/analytics', validateProviderApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(DISTINCT public_key) as total_wallets,
                COUNT(DISTINCT blockchain) as blockchain_count,
                AVG(EXTRACT(EPOCH FROM (NOW() - last_updated))) as avg_update_age,
                COUNT(*) FILTER (WHERE location_enabled = true) as active_wallets,
                COUNT(*) FILTER (WHERE last_updated > NOW() - INTERVAL '24 hours') as updated_last_24h
            FROM wallet_locations 
            WHERE wallet_provider_id = $1
        `, [req.providerId]);
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API key rotation endpoint
router.post('/rotate-api-key', validateProviderApiKey, async (req, res) => {
    const newApiKey = crypto.randomBytes(32).toString('hex');
    
    try {
        await pool.query(
            'UPDATE wallet_providers SET api_key = $1 WHERE id = $2',
            [newApiKey, req.providerId]
        );
        
        res.json({ newApiKey });
    } catch (error) {
        console.error('Error rotating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get location history
router.get('/:publicKey/history', validateConsumerApiKey, async (req, res) => {
    const { publicKey } = req.params;
    const { blockchain } = req.query;

    if (!blockchain) {
        return res.status(400).json({ error: 'Blockchain parameter is required' });
    }

    try {
        const result = await pool.query(
            `SELECT 
                latitude,
                longitude,
                last_updated
            FROM wallet_locations_history
            WHERE public_key = $1 AND blockchain = $2
            ORDER BY last_updated DESC
            LIMIT 100`,
            [publicKey, blockchain]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching location history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update tracking status
router.patch('/:publicKey/tracking', validateProviderApiKey, async (req, res) => {
    const { status } = req.body;
    
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

module.exports = router; 