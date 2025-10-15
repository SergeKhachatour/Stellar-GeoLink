const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyLocation } = require('../utils/locationUtils');
const { authenticateUser } = require('../middleware/authUser');

// Helper function to get user's public key from database
const getUserPublicKey = async (userId) => {
    console.log('getUserPublicKey: Looking up user ID:', userId);
    const userResult = await pool.query(
        'SELECT public_key FROM users WHERE id = $1',
        [userId]
    );
    
    console.log('getUserPublicKey: Query result:', userResult.rows);
    
    if (userResult.rows.length === 0) {
        throw new Error('User not found');
    }
    
    const publicKey = userResult.rows[0].public_key;
    console.log('getUserPublicKey: Found public key:', publicKey);
    if (!publicKey) {
        throw new Error('User has no public key set');
    }
    
    return publicKey;
};

// Get all NFT collections
router.get('/collections', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, description, image_url, rarity_level, created_at, updated_at
            FROM nft_collections 
            ORDER BY created_at DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching NFT collections:', error);
        res.status(500).json({ error: 'Failed to fetch NFT collections' });
    }
});

// Create a new NFT collection
router.post('/collections', authenticateUser, async (req, res) => {
    try {
        const { name, description, image_url, rarity_level = 'common' } = req.body;

        if (!name || !description) {
            return res.status(400).json({ error: 'Name and description are required' });
        }

        const result = await pool.query(`
            INSERT INTO nft_collections (name, description, image_url, rarity_level, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            RETURNING *
        `, [name, description, image_url, rarity_level]);

        res.status(201).json({
            message: 'Collection created successfully',
            collection: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating NFT collection:', error);
        res.status(500).json({ error: 'Failed to create NFT collection' });
    }
});

// Get all pinned NFTs
router.get('/pinned', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            ORDER BY pn.created_at DESC
        `);
        
        // Format the response to match frontend expectations
        const formattedNFTs = result.rows.map(nft => ({
            ...nft,
            collection: {
                name: nft.collection_name,
                description: nft.description,
                image_url: nft.image_url,
                rarity_level: nft.rarity_level
            }
        }));
        
        res.json(formattedNFTs);
    } catch (error) {
        console.error('Error fetching pinned NFTs:', error);
        res.status(500).json({ error: 'Failed to fetch pinned NFTs' });
    }
});

// Get all NFT collections
router.get('/collections', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 GET /collections - Fetching collections from database');
        const result = await pool.query(`
            SELECT id, name, description, image_url, rarity_level, created_at
            FROM nft_collections
            ORDER BY created_at DESC
        `);
        
        console.log('📦 Found collections:', result.rows.length, 'collections');
        console.log('📦 Collections data:', result.rows);
        
        res.json({
            collections: result.rows
        });
    } catch (error) {
        console.error('❌ Error fetching collections:', error);
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});

// Create a new NFT collection
router.post('/collections', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 POST /collections - Creating new collection');
        console.log('📦 Request body:', req.body);
        
        const { name, description, image_url, rarity_level = 'common' } = req.body;
        
        if (!name) {
            console.log('❌ Collection name is required');
            return res.status(400).json({ error: 'Collection name is required' });
        }
        
        console.log('📝 Inserting collection:', { name, description, image_url, rarity_level });
        
        const result = await pool.query(`
            INSERT INTO nft_collections (name, description, image_url, rarity_level)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [name, description, image_url, rarity_level]);
        
        console.log('✅ Collection created successfully:', result.rows[0]);
        
        res.status(201).json({
            message: 'Collection created successfully',
            collection: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error creating collection:', error);
        res.status(500).json({ error: 'Failed to create collection' });
    }
});

// Pin a new NFT
router.post('/pin', authenticateUser, async (req, res) => {
    try {
        // Check if NFT tables exist
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('pinned_nfts', 'nft_collections')
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('NFT tables do not exist, cannot pin NFT');
            return res.status(503).json({ 
                error: 'NFT system not available. Database tables are missing. Please contact administrator.' 
            });
        }

        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const {
            collection_id,
            latitude,
            longitude,
            radius_meters = 10,
            ipfs_hash,
            filename, // Extract filename from request
            server_url, // Extract server URL from request
            smart_contract_address,
            rarity_requirements = {},
            is_active = true
        } = req.body;

        // Validate required fields
        if (!latitude || !longitude || !ipfs_hash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Handle collection_id - create default collection if not provided
        let finalCollectionId = collection_id;
        if (!collection_id) {
            // Check if default collection exists, if not create it
            const defaultCollection = await pool.query(`
                SELECT id FROM nft_collections WHERE name = 'Blockchain NFTs' LIMIT 1
            `);
            
            if (defaultCollection.rows.length === 0) {
                const newCollection = await pool.query(`
                    INSERT INTO nft_collections (name, description, rarity_level)
                    VALUES ('Blockchain NFTs', 'NFTs minted on the blockchain', 'common')
                    RETURNING id
                `);
                finalCollectionId = newCollection.rows[0].id;
            } else {
                finalCollectionId = defaultCollection.rows[0].id;
            }
        }

        // Validate coordinates
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }

        // Construct IPFS hash with filename (without ipfs:// prefix)
        // This ensures the database stores: bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_44.png
        let fullIpfsHash = ipfs_hash;
        if (filename) {
            // If filename is provided, append it to the hash
            fullIpfsHash = `${ipfs_hash}/${filename}`;
        } else {
            // If no filename, just use the hash as is
            fullIpfsHash = ipfs_hash;
        }

        console.log('🔗 Constructing IPFS hash with filename:', { ipfs_hash, filename, fullIpfsHash });
        console.log('📝 Request body received:', req.body);
        console.log('📦 Full request payload:', JSON.stringify(req.body, null, 2));

        // Construct full image URL for display
        let fullImageUrl = null;
        if (server_url && ipfs_hash) {
            if (filename) {
                fullImageUrl = `${server_url}${ipfs_hash}/${filename}`;
            } else {
                fullImageUrl = `${server_url}${ipfs_hash}`;
            }
        }
        console.log('🖼️ Full image URL:', fullImageUrl);

        // Log the SQL query and parameters
        const sqlQuery = `
            INSERT INTO pinned_nfts (
                collection_id, latitude, longitude, radius_meters, 
                ipfs_hash, server_url, smart_contract_address, rarity_requirements, 
                is_active, pinned_by_user, pinned_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *
        `;
        
        const queryParams = [
            finalCollectionId, latitude, longitude, radius_meters,
            fullIpfsHash, server_url, smart_contract_address, JSON.stringify(rarity_requirements),
            is_active, userPublicKey
        ];

        console.log('🗄️ SQL Query:', sqlQuery);
        console.log('📊 Query Parameters:', queryParams);
        console.log('🔍 Parameter Details:', {
            finalCollectionId,
            latitude,
            longitude,
            radius_meters,
            fullIpfsHash,
            server_url,
            smart_contract_address,
            rarity_requirements: JSON.stringify(rarity_requirements),
            is_active,
            user_public_key: userPublicKey
        });

        const result = await pool.query(sqlQuery, queryParams);

        // Add the full image URL to the response
        const nftResponse = result.rows[0];
        nftResponse.full_image_url = fullImageUrl;

        res.status(201).json({
            message: 'NFT pinned successfully',
            nft: nftResponse
        });
    } catch (error) {
        console.error('❌ Error pinning NFT:', error);
        console.error('❌ Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            stack: error.stack
        });
        console.error('❌ Full error object:', JSON.stringify(error, null, 2));
        res.status(500).json({ 
            error: 'Failed to pin NFT',
            details: error.message,
            code: error.code
        });
    }
});

