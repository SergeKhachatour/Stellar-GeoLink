const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const contractIntrospection = require('../services/contractIntrospection');
const { extractPublicKeyFromSPKI, decodeDERSignature, normalizeECDSASignature } = require('../utils/webauthnUtils');

// Combined authentication: supports both JWT and API key (for Data Consumers and Wallet Providers)
const authenticateContractUser = async (req, res, next) => {
    // First try API key authentication
    const apiKey = req.header('X-API-Key');
    if (apiKey) {
        try {
            // Check wallet_providers
            const providerResult = await pool.query(
                `SELECT wp.id, wp.user_id FROM wallet_providers wp
                 JOIN api_keys ak ON ak.id = wp.api_key_id
                 WHERE ak.api_key = $1 AND wp.status = true`,
                [apiKey]
            );

            if (providerResult.rows.length > 0) {
                req.userId = providerResult.rows[0].user_id;
                req.userType = 'wallet_provider';
                req.user = { 
                    id: providerResult.rows[0].user_id,
                    role: 'wallet_provider'
                };
                return next();
            }

            // Check data_consumers
            const consumerResult = await pool.query(
                `SELECT dc.id, ak.user_id FROM data_consumers dc
                 JOIN api_keys ak ON ak.user_id = dc.user_id
                 WHERE ak.api_key = $1 AND dc.status = true`,
                [apiKey]
            );

            if (consumerResult.rows.length > 0) {
                req.userId = consumerResult.rows[0].user_id;
                req.userType = 'data_consumer';
                req.user = { 
                    id: consumerResult.rows[0].user_id,
                    role: 'data_consumer'
                };
                return next();
            }

            return res.status(401).json({ error: 'Invalid or inactive API key' });
        } catch (error) {
            console.error('API key authentication error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
    
    // If no API key, try JWT authentication
    return authenticateUser(req, res, (err) => {
        if (err) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
    });
};

// Configure multer for WASM file uploads
const getWasmUploadDir = () => {
    const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
    if (isAzure) {
        return '/home/uploads/contract-wasm';
    }
    return path.join(__dirname, '../uploads/contract-wasm');
};

const wasmStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = getWasmUploadDir();
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            console.log(`${logPrefix} ✅ WASM upload directory ready:`, uploadDir);
            cb(null, uploadDir);
        } catch (error) {
            console.error(`${logPrefix} ❌ Error creating WASM upload directory:`, {
                path: uploadDir,
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `wasm-${uniqueSuffix}${path.extname(file.originalname)}`;
        cb(null, filename);
    }
});

const wasmUpload = multer({
    storage: wasmStorage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for WASM files
    },
    fileFilter: (req, file, cb) => {
        // Allow only WASM files
        if (file.mimetype === 'application/wasm' || 
            file.mimetype === 'application/octet-stream' ||
            path.extname(file.originalname).toLowerCase() === '.wasm') {
            cb(null, true);
        } else {
            cb(new Error('Only WASM files are allowed'));
        }
    }
});

/**
 * @swagger
 * /api/contracts/upload-wasm:
 *   post:
 *     summary: Upload a WASM file for a contract
 *     description: Upload WASM files from StellarExpert or locally compiled contracts. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - wasm
 *             properties:
 *               wasm:
 *                 type: string
 *                 format: binary
 *                 description: WASM file to upload
 *               contract_address:
 *                 type: string
 *                 description: Optional - Link WASM to existing contract address
 *               wasm_source:
 *                 type: string
 *                 enum: [stellarexpert, local, manual]
 *                 description: Source of WASM file
 *     responses:
 *       200:
 *         description: WASM file uploaded successfully
 *       400:
 *         description: WASM file is required
 *       401:
 *         description: Authentication required
 */
router.post('/upload-wasm', authenticateContractUser, wasmUpload.single('wasm'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'WASM file is required' });
        }

        const userId = req.user?.id || req.userId;
        if (!userId) {
            // Clean up uploaded file
            if (req.file && req.file.path) {
                await fs.unlink(req.file.path).catch(() => {});
            }
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const { contract_address, wasm_source = 'local' } = req.body;

        // Calculate file hash
        const fileBuffer = await fs.readFile(req.file.path);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // If contract_address is provided, link the WASM to that contract
        let contractId = null;
        if (contract_address) {
            // Validate contract address format
            if (!/^[A-Z0-9]{56}$/.test(contract_address)) {
                // Clean up uploaded file
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(400).json({ error: 'Invalid contract address format' });
            }

            // Check if contract exists for this user
            const contractResult = await pool.query(
                `SELECT id FROM custom_contracts 
                 WHERE user_id = $1 AND contract_address = $2`,
                [userId, contract_address]
            );

            if (contractResult.rows.length > 0) {
                contractId = contractResult.rows[0].id;
            }
        }

        if (contractId) {
            // Update existing contract with WASM file info
            const result = await pool.query(
                `UPDATE custom_contracts
                 SET wasm_file_path = $1,
                     wasm_file_name = $2,
                     wasm_file_size = $3,
                     wasm_uploaded_at = CURRENT_TIMESTAMP,
                     wasm_source = $4,
                     wasm_hash = $5,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6 AND user_id = $7
                 RETURNING *`,
                [
                    req.file.path,
                    req.file.originalname,
                    req.file.size,
                    wasm_source,
                    hash,
                    contractId,
                    userId
                ]
            );

            res.json({
                success: true,
                wasm_file: {
                    path: req.file.path,
                    filename: req.file.originalname,
                    size: req.file.size,
                    hash: hash,
                    source: wasm_source
                },
                contract_id: contractId,
                message: 'WASM file uploaded and linked to contract'
            });
        } else {
            res.json({
                success: true,
                wasm_file: {
                    path: req.file.path,
                    filename: req.file.originalname,
                    size: req.file.size,
                    hash: hash,
                    source: wasm_source
                },
                message: 'WASM file uploaded. Use contract_address when creating/updating contract to link it.'
            });
        }
    } catch (error) {
        console.error('Error uploading WASM file:', error);
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(500).json({ error: 'Failed to upload WASM file', message: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/{id}/upload-wasm:
 *   post:
 *     summary: Upload WASM file for a specific contract by ID
 *     description: Upload WASM file and link it to a contract by contract ID. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - wasm
 *             properties:
 *               wasm:
 *                 type: string
 *                 format: binary
 *                 description: WASM file to upload
 *               wasm_source:
 *                 type: string
 *                 enum: [stellarexpert, local, manual]
 *                 description: Source of WASM file
 *     responses:
 *       200:
 *         description: WASM file uploaded successfully
 *       400:
 *         description: WASM file is required
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.post('/:id/upload-wasm', authenticateContractUser, wasmUpload.single('wasm'), async (req, res) => {
    try {
        const { id } = req.params;
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        
        if (!req.file) {
            console.error(`${logPrefix} ❌ WASM upload failed: No file received`);
            return res.status(400).json({ error: 'WASM file is required' });
        }
        
        console.log(`${logPrefix} 📤 WASM file received:`, {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            mimetype: req.file.mimetype
        });

        const userId = req.user?.id || req.userId;
        if (!userId) {
            // Clean up uploaded file
            if (req.file && req.file.path) {
                await fs.unlink(req.file.path).catch(() => {});
            }
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Verify contract exists and belongs to user
        const contractResult = await pool.query(
            `SELECT id, contract_address FROM custom_contracts 
             WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (contractResult.rows.length === 0) {
            // Clean up uploaded file
            if (req.file && req.file.path) {
                await fs.unlink(req.file.path).catch(() => {});
            }
            return res.status(404).json({ error: 'Contract not found' });
        }

        const { wasm_source = 'local' } = req.body;

        // Calculate file hash
        const fileBuffer = await fs.readFile(req.file.path);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Optional: Verify WASM matches deployed contract (if verify_wasm query param is true)
        let wasmVerification = null;
        if (req.query.verify_wasm === 'true') {
            try {
                const { contract_address, network } = contractResult.rows[0];
                
                // Get deployed contract WASM hash
                const deployedWasm = await contractIntrospection.getContractWasmHash(
                    contract_address,
                    network || 'testnet'
                );

                if (deployedWasm.hash) {
                    wasmVerification = {
                        verified: deployedWasm.hash === hash,
                        uploaded_hash: hash,
                        deployed_hash: deployedWasm.hash,
                        match: deployedWasm.hash === hash
                    };

                    if (!wasmVerification.verified) {
                        console.warn(`[WASM Upload] ⚠️  WASM hash mismatch for contract ${contract_address}`);
                        console.warn(`[WASM Upload]    Uploaded: ${hash.substring(0, 16)}...`);
                        console.warn(`[WASM Upload]    Deployed: ${deployedWasm.hash.substring(0, 16)}...`);
                    } else {
                        console.log(`[WASM Upload] ✅ WASM hash verified - matches deployed contract`);
                    }
                } else {
                    wasmVerification = {
                        verified: false,
                        error: deployedWasm.error || 'Could not fetch deployed contract WASM'
                    };
                }
            } catch (verifyError) {
                console.error('[WASM Upload] Error verifying WASM:', verifyError);
                wasmVerification = {
                    verified: false,
                    error: verifyError.message
                };
            }
        }

        // Update contract with WASM file info
        const result = await pool.query(
            `UPDATE custom_contracts
             SET wasm_file_path = $1,
                 wasm_file_name = $2,
                 wasm_file_size = $3,
                 wasm_uploaded_at = CURRENT_TIMESTAMP,
                 wasm_source = $4,
                 wasm_hash = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 AND user_id = $7
             RETURNING *`,
            [
                req.file.path,
                req.file.originalname,
                req.file.size,
                wasm_source,
                hash,
                id,
                userId
            ]
        );

        const response = {
            success: true,
            wasm_file: {
                path: req.file.path,
                filename: req.file.originalname,
                size: req.file.size,
                hash: hash,
                source: wasm_source
            },
            contract_id: id,
            message: 'WASM file uploaded and linked to contract'
        };

        // Include verification result if verification was requested
        if (wasmVerification) {
            response.wasm_verification = wasmVerification;
            if (!wasmVerification.verified && !wasmVerification.error) {
                response.warning = `WASM verification failed: ${wasmVerification.error}`;
            } else if (!wasmVerification.verified) {
                response.warning = 'Uploaded WASM does not match deployed contract. The WASM hash differs from the contract on the network.';
            }
        }

        res.json(response);
    } catch (error) {
        console.error('Error uploading WASM file:', error);
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(500).json({ error: 'Failed to upload WASM file', message: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/{id}/wasm:
 *   get:
 *     summary: Download WASM file for a contract
 *     description: Download the WASM file associated with a contract. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     responses:
 *       200:
 *         description: WASM file download
 *       404:
 *         description: WASM file not found
 *       401:
 *         description: Authentication required
 */
router.get('/:id/wasm', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const result = await pool.query(
            `SELECT wasm_file_path, wasm_file_name, wasm_hash
             FROM custom_contracts
             WHERE id = $1 AND user_id = $2 AND wasm_file_path IS NOT NULL`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'WASM file not found for this contract' });
        }

        const contract = result.rows[0];
        const wasmPath = contract.wasm_file_path;

        // Check if file exists
        try {
            await fs.access(wasmPath);
        } catch {
            return res.status(404).json({ error: 'WASM file not found on server' });
        }

        // Set headers for file download
        res.setHeader('Content-Type', 'application/wasm');
        res.setHeader('Content-Disposition', `attachment; filename="${contract.wasm_file_name || 'contract.wasm'}"`);
        
        // Send file
        const fileBuffer = await fs.readFile(wasmPath);
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error downloading WASM file:', error);
        res.status(500).json({ error: 'Failed to download WASM file', message: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/discover:
 *   post:
 *     summary: Discover functions in a custom contract
 *     description: Auto-discover available functions in a Soroban smart contract. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contract_address
 *             properties:
 *               contract_address:
 *                 type: string
 *                 pattern: '^[A-Z0-9]{56}$'
 *                 description: Stellar contract address (56 characters)
 *                 example: "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q"
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 default: testnet
 *                 description: Stellar network
 *     responses:
 *       200:
 *         description: Functions discovered successfully
 *       400:
 *         description: Invalid contract address format
 *       401:
 *         description: Authentication required
 */
router.post('/discover', authenticateContractUser, async (req, res) => {
    try {
        const { contract_address, network = 'testnet' } = req.body;

        if (!contract_address) {
            return res.status(400).json({ error: 'Contract address is required' });
        }

        // Validate contract address format
        if (!/^[A-Z0-9]{56}$/.test(contract_address)) {
            return res.status(400).json({ error: 'Invalid contract address format. Must be 56 characters, uppercase alphanumeric.' });
        }

        // First verify contract exists on the network
        const verification = await contractIntrospection.verifyContractExists(contract_address, network);
        if (!verification.exists) {
            return res.status(404).json({
                success: false,
                error: `Contract not found on ${network}`,
                message: verification.error || `The contract address ${contract_address} does not exist on ${network}. Please verify the address and network.`,
                contract_address,
                network
            });
        }

        // Discover functions using contract introspection service
        const discoveredFunctions = await contractIntrospection.discoverFunctions(contract_address, network);

        // Generate default function mappings and execution rules for discovered functions
        const functionMappings = {};
        const defaultRules = [];
        
        if (Array.isArray(discoveredFunctions) && discoveredFunctions.length > 0) {
            for (const func of discoveredFunctions) {
                if (func.discovered && func.name) {
                    // Create default function mapping with latitude/longitude mappings
                    const parameters = (func.parameters || []).map(param => ({
                        name: param.name || 'unknown',
                        type: param.type || 'unknown',
                        mapped_from: param.mapped_from || contractIntrospection.inferParameterMapping(
                            param.name || '', 
                            param.type || ''
                        )
                    }));
                    
                    functionMappings[func.name] = {
                        parameters: parameters,
                        return_type: func.return_type || 'void',
                        auto_execute: false,
                        requires_confirmation: true
                    };
                    
                    // Create default execution rule (disabled) for functions that might use location
                    // Only create rules for functions that have location-related parameters
                    const hasLocationParams = parameters.some(p => 
                        p.mapped_from === 'latitude' || p.mapped_from === 'longitude'
                    );
                    
                    if (hasLocationParams) {
                        defaultRules.push({
                            rule_name: `Auto-execute ${func.name} on location`,
                            function_name: func.name,
                            rule_type: 'location',
                            auto_execute: false, // Disabled by default
                            requires_confirmation: true,
                            trigger_on: 'enter',
                            is_active: false // Disabled until user enables
                        });
                    }
                }
            }
        }

        res.json({
            success: true,
            contract_address,
            network,
            verified: true,
            functions: discoveredFunctions,
            discovered_functions: discoveredFunctions, // Keep for backward compatibility
            discovered_count: Array.isArray(discoveredFunctions) ? discoveredFunctions.length : 0,
            default_function_mappings: functionMappings,
            default_rules: defaultRules
        });
    } catch (error) {
        console.error('Error discovering contract functions:', error);
        res.status(500).json({ 
            error: 'Failed to discover contract functions',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts:
 *   post:
 *     summary: Save custom contract configuration
 *     description: Create or update a custom contract configuration. Available to all roles via JWT or API key.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contract_address
 *             properties:
 *               contract_address:
 *                 type: string
 *                 pattern: '^[A-Z0-9]{56}$'
 *                 description: Stellar contract address
 *               contract_name:
 *                 type: string
 *                 description: Friendly name for the contract
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 default: testnet
 *               discovered_functions:
 *                 type: object
 *                 description: Discovered functions (from /discover endpoint)
 *               function_mappings:
 *                 type: object
 *                 description: Function parameter mappings
 *               use_smart_wallet:
 *                 type: boolean
 *                 default: false
 *               requires_webauthn:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Contract created successfully
 *       200:
 *         description: Contract updated successfully
 *       400:
 *         description: Invalid contract address format
 *       401:
 *         description: Authentication required
 */
router.post('/', authenticateContractUser, async (req, res) => {
    try {
        const {
            contract_address,
            contract_name,
            network = 'testnet',
            discovered_functions = {},
            function_mappings = {},
            use_smart_wallet = false,
            smart_wallet_contract_id = null,
            payment_function_name = null,
            requires_webauthn = false,
            webauthn_verifier_contract_id = null,
            wasm_file_path = null,
            wasm_file_name = null,
            wasm_file_size = null,
            wasm_source = null,
            wasm_hash = null
        } = req.body;

        if (!contract_address) {
            return res.status(400).json({ error: 'Contract address is required' });
        }

        // Validate contract address format
        if (!/^[A-Z0-9]{56}$/.test(contract_address)) {
            return res.status(400).json({ error: 'Invalid contract address format. Must be 56 characters, uppercase alphanumeric.' });
        }

        // Get user ID from either JWT or API key authentication
        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Normalize discovered_functions to object format (keyed by function name)
        let normalizedDiscoveredFunctions = discovered_functions;
        if (discovered_functions) {
            if (Array.isArray(discovered_functions)) {
                // Convert array to object keyed by function name
                normalizedDiscoveredFunctions = {};
                for (const func of discovered_functions) {
                    if (func && func.name) {
                        normalizedDiscoveredFunctions[func.name] = {
                            ...func,
                            // Ensure parameters array exists
                            parameters: Array.isArray(func.parameters) ? func.parameters : []
                        };
                    }
                }
                console.log(`[Contracts] Converted discovered_functions from array to object format (${Object.keys(normalizedDiscoveredFunctions).length} functions)`);
            } else if (typeof discovered_functions === 'object') {
                // Ensure it's an object keyed by function name (not just any object)
                // If it's already keyed by function name, keep it as is but ensure structure
                normalizedDiscoveredFunctions = {};
                for (const [key, func] of Object.entries(discovered_functions)) {
                    if (func && typeof func === 'object') {
                        normalizedDiscoveredFunctions[func.name || key] = {
                            ...func,
                            name: func.name || key,
                            // Ensure parameters array exists
                            parameters: Array.isArray(func.parameters) ? func.parameters : []
                        };
                    }
                }
            }
        }

        // Auto-generate function mappings if not provided or empty
        let finalFunctionMappings = function_mappings;
        if (!finalFunctionMappings || Object.keys(finalFunctionMappings).length === 0) {
            if (normalizedDiscoveredFunctions && Object.keys(normalizedDiscoveredFunctions).length > 0) {
                console.log('[Contracts] Auto-generating function mappings from discovered functions');
                finalFunctionMappings = {};
                
                // Convert discovered_functions to array format for processing
                const functionsArray = Object.keys(normalizedDiscoveredFunctions).map(funcName => ({
                    name: funcName,
                    ...normalizedDiscoveredFunctions[funcName]
                }));
                
                for (const func of functionsArray) {
                    if (func.name) {
                        const parameters = (func.parameters || []).map(param => ({
                            name: param.name || 'unknown',
                            type: param.type || 'unknown',
                            mapped_from: param.mapped_from || contractIntrospection.inferParameterMapping(
                                param.name || '', 
                                param.type || ''
                            )
                        }));
                        
                        finalFunctionMappings[func.name] = {
                            parameters: parameters,
                            return_type: func.return_type || 'void',
                            auto_execute: false,
                            requires_confirmation: true
                        };
                    }
                }
                console.log(`[Contracts] Generated mappings for ${Object.keys(finalFunctionMappings).length} functions`);
            }
        }

        // Check if contract already exists for this user
        const existingContract = await pool.query(
            `SELECT id FROM custom_contracts 
             WHERE user_id = $1 AND contract_address = $2`,
            [userId, contract_address]
        );

        let result;
        if (existingContract.rows.length > 0) {
            // Update existing contract
            result = await pool.query(
                `UPDATE custom_contracts
                 SET contract_name = COALESCE($1, contract_name),
                     network = COALESCE($2, network),
                     discovered_functions = COALESCE($3, discovered_functions),
                     function_mappings = COALESCE($4, function_mappings),
                     use_smart_wallet = COALESCE($5, use_smart_wallet),
                     smart_wallet_contract_id = COALESCE($6, smart_wallet_contract_id),
                     payment_function_name = COALESCE($7, payment_function_name),
                     requires_webauthn = COALESCE($8, requires_webauthn),
                     webauthn_verifier_contract_id = COALESCE($9, webauthn_verifier_contract_id),
                     wasm_file_path = COALESCE($10, wasm_file_path),
                     wasm_file_name = COALESCE($11, wasm_file_name),
                     wasm_file_size = COALESCE($12, wasm_file_size),
                     wasm_source = COALESCE($13, wasm_source),
                     wasm_hash = COALESCE($14, wasm_hash),
                     wasm_uploaded_at = CASE WHEN $10 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE wasm_uploaded_at END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $15 AND user_id = $16
                 RETURNING *`,
                [
                    contract_name, network,
                    JSON.stringify(normalizedDiscoveredFunctions),
                    JSON.stringify(finalFunctionMappings),
                    use_smart_wallet, smart_wallet_contract_id,
                    payment_function_name, requires_webauthn,
                    webauthn_verifier_contract_id,
                    wasm_file_path, wasm_file_name, wasm_file_size,
                    wasm_source, wasm_hash,
                    existingContract.rows[0].id,
                    userId
                ]
            );

            res.json({
                success: true,
                message: 'Contract updated successfully',
                contract: result.rows[0]
            });
        } else {
            // Insert new contract
            // Build INSERT query dynamically based on which WASM fields are provided
            const wasmFields = [];
            const wasmValues = [];
            let paramIndex = 1;
            
            const baseParams = [
                userId,
                contract_address,
                contract_name,
                network,
                JSON.stringify(normalizedDiscoveredFunctions),
                JSON.stringify(finalFunctionMappings),
                use_smart_wallet,
                smart_wallet_contract_id,
                payment_function_name,
                requires_webauthn,
                webauthn_verifier_contract_id
            ];
            
            const baseColumns = [
                'user_id', 'contract_address', 'contract_name', 'network', 
                'discovered_functions', 'function_mappings', 'use_smart_wallet', 
                'smart_wallet_contract_id', 'payment_function_name', 
                'requires_webauthn', 'webauthn_verifier_contract_id'
            ];
            
            paramIndex = baseParams.length + 1;
            
            if (wasm_file_path) {
                baseColumns.push('wasm_file_path');
                baseParams.push(wasm_file_path);
                paramIndex++;
            }
            if (wasm_file_name) {
                baseColumns.push('wasm_file_name');
                baseParams.push(wasm_file_name);
                paramIndex++;
            }
            if (wasm_file_size) {
                baseColumns.push('wasm_file_size');
                baseParams.push(wasm_file_size);
                paramIndex++;
            }
            if (wasm_source) {
                baseColumns.push('wasm_source');
                baseParams.push(wasm_source);
                paramIndex++;
            }
            if (wasm_hash) {
                baseColumns.push('wasm_hash');
                baseParams.push(wasm_hash);
                paramIndex++;
            }
            
            // Add wasm_uploaded_at if any WASM field is provided
            if (wasm_file_path || wasm_file_name || wasm_file_size || wasm_source || wasm_hash) {
                baseColumns.push('wasm_uploaded_at');
                baseParams.push(new Date());
            }
            
            const placeholders = baseParams.map((_, i) => `$${i + 1}`).join(', ');
            
            result = await pool.query(
                `INSERT INTO custom_contracts (${baseColumns.join(', ')})
                 VALUES (${placeholders})
                 RETURNING *`,
                baseParams
            );

            res.status(201).json({
                success: true,
                message: 'Contract created successfully',
                contract: result.rows[0]
            });
        }
    } catch (error) {
        console.error('Error saving contract:', error);
        res.status(500).json({ 
            error: 'Failed to save contract',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}:
 *   put:
 *     summary: Update a custom contract configuration
 *     description: Update an existing custom contract configuration. Available to all roles via JWT or API key.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contract_name:
 *                 type: string
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *               discovered_functions:
 *                 type: object
 *               function_mappings:
 *                 type: object
 *               use_smart_wallet:
 *                 type: boolean
 *               requires_webauthn:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Contract updated successfully
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.put('/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            contract_name,
            network,
            discovered_functions,
            function_mappings,
            use_smart_wallet = false,
            smart_wallet_contract_id = null,
            payment_function_name = null,
            requires_webauthn = false,
            webauthn_verifier_contract_id = null
        } = req.body;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Verify contract belongs to user
        const contractCheck = await pool.query(
            `SELECT id FROM custom_contracts WHERE id = $1 AND user_id = $2 AND is_active = true`,
            [id, userId]
        );
        
        if (contractCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found or not accessible' });
        }

        // Normalize discovered_functions to object format (keyed by function name) if provided
        let normalizedDiscoveredFunctions = discovered_functions;
        if (discovered_functions !== undefined && discovered_functions !== null) {
            if (Array.isArray(discovered_functions)) {
                // Convert array to object keyed by function name
                normalizedDiscoveredFunctions = {};
                for (const func of discovered_functions) {
                    if (func && func.name) {
                        normalizedDiscoveredFunctions[func.name] = {
                            ...func,
                            // Ensure parameters array exists
                            parameters: Array.isArray(func.parameters) ? func.parameters : []
                        };
                    }
                }
                console.log(`[Contracts PUT] Converted discovered_functions from array to object format (${Object.keys(normalizedDiscoveredFunctions).length} functions)`);
            } else if (typeof discovered_functions === 'object') {
                // Ensure it's an object keyed by function name
                normalizedDiscoveredFunctions = {};
                for (const [key, func] of Object.entries(discovered_functions)) {
                    if (func && typeof func === 'object') {
                        normalizedDiscoveredFunctions[func.name || key] = {
                            ...func,
                            name: func.name || key,
                            // Ensure parameters array exists
                            parameters: Array.isArray(func.parameters) ? func.parameters : []
                        };
                    }
                }
            }
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (contract_name !== undefined) {
            updates.push(`contract_name = $${paramIndex}`);
            params.push(contract_name);
            paramIndex++;
        }
        if (network !== undefined) {
            updates.push(`network = $${paramIndex}`);
            params.push(network);
            paramIndex++;
        }
        if (discovered_functions !== undefined) {
            updates.push(`discovered_functions = $${paramIndex}`);
            params.push(JSON.stringify(normalizedDiscoveredFunctions));
            paramIndex++;
        }
        if (function_mappings !== undefined) {
            updates.push(`function_mappings = $${paramIndex}`);
            params.push(JSON.stringify(function_mappings));
            paramIndex++;
        }
        if (use_smart_wallet !== undefined) {
            updates.push(`use_smart_wallet = $${paramIndex}`);
            params.push(use_smart_wallet);
            paramIndex++;
        }
        if (smart_wallet_contract_id !== undefined) {
            updates.push(`smart_wallet_contract_id = $${paramIndex}`);
            params.push(smart_wallet_contract_id);
            paramIndex++;
        }
        if (payment_function_name !== undefined) {
            updates.push(`payment_function_name = $${paramIndex}`);
            params.push(payment_function_name);
            paramIndex++;
        }
        if (requires_webauthn !== undefined) {
            updates.push(`requires_webauthn = $${paramIndex}`);
            params.push(requires_webauthn);
            paramIndex++;
        }
        if (webauthn_verifier_contract_id !== undefined) {
            updates.push(`webauthn_verifier_contract_id = $${paramIndex}`);
            params.push(webauthn_verifier_contract_id);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id, userId);

        const result = await pool.query(
            `UPDATE custom_contracts 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            params
        );

        res.json({
            success: true,
            message: 'Contract updated successfully',
            contract: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating contract:', error);
        res.status(500).json({ 
            error: 'Failed to update contract',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: Get user's custom contracts
 *     description: Retrieve all custom contracts for the authenticated user. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     responses:
 *       200:
 *         description: List of user's contracts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contracts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CustomContract'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Authentication required
 */
router.get('/', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by public_key if available (for multi-role users), otherwise by user_id
        let query, params;
        if (publicKey) {
            query = `SELECT cc.id, cc.contract_address, cc.contract_name, cc.network, 
                    cc.discovered_functions, cc.function_mappings, cc.use_smart_wallet,
                    cc.smart_wallet_contract_id, cc.payment_function_name, cc.requires_webauthn,
                    cc.webauthn_verifier_contract_id, 
                    cc.wasm_file_name, cc.wasm_file_size, cc.wasm_source, cc.wasm_hash, cc.wasm_uploaded_at,
                    cc.created_at, cc.updated_at, cc.is_active
             FROM custom_contracts cc
             JOIN users u ON cc.user_id = u.id
             WHERE u.public_key = $1 AND cc.is_active = true
             ORDER BY cc.created_at DESC`;
            params = [publicKey];
        } else {
            query = `SELECT id, contract_address, contract_name, network, 
                    discovered_functions, function_mappings, use_smart_wallet,
                    smart_wallet_contract_id, payment_function_name, requires_webauthn,
                    webauthn_verifier_contract_id, 
                    wasm_file_name, wasm_file_size, wasm_source, wasm_hash, wasm_uploaded_at,
                    created_at, updated_at, is_active
             FROM custom_contracts
             WHERE user_id = $1 AND is_active = true
             ORDER BY created_at DESC`;
            params = [userId];
        }

        const result = await pool.query(query, params);

        res.json({
            success: true,
            contracts: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching contracts:', error);
        res.status(500).json({ 
            error: 'Failed to fetch contracts',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules:
 *   post:
 *     summary: Create a new contract execution rule
 *     description: Create a location-based rule for automatically executing contract functions. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContractExecutionRule'
 *     responses:
 *       201:
 *         description: Rule created successfully
 *       400:
 *         description: Invalid rule configuration
 *       401:
 *         description: Authentication required
 */
router.post('/rules', authenticateContractUser, async (req, res) => {
    try {
        const {
            contract_id,
            rule_name,
            rule_type,
            center_latitude,
            center_longitude,
            radius_meters,
            geofence_id,
            function_name,
            function_parameters = {},
            trigger_on = 'enter',
            auto_execute = false,
            requires_confirmation = true,
            target_wallet_public_key = null,
            required_wallet_public_keys = null,
            minimum_wallet_count = null,
            quorum_type = 'any'
        } = req.body;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Validate required fields
        if (!contract_id || !rule_name || !function_name) {
            return res.status(400).json({ error: 'contract_id, rule_name, and function_name are required' });
        }

        // Validate rule type and location
        if (rule_type === 'location' || rule_type === 'proximity') {
            if (!center_latitude || !center_longitude || !radius_meters) {
                return res.status(400).json({ error: 'center_latitude, center_longitude, and radius_meters are required for location-based rules' });
            }
        } else if (rule_type === 'geofence') {
            if (!geofence_id) {
                return res.status(400).json({ error: 'geofence_id is required for geofence-based rules' });
            }
        }

        // Validate quorum configuration
        if (required_wallet_public_keys && Array.isArray(required_wallet_public_keys) && required_wallet_public_keys.length > 0) {
            if (!minimum_wallet_count || minimum_wallet_count <= 0) {
                return res.status(400).json({ error: 'minimum_wallet_count must be set when required_wallet_public_keys is provided' });
            }
            if (minimum_wallet_count > required_wallet_public_keys.length) {
                return res.status(400).json({ error: 'minimum_wallet_count cannot exceed the number of required wallets' });
            }
        }

        // Verify contract belongs to user
        const contractCheck = await pool.query(
            `SELECT id FROM custom_contracts WHERE id = $1 AND user_id = $2 AND is_active = true`,
            [contract_id, userId]
        );
        if (contractCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found or not accessible' });
        }

        const result = await pool.query(`
            INSERT INTO contract_execution_rules (
                user_id, contract_id, rule_name, rule_type,
                center_latitude, center_longitude, radius_meters, geofence_id,
                function_name, function_parameters, trigger_on,
                auto_execute, requires_confirmation, target_wallet_public_key,
                required_wallet_public_keys, minimum_wallet_count, quorum_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `, [
            userId, contract_id, rule_name, rule_type,
            center_latitude || null, center_longitude || null, radius_meters || null, geofence_id || null,
            function_name, JSON.stringify(function_parameters), trigger_on,
            auto_execute, requires_confirmation, target_wallet_public_key,
            required_wallet_public_keys ? JSON.stringify(required_wallet_public_keys) : null,
            minimum_wallet_count, quorum_type
        ]);

        res.status(201).json({
            success: true,
            rule: result.rows[0],
            message: 'Execution rule created successfully'
        });
    } catch (error) {
        console.error('Error creating execution rule:', error);
        res.status(500).json({ 
            error: 'Failed to create execution rule',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules:
 *   get:
 *     summary: Get user's contract execution rules
 *     description: Retrieve all execution rules for the authenticated user. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: query
 *         name: contract_id
 *         schema:
 *           type: integer
 *         description: Filter by contract ID
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of execution rules
 *       401:
 *         description: Authentication required
 */
router.get('/rules', authenticateContractUser, async (req, res) => {
    try {
        const { contract_id, is_active } = req.query;

        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by public_key if available (for multi-role users), otherwise by user_id
        // This matches the pattern used in the contracts GET endpoint for consistency
        let query, params, paramIndex;
        if (publicKey) {
            query = `
                SELECT cer.*, 
                       cc.contract_address, 
                       cc.contract_name,
                       g.name as geofence_name
                FROM contract_execution_rules cer
                LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                LEFT JOIN geofences g ON cer.geofence_id = g.id
                JOIN users u ON cer.user_id = u.id
                WHERE u.public_key = $1
            `;
            params = [publicKey];
            paramIndex = 2;
        } else {
            query = `
                SELECT cer.*, 
                       cc.contract_address, 
                       cc.contract_name,
                       g.name as geofence_name
                FROM contract_execution_rules cer
                LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                LEFT JOIN geofences g ON cer.geofence_id = g.id
                WHERE cer.user_id = $1
            `;
            params = [userId];
            paramIndex = 2;
        }

        if (contract_id) {
            query += ` AND cer.contract_id = $${paramIndex}`;
            params.push(contract_id);
            paramIndex++;
        }

        if (is_active !== undefined) {
            query += ` AND cer.is_active = $${paramIndex}`;
            params.push(is_active === 'true' || is_active === true);
            paramIndex++;
        }

        query += ` ORDER BY cer.created_at DESC`;

        const result = await pool.query(query, params);

        // Parse JSON fields safely
        const rules = result.rows.map(rule => {
            let functionParams = rule.function_parameters;
            let requiredWallets = rule.required_wallet_public_keys;
            
            try {
                if (typeof functionParams === 'string' && functionParams.trim()) {
                    functionParams = JSON.parse(functionParams);
                } else if (!functionParams) {
                    functionParams = {};
                }
            } catch (e) {
                console.warn('Error parsing function_parameters:', e);
                functionParams = {};
            }
            
            try {
                if (typeof requiredWallets === 'string' && requiredWallets.trim()) {
                    requiredWallets = JSON.parse(requiredWallets);
                } else if (Array.isArray(requiredWallets)) {
                    // Already an array, keep it
                } else if (!requiredWallets) {
                    requiredWallets = null;
                }
            } catch (e) {
                console.warn('Error parsing required_wallet_public_keys:', e);
                requiredWallets = null;
            }
            
            return {
                ...rule,
                function_parameters: functionParams,
                required_wallet_public_keys: requiredWallets
            };
        });

        res.json({
            success: true,
            rules: rules,
            count: rules.length
        });
    } catch (error) {
        console.error('Error fetching contract execution rules:', error);
        res.status(500).json({ 
            error: 'Failed to fetch contract execution rules',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/{id}:
 *   get:
 *     summary: Get a specific contract execution rule
 *     description: Retrieve details of a specific execution rule. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rule ID
 *     responses:
 *       200:
 *         description: Rule details
 *       404:
 *         description: Rule not found
 *       401:
 *         description: Authentication required
 */

// Get pending rules that require WebAuthn authentication
// These are rules that matched location but were skipped due to WebAuthn requirement
// IMPORTANT: This route must come BEFORE /rules/:id to avoid route conflicts
router.get('/rules/pending', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        const { limit = 50 } = req.query;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Get user ID from public_key if needed
        let actualUserId = userId;
        if (!actualUserId && publicKey) {
            const userResult = await pool.query(
                'SELECT id FROM users WHERE public_key = $1',
                [publicKey]
            );
            if (userResult.rows.length > 0) {
                actualUserId = userResult.rows[0].id;
            }
        }

        if (!actualUserId) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Query location_update_queue for updates with skipped rules (requires_webauthn)
        // Join with contract_execution_rules to get rule details
        // Use JSONB operators to check for skipped rules with requires_webauthn reason
        const query = `
            SELECT DISTINCT ON (cer.id)
                cer.id as rule_id,
                cer.rule_name,
                cer.function_name,
                cer.function_parameters,
                cc.function_mappings,
                cer.contract_id,
                cc.contract_name,
                cc.contract_address,
                cc.requires_webauthn,
                luq.id as update_id,
                luq.public_key,
                luq.latitude,
                luq.longitude,
                luq.received_at,
                luq.processed_at,
                luq.execution_results
            FROM location_update_queue luq
            JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
            JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE luq.user_id = $1
                AND luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND EXISTS (
                    SELECT 1 
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE result->>'skipped' = 'true'
                    AND result->>'reason' = 'requires_webauthn'
                    AND (result->>'rule_id')::integer = cer.id
                )
            ORDER BY cer.id, luq.received_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [actualUserId, parseInt(limit)]);
        
        console.log(`[PendingRules] Query returned ${result.rows.length} row(s) for user_id ${actualUserId}`);

        // Process results to extract skipped rules
        const pendingRules = [];
        const processedRuleIds = new Set();

        for (const row of result.rows) {
            if (processedRuleIds.has(row.rule_id)) continue;
            processedRuleIds.add(row.rule_id);

            // Parse execution_results to find the skipped rule
            let executionResults = [];
            try {
                executionResults = typeof row.execution_results === 'string'
                    ? JSON.parse(row.execution_results)
                    : row.execution_results || [];
            } catch (e) {
                console.error('Error parsing execution_results:', e);
                continue;
            }

            const skippedResult = executionResults.find(r => 
                r.rule_id === row.rule_id && 
                r.skipped === true && 
                r.reason === 'requires_webauthn'
            );

            if (skippedResult) {
                // Parse function_parameters from rule
                let functionParams = {};
                try {
                    functionParams = typeof row.function_parameters === 'string'
                        ? JSON.parse(row.function_parameters)
                        : row.function_parameters || {};
                } catch (e) {
                    console.error('[PendingRules] Error parsing function_parameters:', e);
                    functionParams = {};
                }

                // Get function mappings to populate parameters with matched data
                let functionMappings = {};
                try {
                    // Use function_mappings from the query result (already joined)
                    if (row.function_mappings) {
                        functionMappings = typeof row.function_mappings === 'string'
                            ? JSON.parse(row.function_mappings)
                            : row.function_mappings || {};
                    }
                } catch (e) {
                    console.error('[PendingRules] Error parsing function_mappings:', e);
                }

                // Populate parameters with matched data
                const mapping = functionMappings?.[row.function_name];
                const populatedParams = { ...functionParams };
                
                if (mapping?.parameters) {
                    for (const param of mapping.parameters) {
                        if (param.mapped_from === 'latitude') {
                            populatedParams[param.name] = parseFloat(row.latitude);
                        } else if (param.mapped_from === 'longitude') {
                            populatedParams[param.name] = parseFloat(row.longitude);
                        } else if (param.mapped_from === 'user_public_key') {
                            // Use the matched wallet's public key (from location_update_queue)
                            populatedParams[param.name] = row.public_key || skippedResult.matched_public_key || '';
                        }
                    }
                } else {
                    // Fallback: try to infer common parameter names
                    // If destination/recipient/to exists but is empty, populate with matched public key
                    const destinationKeys = ['destination', 'recipient', 'to', 'to_address', 'destination_address'];
                    const matchedPublicKey = row.public_key || skippedResult.matched_public_key;
                    
                    if (matchedPublicKey) {
                        for (const key of destinationKeys) {
                            if (populatedParams.hasOwnProperty(key) && (!populatedParams[key] || populatedParams[key] === '')) {
                                populatedParams[key] = matchedPublicKey;
                                break;
                            }
                        }
                    }
                    
                    // Populate latitude/longitude if parameters exist
                    if (populatedParams.hasOwnProperty('latitude') && (!populatedParams.latitude || populatedParams.latitude === 0)) {
                        populatedParams.latitude = parseFloat(row.latitude);
                    }
                    if (populatedParams.hasOwnProperty('longitude') && (!populatedParams.longitude || populatedParams.longitude === 0)) {
                        populatedParams.longitude = parseFloat(row.longitude);
                    }
                }

                pendingRules.push({
                    rule_id: row.rule_id,
                    rule_name: row.rule_name,
                    function_name: row.function_name,
                    function_parameters: populatedParams, // Use populated parameters
                    contract_id: row.contract_id,
                    contract_name: row.contract_name,
                    contract_address: row.contract_address,
                    requires_webauthn: row.requires_webauthn,
                    matched_at: row.received_at,
                    matched_public_key: row.public_key || skippedResult.matched_public_key, // Include matched public key
                    location: {
                        latitude: parseFloat(row.latitude),
                        longitude: parseFloat(row.longitude)
                    },
                    message: skippedResult.message || 'Rule matched but requires WebAuthn/passkey authentication. Please execute manually via browser UI.'
                });
            }
        }

        res.json({
            success: true,
            pending_rules: pendingRules,
            count: pendingRules.length
        });
    } catch (error) {
        console.error('Error fetching pending rules:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

router.get('/rules/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;

        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by public_key if available (for multi-role users), otherwise by user_id
        let result;
        if (publicKey) {
            result = await pool.query(
                `SELECT cer.*, 
                        cc.contract_address, 
                        cc.contract_name,
                        g.name as geofence_name
                 FROM contract_execution_rules cer
                 LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                 LEFT JOIN geofences g ON cer.geofence_id = g.id
                 JOIN users u ON cer.user_id = u.id
                 WHERE cer.id = $1 AND u.public_key = $2`,
                [id, publicKey]
            );
        } else {
            result = await pool.query(
                `SELECT cer.*, 
                        cc.contract_address, 
                        cc.contract_name,
                        g.name as geofence_name
                 FROM contract_execution_rules cer
                 LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                 LEFT JOIN geofences g ON cer.geofence_id = g.id
                 WHERE cer.id = $1 AND cer.user_id = $2`,
                [id, userId]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        const rule = result.rows[0];
        rule.function_parameters = typeof rule.function_parameters === 'string'
            ? JSON.parse(rule.function_parameters)
            : rule.function_parameters;
        rule.required_wallet_public_keys = typeof rule.required_wallet_public_keys === 'string'
            ? JSON.parse(rule.required_wallet_public_keys)
            : rule.required_wallet_public_keys;

        res.json({
            success: true,
            rule: rule
        });
    } catch (error) {
        console.error('Error fetching contract execution rule:', error);
        res.status(500).json({ 
            error: 'Failed to fetch contract execution rule',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/{id}/quorum:
 *   get:
 *     summary: Check quorum status for a rule
 *     description: Check if the quorum requirement is met for a contract execution rule. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rule ID
 *     responses:
 *       200:
 *         description: Quorum status
 *       404:
 *         description: Rule not found
 *       401:
 *         description: Authentication required
 */
router.get('/rules/:id/quorum', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        
        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Verify rule belongs to user (filter by public_key if available for multi-role users)
        const publicKey = req.user?.public_key;
        let ruleCheck;
        if (publicKey) {
            ruleCheck = await pool.query(
                `SELECT cer.id, cer.required_wallet_public_keys 
                 FROM contract_execution_rules cer
                 JOIN users u ON cer.user_id = u.id
                 WHERE cer.id = $1 AND u.public_key = $2`,
                [id, publicKey]
            );
        } else {
            ruleCheck = await pool.query(
                `SELECT id, required_wallet_public_keys FROM contract_execution_rules 
                 WHERE id = $1 AND user_id = $2`,
                [id, userId]
            );
        }

        if (ruleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        const rule = ruleCheck.rows[0];

        // If no quorum requirement, return early
        if (!rule.required_wallet_public_keys || (typeof rule.required_wallet_public_keys === 'string' ? JSON.parse(rule.required_wallet_public_keys).length === 0 : rule.required_wallet_public_keys.length === 0)) {
            return res.json({
                quorum_met: true,
                wallets_in_range: [],
                wallets_out_of_range: [],
                count_in_range: 0,
                minimum_required: 0,
                message: 'No quorum requirement for this rule'
            });
        }

        // Check quorum status
        const quorumResult = await pool.query(
            `SELECT * FROM validate_quorum_for_rule($1)`,
            [id]
        );

        if (quorumResult.rows.length === 0) {
            return res.status(500).json({ error: 'Failed to validate quorum' });
        }

        const quorum = quorumResult.rows[0];

        res.json({
            quorum_met: quorum.quorum_met,
            wallets_in_range: quorum.wallets_in_range || [],
            wallets_out_of_range: quorum.wallets_out_of_range || [],
            count_in_range: quorum.count_in_range,
            minimum_required: quorum.minimum_required,
            message: quorum.quorum_met
                ? `Quorum met: ${quorum.count_in_range} of ${quorum.minimum_required} required wallets are in range`
                : `Quorum not met: ${quorum.count_in_range} of ${quorum.minimum_required} required wallets are in range. Missing: ${(quorum.wallets_out_of_range || []).join(', ')}`
        });
    } catch (error) {
        console.error('Error checking quorum status:', error);
        res.status(500).json({ 
            error: 'Failed to check quorum status',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/{id}:
 *   put:
 *     summary: Update a contract execution rule
 *     description: Update an existing execution rule. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rule ID
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *       404:
 *         description: Rule not found
 *       401:
 *         description: Authentication required
 */
router.put('/rules/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            contract_id,
            rule_name,
            rule_type,
            center_latitude,
            center_longitude,
            radius_meters,
            function_name,
            function_parameters,
            trigger_on,
            auto_execute,
            requires_confirmation,
            is_active,
            target_wallet_public_key,
            required_wallet_public_keys,
            minimum_wallet_count,
            quorum_type
        } = req.body;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Verify rule belongs to user (filter by public_key if available for multi-role users)
        const publicKey = req.user?.public_key;
        let ruleCheck;
        if (publicKey) {
            ruleCheck = await pool.query(
                `SELECT cer.id 
                 FROM contract_execution_rules cer
                 JOIN users u ON cer.user_id = u.id
                 WHERE cer.id = $1 AND u.public_key = $2`,
                [id, publicKey]
            );
        } else {
            ruleCheck = await pool.query(
                `SELECT id FROM contract_execution_rules 
                 WHERE id = $1 AND user_id = $2`,
                [id, userId]
            );
        }

        if (ruleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (contract_id !== undefined) {
            updates.push(`contract_id = $${paramIndex}`);
            params.push(contract_id);
            paramIndex++;
        }

        if (rule_name !== undefined) {
            updates.push(`rule_name = $${paramIndex}`);
            params.push(rule_name);
            paramIndex++;
        }

        if (rule_type !== undefined) {
            updates.push(`rule_type = $${paramIndex}`);
            params.push(rule_type);
            paramIndex++;
        }

        if (center_latitude !== undefined) {
            updates.push(`center_latitude = $${paramIndex}`);
            params.push(center_latitude || null);
            paramIndex++;
        }

        if (center_longitude !== undefined) {
            updates.push(`center_longitude = $${paramIndex}`);
            params.push(center_longitude || null);
            paramIndex++;
        }

        if (radius_meters !== undefined) {
            updates.push(`radius_meters = $${paramIndex}`);
            params.push(radius_meters || null);
            paramIndex++;
        }

        if (function_name !== undefined) {
            updates.push(`function_name = $${paramIndex}`);
            params.push(function_name);
            paramIndex++;
        }

        if (function_parameters !== undefined) {
            updates.push(`function_parameters = $${paramIndex}`);
            params.push(function_parameters ? JSON.stringify(function_parameters) : null);
            paramIndex++;
        }

        if (trigger_on !== undefined) {
            updates.push(`trigger_on = $${paramIndex}`);
            params.push(trigger_on);
            paramIndex++;
        }

        if (auto_execute !== undefined) {
            updates.push(`auto_execute = $${paramIndex}`);
            params.push(auto_execute);
            paramIndex++;
        }

        if (requires_confirmation !== undefined) {
            updates.push(`requires_confirmation = $${paramIndex}`);
            params.push(requires_confirmation);
            paramIndex++;
        }

        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex}`);
            params.push(is_active);
            paramIndex++;
        }

        if (target_wallet_public_key !== undefined) {
            updates.push(`target_wallet_public_key = $${paramIndex}`);
            params.push(target_wallet_public_key || null);
            paramIndex++;
        }

        if (required_wallet_public_keys !== undefined) {
            updates.push(`required_wallet_public_keys = $${paramIndex}`);
            params.push(required_wallet_public_keys ? JSON.stringify(required_wallet_public_keys) : null);
            paramIndex++;
        }

        if (minimum_wallet_count !== undefined) {
            updates.push(`minimum_wallet_count = $${paramIndex}`);
            params.push(minimum_wallet_count || null);
            paramIndex++;
        }

        if (quorum_type !== undefined) {
            updates.push(`quorum_type = $${paramIndex}`);
            params.push(quorum_type);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        
        // Filter by public_key if available (for multi-role users), otherwise by user_id
        // Note: publicKey is already declared above in the ruleCheck section (line 1702)
        let result;
        if (publicKey) {
            params.push(id, publicKey);
            result = await pool.query(
                `UPDATE contract_execution_rules cer
                 SET ${updates.join(', ')}
                 FROM users u
                 WHERE cer.id = $${paramIndex} 
                     AND cer.user_id = u.id
                     AND u.public_key = $${paramIndex + 1}
                 RETURNING cer.*`,
                params
            );
        } else {
            params.push(id, userId);
            result = await pool.query(
                `UPDATE contract_execution_rules
                 SET ${updates.join(', ')}
                 WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                 RETURNING *`,
                params
            );
        }

        const rule = result.rows[0];
        rule.function_parameters = typeof rule.function_parameters === 'string'
            ? JSON.parse(rule.function_parameters)
            : rule.function_parameters;
        rule.required_wallet_public_keys = typeof rule.required_wallet_public_keys === 'string'
            ? JSON.parse(rule.required_wallet_public_keys)
            : rule.required_wallet_public_keys;

        res.json({
            success: true,
            message: 'Rule updated successfully',
            rule: rule
        });
    } catch (error) {
        console.error('Error updating contract execution rule:', error);
        res.status(500).json({ 
            error: 'Failed to update contract execution rule',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/{id}:
 *   delete:
 *     summary: Deactivate a contract execution rule
 *     description: Soft delete (deactivate) an execution rule. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rule ID
 *     responses:
 *       200:
 *         description: Rule deactivated successfully
 *       404:
 *         description: Rule not found
 *       401:
 *         description: Authentication required
 */
router.delete('/rules/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;

        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by public_key if available (for multi-role users), otherwise by user_id
        let result;
        if (publicKey) {
            result = await pool.query(
                `UPDATE contract_execution_rules cer
                 SET is_active = false,
                     updated_at = CURRENT_TIMESTAMP
                 FROM users u
                 WHERE cer.id = $1 
                     AND cer.user_id = u.id
                     AND u.public_key = $2
                 RETURNING cer.id`,
                [id, publicKey]
            );
        } else {
            result = await pool.query(
                `UPDATE contract_execution_rules
                 SET is_active = false,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND user_id = $2
                 RETURNING id`,
                [id, userId]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        res.json({
            success: true,
            message: 'Rule deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating contract execution rule:', error);
        res.status(500).json({ 
            error: 'Failed to deactivate contract execution rule',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get specific custom contract
 *     description: Retrieve details of a specific contract by ID. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     responses:
 *       200:
 *         description: Contract details
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.get('/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const result = await pool.query(
            `SELECT id, contract_address, contract_name, network, 
                    discovered_functions, function_mappings, use_smart_wallet,
                    smart_wallet_contract_id, payment_function_name, requires_webauthn,
                    webauthn_verifier_contract_id,
                    wasm_file_name, wasm_file_size, wasm_source, wasm_hash, wasm_uploaded_at,
                    created_at, updated_at, is_active
             FROM custom_contracts
             WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.json({
            success: true,
            contract: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching custom contract:', error);
        res.status(500).json({ 
            error: 'Failed to fetch custom contract',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}/mappings:
 *   put:
 *     summary: Update function mappings for a contract
 *     description: Update the function parameter mappings for a contract. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - function_mappings
 *             properties:
 *               function_mappings:
 *                 type: object
 *                 description: Function mappings object
 *     responses:
 *       200:
 *         description: Function mappings updated successfully
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.put('/:id/mappings', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { function_mappings } = req.body;

        if (!function_mappings) {
            return res.status(400).json({ error: 'Function mappings are required' });
        }

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const result = await pool.query(
            `UPDATE custom_contracts
             SET function_mappings = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [JSON.stringify(function_mappings), id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.json({
            success: true,
            contract: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating function mappings:', error);
        res.status(500).json({ 
            error: 'Failed to update function mappings',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}:
 *   delete:
 *     summary: Deactivate a custom contract
 *     description: Soft delete (deactivate) a custom contract. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     responses:
 *       200:
 *         description: Contract deactivated successfully
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.delete('/:id', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const result = await pool.query(
            `UPDATE custom_contracts
             SET is_active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.json({
            success: true,
            message: 'Contract deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating contract:', error);
        res.status(500).json({ 
            error: 'Failed to deactivate contract',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}/execute:
 *   post:
 *     summary: Execute a custom contract function
 *     description: Execute a function on a custom contract. Requires user's secret key. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - function_name
 *               - parameters
 *               - user_public_key
 *               - user_secret_key
 *             properties:
 *               function_name:
 *                 type: string
 *                 description: Name of the function to execute
 *               parameters:
 *                 type: object
 *                 description: Function parameters
 *               user_public_key:
 *                 type: string
 *                 description: User's Stellar public key
 *               user_secret_key:
 *                 type: string
 *                 description: User's Stellar secret key (for signing)
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 description: Network override (optional)
 *               rule_id:
 *                 type: integer
 *                 description: Optional rule ID - if provided, quorum will be validated before execution
 *     responses:
 *       200:
 *         description: Function executed successfully
 *       400:
 *         description: Missing required parameters
 *       404:
 *         description: Contract not found
 *       401:
 *         description: Authentication required
 */
router.post('/:id/execute', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            function_name, 
            parameters, 
            user_public_key, 
            user_secret_key, 
            rule_id,
            // WebAuthn data (if provided separately)
            passkeyPublicKeySPKI,
            webauthnSignature,
            webauthnAuthenticatorData,
            webauthnClientData,
            signaturePayload
        } = req.body;

        if (!function_name) {
            return res.status(400).json({ error: 'Function name is required' });
        }

        if (!user_public_key) {
            return res.status(400).json({ error: 'User public key is required' });
        }

        // Check if function is read-only (doesn't require signing)
        // Read-only functions typically start with: get_, is_, has_, check_, query_, view_, read_, fetch_
        const readOnlyPatterns = ['get_', 'is_', 'has_', 'check_', 'query_', 'view_', 'read_', 'fetch_'];
        const isReadOnly = readOnlyPatterns.some(pattern => function_name.toLowerCase().startsWith(pattern));
        
        // Check if user wants to force execution on-chain (submit to ledger)
        // This allows read-only functions to be submitted as transactions to appear on StellarExpert
        const { submit_to_ledger = false } = req.body;
        const forceOnChain = submit_to_ledger || (isReadOnly && user_secret_key);
        
        // Debug logging
        console.log(`[Execute] Execution mode check - isReadOnly: ${isReadOnly}, submit_to_ledger: ${submit_to_ledger}, user_secret_key provided: ${!!user_secret_key}, forceOnChain: ${forceOnChain}`);
        
        // For write functions, secret key is required
        if (!isReadOnly && !user_secret_key) {
            return res.status(400).json({ error: 'User secret key is required for write operations' });
        }
        
        // For read-only functions that should be submitted to ledger, secret key is required
        if (forceOnChain && isReadOnly && !user_secret_key) {
            return res.status(400).json({ 
                error: 'User secret key is required to submit read-only functions to the ledger',
                note: 'Read-only functions can be simulated without a secret key, but submitting to the ledger requires signing'
            });
        }

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // If rule_id is provided, validate quorum before execution
        if (rule_id) {
            const quorumResult = await pool.query(
                `SELECT * FROM validate_quorum_for_rule($1)`,
                [rule_id]
            );
            
            if (quorumResult.rows.length > 0) {
                const quorum = quorumResult.rows[0];
                if (!quorum.quorum_met) {
                    return res.status(403).json({ 
                        error: 'Quorum requirement not met',
                        quorum_status: {
                            quorum_met: false,
                            wallets_in_range: quorum.wallets_in_range,
                            wallets_out_of_range: quorum.wallets_out_of_range,
                            count_in_range: quorum.count_in_range,
                            minimum_required: quorum.minimum_required,
                            message: `Required ${quorum.minimum_required} wallet(s) in range, but only ${quorum.count_in_range} are present. Missing: ${quorum.wallets_out_of_range.join(', ')}`
                        }
                    });
                }
            }
        }

        // Get contract configuration (including smart wallet and WebAuthn settings)
        const contractResult = await pool.query(
            `SELECT contract_address, network, function_mappings, 
                    use_smart_wallet, smart_wallet_contract_id, requires_webauthn
             FROM custom_contracts
             WHERE id = $1 AND user_id = $2 AND is_active = true`,
            [id, userId]
        );

        if (contractResult.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        const contract = contractResult.rows[0];
        const functionMappings = typeof contract.function_mappings === 'string'
            ? JSON.parse(contract.function_mappings)
            : contract.function_mappings;
        
        // Log contract configuration for debugging
        console.log(`[Execute] Contract config - Contract ID: ${id}, use_smart_wallet: ${contract.use_smart_wallet}, requires_webauthn: ${contract.requires_webauthn}, smart_wallet_contract_id: ${contract.smart_wallet_contract_id}`);
        console.log(`[Execute] Contract config - Raw DB value: requires_webauthn = ${contract.requires_webauthn} (type: ${typeof contract.requires_webauthn})`);

        // Helper function to detect if a function is payment-related
        const isPaymentFunction = (funcName, funcParams) => {
            const paymentPatterns = ['transfer', 'payment', 'send', 'pay', 'withdraw', 'deposit'];
            const funcNameLower = funcName.toLowerCase();
            
            // Check function name
            if (paymentPatterns.some(pattern => funcNameLower.includes(pattern))) {
                return true;
            }
            
            // Check parameters for payment-related fields
            const paymentParams = ['destination', 'recipient', 'to', 'amount', 'asset', 'asset_address'];
            if (funcParams && typeof funcParams === 'object') {
                const paramKeys = Object.keys(funcParams).map(k => k.toLowerCase());
                const hasDestination = paymentParams.some(p => paramKeys.includes(p.toLowerCase()));
                const hasAmount = paramKeys.some(k => k.includes('amount'));
                if (hasDestination && hasAmount) {
                    return true;
                }
            }
            
            return false;
        };

        // Check if we should route through smart wallet
        const shouldRouteThroughSmartWallet = contract.use_smart_wallet && 
                                               contract.smart_wallet_contract_id &&
                                               isPaymentFunction(function_name, parameters);

        if (shouldRouteThroughSmartWallet) {
            console.log(`[Execute] 💳 Routing payment function "${function_name}" through smart wallet: ${contract.smart_wallet_contract_id}`);
            
            // Extract payment parameters from function parameters
            const extractPaymentParams = (params) => {
                // Common parameter name mappings
                const destinationKeys = ['destination', 'recipient', 'to', 'to_address', 'destination_address'];
                const amountKeys = ['amount', 'value', 'quantity'];
                const assetKeys = ['asset', 'asset_address', 'token', 'token_address'];
                
                let destination = null;
                let amount = null;
                let asset = null;
                
                // Find destination
                for (const key of destinationKeys) {
                    if (params[key]) {
                        destination = params[key];
                        break;
                    }
                    // Case-insensitive search
                    const foundKey = Object.keys(params).find(k => k.toLowerCase() === key.toLowerCase());
                    if (foundKey) {
                        destination = params[foundKey];
                        break;
                    }
                }
                
                // Find amount
                for (const key of amountKeys) {
                    if (params[key]) {
                        amount = params[key];
                        break;
                    }
                    const foundKey = Object.keys(params).find(k => k.toLowerCase() === key.toLowerCase());
                    if (foundKey) {
                        amount = params[foundKey];
                        break;
                    }
                }
                
                // Find asset (optional, defaults to native XLM)
                for (const key of assetKeys) {
                    if (params[key]) {
                        asset = params[key];
                        break;
                    }
                    const foundKey = Object.keys(params).find(k => k.toLowerCase() === key.toLowerCase());
                    if (foundKey) {
                        asset = params[foundKey];
                        break;
                    }
                }
                
                return { destination, amount, asset: asset || null };
            };

            const paymentParams = extractPaymentParams(parameters);
            
            if (!paymentParams.destination || !paymentParams.amount) {
                return res.status(400).json({ 
                    error: 'Payment function requires destination and amount parameters',
                    received_params: Object.keys(parameters),
                    expected_params: ['destination (or recipient/to)', 'amount (or value/quantity)']
                });
            }

            // Convert amount to stroops if needed (assuming it's in XLM)
            let amountInStroops = paymentParams.amount;
            if (typeof amountInStroops === 'string' && amountInStroops.includes('.')) {
                // Likely in XLM, convert to stroops
                amountInStroops = (parseFloat(amountInStroops) * 10000000).toString();
            } else if (typeof amountInStroops === 'number') {
                // Check if it's already in stroops (large number) or XLM (small number)
                if (amountInStroops < 1000000) {
                    // Likely in XLM, convert to stroops
                    amountInStroops = (amountInStroops * 10000000).toString();
                } else {
                    amountInStroops = amountInStroops.toString();
                }
            }

            // Check if WebAuthn is required
            const needsWebAuthn = contract.requires_webauthn || 
                                 (webauthnSignature && webauthnAuthenticatorData && webauthnClientData);

            if (needsWebAuthn && (!webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData)) {
                return res.status(400).json({ 
                    error: 'WebAuthn signature required for smart wallet payment',
                    message: 'This contract requires WebAuthn/passkey authentication. Please authenticate with your passkey.'
                });
            }

            // Create signature payload if not provided
            const finalSignaturePayload = signaturePayload || JSON.stringify({
                function: function_name,
                contract_id: id,
                destination: paymentParams.destination,
                amount: amountInStroops,
                asset: paymentParams.asset || 'native',
                timestamp: Date.now()
            });

            // Process WebAuthn signature if provided
            let processedWebAuthnSignature = webauthnSignature;
            if (needsWebAuthn && webauthnSignature) {
                try {
                    const derSignatureBytes = Buffer.from(webauthnSignature, 'base64');
                    let rawSignature64;
                    
                    if (derSignatureBytes.length === 64) {
                        rawSignature64 = normalizeECDSASignature(derSignatureBytes);
                    } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
                        const decodedSignature = decodeDERSignature(derSignatureBytes);
                        rawSignature64 = normalizeECDSASignature(decodedSignature);
                    } else {
                        throw new Error(`Invalid signature length: ${derSignatureBytes.length} bytes`);
                    }
                    
                    processedWebAuthnSignature = rawSignature64.toString('base64');
                } catch (error) {
                    return res.status(400).json({
                        error: 'Failed to process WebAuthn signature',
                        message: error.message
                    });
                }
            }

            // Route through smart wallet contract
            const StellarSdk = require('@stellar/stellar-sdk');
            const networkPassphrase = contract.network === 'mainnet' 
                ? StellarSdk.Networks.PUBLIC 
                : StellarSdk.Networks.TESTNET;
            
            const contractsConfig = require('../config/contracts');
            const rpcUrl = process.env.SOROBAN_RPC_URL || contractsConfig.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
            const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
            
            // Use the smart wallet contract ID from the contract configuration
            const smartWalletContractId = contract.smart_wallet_contract_id;
            const smartWalletContract = new StellarSdk.Contract(smartWalletContractId);

            // Create ScVals for smart wallet execute_payment
            const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(user_public_key);
            const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
            );
            const signerAddressScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

            const destinationAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(paymentParams.destination);
            const destinationScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(destinationAddressBytes)
            );
            const destinationScVal = StellarSdk.xdr.ScVal.scvAddress(destinationScAddress);

            // Asset address handling
            let assetScAddress;
            if (paymentParams.asset && paymentParams.asset.startsWith('C')) {
                const contractIdBytes = StellarSdk.StrKey.decodeContract(paymentParams.asset);
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
            } else if (paymentParams.asset && paymentParams.asset.startsWith('G')) {
                const assetAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(paymentParams.asset);
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                    StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(assetAddressBytes)
                );
            } else {
                // Native XLM
                const nativeAssetBytes = StellarSdk.StrKey.decodeEd25519PublicKey('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                    StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(nativeAssetBytes)
                );
            }
            const assetScVal = StellarSdk.xdr.ScVal.scvAddress(assetScAddress);

            // Amount as i128
            const amountBigInt = BigInt(amountInStroops);
            const hi = amountBigInt >> 64n;
            const lo = amountBigInt & 0xFFFFFFFFFFFFFFFFn;
            const amountI128 = new StellarSdk.xdr.Int128Parts({
                hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
                lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
            });
            const amountScVal = StellarSdk.xdr.ScVal.scvI128(amountI128);

            // WebAuthn data as Bytes
            const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(
                Buffer.from(finalSignaturePayload, 'utf8')
            );
            const webauthnSignatureScVal = StellarSdk.xdr.ScVal.scvBytes(
                Buffer.from(processedWebAuthnSignature, 'base64')
            );
            const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(
                Buffer.from(webauthnAuthenticatorData, 'base64')
            );
            const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(
                Buffer.from(webauthnClientData, 'base64')
            );

            // Call smart wallet's execute_payment
            const smartWalletOp = smartWalletContract.call(
                'execute_payment',
                signerAddressScVal,
                destinationScVal,
                amountScVal,
                assetScVal,
                signaturePayloadScVal,
                webauthnSignatureScVal,
                authenticatorDataScVal,
                clientDataScVal
            );

            // Build and execute transaction
            const horizonServer = new StellarSdk.Horizon.Server(
                contract.network === 'mainnet' 
                    ? 'https://horizon.stellar.org' 
                    : 'https://horizon-testnet.stellar.org'
            );
            const account = await horizonServer.loadAccount(user_public_key);
            
            const transaction = new StellarSdk.TransactionBuilder(
                new StellarSdk.Account(user_public_key, account.sequenceNumber()),
                {
                    fee: StellarSdk.BASE_FEE,
                    networkPassphrase: networkPassphrase
                }
            )
                .addOperation(smartWalletOp)
                .setTimeout(30)
                .build();

            // Prepare transaction
            const preparedTx = await sorobanServer.prepareTransaction(transaction);
            
            // Sign transaction
            const keypair = StellarSdk.Keypair.fromSecret(user_secret_key);
            preparedTx.sign(keypair);

            // Send transaction
            console.log(`[Execute] 📤 Sending smart wallet payment transaction...`);
            const sendResult = await sorobanServer.sendTransaction(preparedTx);
            console.log(`[Execute] ✅ Smart wallet transaction sent - Hash: ${sendResult.hash}`);

            // Poll for result
            let txResult = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                txResult = await sorobanServer.getTransaction(sendResult.hash);
                if (txResult.status === 'SUCCESS') {
                    const network = contract.network || 'testnet';
                    const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;
                    
                    return res.json({
                        success: true,
                        message: `Payment routed through smart wallet and executed successfully`,
                        transaction_hash: sendResult.hash,
                        ledger: txResult.ledger,
                        stellar_expert_url: stellarExpertUrl,
                        routed_through_smart_wallet: true,
                        smart_wallet_contract_id: smartWalletContractId,
                        original_function: function_name,
                        original_contract_id: id
                    });
                } else if (txResult.status === 'FAILED') {
                    return res.status(400).json({
                        error: 'Smart wallet payment failed',
                        transaction_hash: sendResult.hash,
                        result: txResult.resultXdr || txResult.errorResultXdr
                    });
                }
            }

            return res.status(500).json({
                error: 'Smart wallet payment timeout',
                transaction_hash: sendResult.hash,
                message: 'Transaction did not complete within 60 seconds'
            });
        }

        // Get function mapping (for non-smart-wallet routing)
        const mapping = functionMappings[function_name];
        if (!mapping) {
            return res.status(400).json({ error: `Function mapping not found for: ${function_name}` });
        }

        // Process WebAuthn signature if provided
        let processedParameters = { ...parameters };
        
        // IMPORTANT: WebAuthn parameters should ALWAYS come from the request body, never from stored function_parameters
        // Extract WebAuthn data from request body first (these take precedence)
        if (webauthnSignature) {
            processedParameters.webauthn_signature = webauthnSignature;
        }
        if (webauthnAuthenticatorData) {
            processedParameters.webauthn_authenticator_data = webauthnAuthenticatorData;
        }
        if (webauthnClientData) {
            processedParameters.webauthn_client_data = webauthnClientData;
        }
        if (signaturePayload) {
            processedParameters.signature_payload = signaturePayload;
        }
        
        // Auto-populate missing parameters for pending rule execution
        // This ensures all required parameters are present when executing from pending rules
        if (rule_id && mapping && mapping.parameters) {
            console.log(`[Execute] 🔄 Auto-populating parameters for pending rule execution`);
            console.log(`[Execute] 📋 Current parameters:`, Object.keys(processedParameters).join(', '));
            
            // Fetch matched_public_key from location_update_queue if not provided in request
            // Only use it if destination is not already set or is the user's own address
            let matchedPublicKey = processedParameters.matched_public_key;
            const currentDestination = processedParameters.destination;
            const isDestinationSelf = currentDestination === user_public_key;
            
            // If destination is missing or is the user's own address, fetch the matched wallet's address
            if ((!currentDestination || isDestinationSelf) && !matchedPublicKey) {
                try {
                    const matchedKeyQuery = `
                        SELECT luq.public_key, luq.received_at
                        FROM location_update_queue luq
                        WHERE luq.user_id = $1
                            AND luq.status IN ('matched', 'executed')
                            AND luq.execution_results IS NOT NULL
                            AND EXISTS (
                                SELECT 1 
                                FROM jsonb_array_elements(luq.execution_results) AS result
                                WHERE result->>'skipped' = 'true'
                                AND result->>'reason' = 'requires_webauthn'
                                AND (result->>'rule_id')::integer = $2
                            )
                        ORDER BY luq.received_at DESC
                        LIMIT 1
                    `;
                    const matchedKeyResult = await pool.query(matchedKeyQuery, [req.user?.id || req.userId, rule_id]);
                    if (matchedKeyResult.rows.length > 0) {
                        matchedPublicKey = matchedKeyResult.rows[0].public_key;
                        console.log(`[Execute] ✅ Fetched matched_public_key from location_update_queue: ${matchedPublicKey?.substring(0, 8)}...`);
                        
                        // If destination is self or missing, replace it with matched_public_key
                        if (isDestinationSelf || !currentDestination) {
                            processedParameters.destination = matchedPublicKey;
                            console.log(`[Execute] ✅ Replaced destination with matched_public_key: ${matchedPublicKey?.substring(0, 8)}...`);
                        }
                    }
                } catch (error) {
                    console.warn(`[Execute] ⚠️  Could not fetch matched_public_key:`, error.message);
                }
            } else if (matchedPublicKey && isDestinationSelf) {
                // If matched_public_key is provided in request but destination is self, use matched_public_key
                processedParameters.destination = matchedPublicKey;
                console.log(`[Execute] ✅ Replaced self destination with matched_public_key from request: ${matchedPublicKey?.substring(0, 8)}...`);
            }
            
            // Get function parameter definitions
            const functionParams = mapping.parameters;
            
            // Process each parameter to ensure it's populated
            functionParams.forEach(param => {
                const paramName = param.name;
                const mappedFrom = param.mapped_from;
                
                // Skip WebAuthn parameters - they should already be set from request body above
                const isWebAuthnParam = paramName.includes('webauthn') || paramName === 'signature_payload';
                if (isWebAuthnParam) {
                    // WebAuthn parameters are already set from request body, skip auto-population
                    return;
                }
                
                // Get current value (check both param name and mapped_from key)
                let currentValue = processedParameters[paramName] || processedParameters[mappedFrom];
                
                // Auto-populate based on parameter name and type
                if (!currentValue || currentValue === '') {
                    if (paramName === 'signer_address' && (param.type === 'Address' || param.type === 'address')) {
                        currentValue = user_public_key;
                        console.log(`[Execute] ✅ Auto-populated ${paramName} from user_public_key: ${currentValue}`);
                    } else if (paramName === 'destination' && (param.type === 'Address' || param.type === 'address')) {
                        // Destination should come from pending rule (matched wallet's public key)
                        if (matchedPublicKey) {
                            currentValue = matchedPublicKey;
                            console.log(`[Execute] ✅ Auto-populated ${paramName} from matched_public_key: ${currentValue}`);
                        } else {
                            console.warn(`[Execute] ⚠️  Destination address not found in parameters and matched_public_key not available`);
                        }
                    } else if (paramName === 'asset' && (param.type === 'Address' || param.type === 'address')) {
                        // Convert XLM/native to contract address
                        const assetValue = processedParameters.asset || processedParameters.asset_code;
                        if (assetValue === 'XLM' || assetValue === 'native' || !assetValue) {
                            currentValue = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                            console.log(`[Execute] ✅ Auto-populated ${paramName} to native XLM contract address`);
                        } else {
                            currentValue = assetValue;
                        }
                    } else if (paramName === 'amount' && (param.type === 'I128' || param.type === 'i128')) {
                        // Amount should already be in parameters, but ensure it's in stroops
                        const amountValue = processedParameters.amount;
                        if (amountValue) {
                            if (typeof amountValue === 'number' && amountValue < 1000000) {
                                currentValue = Math.floor(amountValue * 10000000).toString();
                                console.log(`[Execute] ✅ Converted ${paramName} to stroops: ${currentValue}`);
                            } else {
                                currentValue = amountValue.toString();
                            }
                        }
                    }
                }
                
                // Set value using both param name and mapped_from key so mapFieldsToContract can find it
                if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
                    processedParameters[paramName] = currentValue;
                    if (mappedFrom && mappedFrom !== paramName) {
                        processedParameters[mappedFrom] = currentValue;
                    }
                }
            });
            
            console.log(`[Execute] 📋 Final parameters after auto-population:`, Object.keys(processedParameters).join(', '));
        }
        
        if (webauthnSignature && webauthnAuthenticatorData && webauthnClientData) {
            console.log(`[Execute] 🔐 Processing WebAuthn signature for function: ${function_name}`);
            
            try {
                // Decode DER signature to raw 64-byte format
                const derSignatureBytes = Buffer.from(webauthnSignature, 'base64');
                let rawSignature64;
                
                if (derSignatureBytes.length === 64) {
                    // Already raw bytes - normalize it
                    rawSignature64 = normalizeECDSASignature(derSignatureBytes);
                } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
                    // DER-encoded signature - decode and normalize
                    const decodedSignature = decodeDERSignature(derSignatureBytes);
                    rawSignature64 = normalizeECDSASignature(decodedSignature);
                } else {
                    throw new Error(`Invalid signature length: ${derSignatureBytes.length} bytes`);
                }
                
                if (rawSignature64.length !== 64) {
                    throw new Error(`Invalid signature length after decoding: ${rawSignature64.length} bytes`);
                }
                
                // Create signature payload if not provided
                if (!signaturePayload && !processedParameters.signature_payload) {
                    // Build signature payload from transaction data
                    const txData = {
                        source: user_public_key,
                        destination: processedParameters.destination || '',
                        amount: processedParameters.amount || '0',
                        asset: processedParameters.asset || 'native',
                        timestamp: Date.now()
                    };
                    signaturePayload = JSON.stringify(txData);
                    console.log(`[Execute] ✅ Generated signature payload from transaction data`);
                }
                
                // Update parameters with processed WebAuthn data
                processedParameters = {
                    ...processedParameters,
                    signature_payload: signaturePayload || processedParameters.signature_payload || JSON.stringify(processedParameters),
                    webauthn_signature: rawSignature64.toString('base64'), // Convert back to base64 for ScVal conversion
                    webauthn_authenticator_data: webauthnAuthenticatorData,
                    webauthn_client_data: webauthnClientData
                };
                
                console.log(`[Execute] ✅ WebAuthn signature processed - Length: ${rawSignature64.length} bytes`);
            } catch (error) {
                console.error(`[Execute] ❌ Error processing WebAuthn signature:`, error);
                return res.status(400).json({
                    error: 'Failed to process WebAuthn signature',
                    message: error.message
                });
            }
        }

        // Map parameters using the mapping
        const mappedParams = contractIntrospection.mapFieldsToContract(processedParameters, mapping);
        
        // Log mapped parameters for debugging
        console.log(`[Execute] 📋 Mapped parameters (${mappedParams.length} total):`, 
            mappedParams.map(p => `${p.name}(${p.type})=${p.value !== undefined && p.value !== null ? (typeof p.value === 'string' && p.value.length > 50 ? p.value.substring(0, 50) + '...' : p.value) : 'undefined/null'}`).join(', ')
        );
        
        // If mapping didn't find all parameters, try direct lookup as fallback
        // Also convert values that need conversion (XLM -> contract address, etc.)
        if (mapping && mapping.parameters) {
            mapping.parameters.forEach(param => {
                const existingMapped = mappedParams.find(p => p.name === param.name);
                
                // First, check if existing mapped value needs conversion
                if (existingMapped && existingMapped.value !== undefined && existingMapped.value !== null && existingMapped.value !== '') {
                    // Convert asset "XLM"/"native" to contract address
                    if (param.name === 'asset' && (param.type === 'Address' || param.type === 'address')) {
                        if (existingMapped.value === 'XLM' || existingMapped.value === 'native') {
                            existingMapped.value = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                            console.log(`[Execute] ✅ Converted ${param.name} from "${existingMapped.value}" to contract address in mapped params`);
                        }
                    }
                    
                    // Convert amount to stroops if needed
                    if (param.name === 'amount' && (param.type === 'I128' || param.type === 'i128')) {
                        if (typeof existingMapped.value === 'number' && existingMapped.value < 1000000) {
                            existingMapped.value = Math.floor(existingMapped.value * 10000000).toString();
                            console.log(`[Execute] ✅ Converted ${param.name} to stroops in mapped params: ${existingMapped.value}`);
                        } else if (typeof existingMapped.value !== 'string') {
                            existingMapped.value = existingMapped.value.toString();
                        }
                    }
                }
                
                // If parameter is missing or empty, try direct lookup
                if (!existingMapped || existingMapped.value === undefined || existingMapped.value === null || existingMapped.value === '') {
                    // Try to find value directly in processedParameters using param name
                    let directValue = processedParameters[param.name];
                    
                    // Apply conversions based on parameter type and name
                    if (directValue !== undefined && directValue !== null && directValue !== '') {
                        // Convert asset "XLM"/"native" to contract address
                        if (param.name === 'asset' && (param.type === 'Address' || param.type === 'address')) {
                            if (directValue === 'XLM' || directValue === 'native') {
                                directValue = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                                console.log(`[Execute] ✅ Converted ${param.name} from "${processedParameters[param.name]}" to contract address via direct lookup`);
                            }
                        }
                        
                        // Convert amount to stroops if needed
                        if (param.name === 'amount' && (param.type === 'I128' || param.type === 'i128')) {
                            if (typeof directValue === 'number' && directValue < 1000000) {
                                directValue = Math.floor(directValue * 10000000).toString();
                                console.log(`[Execute] ✅ Converted ${param.name} to stroops via direct lookup: ${directValue}`);
                            } else if (typeof directValue !== 'string') {
                                directValue = directValue.toString();
                            }
                        }
                        
                        const existingIndex = mappedParams.findIndex(p => p.name === param.name);
                        if (existingIndex >= 0) {
                            mappedParams[existingIndex].value = directValue;
                            console.log(`[Execute] ✅ Found ${param.name} via direct lookup: ${typeof directValue === 'string' && directValue.length > 50 ? directValue.substring(0, 50) + '...' : directValue}`);
                        } else {
                            mappedParams.push({
                                name: param.name,
                                type: param.type,
                                value: directValue
                            });
                            console.log(`[Execute] ✅ Added ${param.name} via direct lookup: ${typeof directValue === 'string' && directValue.length > 50 ? directValue.substring(0, 50) + '...' : directValue}`);
                        }
                    }
                }
            });
        }
        
        // Convert to ScVal - filter out undefined/null/empty string values for required parameters
        // But keep empty strings for optional WebAuthn parameters if they're being populated
        const scValParams = mappedParams
            .filter(param => {
                // For WebAuthn parameters, empty strings might be acceptable if they're being populated
                const isWebAuthnParam = param.name.includes('webauthn') || param.name === 'signature_payload';
                
                if (param.value === undefined || param.value === null) {
                    console.warn(`[Execute] ⚠️  Skipping parameter ${param.name} (type: ${param.type}) - value is undefined/null`);
                    return false;
                }
                
                // For non-WebAuthn parameters, empty strings are not valid
                if (!isWebAuthnParam && param.value === '') {
                    console.warn(`[Execute] ⚠️  Skipping parameter ${param.name} (type: ${param.type}) - value is empty string`);
                    return false;
                }
                
                return true;
            })
            .map(param => {
                try {
                    return contractIntrospection.convertToScVal(param.value, param.type);
                } catch (error) {
                    console.error(`[Execute] ❌ Error converting parameter ${param.name} (value: ${param.value}, type: ${param.type}):`, error.message);
                    throw new Error(`Failed to convert parameter "${param.name}" (${param.type}): ${error.message}`);
                }
            });

        // Execute contract function
        const StellarSdk = require('@stellar/stellar-sdk');
        const networkPassphrase = contract.network === 'mainnet' 
            ? StellarSdk.Networks.PUBLIC 
            : StellarSdk.Networks.TESTNET;
        
        // Get Soroban RPC server
        const contracts = require('../config/contracts');
        const rpcUrl = process.env.SOROBAN_RPC_URL || contracts.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
        
        // Create contract instance
        const contractInstance = new StellarSdk.Contract(contract.contract_address);
        
        // Build the contract call operation
        const operation = contractInstance.call(function_name, ...scValParams);
        
        if (isReadOnly && !forceOnChain) {
            // For read-only functions, use simulation (no signing needed) unless forceOnChain is true
            const dummyAccount = new StellarSdk.Account(user_public_key, '0');
            const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: networkPassphrase
            })
                .addOperation(operation)
                .setTimeout(30)
                .build();
            
            try {
                const simulation = await sorobanServer.simulateTransaction(transaction);
                
                if (simulation.errorResult) {
                    return res.status(400).json({
                        error: 'Contract function simulation failed',
                        message: simulation.errorResult.value().toString(),
                        function_name,
                        is_read_only: true
                    });
                }
                
                // Extract result from simulation
                let result = null;
                if (simulation.result && simulation.result.retval) {
                    result = simulation.result.retval;
                }
                
                return res.json({
                    success: true,
                    message: 'Read-only function executed successfully (simulated)',
                    function_name,
                    is_read_only: true,
                    result: result ? result.toString() : null,
                    raw_result: result,
                    note: 'This was simulated. To submit to the ledger and see on StellarExpert, provide user_secret_key and set submit_to_ledger: true'
                });
            } catch (error) {
                console.error('Error simulating contract function:', error);
                return res.status(500).json({
                    error: 'Failed to simulate contract function',
                    message: error.message,
                    function_name,
                    is_read_only: true
                });
            }
        } else {
            // For write functions OR read-only functions that should be submitted to ledger, use actual transaction submission (requires signing)
            const keypair = StellarSdk.Keypair.fromSecret(user_secret_key);
            const account = await sorobanServer.getAccount(keypair.publicKey());
            
            console.log(`[Execute] 🔨 Building transaction for function: ${function_name}`);
            const transaction = new StellarSdk.TransactionBuilder(account, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: networkPassphrase
            })
                .addOperation(operation)
                .setTimeout(30)
                .build();
            
            try {
                // Prepare transaction (required for Soroban contracts)
                console.log(`[Execute] 🔄 Preparing transaction for function: ${function_name}`);
                const preparedTx = await sorobanServer.prepareTransaction(transaction);
                console.log(`[Execute] ✅ Transaction prepared`);
                
                // Sign the prepared transaction
                console.log(`[Execute] ✍️ Signing transaction...`);
                preparedTx.sign(keypair);
                console.log(`[Execute] ✅ Transaction signed`);
                
                // Submit transaction
                console.log(`[Execute] 📤 Submitting transaction to ledger for function: ${function_name} (read-only: ${isReadOnly}, forceOnChain: ${forceOnChain})`);
                const sendResult = await sorobanServer.sendTransaction(preparedTx);
                console.log(`[Execute] ✅ Transaction sent - Hash: ${sendResult.hash}`);
                
                // Wait for transaction to be included in a ledger
                console.log(`[Execute] ⏳ Waiting for transaction to be included in ledger...`);
                let txResult = null;
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds between polls
                    try {
                        txResult = await sorobanServer.getTransaction(sendResult.hash);
                        console.log(`[Execute] 📊 Poll attempt ${i + 1}/30 - Status: ${txResult.status}`);
                        
                        if (txResult.status === 'SUCCESS') {
                            console.log(`[Execute] ✅ Transaction successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
                            break;
                        } else if (txResult.status === 'FAILED') {
                            console.log(`[Execute] ❌ Transaction failed - Hash: ${sendResult.hash}`);
                            return res.status(400).json({
                                error: 'Transaction failed',
                                message: txResult.resultXdr ? 'Transaction was included in ledger but failed' : 'Transaction failed',
                                function_name,
                                is_read_only: isReadOnly,
                                transaction_hash: sendResult.hash,
                                transaction_status: txResult.status
                            });
                        } else if (txResult.status === 'NOT_FOUND') {
                            // Transaction not found yet, continue polling
                            continue;
                        }
                    } catch (pollError) {
                        // If getTransaction fails, continue polling
                        console.log(`[Execute] ⚠️ Poll attempt ${i + 1} failed: ${pollError.message}`);
                        continue;
                    }
                }
                
                if (!txResult || txResult.status !== 'SUCCESS') {
                    // Transaction was sent but we couldn't confirm it was included
                    // Still return success with the hash so user can check manually
                    console.log(`[Execute] ⚠️ Could not confirm transaction inclusion, but it was sent. Hash: ${sendResult.hash}`);
                    const network = contract.network === 'mainnet' ? 'mainnet' : 'testnet';
                    const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;
                    
                    return res.json({
                        success: true,
                        message: isReadOnly 
                            ? 'Read-only function submitted to ledger (pending confirmation)' 
                            : 'Contract function submitted to ledger (pending confirmation)',
                        function_name,
                        is_read_only: isReadOnly,
                        transaction_hash: sendResult.hash,
                        transaction_status: txResult?.status || 'PENDING',
                        stellar_expert_url: stellarExpertUrl,
                        note: 'Transaction was submitted but confirmation is pending. Please check StellarExpert in a few moments.',
                        warning: 'Transaction may still be processing. If it does not appear on StellarExpert, it may have failed.'
                    });
                }
                
                // Build StellarExpert URL for testnet/mainnet
                const network = contract.network === 'mainnet' ? 'mainnet' : 'testnet';
                const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;
                
                return res.json({
                    success: true,
                    message: isReadOnly 
                        ? 'Read-only function submitted to ledger successfully' 
                        : 'Contract function executed successfully',
                    function_name,
                    is_read_only: isReadOnly,
                    transaction_hash: sendResult.hash,
                    transaction_status: txResult.status,
                    ledger: txResult.ledger,
                    transaction_result: txResult,
                    stellar_expert_url: stellarExpertUrl,
                    note: isReadOnly 
                        ? 'This read-only function was submitted to the ledger and will appear on StellarExpert'
                        : 'Transaction submitted to the ledger'
                });
            } catch (error) {
                console.error('Error executing contract function:', error);
                return res.status(500).json({
                    error: 'Failed to execute contract function',
                    message: error.message,
                    function_name,
                    is_read_only: isReadOnly,
                    details: error.response?.data || error.toString()
                });
            }
        }
    } catch (error) {
        console.error('Error executing contract function:', error);
        res.status(500).json({ 
            error: 'Failed to execute contract function',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/{id}/test-function:
 *   post:
 *     summary: Test a contract function call without executing
 *     description: Validates and simulates a contract function call. Does not execute on-chain. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contract ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - function_name
 *               - parameters
 *             properties:
 *               function_name:
 *                 type: string
 *                 description: Name of the function to test
 *               parameters:
 *                 type: object
 *                 description: Function parameters
 *     responses:
 *       200:
 *         description: Function test successful
 *       400:
 *         description: Invalid function or parameters
 *       404:
 *         description: Contract not found
 */
router.post('/:id/test-function', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { function_name, parameters } = req.body;

        if (!function_name) {
            return res.status(400).json({ error: 'Function name is required' });
        }

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Get contract with discovered functions
        // Support both user_id and public_key filtering (for multi-role users)
        const publicKey = req.user?.public_key;
        let contractResult;
        
        if (publicKey) {
            contractResult = await pool.query(
                `SELECT cc.contract_address, cc.network, cc.function_mappings, cc.discovered_functions
                 FROM custom_contracts cc
                 JOIN users u ON cc.user_id = u.id
                 WHERE cc.id = $1 AND u.public_key = $2 AND cc.is_active = true`,
                [id, publicKey]
            );
        } else {
            contractResult = await pool.query(
                `SELECT contract_address, network, function_mappings, discovered_functions
                 FROM custom_contracts
                 WHERE id = $1 AND user_id = $2 AND is_active = true`,
                [id, userId]
            );
        }

        if (contractResult.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        const contract = contractResult.rows[0];
        const functionMappings = typeof contract.function_mappings === 'string'
            ? JSON.parse(contract.function_mappings)
            : contract.function_mappings;
        
        const discoveredFunctions = typeof contract.discovered_functions === 'string'
            ? JSON.parse(contract.discovered_functions)
            : contract.discovered_functions;

        // Check if function exists in discovered functions
        const discoveredFunction = discoveredFunctions?.[function_name];
        if (!discoveredFunction) {
            return res.status(400).json({ 
                error: `Function "${function_name}" not found in discovered functions`,
                available_functions: Object.keys(discoveredFunctions || {})
            });
        }

        // Get function mapping - auto-generate if missing
        let mapping = functionMappings?.[function_name];
        
        // If mapping doesn't exist, auto-generate it from discovered function
        if (!mapping && discoveredFunction) {
            console.log(`[Test Function] Auto-generating mapping for function: ${function_name}`);
            const parameters = (discoveredFunction.parameters || []).map(param => ({
                name: param.name || 'unknown',
                type: param.type || 'unknown',
                mapped_from: param.mapped_from || contractIntrospection.inferParameterMapping(
                    param.name || '', 
                    param.type || ''
                )
            }));
            
            mapping = {
                parameters: parameters,
                return_type: discoveredFunction.return_type || 'void',
                auto_execute: false,
                requires_confirmation: true
            };
            
            // Save the auto-generated mapping to the contract
            const updatedMappings = { ...functionMappings, [function_name]: mapping };
            await pool.query(
                `UPDATE custom_contracts
                 SET function_mappings = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [JSON.stringify(updatedMappings), id]
            );
            console.log(`[Test Function] Saved auto-generated mapping for function: ${function_name}`);
        }

        // Validate parameters against discovered function signature
        const validationErrors = [];
        const functionParams = discoveredFunction.parameters || [];
        
        // Check required parameters
        functionParams.forEach(param => {
            if (parameters[param.name] === undefined && param.required !== false) {
                validationErrors.push(`Missing required parameter: ${param.name} (type: ${param.type})`);
            }
        });

        // Check for unknown parameters
        Object.keys(parameters).forEach(paramName => {
            if (!functionParams.find(p => p.name === paramName)) {
                validationErrors.push(`Unknown parameter: ${paramName}`);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Parameter validation failed',
                validation_errors: validationErrors,
                expected_parameters: functionParams.map(p => ({
                    name: p.name,
                    type: p.type,
                    required: p.required !== false
                }))
            });
        }
        
        let mappedParams = [];
        let scValParams = [];
        
        if (mapping) {
            // If mapping exists, validate parameter mapping
            try {
                mappedParams = contractIntrospection.mapFieldsToContract(parameters, mapping);
            } catch (error) {
                return res.status(400).json({
                    error: 'Parameter mapping failed',
                    message: error.message,
                    details: 'Check that parameter names and types match the function mapping',
                    note: 'Function exists and parameters are valid, but mapping configuration needs adjustment'
                });
            }

            // Convert to ScVal (validation only, no execution)
            try {
                scValParams = mappedParams.map(param => 
                    contractIntrospection.convertToScVal(param.value, param.type)
                );
            } catch (error) {
                return res.status(400).json({
                    error: 'Parameter conversion failed',
                    message: error.message,
                    details: 'Check that parameter values match expected types',
                    note: 'Function exists and parameters are valid, but value conversion failed'
                });
            }
        } else {
            // No mapping configured - just validate parameter structure
            // This is okay for testing, but execution will require mapping
            mappedParams = functionParams.map(param => ({
                name: param.name,
                type: param.type,
                value: parameters[param.name]
            }));
        }

        // Actually simulate the contract call using Stellar SDK
        console.log(`[Test Function] 🔄 Simulating contract call: ${function_name} on contract ${contract.contract_address}`);
        const StellarSdk = require('@stellar/stellar-sdk');
        
        // If no mapping, try basic ScVal conversion
        if (!mapping && scValParams.length === 0 && mappedParams.length > 0) {
            try {
                scValParams = mappedParams.map(param => {
                    const value = param.value;
                    if (param.type === 'Address') {
                        return StellarSdk.xdr.ScVal.scvAddress(StellarSdk.Address.fromString(value).toScAddress());
                    } else if (param.type === 'I128' || param.type === 'I64' || param.type === 'I32') {
                        const amountBigInt = BigInt(value || 0);
                        const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF');
                        const lo = amountBigInt & maxUint64;
                        const hi = amountBigInt >> 64n;
                        const amountI128 = new StellarSdk.xdr.Int128Parts({
                            hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
                            lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
                        });
                        return StellarSdk.xdr.ScVal.scvI128(amountI128);
                    } else if (param.type === 'U128' || param.type === 'U64' || param.type === 'U32') {
                        const amountBigInt = BigInt(value || 0);
                        const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF');
                        const lo = amountBigInt & maxUint64;
                        const hi = amountBigInt >> 64n;
                        const amountU128 = new StellarSdk.xdr.UInt128Parts({
                            hi: StellarSdk.xdr.Uint64.fromString(hi.toString()),
                            lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
                        });
                        return StellarSdk.xdr.ScVal.scvU128(amountU128);
                    } else if (param.type === 'Bool') {
                        return StellarSdk.xdr.ScVal.scvBool(value === true || value === 'true');
                    } else if (param.type === 'String') {
                        return StellarSdk.xdr.ScVal.scvString(value || '');
                    } else {
                        return StellarSdk.xdr.ScVal.scvString(String(value || ''));
                    }
                });
            } catch (error) {
                console.warn(`[Test Function] Could not convert parameters to ScVal without mapping: ${error.message}`);
            }
        }
        const networkPassphrase = contract.network === 'mainnet' 
            ? StellarSdk.Networks.PUBLIC 
            : StellarSdk.Networks.TESTNET;
        
        // Get Soroban RPC server
        const contracts = require('../config/contracts');
        const rpcUrl = process.env.SOROBAN_RPC_URL || contracts.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
        
        // Create contract instance
        const contractInstance = new StellarSdk.Contract(contract.contract_address);
        
        // Build the contract call operation
        const operation = contractInstance.call(function_name, ...scValParams);
        
        // Use a dummy account for simulation (read-only, no signing needed)
        // Get user's public key from request if available, otherwise use a dummy
        const userPublicKey = req.user?.public_key || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
        const dummyAccount = new StellarSdk.Account(userPublicKey, '0');
        
        const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: networkPassphrase
        })
            .addOperation(operation)
            .setTimeout(30)
            .build();
        
        let simulationResult = null;
        let simulationError = null;
        
        try {
            console.log(`[Test Function] 📡 Calling simulateTransaction for function: ${function_name}`);
            const simulation = await sorobanServer.simulateTransaction(transaction);
            console.log(`[Test Function] ✅ Simulation completed for function: ${function_name}`);
            
            if (simulation.errorResult) {
                simulationError = {
                    error: true,
                    message: simulation.errorResult.value().toString(),
                    error_result: simulation.errorResult
                };
                console.log(`[Test Function] ⚠️  Simulation returned error: ${simulationError.message}`);
            } else if (simulation.result) {
                // Extract result from simulation
                let result = null;
                if (simulation.result.retval) {
                    result = simulation.result.retval;
                }
                
                simulationResult = {
                    success: true,
                    result: result ? result.toString() : null,
                    raw_result: result,
                    cost: simulation.cost || null,
                    transaction_data: simulation.transactionData || null
                };
                console.log(`[Test Function] ✅ Simulation successful, result: ${simulationResult.result}`);
            }
        } catch (error) {
            console.error(`[Test Function] ❌ Error simulating contract function:`, error);
            simulationError = {
                error: true,
                message: error.message,
                stack: error.stack
            };
        }

        // Return test result with simulation details
        return res.json({
            success: true,
            message: simulationError 
                ? 'Function test completed with simulation error' 
                : (mapping 
                    ? 'Function test successful - parameters validated, mapped, and simulated'
                    : 'Function test successful - parameters validated and simulated (mapping not configured)'),
            test_result: {
                function_name,
                contract_address: contract.contract_address,
                network: contract.network,
                parameters_provided: parameters,
                parameters_mapped: mappedParams,
                parameters_count: scValParams.length || mappedParams.length,
                validation: {
                    function_exists: true,
                    mapping_exists: !!mapping,
                    parameters_valid: true,
                    conversion_successful: !!mapping && scValParams.length > 0
                },
                simulation: simulationError || simulationResult
            },
            note: mapping 
                ? 'This was a test call using simulateTransaction. No on-chain transaction was executed. Function mapping is configured and ready for execution.'
                : 'This was a test call using simulateTransaction. No on-chain transaction was executed. Function mapping is not configured - you will need to configure function mappings before executing this function.'
        });
    } catch (error) {
        console.error('Error testing contract function:', error);
        res.status(500).json({ 
            error: 'Failed to test contract function',
            message: error.message 
        });
    }
});

// NOTE: All /rules routes are defined above (before /:id route) to avoid route conflicts
// The /rules/:id routes are also defined above before /:id

// Get contract execution rules with location data for map display
// Supports both JWT and API key authentication
router.get('/execution-rules/locations', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found' });
        }

        // Filter by public_key if available (for multi-role users), otherwise by user_id
        // This matches the pattern used in the contracts GET endpoint for consistency
        let query, params;
        if (publicKey) {
            query = `
                SELECT 
                    cer.id,
                    cer.rule_name,
                    cer.rule_type,
                    cer.center_latitude,
                    cer.center_longitude,
                    cer.radius_meters,
                    cer.function_name,
                    cer.is_active,
                    cer.trigger_on,
                    cer.auto_execute,
                    cc.contract_name,
                    cc.contract_address,
                    cc.network
                FROM contract_execution_rules cer
                LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                JOIN users u ON cer.user_id = u.id
                WHERE u.public_key = $1
                    AND cer.rule_type = 'location'
                    AND cer.center_latitude IS NOT NULL 
                    AND cer.center_longitude IS NOT NULL
                    AND cer.is_active = true
                ORDER BY cer.created_at DESC
            `;
            params = [publicKey];
        } else {
            query = `
                SELECT 
                    cer.id,
                    cer.rule_name,
                    cer.rule_type,
                    cer.center_latitude,
                    cer.center_longitude,
                    cer.radius_meters,
                    cer.function_name,
                    cer.is_active,
                    cer.trigger_on,
                    cer.auto_execute,
                    cc.contract_name,
                    cc.contract_address,
                    cc.network
                FROM contract_execution_rules cer
                LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE cer.user_id = $1
                    AND cer.rule_type = 'location'
                    AND cer.center_latitude IS NOT NULL 
                    AND cer.center_longitude IS NOT NULL
                    AND cer.is_active = true
                ORDER BY cer.created_at DESC
            `;
            params = [userId];
        }

        const result = await pool.query(query, params);

        // Format response for map markers
        const rules = result.rows.map(rule => ({
            id: rule.id,
            type: 'contract_rule',
            rule_name: rule.rule_name,
            rule_type: rule.rule_type,
            latitude: parseFloat(rule.center_latitude),
            longitude: parseFloat(rule.center_longitude),
            radius_meters: rule.radius_meters ? parseFloat(rule.radius_meters) : null,
            function_name: rule.function_name,
            contract_name: rule.contract_name,
            contract_address: rule.contract_address,
            network: rule.network,
            trigger_on: rule.trigger_on,
            auto_execute: rule.auto_execute,
            is_active: rule.is_active
        }));

        res.json({
            success: true,
            rules: rules
        });
    } catch (error) {
        console.error('Error fetching contract execution rules locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;
