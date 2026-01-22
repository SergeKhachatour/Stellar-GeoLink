/**
 * Execution Engine for GeoLink
 * Supports two execution lanes:
 * A) Classic: Decrypt secret locally, sign locally, submit
 * B) WebAuthn: Create intent, sign with passkey, submit with WebAuthn verification
 * 
 * Generic contract execution (not hardcoded to smart-wallet)
 * Uses contract introspection for typed parameter encoding
 */

import { 
  createContractCallIntent, 
  encodeIntentBytes, 
  challengeFromIntent, 
  validateIntent,
  convertIntrospectedArgsToIntentArgs 
} from './intentService';
import passkeyService, { base64ToArrayBuffer } from './passkeyService';
import keyVaultService from './keyVaultService';

/**
 * Execution options
 * @typedef {Object} ExecutionOptions
 * @property {string} authMode - 'classic' | 'webauthn'
 * @property {string} [credentialId] - Passkey credential ID (for WebAuthn)
 * @property {KeyingMaterial} [keyingMaterial] - For decrypting secret key (classic mode)
 * @property {string} [dispatcherContractId] - Dispatcher contract ID (if target contract not WebAuthn-aware)
 * @property {boolean} [simulate] - Simulate before executing (default: true)
 */

/**
 * Execution result
 * @typedef {Object} ExecutionResult
 * @property {boolean} success
 * @property {string} [transactionHash]
 * @property {any} [result]
 * @property {string} [error]
 * @property {Object} [simulation] - Simulation result (if simulate was true)
 */

class ExecutionEngine {
  constructor() {
    this.networkPassphrase = 'Test SDF Network ; September 2015';
    this.rpcUrl = 'https://soroban-testnet.stellar.org';
  }

