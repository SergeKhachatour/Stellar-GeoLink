const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth'); // Import from auth.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Get all locations
router.get('/locations', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT wl.*, wt.name as wallet_type, wp.name as provider_name 
            FROM wallet_locations wl
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            ORDER BY wl.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Get all providers
router.get('/providers', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT wp.*, u.email, u.first_name, u.last_name 
            FROM wallet_providers wp
            LEFT JOIN users u ON wp.user_id = u.id
            ORDER BY wp.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching providers:', error);
        res.status(500).json({ error: 'Failed to fetch providers' });
    }
});

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get user by ID
router.get('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user status
router.patch('/users/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Get all API keys with user details
router.get('/api-keys', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ak.*,
                u.email,
                u.first_name,
                u.last_name,
                u.role,
                u.organization,
                wp.name as provider_name,
                dc.organization_name as consumer_organization
            FROM api_keys ak
            LEFT JOIN users u ON ak.user_id = u.id
            LEFT JOIN wallet_providers wp ON wp.api_key_id = ak.id
            LEFT JOIN data_consumers dc ON dc.user_id = u.id
            ORDER BY ak.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

// Update API key status
router.patch('/api-keys/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;
        
        const result = await pool.query(
            `UPDATE api_keys 
             SET status = $1, 
                 rejection_reason = $2,
                 reviewed_by = $3,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $4 
             RETURNING *`,
            [status, rejection_reason, req.user.id, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating API key:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

// Get all API key requests with user details
router.get('/api-key-requests', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u.email, u.first_name, u.last_name, u.organization
            FROM api_key_requests r
            JOIN users u ON u.id = r.user_id
            ORDER BY r.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch API key requests' });
    }
});

// Process (approve/reject) API key request
router.put('/api-key-requests/:id', authenticateAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const { status, reason } = req.body;
        
        console.log('Processing API key request:', { id, status, reason });
        
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Get the request details first
        const requestResult = await client.query(
            'SELECT * FROM api_key_requests WHERE id = $1',
            [id]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requestResult.rows[0];

        // Update request status
        await client.query(
            `UPDATE api_key_requests 
             SET status = $1, 
                 reviewed_by = $2, 
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [status, req.user.id, id]
        );

        if (status === 'approved') {
            const apiKey = crypto.randomBytes(32).toString('hex');
            
            // Insert into the main api_keys table
            const apiKeyResult = await client.query(
                `INSERT INTO api_keys (user_id, api_key, name, created_at)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [request.user_id, apiKey, request.organization_name]
            );

            // Also create the appropriate provider/consumer record
            if (request.request_type === 'wallet_provider') {
                await client.query(
                    `INSERT INTO wallet_providers (user_id, name, api_key_id, status)
                     VALUES ($1, $2, $3, true)`,
                    [request.user_id, request.organization_name, apiKeyResult.rows[0].id]
                );
            } else {
                await client.query(
                    `INSERT INTO data_consumers (user_id, organization_name, created_at)
                     VALUES ($1, $2, CURRENT_TIMESTAMP)`,
                    [request.user_id, request.organization_name]
                );
            }
        } else if (status === 'pending') {
            // If resetting to pending, we need to clean up any created API keys and related records
            // First, find and delete any API keys created for this user from this request
            const existingApiKeys = await client.query(
                `SELECT ak.id FROM api_keys ak 
                 WHERE ak.user_id = $1 AND ak.name = $2`,
                [request.user_id, request.organization_name]
            );
            
            for (const apiKey of existingApiKeys.rows) {
                // Delete related wallet_providers or data_consumers first
                await client.query('DELETE FROM wallet_providers WHERE api_key_id = $1', [apiKey.id]);
                await client.query('DELETE FROM data_consumers WHERE user_id = $1 AND organization_name = $2', 
                    [request.user_id, request.organization_name]);
                
                // Delete the API key
                await client.query('DELETE FROM api_keys WHERE id = $1', [apiKey.id]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: `Request ${status}` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing API key request:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint
        });
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    } finally {
        client.release();
    }
});

// Get admin dashboard statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const [locationsCount, providersCount, usersCount, apiCallsCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM wallet_locations WHERE location_enabled = true'),
            pool.query('SELECT COUNT(*) FROM users WHERE role = \'wallet_provider\''),
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'')
        ]);

        res.json({
            total_locations: parseInt(locationsCount.rows[0].count),
            total_providers: parseInt(providersCount.rows[0].count),
            total_users: parseInt(usersCount.rows[0].count),
            api_calls_24h: parseInt(apiCallsCount.rows[0].count)
        });
    } catch (error) {
        console.error('Error fetching admin statistics:', error);
        res.status(500).json({ error: 'Failed to fetch admin statistics' });
    }
});

// Create new user
router.post('/users', authenticateAdmin, async (req, res) => {
    try {
        const { email, first_name, last_name, organization, role, status } = req.body;
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Create user with a temporary password (user will need to reset it)
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        const result = await pool.query(
            `INSERT INTO users (email, password, first_name, last_name, organization, role, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             RETURNING id, email, first_name, last_name, organization, role, status`,
            [email, hashedPassword, first_name, last_name, organization, role, status]
        );
        
        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0],
            tempPassword: tempPassword // In production, this should be sent via email
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user details
router.patch('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, first_name, last_name, organization, role, status } = req.body;
        
        const result = await pool.query(
            `UPDATE users 
             SET email = $1, 
                 first_name = $2, 
                 last_name = $3, 
                 organization = $4, 
                 role = $5, 
                 status = $6
             WHERE id = $7 
             RETURNING *`,
            [email, first_name, last_name, organization, role, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Reset password endpoint
router.post('/users/:id/reset-password', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Implement your password reset logic here
        // This could involve generating a reset token and sending an email
        
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Add this PUT endpoint to handle user updates
router.put('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, role, status } = req.body;

        // Validate role against the enum type
        if (!['admin', 'sdf_employee', 'wallet_provider', 'data_consumer', 'nft_manager'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        const result = await pool.query(
            `UPDATE users 
             SET first_name = $1, 
                 last_name = $2, 
                 role = $3::user_role, 
                 status = $4
             WHERE id = $5
             RETURNING id, email, first_name, last_name, role, organization, status`,
            [first_name, last_name, role, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// Get all wallet locations
router.get('/wallet-locations', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                wl.*,
                wp.name as provider_name,
                wt.name as wallet_type
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wp.id = wl.provider_id
            JOIN wallet_types wt ON wt.id = wl.wallet_type_id
            WHERE wl.location_enabled = true
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Failed to fetch wallet locations' });
    }
});

module.exports = router; 