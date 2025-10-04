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
            await pool.query(
                `INSERT INTO api_usage_logs 
                (api_key_id, endpoint, method, status_code, response_time, ip_address)
                VALUES (
                    (SELECT id FROM api_keys WHERE api_key = $1),
                    $2, $3, $4, $5, $6
                )`,
                [
                    apiKey,
                    req.originalUrl,
                    req.method,
                    statusCode,
                    responseTime,
                    req.ip
                ]
            );
        } catch (error) {
            console.error('Error logging API usage:', error);
        }
        
        // Call the original end function
        originalEnd.apply(this, arguments);
    };
    
    next();
};

module.exports = logApiUsage; 