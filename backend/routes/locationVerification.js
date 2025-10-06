const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { verifyLocation, validateCoordinates } = require('../utils/locationUtils');

// Verify user is within NFT collection range
router.post('/verify-nft', authMiddleware, async (req, res) => {
    try {
        const { nft_id, user_latitude, user_longitude } = req.body;

        if (!validateCoordinates(user_latitude, user_longitude)) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Get NFT details
        const nftResult = await pool.query(
            'SELECT * FROM pinned_nfts WHERE id = $1 AND is_active = true',
            [nft_id]
        );

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found or not active' });
        }

        const nft = nftResult.rows[0];

        // Verify location
        const verification = verifyLocation(
            user_latitude,
            user_longitude,
            nft.latitude,
            nft.longitude,
            nft.radius_meters
        );

        // Log verification attempt
        await pool.query(
            `INSERT INTO location_verifications 
             (user_public_key, nft_id, user_latitude, user_longitude, 
              nft_latitude, nft_longitude, distance_meters, verification_result)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                req.user.user.public_key || 'unknown',
                nft_id,
                user_latitude,
                user_longitude,
                nft.latitude,
                nft.longitude,
                verification.distance,
                verification.isWithinRange
            ]
        );

        res.json({
            nft_id: nft_id,
            verification: verification,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error verifying NFT location:', error);
        res.status(500).json({ error: 'Failed to verify location' });
    }
});

// Check if user is within any NFT collection range
router.get('/nft-range', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!validateCoordinates(parseFloat(latitude), parseFloat(longitude))) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Get all active NFTs within the search radius
        const result = await pool.query(
            `SELECT id, latitude, longitude, radius_meters, collection_id
             FROM pinned_nfts 
             WHERE is_active = true
             AND ST_DWithin(
                 ST_Point(longitude, latitude)::geography,
                 ST_Point($1, $2)::geography,
                 $3
             )`,
            [parseFloat(longitude), parseFloat(latitude), parseInt(radius)]
        );

        // Check which NFTs are within collection range
        const nearbyNFTs = result.rows.map(nft => {
            const verification = verifyLocation(
                parseFloat(latitude),
                parseFloat(longitude),
                nft.latitude,
                nft.longitude,
                nft.radius_meters
            );

            return {
                nft_id: nft.id,
                collection_id: nft.collection_id,
                distance: verification.distance,
                is_within_range: verification.isWithinRange,
                nft_location: { lat: nft.latitude, lon: nft.longitude },
                collection_radius: nft.radius_meters
            };
        }).filter(nft => nft.is_within_range);

        res.json({
            user_location: { lat: parseFloat(latitude), lon: parseFloat(longitude) },
            search_radius: parseInt(radius),
            nfts_in_range: nearbyNFTs,
            total_found: nearbyNFTs.length
        });
    } catch (error) {
        console.error('Error checking NFT range:', error);
        res.status(500).json({ error: 'Failed to check NFT range' });
    }
});

// Get location verification history for a user
router.get('/verification-history', authMiddleware, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const result = await pool.query(
            `SELECT lv.*, pn.latitude as nft_latitude, pn.longitude as nft_longitude,
                    nc.name as collection_name, nc.rarity_level
             FROM location_verifications lv
             JOIN pinned_nfts pn ON lv.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE lv.user_public_key = $1
             ORDER BY lv.verified_at DESC
             LIMIT $2 OFFSET $3`,
            [req.user.user.public_key || 'unknown', parseInt(limit), parseInt(offset)]
        );

        res.json({
            user: req.user.user.public_key || 'unknown',
            verifications: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error getting verification history:', error);
        res.status(500).json({ error: 'Failed to get verification history' });
    }
});

// Get location verification statistics
router.get('/verification-stats', authMiddleware, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const result = await pool.query(
            `SELECT 
                COUNT(*) as total_verifications,
                COUNT(CASE WHEN verification_result = true THEN 1 END) as successful_verifications,
                COUNT(CASE WHEN verification_result = false THEN 1 END) as failed_verifications,
                AVG(distance_meters) as average_distance,
                MIN(distance_meters) as closest_distance,
                MAX(distance_meters) as farthest_distance
             FROM location_verifications 
             WHERE user_public_key = $1 
             AND verified_at >= $2`,
            [req.user.user.public_key || 'unknown', startDate]
        );

        const stats = result.rows[0];
        const successRate = stats.total_verifications > 0 
            ? Math.round((stats.successful_verifications / stats.total_verifications) * 100)
            : 0;

        res.json({
            period_days: parseInt(days),
            total_verifications: parseInt(stats.total_verifications),
            successful_verifications: parseInt(stats.successful_verifications),
            failed_verifications: parseInt(stats.failed_verifications),
            success_rate_percentage: successRate,
            average_distance_meters: Math.round(stats.average_distance * 100) / 100,
            closest_distance_meters: Math.round(stats.closest_distance * 100) / 100,
            farthest_distance_meters: Math.round(stats.farthest_distance * 100) / 100
        });
    } catch (error) {
        console.error('Error getting verification stats:', error);
        res.status(500).json({ error: 'Failed to get verification statistics' });
    }
});

// Bulk location verification for multiple NFTs
router.post('/bulk-verify', authMiddleware, async (req, res) => {
    try {
        const { user_latitude, user_longitude, nft_ids } = req.body;

        if (!validateCoordinates(user_latitude, user_longitude)) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        if (!Array.isArray(nft_ids) || nft_ids.length === 0) {
            return res.status(400).json({ error: 'NFT IDs array is required' });
        }

        // Get NFT details
        const nftResult = await pool.query(
            `SELECT * FROM pinned_nfts 
             WHERE id = ANY($1) AND is_active = true`,
            [nft_ids]
        );

        const verifications = nftResult.rows.map(nft => {
            const verification = verifyLocation(
                user_latitude,
                user_longitude,
                nft.latitude,
                nft.longitude,
                nft.radius_meters
            );

            return {
                nft_id: nft.id,
                collection_id: nft.collection_id,
                verification: verification
            };
        });

        // Log all verifications
        const logPromises = verifications.map(verification => {
            const nft = nftResult.rows.find(n => n.id === verification.nft_id);
            return pool.query(
                `INSERT INTO location_verifications 
                 (user_public_key, nft_id, user_latitude, user_longitude, 
                  nft_latitude, nft_longitude, distance_meters, verification_result)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    req.user.user.public_key || 'unknown',
                    verification.nft_id,
                    user_latitude,
                    user_longitude,
                    nft.latitude,
                    nft.longitude,
                    verification.verification.distance,
                    verification.verification.isWithinRange
                ]
            );
        });

        await Promise.all(logPromises);

        res.json({
            user_location: { lat: user_latitude, lon: user_longitude },
            verifications: verifications,
            total_checked: verifications.length,
            within_range: verifications.filter(v => v.verification.isWithinRange).length
        });
    } catch (error) {
        console.error('Error bulk verifying locations:', error);
        res.status(500).json({ error: 'Failed to bulk verify locations' });
    }
});

module.exports = router;
