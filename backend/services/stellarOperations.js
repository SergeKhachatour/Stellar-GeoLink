const StellarSdk = require('@stellar/stellar-sdk');
const axios = require('axios');

// Configure Stellar server
const serverUrl = process.env.STELLAR_SERVER_URL || 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(serverUrl);
// Handle both lowercase and uppercase network names
const networkEnv = (process.env.STELLAR_NETWORK || 'testnet').toUpperCase();
const networkPassphrase = StellarSdk.Networks[networkEnv] || StellarSdk.Networks.TESTNET;

// Debug logging
console.log(`[Stellar Operations] 📋 Network configuration - ENV: ${process.env.STELLAR_NETWORK || 'not set'}, Normalized: ${networkEnv}, Passphrase: ${networkPassphrase === StellarSdk.Networks.TESTNET ? 'TESTNET' : networkPassphrase === StellarSdk.Networks.PUBLIC ? 'MAINNET' : 'UNKNOWN'}`);

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
  console.log('[Stellar Operations] 🚀 Starting account creation...');
  console.log(`[Stellar Operations] 🌐 Network passphrase: ${networkPassphrase === StellarSdk.Networks.TESTNET ? 'TESTNET' : 'MAINNET'}`);
  try {
    const pair = StellarSdk.Keypair.random();
    console.log(`[Stellar Operations] ✅ Generated keypair - Public Key: ${pair.publicKey()}`);
    
    // Fund account with Friendbot (testnet only)
    // Following Stellar-NodeJS-Backend pattern: fund, wait, then return
    if (networkPassphrase === StellarSdk.Networks.TESTNET) {
      console.log('[Stellar Operations] ✅ Testnet detected - will fund account via Friendbot');
      try {
        console.log(`[Stellar Operations] 💰 Requesting funding from Friendbot for ${pair.publicKey()}...`);
        const friendbotResponse = await axios.get(`https://friendbot.stellar.org?addr=${pair.publicKey()}`, {
          timeout: 30000 // 30 second timeout
        });
        console.log(`[Stellar Operations] ✅ Friendbot funding request sent - Status: ${friendbotResponse.status}`);
        
        if (friendbotResponse.data && friendbotResponse.data.hash) {
          console.log(`[Stellar Operations] 📝 Friendbot transaction hash: ${friendbotResponse.data.hash}`);
        }
        
        // Wait a moment for the account to be funded (like Stellar-NodeJS-Backend)
        console.log('[Stellar Operations] ⏳ Waiting 2 seconds for account to be funded...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`[Stellar Operations] ✅ Account created and funded - Public Key: ${pair.publicKey()}`);
        return {
          publicKey: pair.publicKey(),
          secret: pair.secret(),
          stellarResponse: friendbotResponse.data,
          message: 'Account created and funded successfully.'
        };
      } catch (friendbotError) {
        console.error(`[Stellar Operations] ❌ Friendbot funding request failed: ${friendbotError.message}`);
        // Still return the account, but note the funding issue
        console.log(`[Stellar Operations] ⚠️ Account created but funding may have failed - user can try again`);
        return {
          publicKey: pair.publicKey(),
          secret: pair.secret(),
          stellarResponse: { error: 'Failed to fund account via Friendbot' },
          message: 'Account created but funding failed. Please try funding manually or wait and retry.'
        };
      }
    } else {
      // Mainnet or other network - no Friendbot, just return the keypair
      console.log(`[Stellar Operations] ⚠️ Not on testnet - account created but not funded. Public Key: ${pair.publicKey()}`);
      return {
        publicKey: pair.publicKey(),
        secret: pair.secret(),
        message: 'Account created successfully (not funded - mainnet requires manual funding)'
      };
    }
  } catch (error) {
    console.error(`[Stellar Operations] ❌ Error creating account: ${error.message}`);
    throw new Error(`Error creating account: ${error.message}`);
  }
}

/**
 * Issue a new asset on Stellar
 */