// Helper function to construct full image URL for NFT
const constructImageUrl = (nft) => {
    if (nft.server_url && nft.ipfs_hash) {
        // The ipfs_hash now contains hash/filename, so we can use it directly
        return `${nft.server_url}${nft.ipfs_hash}`;
    }
    return null;
};

// Get all pinned NFTs with full image URLs
router.get('/pinned', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pn.*, nc.name as collection_name, nc.description as collection_description
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE pn.is_active = true
            ORDER BY pn.pinned_at DESC
        `);

        // Add full image URLs to each NFT
        const nftsWithUrls = result.rows.map(nft => ({
            ...nft,
            full_image_url: constructImageUrl(nft)
        }));

        res.json({
            nfts: nftsWithUrls
        });
    } catch (error) {
        console.error('Error fetching pinned NFTs:', error);
        res.status(500).json({ error: 'Failed to fetch pinned NFTs' });
    }
});

// Update a pinned NFT
router.put('/pinned/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            collection_id,
            latitude,
            longitude,
            radius_meters,
            ipfs_hash,
            smart_contract_address,
            rarity_requirements,
            is_active
        } = req.body;

        const result = await pool.query(`
            UPDATE pinned_nfts 
            SET collection_id = COALESCE($1, collection_id),
                latitude = COALESCE($2, latitude),
                longitude = COALESCE($3, longitude),
                radius_meters = COALESCE($4, radius_meters),
                ipfs_hash = COALESCE($5, ipfs_hash),
                smart_contract_address = COALESCE($6, smart_contract_address),
                rarity_requirements = COALESCE($7, rarity_requirements),
                is_active = COALESCE($8, is_active),
                updated_at = NOW()
            WHERE id = $9
            RETURNING *
        `, [
            collection_id, latitude, longitude, radius_meters,
            ipfs_hash, smart_contract_address, 
            rarity_requirements ? JSON.stringify(rarity_requirements) : null,
            is_active, id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        res.json({
            message: 'NFT updated successfully',
            nft: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating NFT:', error);
        res.status(500).json({ error: 'Failed to update NFT' });
    }
});

// Delete a pinned NFT
router.delete('/pinned/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            DELETE FROM pinned_nfts 
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        res.json({ message: 'NFT deleted successfully' });
    } catch (error) {
        console.error('Error deleting NFT:', error);
        res.status(500).json({ error: 'Failed to delete NFT' });
    }
});

// Get nearby NFTs
router.get('/nearby', authenticateUser, async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        // Get NFTs within radius using PostGIS if available, otherwise use simple distance calculation
        const result = await pool.query(`
            SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level,
                   ST_Distance(
                       ST_Point($2, $1)::geography,
                       ST_Point(pn.longitude, pn.latitude)::geography
                   ) as distance
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE pn.is_active = true
            AND ST_DWithin(
                ST_Point($2, $1)::geography,
                ST_Point(pn.longitude, pn.latitude)::geography,
                $3
            )
            ORDER BY distance ASC
        `, [latitude, longitude, radius]);

        const formattedNFTs = result.rows.map(nft => ({
            ...nft,
            collection: {
                name: nft.collection_name,
                description: nft.description,
                image_url: nft.image_url,
                rarity_level: nft.rarity_level
            }
        }));

        res.json({
            nfts: formattedNFTs,
            count: formattedNFTs.length,
            search_center: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
            radius: parseInt(radius)
        });
    } catch (error) {
        console.error('Error fetching nearby NFTs:', error);
        res.status(500).json({ error: 'Failed to fetch nearby NFTs' });
    }
});

// Collect an NFT
router.post('/collect', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const { 
            nft_id, 
            user_latitude, 
            user_longitude, 
            blockchain_transaction_hash,
            blockchain_ledger,
            blockchain_network 
        } = req.body;

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

        if (!verification.isWithinRange) {
            return res.status(400).json({ 
                error: `You are ${Math.round(verification.distance)}m away from the NFT. You need to be within ${nft.radius_meters}m to collect it.`,
                verification,
                required_radius: nft.radius_meters,
                current_distance: Math.round(verification.distance)
            });
        }

        // Check if user already collected this NFT
        const existingCollection = await pool.query(`
            SELECT * FROM user_nft_ownership 
            WHERE nft_id = $1 AND user_public_key = $2 AND is_active = true
        `, [nft_id, userPublicKey]);

        if (existingCollection.rows.length > 0) {
            return res.status(400).json({ 
                error: 'You already own this NFT',
                nft_name: nft.name || 'Unknown NFT',
                collection_name: nft.collection_name || 'Unknown Collection',
                collected_at: existingCollection.rows[0].collected_at
            });
        }

        // Add to user collection
        const ownershipResult = await pool.query(`
            INSERT INTO user_nft_ownership (
                user_public_key, nft_id, current_owner, collected_at
            ) VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [userPublicKey, nft_id, userPublicKey]);

        // Add transfer record with blockchain transaction details
        await pool.query(`
            INSERT INTO nft_transfers (
                nft_id, from_user, to_user, transfer_type, transferred_at,
                transaction_hash, smart_contract_tx
            ) VALUES ($1, NULL, $2, 'collect', NOW(), $3, $4)
        `, [nft_id, userPublicKey, blockchain_transaction_hash, blockchain_ledger]);

        res.json({
            message: 'NFT collected successfully',
            ownership: ownershipResult.rows[0],
            verification
        });
    } catch (error) {
        console.error('Error collecting NFT:', error);
        res.status(500).json({ error: 'Failed to collect NFT' });
    }
});

