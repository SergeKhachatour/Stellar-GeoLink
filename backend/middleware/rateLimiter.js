const rateLimit = require('express-rate-limit');

const locationUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased for development
    message: 'Too many location updates, please try again later'
});

const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Much higher limit for development
    skip: (req) => {
        // Skip rate limiting for API key requests
        if (req.header('X-API-Key')) {
            console.log('🚀 Skipping rate limit for API key request:', req.originalUrl);
            return true;
        }
        
        // Skip rate limiting for authentication endpoints
        if (req.path.includes('/auth/') || req.originalUrl.includes('/auth/')) {
            console.log('🔐 Skipping rate limit for auth endpoint:', req.originalUrl);
            return true;
        }
        
        // Skip rate limiting for all API endpoints in development
        if (req.originalUrl.startsWith('/api/')) {
            console.log('🌐 Skipping rate limit for API endpoint:', req.originalUrl);
            return true;
        }
        
        console.log('⚠️ Applying rate limit to:', req.originalUrl);
        return false;
    }
});

// More lenient rate limiter for API key authenticated requests
const apiKeyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Much higher limit for API key requests
    message: 'Too many API requests, please try again later',
    skip: (req) => {
        // Skip rate limiting for API key requests (they have their own authentication)
        return !req.header('X-API-Key');
    }
});

module.exports = { locationUpdateLimiter, rateLimiter, apiKeyRateLimiter }; 