async function issueAsset(issuerSecret, assetCode) {
  console.log(`[Stellar Operations] 💎 Starting asset issuance - Asset Code: ${assetCode}`);
  if (!issuerSecret || !assetCode) {
    console.error('[Stellar Operations] ❌ Missing required parameters');
    throw new Error('Missing required parameters: issuerSecret and assetCode');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    console.error(`[Stellar Operations] ❌ Asset code too long: ${assetCode.length} characters`);
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    console.error(`[Stellar Operations] ❌ Invalid asset code format: ${assetCode}`);
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    console.log(`[Stellar Operations] ✅ Issuer keypair loaded - Public Key: ${issuerKeypair.publicKey()}`);
    const asset = new StellarSdk.Asset(assetCode, issuerKeypair.publicKey());
    console.log(`[Stellar Operations] 🔍 Loading issuer account from Horizon...`);
    const account = await server.loadAccount(issuerKeypair.publicKey());
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);

    console.log('[Stellar Operations] 🔨 Building asset issuance transaction...');
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
    console.log('[Stellar Operations] ✅ Transaction built');

    console.log('[Stellar Operations] ✍️ Signing transaction...');
    transaction.sign(issuerKeypair);
    console.log('[Stellar Operations] ✅ Transaction signed');

    console.log('[Stellar Operations] 📤 Submitting transaction to network...');
    const transactionResult = await server.submitTransaction(transaction);
    console.log(`[Stellar Operations] ✅ Asset issued successfully - Transaction Hash: ${transactionResult.hash}`);

    return {
      message: 'Asset issued successfully',
      transactionHash: transactionResult.hash,
      asset: {
        code: assetCode,
        issuer: issuerKeypair.publicKey()
      }
    };
  } catch (error) {
    console.error(`[Stellar Operations] ❌ Error issuing asset: ${error.message}`);
    console.error('[Stellar Operations] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    throw new Error(`Error issuing asset: ${error.message}`);
  }
}

/**
 * Create a trustline for an asset
 */
