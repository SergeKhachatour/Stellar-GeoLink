/**
 * WebAuthn/Passkey Routes
 * Handles passkey registration and authentication for smart wallet contracts
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const contracts = require('../config/contracts');
const { extractPublicKeyFromSPKI, generateRPIdHash } = require('../utils/webauthnUtils');

/**
 * POST /api/webauthn/register
 * Register a passkey on the smart wallet contract
 * Body: { passkeyPublicKeySPKI, credentialId }
 */
router.post('/register', authenticateUser, async (req, res) => {
  try {
    const { passkeyPublicKeySPKI, credentialId } = req.body;
    const userPublicKey = req.user.public_key;
    const userSecretKey = req.body.secretKey; // Temporary, should be from secure storage

    if (!passkeyPublicKeySPKI || !credentialId) {
      return res.status(400).json({ 
        error: 'passkeyPublicKeySPKI and credentialId are required' 
      });
    }

    if (!userPublicKey) {
      return res.status(400).json({ 
        error: 'User must have a public key registered' 
      });
    }

    if (!userSecretKey) {
      return res.status(400).json({ 
        error: 'Secret key is required for registration' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    
    // Use rpc.Server (correct for SDK v14+)
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);

    // Extract 65-byte public key from SPKI
    const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
    const passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);

    // Generate RP ID hash
    const rpId = req.body.rpId || req.headers.host || 'localhost'; // Use request hostname or provided rpId
    const rpIdHash = generateRPIdHash(rpId);

    // Create ScVals
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    const passkeyPubkeyScVal = StellarSdk.xdr.ScVal.scvBytes(passkeyPubkey65);
    const rpIdHashScVal = StellarSdk.xdr.ScVal.scvBytes(rpIdHash);

    // Call register_signer
    const registerOp = contract.call(
      'register_signer',
      userScVal,
      passkeyPubkeyScVal,
      rpIdHashScVal
    );

    // Build transaction - need to use Horizon server for account loading
    const horizonServer = new StellarSdk.Horizon.Server(
      contracts.STELLAR_NETWORK === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );
    const account = await horizonServer.loadAccount(userPublicKey);
    const transaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(registerOp)
      .setTimeout(30)
      .build();

    // Prepare and sign
    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);

    // Send transaction
    const sendResult = await sorobanServer.sendTransaction(preparedTx);

    // Poll for result
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      if (txResult.status === 'SUCCESS') {
        break;
      } else if (txResult.status === 'FAILED') {
        throw new Error('Registration transaction failed');
      }
    }

    if (!txResult || txResult.status !== 'SUCCESS') {
      throw new Error('Registration timeout');
    }

    // Store passkey info in database
    await pool.query(
      `INSERT INTO user_passkeys (user_id, credential_id, public_key_spki, registered_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, credential_id) 
       DO UPDATE SET public_key_spki = $3, registered_at = NOW()`,
      [req.user.id, credentialId, passkeyPublicKeySPKI]
    );

    res.json({ 
      success: true, 
      message: 'Passkey registered successfully',
      transactionHash: sendResult.hash
    });

  } catch (error) {
    console.error('Error registering passkey:', error);
    res.status(500).json({ 
      error: 'Failed to register passkey', 
      details: error.message 
    });
  }
});

/**
 * GET /api/webauthn/passkeys
 * Get user's registered passkeys
 */
router.get('/passkeys', authenticateUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT credential_id, public_key_spki, registered_at 
       FROM user_passkeys 
       WHERE user_id = $1 
       ORDER BY registered_at DESC`,
      [req.user.id]
    );

    res.json({ 
      passkeys: result.rows.map(row => ({
        credentialId: row.credential_id,
        publicKey: row.public_key_spki, // Include public key for payment operations
        registeredAt: row.registered_at
      }))
    });
  } catch (error) {
    console.error('Error fetching passkeys:', error);
    res.status(500).json({ 
      error: 'Failed to fetch passkeys', 
      details: error.message 
    });
  }
});

/**
 * DELETE /api/webauthn/passkeys/:credentialId
 * Remove a registered passkey
 */
router.delete('/passkeys/:credentialId', authenticateUser, async (req, res) => {
  try {
    const { credentialId } = req.params;
    
    await pool.query(
      `DELETE FROM user_passkeys 
       WHERE user_id = $1 AND credential_id = $2`,
      [req.user.id, credentialId]
    );

    res.json({ 
      success: true, 
      message: 'Passkey removed successfully' 
    });
  } catch (error) {
    console.error('Error removing passkey:', error);
    res.status(500).json({ 
      error: 'Failed to remove passkey', 
      details: error.message 
    });
  }
});

// Utility functions are now imported from ../utils/webauthnUtils.js

module.exports = router;

