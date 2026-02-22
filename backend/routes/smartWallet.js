/**
 * Smart Wallet Routes
 * Handles smart wallet contract interactions
 * Based on CUSTOM_CONTRACT_INTEGRATION_ANALYSIS.md
 * 
 * Contract IDs:
 * - Smart Wallet: CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U
 * - WebAuthn Verifier: CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const { validateSignedXDR } = require('../middleware/validateSignedXDR');
const contracts = require('../config/contracts');
const { extractPublicKeyFromSPKI, decodeDERSignature, normalizeECDSASignature } = require('../utils/webauthnUtils');

/**
 * Helper function to check if passkey is registered and auto-register if not
 * Returns true if passkey is registered (or was just registered), false otherwise
 */
// Export ensurePasskeyRegistered for use in other routes
async function ensurePasskeyRegistered(userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId = null) {
  console.log('[Smart Wallet] 🔍 ensurePasskeyRegistered called', {
    userPublicKey: userPublicKey?.substring(0, 8) + '...',
    hasSecretKey: !!userSecretKey,
    hasPasskeySPKI: !!passkeyPublicKeySPKI,
    rpId: rpId
  });
  
  // Validate required parameters
  if (!userPublicKey || !userSecretKey || !passkeyPublicKeySPKI) {
    console.warn('[Smart Wallet] ⚠️ Missing required parameters for passkey registration');
    return false;
  }

  const StellarSdk = require('@stellar/stellar-sdk');
  const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
  const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
    ? StellarSdk.Networks.TESTNET
    : StellarSdk.Networks.PUBLIC;
  const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);
  const horizonServer = new StellarSdk.Horizon.Server(contracts.HORIZON_URL);

  try {
    console.log('[Smart Wallet] 🔍 Step 1: Checking if passkey is already registered...');
    // Check if passkey is registered
    const userScAddressForCheck = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey))
    );
    const userScValForCheck = StellarSdk.xdr.ScVal.scvAddress(userScAddressForCheck);
    
    const getPasskeyOp = contract.call('get_passkey_pubkey', userScValForCheck);
    console.log('[Smart Wallet] 🔍 Loading account for check...');
    const accountForCheck = await horizonServer.loadAccount(userPublicKey);
    const checkTx = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(userPublicKey, accountForCheck.sequenceNumber()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(getPasskeyOp)
      .setTimeout(30)
      .build();
    
    console.log('[Smart Wallet] 🔍 Preparing and simulating check transaction...');
    const preparedCheckTx = await sorobanServer.prepareTransaction(checkTx);
    const checkResult = await sorobanServer.simulateTransaction(preparedCheckTx);
    
    console.log('[Smart Wallet] 🔍 Check result:', {
      hasResult: !!checkResult,
      hasRetval: !!(checkResult?.result?.retval)
    });
    
    // If we get a result, passkey is registered
    if (checkResult && checkResult.result && checkResult.result.retval) {
      console.log('[Smart Wallet] ✅ Passkey is already registered');
      return true;
    }
    
    console.log('[Smart Wallet] 🔍 Step 2: Passkey not registered, attempting auto-registration...');
    
    // Passkey is not registered, register it automatically
    console.log('[Smart Wallet] 🔐 Passkey not registered, auto-registering...');
    
    // Extract 65-byte public key from SPKI
    console.log('[Smart Wallet] 🔍 Extracting passkey public key from SPKI...');
    const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
    let passkeyPubkeyBytes;
    
    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
      passkeyPubkeyBytes = spkiBytes;
      console.log('[Smart Wallet] ✅ SPKI is already 65 bytes, using directly');
    } else {
      console.log('[Smart Wallet] 🔍 Extracting public key from SPKI (length:', spkiBytes.length, ')');
      passkeyPubkeyBytes = extractPublicKeyFromSPKI(spkiBytes);
      console.log('[Smart Wallet] ✅ Extracted public key (length:', passkeyPubkeyBytes.length, ')');
    }
    
    // Generate RP ID hash
    const crypto = require('crypto');
    const rpIdToUse = rpId || 'localhost';
    console.log('[Smart Wallet] 🔍 Generating RP ID hash for:', rpIdToUse);
    const rpIdHash = crypto.createHash('sha256').update(rpIdToUse).digest();
    
    // Create ScVals
    console.log('[Smart Wallet] 🔍 Creating ScVals for registration...');
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);
    const passkeyPubkeyScVal = StellarSdk.xdr.ScVal.scvBytes(passkeyPubkeyBytes);
    const rpIdHashScVal = StellarSdk.xdr.ScVal.scvBytes(rpIdHash);
    
    // Call register_signer
    console.log('[Smart Wallet] 🔍 Building register_signer transaction...');
    const registerOp = contract.call('register_signer', userScVal, passkeyPubkeyScVal, rpIdHashScVal);
    
    console.log('[Smart Wallet] 🔍 Loading account for registration...');
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
    
    console.log('[Smart Wallet] 🔍 Preparing registration transaction...');
    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);
    
    console.log('[Smart Wallet] 🔍 Sending registration transaction...');
    const sendResult = await sorobanServer.sendTransaction(preparedTx);
    console.log(`[Smart Wallet] ✅ Auto-registration transaction sent - Hash: ${sendResult.hash}`);
    
    // Wait a short time for transaction to be processed (3 seconds)
    // Don't wait for full confirmation - payment will proceed and contract will handle if not registered yet
    console.log('[Smart Wallet] ⏳ Waiting 3 seconds for transaction to be processed...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Quick check if transaction succeeded (non-blocking)
    console.log('[Smart Wallet] 🔍 Checking registration transaction status...');
    try {
      const txResult = await sorobanServer.getTransaction(sendResult.hash);
      console.log('[Smart Wallet] 🔍 Transaction status:', txResult.status);
      
      if (txResult.status === 'SUCCESS') {
        console.log(`[Smart Wallet] ✅ Passkey auto-registered successfully - Hash: ${sendResult.hash}`);
        return true;
      } else if (txResult.status === 'FAILED') {
        console.warn(`[Smart Wallet] ⚠️ Auto-registration transaction failed - Result: ${txResult.resultXdr || txResult.errorResultXdr}`);
        // Still return true - transaction was sent, might be processing
        return true;
      } else {
        console.log(`[Smart Wallet] ⏳ Auto-registration transaction pending - Hash: ${sendResult.hash}`);
        // Transaction is pending, return true to proceed with payment
        // Contract will handle if passkey isn't registered yet
        return true;
      }
    } catch (checkError) {
      console.warn(`[Smart Wallet] ⚠️ Could not check registration status: ${checkError.message}`);
      console.warn(`[Smart Wallet] ⚠️ Stack:`, checkError.stack);
      // Still return true - transaction was sent
      return true;
    }
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error in ensurePasskeyRegistered:', error.message);
    console.error('[Smart Wallet] ❌ Stack:', error.stack);
    return false;
  }
}

/**
 * GET /api/smart-wallet/balance
 * Get user's balance from smart wallet contract
 * Query params:
 *   - userPublicKey: User's Stellar public key (required)
 *   - contractId: Smart wallet contract ID (optional, uses env var if not provided)
 *   - assetAddress: Asset contract address (optional, defaults to native XLM)
 */
router.get('/balance', authenticateUser, async (req, res) => {
  // console.log('[Smart Wallet] 💰 Balance check request received');
  try {
    const { userPublicKey, contractId, assetAddress } = req.query; // Fixed: was req instead of req.query

    // console.log(`[Smart Wallet] 📋 Request params - userPublicKey: ${userPublicKey}, contractId: ${contractId || 'default'}, assetAddress: ${assetAddress || 'native'}`);

    if (!userPublicKey) {
      console.error('[Smart Wallet] ❌ Missing userPublicKey parameter');
      return res.status(400).json({ 
        error: 'userPublicKey is required' 
      });
    }

    // Get smart wallet contract ID from query, env var, or use default from config
    const smartWalletContractId = contractId || contracts.SMART_WALLET_CONTRACT_ID;
    // console.log(`[Smart Wallet] 📝 Using contract ID: ${smartWalletContractId}`);

    if (!smartWalletContractId) {
      console.error('[Smart Wallet] ❌ Smart wallet contract ID not configured');
      return res.status(400).json({ 
        error: 'Smart wallet contract ID not configured. Please provide contractId or set SMART_WALLET_CONTRACT_ID environment variable.' 
      });
    }

    // Import Stellar SDK
    const StellarSdk = require('@stellar/stellar-sdk');

    // Configure Soroban RPC server using config
    const network = contracts.STELLAR_NETWORK;
    // Commented out verbose network log - only show for deposits/executions
    // console.log(`[Smart Wallet] 🌐 Network: ${network}, Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = network === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;

    // Create contract instance
    const contract = new StellarSdk.Contract(smartWalletContractId);

    // Prepare addresses
    const userAddr = StellarSdk.Address.fromString(userPublicKey);
    
    // Use native XLM if no asset address provided
    // For native XLM, we need to use the Stellar Asset Contract (SAC) address, not the account address
    // The contract stores balances keyed by the SAC contract address
    // Testnet SAC: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
    let assetScAddress;
    if (assetAddress && assetAddress.startsWith('C')) {
      // Contract address (including SAC for native XLM)
      const contractIdBytes = StellarSdk.StrKey.decodeContract(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
    } else if (assetAddress && assetAddress.startsWith('G')) {
      // Account address (custom asset)
      const assetAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(assetAddressBytes)
      );
    } else {
      // Native XLM - use Stellar Asset Contract (SAC)
      const sacContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      const sacContractBytes = StellarSdk.StrKey.decodeContract(sacContractId);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(sacContractBytes);
    }

    // Create a dummy account for simulation (read-only call)
    // For simulation, we can use a dummy account with sequence 0
    const dummyAccount = new StellarSdk.Account(userPublicKey, '0');
    
    // Build transaction for simulation
    const transaction = new StellarSdk.TransactionBuilder(
      dummyAccount,
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(
        contract.call(
          'get_balance',
          StellarSdk.xdr.ScVal.scvAddress(userAddr.toScAddress()),
          StellarSdk.xdr.ScVal.scvAddress(assetScAddress)
        )
      )
      .setTimeout(30)
      .build();

    // Simulate transaction (read-only, no signing needed)
    // console.log(`[Smart Wallet] 🔄 Simulating get_balance transaction for user ${userPublicKey}...`);
    let simulation;
    try {
      simulation = await sorobanServer.simulateTransaction(transaction);
      console.log('[Smart Wallet] ✅ Simulation completed:', {
        hasResult: !!simulation.result,
        hasErrorResult: !!simulation.errorResult,
        resultType: simulation.result ? typeof simulation.result : 'none',
        errorType: simulation.errorResult ? typeof simulation.errorResult : 'none'
      });
    } catch (simError) {
      console.error('[Smart Wallet] ❌ Error simulating smart wallet balance transaction:', simError);
      console.error('[Smart Wallet] 📋 Simulation error details:', {
        message: simError.message,
        stack: simError.stack,
        contractId: smartWalletContractId,
        userPublicKey: userPublicKey,
        assetAddress: assetAddress || 'native'
      });
      // If simulation fails, return zero balance instead of error
      return res.json({ 
        balance: '0', 
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        userPublicKey: userPublicKey,
        error: 'Simulation failed - contract may not be initialized or account may not exist',
        details: simError.message
      });
    }

    if (simulation.errorResult) {
      const errorValue = simulation.errorResult.value();
      console.error('Smart wallet simulation error:', errorValue);
      console.error('Error result details:', {
        errorValue: errorValue.toString(),
        contractId: smartWalletContractId,
        userPublicKey: userPublicKey
      });
      return res.status(400).json({ 
        error: 'Failed to get balance from smart wallet',
        details: errorValue.toString()
      });
    }

    // Extract balance from result
    // Check if simulation has a result
    if (!simulation.result || !simulation.result.retval) {
      return res.json({ 
        balance: '0', 
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        userPublicKey: userPublicKey,
        message: 'No balance found or contract returned empty result'
      });
    }

    const result = simulation.result.retval;
    
    // Handle i128 result
    let balance = '0';
    try {
      if (result.i128) {
        const parts = result.i128();
        const lo = parts.lo().toString();
        const hi = parts.hi().toString();
        // For most balances, lo should be sufficient
        // If hi is non-zero, we'd need to combine them: balance = (hi << 64) | lo
        // eslint-disable-next-line no-undef
        balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
      } else {
        balance = result.toString() || '0';
      }
    } catch (parseError) {
      console.error('Error parsing balance result:', parseError);
      return res.json({ 
        balance: '0', 
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        userPublicKey: userPublicKey,
        error: 'Failed to parse balance result',
        details: parseError.message
      });
    }

    // Convert from stroops to XLM (divide by 10,000,000)
    // eslint-disable-next-line no-undef
    const balanceInXLM = (BigInt(balance) / 10000000n).toString();
    const balanceInStroops = balance;

    // console.log(`[Smart Wallet] ✅ Balance retrieved - User: ${userPublicKey}, Balance: ${balanceInXLM} XLM (${balanceInStroops} stroops)`);

    res.json({
      balance: balanceInStroops,
      balanceInXLM: balanceInXLM,
      contractId: smartWalletContractId,
      assetAddress: assetAddress || 'native',
      userPublicKey: userPublicKey
    });
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error getting smart wallet balance:', error);
    console.error('[Smart Wallet] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to get smart wallet balance',
      details: error.message 
    });
  }
});

