/**
 * Contract Execution Helper
 * Wraps Execution Engine for use in ContractManagement
 * Provides backward-compatible interface while using new secure execution
 */

import executionEngine from '../services/executionEngine';
import intentService from '../services/intentService';
import passkeyService from '../services/passkeyService';
import walletEncryptionHelper from './walletEncryptionHelper';

/**
 * Execute a contract function using the new Execution Engine
 * @param {Object} params
 * @param {string} params.contractId - Contract address
 * @param {string} params.functionName - Function name
 * @param {Object} params.parameters - Function parameters
 * @param {string} params.userPublicKey - User's Stellar public key
 * @param {string} params.network - 'testnet' | 'mainnet'
 * @param {Object} params.contract - Contract object (for introspection)
 * @param {Object} params.rule - Rule object (optional, for rule binding)
 * @param {string} [params.authMode] - 'classic' | 'webauthn' (default: 'webauthn')
 * @param {string} [params.credentialId] - Passkey credential ID (for WebAuthn)
 * @param {string} [params.passphrase] - User passphrase (for classic mode)
 * @returns {Promise<{success: boolean, transactionHash?: string, result?: any, error?: string}>}
 */
export async function executeContractFunction({
  contractId,
  functionName,
  parameters,
  userPublicKey,
  network = 'testnet',
  contract = null,
  rule = null,
  authMode = 'webauthn',
  credentialId = null,
  passphrase = null
}) {
  try {
    // Get credential ID if not provided
    if (authMode === 'webauthn' && !credentialId) {
      credentialId = walletEncryptionHelper.getStoredCredentialId();
      if (!credentialId) {
        throw new Error('No passkey credential ID found. Please register a passkey first.');
      }
    }

    // Convert parameters to typed args using contract introspection
    let typedArgs = [];
    if (contract && contract.discovered_functions) {
      const discoveredFunctions = typeof contract.discovered_functions === 'string'
        ? JSON.parse(contract.discovered_functions)
        : contract.discovered_functions;
      
      const func = discoveredFunctions[functionName];
      if (func && func.parameters) {
        typedArgs = intentService.convertIntrospectedArgsToIntentArgs(func.parameters, parameters);
      } else {
        // Fallback: convert parameters object to typed args
        typedArgs = Object.entries(parameters).map(([name, value]) => ({
          name,
          type: inferType(value),
          value
        }));
      }
    } else {
      // No introspection available, infer types from values
      typedArgs = Object.entries(parameters).map(([name, value]) => ({
        name,
        type: inferType(value),
        value
      }));
    }

    // Create intent
    const intent = intentService.createContractCallIntent({
      contractId,
      fn: functionName,
      args: typedArgs,
      signer: userPublicKey,
      network,
      authMode,
      ruleBinding: rule ? rule.id.toString() : null,
      expiresIn: 300 // 5 minutes
    });

    // Prepare execution options
    const executionOptions = {
      authMode,
      simulate: true
    };

    if (authMode === 'webauthn') {
      executionOptions.credentialId = credentialId;
    } else {
      // Classic mode: need keying material
      executionOptions.keyingMaterial = {
        credentialId: walletEncryptionHelper.getStoredCredentialId(),
        passphrase: passphrase
      };
    }

    // Execute
    const result = await executionEngine.executeContractCall(intent, executionOptions);

    return result;
  } catch (error) {
    console.error('[ContractExecutionHelper] Execution failed:', error);
    return {
      success: false,
      error: error.message || 'Contract execution failed'
    };
  }
}

/**
 * Infer parameter type from value
 * @param {any} value
 * @returns {string}
 */
function inferType(value) {
  if (typeof value === 'string') {
    if (value.startsWith('G') && value.length === 56) {
      return 'Address';
    } else if (value.startsWith('C') && value.length === 56) {
      return 'Address';
    }
    return 'String';
  } else if (typeof value === 'number') {
    return 'I128';
  } else if (typeof value === 'boolean') {
    return 'Bool';
  } else if (value instanceof Uint8Array || (typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9+/=]+$/.test(value))) {
    return 'Bytes';
  }
  return 'String';
}

export default {
  executeContractFunction
};
