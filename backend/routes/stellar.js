const express = require('express');
const router = express.Router();
const axios = require('axios');
const stellarOperations = require('../services/stellarOperations');
const { authenticateUser } = require('../middleware/authUser');

const STELLAR_ATLAS_BASE_URL = 'https://api.stellaratlas.io';
const STELLAR_HORIZON_BASE_URL = 'https://horizon.stellar.org';

/**
 * @swagger
 * /api/stellar/health:
 *   get:
 *     summary: Health check for Stellar proxy
 *     tags: [Stellar Network]
 *     responses:
 *       200:
 *         description: Proxy is working
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Stellar proxy is working',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/stellar/validators:
 *   get:
 *     summary: Get Stellar network validators/nodes
 *     description: Proxy endpoint to fetch Stellar validators from Stellar Atlas API
 *     tags: [Stellar Network]
 *     responses:
 *       200:
 *         description: List of Stellar validators
 *       500:
 *         description: Error fetching validators
 */
router.get('/validators', async (req, res) => {
  console.log('[Stellar Proxy] Request received for /validators');
  
  try {
    const endpoint = `${STELLAR_ATLAS_BASE_URL}/v1/node`;
    console.log(`[Stellar Proxy] Proxying request to: ${endpoint}`);
    
    const response = await axios.get(endpoint, {
      timeout: 20000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stellar-GeoLink/1.0'
      },
      validateStatus: function (status) {
        return status < 600; // Accept all status codes, handle manually
      }
    });
    
    console.log(`[Stellar Proxy] Response status: ${response.status}`);
    
    if (response.status >= 400) {
      console.error(`[Stellar Proxy] API returned error status: ${response.status}`);
      
      // Check if it's a Cloudflare error
      const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (responseText.includes('Cloudflare Tunnel error') || responseText.includes('Error 1033')) {
        console.error('[Stellar Proxy] Cloudflare Tunnel error detected - Stellar Atlas API is unavailable');
        return res.status(503).json({
          error: 'Stellar Atlas API is temporarily unavailable',
          message: 'The Stellar Atlas API is currently experiencing issues (Cloudflare Tunnel error). Please try again later.',
          status: 503,
          code: 'CLOUDFLARE_TUNNEL_ERROR'
        });
      }
      
      return res.status(response.status).json({
        error: 'Stellar Atlas API error',
        status: response.status,
        data: typeof response.data === 'string' ? 'HTML error page received' : response.data
      });
    }
    
    const dataLength = Array.isArray(response.data) ? response.data.length : (response.data ? 'object' : 'empty');
    console.log(`[Stellar Proxy] Successfully fetched ${dataLength} items from Stellar Atlas`);
    res.json(response.data);
  } catch (error) {
    console.error('[Stellar Proxy] Error fetching Stellar validators:', {
      message: error.message,
      code: error.code,
      name: error.name,
      response: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    
    // Handle different types of errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return res.status(503).json({
        error: 'Stellar Atlas API is unavailable',
        message: 'Unable to connect to Stellar Atlas API. The service may be down or unreachable.',
        code: error.code
      });
    }
    
    if (error.response) {
      const status = error.response.status || 500;
      return res.status(status).json({
        error: 'Failed to fetch Stellar validators',
        message: error.message,
        status: status,
        data: error.response.data
      });
    }
    
    // Handle axios errors
    if (error.isAxiosError) {
      return res.status(503).json({
        error: 'Network error',
        message: error.message || 'Failed to connect to Stellar Atlas API',
        code: error.code || 'AXIOS_ERROR'
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch Stellar validators',
      message: error.message || 'Unknown error occurred',
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/stellar/network-info:
 *   get:
 *     summary: Get Stellar network information
 *     description: Proxy endpoint to fetch network information from Stellar Horizon API
 *     tags: [Stellar Network]
 *     responses:
 *       200:
 *         description: Network information
 *       500:
 *         description: Error fetching network info
 */
router.get('/network-info', async (req, res) => {
  try {
    const endpoint = `${STELLAR_HORIZON_BASE_URL}/`;
    console.log(`Proxying request to: ${endpoint}`);
    
    const response = await axios.get(endpoint, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stellar-GeoLink/1.0'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching network info:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch network information',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/stellar/ledger:
 *   get:
 *     summary: Get latest ledger information
 *     description: Proxy endpoint to fetch latest ledger from Stellar Horizon API
 *     tags: [Stellar Network]
 *     responses:
 *       200:
 *         description: Ledger information
 *       500:
 *         description: Error fetching ledger info
 */
router.get('/ledger', async (req, res) => {
  try {
    const endpoint = `${STELLAR_HORIZON_BASE_URL}/ledgers?order=desc&limit=1`;
    console.log(`Proxying request to: ${endpoint}`);
    
    const response = await axios.get(endpoint, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stellar-GeoLink/1.0'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching ledger info:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch ledger information',
      message: error.message
    });
  }
});

// ============================================
// Stellar Operations Endpoints (for AI tools)
// ============================================

/**
 * @swagger
 * /api/stellar/create-account:
 *   post:
 *     summary: Create a new Stellar account
 *     description: Creates a new Stellar account and funds it on testnet
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Account created successfully
 */
// Create account endpoint - optionally authenticated (allows public access for registration)
router.post('/create-account', async (req, res) => {
  console.log('[Stellar Routes] 🚀 Create account request received');
  try {
    console.log('[Stellar Routes] 📞 Calling stellarOperations.createAccount()...');
    const result = await stellarOperations.createAccount();
    console.log(`[Stellar Routes] ✅ Account created successfully - Public Key: ${result.publicKey}`);
    res.json(result);
  } catch (error) {
    console.error('[Stellar Routes] ❌ Error creating account:', error);
    console.error('[Stellar Routes] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/issue-asset:
 *   post:
 *     summary: Issue a new asset on Stellar
 *     description: Issues a new asset on the Stellar network
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issuerSecret
 *               - assetCode
 *             properties:
 *               issuerSecret:
 *                 type: string
 *               assetCode:
 *                 type: string
 */
router.post('/issue-asset', authenticateUser, async (req, res) => {
  console.log('[Stellar Routes] 💎 Issue asset request received');
  try {
    const { issuerSecret, assetCode } = req.body;
    console.log(`[Stellar Routes] 📋 Issue asset params - Asset Code: ${assetCode}, Issuer: ${issuerSecret ? issuerSecret.substring(0, 8) + '...' : 'N/A'}`);
    console.log('[Stellar Routes] 📞 Calling stellarOperations.issueAsset()...');
    const result = await stellarOperations.issueAsset(issuerSecret, assetCode);
    console.log(`[Stellar Routes] ✅ Asset issued successfully - Asset Code: ${assetCode}`);
    res.json(result);
  } catch (error) {
    console.error('[Stellar Routes] ❌ Error issuing asset:', error);
    console.error('[Stellar Routes] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/create-trustline:
 *   post:
 *     summary: Create a trustline for an asset
 *     description: Allows an account to hold a specific asset
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountSecret
 *               - assetCode
 *               - issuerPublicKey
 *             properties:
 *               accountSecret:
 *                 type: string
 *               assetCode:
 *                 type: string
 *               issuerPublicKey:
 *                 type: string
 *               limit:
 *                 type: string
 */
router.post('/create-trustline', authenticateUser, async (req, res) => {
  console.log('[Stellar Routes] 🔗 Create trustline request received');
  try {
    const { accountSecret, assetCode, issuerPublicKey, limit } = req.body;
    console.log(`[Stellar Routes] 📋 Trustline params - Asset: ${assetCode}, Issuer: ${issuerPublicKey}, Limit: ${limit || 'unlimited'}`);
    console.log('[Stellar Routes] 📞 Calling stellarOperations.createTrustline()...');
    const result = await stellarOperations.createTrustline(accountSecret, assetCode, issuerPublicKey, limit);
    console.log(`[Stellar Routes] ✅ Trustline created successfully - Asset: ${assetCode}`);
    res.json(result);
  } catch (error) {
    console.error('[Stellar Routes] ❌ Error creating trustline:', error);
    console.error('[Stellar Routes] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/transfer-asset:
 *   post:
 *     summary: Transfer an asset between accounts
 *     description: Transfers an asset from one account to another
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senderSecret
 *               - recipientPublicKey
 *               - assetCode
 *               - issuerPublicKey
 *               - amount
 *             properties:
 *               senderSecret:
 *                 type: string
 *               recipientPublicKey:
 *                 type: string
 *               assetCode:
 *                 type: string
 *               issuerPublicKey:
 *                 type: string
 *               amount:
 *                 type: string
 */
router.post('/transfer-asset', authenticateUser, async (req, res) => {
  console.log('[Stellar Routes] 💸 Transfer asset request received');
  try {
    const { senderSecret, recipientPublicKey, assetCode, issuerPublicKey, amount } = req.body;
    console.log(`[Stellar Routes] 📋 Transfer params - To: ${recipientPublicKey}, Asset: ${assetCode}, Amount: ${amount}`);
    console.log('[Stellar Routes] 📞 Calling stellarOperations.transferAsset()...');
    const result = await stellarOperations.transferAsset(senderSecret, recipientPublicKey, assetCode, issuerPublicKey, amount);
    console.log(`[Stellar Routes] ✅ Asset transfer successful - Transaction Hash: ${result.transactionHash}`);
    res.json(result);
  } catch (error) {
    console.error('[Stellar Routes] ❌ Error transferring asset:', error);
    console.error('[Stellar Routes] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/show-balance:
 *   post:
 *     summary: Show balance of a Stellar account
 *     description: Returns all balances for a Stellar account
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *             properties:
 *               publicKey:
 *                 type: string
 */
router.post('/show-balance', authenticateUser, async (req, res) => {
  try {
    const { publicKey } = req.body;
    const result = await stellarOperations.showBalance(publicKey);
    res.json(result);
  } catch (error) {
    console.error('Error showing balance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/show-trustlines:
 *   post:
 *     summary: Show all trustlines for an account
 *     description: Returns all trustlines (non-native assets) for an account
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *             properties:
 *               publicKey:
 *                 type: string
 */
router.post('/show-trustlines', authenticateUser, async (req, res) => {
  try {
    const { publicKey } = req.body;
    const result = await stellarOperations.showTrustlines(publicKey);
    res.json(result);
  } catch (error) {
    console.error('Error showing trustlines:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/show-issued-assets:
 *   post:
 *     summary: Show assets issued by an account
 *     description: Returns all assets where the specified account is the issuer
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issuerPublicKey
 *             properties:
 *               issuerPublicKey:
 *                 type: string
 */
router.post('/show-issued-assets', authenticateUser, async (req, res) => {
  try {
    const { issuerPublicKey } = req.body;
    const result = await stellarOperations.showIssuedAssets(issuerPublicKey);
    res.json(result);
  } catch (error) {
    console.error('Error showing issued assets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/setup-asset:
 *   post:
 *     summary: Setup an asset for issuance
 *     description: Creates and issues an asset on Stellar
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issuerSecret
 *               - assetCode
 *             properties:
 *               issuerSecret:
 *                 type: string
 *               assetCode:
 *                 type: string
 */
router.post('/setup-asset', authenticateUser, async (req, res) => {
  try {
    const { issuerSecret, assetCode } = req.body;
    const result = await stellarOperations.setupAsset(issuerSecret, assetCode);
    res.json(result);
  } catch (error) {
    console.error('Error setting up asset:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/test-asset-creation:
 *   post:
 *     summary: Test asset creation
 *     description: Tests basic asset creation functionality
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issuerSecret
 *               - assetCode
 *             properties:
 *               issuerSecret:
 *                 type: string
 *               assetCode:
 *                 type: string
 */
router.post('/test-asset-creation', authenticateUser, async (req, res) => {
  try {
    const { issuerSecret, assetCode } = req.body;
    const result = await stellarOperations.testAssetCreation(issuerSecret, assetCode);
    res.json(result);
  } catch (error) {
    console.error('Error testing asset creation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/call-contract-method:
 *   post:
 *     summary: Call a Soroban smart contract method
 *     description: Executes a method on a Soroban smart contract
 *     tags: [Stellar Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contractId
 *               - method
 *               - secret
 *             properties:
 *               contractId:
 *                 type: string
 *               method:
 *                 type: string
 *               secret:
 *                 type: string
 *               parameters:
 *                 type: array
 */
router.post('/call-contract-method', authenticateUser, async (req, res) => {
  console.log('[Stellar Routes] 📞 Call contract method request received');
  try {
    const { contractId, method, secret, parameters = [] } = req.body;
    console.log(`[Stellar Routes] 📋 Contract call params - Contract: ${contractId}, Method: ${method}, Parameters: ${parameters.length}`);
    console.log('[Stellar Routes] 📞 Calling stellarOperations.callContractMethod()...');
    const result = await stellarOperations.callContractMethod(contractId, method, secret, parameters);
    console.log(`[Stellar Routes] ✅ Contract method call successful`);
    res.json(result);
  } catch (error) {
    console.error('[Stellar Routes] ❌ Error calling contract method:', error);
    console.error('[Stellar Routes] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/stellar/xlm-price:
 *   get:
 *     summary: Get XLM price from CoinGecko
 *     description: Proxy endpoint to fetch XLM (Stellar) price from CoinGecko API to avoid CORS issues
 *     tags: [Stellar Network]
 *     responses:
 *       200:
 *         description: XLM price data
 *       500:
 *         description: Error fetching price
 */
router.get('/xlm-price', async (req, res) => {
  try {
    console.log('[Stellar Proxy] Fetching XLM price from CoinGecko...');
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'stellar',
        vs_currencies: 'usd',
        include_24hr_change: true
      },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stellar-GeoLink/1.0'
      }
    });
    
    console.log('[Stellar Proxy] Successfully fetched XLM price:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('[Stellar Proxy] Error fetching XLM price from CoinGecko:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      stack: error.stack
    });
    
    // Return more detailed error information
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({ 
      error: 'Failed to fetch XLM price',
      message: error.message,
      details: error.response?.data || error.code
    });
  }
});

module.exports = router;

