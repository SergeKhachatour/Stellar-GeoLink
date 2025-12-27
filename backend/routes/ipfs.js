const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../config/database');
const { authenticateUser, requireRole } = require('../middleware/authUser');

const router = express.Router();

// Configure multer for file uploads
// On Azure, use /home/uploads for writable storage, otherwise use local uploads folder
const getUploadDir = () => {
    // Check if we're on Azure (Linux Web App)
    const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
    if (isAzure) {
        // Azure: Use /home directory which is writable and persistent
        const azureDir = '/home/uploads/nft-files';
        console.log('🌐 [AZURE] Upload directory configured:', azureDir);
        console.log('🌐 [AZURE] Environment check:', {
            WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME,
            AZURE_WEBSITE_INSTANCE_ID: process.env.AZURE_WEBSITE_INSTANCE_ID,
            isAzure: true
        });
        return azureDir;
    }
    // Local development: Use relative path
    const localDir = path.join(__dirname, '../uploads/nft-files');
    console.log('💻 [LOCAL] Upload directory configured:', localDir);
    return localDir;
};

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const uploadDir = getUploadDir();
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            
            // Azure-specific logging
            if (isAzure) {
                console.log('🌐 [AZURE] 📁 Upload directory ready:', uploadDir);
                // Verify directory exists and is writable
                try {
                    const stats = await fs.stat(uploadDir);
                    console.log('🌐 [AZURE] ✅ Directory exists and is accessible');
                    console.log('🌐 [AZURE] Directory stats:', {
                        isDirectory: stats.isDirectory(),
                        mode: stats.mode.toString(8),
                        path: uploadDir
                    });
                } catch (statError) {
                    console.error('🌐 [AZURE] ❌ Cannot access directory:', statError);
                }
            } else {
                console.log('💻 [LOCAL] 📁 Upload directory ready:', uploadDir);
            }
            
            cb(null, uploadDir);
        } catch (error) {
            if (isAzure) {
                console.error('🌐 [AZURE] ❌ Error creating upload directory:', error);
                console.error('🌐 [AZURE] Error details:', {
                    message: error.message,
                    code: error.code,
                    path: uploadDir,
                    stack: error.stack
                });
            } else {
                console.error('💻 [LOCAL] ❌ Error creating upload directory:', error);
            }
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
        
        if (isAzure) {
            console.log('🌐 [AZURE] 📝 Generated filename:', filename);
            console.log('🌐 [AZURE] Original file info:', {
                originalname: file.originalname,
                mimetype: file.mimetype,
                fieldname: file.fieldname
            });
        } else {
            console.log('💻 [LOCAL] 📝 Generated filename:', filename);
        }
        
        cb(null, filename);
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
// Wrapper to handle multer errors
const handleUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            // Handle multer errors
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'File too large',
                    details: 'File size exceeds 10MB limit. Please upload a smaller file.'
                });
            }
            if (err.message && err.message.includes('Only image files')) {
                return res.status(400).json({ 
                    error: 'Invalid file type',
                    details: 'Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'
                });
            }
            return res.status(400).json({ 
                error: 'File upload error',
                details: err.message || 'File upload failed. Please check file type and size.'
            });
        }
        next();
    });
};

