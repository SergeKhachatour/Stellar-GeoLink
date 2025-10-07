const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');

// Get NFT analytics overview
router.get('/analytics', authenticateUser, async (req, res) => {
    try {
        // Check if user has admin or nft_manager role
        if (!['admin', 'nft_manager'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Get overview statistics
        const overviewResult = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM pinned_nfts) as total_nfts,
                (SELECT COUNT(*) FROM pinned_nfts WHERE is_active = true) as active_nfts,
                (SELECT COUNT(*) FROM pinned_nfts WHERE is_active = false) as inactive_nfts,
                (SELECT COUNT(*) FROM nft_collections) as total_collections,
                (SELECT COUNT(DISTINCT user_public_key) FROM user_nft_ownership WHERE is_active = true) as unique_collectors,
                (SELECT COUNT(*) FROM user_nft_ownership WHERE is_active = true) as total_collections_made
        `);

        // Get collection statistics
        const collectionStats = await pool.query(`
            SELECT 
                nc.name as collection_name,
                nc.rarity_level,
                COUNT(pn.id) as nft_count,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_count,
                COUNT(uno.id) as total_collections
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            GROUP BY nc.id, nc.name, nc.rarity_level
            ORDER BY nft_count DESC
        `);

        // Get recent activity
        const recentActivity = await pool.query(`
            SELECT 
                'nft_pinned' as activity_type,
                pn.created_at as timestamp,
                pn.pinned_by_user as user_key,
                nc.name as collection_name,
                pn.latitude,
                pn.longitude
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            UNION ALL
            SELECT 
                'nft_collected' as activity_type,
                uno.collected_at as timestamp,
                uno.user_public_key as user_key,
                nc.name as collection_name,
                pn.latitude,
                pn.longitude
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.is_active = true
            ORDER BY timestamp DESC
            LIMIT 20
        `);

        // Get location distribution
        const locationStats = await pool.query(`
            SELECT 
                COUNT(*) as nft_count,
                AVG(latitude) as avg_latitude,
                AVG(longitude) as avg_longitude,
                MIN(latitude) as min_latitude,
                MAX(latitude) as max_latitude,
                MIN(longitude) as min_longitude,
                MAX(longitude) as max_longitude
            FROM pinned_nfts
            WHERE is_active = true
        `);

        res.json({
            overview: overviewResult.rows[0],
            collection_stats: collectionStats.rows,
            recent_activity: recentActivity.rows,
            location_stats: locationStats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching NFT analytics:', error);
        res.status(500).json({ error: 'Failed to fetch NFT analytics' });
    }
});

// Get user-specific analytics
router.get('/user-analytics', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.public_key;

        // Get user collection stats
        const userStats = await pool.query(`
            SELECT 
                COUNT(uno.id) as total_collected,
                COUNT(DISTINCT pn.collection_id) as unique_collections,
                COUNT(CASE WHEN nc.rarity_level = 'common' THEN 1 END) as common_nfts,
                COUNT(CASE WHEN nc.rarity_level = 'rare' THEN 1 END) as rare_nfts,
                COUNT(CASE WHEN nc.rarity_level = 'legendary' THEN 1 END) as legendary_nfts,
                MIN(uno.collected_at) as first_collection,
                MAX(uno.collected_at) as last_collection
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.user_public_key = $1 AND uno.is_active = true
        `, [userId]);

        // Get collection timeline
        const timeline = await pool.query(`
            SELECT 
                DATE(uno.collected_at) as collection_date,
                COUNT(*) as nfts_collected
            FROM user_nft_ownership uno
            WHERE uno.user_public_key = $1 AND uno.is_active = true
            GROUP BY DATE(uno.collected_at)
            ORDER BY collection_date DESC
            LIMIT 30
        `, [userId]);

        // Get location verification stats
        const verificationStats = await pool.query(`
            SELECT 
                COUNT(*) as total_attempts,
                COUNT(CASE WHEN verification_result = true THEN 1 END) as successful_attempts,
                AVG(distance_meters) as average_distance,
                MIN(distance_meters) as closest_attempt,
                MAX(distance_meters) as farthest_attempt
            FROM location_verifications
            WHERE user_public_key = $1
        `, [userId]);

        res.json({
            user_stats: userStats.rows[0],
            timeline: timeline.rows,
            verification_stats: verificationStats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching user analytics:', error);
        res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
});

// Get NFT performance metrics
router.get('/performance', authenticateUser, async (req, res) => {
    try {
        // Check if user has admin or nft_manager role
        if (!['admin', 'nft_manager'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Get most popular NFTs
        const popularNFTs = await pool.query(`
            SELECT 
                pn.id,
                pn.latitude,
                pn.longitude,
                nc.name as collection_name,
                nc.rarity_level,
                COUNT(uno.id) as collection_count,
                pn.created_at
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            WHERE pn.is_active = true
            GROUP BY pn.id, pn.latitude, pn.longitude, nc.name, nc.rarity_level, pn.created_at
            ORDER BY collection_count DESC
            LIMIT 10
        `);

        // Get collection success rates by location
        const locationPerformance = await pool.query(`
            SELECT 
                ROUND(latitude::numeric, 2) as lat_rounded,
                ROUND(longitude::numeric, 2) as lng_rounded,
                COUNT(pn.id) as nft_count,
                COUNT(uno.id) as total_collections,
                AVG(uno.collected_at - pn.created_at) as avg_time_to_collect
            FROM pinned_nfts pn
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            WHERE pn.is_active = true
            GROUP BY ROUND(latitude::numeric, 2), ROUND(longitude::numeric, 2)
            HAVING COUNT(pn.id) > 0
            ORDER BY total_collections DESC
            LIMIT 20
        `);

        res.json({
            popular_nfts: popularNFTs.rows,
            location_performance: locationPerformance.rows
        });
    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
});

module.exports = router;
