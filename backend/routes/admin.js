const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth'); // Import from auth.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Get all locations
router.get('/locations', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT wl.*, wt.name as wallet_type, wp.name as provider_name 
            FROM wallet_locations wl
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            ORDER BY wl.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Get all providers
router.get('/providers', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT wp.*, u.email, u.first_name, u.last_name 
            FROM wallet_providers wp
            LEFT JOIN users u ON wp.user_id = u.id
            ORDER BY wp.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching providers:', error);
        res.status(500).json({ error: 'Failed to fetch providers' });
    }
});

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get user by ID
router.get('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user status
router.patch('/users/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Get all API keys with user details
router.get('/api-keys', authenticateAdmin, async (req, res) => {
    try {
        // First check if api_keys table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'api_keys'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('api_keys table does not exist, returning empty array');
            return res.json([]);
        }
        
        // Try to query the table, but handle any errors gracefully
        try {
            // Use a single query with proper JOINs to avoid duplicates
            const result = await pool.query(`
                SELECT DISTINCT
                    ak.*,
                    u.email,
                    u.first_name,
                    u.last_name,
                    u.role,
                    u.organization,
                    COALESCE(wp.name, dc.organization_name) as organization_name,
                    CASE 
                        WHEN wp.id IS NOT NULL THEN 'Wallet Provider'
                        WHEN dc.id IS NOT NULL THEN 'Data Consumer'
                        ELSE 'Unknown'
                    END as key_type
                FROM api_keys ak
                LEFT JOIN users u ON ak.user_id = u.id
                LEFT JOIN wallet_providers wp ON wp.api_key_id = ak.id
                LEFT JOIN data_consumers dc ON dc.user_id = ak.user_id
                ORDER BY ak.created_at DESC
            `);
            
            // Remove duplicates based on api_key value (keep the most recent one)
            const uniqueKeys = result.rows.reduce((acc, key) => {
                const existingKey = acc.find(k => k.api_key === key.api_key);
                if (!existingKey) {
                    acc.push(key);
                } else if (new Date(key.created_at) > new Date(existingKey.created_at)) {
                    // Replace with more recent key
                    const index = acc.findIndex(k => k.api_key === key.api_key);
                    acc[index] = key;
                }
                return acc;
            }, []);
            
            // For pending keys, only show the most recent inactive key per user
            const pendingKeys = uniqueKeys.filter(key => key.status === false && !key.rejection_reason);
            const userLatestPending = {};
            pendingKeys.forEach(key => {
                if (!userLatestPending[key.user_id] || 
                    new Date(key.created_at) > new Date(userLatestPending[key.user_id].created_at)) {
                    userLatestPending[key.user_id] = key;
                }
            });
            
            // For active keys, only show the most recent active key per user
            const activeKeys = uniqueKeys.filter(key => key.status === true);
            const userLatestActive = {};
            activeKeys.forEach(key => {
                if (!userLatestActive[key.user_id] || 
                    new Date(key.created_at) > new Date(userLatestActive[key.user_id].created_at)) {
                    userLatestActive[key.user_id] = key;
                }
            });
            
            // Combine latest pending, latest active, and all rejected keys
            const latestPendingKeys = Object.values(userLatestPending);
            const latestActiveKeys = Object.values(userLatestActive);
            const rejectedKeys = uniqueKeys.filter(key => key.status === false && key.rejection_reason);
            const finalKeys = [...latestPendingKeys, ...latestActiveKeys, ...rejectedKeys];
            
            // Sort by creation date
            finalKeys.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            res.json(finalKeys);
        } catch (queryError) {
            console.log('Query failed, trying simpler query:', queryError.message);
            // If the complex query fails, try a simpler one
            const simpleResult = await pool.query(`
                SELECT 
                    ak.*,
                    u.email,
                    u.first_name,
                    u.last_name,
                    u.role,
                    u.organization
                FROM api_keys ak
                LEFT JOIN users u ON ak.user_id = u.id
                ORDER BY ak.created_at DESC
            `);
            res.json(simpleResult.rows);
        }
    } catch (error) {
        console.error('Error fetching API keys:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint
        });
        // Return empty array instead of 500 error to prevent frontend crashes
        res.json([]);
    }
});

