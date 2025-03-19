const pool = require('../config/database');

const trackApiUsage = async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Get API key from request
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return next();

    // Store original URL before any modifications by other middleware
    const endpoint = req.originalUrl;
    const method = req.method;

    res.send = function (data) {
        const responseTime = Date.now() - startTime;
        
        // Restore original send
        res.send = originalSend;
        
        // Track the API usage asynchronously
        (async () => {
            try {
                // Get provider or consumer ID based on API key
                const [providerResult, consumerResult] = await Promise.all([
                    pool.query('SELECT id FROM wallet_providers WHERE api_key = $1', [apiKey]),
                    pool.query('SELECT id FROM data_consumers WHERE api_key = $1', [apiKey])
                ]);

                await pool.query(
                    `INSERT INTO api_key_usage 
                    (api_key, endpoint, method, status_code, response_time, ip_address, user_agent, 
                    wallet_provider_id, data_consumer_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        apiKey,
                        endpoint,
                        method,
                        res.statusCode,
                        responseTime,
                        req.ip,
                        req.get('user-agent'),
                        providerResult.rows[0]?.id || null,
                        consumerResult.rows[0]?.id || null
                    ]
                );
            } catch (error) {
                console.error('Error tracking API usage:', error);
            }
        })();

        // Send the response
        return originalSend.call(this, data);
    };

    next();
};

module.exports = trackApiUsage; 