/**
 * POST /api/smart-wallet/execute-payment
 * Execute payment from smart wallet using WebAuthn signature
 * Body: {
 *   userPublicKey, userSecretKey, destinationAddress, amount (in stroops),
 *   assetAddress, signaturePayload, passkeyPublicKeySPKI,
 *   webauthnSignature, webauthnAuthenticatorData, webauthnClientData
 * }
 */
router.post('/execute-payment', authenticateUser, validateSignedXDR, async (req, res) => {
  console.log('[Smart Wallet] 💳 Execute payment request received');
  try {
    // Log request details for debugging
    console.log('[Smart Wallet] 📋 Request body keys:', Object.keys(req.body));
    console.log('[Smart Wallet] 📋 Request details:', {
      hasUserPublicKey: !!req.body.userPublicKey,
      hasUserSecretKey: !!req.body.userSecretKey,
      hasDestinationAddress: !!req.body.destinationAddress,
      destinationAddressType: typeof req.body.destinationAddress,
      destinationAddressValue: req.body.destinationAddress ? (req.body.destinationAddress.substring(0, 20) + '...') : null,
      hasAmount: !!req.body.amount,
      amountValue: req.body.amount,
      hasSignaturePayload: !!req.body.signaturePayload,
      hasWebAuthnSignature: !!req.body.webauthnSignature,
      hasWebAuthnAuthenticatorData: !!req.body.webauthnAuthenticatorData,
      hasWebAuthnClientData: !!req.body.webauthnClientData,
      hasPasskeyPublicKeySPKI: !!req.body.passkeyPublicKeySPKI,
      rule_id: req.body.rule_id,
      update_id: req.body.update_id,
      matched_public_key: req.body.matched_public_key
    });
    
    const {
      userPublicKey,
      userSecretKey,
      destinationAddress,
      amount, // In stroops (1 XLM = 10,000,000 stroops)
      assetAddress,
      signaturePayload, // Transaction data JSON string
      passkeyPublicKeySPKI, // Base64 SPKI format
      webauthnSignature, // Base64 DER-encoded signature (70-72 bytes)
      webauthnAuthenticatorData, // Base64
      webauthnClientData, // Base64
      rule_id, // Optional: Rule ID to mark as completed after successful payment
      update_id, // Optional: Update ID to mark only the specific location update as completed
      matched_public_key, // Optional: Matched public key for additional filtering
    } = req.body;

    // console.log(`[Smart Wallet] 📋 Payment params - From: ${userPublicKey}, To: ${destinationAddress}, Amount: ${amount} stroops (${parseFloat(amount) / 10000000} XLM), Asset: ${assetAddress || 'native'}, Rule ID: ${rule_id || 'Not provided'}`);

    if (!userPublicKey || !userSecretKey || !destinationAddress || !amount) {
      console.error('[Smart Wallet] ❌ Missing required parameters', {
        hasUserPublicKey: !!userPublicKey,
        hasUserSecretKey: !!userSecretKey,
        hasDestinationAddress: !!destinationAddress,
        hasAmount: !!amount,
        destinationAddressValue: destinationAddress,
        destinationAddressType: typeof destinationAddress,
        amountValue: amount,
        amountType: typeof amount,
        requestBodyKeys: Object.keys(req.body)
      });
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, destinationAddress, and amount are required',
        details: {
          hasUserPublicKey: !!userPublicKey,
          hasUserSecretKey: !!userSecretKey,
          hasDestinationAddress: !!destinationAddress,
          hasAmount: !!amount
        }
      });
    }

    // Validate destinationAddress format (must be valid Stellar address)
    // Check if it's a placeholder string that needs to be replaced
    if (!destinationAddress || 
        typeof destinationAddress !== 'string' || 
        destinationAddress.trim() === '' ||
        destinationAddress.includes('[Will be') ||
        destinationAddress.includes('system-generated')) {
      console.error('[Smart Wallet] ❌ Invalid or placeholder destinationAddress', {
        destinationAddress: destinationAddress ? (destinationAddress.substring(0, 50) + (destinationAddress.length > 50 ? '...' : '')) : null,
        type: typeof destinationAddress,
        length: destinationAddress?.length,
        isPlaceholder: destinationAddress?.includes('[Will be') || destinationAddress?.includes('system-generated'),
        isEmpty: destinationAddress?.trim() === ''
      });
      return res.status(400).json({ 
        error: 'Invalid destinationAddress. It appears to be a placeholder or empty. Please ensure the destination address is properly set in the rule parameters.',
        details: {
          received: destinationAddress ? (destinationAddress.substring(0, 50) + (destinationAddress.length > 50 ? '...' : '')) : null,
          type: typeof destinationAddress,
          isPlaceholder: destinationAddress?.includes('[Will be') || destinationAddress?.includes('system-generated')
        }
      });
    }
    
    const trimmedDestination = destinationAddress.trim();
    if (!/^[G][A-Z0-9]{55}$/.test(trimmedDestination)) {
      console.error('[Smart Wallet] ❌ Invalid destinationAddress format', {
        destinationAddress: trimmedDestination.substring(0, 20) + '...',
        length: trimmedDestination.length,
        firstChar: trimmedDestination[0],
        matchesPattern: /^[G][A-Z0-9]{55}$/.test(trimmedDestination)
      });
      return res.status(400).json({ 
        error: 'Invalid destinationAddress format. Must be a valid Stellar address (starts with G, 56 characters)',
        details: {
          received: trimmedDestination.substring(0, 20) + '...',
          length: trimmedDestination.length,
          firstChar: trimmedDestination[0],
          expectedFormat: 'G followed by 55 alphanumeric characters (56 total)'
        }
      });
    }
    
    // Normalize destinationAddress
    const normalizedDestinationAddress = destinationAddress.trim().toUpperCase();

    if (!signaturePayload || !webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData) {
      console.error('[Smart Wallet] ❌ Missing WebAuthn signature parameters', {
        hasSignaturePayload: !!signaturePayload,
        hasWebAuthnSignature: !!webauthnSignature,
        hasWebAuthnAuthenticatorData: !!webauthnAuthenticatorData,
        hasWebAuthnClientData: !!webauthnClientData
      });
      return res.status(400).json({ 
        error: 'signaturePayload, webauthnSignature, webauthnAuthenticatorData, and webauthnClientData are required',
        details: {
          hasSignaturePayload: !!signaturePayload,
          hasWebAuthnSignature: !!webauthnSignature,
          hasWebAuthnAuthenticatorData: !!webauthnAuthenticatorData,
          hasWebAuthnClientData: !!webauthnClientData
        }
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    // console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    console.log(`[Smart Wallet] 📝 Using Smart Wallet Contract: ${contracts.SMART_WALLET_CONTRACT_ID}`);
    const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);

    // Decode DER signature to raw 64-byte format
    let derSignatureBytes;
    try {
      derSignatureBytes = Buffer.from(webauthnSignature, 'base64');
    } catch (decodeError) {
      console.error('[Smart Wallet] ❌ Failed to decode webauthnSignature from base64', {
        error: decodeError.message,
        signatureLength: webauthnSignature?.length,
        signaturePreview: webauthnSignature?.substring(0, 20) + '...'
      });
      return res.status(400).json({
        error: 'Invalid webauthnSignature format. Must be valid base64 encoded data.',
        details: decodeError.message
      });
    }
    
    let rawSignature64;

    if (derSignatureBytes.length === 64) {
      // Already raw bytes - normalize it
      rawSignature64 = normalizeECDSASignature(derSignatureBytes);
    } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
      // DER-encoded signature - decode and normalize
      try {
        rawSignature64 = decodeDERSignature(derSignatureBytes);
      } catch (decodeError) {
        console.error('[Smart Wallet] ❌ Failed to decode DER signature', {
          error: decodeError.message,
          signatureLength: derSignatureBytes.length
        });
        return res.status(400).json({
          error: 'Failed to decode DER signature',
          details: decodeError.message
        });
      }
    } else {
      console.error('[Smart Wallet] ❌ Invalid signature length', {
        receivedLength: derSignatureBytes.length,
        expectedLengths: '64 bytes (raw) or 70-72 bytes (DER)'
      });
      return res.status(400).json({
        error: `Invalid signature length: expected 64 bytes (raw) or 70-72 bytes (DER), got ${derSignatureBytes.length}`,
        details: {
          receivedLength: derSignatureBytes.length,
          expectedLengths: '64 bytes (raw) or 70-72 bytes (DER)'
        }
      });
    }

    // Create ScVals for addresses
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const signerAddressScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    const destinationAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(normalizedDestinationAddress);
    const destinationScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(destinationAddressBytes)
    );
    const destinationScVal = StellarSdk.xdr.ScVal.scvAddress(destinationScAddress);

    // Asset address could be account (starts with 'G') or contract (starts with 'C')
    let assetScAddress;
    if (assetAddress && assetAddress.startsWith('C')) {
      // Contract address
      const contractIdBytes = StellarSdk.StrKey.decodeContract(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
    } else if (assetAddress && assetAddress.startsWith('G')) {
      // Account address
      const assetAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(assetAddressBytes)
      );
    } else {
      // Native XLM - use special address
      const nativeAssetBytes = StellarSdk.StrKey.decodeEd25519PublicKey('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(nativeAssetBytes)
      );
    }
    const assetScVal = StellarSdk.xdr.ScVal.scvAddress(assetScAddress);

    // Create i128 ScVal for amount
    const amountBigInt = BigInt(amount);
    const hi = amountBigInt >> 64n;
    const lo = amountBigInt & 0xFFFFFFFFFFFFFFFFn;
    const amountI128 = new StellarSdk.xdr.Int128Parts({
      hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
      lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
    });
    const amountScVal = StellarSdk.xdr.ScVal.scvI128(amountI128);

    // Create Bytes ScVals for WebAuthn data
    const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(signaturePayload, 'utf8')
    );
    const webauthnSignatureScVal = StellarSdk.xdr.ScVal.scvBytes(rawSignature64);
    const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(webauthnAuthenticatorData, 'base64')
    );
    const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(webauthnClientData, 'base64')
    );

    // Ensure passkey is registered (auto-register if not)
    // Check synchronously first, then register if needed (with timeout)
    // Only attempt auto-registration if passkeyPublicKeySPKI is provided
    if (passkeyPublicKeySPKI) {
      const rpId = req.body.rpId || req.headers.host || 'localhost';
      console.log('[Smart Wallet] 🔍 Checking if passkey is registered...');
      
      try {
        // Extract passkey public key from SPKI for verification
        const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
        let passkeyPubkeyBytes;
        
        if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
          passkeyPubkeyBytes = spkiBytes;
        } else {
          passkeyPubkeyBytes = extractPublicKeyFromSPKI(spkiBytes);
        }
        
        const passkeyPubkeyHex = passkeyPubkeyBytes.toString('hex');
        // console.log(`[Smart Wallet] 🔑 Passkey public key from request (hex): ${passkeyPubkeyHex.substring(0, 32)}...`);
        
        // Check what's registered on the contract
        const userScAddressForCheck = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
          StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey))
        );
        const userScValForCheck = StellarSdk.xdr.ScVal.scvAddress(userScAddressForCheck);
        
        const getPasskeyOp = contract.call('get_passkey_pubkey', userScValForCheck);
        const dummyAccount = new StellarSdk.Account(userPublicKey, '0');
        const checkTx = new StellarSdk.TransactionBuilder(
          dummyAccount,
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
            
            // console.log(`[Smart Wallet] 🔑 Registered passkey on contract (hex): ${registeredPubkeyHex.substring(0, 32)}...`);
            
            if (registeredPubkeyHex !== passkeyPubkeyHex) {
              console.error('[Smart Wallet] ❌ Passkey mismatch detected!');
              console.error('  The passkey registered on the contract does not match the passkey used for signing.');
              console.error('  Registered passkey (hex):', registeredPubkeyHex.substring(0, 32) + '...');
              console.error('  Signing passkey (hex):', passkeyPubkeyHex.substring(0, 32) + '...');
              console.error('  The signature was already generated with the wrong passkey, so re-registering will not help.');
              console.error('[Smart Wallet] 💡 Solution: Use the passkey that matches the registered one, or re-register BEFORE generating the signature.');
              
              return res.status(400).json({
                error: 'Passkey mismatch - signature verification will fail',
                details: 'The passkey used to generate the signature does not match the passkey registered on the contract. The signature was already created with a different passkey, so it cannot be verified.',
                message: 'Please use the passkey that matches the one registered on the contract, or re-register your passkey BEFORE generating the signature.',
                registeredPasskey: registeredPubkeyHex.substring(0, 32) + '...',
                signingPasskey: passkeyPubkeyHex.substring(0, 32) + '...',
                suggestion: 'The frontend should check which passkey is registered on the contract and use that one for signing, or prompt the user to re-register their passkey before signing.'
              });
            } else {
              console.log('[Smart Wallet] ✅ Passkey matches - proceeding with payment');
            }
          }
        } else {
          // Passkey not registered, try to register it
          // console.log('[Smart Wallet] 🔐 Passkey not registered, attempting auto-registration...');
          const registrationPromise = ensurePasskeyRegistered(userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Passkey registration timeout after 15 seconds')), 15000)
          );
          
          const isRegistered = await Promise.race([registrationPromise, timeoutPromise]);
          
          if (isRegistered) {
            console.log('[Smart Wallet] ✅ Passkey registered successfully');
          } else {
            console.warn('[Smart Wallet] ⚠️ Passkey registration failed or timed out');
          }
        }
      } catch (regError) {
        console.error('[Smart Wallet] ❌ Error during passkey verification:', regError.message);
        // Continue anyway - contract will fail with a clear error if passkey isn't registered
        console.warn('[Smart Wallet] ⚠️ Proceeding with payment execution (contract will validate passkey)');
      }
    } else {
      console.warn('[Smart Wallet] ⚠️ passkeyPublicKeySPKI not provided, skipping auto-registration');
    }

    // Call execute_payment
    const contractCallOp = contract.call(
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

    // Build transaction
    console.log(`[Smart Wallet] 🔍 Loading account ${userPublicKey}...`);
    const account = await sorobanServer.getAccount(userPublicKey);
    // console.log(`[Smart Wallet] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    
    // console.log('[Smart Wallet] 🔨 Building execute_payment transaction...');
    const transaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(contractCallOp)
      .setTimeout(30)
      .build();
    // console.log('[Smart Wallet] ✅ Transaction built');

    // Prepare transaction (adds authorization entries)
    // console.log('[Smart Wallet] 🔄 Preparing transaction...');
    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    // console.log('[Smart Wallet] ✅ Transaction prepared');

    // Sign transaction
    // console.log('[Smart Wallet] ✍️ Signing transaction...');
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);
    // console.log('[Smart Wallet] ✅ Transaction signed');

    // Send transaction
    // console.log('[Smart Wallet] 📤 Sending transaction to network...');
    const sendResult = await sorobanServer.sendTransaction(preparedTx);
    
    // PUBLIC-FRIENDLY LOG: Payment transaction submitted (for GeoLink Events feed)
    if (rule_id) {
      console.log(`[GeoLink Events] ✅ Payment transaction submitted for Rule ${rule_id}: ${sendResult.hash}`);
    } else {
      console.log(`[GeoLink Events] ✅ Payment transaction submitted: ${sendResult.hash}`);
    }

    // Poll for result
    // console.log('[Smart Wallet] ⏳ Polling for transaction result...');
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      // console.log(`[Smart Wallet] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
      if (txResult.status === 'SUCCESS') {
        // PUBLIC-FRIENDLY LOG: Payment confirmed (for GeoLink Events feed)
        if (rule_id) {
          console.log(`[GeoLink Events] ✅ Payment confirmed for Rule ${rule_id} on ledger ${txResult.ledger}: ${sendResult.hash}`);
        } else {
          console.log(`[GeoLink Events] ✅ Payment confirmed on ledger ${txResult.ledger}: ${sendResult.hash}`);
        }
        // console.log(`[Smart Wallet] ✅ Payment successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
        
        // If rule_id is provided, mark the pending rule as completed in execution_results
        // console.log(`[Smart Wallet] 🔍 Checking if rule_id is provided: ${rule_id ? `Yes (${rule_id})` : 'No'}`);
        if (rule_id) {
          try {
            // backend/config/database.js exports the Pool instance directly (module.exports = pool)
            // so we must require it without destructuring.
            const pool = require('../config/database');
            const userId = req.user?.id || req.userId;
            
            // console.log(`[Smart Wallet] 📝 Attempting to mark rule ${rule_id} as completed for user ${userId}`);
            
            if (userId) {
              // First, check if the rule exists in execution_results
              const checkQuery = `
                SELECT luq.id, luq.execution_results
                FROM location_update_queue luq
                WHERE luq.user_id = $1
                  AND luq.execution_results IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(luq.execution_results) AS result
                    WHERE (result->>'rule_id')::integer = $2::integer
                  )
                ORDER BY luq.id DESC
                LIMIT 1
              `;
              
              const checkResult = await pool.query(checkQuery, [userId, parseInt(rule_id)]);
              // console.log(`[Smart Wallet] 🔍 Found ${checkResult.rows.length} location_update_queue entry(ies) with rule_id ${rule_id}`);
              
              if (checkResult.rows.length > 0) {
                const executionResults = checkResult.rows[0].execution_results;
                // console.log(`[Smart Wallet] 📋 Current execution_results:`, JSON.stringify(executionResults, null, 2));
                
                // Use update_id and matched_public_key to only mark the specific instance
                let markCompletedQuery;
                let markCompletedParams;
                
                // Validate update_id and matched_public_key before using them
                const validUpdateId = update_id && !isNaN(parseInt(update_id)) ? parseInt(update_id) : null;
                const validMatchedPublicKey = matched_public_key && typeof matched_public_key === 'string' && matched_public_key.trim() !== '' ? matched_public_key : null;
                
                if (validUpdateId && validMatchedPublicKey) {
                  // Filter by update_id and matched_public_key for precise matching
                  // Store actual execution parameters (payment details)
                  const executionParams = {
                    destination: normalizedDestinationAddress,
                    amount: parseFloat(amount) / 10000000, // Convert stroops to XLM
                    asset: assetAddress || 'native',
                    signer_address: userPublicKey,
                    webauthn_signature: webauthnSignature,
                    webauthn_authenticator_data: webauthnAuthenticatorData,
                    webauthn_client_data: webauthnClientData,
                    signature_payload: signaturePayload
                  };
                  const executionParamsJson = JSON.stringify(executionParams);
                  
                  markCompletedQuery = `
                    UPDATE location_update_queue luq
                    SET execution_results = (
                      SELECT jsonb_agg(
                        CASE 
                          WHEN (
                            (result->>'rule_id')::integer = $1::integer
                          ) AND (
                            COALESCE((result->>'skipped')::boolean, false) = true
                          ) AND (
                            COALESCE(result->>'reason', '') = 'requires_webauthn'
                          ) AND (
                            COALESCE((result->>'rejected')::boolean, false) = false
                          ) AND (
                            COALESCE((result->>'completed')::boolean, false) = false
                          ) AND (
                            result->>'matched_public_key' = $5 OR luq.public_key = $5 OR result->>'matched_public_key' IS NULL
                          )
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
                        AND COALESCE((result->>'skipped')::boolean, false) = true
                        AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                        AND COALESCE((result->>'rejected')::boolean, false) = false
                        AND COALESCE((result->>'completed')::boolean, false) = false
                        AND (
                          result->>'matched_public_key' = $5 OR luq.public_key = $5 OR result->>'matched_public_key' IS NULL
                        )
                      )
                    RETURNING luq.id, luq.execution_results, luq.received_at, luq.public_key
                  `;
                  markCompletedParams = [
                    parseInt(rule_id), 
                    userId, 
                    new Date().toISOString(),
                    sendResult.hash,
                    validMatchedPublicKey,
                    validUpdateId,
                    executionParamsJson
                  ];
                } else if (validMatchedPublicKey) {
                  // Filter by matched_public_key only
                  // Store actual execution parameters (payment details)
                  const executionParams = {
                    destination: normalizedDestinationAddress,
                    amount: parseFloat(amount) / 10000000, // Convert stroops to XLM
                    asset: assetAddress || 'native',
                    signer_address: userPublicKey,
                    webauthn_signature: webauthnSignature,
                    webauthn_authenticator_data: webauthnAuthenticatorData,
                    webauthn_client_data: webauthnClientData,
                    signature_payload: signaturePayload
                  };
                  const executionParamsJson = JSON.stringify(executionParams);
                  
                  // Mark the latest pending placeholder for this matched_public_key as completed (do not delete it)
                  markCompletedQuery = `
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
                            AND (COALESCE(r->>'matched_public_key', luq.public_key) = $5 OR r->>'matched_public_key' IS NULL OR luq.public_key = $5)
                        )
                      ORDER BY luq.received_at DESC
                      LIMIT 1
                    )
                    UPDATE location_update_queue luq
                    SET execution_results = (
                      SELECT jsonb_agg(
                        CASE
                          WHEN (result->>'rule_id')::integer = $1::integer
                            AND COALESCE((result->>'skipped')::boolean, false) = true
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
                    FROM target t
                    WHERE luq.id = t.id
                    RETURNING luq.id, luq.execution_results, luq.received_at, luq.public_key
                  `;
                  markCompletedParams = [
                    parseInt(rule_id),
                    userId,
                    new Date().toISOString(),
                    sendResult.hash,
                    validMatchedPublicKey,
                    executionParamsJson
                  ];
                } else {
                  // Fallback: mark all instances (backward compatibility)
                  // Store actual execution parameters (payment details)
                  const executionParams = {
                    destination: normalizedDestinationAddress,
                    amount: parseFloat(amount) / 10000000, // Convert stroops to XLM
                    asset: assetAddress || 'native',
                    signer_address: userPublicKey,
                    webauthn_signature: webauthnSignature,
                    webauthn_authenticator_data: webauthnAuthenticatorData,
                    webauthn_client_data: webauthnClientData,
                    signature_payload: signaturePayload
                  };
                  const executionParamsJson = JSON.stringify(executionParams);
                  
                  // Mark the latest pending placeholder for this rule as completed (do not delete it)
                  markCompletedQuery = `
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
                        )
                      ORDER BY luq.received_at DESC
                      LIMIT 1
                    )
                    UPDATE location_update_queue luq
                    SET execution_results = (
                      SELECT jsonb_agg(
                        CASE
                          WHEN (result->>'rule_id')::integer = $1::integer
                            AND COALESCE((result->>'skipped')::boolean, false) = true
                            AND COALESCE(result->>'reason', '') = 'requires_webauthn'
                            AND COALESCE((result->>'rejected')::boolean, false) = false
                            AND COALESCE((result->>'completed')::boolean, false) = false
                          THEN (result - 'reason') || jsonb_build_object(
                            'completed', true,
                            'completed_at', $3::text,
                            'transaction_hash', $4::text,
                            'success', true,
                            'skipped', false,
                            'execution_parameters', $5::jsonb
                          )
                          ELSE result
                        END
                      )
                      FROM jsonb_array_elements(luq.execution_results) AS result
                    )
                    FROM target t
                    WHERE luq.id = t.id
                    RETURNING luq.id, luq.execution_results, luq.received_at, luq.public_key
                  `;
                  markCompletedParams = [
                    parseInt(rule_id),
                    userId,
                    new Date().toISOString(),
                    sendResult.hash,
                    executionParamsJson
                  ];
                }
                
                // Ensure we have a valid query before executing
                let updateResult = { rows: [], rowCount: 0 };
                if (!markCompletedQuery || !markCompletedParams) {
                  console.error(`[Smart Wallet] ❌ Completion query not initialized. Rule ID: ${rule_id}, Update ID: ${update_id}, Matched Public Key: ${matched_public_key}`);
                  // Don't fail the payment - just log the error and continue
                } else {
                  // console.log(`[Smart Wallet] 🔍 Executing completion query with params:`, {
                  //   rule_id: parseInt(rule_id),
                  //   user_id: userId,
                  //   matched_public_key: matched_public_key || 'N/A',
                  //   update_id: update_id || 'N/A',
                  //   transaction_hash: sendResult.hash,
                  //   has_execution_params: true
                  // });
                  
                  updateResult = await pool.query(markCompletedQuery, markCompletedParams);
                }
                
                // PUBLIC-FRIENDLY LOG: Rule completed via smart wallet payment (for GeoLink Events feed)
                console.log(`[GeoLink Events] ✅ Rule ${rule_id} completed via smart wallet payment - Transaction: ${sendResult.hash}`);
                // console.log(`[Smart Wallet] ✅ Marked pending rule ${rule_id} as completed. Rows affected: ${updateResult.rowCount}`);
                
                // Clean up older queue entries for the same rule_id + public_key combination
                if (updateResult.rows.length > 0) {
                  try {
                    const receivedAt = updateResult.rows[0].received_at;
                    const publicKey = updateResult.rows[0].public_key || matched_public_key;
                    const cleanupQuery = `
                      DELETE FROM location_update_queue luq2
                      WHERE luq2.user_id = $1
                        AND ($2::text IS NULL OR luq2.public_key = $2)
                        AND luq2.id != COALESCE($3::integer, 0)
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
                      publicKey,
                      update_id ? parseInt(update_id) : null,
                      matched_public_key || publicKey,
                      parseInt(rule_id),
                      receivedAt
                    ];
                    const cleanupResult = await pool.query(cleanupQuery, cleanupParams);
                    // console.log(`[Smart Wallet] 🧹 Cleaned up ${cleanupResult.rowCount} older queue entry/entries for rule ${rule_id}`);
                  } catch (cleanupError) {
                    console.error(`[Smart Wallet] ⚠️ Error cleaning up older queue entries:`, cleanupError.message);
                    // Don't fail the request if cleanup fails
                  }
                }
                
                // Record execution in rate limiting history (for rate limit enforcement)
                if (rule_id && updateResult.rows.length > 0) {
                  try {
                    const executedPublicKey = updateResult.rows[0].public_key || matched_public_key || userPublicKey;
                    console.log(`[SmartWallet] 📝 Recording rule execution for rate limit tracking:`, {
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
                          completed_at: new Date().toISOString(),
                          execution_type: 'smart_wallet_payment',
                          matched_public_key: matched_public_key || executedPublicKey
                        })
                      ]
                    );
                    // console.log(`[Smart Wallet] ✅ Recorded rule ${rule_id} execution in rate limit history for public key ${executedPublicKey.substring(0, 8)}...`);
                    
                    // Trigger lightweight cleanup asynchronously (non-blocking, fire and forget)
                    // Use setImmediate to ensure it doesn't block the response
                    // Temporarily disabled to debug 500 errors - will re-enable after fixing
                    // if (updateResult.rows.length > 0) {
                    //   setImmediate(async () => {
                    //     try {
                    //       const receivedAt = updateResult.rows[0].received_at;
                    //       let executionTime = receivedAt || new Date();
                    //       if (executionTime instanceof Date) {
                    //         executionTime = executionTime.toISOString();
                    //       }
                    //       
                    //       await pool.query(`
                    //         UPDATE location_update_queue luq
                    //         SET execution_results = (
                    //           SELECT jsonb_agg(
                    //             CASE 
                    //               WHEN (result->>'rule_id')::integer = $1
                    //                 AND COALESCE(result->>'matched_public_key', luq.public_key) = COALESCE($2, luq.public_key)
                    //                 AND COALESCE((result->>'completed')::boolean, false) = false
                    //                 AND COALESCE((result->>'skipped')::boolean, false) = true
                    //                 AND luq.received_at < $4::timestamp
                    //                 AND (result->>'reason')::text != 'superseded_by_newer_execution'
                    //               THEN result || jsonb_build_object('reason', 'superseded_by_newer_execution', 'superseded_at', CURRENT_TIMESTAMP::text)
                    //               ELSE result
                    //             END
                    //           )
                    //           FROM jsonb_array_elements(luq.execution_results) AS result
                    //         )
                    //         WHERE luq.status IN ('matched', 'executed')
                    //           AND luq.execution_results IS NOT NULL
                    //           AND luq.received_at < $4::timestamp
                    //           AND (($2 IS NOT NULL AND luq.public_key = $2) OR ($3 IS NOT NULL AND luq.user_id = $3))
                    //       `, [parseInt(rule_id), executedPublicKey || null, userId || null, executionTime]);
                    //     } catch (cleanupError) {
                    //       console.error('[QueueCleanup] ⚠️ Background cleanup error:', cleanupError.message);
                    //     }
                    //   });
                    // }
                  } catch (rateLimitError) {
                    console.error(`[Smart Wallet] ⚠️ Error recording rule execution for rate limiting:`, rateLimitError.message);
                    // Don't fail the request if rate limit recording fails
                  }
                }
                
                // if (updateResult.rows.length > 0) {
                //   console.log(`[Smart Wallet] ✅ Rule ${rule_id} entry removed from execution_results. Remaining results:`, 
                //     updateResult.rows[0].execution_results ? JSON.stringify(updateResult.rows[0].execution_results, null, 2) : 'NULL (all entries removed)');
                // }
                
                if (updateResult.rowCount === 0) {
                  console.error(`[Smart Wallet] ⚠️ WARNING: No rows were updated! This means the query conditions didn't match.`);
                  // console.error(`[Smart Wallet] 🔍 Query used:`, markCompletedQuery.substring(0, 200) + '...');
                  // console.error(`[Smart Wallet] 🔍 Parameters:`, markCompletedParams);
                  
                  // Try to find what's actually in the database
                  const debugQuery = `
                    SELECT luq.id, luq.public_key, luq.user_id, luq.execution_results
                    FROM location_update_queue luq
                    WHERE luq.user_id = $1
                      AND luq.execution_results IS NOT NULL
                      AND EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(luq.execution_results) AS result
                        WHERE (result->>'rule_id')::integer = $2::integer
                      )
                    ORDER BY luq.id DESC
                    LIMIT 5
                  `;
                  const debugResult = await pool.query(debugQuery, [userId, parseInt(rule_id)]);
                  console.error(`[Smart Wallet] 🔍 Found ${debugResult.rows.length} location_update_queue entries with rule_id ${rule_id}:`);
                  for (const row of debugResult.rows) {
                    console.error(`[Smart Wallet] 🔍 Entry ID ${row.id}, public_key: ${row.public_key}, user_id: ${row.user_id}`);
                    const execResults = row.execution_results || [];
                    for (const result of execResults) {
                      if (result.rule_id === parseInt(rule_id)) {
                        console.error(`[Smart Wallet] 🔍 Rule ${rule_id} in entry ${row.id}:`, {
                          rule_id: result.rule_id,
                          skipped: result.skipped,
                          completed: result.completed,
                          matched_public_key: result.matched_public_key,
                          has_update_id: !!update_id,
                          update_id_from_request: update_id,
                          matched_public_key_from_request: matched_public_key
                        });
                      }
                    }
                  }
                }
                
                // Verify the update - use the specific update_id if available
                let verifyQuery;
                let verifyParams;
                if (validUpdateId) {
                  verifyQuery = `
                    SELECT luq.id, luq.execution_results
                    FROM location_update_queue luq
                    WHERE luq.user_id = $1
                      AND luq.id = $2::integer
                      AND luq.execution_results IS NOT NULL
                  `;
                  verifyParams = [userId, validUpdateId];
                } else {
                  verifyQuery = checkQuery;
                  verifyParams = [userId, parseInt(rule_id)];
                }
                
                const verifyResult = await pool.query(verifyQuery, verifyParams);
                if (verifyResult.rows.length > 0) {
                  console.log(`[Smart Wallet] ✅ Verified execution_results after update (update_id: ${update_id || 'N/A'}):`, JSON.stringify(verifyResult.rows[0].execution_results, null, 2));
                  
                  // Check if the rule is actually marked as completed
                  const execResults = verifyResult.rows[0].execution_results || [];
                  const ruleResult = execResults.find(r => r.rule_id === parseInt(rule_id));
                  if (ruleResult) {
                    if (ruleResult.completed) {
                      console.log(`[Smart Wallet] ✅ Rule ${rule_id} is correctly marked as completed`);
                    } else {
                      console.error(`[Smart Wallet] ❌ Rule ${rule_id} is NOT marked as completed!`, {
                        skipped: ruleResult.skipped,
                        completed: ruleResult.completed,
                        success: ruleResult.success,
                        matched_public_key: ruleResult.matched_public_key
                      });
                    }
                  } else {
                    console.error(`[Smart Wallet] ❌ Rule ${rule_id} not found in execution_results after update!`);
                  }
                } else {
                  console.error(`[Smart Wallet] ❌ Verification query returned no rows! update_id: ${update_id || 'N/A'}`);
                }
              } else {
                console.warn(`[Smart Wallet] ⚠️ No location_update_queue entry found with rule_id ${rule_id} for user ${userId}`);
              }
            }
          } catch (updateError) {
            // Don't fail the payment if we can't update the status
            console.error(`[Smart Wallet] ❌ Error marking rule ${rule_id} as completed:`, updateError);
            console.error(`[Smart Wallet] ❌ Error details:`, {
              message: updateError.message,
              stack: updateError.stack,
              name: updateError.name,
              code: updateError.code,
              rule_id: rule_id,
              update_id: update_id,
              matched_public_key: matched_public_key,
              userId: req.user?.id || req.userId
            });
          }
        } else {
          console.log(`[Smart Wallet] ℹ️ No rule_id provided, skipping rule completion marking`);
        }
        
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger 
        });
      } else if (txResult.status === 'FAILED') {
        console.error(`[Smart Wallet] ❌ Payment failed - Result: ${txResult.resultXdr || txResult.errorResultXdr}`);
        throw new Error(`Payment failed: ${txResult.resultXdr || txResult.errorResultXdr}`);
      }
    }

    console.error('[Smart Wallet] ❌ Payment timeout - transaction did not complete within 20 seconds');
    throw new Error('Payment timeout');
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error executing payment:', error);
    console.error('[Smart Wallet] 📋 Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      rule_id: req.body.rule_id,
      update_id: req.body.update_id,
      matched_public_key: req.body.matched_public_key,
      userPublicKey: req.body.userPublicKey?.substring(0, 8) + '...',
      has_userId: !!req.user?.id
    });
    
    // Check if this is a WebAuthn signature verification error
    let errorMessage = error.message;
    let errorDetails = {};
    
    if (error.message && error.message.includes('failed secp256r1 verification')) {
      errorMessage = 'WebAuthn signature verification failed. This usually means:';
      errorDetails = {
        possibleCauses: [
          'The passkey is not registered in the smart wallet contract. Please register your passkey first.',
          'The passkey public key does not match the one registered in the contract.',
          'The signature payload does not match what was signed during authentication.',
          'The signature format is incorrect or corrupted.'
        ],
        suggestion: 'Please ensure your passkey is registered in the smart wallet contract before attempting to execute payments.',
        originalError: error.message
      };
    } else if (error.message && error.message.includes('InvalidInput')) {
      errorMessage = 'WebAuthn signature verification failed due to invalid input.';
      errorDetails = {
        possibleCauses: [
          'The passkey public key format is incorrect.',
          'The signature format is invalid.',
          'The signature payload, authenticator data, or client data is malformed.'
        ],
        suggestion: 'Please try re-authenticating with your passkey and ensure all WebAuthn data is correctly formatted.',
        originalError: error.message
      };
    } else {
      // For other errors, include the full error message and stack
      errorDetails = {
        originalError: error.message,
        stack: error.stack,
        code: error.code
      };
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: errorDetails
    });
  }
});

