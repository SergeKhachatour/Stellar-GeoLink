const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../config/database');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/authUser');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/nft-files');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow only image files
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

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
 * /api/ipfs/upload:
 *   post:
 *     summary: Upload NFT file
 *     description: Upload a file for NFT pinning
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: NFT image file
 *               ipfs_server_id:
 *                 type: integer
 *                 description: IPFS server to use (optional, uses default if not provided)
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file or missing data
 */
router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { ipfs_server_id } = req.body;
        const userId = req.user.id;

        // Get IPFS server (default if not specified)
        let serverId = ipfs_server_id;
        if (!serverId) {
            const defaultServer = await pool.query(`
                SELECT id FROM ipfs_servers 
                WHERE user_id = $1 AND is_default = true AND is_active = true
                LIMIT 1
            `, [userId]);

            if (defaultServer.rows.length === 0) {
                return res.status(400).json({ 
                    error: 'No default IPFS server found. Please create one first.' 
                });
            }
            serverId = defaultServer.rows[0].id;
        }

        // Validate file
        const validationErrors = [];
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (req.file.size > maxSize) {
            validationErrors.push('File size exceeds 10MB limit');
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            validationErrors.push('Invalid file type. Only images are allowed.');
        }

        const validationStatus = validationErrors.length > 0 ? 'invalid' : 'valid';

        // Save upload record
        const result = await pool.query(`
            INSERT INTO nft_uploads (
                user_id, original_filename, file_path, file_size,
                mime_type, upload_status, ipfs_server_id,
                validation_status, validation_errors
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            userId, req.file.originalname, req.file.path, req.file.size,
            req.file.mimetype, 'uploaded', serverId,
            validationStatus, validationErrors
        ]);

        res.status(201).json({
            message: 'File uploaded successfully',
            upload: result.rows[0]
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
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
 * /api/ipfs/pin/{uploadId}:
 *   post:
 *     summary: Pin uploaded file to IPFS
 *     description: Pin an uploaded file to IPFS using the specified server
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Upload ID to pin
 *     responses:
 *       200:
 *         description: File pinned successfully
 *       400:
 *         description: Invalid upload or file not ready
 *       404:
 *         description: Upload not found
 */
router.post('/pin/:uploadId', authenticateUser, async (req, res) => {
    try {
        const { uploadId } = req.params;
        const userId = req.user.id;

        // Get upload details
        const uploadResult = await pool.query(`
            SELECT nu.*, is.server_url, is.server_type, is.api_key, is.api_secret
            FROM nft_uploads nu
            LEFT JOIN ipfs_servers is ON nu.ipfs_server_id = is.id
            WHERE nu.id = $1 AND nu.user_id = $2
        `, [uploadId, userId]);

        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadResult.rows[0];

        if (upload.validation_status !== 'valid') {
            return res.status(400).json({ 
                error: 'File validation failed. Cannot pin invalid files.' 
            });
        }

        if (upload.upload_status !== 'uploaded') {
            return res.status(400).json({ 
                error: 'File is already being processed or has been pinned' 
            });
        }

        // Update upload status
        await pool.query(`
            UPDATE nft_uploads 
            SET upload_status = 'pinning' 
            WHERE id = $1
        `, [uploadId]);

        // Create pin record
        const pinResult = await pool.query(`
            INSERT INTO ipfs_pins (
                user_id, nft_upload_id, ipfs_server_id, ipfs_hash, pin_status
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [userId, uploadId, upload.ipfs_server_id, 'pending', 'pending']);

        // TODO: Implement actual IPFS pinning logic here
        // This would involve calling the IPFS service API
        // For now, we'll simulate the process

        // Simulate IPFS pinning (replace with actual implementation)
        setTimeout(async () => {
            try {
                // Generate a mock IPFS hash (replace with actual IPFS pinning)
                const mockIpfsHash = 'Qm' + Math.random().toString(36).substring(2, 15);
                
                // Update pin record
                await pool.query(`
                    UPDATE ipfs_pins 
                    SET ipfs_hash = $1, pin_status = 'pinned', pin_date = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [mockIpfsHash, pinResult.rows[0].id]);

                // Update upload record
                await pool.query(`
                    UPDATE nft_uploads 
                    SET upload_status = 'pinned', ipfs_hash = $1
                    WHERE id = $2
                `, [mockIpfsHash, uploadId]);
            } catch (error) {
                console.error('Error in IPFS pinning simulation:', error);
                
                // Update records with error status
                await pool.query(`
                    UPDATE ipfs_pins 
                    SET pin_status = 'failed', error_message = $1
                    WHERE id = $2
                `, [error.message, pinResult.rows[0].id]);

                await pool.query(`
                    UPDATE nft_uploads 
                    SET upload_status = 'failed'
                    WHERE id = $1
                `, [uploadId]);
            }
        }, 2000); // Simulate 2-second processing time

        res.json({
            message: 'File pinning initiated',
            pin: pinResult.rows[0]
        });
    } catch (error) {
        console.error('Error pinning file:', error);
        res.status(500).json({ error: 'Failed to pin file' });
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
