const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { getRarityStatistics } = require('../utils/nftRarity');

// Middleware to check NFT manager or admin role
const requireNFTManagerOrAdmin = async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [req.user.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userRole = result.rows[0].role;
        if (!['nft_manager', 'admin'].includes(userRole)) {
            return res.status(403).json({ error: 'NFT manager or admin access required' });
        }
        
        next();
    } catch (error) {
        console.error('Error checking role:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get NFT collection statistics
router.get('/analytics', authMiddleware, requireNFTManagerOrAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get overall statistics
        const statsResult = await pool.query(
            `SELECT 
                COUNT(DISTINCT pn.id) as total_nfts,
                COUNT(DISTINCT pn.collection_id) as total_collections,
                COUNT(DISTINCT uno.user_public_key) as unique_collectors,
                COUNT(uno.id) as total_collections,
                AVG(pn.radius_meters) as average_radius,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                COUNT(CASE WHEN pn.is_active = false THEN 1 END) as inactive_nfts
             FROM pinned_nfts pn
             LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
             WHERE pn.created_at >= $1`,
            [startDate]
        );

        // Get rarity distribution
        const rarityResult = await pool.query(
            `SELECT nc.rarity_level, COUNT(*) as count
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE pn.created_at >= $1
             GROUP BY nc.rarity_level`,
            [startDate]
        );

        // Get collection activity
        const activityResult = await pool.query(
            `SELECT 
                DATE(uno.collected_at) as collection_date,
                COUNT(*) as collections_count
             FROM user_nft_ownership uno
             WHERE uno.collected_at >= $1
             GROUP BY DATE(uno.collected_at)
             ORDER BY collection_date DESC
             LIMIT 30`,
            [startDate]
        );

        // Get top collectors
        const topCollectorsResult = await pool.query(
            `SELECT 
                uno.user_public_key,
                COUNT(*) as collection_count,
                COUNT(DISTINCT pn.collection_id) as unique_collections
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             WHERE uno.collected_at >= $1
             GROUP BY uno.user_public_key
             ORDER BY collection_count DESC
             LIMIT 10`,
            [startDate]
        );

        const stats = statsResult.rows[0];
        const rarityStats = getRarityStatistics(rarityResult.rows);

        res.json({
            period_days: parseInt(days),
            overview: {
                total_nfts: parseInt(stats.total_nfts),
                total_collections: parseInt(stats.total_collections),
                unique_collectors: parseInt(stats.unique_collectors),
                total_collections_made: parseInt(stats.total_collections),
                average_radius_meters: Math.round(stats.average_radius * 100) / 100,
                active_nfts: parseInt(stats.active_nfts),
                inactive_nfts: parseInt(stats.inactive_nfts)
            },
            rarity_distribution: rarityStats,
            collection_activity: activityResult.rows,
            top_collectors: topCollectorsResult.rows
        });
    } catch (error) {
        console.error('Error getting NFT analytics:', error);
        res.status(500).json({ error: 'Failed to get NFT analytics' });
    }
});

// Get transfer history
router.get('/transfers', authMiddleware, requireNFTManagerOrAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0, transfer_type, days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        let whereClause = 'WHERE nt.transferred_at >= $1';
        let params = [startDate, parseInt(limit), parseInt(offset)];

        if (transfer_type) {
            whereClause += ' AND nt.transfer_type = $4';
            params.push(transfer_type);
        }

        const result = await pool.query(
            `SELECT 
                nt.*,
                pn.latitude, pn.longitude,
                nc.name as collection_name, nc.rarity_level
             FROM nft_transfers nt
             JOIN pinned_nfts pn ON nt.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             ${whereClause}
             ORDER BY nt.transferred_at DESC
             LIMIT $2 OFFSET $3`,
            params
        );

        // Get transfer statistics
        const statsResult = await pool.query(
            `SELECT 
                transfer_type,
                COUNT(*) as count,
                COUNT(DISTINCT nft_id) as unique_nfts,
                COUNT(DISTINCT from_user) as unique_senders,
                COUNT(DISTINCT to_user) as unique_receivers
             FROM nft_transfers 
             WHERE transferred_at >= $1
             GROUP BY transfer_type`,
            [startDate]
        );

        res.json({
            period_days: parseInt(days),
            transfers: result.rows,
            total: result.rows.length,
            statistics: statsResult.rows
        });
    } catch (error) {
        console.error('Error getting transfer history:', error);
        res.status(500).json({ error: 'Failed to get transfer history' });
    }
});