/**
 * POST /api/smart-wallet/register-signer
 * Register a user's passkey on the smart wallet contract
 * Body: { userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId }
 */
router.post('/register-signer', authenticateUser, async (req, res) => {
  console.log('[Smart Wallet] 🔐 Register signer request received');
  try {
    const { userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId } = req.body;

    console.log(`[Smart Wallet] 📋 Register signer params - User: ${userPublicKey}, RP ID: ${rpId || 'default'}`);

    if (!userPublicKey || !userSecretKey || !passkeyPublicKeySPKI) {
      console.error('[Smart Wallet] ❌ Missing required parameters');
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, and passkeyPublicKeySPKI are required' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    // console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    console.log(`[Smart Wallet] 📝 Using Smart Wallet Contract: ${contracts.SMART_WALLET_CONTRACT_ID}`);
    const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);

    // Extract 65-byte public key from SPKI
    const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
    let passkeyPubkeyBytes;

    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
      // Already in correct format
      passkeyPubkeyBytes = spkiBytes;
    } else {
      // Extract from SPKI format
      passkeyPubkeyBytes = extractPublicKeyFromSPKI(spkiBytes);
    }

    // Generate RP ID hash (32 bytes)
    const { generateRPIdHash } = require('../utils/webauthnUtils');
    const rpIdHash = generateRPIdHash(rpId || req.headers.host || 'localhost');

    // Create user address ScVal
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    // Create Bytes ScVals
    const passkeyPubkeyScVal = StellarSdk.xdr.ScVal.scvBytes(passkeyPubkeyBytes);
    const rpIdHashScVal = StellarSdk.xdr.ScVal.scvBytes(rpIdHash);

    // Call register_signer
    const registerOp = contract.call(
      'register_signer',
      userScVal,
      passkeyPubkeyScVal,
      rpIdHashScVal
    );

    // Build transaction
    console.log(`[Smart Wallet] 🔍 Loading account ${userPublicKey}...`);
    const account = await sorobanServer.getAccount(userPublicKey);
    console.log(`[Smart Wallet] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    
    console.log('[Smart Wallet] 🔨 Building register_signer transaction...');
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
    // Commented out verbose vault balance transaction log
    // console.log('[Smart Wallet] ✅ Transaction built');

    // Prepare and sign
    console.log('[Smart Wallet] 🔄 Preparing transaction...');
    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    console.log('[Smart Wallet] ✅ Transaction prepared');
    
    console.log('[Smart Wallet] ✍️ Signing transaction...');
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);
    console.log('[Smart Wallet] ✅ Transaction signed');

    // Send transaction
    console.log('[Smart Wallet] 📤 Sending transaction to network...');
    const sendResult = await sorobanServer.sendTransaction(preparedTx);
    console.log(`[Smart Wallet] ✅ Transaction sent - Hash: ${sendResult.hash}`);

    // Poll for result
    console.log('[Smart Wallet] ⏳ Polling for transaction result...');
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      console.log(`[Smart Wallet] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
      if (txResult.status === 'SUCCESS') {
        console.log(`[Smart Wallet] ✅ Signer registration successful - Hash: ${sendResult.hash}`);
        return res.json({ 
          success: true, 
          hash: sendResult.hash 
        });
      } else if (txResult.status === 'FAILED') {
        console.error(`[Smart Wallet] ❌ Registration failed - Result: ${txResult.resultXdr || txResult.errorResultXdr}`);
        throw new Error(`Registration failed: ${txResult.resultXdr || txResult.errorResultXdr}`);
      }
    }

    console.error('[Smart Wallet] ❌ Registration timeout - transaction did not complete within 20 seconds');
    throw new Error('Registration timeout');
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error registering signer:', error);
    console.error('[Smart Wallet] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Handle payment with signed XDR (secure - no secret key on server)
 */
async function handleSignedXDRPayment(req, res, params) {
  const {
    signedXDR,
    userPublicKey,
    destinationAddress,
    amount,
    assetAddress,
    signaturePayload,
    passkeyPublicKeySPKI,
    webauthnSignature,
    webauthnAuthenticatorData,
    webauthnClientData,
    rule_id,
    matched_public_key
  } = params;

  try {
    const StellarSdk = require('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;

    // Validate signed XDR
    let transaction;
    try {
      transaction = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
      
      if (!transaction.signatures || transaction.signatures.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signed XDR',
          details: 'Transaction has no signatures'
        });
      }

      // Verify transaction source matches userPublicKey
      if (transaction.source !== userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'Transaction source mismatch',
          details: `Transaction source ${transaction.source} does not match userPublicKey ${userPublicKey}`
        });
      }

      console.log('[Smart Wallet] ✅ Signed XDR validated for payment:', {
        source: transaction.source,
        operationCount: transaction.operations.length,
        signatureCount: transaction.signatures.length
      });
    } catch (xdrError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid signed XDR format',
        details: xdrError.message
      });
    }

    // Verify WebAuthn challenge (same as deposit)
    let signaturePayloadBuffer;
    if (typeof signaturePayload === 'string') {
      try {
        JSON.parse(signaturePayload);
        signaturePayloadBuffer = Buffer.from(signaturePayload, 'utf8');
      } catch (e) {
        if (signaturePayload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(signaturePayload.replace('0x', ''))) {
          signaturePayloadBuffer = Buffer.from(signaturePayload.replace('0x', ''), 'hex');
        } else {
          signaturePayloadBuffer = Buffer.from(signaturePayload, 'base64');
        }
      }
    } else {
      signaturePayloadBuffer = Buffer.from(signaturePayload);
    }

    const first32Bytes = signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length));
    const padded32Bytes = Buffer.alloc(32);
    first32Bytes.copy(padded32Bytes, 0);
    const expectedChallengeBase64Url = padded32Bytes.toString('base64url');

    let actualChallengeBase64Url = null;
    try {
      const clientDataJSONString = Buffer.from(webauthnClientData, 'base64').toString('utf8');
      const clientData = JSON.parse(clientDataJSONString);
      actualChallengeBase64Url = clientData.challenge;
    } catch (e) {
      console.warn('[Smart Wallet] ⚠️ Could not parse clientDataJSON for challenge verification:', e.message);
    }

    if (expectedChallengeBase64Url !== actualChallengeBase64Url) {
      return res.status(400).json({
        success: false,
        error: 'WebAuthn challenge mismatch',
        details: 'The challenge in clientDataJSON does not match the first 32 bytes of signaturePayload.',
        expectedChallenge: expectedChallengeBase64Url,
        actualChallenge: actualChallengeBase64Url
      });
    }

    // Send signed transaction directly (already signed, no need to sign again)
    console.log('[Smart Wallet] 📤 Sending signed payment transaction to network...');
    const sendResult = await sorobanServer.sendTransaction(transaction);
    console.log(`[Smart Wallet] ✅ Payment transaction sent - Hash: ${sendResult.hash}`);

    // PUBLIC-FRIENDLY LOG: Payment transaction submitted (for GeoLink Events feed)
    if (rule_id) {
      console.log(`[GeoLink Events] ✅ Payment transaction submitted for Rule ${rule_id}: ${sendResult.hash}`);
    } else {
      console.log(`[GeoLink Events] ✅ Payment transaction submitted: ${sendResult.hash}`);
    }

    // Poll for result
    console.log('[Smart Wallet] ⏳ Polling for transaction result...');
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      console.log(`[Smart Wallet] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
      if (txResult.status === 'SUCCESS') {
        console.log(`[Smart Wallet] ✅ Payment successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger 
        });
      } else if (txResult.status === 'FAILED') {
        console.error(`[Smart Wallet] ❌ Payment failed - Hash: ${sendResult.hash}`);
        return res.status(400).json({
          success: false,
          error: 'Payment transaction failed',
          hash: sendResult.hash,
          result: txResult.resultXdr || txResult.errorResultXdr
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Transaction timeout',
      hash: sendResult.hash,
      message: 'Transaction did not complete within 20 seconds'
    });
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error in signed XDR payment:', error);
    return res.status(500).json({
      success: false,
      error: 'Payment failed',
      details: error.message
    });
  }
}

