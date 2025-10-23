const pool = require('../config/database');

const logApiUsage = async (req, res, next) => {
    const startTime = Date.now();
    const apiKey = req.header('X-API-Key');
    
    // Store the original end function
    const originalEnd = res.end;
    
    // Override the end function to log the API call
    res.end = async function(chunk, encoding) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;
        
        try {
            // Only log if there's an API key
            if (apiKey) {
                console.log('🔍 Logging API usage for key:', apiKey.substring(0, 10) + '...');
                
                // Get the API key ID and determine user type
                const apiKeyResult = await pool.query(
                    'SELECT id FROM api_keys WHERE api_key = $1',
                    [apiKey]
                );
                
                if (apiKeyResult.rows.length > 0) {
                    const apiKeyId = apiKeyResult.rows[0].id;
                    console.log('📝 Found API key ID:', apiKeyId);
                    
                    // Check if it's a wallet provider
                    const providerResult = await pool.query(
                        `SELECT wp.id FROM wallet_providers wp
                         WHERE wp.api_key_id = $1 AND wp.status = true`,
                        [apiKeyId]
                    );
                    
                    // Check if it's a data consumer
                    const consumerResult = await pool.query(
                        `SELECT dc.id FROM data_consumers dc
                         JOIN api_keys ak ON ak.user_id = dc.user_id
                         WHERE ak.id = $1 AND dc.status = true`,
                        [apiKeyId]
                    );
                    
                    const walletProviderId = providerResult.rows.length > 0 ? providerResult.rows[0].id : null;
                    const dataConsumerId = consumerResult.rows.length > 0 ? consumerResult.rows[0].id : null;
                    
                    console.log('🏦 Wallet Provider ID:', walletProviderId);
                    console.log('👤 Data Consumer ID:', dataConsumerId);
                    
                    await pool.query(
                        `INSERT INTO api_usage_logs 
                        (api_key_id, wallet_provider_id, data_consumer_id, endpoint, method, status_code, response_time, ip_address)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            apiKeyId,
                            walletProviderId,
                            dataConsumerId,
                            req.originalUrl,
                            req.method,
                            statusCode,
                            responseTime,
                            req.ip
                        ]
                    );
                    
                    console.log('✅ API usage logged successfully');
                } else {
                    console.log('❌ API key not found in database');
                }
            } else {
                console.log('⚠️ No API key provided, skipping usage logging');
            }
        } catch (error) {
            console.error('❌ Error logging API usage:', error);
        }
        
        // Call the original end function
        originalEnd.apply(this, arguments);
    };
    
    next();
};

module.exports = logApiUsage; 