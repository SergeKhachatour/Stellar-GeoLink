const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

router.get('/api-keys', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                CASE 
                    WHEN wp.id IS NOT NULL THEN 'wallet_provider'
                    ELSE 'data_consumer'
                END as type,
                COALESCE(wp.api_key, dc.api_key) as api_key,
                COALESCE(wp.status, dc.status) as status,
                COALESCE(wp.id, dc.id) as id
            FROM users u
            LEFT JOIN wallet_providers wp ON wp.user_id = u.id
            LEFT JOIN data_consumers dc ON dc.user_id = u.id
            WHERE u.id = $1`,
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
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

// Get API usage for a specific provider
router.get('/api-usage', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                au.*,
                CASE 
                    WHEN wp.id IS NOT NULL THEN 'wallet_provider'
                    ELSE 'data_consumer'
                END as user_type
            FROM api_key_usage au
            LEFT JOIN wallet_providers wp ON wp.id = au.wallet_provider_id
            LEFT JOIN data_consumers dc ON dc.id = au.data_consumer_id
            WHERE (wp.user_id = $1 OR dc.user_id = $1)
            ORDER BY au.created_at DESC
            LIMIT 25`,
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
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

module.exports = router; 