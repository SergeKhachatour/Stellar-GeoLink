const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * @swagger
 * /api/zk-proof/store:
 *   post:
 *     summary: Store a ZK proof for verification
 *     description: Stores a ZK proof temporarily with 5-minute expiration
 *     tags: [ZK Proof]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proofHash
 *               - publicKey
 *               - challenge
 *               - timestamp
 *               - nonce
 *             properties:
 *               proofHash:
 *                 type: string
 *                 description: Unique hash identifier for the proof
 *               publicKey:
 *                 type: string
 *                 description: User's Stellar public key
 *               challenge:
 *                 type: string
 *                 description: Cryptographic challenge
 *               timestamp:
 *                 type: integer
 *                 description: Unix timestamp when proof was created
 *               nonce:
 *                 type: string
 *                 description: Random nonce value
 *     responses:
 *       200:
 *         description: ZK proof stored successfully
 *       400:
 *         description: Invalid proof data
 *       500:
 *         description: Internal server error
 */
router.post('/store', async (req, res) => {
  try {
    const { proofHash, publicKey, challenge, timestamp, nonce } = req.body;

    // Validate required fields
    if (!proofHash || !publicKey || !challenge || !timestamp || !nonce) {
      console.log(`❌ [ZK Proof] Store failed - missing required fields`);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: proofHash, publicKey, challenge, timestamp, nonce'
      });
    }

    // Validate proofHash format (should be a hex string)
    if (typeof proofHash !== 'string' || proofHash.length < 32) {
      return res.status(400).json({
        success: false,
        error: 'Invalid proofHash format'
      });
    }

    // Validate publicKey format (Stellar public keys start with 'G')
    if (typeof publicKey !== 'string' || !publicKey.startsWith('G')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid publicKey format (must be a Stellar public key)'
      });
    }

    // Validate timestamp (should be a valid Unix timestamp)
    const timestampNum = parseInt(timestamp);
    if (isNaN(timestampNum) || timestampNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timestamp format'
      });
    }

    // Calculate expiration (5 minutes from timestamp)
    const expiresAt = new Date(timestampNum + 5 * 60 * 1000);

    console.log('[ZK Proof] 📥 Store request:', {
      proofHash: proofHash.substring(0, 16) + '...',
      publicKey,
      expiresAt: expiresAt.toISOString()
    });

    // Store proof in database
    const result = await pool.query(
      `INSERT INTO zk_proofs (proof_hash, public_key, challenge, nonce, timestamp, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (proof_hash) 
       DO UPDATE SET 
         public_key = EXCLUDED.public_key,
         challenge = EXCLUDED.challenge,
         nonce = EXCLUDED.nonce,
         timestamp = EXCLUDED.timestamp,
         expires_at = EXCLUDED.expires_at,
         created_at = CURRENT_TIMESTAMP
       RETURNING proof_hash`,
      [proofHash, publicKey, challenge, nonce, timestampNum, expiresAt]
    );

    console.log(`✅ [ZK Proof] Stored successfully: ${proofHash.substring(0, 16)}... | Public Key: ${publicKey} | Expires: ${expiresAt.toISOString()}`);

    res.json({
      success: true,
      message: 'ZK proof stored successfully',
      expiresAt: expiresAt.getTime()
    });
  } catch (error) {
    console.error('❌ Error storing ZK proof:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    res.status(500).json({
      success: false,
      error: 'Failed to store ZK proof',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/zk-proof/verify:
 *   post:
 *     summary: Verify and retrieve a ZK proof
 *     description: Verifies a ZK proof and deletes it after successful verification (one-time use)
 *     tags: [ZK Proof]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proofHash
 *               - challenge
 *               - nonce
 *               - transactionData
 *             properties:
 *               proofHash:
 *                 type: string
 *               challenge:
 *                 type: string
 *               nonce:
 *                 type: string
 *               transactionData:
 *                 type: string
 *                 description: JSON string containing transaction data
 *     responses:
 *       200:
 *         description: Verification result
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Internal server error
 */
router.post('/verify', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { proofHash, challenge, nonce, transactionData } = req.body;
    
    console.log(`[ZK Proof] 🔍 Verify request: ${proofHash ? proofHash.substring(0, 16) + '...' : 'missing hash'}`);

    // Validate required fields
    if (!proofHash || !challenge || !nonce || !transactionData) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Missing required fields: proofHash, challenge, nonce, transactionData',
        errorCode: 'MISSING_FIELDS'
      });
    }

    // Parse transaction data
    let transaction;
    try {
      transaction = typeof transactionData === 'string' 
        ? JSON.parse(transactionData) 
        : transactionData;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid transactionData format (must be valid JSON)',
        errorCode: 'INVALID_TRANSACTION_DATA'
      });
    }

    // Retrieve proof from database
    const proofResult = await client.query(
      'SELECT * FROM zk_proofs WHERE proof_hash = $1',
      [proofHash]
    );

    if (proofResult.rows.length === 0) {
      await client.query('COMMIT');
      console.log(`❌ [ZK Proof] Verification failed - not found: ${proofHash.substring(0, 16)}...`);
      return res.json({
        success: false,
        verified: false,
        error: 'ZK proof not found',
        errorCode: 'PROOF_NOT_FOUND'
      });
    }

    const proof = proofResult.rows[0];

    // Check if proof has expired
    const now = new Date();
    const expiresAt = new Date(proof.expires_at);
    if (now > expiresAt) {
      // Delete expired proof
      await client.query('DELETE FROM zk_proofs WHERE proof_hash = $1', [proofHash]);
      await client.query('COMMIT');
      console.log(`⏰ [ZK Proof] Verification failed - expired: ${proofHash.substring(0, 16)}... | Expired at: ${expiresAt.toISOString()}`);
      return res.json({
        success: false,
        verified: false,
        error: 'ZK proof expired',
        errorCode: 'PROOF_EXPIRED'
      });
    }

    // Verify challenge matches
    if (proof.challenge !== challenge) {
      await client.query('COMMIT');
      console.log(`❌ [ZK Proof] Verification failed - challenge mismatch: ${proofHash.substring(0, 16)}...`);
      return res.json({
        success: false,
        verified: false,
        error: 'Challenge mismatch',
        errorCode: 'CHALLENGE_MISMATCH'
      });
    }

    // Verify nonce matches
    if (proof.nonce !== nonce) {
      await client.query('COMMIT');
      console.log(`❌ [ZK Proof] Verification failed - nonce mismatch: ${proofHash.substring(0, 16)}...`);
      return res.json({
        success: false,
        verified: false,
        error: 'Nonce mismatch',
        errorCode: 'NONCE_MISMATCH'
      });
    }

    // Verify public key matches transaction source
    if (proof.public_key !== transaction.source) {
      await client.query('COMMIT');
      console.log(`❌ [ZK Proof] Verification failed - public key mismatch: ${proofHash.substring(0, 16)}... | Expected: ${proof.public_key}, Got: ${transaction.source}`);
      return res.json({
        success: false,
        verified: false,
        error: 'Public key mismatch',
        errorCode: 'PUBLIC_KEY_MISMATCH'
      });
    }

    // All verifications passed - delete proof (one-time use)
    await client.query('DELETE FROM zk_proofs WHERE proof_hash = $1', [proofHash]);
    await client.query('COMMIT');

    console.log(`✅ [ZK Proof] Verified and deleted: ${proofHash.substring(0, 16)}... | Public Key: ${proof.public_key} | Transaction: ${transaction.source} → ${transaction.destination}`);

    res.json({
      success: true,
      verified: true,
      message: 'ZK proof verified successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error verifying ZK proof:', error);
    res.status(500).json({
      success: false,
      verified: false,
      error: 'Failed to verify ZK proof',
      details: error.message,
      errorCode: 'VERIFICATION_ERROR'
    });
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/zk-proof/status/{proofHash}:
 *   get:
 *     summary: Get ZK proof status
 *     description: Check if a proof exists and its expiration status (without returning proof data)
 *     tags: [ZK Proof]
 *     parameters:
 *       - in: path
 *         name: proofHash
 *         required: true
 *         schema:
 *           type: string
 *         description: The proof hash to check
 *     responses:
 *       200:
 *         description: Proof status
 *       400:
 *         description: Invalid proof hash
 */
router.get('/status/:proofHash', async (req, res) => {
  try {
    const { proofHash } = req.params;

    if (!proofHash) {
      return res.status(400).json({
        success: false,
        error: 'Proof hash is required'
      });
    }

    const result = await pool.query(
      'SELECT expires_at FROM zk_proofs WHERE proof_hash = $1',
      [proofHash]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        exists: false,
        isExpired: false
      });
    }

    const expiresAt = new Date(result.rows[0].expires_at);
    const now = new Date();
    const isExpired = now > expiresAt;

    res.json({
      success: true,
      exists: true,
      expiresAt: expiresAt.getTime(),
      isExpired
    });
  } catch (error) {
    console.error('Error checking ZK proof status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check proof status',
      details: error.message
    });
  }
});

/**
 * Cleanup expired proofs
 * This function should be called periodically (every 1-5 minutes)
 */
async function cleanupExpiredProofs() {
  try {
    const result = await pool.query(
      'DELETE FROM zk_proofs WHERE expires_at < CURRENT_TIMESTAMP RETURNING proof_hash'
    );
    
    if (result.rows.length > 0) {
      console.log(`🧹 [ZK Proof] Cleaned up ${result.rows.length} expired proof(s)`);
    }
  } catch (error) {
    console.error('❌ [ZK Proof] Error cleaning up expired proofs:', error);
  }
}

// Run cleanup on startup
cleanupExpiredProofs();

// Run cleanup every 2 minutes
setInterval(cleanupExpiredProofs, 2 * 60 * 1000);

module.exports = router;

