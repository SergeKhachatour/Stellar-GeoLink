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

const validateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    try {
        // Check if API key exists and is active
        const keyResult = await pool.query(`
            SELECT ak.*, u.role 
            FROM api_keys ak 
            JOIN users u ON u.id = ak.user_id 
            WHERE ak.api_key = $1 AND ak.status = true`,
            [apiKey]
        );

        if (keyResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        // Log API usage
        await pool.query(`
            INSERT INTO api_usage_logs (
                api_key,
                api_key_id,
                endpoint,
                method,
                status_code,
                response_time,
                ip_address,
                user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                apiKey,
                keyResult.rows[0].id,
                req.path,
                req.method,
                200, // Will be updated after response
                0, // Will be updated after response
                req.ip,
                req.get('User-Agent')
            ]
        );

        req.apiKey = keyResult.rows[0];
        next();
    } catch (error) {
        console.error('API key validation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    validateProviderApiKey,
    validateConsumerApiKey,
    validateApiKey
}; 