// Get user's NFT collection
router.get('/user-collection', authenticateUser, async (req, res) => {
    try {
        // Check if NFT tables exist
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('user_nft_ownership', 'pinned_nfts', 'nft_collections')
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('NFT tables do not exist, returning empty collection');
            return res.json({
                collection: [],
                count: 0
            });
        }
        
        // Check if user_nft_ownership table exists specifically
        const ownershipTableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_nft_ownership'
            );
        `);
        
        if (!ownershipTableCheck.rows[0].exists) {
            console.log('user_nft_ownership table does not exist, returning empty collection');
            return res.json({
                collection: [],
                count: 0
            });
        }

        // Get user's public_key from database
        let userPublicKey;
        try {
            console.log('Getting public key for user ID:', req.user.id);
            userPublicKey = await getUserPublicKey(req.user.id);
            console.log('Retrieved public key:', userPublicKey);
        } catch (error) {
            console.error('Error getting user public key:', error.message);
            return res.status(400).json({ error: error.message });
        }

        const result = await pool.query(`
            SELECT uno.*, pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.user_public_key = $1 AND uno.is_active = true
            ORDER BY uno.collected_at DESC
        `, [userPublicKey]);

        const formattedCollection = result.rows.map(item => ({
            ...item,
            nft: {
                id: item.nft_id,
                collection_id: item.collection_id,
                latitude: item.latitude,
                longitude: item.longitude,
                radius_meters: item.radius_meters,
                ipfs_hash: item.ipfs_hash,
                smart_contract_address: item.smart_contract_address,
                collection: {
                    name: item.collection_name,
                    description: item.description,
                    image_url: item.image_url,
                    rarity_level: item.rarity_level
                }
            }
        }));

        res.json({
            collection: formattedCollection,
            count: formattedCollection.length
        });
    } catch (error) {
        console.error('Error fetching user collection:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint
        });
        
        // Return empty collection instead of 500 error
        res.json({
            collection: [],
            count: 0
        });
    }
});

// Transfer NFT to another user
router.post('/transfer', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const { 
            nft_id, 
            to_user_public_key, 
            transfer_type = 'transfer',
            blockchain_transaction_hash,
            blockchain_ledger,
            blockchain_network 
        } = req.body;

        if (!nft_id || !to_user_public_key) {
            return res.status(400).json({ error: 'NFT ID and recipient public key are required' });
        }

        // Check if user owns this NFT
        const ownershipResult = await pool.query(`
            SELECT * FROM user_nft_ownership 
            WHERE nft_id = $1 AND user_public_key = $2 AND is_active = true
        `, [nft_id, userPublicKey]);

        if (ownershipResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found in your collection' });
        }

        const ownership = ownershipResult.rows[0];

        // Deactivate current ownership
        await pool.query(`
            UPDATE user_nft_ownership 
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
        `, [ownership.id]);

        // Create new ownership record for recipient
        const newOwnershipResult = await pool.query(`
            INSERT INTO user_nft_ownership (
                user_public_key, nft_id, current_owner, collected_at,
                transfer_count
            ) VALUES ($1, $2, $3, NOW(), $4)
            RETURNING *
        `, [to_user_public_key, nft_id, to_user_public_key, (ownership.transfer_count || 0) + 1]);

        // Add transfer record with blockchain transaction details
        await pool.query(`
            INSERT INTO nft_transfers (
                nft_id, from_user, to_user, transfer_type, transferred_at,
                transaction_hash, smart_contract_tx
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6)
        `, [nft_id, userPublicKey, to_user_public_key, transfer_type, blockchain_transaction_hash, blockchain_ledger]);

        res.json({
            message: 'NFT transferred successfully',
            transfer: {
                nft_id,
                from_user: userPublicKey,
                to_user: to_user_public_key,
                transfer_type,
                blockchain_transaction_hash,
                blockchain_ledger
            },
            new_ownership: newOwnershipResult.rows[0]
        });
    } catch (error) {
        console.error('Error transferring NFT:', error);
        res.status(500).json({ error: 'Failed to transfer NFT' });
    }
});

// Get specific NFT details
router.get('/collection/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT pn.*, nc.name as collection_name, nc.description, nc.image_url, nc.rarity_level,
                   COUNT(uno.id) as collection_count
            FROM pinned_nfts pn
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            WHERE pn.id = $1
            GROUP BY pn.id, nc.name, nc.description, nc.image_url, nc.rarity_level
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        const nft = result.rows[0];
        const formattedNFT = {
            ...nft,
            collection: {
                name: nft.collection_name,
                description: nft.description,
                image_url: nft.image_url,
                rarity_level: nft.rarity_level
            }
        };

        res.json({ nft: formattedNFT });
    } catch (error) {
        console.error('Error fetching NFT details:', error);
        res.status(500).json({ error: 'Failed to fetch NFT details' });
    }
});

// Unpin NFT from location (soft delete)
router.delete('/unpin/:id', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const { id } = req.params;

        // Check if user has permission to unpin (must be the one who pinned it or admin/nft_manager)
        const nftResult = await pool.query(`
            SELECT pinned_by_user FROM pinned_nfts WHERE id = $1
        `, [id]);

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        const nft = nftResult.rows[0];
        if (nft.pinned_by_user !== userPublicKey && !['admin', 'nft_manager'].includes(req.user.user.role)) {
            return res.status(403).json({ error: 'Not authorized to unpin this NFT' });
        }

        // Soft delete by setting is_active to false
        const result = await pool.query(`
            UPDATE pinned_nfts 
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);

        res.json({
            message: 'NFT unpinned successfully',
            nft: result.rows[0]
        });
    } catch (error) {
        console.error('Error unpinning NFT:', error);
        res.status(500).json({ error: 'Failed to unpin NFT' });
    }
});