  /**
   * Execute a contract call
   * @param {ContractCallIntent} intent - Contract call intent
   * @param {ExecutionOptions} options - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async executeContractCall(intent, options = {}) {
    // Validate intent
    const validation = validateIntent(intent);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const authMode = options.authMode || intent.authMode || 'webauthn';

    if (authMode === 'classic') {
      return await this.executeClassic(intent, options);
    } else {
      return await this.executeWebAuthn(intent, options);
    }
  }

  /**
   * Classic execution lane: decrypt secret, sign locally, submit
   * @param {ContractCallIntent} intent
   * @param {ExecutionOptions} options
   * @returns {Promise<ExecutionResult>}
   */
  async executeClassic(intent, options) {
    try {
      // Decrypt secret key
      if (!options.keyingMaterial) {
        throw new Error('Keying material required for classic execution');
      }

      const encryptedData = keyVaultService.getEncryptedWalletData();
      if (!encryptedData) {
        throw new Error('No encrypted wallet data found');
      }

      const secretKey = await keyVaultService.decryptSecretKey(encryptedData, options.keyingMaterial);

      // Build Soroban transaction
      const StellarSdk = await import('@stellar/stellar-sdk');
      const sorobanServer = new StellarSdk.rpc.Server(intent.rpcUrl || this.rpcUrl);
      
      // Load account
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      const account = await sorobanServer.getAccount(keypair.publicKey());

      // Build contract instance
      const contract = new StellarSdk.Contract(intent.contractId);

      // Convert intent args to ScVals
      const scValArgs = await this.convertArgsToScVals(intent.args, StellarSdk);

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call(intent.fn, ...scValArgs))
        .setTimeout(180)
        .build();

      // Simulate if requested
      if (options.simulate !== false) {
        const simulation = await sorobanServer.simulateTransaction(transaction);
        if (simulation.errorResult) {
          return {
            success: false,
            error: `Simulation failed: ${simulation.errorResult}`,
            simulation
          };
        }
      }

      // Prepare transaction
      const preparedTx = await sorobanServer.prepareTransaction(transaction);

      // Sign locally
      preparedTx.sign(keypair);

      // Submit
      const sendResult = await sorobanServer.sendTransaction(preparedTx);

      // Poll for result
      const result = await this.pollTransaction(sorobanServer, sendResult.hash);

      return {
        success: true,
        transactionHash: sendResult.hash,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Classic execution failed'
      };
    }
  }

  /**
   * WebAuthn execution lane: create intent, sign with passkey, submit
   * @param {ContractCallIntent} intent
   * @param {ExecutionOptions} options
   * @returns {Promise<ExecutionResult>}
   */
  async executeWebAuthn(intent, options) {
    try {
      // Encode intent to bytes
      const intentBytes = await encodeIntentBytes(intent);

      // Derive challenge from intent
      const challenge32 = await challengeFromIntent(intentBytes);

      // Authenticate with passkey
      if (!options.credentialId) {
        throw new Error('Credential ID required for WebAuthn execution');
      }

      const authResult = await passkeyService.authenticatePasskey(
        options.credentialId,
        challenge32
      );

      // Check if target contract is WebAuthn-aware
      // If not, route through dispatcher contract
      const targetContractId = options.dispatcherContractId || intent.contractId;

      // Build Soroban transaction with WebAuthn parameters
      const StellarSdk = await import('@stellar/stellar-sdk');
      const sorobanServer = new StellarSdk.rpc.Server(intent.rpcUrl || this.rpcUrl);

      // For WebAuthn execution, we need to:
      // 1. Build contract call with WebAuthn signature parameters
      // 2. Include signature_payload (intentBytes as base64)
      // 3. Include signature (raw64 format)
      // 4. Include authenticatorData and clientDataJSON

      // Convert intent args to ScVals
      const scValArgs = await this.convertArgsToScVals(intent.args, StellarSdk);

      // Add WebAuthn parameters to args
      const webauthnArgs = [
        ...scValArgs,
        StellarSdk.xdr.ScVal.scvBytes(new Uint8Array(base64ToArrayBuffer(authResult.signatureRaw64))), // signature (raw64)
        StellarSdk.xdr.ScVal.scvBytes(new Uint8Array(base64ToArrayBuffer(authResult.authenticatorData))), // authenticatorData
        StellarSdk.xdr.ScVal.scvBytes(new Uint8Array(base64ToArrayBuffer(authResult.clientDataJSON))), // clientDataJSON
        StellarSdk.xdr.ScVal.scvBytes(intentBytes) // signature_payload (intent bytes)
      ];

      // Load account (for transaction source)
      // Note: For WebAuthn, we may not need the user's secret key for signing
      // The contract verifies WebAuthn signature on-chain
      // But we still need an account for the transaction source
      // This should be the signer's account from intent
      const account = await sorobanServer.getAccount(intent.signer);

      // Build contract instance
      const contract = new StellarSdk.Contract(targetContractId);

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call(intent.fn, ...webauthnArgs))
        .setTimeout(180)
        .build();

      // Simulate if requested
      if (options.simulate !== false) {
        const simulation = await sorobanServer.simulateTransaction(transaction);
        if (simulation.errorResult) {
          return {
            success: false,
            error: `Simulation failed: ${simulation.errorResult}`,
            simulation
          };
        }
      }

      // Prepare transaction
      const preparedTx = await sorobanServer.prepareTransaction(transaction);

      // For WebAuthn, we may not need to sign with secret key
      // But if the contract requires it, we'll need to decrypt and sign
      // For now, we'll sign with a service account or skip signing if contract handles it
      // TODO: Determine if signing is needed based on contract requirements

      // Submit
      const sendResult = await sorobanServer.sendTransaction(preparedTx);

      // Poll for result
      const result = await this.pollTransaction(sorobanServer, sendResult.hash);

      return {
        success: true,
        transactionHash: sendResult.hash,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'WebAuthn execution failed'
      };
    }
  }

  /**
   * Convert intent args to ScVals
   * @param {Array<{name: string, type: string, value: any}>} args
   * @param {any} StellarSdk
   * @returns {Promise<Array>}
   */
  async convertArgsToScVals(args, StellarSdk) {
    return args.map(arg => {
      switch (arg.type.toLowerCase()) {
        case 'address':
        case 'account':
          return StellarSdk.Address.fromString(arg.value);
        case 'i128':
          return StellarSdk.nativeToScVal(arg.value, { type: 'i128' });
        case 'i64':
          return StellarSdk.nativeToScVal(arg.value, { type: 'i64' });
        case 'u64':
          return StellarSdk.nativeToScVal(arg.value, { type: 'u64' });
        case 'bytes':
        case 'bytesn':
          const bytes = typeof arg.value === 'string' 
            ? new Uint8Array(base64ToArrayBuffer(arg.value))
            : new Uint8Array(arg.value);
          return StellarSdk.xdr.ScVal.scvBytes(bytes);
        case 'bool':
        case 'boolean':
          return StellarSdk.xdr.ScVal.scvBool(arg.value);
        case 'string':
        case 'symbol':
          return StellarSdk.xdr.ScVal.scvString(String(arg.value));
        default:
          // Try to infer type from value
          if (typeof arg.value === 'string' && arg.value.startsWith('G')) {
            return StellarSdk.Address.fromString(arg.value);
          } else if (typeof arg.value === 'number') {
            return StellarSdk.nativeToScVal(arg.value, { type: 'i128' });
          } else if (typeof arg.value === 'boolean') {
            return StellarSdk.xdr.ScVal.scvBool(arg.value);
          }
          return StellarSdk.xdr.ScVal.scvString(String(arg.value));
      }
    });
  }

  /**
   * Poll transaction until confirmed
   * @param {any} sorobanServer
   * @param {string} transactionHash
   * @returns {Promise<any>}
   */
  async pollTransaction(sorobanServer, transactionHash) {
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const tx = await sorobanServer.getTransaction(transactionHash);
        if (tx.status === 'SUCCESS') {
          return tx;
        } else if (tx.status === 'FAILED') {
          throw new Error(`Transaction failed: ${tx.errorResultXdr || 'Unknown error'}`);
        }
      } catch (error) {
        if (i === 19) {
          throw error;
        }
        // Continue polling
      }
    }
    
    throw new Error('Transaction polling timeout');
  }
}

// Export singleton instance
export const executionEngine = new ExecutionEngine();

export default executionEngine;
