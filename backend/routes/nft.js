const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { calculateDistance, verifyLocation, findNearbyNFTs, validateCoordinates } = require('../utils/locationUtils');
const { checkCollectionEligibility, getRarityConfig, generateRarityRequirements } = require('../utils/nftRarity');

// Get all NFT collections
router.get('/collections', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM nft_collections ORDER BY created_at DESC'
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting NFT collections:', error);
        res.status(500).json({ error: 'Failed to get NFT collections' });
    }
});

// Get all NFTs (for map display)
router.get('/all', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE pn.is_active = true
             ORDER BY pn.created_at DESC`
        );
        
        res.json({
            nfts: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error getting all NFTs:', error);
        res.status(500).json({ error: 'Failed to get NFTs' });
    }
});

// Middleware to check NFT manager role
const requireNFTManager = async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [req.user.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userRole = result.rows[0].role;
        if (userRole !== 'nft_manager' && userRole !== 'admin') {
            return res.status(403).json({ error: 'NFT manager access required' });
        }
        
        next();
    } catch (error) {
        console.error('Error checking NFT manager role:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Pin NFT to location
router.post('/pin', authMiddleware, requireNFTManager, async (req, res) => {
    try {
        const {
            collection_id,
            latitude,
            longitude,
            radius_meters = 10,
            rarity_requirements = {},
            ipfs_hash,
            smart_contract_address
        } = req.body;

        // Validate coordinates (convert to numbers)
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        
        if (!validateCoordinates(lat, lon)) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Validate collection exists
        const collectionResult = await pool.query(
            'SELECT * FROM nft_collections WHERE id = $1',
            [collection_id]
        );

        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT collection not found' });
        }

        const collection = collectionResult.rows[0];

        // Generate rarity requirements if not provided
        const requirements = Object.keys(rarity_requirements).length > 0 
            ? rarity_requirements 
            : generateRarityRequirements(collection.rarity_level);

        // Insert pinned NFT
        const result = await pool.query(
            `INSERT INTO pinned_nfts 
             (collection_id, latitude, longitude, radius_meters, pinned_by_user, 
              rarity_requirements, ipfs_hash, smart_contract_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                collection_id,
                lat,
                lon,
                radius_meters,
                req.user.user.public_key || 'system',
                JSON.stringify(requirements),
                ipfs_hash,
                smart_contract_address
            ]
        );

        res.status(201).json({
            message: 'NFT pinned successfully',
            nft: result.rows[0]
        });
    } catch (error) {
        console.error('Error pinning NFT:', error);
        res.status(500).json({ error: 'Failed to pin NFT' });
    }
});

// Get NFTs near user location
router.get('/nearby', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!validateCoordinates(parseFloat(latitude), parseFloat(longitude))) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Get all active NFTs
        const result = await pool.query(
            `SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE pn.is_active = true`
        );

        // Find nearby NFTs
        const nearbyNFTs = findNearbyNFTs(
            parseFloat(latitude),
            parseFloat(longitude),
            result.rows,
            parseInt(radius)
        );

        res.json({
            user_location: { lat: parseFloat(latitude), lon: parseFloat(longitude) },
            search_radius: parseInt(radius),
            nfts: nearbyNFTs,
            total_found: nearbyNFTs.length
        });
    } catch (error) {
        console.error('Error finding nearby NFTs:', error);
        res.status(500).json({ error: 'Failed to find nearby NFTs' });
    }
});