// Update API key status
router.patch('/api-keys/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;
        
        const result = await pool.query(
            `UPDATE api_keys 
             SET status = $1, 
                 rejection_reason = $2,
                 reviewed_by = $3,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $4 
             RETURNING *`,
            [status, rejection_reason, req.user.id, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating API key:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

// Get all API key requests with user details
router.get('/api-key-requests', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u.email, u.first_name, u.last_name, u.organization
            FROM api_key_requests r
            JOIN users u ON u.id = r.user_id
            ORDER BY r.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch API key requests' });
    }
});

// Process (approve/reject) API key request
router.put('/api-key-requests/:id', authenticateAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const { status, reason } = req.body;
        
        console.log('Processing API key request:', { id, status, reason });
        
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Get the request details first
        const requestResult = await client.query(
            'SELECT * FROM api_key_requests WHERE id = $1',
            [id]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requestResult.rows[0];
        
        console.log('Request details:', {
            id: request.id,
            user_id: request.user_id,
            request_type: request.request_type,
            organization_name: request.organization_name,
            organization: request.organization,
            all_columns: Object.keys(request)
        });

        // Update request status
        await client.query(
            `UPDATE api_key_requests 
             SET status = $1, 
                 reviewed_by = $2, 
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [status, req.user.id, id]
        );

        if (status === 'approved') {
            // Find existing API key for this user (get the most recent one)
            const existingApiKey = await client.query(
                `SELECT id, api_key FROM api_keys 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [request.user_id]
            );

            let apiKeyId;
            let apiKey;

            if (existingApiKey.rows.length > 0) {
                // Update existing API key status to active
                apiKeyId = existingApiKey.rows[0].id;
                apiKey = existingApiKey.rows[0].api_key;
                
                await client.query(
                    `UPDATE api_keys SET status = true, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [apiKeyId]
                );
            } else {
                // Create new API key if none exists (fallback)
                apiKey = crypto.randomBytes(32).toString('hex');
                const apiKeyResult = await client.query(
                    `INSERT INTO api_keys (user_id, api_key, name, status, created_at)
                     VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
                     RETURNING id`,
                    [request.user_id, apiKey, request.organization_name]
                );
                apiKeyId = apiKeyResult.rows[0].id;
            }

            // Create the appropriate provider/consumer record
            // Default to 'data_consumer' if request_type is null/undefined
            const requestType = request.request_type || 'data_consumer';
            const organizationName = request.organization_name || request.organization || 'Unknown Organization';
            console.log('Processing request type:', requestType);
            console.log('Organization name:', organizationName);
            
            if (requestType === 'wallet_provider') {
                // Check if wallet_provider already exists for this user
                const existingProvider = await client.query(
                    'SELECT id FROM wallet_providers WHERE user_id = $1',
                    [request.user_id]
                );
                
                if (existingProvider.rows.length > 0) {
                    // Update only the most recent provider record for this user
                    await client.query(
                        `UPDATE wallet_providers 
                         SET name = $1, api_key_id = $2, status = true
                         WHERE id = (
                             SELECT id FROM wallet_providers 
                             WHERE user_id = $3 
                             ORDER BY created_at DESC 
                             LIMIT 1
                         )`,
                        [organizationName, apiKeyId, request.user_id]
                    );
                    console.log('Updated most recent wallet_provider for user:', request.user_id);
                } else {
                    // Insert new provider
                    await client.query(
                        `INSERT INTO wallet_providers (user_id, name, api_key_id, status)
                         VALUES ($1, $2, $3, true)`,
                        [request.user_id, organizationName, apiKeyId]
                    );
                    console.log('Created new wallet_provider for user:', request.user_id);
                }
            } else {
                // For data_consumers, check if consumer already exists for this user
                const existingConsumer = await client.query(
                    'SELECT id FROM data_consumers WHERE user_id = $1',
                    [request.user_id]
                );
                
                if (existingConsumer.rows.length > 0) {
                    // Update only the most recent consumer record for this user
                    await client.query(
                        `UPDATE data_consumers 
                         SET organization_name = $1, status = true
                         WHERE id = (
                             SELECT id FROM data_consumers 
                             WHERE user_id = $2 
                             ORDER BY created_at DESC 
                             LIMIT 1
                         )`,
                        [organizationName, request.user_id]
                    );
                    console.log('Updated most recent data_consumer for user:', request.user_id);
                } else {
                    // Insert new consumer
                    await client.query(
                        `INSERT INTO data_consumers (user_id, organization_name, status, created_at)
                         VALUES ($1, $2, true, CURRENT_TIMESTAMP)`,
                        [request.user_id, organizationName]
                    );
                    console.log('Created new data_consumer for user:', request.user_id);
                }
            }
        } else if (status === 'pending') {
            // If resetting to pending, we need to clean up any created API keys and related records
            // First, find and delete any API keys created for this user from this request
            const existingApiKeys = await client.query(
                `SELECT ak.id FROM api_keys ak 
                 WHERE ak.user_id = $1 AND ak.name = $2`,
                [request.user_id, request.organization_name]
            );
            
            for (const apiKey of existingApiKeys.rows) {
                // Delete related wallet_providers or data_consumers first
                await client.query('DELETE FROM wallet_providers WHERE api_key_id = $1', [apiKey.id]);
                await client.query('DELETE FROM data_consumers WHERE user_id = $1 AND organization_name = $2', 
                    [request.user_id, request.organization_name]);
                
                // Delete the API key
                await client.query('DELETE FROM api_keys WHERE id = $1', [apiKey.id]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: `Request ${status}` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing API key request:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint
        });
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    } finally {
        client.release();
    }
});

// Clean up duplicate API keys
router.post('/cleanup-duplicates', authenticateAdmin, async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query('BEGIN');

        // Find and remove duplicate API keys (keep the most recent one)
        const duplicateKeys = await client.query(`
            SELECT api_key, COUNT(*) as count, 
                   ARRAY_AGG(id ORDER BY created_at DESC) as ids
            FROM api_keys 
            GROUP BY api_key 
            HAVING COUNT(*) > 1
        `);

        let cleanedCount = 0;
        for (const duplicate of duplicateKeys.rows) {
            const ids = duplicate.ids;
            const keepId = ids[0]; // Keep the most recent (first in DESC order)
            const deleteIds = ids.slice(1); // Delete the rest

            for (const deleteId of deleteIds) {
                // Delete related records first
                await client.query('DELETE FROM wallet_providers WHERE api_key_id = $1', [deleteId]);
                
                // Delete the API key
                await client.query('DELETE FROM api_keys WHERE id = $1', [deleteId]);
                cleanedCount++;
            }
        }

        await client.query('COMMIT');
        res.json({ 
            message: `Cleaned up ${cleanedCount} duplicate API keys`,
            duplicatesFound: duplicateKeys.rows.length,
            keysRemoved: cleanedCount
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error cleaning up duplicates:', error);
        res.status(500).json({ error: 'Failed to clean up duplicates' });
    } finally {
        client.release();
    }
});

// Get admin dashboard statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const [locationsCount, providersCount, usersCount, apiCallsCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM wallet_locations WHERE location_enabled = true'),
            pool.query('SELECT COUNT(*) FROM users WHERE role = \'wallet_provider\''),
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'')
        ]);

        res.json({
            total_locations: parseInt(locationsCount.rows[0].count),
            total_providers: parseInt(providersCount.rows[0].count),
            total_users: parseInt(usersCount.rows[0].count),
            api_calls_24h: parseInt(apiCallsCount.rows[0].count)
        });
    } catch (error) {
        console.error('Error fetching admin statistics:', error);
        res.status(500).json({ error: 'Failed to fetch admin statistics' });
    }
});

// Create new user
router.post('/users', authenticateAdmin, async (req, res) => {
    try {
        const { email, first_name, last_name, organization, role, status } = req.body;
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Create user with a temporary password (user will need to reset it)
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        const result = await pool.query(
            `INSERT INTO users (email, password, first_name, last_name, organization, role, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             RETURNING id, email, first_name, last_name, organization, role, status`,
            [email, hashedPassword, first_name, last_name, organization, role, status]
        );
        
        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0],
            tempPassword: tempPassword // In production, this should be sent via email
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user details
router.patch('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, first_name, last_name, organization, role, status } = req.body;
        
        const result = await pool.query(
            `UPDATE users 
             SET email = $1, 
                 first_name = $2, 
                 last_name = $3, 
                 organization = $4, 
                 role = $5, 
                 status = $6
             WHERE id = $7 
             RETURNING *`,
            [email, first_name, last_name, organization, role, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Reset password endpoint
router.post('/users/:id/reset-password', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Implement your password reset logic here
        // This could involve generating a reset token and sending an email
        
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Add this PUT endpoint to handle user updates
router.put('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, role, status } = req.body;

        // Validate role against the enum type
        if (!['admin', 'sdf_employee', 'wallet_provider', 'data_consumer', 'nft_manager'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        const result = await pool.query(
            `UPDATE users 
             SET first_name = $1, 
                 last_name = $2, 
                 role = $3::user_role, 
                 status = $4
             WHERE id = $5
             RETURNING id, email, first_name, last_name, role, organization, status`,
            [first_name, last_name, role, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// Get all wallet locations
router.get('/wallet-locations', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                wl.*,
                wp.name as provider_name,
                wt.name as wallet_type
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wp.id = wl.wallet_provider_id
            JOIN wallet_types wt ON wt.id = wl.wallet_type_id
            WHERE wl.location_enabled = true
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Failed to fetch wallet locations' });
    }
});

/**
 * @swagger
 * /api/admin/market-analysis:
 *   get:
 *     summary: Get comprehensive market analysis for admin
 *     description: Provides detailed market analysis including NFT data for admin dashboard
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Analysis period in days
 *     responses:
 *       200:
 *         description: Market analysis completed
 */
router.get('/market-analysis', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        console.log('📊 Fetching comprehensive market analysis for admin...');
        console.log('📊 Analysis period:', days, 'days');
        console.log('📊 User ID:', req.user.id);
        
        // Get global statistics
        const globalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(DISTINCT public_key) as unique_wallets,
                COUNT(DISTINCT wallet_provider_id) as active_providers,
                COUNT(DISTINCT wallet_provider_id) as total_providers
            FROM wallet_locations
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${parseInt(days)} days'
        `);
        
        // Get NFT market overview
        const nftMarketOverview = await pool.query(`
            SELECT 
                COUNT(DISTINCT pn.id) as total_nfts,
                COUNT(DISTINCT pn.collection_id) as total_collections,
                COUNT(DISTINCT pn.pinned_by_user) as unique_nft_managers,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                COUNT(CASE WHEN pn.created_at > NOW() - INTERVAL '${parseInt(days)} days' THEN 1 END) as recent_nfts,
                AVG(pn.radius_meters) as avg_radius
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
        `);
        
        // Get provider market share
        const providerMarketShare = await pool.query(`
            SELECT 
                wp.id as provider_id,
                u.email as provider_name,
                COUNT(wl.id) as location_count,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                COUNT(CASE WHEN wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL THEN 1 END) as coverage_area,
                MAX(wl.last_updated) as last_activity
            FROM wallet_providers wp
            JOIN users u ON u.id = wp.user_id
            LEFT JOIN wallet_locations wl ON wl.wallet_provider_id = wp.id 
                AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
                AND wl.last_updated > NOW() - INTERVAL '${parseInt(days)} days'
            WHERE wp.status = true
            GROUP BY wp.id, u.email
            ORDER BY location_count DESC
            LIMIT 10
        `);
        
        // Get NFT collection performance
        const nftCollectionPerformance = await pool.query(`
            SELECT 
                nc.id as collection_id,
                nc.name as collection_name,
                nc.description,
                COUNT(pn.id) as nft_count,
                COUNT(CASE WHEN pn.is_active = true THEN 1 END) as active_nfts,
                AVG(pn.radius_meters) as avg_radius,
                MIN(pn.created_at) as first_nft,
                MAX(pn.created_at) as latest_nft,
                COUNT(DISTINCT pn.pinned_by_user) as unique_managers
            FROM nft_collections nc
            LEFT JOIN pinned_nfts pn ON pn.collection_id = nc.id
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY nc.id, nc.name, nc.description
            ORDER BY nft_count DESC
            LIMIT 15
        `);
        
        // Get NFT rarity distribution
        const nftRarityDistribution = await pool.query(`
            SELECT 
                pn.rarity_requirements->>'rarity_level' as rarity_level,
                COUNT(*) as count,
                CAST((COUNT(*)::FLOAT / (SELECT COUNT(*) FROM pinned_nfts WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days')) * 100 AS DECIMAL(10,2)) as percentage
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            AND pn.rarity_requirements->>'rarity_level' IS NOT NULL
            GROUP BY pn.rarity_requirements->>'rarity_level'
            ORDER BY count DESC
        `);
        
        // Get growth trends
        const growthTrends = await pool.query(`
            SELECT 
                DATE_TRUNC('day', last_updated) as date,
                COUNT(*) as daily_locations,
                COUNT(DISTINCT public_key) as daily_unique_wallets
            FROM wallet_locations
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            AND last_updated > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE_TRUNC('day', last_updated)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        // Get NFT activity trends
        const nftActivityTrends = await pool.query(`
            SELECT 
                DATE_TRUNC('day', pn.created_at) as date,
                COUNT(*) as daily_nfts,
                COUNT(DISTINCT pn.collection_id) as daily_collections,
                COUNT(DISTINCT pn.pinned_by_user) as daily_managers
            FROM pinned_nfts pn
            WHERE pn.created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE_TRUNC('day', pn.created_at)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        // Calculate market share percentages
        const totalLocations = parseInt(globalStats.rows[0]?.total_locations || 0);
        const providerData = providerMarketShare.rows.map(provider => ({
            ...provider,
            market_share_percent: totalLocations > 0 ? 
                ((parseInt(provider.location_count) / totalLocations) * 100).toFixed(2) : '0.00'
        }));
        
        console.log('✅ Admin market analysis completed successfully');
        
        res.json({
            global_statistics: {
                total_locations: totalLocations,
                unique_wallets: parseInt(globalStats.rows[0]?.unique_wallets || 0),
                active_providers: parseInt(globalStats.rows[0]?.active_providers || 0),
                total_providers: parseInt(globalStats.rows[0]?.total_providers || 0)
            },
            nft_market_overview: {
                total_nfts: parseInt(nftMarketOverview.rows[0]?.total_nfts || 0),
                total_collections: parseInt(nftMarketOverview.rows[0]?.total_collections || 0),
                unique_nft_managers: parseInt(nftMarketOverview.rows[0]?.unique_nft_managers || 0),
                active_nfts: parseInt(nftMarketOverview.rows[0]?.active_nfts || 0),
                recent_nfts: parseInt(nftMarketOverview.rows[0]?.recent_nfts || 0),
                avg_radius: parseFloat(nftMarketOverview.rows[0]?.avg_radius || 0)
            },
            provider_market_share: providerData,
            nft_collection_performance: nftCollectionPerformance.rows,
            nft_rarity_distribution: nftRarityDistribution.rows,
            growth_trends: growthTrends.rows,
            nft_activity_trends: nftActivityTrends.rows,
            analysis_period_days: parseInt(days)
        });
        
    } catch (error) {
        console.error('❌ Error getting admin market analysis:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get detailed wallet providers data
router.get('/wallet-providers-details', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                wp.id,
                wp.name,
                u.email as contact_email,
                wp.api_key_id,
                wp.created_at,
                COUNT(wl.id) as location_count
            FROM wallet_providers wp
            LEFT JOIN users u ON wp.user_id = u.id
            LEFT JOIN wallet_locations wl ON wp.id = wl.wallet_provider_id
            GROUP BY wp.id, wp.name, u.email, wp.api_key_id, wp.created_at
            ORDER BY wp.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM wallet_providers';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching wallet providers details:', error);
        res.status(500).json({ error: 'Failed to fetch wallet providers details' });
    }
});

// Get detailed users data
router.get('/users-details', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                id,
                email,
                first_name,
                last_name,
                role,
                created_at,
                updated_at,
                last_login,
                organization
            FROM users
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM users';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching users details:', error);
        res.status(500).json({ error: 'Failed to fetch users details' });
    }
});

// Get detailed API calls data
router.get('/api-calls-details', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                aul.id,
                aul.endpoint,
                aul.method,
                aul.status_code,
                aul.response_time,
                aul.created_at,
                aul.ip_address,
                aul.user_agent,
                aul.wallet_provider_id,
                aul.data_consumer_id,
                wp.name as provider_name,
                dc.email as consumer_email
            FROM api_usage_logs aul
            LEFT JOIN wallet_providers wp ON aul.wallet_provider_id = wp.id
            LEFT JOIN data_consumers dc ON aul.data_consumer_id = dc.id
            ORDER BY aul.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM api_usage_logs';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching API calls details:', error);
        res.status(500).json({ error: 'Failed to fetch API calls details' });
    }
});

// Get detailed locations data
router.get('/locations-details', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.description,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wp.name as provider_name,
                wt.name as wallet_type,
                wl.tracking_status
            FROM wallet_locations wl
            LEFT JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            LEFT JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            ORDER BY wl.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM wallet_locations';
        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching locations details:', error);
        res.status(500).json({ error: 'Failed to fetch locations details' });
    }
});

module.exports = router; 