// Get NFT rarity statistics
router.get('/rarity-stats', authenticateUser, async (req, res) => {
    try {
        // Check if user has admin or nft_manager role
        if (!['admin', 'nft_manager'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const rarityStats = await pool.query(`
            SELECT 
                nc.rarity_level,
                COUNT(pn.id) as total_nfts,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                COUNT(uno.id) as total_collections,
                AVG(uno.collected_at - pn.created_at) as avg_time_to_collect
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            GROUP BY nc.rarity_level
            ORDER BY 
                CASE nc.rarity_level 
                    WHEN 'legendary' THEN 1 
                    WHEN 'rare' THEN 2 
                    WHEN 'common' THEN 3 
                END
        `);

        const collectionStats = await pool.query(`
            SELECT 
                nc.rarity_level,
                COUNT(DISTINCT uno.user_public_key) as unique_collectors,
                COUNT(uno.id) as total_collections,
                AVG(uno.transfer_count) as avg_transfers
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id
            LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id AND uno.is_active = true
            GROUP BY nc.rarity_level
            ORDER BY 
                CASE nc.rarity_level 
                    WHEN 'legendary' THEN 1 
                    WHEN 'rare' THEN 2 
                    WHEN 'common' THEN 3 
                END
        `);

        res.json({
            rarity_distribution: rarityStats.rows,
            collection_stats: collectionStats.rows
        });
    } catch (error) {
        console.error('Error fetching rarity stats:', error);
        res.status(500).json({ error: 'Failed to fetch rarity statistics' });
    }
});

// Get NFT transfer history
router.get('/transfers', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const { nft_id, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT nt.*, pn.latitude, pn.longitude, nc.name as collection_name, nc.rarity_level
            FROM nft_transfers nt
            JOIN pinned_nfts pn ON nt.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (nft_id) {
            paramCount++;
            query += ` AND nt.nft_id = $${paramCount}`;
            params.push(nft_id);
        }

        // If not admin/nft_manager, only show user's transfers
        if (!['admin', 'nft_manager'].includes(req.user.user.role)) {
            paramCount++;
            query += ` AND (nt.from_user = $${paramCount} OR nt.to_user = $${paramCount})`;
            params.push(userPublicKey);
        }

        query += ` ORDER BY nt.transferred_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        res.json({
            transfers: result.rows,
            count: result.rows.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching transfer history:', error);
        res.status(500).json({ error: 'Failed to fetch transfer history' });
    }
});

// Get NFT collection analytics
router.get('/analytics', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        // Collection statistics
        const collectionStats = await pool.query(`
            SELECT 
                COUNT(*) as total_collected,
                COUNT(DISTINCT pn.collection_id) as unique_collections,
                COUNT(CASE WHEN nc.rarity_level = 'legendary' THEN 1 END) as legendary_count,
                COUNT(CASE WHEN nc.rarity_level = 'rare' THEN 1 END) as rare_count,
                COUNT(CASE WHEN nc.rarity_level = 'common' THEN 1 END) as common_count,
                AVG(uno.transfer_count) as avg_transfer_count,
                MAX(uno.collected_at) as last_collection_date
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.user_public_key = $1 AND uno.is_active = true
        `, [userPublicKey]);

        // Collection timeline (last 30 days)
        const timelineStats = await pool.query(`
            SELECT 
                DATE(uno.collected_at) as collection_date,
                COUNT(*) as nfts_collected
            FROM user_nft_ownership uno
            WHERE uno.user_public_key = $1 
                AND uno.is_active = true 
                AND uno.collected_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(uno.collected_at)
            ORDER BY collection_date DESC
        `, [userPublicKey]);

        // Rarity distribution
        const rarityStats = await pool.query(`
            SELECT 
                nc.rarity_level,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.user_public_key = $1 AND uno.is_active = true
            GROUP BY nc.rarity_level
            ORDER BY 
                CASE nc.rarity_level 
                    WHEN 'legendary' THEN 1 
                    WHEN 'rare' THEN 2 
                    WHEN 'common' THEN 3 
                END
        `, [userPublicKey]);

        // Transfer history
        const transferHistory = await pool.query(`
            SELECT 
                nt.*,
                pn.latitude,
                pn.longitude,
                nc.name as collection_name,
                nc.rarity_level
            FROM nft_transfers nt
            JOIN pinned_nfts pn ON nt.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE nt.from_user = $1 OR nt.to_user = $1
            ORDER BY nt.transferred_at DESC
            LIMIT 50
        `, [userPublicKey]);

        // Geographic distribution
        const geoStats = await pool.query(`
            SELECT 
                ROUND(pn.latitude::numeric, 2) as lat_rounded,
                ROUND(pn.longitude::numeric, 2) as lng_rounded,
                COUNT(*) as nft_count,
                STRING_AGG(DISTINCT nc.name, ', ') as collections
            FROM user_nft_ownership uno
            JOIN pinned_nfts pn ON uno.nft_id = pn.id
            LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
            WHERE uno.user_public_key = $1 AND uno.is_active = true
            GROUP BY ROUND(pn.latitude::numeric, 2), ROUND(pn.longitude::numeric, 2)
            ORDER BY nft_count DESC
            LIMIT 20
        `, [userPublicKey]);

        res.json({
            collection_stats: collectionStats.rows[0],
            timeline: timelineStats.rows,
            rarity_distribution: rarityStats.rows,
            transfer_history: transferHistory.rows,
            geographic_distribution: geoStats.rows
        });
    } catch (error) {
        console.error('Error fetching NFT analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Get NFT collection reports
router.get('/reports', authenticateUser, async (req, res) => {
    try {
        // Get user's public_key from database
        let userPublicKey;
        try {
            userPublicKey = await getUserPublicKey(req.user.id);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const { report_type = 'summary', start_date, end_date } = req.query;

        let dateFilter = '';
        let queryParams = [userPublicKey];
        
        if (start_date && end_date) {
            dateFilter = 'AND uno.collected_at BETWEEN $2 AND $3';
            queryParams.push(start_date, end_date);
        }

        switch (report_type) {
            case 'summary':
                const summaryReport = await pool.query(`
                    SELECT 
                        'Total NFTs Collected' as metric,
                        COUNT(*) as value
                    FROM user_nft_ownership uno
                    WHERE uno.user_public_key = $1 AND uno.is_active = true ${dateFilter}
                    
                    UNION ALL
                    
                    SELECT 
                        'Unique Collections' as metric,
                        COUNT(DISTINCT pn.collection_id) as value
                    FROM user_nft_ownership uno
                    JOIN pinned_nfts pn ON uno.nft_id = pn.id
                    WHERE uno.user_public_key = $1 AND uno.is_active = true ${dateFilter}
                    
                    UNION ALL
                    
                    SELECT 
                        'Total Transfers' as metric,
                        COUNT(*) as value
                    FROM nft_transfers nt
                    WHERE (nt.from_user = $1 OR nt.to_user = $1) ${dateFilter.replace('uno.collected_at', 'nt.transferred_at')}
                `, queryParams);
                
                res.json({ report_type: 'summary', data: summaryReport.rows });
                break;

            case 'rarity_breakdown':
                const rarityReport = await pool.query(`
                    SELECT 
                        COALESCE(nc.rarity_level, 'unknown') as rarity_level,
                        COUNT(*) as count,
                        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
                    FROM user_nft_ownership uno
                    JOIN pinned_nfts pn ON uno.nft_id = pn.id
                    LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
                    WHERE uno.user_public_key = $1 AND uno.is_active = true ${dateFilter}
                    GROUP BY nc.rarity_level
                    ORDER BY 
                        CASE nc.rarity_level 
                            WHEN 'legendary' THEN 1 
                            WHEN 'rare' THEN 2 
                            WHEN 'common' THEN 3 
                            ELSE 4
                        END
                `, queryParams);
                
                res.json({ report_type: 'rarity_breakdown', data: rarityReport.rows });
                break;

            case 'transfer_activity':
                const transferReport = await pool.query(`
                    SELECT 
                        DATE(nt.transferred_at) as transfer_date,
                        COUNT(*) as transfers_count,
                        COUNT(CASE WHEN nt.from_user = $1 THEN 1 END) as sent_count,
                        COUNT(CASE WHEN nt.to_user = $1 THEN 1 END) as received_count
                    FROM nft_transfers nt
                    WHERE (nt.from_user = $1 OR nt.to_user = $1) ${dateFilter.replace('uno.collected_at', 'nt.transferred_at')}
                    GROUP BY DATE(nt.transferred_at)
                    ORDER BY transfer_date DESC
                    LIMIT 30
                `, queryParams);
                
                res.json({ report_type: 'transfer_activity', data: transferReport.rows });
                break;

            default:
                res.status(400).json({ error: 'Invalid report type. Use: summary, rarity_breakdown, or transfer_activity' });
        }
    } catch (error) {
        console.error('Error generating NFT report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

module.exports = router;
