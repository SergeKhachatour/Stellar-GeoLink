const validateLocationUpdate = (req, res, next) => {
    const { public_key, blockchain, latitude, longitude } = req.body;
    
    if (!public_key || !blockchain || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    next();
};

const validateGeofence = (req, res, next) => {
    const { name, coordinates, notification_url } = req.body;

    // Check required fields
    if (!name || !coordinates || !notification_url) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['name', 'coordinates', 'notification_url']
        });
    }

    // Validate coordinates format
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
        return res.status(400).json({
            error: 'Invalid polygon coordinates',
            details: 'Polygon must have at least 3 points'
        });
    }

    // Validate each coordinate pair
    const invalidCoords = coordinates.find(coord => 
        !Array.isArray(coord) || 
        coord.length !== 2 ||
        typeof coord[0] !== 'number' || 
        typeof coord[1] !== 'number' ||
        coord[0] < -180 || coord[0] > 180 ||
        coord[1] < -90 || coord[1] > 90
    );

    if (invalidCoords) {
        return res.status(400).json({
            error: 'Invalid coordinates',
            details: 'Each coordinate must be [longitude, latitude] with valid ranges'
        });
    }

    // Validate webhook URL format
    try {
        new URL(notification_url);
    } catch (error) {
        return res.status(400).json({
            error: 'Invalid webhook URL',
            details: 'Must be a valid URL'
        });
    }

    next();
};

module.exports = {
    validateLocationUpdate,
    validateGeofence
}; 