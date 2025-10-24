const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateConsumerApiKey } = require('../middleware/apiKey');

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: Get all alerts for a data consumer
 *     tags: [Alerts]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   alert_type:
 *                     type: string
 *                   wallet_public_key:
 *                     type: string
 *                   details:
 *                     type: object
 *                   notified:
 *                     type: boolean
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
// Get all alerts for a consumer
router.get('/', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                ah.id,
                ah.alert_type,
                ah.wallet_public_key,
                ah.details,
                ah.notified,
                ah.created_at
            FROM alert_history ah
            JOIN wallet_locations wl ON ah.wallet_public_key = wl.public_key
            WHERE wl.wallet_provider_id = $1
            ORDER BY ah.created_at DESC
            LIMIT 100`,
            [req.consumerId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get alert preferences
router.get('/preferences', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM alert_preferences WHERE wallet_provider_id = $1`,
            [req.consumerId]
        );

        res.json(result.rows[0] || {
            stale_threshold_hours: 1,
            movement_threshold_km: 10,
            movement_time_window_minutes: 5,
            email_notifications: true,
            webhook_notifications: true
        });
    } catch (error) {
        console.error('Error fetching alert preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update alert preferences
router.put('/preferences', validateConsumerApiKey, async (req, res) => {
    const {
        stale_threshold_hours,
        movement_threshold_km,
        movement_time_window_minutes,
        email_notifications,
        webhook_notifications
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO alert_preferences 
            (wallet_provider_id, stale_threshold_hours, movement_threshold_km, 
             movement_time_window_minutes, email_notifications, webhook_notifications)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (wallet_provider_id) 
            DO UPDATE SET
                stale_threshold_hours = EXCLUDED.stale_threshold_hours,
                movement_threshold_km = EXCLUDED.movement_threshold_km,
                movement_time_window_minutes = EXCLUDED.movement_time_window_minutes,
                email_notifications = EXCLUDED.email_notifications,
                webhook_notifications = EXCLUDED.webhook_notifications
            RETURNING *`,
            [
                req.consumerId,
                stale_threshold_hours,
                movement_threshold_km,
                movement_time_window_minutes,
                email_notifications,
                webhook_notifications
            ]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating alert preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark alert as read
router.patch('/:alertId', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE alert_history 
            SET notified = true 
            WHERE id = $1 AND wallet_provider_id = $2
            RETURNING *`,
            [req.params.alertId, req.consumerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get alert statistics
router.get('/stats', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                alert_type,
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE NOT notified) as unread_count,
                MAX(created_at) as latest_alert
            FROM alert_history
            WHERE wallet_provider_id = $1
            GROUP BY alert_type`,
            [req.consumerId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching alert stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 