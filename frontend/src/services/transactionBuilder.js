/**
 * Transaction Builder Service
 * Builds and signs Stellar/Soroban transactions client-side
 * This ensures secret keys never leave the client
 */

import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * Build and sign a deposit transaction for the smart wallet contract
 * @param {Object} params - Transaction parameters
 * @param {string} params.userPublicKey - User's Stellar public key
 * @param {string} params.userSecretKey - User's Stellar secret key (for signing)
 * @param {string} params.amount - Amount in stroops (string)
 * @param {string|null} params.assetAddress - Asset contract address (null for native XLM)
 * @param {string} params.signaturePayload - JSON string of deposit data
 * @param {string} params.webauthnSignature - Base64 WebAuthn signature (64 bytes)
 * @param {string} params.webauthnAuthenticatorData - Base64 authenticator data
 * @param {string} params.webauthnClientData - Base64 client data JSON
 * @param {string} params.network - 'testnet' or 'mainnet'
 * @param {string} params.smartWalletContractId - Smart wallet contract ID
 * @param {string} params.sorobanRpcUrl - Soroban RPC URL
 * @param {string} params.horizonUrl - Horizon URL
 * @returns {Promise<string>} - Signed XDR string
 */
export async function buildAndSignDepositTransaction({
  userPublicKey,
  userSecretKey,
  amount,
  assetAddress,
  signaturePayload,
  webauthnSignature,
  webauthnAuthenticatorData,
  webauthnClientData,
  network = 'testnet',
  smartWalletContractId,
  sorobanRpcUrl,
  horizonUrl
}) {
  try {
    // Determine network passphrase
    const networkPassphrase = network === 'mainnet'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;

    // Initialize servers
    const sorobanServer = new StellarSdk.rpc.Server(sorobanRpcUrl, { allowHttp: true });
    const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    const contract = new StellarSdk.Contract(smartWalletContractId);

    // Load account from Horizon
    const account = await horizonServer.loadAccount(userPublicKey);

    // Convert user public key to ScVal
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    // Convert asset to ScVal
    let assetScAddress;
    if (assetAddress) {
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

    // Convert amount to Int128
    // eslint-disable-next-line no-undef
    const amountBigInt = BigInt(amount);
    // eslint-disable-next-line no-undef
    const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF'); // 2^64 - 1
    const lo = amountBigInt & maxUint64;
    const hi = amountBigInt >> 64n;
    
    const amountI128 = new StellarSdk.xdr.Int128Parts({
      hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
      lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
    });
    const amountScVal = StellarSdk.xdr.ScVal.scvI128(amountI128);

    // Helper function to convert base64 to Uint8Array (browser-compatible)
    const base64ToUint8Array = (base64) => {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    };

    // Convert signature payload to bytes
    let signaturePayloadBuffer;
    if (typeof signaturePayload === 'string') {
      try {
        // Try to parse as JSON first
        JSON.parse(signaturePayload);
        signaturePayloadBuffer = new TextEncoder().encode(signaturePayload);
      } catch (e) {
        // Not JSON, try base64
        signaturePayloadBuffer = base64ToUint8Array(signaturePayload);
      }
    } else {
      signaturePayloadBuffer = new Uint8Array(signaturePayload);
    }
    const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(signaturePayloadBuffer);

    // Convert WebAuthn signature to bytes (should be 64 bytes)
    const webauthnSignatureBytes = base64ToUint8Array(webauthnSignature);
    const webauthnSignatureScVal = StellarSdk.xdr.ScVal.scvBytes(webauthnSignatureBytes);

    // Convert authenticator data to bytes
    const authenticatorDataBytes = base64ToUint8Array(webauthnAuthenticatorData);
    const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(authenticatorDataBytes);

    // Convert client data to bytes
    const clientDataBytes = base64ToUint8Array(webauthnClientData);
    const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(clientDataBytes);

    // Build contract call operation
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

    // Prepare transaction (adds authorization entries for Soroban)
    const preparedTx = await sorobanServer.prepareTransaction(transaction);

    // Sign transaction with user's secret key
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);

    // Return signed XDR
    return preparedTx.toXDR();
  } catch (error) {
    console.error('[TransactionBuilder] Error building deposit transaction:', error);
    throw new Error(`Failed to build deposit transaction: ${error.message}`);
  }
}

/**
 * Convert a value to ScVal based on type (browser-compatible)
 * @param {*} value - Value to convert
 * @param {string} type - Type (Address, String, I128, Bytes, etc.)
 * @returns {Object} - ScVal XDR object
 */