// Get rarity distribution statistics
router.get('/rarity-stats', authMiddleware, requireNFTManagerOrAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get rarity distribution for pinned NFTs
        const pinnedResult = await pool.query(
            `SELECT nc.rarity_level, COUNT(*) as pinned_count
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE pn.created_at >= $1
             GROUP BY nc.rarity_level`,
            [startDate]
        );

        // Get rarity distribution for collected NFTs
        const collectedResult = await pool.query(
            `SELECT nc.rarity_level, COUNT(*) as collected_count
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE uno.collected_at >= $1
             GROUP BY nc.rarity_level`,
            [startDate]
        );

        // Get collection rates by rarity
        const collectionRateResult = await pool.query(
            `SELECT 
                nc.rarity_level,
                COUNT(pn.id) as total_pinned,
                COUNT(uno.id) as total_collected,
                CASE 
                    WHEN COUNT(pn.id) > 0 THEN 
                        ROUND((COUNT(uno.id)::decimal / COUNT(pn.id)) * 100, 2)
                    ELSE 0 
                END as collection_rate_percentage
             FROM nft_collections nc
             LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id AND pn.created_at >= $1
             LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.collected_at >= $1
             GROUP BY nc.rarity_level
             ORDER BY nc.rarity_level`,
            [startDate]
        );

        // Get average collection time by rarity
        const avgCollectionTimeResult = await pool.query(
            `SELECT 
                nc.rarity_level,
                AVG(EXTRACT(EPOCH FROM (uno.collected_at - pn.pinned_at))/3600) as avg_hours_to_collect
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE uno.collected_at >= $1
             GROUP BY nc.rarity_level`,
            [startDate]
        );

        res.json({
            period_days: parseInt(days),
            pinned_by_rarity: pinnedResult.rows,
            collected_by_rarity: collectedResult.rows,
            collection_rates: collectionRateResult.rows,
            average_collection_times: avgCollectionTimeResult.rows
        });
    } catch (error) {
        console.error('Error getting rarity statistics:', error);
        res.status(500).json({ error: 'Failed to get rarity statistics' });
    }
});

// Get location-based analytics
router.get('/location-analytics', authMiddleware, requireNFTManagerOrAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get geographic distribution
        const geoResult = await pool.query(
            `SELECT 
                latitude,
                longitude,
                COUNT(*) as nft_count,
                AVG(radius_meters) as avg_radius
             FROM pinned_nfts 
             WHERE created_at >= $1
             GROUP BY latitude, longitude
             ORDER BY nft_count DESC`,
            [startDate]
        );

        // Get collection success by location
        const locationSuccessResult = await pool.query(
            `SELECT 
                pn.latitude,
                pn.longitude,
                COUNT(pn.id) as total_pinned,
                COUNT(uno.id) as total_collected,
                CASE 
                    WHEN COUNT(pn.id) > 0 THEN 
                        ROUND((COUNT(uno.id)::decimal / COUNT(pn.id)) * 100, 2)
                    ELSE 0 
                END as success_rate_percentage
             FROM pinned_nfts pn
             LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id
             WHERE pn.created_at >= $1
             GROUP BY pn.latitude, pn.longitude
             HAVING COUNT(pn.id) > 0
             ORDER BY success_rate_percentage DESC`,
            [startDate]
        );

        // Get verification statistics
        const verificationResult = await pool.query(
            `SELECT 
                COUNT(*) as total_verifications,
                COUNT(CASE WHEN verification_result = true THEN 1 END) as successful_verifications,
                AVG(distance_meters) as avg_distance,
                MIN(distance_meters) as min_distance,
                MAX(distance_meters) as max_distance
             FROM location_verifications 
             WHERE verified_at >= $1`,
            [startDate]
        );

        res.json({
            period_days: parseInt(days),
            geographic_distribution: geoResult.rows,
            location_success_rates: locationSuccessResult.rows,
            verification_statistics: verificationResult.rows[0]
        });
    } catch (error) {
        console.error('Error getting location analytics:', error);
        res.status(500).json({ error: 'Failed to get location analytics' });
    }
});

// Get user-specific analytics
router.get('/user-analytics/:user_public_key', authMiddleware, requireNFTManagerOrAdmin, async (req, res) => {
    try {
        const { user_public_key } = req.params;
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get user's collection statistics
        const userStatsResult = await pool.query(
            `SELECT 
                COUNT(*) as total_collected,
                COUNT(DISTINCT pn.collection_id) as unique_collections,
                AVG(EXTRACT(EPOCH FROM (uno.collected_at - pn.pinned_at))/3600) as avg_hours_to_collect
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             WHERE uno.user_public_key = $1 AND uno.collected_at >= $2`,
            [user_public_key, startDate]
        );

        // Get user's collection by rarity
        const userRarityResult = await pool.query(
            `SELECT 
                nc.rarity_level,
                COUNT(*) as count
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE uno.user_public_key = $1 AND uno.collected_at >= $2
             GROUP BY nc.rarity_level`,
            [user_public_key, startDate]
        );

        // Get user's verification history
        const userVerificationResult = await pool.query(
            `SELECT 
                COUNT(*) as total_attempts,
                COUNT(CASE WHEN verification_result = true THEN 1 END) as successful_attempts,
                AVG(distance_meters) as avg_distance
             FROM location_verifications 
             WHERE user_public_key = $1 AND verified_at >= $2`,
            [user_public_key, startDate]
        );

        res.json({
            user_public_key: user_public_key,
            period_days: parseInt(days),
            collection_stats: userStatsResult.rows[0],
            collection_by_rarity: userRarityResult.rows,
            verification_stats: userVerificationResult.rows[0]
        });
    } catch (error) {
        console.error('Error getting user analytics:', error);
        res.status(500).json({ error: 'Failed to get user analytics' });
    }
});

module.exports = router;
