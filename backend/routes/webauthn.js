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
 * Body: { passkeyPublicKeySPKI, credentialId, userPublicKey?, secretKey }
 * 
 * Authentication: Optional - if userPublicKey and secretKey are provided, 
 * authentication is not required (for wallet creation flow)
 */
router.post('/register', (req, res, next) => {
  // First, try to authenticate (this sets req.user to null if no token)
  authenticateUser(req, res, () => {
    // After authentication attempt, check if we have wallet data for unauthenticated registration
    const hasAuth = req.user && req.user.public_key;
    const hasWalletData = req.body.userPublicKey && req.body.secretKey;
    
    // If authenticated, continue
    if (hasAuth) {
      return next();
    }
    
    // If not authenticated but has wallet data, allow it (for wallet creation)
    if (hasWalletData) {
      return next();
    }
    
    // Otherwise, require authentication
    return res.status(401).json({ 
      error: 'Authentication required or provide userPublicKey and secretKey for wallet creation' 
    });
  });
}, async (req, res) => {
  try {
    const { passkeyPublicKeySPKI, credentialId, userPublicKey: providedPublicKey, secretKey: providedSecretKey } = req.body;
    
    // Determine user public key and secret key
    // Priority: provided values (for wallet creation) > authenticated user
    const userPublicKey = providedPublicKey || req.user?.public_key;
    const userSecretKey = providedSecretKey || req.body.secretKey;

    if (!passkeyPublicKeySPKI || !credentialId) {
      return res.status(400).json({ 
        error: 'passkeyPublicKeySPKI and credentialId are required' 
      });
    }

    if (!userPublicKey) {
      return res.status(400).json({ 
        error: 'User public key is required (provide userPublicKey in body or be authenticated)' 
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

    // Build transaction - need to use Horizon server for account loading
    const horizonUrl = contracts.STELLAR_NETWORK === 'testnet'
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org';
    console.log(`[WebAuthn] 🔍 Connecting to Horizon: ${horizonUrl}`);
    const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    
    // Try to load account, with retry logic for newly created accounts
    // Friendbot can take 10-30 seconds to fund accounts, so we wait longer and retry more
    console.log(`[WebAuthn] 🔍 Loading account ${userPublicKey} for passkey registration...`);
    let account;
    let retries = 20; // Increased to 20 retries (up to 60+ seconds total)
    let accountLoaded = false;
    
    // Initial wait before starting retries (account might have been just created)
    console.log(`[WebAuthn] ⏳ Waiting 5 seconds before first attempt (account may have just been created)...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    while (retries > 0 && !accountLoaded) {
      try {
        account = await horizonServer.loadAccount(userPublicKey);
        accountLoaded = true;
        console.log(`[WebAuthn] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
        
        // Verify account has a balance (actually funded)
        const nativeBalance = account.balances.find(b => b.asset_type === 'native');
        if (nativeBalance) {
          console.log(`[WebAuthn] 💰 Account balance confirmed: ${nativeBalance.balance} XLM`);
        } else {
          console.warn(`[WebAuthn] ⚠️ Account exists but has no native balance yet`);
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          // Account doesn't exist yet, wait and retry
          retries--;
          if (retries > 0) {
            // Progressive wait times: longer waits for first retries, shorter for later ones
            const waitTime = retries > 15 ? 4000 : retries > 10 ? 3000 : 2000;
            console.log(`[WebAuthn] ⏳ Account ${userPublicKey} not found yet, retrying in ${waitTime/1000} seconds... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.error(`[WebAuthn] ❌ Account ${userPublicKey} not found after all retries (waited ~60+ seconds)`);
            throw new Error('Account not found on network after extended wait. Friendbot may be experiencing delays. Please try registering the passkey again in a few moments.');
          }
        } else {
          console.error(`[WebAuthn] ❌ Error loading account: ${err.message}`);
          throw err;
        }
      }
    }

    // Check if a passkey is already registered on the contract for this public_key
    // If multiple roles share the same public_key, we should reuse the same passkey
    console.log('[WebAuthn] 🔍 Checking if passkey already registered on contract...');
    let passkeyAlreadyRegistered = false;
    try {
      const getPasskeyOp = contract.call('get_passkey_pubkey', userScVal);
      const checkTx = new StellarSdk.TransactionBuilder(
        new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
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
          const newPasskeyHex = passkeyPubkey65.toString('hex');
          
          console.log(`[WebAuthn] 📋 Registered passkey on contract: ${registeredPubkeyHex.substring(0, 32)}...`);
          console.log(`[WebAuthn] 📋 New passkey to register: ${newPasskeyHex.substring(0, 32)}...`);
          
          if (registeredPubkeyHex === newPasskeyHex) {
            console.log('[WebAuthn] ✅ Same passkey already registered on contract - skipping contract registration');
            console.log('[WebAuthn] ℹ️ Will still store passkey in database for this role');
            passkeyAlreadyRegistered = true;
          } else {
            console.log('[WebAuthn] ⚠️ Different passkey registered on contract - will overwrite with new one');
            console.log('[WebAuthn] ⚠️ Note: Contract stores only ONE passkey per public_key. Registering a new one will overwrite the existing one.');
          }
        }
      }
    } catch (checkError) {
      console.log('[WebAuthn] ⚠️ Could not check existing passkey, proceeding with registration:', checkError.message);
    }

    // Only register on contract if not already registered
    let sendResult = null;
    let txResult = null;
    if (!passkeyAlreadyRegistered) {
      // Call register_signer
      console.log('[WebAuthn] 🔨 Building register_signer contract call...');
      const registerOp = contract.call(
        'register_signer',
        userScVal,
        passkeyPubkeyScVal,
        rpIdHashScVal
      );
      console.log('[WebAuthn] ✅ Contract call built');
      
      console.log('[WebAuthn] 🔨 Building transaction...');
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
      console.log('[WebAuthn] ✅ Transaction built');

      // Prepare and sign
      console.log('[WebAuthn] 🔄 Preparing transaction...');
      const preparedTx = await sorobanServer.prepareTransaction(transaction);
      console.log('[WebAuthn] ✅ Transaction prepared');
      
      console.log('[WebAuthn] ✍️ Signing transaction...');
      const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
      preparedTx.sign(keypair);
      console.log('[WebAuthn] ✅ Transaction signed');

      // Send transaction
      console.log('[WebAuthn] 📤 Sending transaction to network...');
      sendResult = await sorobanServer.sendTransaction(preparedTx);
      console.log(`[WebAuthn] ✅ Transaction sent - Hash: ${sendResult.hash}`);

      // Poll for result
      console.log('[WebAuthn] ⏳ Polling for transaction result...');
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        txResult = await sorobanServer.getTransaction(sendResult.hash);
        console.log(`[WebAuthn] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
        if (txResult.status === 'SUCCESS') {
          console.log(`[WebAuthn] ✅ Passkey registration successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
          break;
        } else if (txResult.status === 'FAILED') {
          console.error(`[WebAuthn] ❌ Registration transaction failed - Result: ${txResult.resultXdr || txResult.errorResultXdr}`);
          throw new Error('Registration transaction failed');
        }
      }

      if (!txResult || txResult.status !== 'SUCCESS') {
        console.error('[WebAuthn] ❌ Registration timeout - transaction did not complete within 20 seconds');
        throw new Error('Registration timeout');
      }
    } else {
      console.log('[WebAuthn] ℹ️ Passkey already registered on contract - skipping contract registration');
      console.log('[WebAuthn] ℹ️ This passkey will be stored in database for this role to enable reuse across roles');
    }

    // Store passkey info in database
    // Try multiple methods to find the user ID
    let userIdToStore = null;
    
    // Method 1: Use authenticated user ID if available
    if (req.user && req.user.id) {
      userIdToStore = req.user.id;
      console.log('[WebAuthn] ✅ Using authenticated user ID:', userIdToStore);
    } else if (userPublicKey) {
      // Method 2: Find user by public_key
      try {
        const userResult = await pool.query(
          'SELECT id FROM users WHERE public_key = $1',
          [userPublicKey]
        );
        if (userResult.rows.length > 0) {
          userIdToStore = userResult.rows[0].id;
          console.log('[WebAuthn] ✅ Found user ID by public_key:', userIdToStore);
        } else {
          console.warn('[WebAuthn] ⚠️ User not found by public_key:', userPublicKey);
        }
      } catch (dbError) {
        console.warn('[WebAuthn] ⚠️ Error finding user by public_key:', dbError.message);
      }
    }
    
    // Store passkey in database if we found a user ID
    if (userIdToStore) {
      try {
        // Get existing passkey count for default name (only if inserting new, not updating)
        const existingResult = await pool.query(
          `SELECT credential_id FROM user_passkeys WHERE user_id = $1 AND credential_id = $2`,
          [userIdToStore, credentialId]
        );
        
        let defaultName = null;
        if (existingResult.rows.length === 0) {
          // New passkey - generate default name
          const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM user_passkeys WHERE user_id = $1`,
            [userIdToStore]
          );
          const passkeyCount = parseInt(countResult.rows[0]?.count || '0');
          defaultName = `Passkey ${passkeyCount + 1}`;
        }
        
        if (defaultName) {
          // Insert with name
          await pool.query(
            `INSERT INTO user_passkeys (user_id, credential_id, public_key_spki, name, registered_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, credential_id) 
             DO UPDATE SET public_key_spki = $3, registered_at = NOW()`,
            [userIdToStore, credentialId, passkeyPublicKeySPKI, defaultName]
          );
        } else {
          // Update existing - keep existing name
          await pool.query(
            `INSERT INTO user_passkeys (user_id, credential_id, public_key_spki, registered_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, credential_id) 
             DO UPDATE SET public_key_spki = $3, registered_at = NOW()`,
            [userIdToStore, credentialId, passkeyPublicKeySPKI]
          );
        }
        console.log('[WebAuthn] ✅ Passkey stored in database for user ID:', userIdToStore);
      } catch (dbError) {
        // If database insert fails, that's okay - passkey is still registered on contract
        console.warn('[WebAuthn] ⚠️ Failed to store passkey in database (passkey still registered on contract):', dbError.message);
      }
    } else {
      console.warn('[WebAuthn] ⚠️ Could not determine user ID for passkey storage. Passkey registered on contract but not in database.');
    }

    res.json({ 
      success: true, 
      message: passkeyAlreadyRegistered 
        ? 'Passkey already registered on contract. Stored in database for this role.'
        : 'Passkey registered successfully',
      transactionHash: sendResult?.hash || null,
      alreadyRegistered: passkeyAlreadyRegistered
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
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to view your passkeys'
      });
    }

    // IMPORTANT: Passkeys are stored by user_id in database, but by public_key on contract
    // If multiple roles share the same public_key, we need to get passkeys for ALL users with that public_key
    // Then check which one is actually registered on the contract
    const userPublicKey = req.user?.public_key;
    
    let result;
    if (userPublicKey) {
      // Get passkeys for all users with this public_key (in case of multiple roles)
      result = await pool.query(
        `SELECT up.credential_id, up.public_key_spki, up.name, up.registered_at, u.id as user_id, u.role
         FROM user_passkeys up
         JOIN users u ON up.user_id = u.id
         WHERE u.public_key = $1 
         ORDER BY up.registered_at DESC`,
        [userPublicKey]
      );
      console.log(`[WebAuthn] 📋 Found ${result.rows.length} passkey(s) for public_key ${userPublicKey.substring(0, 8)}...`);
    } else {
      // Fallback: get passkeys for current user_id only
      result = await pool.query(
        `SELECT credential_id, public_key_spki, name, registered_at 
         FROM user_passkeys 
         WHERE user_id = $1 
         ORDER BY registered_at DESC`,
        [req.user.id]
      );
      console.log(`[WebAuthn] ⚠️ No public_key for user, using user_id only. Found ${result.rows.length} passkey(s)`);
    }

    // Check which passkey is registered on the contract
    let contractPasskeyHex = null;
    if (userPublicKey) {
      try {
        const StellarSdk = require('@stellar/stellar-sdk');
        const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
        const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;
        const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);
        
        const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
        const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
          StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
        );
        const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);
        
        const getPasskeyOp = contract.call('get_passkey_pubkey', userScVal);
        const horizonUrl = contracts.STELLAR_NETWORK === 'testnet'
          ? 'https://horizon-testnet.stellar.org'
          : 'https://horizon.stellar.org';
        const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
        
        try {
          const account = await horizonServer.loadAccount(userPublicKey);
          const checkTx = new StellarSdk.TransactionBuilder(
            new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
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
            const retval = checkResult.result.retval;
            let registeredPubkeyScVal;
            
            if (retval && typeof retval === 'object' && typeof retval.switch === 'function') {
              registeredPubkeyScVal = retval;
            } else if (typeof retval === 'string') {
              registeredPubkeyScVal = StellarSdk.xdr.ScVal.fromXDR(retval, 'base64');
            }
            
            if (registeredPubkeyScVal && registeredPubkeyScVal.switch && registeredPubkeyScVal.switch().name === 'scvBytes') {
              const registeredPubkeyBytes = registeredPubkeyScVal.bytes();
              contractPasskeyHex = Buffer.from(registeredPubkeyBytes).toString('hex');
              console.log(`[WebAuthn] ✅ Found passkey on contract: ${contractPasskeyHex.substring(0, 32)}...`);
            }
          }
        } catch (checkError) {
          console.warn('[WebAuthn] ⚠️ Could not check contract passkey:', checkError.message);
        }
      } catch (error) {
        console.warn('[WebAuthn] ⚠️ Error checking contract passkey:', error.message);
      }
    }

    res.json({ 
      passkeys: result.rows.map(row => {
        // Check if this passkey matches the one on contract
        let isOnContract = false;
        if (contractPasskeyHex && row.public_key_spki) {
          try {
            const { extractPublicKeyFromSPKI } = require('../utils/webauthnUtils');
            const spkiBytes = Buffer.from(row.public_key_spki, 'base64');
            const passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);
            const passkeyHex = passkeyPubkey65.toString('hex');
            isOnContract = (passkeyHex === contractPasskeyHex);
          } catch (e) {
            console.warn('[WebAuthn] ⚠️ Error comparing passkey:', e.message);
          }
        }
        
        return {
          credentialId: row.credential_id,
          credential_id: row.credential_id, // Include both formats for compatibility
          publicKey: row.public_key_spki, // Include public key for payment operations
          public_key_spki: row.public_key_spki, // Include both formats for compatibility
          registeredAt: row.registered_at,
          name: row.name || `Passkey ${result.rows.indexOf(row) + 1}`, // Use name or default
          userId: row.user_id || req.user.id, // Include user_id for reference
          role: row.role || req.user.role, // Include role for reference
          isOnContract: isOnContract // Indicate if this passkey is registered on contract
        };
      }),
      contractPasskeyHex: contractPasskeyHex ? contractPasskeyHex.substring(0, 32) + '...' : null, // For debugging
      note: userPublicKey 
        ? 'Passkeys are fetched by public_key. If you have multiple roles with the same public_key, all passkeys are shown. Only the last registered passkey exists on the contract.'
        : 'Passkeys are fetched by user_id. If you have multiple roles with the same public_key, you may need to use the passkey from a different role.'
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
 * GET /api/webauthn/passkeys/:credentialId
 * Get a specific passkey by credential ID
 */
router.get('/passkeys/:credentialId', authenticateUser, async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to view your passkeys'
      });
    }

    const { credentialId } = req.params;
    const decodedCredentialId = decodeURIComponent(credentialId);

    const result = await pool.query(
      `SELECT credential_id, public_key_spki, registered_at 
       FROM user_passkeys 
       WHERE user_id = $1 AND credential_id = $2`,
      [req.user.id, decodedCredentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Passkey not found',
        message: 'The specified passkey does not exist or does not belong to this user'
      });
    }

    const row = result.rows[0];
    res.json({ 
      credentialId: row.credential_id,
      credential_id: row.credential_id, // Include both formats for compatibility
      publicKey: row.public_key_spki,
      public_key_spki: row.public_key_spki, // Include both formats for compatibility
      registeredAt: row.registered_at
    });
  } catch (error) {
    console.error('Error fetching passkey:', error);
    res.status(500).json({ 
      error: 'Failed to fetch passkey',
      details: error.message 
    });
  }
});