router.post('/upload', authenticateUser, handleUpload, async (req, res) => {
    const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
    const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
    
    try {
        console.log(`${logPrefix} 📤 File upload request received`);
        console.log(`${logPrefix} Request details:`, {
            userId: req.user?.id,
            hasFile: !!req.file,
            body: req.body,
            headers: {
                'content-type': req.headers['content-type'],
                'content-length': req.headers['content-length']
            }
        });
        
        if (!req.file) {
            console.error(`${logPrefix} ❌ No file in request`);
            return res.status(400).json({ 
                error: 'No file uploaded',
                details: 'Please select a file to upload.'
            });
        }

        const { ipfs_server_id } = req.body;
        const userId = req.user.id;
        
        console.log(`${logPrefix} 📄 File received:`, {
            originalname: req.file.originalname,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
            destination: req.file.destination,
            fieldname: req.file.fieldname
        });
        
        // Verify file exists on disk
        try {
            const fileStats = await fs.stat(req.file.path);
            console.log(`${logPrefix} ✅ File saved successfully to disk:`, {
                path: req.file.path,
                size: fileStats.size,
                isFile: fileStats.isFile(),
                created: fileStats.birthtime,
                modified: fileStats.mtime
            });
        } catch (statError) {
            console.error(`${logPrefix} ❌ File not found on disk after upload:`, {
                path: req.file.path,
                error: statError.message,
                code: statError.code
            });
        }

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
        console.log(`${logPrefix} 💾 Saving upload record to database...`);
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

        console.log(`${logPrefix} ✅ Upload record saved:`, {
            uploadId: result.rows[0].id,
            filePath: result.rows[0].file_path,
            fileSize: result.rows[0].file_size,
            uploadStatus: result.rows[0].upload_status,
            validationStatus: result.rows[0].validation_status
        });

        res.status(201).json({
            message: 'File uploaded successfully',
            upload: result.rows[0]
        });
    } catch (error) {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        console.error(`${logPrefix} ❌ Error uploading file:`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Handle specific error types
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large',
                details: 'File size exceeds 10MB limit. Please upload a smaller file.'
            });
        }
        
        if (error.message && error.message.includes('Only image files')) {
            return res.status(400).json({ 
                error: 'Invalid file type',
                details: 'Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to upload file',
            details: error.message || 'An unexpected error occurred'
        });
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
            SELECT nu.*, ips.server_name, ips.server_url
            FROM nft_uploads nu
            LEFT JOIN ipfs_servers ips ON nu.ipfs_server_id = ips.id
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
    const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
    const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
    
    try {
        const { uploadId } = req.params;
        const userId = req.user.id;

        console.log(`${logPrefix} 📌 Pin request received:`, {
            uploadId: uploadId,
            userId: userId,
            isAzure: isAzure
        });

        // Get upload details
        const uploadResult = await pool.query(`
            SELECT nu.*, ips.server_url, ips.server_type, ips.server_name, ips.api_key, ips.api_secret
            FROM nft_uploads nu
            LEFT JOIN ipfs_servers ips ON nu.ipfs_server_id = ips.id
            WHERE nu.id = $1 AND nu.user_id = $2
        `, [uploadId, userId]);

        if (uploadResult.rows.length === 0) {
            console.error(`${logPrefix} ❌ Upload not found:`, { uploadId, userId });
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadResult.rows[0];
        
        console.log(`${logPrefix} 📄 Upload record found:`, {
            uploadId: upload.id,
            filePath: upload.file_path,
            fileSize: upload.file_size,
            originalFilename: upload.original_filename,
            uploadStatus: upload.upload_status,
            validationStatus: upload.validation_status
        });
        
        // Verify file exists on disk
        if (upload.file_path) {
            try {
                const fileStats = await fs.stat(upload.file_path);
                console.log(`${logPrefix} ✅ File exists on disk:`, {
                    path: upload.file_path,
                    size: fileStats.size,
                    isFile: fileStats.isFile()
                });
            } catch (statError) {
                console.error(`${logPrefix} ❌ File not found on disk:`, {
                    path: upload.file_path,
                    error: statError.message,
                    code: statError.code
                });
            }
        }

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

        // Use actual IPFS pinning service
        const ipfsPinner = require('../utils/ipfsPinner');
        const pinRecordId = pinResult.rows[0].id; // Store the pin record ID before async operation

        // Pin file asynchronously
        (async () => {
            const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
            const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
            
            try {
                console.log(`${logPrefix} 📌 Starting IPFS pinning for upload:`, uploadId);
                console.log(`${logPrefix} 📁 File path:`, upload.file_path);
                console.log(`${logPrefix} 📝 Filename:`, upload.original_filename);
                console.log(`${logPrefix} 🔑 Has API key:`, !!upload.api_key);
                console.log(`${logPrefix} 🔐 Has API secret:`, !!upload.api_secret);
                console.log(`${logPrefix} 🌐 Server URL:`, upload.server_url);
                console.log(`${logPrefix} 📦 Server type:`, upload.server_type);
                
                const filePath = upload.file_path;
                const filename = upload.original_filename;
                
                // Verify file exists before pinning
                try {
                    const fileStats = await fs.stat(filePath);
                    console.log(`${logPrefix} ✅ File verified before pinning:`, {
                        path: filePath,
                        size: fileStats.size,
                        isFile: fileStats.isFile()
                    });
                } catch (statError) {
                    console.error(`${logPrefix} ❌ File not found before pinning:`, {
                        path: filePath,
                        error: statError.message,
                        code: statError.code
                    });
                    throw new Error(`File not found: ${filePath}`);
                }

                // Validate API credentials
                if (!upload.api_key || !upload.api_secret) {
                    throw new Error('Pinata API credentials are missing. Please configure your IPFS server with API key and secret.');
                }

                // Prepare server config for Pinata
                const serverConfig = {
                    api_key: upload.api_key,
                    api_secret: upload.api_secret,
                    server_url: upload.server_url,
                    server_type: upload.server_type,
                    server_name: upload.server_name || 'Pinata'
                };

                // Pin to IPFS using Pinata (expects file path, not buffer)
                const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
                const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
                
                console.log(`${logPrefix} 🚀 Calling Pinata API...`);
                const ipfsResult = await ipfsPinner.pinFile(serverConfig, filePath, filename);
                console.log(`${logPrefix} 📥 Pinata API response:`, ipfsResult);

                if (!ipfsResult.success) {
                    console.error(`${logPrefix} ❌ IPFS pinning failed:`, ipfsResult.error);
                    throw new Error(ipfsResult.error || 'IPFS pinning failed');
                }

                console.log(`${logPrefix} ✅ IPFS pinning successful:`, ipfsResult.ipfsHash);

                // Update pin record
                await pool.query(`
                    UPDATE ipfs_pins 
                    SET ipfs_hash = $1, pin_status = 'pinned', pin_date = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [ipfsResult.ipfsHash, pinRecordId]);

                // Update upload record
                await pool.query(`
                    UPDATE nft_uploads 
                    SET upload_status = 'pinned', ipfs_hash = $1
                    WHERE id = $2
                `, [ipfsResult.ipfsHash, uploadId]);

                console.log('✅ Database updated with IPFS hash:', ipfsResult.ipfsHash);
            } catch (error) {
                console.error('❌ Error pinning file to IPFS:', error);
                console.error('❌ Error stack:', error.stack);
                if (error.response) {
                    console.error('❌ Pinata API error response:', {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        data: error.response.data
                    });
                }
                
                const errorMessage = error.response?.data?.error 
                    ? `Pinata API Error: ${error.response.data.error}` 
                    : (error.message || 'IPFS pinning failed');
                
                // Update records with error status
                await pool.query(`
                    UPDATE ipfs_pins 
                    SET pin_status = 'failed', error_message = $1
                    WHERE id = $2
                `, [errorMessage, pinRecordId]);

                await pool.query(`
                    UPDATE nft_uploads 
                    SET upload_status = 'failed'
                    WHERE id = $1
                `, [uploadId]);
            }
        })();

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
            SELECT ip.*, nu.original_filename, nu.file_path, ips.server_name
            FROM ipfs_pins ip
            LEFT JOIN nft_uploads nu ON ip.nft_upload_id = nu.id
            LEFT JOIN ipfs_servers ips ON ip.ipfs_server_id = ips.id
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

/**
 * @swagger
 * /api/ipfs/files/{userId}/{filePath}:
 *   get:
 *     summary: Serve uploaded file
 *     description: Serve an uploaded file by user ID and file path
 *     tags: [IPFS Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: path
 *         name: filePath
 *         required: true
 *         schema:
 *           type: string
 *         description: File path (relative to upload directory)
 *     responses:
 *       200:
 *         description: File served successfully
 *       404:
 *         description: File not found
 */
// File serving route - use regex to match /files/:userId/... where ... is any path
// Express doesn't support * wildcards, so we use a regex pattern
router.get(/^\/files\/(\d+)\/(.+)$/, authenticateUser, async (req, res) => {
    const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
    const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
    
    try {
        // Extract userId and filePath from regex match groups
        const userIdParam = req.params[0]; // First capture group (userId)
        const filePath = req.params[1]; // Second capture group (file path)
        
        console.log(`${logPrefix} 📁 File serving request:`, { 
            userIdParam, 
            filePath, 
            reqPath: req.path,
            reqUrl: req.url,
            userFromAuth: req.user.id, 
            allParams: req.params,
            matchGroups: req.params,
            isAzure: isAzure
        });
        
        if (!filePath || filePath === '') {
            return res.status(400).json({ error: 'File path is required' });
        }
        
        // Verify user owns the file
        const userId = parseInt(userIdParam);
        if (userId !== req.user.id) {
            console.log('❌ Access denied - userId mismatch:', { requested: userId, authenticated: req.user.id });
            return res.status(403).json({ error: 'Access denied' });
        }

        // Construct full file path
        const uploadDir = getUploadDir();
        // filePath from wildcard could be:
        // 1. Full path: "/home/uploads/nft-files/file.png" -> use as-is
        // 2. Azure path without leading slash: "home/uploads/nft-files/file.png" -> add leading slash
        // 3. Relative path: "nft-files/file.png" -> join with uploadDir
        // 4. Just filename: "file.png" -> join with uploadDir
        let fullPath;
        
        // Handle Azure paths that might come without leading slash in URL
        if (filePath.startsWith('/')) {
            // Full absolute path - use as-is
            fullPath = filePath;
        } else if (filePath.startsWith('home/') && isAzure) {
            // Azure path without leading slash: "home/uploads/nft-files/file.png"
            // Add leading slash to make it "/home/uploads/nft-files/file.png"
            fullPath = '/' + filePath;
            console.log(`${logPrefix} 🔧 Fixed Azure path (added leading slash):`, { original: filePath, fixed: fullPath });
        } else if (filePath.startsWith(uploadDir)) {
            // Already contains upload directory - use as-is
            fullPath = filePath;
        } else {
            // Relative path - check if it starts with the upload dir name
            const uploadDirName = path.basename(uploadDir); // "nft-files"
            const uploadParentDir = path.dirname(uploadDir); // "/home/uploads" or "../uploads"
            
            // If path starts with upload dir structure, extract just the filename
            if (filePath.includes(uploadDirName)) {
                // Extract filename from path like "nft-files/file.png"
                const parts = filePath.split(path.sep);
                const filenameIndex = parts.indexOf(uploadDirName);
                if (filenameIndex >= 0 && filenameIndex < parts.length - 1) {
                    // Get everything after the upload dir name
                    const filename = parts.slice(filenameIndex + 1).join(path.sep);
                    fullPath = path.join(uploadDir, filename);
                } else {
                    // Fallback: just use the last part as filename
                    const filename = parts[parts.length - 1];
                    fullPath = path.join(uploadDir, filename);
                }
            } else {
                // Just a filename or relative path - join with uploadDir
                fullPath = path.join(uploadDir, filePath);
            }
        }
        
        console.log(`${logPrefix} 📁 Resolved file path:`, { uploadDir, filePath, fullPath, isAzure });
        
        // Security: Ensure the file is within the upload directory
        const resolvedPath = path.resolve(fullPath);
        const resolvedUploadDir = path.resolve(uploadDir);
        
        console.log(`${logPrefix} 🔒 Security check:`, {
            resolvedPath,
            resolvedUploadDir,
            pathStartsWith: resolvedPath.startsWith(resolvedUploadDir)
        });
        
        if (!resolvedPath.startsWith(resolvedUploadDir)) {
            console.error(`${logPrefix} ❌ Security check failed - path outside upload directory:`, { 
                resolvedPath, 
                resolvedUploadDir,
                fullPath,
                filePath
            });
            return res.status(403).json({ error: 'Invalid file path' });
        }

        // Check if file exists
        console.log(`${logPrefix} 🔍 Checking if file exists:`, fullPath);
        try {
            const fileStats = await fs.stat(fullPath);
            console.log(`${logPrefix} ✅ File found:`, {
                path: fullPath,
                size: fileStats.size,
                isFile: fileStats.isFile(),
                created: fileStats.birthtime,
                modified: fileStats.mtime
            });
            await fs.access(resolvedPath);
            console.log(`${logPrefix} ✅ File exists, serving:`, resolvedPath);
        } catch (error) {
            console.error(`${logPrefix} ❌ File not found:`, {
                path: resolvedPath,
                error: error.message,
                code: error.code,
                uploadDir: uploadDir,
                requestedPath: filePath
            });
            return res.status(404).json({ error: 'File not found', path: resolvedPath });
        }

        // Send file with proper content type
        console.log(`${logPrefix} 📤 Sending file to client:`, resolvedPath);
        res.sendFile(resolvedPath, (err) => {
            if (err) {
                console.error(`${logPrefix} ❌ Error sending file:`, {
                    path: resolvedPath,
                    error: err.message,
                    code: err.code
                });
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to serve file', details: err.message });
                }
            } else {
                console.log(`${logPrefix} ✅ File sent successfully:`, resolvedPath);
            }
        });
    } catch (error) {
        console.error(`${logPrefix} ❌ Error serving file:`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to serve file', details: error.message });
        }
    }
});

module.exports = router;
