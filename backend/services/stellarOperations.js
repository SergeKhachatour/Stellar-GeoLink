const StellarSdk = require('@stellar/stellar-sdk');
const axios = require('axios');

// Configure Stellar server
const serverUrl = process.env.STELLAR_SERVER_URL || 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(serverUrl);
const networkPassphrase = StellarSdk.Networks[process.env.STELLAR_NETWORK || 'TESTNET'];

// Soroban RPC server for smart contracts
// In @stellar/stellar-sdk v14+, SorobanRpc might need to be imported differently
// We'll initialize it lazily when needed to avoid startup errors
let sorobanServer = null;

function getSorobanServer() {
  if (sorobanServer === null) {
    try {
      // Try different ways to access SorobanRpc in v14+
      let SorobanRpc = null;
      
      // Method 1: Check if it's a property of StellarSdk
      if (StellarSdk.SorobanRpc && StellarSdk.SorobanRpc.Server) {
        SorobanRpc = StellarSdk.SorobanRpc;
      }
      // Method 2: Try accessing it directly from the module
      else if (typeof StellarSdk === 'object' && StellarSdk.SorobanRpc) {
        SorobanRpc = StellarSdk.SorobanRpc;
      }
      
      if (SorobanRpc && SorobanRpc.Server) {
        sorobanServer = new SorobanRpc.Server(
          process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443',
          { allowHttp: true }
        );
        console.log('✅ SorobanRpc initialized successfully');
      } else {
        // Set to false to indicate we tried but failed
        sorobanServer = false;
        console.warn('⚠️  SorobanRpc not available in @stellar/stellar-sdk');
        console.warn('   Contract method calls will not be available');
        console.warn('   Other Stellar operations will work normally');
      }
    } catch (error) {
      sorobanServer = false;
      console.warn('⚠️  SorobanRpc initialization failed:', error.message);
      console.warn('   Contract method calls will not be available');
    }
  }
  return sorobanServer || null;
}

/**
 * Create a new Stellar account
 * Funds the account using Friendbot on testnet
 */
async function createAccount() {
  try {
    const pair = StellarSdk.Keypair.random();
    
    // Fund account with Friendbot (testnet only)
    if (networkPassphrase === StellarSdk.Networks.TESTNET) {
      try {
        await axios.get(`https://friendbot.stellar.org?addr=${pair.publicKey()}`);
        // Wait a moment for the account to be funded
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Friendbot funding error:', error.message);
      }
    }
    
    return {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
      message: 'Account created successfully'
    };
  } catch (error) {
    throw new Error(`Error creating account: ${error.message}`);
  }
}

/**
 * Issue a new asset on Stellar
 */
async function issueAsset(issuerSecret, assetCode) {
  if (!issuerSecret || !assetCode) {
    throw new Error('Missing required parameters: issuerSecret and assetCode');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    const asset = new StellarSdk.Asset(assetCode, issuerKeypair.publicKey());
    const account = await server.loadAccount(issuerKeypair.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: issuerKeypair.publicKey(),
        asset: asset,
        amount: '10000'
      }))
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    return {
      message: 'Asset issued successfully',
      transactionHash: transactionResult.hash,
      asset: {
        code: assetCode,
        issuer: issuerKeypair.publicKey()
      }
    };
  } catch (error) {
    throw new Error(`Error issuing asset: ${error.message}`);
  }
}

/**
 * Create a trustline for an asset
 */
async function createTrustline(accountSecret, assetCode, issuerPublicKey, limit = '1000000000') {
  if (!accountSecret || !assetCode || !issuerPublicKey) {
    throw new Error('Missing required parameters: accountSecret, assetCode, issuerPublicKey');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const accountKeypair = StellarSdk.Keypair.fromSecret(accountSecret);
    
    // Check if account is trying to create trustline for its own asset
    if (accountKeypair.publicKey() === issuerPublicKey) {
      return {
        message: 'No trustline needed. The issuer automatically has permission to hold their own assets.',
        asset: {
          code: assetCode,
          issuer: issuerPublicKey
        }
      };
    }

    const asset = new StellarSdk.Asset(assetCode, issuerPublicKey);
    const account = await server.loadAccount(accountKeypair.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(StellarSdk.Operation.changeTrust({
        asset: asset,
        limit: limit
      }))
      .setTimeout(30)
      .build();

    transaction.sign(accountKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    return {
      message: 'Trustline created successfully',
      transactionHash: transactionResult.hash
    };
  } catch (error) {
    throw new Error(`Error creating trustline: ${error.message}`);
  }
}

/**
 * Transfer an asset between accounts
 */
async function transferAsset(senderSecret, recipientPublicKey, assetCode, issuerPublicKey, amount) {
  if (!senderSecret || !recipientPublicKey || !assetCode || !issuerPublicKey || !amount) {
    throw new Error('Missing required parameters');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const senderKeypair = StellarSdk.Keypair.fromSecret(senderSecret);
    
    // Handle native XLM vs custom assets
    let asset;
    if (assetCode === 'XLM' || issuerPublicKey === 'native') {
      asset = StellarSdk.Asset.native();
    } else {
      asset = new StellarSdk.Asset(assetCode, issuerPublicKey);
    }

    const account = await server.loadAccount(senderKeypair.publicKey());
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipientPublicKey,
        asset: asset,
        amount: amount
      }))
      .setTimeout(30)
      .build();

    transaction.sign(senderKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    return {
      message: 'Asset transferred successfully',
      transactionHash: transactionResult.hash,
      amount: amount,
      asset: assetCode,
      recipient: recipientPublicKey
    };
  } catch (error) {
    throw new Error(`Error transferring asset: ${error.message}`);
  }
}

/**
 * Show balance of a Stellar account
 */