/**
 * PUT /api/webauthn/passkeys/:credentialId
 * Update a passkey's name
 */
router.put('/passkeys/:credentialId', authenticateUser, async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        error: 'Name is required' 
      });
    }

    const result = await pool.query(
      `UPDATE user_passkeys 
       SET name = $1 
       WHERE user_id = $2 AND credential_id = $3
       RETURNING *`,
      [name.trim(), req.user.id, credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Passkey not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Passkey name updated successfully',
      passkey: {
        credentialId: result.rows[0].credential_id,
        name: result.rows[0].name
      }
    });
  } catch (error) {
    console.error('Error updating passkey name:', error);
    res.status(500).json({ 
      error: 'Failed to update passkey name', 
      details: error.message 
    });
  }
});

/**
 * DELETE /api/webauthn/passkeys/:credentialId
 * Remove a registered passkey
 * Note: This only removes from database. The contract stores only one passkey per public_key,
 * so deleting from database doesn't affect the contract. To change the contract passkey,
 * register a new one which will overwrite the existing one.
 */
router.delete('/passkeys/:credentialId', authenticateUser, async (req, res) => {
  try {
    const { credentialId } = req.params;
    
    // Check if this passkey is registered on the contract
    const userPublicKey = req.user?.public_key;
    let isOnContract = false;
    
    if (userPublicKey) {
      try {
        // Get the passkey from database first
        const passkeyResult = await pool.query(
          `SELECT public_key_spki FROM user_passkeys 
           WHERE user_id = $1 AND credential_id = $2`,
          [req.user.id, credentialId]
        );
        
        if (passkeyResult.rows.length > 0) {
          const StellarSdk = require('@stellar/stellar-sdk');
          const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
          const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC;
          const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);
          
          const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
          const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
            StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
          );
          const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);
          
          const getPasskeyOp = contract.call('get_passkey_pubkey', userScVal);
          const horizonUrl = contracts.STELLAR_NETWORK === 'testnet'
            ? 'https://horizon-testnet.stellar.org'
            : 'https://horizon.stellar.org';
          const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
          
          try {
            const account = await horizonServer.loadAccount(userPublicKey);
            const checkTx = new StellarSdk.TransactionBuilder(
              new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
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
              const retval = checkResult.result.retval;
              let registeredPubkeyScVal;
              
              if (retval && typeof retval === 'object' && typeof retval.switch === 'function') {
                registeredPubkeyScVal = retval;
              } else if (typeof retval === 'string') {
                registeredPubkeyScVal = StellarSdk.xdr.ScVal.fromXDR(retval, 'base64');
              }
              
              if (registeredPubkeyScVal && registeredPubkeyScVal.switch && registeredPubkeyScVal.switch().name === 'scvBytes') {
                const registeredPubkeyBytes = registeredPubkeyScVal.bytes();
                const contractPasskeyHex = Buffer.from(registeredPubkeyBytes).toString('hex');
                
                // Compare with this passkey
                const { extractPublicKeyFromSPKI } = require('../utils/webauthnUtils');
                const spkiBytes = Buffer.from(passkeyResult.rows[0].public_key_spki, 'base64');
                const passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);
                const passkeyHex = passkeyPubkey65.toString('hex');
                isOnContract = (passkeyHex === contractPasskeyHex);
              }
            }
          } catch (checkError) {
            console.warn('[WebAuthn] ⚠️ Could not check contract passkey:', checkError.message);
          }
        }
      } catch (error) {
        console.warn('[WebAuthn] ⚠️ Error checking contract passkey:', error.message);
      }
    }
    
    await pool.query(
      `DELETE FROM user_passkeys 
       WHERE user_id = $1 AND credential_id = $2`,
      [req.user.id, credentialId]
    );

    res.json({ 
      success: true, 
      message: isOnContract 
        ? 'Passkey removed from database. Note: This passkey is still registered on the smart wallet contract. To change the contract passkey, register a new one which will overwrite it.'
        : 'Passkey removed successfully',
      wasOnContract: isOnContract
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

