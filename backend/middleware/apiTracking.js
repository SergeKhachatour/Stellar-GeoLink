const pool = require('../config/database');

const trackApiUsage = async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Get API key from request (check both cases)
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.query.api_key;
    if (!apiKey) {
        // No API key is normal for internal/frontend requests - skip tracking silently
        return next();
    }
    
    // Commented out verbose API tracking logs - only log errors
    // console.log('🔍 API Tracking: Found API key:', apiKey.substring(0, 10) + '...');

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
                    // console.log('📊 API Tracking: Logging usage for API key ID:', apiKeyResult.rows[0].id);
                    
                    // Get wallet provider and data consumer IDs for this API key
                    const providerResult = await pool.query(
                        'SELECT id FROM wallet_providers WHERE api_key_id = $1',
                        [apiKeyResult.rows[0].id]
                    );
                    
                    const consumerResult = await pool.query(
                        'SELECT dc.id FROM data_consumers dc JOIN api_keys ak ON ak.user_id = dc.user_id WHERE ak.id = $1',
                        [apiKeyResult.rows[0].id]
                    );
                    
                    const walletProviderId = providerResult.rows.length > 0 ? providerResult.rows[0].id : null;
                    const dataConsumerId = consumerResult.rows.length > 0 ? consumerResult.rows[0].id : null;
                    
                    // console.log('📊 API Tracking: Provider ID:', walletProviderId, 'Consumer ID:', dataConsumerId);
                    
                    await pool.query(
                        `INSERT INTO api_usage_logs 
                        (endpoint, method, status_code, response_time, ip_address, user_agent, api_key_id, api_key, wallet_provider_id, data_consumer_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                        [
                            endpoint,
                            method,
                            res.statusCode,
                            responseTime,
                            req.ip,
                            req.get('user-agent'),
                            apiKeyResult.rows[0].id,
                            apiKey,
                            walletProviderId,
                            dataConsumerId
                        ]
                    );
                    // console.log('✅ API Tracking: Usage logged successfully');
                } else {
                    // Only log errors
                    // console.log('❌ API Tracking: API key not found in database');
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