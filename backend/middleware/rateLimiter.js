const rateLimit = require('express-rate-limit');

const locationUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many location updates, please try again later'
});

const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

module.exports = { locationUpdateLimiter, rateLimiter }; 