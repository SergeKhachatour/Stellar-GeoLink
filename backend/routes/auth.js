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
        public_key,
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

        const isWalletBased = !!public_key;
        const isTraditional = !!email && !!password;

        // Check for existing user
        if (isWalletBased) {
            // Check if public_key + role combination already exists (allow same wallet with different roles)
            const existingWalletUser = await client.query(
                'SELECT id FROM users WHERE public_key = $1 AND role = $2',
                [public_key, role]
            );

            if (existingWalletUser.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Wallet already registered with role: ${role}` });
            }
        } else {
            // Check if email already exists
            const existingUser = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Email already registered' });
            }
        }

        // Hash password for traditional registration
        let hashedPassword = null;
        if (isTraditional) {
            const saltRounds = 10;
            hashedPassword = await bcrypt.hash(password, saltRounds);
        }

        // Insert user - email and password_hash can be NULL for wallet-based registration
        const userResult = await client.query(
            `INSERT INTO users (
                email,
                password_hash,
                public_key,
                first_name,
                last_name,
                organization,
                role
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
                email || null,  // NULL for wallet-based
                hashedPassword,  // NULL for wallet-based
                public_key || null,  // NULL for traditional
                firstName || null,
                lastName || null,
                organization || null,
                role
            ]
        );

        const userId = userResult.rows[0].id;

        // Handle role-specific logic
        console.log('Processing role:', role);
        if (role === 'data_consumer') {
            // Create API key request
            // For wallet-based registration, use public_key if organization is not provided
            // public_key is required for wallet-based registration, so it should always exist
            if (!organization && !public_key) {
                throw new Error('Organization name is required for data consumer registration');
            }
            const organizationName = organization || public_key;
            const purposeText = useCase || 'Data access request';
            await client.query(
                `INSERT INTO api_key_requests (
                    user_id,
                    request_type,
                    organization_name,
                    purpose,
                    status
                ) VALUES ($1, $2, $3, $4, $5)`,
                [userId, 'initial', organizationName, purposeText, 'pending']
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
            
            // For wallet-based registration, use public_key if organization is not provided
            // public_key is required for wallet-based registration, so it should always exist
            if (!organization && !public_key) {
                throw new Error('Organization name is required for wallet provider registration');
            }
            const organizationName = organization || public_key;
            const apiKeyName = organization ? `${organization} API Key` : `${public_key} API Key`;
            
            // First, create API key in api_keys table (status = false for pending approval)
            const apiKeyResult = await client.query(
                `INSERT INTO api_keys (user_id, api_key, name, status, created_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [userId, apiKey, apiKeyName, false]
            );
            
            // Then create wallet provider profile with reference to API key
            await client.query(
                `INSERT INTO wallet_providers (
                    user_id,
                    name,
                    api_key_id,
                    status
                ) VALUES ($1, $2, $3, $4)`,
                [userId, organizationName, apiKeyResult.rows[0].id, false]
            );
        }

        await client.query('COMMIT');

        // Generate JWT token (use same structure as login endpoint)
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        const token = jwt.sign(
            { 
                user: {
                    id: userId,
                    email: email || null,
                    role: role
                }
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Store refresh token in database
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, refreshToken, refreshTokenExpiry]
        );

        // Send success response (same structure as login)
        res.status(201).json({
            message: 'Registration successful',
            token,
            refreshToken,
            user: {
                id: userId,
                email: email || null,
                public_key: public_key || null,
                role: role,
                firstName: firstName || null,
                lastName: lastName || null
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

// Role selection endpoint for wallets with multiple roles
/**
 * POST /api/auth/login/passkey
 * Login using passkey authentication
 * Body: { credentialId, signature, authenticatorData, clientDataJSON, signaturePayload }
 */
router.post('/login/passkey', async (req, res) => {
    try {
        const { credentialId, signature, authenticatorData, clientDataJSON, signaturePayload } = req.body;
        
        if (!credentialId || !signature || !authenticatorData || !clientDataJSON) {
            return res.status(400).json({ 
                message: 'Missing required passkey authentication data' 
            });
        }

        console.log('\n=== Passkey Login Attempt ===');
        console.log('Credential ID:', credentialId.substring(0, 20) + '...');

        // Look up user by credential ID
        const passkeyResult = await pool.query(
            `SELECT up.user_id, up.credential_id, up.public_key_spki, u.id, u.email, u.role, u.first_name, u.last_name, u.public_key, u.password_hash
             FROM user_passkeys up
             JOIN users u ON up.user_id = u.id
             WHERE up.credential_id = $1`,
            [credentialId]
        );

        if (passkeyResult.rows.length === 0) {
            console.log('Login failed: Passkey not found');
            return res.status(400).json({ 
                message: 'Passkey not registered. Please register a passkey first.' 
            });
        }

        const passkeyData = passkeyResult.rows[0];
        const userId = passkeyData.user_id;
        const userPublicKey = passkeyData.public_key;

        if (!userPublicKey) {
            console.log('Login failed: User has no public key');
            return res.status(400).json({ 
                message: 'User account not properly configured' 
            });
        }

        // TODO: Verify passkey signature against WebAuthn Verifier contract
        // For now, we accept the passkey authentication if the credential ID matches
        // In production, you should verify the signature using the WebAuthn Verifier contract
        console.log('Passkey authentication accepted for user:', userId);

        // Check if user has multiple roles with this public key
        const userResult = await pool.query(
            'SELECT id, email, role, password_hash, first_name, last_name, public_key FROM users WHERE public_key = $1 ORDER BY id',
            [userPublicKey]
        );

        // If multiple roles exist, return all roles for selection
        if (userResult.rows.length > 1) {
            console.log('Multiple roles found for wallet, returning role selection');
            return res.json({
                message: 'Multiple roles found. Please select a role.',
                roles: userResult.rows.map(r => ({
                    id: r.id,
                    role: r.role,
                    firstName: r.first_name,
                    lastName: r.last_name,
                    email: r.email
                })),
                public_key: userPublicKey,
                requiresRoleSelection: true
            });
        }

        // Single role found, proceed with login
        const user = userResult.rows[0];

        // Generate JWT token
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('JWT_SECRET not configured');
            return res.status(500).json({ message: 'Server configuration error' });
        }

        const token = jwt.sign(
            { 
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    public_key: user.public_key,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    status: 'active'
                }
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Generate refresh token
        const refreshToken = jwt.sign(
            { userId: user.id },
            jwtSecret,
            { expiresIn: '7d' }
        );

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        console.log('Passkey login successful for user:', user.id, user.role);

        res.json({
            token,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                public_key: user.public_key,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });
    } catch (error) {
        console.error('Passkey login error:', error);
        res.status(500).json({ 
            message: 'Passkey login failed', 
            error: error.message 
        });
    }
});

/**
 * GET /api/auth/roles
 * Get all roles for the authenticated user (by public_key)
 */
router.get('/roles', authenticateUser, async (req, res) => {
    try {
        if (!req.user || !req.user.public_key) {
            return res.status(400).json({ error: 'User public key not found' });
        }

        const result = await pool.query(
            'SELECT id, email, role, first_name, last_name, public_key FROM users WHERE public_key = $1 ORDER BY id',
            [req.user.public_key]
        );

        res.json({
            success: true,
            roles: result.rows.map(r => ({
                id: r.id,
                role: r.role,
                email: r.email,
                firstName: r.first_name,
                lastName: r.last_name
            })),
            currentRole: req.user.role,
            currentUserId: req.user.id
        });
    } catch (error) {
        console.error('Error fetching user roles:', error);
        res.status(500).json({ error: 'Failed to fetch user roles', message: error.message });
    }
});

router.post('/login/select-role', async (req, res) => {
    try {
        const { public_key, role, userId } = req.body;
        
        if (!public_key || !role || !userId) {
            return res.status(400).json({ message: 'public_key, role, and userId are required' });
        }

        // Verify the user exists and has this role
        const result = await pool.query(
            'SELECT id, email, role, password_hash, first_name, last_name, public_key FROM users WHERE id = $1 AND public_key = $2 AND role = $3',
            [userId, public_key, role]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid role selection' });
        }

        const user = result.rows[0];

        // Create token payload with user data
        const payload = {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                public_key: user.public_key,
                firstName: user.first_name,
                lastName: user.last_name
            }
        };

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Store refresh token in database
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, refreshToken, refreshTokenExpiry]
        );

        res.json({
            token,
            refreshToken,
            userId: user.id,
            userEmail: user.email || null,
            userPublicKey: user.public_key || null,
            userRole: user.role,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                public_key: user.public_key,
                firstName: user.first_name,
                lastName: user.last_name
            },
            user: {
                id: user.id,
                email: user.email || null,
                public_key: user.public_key || null,
                role: user.role,
                firstName: user.first_name || null,
                lastName: user.last_name || null
            }
        });
    } catch (error) {
        console.error('Role selection error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password, public_key, passkey_auth } = req.body;
        console.log('\n=== Login Attempt ===');
        console.log('Email:', email);
        console.log('Public Key:', public_key);
        console.log('Passkey Auth:', passkey_auth ? 'Provided' : 'Not provided');

        const isWalletBased = !!public_key;
        const isTraditional = !!email && !!password;

        if (!isWalletBased && !isTraditional) {
            return res.status(400).json({ message: 'Either provide email/password OR public_key for wallet-based login' });
        }

        let result;
        let user;

        if (isWalletBased) {
            // Wallet-based login: find all users with this public_key (may have multiple roles)
            result = await pool.query(
                'SELECT id, email, role, password_hash, first_name, last_name, public_key FROM users WHERE public_key = $1 ORDER BY id',
                [public_key]
            );

            console.log('Database query result (wallet-based):', {
                usersFound: result.rows.length,
                roles: result.rows.map(r => r.role),
                userIds: result.rows.map(r => r.id)
            });

            if (result.rows.length === 0) {
                console.log('Login failed: Wallet not registered');
                return res.status(400).json({ message: 'Wallet not registered. Please sign up first.' });
            }

            // Check if any of the users have a password (should use traditional login)
            const hasPasswordUser = result.rows.some(r => r.password_hash);
            if (hasPasswordUser) {
                console.log('Login failed: Wallet has password, use email/password login');
                return res.status(400).json({ message: 'This account uses email/password login. Please use your email and password.' });
            }

            // If multiple roles exist, return all roles for selection
            if (result.rows.length > 1) {
                console.log('Multiple roles found for wallet, returning role selection');
                return res.json({
                    message: 'Multiple roles found. Please select a role.',
                    roles: result.rows.map(r => ({
                        id: r.id,
                        role: r.role,
                        firstName: r.first_name,
                        lastName: r.last_name,
                        email: r.email
                    })),
                    public_key: public_key,
                    requiresRoleSelection: true
                });
            }

            // Single role found, proceed with login
            user = result.rows[0];

            // If passkey_auth is provided, verify it (optional for now, can be enhanced later)
            if (passkey_auth) {
                console.log('Passkey authentication provided, verifying...');
                // TODO: Verify passkey signature against WebAuthn Verifier contract
                // For now, we accept it if provided (can be enhanced with actual verification)
                // The signature verification would involve:
                // 1. Decode DER signature to raw 64-byte format
                // 2. Extract 65-byte public key from SPKI
                // 3. Call WebAuthn Verifier contract's verify() function
                // 4. Verify challenge matches signature_payload
                console.log('Passkey authentication accepted (verification can be enhanced)');
            }
        } else {
            // Traditional login: find user by email
            result = await pool.query(
                'SELECT id, email, role, password_hash, first_name, last_name, public_key FROM users WHERE email = $1',
                [email]
            );

            console.log('Database query result (traditional):', {
                userFound: result.rows.length > 0,
                role: result.rows[0]?.role,
                userId: result.rows[0]?.id
            });

            if (result.rows.length === 0) {
                console.log('Login failed: User not found');
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            user = result.rows[0];
            
            // Verify password
            if (!user.password_hash) {
                console.log('Login failed: User has no password, use wallet-based login');
                return res.status(400).json({ message: 'This account uses wallet-based login. Please connect your wallet.' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            console.log('Password verification:', {
                isMatch,
                userRole: user.role
            });

            if (!isMatch) {
                console.log('Login failed: Invalid password');
                return res.status(400).json({ message: 'Invalid credentials' });
            }
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
            userEmail: user.email || null,
            userPublicKey: user.public_key || null,
            userRole: user.role,
            token,
            refreshToken,
            user: {
                id: user.id,
                email: user.email || null,
                public_key: user.public_key || null,
                role: user.role,
                firstName: user.first_name || null,
                lastName: user.last_name || null
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
            'SELECT id, email, role, first_name, last_name, public_key FROM users WHERE id = $1',
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
            lastName: result.rows[0].last_name,
            public_key: result.rows[0].public_key
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