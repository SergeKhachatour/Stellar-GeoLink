const express = require('express');
const { pool } = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');

const router = express.Router();

/**
 * @swagger
 * /api/ipfs/servers:
 *   get:
 *     summary: Get user's IPFS servers
 *     description: Retrieve all IPFS servers for the authenticated user
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: IPFS servers retrieved successfully
 */
router.get('/servers', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, server_name, server_url, server_type, 
                is_default, is_active, is_shared, shared_with_users,
                created_at, updated_at
            FROM ipfs_servers 
            WHERE user_id = $1 OR $1 = ANY(shared_with_users)
            ORDER BY is_default DESC, created_at DESC
        `, [req.user.id]);

        res.json({
            servers: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching IPFS servers:', error);
        res.status(500).json({ error: 'Failed to fetch IPFS servers' });
    }
});

/**
 * @swagger
 * /api/ipfs/servers:
 *   post:
 *     summary: Create a new IPFS server
 *     description: Create a new IPFS server configuration
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - server_name
 *               - server_url
 *               - server_type
 *             properties:
 *               server_name:
 *                 type: string
 *                 description: Name for the IPFS server
 *               server_url:
 *                 type: string
 *                 description: URL of the IPFS server
 *               server_type:
 *                 type: string
 *                 enum: [custom, pinata, infura, other]
 *                 description: Type of IPFS server
 *               api_key:
 *                 type: string
 *                 description: API key for managed services
 *               api_secret:
 *                 type: string
 *                 description: API secret for managed services
 *               is_default:
 *                 type: boolean
 *                 description: Set as default server
 *               is_shared:
 *                 type: boolean
 *                 description: Allow sharing with other users
 *               shared_with_users:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of user IDs to share with
 *     responses:
 *       201:
 *         description: IPFS server created successfully
 *       400:
 *         description: Invalid request data
 */
router.post('/servers', authenticateUser, async (req, res) => {
    try {
        const {
            server_name,
            server_url,
            server_type = 'custom',
            api_key,
            api_secret,
            is_default = false,
            is_shared = false,
            shared_with_users = []
        } = req.body;

        if (!server_name || !server_url) {
            return res.status(400).json({ error: 'Server name and URL are required' });
        }

        // If setting as default, unset other defaults
        if (is_default) {
            await pool.query(`
                UPDATE ipfs_servers 
                SET is_default = false 
                WHERE user_id = $1
            `, [req.user.id]);
        }

        const result = await pool.query(`
            INSERT INTO ipfs_servers (
                user_id, server_name, server_url, server_type,
                api_key, api_secret, is_default, is_active,
                is_shared, shared_with_users
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            req.user.id, server_name, server_url, server_type,
            api_key, api_secret, is_default, true,
            is_shared, shared_with_users
        ]);

        res.status(201).json({
            message: 'IPFS server created successfully',
            server: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating IPFS server:', error);
        res.status(500).json({ error: 'Failed to create IPFS server' });
    }
});

/**
 * @swagger
 * /api/ipfs/servers/{id}:
 *   put:
 *     summary: Update an IPFS server
 *     description: Update an existing IPFS server configuration
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: IPFS server ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               server_name:
 *                 type: string
 *               server_url:
 *                 type: string
 *               server_type:
 *                 type: string
 *               api_key:
 *                 type: string
 *               api_secret:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *               is_active:
 *                 type: boolean
 *               is_shared:
 *                 type: boolean
 *               shared_with_users:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: IPFS server updated successfully
 *       404:
 *         description: IPFS server not found
 */
