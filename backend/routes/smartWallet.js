/**
 * Smart Wallet Routes
 * Handles smart wallet contract interactions
 * Based on CUSTOM_CONTRACT_INTEGRATION_ANALYSIS.md
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');

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
    const { userPublicKey, contractId, assetAddress } = req.query;

    if (!userPublicKey) {
      return res.status(400).json({ 
        error: 'userPublicKey is required' 
      });
    }

    // Get smart wallet contract ID from query, env var, or use default
    const smartWalletContractId = contractId || 
                                   process.env.SMART_WALLET_CONTRACT_ID || 
                                   null;

    if (!smartWalletContractId) {
      return res.status(400).json({ 
        error: 'Smart wallet contract ID not configured. Please provide contractId or set SMART_WALLET_CONTRACT_ID environment variable.' 
      });
    }

    // Import Stellar SDK
    const StellarSdk = require('@stellar/stellar-sdk');

    // Configure Soroban RPC server
    const network = process.env.STELLAR_NETWORK || 'testnet';
    const sorobanServer = network === 'testnet'
      ? new StellarSdk.SorobanRpc.Server('https://soroban-testnet.stellar.org')
      : new StellarSdk.SorobanRpc.Server('https://soroban.stellar.org');

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
    const simulation = await sorobanServer.simulateTransaction(transaction);

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
      balance = hi === '0' ? lo : (BigInt(hi) << 64n | BigInt(lo)).toString();
    } else {
      balance = result.toString() || '0';
    }

    // Convert from stroops to XLM (divide by 10,000,000)
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

module.exports = router;

