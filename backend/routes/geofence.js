const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateConsumerApiKey } = require('../middleware/apiKey');
const geofenceService = require('../services/geofence');

/**
 * @swagger
 * /api/geofence:
 *   post:
 *     summary: Create a new geofence
 *     tags: [Geofences]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - polygon
 *               - blockchain
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the geofence
 *               description:
 *                 type: string
 *                 description: Description of the geofence
 *               polygon:
 *                 type: object
 *                 description: GeoJSON polygon coordinates
 *               blockchain:
 *                 type: string
 *                 description: Blockchain type (e.g., stellar)
 *               webhook_url:
 *                 type: string
 *                 description: Webhook URL for notifications
 *     responses:
 *       201:
 *         description: Geofence created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 polygon:
 *                   type: object
 *                 blockchain:
 *                   type: string
 *                 webhook_url:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
// Create a new geofence
router.post('/', validateConsumerApiKey, async (req, res) => {
    const { name, description, polygon, blockchain, webhook_url } = req.body;

    if (!name || !polygon || !blockchain) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO geofences 
            (name, description, polygon, blockchain, webhook_url, data_consumer_id)
            VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4, $5, $6)
            RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url`,
            [name, description, JSON.stringify(polygon), blockchain, webhook_url, req.consumerId]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all geofences for the consumer
router.get('/', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE data_consumer_id = $1
            ORDER BY created_at DESC`,
            [req.consumerId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching geofences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific geofence
router.get('/:id', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE id = $1 AND data_consumer_id = $2`,
            [req.params.id, req.consumerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a geofence
router.put('/:id', validateConsumerApiKey, async (req, res) => {
    const { name, description, polygon, blockchain, webhook_url } = req.body;

    try {
        const result = await pool.query(
            `UPDATE geofences 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                polygon = CASE WHEN $3::json IS NOT NULL THEN ST_GeomFromGeoJSON($3) ELSE polygon END,
                blockchain = COALESCE($4, blockchain),
                webhook_url = COALESCE($5, webhook_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND data_consumer_id = $7
            RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url`,
            [name, description, polygon ? JSON.stringify(polygon) : null, blockchain, webhook_url, req.params.id, req.consumerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a geofence
router.delete('/:id', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM geofences WHERE id = $1 AND data_consumer_id = $2 RETURNING id',
            [req.params.id, req.consumerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get geofence events
router.get('/:id/events', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                ge.id,
                ge.event_type,
                ge.wallet_public_key,
                ge.blockchain,
                ge.latitude,
                ge.longitude,
                ge.created_at
            FROM geofence_events ge
            JOIN geofences g ON g.id = ge.geofence_id
            WHERE g.id = $1 AND g.data_consumer_id = $2
            ORDER BY ge.created_at DESC
            LIMIT 100`,
            [req.params.id, req.consumerId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching geofence events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 