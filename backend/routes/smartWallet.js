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
const contracts = require('../config/contracts');
const { extractPublicKeyFromSPKI, decodeDERSignature, normalizeECDSASignature } = require('../utils/webauthnUtils');

/**
 * GET /api/smart-wallet/balance
 * Get user's balance from smart wallet contract
 * Query params:
 *   - userPublicKey: User's Stellar public key (required)
 *   - contractId: Smart wallet contract ID (optional, uses env var if not provided)
 *   - assetAddress: Asset contract address (optional, defaults to native XLM)
 */
router.get('/balance', authenticateUser, async (req, res) => {
  console.log('[Smart Wallet] 💰 Balance check request received');
  try {
    const { userPublicKey, contractId, assetAddress } = req.query; // Fixed: was req instead of req.query

    console.log(`[Smart Wallet] 📋 Request params - userPublicKey: ${userPublicKey}, contractId: ${contractId || 'default'}, assetAddress: ${assetAddress || 'native'}`);

    if (!userPublicKey) {
      console.error('[Smart Wallet] ❌ Missing userPublicKey parameter');
      return res.status(400).json({ 
        error: 'userPublicKey is required' 
      });
    }

    // Get smart wallet contract ID from query, env var, or use default from config
    const smartWalletContractId = contractId || contracts.SMART_WALLET_CONTRACT_ID;
    console.log(`[Smart Wallet] 📝 Using contract ID: ${smartWalletContractId}`);

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
    console.log(`[Smart Wallet] 🌐 Network: ${network}, Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
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
    console.log(`[Smart Wallet] 🔄 Simulating get_balance transaction for user ${userPublicKey}...`);
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

    console.log(`[Smart Wallet] ✅ Balance retrieved - User: ${userPublicKey}, Balance: ${balanceInXLM} XLM (${balanceInStroops} stroops)`);

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
router.post('/execute-payment', authenticateUser, async (req, res) => {
  console.log('[Smart Wallet] 💳 Execute payment request received');
  try {
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
    } = req.body;

    console.log(`[Smart Wallet] 📋 Payment params - From: ${userPublicKey}, To: ${destinationAddress}, Amount: ${amount} stroops (${parseFloat(amount) / 10000000} XLM), Asset: ${assetAddress || 'native'}`);

    if (!userPublicKey || !userSecretKey || !destinationAddress || !amount) {
      console.error('[Smart Wallet] ❌ Missing required parameters');
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, destinationAddress, and amount are required' 
      });
    }

    if (!signaturePayload || !webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData) {
      console.error('[Smart Wallet] ❌ Missing WebAuthn signature parameters');
      return res.status(400).json({ 
        error: 'signaturePayload, webauthnSignature, webauthnAuthenticatorData, and webauthnClientData are required' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
    const sorobanServer = new StellarSdk.rpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
    console.log(`[Smart Wallet] 📝 Using Smart Wallet Contract: ${contracts.SMART_WALLET_CONTRACT_ID}`);
    const contract = new StellarSdk.Contract(contracts.SMART_WALLET_CONTRACT_ID);

    // Decode DER signature to raw 64-byte format
    const derSignatureBytes = Buffer.from(webauthnSignature, 'base64');
    let rawSignature64;

    if (derSignatureBytes.length === 64) {
      // Already raw bytes - normalize it
      rawSignature64 = normalizeECDSASignature(derSignatureBytes);
    } else if (derSignatureBytes.length >= 70 && derSignatureBytes.length <= 72) {
      // DER-encoded signature - decode and normalize
      rawSignature64 = decodeDERSignature(derSignatureBytes);
    } else {
      throw new Error(`Invalid signature length: expected 64 bytes (raw) or 70-72 bytes (DER), got ${derSignatureBytes.length}`);
    }

    // Create ScVals for addresses
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const signerAddressScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    const destinationAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(destinationAddress);
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
    console.log(`[Smart Wallet] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    
    console.log('[Smart Wallet] 🔨 Building execute_payment transaction...');
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
    console.log('[Smart Wallet] ✅ Transaction built');

    // Prepare transaction (adds authorization entries)
    console.log('[Smart Wallet] 🔄 Preparing transaction...');
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
        console.log(`[Smart Wallet] ✅ Payment successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
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
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
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
    console.log('[Smart Wallet] ✅ Transaction built');

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
 * POST /api/smart-wallet/deposit
 * Deposit tokens into smart wallet using WebAuthn signature
 * Body: {
 *   userPublicKey, userSecretKey, amount (in stroops),
 *   assetAddress, signaturePayload, passkeyPublicKeySPKI,
 *   webauthnSignature, webauthnAuthenticatorData, webauthnClientData
 * }
 */
router.post('/deposit', authenticateUser, async (req, res) => {
  console.log('[Smart Wallet] 💸 Deposit request received');
  try {
    const {
      userPublicKey,
      userSecretKey,
      amount, // In stroops (1 XLM = 10,000,000 stroops)
      assetAddress,
      signaturePayload, // Transaction data JSON string
      passkeyPublicKeySPKI, // Base64 SPKI format
      webauthnSignature, // Base64 DER-encoded signature (70-72 bytes)
      webauthnAuthenticatorData, // Base64
      webauthnClientData, // Base64
    } = req.body;

    console.log(`[Smart Wallet] 📋 Deposit params - User: ${userPublicKey}, Amount: ${amount} stroops (${parseFloat(amount) / 10000000} XLM), Asset: ${assetAddress || 'native'}`);

    if (!userPublicKey || !userSecretKey || !amount) {
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, and amount are required' 
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
        console.log(`[Smart Wallet] ✅ Deposit successful - Hash: ${sendResult.hash}, Ledger: ${txResult.ledger}`);
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger 
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
  console.log('[Smart Wallet] 🏦 Vault balance check request received');
  try {
    const { contractId, assetAddress } = req.query;

    console.log(`[Smart Wallet] 📋 Request params - contractId: ${contractId || 'default'}, assetAddress: ${assetAddress || 'native'}`);

    const smartWalletContractId = contractId || contracts.SMART_WALLET_CONTRACT_ID;
    console.log(`[Smart Wallet] 📝 Using contract ID: ${smartWalletContractId}`);

    if (!smartWalletContractId) {
      console.error('[Smart Wallet] ❌ Smart wallet contract ID not configured');
      return res.status(400).json({ 
        error: 'Smart wallet contract ID not configured' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    console.log(`[Smart Wallet] 🌐 Connecting to Soroban RPC: ${contracts.SOROBAN_RPC_URL}`);
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
    
    console.log('[Smart Wallet] 🔨 Building token.balance transaction for vault simulation...');
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
    console.log('[Smart Wallet] ✅ Transaction built');

    let simulation;
    console.log('[Smart Wallet] 🔄 Simulating get_balance transaction for vault...');
    try {
      simulation = await sorobanServer.simulateTransaction(transaction);
      console.log('[Smart Wallet] ✅ Simulation completed:', {
        hasResult: !!simulation.result,
        hasErrorResult: !!simulation.errorResult
      });
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
    console.log(`[Smart Wallet] ✅ Vault balance retrieved - Raw: ${balance}, XLM: ${balanceInXLM}`);

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

module.exports = router;

