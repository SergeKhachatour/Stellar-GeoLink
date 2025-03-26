const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authMiddleware = (req, res, next) => {
    console.log('Auth middleware - headers:', req.headers);

    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        console.log('No token found in request');
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded);
        
        // Make sure we have the expected structure
        if (!decoded.user || !decoded.user.id) {
            console.log('Invalid token structure:', decoded);
            return res.status(401).json({ message: 'Invalid token structure' });
        }

        // Store the decoded token
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const validateProviderApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key is required' });
    }

    try {
        const result = await pool.query(
            'SELECT id, status FROM wallet_providers WHERE api_key = $1',
            [apiKey]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (!result.rows[0].status) {
            return res.status(403).json({ error: 'API key is disabled' });
        }

        // Add provider ID to request for use in route handler
        req.providerId = result.rows[0].id;
        next();
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const validateConsumerApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        const result = await pool.query(
            `SELECT dc.id, dc.name, dc.status 
            FROM data_consumers dc 
            WHERE dc.api_key = $1`,
            [apiKey]
        );

        if (result.rows.length === 0 || !result.rows[0].status) {
            return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        req.consumerId = result.rows[0].id;
        req.consumerName = result.rows[0].name;
        next();
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const authenticateAdmin = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from database
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [decoded.user.id]
        );

        if (result.rows.length === 0) {
            throw new Error();
        }

        const user = result.rows[0];

        // Check if user is admin
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Add user to request
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid authentication token' });
    }
};

module.exports = {
    authMiddleware,
    validateProviderApiKey,
    validateConsumerApiKey,
    authenticateAdmin,
}; 