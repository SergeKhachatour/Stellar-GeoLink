const express = require('express');
const router = express.Router();

// Get Mapbox token
router.get('/mapbox-token', (req, res) => {
    try {
        const token = process.env.BACKEND_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
        if (!token) {
            return res.status(404).json({ error: 'Mapbox token not configured' });
        }
        res.json({ token });
    } catch (error) {
        console.error('Error getting Mapbox token:', error);
        res.status(500).json({ error: 'Failed to get Mapbox token' });
    }
});

// Get Stellar configuration
router.get('/stellar-config', (req, res) => {
    try {
        const config = {
            network: process.env.STELLAR_NETWORK || 'testnet',
            horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
            networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
        };
        
        res.json(config);
    } catch (error) {
        console.error('Error getting Stellar configuration:', error);
        res.status(500).json({ error: 'Failed to get Stellar configuration' });
    }
});

module.exports = router;