/**
 * Handle deposit with signed XDR (secure - no secret key on server)
 */
async function handleSignedXDRDeposit(req, res, params) {
  const {
    signedXDR,
    userPublicKey,
    amount,
    signaturePayload,
    passkeyPublicKeySPKI,
    webauthnSignature,
    webauthnAuthenticatorData,
    webauthnClientData
  } = params;

  try {
    const StellarSdk = require('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;

    // Validate signed XDR
    let transaction;
    try {
      transaction = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
      
      if (!transaction.signatures || transaction.signatures.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signed XDR',
          details: 'Transaction has no signatures'
        });
      }

      // Verify transaction source matches userPublicKey
      if (transaction.source !== userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'Transaction source mismatch',
          details: `Transaction source ${transaction.source} does not match userPublicKey ${userPublicKey}`
        });
      }

      console.log('[Smart Wallet] ✅ Signed XDR validated:', {
        source: transaction.source,
        operationCount: transaction.operations.length,
        signatureCount: transaction.signatures.length
      });
    } catch (xdrError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid signed XDR format',
        details: xdrError.message
      });
    }

    // Verify WebAuthn challenge (same as before)
    let signaturePayloadBuffer;
    if (typeof signaturePayload === 'string') {
      try {
        JSON.parse(signaturePayload);
        signaturePayloadBuffer = Buffer.from(signaturePayload, 'utf8');
      } catch (e) {
        if (signaturePayload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(signaturePayload.replace('0x', ''))) {
          signaturePayloadBuffer = Buffer.from(signaturePayload.replace('0x', ''), 'hex');
        } else {
          signaturePayloadBuffer = Buffer.from(signaturePayload, 'base64');
        }
      }
    } else {
      signaturePayloadBuffer = Buffer.from(signaturePayload);
    }

    const first32Bytes = signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length));
    const padded32Bytes = Buffer.alloc(32);
    first32Bytes.copy(padded32Bytes, 0);
    const expectedChallengeBase64Url = padded32Bytes.toString('base64url');

    let actualChallengeBase64Url = null;
    try {
      const clientDataJSONString = Buffer.from(webauthnClientData, 'base64').toString('utf8');
      const clientData = JSON.parse(clientDataJSONString);
      actualChallengeBase64Url = clientData.challenge;
    } catch (e) {
      console.warn('[Smart Wallet] ⚠️ Could not parse clientDataJSON for challenge verification:', e.message);
    }

    if (expectedChallengeBase64Url !== actualChallengeBase64Url) {
      return res.status(400).json({
        success: false,
        error: 'WebAuthn challenge mismatch',
        details: 'The challenge in clientDataJSON does not match the first 32 bytes of signaturePayload.',
        expectedChallenge: expectedChallengeBase64Url,
        actualChallenge: actualChallengeBase64Url
      });
    }

    // Note: For signed XDR, we can't auto-register passkey because we don't have userSecretKey
    // But we can at least check if the passkey is registered and fail early with a clear error
    if (passkeyPublicKeySPKI) {
      console.log('[Smart Wallet] ⚠️ Passkey auto-registration skipped (signed XDR mode - no secret key available)');
      console.log('[Smart Wallet] 🔍 Checking if passkey is registered (read-only check)...');
      
      try {
        const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);
        const userScAddressForCheck = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
          StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey))
        );
        const userScValForCheck = StellarSdk.xdr.ScVal.scvAddress(userScAddressForCheck);
        
        const getPasskeyOp = contract.call('get_passkey_pubkey', userScValForCheck);
        const horizonServer = new StellarSdk.Horizon.Server(contracts.HORIZON_URL);
        const accountForCheck = await horizonServer.loadAccount(userPublicKey);
        const checkTx = new StellarSdk.TransactionBuilder(
          new StellarSdk.Account(userPublicKey, accountForCheck.sequenceNumber()),
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
            
            // Extract passkey from SPKI
            const { extractPublicKeyFromSPKI } = require('../utils/webauthnUtils');
            const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
            let signingPubkeyBytes;
            if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
              signingPubkeyBytes = spkiBytes;
            } else {
              signingPubkeyBytes = extractPublicKeyFromSPKI(spkiBytes);
            }
            const signingPubkeyHex = Buffer.from(signingPubkeyBytes).toString('hex');
            
            console.log('[Smart Wallet] 🔍 Passkey check:', {
              registered: registeredPubkeyHex.substring(0, 32) + '...',
              signing: signingPubkeyHex.substring(0, 32) + '...',
              match: registeredPubkeyHex === signingPubkeyHex
            });
            
            if (registeredPubkeyHex !== signingPubkeyHex) {
              console.error('[Smart Wallet] ❌ Passkey mismatch detected!');
              return res.status(400).json({
                success: false,
                error: 'Passkey mismatch',
                details: 'The passkey used for signing does not match the passkey registered on the contract. The contract stores only one passkey per public key.',
                suggestion: 'Please use the same passkey that is registered on the contract, or register the passkey before attempting the deposit.',
                registeredPasskey: registeredPubkeyHex.substring(0, 32) + '...',
                signingPasskey: signingPubkeyHex.substring(0, 32) + '...',
                note: 'To register the passkey, you need to call the register_signer function on the smart wallet contract. This requires your secret key, so it cannot be done with signed XDR alone.'
              });
            } else {
              console.log('[Smart Wallet] ✅ Passkey is registered and matches');
            }
          } else {
            console.warn('[Smart Wallet] ⚠️ Could not parse registered passkey, proceeding anyway');
          }
        } else {
          console.error('[Smart Wallet] ❌ Passkey is NOT registered on the contract!');
          return res.status(400).json({
            success: false,
            error: 'Passkey not registered',
            details: 'The passkey is not registered on the smart wallet contract. The contract requires the passkey to be registered before deposits can be made.',
            suggestion: 'Please register the passkey before attempting the deposit. This requires your secret key, so it cannot be done with signed XDR alone. You can register the passkey by calling the register_signer function on the smart wallet contract.',
            note: 'If you are using the GeoLink app, the passkey should be automatically registered when you first connect. If you are using XYZ-Wallet, make sure the passkey is registered before attempting deposits.'
          });
        }
      } catch (checkError) {
        console.warn('[Smart Wallet] ⚠️ Could not check passkey registration:', checkError.message);
        console.warn('[Smart Wallet] ⚠️ Proceeding anyway - contract will validate and return false if not registered');
      }
    }

    // Send signed transaction directly (already signed, no need to sign again)
    console.log('[Smart Wallet] 📤 Sending signed transaction to network...');
    const sendResult = await sorobanServer.sendTransaction(transaction);
    console.log(`[Smart Wallet] ✅ Transaction sent - Hash: ${sendResult.hash}`);

    // Poll for result
    console.log('[Smart Wallet] ⏳ Polling for transaction result...');
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      console.log(`[Smart Wallet] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
      if (txResult.status === 'SUCCESS') {
        // Check contract return value - even if transaction succeeded, contract might have returned false
        let contractReturnedFalse = false;
        let contractLogs = [];
        
        if (txResult.resultMetaXdr) {
          try {
            // Handle both string (base64) and already-parsed XDR
            let txMeta;
            if (typeof txResult.resultMetaXdr === 'string') {
              txMeta = StellarSdk.xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64');
            } else {
              // Already parsed, use directly
              txMeta = txResult.resultMetaXdr;
            }
            // Check if v3 is available (Soroban transactions)
            let sorobanMeta = null;
            try {
              if (txMeta.v3) {
                sorobanMeta = txMeta.v3().sorobanMeta();
              }
            } catch (v3Error) {
              // Transaction might not have Soroban metadata (e.g., classic Stellar transaction)
              console.log(`[Smart Wallet] ℹ️ Transaction does not have Soroban metadata (v3 not available) - this is normal for classic Stellar transactions`);
            }
            if (sorobanMeta) {
              // Extract contract logs for debugging
              contractLogs = sorobanMeta.logs().map(log => log.toString());
              
              // Extract contract return value
              const returnVal = sorobanMeta.returnValue();
              if (returnVal) {
                console.log(`[Smart Wallet] 📋 Contract returned: ${returnVal.toXDR('base64')} (type: ${returnVal.switch().name})`);
                if (returnVal.isB()) { // Check if it's a boolean
                  const boolVal = returnVal.b();
                  console.log(`[Smart Wallet] 📋 Contract returned boolean: ${boolVal}`);
                  if (!boolVal) {
                    contractReturnedFalse = true;
                    console.error(`[Smart Wallet] ❌ CONTRACT REJECTED DEPOSIT: Contract function returned 'false'`);
                    console.error(`[Smart Wallet] ❌ This usually indicates an internal contract logic failure (e.g., insufficient balance, invalid parameters, WebAuthn failure)`);
                    if (contractLogs.length > 0) {
                      console.error(`[Smart Wallet] 📋 Contract logs:`, contractLogs);
                    }
                  }
                }
              }
            }
          } catch (metaError) {
            console.warn(`[Smart Wallet] ⚠️ Could not parse transaction metadata:`, metaError.message);
          }
        }
        
        if (contractReturnedFalse) {
          return res.status(400).json({
            success: false,
            error: 'Contract rejected deposit',
            message: 'The smart contract function returned false, indicating a rejection.',
            hash: sendResult.hash,
            ledger: txResult.ledger,
            contract_logs: contractLogs,
            possible_reasons: [
              'Insufficient balance in Stellar account (contract checks token_client.balance())',
              'WebAuthn signature verification failed',
              'Passkey not registered or mismatch',
              'Invalid parameters (asset, amount, user_address)',
              'Token allowance insufficient (for transfer_from operations)'
            ]
          });
        }
        
        console.log(`[Smart Wallet] ✅ Deposit successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger,
          contract_logs: contractLogs.length > 0 ? contractLogs : undefined
        });
      } else if (txResult.status === 'FAILED') {
        console.error(`[Smart Wallet] ❌ Deposit failed - Hash: ${sendResult.hash}`);
        return res.status(400).json({
          success: false,
          error: 'Deposit transaction failed',
          hash: sendResult.hash,
          result: txResult.resultXdr || txResult.errorResultXdr
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Transaction timeout',
      hash: sendResult.hash,
      message: 'Transaction did not complete within 20 seconds'
    });
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error in signed XDR deposit:', error);
    return res.status(500).json({
      success: false,
      error: 'Deposit failed',
      details: error.message
    });
  }
}

