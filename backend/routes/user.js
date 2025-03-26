const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');

router.get('/api-keys', authenticateUser, async (req, res) => {
    try {
        let result;
        if (req.user.role === 'wallet_provider') {
            result = await pool.query(
                'SELECT * FROM wallet_providers WHERE user_id = $1',
                [req.user.id]
            );
        } else if (req.user.role === 'data_consumer') {
            result = await pool.query(
                'SELECT * FROM data_consumers WHERE user_id = $1',
                [req.user.id]
            );
        }

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

router.get('/api-requests', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM api_key_requests WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get API usage statistics
router.get('/api-usage', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(*) FILTER (WHERE aul.created_at >= DATE_TRUNC('month', CURRENT_DATE)) as monthly_requests,
                ROUND(COUNT(*) FILTER (WHERE aul.created_at >= DATE_TRUNC('day', CURRENT_DATE - INTERVAL '30 days'))::numeric / 30) as daily_average,
                MAX(aul.created_at) as last_request_at
            FROM api_usage_logs aul
            JOIN api_keys ak ON ak.id = aul.api_key_id
            WHERE ak.user_id = $1`,
            [req.user.id]
        );

        // If no usage data exists yet, return default values
        const usageData = result.rows[0] || {
            monthly_requests: 0,
            daily_average: 0,
            last_request_at: null
        };

        res.json({
            monthly_requests: parseInt(usageData.monthly_requests),
            daily_average: parseInt(usageData.daily_average),
            last_request_at: usageData.last_request_at
        });
    } catch (error) {
        console.error('Error fetching API usage:', error);
        res.status(500).json({ error: 'Failed to fetch API usage statistics' });
    }
});

// Data consumer registration
router.post('/register/data-consumer', async (req, res) => {
    const { email, password, firstName, lastName, organization, useCase } = req.body;

    try {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Create user
            const userResult = await client.query(
                `INSERT INTO users 
                (email, password_hash, first_name, last_name, role, organization)
                VALUES ($1, $2, $3, $4, 'data_consumer', $5)
                RETURNING id`,
                [email, await bcrypt.hash(password, 10), firstName, lastName, organization]
            );

            // Create API key request
            await client.query(
                `INSERT INTO api_key_requests 
                (user_id, request_type, organization_name, purpose)
                VALUES ($1, 'data_consumer', $2, $3)`,
                [userResult.rows[0].id, organization, useCase]
            );

            await client.query('COMMIT');

            res.status(201).json({
                message: 'Registration successful. API key request is pending approval.'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error registering data consumer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get data consumer API key status
router.get('/api-key-status', authenticateUser, async (req, res) => {
    if (req.user.role !== 'data_consumer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const result = await pool.query(
            `SELECT status, created_at 
            FROM api_key_requests 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1`,
            [req.user.id]
        );

        res.json(result.rows[0] || { status: 'not_found' });
    } catch (error) {
        console.error('Error checking API key status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generate new API key
router.post('/api-keys', authenticateUser, async (req, res) => {
    if (req.user.role !== 'data_consumer') {
        return res.status(403).json({ error: 'Only data consumers can generate API keys' });
    }

    try {
        const { name } = req.body;
        const apiKey = crypto.randomBytes(32).toString('hex');

        const result = await pool.query(
            'INSERT INTO api_keys (user_id, api_key, name) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, apiKey, name]
        );

        // Set default rate limits
        await pool.query(
            'INSERT INTO rate_limits (user_id) VALUES ($1)',
            [req.user.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error generating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Submit new API key request
router.post('/api-key-request', authenticateUser, async (req, res) => {
    const { purpose, organization_name } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get user's organization if not provided
        let orgName = organization_name;
        if (!orgName) {
            const userResult = await client.query(
                'SELECT organization FROM users WHERE id = $1',
                [req.user.id]
            );
            orgName = userResult.rows[0]?.organization;
        }

        if (!orgName) {
            throw new Error('Organization name is required');
        }

        // Create API key request
        const result = await client.query(
            `INSERT INTO api_key_requests 
            (user_id, request_type, organization_name, purpose, status)
            VALUES ($1, $2, $3, $4, 'pending')
            RETURNING *`,
            [req.user.id, req.user.role, orgName, purpose]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating API key request:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to create API key request' 
        });
    } finally {
        client.release();
    }
});

// Get user's API key requests history
router.get('/api-key-requests', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM api_key_requests 
             WHERE user_id = $1 
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API key requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

module.exports = router; 