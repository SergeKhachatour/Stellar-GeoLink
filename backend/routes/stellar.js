const express = require('express');
const router = express.Router();
const axios = require('axios');

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

module.exports = router;

