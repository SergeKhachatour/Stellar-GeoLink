const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateConsumerApiKey } = require('../middleware/apiKey');

// Get overall system statistics
router.get('/stats', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(DISTINCT wl.public_key) as total_wallets,
                COUNT(DISTINCT wl.blockchain) as total_blockchains,
                COUNT(DISTINCT wl.provider_id) as total_providers,
                COUNT(*) FILTER (WHERE wl.last_updated > NOW() - INTERVAL '24 hours') as active_wallets_24h
            FROM wallet_locations wl
        `);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get blockchain distribution
router.get('/blockchain-distribution', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                blockchain,
                COUNT(*) as wallet_count,
                COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
            FROM wallet_locations
            GROUP BY blockchain
            ORDER BY wallet_count DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching blockchain distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get activity over time
router.get('/activity', validateConsumerApiKey, async (req, res) => {
    const { interval = '1 hour', range = '24 hours' } = req.query;
    
    try {
        const result = await pool.query(`
            SELECT 
                time_bucket($1, last_updated) AS time_period,
                COUNT(*) as updates
            FROM wallet_locations_history
            WHERE last_updated > NOW() - $2::interval
            GROUP BY time_period
            ORDER BY time_period
        `, [interval, range]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching activity data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get geofence analytics
router.get('/geofences', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                g.id,
                g.name,
                COUNT(DISTINCT ge.wallet_public_key) as unique_wallets,
                COUNT(*) as total_events,
                MAX(ge.created_at) as last_event
            FROM geofences g
            LEFT JOIN geofence_events ge ON g.id = ge.geofence_id
            WHERE g.data_consumer_id = $1
            GROUP BY g.id, g.name
            ORDER BY total_events DESC
        `, [req.consumerId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching geofence analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get API usage statistics
router.get('/api-usage', validateConsumerApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                DATE_TRUNC('hour', created_at) as time_period,
                endpoint,
                COUNT(*) as request_count,
                AVG(response_time) as avg_response_time
            FROM api_usage_logs
            WHERE data_consumer_id = $1
            AND created_at > NOW() - INTERVAL '24 hours'
            GROUP BY time_period, endpoint
            ORDER BY time_period DESC
        `, [req.consumerId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API usage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 