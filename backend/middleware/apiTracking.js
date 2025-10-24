const pool = require('../config/database');

const trackApiUsage = async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Get API key from request (check both cases)
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.query.api_key;
    if (!apiKey) {
        console.log('🔍 API Tracking: No API key found in request');
        return next();
    }
    
    console.log('🔍 API Tracking: Found API key:', apiKey.substring(0, 10) + '...');

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
                // Get API key ID from api_keys table
                const apiKeyResult = await pool.query(
                    'SELECT id FROM api_keys WHERE api_key = $1', 
                    [apiKey]
                );

                if (apiKeyResult.rows.length > 0) {
                    console.log('📊 API Tracking: Logging usage for API key ID:', apiKeyResult.rows[0].id);
                    await pool.query(
                        `INSERT INTO api_usage_logs 
                        (api_key, endpoint, method, status_code, response_time, ip_address, user_agent, api_key_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            apiKey,
                            endpoint,
                            method,
                            res.statusCode,
                            responseTime,
                            req.ip,
                            req.get('user-agent'),
                            apiKeyResult.rows[0].id
                        ]
                    );
                    console.log('✅ API Tracking: Usage logged successfully');
                } else {
                    console.log('❌ API Tracking: API key not found in database');
                }
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