// Collect nearby NFT
router.post('/collect', authMiddleware, async (req, res) => {
    try {
        console.log('Collect debug - Collect endpoint called with:', req.body);
        const { nft_id, user_latitude, user_longitude } = req.body;

        if (!validateCoordinates(user_latitude, user_longitude)) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Get user details including public key
        const userResult = await pool.query(
            'SELECT email, first_name, last_name, public_key FROM users WHERE id = $1',
            [req.user.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const userPublicKey = user.public_key || user.email; // Use public key if available, fallback to email

        // Get NFT details
        const nftResult = await pool.query(
            `SELECT pn.*, nc.rarity_level, nc.name as collection_name
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE pn.id = $1 AND pn.is_active = true`,
            [nft_id]
        );

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found or not active' });
        }

        const nft = nftResult.rows[0];

        // Verify location
        console.log('🔍 Location Verification Debug:');
        console.log('User coords:', { lat: user_latitude, lon: user_longitude });
        console.log('NFT coords:', { lat: nft.latitude, lon: nft.longitude });
        console.log('NFT radius:', nft.radius_meters);
        
        const verification = verifyLocation(
            user_latitude,
            user_longitude,
            nft.latitude,
            nft.longitude,
            nft.radius_meters
        );
        
        console.log('Verification result:', verification);

        // Log location verification
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

        if (!verification.isWithinRange) {
            return res.status(400).json({
                error: 'Not within collection range',
                distance: verification.distance,
                required_radius: nft.radius_meters
            });
        }

        // Check if user already owns this NFT (check both Stellar public key and email)
        const ownershipResult = await pool.query(
            'SELECT * FROM user_nft_ownership WHERE nft_id = $1 AND (user_public_key = $2 OR user_public_key = $3) AND is_active = true',
            [nft_id, userPublicKey, user.email]
        );

        if (ownershipResult.rows.length > 0) {
            return res.status(400).json({ error: 'You already own this NFT' });
        }

        // Check collection eligibility
        const userStats = await getUserNFTStats(userPublicKey);
        const eligibility = checkCollectionEligibility(
            nft.rarity_level,
            { lat: user_latitude, lon: user_longitude },
            { lat: nft.latitude, lon: nft.longitude },
            nft.rarity_requirements,
            userStats
        );

        if (!eligibility.eligible) {
            return res.status(400).json({
                error: 'Collection requirements not met',
                reasons: eligibility.reasons
            });
        }

        // Create ownership record (store both Stellar public key and email for compatibility)
        console.log('Collect debug - Creating ownership with userPublicKey:', userPublicKey, 'user.email:', user.email);
        const ownershipResult2 = await pool.query(
            `INSERT INTO user_nft_ownership 
             (user_public_key, nft_id, current_owner, stellar_address, transfer_count)
             VALUES ($1, $2, $3, $4, 0)
             RETURNING *`,
            [userPublicKey, nft_id, userPublicKey, userPublicKey]
        );
        console.log('Collect debug - Ownership created:', ownershipResult2.rows[0]);

        // Log transfer
        await pool.query(
            `INSERT INTO nft_transfers 
             (nft_id, from_user, to_user, transfer_type)
             VALUES ($1, $2, $3, $4)`,
            [nft_id, null, userPublicKey, 'collect']
        );

        res.json({
            message: 'NFT collected successfully',
            ownership: ownershipResult2.rows[0],
            verification: verification
        });
    } catch (error) {
        console.error('Error collecting NFT:', error);
        res.status(500).json({ error: 'Failed to collect NFT' });
    }
});

// Get user's NFT collection
router.get('/user-collection', authMiddleware, async (req, res) => {
    try {
        // Get user details including public key
        const userResult = await pool.query(
            'SELECT email, first_name, last_name, public_key FROM users WHERE id = $1',
            [req.user.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const userPublicKey = user.public_key || user.email; // Use public key if available, fallback to email

        const result = await pool.query(
            `SELECT uno.*, pn.latitude, pn.longitude, pn.radius_meters, pn.pinned_at,
                    pn.ipfs_hash, pn.smart_contract_address,
                    nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE uno.user_public_key = $1 AND uno.is_active = true
             ORDER BY uno.collected_at DESC`,
            [userPublicKey]
        );

        res.json({
            user: userPublicKey,
            collection: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error getting user collection:', error);
        res.status(500).json({ error: 'Failed to get user collection' });
    }
});


// Get specific NFT details
router.get('/collection/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level,
                    uno.user_public_key as current_owner, uno.collected_at
             FROM pinned_nfts pn
             JOIN nft_collections nc ON pn.collection_id = nc.id
             LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
             WHERE pn.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error getting NFT details:', error);
        res.status(500).json({ error: 'Failed to get NFT details' });
    }
});

// Unpin NFT from location
router.delete('/unpin/:id', authMiddleware, requireNFTManager, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if NFT exists and is owned by the user
        const nftResult = await pool.query(
            'SELECT * FROM pinned_nfts WHERE id = $1',
            [id]
        );

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        // Deactivate NFT
        await pool.query(
            'UPDATE pinned_nfts SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.json({ message: 'NFT unpinned successfully' });
    } catch (error) {
        console.error('Error unpinning NFT:', error);
        res.status(500).json({ error: 'Failed to unpin NFT' });
    }
});

// Update NFT
router.put('/:id', authMiddleware, requireNFTManager, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            collection_id,
            latitude,
            longitude,
            radius_meters,
            ipfs_hash,
            smart_contract_address
        } = req.body;

        // Validate coordinates
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);

        if (!validateCoordinates(lat, lon)) {
            return res.status(400).json({ error: 'Invalid GPS coordinates' });
        }

        // Check if NFT exists and user owns it
        const nftResult = await pool.query(
            'SELECT * FROM pinned_nfts WHERE id = $1 AND pinned_by_user = $2',
            [id, req.user.user.public_key || 'system']
        );

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found or not authorized to edit' });
        }

        // Update NFT
        const result = await pool.query(
            `UPDATE pinned_nfts 
             SET collection_id = $1, latitude = $2, longitude = $3, radius_meters = $4,
                 ipfs_hash = $5, smart_contract_address = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [collection_id, lat, lon, radius_meters, ipfs_hash, smart_contract_address, id]
        );

        res.json({
            success: true,
            message: 'NFT updated successfully',
            nft: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating NFT:', error);
        res.status(500).json({ error: 'Failed to update NFT' });
    }
});

// Delete NFT
router.delete('/:id', authMiddleware, requireNFTManager, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if NFT exists and user owns it
        const nftResult = await pool.query(
            'SELECT * FROM pinned_nfts WHERE id = $1 AND pinned_by_user = $2',
            [id, req.user.user.public_key || 'system']
        );

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found or not authorized to delete' });
        }

        // Soft delete (set is_active to false)
        await pool.query(
            'UPDATE pinned_nfts SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'NFT deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting NFT:', error);
        res.status(500).json({ error: 'Failed to delete NFT' });
    }
});

// Helper function to get user NFT statistics
async function getUserNFTStats(userPublicKey) {
    try {
        const result = await pool.query(
            `SELECT nc.rarity_level, COUNT(*) as count
             FROM user_nft_ownership uno
             JOIN pinned_nfts pn ON uno.nft_id = pn.id
             JOIN nft_collections nc ON pn.collection_id = nc.id
             WHERE uno.user_public_key = $1 AND uno.is_active = true
             GROUP BY nc.rarity_level`,
            [userPublicKey]
        );

        const stats = { common_count: 0, rare_count: 0, legendary_count: 0 };
        result.rows.forEach(row => {
            stats[`${row.rarity_level}_count`] = parseInt(row.count);
        });

        return stats;
    } catch (error) {
        console.error('Error getting user NFT stats:', error);
        return { common_count: 0, rare_count: 0, legendary_count: 0 };
    }
}

// Transfer NFT to another user
router.post('/transfer', authMiddleware, async (req, res) => {
    try {
        const { nft_id, recipient_address, memo, sender_public_key } = req.body;

        if (!nft_id || !recipient_address || !sender_public_key) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate Stellar address format
        if (recipient_address.length !== 56 || !/^[A-Z0-9]{56}$/.test(recipient_address)) {
            return res.status(400).json({ error: 'Invalid recipient address format' });
        }

        // Get user details
        const userResult = await pool.query(
            'SELECT email, first_name, last_name, public_key FROM users WHERE id = $1',
            [req.user.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const userPublicKey = user.public_key || user.email;

        // Verify sender owns the NFT (check both user_public_key and stellar_address fields)
        console.log('Transfer debug - nft_id:', nft_id, 'userPublicKey:', userPublicKey);
        
        // First, let's see what ownership records exist for this NFT
        console.log('Transfer debug - Searching for nft_id:', nft_id, 'type:', typeof nft_id);
        const allOwnershipResult = await pool.query(
            'SELECT * FROM user_nft_ownership WHERE nft_id = $1',
            [nft_id]
        );
        console.log('Transfer debug - All ownership records for NFT:', allOwnershipResult.rows);
        
        // Also check with string conversion
        const allOwnershipResultStr = await pool.query(
            'SELECT * FROM user_nft_ownership WHERE nft_id = $1',
            [String(nft_id)]
        );
        console.log('Transfer debug - All ownership records for NFT (string):', allOwnershipResultStr.rows);
        
        const ownershipResult = await pool.query(
            'SELECT * FROM user_nft_ownership WHERE nft_id = $1 AND (user_public_key = $2 OR stellar_address = $2 OR current_owner = $2 OR user_public_key = $3 OR current_owner = $3) AND is_active = true',
            [nft_id, userPublicKey, user.email]
        );

        console.log('Transfer debug - ownershipResult.rows:', ownershipResult.rows);
        console.log('Transfer debug - ownershipResult.rows.length:', ownershipResult.rows.length);

        if (ownershipResult.rows.length === 0) {
            console.log('Transfer debug - No ownership found, returning 403');
            return res.status(403).json({ error: 'You do not own this NFT' });
        }

        console.log('Transfer debug - Ownership verified, proceeding with transfer');
        console.log('Transfer debug - recipient_address:', recipient_address);
        console.log('Transfer debug - Starting database transaction...');

        // Check if recipient exists in system (optional)
        const recipientResult = await pool.query(
            'SELECT id, email, public_key FROM users WHERE public_key = $1 OR email = $1',
            [recipient_address]
        );

        const recipientUser = recipientResult.rows[0];
        const recipientPublicKey = recipientUser ? (recipientUser.public_key || recipientUser.email) : recipient_address;

        // Start transaction
        const client = await pool.connect();
        console.log('Transfer debug - Database client connected');
        await client.query('BEGIN');
        console.log('Transfer debug - Database transaction started');

        try {
            // Deactivate current ownership (check both user_public_key and stellar_address fields)
            console.log('Transfer debug - Deactivating current ownership...');
            await client.query(
                'UPDATE user_nft_ownership SET is_active = false WHERE nft_id = $1 AND (user_public_key = $2 OR stellar_address = $2)',
                [nft_id, userPublicKey]
            );
            console.log('Transfer debug - Current ownership deactivated');

            // Create new ownership for recipient
            console.log('Transfer debug - Creating new ownership for recipient:', recipientPublicKey);
            await client.query(
                `INSERT INTO user_nft_ownership 
                 (user_public_key, nft_id, current_owner, collected_at, transfer_count)
                 VALUES ($1, $2, $3, NOW(), 1)`,
                [recipientPublicKey, nft_id, recipientPublicKey]
            );
            console.log('Transfer debug - New ownership created');

            // Note: Ownership is tracked in user_nft_ownership table
            // No need to update pinned_nfts.current_owner as it's not used

            // Log transfer
            console.log('Transfer debug - Logging transfer...');
            await client.query(
                `INSERT INTO nft_transfers 
                 (nft_id, from_user, to_user, transfer_type, stellar_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [nft_id, userPublicKey, recipientPublicKey, 'transfer', recipient_address]
            );
            console.log('Transfer debug - Transfer logged');

            await client.query('COMMIT');
            console.log('Transfer debug - Transaction committed successfully');

            res.json({
                message: 'NFT transfer initiated successfully',
                transfer: {
                    nft_id,
                    from: userPublicKey,
                    to: recipientPublicKey,
                    memo: memo || null,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ error: 'Failed to transfer NFT' });
    }
});

module.exports = router;
