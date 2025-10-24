const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyLocation } = require('../utils/locationUtils');
const { authenticateUser } = require('../middleware/authUser');

/**
 * @swagger
 * /api/location-verification/verify-nft:
 *   post:
 *     summary: Verify NFT collection location
 *     tags: [Location Verification]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nft_id
 *               - user_latitude
 *               - user_longitude
 *             properties:
 *               nft_id:
 *                 type: integer
 *                 description: ID of the NFT to verify
 *               user_latitude:
 *                 type: number
 *                 format: float
 *                 description: User's current latitude
 *               user_longitude:
 *                 type: number
 *                 format: float
 *                 description: User's current longitude
 *     responses:
 *       200:
 *         description: Location verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                 distance:
 *                   type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: NFT not found
 *       500:
 *         description: Internal server error
 */
// Verify NFT collection location
router.post('/verify-nft', authenticateUser, async (req, res) => {
    try {
        const { nft_id, user_latitude, user_longitude } = req.body;

        if (!nft_id || !user_latitude || !user_longitude) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get NFT details
        const nftResult = await pool.query(`
            SELECT * FROM pinned_nfts WHERE id = $1 AND is_active = true
        `, [nft_id]);

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found or inactive' });
        }

        const nft = nftResult.rows[0];

        // Verify location
        const verification = verifyLocation(
            user_latitude, user_longitude,
            nft.latitude, nft.longitude,
            nft.radius_meters
        );

        // Log verification attempt
        await pool.query(`
            INSERT INTO location_verifications (
                user_public_key, nft_id, user_latitude, user_longitude,
                nft_latitude, nft_longitude, distance_meters, verification_result
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            req.user.public_key, nft_id, user_latitude, user_longitude,
            nft.latitude, nft.longitude, verification.distance, verification.isWithinRange
        ]);

        res.json({
            verification,
            nft: {
                id: nft.id,
                latitude: nft.latitude,
                longitude: nft.longitude,
                radius_meters: nft.radius_meters
            }
        });
    } catch (error) {
        console.error('Error verifying location:', error);
        res.status(500).json({ error: 'Failed to verify location' });
    }
});

// Get verification history for user
router.get('/history', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT lv.*, pn.collection_id, nc.name as collection_name
            FROM location_verifications lv
            JOIN pinned_nfts pn ON lv.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE lv.user_public_key = $1
            ORDER BY lv.verified_at DESC
            LIMIT 50
        `, [req.user.public_key]);

        res.json({
            verifications: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching verification history:', error);
        res.status(500).json({ error: 'Failed to fetch verification history' });
    }
});

// Get verification statistics
router.get('/stats', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_verifications,
                COUNT(CASE WHEN verification_result = true THEN 1 END) as successful_verifications,
                COUNT(CASE WHEN verification_result = false THEN 1 END) as failed_verifications,
                AVG(distance_meters) as average_distance,
                MIN(distance_meters) as closest_distance,
                MAX(distance_meters) as farthest_distance
            FROM location_verifications 
            WHERE user_public_key = $1
        `, [req.user.public_key]);

        const stats = result.rows[0];
        const successRate = stats.total_verifications > 0 
            ? Math.round((stats.successful_verifications / stats.total_verifications) * 100)
            : 0;

        res.json({
            ...stats,
            success_rate: successRate
        });
    } catch (error) {
        console.error('Error fetching verification stats:', error);
        res.status(500).json({ error: 'Failed to fetch verification stats' });
    }
});

// Check if user is within any NFT collection range
router.get('/nft-range', authenticateUser, async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        // Find all NFTs within the specified radius
        const result = await pool.query(`
            SELECT 
                pn.id,
                pn.latitude,
                pn.longitude,
                pn.radius_meters,
                pn.is_active,
                nc.name as collection_name,
                nc.rarity_level,
                ST_Distance(
                    ST_Point($2, $1)::geography,
                    ST_Point(pn.longitude, pn.latitude)::geography
                ) as distance_meters,
                CASE 
                    WHEN ST_DWithin(
                        ST_Point($2, $1)::geography,
                        ST_Point(pn.longitude, pn.latitude)::geography,
                        pn.radius_meters
                    ) THEN true 
                    ELSE false 
                END as within_collection_range
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE pn.is_active = true
            AND ST_DWithin(
                ST_Point($2, $1)::geography,
                ST_Point(pn.longitude, pn.latitude)::geography,
                $3
            )
            ORDER BY distance_meters ASC
        `, [latitude, longitude, radius]);

        const nearbyNFTs = result.rows.map(nft => ({
            id: nft.id,
            collection_name: nft.collection_name,
            rarity_level: nft.rarity_level,
            latitude: nft.latitude,
            longitude: nft.longitude,
            collection_radius: nft.radius_meters,
            distance_meters: Math.round(nft.distance_meters),
            within_collection_range: nft.within_collection_range,
            can_collect: nft.within_collection_range && nft.is_active
        }));

        const withinRange = nearbyNFTs.filter(nft => nft.within_collection_range);
        const canCollect = nearbyNFTs.filter(nft => nft.can_collect);

        res.json({
            user_location: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                search_radius: parseInt(radius)
            },
            nearby_nfts: nearbyNFTs,
            within_range: withinRange,
            can_collect: canCollect,
            summary: {
                total_nearby: nearbyNFTs.length,
                within_collection_range: withinRange.length,
                can_collect: canCollect.length
            }
        });
    } catch (error) {
        console.error('Error checking NFT range:', error);
        res.status(500).json({ error: 'Failed to check NFT range' });
    }
});

module.exports = router;