async function showBalance(publicKey) {
  if (!publicKey) {
    throw new Error('Missing required parameter: publicKey');
  }

  try {
    const account = await server.loadAccount(publicKey);
    const balances = account.balances.map(balance => ({
      asset_type: balance.asset_type,
      asset_code: balance.asset_code || 'XLM',
      asset_issuer: balance.asset_issuer || null,
      balance: balance.balance,
      limit: balance.limit || null
    }));

    return {
      account_id: account.id,
      balances: balances
    };
  } catch (error) {
    throw new Error(`Error fetching balance: ${error.message}`);
  }
}

/**
 * Show all trustlines for an account
 */
async function showTrustlines(publicKey) {
  if (!publicKey) {
    throw new Error('Missing required parameter: publicKey');
  }

  try {
    const account = await server.loadAccount(publicKey);
    const trustlines = account.balances.filter(balance => balance.asset_type !== 'native');

    return {
      message: 'Trustlines retrieved successfully',
      trustlines: trustlines.map(tl => ({
        asset_code: tl.asset_code,
        asset_issuer: tl.asset_issuer,
        balance: tl.balance,
        limit: tl.limit
      }))
    };
  } catch (error) {
    throw new Error(`Error retrieving trustlines: ${error.message}`);
  }
}

/**
 * Show assets issued by a specific account
 */
async function showIssuedAssets(issuerPublicKey) {
  if (!issuerPublicKey) {
    throw new Error('Missing required parameter: issuerPublicKey');
  }

  try {
    const account = await server.loadAccount(issuerPublicKey);
    const issuedAssets = account.balances.filter(balance => 
      balance.asset_type !== 'native' && balance.asset_issuer === issuerPublicKey
    );

    return {
      issuer: issuerPublicKey,
      issuedAssets: issuedAssets.map(asset => ({
        assetCode: asset.asset_code,
        assetIssuer: asset.asset_issuer,
        balance: asset.balance
      }))
    };
  } catch (error) {
    throw new Error(`Error fetching issued assets: ${error.message}`);
  }
}

/**
 * Setup an asset (create and issue)
 */
async function setupAsset(issuerSecret, assetCode) {
  if (!issuerSecret || !assetCode) {
    throw new Error('Missing required parameters: issuerSecret and assetCode');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    const asset = new StellarSdk.Asset(assetCode, issuerKeypair.publicKey());
    const account = await server.loadAccount(issuerKeypair.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(StellarSdk.Operation.allowTrust({
        trustor: issuerKeypair.publicKey(),
        asset: asset,
        authorize: true
      }))
      .addOperation(StellarSdk.Operation.payment({
        destination: issuerKeypair.publicKey(),
        asset: asset,
        amount: '10000'
      }))
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    return {
      message: 'Asset setup successfully',
      transactionHash: transactionResult.hash,
      asset: {
        code: assetCode,
        issuer: issuerKeypair.publicKey()
      }
    };
  } catch (error) {
    throw new Error(`Error setting up asset: ${error.message}`);
  }
}

/**
 * Test asset creation
 */
async function testAssetCreation(issuerSecret, assetCode) {
  if (!issuerSecret || !assetCode) {
    throw new Error('Missing required parameters: issuerSecret and assetCode');
  }

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    const asset = new StellarSdk.Asset(assetCode, issuerKeypair.publicKey());
    const account = await server.loadAccount(issuerKeypair.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: issuerKeypair.publicKey(),
        asset: asset,
        amount: '10000'
      }))
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    return {
      message: 'Asset creation test successful',
      transactionHash: transactionResult.hash,
      asset: {
        code: assetCode,
        issuer: issuerKeypair.publicKey()
      }
    };
  } catch (error) {
    throw new Error(`Asset creation test failed: ${error.message}`);
  }
}

/**
 * Call a Soroban smart contract method
 */
async function callContractMethod(contractId, method, secret, parameters = []) {
  if (!contractId || !method || !secret) {
    throw new Error('Missing required parameters: contractId, method, and secret');
  }

  const soroban = getSorobanServer();
  if (!soroban) {
    throw new Error('SorobanRpc is not available. Please ensure @stellar/stellar-sdk is properly installed and SorobanRpc is accessible.');
  }

  try {
    const sourceKeypair = StellarSdk.Keypair.fromSecret(secret);
    const contract = new StellarSdk.Contract(contractId);
    
    const sourceAccount = await soroban.getAccount(sourceKeypair.publicKey());
    
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(contract.call(method, ...parameters.map(param => StellarSdk.nativeToScVal(param))))
      .setTimeout(180)
      .build();

    const preparedTransaction = await soroban.prepareTransaction(transaction);
    preparedTransaction.sign(sourceKeypair);
    
    const response = await soroban.sendTransaction(preparedTransaction);
    
    if (response.status === "PENDING") {
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts++ < maxAttempts) {
        const status = await soroban.getTransaction(response.hash);
        
        switch (status.status) {
          case "SUCCESS":
            const transactionMeta = status.resultMetaXdr.v3().sorobanMeta();
            return {
              message: 'Contract method called successfully',
              result: transactionMeta.returnValue(),
              transactionHash: response.hash
            };
          case "FAILED":
            throw new Error(`Transaction failed: ${status.resultXdr}`);
          case "NOT_FOUND":
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
        }
      }
      throw new Error(`Transaction polling timeout after ${maxAttempts} attempts`);
    }

    throw new Error(`Unexpected transaction status: ${response.status}`);
  } catch (error) {
    throw new Error(`Error calling contract method: ${error.message}`);
  }
}

module.exports = {
  createAccount,
  issueAsset,
  createTrustline,
  transferAsset,
  showBalance,
  showTrustlines,
  showIssuedAssets,
  setupAsset,
  testAssetCreation,
  callContractMethod
};