async function createTrustline(accountSecret, assetCode, issuerPublicKey, limit = '1000000000') {
  console.log(`[Stellar Operations] 🔗 Starting trustline creation - Asset: ${assetCode}, Issuer: ${issuerPublicKey}, Limit: ${limit}`);
  if (!accountSecret || !assetCode || !issuerPublicKey) {
    console.error('[Stellar Operations] ❌ Missing required parameters');
    throw new Error('Missing required parameters: accountSecret, assetCode, issuerPublicKey');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    console.error(`[Stellar Operations] ❌ Asset code too long: ${assetCode.length} characters`);
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    console.error(`[Stellar Operations] ❌ Invalid asset code format: ${assetCode}`);
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const accountKeypair = StellarSdk.Keypair.fromSecret(accountSecret);
    console.log(`[Stellar Operations] ✅ Account keypair loaded - Public Key: ${accountKeypair.publicKey()}`);
    
    // Check if account is trying to create trustline for its own asset
    if (accountKeypair.publicKey() === issuerPublicKey) {
      console.log('[Stellar Operations] ℹ️ Account is issuer - no trustline needed');
      return {
        message: 'No trustline needed. The issuer automatically has permission to hold their own assets.',
        asset: {
          code: assetCode,
          issuer: issuerPublicKey
        }
      };
    }

    const asset = new StellarSdk.Asset(assetCode, issuerPublicKey);
    console.log(`[Stellar Operations] 🔍 Loading account ${accountKeypair.publicKey()} from Horizon...`);
    const account = await server.loadAccount(accountKeypair.publicKey());
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);

    console.log('[Stellar Operations] 🔨 Building changeTrust transaction...');
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
    console.log('[Stellar Operations] ✅ Transaction built');

    console.log('[Stellar Operations] ✍️ Signing transaction...');
    transaction.sign(accountKeypair);
    console.log('[Stellar Operations] ✅ Transaction signed');

    console.log('[Stellar Operations] 📤 Submitting transaction to network...');
    const transactionResult = await server.submitTransaction(transaction);
    console.log(`[Stellar Operations] ✅ Trustline created successfully - Transaction Hash: ${transactionResult.hash}`);

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
  console.log(`[Stellar Operations] 💸 Starting asset transfer - Asset: ${assetCode}, Amount: ${amount}, To: ${recipientPublicKey}`);
  if (!senderSecret || !recipientPublicKey || !assetCode || !issuerPublicKey || !amount) {
    console.error('[Stellar Operations] ❌ Missing required parameters');
    throw new Error('Missing required parameters');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    console.error(`[Stellar Operations] ❌ Asset code too long: ${assetCode.length} characters`);
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    console.error(`[Stellar Operations] ❌ Invalid asset code format: ${assetCode}`);
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const senderKeypair = StellarSdk.Keypair.fromSecret(senderSecret);
    console.log(`[Stellar Operations] ✅ Sender keypair loaded - Public Key: ${senderKeypair.publicKey()}`);
    
    // Handle native XLM vs custom assets
    let asset;
    if (assetCode === 'XLM' || issuerPublicKey === 'native') {
      asset = StellarSdk.Asset.native();
      console.log('[Stellar Operations] 💰 Using native XLM asset');
    } else {
      asset = new StellarSdk.Asset(assetCode, issuerPublicKey);
      console.log(`[Stellar Operations] 💎 Using custom asset: ${assetCode} from issuer ${issuerPublicKey}`);
    }

    console.log(`[Stellar Operations] 🔍 Loading sender account ${senderKeypair.publicKey()} from Horizon...`);
    const account = await server.loadAccount(senderKeypair.publicKey());
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    
    console.log('[Stellar Operations] 🔨 Building payment transaction...');
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
    console.log('[Stellar Operations] ✅ Transaction built');

    console.log('[Stellar Operations] ✍️ Signing transaction...');
    transaction.sign(senderKeypair);
    console.log('[Stellar Operations] ✅ Transaction signed');

    console.log('[Stellar Operations] 📤 Submitting transaction to network...');
    const transactionResult = await server.submitTransaction(transaction);
    console.log(`[Stellar Operations] ✅ Asset transfer successful - Transaction Hash: ${transactionResult.hash}`);

    return {
      message: 'Asset transferred successfully',
      transactionHash: transactionResult.hash,
      amount: amount,
      asset: assetCode,
      recipient: recipientPublicKey
    };
  } catch (error) {
    console.error(`[Stellar Operations] ❌ Error transferring asset: ${error.message}`);
    console.error('[Stellar Operations] 📋 Error details:', {
      message: error.message,
      stack: error.stack
    });
    throw new Error(`Error transferring asset: ${error.message}`);
  }
}

/**
 * Show balance of a Stellar account
 */