function convertToScVal(value, type) {
  if (value === undefined || value === null) {
    throw new Error(`Cannot convert undefined/null value to ${type}. Please provide a valid value.`);
  }

  switch (type) {
    case 'Address':
      if (!value || typeof value !== 'string') {
        throw new Error(`Invalid Address value: ${value}. Expected a non-empty string.`);
      }
      return StellarSdk.xdr.ScVal.scvAddress(
        StellarSdk.Address.fromString(value).toScAddress()
      );
    case 'String':
      return StellarSdk.xdr.ScVal.scvString(String(value));
    case 'u32':
      return StellarSdk.xdr.ScVal.scvU32(parseInt(value));
    case 'i128':
    case 'I128':
      // eslint-disable-next-line no-undef
      const bigIntValue = BigInt(value);
      // eslint-disable-next-line no-undef
      const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF'); // 2^64 - 1
      const lo = bigIntValue & maxUint64;
      const hi = bigIntValue >> 64n;
      
      const amountI128 = new StellarSdk.xdr.Int128Parts({
        hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
        lo: StellarSdk.xdr.Uint64.fromString(lo.toString())
      });
      return StellarSdk.xdr.ScVal.scvI128(amountI128);
    case 'Bytes':
      // Convert string to Uint8Array
      let bytes;
      if (typeof value === 'string') {
        // Try base64 first
        try {
          const binaryString = atob(value);
          bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
        } catch (e) {
          // Not base64, treat as UTF-8
          bytes = new TextEncoder().encode(value);
        }
      } else if (value instanceof Uint8Array) {
        bytes = value;
      } else {
        bytes = new Uint8Array(value);
      }
      return StellarSdk.xdr.ScVal.scvBytes(bytes);
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

/**
 * Build and sign a generic contract execution transaction
 * @param {Object} params - Transaction parameters
 * @param {string} params.userPublicKey - User's Stellar public key
 * @param {string} params.userSecretKey - User's Stellar secret key (for signing)
 * @param {string} params.contractAddress - Contract address
 * @param {string} params.functionName - Function name to call
 * @param {Array} params.functionParameters - Array of {name, type, value} parameter objects
 * @param {string} params.network - 'testnet' or 'mainnet'
 * @param {string} params.sorobanRpcUrl - Soroban RPC URL
 * @param {string} params.horizonUrl - Horizon URL (optional, uses RPC if not provided)
 * @returns {Promise<string>} - Signed XDR string
 */
export async function buildAndSignContractTransaction({
  userPublicKey,
  userSecretKey,
  contractAddress,
  functionName,
  functionParameters = [],
  network = 'testnet',
  sorobanRpcUrl,
  horizonUrl
}) {
  try {
    // Determine network passphrase
    const networkPassphrase = network === 'mainnet'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;

    // Initialize servers
    const sorobanServer = new StellarSdk.rpc.Server(sorobanRpcUrl, { allowHttp: true });
    const contract = new StellarSdk.Contract(contractAddress);

    // Load account (use RPC getAccount for Soroban)
    const account = await sorobanServer.getAccount(userPublicKey);

    // Convert parameters to ScVal in the correct order
    const scValParams = functionParameters
      .filter(param => {
        if (param.value === undefined || param.value === null) {
          console.warn(`[TransactionBuilder] ⚠️ Skipping parameter ${param.name} - value is undefined/null`);
          return false;
        }
        if (param.value === '' && param.type !== 'Bytes') {
          console.warn(`[TransactionBuilder] ⚠️ Skipping parameter ${param.name} - value is empty string`);
          return false;
        }
        return true;
      })
      .map(param => {
        try {
          return convertToScVal(param.value, param.type);
        } catch (error) {
          console.error(`[TransactionBuilder] ❌ Error converting parameter ${param.name} (${param.type}):`, error);
          throw new Error(`Failed to convert parameter "${param.name}" (${param.type}): ${error.message}`);
        }
      });

    // Build contract call operation
    const contractCallOp = contract.call(functionName, ...scValParams);

    // Build transaction
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

    // Prepare transaction (adds authorization entries for Soroban)
    const preparedTx = await sorobanServer.prepareTransaction(transaction);

    // Sign transaction with user's secret key
    const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
    preparedTx.sign(keypair);

    // Return signed XDR
    return preparedTx.toXDR();
  } catch (error) {
    console.error('[TransactionBuilder] Error building contract transaction:', error);
    throw new Error(`Failed to build contract transaction: ${error.message}`);
  }
}

/**
 * Validate a signed XDR transaction
 * @param {string} signedXDR - Signed XDR string
 * @param {string} network - 'testnet' or 'mainnet'
 * @returns {Object} - Parsed transaction object
 */
export function validateSignedXDR(signedXDR, network = 'testnet') {
  try {
    const networkPassphrase = network === 'mainnet'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;

    const transaction = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
    
    if (!transaction.signatures || transaction.signatures.length === 0) {
      throw new Error('Transaction has no signatures');
    }

    return {
      transaction,
      source: transaction.source,
      operationCount: transaction.operations.length,
      signatureCount: transaction.signatures.length
    };
  } catch (error) {
    throw new Error(`Invalid signed XDR: ${error.message}`);
  }
}
