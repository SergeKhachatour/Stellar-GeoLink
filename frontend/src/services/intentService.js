/**
 * Intent Service for GeoLink
 * Implements ContractCallIntent with deterministic encoding for WebAuthn authentication
 * 
 * Improvements over XYZ-Wallet:
 * - Deterministic intent encoding (canonical JSON with stable key ordering)
 * - SHA-256 challenge derivation (not first 32 bytes of JSON)
 * - Anti-replay protection (nonce + exp)
 * - Generic contract execution (not hardcoded to smart-wallet)
 */

/**
 * ContractCallIntent type
 * @typedef {Object} ContractCallIntent
 * @property {number} v - Version (1)
 * @property {string} network - 'testnet' | 'mainnet'
 * @property {string} rpcUrl - Soroban RPC URL
 * @property {string} contractId - Stellar contract address (starts with C)
 * @property {string} fn - Function name
 * @property {Array<{name: string, type: string, value: any}>} args - Typed, ordered arguments
 * @property {string} signer - Stellar public key of signer
 * @property {string} [ruleBinding] - Optional rule ID for location/time gating
 * @property {string} nonce - Unique nonce (hex string, 32 bytes)
 * @property {number} iat - Issued at timestamp (seconds)
 * @property {number} exp - Expiration timestamp (seconds)
 * @property {string} authMode - 'classic' | 'webauthn'
 */

/**
 * Encode intent to deterministic bytes
 * Uses canonical JSON (stable key ordering) for deterministic encoding
 * @param {ContractCallIntent} intent
 * @returns {Promise<Uint8Array>}
 */
export async function encodeIntentBytes(intent) {
  // Create canonical JSON with stable key ordering
  const canonical = {
    v: intent.v,
    network: intent.network,
    rpcUrl: intent.rpcUrl,
    contractId: intent.contractId,
    fn: intent.fn,
    args: intent.args.map(arg => ({
      name: arg.name,
      type: arg.type,
      value: arg.value
    })),
    signer: intent.signer,
    ...(intent.ruleBinding && { ruleBinding: intent.ruleBinding }),
    nonce: intent.nonce,
    iat: intent.iat,
    exp: intent.exp,
    authMode: intent.authMode
  };

  // Convert to canonical JSON string (stable key ordering)
  const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());

  // Encode as UTF-8 bytes
  return new TextEncoder().encode(jsonString);
}

/**
 * Derive WebAuthn challenge from intent bytes
 * Uses SHA-256 hash, then takes first 32 bytes
 * @param {Uint8Array} intentBytes
 * @returns {Promise<Uint8Array>} 32-byte challenge
 */
export async function challengeFromIntent(intentBytes) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
  const hash = new Uint8Array(hashBuffer);
  
  // Return first 32 bytes (SHA-256 is already 32 bytes, but be explicit)
  return hash.slice(0, 32);
}

/**
 * Convert introspected function arguments to deterministic intent args
 * @param {Array<{name: string, type: string, value: any}>} introspectedArgs - From contract introspection
 * @param {Object} parameterValues - User-provided parameter values
 * @returns {Array<{name: string, type: string, value: any}>}
 */
export function convertIntrospectedArgsToIntentArgs(introspectedArgs, parameterValues) {
  return introspectedArgs.map(param => ({
    name: param.name,
    type: param.type,
    value: parameterValues[param.name] ?? param.default ?? null
  }));
}

/**
 * Generate a random nonce (32 bytes, hex string)
 * @returns {string}
 */
export function generateNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a ContractCallIntent
 * @param {Object} params
 * @param {string} params.contractId - Contract address
 * @param {string} params.fn - Function name
 * @param {Array} params.args - Typed arguments
 * @param {string} params.signer - Signer public key
 * @param {string} params.network - 'testnet' | 'mainnet'
 * @param {string} params.rpcUrl - RPC URL
 * @param {string} params.authMode - 'classic' | 'webauthn'
 * @param {string} [params.ruleBinding] - Optional rule ID
 * @param {number} [params.expiresIn] - Expiration in seconds (default: 300 = 5 minutes)
 * @returns {ContractCallIntent}
 */
export function createContractCallIntent({
  contractId,
  fn,
  args,
  signer,
  network = 'testnet',
  rpcUrl,
  authMode = 'webauthn',
  ruleBinding = null,
  expiresIn = 300
}) {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    v: 1,
    network,
    rpcUrl: rpcUrl || (network === 'testnet' 
      ? 'https://soroban-testnet.stellar.org'
      : 'https://soroban-mainnet.stellar.org'),
    contractId,
    fn,
    args,
    signer,
    ...(ruleBinding && { ruleBinding }),
    nonce: generateNonce(),
    iat: now,
    exp: now + expiresIn,
    authMode
  };
}

/**
 * Validate intent (check expiration, required fields)
 * @param {ContractCallIntent} intent
 * @returns {{valid: boolean, error?: string}}
 */
export function validateIntent(intent) {
  if (!intent.v || intent.v !== 1) {
    return { valid: false, error: 'Invalid intent version' };
  }
  
  if (!intent.contractId || !intent.contractId.startsWith('C')) {
    return { valid: false, error: 'Invalid contract ID' };
  }
  
  if (!intent.fn) {
    return { valid: false, error: 'Function name required' };
  }
  
  if (!intent.signer || !intent.signer.startsWith('G')) {
    return { valid: false, error: 'Invalid signer public key' };
  }
  
  if (!intent.nonce || intent.nonce.length !== 64) {
    return { valid: false, error: 'Invalid nonce' };
  }
  
  const now = Math.floor(Date.now() / 1000);
  if (intent.exp <= now) {
    return { valid: false, error: 'Intent expired' };
  }
  
  if (intent.iat > now + 60) {
    return { valid: false, error: 'Intent issued in the future' };
  }
  
  return { valid: true };
}

const intentService = {
  encodeIntentBytes,
  challengeFromIntent,
  convertIntrospectedArgsToIntentArgs,
  generateNonce,
  createContractCallIntent,
  validateIntent
};

export default intentService;
