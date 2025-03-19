const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateUser } = require('../middleware/authUser');
const sessionService = require('../services/session');

router.post('/register', async (req, res) => {
    const { email, password, firstName, lastName, organization } = req.body;
    
    try {
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, 
                organization, role)
            VALUES ($1, $2, $3, $4, $5, 'wallet_provider')
            RETURNING id, email, role`,
            [email, passwordHash, firstName, lastName, organization]
        );

        const token = jwt.sign(
            { userId: result.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
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
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        const responseData = {
            token,
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
        res.status(500).json({ message: 'Server error' });
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

module.exports = router; 