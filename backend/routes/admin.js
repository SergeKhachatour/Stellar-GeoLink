const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const { isAdmin } = require('../middleware/roleCheck');
const crypto = require('crypto');
const { sendEmail } = require('../services/email');
const authMiddleware = require('../middleware/auth');

// Admin middleware (you should implement proper admin authentication)
const adminAuth = (req, res, next) => {
    // Implement proper admin authentication
    next();
};

// Manage wallet providers
router.post('/providers', adminAuth, async (req, res) => {
    const { name } = req.body;
    const apiKey = crypto.randomBytes(32).toString('hex');

    try {
        const result = await pool.query(
            'INSERT INTO wallet_providers (name, api_key) VALUES ($1, $2) RETURNING *',
            [name, apiKey]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Manage data consumers
router.post('/consumers', adminAuth, async (req, res) => {
    const { name } = req.body;
    const apiKey = crypto.randomBytes(32).toString('hex');

    try {
        const result = await pool.query(
            'INSERT INTO data_consumers (name, api_key) VALUES ($1, $2) RETURNING *',
            [name, apiKey]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all API key requests
router.get('/api-key-requests', authenticateUser, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                akr.*,
                u.email,
                u.first_name,
                u.last_name,
                u.organization
            FROM api_key_requests akr
            JOIN users u ON u.id = akr.user_id
            WHERE akr.status = 'pending'
            ORDER BY akr.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API key requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Process API key request
router.post('/api-key-requests/:requestId/process', authenticateUser, isAdmin, async (req, res) => {
    const { requestId } = req.params;
    const { approved, apiKey } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get request details
        const requestResult = await client.query(
            `SELECT * FROM api_key_requests WHERE id = $1`,
            [requestId]
        );
        const request = requestResult.rows[0];

        if (!request) {
            throw new Error('Request not found');
        }

        // Update request status
        await client.query(
            `UPDATE api_key_requests 
            SET status = $1, reviewed_by = $2, reviewed_at = NOW()
            WHERE id = $3`,
            [approved ? 'approved' : 'rejected', req.user.id, requestId]
        );

        if (approved) {
            // Create data consumer entry
            await client.query(
                `INSERT INTO data_consumers (name, api_key, user_id)
                VALUES ($1, $2, $3)`,
                [request.organization_name, apiKey, request.user_id]
            );

            // Send approval email
            const userResult = await client.query(
                'SELECT email FROM users WHERE id = $1',
                [request.user_id]
            );
            
            if (userResult.rows[0]) {
                await sendEmail({
                    to: userResult.rows[0].email,
                    subject: 'API Key Request Approved',
                    text: `Your API key request has been approved. You can now access your API key in your dashboard.`,
                    html: `<p>Your API key request has been approved. You can now access your API key in your dashboard.</p>`
                });
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Request processed successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing API key request:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Get all active API keys
router.get('/api-keys', authenticateUser, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                CASE 
                    WHEN wp.id IS NOT NULL THEN 'wallet_provider'
                    ELSE 'data_consumer'
                END as type,
                COALESCE(wp.id, dc.id) as id,
                COALESCE(wp.name, dc.name) as organization,
                COALESCE(wp.api_key, dc.api_key) as api_key,
                COALESCE(wp.status, dc.status) as status,
                COALESCE(wp.created_at, dc.created_at) as created_at
            FROM wallet_providers wp
            FULL OUTER JOIN data_consumers dc ON false
            WHERE wp.id IS NOT NULL OR dc.id IS NOT NULL
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware to check if user is admin
const isAdminMiddleware = async (req, res, next) => {
    try {
        // Check if we have a user object from auth middleware
        if (!req.user || !req.user.user || !req.user.user.id) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const result = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [req.user.user.id]
        );

        if (!result.rows.length || result.rows[0].role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all users
router.get('/users', authMiddleware, isAdminMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, 
                email, 
                role, 
                first_name, 
                last_name, 
                organization,
                status,
                created_at,
                last_login
            FROM users
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all providers
router.get('/providers', authMiddleware, isAdminMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                wp.*,
                u.email,
                u.organization
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            ORDER BY wp.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching providers:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all locations
router.get('/locations', authMiddleware, isAdminMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                wl.*,
                wp.name as provider_name
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wp.id = wl.wallet_provider_id
            ORDER BY wl.last_updated DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user status
router.patch('/users/:userId/status', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.userId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating user status:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update provider status
router.patch('/providers/:providerId/status', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE wallet_providers SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.providerId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating provider status:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 