/**
 * POST /api/smart-wallet/deposit
 * Deposit tokens into smart wallet using WebAuthn signature
 * Body: {
 *   userPublicKey, userSecretKey (or signedXDR), amount (in stroops),
 *   assetAddress, signaturePayload, passkeyPublicKeySPKI,
 *   webauthnSignature, webauthnAuthenticatorData, webauthnClientData
 * }
 */
router.post('/deposit', authenticateUser, validateSignedXDR, async (req, res) => {
  console.log('[Smart Wallet] 💸 Deposit request received');
  try {
    const {
      userPublicKey,
      userSecretKey, // Optional - only used if signedXDR is not provided (backward compatibility)
      signedXDR, // Preferred: Signed transaction XDR (secret key never sent to server)
      amount, // In stroops (1 XLM = 10,000,000 stroops)
      assetAddress,
      signaturePayload, // Transaction data JSON string
      passkeyPublicKeySPKI, // Base64 SPKI format
      webauthnSignature, // Base64 DER-encoded signature (70-72 bytes)
      webauthnAuthenticatorData, // Base64
      webauthnClientData, // Base64
    } = req.body;

    console.log(`[Smart Wallet] 📋 Deposit params - User: ${userPublicKey}, Amount: ${amount} stroops (${parseFloat(amount) / 10000000} XLM), Asset: ${assetAddress || 'native'}`);
    console.log(`[Smart Wallet] 🔐 Using ${signedXDR ? 'signed XDR (secure)' : 'server-side signing (less secure - backward compatibility)'}`);

    // Prefer signed XDR over secret key (more secure)
    if (signedXDR) {
      // Validate and submit signed XDR directly (no secret key needed)
      return await handleSignedXDRDeposit(req, res, {
        signedXDR,
        userPublicKey,
        amount,
        signaturePayload,
        passkeyPublicKeySPKI,
        webauthnSignature,
        webauthnAuthenticatorData,
        webauthnClientData
      });
    }

    // Backward compatibility: Use server-side signing if signedXDR not provided
    if (!userPublicKey || !userSecretKey || !amount) {
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey (or signedXDR), and amount are required' 
      });
    }

    if (!signaturePayload || !webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData) {
      return res.status(400).json({ 
        error: 'signaturePayload, webauthnSignature, webauthnAuthenticatorData, and webauthnClientData are required' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);
    
    // Initialize Horizon server for account loading
    const horizonServer = new StellarSdk.Horizon.Server(contracts.HORIZON_URL);

    // Decode DER signature to raw 64-byte format
    const derSignatureBytes = Buffer.from(webauthnSignature, 'base64');
    let rawSignature64;

    console.log(`[Smart Wallet] 📝 Signature processing - Length: ${derSignatureBytes.length} bytes`);
    
    if (derSignatureBytes.length === 64) {
      // Already raw bytes - normalize it
      console.log('[Smart Wallet] 📝 Signature is already 64 bytes, normalizing...');
      rawSignature64 = normalizeECDSASignature(derSignatureBytes);
    } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
      // DER-encoded signature - decode and normalize
      console.log('[Smart Wallet] 📝 Signature is DER-encoded, decoding and normalizing...');
      try {
        const decodedSignature = decodeDERSignature(derSignatureBytes);
        rawSignature64 = normalizeECDSASignature(decodedSignature);
        console.log('[Smart Wallet] ✅ Decoded and normalized DER signature');
      } catch (error) {
        console.error('[Smart Wallet] ❌ Failed to decode DER signature:', error.message);
        return res.status(400).json({
          success: false,
          error: 'Failed to decode DER signature',
          details: error.message
        });
      }
    } else {
      console.error(`[Smart Wallet] ❌ Invalid signature length: ${derSignatureBytes.length} bytes`);
      return res.status(400).json({
        success: false,
        error: 'Invalid signature length',
        details: `Signature must be 64 bytes (raw) or 70-72 bytes (DER), got ${derSignatureBytes.length}`
      });
    }
    
    if (rawSignature64.length !== 64) {
      console.error(`[Smart Wallet] ❌ Invalid signature length after decoding: ${rawSignature64.length} bytes`);
      return res.status(400).json({
        success: false,
        error: 'Invalid signature length after decoding',
        details: `Decoded signature must be 64 bytes, got ${rawSignature64.length}`
      });
    }
    
    console.log(`[Smart Wallet] ✅ Signature processed - Final length: ${rawSignature64.length} bytes`);

    // Extract passkey public key from SPKI
    const spkiBytes = Buffer.from(passkeyPublicKeySPKI, 'base64');
    console.log(`[Smart Wallet] 📝 Passkey SPKI length: ${spkiBytes.length} bytes`);
    
    let passkeyPubkey65;
    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
      // Already in correct format (65 bytes, starts with 0x04)
      console.log('[Smart Wallet] 📝 Passkey public key already in 65-byte format');
      passkeyPubkey65 = spkiBytes;
    } else {
      // Extract from SPKI format
      console.log('[Smart Wallet] 📝 Extracting passkey public key from SPKI format...');
      passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);
    }
    
    console.log(`[Smart Wallet] ✅ Passkey public key extracted - Length: ${passkeyPubkey65.length} bytes, First byte: 0x${passkeyPubkey65[0].toString(16)}`);
    console.log(`[Smart Wallet] 📝 Extracted passkey public key (hex): ${passkeyPubkey65.toString('hex')}`);

    // Verify the registered passkey matches what we extracted
    // CRITICAL: The contract stores passkeys by Stellar public_key (address), not by user_id
    // If multiple roles share the same public_key, only the LAST registered passkey exists on the contract
    // We must use the passkey that's actually registered on the contract, not the one from the database
    console.log('[Smart Wallet] 🔍 Verifying registered passkey matches extracted passkey...');
    console.log('[Smart Wallet] ⚠️ Note: Contract stores passkeys by public_key, not user_id. If multiple roles share the same public_key, only the last registered passkey exists on the contract.');
    
    try {
      const userScAddressForCheck = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey))
      );
      const userScValForCheck = StellarSdk.xdr.ScVal.scvAddress(userScAddressForCheck);
      
      const getPasskeyOp = contract.call('get_passkey_pubkey', userScValForCheck);
      const accountForCheck = await horizonServer.loadAccount(userPublicKey);
      const checkTx = new StellarSdk.TransactionBuilder(
        new StellarSdk.Account(userPublicKey, accountForCheck.sequenceNumber()),
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
          
          console.log(`[Smart Wallet] 📋 Registered passkey on contract (hex): ${registeredPubkeyHex}`);
          console.log(`[Smart Wallet] 📋 Extracted passkey from request (hex): ${extractedPubkeyHex}`);
          
          if (registeredPubkeyHex !== extractedPubkeyHex) {
            console.error('[Smart Wallet] ❌ Passkey mismatch detected!');
            console.error('  The passkey registered on the contract does not match the passkey used for signing.');
            console.error('  This likely means you registered a passkey for a different role with the same public_key.');
            console.error('  The contract stores only ONE passkey per public_key (the last one registered).');
            return res.status(400).json({
              success: false,
              error: 'Passkey mismatch',
              details: 'The passkey public key registered on the contract does not match the passkey used for signing. This can happen if you have multiple roles (e.g., data consumer, wallet provider) with the same Stellar public key, and you registered different passkeys for each role. The contract stores only the last registered passkey per public key.',
              suggestion: 'Please use the same passkey that was last registered for this public key, or re-register the passkey for this role.',
              registeredPasskey: registeredPubkeyHex,
              extractedPasskey: extractedPubkeyHex
            });
          } else {
            console.log('[Smart Wallet] ✅ Registered passkey matches extracted passkey');
          }
        } else {
          console.warn('[Smart Wallet] ⚠️ Could not parse registered passkey, proceeding anyway');
        }
      } else {
        console.warn('[Smart Wallet] ⚠️ Could not retrieve registered passkey, proceeding anyway');
      }
    } catch (checkError) {
      console.error('[Smart Wallet] ❌ Error checking registered passkey:', checkError.message);
      console.error('[Smart Wallet] ❌ Stack:', checkError.stack);
      // Don't proceed if we can't verify - the contract will fail anyway
      return res.status(400).json({
        success: false,
        error: 'Failed to verify registered passkey',
        details: checkError.message,
        suggestion: 'Please ensure your passkey is registered on the smart wallet contract and matches the one you are using for signing.'
      });
    }

    // Create ScVals
    const userAddr = StellarSdk.Address.fromString(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey))
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    // For native XLM, use the Stellar Asset Contract (SAC) address
    // The token::Client requires a contract address, not an account address
    // Testnet SAC: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
    // Mainnet SAC: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC (same for both)
    let assetScAddress;
    if (assetAddress && assetAddress.startsWith('C')) {
      // Contract address (including SAC for native XLM)
      const contractIdBytes = StellarSdk.StrKey.decodeContract(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractIdBytes);
    } else if (assetAddress && assetAddress.startsWith('G')) {
      // Account address (custom asset)
      const assetAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(assetAddress);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
        StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(assetAddressBytes)
      );
    } else {
      // Native XLM - use Stellar Asset Contract (SAC)
      const sacContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      const sacContractBytes = StellarSdk.StrKey.decodeContract(sacContractId);
      assetScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(sacContractBytes);
    }
    const assetScVal = StellarSdk.xdr.ScVal.scvAddress(assetScAddress);

    // Convert amount string to Int128 (split into hi and lo parts)
    // eslint-disable-next-line no-undef
    const amountBigInt = BigInt(amount);
    // eslint-disable-next-line no-undef
    const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF'); // 2^64 - 1
    // eslint-disable-next-line no-undef
    const lo = amountBigInt & maxUint64;
    // eslint-disable-next-line no-undef
    const hi = amountBigInt >> 64n;
    
    const amountI128 = new StellarSdk.xdr.Int128Parts({
      hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
      lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
    });
    const amountScVal = StellarSdk.xdr.ScVal.scvI128(amountI128);

    // Create signature payload buffer (same pattern as xyz-wallet)
    let signaturePayloadBuffer;
    if (typeof signaturePayload === 'string') {
      try {
        // Try to parse as JSON first - if it's valid JSON, it's deposit data
        JSON.parse(signaturePayload);
        signaturePayloadBuffer = Buffer.from(signaturePayload, 'utf8');
      } catch (e) {
        // Not JSON, try hex or base64 (fallback for old format)
        if (signaturePayload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(signaturePayload.replace('0x', ''))) {
          signaturePayloadBuffer = Buffer.from(signaturePayload.replace('0x', ''), 'hex');
        } else {
          signaturePayloadBuffer = Buffer.from(signaturePayload, 'base64');
        }
      }
    } else {
      signaturePayloadBuffer = Buffer.from(signaturePayload);
    }
    
    // Verify challenge matches (same as xyz-wallet)
    // Extract first 32 bytes for challenge verification
    const first32Bytes = signaturePayloadBuffer.slice(0, Math.min(32, signaturePayloadBuffer.length));
    const padded32Bytes = Buffer.alloc(32);
    first32Bytes.copy(padded32Bytes, 0);
    
    // Base64url-encode the first 32 bytes (same as verifier contract does)
    const expectedChallengeBase64Url = padded32Bytes.toString('base64url');
    
    // Decode clientDataJSON to check the actual challenge
    let actualChallengeBase64Url = null;
    try {
      const clientDataJSONString = Buffer.from(webauthnClientData, 'base64').toString('utf8');
      const clientData = JSON.parse(clientDataJSONString);
      actualChallengeBase64Url = clientData.challenge;
    } catch (e) {
      console.warn('[Smart Wallet] ⚠️ Could not parse clientDataJSON for challenge verification:', e.message);
    }
    
    console.log('[Smart Wallet] 📋 Challenge verification:', {
      signaturePayloadLength: signaturePayloadBuffer.length,
      first32Bytes: padded32Bytes.toString('hex'),
      expectedChallengeBase64Url: expectedChallengeBase64Url,
      actualChallengeBase64Url: actualChallengeBase64Url,
      challengesMatch: expectedChallengeBase64Url === actualChallengeBase64Url
    });
    
    if (expectedChallengeBase64Url !== actualChallengeBase64Url) {
      console.error('[Smart Wallet] ❌ Challenge mismatch detected!');
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
    
    console.log('[Smart Wallet] ✅ Challenge verification passed');

    const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(signaturePayloadBuffer);
    const webauthnSignatureScVal = StellarSdk.xdr.ScVal.scvBytes(rawSignature64);
    const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(webauthnAuthenticatorData, 'base64')
    );
    const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(webauthnClientData, 'base64')
    );
    
    // Log signature and public key details for debugging
    console.log('[Smart Wallet] 🔍 WebAuthn signature details:', {
      signatureLength: rawSignature64.length,
      signatureHex: rawSignature64.toString('hex').substring(0, 32) + '...',
      signatureR: rawSignature64.slice(0, 32).toString('hex'),
      signatureS: rawSignature64.slice(32, 64).toString('hex'),
      authenticatorDataLength: Buffer.from(webauthnAuthenticatorData, 'base64').length,
      clientDataLength: Buffer.from(webauthnClientData, 'base64').length,
      passkeyPubkeyLength: passkeyPubkey65.length,
      passkeyPubkeyHex: passkeyPubkey65.toString('hex').substring(0, 32) + '...'
    });

    // Call deposit function
    // Note: The contract signature is: deposit(user_address, asset, amount, signature_payload, webauthn_signature, webauthn_authenticator_data, webauthn_client_data)
    // The passkey public key is NOT passed - the contract looks it up from registered signers
    const contractCallOp = contract.call(
      'deposit',
      userScVal,
      assetScVal,
      amountScVal,
      signaturePayloadScVal,
      webauthnSignatureScVal,
      authenticatorDataScVal,
      clientDataScVal
    );

    // Ensure passkey is registered (auto-register if not)
    // Check synchronously first, then register if needed (with timeout)
    // Only attempt auto-registration if passkeyPublicKeySPKI is provided
    if (passkeyPublicKeySPKI) {
      const rpId = req.body.rpId || req.headers.host || 'localhost';
      console.log('[Smart Wallet] 🔍 Checking if passkey is registered...');
      
      try {
        // Check if passkey is registered with a timeout
        const registrationPromise = ensurePasskeyRegistered(userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Passkey registration timeout after 15 seconds')), 15000)
        );
        
        const isRegistered = await Promise.race([registrationPromise, timeoutPromise]);
        
        if (isRegistered) {
          console.log('[Smart Wallet] ✅ Passkey is registered, proceeding with deposit');
        } else {
          console.warn('[Smart Wallet] ⚠️ Passkey registration failed, but proceeding anyway (contract will fail if not registered)');
        }
      } catch (regError) {
        console.error('[Smart Wallet] ❌ Error during passkey registration check:', regError.message);
        // Continue anyway - contract will fail with a clear error if passkey isn't registered
        console.warn('[Smart Wallet] ⚠️ Proceeding with deposit execution (contract will validate passkey)');
      }
    } else {
      console.warn('[Smart Wallet] ⚠️ passkeyPublicKeySPKI not provided, skipping auto-registration');
    }

    // Build transaction
    console.log(`[Smart Wallet] 🔍 Loading account ${userPublicKey} from Horizon: ${contracts.HORIZON_URL}`);
    // horizonServer is already initialized earlier in the function
    const account = await horizonServer.loadAccount(userPublicKey);
    console.log(`[Smart Wallet] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    
    console.log('[Smart Wallet] 🔨 Building deposit transaction...');
    const transaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(userPublicKey, account.sequenceNumber()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(contractCallOp)
      .setTimeout(30)
      .build();

    // Prepare transaction (adds authorization entries)
    console.log('[Smart Wallet] 🔄 Preparing transaction (adding authorization entries)...');
    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    console.log('[Smart Wallet] ✅ Transaction prepared');

    // Sign transaction
    console.log('[Smart Wallet] ✍️ Signing transaction...');
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);
    console.log('[Smart Wallet] ✅ Transaction signed');

    // Send transaction
    console.log('[Smart Wallet] 📤 Sending transaction to network...');
    const sendResult = await sorobanServer.sendTransaction(preparedTx);
    console.log(`[Smart Wallet] ✅ Transaction sent - Hash: ${sendResult.hash}`);

    // Poll for result
    console.log('[Smart Wallet] ⏳ Polling for transaction result...');
    let txResult = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      txResult = await sorobanServer.getTransaction(sendResult.hash);
      console.log(`[Smart Wallet] 📊 Poll attempt ${i + 1}/10 - Status: ${txResult.status}`);
      if (txResult.status === 'SUCCESS') {
        // Check contract return value - even if transaction succeeded, contract might have returned false
        let contractReturnedFalse = false;
        let contractLogs = [];
        
        if (txResult.resultMetaXdr) {
          try {
            // Handle both string (base64) and already-parsed XDR
            let txMeta;
            if (typeof txResult.resultMetaXdr === 'string') {
              txMeta = StellarSdk.xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64');
            } else {
              // Already parsed, use directly
              txMeta = txResult.resultMetaXdr;
            }
            // Check if v3 is available (Soroban transactions)
            let sorobanMeta = null;
            try {
              if (txMeta.v3) {
                sorobanMeta = txMeta.v3().sorobanMeta();
              }
            } catch (v3Error) {
              // Transaction might not have Soroban metadata (e.g., classic Stellar transaction)
              console.log(`[Smart Wallet] ℹ️ Transaction does not have Soroban metadata (v3 not available) - this is normal for classic Stellar transactions`);
            }
            if (sorobanMeta) {
              // Extract contract logs for debugging
              contractLogs = sorobanMeta.logs().map(log => log.toString());
              
              // Extract contract return value
              const returnVal = sorobanMeta.returnValue();
              if (returnVal) {
                console.log(`[Smart Wallet] 📋 Contract returned: ${returnVal.toXDR('base64')} (type: ${returnVal.switch().name})`);
                if (returnVal.isB()) { // Check if it's a boolean
                  const boolVal = returnVal.b();
                  console.log(`[Smart Wallet] 📋 Contract returned boolean: ${boolVal}`);
                  if (!boolVal) {
                    contractReturnedFalse = true;
                    console.error(`[Smart Wallet] ❌ CONTRACT REJECTED DEPOSIT: Contract function returned 'false'`);
                    console.error(`[Smart Wallet] ❌ This usually indicates an internal contract logic failure (e.g., insufficient balance, invalid parameters, WebAuthn failure)`);
                    if (contractLogs.length > 0) {
                      console.error(`[Smart Wallet] 📋 Contract logs:`, contractLogs);
                    }
                  }
                }
              }
            }
          } catch (metaError) {
            console.warn(`[Smart Wallet] ⚠️ Could not parse transaction metadata:`, metaError.message);
          }
        }
        
        if (contractReturnedFalse) {
          return res.status(400).json({
            success: false,
            error: 'Contract rejected deposit',
            message: 'The smart contract function returned false, indicating a rejection.',
            hash: sendResult.hash,
            ledger: txResult.ledger,
            contract_logs: contractLogs,
            possible_reasons: [
              'Insufficient balance in Stellar account (contract checks token_client.balance())',
              'WebAuthn signature verification failed',
              'Passkey not registered or mismatch',
              'Invalid parameters (asset, amount, user_address)',
              'Token allowance insufficient (for transfer_from operations)'
            ]
          });
        }
        
        console.log(`[Smart Wallet] ✅ Deposit successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger,
          contract_logs: contractLogs.length > 0 ? contractLogs : undefined
        });
      } else if (txResult.status === 'FAILED') {
        console.error(`[Smart Wallet] ❌ Deposit failed - Result: ${txResult.resultXdr || txResult.errorResultXdr}`);
        throw new Error(`Deposit failed: ${txResult.resultXdr || txResult.errorResultXdr}`);
      }
    }

    console.error('[Smart Wallet] ❌ Deposit timeout - transaction did not complete within 20 seconds');
    throw new Error('Deposit timeout');
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error depositing to smart wallet:', error);
    console.error('[Smart Wallet] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/smart-wallet/vault-balance
 * Get total vault balance (sum of all user deposits)
 * Query params:
 *   - contractId: Smart wallet contract ID (optional, uses env var if not provided)
 *   - assetAddress: Asset contract address (optional, defaults to native XLM)
 */
router.get('/vault-balance', async (req, res) => {
  // console.log('[Smart Wallet] 🏦 Vault balance check request received');
  try {
    const { contractId, assetAddress } = req.query;

    // console.log(`[Smart Wallet] 📋 Request params - contractId: ${contractId || 'default'}, assetAddress: ${assetAddress || 'native'}`);

    const smartWalletContractId = contractId || contracts.SMART_WALLET_CONTRACT_ID;
    // console.log(`[Smart Wallet] 📝 Using contract ID: ${smartWalletContractId}`);

    if (!smartWalletContractId) {
      console.error('[Smart Wallet] ❌ Smart wallet contract ID not configured');
      return res.status(400).json({ 
        error: 'Smart wallet contract ID not configured' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    // console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    // For vault balance, we need to call the SAC token contract's balance function
    // with the smart wallet contract address, not the smart wallet contract's get_balance
    // This gives us the total balance of all tokens held by the smart wallet contract
    
    // Use SAC contract address for native XLM
    const sacContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    
    // Create token contract instance (SAC)
    const tokenContract = new StellarSdk.Contract(sacContractId);
    
    // Create smart wallet contract address ScVal
    const contractAddressBytes = StellarSdk.StrKey.decodeContract(smartWalletContractId);
    const contractScAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(contractAddressBytes);
    const contractScVal = StellarSdk.xdr.ScVal.scvAddress(contractScAddress);
    
    // Call token.balance(contract_address) to get the contract's total token balance
    const getBalanceOp = tokenContract.call('balance', contractScVal);
    
    // Create a dummy account for simulation (read-only call)
    const dummyKeypair = StellarSdk.Keypair.random();
    const dummyAccount = new StellarSdk.Account(dummyKeypair.publicKey(), '0');
    
    // Commented out verbose vault balance log
    // console.log('[Smart Wallet] 🔨 Building token.balance transaction for vault simulation...');
    const transaction = new StellarSdk.TransactionBuilder(
      dummyAccount,
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(getBalanceOp)
      .setTimeout(30)
      .build();
    // Commented out verbose vault balance transaction log
    // console.log('[Smart Wallet] ✅ Transaction built');

    let simulation;
    // Commented out verbose vault balance log
    // console.log('[Smart Wallet] 🔄 Simulating get_balance transaction for vault...');
    try {
      simulation = await sorobanServer.simulateTransaction(transaction);
      // Commented out verbose vault balance simulation log
      // console.log('[Smart Wallet] ✅ Simulation completed:', {
      //   hasResult: !!simulation.result,
      //   hasErrorResult: !!simulation.errorResult
      // });
    } catch (simError) {
      console.error('[Smart Wallet] ❌ Error simulating smart wallet vault balance transaction:', simError);
      console.error('[Smart Wallet] 📋 Simulation error details:', {
        message: simError.message,
        stack: simError.stack
      });
      return res.json({
        balance: '0',
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        error: 'Simulation failed - contract may not be initialized or account may not exist',
        details: simError.message
      });
    }

    if (simulation.errorResult) {
      const errorValue = simulation.errorResult.value();
      console.error('[Smart Wallet] ❌ Smart wallet vault simulation error:', errorValue);
      return res.status(400).json({
        error: 'Failed to get vault balance from smart wallet',
        details: errorValue.toString()
      });
    }

    if (!simulation.result || !simulation.result.retval) {
      console.warn('[Smart Wallet] ⚠️ No balance found or contract returned empty result');
      return res.json({
        balance: '0',
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        message: 'No balance found or contract returned empty result'
      });
    }

    const result = simulation.result.retval;
    let balance = '0';
    try {
      if (result.i128) {
        const parts = result.i128();
        const lo = parts.lo().toString();
        const hi = parts.hi().toString();
        balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
      } else {
        balance = result.toString() || '0';
      }
    } catch (parseError) {
      console.error('[Smart Wallet] ❌ Error parsing vault balance result:', parseError);
      return res.json({
        balance: '0',
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        error: 'Failed to parse vault balance result',
        details: parseError.message
      });
    }

    const balanceInXLM = (BigInt(balance) / 10000000n).toString();
    // Commented out verbose vault balance log
    // console.log(`[Smart Wallet] ✅ Vault balance retrieved - Raw: ${balance}, XLM: ${balanceInXLM}`);

    res.json({
      balance: balance,
      balanceInXLM: balanceInXLM,
      contractId: smartWalletContractId,
      assetAddress: assetAddress || 'native'
    });
  } catch (error) {
    console.error('[Smart Wallet] ❌ Error getting vault balance:', error);
    console.error('[Smart Wallet] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to get vault balance',
      details: error.message 
    });
  }
});

// Export ensurePasskeyRegistered for use in other routes (e.g., contracts.js)
module.exports = router;
module.exports.ensurePasskeyRegistered = ensurePasskeyRegistered;

