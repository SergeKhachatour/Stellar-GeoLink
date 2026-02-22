const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const { validateSignedXDR } = require('../middleware/validateSignedXDR');
const contractIntrospection = require('../services/contractIntrospection');
const { extractPublicKeyFromSPKI, decodeDERSignature, normalizeECDSASignature } = require('../utils/webauthnUtils');

/**
 * Lightweight cleanup function for a specific rule_id + public_key combination
 * This is called after each execution to clean up only related entries
 * Runs asynchronously to avoid blocking the execution response
 */
async function cleanupAfterExecution(ruleId, publicKey, userId, executionTime) {
    try {
        // Mark old pending entries for this specific rule+key as superseded
        const markSupersededQuery = `
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE 
                        WHEN (result->>'rule_id')::integer = $1
                            AND COALESCE(result->>'matched_public_key', luq.public_key) = $2
                            AND COALESCE((result->>'completed')::boolean, false) = false
                            AND COALESCE((result->>'skipped')::boolean, false) = true
                            AND luq.received_at < $4
                            AND (result->>'reason')::text != 'superseded_by_newer_execution'
                        THEN result || jsonb_build_object(
                            'reason', 'superseded_by_newer_execution',
                            'superseded_at', CURRENT_TIMESTAMP::text
                        )
                        ELSE result
                    END
                )
                FROM jsonb_array_elements(luq.execution_results) AS result
            )
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND luq.received_at < $4
                AND (
                    (luq.public_key = $2 OR $2 IS NULL)
                    OR (luq.user_id = $3 OR $3 IS NULL)
                )
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE (result->>'rule_id')::integer = $1
                        AND COALESCE(result->>'matched_public_key', luq.public_key) = $2
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                )
        `;
        
        await pool.query(markSupersededQuery, [ruleId, publicKey || null, userId || null, executionTime]);
        
        // Delete old entries that are fully superseded (no valid pending rules)
        const deleteOldQuery = `
            DELETE FROM location_update_queue luq
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND luq.received_at < $4
                AND (
                    (luq.public_key = $2 OR $2 IS NULL)
                    OR (luq.user_id = $3 OR $3 IS NULL)
                )
                -- Only delete if all execution results are skipped/superseded (no valid pending rules)
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE COALESCE((result->>'completed')::boolean, false) = false
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                        AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rate_limit_exceeded')
                )
                -- Don't delete entries that have completed rules
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE COALESCE((result->>'completed')::boolean, false) = true
                )
                -- Only delete entries related to this specific rule
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE (result->>'rule_id')::integer = $1
                        AND COALESCE(result->>'matched_public_key', luq.public_key) = $2
                )
        `;
        
        await pool.query(deleteOldQuery, [ruleId, publicKey || null, userId || null, executionTime]);
    } catch (error) {
        // Don't throw - cleanup is non-critical
        console.error('[QueueCleanup] ⚠️ Error in lightweight cleanup:', error.message);
    }
}

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
/**
 * @swagger
 * /api/contracts/{id}/fetch-wasm:
 *   post:
 *     summary: Fetch WASM file from Stellar network
 *     description: Fetches the WASM bytecode for a contract directly from the Stellar network using the contract ID. Supports both JWT and API key authentication.
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 description: Network override (optional, uses contract's network if not provided)
 *     responses:
 *       200:
 *         description: WASM file fetched and saved successfully
 *       404:
 *         description: Contract not found or WASM not found on network
 *       401:
 *         description: Authentication required
 */
// NOTE: This route MUST be defined BEFORE /:id to avoid route conflicts
router.post('/:id/fetch-wasm', authenticateContractUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { network: networkOverride } = req.body;
        const userId = req.user?.id || req.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Get contract details
        const contractResult = await pool.query(
            `SELECT id, contract_address, network, wasm_file_path, wasm_file_name
             FROM custom_contracts
             WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (contractResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Contract not found',
                message: `Contract with ID ${id} not found or you do not have access to it. Please verify the contract ID and try again.`
            });
        }

        const contract = contractResult.rows[0];
        const contractAddress = contract.contract_address;
        const network = networkOverride || contract.network || 'testnet';

        // Validate contract address format
        if (!/^[A-Z0-9]{56}$/.test(contractAddress)) {
            return res.status(400).json({ error: 'Invalid contract address format' });
        }

        const StellarSdk = require('@stellar/stellar-sdk');
        const contractsConfig = require('../config/contracts');
        
        // Determine RPC URL based on network
        const rpcUrl = network === 'mainnet'
            ? 'https://soroban.stellar.org'
            : 'https://soroban-testnet.stellar.org';
        
        const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
        const networkPassphrase = network === 'mainnet'
            ? StellarSdk.Networks.PUBLIC
            : StellarSdk.Networks.TESTNET;

        console.log(`[Fetch WASM] 🔍 Fetching WASM for contract ${contractAddress} on ${network}...`);

        // Step 1: Get contract instance to find WASM hash
        const contractIdBytes = StellarSdk.StrKey.decodeContract(contractAddress);
        const contractScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
        const contractScVal = StellarSdk.xdr.ScVal.scvAddress(contractScAddress);

        // Get contract instance data
        const contractDataKey = StellarSdk.xdr.LedgerKey.contractData(
            new StellarSdk.xdr.LedgerKeyContractData({
                contract: contractScAddress,
                key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
                durability: StellarSdk.xdr.ContractDataDurability.persistent()
            })
        );

        const ledgerEntries = await sorobanServer.getLedgerEntries(contractDataKey);
        
        if (!ledgerEntries.entries || ledgerEntries.entries.length === 0) {
            return res.status(404).json({ error: 'Contract instance not found on network' });
        }

        const contractInstance = ledgerEntries.entries[0].val.contractData().val().instance();
        const wasmHash = contractInstance.executable().wasmHash();

        if (!wasmHash) {
            return res.status(404).json({ error: 'WASM hash not found in contract instance' });
        }

        // Step 2: Fetch WASM bytecode using the hash
        const wasmHashHex = Buffer.from(wasmHash).toString('hex');
        console.log(`[Fetch WASM] 📦 Found WASM hash: ${wasmHashHex}`);

        const wasmCodeKey = StellarSdk.xdr.LedgerKey.contractCode(
            new StellarSdk.xdr.LedgerKeyContractCode({
                hash: wasmHash
            })
        );

        const wasmEntries = await sorobanServer.getLedgerEntries(wasmCodeKey);
        
        if (!wasmEntries.entries || wasmEntries.entries.length === 0) {
            return res.status(404).json({ error: 'WASM bytecode not found on network' });
        }

        const wasmData = wasmEntries.entries[0].val.contractCode().code();
        const wasmBuffer = Buffer.from(wasmData);

        console.log(`[Fetch WASM] ✅ Fetched WASM bytecode: ${wasmBuffer.length} bytes`);

        // Step 3: Save WASM file to server
        const uploadDir = path.join(__dirname, '../uploads/contract-wasm');
        await fs.mkdir(uploadDir, { recursive: true });

        const timestamp = Date.now();
        const filename = `contract-${contractAddress.substring(0, 8)}-${timestamp}.wasm`;
        const filePath = path.join(uploadDir, filename);

        await fs.writeFile(filePath, wasmBuffer);

        // Calculate hash
        const hash = crypto.createHash('sha256').update(wasmBuffer).digest('hex');

        // Step 4: Delete old WASM file if it exists
        if (contract.wasm_file_path) {
            try {
                await fs.unlink(contract.wasm_file_path);
            } catch (err) {
                console.warn(`[Fetch WASM] ⚠️ Could not delete old WASM file: ${err.message}`);
            }
        }

        // Step 5: Update contract record
        await pool.query(
            `UPDATE custom_contracts
             SET wasm_file_path = $1,
                 wasm_file_name = $2,
                 wasm_hash = $3,
                 wasm_source = 'local',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [filePath, filename, hash, id]
        );

        console.log(`[Fetch WASM] ✅ WASM file saved and contract updated`);

        // Get deploy ledger and date info if available
        let deployLedger = null;
        let deployDate = null;
        try {
            const ledgerInfo = await sorobanServer.getLatestLedger();
            if (ledgerInfo && ledgerInfo.sequence) {
                // Try to get the ledger from the contract instance entry
                const contractIdBytes = StellarSdk.StrKey.decodeContract(contractAddress);
                const contractScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
                const contractDataKey = StellarSdk.xdr.LedgerKey.contractData(
                    new StellarSdk.xdr.LedgerKeyContractData({
                        contract: contractScAddress,
                        key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
                        durability: StellarSdk.xdr.ContractDataDurability.persistent()
                    })
                );
                const ledgerEntries = await sorobanServer.getLedgerEntries(contractDataKey);
                if (ledgerEntries.entries && ledgerEntries.entries.length > 0) {
                    const entry = ledgerEntries.entries[0];
                    if (entry.lastModifiedLedgerSeq) {
                        deployLedger = entry.lastModifiedLedgerSeq;
                        const currentLedger = ledgerInfo.sequence;
                        if (currentLedger > deployLedger) {
                            const ledgerDiff = currentLedger - deployLedger;
                            const estimatedSecondsAgo = ledgerDiff * 5; // ~5 seconds per ledger
                            deployDate = new Date(Date.now() - estimatedSecondsAgo * 1000);
                        }
                    }
                }
            }
        } catch (ledgerError) {
            console.warn(`[Fetch WASM] Could not estimate deploy date: ${ledgerError.message}`);
        }

        // wasmHashHex is already set above from the contract instance

        res.json({
            success: true,
            message: 'WASM file fetched from network and saved successfully',
            wasm_file: {
                path: filePath,
                filename: filename,
                size: wasmBuffer.length,
                hash: hash,
                source: 'local', // WASM fetched from network but stored locally
                network: network
            },
            contract_id: parseInt(id),
            wasm_details: {
                hash: wasmHashHex || hash,
                hash_algorithm: 'sha256',
                size_bytes: wasmBuffer.length,
                size_formatted: wasmBuffer.length < 1024 ? `${wasmBuffer.length} B` : wasmBuffer.length < 1024 * 1024 ? `${(wasmBuffer.length / 1024).toFixed(2)} KB` : `${(wasmBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
                network: network,
                deploy_ledger: deployLedger || null,
                deploy_date: deployDate ? deployDate.toISOString() : null,
                deploy_date_formatted: deployDate ? deployDate.toLocaleString() : null,
                filename: filename,
                source: 'network'
            }
        });
    } catch (error) {
        console.error('[Fetch WASM] ❌ Error fetching WASM from network:', error);
        res.status(500).json({ 
            error: 'Failed to fetch WASM from network', 
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/agent-onboard:
 *   post:
 *     summary: GeoLink Agent - Automated contract onboarding
 *     description: Automatically detects network, fetches WASM, discovers functions, infers contract name, and creates the contract. Returns the created contract for editing and testing.
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
 *     responses:
 *       200:
 *         description: Contract onboarded successfully
 *       400:
 *         description: Invalid contract address format
 *       404:
 *         description: Contract not found on any network
 *       401:
 *         description: Authentication required
 */
router.post('/agent-onboard', authenticateContractUser, async (req, res) => {
    // Set overall request timeout (60 seconds)
    const requestTimeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({ 
                success: false,
                error: 'Request timeout',
                message: 'The onboarding process took too long. Please try again or check the contract address.'
            });
        }
    }, 60000);

    try {
        const { contract_address } = req.body;
        const userId = req.user?.id || req.userId;
        
        if (!userId) {
            clearTimeout(requestTimeout);
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        if (!contract_address) {
            clearTimeout(requestTimeout);
            return res.status(400).json({ error: 'Contract address is required' });
        }

        // Validate contract address format
        if (!/^[A-Z0-9]{56}$/.test(contract_address)) {
            clearTimeout(requestTimeout);
            return res.status(400).json({ error: 'Invalid contract address format. Must be 56 characters, uppercase alphanumeric.' });
        }

        console.log(`[GeoLink Agent] 🤖 Starting automated onboarding for contract ${contract_address}`);

        // Helper function to add timeout to promises
        const withTimeout = (promise, timeoutMs, errorMessage) => {
            return Promise.race([
                promise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
                )
            ]);
        };

        // Step 1: Auto-detect network by trying both testnet and mainnet (with timeout)
        let detectedNetwork = null;
        const networks = ['testnet', 'mainnet'];
        
        try {
            for (const network of networks) {
                try {
                    console.log(`[GeoLink Agent] 🔍 Checking ${network}...`);
                    const verification = await withTimeout(
                        contractIntrospection.verifyContractExists(contract_address, network),
                        15000, // 15 second timeout per network check
                        `Network verification timeout for ${network}`
                    );
                    if (verification && verification.exists) {
                        detectedNetwork = network;
                        console.log(`[GeoLink Agent] ✅ Contract found on ${network}`);
                        break;
                    }
                } catch (err) {
                    console.log(`[GeoLink Agent] ⚠️ Contract not found on ${network}: ${err.message}`);
                    // Continue to next network
                }
            }
        } catch (networkError) {
            console.error(`[GeoLink Agent] ❌ Error during network detection: ${networkError.message}`);
            throw networkError;
        }

        if (!detectedNetwork) {
            clearTimeout(requestTimeout);
            return res.status(404).json({
                success: false,
                error: 'Contract not found',
                message: `The contract address ${contract_address} was not found on testnet or mainnet. Please verify the address.`
            });
        }

        // Step 2: Check if contract already exists (with query timeout) - check for both active and inactive
        const existingContractResult = await pool.query({
            text: `SELECT id, contract_address, network, contract_name, wasm_file_path, discovered_functions, is_active
             FROM custom_contracts
             WHERE contract_address = $1 AND user_id = $2`,
            values: [contract_address, userId],
            statement_timeout: 10000 // 10 second timeout
        });

        let contractId;
        let contract;
        const contractExists = existingContractResult.rows.length > 0;

        if (contractExists) {
            // Contract already exists - we'll update it with new WASM and function data
            contractId = existingContractResult.rows[0].id;
            contract = existingContractResult.rows[0];
            console.log(`[GeoLink Agent] ℹ️ Contract already exists with ID ${contractId}, will update with new WASM and functions`);
        }

        // Step 3: Fetch WASM from network (always fetch, even if contract exists, to update it)
        console.log(`[GeoLink Agent] 📦 Fetching WASM from ${detectedNetwork}...`);
        let sorobanServer;
        let filePath;
        let filename;
        let hash;
        let wasmHashHex = null;
        let wasmSize = null;
        let deployLedger = null;
        let deployDate = null;
        
        try {
            const StellarSdk = require('@stellar/stellar-sdk');
            const contractsConfig = require('../config/contracts');
            const crypto = require('crypto');
            const fs = require('fs').promises;
            const path = require('path');
            
            const rpcUrl = detectedNetwork === 'mainnet'
                ? 'https://soroban.stellar.org'
                : 'https://soroban-testnet.stellar.org';
            
            console.log(`[GeoLink Agent] Connecting to RPC: ${rpcUrl}`);
            sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });

            // Get contract instance to find WASM hash
            console.log(`[GeoLink Agent] Decoding contract address...`);
            const contractIdBytes = StellarSdk.StrKey.decodeContract(contract_address);
            const contractScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);

            const contractDataKey = StellarSdk.xdr.LedgerKey.contractData(
                new StellarSdk.xdr.LedgerKeyContractData({
                    contract: contractScAddress,
                    key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
                    durability: StellarSdk.xdr.ContractDataDurability.persistent()
                })
            );

            console.log(`[GeoLink Agent] Fetching contract instance from network...`);
            const ledgerEntries = await withTimeout(
                sorobanServer.getLedgerEntries(contractDataKey),
                20000, // 20 second timeout for RPC call
                'Timeout fetching contract instance from network'
            );
            
            if (!ledgerEntries.entries || ledgerEntries.entries.length === 0) {
                clearTimeout(requestTimeout);
                return res.status(404).json({ error: 'Contract instance not found on network' });
            }

            // Extract ledger information for deploy date estimation
            const latestLedger = ledgerEntries.latestLedger || null;
            
            // Try to get the ledger number from the entry
            if (ledgerEntries.entries && ledgerEntries.entries.length > 0) {
                // The entry might have lastModifiedLedgerSeq
                const entry = ledgerEntries.entries[0];
                if (entry.lastModifiedLedgerSeq) {
                    deployLedger = entry.lastModifiedLedgerSeq;
                }
            }

            console.log(`[GeoLink Agent] Extracting WASM hash from contract instance...`);
            const contractInstance = ledgerEntries.entries[0].val.contractData().val().instance();
            const wasmHash = contractInstance.executable().wasmHash();

            if (!wasmHash) {
                clearTimeout(requestTimeout);
                return res.status(404).json({ error: 'WASM hash not found in contract instance' });
            }
            
            // Convert WASM hash to hex for display (store for later use)
            wasmHashHex = Buffer.from(wasmHash).toString('hex');

            // Fetch WASM bytecode
            console.log(`[GeoLink Agent] Fetching WASM bytecode from network...`);
            const wasmCodeKey = StellarSdk.xdr.LedgerKey.contractCode(
                new StellarSdk.xdr.LedgerKeyContractCode({
                    hash: wasmHash
                })
            );

            const wasmEntries = await withTimeout(
                sorobanServer.getLedgerEntries(wasmCodeKey),
                20000, // 20 second timeout for RPC call
                'Timeout fetching WASM bytecode from network'
            );
            
            if (!wasmEntries.entries || wasmEntries.entries.length === 0) {
                clearTimeout(requestTimeout);
                return res.status(404).json({ error: 'WASM bytecode not found on network' });
            }

            console.log(`[GeoLink Agent] Extracting WASM data...`);
            const wasmData = wasmEntries.entries[0].val.contractCode().code();
            const wasmBuffer = Buffer.from(wasmData);

            // Save WASM file
            console.log(`[GeoLink Agent] Saving WASM file...`);
            const uploadDir = path.join(__dirname, '../uploads/contract-wasm');
            await fs.mkdir(uploadDir, { recursive: true });

            const timestamp = Date.now();
            filename = `contract-${contract_address.substring(0, 8)}-${timestamp}.wasm`;
            filePath = path.join(uploadDir, filename);

            await fs.writeFile(filePath, wasmBuffer);
            hash = crypto.createHash('sha256').update(wasmBuffer).digest('hex');
            
            // Store WASM buffer size for response
            wasmSize = wasmBuffer.length;
            
            // Get current ledger info for date estimation
            try {
                const ledgerInfo = await sorobanServer.getLatestLedger();
                if (ledgerInfo && ledgerInfo.sequence) {
                    // Estimate deploy date based on ledger sequence
                    // Stellar ledgers close approximately every 5 seconds
                    // This is a rough estimate
                    const currentLedger = ledgerInfo.sequence;
                    if (deployLedger && currentLedger > deployLedger) {
                        const ledgerDiff = currentLedger - deployLedger;
                        const estimatedSecondsAgo = ledgerDiff * 5; // ~5 seconds per ledger
                        deployDate = new Date(Date.now() - estimatedSecondsAgo * 1000);
                    } else if (latestLedger) {
                        // Fallback to latest ledger if we have it
                        const ledgerDiff = currentLedger - latestLedger;
                        const estimatedSecondsAgo = ledgerDiff * 5;
                        deployDate = new Date(Date.now() - estimatedSecondsAgo * 1000);
                    }
                }
            } catch (ledgerError) {
                console.warn(`[GeoLink Agent] Could not estimate deploy date: ${ledgerError.message}`);
            }

            console.log(`[GeoLink Agent] ✅ WASM fetched and saved: ${filename} (${wasmSize} bytes)`);
        } catch (wasmError) {
            clearTimeout(requestTimeout);
            console.error(`[GeoLink Agent] ❌ Error fetching WASM: ${wasmError.message}`);
            console.error(`[GeoLink Agent] Stack: ${wasmError.stack}`);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch WASM from network',
                message: wasmError.message
            });
        }

        // Step 4: Discover functions (with timeout)
            console.log(`[GeoLink Agent] 🔍 Discovering contract functions...`);
            let discoveredFunctions = [];
            try {
                // discoverFunctions signature: (contractAddress, network, wasmFilePath)
                discoveredFunctions = await withTimeout(
                    contractIntrospection.discoverFunctions(contract_address, detectedNetwork, filePath),
                    30000, // 30 second timeout for function discovery
                    'Timeout discovering contract functions'
                );
                console.log(`[GeoLink Agent] ✅ Discovered ${discoveredFunctions.length} functions`);
            } catch (discoverError) {
                console.error(`[GeoLink Agent] ⚠️ Error discovering functions: ${discoverError.message}`);
                console.error(`[GeoLink Agent] Stack: ${discoverError.stack}`);
                // Continue with empty functions array - contract will still be created
                discoveredFunctions = [];
            }

            // Step 5: Infer contract name from interface
            let inferredName = null;
            if (Array.isArray(discoveredFunctions) && discoveredFunctions.length > 0) {
                // Try to infer name from function names (common patterns)
                const functionNames = discoveredFunctions.map(f => f.name || '').join(' ').toLowerCase();
                
                // Common contract name patterns
                if (functionNames.includes('mint') || functionNames.includes('nft')) {
                    inferredName = 'NFT Contract';
                } else if (functionNames.includes('payment') || functionNames.includes('pay')) {
                    inferredName = 'Payment Contract';
                } else if (functionNames.includes('token')) {
                    inferredName = 'Token Contract';
                } else if (functionNames.includes('wallet') || functionNames.includes('smart')) {
                    inferredName = 'Smart Wallet Contract';
                } else if (functionNames.includes('location') || functionNames.includes('geo')) {
                    inferredName = 'Location Contract';
                } else {
                    // Use first function name or contract address prefix
                    const firstFunc = discoveredFunctions.find(f => f.name);
                    inferredName = firstFunc ? `${firstFunc.name.charAt(0).toUpperCase() + firstFunc.name.slice(1)} Contract` : `Contract ${contract_address.substring(0, 8)}`;
                }
            } else {
                inferredName = `Contract ${contract_address.substring(0, 8)}`;
            }

        console.log(`[GeoLink Agent] 📝 Inferred contract name: ${inferredName}`);

        // Step 6: Create or update contract
        const functionsToSave = Array.isArray(discoveredFunctions) 
            ? discoveredFunctions.reduce((acc, func) => {
                acc[func.name || 'unknown'] = {
                    ...func,
                    parameters: Array.isArray(func.parameters) ? func.parameters : [],
                    return_type: func.return_type || 'void',
                    discovered: func.discovered !== undefined ? func.discovered : true,
                    note: func.note || 'Extracted from contract spec'
                };
                return acc;
            }, {})
            : {};

        // Use UPSERT pattern: INSERT with ON CONFLICT to handle existing contracts
        const upsertResult = await pool.query({
            text: `INSERT INTO custom_contracts (
                user_id, contract_address, contract_name, network,
                wasm_file_path, wasm_file_name, wasm_hash, wasm_source,
                discovered_functions, function_mappings, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, contract_address) 
            DO UPDATE SET
                contract_name = EXCLUDED.contract_name,
                network = EXCLUDED.network,
                wasm_file_path = EXCLUDED.wasm_file_path,
                wasm_file_name = EXCLUDED.wasm_file_name,
                wasm_hash = EXCLUDED.wasm_hash,
                wasm_source = EXCLUDED.wasm_source,
                discovered_functions = EXCLUDED.discovered_functions,
                is_active = true,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, contract_address, contract_name, network, wasm_file_name, discovered_functions, function_mappings`,
            values: [
                userId,
                contract_address,
                inferredName,
                detectedNetwork,
                filePath,
                filename,
                hash,
                'local', // WASM fetched from network but stored locally
                JSON.stringify(functionsToSave),
                JSON.stringify({})
            ],
            statement_timeout: 10000 // 10 second timeout
        });

        contract = upsertResult.rows[0];
        contractId = contract.id;

        console.log(`[GeoLink Agent] ✅ Contract ${contractExists ? 'updated' : 'created'} with ID ${contractId}`);

        // Parse discovered functions for response
        let discoveredFunctionsArray = [];
        if (contract.discovered_functions) {
            try {
                const functions = typeof contract.discovered_functions === 'string' 
                    ? JSON.parse(contract.discovered_functions)
                    : contract.discovered_functions;
                
                discoveredFunctionsArray = Array.isArray(functions)
                    ? functions
                    : Object.values(functions || {});
            } catch (e) {
                console.error('[GeoLink Agent] Error parsing discovered_functions:', e);
            }
        }

        clearTimeout(requestTimeout);
        res.json({
            success: true,
            message: `Contract onboarded successfully on ${detectedNetwork}`,
            contract: {
                id: contract.id,
                contract_address: contract.contract_address,
                contract_name: contract.contract_name,
                network: contract.network || detectedNetwork,
                wasm_file_name: contract.wasm_file_name,
                discovered_functions: discoveredFunctionsArray,
                function_mappings: typeof contract.function_mappings === 'string' 
                    ? JSON.parse(contract.function_mappings) 
                    : contract.function_mappings
            },
            detected_network: detectedNetwork,
            functions_count: discoveredFunctionsArray.length,
            wasm_details: {
                hash: wasmHashHex || hash,
                hash_algorithm: 'sha256',
                size_bytes: wasmSize || null,
                size_formatted: wasmSize ? (wasmSize < 1024 ? `${wasmSize} B` : wasmSize < 1024 * 1024 ? `${(wasmSize / 1024).toFixed(2)} KB` : `${(wasmSize / (1024 * 1024)).toFixed(2)} MB`) : null,
                network: detectedNetwork,
                deploy_ledger: deployLedger || null,
                deploy_date: deployDate ? deployDate.toISOString() : null,
                deploy_date_formatted: deployDate ? deployDate.toLocaleString() : null,
                filename: filename,
                source: 'network'
            }
        });
    } catch (error) {
        clearTimeout(requestTimeout);
        console.error('[GeoLink Agent] ❌ Error during automated onboarding:', error);
        console.error('[GeoLink Agent] Error stack:', error.stack);
        console.error('[GeoLink Agent] Error details:', {
            message: error.message,
            name: error.name,
            contract_address: req.body?.contract_address,
            userId: req.user?.id || req.userId
        });
        
        // Don't send response if headers already sent
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                error: 'Failed to onboard contract',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
});

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

        // Auto-populate smart_wallet_contract_id from config if use_smart_wallet is true and it's not provided
        const contractsConfig = require('../config/contracts');
        if (use_smart_wallet && (!smart_wallet_contract_id || smart_wallet_contract_id === null || smart_wallet_contract_id === '')) {
            smart_wallet_contract_id = contractsConfig.SMART_WALLET_CONTRACT_ID;
            console.log(`[Contracts] Auto-populated smart_wallet_contract_id from config: ${smart_wallet_contract_id}`);
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

        // Auto-populate smart_wallet_contract_id from config if use_smart_wallet is true and it's not provided
        const contractsConfig = require('../config/contracts');
        if (use_smart_wallet && (!smart_wallet_contract_id || smart_wallet_contract_id === null || smart_wallet_contract_id === '')) {
            smart_wallet_contract_id = contractsConfig.SMART_WALLET_CONTRACT_ID;
            console.log(`[Contracts PUT] Auto-populated smart_wallet_contract_id from config: ${smart_wallet_contract_id}`);
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
            
            // If use_smart_wallet is being set to true and smart_wallet_contract_id is not provided,
            // auto-populate it from config
            if (use_smart_wallet && (smart_wallet_contract_id === undefined || smart_wallet_contract_id === null || smart_wallet_contract_id === '')) {
                smart_wallet_contract_id = contractsConfig.SMART_WALLET_CONTRACT_ID;
                console.log(`[Contracts PUT] Auto-populated smart_wallet_contract_id from config when enabling use_smart_wallet: ${smart_wallet_contract_id}`);
            }
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
// Public endpoint to get all active contracts (for browsing)
router.get('/public', async (req, res) => {
    try {
        const query = `SELECT cc.id, cc.contract_address, cc.contract_name, cc.network, 
                cc.discovered_functions, cc.function_mappings, cc.use_smart_wallet,
                cc.smart_wallet_contract_id, cc.payment_function_name, cc.requires_webauthn,
                cc.webauthn_verifier_contract_id, 
                cc.wasm_file_name, cc.wasm_file_size, cc.wasm_source, cc.wasm_hash, cc.wasm_uploaded_at,
                cc.created_at, cc.updated_at, cc.is_active,
                u.public_key as owner_public_key
         FROM custom_contracts cc
         JOIN users u ON cc.user_id = u.id
         WHERE cc.is_active = true
         ORDER BY cc.created_at DESC`;

        const result = await pool.query(query);

        res.json({
            success: true,
            contracts: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching public contracts:', error);
        res.status(500).json({ 
            error: 'Failed to fetch contracts',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/nearby:
 *   get:
 *     summary: Get nearby smart contract execution rules
 *     description: Returns active contract execution rules within a specified radius of given coordinates. Public endpoint for data consumers (xyz-wallet).
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *         description: Latitude of the center point
 *         example: 34.0164
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *         description: Longitude of the center point
 *         example: -118.4951
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 1000
 *           minimum: 1
 *           maximum: 100000
 *         description: Search radius in meters (default 1000)
 *         example: 1000
 *     responses:
 *       200:
 *         description: List of nearby contract execution rules
 */
// Get nearby smart contract execution rules - Public endpoint (for xyz-wallet data consumers)
// NOTE: This route MUST be defined BEFORE /:id to avoid route conflicts
router.get('/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        // Get contract execution rules within radius using PostGIS
        // Include BOTH active and inactive rules (like nearbyNFTs endpoint)
        // Inactive rules are still visible in the data feed but marked as inactive
        const result = await pool.query(`
            SELECT 
                cer.id,
                cer.rule_name,
                cer.rule_type,
                cer.center_latitude as latitude,
                cer.center_longitude as longitude,
                cer.radius_meters,
                cer.function_name,
                cer.trigger_on,
                cer.auto_execute,
                cer.is_active,
                cc.contract_name,
                cc.contract_address,
                cc.network,
                cc.requires_webauthn,
                cc.use_smart_wallet,
                cc.function_mappings,
                cc.discovered_functions,
                ST_Distance(
                    ST_Point($2, $1)::geography,
                    ST_Point(cer.center_longitude, cer.center_latitude)::geography
                ) as distance
            FROM contract_execution_rules cer
            LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE cer.rule_type = 'location'
                AND cer.center_latitude IS NOT NULL 
                AND cer.center_longitude IS NOT NULL
                -- Show both active and inactive rules (inactive still visible in data feed)
                -- Only filter out if contract itself is inactive
                AND (cc.is_active = true OR cc.is_active IS NULL)
                AND ST_DWithin(
                    ST_Point($2, $1)::geography,
                    ST_Point(cer.center_longitude, cer.center_latitude)::geography,
                    $3
                )
            ORDER BY distance ASC
        `, [latitude, longitude, radius]);

        const formattedContracts = result.rows.map(rule => ({
            id: rule.id,
            rule_name: rule.rule_name,
            rule_type: rule.rule_type,
            contract_name: rule.contract_name,
            contract_address: rule.contract_address,
            function_name: rule.function_name,
            latitude: parseFloat(rule.latitude),
            longitude: parseFloat(rule.longitude),
            radius_meters: rule.radius_meters ? parseFloat(rule.radius_meters) : null,
            distance: rule.distance ? parseFloat(rule.distance) : null,
            network: rule.network,
            trigger_on: rule.trigger_on,
            auto_execute: rule.auto_execute,
            requires_webauthn: rule.requires_webauthn || false,
            use_smart_wallet: rule.use_smart_wallet || false,
            function_mappings: typeof rule.function_mappings === 'string' 
                ? JSON.parse(rule.function_mappings) 
                : rule.function_mappings,
            discovered_functions: typeof rule.discovered_functions === 'string'
                ? JSON.parse(rule.discovered_functions)
                : rule.discovered_functions
        }));

        res.json({
            contracts: formattedContracts,
            count: formattedContracts.length,
            search_center: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
            radius: parseInt(radius)
        });
    } catch (error) {
        console.error('Error fetching nearby contracts:', error);
        res.status(500).json({ error: 'Failed to fetch nearby contracts' });
    }
});

// Authenticated endpoint to get user's contracts (for management)
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

        const result = await pool.query({
            text: query,
            values: params,
            statement_timeout: 15000 // 15 second timeout for complex queries
        });

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
            quorum_type = 'any',
            // Rate limiting
            max_executions_per_public_key = null,
            execution_time_window_seconds = null,
            // Time-based triggers
            min_location_duration_seconds = null,
            // Auto-deactivation
            auto_deactivate_on_balance_threshold = false,
            balance_threshold_xlm = null,
            balance_check_asset_address = null,
            use_smart_wallet_balance = false,
            // Submit read-only to ledger
            submit_readonly_to_ledger = false
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
                required_wallet_public_keys, minimum_wallet_count, quorum_type,
                max_executions_per_public_key, execution_time_window_seconds,
                min_location_duration_seconds, auto_deactivate_on_balance_threshold,
                balance_threshold_xlm, balance_check_asset_address, use_smart_wallet_balance,
                submit_readonly_to_ledger
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
            RETURNING *
        `, [
            userId, contract_id, rule_name, rule_type,
            center_latitude || null, center_longitude || null, radius_meters || null, geofence_id || null,
            function_name, JSON.stringify(function_parameters), trigger_on,
            auto_execute, requires_confirmation, target_wallet_public_key,
            required_wallet_public_keys ? JSON.stringify(required_wallet_public_keys) : null,
            minimum_wallet_count, quorum_type,
            max_executions_per_public_key, execution_time_window_seconds,
            min_location_duration_seconds, auto_deactivate_on_balance_threshold,
            balance_threshold_xlm, balance_check_asset_address, use_smart_wallet_balance,
            submit_readonly_to_ledger
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
// Public endpoint to get all active execution rules (for browsing)
router.get('/rules/public', async (req, res) => {
    try {
        const { contract_id, is_active } = req.query;

        let query = `
            SELECT cer.*, 
                   cc.contract_address, 
                   cc.contract_name,
                   g.name as geofence_name,
                   u.public_key as owner_public_key
            FROM contract_execution_rules cer
            LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
            LEFT JOIN geofences g ON cer.geofence_id = g.id
            JOIN users u ON cer.user_id = u.id
            WHERE cc.is_active = true
        `;
        const params = [];
        let paramIndex = 1;

        if (contract_id) {
            query += ` AND cer.contract_id = $${paramIndex}`;
            params.push(contract_id);
            paramIndex++;
        }

        if (is_active !== undefined) {
            query += ` AND cer.is_active = $${paramIndex}`;
            params.push(is_active === 'true' || is_active === true);
            paramIndex++;
        } else {
            // Default to only active rules for public view
            query += ` AND cer.is_active = true`;
        }

        query += ` ORDER BY cer.created_at DESC`;

        const result = await pool.query({
            text: query,
            values: params,
            statement_timeout: 15000 // 15 second timeout for complex queries
        });

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
        console.error('Error fetching public execution rules:', error);
        res.status(500).json({ 
            error: 'Failed to fetch execution rules',
            message: error.message 
        });
    }
});

// Authenticated endpoint to get user's execution rules
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

        const result = await pool.query({
            text: query,
            values: params,
            statement_timeout: 15000 // 15 second timeout for complex queries
        });

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
        
        // console.log(`[PendingRules] Extracted values:`, {
        //     userId: userId,
        //     userId_type: typeof userId,
        //     publicKey: publicKey?.substring(0, 8) + '...',
        //     publicKey_type: typeof publicKey,
        //     req_user_id: req.user?.id,
        //     req_userId: req.userId,
        //     has_both: !!(publicKey && userId)
        // });
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by both user_id AND public_key when both available (OR logic for multi-role users)
        // This ensures we get all records regardless of which role was active when created
        let query, params;
        if (publicKey && userId) {
            query = `
                SELECT 
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
                    luq.execution_results,
                    -- Extract matched_public_key from execution_results for this specific rule
                    COALESCE(
                        (SELECT result->>'matched_public_key' 
                         FROM jsonb_array_elements(luq.execution_results) AS result 
                         WHERE (result->>'rule_id')::integer = cer.id 
                           AND result->>'skipped' = 'true' 
                           AND result->>'reason' = 'requires_webauthn'
                         LIMIT 1),
                        luq.public_key
                    ) as matched_public_key
                FROM location_update_queue luq
                JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
                JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE (luq.public_key = $1 OR luq.user_id = $2)
                    AND cer.function_name NOT ILIKE '%deposit%'
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND EXISTS (
                        SELECT 1 
                        FROM jsonb_array_elements(luq.execution_results) AS result
                        WHERE result->>'skipped' = 'true'
                        AND result->>'reason' = 'requires_webauthn'
                        AND (result->>'rule_id')::integer = cer.id
                        AND COALESCE((result->>'rejected')::boolean, false) = false
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
                        AND (
                            result->>'matched_public_key' = luq.public_key 
                            OR result->>'matched_public_key' IS NULL
                        )
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS completed_result
                        WHERE (completed_result->>'rule_id')::integer = cer.id
                        AND COALESCE((completed_result->>'completed')::boolean, false) = true
                        AND (
                            completed_result->>'matched_public_key' = luq.public_key
                            OR COALESCE(completed_result->>'matched_public_key', luq.public_key) = luq.public_key
                            OR completed_result->>'matched_public_key' IS NULL
                        )
                    )
                    -- Exclude pending rules if there's a newer completed execution for the same rule+key
                    AND NOT EXISTS (
                        SELECT 1
                        FROM location_update_queue luq2
                        CROSS JOIN jsonb_array_elements(luq2.execution_results) AS newer_completed
                        WHERE (newer_completed->>'rule_id')::integer = cer.id
                            AND COALESCE((newer_completed->>'completed')::boolean, false) = true
                            AND (
                                (luq2.public_key = luq.public_key)
                                OR (luq2.user_id = luq.user_id)
                            )
                            AND (
                                COALESCE(newer_completed->>'matched_public_key', luq2.public_key) = 
                                COALESCE((SELECT result->>'matched_public_key' FROM jsonb_array_elements(luq.execution_results) AS result WHERE (result->>'rule_id')::integer = cer.id AND result->>'skipped' = 'true' LIMIT 1), luq.public_key)
                            )
                            AND luq2.received_at > luq.received_at
                    )
                    -- Exclude very old entries (older than 7 days) - they should be cleaned up
                    AND luq.received_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    -- Also exclude entries that have been marked as superseded (even if not 7 days old yet)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS superseded_result
                        WHERE (superseded_result->>'rule_id')::integer = cer.id
                            AND (superseded_result->>'reason')::text = 'superseded_by_newer_execution'
                            AND COALESCE((superseded_result->>'skipped')::boolean, false) = true
                    )
                    AND (
                        -- Only apply rate limit check if rule has rate limiting configured
                        cer.max_executions_per_public_key IS NULL 
                        OR cer.execution_time_window_seconds IS NULL
                        OR cer.max_executions_per_public_key = 0
                        OR cer.execution_time_window_seconds = 0
                        OR (
                            -- Check if rule has been executed recently (within time window)
                            -- Use matched_public_key from execution_results, fallback to luq.public_key
                            SELECT COUNT(*)
                            FROM rule_execution_history reh
                            WHERE reh.rule_id = cer.id
                                AND reh.public_key = COALESCE(
                                    (SELECT result->>'matched_public_key' 
                                     FROM jsonb_array_elements(luq.execution_results) AS result 
                                     WHERE (result->>'rule_id')::integer = cer.id 
                                       AND result->>'skipped' = 'true' 
                                     LIMIT 1),
                                    luq.public_key
                                )
                                AND reh.last_execution_at >= CURRENT_TIMESTAMP - (COALESCE(cer.execution_time_window_seconds, 0) || ' seconds')::INTERVAL
                        ) < cer.max_executions_per_public_key
                    )
                ORDER BY luq.received_at DESC, cer.id, luq.public_key
                LIMIT $3
            `;
            params = [publicKey, userId, parseInt(limit)];
        } else if (publicKey) {
            query = `
                SELECT
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
                WHERE luq.public_key = $1
                    AND cer.function_name NOT ILIKE '%deposit%'
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND EXISTS (
                        SELECT 1 
                        FROM jsonb_array_elements(luq.execution_results) AS result
                        WHERE result->>'skipped' = 'true'
                        AND result->>'reason' = 'requires_webauthn'
                        AND (result->>'rule_id')::integer = cer.id
                        AND COALESCE((result->>'rejected')::boolean, false) = false
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
                        AND (
                            result->>'matched_public_key' = luq.public_key 
                            OR result->>'matched_public_key' IS NULL
                        )
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS completed_result
                        WHERE (completed_result->>'rule_id')::integer = cer.id
                        AND COALESCE((completed_result->>'completed')::boolean, false) = true
                        AND (
                            completed_result->>'matched_public_key' = luq.public_key
                            OR COALESCE(completed_result->>'matched_public_key', luq.public_key) = luq.public_key
                            OR completed_result->>'matched_public_key' IS NULL
                        )
                    )
                    -- Exclude pending rules if there's a newer completed execution for the same rule+key
                    AND NOT EXISTS (
                        SELECT 1
                        FROM location_update_queue luq2
                        CROSS JOIN jsonb_array_elements(luq2.execution_results) AS newer_completed
                        WHERE (newer_completed->>'rule_id')::integer = cer.id
                            AND COALESCE((newer_completed->>'completed')::boolean, false) = true
                            AND (
                                COALESCE(newer_completed->>'matched_public_key', luq2.public_key) = 
                                COALESCE((SELECT result->>'matched_public_key' FROM jsonb_array_elements(luq.execution_results) AS result WHERE (result->>'rule_id')::integer = cer.id LIMIT 1), luq.public_key)
                            )
                            AND luq2.public_key = $1
                            AND luq2.received_at > luq.received_at
                    )
                    AND (
                        -- Only apply rate limit check if rule has rate limiting configured
                        cer.max_executions_per_public_key IS NULL 
                        OR cer.execution_time_window_seconds IS NULL
                        OR cer.max_executions_per_public_key = 0
                        OR cer.execution_time_window_seconds = 0
                        OR (
                            -- Check if rule has been executed recently (within time window)
                            -- Use matched_public_key from execution_results, fallback to luq.public_key
                            SELECT COUNT(*)
                            FROM rule_execution_history reh
                            WHERE reh.rule_id = cer.id
                                AND reh.public_key = COALESCE(
                                    (SELECT result->>'matched_public_key' 
                                     FROM jsonb_array_elements(luq.execution_results) AS result 
                                     WHERE (result->>'rule_id')::integer = cer.id 
                                       AND result->>'skipped' = 'true' 
                                     LIMIT 1),
                                    luq.public_key
                                )
                                AND reh.last_execution_at >= CURRENT_TIMESTAMP - (COALESCE(cer.execution_time_window_seconds, 0) || ' seconds')::INTERVAL
                        ) < cer.max_executions_per_public_key
                    )
                ORDER BY luq.received_at DESC, cer.id, luq.public_key
                LIMIT $2
            `;
            params = [publicKey, parseInt(limit)];
        } else {
            if (!userId) {
                return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
            }
            query = `
                SELECT 
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
                    luq.execution_results,
                    -- Extract matched_public_key from execution_results for this specific rule
                    COALESCE(
                        (SELECT result->>'matched_public_key' 
                         FROM jsonb_array_elements(luq.execution_results) AS result 
                         WHERE (result->>'rule_id')::integer = cer.id 
                           AND result->>'skipped' = 'true' 
                           AND result->>'reason' = 'requires_webauthn'
                         LIMIT 1),
                        luq.public_key
                    ) as matched_public_key
                FROM location_update_queue luq
                JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
                JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE luq.user_id = $1
                    AND cer.function_name NOT ILIKE '%deposit%'
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND EXISTS (
                        SELECT 1 
                        FROM jsonb_array_elements(luq.execution_results) AS result
                        WHERE result->>'skipped' = 'true'
                        AND result->>'reason' = 'requires_webauthn'
                        AND (result->>'rule_id')::integer = cer.id
                        AND COALESCE((result->>'rejected')::boolean, false) = false
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
                        AND (
                            result->>'matched_public_key' = luq.public_key 
                            OR result->>'matched_public_key' IS NULL
                        )
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS completed_result
                        WHERE (completed_result->>'rule_id')::integer = cer.id
                        AND COALESCE((completed_result->>'completed')::boolean, false) = true
                        AND (
                            completed_result->>'matched_public_key' = luq.public_key
                            OR COALESCE(completed_result->>'matched_public_key', luq.public_key) = luq.public_key
                            OR completed_result->>'matched_public_key' IS NULL
                        )
                    )
                    -- Exclude pending rules if there's a newer completed execution for the same rule+key
                    AND NOT EXISTS (
                        SELECT 1
                        FROM location_update_queue luq2
                        CROSS JOIN jsonb_array_elements(luq2.execution_results) AS newer_completed
                        WHERE (newer_completed->>'rule_id')::integer = cer.id
                            AND COALESCE((newer_completed->>'completed')::boolean, false) = true
                            AND (
                                COALESCE(newer_completed->>'matched_public_key', luq2.public_key) = 
                                COALESCE((SELECT result->>'matched_public_key' FROM jsonb_array_elements(luq.execution_results) AS result WHERE (result->>'rule_id')::integer = cer.id LIMIT 1), luq.public_key)
                            )
                            AND luq2.user_id = $1
                            AND luq2.received_at > luq.received_at
                    )
                    AND (
                        -- Only apply rate limit check if rule has rate limiting configured
                        cer.max_executions_per_public_key IS NULL 
                        OR cer.execution_time_window_seconds IS NULL
                        OR cer.max_executions_per_public_key = 0
                        OR cer.execution_time_window_seconds = 0
                        OR (
                            -- Check if rule has been executed recently (within time window)
                            -- Use matched_public_key from execution_results, fallback to luq.public_key
                            SELECT COUNT(*)
                            FROM rule_execution_history reh
                            WHERE reh.rule_id = cer.id
                                AND reh.public_key = COALESCE(
                                    (SELECT result->>'matched_public_key' 
                                     FROM jsonb_array_elements(luq.execution_results) AS result 
                                     WHERE (result->>'rule_id')::integer = cer.id 
                                       AND result->>'skipped' = 'true' 
                                     LIMIT 1),
                                    luq.public_key
                                )
                                AND reh.last_execution_at >= CURRENT_TIMESTAMP - (COALESCE(cer.execution_time_window_seconds, 0) || ' seconds')::INTERVAL
                        ) < cer.max_executions_per_public_key
                    )
                ORDER BY luq.received_at DESC, cer.id, luq.public_key
                LIMIT $2
            `;
            params = [userId, parseInt(limit)];
        }

        // console.log(`[PendingRules] Executing query with params:`, {
        //     params_count: params.length,
        //     params: params.map((p, i) => i === 0 && typeof p === 'string' && p.length > 8 ? p.substring(0, 8) + '...' : p),
        //     using_or_logic: !!(publicKey && userId),
        //     query_preview: query.substring(0, 200) + '...'
        // });
        

        let result;
        try {
            // Add query timeout to prevent hanging
            const client = await pool.connect();
            try {
                await client.query('SET statement_timeout = 10000'); // 10 seconds
                result = await client.query(query, params);
            } finally {
                client.release();
            }
        } catch (queryError) {
            console.error('[PendingRules] ❌ Query error:', {
                error: queryError.message,
                stack: queryError.stack,
                query_preview: query.substring(0, 200)
            });
            return res.status(500).json({ 
                error: 'Failed to fetch pending rules', 
                details: queryError.message 
            });
        }
        
        // const identifier = (publicKey && userId) ? `public_key=${publicKey?.substring(0, 8)}... OR user_id=${userId}` : (publicKey ? publicKey?.substring(0, 8) + '...' : userId);
        // const filterType = (publicKey && userId) ? 'public_key OR user_id' : (publicKey ? 'public_key' : 'user_id');
        // console.log(`[PendingRules] Query returned ${result.rows.length} row(s) for ${filterType} ${identifier}`);
        // if (result.rows.length > 0) {
        //     console.log(`[PendingRules] Sample rows:`, result.rows.slice(0, 3).map(row => ({
        //         rule_id: row.rule_id,
        //         public_key: row.public_key?.substring(0, 8) + '...',
        //         update_id: row.update_id,
        //         has_execution_results: !!row.execution_results
        //     })));
        //     
        //     // Check for rule_id 2 specifically
        //     const rule2Rows = result.rows.filter(r => r.rule_id === 2);
        //     if (rule2Rows.length > 0) {
        //         console.log(`[PendingRules] 🔍 Found ${rule2Rows.length} row(s) with rule_id 2:`, rule2Rows.map(row => ({
        //             update_id: row.update_id,
        //             public_key: row.public_key?.substring(0, 8) + '...',
        //             execution_results_preview: row.execution_results ? JSON.stringify(
        //                 (typeof row.execution_results === 'string' ? JSON.parse(row.execution_results) : row.execution_results)
        //                     .filter(r => r.rule_id === 2)
        //                     .map(r => ({ completed: r.completed, skipped: r.skipped, matched_public_key: r.matched_public_key }))
        //             ) : 'null'
        //         })));
        //     }
        // } else {
        //     // Debug: Check if there are any matching records at all
        //     const debugQuery = publicKey && userId 
        //         ? `SELECT COUNT(*) as count FROM location_update_queue WHERE (public_key = $1 OR user_id = $2) AND status IN ('matched', 'executed')`
        //         : publicKey
        //             ? `SELECT COUNT(*) as count FROM location_update_queue WHERE public_key = $1 AND status IN ('matched', 'executed')`
        //             : `SELECT COUNT(*) as count FROM location_update_queue WHERE user_id = $1 AND status IN ('matched', 'executed')`;
        //     const debugParams = publicKey && userId ? [publicKey, userId] : publicKey ? [publicKey] : [userId];
        //     const debugResult = await pool.query(debugQuery, debugParams);
        //     console.log(`[PendingRules] Debug: Found ${debugResult.rows[0]?.count || 0} location_update_queue entries matching criteria`);
        // }

        // Process results to extract skipped rules
        // Each public key should have its own pending rule entry
        const pendingRules = [];
        const processedKeys = new Set();
        
        // Commented out verbose logs - only show summary at the end
        // console.log(`[PendingRules] 📊 Processing ${result.rows.length} database row(s) to extract pending rules...`); // Track rule_id + public_key combinations

        // console.log(`[PendingRules] 📊 Query returned ${result.rows.length} row(s) for ${publicKey ? `public_key ${publicKey.substring(0, 8)}...` : ''}${userId ? ` OR user_id ${userId}` : ''}`);
        
        // Log rule settings for first few rows
        if (result.rows.length > 0) {
            const sampleRows = result.rows.slice(0, 3);
            for (const row of sampleRows) {
                const ruleSettingsQuery = await pool.query(
                    `SELECT max_executions_per_public_key, execution_time_window_seconds, min_location_duration_seconds 
                     FROM contract_execution_rules WHERE id = $1`,
                    [row.rule_id]
                );
                const ruleSettings = ruleSettingsQuery.rows[0] || {};
                
                // Check rate limit status - use matched_public_key from execution_results if available
                let rateLimitStatus = null;
                if (ruleSettings.max_executions_per_public_key && ruleSettings.execution_time_window_seconds) {
                    // Extract matched_public_key from execution_results
                    let executionResults = [];
                    try {
                        executionResults = typeof row.execution_results === 'string'
                            ? JSON.parse(row.execution_results)
                            : row.execution_results || [];
                    } catch (e) {
                        // Ignore parse errors
                    }
                    const skippedResult = executionResults.find(r => 
                        r.rule_id === row.rule_id && 
                        r.skipped === true && 
                        r.reason === 'requires_webauthn'
                    );
                    const keyForRateLimit = skippedResult?.matched_public_key || row.public_key;
                    
                    const rateLimitCheckQuery = await pool.query(
                        `SELECT COUNT(*) as count, MAX(last_execution_at) as last_execution
                         FROM rule_execution_history
                         WHERE rule_id = $1 AND public_key = $2
                           AND last_execution_at >= CURRENT_TIMESTAMP - ($3 || ' seconds')::INTERVAL`,
                        [row.rule_id, keyForRateLimit, ruleSettings.execution_time_window_seconds]
                    );
                    const execCount = parseInt(rateLimitCheckQuery.rows[0]?.count || 0);
                    const lastExecution = rateLimitCheckQuery.rows[0]?.last_execution;
                    rateLimitStatus = {
                        current_count: execCount,
                        max_allowed: ruleSettings.max_executions_per_public_key,
                        time_window_seconds: ruleSettings.execution_time_window_seconds,
                        last_execution: lastExecution,
                        within_limit: execCount < ruleSettings.max_executions_per_public_key,
                        checked_public_key: keyForRateLimit?.substring(0, 8) + '...',
                        queue_public_key: row.public_key?.substring(0, 8) + '...'
                    };
                }
                
                // Commented out verbose rule settings log - only show summary at the end
                // console.log(`[PendingRules] ⚙️ Rule ${row.rule_id} (${row.rule_name}) settings:`, {
                //     rule_id: row.rule_id,
                //     rule_name: row.rule_name,
                //     max_executions_per_public_key: ruleSettings.max_executions_per_public_key || 'NULL',
                //     execution_time_window_seconds: ruleSettings.execution_time_window_seconds || 'NULL',
                //     min_location_duration_seconds: ruleSettings.min_location_duration_seconds || 'NULL',
                //     rate_limit_status: rateLimitStatus,
                //     update_id: row.update_id,
                //     received_at: row.received_at,
                //     public_key: row.public_key?.substring(0, 8) + '...'
                // });
            }
        }

        for (const row of result.rows) {
            // Create unique key from rule_id + public_key to ensure each public key gets its own pending entry
            const uniqueKey = `${row.rule_id}_${row.public_key}`;
            if (processedKeys.has(uniqueKey)) continue;
            processedKeys.add(uniqueKey);

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
                r.reason === 'requires_webauthn' &&
                !r.completed &&
                !r.rejected
            );

            // Debug logging (commented out to reduce log noise)
            // if (row.rule_id === 2) {
            //     console.log(`[PendingRules] 🔍 Processing row for rule_id 2:`, {
            //         update_id: row.update_id,
            //         public_key: row.public_key?.substring(0, 8) + '...',
            //         execution_results_count: executionResults.length,
            //         rule_2_results: executionResults.filter(r => r.rule_id === 2).map(r => ({
            //             skipped: r.skipped,
            //             completed: r.completed,
            //             rejected: r.rejected,
            //             matched_public_key: r.matched_public_key
            //         })),
            //         found_skipped_result: !!skippedResult,
            //         skipped_result_completed: skippedResult?.completed
            //     });
            // }

            // Skip if no pending result found (all instances are completed or rejected)
            if (!skippedResult) {
                // Commented out verbose skip log
                // if (row.rule_id === 2) {
                //     console.log(`[PendingRules] ⏭️ Skipping row for rule_id 2 (update_id: ${row.update_id}) - no pending result found (all completed or rejected)`);
                // }
                continue;
            }

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

                // Populate parameters with matched data and mark system-generated ones
                const mapping = functionMappings?.[row.function_name];
                const populatedParams = { ...functionParams };
                const systemGenerated = {}; // Track which parameters are system-generated
                
                if (mapping?.parameters) {
                    for (const param of mapping.parameters) {
                        const paramName = param.name;
                        const paramType = param.type || param.parameter_type || '';
                        
                        if (param.mapped_from === 'latitude') {
                            populatedParams[paramName] = parseFloat(row.latitude);
                            systemGenerated[paramName] = true;
                        } else if (param.mapped_from === 'longitude') {
                            populatedParams[paramName] = parseFloat(row.longitude);
                            systemGenerated[paramName] = true;
                        } else if (param.mapped_from === 'user_public_key') {
                            // Use the matched wallet's public key (from location_update_queue)
                            populatedParams[paramName] = row.public_key || skippedResult.matched_public_key || '';
                            systemGenerated[paramName] = true;
                        } else if (paramName === 'signer_address' && (paramType === 'Address' || paramType === 'address')) {
                            // Will be auto-populated from user's public key (the wallet executing the payment)
                            // NOT the destination address
                            const currentValue = populatedParams[paramName];
                            const matchedPublicKey = row.public_key || skippedResult.matched_public_key;
                            // If signer_address is set to the destination address, reset it
                            if (typeof currentValue === 'string' && currentValue === matchedPublicKey) {
                                // This is incorrectly set to destination - reset it
                                populatedParams[paramName] = '[Will be system-generated from your wallet]';
                                systemGenerated[paramName] = true;
                            } else if (!populatedParams[paramName]) {
                                populatedParams[paramName] = '[Will be system-generated from your wallet]';
                                systemGenerated[paramName] = true;
                            }
                        } else if (paramName === 'destination' && (paramType === 'Address' || paramType === 'address')) {
                            // Pre-fill with matched public key if not already set
                            const matchedPublicKey = row.public_key || skippedResult.matched_public_key;
                            if (matchedPublicKey && (!populatedParams[paramName] || populatedParams[paramName] === '')) {
                                populatedParams[paramName] = matchedPublicKey;
                                systemGenerated[paramName] = true;
                            }
                        } else if (paramName === 'asset' && (paramType === 'Address' || paramType === 'address')) {
                            // Pre-fill with XLM contract address if not set
                            if (!populatedParams[paramName] || populatedParams[paramName] === 'XLM' || populatedParams[paramName] === 'native') {
                                populatedParams[paramName] = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                                systemGenerated[paramName] = true;
                            }
                        } else if (paramName === 'amount' && (paramType === 'I128' || paramType === 'i128')) {
                            // Keep existing amount or mark as required
                            if (!populatedParams[paramName]) {
                                populatedParams[paramName] = '[Required - set in rule]';
                            }
                        } else if (paramName.includes('webauthn') || (paramName.includes('signature') && paramName !== 'signature_payload')) {
                            // WebAuthn parameters are always system-generated
                            // Check if it's incorrectly set to an address (starts with G or C) and reset it
                            const currentValue = populatedParams[paramName];
                            if (typeof currentValue === 'string' && (currentValue.startsWith('G') || currentValue.startsWith('C'))) {
                                // This is incorrectly set to an address - reset it
                                populatedParams[paramName] = '[Will be system-generated during WebAuthn authentication]';
                                systemGenerated[paramName] = true;
                            } else if (!populatedParams[paramName]) {
                                populatedParams[paramName] = '[Will be system-generated during WebAuthn authentication]';
                                systemGenerated[paramName] = true;
                            }
                        } else if (paramName === 'signature_payload') {
                            // Signature payload is always system-generated
                            // Check if it's incorrectly set to an address and reset it
                            const currentValue = populatedParams[paramName];
                            if (typeof currentValue === 'string' && (currentValue.startsWith('G') || currentValue.startsWith('C'))) {
                                // This is incorrectly set to an address - reset it
                                populatedParams[paramName] = '[Will be system-generated from transaction data]';
                                systemGenerated[paramName] = true;
                            } else if (!populatedParams[paramName]) {
                                populatedParams[paramName] = '[Will be system-generated from transaction data]';
                                systemGenerated[paramName] = true;
                            }
                        }
                    }
                } else {
                    // Fallback: try to infer common parameter names
                    const matchedPublicKey = row.public_key || skippedResult.matched_public_key;
                    const destinationKeys = ['destination', 'recipient', 'to', 'to_address', 'destination_address', 'address'];
                    
                    // First, clear/reset any WebAuthn parameters that might have incorrect values
                    // These should NEVER be set to addresses or other values
                    const webauthnKeys = ['webauthn_signature', 'webauthn_authenticator_data', 'webauthn_client_data', 'signature_payload'];
                    webauthnKeys.forEach(key => {
                        // If the value looks like a Stellar address (starts with G or C), reset it
                        if (populatedParams.hasOwnProperty(key) && typeof populatedParams[key] === 'string') {
                            const value = populatedParams[key];
                            if (value.startsWith('G') || value.startsWith('C')) {
                                // This is incorrectly set to an address - reset it
                                populatedParams[key] = '[Will be system-generated during WebAuthn authentication]';
                                systemGenerated[key] = true;
                            } else if (!populatedParams[key] || populatedParams[key] === '') {
                                populatedParams[key] = '[Will be system-generated during WebAuthn authentication]';
                                systemGenerated[key] = true;
                            }
                        } else if (populatedParams.hasOwnProperty(key) && !populatedParams[key]) {
                            populatedParams[key] = '[Will be system-generated during WebAuthn authentication]';
                            systemGenerated[key] = true;
                        }
                    });
                    
                    if (matchedPublicKey) {
                        for (const key of destinationKeys) {
                            // Only set destination keys, and make sure we're not overwriting WebAuthn params
                            if (populatedParams.hasOwnProperty(key) && 
                                !webauthnKeys.includes(key) && 
                                (!populatedParams[key] || populatedParams[key] === '')) {
                                populatedParams[key] = matchedPublicKey;
                                systemGenerated[key] = true;
                            }
                        }
                    }
                    
                    // Populate latitude/longitude if parameters exist
                    if (populatedParams.hasOwnProperty('latitude') && (!populatedParams.latitude || populatedParams.latitude === 0)) {
                        populatedParams.latitude = parseFloat(row.latitude);
                        systemGenerated.latitude = true;
                    }
                    if (populatedParams.hasOwnProperty('longitude') && (!populatedParams.longitude || populatedParams.longitude === 0)) {
                        populatedParams.longitude = parseFloat(row.longitude);
                        systemGenerated.longitude = true;
                    }
                    
                    // Mark signer_address as system-generated (will be user's wallet, not destination)
                    if (populatedParams.hasOwnProperty('signer_address') && !populatedParams.signer_address) {
                        populatedParams.signer_address = '[Will be system-generated from your wallet]';
                        systemGenerated.signer_address = true;
                    }
                }

                // Commented out verbose log - only show summary at the end
                // console.log(`[PendingRules] ➕ Adding pending rule:`, {
                //     rule_id: row.rule_id,
                //     rule_name: row.rule_name,
                //     function_name: row.function_name,
                //     update_id: row.update_id,
                //     public_key: row.public_key?.substring(0, 12) + '...',
                //     matched_public_key: (row.public_key || skippedResult.matched_public_key)?.substring(0, 12) + '...',
                //     reason: skippedResult.reason,
                //     location: `(${parseFloat(row.latitude)}, ${parseFloat(row.longitude)})`,
                //     requires_webauthn: row.requires_webauthn,
                //     has_system_generated_params: Object.keys(systemGenerated).length > 0
                // });
                
                pendingRules.push({
                    rule_id: row.rule_id,
                    rule_name: row.rule_name,
                    function_name: row.function_name,
                    function_parameters: populatedParams, // Use populated parameters
                    system_generated_params: systemGenerated, // Track which params are system-generated
                    contract_id: row.contract_id,
                    contract_name: row.contract_name,
                    contract_address: row.contract_address,
                    requires_webauthn: row.requires_webauthn,
                    update_id: row.update_id, // Include update_id for unique key generation
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

        // Log summary of pending rules
        console.log(`[PendingRules] 📊 Summary: Found ${pendingRules.length} pending rule(s)`, {
            total_pending: pendingRules.length,
            by_reason: pendingRules.reduce((acc, pr) => {
                // Extract reason from message or default
                const reason = pr.message?.includes('WebAuthn') ? 'requires_webauthn' : 
                              pr.message?.includes('rate limit') ? 'rate_limit_exceeded' :
                              pr.message?.includes('duration') ? 'insufficient_location_duration' :
                              pr.message?.includes('auto-execute') ? 'auto_execute_disabled' :
                              pr.message?.includes('confirmation') ? 'requires_confirmation' :
                              pr.message?.includes('target wallet') ? 'target_wallet_mismatch' : 'unknown';
                acc[reason] = (acc[reason] || 0) + 1;
                return acc;
            }, {}),
            unique_rules: [...new Set(pendingRules.map(pr => pr.rule_id))].length,
            unique_public_keys: [...new Set(pendingRules.map(pr => pr.matched_public_key))].length
        });
        
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

/**
 * @swagger
 * /api/contracts/rules/pending/deposits:
 *   get:
 *     summary: Get pending deposit actions for wallet provider
 *     description: Returns pending deposit execution rules for wallets managed by the authenticated wallet provider. Only deposit functions are returned.
 *     tags: [Contracts]
 *     security:
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: query
 *         name: public_key
 *         schema:
 *           type: string
 *         description: Filter by specific wallet public key
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, failed, cancelled]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of pending deposit actions
 *       401:
 *         description: Authentication required
 */
// Get pending deposit actions - Wallet Provider API key OR JWT authentication (for GeoLink users)
router.get('/rules/pending/deposits', authenticateContractUser, async (req, res) => {
    try {
        // Allow wallet provider API key OR JWT authentication (for GeoLink users)
        const isWalletProvider = req.userType === 'wallet_provider' || req.user?.role === 'wallet_provider';
        const isJWTUser = !req.userType && req.user?.id; // JWT auth doesn't set userType
        
        if (!isWalletProvider && !isJWTUser) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'This endpoint requires authentication (Wallet Provider API key or JWT token)'
            });
        }

        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        const { public_key: filterPublicKey, limit = 50, status } = req.query;

        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }
        
        // For JWT users, filter by their public_key to only show their own deposit actions
        // For wallet providers, they can see all deposits (or filter by public_key query param)
        const effectivePublicKey = isJWTUser ? publicKey : filterPublicKey;

        // Build query to get pending deposit rules
        // Filter for deposit functions only
        let query = `
            SELECT 
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
                luq.execution_results,
                COALESCE(
                    (SELECT result->>'matched_public_key' 
                     FROM jsonb_array_elements(luq.execution_results) AS result 
                     WHERE (result->>'rule_id')::integer = cer.id 
                       AND result->>'skipped' = 'true' 
                       AND result->>'reason' = 'requires_webauthn'
                     LIMIT 1),
                    luq.public_key
                ) as matched_public_key
            FROM location_update_queue luq
            JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
            JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE cer.function_name ILIKE '%deposit%'
                AND luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND EXISTS (
                    SELECT 1 
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE result->>'skipped' = 'true'
                    AND (result->>'reason')::text IN ('requires_webauthn', 'requires_confirmation')
                    AND (result->>'rule_id')::integer = cer.id
                    AND COALESCE((result->>'rejected')::boolean, false) = false
                    AND COALESCE((result->>'completed')::boolean, false) = false
                    AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS completed_result
                    WHERE (completed_result->>'rule_id')::integer = cer.id
                    AND COALESCE((completed_result->>'completed')::boolean, false) = true
                )
                AND luq.received_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS superseded_result
                    WHERE (superseded_result->>'rule_id')::integer = cer.id
                        AND (superseded_result->>'reason')::text = 'superseded_by_newer_execution'
                )
        `;

        const params = [];
        let paramIndex = 1;

        // Filter by public key if provided (for wallet providers) or required (for JWT users)
        if (effectivePublicKey) {
            query += ` AND (luq.public_key = $${paramIndex} OR COALESCE((SELECT result->>'matched_public_key' FROM jsonb_array_elements(luq.execution_results) AS result WHERE (result->>'rule_id')::integer = cer.id LIMIT 1), luq.public_key) = $${paramIndex})`;
            params.push(effectivePublicKey);
            paramIndex++;
        } else if (isJWTUser) {
            // JWT users must have a public_key to see deposits
            return res.status(400).json({ 
                error: 'Public key required',
                message: 'JWT-authenticated users must have a public_key associated with their account to view deposit actions'
            });
        }

        query += ` ORDER BY luq.received_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        const pendingDeposits = [];
        const processedKeys = new Set();

        for (const row of result.rows) {
            const uniqueKey = `${row.rule_id}_${row.matched_public_key}`;
            if (processedKeys.has(uniqueKey)) continue;
            processedKeys.add(uniqueKey);

            // Parse execution_results
            let executionResults = [];
            try {
                executionResults = typeof row.execution_results === 'string'
                    ? JSON.parse(row.execution_results)
                    : row.execution_results || [];
            } catch (e) {
                continue;
            }

            const skippedResult = executionResults.find(r => 
                r.rule_id === row.rule_id && 
                r.skipped === true && 
                r.reason === 'requires_webauthn' &&
                !r.completed &&
                !r.rejected
            );

            if (!skippedResult) continue;

            // Parse function_parameters
            let functionParams = {};
            try {
                functionParams = typeof row.function_parameters === 'string'
                    ? JSON.parse(row.function_parameters)
                    : row.function_parameters || {};
            } catch (e) {
                functionParams = {};
            }

            // Get function mappings
            let functionMappings = {};
            try {
                if (row.function_mappings) {
                    functionMappings = typeof row.function_mappings === 'string'
                        ? JSON.parse(row.function_mappings)
                        : row.function_mappings || {};
                }
            } catch (e) {
                functionMappings = {};
            }

            const mapping = functionMappings?.[row.function_name];
            const populatedParams = { ...functionParams };
            const systemGenerated = {};

            // Populate parameters
            if (mapping?.parameters) {
                mapping.parameters.forEach(param => {
                    const paramName = param.name;
                    const mappedFrom = param.mapped_from;

                    if (paramName === 'user_address' && (param.type === 'Address' || param.type === 'address')) {
                        if (!populatedParams[paramName] || populatedParams[paramName] === '') {
                            populatedParams[paramName] = row.matched_public_key;
                            systemGenerated[paramName] = true;
                        }
                    } else if (paramName === 'signer_address' && (param.type === 'Address' || param.type === 'address')) {
                        if (!populatedParams[paramName] || populatedParams[paramName] === '') {
                            populatedParams[paramName] = '[Will be system-generated from your wallet]';
                            systemGenerated[paramName] = true;
                        }
                    } else if (paramName.includes('webauthn') || paramName === 'signature_payload') {
                        populatedParams[paramName] = '[Will be system-generated during WebAuthn authentication]';
                        systemGenerated[paramName] = true;
                    }
                });
            }

            // Generate action ID
            const actionId = `deposit_${row.update_id}_${row.rule_id}_${row.matched_public_key.substring(0, 8)}`;

            // Determine status
            let depositStatus = 'pending';
            if (skippedResult.completed) {
                depositStatus = 'completed';
            } else if (skippedResult.rejected) {
                depositStatus = 'cancelled';
            } else if (skippedResult.failed) {
                depositStatus = 'failed';
            }

            // Filter by status if provided
            if (status && depositStatus !== status) {
                continue;
            }

            // Calculate expiration (24 hours from received_at)
            const expiresAt = new Date(new Date(row.received_at).getTime() + 24 * 60 * 60 * 1000);

            pendingDeposits.push({
                id: actionId,
                rule_id: row.rule_id,
                rule_name: row.rule_name,
                contract_id: row.contract_id,
                contract_name: row.contract_name,
                contract_address: row.contract_address,
                function_name: row.function_name,
                matched_public_key: row.matched_public_key,
                update_id: row.update_id,
                received_at: row.received_at,
                parameters: populatedParams,
                location: {
                    latitude: row.latitude != null ? Number(row.latitude) : null,
                    longitude: row.longitude != null ? Number(row.longitude) : null
                },
                expires_at: expiresAt.toISOString(),
                status: depositStatus
            });
        }

        res.json({
            success: true,
            pending_deposits: pendingDeposits,
            total: pendingDeposits.length
        });
    } catch (error) {
        console.error('Error fetching pending deposits:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/deposits/{action_id}:
 *   get:
 *     summary: Get deposit action details
 *     description: Returns detailed information about a specific pending deposit action
 *     tags: [Contracts]
 *     security:
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: action_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit action ID
 *     responses:
 *       200:
 *         description: Deposit action details
 *       404:
 *         description: Deposit action not found
 *       401:
 *         description: Authentication required
 */
router.get('/rules/pending/deposits/:action_id', authenticateContractUser, async (req, res) => {
    try {
        // Allow wallet provider API key OR JWT authentication (for GeoLink users)
        const isWalletProvider = req.userType === 'wallet_provider' || req.user?.role === 'wallet_provider';
        const isJWTUser = !req.userType && req.user?.id;
        
        if (!isWalletProvider && !isJWTUser) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'This endpoint requires authentication (Wallet Provider API key or JWT token)'
            });
        }

        const { action_id } = req.params;
        
        // Parse action_id: deposit_{update_id}_{rule_id}_{public_key_prefix}
        const parts = action_id.split('_');
        if (parts.length < 4 || parts[0] !== 'deposit') {
            return res.status(400).json({ error: 'Invalid action ID format' });
        }

        const updateId = parseInt(parts[1]);
        const ruleId = parseInt(parts[2]);

        // Query for the specific deposit action
        const query = `
            SELECT 
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
                luq.execution_results,
                COALESCE(
                    (SELECT result->>'matched_public_key' 
                     FROM jsonb_array_elements(luq.execution_results) AS result 
                     WHERE (result->>'rule_id')::integer = cer.id 
                       AND result->>'skipped' = 'true' 
                       AND result->>'reason' = 'requires_webauthn'
                     LIMIT 1),
                    luq.public_key
                ) as matched_public_key
            FROM location_update_queue luq
            JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
            JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE luq.id = $1
                AND cer.id = $2
                AND cer.function_name ILIKE '%deposit%'
                AND luq.execution_results IS NOT NULL
        `;

        const result = await pool.query(query, [updateId, ruleId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deposit action not found' });
        }

        const row = result.rows[0];
        
        // For JWT users, verify the deposit action belongs to their public_key
        if (isJWTUser && req.user?.public_key) {
            const matchedPublicKey = row.matched_public_key || row.public_key;
            if (matchedPublicKey !== req.user.public_key) {
                return res.status(403).json({ 
                    error: 'Forbidden',
                    message: 'This deposit action does not belong to your account'
                });
            }
        }

        // Parse execution_results
        let executionResults = [];
        try {
            executionResults = typeof row.execution_results === 'string'
                ? JSON.parse(row.execution_results)
                : row.execution_results || [];
        } catch (e) {
            return res.status(500).json({ error: 'Error parsing execution results' });
        }

        const skippedResult = executionResults.find(r => 
            r.rule_id === row.rule_id && 
            r.skipped === true && 
            r.reason === 'requires_webauthn' &&
            !r.completed &&
            !r.rejected
        );

        if (!skippedResult) {
            return res.status(404).json({ error: 'Deposit action not found or already completed' });
        }

        // Parse function_parameters and mappings
        let functionParams = {};
        try {
            functionParams = typeof row.function_parameters === 'string'
                ? JSON.parse(row.function_parameters)
                : row.function_parameters || {};
        } catch (e) {
            functionParams = {};
        }

        let functionMappings = {};
        try {
            if (row.function_mappings) {
                functionMappings = typeof row.function_mappings === 'string'
                    ? JSON.parse(row.function_mappings)
                    : row.function_mappings || {};
            }
        } catch (e) {
            functionMappings = {};
        }

        // Get function parameter definitions from discovered functions or mapping
        const mapping = functionMappings?.[row.function_name];
        const functionParameterDefinitions = mapping?.parameters || [];

        // Populate parameters
        const populatedParams = { ...functionParams };
        if (mapping?.parameters) {
            mapping.parameters.forEach(param => {
                const paramName = param.name;
                if (paramName === 'user_address' && (param.type === 'Address' || param.type === 'address')) {
                    if (!populatedParams[paramName] || populatedParams[paramName] === '') {
                        populatedParams[paramName] = row.matched_public_key;
                    }
                }
            });
        }

        const expiresAt = new Date(new Date(row.received_at).getTime() + 24 * 60 * 60 * 1000);
        let depositStatus = 'pending';
        if (skippedResult.completed) {
            depositStatus = 'completed';
        } else if (skippedResult.rejected) {
            depositStatus = 'cancelled';
        } else if (skippedResult.failed) {
            depositStatus = 'failed';
        }

        res.json({
            success: true,
            deposit_action: {
                id: action_id,
                rule_id: row.rule_id,
                rule_name: row.rule_name,
                contract_id: row.contract_id,
                contract_name: row.contract_name,
                contract_address: row.contract_address,
                function_name: row.function_name,
                function_parameters: functionParameterDefinitions,
                matched_public_key: row.matched_public_key,
                parameters: populatedParams,
                location: {
                    latitude: row.latitude,
                    longitude: row.longitude
                },
                expires_at: expiresAt.toISOString(),
                status: depositStatus
            }
        });
    } catch (error) {
        console.error('Error fetching deposit action details:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/deposits/{action_id}/execute:
 *   post:
 *     summary: Execute deposit transaction
 *     description: Executes a deposit transaction on behalf of the matched wallet using WebAuthn authentication
 *     tags: [Contracts]
 *     security:
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: action_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit action ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - webauthn_signature
 *               - webauthn_authenticator_data
 *               - webauthn_client_data
 *               - signature_payload
 *             properties:
 *               public_key:
 *                 type: string
 *               webauthn_signature:
 *                 type: string
 *               webauthn_authenticator_data:
 *                 type: string
 *               webauthn_client_data:
 *                 type: string
 *               signature_payload:
 *                 type: string
 *               passkey_public_key_spki:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deposit executed successfully
 *       400:
 *         description: Invalid request or execution failed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Deposit action not found
 */
router.post('/rules/pending/deposits/:action_id/execute', authenticateContractUser, async (req, res) => {
    try {
        // Allow wallet provider API key OR JWT authentication (for GeoLink users)
        const isWalletProvider = req.userType === 'wallet_provider' || req.user?.role === 'wallet_provider';
        const isJWTUser = !req.userType && req.user?.id;
        
        if (!isWalletProvider && !isJWTUser) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'This endpoint requires authentication (Wallet Provider API key or JWT token)'
            });
        }

        const { action_id } = req.params;
        const { 
            public_key, // This MUST be the user's (depositor's) public key, not the wallet provider's
            signedXDR, // Preferred: Signed transaction XDR (secret key never sent to server)
            user_secret_key, // Optional - only used if signedXDR is not provided (backward compatibility)
            // MUST be the user's (depositor's) secret key, not the wallet provider's
            webauthn_signature, 
            webauthn_authenticator_data, 
            webauthn_client_data, 
            signature_payload,
            passkey_public_key_spki
        } = req.body;
        
        console.log(`[Deposit Execute] 🔐 Using ${signedXDR ? 'signed XDR (secure)' : 'server-side signing (less secure - backward compatibility)'}`);
        console.log(`[Deposit Execute] ⚠️  IMPORTANT: public_key and user_secret_key must be the USER'S (depositor's) credentials, not the wallet provider's`);
        console.log(`[Deposit Execute] ⚠️  The contract requires the user to authorize the transaction via require_auth()`);

        if (!public_key || !webauthn_signature || !webauthn_authenticator_data || !webauthn_client_data || !signature_payload) {
            return res.status(400).json({ 
                error: 'Missing required parameters',
                required: ['public_key', 'webauthn_signature', 'webauthn_authenticator_data', 'webauthn_client_data', 'signature_payload']
            });
        }

        // Parse action_id
        const parts = action_id.split('_');
        if (parts.length < 4 || parts[0] !== 'deposit') {
            return res.status(400).json({ error: 'Invalid action ID format' });
        }

        const updateId = parseInt(parts[1]);
        const ruleId = parseInt(parts[2]);

        // Get deposit action details including function parameters
        const query = `
            SELECT 
                cer.id as rule_id,
                cer.function_name,
                cer.function_parameters,
                cer.contract_id,
                cc.contract_address,
                cc.function_mappings,
                luq.id as update_id,
                luq.public_key,
                luq.execution_results,
                COALESCE(
                    (SELECT result->>'matched_public_key' 
                     FROM jsonb_array_elements(luq.execution_results) AS result 
                     WHERE (result->>'rule_id')::integer = cer.id 
                       AND result->>'skipped' = 'true' 
                       AND result->>'reason' = 'requires_webauthn'
                     LIMIT 1),
                    luq.public_key
                ) as matched_public_key
            FROM location_update_queue luq
            JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
            JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE luq.id = $1
                AND cer.id = $2
                AND cer.function_name ILIKE '%deposit%'
                AND luq.execution_results IS NOT NULL
        `;

        const result = await pool.query(query, [updateId, ruleId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deposit action not found' });
        }

        const row = result.rows[0];

        // Verify public_key matches matched_public_key
        if (public_key !== row.matched_public_key) {
            return res.status(400).json({ 
                error: 'Public key mismatch',
                message: `Public key ${public_key} does not match matched_public_key ${row.matched_public_key}`
            });
        }
        
        // For JWT users, also verify the deposit action belongs to their account
        if (isJWTUser && req.user?.public_key && public_key !== req.user.public_key) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'You can only execute deposit actions for your own wallet'
            });
        }

        // Parse execution_results to verify it's still pending
        let executionResults = [];
        try {
            executionResults = typeof row.execution_results === 'string'
                ? JSON.parse(row.execution_results)
                : row.execution_results || [];
        } catch (e) {
            return res.status(500).json({ error: 'Error parsing execution results' });
        }

        const skippedResult = executionResults.find(r => 
            r.rule_id === row.rule_id && 
            r.skipped === true && 
            r.reason === 'requires_webauthn' &&
            !r.completed &&
            !r.rejected
        );

        if (!skippedResult) {
            return res.status(400).json({ 
                error: 'Deposit action already completed or cancelled',
                status: 'completed_or_cancelled'
            });
        }

        // Execute the deposit using the existing execute endpoint logic
        // We'll call the contract execution service directly
        const executeRequest = {
            body: {
                function_name: row.function_name,
                parameters: {
                    user_address: public_key,
                    webauthn_signature: webauthn_signature,
                    webauthn_authenticator_data: webauthn_authenticator_data,
                    webauthn_client_data: webauthn_client_data,
                    signature_payload: signature_payload
                },
                user_public_key: public_key,
                rule_id: ruleId,
                update_id: updateId,
                matched_public_key: public_key,
                passkeyPublicKeySPKI: passkey_public_key_spki,
                webauthnSignature: webauthn_signature,
                webauthnAuthenticatorData: webauthn_authenticator_data,
                webauthnClientData: webauthn_client_data,
                signaturePayload: signature_payload
            },
            params: { id: row.contract_id },
            user: req.user,
            userId: req.userId
        };

        // Use the existing execute endpoint logic by creating a mock request/response
        // Actually, we should reuse the execute logic - let's create a helper function
        // For now, we'll forward to the execute endpoint internally
        
        // Import the execute handler logic (we'll need to refactor it)
        // For now, let's call the execute endpoint directly via internal routing
        const StellarSdk = require('@stellar/stellar-sdk');
        const contractIntrospection = require('../services/contractIntrospection');
        
        // Get contract details (including network and discovered functions)
        const contractResult = await pool.query(
            `SELECT contract_address, network, function_mappings, requires_webauthn, use_smart_wallet, discovered_functions
             FROM custom_contracts
             WHERE id = $1 AND is_active = true`,
            [row.contract_id]
        );

        if (contractResult.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        const contract = contractResult.rows[0];
        const network = contract.network || 'testnet'; // Get network from contract
        const functionMappings = typeof contract.function_mappings === 'string'
            ? JSON.parse(contract.function_mappings)
            : contract.function_mappings;

        const mapping = functionMappings?.[row.function_name];
        if (!mapping) {
            return res.status(400).json({ error: `Function mapping not found for: ${row.function_name}` });
        }

        // Parse function_parameters from rule to get asset, amount, etc.
        let functionParams = {};
        try {
            functionParams = typeof row.function_parameters === 'string'
                ? JSON.parse(row.function_parameters)
                : row.function_parameters || {};
        } catch (e) {
            console.warn('[Deposit Execute] ⚠️  Could not parse function_parameters:', e.message);
        }

        // For deposit functions, the smart wallet contract expects signature_payload to be a JSON string
        // in the format: {source, asset, amount, action: 'deposit', timestamp}
        // IMPORTANT: If signature_payload is already in deposit format, we MUST use it as-is
        // because the WebAuthn signature was created for that exact payload (including timestamp)
        // Only convert if it's actually Intent format (base64-encoded Intent bytes)
        let depositSignaturePayload = signature_payload;
        
        // First, check if signature_payload is already in deposit format (JSON string with deposit fields)
        let isDepositFormat = false;
        try {
            // Try to parse as JSON
            const parsedPayload = typeof signature_payload === 'string' 
                ? JSON.parse(signature_payload) 
                : signature_payload;
            
            // Check if it has deposit format fields
            if (parsedPayload && 
                typeof parsedPayload === 'object' &&
                parsedPayload.source &&
                parsedPayload.amount &&
                parsedPayload.action === 'deposit' &&
                parsedPayload.timestamp) {
                isDepositFormat = true;
                console.log('[Deposit Execute] ✅ signature_payload is already in deposit format - using as-is (preserving timestamp for WebAuthn verification)');
                console.log('[Deposit Execute] 📋 signature_payload content:', JSON.stringify(parsedPayload, null, 2));
                
                // CRITICAL: Use the ORIGINAL string, not a re-stringified version
                // The WebAuthn signature was created for the exact bytes of the original string
                // If we re-stringify, the byte sequence might change (whitespace, key ordering, etc.)
                // and the signature verification will fail
                if (typeof signature_payload === 'string') {
                    depositSignaturePayload = signature_payload; // Use original string exactly as received
                    console.log('[Deposit Execute] 🔍 Using original signature_payload string (preserving exact byte format for WebAuthn verification)');
                    console.log('[Deposit Execute] 🔍 Original string length:', signature_payload.length, 'bytes');
                    console.log('[Deposit Execute] 🔍 Original string preview:', signature_payload.substring(0, 100));
                } else {
                    // If it's an object, stringify it (but this shouldn't happen if it's already in deposit format)
                    depositSignaturePayload = JSON.stringify(parsedPayload);
                    console.log('[Deposit Execute] ⚠️  WARNING: signature_payload was an object, not a string. Re-stringifying may cause WebAuthn verification to fail if the byte format differs.');
                }
            }
        } catch (e) {
            // Not JSON, might be base64-encoded
        }
        
        // Only convert if it's NOT already in deposit format AND it's Intent format
        if (!isDepositFormat) {
            // Check if signature_payload is base64-encoded intent bytes (Intent format)
            try {
                const decodedPayload = Buffer.from(signature_payload, 'base64');
                // If it's valid base64 and looks like intent bytes (starts with JSON-like structure when decoded)
                const decodedString = decodedPayload.toString('utf8');
                if (decodedString.startsWith('{') && decodedString.includes('"contractId"')) {
                    // This is Intent format - convert to deposit format
                    console.log('[Intent Contract] 🔄 Converting Intent format to deposit format for signature_payload');
                    
                    // Extract deposit parameters from functionParams
                    const depositAmount = functionParams.amount || processedParameters.amount || '0';
                    const depositAsset = functionParams.asset || processedParameters.asset || 'XLM';
                    const timestamp = Date.now();
                    
                    // Create deposit format JSON string (same as regular deposit endpoint)
                    const depositData = {
                        source: public_key,
                        asset: depositAsset === 'XLM' || depositAsset === 'native' ? 'XLM' : depositAsset,
                        amount: depositAmount.toString(),
                        action: 'deposit',
                        timestamp: timestamp
                    };
                    
                    depositSignaturePayload = JSON.stringify(depositData);
                    console.log('[Deposit Execute] ✅ Converted signature_payload to deposit format:', depositSignaturePayload.substring(0, 100) + '...');
                    console.log('[Intent Contract] ⚠️  WARNING: WebAuthn signature was created for Intent format, but we converted to deposit format. This may cause verification to fail.');
                } else {
                    // Not Intent format, use as-is
                    console.log('[Deposit Execute] ℹ️  Using signature_payload as-is (not Intent format, not deposit format)');
                }
            } catch (e) {
                // Not base64 or not Intent format, use as-is
                console.log('[Deposit Execute] ℹ️  Using signature_payload as-is (not base64, not Intent format)');
            }
        }

        // Process parameters - include all function parameters plus WebAuthn data
        let processedParameters = {
            ...functionParams, // Include asset, amount, etc. from function_parameters
            user_address: public_key, // Override with actual public key
            webauthn_signature: webauthn_signature,
            webauthn_authenticator_data: webauthn_authenticator_data,
            webauthn_client_data: webauthn_client_data,
            signature_payload: depositSignaturePayload
        };

        // Process WebAuthn signature
        const { extractPublicKeyFromSPKI, decodeDERSignature, normalizeECDSASignature } = require('../utils/webauthnUtils');
        
        try {
            const derSignatureBytes = Buffer.from(webauthn_signature, 'base64');
            let rawSignature64;

            if (derSignatureBytes.length === 64) {
                rawSignature64 = normalizeECDSASignature(derSignatureBytes);
            } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
                const decodedSignature = decodeDERSignature(derSignatureBytes);
                rawSignature64 = normalizeECDSASignature(decodedSignature);
            } else {
                throw new Error(`Invalid signature length: ${derSignatureBytes.length} bytes`);
            }

            if (rawSignature64.length !== 64) {
                throw new Error(`Invalid signature length after decoding: ${rawSignature64.length} bytes`);
            }

            processedParameters = {
                ...processedParameters,
                signature_payload: depositSignaturePayload, // Use the processed signature_payload (may have been converted from Intent format)
                webauthn_signature: rawSignature64.toString('base64'),
                webauthn_authenticator_data: webauthn_authenticator_data,
                webauthn_client_data: webauthn_client_data
            };
            
            // CRITICAL: Verify WebAuthn challenge matches (same as XYZ-Wallet-v1)
            // The contract's WebAuthn verifier uses the first 32 bytes of signature_payload as the challenge
            // We need to verify that the challenge in clientDataJSON matches this
            try {
                // Create signaturePayload buffer (same pattern as XYZ-Wallet-v1)
                let signaturePayloadBuffer;
                if (typeof depositSignaturePayload === 'string') {
                    // If it's a JSON string (deposit data), convert to Buffer (same as execute_payment)
                    try {
                        // Try to parse as JSON first - if it's valid JSON, it's deposit data
                        JSON.parse(depositSignaturePayload);
                        signaturePayloadBuffer = Buffer.from(depositSignaturePayload, 'utf8');
                    } catch (e) {
                        // Not JSON, try hex or base64 (fallback for old format)
                        if (depositSignaturePayload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(depositSignaturePayload.replace('0x', ''))) {
                            signaturePayloadBuffer = Buffer.from(depositSignaturePayload.replace('0x', ''), 'hex');
                        } else {
                            signaturePayloadBuffer = Buffer.from(depositSignaturePayload, 'base64');
                        }
                    }
                } else {
                    signaturePayloadBuffer = Buffer.from(depositSignaturePayload);
                }
                
                // Extract first 32 bytes for challenge verification
                const first32Bytes = signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length));
                const padded32Bytes = Buffer.alloc(32);
                first32Bytes.copy(padded32Bytes, 0);
                
                // Base64url-encode the first 32 bytes (same as verifier contract does)
                const expectedChallengeBase64Url = padded32Bytes.toString('base64url');
                
                // Decode clientDataJSON to check the actual challenge
                let actualChallengeBase64Url = null;
                try {
                    const clientDataJSONString = Buffer.from(webauthn_client_data, 'base64').toString('utf8');
                    const clientData = JSON.parse(clientDataJSONString);
                    actualChallengeBase64Url = clientData.challenge;
                } catch (e) {
                    console.log('[Deposit Execute] ⚠️  Could not parse clientDataJSON for challenge verification:', e.message);
                }
                
                console.log('[Deposit Execute] 📋 signaturePayload buffer (same pattern as XYZ-Wallet-v1):', {
                    length: signaturePayloadBuffer.length,
                    preview: signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length)).toString('hex') + '...',
                    first32Bytes: padded32Bytes.toString('hex'),
                    expectedChallengeBase64Url: expectedChallengeBase64Url,
                    actualChallengeBase64Url: actualChallengeBase64Url,
                    challengesMatch: expectedChallengeBase64Url === actualChallengeBase64Url,
                    note: 'Verifier will use first 32 bytes, base64url-encode them, and compare with challenge in clientDataJSON'
                });
                
                if (expectedChallengeBase64Url !== actualChallengeBase64Url) {
                    console.error('[Deposit Execute] ❌ Challenge mismatch detected in backend!');
                    console.error('  Expected (from signaturePayload first 32 bytes):', expectedChallengeBase64Url);
                    console.error('  Actual (from clientDataJSON.challenge):', actualChallengeBase64Url);
                    return res.status(400).json({
                        success: false,
                        error: 'WebAuthn challenge mismatch',
                        details: 'The challenge in clientDataJSON does not match the first 32 bytes of signaturePayload. This will cause verification to fail.',
                        expectedChallenge: expectedChallengeBase64Url,
                        actualChallenge: actualChallengeBase64Url
                    });
                }
                
                console.log('[Deposit Execute] ✅ Challenge verification passed in backend - matches frontend verification');
            } catch (challengeError) {
                console.error('[Deposit Execute] ⚠️  Error verifying challenge:', challengeError.message);
                // Don't fail - let the contract verify it (it will fail with a clear error if mismatch)
            }
            
            // CRITICAL: Verify the passkey used for signing matches the one registered on the contract
            // The contract stores only ONE passkey per public_key (the last one registered)
            // If we use a different passkey, the signature verification will fail
            if (passkey_public_key_spki) {
                try {
                    console.log('[Deposit Execute] 🔍 Verifying passkey matches registered passkey on contract...');
                    const StellarSdk = require('@stellar/stellar-sdk');
                    const network = contract.network || 'testnet';
                    const rpcUrl = network === 'mainnet' 
                        ? 'https://rpc.mainnet.stellar.org:443'
                        : 'https://soroban-testnet.stellar.org:443';
                    const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
                    const smartWalletContract = new StellarSdk.Contract(contract.contract_address);
                    const horizonServer = new StellarSdk.Horizon.Server(
                        network === 'mainnet' 
                            ? 'https://horizon.stellar.org'
                            : 'https://horizon-testnet.stellar.org'
                    );
                    
                    // Extract passkey public key from SPKI
                    const spkiBytes = Buffer.from(passkey_public_key_spki, 'base64');
                    let passkeyPubkey65;
                    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
                        passkeyPubkey65 = spkiBytes;
                    } else {
                        passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);
                    }
                    const passkeyPubkeyHex = passkeyPubkey65.toString('hex');
                    
                    // Get the passkey registered on the contract
                    const userScAddressForCheck = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(public_key))
                    );
                    const userScValForCheck = StellarSdk.xdr.ScVal.scvAddress(userScAddressForCheck);
                    
                    const getPasskeyOp = smartWalletContract.call('get_passkey_pubkey', userScValForCheck);
                    const accountForCheck = await horizonServer.loadAccount(public_key);
                    const checkTx = new StellarSdk.TransactionBuilder(
                        new StellarSdk.Account(public_key, accountForCheck.sequenceNumber()),
                        {
                            fee: StellarSdk.BASE_FEE,
                            networkPassphrase: network === 'mainnet' 
                                ? StellarSdk.Networks.PUBLIC
                                : StellarSdk.Networks.TESTNET
                        }
                    )
                        .addOperation(getPasskeyOp)
                        .setTimeout(30)
                        .build();
                    
                    const preparedCheckTx = await sorobanServer.prepareTransaction(checkTx);
                    const checkResult = await sorobanServer.simulateTransaction(preparedCheckTx);
                    
                    if (checkResult && checkResult.result && checkResult.result.retval) {
                        let registeredPubkeyScVal;
                        const retval = checkResult.result.retval;
                        
                        if (retval && typeof retval === 'object' && typeof retval.switch === 'function') {
                            registeredPubkeyScVal = retval;
                        } else if (typeof retval === 'string') {
                            registeredPubkeyScVal = StellarSdk.xdr.ScVal.fromXDR(retval, 'base64');
                        }
                        
                        if (registeredPubkeyScVal && registeredPubkeyScVal.switch && registeredPubkeyScVal.switch().name === 'scvBytes') {
                            const registeredPubkeyBytes = registeredPubkeyScVal.bytes();
                            const registeredPubkeyHex = Buffer.from(registeredPubkeyBytes).toString('hex');
                            
                            console.log('[Deposit Execute] 🔍 Passkey comparison:', {
                                registeredPasskeyHex: registeredPubkeyHex.substring(0, 32) + '...',
                                signingPasskeyHex: passkeyPubkeyHex.substring(0, 32) + '...',
                                match: registeredPubkeyHex === passkeyPubkeyHex
                            });
                            
                            if (registeredPubkeyHex !== passkeyPubkeyHex) {
                                console.error('[Deposit Execute] ❌ Passkey mismatch detected!');
                                console.error('  The passkey registered on the contract does not match the passkey used for signing.');
                                console.error('  Registered passkey (hex):', registeredPubkeyHex.substring(0, 32) + '...');
                                console.error('  Signing passkey (hex):', passkeyPubkeyHex.substring(0, 32) + '...');
                                console.error('  The signature was already generated with the wrong passkey, so the contract will reject it.');
                                
                                return res.status(400).json({
                                    error: 'Passkey mismatch - signature verification will fail',
                                    message: 'The passkey used for signing does not match the passkey registered on the contract.',
                                    details: 'The contract stores only one passkey per public key. You must use the passkey that is actually registered on the contract, or re-register the passkey before generating the signature.',
                                    registeredPasskeyHex: registeredPubkeyHex.substring(0, 32) + '...',
                                    signingPasskeyHex: passkeyPubkeyHex.substring(0, 32) + '...'
                                });
                            } else {
                                console.log('[Deposit Execute] ✅ Passkey matches registered passkey on contract');
                            }
                        }
                    }
                } catch (passkeyCheckError) {
                    console.warn('[Deposit Execute] ⚠️ Could not verify passkey match:', passkeyCheckError.message);
                    // Continue anyway - contract will verify
                }
            }
            
            // Verify WebAuthn challenge matches signature_payload (same as regular deposit endpoint)
            // This ensures the WebAuthn signature was created for the correct payload
            let signaturePayloadBuffer;
            if (typeof depositSignaturePayload === 'string') {
                try {
                    // Try to parse as JSON first
                    JSON.parse(depositSignaturePayload);
                    signaturePayloadBuffer = Buffer.from(depositSignaturePayload, 'utf8');
                } catch (e) {
                    // Not JSON, try base64
                    if (depositSignaturePayload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(depositSignaturePayload.replace('0x', ''))) {
                        signaturePayloadBuffer = Buffer.from(depositSignaturePayload.replace('0x', ''), 'hex');
                    } else {
                        signaturePayloadBuffer = Buffer.from(depositSignaturePayload, 'base64');
                    }
                }
            } else {
                signaturePayloadBuffer = Buffer.from(depositSignaturePayload);
            }
            
            const first32Bytes = signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length));
            const padded32Bytes = Buffer.alloc(32);
            first32Bytes.copy(padded32Bytes, 0);
            const expectedChallengeBase64Url = padded32Bytes.toString('base64url');
            
            let actualChallengeBase64Url = null;
            let actualChallengeBytes = null;
            try {
                const clientDataJSONString = Buffer.from(webauthn_client_data, 'base64').toString('utf8');
                const clientData = JSON.parse(clientDataJSONString);
                let rawChallenge = clientData.challenge;
                
                // Normalize challenge format for comparison
                // WebAuthn spec requires base64url, but some implementations use base64
                // Convert base64 to base64url if needed
                if (rawChallenge.includes('+') || rawChallenge.includes('/') || rawChallenge.endsWith('=')) {
                    // This is base64, convert to base64url
                    actualChallengeBase64Url = rawChallenge
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=/g, '');
                    // Also decode to bytes for comparison
                    actualChallengeBytes = Buffer.from(rawChallenge, 'base64');
                } else {
                    // Already base64url
                    actualChallengeBase64Url = rawChallenge;
                    // Decode base64url to bytes
                    try {
                        actualChallengeBytes = Buffer.from(rawChallenge, 'base64url');
                    } catch (e) {
                        // If base64url decode fails, try base64
                        actualChallengeBytes = Buffer.from(rawChallenge, 'base64');
                    }
                }
            } catch (e) {
                console.warn('[Deposit Execute] ⚠️ Could not parse clientDataJSON for challenge verification:', e.message);
            }
            
            // Compare both base64url strings and raw bytes
            const expectedChallengeBytes = padded32Bytes;
            const challengeMatches = expectedChallengeBase64Url === actualChallengeBase64Url ||
                (actualChallengeBytes && expectedChallengeBytes.equals(actualChallengeBytes));
            
            if (!challengeMatches) {
                console.error('[Deposit Execute] ❌ WebAuthn challenge mismatch!');
                console.error('  Expected (from signaturePayload first 32 bytes, base64url):', expectedChallengeBase64Url);
                console.error('  Actual (from clientDataJSON.challenge, normalized):', actualChallengeBase64Url);
                console.error('  Raw signaturePayload (first 100 chars):', depositSignaturePayload.substring(0, 100));
                
                // Decode the actual challenge to see what it represents
                if (actualChallengeBytes) {
                    console.error('  Actual challenge bytes (hex):', actualChallengeBytes.toString('hex'));
                    console.error('  Expected challenge bytes (hex):', expectedChallengeBytes.toString('hex'));
                    console.error('  Bytes match:', expectedChallengeBytes.equals(actualChallengeBytes));
                }
                
                // For deposit format, we should warn but not fail - the contract will verify
                // The challenge mismatch might be due to Intent format being used instead
                console.warn('[Deposit Execute] ⚠️ Challenge mismatch detected, but continuing (contract will verify)');
                // Don't return error - let the contract handle verification
                // return res.status(400).json({
                //     error: 'WebAuthn challenge mismatch',
                //     message: 'The challenge in clientDataJSON does not match the first 32 bytes of signaturePayload. This will cause verification to fail.',
                //     details: 'The WebAuthn signature was created for a different payload than what is being sent to the contract.',
                //     expectedChallenge: expectedChallengeBase64Url,
                //     actualChallenge: actualChallengeBase64Url
                // });
            } else {
                console.log('[Deposit Execute] ✅ WebAuthn challenge verification passed');
            }
            
            console.log('[Deposit Execute] ✅ WebAuthn challenge verification passed');
        } catch (error) {
            console.error(`[Deposit Execute] ❌ Error processing WebAuthn signature:`, error);
            return res.status(400).json({
                error: 'Failed to process WebAuthn signature',
                message: error.message
            });
        }

        // Use introspection to get the actual function signature and parameter order
        let functionSignature = null;
        if (contract.discovered_functions) {
            try {
                const discoveredFunctions = typeof contract.discovered_functions === 'string'
                    ? JSON.parse(contract.discovered_functions)
                    : contract.discovered_functions;
                
                if (discoveredFunctions && discoveredFunctions[row.function_name]) {
                    functionSignature = discoveredFunctions[row.function_name];
                    console.log(`[Deposit Execute] 📋 Found function signature for ${row.function_name}:`, 
                        functionSignature.parameters?.map(p => `${p.name}:${p.type}`).join(', '));
                }
            } catch (e) {
                console.warn(`[Deposit Execute] ⚠️  Could not parse discovered_functions:`, e.message);
            }
        }

        // Map parameters using introspection if available, otherwise use mapping
        let mappedParams = [];
        if (functionSignature && functionSignature.parameters && Array.isArray(functionSignature.parameters)) {
            // Use introspection to get correct parameter order
            console.log(`[Deposit Execute] 🔍 Using introspection for parameter mapping`);
            functionSignature.parameters.forEach(param => {
                const paramName = param.name;
                let paramValue = processedParameters[paramName];
                
                // Handle parameter name variations
                if (!paramValue) {
                    const variations = {
                        'user_address': ['user_address', 'userAddress', 'user', 'address'],
                        'asset': ['asset', 'assetAddress', 'asset_address', 'token'],
                        'amount': ['amount', 'value', 'quantity'],
                        'signature_payload': ['signature_payload', 'signaturePayload'],
                        'webauthn_signature': ['webauthn_signature', 'webauthnSignature'],
                        'webauthn_authenticator_data': ['webauthn_authenticator_data', 'webauthnAuthenticatorData', 'authenticator_data'],
                        'webauthn_client_data': ['webauthn_client_data', 'webauthnClientData', 'client_data']
                    };
                    
                    const possibleNames = variations[paramName] || [paramName];
                    for (const name of possibleNames) {
                        if (processedParameters[name] !== undefined) {
                            paramValue = processedParameters[name];
                            break;
                        }
                    }
                }
                
                // Auto-populate user_address if missing
                if (paramName === 'user_address' && !paramValue) {
                    paramValue = public_key;
                }
                
                // Auto-populate asset if missing (default to native XLM)
                if (paramName === 'asset' && !paramValue) {
                    // Default to native XLM contract address
                    paramValue = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                    console.log(`[Deposit Execute] ✅ Auto-populated asset parameter with native XLM contract address`);
                }
                
                // Convert amount from XLM to stroops if it's an i128/I128 parameter
                // This matches XYZ-Wallet's approach: amount is stored in XLM but contract expects stroops
                if (paramName === 'amount' && (param.type === 'i128' || param.type === 'I128') && paramValue) {
                    const amountValue = parseFloat(paramValue);
                    // If amount is less than 1,000,000, assume it's in XLM and convert to stroops
                    // (1 XLM = 10,000,000 stroops)
                    if (amountValue < 1000000) {
                        const amountInStroops = Math.round(amountValue * 10000000);
                        console.log(`[Deposit Execute] 💰 Converting amount from XLM to stroops: ${amountValue} XLM = ${amountInStroops} stroops`);
                        paramValue = amountInStroops.toString();
                    } else {
                        // Already in stroops, use as-is
                        console.log(`[Deposit Execute] 💰 Amount already in stroops: ${paramValue}`);
                    }
                }
                
                if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
                    mappedParams.push({
                        name: paramName,
                        type: param.type,
                        value: paramValue
                    });
                } else {
                    console.warn(`[Deposit Execute] ⚠️  Parameter ${paramName} (${param.type}) is missing or empty`);
                }
            });
        } else {
            // Fallback to mapping-based approach
            console.log(`[Deposit Execute] ⚠️  Using mapping-based parameter approach (introspection not available)`);
            mappedParams = contractIntrospection.mapFieldsToContract(processedParameters, mapping);

            // Ensure WebAuthn parameters are included and in correct order
            // Reorder mappedParams according to mapping parameter order to ensure correct sequence
            if (mapping && mapping.parameters && Array.isArray(mapping.parameters)) {
                const orderedParams = [];
                const paramMap = new Map(mappedParams.map(p => [p.name, p]));
                
                // First, add parameters in the order specified by the mapping
                mapping.parameters.forEach(mappingParam => {
                    const existingParam = paramMap.get(mappingParam.name);
                    if (existingParam && existingParam.value !== undefined && existingParam.value !== null && existingParam.value !== '') {
                        orderedParams.push(existingParam);
                        paramMap.delete(mappingParam.name); // Remove from map so we don't add it twice
                    } else if (processedParameters[mappingParam.name] !== undefined && processedParameters[mappingParam.name] !== null && processedParameters[mappingParam.name] !== '') {
                        // Parameter exists in processedParameters but wasn't mapped, add it
                        orderedParams.push({
                            name: mappingParam.name,
                            type: mappingParam.type,
                            value: processedParameters[mappingParam.name]
                        });
                    }
                });
                
                // Add any remaining parameters that weren't in the mapping
                paramMap.forEach((param, name) => {
                    orderedParams.push(param);
                });
                
                mappedParams = orderedParams;
            } else {
                // If no mapping parameters, ensure WebAuthn parameters are included
                const webAuthnParamNames = ['webauthn_signature', 'webauthn_authenticator_data', 'webauthn_client_data', 'signature_payload'];
                webAuthnParamNames.forEach(webAuthnParamName => {
                    if (processedParameters[webAuthnParamName] !== undefined && processedParameters[webAuthnParamName] !== null) {
                        const existingWebAuthnParam = mappedParams.find(p => p.name === webAuthnParamName);
                        if (!existingWebAuthnParam) {
                            mappedParams.push({
                                name: webAuthnParamName,
                                type: 'Bytes',
                                value: processedParameters[webAuthnParamName]
                            });
                        }
                    }
                });
            }
        }

        // Log mapped parameters for debugging
        console.log(`[Deposit Execute] 📊 Mapped parameters (${mappedParams.length}):`, 
            mappedParams.map(p => `${p.name}:${p.type}${p.value ? '=' + (typeof p.value === 'string' && p.value.length > 20 ? p.value.substring(0, 20) + '...' : p.value) : ''}`).join(', '));
        
        // Log the exact signature_payload bytes that will be sent to the contract
        const signaturePayloadParam = mappedParams.find(p => p.name === 'signature_payload');
        if (signaturePayloadParam && signaturePayloadParam.value) {
            const sigPayloadBytes = typeof signaturePayloadParam.value === 'string' 
                ? Buffer.from(signaturePayloadParam.value, 'utf8')
                : Buffer.from(JSON.stringify(signaturePayloadParam.value), 'utf8');
            console.log(`[Deposit Execute] 🔍 signature_payload bytes (${sigPayloadBytes.length} bytes):`, sigPayloadBytes.toString('hex').substring(0, 64) + '...');
            console.log(`[Deposit Execute] 🔍 signature_payload string:`, typeof signaturePayloadParam.value === 'string' ? signaturePayloadParam.value.substring(0, 100) : JSON.stringify(signaturePayloadParam.value).substring(0, 100));
        }

        // Convert to ScVal - ensure all parameters are in correct order
        const scValParams = mappedParams
            .filter(param => {
                if (param.value === undefined || param.value === null) {
                    console.warn(`[Deposit Execute] ⚠️  Skipping parameter ${param.name} - value is undefined/null`);
                    return false;
                }
                if (param.value === '') {
                    console.warn(`[Deposit Execute] ⚠️  Skipping parameter ${param.name} - value is empty string`);
                    return false;
                }
                return true;
            })
            .map(param => {
                try {
                    // Log the exact value being converted for signature_payload
                    if (param.name === 'signature_payload') {
                        const valueType = typeof param.value;
                        const valuePreview = valueType === 'string' 
                            ? param.value.substring(0, 100) 
                            : JSON.stringify(param.value).substring(0, 100);
                        console.log(`[Deposit Execute] 🔍 Converting signature_payload (type: ${valueType}):`, valuePreview);
                    }
                    const scVal = contractIntrospection.convertToScVal(param.value, param.type);
                    // Log the resulting bytes for signature_payload
                    if (param.name === 'signature_payload' && scVal && scVal.bytes) {
                        const bytes = scVal.bytes();
                        console.log(`[Deposit Execute] 🔍 signature_payload ScVal bytes (${bytes.length} bytes):`, Buffer.from(bytes).toString('hex').substring(0, 64) + '...');
                    }
                    return scVal;
                } catch (error) {
                    console.error(`[Deposit Execute] ❌ Error converting parameter ${param.name} (${param.type}):`, error.message);
                    throw new Error(`Failed to convert parameter "${param.name}" (${param.type}): ${error.message}`);
                }
            });
        
        console.log(`[Deposit Execute] ✅ Converted ${scValParams.length} parameters to ScVal`);

        // Prefer signed XDR over secret key (more secure)
        // If signedXDR is provided, we don't need user_secret_key
        if (!signedXDR && !user_secret_key) {
            return res.status(400).json({
                error: 'Signed XDR or secret key required',
                message: 'Deposit execution requires either a signed XDR (preferred) or the user\'s secret key to sign the transaction',
                note: 'Prefer signedXDR for better security (secret key never leaves client). Alternatively, execute the transaction in XYZ-Wallet and use the complete endpoint to report completion.'
            });
        }

        // Check user's balance in the smart wallet contract before executing deposit
        // This matches how the frontend checks balance (using get_balance on smart wallet contract)
        // The contract's deposit function checks token_client.balance() which is the user's Stellar account balance,
        // but we should also check the smart wallet contract balance for better error messages
        try {
            console.log(`[Deposit Execute] 💰 Checking user's smart wallet balance before deposit...`);
            const assetAddress = processedParameters.asset || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
            const depositAmount = parseInt(processedParameters.amount) || 0;
            
            const StellarSdk = require('@stellar/stellar-sdk');
            const contracts = require('../config/contracts');
            
            // Get network from contract (already defined above)
            const rpcUrl = network === 'mainnet' 
                ? 'https://soroban.stellar.org'
                : 'https://soroban-testnet.stellar.org';
            const balanceCheckServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
            const networkPassphrase = network === 'mainnet' 
                ? StellarSdk.Networks.PUBLIC
                : StellarSdk.Networks.TESTNET;
            
            // Get smart wallet contract ID from contract config or use the contract's smart_wallet_contract_id
            const smartWalletContractId = contract.smart_wallet_contract_id || contracts.SMART_WALLET_CONTRACT_ID;
            
            if (!smartWalletContractId) {
                console.warn(`[Deposit Execute] ⚠️  Smart wallet contract ID not found, skipping balance check`);
            } else {
                // Create smart wallet contract instance
                const smartWalletContract = new StellarSdk.Contract(smartWalletContractId);
                
                // Prepare user address
                const userAddr = StellarSdk.Address.fromString(public_key);
                
                // Prepare asset address (use SAC for native XLM)
                let assetScAddress;
                if (assetAddress && assetAddress.startsWith('C')) {
                    // Contract address (including SAC for native XLM)
                    const contractIdBytes = StellarSdk.StrKey.decodeContract(assetAddress);
                    assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
                } else {
                    // Native XLM - use Stellar Asset Contract (SAC)
                    const sacContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                    const sacContractBytes = StellarSdk.StrKey.decodeContract(sacContractId);
                    assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(sacContractBytes);
                }
                
                // Call get_balance on smart wallet contract (same as frontend)
                const balanceOp = smartWalletContract.call(
                    'get_balance',
                    StellarSdk.xdr.ScVal.scvAddress(userAddr.toScAddress()),
                    StellarSdk.xdr.ScVal.scvAddress(assetScAddress)
                );
                
                const dummyAccount = new StellarSdk.Account(public_key, '0');
                const balanceTx = new StellarSdk.TransactionBuilder(dummyAccount, {
                    fee: StellarSdk.BASE_FEE,
                    networkPassphrase: networkPassphrase
                })
                .addOperation(balanceOp)
                .setTimeout(30)
                .build();
                
                const preparedBalanceTx = await balanceCheckServer.prepareTransaction(balanceTx);
                const balanceSimulation = await balanceCheckServer.simulateTransaction(preparedBalanceTx);
                
                console.log(`[Deposit Execute] 🔍 Balance simulation result:`, {
                    hasResult: !!balanceSimulation.result,
                    hasErrorResult: !!balanceSimulation.errorResult,
                    hasRetval: !!(balanceSimulation.result && balanceSimulation.result.retval),
                    smartWalletContractId: smartWalletContractId,
                    userPublicKey: public_key,
                    assetAddress: assetAddress
                });
                
                if (balanceSimulation.errorResult) {
                    console.error(`[Deposit Execute] ❌ Balance simulation error:`, balanceSimulation.errorResult.value().toString());
                    console.warn(`[Deposit Execute] ⚠️  Could not check user's smart wallet balance (simulation error)`);
                } else if (balanceSimulation.result && balanceSimulation.result.retval) {
                    const result = balanceSimulation.result.retval;
                    let userBalance = 0;
                    
                    // Extract balance from ScVal (matching smartWallet.js pattern)
                    try {
                        if (result.i128) {
                            const parts = result.i128();
                            const lo = parts.lo().toString();
                            const hi = parts.hi().toString();
                            // For most balances, lo should be sufficient
                            // If hi is non-zero, we'd need to combine them: balance = (hi << 64) | lo
                            // eslint-disable-next-line no-undef
                            const balanceStr = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                            userBalance = parseInt(balanceStr);
                            console.log(`[Deposit Execute] 🔍 I128 balance: lo=${lo}, hi=${hi}, total=${userBalance} (${balanceStr} stroops)`);
                        } else if (result.u128) {
                            const parts = result.u128();
                            const lo = parts.lo().toString();
                            const hi = parts.hi().toString();
                            // eslint-disable-next-line no-undef
                            const balanceStr = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                            userBalance = parseInt(balanceStr);
                            console.log(`[Deposit Execute] 🔍 U128 balance: lo=${lo}, hi=${hi}, total=${userBalance} (${balanceStr} stroops)`);
                        } else if (result.i32 !== undefined) {
                            userBalance = parseInt(result.i32().toString());
                            console.log(`[Deposit Execute] 🔍 I32 balance: ${userBalance}`);
                        } else {
                            // Try to parse as string
                            const balanceStr = result.toString() || '0';
                            userBalance = parseInt(balanceStr);
                            console.log(`[Deposit Execute] 🔍 Parsed balance from string: ${userBalance} (${balanceStr})`);
                        }
                    } catch (parseError) {
                        console.error(`[Deposit Execute] ❌ Error parsing balance result:`, parseError);
                        console.warn(`[Deposit Execute] ⚠️  Could not parse balance, defaulting to 0`);
                        userBalance = 0;
                    }
                    
                    const balanceXLM = (userBalance / 10000000).toFixed(7);
                    const requiredXLM = (depositAmount / 10000000).toFixed(7);
                    
                    console.log(`[Deposit Execute] 💰 User smart wallet balance: ${userBalance} stroops (${balanceXLM} XLM)`);
                    console.log(`[Deposit Execute] 💰 Required deposit amount: ${depositAmount} stroops (${requiredXLM} XLM)`);
                } else {
                    console.warn(`[Deposit Execute] ⚠️  Could not check user's smart wallet balance (simulation failed or no result)`);
                    if (balanceSimulation.result) {
                        console.warn(`[Deposit Execute] ⚠️  Simulation result exists but no retval:`, {
                            hasRetval: !!balanceSimulation.result.retval,
                            resultType: typeof balanceSimulation.result
                        });
                    }
                }
            }
            
            // CRITICAL: Also check the user's token contract balance (Stellar account balance)
            // This is what the contract actually checks: token_client.balance(&user_address)
            // This check is separate from the smart wallet balance check
            console.log(`[Deposit Execute] 💰 Checking user's Stellar account balance (token contract balance)...`);
            try {
                const tokenContract = new StellarSdk.Contract(assetAddress);
                const userAddr = StellarSdk.Address.fromString(public_key);
                const userScVal = StellarSdk.xdr.ScVal.scvAddress(userAddr.toScAddress());
                
                const tokenBalanceOp = tokenContract.call('balance', userScVal);
                const dummyAccount = new StellarSdk.Account(public_key, '0');
                const tokenBalanceTx = new StellarSdk.TransactionBuilder(dummyAccount, {
                    fee: StellarSdk.BASE_FEE,
                    networkPassphrase: networkPassphrase
                })
                .addOperation(tokenBalanceOp)
                .setTimeout(30)
                .build();
                
                const preparedTokenBalanceTx = await balanceCheckServer.prepareTransaction(tokenBalanceTx);
                const tokenBalanceSimulation = await balanceCheckServer.simulateTransaction(preparedTokenBalanceTx);
                
                if (tokenBalanceSimulation.errorResult) {
                    console.error(`[Deposit Execute] ❌ Token balance simulation error:`, tokenBalanceSimulation.errorResult.value().toString());
                } else if (tokenBalanceSimulation.result && tokenBalanceSimulation.result.retval) {
                    const tokenResult = tokenBalanceSimulation.result.retval;
                    let tokenBalance = 0;
                    
                    try {
                        if (tokenResult.i128) {
                            const parts = tokenResult.i128();
                            const lo = parts.lo().toString();
                            const hi = parts.hi().toString();
                            // eslint-disable-next-line no-undef
                            const balanceStr = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                            tokenBalance = parseInt(balanceStr);
                        } else if (tokenResult.u128) {
                            const parts = tokenResult.u128();
                            const lo = parts.lo().toString();
                            const hi = parts.hi().toString();
                            // eslint-disable-next-line no-undef
                            const balanceStr = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                            tokenBalance = parseInt(balanceStr);
                        } else if (tokenResult.i32 !== undefined) {
                            tokenBalance = parseInt(tokenResult.i32().toString());
                        } else {
                            const balanceStr = tokenResult.toString() || '0';
                            tokenBalance = parseInt(balanceStr);
                        }
                    } catch (parseError) {
                        console.error(`[Deposit Execute] ❌ Error parsing token balance:`, parseError);
                        tokenBalance = 0;
                    }
                    
                    const tokenBalanceXLM = (tokenBalance / 10000000).toFixed(7);
                    const requiredXLM = (depositAmount / 10000000).toFixed(7);
                    
                    console.log(`[Deposit Execute] 💰 User Stellar account balance (token contract): ${tokenBalance} stroops (${tokenBalanceXLM} XLM)`);
                    console.log(`[Deposit Execute] 💰 Required deposit amount: ${depositAmount} stroops (${requiredXLM} XLM)`);
                    
                    if (tokenBalance < depositAmount) {
                        console.error(`[Deposit Execute] ❌ INSUFFICIENT STELLAR ACCOUNT BALANCE!`);
                        console.error(`[Deposit Execute] ❌ User has ${tokenBalanceXLM} XLM in Stellar account but needs ${requiredXLM} XLM`);
                        console.error(`[Deposit Execute] ❌ This is why the contract is returning false - the contract checks token_client.balance()`);
                        return res.status(400).json({
                            error: 'Insufficient Stellar account balance',
                            message: `User has insufficient balance in their Stellar account for deposit. Required: ${requiredXLM} XLM, Available: ${tokenBalanceXLM} XLM`,
                            user_stellar_balance: tokenBalance,
                            user_stellar_balance_xlm: tokenBalanceXLM,
                            required_amount: depositAmount,
                            required_amount_xlm: requiredXLM,
                            asset: assetAddress,
                            user_public_key: public_key,
                            note: 'The deposit function checks your Stellar account balance (token contract), not your smart wallet balance. You need XLM in your Stellar account to deposit.'
                        });
                    } else {
                        console.log(`[Deposit Execute] ✅ User has sufficient Stellar account balance (${tokenBalanceXLM} XLM >= ${requiredXLM} XLM)`);
                    }
                } else {
                    console.warn(`[Deposit Execute] ⚠️  Could not check user's Stellar account balance (simulation failed or no result)`);
                }
            } catch (tokenBalanceError) {
                console.warn(`[Deposit Execute] ⚠️  Error checking user's Stellar account balance:`, tokenBalanceError.message);
                console.warn(`[Deposit Execute] ⚠️  Proceeding with deposit execution anyway - contract will validate balance`);
            }
        } catch (balanceError) {
            console.warn(`[Deposit Execute] ⚠️  Error checking user's smart wallet balance:`, balanceError.message);
            console.warn(`[Deposit Execute] ⚠️  Proceeding with deposit execution anyway - contract will validate balance`);
        }
        
        // Ensure passkey is registered (same as regular deposit endpoint and XYZ-Wallet)
        // This is critical - the contract will reject deposits if the passkey is not registered
        // We can register the passkey even if signed XDR is provided, as long as we have the secret key
        // The passkey registration is a separate transaction from the deposit transaction
        if (passkey_public_key_spki && user_secret_key) {
            const { ensurePasskeyRegistered } = require('../routes/smartWallet');
            const rpId = req.body.rpId || req.headers.host || 'localhost';
            console.log('[Deposit Execute] 🔍 Checking if passkey is registered (matching XYZ-Wallet behavior)...');
            
            try {
                console.log('[Deposit Execute] 🔍 Attempting to ensure passkey is registered...', {
                    publicKey: public_key,
                    hasSecretKey: !!user_secret_key,
                    hasPasskeySPKI: !!passkey_public_key_spki,
                    hasSignedXDR: !!signedXDR,
                    rpId: rpId,
                    note: 'Passkey registration is separate from transaction signing - we can register even with signed XDR'
                });
                
                const registrationPromise = ensurePasskeyRegistered(public_key, user_secret_key, passkey_public_key_spki, rpId);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Passkey registration timeout after 15 seconds')), 15000)
                );
                
                const isRegistered = await Promise.race([registrationPromise, timeoutPromise]);
                
                if (isRegistered) {
                    console.log('[Deposit Execute] ✅ Passkey is registered, proceeding with deposit');
                    
                    // Double-check by calling get_passkey_pubkey on the contract
                    try {
                        const StellarSdk = require('@stellar/stellar-sdk');
                        const contractsConfig = require('../config/contracts');
                        const server = new StellarSdk.rpc.Server(contractsConfig.SOROBAN_RPC_URL);
                        const network = contractsConfig.STELLAR_NETWORK || 'testnet';
                        const networkPassphrase = network === 'mainnet' 
                            ? StellarSdk.Networks.PUBLIC 
                            : StellarSdk.Networks.TESTNET;
                        
                        const horizonServer = new StellarSdk.Horizon.Server(contractsConfig.HORIZON_URL);
                        const account = await horizonServer.loadAccount(public_key);
                        const sourceAccount = new StellarSdk.Account(public_key, account.sequenceNumber());
                        
                        const smartWalletContract = new StellarSdk.Contract(contractsConfig.SMART_WALLET_CONTRACT_ID);
                        const userScVal = StellarSdk.Address.fromString(public_key).toScVal();
                        const getPasskeyOp = smartWalletContract.call('get_passkey_pubkey', userScVal);
                        
                        const checkTx = new StellarSdk.TransactionBuilder(sourceAccount, {
                            fee: StellarSdk.BASE_FEE,
                            networkPassphrase: networkPassphrase
                        })
                        .addOperation(getPasskeyOp)
                        .setTimeout(30)
                        .build();
                        
                        checkTx.sign(StellarSdk.Keypair.fromSecret(user_secret_key));
                        const simulateResult = await server.simulateTransaction(checkTx);
                        
                        if (simulateResult.errorResult) {
                            console.warn('[Deposit Execute] ⚠️ get_passkey_pubkey simulation failed:', simulateResult.errorResult);
                            console.warn('[Deposit Execute] ⚠️ This suggests the passkey might not be registered on the contract');
                        } else if (simulateResult.result && simulateResult.result.retval) {
                            const retval = simulateResult.result.retval;
                            console.log('[Deposit Execute] ✅ get_passkey_pubkey returned a value - passkey is confirmed registered');
                            console.log('[Deposit Execute] 📋 Passkey pubkey from contract:', retval.toString().substring(0, 50) + '...');
                        } else {
                            console.warn('[Deposit Execute] ⚠️ get_passkey_pubkey returned no value - passkey might not be registered');
                        }
                    } catch (checkError) {
                        console.warn('[Deposit Execute] ⚠️ Could not verify passkey registration via get_passkey_pubkey:', checkError.message);
                        console.warn('[Deposit Execute] ⚠️ Proceeding anyway - contract will validate passkey and return false if not registered');
                    }
                } else {
                    console.warn('[Deposit Execute] ⚠️ Passkey registration returned false or timed out');
                    console.warn('[Deposit Execute] ⚠️ Proceeding anyway - contract will validate passkey and return false if not registered');
                }
            } catch (regError) {
                console.error('[Deposit Execute] ❌ Error during passkey registration check:', regError.message);
                console.error('[Deposit Execute] ❌ Error stack:', regError.stack);
                // Continue anyway - contract will fail with a clear error if passkey isn't registered
                console.warn('[Deposit Execute] ⚠️ Proceeding with deposit execution (contract will validate passkey)');
            }
        } else if (signedXDR && !user_secret_key) {
            console.log('[Deposit Execute] ⚠️ Passkey auto-registration skipped (signed XDR mode - no secret key available)');
            console.log('[Deposit Execute] ℹ️  If passkey is not registered, the contract will reject the transaction');
            console.log('[Deposit Execute] 💡 Suggestion: Register the passkey separately before attempting the deposit');
        } else {
            console.warn('[Deposit Execute] ⚠️ passkey_public_key_spki or user_secret_key not provided, skipping auto-registration');
        }
        
        // Execute contract function using the existing execute endpoint logic
        // We'll forward to the main execute endpoint internally
        // Create a mock request object for the execute endpoint
        const executeReq = {
            params: { id: row.contract_id },
            body: {
                function_name: row.function_name,
                parameters: processedParameters,
                user_public_key: public_key,
                signedXDR: signedXDR, // ✅ Prefer signed XDR (secure)
                user_secret_key: signedXDR ? undefined : user_secret_key, // Only send secret key if signedXDR not available
                rule_id: ruleId,
                update_id: updateId,
                matched_public_key: public_key,
                passkeyPublicKeySPKI: passkey_public_key_spki,
                webauthnSignature: webauthn_signature,
                webauthnAuthenticatorData: webauthn_authenticator_data,
                webauthnClientData: webauthn_client_data,
                signaturePayload: depositSignaturePayload // Use the processed signature_payload (preserves original if already in deposit format)
            },
            user: req.user,
            userId: req.userId,
            userType: req.userType
        };

        // Create a response object to capture the result
        let executeResponse = null;
        let executeError = null;
        const executeRes = {
            status: (code) => {
                executeResponse = { statusCode: code };
                return executeRes;
            },
            json: (data) => {
                executeResponse = { statusCode: executeResponse?.statusCode || 200, data };
                return executeRes;
            },
            headersSent: false
        };

        // Call the execute endpoint handler
        // We need to get the handler function - let's extract it or call it directly
        // Actually, let's use the contract execution service directly
        try {
            const StellarSdk = require('@stellar/stellar-sdk');
            const network = contract.network || 'testnet';
            const rpcUrl = network === 'mainnet' 
                ? 'https://rpc.mainnet.stellar.org:443'
                : 'https://soroban-testnet.stellar.org:443';
            const server = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });

            // Get source account
            let sourceAccount;
            try {
                sourceAccount = await server.getAccount(public_key);
            } catch (error) {
                if (error.status === 404) {
                    return res.status(400).json({
                        error: 'Account not found',
                        message: `Account ${public_key} does not exist on the ${network} network`
                    });
                }
                throw error;
            }

            // Build transaction
            // Log the exact parameters being sent to the contract for debugging
            console.log(`[Deposit Execute] 🔍 Invoking contract with ${scValParams.length} parameters:`);
            scValParams.forEach((param, index) => {
                const paramStr = typeof param === 'object' && param !== null 
                    ? JSON.stringify(param).substring(0, 200) 
                    : String(param).substring(0, 200);
                console.log(`[Deposit Execute]   Param ${index + 1}: ${paramStr}...`);
            });
            
            // CRITICAL: For deposit functions, use the smart wallet contract address, not the execution rule's contract
            // The deposit function is on the smart wallet contract, not on the custom contract
            const contractsConfig = require('../config/contracts');
            const isDepositFunction = row.function_name.toLowerCase() === 'deposit';
            const contractAddressToUse = isDepositFunction 
                ? contractsConfig.SMART_WALLET_CONTRACT_ID 
                : contract.contract_address;
            
            if (isDepositFunction) {
                console.log(`[Deposit Execute] 🔍 Using smart wallet contract for deposit function: ${contractAddressToUse}`);
                console.log(`[Deposit Execute] 🔍 Execution rule's contract was: ${contract.contract_address}`);
            }
            
            const contractInstance = new StellarSdk.Contract(contractAddressToUse);
            const operation = contractInstance.call(
                row.function_name,
                ...scValParams
            );

            const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: network === 'mainnet' 
                    ? StellarSdk.Networks.PUBLIC
                    : StellarSdk.Networks.TESTNET
            })
            .addOperation(operation)
            .setTimeout(30)
            .build();

            // Prepare transaction (this internally simulates and prepares the transaction)
            const preparedTx = await server.prepareTransaction(transaction);

            // CRITICAL: Sign the prepared transaction with the USER'S (depositor's) secret key
            // The contract requires user_address.require_auth(), so the transaction MUST be signed by the user
            // If the wallet provider signs instead, require_auth() will fail and the contract will return false
            console.log(`[Deposit Execute] ✍️  Signing transaction with user's (depositor's) secret key: ${public_key.substring(0, 8)}...`);
            const keypair = StellarSdk.Keypair.fromSecret(user_secret_key);
            
            // Verify the keypair's public key matches the expected public_key
            if (keypair.publicKey() !== public_key) {
                console.error(`[Deposit Execute] ❌ Secret key mismatch:`, {
                    provided_public_key: public_key,
                    secret_key_public_key: keypair.publicKey(),
                    message: 'The secret key does not match the provided public_key. The transaction MUST be signed by the user (depositor), not the wallet provider.'
                });
                return res.status(403).json({
                    error: 'Secret key mismatch',
                    message: 'The secret key does not match the provided public_key. The transaction MUST be signed by the user (depositor), not the wallet provider.',
                    provided_public_key: public_key,
                    secret_key_public_key: keypair.publicKey()
                });
            }
            
            preparedTx.sign(keypair);
            console.log(`[Deposit Execute] ✅ Transaction signed by user (depositor): ${public_key.substring(0, 8)}...`);

            // Submit transaction
            console.log(`[Deposit Execute] 📤 Submitting transaction to network...`);
            const sendResult = await server.sendTransaction(preparedTx);
            
            if (sendResult.errorResult) {
                console.error(`[Deposit Execute] ❌ Transaction submission failed:`, sendResult.errorResult);
                return res.status(400).json({
                    error: 'Transaction submission failed',
                    message: sendResult.errorResult,
                    transaction_hash: sendResult.hash
                });
            }
            
            console.log(`[Deposit Execute] ✅ Transaction submitted - Hash: ${sendResult.hash}`);

            // Wait for transaction to complete
            console.log(`[Deposit Execute] ⏳ Polling for transaction result (hash: ${sendResult.hash.substring(0, 16)}...)...`);
            let txResult;
            const startTime = Date.now();
            const timeout = 60000; // 60 seconds
            let pollAttempt = 0;

            while (Date.now() - startTime < timeout) {
                pollAttempt++;
                try {
                    txResult = await server.getTransaction(sendResult.hash);
                    console.log(`[Deposit Execute] 📊 Poll attempt ${pollAttempt} - Status: ${txResult.status || 'PENDING'}`);
                    
                    if (txResult.status !== 'NOT_FOUND') {
                        break;
                    }
                } catch (pollError) {
                    console.warn(`[Deposit Execute] ⚠️ Poll attempt ${pollAttempt} failed:`, pollError.message);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!txResult || txResult.status === 'NOT_FOUND') {
                console.error(`[Deposit Execute] ❌ Transaction timeout - did not complete within 60 seconds`);
                return res.status(500).json({
                    error: 'Transaction timeout',
                    transaction_hash: sendResult.hash,
                    message: 'Transaction did not complete within 60 seconds'
                });
            }
            
            console.log(`[Deposit Execute] 📊 Transaction final status: ${txResult.status}`);
            
            // Log the full transaction result structure for debugging
            console.log(`[Deposit Execute] 🔍 Full transaction result keys:`, Object.keys(txResult || {}));
            if (txResult.resultXdr) {
                console.log(`[Deposit Execute] 🔍 resultXdr type:`, typeof txResult.resultXdr);
                console.log(`[Deposit Execute] 🔍 resultXdr preview:`, typeof txResult.resultXdr === 'string' ? txResult.resultXdr.substring(0, 100) : 'object');
            }
            if (txResult.resultMetaXdr) {
                console.log(`[Deposit Execute] 🔍 resultMetaXdr type:`, typeof txResult.resultMetaXdr);
                console.log(`[Deposit Execute] 🔍 resultMetaXdr preview:`, typeof txResult.resultMetaXdr === 'string' ? txResult.resultMetaXdr.substring(0, 100) : 'object');
            }

            if (txResult.status === 'SUCCESS') {
                // Check the contract's return value
                let contractReturnedFalse = false;
                let contractLogs = []; // Initialize contract logs early so it's accessible in error response
                try {
                    // First, try to get return value from resultXdr
                    if (txResult.resultXdr) {
                        try {
                            let resultXdr;
                            if (typeof txResult.resultXdr === 'string') {
                                resultXdr = StellarSdk.xdr.TransactionResultPair.fromXDR(txResult.resultXdr, 'base64');
                            } else {
                                resultXdr = txResult.resultXdr;
                            }
                            
                            if (resultXdr && resultXdr.result) {
                                const result = typeof resultXdr.result === 'function' ? resultXdr.result() : resultXdr.result;
                                if (result && result.tr) {
                                    const tr = typeof result.tr === 'function' ? result.tr() : result.tr;
                                    if (tr && tr.invokeHostFunctionResult) {
                                        const invokeResult = typeof tr.invokeHostFunctionResult === 'function' ? tr.invokeHostFunctionResult() : tr.invokeHostFunctionResult;
                                        if (invokeResult) {
                                            if (invokeResult.success) {
                                                const success = typeof invokeResult.success === 'function' ? invokeResult.success() : invokeResult.success;
                                                if (success) {
                                                    console.log(`[Deposit Execute] ✅ Found return value in resultXdr:`, success);
                                                    // The return value is in success, but we need to extract the actual ScVal
                                                    // This is complex, so let's try resultMetaXdr instead
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (resultXdrError) {
                            console.log(`[Deposit Execute] ℹ️  Could not extract from resultXdr:`, resultXdrError.message);
                        }
                    }
                    
                    if (txResult.resultMetaXdr) {
                        // Parse resultMetaXdr if it's a string
                        let transactionMeta;
                        if (typeof txResult.resultMetaXdr === 'string') {
                            transactionMeta = StellarSdk.xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64');
                        } else {
                            transactionMeta = txResult.resultMetaXdr;
                        }
                        
                        // Try to get Soroban meta - check if v3 exists
                        let sorobanMeta = null;
                        let returnValue = null;
                        
                        // Try multiple ways to access the transaction meta
                        // Method 1: Try v3 as a function
                        if (transactionMeta && typeof transactionMeta.v3 === 'function') {
                            try {
                                const v3Meta = transactionMeta.v3();
                                if (v3Meta) {
                                    if (typeof v3Meta.sorobanMeta === 'function') {
                                        sorobanMeta = v3Meta.sorobanMeta();
                                    } else if (v3Meta.sorobanMeta) {
                                        sorobanMeta = v3Meta.sorobanMeta;
                                    }
                                    if (sorobanMeta) {
                                        if (typeof sorobanMeta.returnValue === 'function') {
                                            returnValue = sorobanMeta.returnValue();
                                        } else if (sorobanMeta.returnValue) {
                                            returnValue = sorobanMeta.returnValue;
                                        }
                                    }
                                }
                            } catch (v3Error) {
                                console.log(`[Deposit Execute] ℹ️  Transaction meta v3() method failed:`, v3Error.message);
                            }
                        }
                        
                        // Method 2: Try v3 as a property
                        if (!sorobanMeta && transactionMeta && transactionMeta.v3) {
                            try {
                                const v3Meta = typeof transactionMeta.v3 === 'function' ? transactionMeta.v3() : transactionMeta.v3;
                                if (v3Meta) {
                                    if (typeof v3Meta.sorobanMeta === 'function') {
                                        sorobanMeta = v3Meta.sorobanMeta();
                                    } else if (v3Meta.sorobanMeta) {
                                        sorobanMeta = v3Meta.sorobanMeta;
                                    }
                                    if (sorobanMeta) {
                                        if (typeof sorobanMeta.returnValue === 'function') {
                                            returnValue = sorobanMeta.returnValue();
                                        } else if (sorobanMeta.returnValue) {
                                            returnValue = sorobanMeta.returnValue;
                                        }
                                    }
                                }
                            } catch (v3Error) {
                                console.log(`[Deposit Execute] ℹ️  Transaction meta v3 property access failed:`, v3Error.message);
                            }
                        }
                        
                        // Method 3: Try v2 as a function
                        if (!sorobanMeta && transactionMeta && typeof transactionMeta.v2 === 'function') {
                            try {
                                const v2Meta = transactionMeta.v2();
                                if (v2Meta) {
                                    if (typeof v2Meta.sorobanMeta === 'function') {
                                        sorobanMeta = v2Meta.sorobanMeta();
                                    } else if (v2Meta.sorobanMeta) {
                                        sorobanMeta = v2Meta.sorobanMeta;
                                    }
                                    if (sorobanMeta) {
                                        if (typeof sorobanMeta.returnValue === 'function') {
                                            returnValue = sorobanMeta.returnValue();
                                        } else if (sorobanMeta.returnValue) {
                                            returnValue = sorobanMeta.returnValue;
                                        }
                                    }
                                }
                            } catch (v2Error) {
                                console.log(`[Deposit Execute] ℹ️  Transaction meta v2() method failed:`, v2Error.message);
                            }
                        }
                        
                        // Method 4: Try accessing resultXdr directly from txResult
                        if (!returnValue && txResult.resultXdr) {
                            try {
                                let resultXdr;
                                if (typeof txResult.resultXdr === 'string') {
                                    resultXdr = StellarSdk.xdr.TransactionResult.fromXDR(txResult.resultXdr, 'base64');
                                } else {
                                    resultXdr = txResult.resultXdr;
                                }
                                
                                // Try to get the return value from resultXdr
                                if (resultXdr && resultXdr.result) {
                                    const result = resultXdr.result();
                                    if (result && result.tr) {
                                        const tr = result.tr();
                                        if (tr && tr.invokeHostFunctionResult) {
                                            const invokeResult = tr.invokeHostFunctionResult();
                                            if (invokeResult && invokeResult.success) {
                                                const success = invokeResult.success();
                                                if (success) {
                                                    returnValue = success;
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (resultXdrError) {
                                console.log(`[Deposit Execute] ℹ️  Could not extract from resultXdr:`, resultXdrError.message);
                            }
                        }
                        
                        // Extract contract logs from sorobanMeta
                        if (sorobanMeta) {
                            try {
                                // Try multiple ways to get logs
                                // Method 1: sorobanMeta.logs() if available
                                if (typeof sorobanMeta.logs === 'function') {
                                    try {
                                        const logs = sorobanMeta.logs();
                                        if (logs && Array.isArray(logs) && logs.length > 0) {
                                            contractLogs = logs.map((log, index) => {
                                                try {
                                                    // Try different log formats
                                                    if (log && typeof log === 'object') {
                                                        const contractAddress = log.contractAddress ? log.contractAddress.toString() : 
                                                                                log.contract ? log.contract.toString() : 'unknown';
                                                        const logData = log.data ? log.data.toString() : 
                                                                      log.message ? log.message.toString() :
                                                                      log.toString();
                                                        return { contract: contractAddress, message: logData };
                                                    } else {
                                                        return { contract: 'unknown', message: log.toString() };
                                                    }
                                                } catch (e) {
                                                    return { contract: 'unknown', message: `Log ${index}: ${log?.toString() || 'unknown'}` };
                                                }
                                            });
                                        }
                                    } catch (logsError) {
                                        console.log(`[Deposit Execute] ℹ️  Method 1 (logs()) failed:`, logsError.message);
                                    }
                                }
                                
                                // Method 2: Check if logs are in events
                                if (contractLogs.length === 0 && typeof sorobanMeta.events === 'function') {
                                    try {
                                        const events = sorobanMeta.events();
                                        if (events && Array.isArray(events) && events.length > 0) {
                                            console.log(`[Deposit Execute] 📋 Found ${events.length} events in transaction`);
                                            events.forEach((event, index) => {
                                                console.log(`[Deposit Execute]   Event ${index + 1}:`, JSON.stringify(event, null, 2).substring(0, 200));
                                            });
                                        }
                                    } catch (eventsError) {
                                        console.log(`[Deposit Execute] ℹ️  Method 2 (events()) failed:`, eventsError.message);
                                    }
                                }
                                
                                // Method 3: Try to access logs directly as property
                                if (contractLogs.length === 0 && sorobanMeta.logs && Array.isArray(sorobanMeta.logs)) {
                                    contractLogs = sorobanMeta.logs.map((log, index) => {
                                        return { contract: 'unknown', message: log?.toString() || `Log ${index}` };
                                    });
                                }
                                
                                // Log sorobanMeta structure for debugging
                                if (contractLogs.length === 0) {
                                    console.log(`[Deposit Execute] 🔍 sorobanMeta structure:`, {
                                        hasLogs: typeof sorobanMeta.logs === 'function',
                                        hasEvents: typeof sorobanMeta.events === 'function',
                                        keys: Object.keys(sorobanMeta || {}),
                                        type: typeof sorobanMeta
                                    });
                                }
                            } catch (logError) {
                                console.log(`[Deposit Execute] ⚠️  Error extracting contract logs:`, logError.message);
                                console.log(`[Deposit Execute] ⚠️  Error stack:`, logError.stack);
                            }
                        }
                        
                        if (contractLogs.length > 0) {
                            console.log(`[Deposit Execute] 📋 Contract logs (${contractLogs.length} entries):`);
                            contractLogs.forEach((log, index) => {
                                console.log(`[Deposit Execute]   Log ${index + 1}: [${log.contract.substring(0, 12)}...] ${log.message}`);
                            });
                        } else {
                            console.log(`[Deposit Execute] ⚠️  No contract logs found in transaction result`);
                            console.log(`[Deposit Execute] 💡 Check transaction on Stellar Expert for contract logs:`);
                            console.log(`[Deposit Execute] 💡 https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);
                        }
                        
                        // Try to extract logs from txResult.events or txResult.diagnosticEventsXdr
                        if (contractLogs.length === 0 && txResult.events) {
                            try {
                                if (Array.isArray(txResult.events)) {
                                    console.log(`[Deposit Execute] 🔍 Found ${txResult.events.length} events in txResult.events`);
                                    txResult.events.forEach((event, index) => {
                                        try {
                                            const eventStr = JSON.stringify(event, null, 2);
                                            console.log(`[Deposit Execute]   Event ${index + 1}:`, eventStr.substring(0, 500));
                                            // Try to extract contract logs from events
                                            if (event.type === 'contract' || event.contractId) {
                                                const contractId = event.contractId || event.contract || 'unknown';
                                                const data = event.data || event.value || event.toString();
                                                contractLogs.push({ contract: contractId, message: typeof data === 'string' ? data : JSON.stringify(data) });
                                            }
                                        } catch (e) {
                                            console.log(`[Deposit Execute]   ⚠️  Error processing event ${index + 1}:`, e.message);
                                        }
                                    });
                                }
                            } catch (eventsError) {
                                console.log(`[Deposit Execute] ⚠️  Error extracting from txResult.events:`, eventsError.message);
                            }
                        }
                        
                        if (contractLogs.length === 0 && txResult.diagnosticEventsXdr) {
                            try {
                                console.log(`[Deposit Execute] 🔍 Attempting to parse diagnosticEventsXdr...`);
                                // diagnosticEventsXdr might contain contract logs
                                let diagnosticEvents;
                                if (typeof txResult.diagnosticEventsXdr === 'string') {
                                    try {
                                        diagnosticEvents = StellarSdk.xdr.DiagnosticEvent.fromXDR(txResult.diagnosticEventsXdr, 'base64');
                                    } catch (e) {
                                        // Try parsing as array
                                        diagnosticEvents = JSON.parse(txResult.diagnosticEventsXdr);
                                    }
                                } else if (Array.isArray(txResult.diagnosticEventsXdr)) {
                                    diagnosticEvents = txResult.diagnosticEventsXdr;
                                } else {
                                    diagnosticEvents = [txResult.diagnosticEventsXdr];
                                }
                                
                                if (Array.isArray(diagnosticEvents)) {
                                    console.log(`[Deposit Execute] 📋 Found ${diagnosticEvents.length} diagnostic events`);
                                    diagnosticEvents.forEach((event, index) => {
                                        try {
                                            const eventStr = JSON.stringify(event, null, 2);
                                            console.log(`[Deposit Execute]   Diagnostic Event ${index + 1}:`, eventStr.substring(0, 500));
                                        } catch (e) {
                                            console.log(`[Deposit Execute]   Diagnostic Event ${index + 1}:`, event?.toString() || 'unknown');
                                        }
                                    });
                                } else {
                                    const diagnosticStr = JSON.stringify(diagnosticEvents);
                                    console.log(`[Deposit Execute]   Diagnostic events preview:`, diagnosticStr.substring(0, 500));
                                }
                            } catch (diagnosticError) {
                                console.log(`[Deposit Execute] ⚠️  Error extracting from diagnosticEventsXdr:`, diagnosticError.message);
                                console.log(`[Deposit Execute] ⚠️  diagnosticEventsXdr type:`, typeof txResult.diagnosticEventsXdr);
                                if (typeof txResult.diagnosticEventsXdr === 'string') {
                                    console.log(`[Deposit Execute] ⚠️  diagnosticEventsXdr length:`, txResult.diagnosticEventsXdr.length);
                                }
                            }
                        }
                        
                        if (returnValue) {
                            console.log(`[Deposit Execute] 📊 Contract return value:`, returnValue);
                            console.log(`[Deposit Execute] 📊 Contract return value type:`, returnValue ? Object.keys(returnValue) : 'null');
                            
                            // Check if return value is false (for boolean return types)
                            // Handle both old structure (returnValue.b()) and new structure (ChildUnion with _value)
                            let boolValue = null;
                            
                            // Method 1: Try old structure with .b() method
                            if (returnValue && typeof returnValue.b === 'function') {
                                try {
                                    boolValue = returnValue.b();
                                    console.log(`[Deposit Execute] 📊 Contract returned boolean (via .b() method): ${boolValue}`);
                                } catch (e) {
                                    console.log(`[Deposit Execute] ℹ️  .b() method failed:`, e.message);
                                }
                            }
                            
                            // Method 2: Try new ChildUnion structure with _value and _arm
                            if (boolValue === null && returnValue && returnValue._arm === 'b' && returnValue.hasOwnProperty('_value')) {
                                boolValue = returnValue._value;
                                console.log(`[Deposit Execute] 📊 Contract returned boolean (via _value property): ${boolValue}`);
                            }
                            
                            // Method 3: Try hasOwnProperty('b') as fallback
                            if (boolValue === null && returnValue && returnValue.hasOwnProperty('b')) {
                                try {
                                    boolValue = returnValue.b();
                                    console.log(`[Deposit Execute] 📊 Contract returned boolean (via hasOwnProperty check): ${boolValue}`);
                                } catch (e) {
                                    console.log(`[Deposit Execute] ℹ️  hasOwnProperty('b') check failed:`, e.message);
                                }
                            }
                            
                            if (boolValue !== null) {
                                if (boolValue === false) {
                                    console.log(`[Deposit Execute] ❌ Contract returned false - Deposit was rejected by the contract`);
                                    
                                    // If we have contract logs, use them to identify the failure
                                    if (contractLogs.length > 0) {
                                        console.log(`[Deposit Execute] 🔍 Contract logs indicate the failure point:`);
                                        const failureLogs = contractLogs.filter(log => 
                                            log.message.toLowerCase().includes('rejected') || 
                                            log.message.toLowerCase().includes('failed') ||
                                            log.message.toLowerCase().includes('invalid') ||
                                            log.message.toLowerCase().includes('insufficient')
                                        );
                                        if (failureLogs.length > 0) {
                                            failureLogs.forEach(log => {
                                                console.log(`[Deposit Execute]   ❌ ${log.message}`);
                                            });
                                        } else {
                                            // Show all logs if no obvious failure message
                                            contractLogs.forEach(log => {
                                                console.log(`[Deposit Execute]   📋 ${log.message}`);
                                            });
                                        }
                                    } else {
                                        console.log(`[Deposit Execute] 🔍 Based on contract code analysis, possible reasons:`);
                                        console.log(`[Deposit Execute]   1. ❌ Invalid amount (amount <= 0) - Check: amount = ${processedParameters.amount}`);
                                        console.log(`[Deposit Execute]   2. ❌ Signer not registered - Check: passkey must be registered for ${public_key}`);
                                        console.log(`[Deposit Execute]   3. ❌ Invalid passkey public key length - Check: must be 65 bytes`);
                                        console.log(`[Deposit Execute]   4. ❌ Invalid signature length - Check: must be 64 bytes`);
                                        console.log(`[Deposit Execute]   5. ❌ Invalid WebAuthn signature - Check: verifier.verify() returned false`);
                                        console.log(`[Deposit Execute]   6. ⚠️  INSUFFICIENT TOKEN BALANCE - Most likely cause!`);
                                        console.log(`[Deposit Execute]      The contract checks: user_token_balance < amount`);
                                        console.log(`[Deposit Execute]      User (${public_key.substring(0, 12)}...) must have at least ${(parseInt(processedParameters.amount) / 10000000).toFixed(7)} XLM in their account`);
                                        console.log(`[Deposit Execute]      Check the user's balance on Stellar Expert: https://stellar.expert/explorer/testnet/account/${public_key}`);
                                        console.log(`[Deposit Execute]   7. ❌ Token transfer authorization failed - The token contract requires user authorization`);
                                    }
                                    
                                    console.log(`[Deposit Execute] 📋 Sent parameters:`, {
                                        user_address: processedParameters.user_address?.substring(0, 12) + '...',
                                        asset: processedParameters.asset?.substring(0, 12) + '...',
                                        amount: processedParameters.amount,
                                        amount_xlm: (parseInt(processedParameters.amount) / 10000000).toFixed(7),
                                        signature_payload_length: processedParameters.signature_payload?.length,
                                        signature_payload_preview: processedParameters.signature_payload?.substring(0, 100) + '...',
                                        webauthn_signature_length: processedParameters.webauthn_signature?.length,
                                        webauthn_authenticator_data_length: processedParameters.webauthn_authenticator_data?.length,
                                        webauthn_client_data_length: processedParameters.webauthn_client_data?.length
                                    });
                                    console.log(`[Deposit Execute] 💡 IMPORTANT: Check the contract logs on Stellar Expert for the exact failure point:`);
                                    console.log(`[Deposit Execute] 💡 Transaction: https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);
                                    console.log(`[Deposit Execute] 💡 The contract logs will show which check failed (e.g., "Deposit rejected: Insufficient token balance")`);
                                    
                                    // Log the WebAuthn data that was sent
                                    console.log(`[Deposit Execute] 🔍 WebAuthn data sent to contract:`, {
                                        signatureLength: webauthn_signature?.length,
                                        authenticatorDataLength: webauthn_authenticator_data?.length,
                                        clientDataLength: webauthn_client_data?.length,
                                        signaturePayloadLength: depositSignaturePayload?.length,
                                        signaturePayloadPreview: depositSignaturePayload?.substring(0, 100),
                                        passkeyPublicKeySPKI: passkey_public_key_spki ? passkey_public_key_spki.substring(0, 50) + '...' : 'not provided'
                                    });
                                    
                                    contractReturnedFalse = true;
                                } else {
                                    console.log(`[Deposit Execute] ✅ Contract returned true - Deposit was accepted`);
                                }
                            } else {
                                console.log(`[Deposit Execute] ℹ️  Contract return value is not a boolean (type: ${returnValue ? Object.keys(returnValue).join(', ') : 'null'})`);
                            }
                        } else {
                            console.log(`[Deposit Execute] ⚠️  Could not extract return value from transaction result`);
                            console.log(`[Deposit Execute] 🔍 Transaction result structure:`, {
                                hasResultMetaXdr: !!txResult.resultMetaXdr,
                                resultMetaXdrType: typeof txResult.resultMetaXdr,
                                hasV3: transactionMeta && typeof transactionMeta.v3 === 'function',
                                hasV2: transactionMeta && typeof transactionMeta.v2 === 'function',
                                hasSorobanMeta: !!sorobanMeta,
                                txResultKeys: Object.keys(txResult || {}),
                                transactionMetaKeys: transactionMeta ? Object.keys(transactionMeta) : []
                            });
                            
                            // Try to access return value from txResult directly
                            if (txResult.returnValue) {
                                returnValue = txResult.returnValue;
                                console.log(`[Deposit Execute] ✅ Found returnValue directly on txResult:`, returnValue);
                            } else if (txResult.result && txResult.result.returnValue) {
                                returnValue = txResult.result.returnValue;
                                console.log(`[Deposit Execute] ✅ Found returnValue in txResult.result:`, returnValue);
                            } else if (txResult.xdr && typeof txResult.xdr === 'string') {
                                // Try parsing the XDR string directly
                                try {
                                    const parsedXdr = StellarSdk.xdr.TransactionResultPair.fromXDR(txResult.xdr, 'base64');
                                    console.log(`[Deposit Execute] 🔍 Parsed XDR, checking for return value...`);
                                    // The structure might be different, log it for debugging
                                    console.log(`[Deposit Execute] 🔍 Parsed XDR structure:`, {
                                        hasResult: !!parsedXdr.result,
                                        keys: Object.keys(parsedXdr || {})
                                    });
                                } catch (xdrError) {
                                    console.log(`[Deposit Execute] ℹ️  Could not parse XDR string:`, xdrError.message);
                                }
                            }
                            
                            // Now process the returnValue if we found it in the fallback
                            if (returnValue) {
                                console.log(`[Deposit Execute] 📊 Contract return value (from fallback):`, returnValue);
                                console.log(`[Deposit Execute] 📊 Contract return value type:`, returnValue ? Object.keys(returnValue) : 'null');
                                
                                // Check if return value is false (for boolean return types)
                                // Handle both old structure (returnValue.b()) and new structure (ChildUnion with _value)
                                let boolValue = null;
                                
                                // Method 1: Try old structure with .b() method
                                if (returnValue && typeof returnValue.b === 'function') {
                                    try {
                                        boolValue = returnValue.b();
                                        console.log(`[Deposit Execute] 📊 Contract returned boolean (via .b() method): ${boolValue}`);
                                    } catch (e) {
                                        console.log(`[Deposit Execute] ℹ️  .b() method failed:`, e.message);
                                    }
                                }
                                
                                // Method 2: Try new ChildUnion structure with _value and _arm
                                if (boolValue === null && returnValue && returnValue._arm === 'b' && returnValue.hasOwnProperty('_value')) {
                                    boolValue = returnValue._value;
                                    console.log(`[Deposit Execute] 📊 Contract returned boolean (via _value property): ${boolValue}`);
                                }
                                
                                // Method 3: Try hasOwnProperty('b') as fallback
                                if (boolValue === null && returnValue && returnValue.hasOwnProperty('b')) {
                                    try {
                                        boolValue = returnValue.b();
                                        console.log(`[Deposit Execute] 📊 Contract returned boolean (via hasOwnProperty check): ${boolValue}`);
                                    } catch (e) {
                                        console.log(`[Deposit Execute] ℹ️  hasOwnProperty('b') check failed:`, e.message);
                                    }
                                }
                                
                                if (boolValue !== null) {
                                    if (boolValue === false) {
                                        console.log(`[Deposit Execute] ❌ Contract returned false - Deposit was rejected by the contract`);
                                        contractReturnedFalse = true;
                                    } else {
                                        console.log(`[Deposit Execute] ✅ Contract returned true - Deposit was accepted`);
                                    }
                                } else {
                                    console.log(`[Deposit Execute] ℹ️  Contract return value is not a boolean (type: ${returnValue ? Object.keys(returnValue).join(', ') : 'null'})`);
                                }
                            } else {
                                // If we still don't have a return value, log a warning but don't fail
                                // The transaction succeeded, so we'll treat it as success unless we can prove otherwise
                                console.warn(`[Deposit Execute] ⚠️  WARNING: Could not extract contract return value. Transaction succeeded, but we cannot verify if the contract returned true or false.`);
                                console.warn(`[Deposit Execute] ⚠️  Please check the transaction on Stellar Expert to verify the contract's return value:`);
                                console.warn(`[Deposit Execute] ⚠️  https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);
                                console.warn(`[Deposit Execute] ⚠️  If the contract returned false, the deposit was rejected by the contract.`);
                            }
                        }
                    } else {
                        console.log(`[Deposit Execute] ⚠️  Transaction result does not have resultMetaXdr`);
                    }
                } catch (returnValueError) {
                    console.warn(`[Deposit Execute] ⚠️  Could not extract contract return value:`, returnValueError.message);
                    console.warn(`[Deposit Execute] ⚠️  Error stack:`, returnValueError.stack);
                    console.warn(`[Deposit Execute] 🔍 Transaction result:`, {
                        status: txResult.status,
                        hasResultMetaXdr: !!txResult.resultMetaXdr,
                        resultMetaXdrType: typeof txResult.resultMetaXdr
                    });
                }
                
                // If contract returned false, treat as failure
                if (contractReturnedFalse) {
                    // Mark as failed in execution_results
                    const failUpdateQuery = `
                        UPDATE location_update_queue luq
                        SET execution_results = (
                            SELECT jsonb_agg(
                                CASE
                                    WHEN (result.value->>'rule_id')::integer = $1::integer
                                        AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $5
                                    THEN result.value || jsonb_build_object(
                                        'failed', true,
                                        'failed_at', $2::text,
                                        'error', $3::text,
                                        'transaction_hash', $4::text
                                    )
                                    ELSE result.value
                                END
                                ORDER BY result.ordinality
                            )
                            FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                        )
                        WHERE luq.id = $6::integer
                    `;
                    
                    try {
                        await pool.query(failUpdateQuery, [
                            ruleId,
                            new Date().toISOString(),
                            'Contract returned false - Deposit was rejected by the contract',
                            sendResult.hash,
                            public_key,
                            updateId
                        ]);
                    } catch (error) {
                        console.warn('[Deposit Execute] ⚠️  Could not update failure status:', error.message);
                    }
                    
                    return res.status(400).json({
                        success: false,
                        error: 'Deposit execution failed',
                        message: 'Contract returned false - Deposit was rejected by the contract',
                        transaction_hash: sendResult.hash,
                        status: txResult.status,
                        contract_return_value: false,
                        contract_logs: contractLogs.length > 0 ? contractLogs : undefined,
                        stellar_expert_url: `https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`,
                        deposit_action: {
                            id: action_id,
                            status: 'failed',
                            failed_at: new Date().toISOString(),
                            error_details: 'Contract returned false - Deposit was rejected by the contract'
                        }
                    });
                }
                
                // Update execution results
                const updateQuery = `
                    UPDATE location_update_queue luq
                    SET execution_results = (
                        SELECT jsonb_agg(
                            CASE
                                WHEN (result.value->>'rule_id')::integer = $1::integer
                                    AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                    AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                    AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                    AND COALESCE((result.value->>'completed')::boolean, false) = false
                                    AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $5
                                THEN (result.value - 'reason') || jsonb_build_object(
                                    'completed', true,
                                    'completed_at', $2::text,
                                    'transaction_hash', $3::text,
                                    'ledger', $4::text,
                                    'success', true,
                                    'skipped', false,
                                    'direct_execution', true,
                                    'executed_by', 'wallet_provider',
                                    'matched_public_key', COALESCE(result.value->>'matched_public_key', $5::text)
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        )
                        FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    ),
                    status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                    processed_at = NOW()
                    WHERE luq.id = $6::integer
                        AND luq.execution_results IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(luq.execution_results) AS r
                            WHERE (r->>'rule_id')::integer = $1::integer
                                AND COALESCE((r->>'skipped')::boolean, false) = true
                                AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                                AND COALESCE((r->>'rejected')::boolean, false) = false
                                AND COALESCE((r->>'completed')::boolean, false) = false
                                AND COALESCE(r->>'matched_public_key', luq.public_key) = $5
                        )
                    RETURNING luq.id
                `;

                await pool.query(updateQuery, [
                    ruleId,
                    new Date().toISOString(),
                    sendResult.hash,
                    txResult.ledger ? txResult.ledger.toString() : null,
                    public_key,
                    updateId
                ]);

                // Record execution history
                try {
                    await pool.query(
                        `INSERT INTO rule_execution_history (rule_id, public_key, transaction_hash, last_execution_at)
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (rule_id, public_key) 
                         DO UPDATE SET 
                             transaction_hash = EXCLUDED.transaction_hash,
                             last_execution_at = EXCLUDED.last_execution_at,
                             execution_count = rule_execution_history.execution_count + 1`,
                        [ruleId, public_key, sendResult.hash]
                    );
                } catch (error) {
                    console.warn('[Deposit Execute] ⚠️  Could not record execution history:', error.message);
                }

                const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;

                return res.json({
                    success: true,
                    message: 'Deposit executed successfully',
                    transaction_hash: sendResult.hash,
                    ledger: txResult.ledger,
                    stellar_expert_url: stellarExpertUrl,
                    deposit_action: {
                        id: action_id,
                        status: 'completed',
                        completed_at: new Date().toISOString()
                    }
                });
            } else {
                // Mark as failed in execution_results
                const failUpdateQuery = `
                    UPDATE location_update_queue luq
                    SET execution_results = (
                        SELECT jsonb_agg(
                            CASE
                                WHEN (result.value->>'rule_id')::integer = $1::integer
                                    AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $5
                                THEN result.value || jsonb_build_object(
                                    'failed', true,
                                    'failed_at', $3::text,
                                    'error', $4::text,
                                    'transaction_hash', $6::text
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        )
                        FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    )
                    WHERE luq.id = $7::integer
                `;
                
                try {
                    await pool.query(failUpdateQuery, [
                        ruleId,
                        new Date().toISOString(),
                        `Transaction failed with status: ${txResult.status}`,
                        public_key,
                        sendResult.hash,
                        updateId
                    ]);
                } catch (error) {
                    console.warn('[Deposit Execute] ⚠️  Could not update failure status:', error.message);
                }
                
                return res.status(400).json({
                    success: false,
                    error: 'Deposit execution failed',
                    message: `Transaction failed with status: ${txResult.status}`,
                    transaction_hash: sendResult.hash,
                    status: txResult.status,
                    result: txResult.resultXdr || txResult.errorResultXdr,
                    deposit_action: {
                        id: action_id,
                        status: 'failed',
                        failed_at: new Date().toISOString(),
                        error_details: txResult.resultXdr || txResult.errorResultXdr
                    }
                });
            }
        } catch (error) {
            console.error('[Deposit Execute] ❌ Error executing deposit:', error);
            
            // Try to mark as failed in execution_results
            try {
                const failUpdateQuery = `
                    UPDATE location_update_queue luq
                    SET execution_results = (
                        SELECT jsonb_agg(
                            CASE
                                WHEN (result.value->>'rule_id')::integer = $1::integer
                                    AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $5
                                THEN result.value || jsonb_build_object(
                                    'failed', true,
                                    'failed_at', $3::text,
                                    'error', $4::text
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        )
                        FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    )
                    WHERE luq.id = $6::integer
                `;
                
                await pool.query(failUpdateQuery, [
                    ruleId,
                    new Date().toISOString(),
                    error.message || error.toString(),
                    public_key,
                    updateId
                ]);
            } catch (updateError) {
                console.warn('[Deposit Execute] ⚠️  Could not update failure status:', updateError.message);
            }
            
            return res.status(500).json({
                success: false,
                error: 'Deposit execution failed',
                message: error.message || 'Unknown error occurred',
                deposit_action: {
                    id: action_id,
                    status: 'failed',
                    failed_at: new Date().toISOString(),
                    error_details: error.toString()
                }
            });
        }

    } catch (error) {
        console.error('Error executing deposit:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error', 
            message: error.message,
            details: error.toString()
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/deposits/{action_id}/complete:
 *   post:
 *     summary: Report deposit completion
 *     description: Reports that a deposit transaction has been completed. Used when XYZ-Wallet executes the deposit directly.
 *     tags: [Contracts]
 *     security:
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: action_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit action ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - transaction_hash
 *             properties:
 *               public_key:
 *                 type: string
 *               transaction_hash:
 *                 type: string
 *               ledger:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Deposit completion reported successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Deposit action not found
 */
router.post('/rules/pending/deposits/:action_id/complete', authenticateContractUser, async (req, res) => {
    try {
        // Allow wallet provider API key OR JWT authentication (for GeoLink users)
        const isWalletProvider = req.userType === 'wallet_provider' || req.user?.role === 'wallet_provider';
        const isJWTUser = !req.userType && req.user?.id;
        
        if (!isWalletProvider && !isJWTUser) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'This endpoint requires authentication (Wallet Provider API key or JWT token)'
            });
        }

        const { action_id } = req.params;
        const { public_key, transaction_hash, ledger } = req.body;

        if (!public_key || !transaction_hash) {
            return res.status(400).json({ 
                error: 'Missing required parameters',
                required: ['public_key', 'transaction_hash']
            });
        }

        // Parse action_id
        const parts = action_id.split('_');
        if (parts.length < 4 || parts[0] !== 'deposit') {
            return res.status(400).json({ error: 'Invalid action ID format' });
        }

        const updateId = parseInt(parts[1]);
        const ruleId = parseInt(parts[2]);
        const userId = req.user?.id || req.userId;
        
        // For JWT users, verify the deposit action belongs to their public_key
        if (isJWTUser && req.user?.public_key && public_key !== req.user.public_key) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'You can only report completion for deposit actions belonging to your own wallet'
            });
        }

        // Verify and update the deposit action
        const updateQuery = `
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE
                        WHEN (result.value->>'rule_id')::integer = $1::integer
                            AND COALESCE((result.value->>'skipped')::boolean, false) = true
                            AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                            AND COALESCE((result.value->>'rejected')::boolean, false) = false
                            AND COALESCE((result.value->>'completed')::boolean, false) = false
                            AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $6
                        THEN (result.value - 'reason') || jsonb_build_object(
                            'completed', true,
                            'completed_at', $3::text,
                            'transaction_hash', $4::text,
                            'success', true,
                            'skipped', false,
                            'direct_execution', true,
                            'executed_by', 'wallet_provider',
                            'matched_public_key', COALESCE(result.value->>'matched_public_key', $6::text)
                        )
                        ELSE result.value
                    END
                    ORDER BY result.ordinality
                )
                FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
            ),
            status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
            processed_at = NOW()
            WHERE luq.id = $7::integer
                AND luq.execution_results IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS r
                    WHERE (r->>'rule_id')::integer = $1::integer
                        AND COALESCE((r->>'skipped')::boolean, false) = true
                        AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                        AND COALESCE((r->>'rejected')::boolean, false) = false
                        AND COALESCE((r->>'completed')::boolean, false) = false
                        AND COALESCE(r->>'matched_public_key', luq.public_key) = $6
                )
            RETURNING luq.id, luq.received_at, luq.public_key
        `;

        const updateResult = await pool.query(updateQuery, [
            ruleId,
            userId,
            new Date().toISOString(),
            transaction_hash,
            ledger || null,
            public_key,
            updateId
        ]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Deposit action not found or already completed',
                message: 'The deposit action may have already been completed or does not exist'
            });
        }

        // Record execution in rule_execution_history for rate limiting
        try {
            await pool.query(
                `INSERT INTO rule_execution_history (rule_id, public_key, transaction_hash, last_execution_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (rule_id, public_key) 
                 DO UPDATE SET 
                     transaction_hash = EXCLUDED.transaction_hash,
                     last_execution_at = EXCLUDED.last_execution_at,
                     execution_count = rule_execution_history.execution_count + 1`,
                [ruleId, public_key, transaction_hash]
            );
        } catch (error) {
            console.warn('[Deposit Complete] ⚠️  Could not record execution history:', error.message);
        }

        // Get network from contract
        let network = 'testnet';
        try {
            const contractQuery = await pool.query(
                `SELECT network FROM custom_contracts WHERE id = (
                    SELECT contract_id FROM contract_execution_rules WHERE id = $1
                )`,
                [ruleId]
            );
            if (contractQuery.rows.length > 0) {
                network = contractQuery.rows[0].network || 'testnet';
            }
        } catch (error) {
            console.warn('[Deposit Complete] ⚠️  Could not fetch network from contract, defaulting to testnet:', error.message);
        }
        
        // Build StellarExpert URL
        const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${transaction_hash}`;

        res.json({
            success: true,
            message: 'Deposit completion reported successfully',
            deposit_action: {
                id: action_id,
                status: 'completed',
                completed_at: new Date().toISOString(),
                transaction_hash: transaction_hash,
                ledger: ledger,
                stellar_expert_url: stellarExpertUrl
            }
        });
    } catch (error) {
        console.error('Error reporting deposit completion:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/deposits/{action_id}/cancel:
 *   post:
 *     summary: Cancel deposit action
 *     description: Cancels a pending deposit action (e.g., if user declines or action expires)
 *     tags: [Contracts]
 *     security:
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: action_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit action ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *             properties:
 *               public_key:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [user_declined, expired, insufficient_balance, other]
 *     responses:
 *       200:
 *         description: Deposit action cancelled successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Deposit action not found
 */
router.post('/rules/pending/deposits/:action_id/cancel', authenticateContractUser, async (req, res) => {
    try {
        // Allow wallet provider API key OR JWT authentication (for GeoLink users)
        const isWalletProvider = req.userType === 'wallet_provider' || req.user?.role === 'wallet_provider';
        const isJWTUser = !req.userType && req.user?.id;
        
        if (!isWalletProvider && !isJWTUser) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'This endpoint requires authentication (Wallet Provider API key or JWT token)'
            });
        }

        const { action_id } = req.params;
        const { public_key, reason = 'user_declined' } = req.body;

        if (!public_key) {
            return res.status(400).json({ 
                error: 'Missing required parameter',
                required: ['public_key']
            });
        }

        // Parse action_id
        const parts = action_id.split('_');
        if (parts.length < 4 || parts[0] !== 'deposit') {
            return res.status(400).json({ error: 'Invalid action ID format' });
        }

        const updateId = parseInt(parts[1]);
        const ruleId = parseInt(parts[2]);
        const userId = req.user?.id || req.userId;
        
        // For JWT users, verify the deposit action belongs to their public_key
        if (isJWTUser && req.user?.public_key && public_key !== req.user.public_key) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'You can only cancel deposit actions belonging to your own wallet'
            });
        }

        // Update the deposit action to mark as cancelled/rejected
        const updateQuery = `
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE
                        WHEN (result.value->>'rule_id')::integer = $1::integer
                            AND COALESCE((result.value->>'skipped')::boolean, false) = true
                            AND COALESCE((result.value->>'completed')::boolean, false) = false
                            AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $5
                        THEN result.value || jsonb_build_object(
                            'rejected', true,
                            'rejected_at', $3::text,
                            'rejection_reason', $4::text,
                            'cancelled_by', 'wallet_provider'
                        )
                        ELSE result.value
                    END
                    ORDER BY result.ordinality
                )
                FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
            )
            WHERE luq.id = $6::integer
                AND luq.execution_results IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS r
                    WHERE (r->>'rule_id')::integer = $1::integer
                        AND COALESCE((r->>'skipped')::boolean, false) = true
                        AND COALESCE((r->>'completed')::boolean, false) = false
                        AND COALESCE((r->>'rejected')::boolean, false) = false
                        AND COALESCE(r->>'matched_public_key', luq.public_key) = $5
                )
            RETURNING luq.id
        `;

        const updateResult = await pool.query(updateQuery, [
            ruleId,
            userId,
            new Date().toISOString(),
            reason,
            public_key,
            updateId
        ]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Deposit action not found or already completed/cancelled',
                message: 'The deposit action may have already been completed or cancelled'
            });
        }

        res.json({
            success: true,
            message: 'Deposit action cancelled',
            deposit_action: {
                id: action_id,
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                reason: reason
            }
        });
    } catch (error) {
        console.error('Error cancelling deposit action:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/cleanup:
 *   post:
 *     summary: Cleanup and realign pending rules queue
 *     description: Self-check function that removes old queue records superseded by newer executions and marks outdated entries as skipped. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *       401:
 *         description: Authentication required
 */
router.post('/rules/pending/cleanup', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        console.log('[QueueCleanup] 🔧 Starting queue cleanup and realignment...');
        
        // First, re-evaluate expired rate limits
        const backgroundAIService = require('../services/backgroundAIService');
        const rateLimitStats = await backgroundAIService.reEvaluateExpiredRateLimits();
        console.log('[QueueCleanup] 📊 Rate limit re-evaluation:', rateLimitStats);
        
        // Clean up very old pending rules (older than 7 days) - run this FIRST to mark old entries
        const oldCleanupStats = await backgroundAIService.cleanupVeryOldPendingRules();
        console.log('[QueueCleanup] 📊 Very old entries cleanup:', oldCleanupStats);
        
        // Also run the full periodic cleanup to mark superseded entries
        await backgroundAIService.runPeriodicCleanup();
        console.log('[QueueCleanup] ✅ Full periodic cleanup completed');
        
        const cleanupStats = {
            markedSkipped: 0,
            deletedEntries: 0,
            rateLimitSkipped: 0,
            supersededSkipped: 0,
            rateLimitReEvaluated: rateLimitStats.reEvaluated || 0,
            rateLimitUpdatedToWebAuthn: rateLimitStats.updatedToWebAuthn || 0,
            rateLimitStillBlocked: rateLimitStats.stillBlocked || 0,
            veryOldMarkedSuperseded: oldCleanupStats.markedSuperseded || 0,
            veryOldDeleted: oldCleanupStats.deleted || 0
        };

        // Step 1: Find all completed executions to identify what should be considered "latest"
        const completedExecutionsQuery = `
            SELECT DISTINCT
                (result->>'rule_id')::integer as rule_id,
                COALESCE(result->>'matched_public_key', luq.public_key) as matched_key,
                luq.public_key as queue_public_key,
                luq.user_id,
                MAX(luq.received_at) as latest_execution_time
            FROM location_update_queue luq
            CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND COALESCE((result->>'completed')::boolean, false) = true
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
            GROUP BY (result->>'rule_id')::integer, 
                     COALESCE(result->>'matched_public_key', luq.public_key),
                     luq.public_key,
                     luq.user_id
        `;
        
        const completedExecutions = await pool.query(completedExecutionsQuery, [publicKey || null, userId || null]);
        const latestExecutionsMap = new Map();
        
        for (const exec of completedExecutions.rows) {
            const key = `${exec.rule_id}_${exec.matched_key}`;
            if (!latestExecutionsMap.has(key) || 
                new Date(exec.latest_execution_time) > new Date(latestExecutionsMap.get(key).latest_execution_time)) {
                latestExecutionsMap.set(key, exec);
            }
        }

        // Step 2: Find old pending entries that should be marked as superseded
        const oldPendingQuery = `
            SELECT 
                luq.id,
                luq.execution_results,
                luq.received_at,
                luq.public_key,
                luq.user_id
            FROM location_update_queue luq
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
        `;
        
        const oldPendingResult = await pool.query(oldPendingQuery, [publicKey || null, userId || null]);
        
        // Process each entry and update if needed
        for (const entry of oldPendingResult.rows) {
            let executionResults = typeof entry.execution_results === 'string' 
                ? JSON.parse(entry.execution_results) 
                : entry.execution_results;
            
            let updated = false;
            const newResults = executionResults.map(result => {
                const ruleId = result.rule_id;
                const matchedKey = result.matched_public_key || entry.public_key;
                const key = `${ruleId}_${matchedKey}`;
                
                // Check if this result should be marked as superseded
                if (latestExecutionsMap.has(key)) {
                    const latestExec = latestExecutionsMap.get(key);
                    if (new Date(entry.received_at) < new Date(latestExec.latest_execution_time) &&
                        !result.completed &&
                        result.skipped &&
                        result.reason !== 'superseded_by_newer_execution') {
                        updated = true;
                        cleanupStats.supersededSkipped++;
                        return {
                            ...result,
                            reason: 'superseded_by_newer_execution',
                            superseded_at: new Date().toISOString()
                        };
                    }
                }
                
                // Check rate limits
                if (!result.completed && result.skipped && result.reason === 'requires_webauthn') {
                    // We'll check rate limits in a separate query
                }
                
                return result;
            });
            
            if (updated) {
                await pool.query(
                    'UPDATE location_update_queue SET execution_results = $1::jsonb WHERE id = $2',
                    [JSON.stringify(newResults), entry.id]
                );
            }
        }

        // Step 3: Check rate limits and mark entries as skipped if rate limit exceeded
        const rateLimitCheckQuery = `
            WITH latest_executions AS (
                SELECT 
                    (result->>'rule_id')::integer as rule_id,
                    COALESCE(result->>'matched_public_key', luq.public_key) as matched_key,
                    luq.public_key as queue_public_key,
                    luq.user_id,
                    MAX(luq.received_at) as latest_execution_time
                FROM location_update_queue luq
                CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
                WHERE luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND COALESCE((result->>'completed')::boolean, false) = true
                    AND (
                        (luq.public_key = $1 OR $1 IS NULL)
                        OR (luq.user_id = $2 OR $2 IS NULL)
                    )
                GROUP BY (result->>'rule_id')::integer, 
                         COALESCE(result->>'matched_public_key', luq.public_key),
                         luq.public_key,
                         luq.user_id
            )
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE 
                        WHEN (result->>'rule_id')::integer = le.rule_id
                            AND COALESCE(result->>'matched_public_key', luq.public_key) = le.matched_key
                            AND COALESCE((result->>'completed')::boolean, false) = false
                            AND COALESCE((result->>'skipped')::boolean, false) = true
                            AND luq.received_at < le.latest_execution_time
                        THEN jsonb_set(
                            result,
                            '{skipped}',
                            'true'::jsonb
                        ) || jsonb_build_object(
                            'reason', 'superseded_by_newer_execution',
                            'superseded_at', CURRENT_TIMESTAMP::text
                        )
                        ELSE result
                    END
                )
                FROM jsonb_array_elements(luq.execution_results) AS result
                CROSS JOIN latest_executions le
                WHERE (result->>'rule_id')::integer = le.rule_id
                    AND COALESCE(result->>'matched_public_key', luq.public_key) = le.matched_key
                    AND luq.received_at < le.latest_execution_time
            )
            FROM latest_executions le
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND luq.received_at < le.latest_execution_time
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE (result->>'rule_id')::integer = le.rule_id
                        AND COALESCE(result->>'matched_public_key', luq.public_key) = le.matched_key
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                )
        `;
        
        // Simplified approach: Mark old entries as skipped
        const markSupersededQuery = `
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE 
                        WHEN (result->>'rule_id')::integer = $3
                            AND COALESCE((result->>'completed')::boolean, false) = false
                            AND COALESCE((result->>'skipped')::boolean, false) = true
                            AND luq.received_at < (
                                SELECT MAX(luq2.received_at)
                                FROM location_update_queue luq2
                                CROSS JOIN jsonb_array_elements(luq2.execution_results) AS exec_result
                                WHERE (exec_result->>'rule_id')::integer = $3
                                    AND COALESCE((exec_result->>'completed')::boolean, false) = true
                                    AND (
                                        COALESCE(exec_result->>'matched_public_key', luq2.public_key) = 
                                        COALESCE(result->>'matched_public_key', luq.public_key)
                                    )
                                    AND (
                                        (luq2.public_key = $1 OR $1 IS NULL)
                                        OR (luq2.user_id = $2 OR $2 IS NULL)
                                    )
                            )
                        THEN jsonb_set(
                            result,
                            '{reason}',
                            '"superseded_by_newer_execution"'::jsonb
                        ) || jsonb_build_object(
                            'superseded_at', CURRENT_TIMESTAMP::text
                        )
                        ELSE result
                    END
                )
                FROM jsonb_array_elements(luq.execution_results) AS result
            )
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
                AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE COALESCE((result->>'completed')::boolean, false) = false
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                )
        `;

        // Better approach: Use a CTE to find and update
        const cleanupQuery = `
            WITH completed_executions AS (
                -- Find all completed executions with their timestamps
                SELECT DISTINCT
                    (result->>'rule_id')::integer as rule_id,
                    COALESCE(result->>'matched_public_key', luq.public_key) as matched_key,
                    luq.public_key as queue_public_key,
                    luq.user_id,
                    MAX(luq.received_at) as latest_execution_time
                FROM location_update_queue luq
                CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
                WHERE luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND COALESCE((result->>'completed')::boolean, false) = true
                    AND (
                        (luq.public_key = $1 OR $1 IS NULL)
                        OR (luq.user_id = $2 OR $2 IS NULL)
                    )
                GROUP BY (result->>'rule_id')::integer, 
                         COALESCE(result->>'matched_public_key', luq.public_key),
                         luq.public_key,
                         luq.user_id
            ),
            entries_to_cleanup AS (
                -- Find old pending entries that should be marked as skipped
                SELECT DISTINCT
                    luq.id as queue_id,
                    (result->>'rule_id')::integer as rule_id,
                    COALESCE(result->>'matched_public_key', luq.public_key) as matched_key
                FROM location_update_queue luq
                CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
                INNER JOIN completed_executions ce ON 
                    (result->>'rule_id')::integer = ce.rule_id
                    AND COALESCE(result->>'matched_public_key', luq.public_key) = ce.matched_key
                WHERE luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND COALESCE((result->>'completed')::boolean, false) = false
                    AND COALESCE((result->>'skipped')::boolean, false) = true
                    AND luq.received_at < ce.latest_execution_time
                    AND (
                        (luq.public_key = $1 OR $1 IS NULL)
                        OR (luq.user_id = $2 OR $2 IS NULL)
                    )
            )
            UPDATE location_update_queue luq
            SET execution_results = (
                SELECT jsonb_agg(
                    CASE 
                        WHEN (result->>'rule_id')::integer = etc.rule_id
                            AND COALESCE(result->>'matched_public_key', luq.public_key) = etc.matched_key
                            AND COALESCE((result->>'completed')::boolean, false) = false
                            AND COALESCE((result->>'skipped')::boolean, false) = true
                        THEN result || jsonb_build_object(
                            'reason', 'superseded_by_newer_execution',
                            'superseded_at', CURRENT_TIMESTAMP::text
                        )
                        ELSE result
                    END
                )
                FROM jsonb_array_elements(luq.execution_results) AS result
                CROSS JOIN entries_to_cleanup etc
                WHERE luq.id = etc.queue_id
            )
            FROM entries_to_cleanup etc
            WHERE luq.id = etc.queue_id
            RETURNING luq.id
        `;

        // Step 3: Check rate limits and mark entries as skipped if rate limit exceeded
        const rateLimitEntriesQuery = `
            SELECT 
                luq.id,
                luq.execution_results,
                luq.public_key
            FROM location_update_queue luq
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
        `;
        
        const rateLimitEntries = await pool.query(rateLimitEntriesQuery, [publicKey || null, userId || null]);
        
        for (const entry of rateLimitEntries.rows) {
            let executionResults = typeof entry.execution_results === 'string' 
                ? JSON.parse(entry.execution_results) 
                : entry.execution_results;
            
            let updated = false;
            const newResults = await Promise.all(executionResults.map(async (result) => {
                if (result.completed || !result.skipped || result.reason === 'rate_limit_exceeded') {
                    return result;
                }
                
                // Check if rule has rate limiting configured
                const ruleQuery = await pool.query(
                    'SELECT max_executions_per_public_key, execution_time_window_seconds FROM contract_execution_rules WHERE id = $1',
                    [result.rule_id]
                );
                
                if (ruleQuery.rows.length === 0) {
                    return result;
                }
                
                const rule = ruleQuery.rows[0];
                if (!rule.max_executions_per_public_key || !rule.execution_time_window_seconds ||
                    rule.max_executions_per_public_key === 0 || rule.execution_time_window_seconds === 0) {
                    return result;
                }
                
                // Check execution history
                const execCountQuery = await pool.query(
                    `SELECT COUNT(*) as count
                     FROM rule_execution_history
                     WHERE rule_id = $1
                       AND public_key = $2
                       AND last_execution_at >= CURRENT_TIMESTAMP - ($3 || ' seconds')::INTERVAL`,
                    [result.rule_id, entry.public_key, rule.execution_time_window_seconds]
                );
                
                const execCount = parseInt(execCountQuery.rows[0]?.count || 0);
                if (execCount >= rule.max_executions_per_public_key) {
                    updated = true;
                    cleanupStats.rateLimitSkipped++;
                    return {
                        ...result,
                        reason: 'rate_limit_exceeded',
                        message: 'Rate limit exceeded - marked during cleanup',
                        marked_at: new Date().toISOString()
                    };
                }
                
                return result;
            }));
            
            if (updated) {
                await pool.query(
                    'UPDATE location_update_queue SET execution_results = $1::jsonb WHERE id = $2',
                    [JSON.stringify(newResults), entry.id]
                );
            }
        }

        // Step 4: Delete old queue entries that have no valid pending rules and are superseded
        const entriesToDeleteQuery = `
            SELECT luq.id
            FROM location_update_queue luq
            WHERE luq.status IN ('matched', 'executed')
                AND luq.execution_results IS NOT NULL
                AND (
                    (luq.public_key = $1 OR $1 IS NULL)
                    OR (luq.user_id = $2 OR $2 IS NULL)
                )
                -- Only delete if all execution results are skipped/superseded (no valid pending rules)
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE COALESCE((result->>'completed')::boolean, false) = false
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                        AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rate_limit_exceeded')
                )
                -- Don't delete entries that have completed rules
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE COALESCE((result->>'completed')::boolean, false) = true
                )
        `;
        
        const entriesToDelete = await pool.query(entriesToDeleteQuery, [publicKey || null, userId || null]);
        
        for (const entry of entriesToDelete.rows) {
            // Check if this entry is superseded by a newer execution
            const entryDetails = await pool.query(
                'SELECT execution_results, received_at, public_key FROM location_update_queue WHERE id = $1',
                [entry.id]
            );
            
            if (entryDetails.rows.length === 0) continue;
            
            const entryData = entryDetails.rows[0];
            let executionResults = typeof entryData.execution_results === 'string' 
                ? JSON.parse(entryData.execution_results) 
                : entryData.execution_results;
            
            let shouldDelete = false;
            for (const result of executionResults) {
                if (result.completed) continue;
                
                const ruleId = result.rule_id;
                const matchedKey = result.matched_public_key || entryData.public_key;
                const key = `${ruleId}_${matchedKey}`;
                
                if (latestExecutionsMap.has(key)) {
                    const latestExec = latestExecutionsMap.get(key);
                    if (new Date(entryData.received_at) < new Date(latestExec.latest_execution_time)) {
                        shouldDelete = true;
                        break;
                    }
                }
            }
            
            if (shouldDelete) {
                await pool.query('DELETE FROM location_update_queue WHERE id = $1', [entry.id]);
                cleanupStats.deletedEntries++;
            }
        }

        console.log('[QueueCleanup] ✅ Cleanup completed:', cleanupStats);

        res.json({
            success: true,
            message: 'Queue cleanup completed',
            stats: cleanupStats,
            rateLimitReEvaluation: {
                reEvaluated: rateLimitStats.reEvaluated || 0,
                updatedToWebAuthn: rateLimitStats.updatedToWebAuthn || 0,
                stillBlocked: rateLimitStats.stillBlocked || 0
            },
            veryOldCleanup: {
                markedSuperseded: oldCleanupStats.markedSuperseded || 0,
                deleted: oldCleanupStats.deleted || 0
            }
        });
    } catch (error) {
        console.error('[QueueCleanup] ❌ Error during cleanup:', error);
        res.status(500).json({ 
            error: 'Cleanup failed', 
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/pending/{ruleId}/reject:
 *   post:
 *     summary: Reject/dismiss a pending rule
 *     description: Mark a pending rule as rejected so it no longer appears in the pending list. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rule ID to reject
 *     responses:
 *       200:
 *         description: Rule rejected successfully
 *       404:
 *         description: Rule not found
 *       401:
 *         description: Authentication required
 */
router.post('/rules/pending/:ruleId/reject', authenticateContractUser, async (req, res) => {
    try {
        const { ruleId } = req.params;
        const { matched_public_key } = req.body; // Optional: specific public key to reject for
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Get actual user ID (handle both JWT and API key auth)
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
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Update the execution_results in location_update_queue to mark this rule as rejected
        // If matched_public_key is provided, only reject for that specific public key
        // Otherwise, reject all instances for this user (backward compatibility)
        // Use a CTE to properly handle the JSONB array update
        let updateQuery;
        let queryParams;
        
        if (matched_public_key) {
            // Reject specific rule + public key combination
            updateQuery = `
                WITH updated_results AS (
                    SELECT 
                        luq.id,
                        jsonb_agg(
                            CASE 
                                WHEN (result.value->>'rule_id')::integer = $1::integer 
                                     AND result.value->>'skipped' = 'true'
                                     AND (result.value->>'rejected')::boolean IS DISTINCT FROM true
                                     AND (result.value->>'matched_public_key' = $4 OR luq.public_key = $4)
                                THEN result.value || jsonb_build_object(
                                    'rejected', true, 
                                    'rejected_at', $3::text
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        ) AS new_execution_results
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    WHERE luq.user_id = $2
                        AND luq.public_key = $4
                        AND luq.execution_results IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(luq.execution_results) AS check_result
                            WHERE (check_result->>'rule_id')::integer = $1::integer
                            AND check_result->>'skipped' = 'true'
                            AND (check_result->>'rejected')::boolean IS DISTINCT FROM true
                            AND (check_result->>'matched_public_key' = $4 OR luq.public_key = $4)
                        )
                    GROUP BY luq.id
                )
                UPDATE location_update_queue luq
                SET execution_results = ur.new_execution_results
                FROM updated_results ur
                WHERE luq.id = ur.id
                RETURNING luq.id
            `;
            queryParams = [parseInt(ruleId), actualUserId, new Date().toISOString(), matched_public_key];
        } else {
            // Reject all instances of this rule for this user (backward compatibility)
            updateQuery = `
                WITH updated_results AS (
                    SELECT 
                        luq.id,
                        jsonb_agg(
                            CASE 
                                WHEN (result.value->>'rule_id')::integer = $1::integer 
                                     AND result.value->>'skipped' = 'true'
                                     AND (result.value->>'rejected')::boolean IS DISTINCT FROM true
                                THEN result.value || jsonb_build_object(
                                    'rejected', true, 
                                    'rejected_at', $3::text
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        ) AS new_execution_results
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    WHERE luq.user_id = $2
                        AND luq.execution_results IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(luq.execution_results) AS check_result
                            WHERE (check_result->>'rule_id')::integer = $1::integer
                            AND check_result->>'skipped' = 'true'
                            AND (check_result->>'rejected')::boolean IS DISTINCT FROM true
                        )
                    GROUP BY luq.id
                )
                UPDATE location_update_queue luq
                SET execution_results = ur.new_execution_results
                FROM updated_results ur
                WHERE luq.id = ur.id
                RETURNING luq.id
            `;
            queryParams = [parseInt(ruleId), actualUserId, new Date().toISOString()];
        }

        const result = await pool.query(updateQuery, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Pending rule not found or already rejected',
                message: 'The rule may have already been rejected or executed'
            });
        }

        res.json({
            success: true,
            message: 'Pending rule rejected successfully',
            rejected_rule_id: ruleId
        });
    } catch (error) {
        console.error('Error rejecting pending rule:', error);
        res.status(500).json({ 
            error: 'Failed to reject pending rule',
            message: error.message 
        });
    }
});

/**
 * POST /api/contracts/rules/pending/:ruleId/complete
 * Mark a pending rule (requires_webauthn) as completed in location_update_queue.execution_results.
 * Recovery path for cases where an execution succeeded on-chain but DB status update failed.
 *
 * Body: { matched_public_key?: string, transaction_hash?: string }
 */
router.post('/rules/pending/:ruleId/complete', authenticateContractUser, async (req, res) => {
    try {
        const { ruleId } = req.params;
        const { matched_public_key, transaction_hash, update_id } = req.body || {};
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;

        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Get actual user ID (handle both JWT and API key auth)
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
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        const completedAt = new Date().toISOString();
        let updateQuery;
        let queryParams;

        if (update_id) {
            // Precise recovery: update a specific queue entry by (user_id + update_id), no public_key requirement
            updateQuery = `
                UPDATE location_update_queue luq
                SET execution_results = (
                    SELECT jsonb_agg(
                        CASE
                            WHEN (result.value->>'rule_id')::integer = $1::integer
                                AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                AND COALESCE((result.value->>'completed')::boolean, false) = false
                            THEN result.value || jsonb_build_object(
                                'completed', true,
                                'completed_at', $3::text,
                                'transaction_hash', COALESCE($4::text, result.value->>'transaction_hash'),
                                'success', true,
                                'skipped', false,
                                'direct_execution', true,
                                'matched_public_key', COALESCE(result.value->>'matched_public_key', $5::text)
                            )
                            ELSE result.value
                        END
                        ORDER BY result.ordinality
                    )
                    FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                ),
                status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                processed_at = NOW()
                WHERE luq.user_id = $2
                    AND luq.id = $6::integer
                    AND luq.execution_results IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS r
                        WHERE (r->>'rule_id')::integer = $1::integer
                            AND COALESCE((r->>'skipped')::boolean, false) = true
                            AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                            AND COALESCE((r->>'completed')::boolean, false) = false
                            AND COALESCE((r->>'rejected')::boolean, false) = false
                    )
                RETURNING luq.id
            `;
            queryParams = [
                parseInt(ruleId),
                actualUserId,
                completedAt,
                transaction_hash || null,
                matched_public_key || null,
                parseInt(update_id)
            ];
        } else if (matched_public_key) {
            // Best-effort recovery: match by user_id + matched_public_key (without requiring luq.public_key to match)
            updateQuery = `
                WITH updated_results AS (
                    SELECT
                        luq.id,
                        jsonb_agg(
                            CASE
                                WHEN (result.value->>'rule_id')::integer = $1::integer
                                     AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                     AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                     AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                     AND COALESCE((result.value->>'completed')::boolean, false) = false
                                     AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $4::text
                                THEN result.value || jsonb_build_object(
                                    'completed', true,
                                    'completed_at', $3::text,
                                    'transaction_hash', COALESCE($5::text, result.value->>'transaction_hash'),
                                    'success', true,
                                    'skipped', false,
                                    'direct_execution', true,
                                    'matched_public_key', COALESCE(result.value->>'matched_public_key', $4::text)
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        ) AS new_execution_results
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    WHERE luq.user_id = $2
                        AND ($6::integer IS NULL OR luq.id = $6::integer)
                        AND luq.execution_results IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(luq.execution_results) AS check_result
                            WHERE (check_result->>'rule_id')::integer = $1::integer
                                AND COALESCE((check_result->>'skipped')::boolean, false) = true
                                AND COALESCE(check_result->>'reason', '') = 'requires_webauthn'
                                AND COALESCE((check_result->>'completed')::boolean, false) = false
                                AND COALESCE((check_result->>'rejected')::boolean, false) = false
                                AND COALESCE(check_result->>'matched_public_key', luq.public_key) = $4::text
                        )
                    GROUP BY luq.id
                )
                UPDATE location_update_queue luq
                SET execution_results = ur.new_execution_results,
                    status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                    processed_at = NOW()
                FROM updated_results ur
                WHERE luq.id = ur.id
                RETURNING luq.id
            `;
            queryParams = [
                parseInt(ruleId),
                actualUserId,
                completedAt,
                matched_public_key,
                transaction_hash || null,
                update_id || null
            ];
        } else {
            // Complete all instances of this rule for this user (backward compatibility)
            updateQuery = `
                WITH updated_results AS (
                    SELECT 
                        luq.id,
                        jsonb_agg(
                            CASE 
                                WHEN (result.value->>'rule_id')::integer = $1::integer
                                     AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                     AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                     AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                     AND COALESCE((result.value->>'completed')::boolean, false) = false
                                THEN result.value || jsonb_build_object(
                                    'completed', true, 
                                    'completed_at', $3::text,
                                    'transaction_hash', COALESCE($4::text, result.value->>'transaction_hash'),
                                    'success', true,
                                    'skipped', false,
                                    'direct_execution', true
                                )
                                ELSE result.value
                            END
                            ORDER BY result.ordinality
                        ) AS new_execution_results
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                    WHERE luq.user_id = $2
                        AND ($5::integer IS NULL OR luq.id = $5::integer)
                        AND luq.execution_results IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(luq.execution_results) AS check_result
                            WHERE (check_result->>'rule_id')::integer = $1::integer
                            AND COALESCE((check_result->>'skipped')::boolean, false) = true
                            AND COALESCE(check_result->>'reason', '') = 'requires_webauthn'
                            AND COALESCE((check_result->>'completed')::boolean, false) = false
                            AND COALESCE((check_result->>'rejected')::boolean, false) = false
                        )
                    GROUP BY luq.id
                )
                UPDATE location_update_queue luq
                SET execution_results = ur.new_execution_results,
                    status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                    processed_at = NOW()
                FROM updated_results ur
                WHERE luq.id = ur.id
                RETURNING luq.id
            `;
            queryParams = [parseInt(ruleId), actualUserId, completedAt, transaction_hash || null, update_id || null];
        }

        const result = await pool.query(updateQuery, queryParams);

        res.json({
            success: true,
            updated_rows: result.rowCount,
            updated_update_ids: result.rows.map(r => r.id),
            completed_rule_id: parseInt(ruleId),
            matched_public_key: matched_public_key || null,
            transaction_hash: transaction_hash || null
        });
    } catch (error) {
        console.error('Error completing pending rule:', error);
        res.status(500).json({ 
            error: 'Failed to complete pending rule',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /api/contracts/rules/completed:
 *   get:
 *     summary: Get all completed execution rules
 *     description: Returns a list of execution rules that were successfully executed after being pending. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of completed rules to return
 *     responses:
 *       200:
 *         description: List of completed rules
 *       401:
 *         description: Authentication required
 */
router.get('/rules/completed', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        const limit = parseInt(req.query.limit) || 1000; // Default limit increased to show more completed rules (can be overridden via query param)
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by both user_id AND public_key when both available (OR logic for multi-role users)
        // This ensures we get all records regardless of which role was active when created
        let query, params;
        if (publicKey && userId) {
            query = `
                WITH completed_rules AS (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        cer.id as rule_id,
                        cer.rule_name,
                        cer.function_name,
                        cer.function_parameters,
                        cc.function_mappings,
                        cer.contract_id,
                        cc.contract_name,
                        cc.contract_address,
                        luq.id as update_id,
                        luq.public_key,
                        luq.latitude,
                        luq.longitude,
                        luq.received_at,
                        luq.processed_at,
                        result_data.value as execution_result,
                        (result_data.value->>'rule_id')::integer as execution_rule_id,
                        result_data.value->>'transaction_hash' as transaction_hash,
                        COALESCE(result_data.value->>'matched_public_key', luq.public_key) as matched_public_key,
                        result_data.value->>'completed_at' as completed_at,
                        result_data.ordinality as result_ordinality
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    JOIN contract_execution_rules cer ON cer.id = (result_data.value->>'rule_id')::integer
                    JOIN custom_contracts cc ON cer.contract_id = cc.id
                    WHERE (luq.public_key = $1 OR luq.user_id = $2)
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality,
                        COALESCE((result_data.value->>'completed_at')::timestamp, luq.received_at) DESC
                )
                SELECT *
                FROM completed_rules
                ORDER BY COALESCE(completed_at::timestamp, received_at) DESC
                LIMIT $3
            `;
            params = [publicKey, userId, limit];
        } else if (publicKey) {
            query = `
                WITH completed_rules AS (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        cer.id as rule_id,
                        cer.rule_name,
                        cer.function_name,
                        cer.function_parameters,
                        cc.function_mappings,
                        cer.contract_id,
                        cc.contract_name,
                        cc.contract_address,
                        luq.id as update_id,
                        luq.public_key,
                        luq.latitude,
                        luq.longitude,
                        luq.received_at,
                        luq.processed_at,
                        result_data.value as execution_result,
                        (result_data.value->>'rule_id')::integer as execution_rule_id,
                        result_data.value->>'transaction_hash' as transaction_hash,
                        COALESCE(result_data.value->>'matched_public_key', luq.public_key) as matched_public_key,
                        result_data.value->>'completed_at' as completed_at,
                        result_data.ordinality as result_ordinality
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    JOIN contract_execution_rules cer ON cer.id = (result_data.value->>'rule_id')::integer
                    JOIN custom_contracts cc ON cer.contract_id = cc.id
                    WHERE luq.public_key = $1
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality,
                        COALESCE((result_data.value->>'completed_at')::timestamp, luq.received_at) DESC
                )
                SELECT *
                FROM completed_rules
                ORDER BY COALESCE(completed_at::timestamp, received_at) DESC
                LIMIT $2
            `;
            params = [publicKey, limit];
        } else {
            if (!userId) {
                return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
            }
            query = `
                WITH completed_rules AS (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        cer.id as rule_id,
                        cer.rule_name,
                        cer.function_name,
                        cer.function_parameters,
                        cc.function_mappings,
                        cer.contract_id,
                        cc.contract_name,
                        cc.contract_address,
                        luq.id as update_id,
                        luq.public_key,
                        luq.latitude,
                        luq.longitude,
                        luq.received_at,
                        luq.processed_at,
                        result_data.value as execution_result,
                        (result_data.value->>'rule_id')::integer as execution_rule_id,
                        result_data.value->>'transaction_hash' as transaction_hash,
                        COALESCE(result_data.value->>'matched_public_key', luq.public_key) as matched_public_key,
                        result_data.value->>'completed_at' as completed_at,
                        result_data.ordinality as result_ordinality
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    JOIN contract_execution_rules cer ON cer.id = (result_data.value->>'rule_id')::integer
                    JOIN custom_contracts cc ON cer.contract_id = cc.id
                    WHERE luq.user_id = $1
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality,
                        COALESCE((result_data.value->>'completed_at')::timestamp, luq.received_at) DESC
                )
                SELECT *
                FROM completed_rules
                ORDER BY COALESCE(completed_at::timestamp, received_at) DESC
                LIMIT $2
            `;
            params = [userId, limit];
        }

        let result;
        try {
            // Add query timeout to prevent hanging (both statement_timeout and Promise.race as backup)
            result = await Promise.race([
                pool.query({
                    text: query,
                    values: params,
                    statement_timeout: 15000 // 15 second timeout for complex queries
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Query timeout after 15 seconds')), 15000)
                )
            ]);
        } catch (queryError) {
            console.error('[CompletedRules] ❌ Query error:', {
                error: queryError.message,
                stack: queryError.stack,
                query_preview: query.substring(0, 200)
            });
            return res.status(500).json({ 
                error: 'Failed to fetch completed rules', 
                details: queryError.message 
            });
        }
        
        // Get total count of unique completed rules (for pagination)
        // Use the same DISTINCT ON logic as the main query to get accurate count
        let countQuery, countParams;
        if (publicKey && userId) {
            countQuery = `
                SELECT COUNT(*) as total_count
                FROM (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        luq.id
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    WHERE (luq.public_key = $1 OR luq.user_id = $2)
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                ) AS unique_completions
            `;
            countParams = [publicKey, userId];
        } else if (publicKey) {
            countQuery = `
                SELECT COUNT(*) as total_count
                FROM (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        luq.id
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    WHERE luq.public_key = $1
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                ) AS unique_completions
            `;
            countParams = [publicKey];
        } else {
            countQuery = `
                SELECT COUNT(*) as total_count
                FROM (
                    SELECT DISTINCT ON (
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                    )
                        luq.id
                    FROM location_update_queue luq
                    CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result_data(value, ordinality)
                    WHERE luq.user_id = $1
                        AND luq.status IN ('matched', 'executed')
                        AND luq.execution_results IS NOT NULL
                        AND (result_data.value->>'completed')::boolean = true
                        AND (result_data.value->>'matched_public_key' = luq.public_key OR result_data.value->>'matched_public_key' IS NULL)
                    ORDER BY 
                        luq.id,
                        (result_data.value->>'rule_id')::integer,
                        result_data.ordinality
                ) AS unique_completions
            `;
            countParams = [userId];
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0]?.total_count || 0);
        
        // Process results - execution_result is already extracted from the query
        const completedRules = [];
        const seenKeys = new Set(); // Track unique combinations for safety

        for (const row of result.rows) {
            // Parse execution_result (already extracted from the array)
            let completedResult = null;
            try {
                completedResult = typeof row.execution_result === 'string'
                    ? JSON.parse(row.execution_result)
                    : row.execution_result || null;
            } catch (e) {
                console.error('Error parsing execution_result:', e);
                continue;
            }

            if (!completedResult || !completedResult.completed) {
                continue;
            }

            // Use fields directly from row (already extracted in query)
            const transactionHash = row.transaction_hash || completedResult.transaction_hash;
            const matchedPublicKey = row.matched_public_key || completedResult.matched_public_key || row.public_key || 'unknown';
            const completedAt = row.completed_at || completedResult.completed_at;
            const ordinality = row.result_ordinality || 0;
            
            // Create unique key to avoid duplicates (safety check)
            const uniqueKey = `${row.rule_id}_${transactionHash || 'no-tx'}_${row.update_id}_${matchedPublicKey}_${ordinality}`;
            if (seenKeys.has(uniqueKey)) {
                continue; // Skip duplicate
            }
            seenKeys.add(uniqueKey);
            
            // Use actual execution parameters if available, otherwise fall back to rule template
            let functionParams = {};
            if (completedResult.execution_parameters) {
                // Use actual parameters that were submitted during execution
                try {
                    functionParams = typeof completedResult.execution_parameters === 'string'
                        ? JSON.parse(completedResult.execution_parameters)
                        : completedResult.execution_parameters || {};
                } catch (e) {
                    console.error('Error parsing execution_parameters:', e);
                    // Fall back to rule template if parsing fails
                    try {
                        functionParams = typeof row.function_parameters === 'string'
                            ? JSON.parse(row.function_parameters)
                            : row.function_parameters || {};
                    } catch (e2) {
                        console.error('Error parsing function_parameters:', e2);
                    }
                }
            } else {
                // Fall back to rule template parameters if execution_parameters not available
                try {
                    functionParams = typeof row.function_parameters === 'string'
                        ? JSON.parse(row.function_parameters)
                        : row.function_parameters || {};
                } catch (e) {
                    console.error('Error parsing function_parameters:', e);
                }
            }

            // Populate parameters using function_mappings (only if using template parameters)
            // If we have execution_parameters, they already have the real values
            const populatedParams = { ...functionParams };
            if (!completedResult.execution_parameters && row.function_mappings) {
                const mappings = typeof row.function_mappings === 'string'
                    ? JSON.parse(row.function_mappings)
                    : row.function_mappings;
                
                if (mappings && mappings[row.function_name]) {
                    const mapping = mappings[row.function_name];
                    for (const param of mapping.parameters || []) {
                        if (param.mapped_from && !populatedParams[param.name]) {
                            // Try to get value from mapped_from field
                            const mappedValue = populatedParams[param.mapped_from];
                            if (mappedValue !== undefined) {
                                populatedParams[param.name] = mappedValue;
                            }
                        }
                    }
                }
            }

            completedRules.push({
                rule_id: row.rule_id,
                rule_name: row.rule_name,
                function_name: row.function_name,
                function_parameters: populatedParams,
                contract_id: row.contract_id,
                contract_name: row.contract_name,
                contract_address: row.contract_address,
                update_id: row.update_id,
                matched_at: row.received_at,
                completed_at: completedAt,
                transaction_hash: transactionHash,
                matched_public_key: matchedPublicKey,
                location: {
                    latitude: parseFloat(row.latitude),
                    longitude: parseFloat(row.longitude)
                }
            });
        }

        res.json({
            success: true,
            completed_rules: completedRules,
            count: totalCount // Use total count from separate query, not just returned rows
        });
    } catch (error) {
        console.error('Error fetching completed rules:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

/**
 * @swagger
 * /api/contracts/rules/rejected:
 *   get:
 *     summary: Get all rejected execution rules
 *     description: Returns a list of execution rules that were rejected by the user. Supports both JWT and API key authentication.
 *     tags: [Contracts]
 *     security:
 *       - BearerAuth: []
 *       - DataConsumerAuth: []
 *       - WalletProviderAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of rejected rules to return
 *     responses:
 *       200:
 *         description: List of rejected rules
 *       401:
 *         description: Authentication required
 */
router.get('/rules/rejected', authenticateContractUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;
        const publicKey = req.user?.public_key;
        const limit = parseInt(req.query.limit) || 100; // Increased limit to show more rejected rules
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Filter by both user_id AND public_key when both available (OR logic for multi-role users)
        // This ensures we get all records regardless of which role was active when created
        let query, params;
        if (publicKey && userId) {
            query = `
                SELECT 
                    cer.id as rule_id,
                    cer.rule_name,
                    cer.function_name,
                    cer.function_parameters,
                    cc.function_mappings,
                    cer.contract_id,
                    cc.contract_name,
                    cc.contract_address,
                    luq.id as update_id,
                    luq.public_key,
                    luq.latitude,
                    luq.longitude,
                    luq.received_at,
                    luq.processed_at,
                    luq.execution_results,
                    result_data->>'rule_id' as execution_rule_id
                FROM location_update_queue luq
                CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result_data
                JOIN contract_execution_rules cer ON cer.id = (result_data->>'rule_id')::integer
                JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE (luq.public_key = $1 OR luq.user_id = $2)
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND result_data->>'skipped' = 'true'
                    AND (result_data->>'rejected')::boolean = true
                ORDER BY luq.received_at DESC
                LIMIT $3
            `;
            params = [publicKey, userId, limit];
        } else if (publicKey) {
            query = `
                SELECT 
                    cer.id as rule_id,
                    cer.rule_name,
                    cer.function_name,
                    cer.function_parameters,
                    cc.function_mappings,
                    cer.contract_id,
                    cc.contract_name,
                    cc.contract_address,
                    luq.id as update_id,
                    luq.public_key,
                    luq.latitude,
                    luq.longitude,
                    luq.received_at,
                    luq.processed_at,
                    luq.execution_results,
                    result_data->>'rule_id' as execution_rule_id
                FROM location_update_queue luq
                CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result_data
                JOIN contract_execution_rules cer ON cer.id = (result_data->>'rule_id')::integer
                JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE luq.public_key = $1
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND result_data->>'skipped' = 'true'
                    AND (result_data->>'rejected')::boolean = true
                ORDER BY luq.received_at DESC
                LIMIT $2
            `;
            params = [publicKey, limit];
        } else {
            if (!userId) {
                return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
            }
            query = `
                SELECT 
                    cer.id as rule_id,
                    cer.rule_name,
                    cer.function_name,
                    cer.function_parameters,
                    cc.function_mappings,
                    cer.contract_id,
                    cc.contract_name,
                    cc.contract_address,
                    luq.id as update_id,
                    luq.public_key,
                    luq.latitude,
                    luq.longitude,
                    luq.received_at,
                    luq.processed_at,
                    luq.execution_results,
                    result_data->>'rule_id' as execution_rule_id
                FROM location_update_queue luq
                CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result_data
                JOIN contract_execution_rules cer ON cer.id = (result_data->>'rule_id')::integer
                JOIN custom_contracts cc ON cer.contract_id = cc.id
                WHERE luq.user_id = $1
                    AND luq.status IN ('matched', 'executed')
                    AND luq.execution_results IS NOT NULL
                    AND result_data->>'skipped' = 'true'
                    AND (result_data->>'rejected')::boolean = true
                ORDER BY luq.received_at DESC
                LIMIT $2
            `;
            params = [userId, limit];
        }

        const result = await pool.query({
            text: query,
            values: params,
            statement_timeout: 15000 // 15 second timeout for complex queries
        });
        
        // Process results to extract rejected rules
        // Show all rejected executions, but use unique key to avoid duplicates
        const rejectedRules = [];
        const seenKeys = new Set(); // Track unique combinations of rule_id + rejected_at + update_id

        for (const row of result.rows) {

            // Parse execution_results to find the rejected rule
            let executionResults = [];
            try {
                executionResults = typeof row.execution_results === 'string'
                    ? JSON.parse(row.execution_results)
                    : row.execution_results || [];
            } catch (e) {
                console.error('Error parsing execution_results:', e);
                continue;
            }

            const rejectedResult = executionResults.find(r => 
                r.rule_id === row.rule_id && 
                r.skipped === true && 
                r.rejected === true
            );

            if (rejectedResult) {
                // Create unique key to avoid duplicates
                // Use rule_id + rejected_at only - same rejection = same entry, regardless of location update
                // This prevents showing the same rejection multiple times when it appears in multiple location updates
                const rejectedAt = rejectedResult.rejected_at;
                if (!rejectedAt) {
                    // If no rejected_at, use rule_id + update_id as fallback
                    const uniqueKey = `${row.rule_id}_${row.update_id}`;
                    if (seenKeys.has(uniqueKey)) {
                        continue; // Skip duplicate
                    }
                    seenKeys.add(uniqueKey);
                } else {
                    // Use rule_id + rejected_at for true uniqueness
                    const uniqueKey = `${row.rule_id}_${rejectedAt}`;
                    if (seenKeys.has(uniqueKey)) {
                        continue; // Skip duplicate - same rule + same rejection time = same rejection
                    }
                    seenKeys.add(uniqueKey);
                }
                
                // Parse function_parameters from rule
                let functionParams = {};
                try {
                    functionParams = typeof row.function_parameters === 'string'
                        ? JSON.parse(row.function_parameters)
                        : row.function_parameters || {};
                } catch (e) {
                    console.error('Error parsing function_parameters:', e);
                }

                // Populate parameters using function_mappings
                const populatedParams = { ...functionParams };
                if (row.function_mappings) {
                    const mappings = typeof row.function_mappings === 'string'
                        ? JSON.parse(row.function_mappings)
                        : row.function_mappings;
                    
                    if (mappings && mappings[row.function_name]) {
                        const mapping = mappings[row.function_name];
                        for (const param of mapping.parameters || []) {
                            if (param.mapped_from && !populatedParams[param.name]) {
                                // Try to get value from mapped_from field
                                const mappedValue = populatedParams[param.mapped_from];
                                if (mappedValue !== undefined) {
                                    populatedParams[param.name] = mappedValue;
                                }
                            }
                        }
                    }
                }

                rejectedRules.push({
                    rule_id: row.rule_id,
                    rule_name: row.rule_name,
                    function_name: row.function_name,
                    function_parameters: populatedParams,
                    contract_id: row.contract_id,
                    contract_name: row.contract_name,
                    contract_address: row.contract_address,
                    update_id: row.update_id, // Include update_id for unique key generation
                    matched_at: row.received_at,
                    rejected_at: rejectedResult.rejected_at,
                    matched_public_key: row.public_key || rejectedResult.matched_public_key,
                    location: {
                        latitude: parseFloat(row.latitude),
                        longitude: parseFloat(row.longitude)
                    }
                });
            }
        }

        res.json({
            success: true,
            rejected_rules: rejectedRules,
            count: rejectedRules.length
        });
    } catch (error) {
        console.error('Error fetching rejected rules:', error);
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
            quorum_type,
            // Rate limiting
            max_executions_per_public_key,
            execution_time_window_seconds,
            // Time-based triggers
            min_location_duration_seconds,
            // Auto-deactivation
            auto_deactivate_on_balance_threshold,
            balance_threshold_xlm,
            balance_check_asset_address,
            use_smart_wallet_balance,
            // Submit read-only to ledger
            submit_readonly_to_ledger
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

        // Rate limiting fields
        if (max_executions_per_public_key !== undefined) {
            updates.push(`max_executions_per_public_key = $${paramIndex}`);
            params.push(max_executions_per_public_key || null);
            paramIndex++;
        }

        if (execution_time_window_seconds !== undefined) {
            updates.push(`execution_time_window_seconds = $${paramIndex}`);
            params.push(execution_time_window_seconds || null);
            paramIndex++;
        }

        // Time-based trigger fields
        if (min_location_duration_seconds !== undefined) {
            updates.push(`min_location_duration_seconds = $${paramIndex}`);
            params.push(min_location_duration_seconds || null);
            paramIndex++;
        }

        // Auto-deactivation fields
        if (auto_deactivate_on_balance_threshold !== undefined) {
            updates.push(`auto_deactivate_on_balance_threshold = $${paramIndex}`);
            params.push(auto_deactivate_on_balance_threshold);
            paramIndex++;
        }

        if (balance_threshold_xlm !== undefined) {
            updates.push(`balance_threshold_xlm = $${paramIndex}`);
            params.push(balance_threshold_xlm || null);
            paramIndex++;
        }

        if (balance_check_asset_address !== undefined) {
            updates.push(`balance_check_asset_address = $${paramIndex}`);
            params.push(balance_check_asset_address || null);
            paramIndex++;
        }

        if (use_smart_wallet_balance !== undefined) {
            updates.push(`use_smart_wallet_balance = $${paramIndex}`);
            params.push(use_smart_wallet_balance);
            paramIndex++;
        }

        if (submit_readonly_to_ledger !== undefined) {
            updates.push(`submit_readonly_to_ledger = $${paramIndex}`);
            params.push(submit_readonly_to_ledger);
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

        // Get actual user ID (handle both JWT and API key auth)
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
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Perform hard delete (actually delete the rule, not just deactivate)
        const result = await pool.query(
            `DELETE FROM contract_execution_rules
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, actualUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found or you do not have permission to delete it' });
        }

        res.json({
            success: true,
            message: 'Rule deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting contract execution rule:', error);
        res.status(500).json({ 
            error: 'Failed to delete contract execution rule',
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
        const publicKey = req.user?.public_key;
        
        if (!userId && !publicKey) {
            return res.status(401).json({ error: 'User ID or public key not found. Authentication required.' });
        }

        // Check if id is a contract address (starts with C and is 56 chars) or an integer ID
        const isContractAddress = /^C[A-Z0-9]{55}$/.test(id);
        const isIntegerId = /^\d+$/.test(id);

        let result;
        if (isContractAddress) {
            // Query by contract_address
            if (publicKey) {
                result = await pool.query(
                    `SELECT cc.id, cc.contract_address, cc.contract_name, cc.network, 
                            cc.discovered_functions, cc.function_mappings, cc.use_smart_wallet,
                            cc.smart_wallet_contract_id, cc.payment_function_name, cc.requires_webauthn,
                            cc.webauthn_verifier_contract_id,
                            cc.wasm_file_name, cc.wasm_file_size, cc.wasm_source, cc.wasm_hash, cc.wasm_uploaded_at,
                            cc.created_at, cc.updated_at, cc.is_active
                     FROM custom_contracts cc
                     JOIN users u ON cc.user_id = u.id
                     WHERE cc.contract_address = $1 AND u.public_key = $2 AND cc.is_active = true`,
                    [id, publicKey]
                );
            } else {
                result = await pool.query(
                    `SELECT id, contract_address, contract_name, network, 
                            discovered_functions, function_mappings, use_smart_wallet,
                            smart_wallet_contract_id, payment_function_name, requires_webauthn,
                            webauthn_verifier_contract_id,
                            wasm_file_name, wasm_file_size, wasm_source, wasm_hash, wasm_uploaded_at,
                            created_at, updated_at, is_active
                     FROM custom_contracts
                     WHERE contract_address = $1 AND user_id = $2 AND is_active = true`,
                    [id, userId]
                );
            }
        } else if (isIntegerId) {
            // Query by integer ID
            if (publicKey) {
                result = await pool.query(
                    `SELECT cc.id, cc.contract_address, cc.contract_name, cc.network, 
                            cc.discovered_functions, cc.function_mappings, cc.use_smart_wallet,
                            cc.smart_wallet_contract_id, cc.payment_function_name, cc.requires_webauthn,
                            cc.webauthn_verifier_contract_id,
                            cc.wasm_file_name, cc.wasm_file_size, cc.wasm_source, cc.wasm_hash, cc.wasm_uploaded_at,
                            cc.created_at, cc.updated_at, cc.is_active
                     FROM custom_contracts cc
                     JOIN users u ON cc.user_id = u.id
                     WHERE cc.id = $1 AND u.public_key = $2 AND cc.is_active = true`,
                    [parseInt(id, 10), publicKey]
                );
            } else {
                result = await pool.query(
                    `SELECT id, contract_address, contract_name, network, 
                            discovered_functions, function_mappings, use_smart_wallet,
                            smart_wallet_contract_id, payment_function_name, requires_webauthn,
                            webauthn_verifier_contract_id,
                            wasm_file_name, wasm_file_size, wasm_source, wasm_hash, wasm_uploaded_at,
                            created_at, updated_at, is_active
                     FROM custom_contracts
                     WHERE id = $1 AND user_id = $2 AND is_active = true`,
                    [parseInt(id, 10), userId]
                );
            }
        } else {
            return res.status(400).json({ 
                error: 'Invalid contract identifier',
                message: 'Contract ID must be either an integer ID or a valid contract address (starts with C, 56 characters)'
            });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Contract not found',
                message: `Contract with identifier "${id}" not found or you do not have access to it.`
            });
        }

        res.json({
            success: true,
            contract: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching custom contract:', error);
        console.error('Error details:', {
            id: req.params.id,
            userId: req.user?.id || req.userId,
            publicKey: req.user?.public_key,
            errorMessage: error.message,
            errorStack: error.stack
        });
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
            user_secret_key, // Optional - only used if signedXDR is not provided (backward compatibility)
            signedXDR, // Preferred: Signed transaction XDR (secret key never sent to server)
            rule_id,
            update_id,
            matched_public_key,
            // WebAuthn data (if provided separately)
            passkeyPublicKeySPKI,
            webauthnSignature,
            webauthnAuthenticatorData,
            webauthnClientData,
            signaturePayload: signaturePayloadFromRequest
        } = req.body;
        
        console.log(`[Execute] 🔐 Using ${signedXDR ? 'signed XDR (secure)' : 'server-side signing (less secure - backward compatibility)'}`);
        
        // Use let so we can reassign if needed
        let signaturePayload = signaturePayloadFromRequest;

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
        const forceOnChain = submit_to_ledger || (isReadOnly && (signedXDR || user_secret_key));
        
        // Debug logging
        // console.log(`[Execute] Execution mode check - isReadOnly: ${isReadOnly}, submit_to_ledger: ${submit_to_ledger}, hasSignedXDR: ${!!signedXDR}, user_secret_key provided: ${!!user_secret_key}, forceOnChain: ${forceOnChain}`);
        
        // Check if WebAuthn data is provided
        const hasWebAuthnData = !!(passkeyPublicKeySPKI && webauthnSignature && webauthnAuthenticatorData && webauthnClientData);
        
        // For write functions, signed XDR OR secret key OR WebAuthn data is required
        if (!isReadOnly && !signedXDR && !user_secret_key && !hasWebAuthnData) {
            console.error(`[Execute] Missing authentication for write function: function_name=${function_name}, hasSignedXDR=${!!signedXDR}, hasSecretKey=${!!user_secret_key}, hasWebAuthnData=${hasWebAuthnData}, userId=${userId}, contractId=${id}`);
            return res.status(400).json({ 
                error: 'Signed XDR, user secret key, or WebAuthn signature is required for write operations',
                details: {
                    function_name,
                    is_read_only: false,
                    has_signed_xdr: !!signedXDR,
                    has_secret_key: !!user_secret_key,
                    has_webauthn: hasWebAuthnData
                },
                note: 'Prefer signedXDR for better security (secret key never leaves client)'
            });
        }
        
        // For read-only functions that should be submitted to ledger, signed XDR OR secret key OR WebAuthn data is required
        if (forceOnChain && isReadOnly && !signedXDR && !user_secret_key && !hasWebAuthnData) {
            return res.status(400).json({ 
                error: 'Signed XDR, user secret key, or WebAuthn signature is required to submit read-only functions to the ledger',
                note: 'Read-only functions can be simulated without a secret key, but submitting to the ledger requires signing. Prefer signedXDR for better security.'
            });
        }

        const userId = req.user?.id || req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found. Authentication required.' });
        }

        // Early parameter normalization: Handle 'address' parameter - map it to 'destination' if destination is missing or empty
        // This must happen BEFORE smart wallet routing and other parameter processing
        // Ensure parameters is an object
        if (!parameters || typeof parameters !== 'object') {
            parameters = parameters || {};
        }
        
        // Helper to check if a value is effectively empty (null, undefined, or empty string)
        const isEmpty = (val) => !val || val === '' || val === null || val === undefined;
        
        // Check if destination is effectively empty (treat empty strings as missing)
        const destinationIsEmpty = isEmpty(parameters.destination);
        
        // Check for 'address' in parameters object or req.body (must be non-empty)
        const addressValue = (!isEmpty(parameters.address)) 
            ? parameters.address 
            : (!isEmpty(req.body.address) ? req.body.address : null);
        
        // If we have an address value and destination is empty, map it
        if (addressValue && destinationIsEmpty) {
            // Map 'address' to 'destination' as the most common case
            parameters.destination = addressValue;
            console.log(`[Execute] ✅ Early mapping: Mapped 'address' parameter to 'destination': ${addressValue?.substring(0, 8)}...`);
        }
        
        // Also check if destination is in req.body directly (must be non-empty)
        if (!isEmpty(req.body.destination) && destinationIsEmpty) {
            parameters.destination = req.body.destination;
            console.log(`[Execute] ✅ Early mapping: Set destination from req.body.destination: ${req.body.destination?.substring(0, 8)}...`);
        }
        
        // If destination is still empty after mapping, try to get it from matched_public_key (for pending rules)
        if (isEmpty(parameters.destination) && matched_public_key) {
            parameters.destination = matched_public_key;
            console.log(`[Execute] ✅ Early mapping: Set destination from matched_public_key: ${matched_public_key?.substring(0, 8)}...`);
        }

        // Early auto-population: Auto-populate signer_address and user_address from user's public key if missing
        // This must happen BEFORE smart wallet routing and other parameter processing
        // For deposit functions, ALWAYS override user_address with signer's public key (contract requirement)
        // Declare isDepositFunction early so it can be reused throughout the function
        const isDepositFunction = function_name && function_name.toLowerCase().includes('deposit');
        if (user_public_key) {
            if (!parameters.signer_address || parameters.signer_address === '') {
                parameters.signer_address = user_public_key;
                console.log(`[Execute] ✅ Early auto-population: Set signer_address from user_public_key`);
            }
            // For deposit functions, always override user_address to match signer (contract requirement)
            // For other functions, only set if missing
            if (isDepositFunction) {
                parameters.user_address = user_public_key;
                console.log(`[Execute] ✅ Early auto-population: Overrode user_address for deposit function (must match signer)`);
            } else if (!parameters.user_address || parameters.user_address === '') {
                parameters.user_address = user_public_key;
                console.log(`[Execute] ✅ Early auto-population: Set user_address from user_public_key`);
            }
        }
        
        // Debug: Log parameters keys for troubleshooting
        console.log(`[Execute] 📋 Parameters keys after early normalization:`, Object.keys(parameters || {}).join(', '));
        console.log(`[Execute] 📋 Destination value:`, parameters.destination ? `${parameters.destination.substring(0, 8)}...` : 'undefined/null');
        console.log(`[Execute] 📋 User address value:`, parameters.user_address ? `${parameters.user_address.substring(0, 8)}...` : 'undefined/null');

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
            `SELECT contract_address, network, function_mappings, discovered_functions,
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
        // console.log(`[Execute] Contract config - Contract ID: ${id}, use_smart_wallet: ${contract.use_smart_wallet}, requires_webauthn: ${contract.requires_webauthn}, smart_wallet_contract_id: ${contract.smart_wallet_contract_id}`);
        // console.log(`[Execute] Contract config - Raw DB value: requires_webauthn = ${contract.requires_webauthn} (type: ${typeof contract.requires_webauthn})`);

        // Helper function to detect if a function is payment-related
        // Note: 'deposit' functions are NOT treated as payment functions for smart wallet routing
        // Deposit functions should execute directly on the contract, not route through smart wallet payment
        const isPaymentFunction = (funcName, funcParams) => {
            const funcNameLower = funcName.toLowerCase();
            
            // Exclude deposit functions - they should execute directly on the contract
            if (funcNameLower.includes('deposit')) {
                return false;
            }
            
            // Payment patterns (excluding deposit)
            const paymentPatterns = ['transfer', 'payment', 'send', 'pay', 'withdraw'];
            
            // Check function name
            if (paymentPatterns.some(pattern => funcNameLower.includes(pattern))) {
                return true;
            }
            
            // Check parameters for payment-related fields
            // For smart wallet routing, we need destination (not user_address) and amount
            const paymentParams = ['destination', 'recipient', 'to', 'amount', 'asset', 'asset_address'];
            if (funcParams && typeof funcParams === 'object') {
                const paramKeys = Object.keys(funcParams).map(k => k.toLowerCase());
                const hasDestination = paymentParams.some(p => paramKeys.includes(p.toLowerCase()));
                const hasAmount = paramKeys.some(k => k.includes('amount'));
                // Only treat as payment if it has destination (not user_address) and amount
                // user_address is for deposits, which should not route through smart wallet payment
                if (hasDestination && hasAmount && !paramKeys.includes('user_address')) {
                    return true;
                }
            }
            
            return false;
        };

        // Check if we should route through smart wallet
        // If payment_source is explicitly 'smart-wallet', always route through smart wallet
        // Otherwise, check contract settings
        // IMPORTANT: Deposit functions should NOT route through smart wallet payment
        // They should execute directly on the contract
        const paymentSource = req.body.payment_source; // 'wallet' or 'smart-wallet'
        const contractsConfig = require('../config/contracts');
        const hasSmartWalletContractId = contract.smart_wallet_contract_id || contractsConfig.SMART_WALLET_CONTRACT_ID;
        // isDepositFunction already declared earlier in the function
        const shouldRouteThroughSmartWallet = !isDepositFunction && // Never route deposits through smart wallet payment
                                             ((paymentSource === 'smart-wallet') ||
                                              (contract.use_smart_wallet && 
                                               hasSmartWalletContractId &&
                                               isPaymentFunction(function_name, parameters)));
        
        if (isDepositFunction) {
            console.log(`[Execute] 🏦 Deposit function detected - will execute directly on contract, not through smart wallet payment`);
        }
        
        // console.log('[Execute] 🔄 Smart wallet routing decision:', {
        //     paymentSource,
        //     use_smart_wallet: contract.use_smart_wallet,
        //     smart_wallet_contract_id: contract.smart_wallet_contract_id,
        //     config_smart_wallet_id: contractsConfig.SMART_WALLET_CONTRACT_ID,
        //     hasSmartWalletContractId,
        //     isPaymentFunction: isPaymentFunction(function_name, parameters),
        //     shouldRouteThroughSmartWallet,
        //     hasPasskeySPKI: !!passkeyPublicKeySPKI,
        //     hasWebAuthnSignature: !!webauthnSignature
        // });

        if (shouldRouteThroughSmartWallet) {
            // console.log(`[Execute] 💳 Routing payment function "${function_name}" through smart wallet: ${contract.smart_wallet_contract_id}`);
            
            // For smart wallet payments, we need a secret key to sign the transaction
            // This works the same way as the send payment feature - both WebAuthn and secret key are required
            // WebAuthn is used for contract authorization, secret key is used to sign the transaction
            if (!user_secret_key) {
                return res.status(400).json({ 
                    error: 'User secret key is required for smart wallet payments',
                    message: 'Smart wallet payments require both WebAuthn signature and a secret key, just like the send payment feature. Please provide your secret key in the execution dialog.'
                });
            }
            
            try {
            // console.log(`[Execute] 📋 Extracting payment parameters from:`, JSON.stringify(parameters));
            // Extract payment parameters from function parameters
            const extractPaymentParams = (params) => {
                // Common parameter name mappings
                // Note: user_address is also a valid destination parameter (used by deposit functions)
                const destinationKeys = ['destination', 'recipient', 'to', 'to_address', 'destination_address', 'address', 'user_address'];
                const amountKeys = ['amount', 'value', 'quantity'];
                const assetKeys = ['asset', 'asset_address', 'token', 'token_address'];
                
                let destination = null;
                let amount = null;
                let asset = null;
                
                // Debug: Log what we're searching in
                console.log(`[Execute] 🔍 extractPaymentParams - params keys:`, params ? Object.keys(params).join(', ') : 'params is null/undefined');
                console.log(`[Execute] 🔍 extractPaymentParams - params.address:`, params?.address);
                console.log(`[Execute] 🔍 extractPaymentParams - params.destination:`, params?.destination);
                
                // Find destination
                for (const key of destinationKeys) {
                    // Check if key exists and has a non-empty value (not null, undefined, or empty string)
                    if (params && params[key] !== undefined && params[key] !== null && params[key] !== '') {
                        destination = params[key];
                        console.log(`[Execute] ✅ Found destination via key '${key}': ${destination?.substring(0, 8)}...`);
                        break;
                    }
                    // Case-insensitive search
                    if (params) {
                        const foundKey = Object.keys(params).find(k => k.toLowerCase() === key.toLowerCase());
                        if (foundKey && params[foundKey] !== undefined && params[foundKey] !== null && params[foundKey] !== '') {
                            destination = params[foundKey];
                            console.log(`[Execute] ✅ Found destination via case-insensitive key '${foundKey}' (searching for '${key}'): ${destination?.substring(0, 8)}...`);
                            break;
                        }
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

            let paymentParams = extractPaymentParams(parameters);
            // console.log(`[Execute] 📋 Extracted payment params:`, JSON.stringify(paymentParams));
            
            // Helper to check if a value is effectively empty
            const isEmpty = (val) => !val || val === '' || val === null || val === undefined;
            
            // If destination is missing but user_address is present, use user_address as destination
            // This is common for deposit functions where user_address is the deposit target
            if (isEmpty(paymentParams.destination) && !isEmpty(parameters.user_address)) {
                paymentParams.destination = parameters.user_address;
                console.log(`[Execute] ✅ Using user_address as destination: ${paymentParams.destination?.substring(0, 8)}...`);
            }
            
            // If destination is missing or empty, try to extract it from signature_payload
            if (isEmpty(paymentParams.destination) && parameters.signature_payload) {
                try {
                    const payload = typeof parameters.signature_payload === 'string' 
                        ? JSON.parse(parameters.signature_payload) 
                        : parameters.signature_payload;
                    if (payload.destination && !isEmpty(payload.destination)) {
                        paymentParams.destination = payload.destination;
                        console.log(`[Execute] ✅ Extracted destination from signature_payload: ${paymentParams.destination?.substring(0, 8)}...`);
                    }
                } catch (e) {
                    console.warn(`[Execute] ⚠️ Could not parse signature_payload:`, e.message);
                }
            }
            
            // If destination is still missing or empty, try matched_public_key
            if (isEmpty(paymentParams.destination) && matched_public_key) {
                paymentParams.destination = matched_public_key;
                console.log(`[Execute] ✅ Set destination from matched_public_key: ${matched_public_key?.substring(0, 8)}...`);
            }
            
            // If destination is still missing or empty, try to fetch from location_update_queue for pending rules
            if (isEmpty(paymentParams.destination) && rule_id) {
                try {
                    const matchedKeyQuery = `
                        SELECT luq.public_key
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
                    const matchedKeyResult = await pool.query(matchedKeyQuery, [userId, rule_id]);
                    if (matchedKeyResult.rows.length > 0) {
                        paymentParams.destination = matchedKeyResult.rows[0].public_key;
                        console.log(`[Execute] ✅ Fetched destination from location_update_queue: ${paymentParams.destination?.substring(0, 8)}...`);
                    }
                } catch (error) {
                    console.warn(`[Execute] ⚠️  Could not fetch destination from location_update_queue:`, error.message);
                }
            }
            
            // Replace placeholder destination with matched_public_key if needed
            if (paymentParams.destination) {
                const isPlaceholder = typeof paymentParams.destination === 'string' && 
                    (paymentParams.destination.includes('[Will be system-generated') || 
                     paymentParams.destination.includes('system-generated'));
                
                if (isPlaceholder) {
                    // Try to get matched_public_key from various sources
                    console.log(`[Execute] 🔍 Looking for matched_public_key to replace placeholder destination:`, {
                        fromParameters: parameters.matched_public_key,
                        fromRequestBody: req.body.matched_public_key,
                        ruleId: rule_id,
                        requestBodyKeys: Object.keys(req.body)
                    });
                    
                    let matchedKey = parameters.matched_public_key || 
                                    req.body.matched_public_key ||
                                    (req.body.parameters && req.body.parameters.matched_public_key);
                    
                    // If not found, try to fetch from location_update_queue
                    if (!matchedKey && rule_id) {
                        try {
                            const matchedKeyQuery = `
                                SELECT luq.public_key
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
                                matchedKey = matchedKeyResult.rows[0].public_key;
                                console.log(`[Execute] ✅ Fetched matched_public_key from location_update_queue: ${matchedKey?.substring(0, 8)}...`);
                            }
                        } catch (error) {
                            console.warn(`[Execute] ⚠️  Could not fetch matched_public_key:`, error.message);
                        }
                    }
                    
                    if (matchedKey) {
                        paymentParams.destination = matchedKey;
                        console.log(`[Execute] ✅ Replaced placeholder destination with matched_public_key in payment params: ${matchedKey?.substring(0, 8)}...`);
                    } else {
                        console.error(`[Execute] ❌ Destination is placeholder but matched_public_key not available`, {
                            placeholderText: paymentParams.destination,
                            checkedInParameters: !!parameters.matched_public_key,
                            checkedInRequestBody: !!req.body.matched_public_key,
                            checkedInParametersNested: !!(req.body.parameters && req.body.parameters.matched_public_key),
                            ruleId: rule_id,
                            userId: req.user?.id || req.userId,
                            allRequestBodyKeys: Object.keys(req.body)
                        });
                        throw new Error(`Destination address is required but not available. Placeholder text found: ${paymentParams.destination}. Please provide matched_public_key in the request body.`);
                    }
                }
            }
            
            // If amount is missing, try to extract it from signature_payload
            if (!paymentParams.amount && parameters.signature_payload) {
                try {
                    const payload = typeof parameters.signature_payload === 'string' 
                        ? JSON.parse(parameters.signature_payload) 
                        : parameters.signature_payload;
                    if (payload.amount) {
                        // Convert from stroops if it's a string
                        paymentParams.amount = payload.amount;
                        // console.log(`[Execute] 📋 Extracted amount from signature_payload: ${paymentParams.amount}`);
                    }
                } catch (e) {
                    console.warn(`[Execute] ⚠️ Could not parse signature_payload:`, e.message);
                }
            }
            
            // Check if destination and amount are effectively present (not empty strings)
            // For deposit functions, user_address can serve as the destination
            const hasDestination = paymentParams.destination && paymentParams.destination !== '';
            const hasUserAddress = !isEmpty(parameters.user_address);
            const hasAmount = paymentParams.amount && paymentParams.amount !== '' && paymentParams.amount !== '0' && paymentParams.amount !== 0;
            
            // For deposit functions, user_address is acceptable as destination
            const isDepositFunction = function_name.toLowerCase().includes('deposit');
            const hasValidDestination = hasDestination || (isDepositFunction && hasUserAddress);
            
            if (!hasValidDestination || !hasAmount) {
                console.log(`[Execute] ❌ Missing payment parameters - destination: ${paymentParams.destination || 'missing'}, user_address: ${parameters?.user_address || 'missing'}, amount: ${paymentParams.amount || 'missing'}`);
                console.log(`[Execute] 🔍 Debug - parameters object keys:`, Object.keys(parameters || {}));
                console.log(`[Execute] 🔍 Debug - parameters.destination:`, parameters?.destination);
                console.log(`[Execute] 🔍 Debug - parameters.user_address:`, parameters?.user_address);
                console.log(`[Execute] 🔍 Debug - parameters.address:`, parameters?.address);
                console.log(`[Execute] 🔍 Debug - req.body.address:`, req.body?.address);
                console.log(`[Execute] 🔍 Debug - isDepositFunction:`, isDepositFunction);
                return res.status(400).json({ 
                    error: 'Payment function requires destination and amount parameters',
                    received_params: Object.keys(parameters || {}),
                    expected_params: ['destination (or recipient/to/address/user_address)', 'amount (or value/quantity)'],
                    note: 'Destination and amount can be provided directly, as "address" or "user_address" parameter, or in signature_payload. For deposit functions, user_address is acceptable as destination. Empty strings are treated as missing.',
                    debug: {
                        destination_value: paymentParams.destination,
                        user_address_value: parameters?.user_address,
                        amount_value: paymentParams.amount,
                        has_destination: hasDestination,
                        has_user_address: hasUserAddress,
                        has_amount: hasAmount,
                        is_deposit_function: isDepositFunction
                    }
                });
            }
            
            // If we have user_address but no destination, use user_address as destination for smart wallet routing
            if (!hasDestination && hasUserAddress && isDepositFunction) {
                paymentParams.destination = parameters.user_address;
                console.log(`[Execute] ✅ Using user_address as destination for deposit function: ${paymentParams.destination?.substring(0, 8)}...`);
            }

            // Convert amount to stroops if needed (assuming it's in XLM)
            console.log(`[Execute] 💰 Converting amount: ${paymentParams.amount} (type: ${typeof paymentParams.amount})`);
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

            console.log(`[Execute] 💰 Amount in stroops: ${amountInStroops}`);
            
            // Check if WebAuthn is required
            console.log(`[Execute] 🔐 Checking WebAuthn requirements - contract.requires_webauthn: ${contract.requires_webauthn}, webauthnSignature: ${!!webauthnSignature}`);
            const needsWebAuthn = contract.requires_webauthn || 
                                 (webauthnSignature && webauthnAuthenticatorData && webauthnClientData);

            if (needsWebAuthn && (!webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData)) {
                return res.status(400).json({ 
                    error: 'WebAuthn signature required for smart wallet payment',
                    message: 'This contract requires WebAuthn/passkey authentication. Please authenticate with your passkey.'
                });
            }

            // Create signature payload if not provided
            // Use the same structure as send payment: {source, destination, amount, asset, memo, timestamp}
            // The smart wallet contract expects this structure for verification
            const assetForPayload = paymentParams.asset === 'XLM' || paymentParams.asset === 'native' || !paymentParams.asset
                ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
                : paymentParams.asset;
            
            // If signaturePayload is provided, parse it to ensure it has the correct format
            let finalSignaturePayload;
            if (signaturePayload) {
                try {
                    const parsed = typeof signaturePayload === 'string' ? JSON.parse(signaturePayload) : signaturePayload;
                    // For deposit functions, use deposit format (no destination field)
                    // For payment functions, use payment format (with destination)
                    if (isDepositFunction) {
                        // Deposit format: {source, asset, amount, action: 'deposit', timestamp}
                        // CRITICAL: Do NOT include destination, memo, or any other fields
                        // Only include: source, asset, amount, action, timestamp
                        const depositPayload = {
                            source: parsed.source || user_public_key,
                            asset: parsed.asset || assetForPayload,
                            amount: parsed.amount || amountInStroops,
                            action: parsed.action || 'deposit',
                            timestamp: parsed.timestamp || Date.now()
                        };
                        // Explicitly remove any destination or memo fields that might have been in the original
                        delete depositPayload.destination;
                        delete depositPayload.memo;
                        finalSignaturePayload = JSON.stringify(depositPayload);
                        console.log(`[Execute] ✅ Reconstructed deposit signature_payload (no destination field):`, finalSignaturePayload.substring(0, 100) + '...');
                    } else {
                        // Payment format: {source, destination, amount, asset, memo, timestamp}
                        finalSignaturePayload = JSON.stringify({
                            source: parsed.source || user_public_key,
                            destination: parsed.destination || paymentParams.destination,
                            amount: parsed.amount || amountInStroops,
                            asset: parsed.asset || assetForPayload,
                            memo: parsed.memo || '',
                            timestamp: parsed.timestamp || Date.now()
                        });
                    }
                    // console.log(`[Execute] 📋 Using provided signature payload (normalized):`, {
                    //     source: (parsed.source || user_public_key).substring(0, 8) + '...',
                    //     destination: (parsed.destination || paymentParams.destination).substring(0, 8) + '...',
                    //     amount: parsed.amount || amountInStroops,
                    //     asset: (parsed.asset || assetForPayload).substring(0, 8) + '...'
                    // });
                } catch (e) {
                    console.warn(`[Execute] ⚠️ Could not parse signature payload, creating new one:`, e.message);
                    // For deposit functions, use deposit format (no destination field)
                    if (isDepositFunction) {
                        finalSignaturePayload = JSON.stringify({
                            source: user_public_key,
                            asset: assetForPayload,
                            amount: amountInStroops,
                            action: 'deposit',
                            timestamp: Date.now()
                        });
                    } else {
                        finalSignaturePayload = JSON.stringify({
                            source: user_public_key,
                            destination: paymentParams.destination,
                            amount: amountInStroops,
                            asset: assetForPayload,
                            memo: '',
                            timestamp: Date.now()
                        });
                    }
                }
            } else {
                // For deposit functions, use deposit format (no destination field)
                if (isDepositFunction) {
                    finalSignaturePayload = JSON.stringify({
                        source: user_public_key,
                        asset: assetForPayload,
                        amount: amountInStroops,
                        action: 'deposit',
                        timestamp: Date.now()
                    });
                } else {
                    finalSignaturePayload = JSON.stringify({
                        source: user_public_key,
                        destination: paymentParams.destination,
                        amount: amountInStroops,
                        asset: assetForPayload,
                        memo: '',
                        timestamp: Date.now()
                    });
                }
                // console.log(`[Execute] 📋 Created new signature payload:`, {
                //     source: user_public_key.substring(0, 8) + '...',
                //     destination: paymentParams.destination.substring(0, 8) + '...',
                //     amount: amountInStroops,
                //     asset: assetForPayload.substring(0, 8) + '...'
                // });
            }

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
            
            // Use the smart wallet contract ID from the contract configuration or fallback to config
            // The contract record's smart_wallet_contract_id might be null, so use config as fallback
            const smartWalletContractId = contract.smart_wallet_contract_id || contractsConfig.SMART_WALLET_CONTRACT_ID;
            console.log(`[Execute] 📝 Using smart wallet contract ID: ${smartWalletContractId} (from contract: ${contract.smart_wallet_contract_id || 'null'}, from config: ${contractsConfig.SMART_WALLET_CONTRACT_ID})`);
            
            if (!smartWalletContractId) {
                return res.status(400).json({
                    success: false,
                    error: 'Smart wallet contract ID not configured',
                    details: 'The contract record does not have a smart_wallet_contract_id set, and SMART_WALLET_CONTRACT_ID is not configured in the environment or config file.',
                    suggestion: 'Please set the smart_wallet_contract_id in the contract record or configure SMART_WALLET_CONTRACT_ID in the environment variables.'
                });
            }
            
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
            // Use assetForPayload (which has the correct contract address) instead of paymentParams.asset
            // This ensures we use the same asset format as in the signature payload
            const assetToUse = assetForPayload || paymentParams.asset;
            console.log(`[Execute] 💰 Asset conversion - paymentParams.asset: ${paymentParams.asset}, assetForPayload: ${assetForPayload?.substring(0, 8)}..., using: ${assetToUse?.substring(0, 8)}...`);
            
            let assetScAddress;
            if (assetToUse && assetToUse.startsWith('C')) {
                // Contract address (e.g., native XLM contract)
                const contractIdBytes = StellarSdk.StrKey.decodeContract(assetToUse);
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
                console.log(`[Execute] 💰 Using contract address for asset: ${assetToUse.substring(0, 8)}...`);
            } else if (assetToUse && assetToUse.startsWith('G')) {
                // Account address (legacy native XLM)
                const assetAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(assetToUse);
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                    StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(assetAddressBytes)
                );
                console.log(`[Execute] 💰 Using account address for asset: ${assetToUse.substring(0, 8)}...`);
            } else {
                // Native XLM (fallback)
                const nativeAssetBytes = StellarSdk.StrKey.decodeEd25519PublicKey('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
                assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
                    StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(nativeAssetBytes)
                );
                console.log(`[Execute] 💰 Using native XLM address (fallback)`);
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

            // Verify the registered passkey matches what we're using (CRITICAL for signature verification)
            // The contract stores passkeys by Stellar public_key (address), not by user_id
            // If multiple roles share the same public_key, only the LAST registered passkey exists on the contract
            // We must use the passkey that's actually registered on the contract, not the one from the database
            // console.log('[Execute] 🔍 Passkey verification check:', {
            //     needsWebAuthn,
            //     hasPasskeySPKI: !!passkeyPublicKeySPKI,
            //     passkeySPKILength: passkeyPublicKeySPKI ? passkeyPublicKeySPKI.length : 0
            // });
            
            if (needsWebAuthn && passkeyPublicKeySPKI) {
                // console.log('[Execute] 🔍 Verifying registered passkey matches extracted passkey...');
                console.log('[Execute] ⚠️ Note: Contract stores passkeys by public_key, not user_id. If multiple roles share the same public_key, only the last registered passkey exists on the contract.');
                
                try {
                    // Extract passkey public key from SPKI
                    const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
                    let passkeyPubkey65;
                    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
                        // Already in correct format (65 bytes, starts with 0x04)
                        passkeyPubkey65 = spkiBytes;
                    } else {
                        // Extract from SPKI format
                        passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);
                    }
                    
                    // Get the passkey registered on the contract
                    const horizonServer = new StellarSdk.Horizon.Server(
                        contract.network === 'mainnet' 
                            ? 'https://horizon.stellar.org'
                            : 'https://horizon-testnet.stellar.org'
                    );
                    
                    const getPasskeyOp = smartWalletContract.call('get_passkey_pubkey', signerAddressScVal);
                    const accountForCheck = await horizonServer.loadAccount(user_public_key);
                    const checkTx = new StellarSdk.TransactionBuilder(
                        new StellarSdk.Account(user_public_key, accountForCheck.sequenceNumber()),
                        {
                            fee: StellarSdk.BASE_FEE,
                            networkPassphrase: networkPassphrase
                        }
                    )
                        .addOperation(getPasskeyOp)
                        .setTimeout(30)
                        .build();
                    
                    const preparedCheckTx = await sorobanServer.prepareTransaction(checkTx);
                    const checkResult = await sorobanServer.simulateTransaction(preparedCheckTx);
                    
                    if (checkResult && checkResult.result && checkResult.result.retval) {
                        let registeredPubkeyScVal;
                        const retval = checkResult.result.retval;
                        
                        if (retval && typeof retval === 'object' && typeof retval.switch === 'function') {
                            registeredPubkeyScVal = retval;
                        } else if (typeof retval === 'string') {
                            registeredPubkeyScVal = StellarSdk.xdr.ScVal.fromXDR(retval, 'base64');
                        }
                        
                        if (registeredPubkeyScVal && registeredPubkeyScVal.switch && registeredPubkeyScVal.switch().name === 'scvBytes') {
                            const registeredPubkeyBytes = registeredPubkeyScVal.bytes();
                            const registeredPubkeyHex = Buffer.from(registeredPubkeyBytes).toString('hex');
                            const extractedPubkeyHex = passkeyPubkey65.toString('hex');
                            
                            // console.log(`[Execute] 📋 Registered passkey on contract (hex): ${registeredPubkeyHex.substring(0, 32)}...`);
                            // console.log(`[Execute] 📋 Extracted passkey from request (hex): ${extractedPubkeyHex.substring(0, 32)}...`);
                            
                            if (registeredPubkeyHex !== extractedPubkeyHex) {
                                console.error('[Execute] ❌ Passkey mismatch detected!');
                                console.error('  The passkey registered on the contract does not match the passkey used for signing.');
                                console.error('  This likely means you registered a passkey for a different role with the same public_key.');
                                console.error('  The contract stores only ONE passkey per public_key (the last one registered).');
                                console.error('[Execute] 💡 Suggestion: Re-register the passkey using the same one you are currently using for signing.');
                                return res.status(400).json({
                                    success: false,
                                    error: 'Passkey mismatch',
                                    details: 'The passkey public key registered on the contract does not match the passkey used for signing. This can happen if you have multiple roles (e.g., data consumer, wallet provider) with the same Stellar public key, and you registered different passkeys for each role. The contract stores only the last registered passkey per public key.',
                                    suggestion: 'The system will attempt to automatically re-register your passkey. If that fails, please manually re-register your passkey for this role using the same passkey you are currently using for signing. You can do this from your wallet settings or by calling the register_signer function on the smart wallet contract.',
                                    registeredPasskey: registeredPubkeyHex.substring(0, 32) + '...',
                                    extractedPasskey: extractedPubkeyHex.substring(0, 32) + '...',
                                    canAutoRegister: true // Flag to indicate frontend can attempt auto-registration
                                });
                            } else {
                                console.log('[Execute] ✅ Registered passkey matches extracted passkey');
                            }
                        } else {
                            console.warn('[Execute] ⚠️ Could not parse registered passkey, proceeding anyway');
                        }
                    } else {
                        console.warn('[Execute] ⚠️ Could not retrieve registered passkey, proceeding anyway');
                    }
                    console.log('[Execute] ✅ Passkey verification complete, proceeding to balance check');
                } catch (checkError) {
                    console.error('[Execute] ❌ Error checking registered passkey:', checkError.message);
                    console.error('[Execute] ❌ Stack:', checkError.stack);
                    // Don't proceed if we can't verify - the contract will fail anyway
                    return res.status(400).json({
                        success: false,
                        error: 'Failed to verify registered passkey',
                        details: checkError.message,
                        suggestion: 'Please ensure your passkey is registered on the smart wallet contract and matches the one you are using for signing.'
                    });
                }
            } else {
                console.log('[Execute] ⚠️ WebAuthn not required or passkey SPKI not provided, skipping passkey verification');
            }
            
            // Check user's balance in smart wallet BEFORE executing payment (like XYZ-Wallet does)
            // IMPORTANT: For native XLM, the smart wallet contract expects the SAC (Stellar Asset Contract) address
            // CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, not the account address format
            console.log(`[Execute] 💰 Checking smart wallet balance for user: ${user_public_key}`);
            try {
                // Create asset ScVal for balance check (use SAC for native XLM)
                let balanceCheckAssetScVal;
                if (assetToUse && assetToUse.startsWith('C')) {
                    // Already a contract address (including SAC for native XLM)
                    balanceCheckAssetScVal = assetScVal;
                    console.log(`[Execute] 💰 Balance check using contract address: ${assetToUse.substring(0, 8)}...`);
                } else {
                    // For native XLM, use SAC contract address
                    const sacContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                    const sacContractBytes = StellarSdk.StrKey.decodeContract(sacContractId);
                    const sacScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(sacContractBytes);
                    balanceCheckAssetScVal = StellarSdk.xdr.ScVal.scvAddress(sacScAddress);
                    console.log(`[Execute] 💰 Balance check using SAC contract address for native XLM: ${sacContractId.substring(0, 8)}...`);
                }
                
                const balanceCheckOp = smartWalletContract.call(
                    'get_balance',
                    signerAddressScVal,
                    balanceCheckAssetScVal
                );
                
                // Use dummy account for simulation (read-only call)
                const dummyAccount = new StellarSdk.Account(user_public_key, '0');
                const balanceCheckTx = new StellarSdk.TransactionBuilder(
                    dummyAccount,
                    {
                        fee: StellarSdk.BASE_FEE,
                        networkPassphrase: networkPassphrase
                    }
                )
                    .addOperation(balanceCheckOp)
                    .setTimeout(30)
                    .build();
                
                console.log(`[Execute] 💰 Preparing balance check transaction...`);
                const balanceCheckPrepared = await sorobanServer.prepareTransaction(balanceCheckTx);
                console.log(`[Execute] 💰 Simulating balance check transaction...`);
                const balanceSimulation = await sorobanServer.simulateTransaction(balanceCheckPrepared);
                console.log(`[Execute] 💰 Balance simulation result:`, {
                    hasError: !!balanceSimulation.errorResult,
                    hasResult: !!balanceSimulation.result,
                    hasRetval: !!(balanceSimulation.result && balanceSimulation.result.retval)
                });
                
                if (balanceSimulation.errorResult) {
                    console.warn(`[Execute] ⚠️  Could not check balance: ${balanceSimulation.errorResult.value()}`);
                    console.warn(`[Execute] ⚠️  Continuing anyway - contract will reject if balance is insufficient`);
                } else if (balanceSimulation.result && balanceSimulation.result.retval) {
                    const balanceResult = balanceSimulation.result.retval;
                    let balance = '0';
                    
                    console.log(`[Execute] 💰 Balance result type:`, typeof balanceResult);
                    console.log(`[Execute] 💰 Balance result structure:`, {
                        hasSwitch: typeof balanceResult.switch === 'function',
                        hasI128: typeof balanceResult.i128 === 'function',
                        hasValue: !!balanceResult._value,
                        hasAttributes: !!(balanceResult._value && balanceResult._value._attributes),
                        constructor: balanceResult.constructor?.name,
                        keys: Object.keys(balanceResult).slice(0, 10)
                    });
                    
                    // Try to extract balance using scValToNative first (cleanest approach)
                    try {
                        const { scValToNative } = require('@stellar/stellar-sdk');
                        const nativeValue = scValToNative(balanceResult);
                        if (typeof nativeValue === 'bigint' || typeof nativeValue === 'string' || typeof nativeValue === 'number') {
                            balance = nativeValue.toString();
                            console.log(`[Execute] 💰 Extracted balance using scValToNative: ${balance}`);
                        }
                    } catch (scValError) {
                        console.log(`[Execute] 💰 scValToNative failed, trying manual extraction:`, scValError.message);
                    }
                    
                    // If scValToNative didn't work, try manual extraction
                    if (balance === '0') {
                        try {
                            // Check if it has i128 method
                            if (balanceResult.i128 && typeof balanceResult.i128 === 'function') {
                                const parts = balanceResult.i128();
                                const lo = parts.lo().toString();
                                const hi = parts.hi().toString();
                                balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                                console.log(`[Execute] 💰 Extracted i128 via method - hi: ${hi}, lo: ${lo}, total: ${balance}`);
                            } else if (balanceResult._value && balanceResult._value._attributes) {
                                // Handle ChildStruct format from simulation
                                const attrs = balanceResult._value._attributes;
                                if (attrs.hi && attrs.lo) {
                                    // Handle Hyper and UnsignedHyper types
                                    const lo = attrs.lo.toString ? attrs.lo.toString() : String(attrs.lo);
                                    const hi = attrs.hi.toString ? attrs.hi.toString() : String(attrs.hi);
                                    balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                                    console.log(`[Execute] 💰 Extracted i128 from _attributes - hi: ${hi}, lo: ${lo}, total: ${balance}`);
                                }
                            } else if (balanceResult.switch && typeof balanceResult.switch === 'function') {
                                const switchVal = balanceResult.switch();
                                if (switchVal && switchVal.name === 'scvI128') {
                                    const i128Parts = balanceResult.i128();
                                    if (i128Parts) {
                                        const lo = i128Parts.lo().toString();
                                        const hi = i128Parts.hi().toString();
                                        balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
                                        console.log(`[Execute] 💰 Extracted i128 via switch - hi: ${hi}, lo: ${lo}, total: ${balance}`);
                                    }
                                }
                            } else {
                                balance = balanceResult.toString() || '0';
                            }
                        } catch (extractError) {
                            console.warn(`[Execute] ⚠️ Error extracting balance:`, extractError.message);
                            balance = '0';
                        }
                    }
                    
                    const balanceInXLM = (BigInt(balance) / 10000000n).toString();
                    const requiredAmount = BigInt(amountInStroops);
                    const availableBalance = BigInt(balance);
                    
                    console.log(`[Execute] 💰 Smart wallet balance check:`, {
                        available: balanceInXLM + ' XLM (' + balance + ' stroops)',
                        required: (requiredAmount / 10000000n).toString() + ' XLM (' + amountInStroops + ' stroops)',
                        sufficient: availableBalance >= requiredAmount
                    });
                    
                    if (availableBalance < requiredAmount) {
                        console.log(`[Execute] ⚠️ Balance check shows insufficient funds, but continuing anyway`);
                        console.log(`[Execute] ⚠️ Note: Balance check may be inaccurate. Contract will reject if balance is truly insufficient.`);
                        // Don't block execution - let the contract handle the validation
                        // The contract will reject the transaction if balance is insufficient
                    } else {
                        console.log(`[Execute] ✅ Balance sufficient, proceeding with payment`);
                    }
                } else {
                    console.warn(`[Execute] ⚠️  Balance check returned no result, continuing anyway`);
                }
            } catch (balanceCheckError) {
                console.warn(`[Execute] ⚠️  Could not check smart wallet balance:`, balanceCheckError.message);
                console.warn(`[Execute] ⚠️  Stack:`, balanceCheckError.stack);
                // Continue anyway - the contract will reject if balance is insufficient
            }
            
            console.log(`[Execute] 🔨 Building smart wallet execute_payment operation...`);
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
            console.log(`[Execute] ✅ Smart wallet operation built`);

            // Build and execute transaction
            console.log(`[Execute] 📡 Loading account from Horizon...`);
            const horizonServer = new StellarSdk.Horizon.Server(
                contract.network === 'mainnet' 
                    ? 'https://horizon.stellar.org' 
                    : 'https://horizon-testnet.stellar.org'
            );
            const account = await horizonServer.loadAccount(user_public_key);
            console.log(`[Execute] ✅ Account loaded, sequence: ${account.sequenceNumber()}`);
            
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
            console.log(`[Execute] ⏳ Polling for transaction result (hash: ${sendResult.hash.substring(0, 16)}...)...`);
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    txResult = await sorobanServer.getTransaction(sendResult.hash);
                    console.log(`[Execute] 📊 Poll attempt ${i + 1}/30 - Status: ${txResult.status || 'PENDING'}`);
                } catch (pollError) {
                    console.warn(`[Execute] ⚠️ Poll attempt ${i + 1}/30 failed:`, pollError.message);
                    continue;
                }
                
                if (txResult.status === 'SUCCESS') {
                    console.log(`[Execute] ✅ Transaction succeeded!`);
                    // Check the contract's return value
                    let contractReturnedFalse = false;
                    try {
                        if (txResult.resultMetaXdr) {
                            const transactionMeta = txResult.resultMetaXdr.v3().sorobanMeta();
                            const returnValue = transactionMeta.returnValue();
                            
                            console.log(`[Execute] 📊 Smart wallet contract return value:`, returnValue);
                            
                            // Check if return value is false (for boolean return types)
                            if (returnValue && returnValue.hasOwnProperty('b')) {
                                const boolValue = returnValue.b();
                                if (boolValue === false) {
                                    console.log(`[Execute] ⚠️  Smart wallet contract returned false - Payment was rejected`);
                                    contractReturnedFalse = true;
                                }
                            }
                        }
                    } catch (returnValueError) {
                        console.warn(`[Execute] ⚠️  Could not extract smart wallet return value:`, returnValueError.message);
                    }
                    
                    const network = contract.network || 'testnet';
                    const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;
                    
                    if (contractReturnedFalse) {
                        return res.status(400).json({
                            success: false,
                            error: 'Payment rejected by smart wallet contract',
                            message: `The smart wallet contract's execute_payment function returned false, indicating the payment was rejected. This could be due to: insufficient balance, invalid WebAuthn signature, incorrect parameters, or other contract validation failures.`,
                            transaction_hash: sendResult.hash,
                            transaction_status: txResult.status,
                            ledger: txResult.ledger,
                            contract_return_value: false,
                            stellar_expert_url: stellarExpertUrl,
                            routed_through_smart_wallet: true,
                            smart_wallet_contract_id: smartWalletContractId,
                            original_function: function_name,
                            original_contract_id: id,
                            suggestions: [
                                'Check that you have sufficient balance in the smart wallet',
                                'Verify that the WebAuthn signature is valid and matches the registered passkey',
                                'Ensure all parameters (destination, amount, asset) are correct',
                                'Check the contract logs on StellarExpert for more details'
                            ]
                        });
                    }
                    
                    // Mark pending rule as completed if rule_id is provided
                    if (rule_id) {
                        try {
                            // Use update_id and matched_public_key to only mark the specific instance
                            let markCompletedQuery;
                            let markCompletedParams;
                            
                            if (update_id && matched_public_key) {
                                // Filter by update_id and matched_public_key for precise matching
                                // Store actual execution parameters (payment params)
                                const actualParamsJson = JSON.stringify({
                                    destination: paymentParams.destination,
                                    amount: paymentParams.amount,
                                    asset: paymentParams.asset,
                                    signature_payload: signaturePayload,
                                    webauthn_signature: '[WebAuthn signature]',
                                    webauthn_authenticator_data: '[WebAuthn authenticator data]',
                                    webauthn_client_data: '[WebAuthn client data]'
                                });
                                markCompletedQuery = `
                                    UPDATE location_update_queue luq
                                    SET execution_results = (
                                        SELECT jsonb_agg(
                                            CASE 
                                                WHEN (result->>'rule_id')::integer = $1::integer 
                                                    AND result->>'skipped' = 'true'
                                                    AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                                    AND COALESCE((result->>'rejected')::boolean, false) = false
                                                    AND COALESCE((result->>'completed')::boolean, false) = false
                                                    AND (COALESCE(result->>'matched_public_key', luq.public_key) = $5 OR result->>'matched_public_key' IS NULL OR luq.public_key = $5)
                                                THEN (result - 'reason') || jsonb_build_object(
                                                    'completed', true, 
                                                    'completed_at', $3::text,
                                                    'transaction_hash', $4::text,
                                                    'success', true,
                                                    'skipped', false,
                                                    'matched_public_key', COALESCE(result->>'matched_public_key', $5::text),
                                                    'execution_parameters', $7::jsonb
                                                )
                                                ELSE result
                                            END
                                        )
                                        FROM jsonb_array_elements(luq.execution_results) AS result
                                    )
                                    WHERE luq.user_id = $2
                                        AND luq.id = $6::integer
                                        AND luq.execution_results IS NOT NULL
                                        AND EXISTS (
                                            SELECT 1
                                            FROM jsonb_array_elements(luq.execution_results) AS result
                                            WHERE (result->>'rule_id')::integer = $1::integer
                                            AND result->>'skipped' = 'true'
                                            AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((result->>'rejected')::boolean, false) = false
                                            AND COALESCE((result->>'completed')::boolean, false) = false
                                            AND (COALESCE(result->>'matched_public_key', luq.public_key) = $5 OR result->>'matched_public_key' IS NULL OR luq.public_key = $5)
                                        )
                                `;
                                markCompletedParams = [
                                    parseInt(rule_id), 
                                    userId, 
                                    new Date().toISOString(),
                                    sendResult.hash,
                                    matched_public_key,
                                    parseInt(update_id),
                                    actualParamsJson
                                ];
                            } else if (matched_public_key) {
                                // Filter by matched_public_key only
                                // Store actual execution parameters (payment params)
                                const actualParamsJson = JSON.stringify({
                                    destination: paymentParams.destination,
                                    amount: paymentParams.amount,
                                    asset: paymentParams.asset,
                                    signature_payload: signaturePayload,
                                    webauthn_signature: '[WebAuthn signature]',
                                    webauthn_authenticator_data: '[WebAuthn authenticator data]',
                                    webauthn_client_data: '[WebAuthn client data]'
                                });
                                markCompletedQuery = `
                                    UPDATE location_update_queue luq
                                    SET execution_results = (
                                        SELECT jsonb_agg(
                                            CASE 
                                                WHEN (result->>'rule_id')::integer = $1::integer 
                                                    AND result->>'skipped' = 'true'
                                                    AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                                    AND COALESCE((result->>'rejected')::boolean, false) = false
                                                    AND COALESCE((result->>'completed')::boolean, false) = false
                                                    AND (COALESCE(result->>'matched_public_key', luq.public_key) = $5 OR result->>'matched_public_key' IS NULL OR luq.public_key = $5)
                                                THEN (result - 'reason') || jsonb_build_object(
                                                    'completed', true, 
                                                    'completed_at', $3::text,
                                                    'transaction_hash', $4::text,
                                                    'success', true,
                                                    'skipped', false,
                                                    'matched_public_key', COALESCE(result->>'matched_public_key', $5::text),
                                                    'execution_parameters', $6::jsonb
                                                )
                                                ELSE result
                                            END
                                        )
                                        FROM jsonb_array_elements(luq.execution_results) AS result
                                    )
                                    WHERE luq.user_id = $2
                                        AND luq.execution_results IS NOT NULL
                                        AND EXISTS (
                                            SELECT 1
                                            FROM jsonb_array_elements(luq.execution_results) AS result
                                            WHERE (result->>'rule_id')::integer = $1::integer
                                            AND result->>'skipped' = 'true'
                                            AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((result->>'rejected')::boolean, false) = false
                                            AND COALESCE((result->>'completed')::boolean, false) = false
                                            AND (COALESCE(result->>'matched_public_key', luq.public_key) = $5 OR result->>'matched_public_key' IS NULL OR luq.public_key = $5)
                                        )
                                `;
                                markCompletedParams = [
                                    parseInt(rule_id), 
                                    userId, 
                                    new Date().toISOString(),
                                    sendResult.hash,
                                    matched_public_key,
                                    actualParamsJson
                                ];
                            } else {
                                // Fallback: mark all instances (backward compatibility)
                                markCompletedQuery = `
                                    UPDATE location_update_queue luq
                                    SET execution_results = (
                                        SELECT jsonb_agg(
                                            CASE 
                                                WHEN (result->>'rule_id')::integer = $1::integer
                                                    AND result->>'skipped' = 'true'
                                                    AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                                    AND COALESCE((result->>'rejected')::boolean, false) = false
                                                    AND COALESCE((result->>'completed')::boolean, false) = false
                                                THEN (result - 'reason') || jsonb_build_object(
                                                    'completed', true, 
                                                    'completed_at', $3::text,
                                                    'transaction_hash', $4::text,
                                                    'success', true
                                                )
                                                ELSE result
                                            END
                                        )
                                        FROM jsonb_array_elements(luq.execution_results) AS result
                                    )
                                    WHERE luq.user_id = $2
                                        AND luq.execution_results IS NOT NULL
                                        AND EXISTS (
                                            SELECT 1
                                            FROM jsonb_array_elements(luq.execution_results) AS result
                                            WHERE (result->>'rule_id')::integer = $1::integer
                                            AND result->>'skipped' = 'true'
                                            AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((result->>'rejected')::boolean, false) = false
                                            AND COALESCE((result->>'completed')::boolean, false) = false
                                        )
                                `;
                                markCompletedParams = [
                                    parseInt(rule_id), 
                                    userId, 
                                    new Date().toISOString(),
                                    sendResult.hash
                                ];
                            }
                            
                            await pool.query(markCompletedQuery, markCompletedParams);
                            // PUBLIC-FRIENDLY LOG: Rule completed via smart wallet (for GeoLink Events feed)
                            console.log(`[GeoLink Events] ✅ Rule ${rule_id} completed via smart wallet - Transaction: ${sendResult.hash}`);
                            // console.log(`[Execute] ✅ Marked pending rule ${rule_id} as completed (smart wallet routing)`);
                        } catch (updateError) {
                            // Don't fail the response if we can't update the status
                            console.error(`[Execute] ⚠️ Error marking rule ${rule_id} as completed:`, updateError);
                        }
                    }
                    
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
            } catch (smartWalletError) {
                console.error('[Execute] ❌ Error in smart wallet routing:', {
                    message: smartWalletError.message,
                    name: smartWalletError.name,
                    code: smartWalletError.code,
                    response: smartWalletError.response?.data,
                    status: smartWalletError.response?.status,
                    stack: smartWalletError.stack
                });
                const contractsConfig = require('../config/contracts');
                
                // Provide more detailed error information
                let errorDetails = smartWalletError.toString();
                if (smartWalletError.response?.data) {
                    errorDetails = JSON.stringify(smartWalletError.response.data);
                } else if (smartWalletError.message) {
                    errorDetails = smartWalletError.message;
                }
                
                return res.status(500).json({
                    success: false,
                    error: 'Smart wallet payment execution failed',
                    message: smartWalletError.message || 'Unknown error occurred during smart wallet payment execution',
                    details: errorDetails,
                    error_type: smartWalletError.name || 'Error',
                    routed_through_smart_wallet: true,
                    smart_wallet_contract_id: contract.smart_wallet_contract_id || contractsConfig.SMART_WALLET_CONTRACT_ID,
                    suggestions: [
                        'Check that you have sufficient balance in your account',
                        'Verify that the WebAuthn signature is valid',
                        'Ensure all payment parameters (destination, amount, asset) are correct',
                        'Check the backend logs for more detailed error information'
                    ]
                });
            }
        }

        // Get function mapping (for non-smart-wallet routing)
        const mapping = functionMappings[function_name];
        if (!mapping) {
            return res.status(400).json({ error: `Function mapping not found for: ${function_name}` });
        }

        // Process WebAuthn signature if provided
        let processedParameters = { ...parameters };
        
        // IMPORTANT: Only include WebAuthn parameters if they are actually required
        // WebAuthn parameters should only be sent when:
        // 1. requires_webauthn is true (contract explicitly requires WebAuthn)
        // 2. OR use_smart_wallet is true (smart wallet payments may require WebAuthn)
        // If neither is true, do NOT send WebAuthn parameters to avoid contract rejection
        const shouldIncludeWebAuthn = contract.requires_webauthn || contract.use_smart_wallet;
        
        if (shouldIncludeWebAuthn) {
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
        } else {
            // Remove WebAuthn parameters if they exist in the parameters object
            // This ensures they are not sent to the contract when not required
            delete processedParameters.webauthn_signature;
            delete processedParameters.webauthn_authenticator_data;
            delete processedParameters.webauthn_client_data;
            delete processedParameters.signature_payload;
            console.log(`[Execute] 🚫 WebAuthn parameters removed - requires_webauthn: ${contract.requires_webauthn}, use_smart_wallet: ${contract.use_smart_wallet}`);
        }
        
        // Handle 'address' parameter - map it to 'destination' if destination is missing
        // This must happen BEFORE auto-population logic so that 'address' is recognized
        if (processedParameters.address && !processedParameters.destination) {
            // Check if function expects 'destination' parameter (or similar)
            const destinationKeys = ['destination', 'recipient', 'to', 'to_address', 'destination_address'];
            if (mapping && mapping.parameters) {
                const destinationParam = mapping.parameters.find(p => 
                    destinationKeys.includes(p.name) && 
                    (p.type === 'Address' || p.type === 'address')
                );
                if (destinationParam) {
                    processedParameters[destinationParam.name] = processedParameters.address;
                    console.log(`[Execute] ✅ Mapped 'address' parameter to '${destinationParam.name}'`);
                    // Remove 'address' to avoid confusion
                    delete processedParameters.address;
                }
            }
        }
        
        // Auto-populate signer_address from user's public key if missing
        // This must happen BEFORE the pending rule auto-population logic
        if (user_public_key && mapping && mapping.parameters) {
            const signerAddressParam = mapping.parameters.find(p => 
                (p.name === 'signer_address' || p.name === 'signerAddress') && 
                (p.type === 'Address' || p.type === 'address')
            );
            if (signerAddressParam && (!processedParameters[signerAddressParam.name] || processedParameters[signerAddressParam.name] === '')) {
                processedParameters[signerAddressParam.name] = user_public_key;
                console.log(`[Execute] ✅ Auto-populated ${signerAddressParam.name} from user_public_key`);
            }
        }
        
        // Auto-populate missing parameters for pending rule execution
        // This ensures all required parameters are present when executing from pending rules
        if (rule_id && mapping && mapping.parameters) {
            console.log(`[Execute] 🔄 Auto-populating parameters for pending rule execution`);
            // console.log(`[Execute] 📋 Current parameters:`, Object.keys(processedParameters).join(', '));
            
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
                    } else if (paramName === 'user_address' && (param.type === 'Address' || param.type === 'address')) {
                        currentValue = user_public_key;
                        console.log(`[Execute] ✅ Auto-populated ${paramName} from user_public_key: ${currentValue}`);
                    } else if (paramName === 'destination' && (param.type === 'Address' || param.type === 'address')) {
                        // Destination should come from pending rule (matched wallet's public key)
                        // Check if current value is a placeholder that needs to be replaced
                        const isPlaceholder = typeof currentValue === 'string' && 
                            (currentValue.includes('[Will be system-generated') || 
                             currentValue.includes('system-generated'));
                        
                        if (isPlaceholder || !currentValue || currentValue === '') {
                            if (matchedPublicKey) {
                                currentValue = matchedPublicKey;
                                console.log(`[Execute] ✅ Auto-populated ${paramName} from matched_public_key (replaced placeholder): ${currentValue}`);
                            } else {
                                console.warn(`[Execute] ⚠️  Destination address not found in parameters and matched_public_key not available`);
                            }
                        } else if (matchedPublicKey && (currentValue === user_public_key || isPlaceholder)) {
                            // Replace if it's set to user's own address or is a placeholder
                            currentValue = matchedPublicKey;
                            console.log(`[Execute] ✅ Replaced ${paramName} with matched_public_key: ${currentValue}`);
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
            
            // console.log(`[Execute] 📋 Final parameters after auto-population:`, Object.keys(processedParameters).join(', '));
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
                
                // Check if we need to regenerate signature payload
                // IMPORTANT: If a WebAuthn signature already exists, we MUST NOT regenerate the payload
                // because the signature was created for the existing payload. Regenerating would invalidate the signature.
                const isPaymentFunction = function_name.toLowerCase().includes('payment') || 
                                         function_name.toLowerCase().includes('transfer') ||
                                         function_name.toLowerCase().includes('send') ||
                                         function_name.toLowerCase().includes('pay');
                
                // Check if existing signature_payload has old format (contains "function" or "contract_id")
                // Prioritize signaturePayload from req.body (set by frontend) over processedParameters.signature_payload
                // The frontend regenerates the payload and sets it in req.body.signaturePayload
                // If signaturePayload from req.body exists, use it; otherwise fall back to processedParameters.signature_payload
                // console.log(`[Execute] 🔍 Checking signature payload - signaturePayload from req.body: ${signaturePayload ? (signaturePayload.length > 100 ? signaturePayload.substring(0, 100) + '...' : signaturePayload) : 'undefined'}`);
                // console.log(`[Execute] 🔍 Checking signature payload - processedParameters.signature_payload: ${processedParameters.signature_payload ? (processedParameters.signature_payload.length > 100 ? processedParameters.signature_payload.substring(0, 100) + '...' : processedParameters.signature_payload) : 'undefined'}`);
                
                // Always prioritize signaturePayload from req.body if it exists
                let payloadToCheck = signaturePayload || processedParameters.signature_payload;
                
                // Check if signaturePayload is base64-encoded intentBytes (new Intent-based format)
                // Intent bytes are base64-encoded and won't contain JSON string patterns
                const isBase64IntentBytes = payloadToCheck && (
                    typeof payloadToCheck === 'string' &&
                    !payloadToCheck.includes('"function"') && 
                    !payloadToCheck.includes('"contract_id"') &&
                    !payloadToCheck.includes('function:') &&
                    !payloadToCheck.includes('contract_id:') &&
                    !payloadToCheck.includes('"source"') && // Not the new payment format either
                    !payloadToCheck.includes('"destination"') &&
                    payloadToCheck.length > 50 // Base64 intentBytes are typically longer
                );
                
                const hasOldFormat = payloadToCheck && !isBase64IntentBytes && (
                    payloadToCheck.includes('"function"') || 
                    payloadToCheck.includes('"contract_id"') ||
                    payloadToCheck.includes('function:') ||
                    payloadToCheck.includes('contract_id:')
                );
                
                // If signaturePayload from req.body exists, check it specifically (not the fallback)
                const reqBodyHasOldFormat = signaturePayload && !isBase64IntentBytes && (
                    signaturePayload.includes('"function"') || 
                    signaturePayload.includes('"contract_id"') ||
                    signaturePayload.includes('function:') ||
                    signaturePayload.includes('contract_id:')
                );
                
                // If signaturePayload from req.body exists and is NOT in old format, use it and ignore processedParameters.signature_payload
                // This ensures we use the regenerated payload from the frontend OR base64-encoded intentBytes
                if (signaturePayload && (!reqBodyHasOldFormat || isBase64IntentBytes)) {
                    // Frontend has already regenerated the payload in correct format OR provided base64-encoded intentBytes
                    // BUT for deposit functions, we still need to ensure destination is removed
                    if (isBase64IntentBytes) {
                        console.log(`[Execute] ✅ Using base64-encoded intentBytes as signature_payload (Intent-based WebAuthn)`);
                    } else if (isDepositFunction) {
                        // For deposit functions, parse and reconstruct to ensure no destination field
                        try {
                            const parsed = typeof signaturePayload === 'string' ? JSON.parse(signaturePayload) : signaturePayload;
                            const depositPayload = {
                                source: parsed.source || user_public_key,
                                asset: parsed.asset || assetForPayload,
                                amount: parsed.amount || amountInStroops,
                                action: parsed.action || 'deposit',
                                timestamp: parsed.timestamp || Date.now()
                            };
                            // Explicitly remove destination and memo
                            delete depositPayload.destination;
                            delete depositPayload.memo;
                            // CRITICAL: Update signaturePayload to the reconstructed version
                            signaturePayload = JSON.stringify(depositPayload);
                            console.log(`[Execute] ✅ Reconstructed deposit signature_payload (removed destination field):`, signaturePayload.substring(0, 100) + '...');
                        } catch (e) {
                            console.warn(`[Execute] ⚠️ Could not parse signaturePayload for deposit, using as-is:`, e.message);
                        }
                    } else {
                        console.log(`[Execute] ✅ Using signaturePayload from request body (frontend regenerated in correct format)`);
                    }
                    // Don't check processedParameters.signature_payload - use the one from req.body (or reconstructed)
                    // Update processedParameters to use the correct payload
                    processedParameters.signature_payload = signaturePayload;
                    // CRITICAL: Also update payloadToCheck so it's used later in the code
                    payloadToCheck = signaturePayload;
                } else if (signaturePayload && reqBodyHasOldFormat) {
                    // Frontend sent old format payload in req.body - this shouldn't happen but handle it
                    console.warn(`[Execute] ⚠️ signaturePayload from request body is in old format - this shouldn't happen`);
                }
                
                // Only regenerate if:
                // 1. No WebAuthn signature exists yet (safe to regenerate)
                // 2. OR payload doesn't exist
                // 3. OR payload has old format BUT no WebAuthn signature (meaning signature will be created after regeneration)
                // DO NOT regenerate if WebAuthn signature already exists - it was created for the existing payload
                // DO NOT regenerate if signaturePayload is base64-encoded intentBytes (new Intent-based format)
                const hasWebAuthnSignature = webauthnSignature && webauthnAuthenticatorData && webauthnClientData;
                
                // Check if payload exists (either from req.body or processedParameters)
                const existingPayload = payloadToCheck || processedParameters.signature_payload;
                
                if ((isPaymentFunction || hasOldFormat || !existingPayload) && !hasWebAuthnSignature && !isBase64IntentBytes) {
                    // Convert asset to contract address format if needed
                    let assetForPayload = processedParameters.asset || 'native';
                    if (assetForPayload === 'XLM' || assetForPayload === 'native' || assetForPayload === 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC') {
                        assetForPayload = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                    }
                    
                    // Get amount in stroops (ensure it's a string)
                    let amountForPayload = processedParameters.amount || '0';
                    if (typeof amountForPayload === 'number') {
                        // If it's a small number, assume it's in XLM and convert to stroops
                        if (amountForPayload < 1000000) {
                            amountForPayload = Math.floor(amountForPayload * 10000000).toString();
                        } else {
                            amountForPayload = amountForPayload.toString();
                        }
                    } else {
                        amountForPayload = amountForPayload.toString();
                    }
                    
                    // Build signature payload - use deposit format for deposit functions, payment format for others
                    let txData;
                    if (isDepositFunction) {
                        // Deposit format: {source, asset, amount, action: 'deposit', timestamp}
                        txData = {
                            source: user_public_key,
                            asset: assetForPayload,
                            amount: amountForPayload,
                            action: 'deposit',
                            timestamp: Date.now()
                        };
                    } else {
                        // Payment format: {source, destination, amount, asset, memo, timestamp}
                        txData = {
                            source: user_public_key,
                            destination: processedParameters.destination || '',
                            amount: amountForPayload,
                            asset: assetForPayload,
                            memo: '', // Empty memo for contract execution
                            timestamp: Date.now()
                        };
                    }
                    signaturePayload = JSON.stringify(txData);
                    console.log(`[Execute] ✅ Regenerated signature payload with correct format (matching send payment):`, {
                        source: user_public_key.substring(0, 8) + '...',
                        destination: (processedParameters.destination || '').substring(0, 8) + '...',
                        amount: amountForPayload,
                        asset: assetForPayload.substring(0, 8) + '...'
                    });
                } else if (hasWebAuthnSignature && (hasOldFormat || !payloadToCheck) && !isBase64IntentBytes) {
                    // WebAuthn signature exists but payload is old format or missing (and not base64 intentBytes)
                    // For payment functions, we need the new format. For non-payment functions, old format is acceptable.
                    if (isPaymentFunction) {
                        // Payment functions must use new format
                        // Check if signaturePayload from req.body is in correct format (frontend should have regenerated it)
                        if (signaturePayload && !reqBodyHasOldFormat) {
                            // Frontend regenerated the payload - use it
                            console.log(`[Execute] ✅ Using regenerated signaturePayload from request body (WebAuthn signature will be recreated)`);
                            processedParameters.signature_payload = signaturePayload;
                        } else {
                            // Payload is still in old format or missing - this is a problem for payment functions
                            console.error(`[Execute] ❌ WebAuthn signature exists but payload is ${hasOldFormat ? 'old format' : 'missing'} for payment function`);
                            return res.status(400).json({
                                error: 'Invalid signature payload',
                                message: 'The WebAuthn signature was created for a different payload format. Please re-authenticate with the correct payload.',
                                suggestion: 'The signature payload must be in the format: {"source", "destination", "amount", "asset", "memo", "timestamp"}. Please clear the WebAuthn signature and re-authenticate.'
                            });
                        }
                    } else {
                        // Non-payment functions can use old format - it's acceptable
                        console.log(`[Execute] ℹ️  Non-payment function with WebAuthn - allowing old format payload`);
                        if (payloadToCheck) {
                            processedParameters.signature_payload = payloadToCheck;
                        } else if (signaturePayload) {
                            processedParameters.signature_payload = signaturePayload;
                        }
                    }
                } else if (hasWebAuthnSignature && ((payloadToCheck && !hasOldFormat) || isBase64IntentBytes)) {
                    // WebAuthn signature exists and payload is valid - use existing payload
                    // OR base64-encoded intentBytes (Intent-based format)
                    if (isBase64IntentBytes) {
                        signaturePayload = payloadToCheck || signaturePayload;
                        console.log(`[Execute] ℹ️  Using base64-encoded intentBytes as signature_payload (Intent-based WebAuthn)`);
                    } else if (isDepositFunction && processedParameters.signature_payload) {
                        // For deposit functions, use the reconstructed payload (already has destination removed)
                        // This ensures we use the corrected payload, not the original one with destination
                        signaturePayload = processedParameters.signature_payload;
                        console.log(`[Execute] ℹ️  Using reconstructed deposit signature_payload (destination removed)`);
                    } else {
                        signaturePayload = payloadToCheck;
                        console.log(`[Execute] ℹ️  Using existing signature payload (WebAuthn signature was created for this payload)`);
                    }
                }
                
                // Update parameters with processed WebAuthn data
                // Use the signaturePayload (either regenerated or existing, depending on whether WebAuthn signature exists)
                processedParameters = {
                    ...processedParameters,
                    signature_payload: signaturePayload, // Use existing or regenerated payload
                    webauthn_signature: rawSignature64.toString('base64'), // Convert back to base64 for ScVal conversion
                    webauthn_authenticator_data: webauthnAuthenticatorData,
                    webauthn_client_data: webauthnClientData
                };
                
                console.log(`[Execute] ✅ WebAuthn signature processed - Length: ${rawSignature64.length} bytes`);
                console.log(`[Execute] ✅ Using signature_payload: ${signaturePayload ? (signaturePayload.length > 100 ? signaturePayload.substring(0, 100) + '...' : signaturePayload) : 'none'}`);
            } catch (error) {
                console.error(`[Execute] ❌ Error processing WebAuthn signature:`, error);
                return res.status(400).json({
                    error: 'Failed to process WebAuthn signature',
                    message: error.message
                });
            }
        }

        // Use introspection to get the actual function signature and parameter order
        let functionSignature = null;
        if (contract.discovered_functions) {
            try {
                const discoveredFunctions = typeof contract.discovered_functions === 'string'
                    ? JSON.parse(contract.discovered_functions)
                    : contract.discovered_functions;
                
                if (discoveredFunctions && discoveredFunctions[function_name]) {
                    functionSignature = discoveredFunctions[function_name];
                    console.log(`[Execute] 📋 Found function signature for ${function_name}:`, 
                        functionSignature.parameters?.map(p => `${p.name}:${p.type}`).join(', '));
                }
            } catch (e) {
                console.warn(`[Execute] ⚠️  Could not parse discovered_functions:`, e.message);
            }
        }

        // Map parameters using the mapping
        let mappedParams = contractIntrospection.mapFieldsToContract(processedParameters, mapping);
        
        // Log mapped parameters for debugging
        // console.log(`[Execute] 📋 Mapped parameters (${mappedParams.length} total):`, 
        //     mappedParams.map(p => `${p.name}(${p.type})=${p.value !== undefined && p.value !== null ? (typeof p.value === 'string' && p.value.length > 50 ? p.value.substring(0, 50) + '...' : p.value) : 'undefined/null'}`).join(', ')
        // );
        
        // If we have function signature from introspection, build parameter list directly from signature and processedParameters
        // This ensures correct ordering and includes all required parameters
        if (functionSignature && functionSignature.parameters) {
            console.log(`[Execute] 🔍 Building parameters from function signature. processedParameters keys:`, Object.keys(processedParameters).join(', '));
            const orderedParams = [];
            functionSignature.parameters.forEach(expectedParam => {
                // Look up parameter value from processedParameters (this is the source of truth)
                let paramValue = processedParameters[expectedParam.name];
                
                // Debug logging
                if (paramValue === undefined || paramValue === null || paramValue === '') {
                    console.log(`[Execute] 🔍 Parameter ${expectedParam.name} not found in processedParameters, checking mappedParams...`);
                }
                
                // If not found, check mappedParams as fallback
                if ((paramValue === undefined || paramValue === null || paramValue === '') && mappedParams.length > 0) {
                    const mappedParam = mappedParams.find(p => p.name === expectedParam.name);
                    if (mappedParam && mappedParam.value !== undefined && mappedParam.value !== null && mappedParam.value !== '') {
                        paramValue = mappedParam.value;
                        console.log(`[Execute] ✅ Found ${expectedParam.name} in mappedParams`);
                    }
                }
                
                // Only add parameter if it has a value (required parameters should have values)
                if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
                    // Apply conversions if needed
                    // Convert asset "XLM"/"native" to contract address
                    if (expectedParam.name === 'asset' && (expectedParam.type === 'Address' || expectedParam.type === 'address')) {
                        if (paramValue === 'XLM' || paramValue === 'native') {
                            paramValue = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                            console.log(`[Execute] ✅ Converted ${expectedParam.name} to native XLM contract address`);
                        }
                    }
                    
                    // Convert amount to stroops if needed
                    if (expectedParam.name === 'amount' && (expectedParam.type === 'I128' || expectedParam.type === 'i128')) {
                        if (typeof paramValue === 'number' && paramValue < 1000000) {
                            paramValue = Math.floor(paramValue * 10000000).toString();
                            console.log(`[Execute] ✅ Converted ${expectedParam.name} to stroops: ${paramValue}`);
                        } else if (typeof paramValue !== 'string') {
                            paramValue = paramValue.toString();
                        }
                    }
                    
                    orderedParams.push({
                        name: expectedParam.name,
                        type: expectedParam.type,
                        value: paramValue
                    });
                } else {
                    console.warn(`[Execute] ⚠️  Parameter ${expectedParam.name} (${expectedParam.type}) not found or empty - will be skipped`);
                }
            });
            
            mappedParams = orderedParams;
            console.log(`[Execute] ✅ Built ${mappedParams.length} parameters from function signature:`, 
                mappedParams.map(p => `${p.name}:${p.type}`).join(', '));
        } else {
            const skipFallback = false;
            // Fallback: Ensure WebAuthn parameters are included in mappedParams if they exist in processedParameters
            // These might not be in the mapping but are required for contract execution
            const webAuthnParamNames = ['webauthn_signature', 'webauthn_authenticator_data', 'webauthn_client_data', 'signature_payload'];
            webAuthnParamNames.forEach(webAuthnParamName => {
                if (processedParameters[webAuthnParamName] !== undefined && processedParameters[webAuthnParamName] !== null) {
                    const existingWebAuthnParam = mappedParams.find(p => p.name === webAuthnParamName);
                    if (!existingWebAuthnParam) {
                        // Find the parameter type from mapping or default to Bytes
                        const mappingParam = mapping?.parameters?.find(p => p.name === webAuthnParamName);
                        mappedParams.push({
                            name: webAuthnParamName,
                            type: mappingParam?.type || 'Bytes',
                            value: processedParameters[webAuthnParamName]
                        });
                        console.log(`[Execute] ✅ Added WebAuthn parameter ${webAuthnParamName} to mappedParams`);
                    } else {
                        // Update existing parameter if value is missing
                        if (!existingWebAuthnParam.value || existingWebAuthnParam.value === '') {
                            existingWebAuthnParam.value = processedParameters[webAuthnParamName];
                            console.log(`[Execute] ✅ Updated WebAuthn parameter ${webAuthnParamName} in mappedParams`);
                        }
                    }
                }
            });
        }
        
        // If mapping didn't find all parameters, try direct lookup as fallback
        // Also convert values that need conversion (XLM -> contract address, etc.)
        // Only process parameters that are in the function signature (if introspection is available)
        // Skip this if we already have introspection and have ordered the parameters
        // IMPORTANT: If we built parameters from function signature, skip this fallback logic completely
        // We check if we have introspection by checking if functionSignature exists AND we have parameters built from it
        // The introspection code sets mappedParams directly from the function signature, so if we have introspection,
        // we should skip the fallback entirely
        const hasIntrospectionBuiltParams = functionSignature && functionSignature.parameters && mappedParams.length > 0;
        if (mapping && mapping.parameters && !hasIntrospectionBuiltParams) {
            console.log(`[Execute] 🔄 Running fallback parameter lookup (introspection not available or no parameters built)`);
            // Get expected parameter names from function signature if available
            const expectedParamNames = functionSignature && functionSignature.parameters 
                ? new Set(functionSignature.parameters.map(p => p.name))
                : null;
            
            // If we have function signature, only process parameters that are in it
            const paramsToProcess = expectedParamNames 
                ? mapping.parameters.filter(param => expectedParamNames.has(param.name))
                : mapping.parameters;
            
            paramsToProcess.forEach(param => {
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
                        
                        // Replace placeholder text with actual matched wallet address
                        if (param.name === 'destination' && (param.type === 'Address' || param.type === 'address')) {
                            const isPlaceholder = typeof directValue === 'string' && 
                                (directValue.includes('[Will be system-generated') || 
                                 directValue.includes('system-generated'));
                            
                            if (isPlaceholder) {
                                // Try to get matched_public_key from various sources
                                const matchedKey = matched_public_key || 
                                                  processedParameters.matched_public_key ||
                                                  req.body.matched_public_key;
                                
                                if (matchedKey) {
                                    directValue = matchedKey;
                                    console.log(`[Execute] ✅ Replaced placeholder destination with matched_public_key: ${directValue?.substring(0, 8)}...`);
                                } else {
                                    console.error(`[Execute] ❌ Destination is placeholder but matched_public_key not available`);
                                    throw new Error(`Destination address is required but not available. Placeholder text found: ${directValue}. Please provide matched_public_key in the request.`);
                                }
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
            // Prefer signed XDR over server-side signing (more secure)
            let transactionToSubmit;
            
            if (signedXDR) {
                // Validate and use signed XDR (no secret key needed)
                try {
                    const parsedTx = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
                    
                    if (!parsedTx.signatures || parsedTx.signatures.length === 0) {
                        return res.status(400).json({
                            error: 'Invalid signed XDR',
                            details: 'Transaction has no signatures'
                        });
                    }
                    
                    // Verify transaction source matches user_public_key
                    if (parsedTx.source !== user_public_key) {
                        return res.status(400).json({
                            error: 'Transaction source mismatch',
                            details: `Transaction source ${parsedTx.source} does not match user_public_key ${user_public_key}`
                        });
                    }
                    
                    console.log('[Execute] ✅ Signed XDR validated:', {
                        source: parsedTx.source,
                        operationCount: parsedTx.operations.length,
                        signatureCount: parsedTx.signatures.length
                    });
                    
                    transactionToSubmit = parsedTx;
                } catch (xdrError) {
                    return res.status(400).json({
                        error: 'Invalid signed XDR format',
                        details: xdrError.message
                    });
                }
            } else {
                // Backward compatibility: Use server-side signing if signedXDR not provided
                if (!user_secret_key) {
                    return res.status(400).json({
                        error: 'Either signedXDR or user_secret_key is required for write operations',
                        note: 'Prefer signedXDR for better security (secret key never leaves client)'
                    });
                }
                
                const keypair = StellarSdk.Keypair.fromSecret(user_secret_key);
                const account = await sorobanServer.getAccount(keypair.publicKey());
                
                // PUBLIC-FRIENDLY LOG: Rule execution started (for GeoLink Events feed)
                if (rule_id) {
                    console.log(`[GeoLink Events] ⚡ Rule ${rule_id} execution started: ${function_name}() for ${user_public_key.substring(0, 8)}...`);
                }
                
                // console.log(`[Execute] 🔨 Building transaction for function: ${function_name}`);
                const transaction = new StellarSdk.TransactionBuilder(account, {
                    fee: StellarSdk.BASE_FEE,
                    networkPassphrase: networkPassphrase
                })
                    .addOperation(operation)
                    .setTimeout(30)
                    .build();
                
                // Prepare transaction (required for Soroban contracts)
                // console.log(`[Execute] 🔄 Preparing transaction for function: ${function_name}`);
                const preparedTx = await sorobanServer.prepareTransaction(transaction);
                // console.log(`[Execute] ✅ Transaction prepared`);
                
                // Sign the prepared transaction
                // console.log(`[Execute] ✍️ Signing transaction...`);
                preparedTx.sign(keypair);
                // console.log(`[Execute] ✅ Transaction signed`);
                
                transactionToSubmit = preparedTx;
            }
            
            try {
                // Submit transaction (already signed, whether from signedXDR or server-side)
                // console.log(`[Execute] 📤 Submitting transaction to ledger for function: ${function_name} (read-only: ${isReadOnly}, forceOnChain: ${forceOnChain})`);
                const sendResult = await sorobanServer.sendTransaction(transactionToSubmit);
                
                // PUBLIC-FRIENDLY LOG: Transaction submitted (for GeoLink Events feed)
                // Transaction hash is public blockchain data - safe to log
                if (rule_id) {
                    console.log(`[GeoLink Events] ✅ Rule ${rule_id} transaction submitted: ${sendResult.hash}`);
                } else {
                    console.log(`[GeoLink Events] ✅ Contract function ${function_name}() transaction submitted: ${sendResult.hash}`);
                }
                
                // Wait for transaction to be included in a ledger
                // console.log(`[Execute] ⏳ Waiting for transaction to be included in ledger...`);
                let txResult = null;
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds between polls
                    try {
                        txResult = await sorobanServer.getTransaction(sendResult.hash);
                        // console.log(`[Execute] 📊 Poll attempt ${i + 1}/30 - Status: ${txResult.status}`);
                        
                        if (txResult.status === 'SUCCESS') {
                            // PUBLIC-FRIENDLY LOG: Transaction confirmed (for GeoLink Events feed)
                            if (rule_id) {
                                console.log(`[GeoLink Events] ✅ Rule ${rule_id} transaction confirmed on ledger ${txResult.ledger}: ${sendResult.hash}`);
                            } else {
                                console.log(`[GeoLink Events] ✅ Contract function ${function_name}() transaction confirmed on ledger ${txResult.ledger}: ${sendResult.hash}`);
                            }
                            // console.log(`[Execute] ✅ Transaction successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
                            
                            // Check the contract's return value
                            let contractReturnValue = null;
                            try {
                                if (txResult.resultMetaXdr) {
                                    // Parse resultMetaXdr if it's a string
                                    let transactionMeta;
                                    if (typeof txResult.resultMetaXdr === 'string') {
                                        transactionMeta = StellarSdk.xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64');
                                    } else {
                                        transactionMeta = txResult.resultMetaXdr;
                                    }
                                    
                                    // Try to get Soroban meta - check if v3 exists
                                    let sorobanMeta = null;
                                    let returnValueScVal = null;
                                    
                                    // Try v3 format first
                                    if (transactionMeta && typeof transactionMeta.v3 === 'function') {
                                        try {
                                            const v3Meta = transactionMeta.v3();
                                            if (v3Meta && typeof v3Meta.sorobanMeta === 'function') {
                                                sorobanMeta = v3Meta.sorobanMeta();
                                            }
                                        } catch (v3Error) {
                                            // console.log(`[Execute] ℹ️  Transaction meta v3() method failed:`, v3Error.message);
                                        }
                                    }
                                    
                                    // If v3 didn't work, try accessing directly
                                    if (!sorobanMeta && transactionMeta) {
                                        try {
                                            // Check if it's already a SorobanMeta object
                                            if (transactionMeta.sorobanMeta && typeof transactionMeta.sorobanMeta === 'function') {
                                                sorobanMeta = transactionMeta.sorobanMeta();
                                            }
                                        } catch (directError) {
                                            // console.log(`[Execute] ℹ️  Direct sorobanMeta access failed:`, directError.message);
                                        }
                                    }
                                    
                                    // Extract return value if we have sorobanMeta
                                    if (sorobanMeta && typeof sorobanMeta.returnValue === 'function') {
                                        try {
                                            returnValueScVal = sorobanMeta.returnValue();
                                            if (returnValueScVal) {
                                                // Convert ScVal to native JavaScript value
                                                contractReturnValue = StellarSdk.scValToNative(returnValueScVal);
                                                // console.log(`[Execute] 📋 Contract function returned:`, contractReturnValue);
                                                
                                                // Check if return value is false (for boolean return types)
                                                if (contractReturnValue === false) {
                                                    console.error(`[Execute] ❌ Contract function "${function_name}" returned FALSE, indicating a business logic failure.`);
                                                    return res.status(400).json({
                                                        success: false,
                                                        error: `Contract function "${function_name}" returned FALSE.`,
                                                        message: 'The transaction was included in the ledger, but the contract\'s business logic rejected the operation.',
                                                        details: 'This often indicates a problem with the provided parameters, insufficient balance, or failed WebAuthn signature verification.',
                                                        suggestion: 'Please verify the input parameters, ensure the smart wallet has sufficient balance, and confirm that the correct passkey is registered and used for signing.',
                                                        function_name,
                                                        is_read_only: isReadOnly,
                                                        transaction_hash: sendResult.hash,
                                                        transaction_status: txResult.status,
                                                        contract_return_value: contractReturnValue,
                                                        network: network,
                                                        stellar_expert_url: stellarExpertUrl
                                                    });
                                                }
                                            }
                                        } catch (returnValueError) {
                                            // console.warn(`[Execute] ⚠️  Could not extract return value from sorobanMeta:`, returnValueError.message);
                                        }
                                    }
                                    // else {
                                    //     console.log(`[Execute] ℹ️  Transaction meta is not v3 format or sorobanMeta not available, skipping return value extraction`);
                                    //     console.log(`[Execute] 📋 TransactionMeta type:`, transactionMeta ? transactionMeta.constructor?.name : 'null');
                                    //     console.log(`[Execute] 📋 TransactionMeta has v3:`, transactionMeta && typeof transactionMeta.v3 === 'function');
                                    //     console.log(`[Execute] 📋 TransactionMeta has sorobanMeta:`, transactionMeta && typeof transactionMeta.sorobanMeta === 'function');
                                    // }
                                }
                            } catch (returnValueError) {
                                // console.warn(`[Execute] ⚠️  Could not extract return value:`, returnValueError.message);
                                // Continue anyway - transaction was successful
                            }
                            
                            // Store return value for response
                            if (contractReturnValue !== null) {
                                txResult.returnValue = contractReturnValue;
                            }
                            
                            break;
                        } else if (txResult.status === 'FAILED') {
                            // PUBLIC-FRIENDLY LOG: Transaction failed (for GeoLink Events feed)
                            if (rule_id) {
                                console.log(`[GeoLink Events] ❌ Rule ${rule_id} transaction failed: ${sendResult.hash}`);
                            } else {
                                console.log(`[GeoLink Events] ❌ Contract function ${function_name}() transaction failed: ${sendResult.hash}`);
                            }
                            // console.log(`[Execute] ❌ Transaction failed - Hash: ${sendResult.hash}`);
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
                        // console.log(`[Execute] ⚠️ Poll attempt ${i + 1} failed: ${pollError.message}`);
                        continue;
                    }
                }
                
                if (!txResult || txResult.status !== 'SUCCESS') {
                    // Transaction was sent but we couldn't confirm it was included
                    // Still return success with the hash so user can check manually
                    // console.log(`[Execute] ⚠️ Could not confirm transaction inclusion, but it was sent. Hash: ${sendResult.hash}`);
                    const network = contract.network === 'mainnet' ? 'mainnet' : 'testnet';
                    const stellarExpertUrl = `https://stellar.expert/explorer/${network}/tx/${sendResult.hash}`;
                    
                    // If rule_id is provided, mark the pending rule as completed (even if confirmation is pending)
                    if (rule_id) {
                        try {
                            const markCompletedQuery = `
                                UPDATE location_update_queue luq
                                SET execution_results = (
                                    SELECT jsonb_agg(
                                        CASE 
                                            WHEN (result->>'rule_id')::integer = $1::integer AND result->>'skipped' = 'true'
                                            THEN result || jsonb_build_object(
                                                'completed', true, 
                                                'completed_at', $3::text,
                                                'transaction_hash', $4::text,
                                                'success', true,
                                                'pending_confirmation', true
                                            )
                                            ELSE result
                                        END
                                    )
                                    FROM jsonb_array_elements(luq.execution_results) AS result
                                )
                                WHERE luq.user_id = $2
                                    AND luq.execution_results IS NOT NULL
                                    AND EXISTS (
                                        SELECT 1
                                        FROM jsonb_array_elements(luq.execution_results) AS result
                                        WHERE (result->>'rule_id')::integer = $1::integer
                                        AND result->>'skipped' = 'true'
                                        AND (result->>'completed')::boolean IS DISTINCT FROM true
                                    )
                            `;
                            await pool.query(markCompletedQuery, [
                                parseInt(rule_id), 
                                userId, 
                                new Date().toISOString(),
                                sendResult.hash
                            ]);
                            // console.log(`[Execute] ✅ Marked pending rule ${rule_id} as completed (pending confirmation)`);
                        } catch (updateError) {
                            console.error(`[Execute] ⚠️ Error marking rule ${rule_id} as completed:`, updateError.message);
                        }
                    }
                    
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
                
                // Check if contract returned false (payment rejected) - this is now handled in the try-catch above
                // The check happens immediately after extracting the return value
                
                // If rule_id is provided, mark the rule as completed in execution_results
                // This handles both pending rules (skipped = true) and direct executions
                if (rule_id) {
                    try {
                        // First, try to update an existing pending (requires_webauthn) placeholder entry.
                        // IMPORTANT: When update_id is provided, we key the update off (user_id + update_id) and do NOT require luq.public_key to match,
                        // because multi-role users can see pending entries whose luq.public_key differs from req.user.public_key.
                        let updatePendingQuery;
                        let updateQueryParams;
                        const completedAt = new Date().toISOString();
                        const executionParamsJson = JSON.stringify(parameters || {});

                        if (update_id) {
                            // Precise: update the specific queue record and convert the placeholder into a completed record
                            updatePendingQuery = `
                                UPDATE location_update_queue luq
                                SET execution_results = (
                                    SELECT jsonb_agg(
                                        CASE
                                            WHEN (result.value->>'rule_id')::integer = $1::integer
                                                AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                                AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                                AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                                AND COALESCE((result.value->>'completed')::boolean, false) = false
                                            THEN (result.value - 'reason') || jsonb_build_object(
                                                'completed', true,
                                                'completed_at', $3::text,
                                                'transaction_hash', $4::text,
                                                'success', true,
                                                'skipped', false,
                                                'direct_execution', true,
                                                'execution_parameters', $5::jsonb,
                                                'matched_public_key', COALESCE(result.value->>'matched_public_key', $6::text)
                                            )
                                            ELSE result.value
                                        END
                                        ORDER BY result.ordinality
                                    )
                                    FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                                ),
                                status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                                processed_at = NOW()
                                WHERE luq.user_id = $2
                                    AND luq.id = $7::integer
                                    AND luq.execution_results IS NOT NULL
                                    AND EXISTS (
                                        SELECT 1
                                        FROM jsonb_array_elements(luq.execution_results) AS r
                                        WHERE (r->>'rule_id')::integer = $1::integer
                                            AND COALESCE((r->>'skipped')::boolean, false) = true
                                            AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((r->>'rejected')::boolean, false) = false
                                            AND COALESCE((r->>'completed')::boolean, false) = false
                                    )
                                RETURNING luq.id, luq.received_at, luq.public_key
                            `;
                            updateQueryParams = [
                                parseInt(rule_id),
                                userId,
                                completedAt,
                                sendResult.hash,
                                executionParamsJson,
                                matched_public_key || null,
                                parseInt(update_id)
                            ];
                        } else if (matched_public_key) {
                            // Best-effort: match by user_id + matched_public_key when update_id isn't provided
                            updatePendingQuery = `
                                UPDATE location_update_queue luq
                                SET execution_results = (
                                    SELECT jsonb_agg(
                                        CASE
                                            WHEN (result.value->>'rule_id')::integer = $1::integer
                                                AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                                AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                                AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                                AND COALESCE((result.value->>'completed')::boolean, false) = false
                                                AND COALESCE(result.value->>'matched_public_key', luq.public_key) = $6::text
                                            THEN (result.value - 'reason') || jsonb_build_object(
                                                'completed', true,
                                                'completed_at', $3::text,
                                                'transaction_hash', $4::text,
                                                'success', true,
                                                'skipped', false,
                                                'direct_execution', true,
                                                'execution_parameters', $5::jsonb,
                                                'matched_public_key', COALESCE(result.value->>'matched_public_key', $6::text)
                                            )
                                            ELSE result.value
                                        END
                                        ORDER BY result.ordinality
                                    )
                                    FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                                ),
                                status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                                processed_at = NOW()
                                WHERE luq.user_id = $2
                                    AND luq.execution_results IS NOT NULL
                                    AND EXISTS (
                                        SELECT 1
                                        FROM jsonb_array_elements(luq.execution_results) AS r
                                        WHERE (r->>'rule_id')::integer = $1::integer
                                            AND COALESCE((r->>'skipped')::boolean, false) = true
                                            AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((r->>'rejected')::boolean, false) = false
                                            AND COALESCE((r->>'completed')::boolean, false) = false
                                            AND COALESCE(r->>'matched_public_key', luq.public_key) = $6::text
                                    )
                                RETURNING luq.id, luq.received_at, luq.public_key
                            `;
                            updateQueryParams = [
                                parseInt(rule_id),
                                userId,
                                completedAt,
                                sendResult.hash,
                                executionParamsJson,
                                matched_public_key
                            ];
                        } else {
                            // Fallback: match by user_id + rule_id only (backward compatibility)
                            updatePendingQuery = `
                                UPDATE location_update_queue luq
                                SET execution_results = (
                                    SELECT jsonb_agg(
                                        CASE
                                            WHEN (result.value->>'rule_id')::integer = $1::integer
                                                AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                                AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                                AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                                AND COALESCE((result.value->>'completed')::boolean, false) = false
                                            THEN (result.value - 'reason') || jsonb_build_object(
                                                'completed', true,
                                                'completed_at', $3::text,
                                                'transaction_hash', $4::text,
                                                'success', true,
                                                'skipped', false,
                                                'direct_execution', true,
                                                'execution_parameters', $5::jsonb
                                            )
                                            ELSE result.value
                                        END
                                        ORDER BY result.ordinality
                                    )
                                    FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                                ),
                                status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                                processed_at = NOW()
                                WHERE luq.user_id = $2
                                    AND luq.execution_results IS NOT NULL
                                    AND EXISTS (
                                        SELECT 1
                                        FROM jsonb_array_elements(luq.execution_results) AS r
                                        WHERE (r->>'rule_id')::integer = $1::integer
                                            AND COALESCE((r->>'skipped')::boolean, false) = true
                                            AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                                            AND COALESCE((r->>'rejected')::boolean, false) = false
                                            AND COALESCE((r->>'completed')::boolean, false) = false
                                    )
                                RETURNING luq.id, luq.received_at, luq.public_key
                            `;
                            updateQueryParams = [
                                parseInt(rule_id),
                                userId,
                                completedAt,
                                sendResult.hash,
                                executionParamsJson
                            ];
                        }
                        
                        // console.log(`[Execute] 🔍 Attempting to mark rule ${rule_id} as completed with update_id=${update_id}, matched_public_key=${matched_public_key}`);
                        const updateResult = await pool.query(updatePendingQuery, updateQueryParams);
                        // console.log(`[Execute] 📊 Completion query result: ${updateResult.rows.length} row(s) updated`);
                        
                        // Clean up older queue entries for the same rule_id + public_key combination
                        if (updateResult.rows.length > 0) {
                            try {
                                const receivedAt = updateResult.rows[0].received_at;
                                const completedPublicKey = updateResult.rows[0].public_key || matched_public_key;
                                const cleanupQuery = `
                                    DELETE FROM location_update_queue luq2
                                    WHERE luq2.user_id = $1
                                        AND ($2::text IS NULL OR luq2.public_key = $2)
                                        AND luq2.id != COALESCE($3::integer, 0)
                                        AND luq2.status <> 'processing'
                                        AND luq2.execution_results IS NOT NULL
                                        -- CRITICAL: Only delete entries that are OLDER than the executed one (received_at <= executed entry's received_at)
                                        AND luq2.received_at <= $6::timestamp
                                        -- Only delete entries that have the EXACT matching rule_id and matched_public_key
                                        -- AND only if they have pending/skipped rules (not completed ones)
                                        AND EXISTS (
                                            SELECT 1
                                            FROM jsonb_array_elements(luq2.execution_results) AS result2
                                            WHERE (result2->>'rule_id')::integer = $5::integer
                                            AND COALESCE((result2->>'skipped')::boolean, false) = true
                                            AND COALESCE((result2->>'completed')::boolean, false) = false
                                            AND (
                                                -- Exact match: matched_public_key must match exactly
                                                ($4::text IS NOT NULL AND result2->>'matched_public_key' = $4::text)
                                                OR ($4::text IS NULL AND (result2->>'matched_public_key' IS NULL OR result2->>'matched_public_key' = luq2.public_key))
                                            )
                                        )
                                        -- CRITICAL: Only delete entries that have NO completed rules (preserve entries with completed rules)
                                        AND NOT EXISTS (
                                            SELECT 1
                                            FROM jsonb_array_elements(luq2.execution_results) AS result3
                                            WHERE COALESCE((result3->>'completed')::boolean, false) = true
                                        )
                                `;
                                const cleanupParams = [
                                    userId,
                                    completedPublicKey,
                                    update_id ? parseInt(update_id) : null,
                                    matched_public_key || completedPublicKey,
                                    parseInt(rule_id),
                                    receivedAt
                                ];
                                    const cleanupResult = await pool.query(cleanupQuery, cleanupParams);
                                    // console.log(`[Execute] 🧹 Cleaned up ${cleanupResult.rowCount} older queue entry/entries for rule ${rule_id}`);
                            } catch (cleanupError) {
                                console.error(`[Execute] ⚠️ Error cleaning up older queue entries:`, cleanupError.message);
                                // Don't fail the request if cleanup fails
                            }
                        }
                        
                        // Record execution in rate limiting history (for rate limit enforcement)
                        if (rule_id && updateResult.rows.length > 0) {
                            try {
                                const executedPublicKey = updateResult.rows[0].public_key || matched_public_key || user_public_key;
                                console.log(`[ContractExecution] 📝 Recording rule execution for rate limit tracking:`, {
                                    rule_id: parseInt(rule_id),
                                    public_key: executedPublicKey?.substring(0, 8) + '...',
                                    transaction_hash: sendResult.hash?.substring(0, 16) + '...',
                                    update_id: update_id
                                });
                                await pool.query(
                                    'SELECT record_rule_execution($1, $2, $3, $4)',
                                    [
                                        parseInt(rule_id),
                                        executedPublicKey,
                                        sendResult.hash,
                                        JSON.stringify({
                                            success: true,
                                            completed: true,
                                            transaction_hash: sendResult.hash,
                                            completed_at: completedAt,
                                            execution_type: 'manual',
                                            matched_public_key: matched_public_key || executedPublicKey
                                        })
                                    ]
                                );
                                // console.log(`[Execute] ✅ Recorded rule ${rule_id} execution in rate limit history for public key ${executedPublicKey.substring(0, 8)}...`);
                                
                                // Trigger lightweight cleanup asynchronously (non-blocking)
                                cleanupAfterExecution(
                                    parseInt(rule_id),
                                    executedPublicKey,
                                    userId,
                                    completedAt
                                ).catch(err => {
                                    console.error('[QueueCleanup] ⚠️ Background cleanup error:', err.message);
                                });
                            } catch (rateLimitError) {
                                console.error(`[Execute] ⚠️ Error recording rule execution for rate limiting:`, rateLimitError.message);
                                // Don't fail the request if rate limit recording fails
                            }
                        }
                        
                        // Verify the update by checking what's in the database
                        if (updateResult.rows.length > 0 && update_id) {
                            try {
                                const verifyQuery = `
                                    SELECT 
                                        luq.id,
                                        luq.execution_results
                                    FROM location_update_queue luq
                                    WHERE luq.id = $1
                                `;
                                const verifyResult = await pool.query(verifyQuery, [parseInt(update_id)]);
                                if (verifyResult.rows.length > 0) {
                                    const execResults = verifyResult.rows[0].execution_results;
                                    console.log(`[Execute] ✅ Verification: Entry ${update_id} updated. Remaining execution results:`, 
                                        execResults ? `${execResults.length} entry/entries` : 'NULL (all entries removed)');
                                } else {
                                    console.log(`[Execute] ✅ Verification: Entry ${update_id} was deleted (all entries processed)`);
                                }
                            } catch (verifyError) {
                                console.error(`[Execute] ⚠️ Error verifying update:`, verifyError.message);
                            }
                        }
                        
                        // If the primary completion update did not match, do NOT immediately append a new completed record.
                        // Appending causes the exact bug: the original pending placeholder remains, so the rule shows in BOTH lists.
                        // Instead, do a fallback match: find the latest queue row that still contains the pending placeholder and convert it in-place.
                        if (updateResult.rows.length === 0) {
                            console.warn(`[Execute] ⚠️ No pending rule matched the primary completion update. Attempting fallback completion update...`);

                            const fallbackUpdateQuery = `
                                WITH target AS (
                                    SELECT luq.id
                                    FROM location_update_queue luq
                                    WHERE luq.user_id = $2
                                      AND luq.execution_results IS NOT NULL
                                      AND EXISTS (
                                        SELECT 1
                                        FROM jsonb_array_elements(luq.execution_results) AS r
                                        WHERE (r->>'rule_id')::integer = $1::integer
                                          AND COALESCE((r->>'skipped')::boolean, false) = true
                                          AND COALESCE(r->>'reason', '') = 'requires_webauthn'
                                          AND COALESCE((r->>'rejected')::boolean, false) = false
                                          AND COALESCE((r->>'completed')::boolean, false) = false
                                          AND (
                                            $6::text IS NULL
                                            OR COALESCE(r->>'matched_public_key', luq.public_key) = $6::text
                                          )
                                      )
                                    ORDER BY luq.received_at DESC
                                    LIMIT 1
                                )
                                UPDATE location_update_queue luq
                                SET execution_results = (
                                    SELECT jsonb_agg(
                                        CASE
                                            WHEN (result.value->>'rule_id')::integer = $1::integer
                                              AND COALESCE((result.value->>'skipped')::boolean, false) = true
                                              AND COALESCE(result.value->>'reason', '') = 'requires_webauthn'
                                              AND COALESCE((result.value->>'rejected')::boolean, false) = false
                                              AND COALESCE((result.value->>'completed')::boolean, false) = false
                                              AND (
                                                $6::text IS NULL
                                                OR COALESCE(result.value->>'matched_public_key', luq.public_key) = $6::text
                                              )
                                            THEN (result.value - 'reason') || jsonb_build_object(
                                                'completed', true,
                                                'completed_at', $3::text,
                                                'transaction_hash', $4::text,
                                                'success', true,
                                                'skipped', false,
                                                'direct_execution', true,
                                                'matched_public_key', COALESCE(result.value->>'matched_public_key', $6::text),
                                                'execution_parameters', $5::jsonb
                                            )
                                            ELSE result.value
                                        END
                                        ORDER BY result.ordinality
                                    )
                                    FROM jsonb_array_elements(luq.execution_results) WITH ORDINALITY AS result(value, ordinality)
                                ),
                                status = CASE WHEN luq.status = 'matched' THEN 'executed' ELSE luq.status END,
                                processed_at = NOW()
                                FROM target t
                                WHERE luq.id = t.id
                                RETURNING luq.id, luq.received_at, luq.public_key;
                            `;

                            const fallbackResult = await pool.query(fallbackUpdateQuery, [
                                parseInt(rule_id),
                                userId,
                                completedAt,
                                sendResult.hash,
                                executionParamsJson,
                                matched_public_key || null
                            ]);

                            if (fallbackResult.rows.length > 0) {
                                console.log(`[Execute] ✅ Fallback completion succeeded for rule ${rule_id} (update_id=${fallbackResult.rows[0].id}).`);

                                // Ensure cleanup runs even when we needed the fallback path
                                try {
                                    const receivedAt = fallbackResult.rows[0].received_at;
                                    const completedPublicKey = fallbackResult.rows[0].public_key || matched_public_key;
                                    const cleanupQuery = `
                                        DELETE FROM location_update_queue luq2
                                        WHERE luq2.user_id = $1
                                            AND luq2.public_key = $2
                                            AND luq2.id != COALESCE($3::integer, 0)
                                            AND luq2.received_at <= $4::timestamp
                                            AND luq2.status <> 'processing'
                                            AND (
                                                ($5::integer = ANY(luq2.matched_rule_ids))
                                                OR (
                                                    luq2.execution_results IS NOT NULL
                                                    AND EXISTS (
                                                        SELECT 1
                                                        FROM jsonb_array_elements(luq2.execution_results) AS result2
                                                        WHERE (result2->>'rule_id')::integer = $5::integer
                                                    )
                                                )
                                            )
                                            -- CRITICAL: Only delete entries that have NO completed rules (preserve entries with completed rules)
                                            AND NOT EXISTS (
                                                SELECT 1
                                                FROM jsonb_array_elements(luq2.execution_results) AS result3
                                                WHERE COALESCE((result3->>'completed')::boolean, false) = true
                                            )
                                    `;
                                    const cleanupParams = [
                                        userId,
                                        completedPublicKey,
                                        update_id ? parseInt(update_id) : null,
                                        receivedAt,
                                        parseInt(rule_id)
                                    ];
                                    const cleanupResult = await pool.query(cleanupQuery, cleanupParams);
                                    // console.log(`[Execute] 🧹 (fallback) Cleaned up ${cleanupResult.rowCount} older queue entry/entries for rule ${rule_id}`);
                                } catch (cleanupError) {
                                    console.error(`[Execute] ⚠️ (fallback) Error cleaning up older queue entries:`, cleanupError.message);
                                }
                                
                                // Record execution in rate limiting history (for rate limit enforcement)
                                if (rule_id && fallbackResult.rows.length > 0) {
                                    try {
                                        const executedPublicKey = fallbackResult.rows[0].public_key || matched_public_key || user_public_key;
                                        await pool.query(
                                            'SELECT record_rule_execution($1, $2, $3, $4)',
                                            [
                                                parseInt(rule_id),
                                                executedPublicKey,
                                                sendResult.hash,
                                                JSON.stringify({
                                                    success: true,
                                                    completed: true,
                                                    transaction_hash: sendResult.hash,
                                                    completed_at: completedAt,
                                                    execution_type: 'manual_fallback',
                                                    matched_public_key: matched_public_key || executedPublicKey
                                                })
                                            ]
                                        );
                                        // console.log(`[Execute] ✅ (fallback) Recorded rule ${rule_id} execution in rate limit history for public key ${executedPublicKey.substring(0, 8)}...`);
                                        
                                        // Trigger lightweight cleanup asynchronously (non-blocking)
                                        cleanupAfterExecution(
                                            parseInt(rule_id),
                                            executedPublicKey,
                                            userId,
                                            completedAt
                                        ).catch(err => {
                                            console.error('[QueueCleanup] ⚠️ Background cleanup error:', err.message);
                                        });
                                    } catch (rateLimitError) {
                                        console.error(`[Execute] ⚠️ (fallback) Error recording rule execution for rate limiting:`, rateLimitError.message);
                                        // Don't fail the request if rate limit recording fails
                                    }
                                }
                            } else {
                                // If there truly is no pending placeholder, we allow a completion record to be appended (direct execution use-case).
                                console.warn(`[Execute] ⚠️ Fallback completion found no pending placeholder. Appending a completion record to the latest queue entry (direct execution path).`);
                                const actualParamsJson = JSON.stringify(parameters || {});
                                const createCompletionQuery = `
                                    WITH latest_update AS (
                                        SELECT id
                                        FROM location_update_queue
                                        WHERE user_id = $2
                                        ORDER BY received_at DESC
                                        LIMIT 1
                                    )
                                    UPDATE location_update_queue luq
                                    SET execution_results = COALESCE(
                                        luq.execution_results || '[]'::jsonb,
                                        '[]'::jsonb
                                    ) || jsonb_build_array(
                                        jsonb_build_object(
                                            'rule_id', $1::integer,
                                            'completed', true,
                                            'completed_at', $3::text,
                                            'transaction_hash', $4::text,
                                            'success', true,
                                            'skipped', false,
                                            'direct_execution', true,
                                            'matched_public_key', $6::text,
                                            'execution_parameters', $5::jsonb
                                        )
                                    )
                                    FROM latest_update lu
                                    WHERE luq.id = lu.id
                                    RETURNING luq.id
                                `;

                                const createResult = await pool.query(createCompletionQuery, [
                                    parseInt(rule_id),
                                    userId,
                                    completedAt,
                                    sendResult.hash,
                                    actualParamsJson,
                                    matched_public_key || null
                                ]);

                                if (createResult.rows.length > 0) {
                                    console.log(`[Execute] ✅ Appended completion entry for direct execution of rule ${rule_id}`);
                                } else {
                                    console.warn(`[Execute] ⚠️ Could not append completion entry (no latest queue row).`);
                                }
                            }
                        } else {
                            // PUBLIC-FRIENDLY LOG: Rule completed (for GeoLink Events feed)
                            console.log(`[GeoLink Events] ✅ Rule ${rule_id} completed - Transaction: ${sendResult.hash}`);
                            // console.log(`[Execute] ✅ Marked pending rule ${rule_id} as completed`);
                        }
                    } catch (updateError) {
                        // Don't fail the execution if we can't update the status
                        console.error(`[Execute] ⚠️ Error marking rule ${rule_id} as completed:`, updateError);
                    }
                }
                
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
                    contract_return_value: txResult.returnValue !== undefined ? txResult.returnValue : null,
                    transaction_result: txResult,
                    stellar_expert_url: stellarExpertUrl,
                    note: isReadOnly 
                        ? 'This read-only function was submitted to the ledger and will appear on StellarExpert'
                        : 'Transaction submitted to the ledger'
                });
            } catch (error) {
                console.error('[Execute] ❌ Error in contract execution (non-smart-wallet path):', {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    contractId: id,
                    functionName: function_name,
                    isReadOnly,
                    userId: req.user?.id || req.userId,
                    hasUserPublicKey: !!user_public_key,
                    hasUserSecretKey: !!user_secret_key,
                    errorCode: error.code,
                    errorResponse: error.response?.data
                });
                
                // Don't send response if headers already sent
                if (!res.headersSent) {
                    return res.status(500).json({
                        error: 'Failed to execute contract function',
                        message: error.message || 'Unknown error occurred',
                        function_name,
                        is_read_only: isReadOnly,
                        details: process.env.NODE_ENV === 'development' ? {
                            name: error.name,
                            code: error.code,
                            stack: error.stack,
                            response: error.response?.data
                        } : (error.response?.data || error.toString())
                    });
                }
            }
        }
    } catch (error) {
        console.error('[Execute] ❌ Error executing contract function:', {
            message: error.message,
            name: error.name,
            stack: error.stack,
            contractId: req.params.id,
            functionName: req.body?.function_name,
            userId: req.user?.id || req.userId,
            hasUserPublicKey: !!req.body?.user_public_key,
            hasUserSecretKey: !!req.body?.user_secret_key,
            hasWebAuthn: !!(req.body?.webauthnSignature && req.body?.webauthnAuthenticatorData),
            errorCode: error.code,
            errorResponse: error.response?.data
        });
        
        // Don't send response if headers already sent
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to execute contract function',
                message: error.message || 'Unknown error occurred',
                details: process.env.NODE_ENV === 'development' ? {
                    name: error.name,
                    code: error.code,
                    stack: error.stack
                } : undefined
            });
        }
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
        const { function_name, parameters: parametersFromBody, user_public_key } = req.body;
        
        // Use parameters from body, but make a copy so we can modify it
        let parameters = parametersFromBody ? { ...parametersFromBody } : {};

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

        // Get function parameters from discovered function
        const functionParams = discoveredFunction.parameters || [];
        
        // Auto-populate signer_address and user_address from user's public key if missing
        const userPublicKey = req.user?.public_key || req.body.user_public_key;
        if (userPublicKey) {
            // Check if function has signer_address parameter
            const signerAddressParam = functionParams.find(p => 
                (p.name === 'signer_address' || p.name === 'signerAddress') && 
                (p.type === 'Address' || p.type === 'address')
            );
            if (signerAddressParam && (!parameters[signerAddressParam.name] || parameters[signerAddressParam.name] === '')) {
                parameters[signerAddressParam.name] = userPublicKey;
                console.log(`[Test Function] ✅ Auto-populated ${signerAddressParam.name} from user_public_key`);
            }
            
            // Check if function has user_address parameter
            const userAddressParam = functionParams.find(p => 
                (p.name === 'user_address' || p.name === 'userAddress') && 
                (p.type === 'Address' || p.type === 'address')
            );
            if (userAddressParam && (!parameters[userAddressParam.name] || parameters[userAddressParam.name] === '')) {
                parameters[userAddressParam.name] = userPublicKey;
                console.log(`[Test Function] ✅ Auto-populated ${userAddressParam.name} from user_public_key`);
            }
        }
        
        // Handle 'address' parameter - map it to 'destination' if destination is missing
        if (parameters.address && !parameters.destination) {
            // Check if function expects 'destination' parameter
            const destinationParam = functionParams.find(p => 
                (p.name === 'destination' || p.name === 'recipient' || p.name === 'to') && 
                (p.type === 'Address' || p.type === 'address')
            );
            if (destinationParam) {
                parameters[destinationParam.name] = parameters.address;
                console.log(`[Test Function] ✅ Mapped 'address' parameter to '${destinationParam.name}'`);
                // Remove 'address' to avoid confusion
                delete parameters.address;
            }
        }
        
        // Get function mapping - auto-generate if missing
        let mapping = functionMappings?.[function_name];
        
        // If mapping doesn't exist, auto-generate it from discovered function
        if (!mapping && discoveredFunction) {
            console.log(`[Test Function] Auto-generating mapping for function: ${function_name}`);
            const mappingParams = functionParams.map(param => ({
                name: param.name || 'unknown',
                type: param.type || 'unknown',
                mapped_from: param.mapped_from || contractIntrospection.inferParameterMapping(
                    param.name || '', 
                    param.type || ''
                )
            }));
            
            mapping = {
                parameters: mappingParams,
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
        
        // Check required parameters
        functionParams.forEach(param => {
            const paramValue = parameters[param.name];
            if ((paramValue === undefined || paramValue === null || paramValue === '') && param.required !== false) {
                validationErrors.push(`Missing required parameter: ${param.name} (type: ${param.type})`);
            }
        });
        
        // Check for unknown parameters (but allow 'address' as alias for destination)
        Object.keys(parameters).forEach(paramName => {
            if (paramName === 'address') {
                // 'address' is allowed as alias, skip validation
                return;
            }
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
                })),
                received_parameters: Object.keys(parameters),
                note: 'Tip: You can use "address" as an alias for "destination" parameter'
            });
        }
        
        let mappedParams = [];
        let scValParams = [];
        
        // If we have discovered function, build parameter list directly from function signature
        // This ensures correct ordering
        if (discoveredFunction && discoveredFunction.parameters) {
            const orderedParams = [];
            discoveredFunction.parameters.forEach(expectedParam => {
                // Look up parameter value from parameters object
                let paramValue = parameters[expectedParam.name];
                
                // Apply conversions if needed
                if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
                    // Convert asset "XLM"/"native" to contract address
                    if (expectedParam.name === 'asset' && (expectedParam.type === 'Address' || expectedParam.type === 'address')) {
                        if (paramValue === 'XLM' || paramValue === 'native') {
                            paramValue = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
                            console.log(`[Test Function] ✅ Converted ${expectedParam.name} to native XLM contract address`);
                        }
                    }
                    
                    // Convert amount to stroops if needed
                    if (expectedParam.name === 'amount' && (expectedParam.type === 'I128' || expectedParam.type === 'i128')) {
                        if (typeof paramValue === 'number' && paramValue < 1000000) {
                            paramValue = Math.floor(paramValue * 10000000).toString();
                            console.log(`[Test Function] ✅ Converted ${expectedParam.name} to stroops: ${paramValue}`);
                        } else if (typeof paramValue !== 'string') {
                            paramValue = paramValue.toString();
                        }
                    }
                    
                    orderedParams.push({
                        name: expectedParam.name,
                        type: expectedParam.type,
                        value: paramValue
                    });
                }
            });
            
            mappedParams = orderedParams;
            console.log(`[Test Function] ✅ Built ${mappedParams.length} parameters from function signature:`, 
                mappedParams.map(p => `${p.name}:${p.type}`).join(', '));
        } else if (mapping) {
            // Fallback to mapping-based approach
            // Ensure auto-populated values are in parameters before mapping
            // This ensures mapFieldsToContract can find them
            if (userPublicKey && mapping.parameters) {
                mapping.parameters.forEach(param => {
                    const paramName = param.name;
                    if ((paramName === 'signer_address' || paramName === 'signerAddress' || 
                         paramName === 'user_address' || paramName === 'userAddress') &&
                        (param.type === 'Address' || param.type === 'address')) {
                        if (!parameters[paramName] || parameters[paramName] === '') {
                            parameters[paramName] = userPublicKey;
                            console.log(`[Test Function] ✅ Pre-mapping: Auto-populated ${paramName} from user_public_key`);
                        }
                        // Also set mapped_from key if it exists
                        if (param.mapped_from && param.mapped_from !== paramName) {
                            if (!parameters[param.mapped_from] || parameters[param.mapped_from] === '') {
                                parameters[param.mapped_from] = userPublicKey;
                                console.log(`[Test Function] ✅ Pre-mapping: Auto-populated ${param.mapped_from} (mapped_from) from user_public_key`);
                            }
                        }
                    }
                });
            }
            
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
            
            // After mapping, check if any required Address parameters are still missing and auto-populate
            if (userPublicKey) {
                mappedParams.forEach((mappedParam, index) => {
                    if ((mappedParam.type === 'Address' || mappedParam.type === 'address') &&
                        (!mappedParam.value || mappedParam.value === '')) {
                        const paramName = mappedParam.name;
                        if (paramName === 'signer_address' || paramName === 'signerAddress' ||
                            paramName === 'user_address' || paramName === 'userAddress') {
                            mappedParams[index].value = userPublicKey;
                            console.log(`[Test Function] ✅ Post-mapping: Auto-populated ${paramName} from user_public_key`);
                        }
                    }
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
                    note: 'Function exists and parameters are valid, but value conversion failed',
                    parameter_details: mappedParams.map(p => ({
                        name: p.name,
                        type: p.type,
                        value: p.value,
                        is_undefined: p.value === undefined,
                        is_null: p.value === null,
                        is_empty: p.value === ''
                    }))
                });
            }
        } else {
            // No mapping configured - just validate parameter structure
            // This is okay for testing, but execution will require mapping
            mappedParams = functionParams.map(param => {
                let value = parameters[param.name];
                
                // Auto-populate signer_address if missing
                if ((param.name === 'signer_address' || param.name === 'signerAddress') && 
                    (param.type === 'Address' || param.type === 'address') && 
                    (!value || value === '')) {
                    value = userPublicKey;
                    console.log(`[Test Function] ✅ Auto-populated ${param.name} from user_public_key`);
                }
                
                // Auto-populate user_address if missing
                if ((param.name === 'user_address' || param.name === 'userAddress') && 
                    (param.type === 'Address' || param.type === 'address') && 
                    (!value || value === '')) {
                    value = userPublicKey;
                    console.log(`[Test Function] ✅ Auto-populated ${param.name} from user_public_key`);
                }
                
                return {
                    name: param.name,
                    type: param.type,
                    value: value
                };
            });
        }

        // Actually simulate the contract call using Stellar SDK
        console.log(`[Test Function] 🔄 Simulating contract call: ${function_name} on contract ${contract.contract_address}`);
        const StellarSdk = require('@stellar/stellar-sdk');
        
        // If no mapping, try basic ScVal conversion
        if (!mapping && scValParams.length === 0 && mappedParams.length > 0) {
            try {
                scValParams = mappedParams.map(param => {
                    const value = param.value;
                    
                    // Validate required parameters are not undefined/null
                    if ((value === undefined || value === null || value === '') && param.required !== false) {
                        throw new Error(`Cannot convert undefined/null value to ${param.type}. Please provide a valid value for parameter "${param.name}".`);
                    }
                    
                    if (param.type === 'Address' || param.type === 'address') {
                        if (!value || value === '') {
                            throw new Error(`Cannot convert undefined/null value to Address. Please provide a valid value for parameter "${param.name}".`);
                        }
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
                // Return proper error response instead of just logging
                console.error(`[Test Function] Parameter conversion failed: ${error.message}`, {
                    function_name,
                    contract_id: id,
                    parameters,
                    mappedParams: mappedParams.map(p => ({ name: p.name, type: p.type, value: p.value }))
                });
                return res.status(400).json({
                    error: 'Parameter conversion failed',
                    message: error.message,
                    details: 'Check that parameter values match expected types and are not undefined/null',
                    note: 'Function exists and parameters are valid, but value conversion failed',
                    parameter_details: mappedParams.map(p => ({
                        name: p.name,
                        type: p.type,
                        value: p.value,
                        is_undefined: p.value === undefined,
                        is_null: p.value === null,
                        is_empty: p.value === ''
                    }))
                });
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
        const dummyPublicKey = userPublicKey || req.user?.public_key || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
        const dummyAccount = new StellarSdk.Account(dummyPublicKey, '0');
        
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
// Public endpoint to get all active execution rules with locations (for map display)
router.get('/execution-rules/locations/public', async (req, res) => {
    try {
        const query = `
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
                cc.network,
                u.public_key as owner_public_key
            FROM contract_execution_rules cer
            LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
            JOIN users u ON cer.user_id = u.id
            WHERE cer.rule_type = 'location'
                AND cer.center_latitude IS NOT NULL 
                AND cer.center_longitude IS NOT NULL
                AND cer.is_active = true
                AND cc.is_active = true
            ORDER BY cer.created_at DESC
        `;

        const result = await pool.query(query);

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
            is_active: rule.is_active,
            owner_public_key: rule.owner_public_key
        }));

        res.json({
            success: true,
            rules: rules
        });
    } catch (error) {
        console.error('Error fetching public contract execution rules locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Authenticated endpoint to get user's execution rules with locations
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

        const result = await pool.query({
            text: query,
            values: params,
            statement_timeout: 15000 // 15 second timeout for complex queries
        });

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
