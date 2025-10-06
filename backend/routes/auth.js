const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticateUser } = require('../middleware/authUser');
const { authMiddleware } = require('../middleware/auth');
const sessionService = require('../services/session');
const { validateRegistration } = require('../middleware/validation');

router.post('/register', validateRegistration, async (req, res) => {
    console.log('Registration request received:', req.body);
    
    const {
        email,
        password,
        firstName,
        lastName,
        organization,
        role,
        useCase
    } = req.body;

    // Validate role
    const validRoles = ['wallet_provider', 'data_consumer', 'nft_manager'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role selected' });
    }

    // Additional validation for data_consumer
    if (role === 'data_consumer' && !useCase) {
        return res.status(400).json({ error: 'Use case is required for Data Consumer registration' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check if email already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert user
        const userResult = await client.query(
            `INSERT INTO users (
                email,
                password_hash,
                first_name,
                last_name,
                organization,
                role
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [email, hashedPassword, firstName, lastName, organization, role]
        );

        const userId = userResult.rows[0].id;

        // Handle role-specific logic
        console.log('Processing role:', role);
        if (role === 'data_consumer') {
            // Create API key request
            await client.query(
                `INSERT INTO api_key_requests (
                    user_id,
                    request_type,
                    organization_name,
                    purpose,
                    status
                ) VALUES ($1, $2, $3, $4, $5)`,
                [userId, 'initial', organization, useCase, 'pending']
            );

            // Set default rate limits
            await client.query(
                `INSERT INTO rate_limits (user_id)
                VALUES ($1)`,
                [userId]
            );
        } else if (role === 'wallet_provider') {
            // Generate API key for wallet provider
            const apiKey = crypto.randomBytes(32).toString('hex');
            
            // First, create API key in api_keys table (status = false for pending approval)
            const apiKeyResult = await client.query(
                `INSERT INTO api_keys (user_id, api_key, name, status, created_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [userId, apiKey, `${organization} API Key`, false]
            );
            
            // Then create wallet provider profile with reference to API key
            await client.query(
                `INSERT INTO wallet_providers (
                    user_id,
                    name,
                    api_key_id,
                    status
                ) VALUES ($1, $2, $3, $4)`,
                [userId, organization, apiKeyResult.rows[0].id, false]
            );
        }

        await client.query('COMMIT');

        // Generate JWT token
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        const token = jwt.sign(
            { 
                userId,
                role,
                status: 'pending'
            },
            jwtSecret,
            { expiresIn: '24h' }
        );

        // Send success response
        res.status(201).json({
            message: 'Registration successful',
            token,
            user: {
                id: userId,
                email,
                firstName,
                lastName,
                organization,
                role,
                status: 'pending'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Registration error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    } finally {
        client.release();
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('\n=== Login Attempt ===');
        console.log('Email:', email);

        const result = await pool.query(
            'SELECT id, email, role, password_hash, first_name, last_name FROM users WHERE email = $1',
            [email]
        );

        console.log('Database query result:', {
            userFound: result.rows.length > 0,
            role: result.rows[0]?.role,
            userId: result.rows[0]?.id
        });

        if (result.rows.length === 0) {
            console.log('Login failed: User not found');
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        console.log('Password verification:', {
            isMatch,
            userRole: user.role
        });

        if (!isMatch) {
            console.log('Login failed: Invalid password');
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token payload with user data
        const payload = {
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        };

        console.log('Token payload:', payload);

        // Sign token with user data
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' }); // Shorter access token

        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Store refresh token in database
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, refreshToken, refreshTokenExpiry]
        );

        const responseData = {
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            token,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name
            }
        };

        console.log('Login successful:', {
            userId: responseData.user.id,
            userEmail: responseData.user.email,
            userRole: responseData.user.role
        });
        console.log('=== End Login ===\n');

        res.json(responseData);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            message: 'Server error',
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        // Check if refresh token exists and is valid
        const result = await pool.query(
            'SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1 AND is_revoked = FALSE',
            [refreshToken]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const tokenData = result.rows[0];
        
        // Check if token is expired
        if (new Date() > new Date(tokenData.expires_at)) {
            // Mark token as revoked
            await pool.query(
                'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1',
                [refreshToken]
            );
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        // Get user data
        const userResult = await pool.query(
            'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
            [tokenData.user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Generate new access token
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        const payload = {
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        };
        const newToken = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

        res.json({
            token: newToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout endpoint
router.post('/logout', authenticateUser, async (req, res) => {
    try {
        // For JWT tokens, we can't invalidate them server-side without a blacklist
        // But we can return a success message and let the client handle token removal
        res.json({ 
            message: 'Logout successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api-key-request', authenticateUser, async (req, res) => {
    const { requestType, organizationName, purpose } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO api_key_requests 
            (user_id, request_type, organization_name, purpose)
            VALUES ($1, $2, $3, $4)
            RETURNING id`,
            [req.user.id, requestType, organizationName, purpose]
        );

        res.json({ success: true, requestId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/refresh-token', authenticateUser, async (req, res) => {
    try {
        // Get current session
        const session = await sessionService.getSession(req.user.sessionId);
        if (!session) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Create new session with refreshed expiry
        const newSessionId = await sessionService.createSession(session.id, {
            id: session.id,
            email: session.email,
            role: session.role,
            firstName: session.firstName,
            lastName: session.lastName
        });

        // Create new JWT
        const token = jwt.sign(
            { sessionId: newSessionId },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token route
router.get('/verify', authenticateUser, async (req, res) => {
    // If no user is authenticated, return null
    if (!req.user) {
        return res.json(null);
    }

    try {
        const result = await pool.query(
            'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        res.json({
            id: result.rows[0].id,
            email: result.rows[0].email,
            role: result.rows[0].role,
            firstName: result.rows[0].first_name,
            lastName: result.rows[0].last_name
        });
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user's public key
router.put('/update-public-key', authMiddleware, async (req, res) => {
    try {
        const { public_key } = req.body;
        const userId = req.user.user.id;

        if (!public_key || public_key.length !== 56) {
            return res.status(400).json({ error: 'Invalid public key format' });
        }

        const result = await pool.query(
            'UPDATE users SET public_key = $1 WHERE id = $2 RETURNING id, email, public_key',
            [public_key, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: 'Public key updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating public key:', error);
        res.status(500).json({ error: 'Failed to update public key' });
    }
});

module.exports = router; 