router.put('/servers/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            server_name,
            server_url,
            server_type,
            api_key,
            api_secret,
            is_default,
            is_active,
            is_shared,
            shared_with_users
        } = req.body;

        // Check if server exists and belongs to user
        const serverCheck = await pool.query(`
            SELECT id FROM ipfs_servers 
            WHERE id = $1 AND (user_id = $2 OR $2 = ANY(shared_with_users))
        `, [id, req.user.id]);

        if (serverCheck.rows.length === 0) {
            return res.status(404).json({ error: 'IPFS server not found' });
        }

        // If setting as default, unset other defaults
        if (is_default) {
            await pool.query(`
                UPDATE ipfs_servers 
                SET is_default = false 
                WHERE user_id = $1 AND id != $2
            `, [req.user.id, id]);
        }

        const result = await pool.query(`
            UPDATE ipfs_servers 
            SET server_name = COALESCE($1, server_name),
                server_url = COALESCE($2, server_url),
                server_type = COALESCE($3, server_type),
                api_key = COALESCE($4, api_key),
                api_secret = COALESCE($5, api_secret),
                is_default = COALESCE($6, is_default),
                is_active = COALESCE($7, is_active),
                is_shared = COALESCE($8, is_shared),
                shared_with_users = COALESCE($9, shared_with_users),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *
        `, [
            server_name, server_url, server_type, api_key, api_secret,
            is_default, is_active, is_shared, shared_with_users, id
        ]);

        res.json({
            message: 'IPFS server updated successfully',
            server: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating IPFS server:', error);
        res.status(500).json({ error: 'Failed to update IPFS server' });
    }
});

/**
 * @swagger
 * /api/ipfs/servers/{id}:
 *   delete:
 *     summary: Delete an IPFS server
 *     description: Delete an IPFS server (only if not in use)
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: IPFS server ID
 *     responses:
 *       200:
 *         description: IPFS server deleted successfully
 *       400:
 *         description: Cannot delete server in use
 *       404:
 *         description: IPFS server not found
 */
router.delete('/servers/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if server exists and belongs to user
        const serverCheck = await pool.query(`
            SELECT id FROM ipfs_servers 
            WHERE id = $1 AND user_id = $2
        `, [id, req.user.id]);

        if (serverCheck.rows.length === 0) {
            return res.status(404).json({ error: 'IPFS server not found' });
        }

        // Check if server is in use
        const usageCheck = await pool.query(`
            SELECT COUNT(*) as count FROM pinned_nfts 
            WHERE ipfs_server_id = $1
        `, [id]);

        if (parseInt(usageCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete server that is currently in use' 
            });
        }

        await pool.query(`
            DELETE FROM ipfs_servers WHERE id = $1
        `, [id]);

        res.json({ message: 'IPFS server deleted successfully' });
    } catch (error) {
        console.error('Error deleting IPFS server:', error);
        res.status(500).json({ error: 'Failed to delete IPFS server' });
    }
});

/**
 * @swagger
 * /api/ipfs/uploads:
 *   get:
 *     summary: Get user's uploads
 *     description: Retrieve all file uploads for the authenticated user
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [uploaded, pinning, pinned, failed]
 *         description: Filter by upload status
 *     responses:
 *       200:
 *         description: Uploads retrieved successfully
 */
router.get('/uploads', authenticateUser, async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.id;

        let query = `
            SELECT nu.*, is.server_name, is.server_url
            FROM nft_uploads nu
            LEFT JOIN ipfs_servers is ON nu.ipfs_server_id = is.id
            WHERE nu.user_id = $1
        `;
        const params = [userId];

        if (status) {
            query += ' AND nu.upload_status = $2';
            params.push(status);
        }

        query += ' ORDER BY nu.created_at DESC';

        const result = await pool.query(query, params);

        res.json({
            uploads: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching uploads:', error);
        res.status(500).json({ error: 'Failed to fetch uploads' });
    }
});

/**
 * @swagger
 * /api/ipfs/pins:
 *   get:
 *     summary: Get user's IPFS pins
 *     description: Retrieve all IPFS pinning operations for the authenticated user
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, pinning, pinned, failed]
 *         description: Filter by pin status
 *     responses:
 *       200:
 *         description: Pins retrieved successfully
 */
router.get('/pins', authenticateUser, async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.id;

        let query = `
            SELECT ip.*, nu.original_filename, nu.file_path, is.server_name
            FROM ipfs_pins ip
            LEFT JOIN nft_uploads nu ON ip.nft_upload_id = nu.id
            LEFT JOIN ipfs_servers is ON ip.ipfs_server_id = is.id
            WHERE ip.user_id = $1
        `;
        const params = [userId];

        if (status) {
            query += ' AND ip.pin_status = $2';
            params.push(status);
        }

        query += ' ORDER BY ip.created_at DESC';

        const result = await pool.query(query, params);

        res.json({
            pins: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching pins:', error);
        res.status(500).json({ error: 'Failed to fetch pins' });
    }
});

module.exports = router;
