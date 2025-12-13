const express = require('express');
const path = require('path');
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const fileStorage = require('../utils/fileStorage');
const ipfsPinner = require('../utils/ipfsPinner');
const fs = require('fs');

const router = express.Router();

// Helper function to ensure upload directory exists
const ensureUploadDir = (userId) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', userId.toString());
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
};

// Add the missing endpoints that the frontend expects
router.get('/servers', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Testing /servers endpoint...');
        
        // Test basic connection
        const connectionTest = await pool.query('SELECT 1 as test');
        console.log('✅ Database connection OK');
        
        // Check if ipfs_servers table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'ipfs_servers'
            );
        `);
        console.log('🔍 ipfs_servers table exists:', tableCheck.rows[0].exists);
        
        if (tableCheck.rows[0].exists) {
            // Get servers for this user
            const result = await pool.query(`
                SELECT 
                    id, server_name, server_url, server_type, 
                    api_key, api_secret, is_default, is_active, is_shared, shared_with_users,
                    created_at, updated_at
                FROM ipfs_servers 
                WHERE user_id = $1 OR $1 = ANY(shared_with_users)
                ORDER BY is_default DESC, created_at DESC
            `, [req.user.id]);
            
            console.log('👤 User servers found:', result.rows.length);
            
            res.json({
                servers: result.rows,
                count: result.rows.length
            });
        } else {
            res.status(500).json({ 
                error: 'ipfs_servers table does not exist',
                debug: 'Table not found'
            });
        }
        
    } catch (error) {
        console.error('❌ IPFS Servers Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

router.get('/uploads', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Fetching uploads for user:', req.user.id);
        
        // Get user's uploads with server information
        const result = await pool.query(`
            SELECT 
                u.id, u.user_id, u.original_filename, u.file_path, u.file_size, u.mime_type, 
                u.upload_status, u.validation_status, u.validation_errors, u.ipfs_hash,
                u.ipfs_server_id, u.created_at, u.updated_at,
                s.server_name, s.server_url, s.server_type
            FROM nft_uploads u
            LEFT JOIN ipfs_servers s ON u.ipfs_server_id = s.id
            WHERE u.user_id = $1
            ORDER BY u.created_at DESC
        `, [req.user.id]);
        
        console.log('✅ Found uploads:', result.rows.length);
        
        // Debug: Log the first upload to see the data structure
        if (result.rows.length > 0) {
            console.log('🔍 Sample upload data:', {
                id: result.rows[0].id,
                user_id: result.rows[0].user_id,
                ipfs_hash: result.rows[0].ipfs_hash,
                server_url: result.rows[0].server_url,
                file_path: result.rows[0].file_path
            });
        }
        
        res.json({
            uploads: result.rows,
            count: result.rows.length
        });
        
    } catch (error) {
        console.error('❌ IPFS Uploads Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Add POST endpoint for real file uploads with Pinata integration (base64 approach)
router.post('/upload', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Real file upload request...');
        
        const { filename, fileType, fileSize, fileData, ipfs_server_id } = req.body;
        
        if (!filename || !fileType || !fileSize || !fileData) {
            return res.status(400).json({
                error: 'Missing required fields: filename, fileType, fileSize, fileData'
            });
        }
        
        // Validate file type (only JPG, PNG, JPEG allowed)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(fileType)) {
            return res.status(400).json({
                error: 'Invalid file type. Only JPG, PNG, and JPEG files are allowed.'
            });
        }
        
        // Validate file size (max 5MB for base64 uploads)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (fileSize > maxSize) {
            return res.status(400).json({
                error: `File too large. Maximum size is 5MB (received: ${(fileSize / 1024 / 1024).toFixed(2)}MB).`
            });
        }
        
        console.log('🔍 File details:', { 
            filename, 
            fileType, 
            fileSize,
            ipfs_server_id 
        });
        
        // Get IPFS server configuration (must be Pinata)
        let serverConfig = null;
        if (ipfs_server_id) {
            const serverResult = await pool.query(`
                SELECT * FROM ipfs_servers 
                WHERE id = $1 AND user_id = $2 AND server_type = 'pinata'
            `, [ipfs_server_id, req.user.id]);
            
            if (serverResult.rows.length > 0) {
                serverConfig = serverResult.rows[0];
            } else {
                return res.status(400).json({
                    error: 'Invalid IPFS server or server is not Pinata type'
                });
            }
        } else {
            return res.status(400).json({
                error: 'IPFS server ID is required'
            });
        }
        
        // Validate Pinata credentials
        if (!serverConfig.api_key || !serverConfig.api_secret) {
            return res.status(400).json({
                error: 'Pinata API credentials are required'
            });
        }
        
        // Create upload directory
        const uploadDir = ensureUploadDir(req.user.id);
        const timestamp = Date.now();
        const filePath = path.join(uploadDir, `${timestamp}_${filename}`);
        
        // Convert base64 to file
        const base64Data = fileData.replace(/^data:image\/[a-z]+;base64,/, '');
        const fileBuffer = Buffer.from(base64Data, 'base64');
        
        // Write file to disk
        fs.writeFileSync(filePath, fileBuffer);
        
        console.log('📤 Uploading to Pinata with real API...');
        
        // Pin file to Pinata using real API
        const pinResult = await ipfsPinner.pinFile(serverConfig, filePath, filename);
        
        if (!pinResult.success) {
            // Clean up uploaded file if pinning fails
            try {
                fs.unlinkSync(filePath);
            } catch (cleanupError) {
                console.error('Failed to cleanup file:', cleanupError);
            }
            
            return res.status(500).json({
                error: 'Failed to pin file to Pinata',
                details: pinResult.error
            });
        }
        
        // Store upload record in database (store just filename for file_path)
        const fileName = `${timestamp}_${filename}`;
        const uploadResult = await pool.query(`
            INSERT INTO nft_uploads (user_id, original_filename, file_path, file_size, mime_type, upload_status, ipfs_hash, ipfs_server_id, validation_status)
            VALUES ($1, $2, $3, $4, $5, 'pinned', $6, $7, 'valid')
            RETURNING id
        `, [req.user.id, filename, fileName, fileSize, fileType, pinResult.ipfsHash, ipfs_server_id]);
        
        const uploadId = uploadResult.rows[0].id;
        
        // Record pinning operation
        await pool.query(`
            INSERT INTO ipfs_pins (user_id, nft_upload_id, ipfs_server_id, ipfs_hash, pin_status, pin_size, pin_date)
            VALUES ($1, $2, $3, $4, 'pinned', $5, $6)
        `, [req.user.id, uploadId, ipfs_server_id, pinResult.ipfsHash, pinResult.pinSize, pinResult.pinDate]);
        
        console.log('✅ File uploaded and pinned to Pinata successfully:', pinResult.ipfsHash);
        
        res.json({
            success: true,
            message: 'File uploaded and pinned to Pinata successfully',
            uploadId: uploadId,
            ipfsHash: pinResult.ipfsHash,
            serverUrl: serverConfig.server_url,
            pinataUrl: pinResult.pinataUrl
        });
        
    } catch (error) {
        console.error('❌ Error in file upload:', error);
        
        res.status(500).json({
            error: 'Internal server error during file upload',
            details: error.message
        });
    }
});

// Add POST endpoint for pinning files
router.post('/pin/:uploadId', authenticateUser, async (req, res) => {
    try {
        const { uploadId } = req.params;
        
        console.log('🔗 Pinning file to IPFS:', uploadId);
        
        // Get upload details
        const uploadResult = await pool.query(`
            SELECT u.*, s.* FROM nft_uploads u
            LEFT JOIN ipfs_servers s ON u.ipfs_server_id = s.id
            WHERE u.id = $1 AND u.user_id = $2
        `, [uploadId, req.user.id]);
        
        if (uploadResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Upload not found or not owned by user'
            });
        }
        
        const upload = uploadResult.rows[0];
        
        // Pin file to IPFS
        const pinResult = await ipfsPinner.pinFile(upload, upload.file_path, upload.original_filename);
        
        if (!pinResult.success) {
            return res.status(500).json({
                error: 'Failed to pin file to IPFS',
                details: pinResult.error
            });
        }
        
        // Update upload status
        await pool.query(`
            UPDATE nft_uploads 
            SET upload_status = 'pinned', ipfs_hash = $1, updated_at = NOW()
            WHERE id = $2
        `, [pinResult.ipfsHash, uploadId]);
        
        // Record pinning operation
        await pool.query(`
            INSERT INTO ipfs_pins (user_id, nft_upload_id, ipfs_server_id, ipfs_hash, pin_status, pin_size, pin_date)
            VALUES ($1, $2, $3, $4, 'pinned', $5, $6)
        `, [req.user.id, uploadId, upload.ipfs_server_id, pinResult.ipfsHash, pinResult.pinSize, pinResult.pinDate]);
        
        console.log('✅ File pinned to IPFS:', pinResult.ipfsHash);
        
        res.json({
            success: true,
            message: 'File pinned to IPFS successfully',
            ipfsHash: pinResult.ipfsHash,
            serverUrl: upload.server_url,
            pinSize: pinResult.pinSize
        });
        
    } catch (error) {
        console.error('❌ IPFS Pin Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Add DELETE endpoint for deleting uploads
router.delete('/uploads/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🗑️ Deleting upload:', id);
        
        // Get upload details
        const uploadResult = await pool.query(`
            SELECT * FROM nft_uploads WHERE id = $1 AND user_id = $2
        `, [id, req.user.id]);
        
        if (uploadResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Upload not found or not owned by user'
            });
        }
        
        const upload = uploadResult.rows[0];
        
        // Delete file from filesystem
        if (upload.file_path) {
            const fileResult = await fileStorage.deleteFile(upload.file_path);
            if (!fileResult.success) {
                console.warn('⚠️ Could not delete file from filesystem:', fileResult.error);
            }
        }
        
        // If file is pinned to IPFS, unpin it
        if (upload.ipfs_hash && upload.upload_status === 'pinned') {
            try {
                const serverResult = await pool.query(`
                    SELECT * FROM ipfs_servers WHERE id = $1
                `, [upload.ipfs_server_id]);
                
                if (serverResult.rows.length > 0) {
                    const serverConfig = serverResult.rows[0];
                    await ipfsPinner.unpinFile(serverConfig, upload.ipfs_hash);
                    console.log('🗑️ Unpinned from IPFS:', upload.ipfs_hash);
                }
            } catch (error) {
                console.warn('⚠️ Could not unpin from IPFS:', error.message);
            }
        }
        
        // Delete from database
        await pool.query(`
            DELETE FROM nft_uploads WHERE id = $1 AND user_id = $2
        `, [id, req.user.id]);
        
        // Delete related pin records
        await pool.query(`
            DELETE FROM ipfs_pins WHERE nft_upload_id = $1
        `, [id]);
        
        console.log('✅ Upload deleted successfully:', id);
        
        res.json({
            success: true,
            message: 'Upload deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Delete Upload Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Add GET endpoint for serving uploaded files
router.get('/files/:userId/:filename', async (req, res) => {
    try {
        const { userId, filename } = req.params;
        
        console.log('🔍 Serving file request:', { userId, filename });
        
        // Basic validation - ensure userId is a number
        if (!userId || isNaN(parseInt(userId))) {
            return res.status(400).json({
                error: 'Invalid user ID'
            });
        }
        
        const filePath = `uploads/${userId}/${filename}`;
        const fullPath = path.join(__dirname, '..', filePath);
        
        console.log('🔍 File paths:', { filePath, fullPath });
        
        // Check if file exists using fs directly
        if (!fs.existsSync(fullPath)) {
            console.log('❌ File not found at:', fullPath);
            return res.status(404).json({
                error: 'File not found'
            });
        }
        
        console.log('✅ File found, serving:', fullPath);
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'image/jpeg'); // Default to JPEG
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Send file
        res.sendFile(fullPath);
        
    } catch (error) {
        console.error('❌ File Serve Error:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Add POST endpoint for creating servers
router.post('/servers', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Creating new server...', req.body);
        
        const { server_name, server_url, server_type, api_key, api_secret, is_default, is_shared } = req.body;
        
        // Clean the server URL - remove any existing /ipfs/ path and trailing slashes
        let cleanServerUrl = server_url.replace(/\/ipfs\/.*$/, '').replace(/\/$/, '');
        
        // Ensure it has https:// protocol
        if (!cleanServerUrl.startsWith('http://') && !cleanServerUrl.startsWith('https://')) {
            cleanServerUrl = `https://${cleanServerUrl}`;
        }
        
        console.log('🔧 Cleaned server URL:', { original: server_url, cleaned: cleanServerUrl });
        
        // Insert new server
        const result = await pool.query(`
            INSERT INTO ipfs_servers (user_id, server_name, server_url, server_type, api_key, api_secret, is_default, is_active, is_shared, shared_with_users)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, ARRAY[]::integer[])
            RETURNING *
        `, [req.user.id, server_name, cleanServerUrl, server_type, api_key, api_secret, is_default || false, is_shared || false]);
        
        console.log('✅ Server created:', result.rows[0]);
        
        res.json({
            success: true,
            server: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ IPFS Create Server Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Add PUT endpoint for updating servers
router.put('/servers/:id', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Updating server:', req.params.id, req.body);
        console.log('🔍 User ID:', req.user.id);
        
        const { server_name, server_url, server_type, api_key, api_secret, is_default, is_shared } = req.body;
        
        // Clean the server URL - remove any existing /ipfs/ path and trailing slashes
        let cleanServerUrl = server_url;
        if (server_url) {
            cleanServerUrl = server_url.replace(/\/ipfs\/.*$/, '').replace(/\/$/, '');
            
            // Ensure it has https:// protocol
            if (!cleanServerUrl.startsWith('http://') && !cleanServerUrl.startsWith('https://')) {
                cleanServerUrl = `https://${cleanServerUrl}`;
            }
        }
        
        console.log('🔧 Cleaned server URL:', { original: server_url, cleaned: cleanServerUrl });
        console.log('🔍 Extracted fields:', { server_name, server_url: cleanServerUrl, server_type, api_key: api_key ? '***' : 'null', api_secret: api_secret ? '***' : 'null', is_default, is_shared });
        
        // Check if server belongs to user
        console.log('🔍 Checking server ownership...');
        const checkResult = await pool.query(`
            SELECT id FROM ipfs_servers WHERE id = $1 AND user_id = $2
        `, [req.params.id, req.user.id]);
        
        console.log('🔍 Ownership check result:', checkResult.rows.length, 'rows found');
        
        if (checkResult.rows.length === 0) {
            console.log('❌ Server not found or not owned by user');
            return res.status(404).json({
                error: 'Server not found or not owned by user'
            });
        }
        
        // Update the server
        console.log('🔍 Updating server with query...');
        const result = await pool.query(`
            UPDATE ipfs_servers 
            SET server_name = $1, server_url = $2, server_type = $3, api_key = $4, api_secret = $5, is_default = $6, is_shared = $7, updated_at = NOW()
            WHERE id = $8 AND user_id = $9
            RETURNING *
        `, [server_name, cleanServerUrl, server_type, api_key, api_secret, is_default || false, is_shared || false, req.params.id, req.user.id]);
        
        console.log('🔍 Update query executed, rows affected:', result.rowCount);
        
        console.log('✅ Server updated:', result.rows[0]);
        
        res.json({
            success: true,
            server: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ IPFS Update Server Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Add DELETE endpoint for deleting servers
router.delete('/servers/:id', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Deleting server:', req.params.id);
        
        // Check if server belongs to user
        const checkResult = await pool.query(`
            SELECT id FROM ipfs_servers WHERE id = $1 AND user_id = $2
        `, [req.params.id, req.user.id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Server not found or not owned by user'
            });
        }
        
        // Delete the server
        await pool.query(`
            DELETE FROM ipfs_servers WHERE id = $1 AND user_id = $2
        `, [req.params.id, req.user.id]);
        
        console.log('✅ Server deleted');
        
        res.json({
            success: true,
            message: 'Server deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ IPFS Delete Server Error:', error);
        res.status(500).json({
            error: error.message,
            debug: 'Database error'
        });
    }
});

// Debug endpoint to test database connection and table existence
router.get('/debug', authenticateUser, async (req, res) => {
    try {
        console.log('🔍 IPFS Debug - Testing database connection...');
        
        // Test basic connection
        const connectionTest = await pool.query('SELECT 1 as test');
        console.log('✅ Database connection OK');
        
        // Check if ipfs_servers table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'ipfs_servers'
            );
        `);
        console.log('🔍 ipfs_servers table exists:', tableCheck.rows[0].exists);
        
        if (tableCheck.rows[0].exists) {
            // Get table structure
            const tableStructure = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'ipfs_servers'
                ORDER BY ordinal_position;
            `);
            console.log('📋 ipfs_servers table structure:', tableStructure.rows);
            
            // Try to query the table
            const serverCount = await pool.query('SELECT COUNT(*) as count FROM ipfs_servers');
            console.log('📊 ipfs_servers count:', serverCount.rows[0].count);
            
            // Try to get servers for this user
            const userServers = await pool.query(`
                SELECT id, server_name, server_url, server_type, is_default, is_active
                FROM ipfs_servers 
                WHERE user_id = $1
                LIMIT 5
            `, [req.user.id]);
            console.log('👤 User servers:', userServers.rows);
            
            res.json({
                success: true,
                connection: 'OK',
                tableExists: true,
                tableStructure: tableStructure.rows,
                serverCount: parseInt(serverCount.rows[0].count),
                userServers: userServers.rows,
                userId: req.user.id
            });
        } else {
            res.json({
                success: false,
                connection: 'OK',
                tableExists: false,
                error: 'ipfs_servers table does not exist'
            });
        }
        
    } catch (error) {
        console.error('❌ IPFS Debug Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

module.exports = router;
