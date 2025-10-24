const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');

// Get current user info
router.get('/me', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, first_name, last_name, role, organization, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            organization: user.organization,
            createdAt: user.created_at
        });
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/api-keys', authenticateUser, async (req, res) => {
    try {
        let result;
        // All users now use the api_keys table
        result = await pool.query(
            'SELECT * FROM api_keys WHERE user_id = $1',
            [req.user.id]
        );

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
        console.log('🔍 API Usage Debug - User ID:', req.user.id);
        
        // First, let's check if there are any api_usage_logs records at all
        const totalLogs = await pool.query('SELECT COUNT(*) as total FROM api_usage_logs');
        console.log('📊 Total API usage logs in database:', totalLogs.rows[0].total);
        
        // Check if user has any API keys
        const userApiKeys = await pool.query('SELECT id, api_key FROM api_keys WHERE user_id = $1', [req.user.id]);
        console.log('🔑 User API keys:', userApiKeys.rows.length);
        
        if (userApiKeys.rows.length === 0) {
            return res.json({
                monthly_requests: 0,
                daily_average: 0,
                last_request_at: null
            });
        }
        
        // All users now use the api_keys table for usage tracking
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

        console.log('📊 Query result:', result.rows[0]);

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

// Get user's wallets (for wallet providers)
router.get('/wallets', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const result = await pool.query(`
            SELECT 
                wl.id,
                wl.public_key,
                wl.blockchain,
                wl.latitude,
                wl.longitude,
                wl.tracking_status,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations wl
            JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wp.user_id = $1
            ORDER BY wl.created_at DESC
        `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user wallets:', error);
        res.status(500).json({ error: 'Failed to fetch wallets' });
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

// Submit API key request
router.post('/api-key-request', authenticateUser, async (req, res) => {
    try {
        const {
            request_type,
            organization_name,
            purpose,
            business_justification,
            expected_usage,
            contact_email,
            contact_phone
        } = req.body;

        // Validate required fields
        if (!request_type || !organization_name || !purpose || !business_justification) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate request type
        const validTypes = ['data_consumer', 'wallet_provider'];
        if (!validTypes.includes(request_type)) {
            return res.status(400).json({ error: 'Invalid request type' });
        }

        // Create API key request
        const result = await pool.query(`
            INSERT INTO api_key_requests (
                user_id,
                request_type,
                organization_name,
                purpose,
                business_justification,
                expected_usage,
                contact_email,
                contact_phone,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            req.user.id,
            request_type,
            organization_name,
            purpose,
            business_justification,
            expected_usage || null,
            contact_email || req.user.email,
            contact_phone || null,
            'pending'
        ]);

        res.status(201).json({
            message: 'API key request submitted successfully',
            request: result.rows[0]
        });
    } catch (error) {
        console.error('Error submitting API key request:', error);
        res.status(500).json({ error: 'Failed to submit API key request' });
    }
});

module.exports = router; 