const pool = require('../config/database');

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

const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        // Get API key and check status
        const keyResult = await pool.query(
            `SELECT ak.*, u.role 
             FROM api_keys ak 
             JOIN users u ON u.id = ak.user_id 
             WHERE ak.api_key = $1 AND ak.status = true`,
            [apiKey]
        );

        if (keyResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        // Check rate limits
        const rateLimitResult = await pool.query(
            'SELECT * FROM rate_limits WHERE user_id = $1',
            [keyResult.rows[0].user_id]
        );

        const rateLimit = rateLimitResult.rows[0];
        
        // Track API usage
        await pool.query(
            'INSERT INTO api_usage (api_key_id, endpoint) VALUES ($1, $2)',
            [keyResult.rows[0].id, req.path]
        );

        // Update last used timestamp
        await pool.query(
            'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [keyResult.rows[0].id]
        );

        // Add API key info to request
        req.apiKey = keyResult.rows[0];
        next();
    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    validateProviderApiKey,
    validateConsumerApiKey,
    authenticateApiKey
}; 