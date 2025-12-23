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

const validateRegistration = (req, res, next) => {
    const {
        email,
        password,
        public_key,
        firstName,
        lastName,
        organization,
        role,
        useCase
    } = req.body;

    // Support two registration modes:
    // 1. Traditional: email + password
    // 2. Wallet-based: public_key (no email/password required)

    const isWalletBased = !!public_key;
    const isTraditional = !!email && !!password;

    if (!isWalletBased && !isTraditional) {
        return res.status(400).json({ 
            error: 'Either provide email/password OR public_key for wallet-based registration' 
        });
    }

    // Traditional registration validation
    if (isTraditional) {
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Password validation (at least 8 characters, 1 uppercase, 1 lowercase, 1 number)
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number'
            });
        }
    }

    // Wallet-based registration validation
    if (isWalletBased) {
        // Validate public key format (Stellar public keys are 56 characters, start with 'G')
        if (typeof public_key !== 'string' || public_key.length !== 56 || !public_key.startsWith('G')) {
            return res.status(400).json({ error: 'Invalid Stellar public key format' });
        }
    }

    // Common field validations (optional for wallet-based, required for traditional)
    if (isTraditional) {
        if (!firstName || firstName.trim().length < 2) {
            return res.status(400).json({ error: 'First name is required (minimum 2 characters)' });
        }

        if (!lastName || lastName.trim().length < 2) {
            return res.status(400).json({ error: 'Last name is required (minimum 2 characters)' });
        }

        if (!organization || organization.trim().length < 2) {
            return res.status(400).json({ error: 'Organization is required (minimum 2 characters)' });
        }
    } else {
        // For wallet-based, make these optional but validate if provided
        if (firstName && firstName.trim().length > 0 && firstName.trim().length < 2) {
            return res.status(400).json({ error: 'First name must be at least 2 characters if provided' });
        }

        if (lastName && lastName.trim().length > 0 && lastName.trim().length < 2) {
            return res.status(400).json({ error: 'Last name must be at least 2 characters if provided' });
        }

        if (organization && organization.trim().length > 0 && organization.trim().length < 2) {
            return res.status(400).json({ error: 'Organization must be at least 2 characters if provided' });
        }
    }

    if (!role || !['wallet_provider', 'data_consumer', 'nft_manager'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role selected' });
    }

    // Use case validation for data_consumer
    if (role === 'data_consumer' && (!useCase || useCase.trim().length < 50)) {
        return res.status(400).json({ 
            error: 'Please provide a detailed use case description (minimum 50 characters)'
        });
    }

    next();
};

module.exports = {
    validateLocationUpdate,
    validateGeofence,
    validateRegistration
}; 