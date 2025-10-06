const rateLimit = require('express-rate-limit');

const locationUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased for development
    message: 'Too many location updates, please try again later'
});

const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000
});

module.exports = { locationUpdateLimiter, rateLimiter }; 