async function showBalance(publicKey) {
  console.log(`[Stellar Operations] 💰 Fetching balance for account: ${publicKey}`);
  if (!publicKey) {
    console.error('[Stellar Operations] ❌ Missing publicKey parameter');
    throw new Error('Missing required parameter: publicKey');
  }

  try {
    console.log(`[Stellar Operations] 🔍 Loading account ${publicKey} from Horizon...`);
    const account = await server.loadAccount(publicKey);
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}, Balances: ${account.balances.length}`);
    const balances = account.balances.map(balance => ({
      asset_type: balance.asset_type,
      asset_code: balance.asset_code || 'XLM',
      asset_issuer: balance.asset_issuer || null,
      balance: balance.balance,
      limit: balance.limit || null
    }));

    console.log(`[Stellar Operations] ✅ Balance retrieved - ${balances.length} asset(s) found`);
    return {
      account_id: account.id,
      balances: balances
    };
  } catch (error) {
    console.error(`[Stellar Operations] ❌ Error fetching balance: ${error.message}`);
    throw new Error(`Error fetching balance: ${error.message}`);
  }
}

/**
 * Show all trustlines for an account
 */
async function showTrustlines(publicKey) {
  console.log(`[Stellar Operations] 🔗 Fetching trustlines for account: ${publicKey}`);
  if (!publicKey) {
    console.error('[Stellar Operations] ❌ Missing publicKey parameter');
    throw new Error('Missing required parameter: publicKey');
  }

  try {
    console.log(`[Stellar Operations] 🔍 Loading account ${publicKey} from Horizon...`);
    const account = await server.loadAccount(publicKey);
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    const trustlines = account.balances.filter(balance => balance.asset_type !== 'native');
    console.log(`[Stellar Operations] ✅ Trustlines retrieved - ${trustlines.length} trustline(s) found`);

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
    console.error(`[Stellar Operations] ❌ Error retrieving trustlines: ${error.message}`);
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
    console.log(`[Stellar Operations] 🔍 Loading issuer account from Horizon...`);
    const account = await server.loadAccount(issuerPublicKey);
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);
    const issuedAssets = account.balances.filter(balance => 
      balance.asset_type !== 'native' && balance.asset_issuer === issuerPublicKey
    );
    console.log(`[Stellar Operations] ✅ Issued assets retrieved - ${issuedAssets.length} asset(s) found`);

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
  console.log(`[Stellar Operations] ⚙️ Starting asset setup - Asset Code: ${assetCode}`);
  if (!issuerSecret || !assetCode) {
    console.error('[Stellar Operations] ❌ Missing required parameters');
    throw new Error('Missing required parameters: issuerSecret and assetCode');
  }

  // Validate asset code
  if (assetCode.length > 12) {
    console.error(`[Stellar Operations] ❌ Asset code too long: ${assetCode.length} characters`);
    throw new Error('Asset code must be 12 characters or less');
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    console.error(`[Stellar Operations] ❌ Invalid asset code format: ${assetCode}`);
    throw new Error('Asset code must contain only uppercase letters and numbers');
  }

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    console.log(`[Stellar Operations] ✅ Issuer keypair loaded - Public Key: ${issuerKeypair.publicKey()}`);
    const asset = new StellarSdk.Asset(assetCode, issuerKeypair.publicKey());
    console.log(`[Stellar Operations] 🔍 Loading issuer account from Horizon...`);
    const account = await server.loadAccount(issuerKeypair.publicKey());
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${account.sequenceNumber()}`);

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
  console.log(`[Stellar Operations] 📞 Starting contract method call - Contract: ${contractId}, Method: ${method}, Parameters: ${parameters.length}`);
  if (!contractId || !method || !secret) {
    console.error('[Stellar Operations] ❌ Missing required parameters');
    throw new Error('Missing required parameters: contractId, method, and secret');
  }

  const soroban = getSorobanServer();
  if (!soroban) {
    console.error('[Stellar Operations] ❌ SorobanRpc is not available');
    throw new Error('SorobanRpc is not available. Please ensure @stellar/stellar-sdk is properly installed and SorobanRpc is accessible.');
  }

  try {
    const sourceKeypair = StellarSdk.Keypair.fromSecret(secret);
    console.log(`[Stellar Operations] ✅ Source keypair loaded - Public Key: ${sourceKeypair.publicKey()}`);
    const contract = new StellarSdk.Contract(contractId);
    console.log(`[Stellar Operations] 🔍 Loading source account from Soroban RPC...`);
    
    const sourceAccount = await soroban.getAccount(sourceKeypair.publicKey());
    console.log(`[Stellar Operations] ✅ Account loaded - Sequence: ${sourceAccount.sequenceNumber()}`);
    
    console.log(`[Stellar Operations] 🔨 Building contract call transaction for method: ${method}...`);
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    })
      .addOperation(contract.call(method, ...parameters.map(param => StellarSdk.nativeToScVal(param))))
      .setTimeout(180)
      .build();
    console.log('[Stellar Operations] ✅ Transaction built');

    console.log('[Stellar Operations] 🔄 Preparing transaction...');
    const preparedTransaction = await soroban.prepareTransaction(transaction);
    console.log('[Stellar Operations] ✅ Transaction prepared');
    
    console.log('[Stellar Operations] ✍️ Signing transaction...');
    preparedTransaction.sign(sourceKeypair);
    console.log('[Stellar Operations] ✅ Transaction signed');
    
    console.log('[Stellar Operations] 📤 Sending transaction to network...');
    const response = await soroban.sendTransaction(preparedTransaction);
    console.log(`[Stellar Operations] ✅ Transaction sent - Hash: ${response.hash}`);
    
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

