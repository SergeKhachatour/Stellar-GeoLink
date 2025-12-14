/**
 * Smart Wallet Routes
 * Handles smart wallet contract interactions
 * Based on CUSTOM_CONTRACT_INTEGRATION_ANALYSIS.md
 * 
 * Contract IDs:
 * - Smart Wallet: CA7G33NKXPBMSRRKS4PVBCE56OZDXGQCDUEBJ36NX7NS6RXGBSSMNX6P
 * - WebAuthn Verifier: CBPGL7FWVKVQKRYRU32ZRH7RYKJ3T5UBI4KF2RVLT3BP2UXY7HPAVCWL
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
  try {
    const { userPublicKey, contractId, assetAddress } = req.query; // Fixed: was req instead of req.query

    if (!userPublicKey) {
      return res.status(400).json({ 
        error: 'userPublicKey is required' 
      });
    }

    // Get smart wallet contract ID from query, env var, or use default from config
    const smartWalletContractId = contractId || contracts.SMART_WALLET_CONTRACT_ID;

    if (!smartWalletContractId) {
      return res.status(400).json({ 
        error: 'Smart wallet contract ID not configured. Please provide contractId or set SMART_WALLET_CONTRACT_ID environment variable.' 
      });
    }

    // Import Stellar SDK
    const StellarSdk = require('@stellar/stellar-sdk');

    // Configure Soroban RPC server using config
    const network = contracts.STELLAR_NETWORK;
    const sorobanServer = new StellarSdk.SorobanRpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = network === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;

    // Create contract instance
    const contract = new StellarSdk.Contract(smartWalletContractId);

    // Prepare addresses
    const userAddr = StellarSdk.Address.fromString(userPublicKey);
    
    // Use native XLM if no asset address provided
    // Native asset in Stellar is represented by a special address
    const assetAddr = assetAddress
      ? StellarSdk.Address.fromString(assetAddress)
      : StellarSdk.Address.fromString('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'); // Native asset placeholder

    // Create a dummy account for simulation (read-only call)
    const dummyKeypair = StellarSdk.Keypair.random();
    
    // Build transaction for simulation
    const transaction = new StellarSdk.TransactionBuilder(
      { accountId: dummyKeypair.publicKey(), sequenceNumber: '0' },
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(
        contract.call(
          'get_balance',
          StellarSdk.xdr.ScVal.scvAddress(userAddr.toScAddress()),
          StellarSdk.xdr.ScVal.scvAddress(assetAddr.toScAddress())
        )
      )
      .setTimeout(30)
      .build();

    // Simulate transaction (read-only, no signing needed)
    let simulation;
    try {
      simulation = await sorobanServer.simulateTransaction(transaction);
    } catch (simError) {
      console.error('Error simulating smart wallet balance transaction:', simError);
      // If simulation fails, return zero balance instead of error
      return res.json({ 
        balance: '0', 
        balanceInXLM: '0',
        contractId: smartWalletContractId,
        assetAddress: assetAddress || 'native',
        userPublicKey: userPublicKey,
        error: 'Simulation failed - contract may not be initialized or account may not exist'
      });
    }

    if (simulation.errorResult) {
      const errorValue = simulation.errorResult.value();
      console.error('Smart wallet simulation error:', errorValue);
      return res.status(400).json({ 
        error: 'Failed to get balance from smart wallet',
        details: errorValue.toString()
      });
    }

    // Extract balance from result
    const result = simulation.result.retval;
    if (!result) {
      return res.json({ balance: '0', contractId: smartWalletContractId });
    }

    // Handle i128 result
    let balance = '0';
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

    // Convert from stroops to XLM (divide by 10,000,000)
    // eslint-disable-next-line no-undef
    const balanceInXLM = (BigInt(balance) / 10000000n).toString();
    const balanceInStroops = balance;

    res.json({
      balance: balanceInStroops,
      balanceInXLM: balanceInXLM,
      contractId: smartWalletContractId,
      assetAddress: assetAddress || 'native',
      userPublicKey: userPublicKey
    });
  } catch (error) {
    console.error('Error getting smart wallet balance:', error);
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

    if (!userPublicKey || !userSecretKey || !destinationAddress || !amount) {
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, destinationAddress, and amount are required' 
      });
    }

    if (!signaturePayload || !webauthnSignature || !webauthnAuthenticatorData || !webauthnClientData) {
      return res.status(400).json({ 
        error: 'signaturePayload, webauthnSignature, webauthnAuthenticatorData, and webauthnClientData are required' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.SorobanRpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
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
    const account = await sorobanServer.getAccount(userPublicKey);
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
    const preparedTx = await sorobanServer.prepareTransaction(transaction);

    // Sign transaction
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
        return res.json({ 
          success: true, 
          hash: sendResult.hash, 
          ledger: txResult.ledger 
        });
      } else if (txResult.status === 'FAILED') {
        throw new Error(`Payment failed: ${txResult.resultXdr || txResult.errorResultXdr}`);
      }
    }

    throw new Error('Payment timeout');
  } catch (error) {
    console.error('Error executing payment:', error);
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
  try {
    const { userPublicKey, userSecretKey, passkeyPublicKeySPKI, rpId } = req.body;

    if (!userPublicKey || !userSecretKey || !passkeyPublicKeySPKI) {
      return res.status(400).json({ 
        error: 'userPublicKey, userSecretKey, and passkeyPublicKeySPKI are required' 
      });
    }

    const StellarSdk = require('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.SorobanRpc.Server(contracts.SOROBAN_RPC_URL);
    const networkPassphrase = contracts.STELLAR_NETWORK === 'testnet'
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;
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
    const account = await sorobanServer.getAccount(userPublicKey);
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
        return res.json({ 
          success: true, 
          hash: sendResult.hash 
        });
      } else if (txResult.status === 'FAILED') {
        throw new Error(`Registration failed: ${txResult.resultXdr || txResult.errorResultXdr}`);
      }
    }

    throw new Error('Registration timeout');
  } catch (error) {
    console.error('Error registering signer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;

