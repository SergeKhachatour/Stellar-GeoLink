const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Basic API key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        // First check wallet_providers
        const providerResult = await pool.query(
            'SELECT id FROM wallet_providers WHERE api_key = $1 AND status = true',
            [apiKey]
        );

        if (providerResult.rows.length > 0) {
            req.providerId = providerResult.rows[0].id;
            req.userType = 'wallet_provider';
            return next();
        }

        // Then check data_consumers
        const consumerResult = await pool.query(
            'SELECT id FROM data_consumers WHERE api_key = $1 AND status = true',
            [apiKey]
        );

        if (consumerResult.rows.length > 0) {
            req.consumerId = consumerResult.rows[0].id;
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
router.get('/nearby', authenticateApiKey, async (req, res) => {
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
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
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

// Update wallet location
router.post('/update', authenticateApiKey, async (req, res) => {
    if (req.userType !== 'wallet_provider') {
        return res.status(403).json({ error: 'Only wallet providers can update locations' });
    }

    const { public_key, blockchain, latitude, longitude } = req.body;
    
    if (!public_key || !blockchain || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await pool.query(
            `INSERT INTO wallet_locations 
            (public_key, blockchain, latitude, longitude, wallet_provider_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (public_key, blockchain) 
            DO UPDATE SET 
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                last_updated = CURRENT_TIMESTAMP`,
            [public_key, blockchain, latitude, longitude, req.providerId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Internal server error' });
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
            WHERE w.tracking_status = 'active'
            AND w.location_enabled = true
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 