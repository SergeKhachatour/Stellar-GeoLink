/**
 * WebAuthn/Passkey Service
 * Handles passkey registration and authentication for smart wallet contracts
 * Based on XYZ-Wallet-v1 implementation pattern
 */

// Utility: ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Utility: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  try {
    // Handle both base64url and base64 formats
    // Replace base64url characters with base64 characters
    let normalizedBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (normalizedBase64.length % 4) {
      normalizedBase64 += '=';
    }
    
    const binary = atob(normalizedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error('Error decoding base64:', error);
    console.error('Input string:', base64);
    throw new Error(`Invalid base64 string: ${error.message}`);
  }
}

/**
 * Extract 65-byte uncompressed public key from SPKI format (91 bytes)
 * SPKI structure: SEQUENCE (algorithm) BIT STRING (public key)
 */
function extractPublicKeyFromSPKI(spkiBytes) {
  if (spkiBytes.length < 65) {
    throw new Error(`SPKI format too short: ${spkiBytes.length} bytes`);
  }

  // Look for BIT STRING tag (0x03) followed by length 0x42 (66 bytes: 1 unused bit + 65 bytes key)
  const bitStringIndex = spkiBytes.indexOf(0x03, 20);

  if (bitStringIndex !== -1 && spkiBytes[bitStringIndex + 1] === 0x42) {
    // Skip: tag (1) + length (1) + unused bits (1) = 3 bytes
    const publicKey = spkiBytes.slice(bitStringIndex + 3, bitStringIndex + 3 + 65);
    if (publicKey[0] === 0x04) {
      return publicKey; // Already has 0x04 prefix
    }
  }

  // Fallback: search for 0x04 byte
  for (let i = spkiBytes.length - 65; i >= 0; i--) {
    if (spkiBytes[i] === 0x04) {
      return spkiBytes.slice(i, i + 65);
    }
  }

  // Last resort: take last 65 bytes and ensure 0x04 prefix
  const last65 = spkiBytes.slice(-65);
  if (last65[0] === 0x04) {
    return last65;
  }
  // Prepend 0x04 if missing
  return new Uint8Array([0x04, ...last65.slice(1)]);
}

/**
 * Generate RP ID hash (32-byte SHA-256 hash of domain)
 */
async function generateRPIdHash(rpId) {
  const encoder = new TextEncoder();
  const rpIdBytes = encoder.encode(rpId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
  return new Uint8Array(hashBuffer); // 32 bytes
}

/**
 * Decode DER-encoded signature to raw 64-byte format (r || s, normalized)
 */
function decodeDERSignature(derSignature) {
  const bytes = new Uint8Array(derSignature);

  // DER format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
  if (bytes[0] !== 0x30) {
    throw new Error('Invalid DER signature');
  }

  let pos = 2; // Skip 0x30 and length

  // Read r component
  if (bytes[pos] !== 0x02) throw new Error('Invalid DER: r');
  pos++;
  const rLength = bytes[pos++];
  let r = bytes.slice(pos, pos + rLength);
  pos += rLength;

  // Remove leading zeros
  while (r.length > 32 && r[0] === 0) {
    r = r.slice(1);
  }

  // Read s component
  if (bytes[pos] !== 0x02) throw new Error('Invalid DER: s');
  pos++;
  const sLength = bytes[pos++];
  let s = bytes.slice(pos, pos + sLength);

  // Remove leading zeros
  while (s.length > 32 && s[0] === 0) {
    s = s.slice(1);
  }

  // Pad to 32 bytes each
  const rPadded = new Uint8Array(32);
  rPadded.set(r, 32 - r.length);

  const sPadded = new Uint8Array(32);
  sPadded.set(s, 32 - s.length);

  // Normalize s (ensure s < n/2 for secp256r1)
  // eslint-disable-next-line no-undef
  const n = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
  const nHalf = n / 2n;
  // eslint-disable-next-line no-undef
  const sBigInt = BigInt('0x' + Array.from(sPadded)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''));

  let normalizedS = sBigInt;
  if (sBigInt > nHalf) {
    normalizedS = n - sBigInt;
  }

  const normalizedSHex = normalizedS.toString(16).padStart(64, '0');
  const normalizedSBuffer = new Uint8Array(
    normalizedSHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  // Concatenate r and normalized s (64 bytes total)
  const rawSignature = new Uint8Array(64);
  rawSignature.set(rPadded, 0);
  rawSignature.set(normalizedSBuffer, 32);

  return rawSignature;
}

class WebAuthnService {
  constructor() {
    this.SMART_WALLET_CONTRACT_ID = process.env.REACT_APP_SMART_WALLET_CONTRACT_ID || 
      'CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U';
    this.WEBAUTHN_VERIFIER_CONTRACT_ID = process.env.REACT_APP_WEBAUTHN_VERIFIER_CONTRACT_ID || 
      'CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L';
    this.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    this.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
  }

  /**
   * Register a passkey using WebAuthn API
   * @param {string} userId - User identifier (typically public key)
   * @returns {Promise<{credentialId: string, publicKey: string, counter: number}>}
   */
  async registerPasskey(userId) {
    if (!navigator.credentials || !navigator.credentials.create) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    // Generate random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Get RP ID from hostname
    const rpId = window.location.hostname;

    // Create credential using WebAuthn API
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          id: rpId,
          name: 'GeoLink'
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: 'GeoLink User'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (secp256r1)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer platform authenticators
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });

    if (!credential) {
      throw new Error('Failed to create passkey');
    }

    // Extract public key (SPKI format, 91 bytes)
    const response = credential.response;
    const publicKey = response.getPublicKey();

    // Convert to base64 for storage/transmission
    const publicKeyBase64 = arrayBufferToBase64(publicKey);
    const credentialId = arrayBufferToBase64(credential.rawId);

    return {
      credentialId,
      publicKey: publicKeyBase64, // SPKI format (91 bytes)
      counter: 0
    };
  }

  /**
   * Authenticate with a registered passkey
   * @param {string} credentialId - Base64-encoded credential ID
   * @param {string} signaturePayload - Transaction data or message to sign
   * @returns {Promise<{signature: string, authenticatorData: string, clientDataJSON: string, signaturePayload: string}>}
   */
  async authenticateWithPasskey(credentialId, signaturePayload) {
    if (!navigator.credentials || !navigator.credentials.get) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    if (!credentialId || typeof credentialId !== 'string') {
      throw new Error(`Invalid credentialId: expected string, got ${typeof credentialId}`);
    }

    // Generate challenge from signature payload
    // The verifier contract expects: first 32 bytes of signaturePayload, base64url-encoded
    // The contract does: extract first 32 bytes, base64url-encode them, compare with client_data.challenge
    // So we need to use the first 32 bytes of signaturePayload (padded to 32 bytes if needed)
    const payloadBytes = new TextEncoder().encode(signaturePayload);
    const first32Bytes = new Uint8Array(32);
    
    // Copy first 32 bytes (or all bytes if payload is shorter than 32 bytes)
    // Remaining bytes will be 0 (padded)
    const bytesToCopy = Math.min(32, payloadBytes.length);
    first32Bytes.set(payloadBytes.slice(0, bytesToCopy), 0);
    
    // The WebAuthn API expects the challenge as ArrayBuffer
    // The contract will base64url-encode these exact 32 bytes and compare with client_data.challenge
    const challenge = first32Bytes.buffer;

    // Convert credentialId to ArrayBuffer with error handling
    let credentialIdBuffer;
    try {
      credentialIdBuffer = base64ToArrayBuffer(credentialId);
    } catch (error) {
      console.error('Error converting credentialId to ArrayBuffer:', error);
      console.error('credentialId value:', credentialId);
      throw new Error(`Failed to decode credentialId: ${error.message}`);
    }

    // Authenticate with passkey
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        rpId: window.location.hostname,
        userVerification: 'required',
        allowCredentials: [{
          id: credentialIdBuffer,
          type: 'public-key'
        }]
      }
    });

    if (!credential) {
      throw new Error('Failed to authenticate with passkey');
    }

    const response = credential.response;

    return {
      signature: arrayBufferToBase64(response.signature), // DER-encoded (70-72 bytes)
      authenticatorData: arrayBufferToBase64(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
      signaturePayload: signaturePayload
    };
  }

  /**
   * Register passkey on smart wallet contract
   * @param {string} userPublicKey - Stellar public key
   * @param {string} userSecretKey - Stellar secret key
   * @param {string} passkeyPublicKeySPKI - Base64 SPKI format (91 bytes)
   * @returns {Promise<boolean>}
   */
  async registerSignerOnContract(userPublicKey, userSecretKey, passkeyPublicKeySPKI) {
    const StellarSdk = await import('@stellar/stellar-sdk');
    const sorobanServer = new StellarSdk.SorobanRpc.Server(this.SOROBAN_RPC_URL);
    const contract = new StellarSdk.Contract(this.SMART_WALLET_CONTRACT_ID);

    // Extract 65-byte public key from SPKI
    const spkiBytes = new Uint8Array(base64ToArrayBuffer(passkeyPublicKeySPKI));
    const passkeyPubkey65 = extractPublicKeyFromSPKI(spkiBytes);

    // Generate RP ID hash
    const rpId = window.location.hostname;
    const rpIdHash = await generateRPIdHash(rpId);

    // Create ScVals
    const userAddressBytes = StellarSdk.StrKey.decodeEd25519PublicKey(userPublicKey);
    const userScAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.PublicKey.publicKeyTypeEd25519(userAddressBytes)
    );
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);

    const passkeyPubkeyScVal = StellarSdk.xdr.ScVal.scvBytes(passkeyPubkey65);
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
        networkPassphrase: this.NETWORK_PASSPHRASE
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
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const txResult = await sorobanServer.getTransaction(sendResult.hash);
      if (txResult.status === 'SUCCESS') {
        return true;
      } else if (txResult.status === 'FAILED') {
        throw new Error('Registration failed');
      }
    }

    throw new Error('Registration timeout');
  }

  /**
   * Decode DER signature to raw 64-byte format
   * @param {string} derSignatureBase64 - Base64 DER-encoded signature
   * @returns {Uint8Array} - Raw 64-byte signature (r || s)
   */
  decodeDERSignature(derSignatureBase64) {
    const derSignatureBytes = base64ToArrayBuffer(derSignatureBase64);
    return decodeDERSignature(derSignatureBytes); // Calls the standalone function above
  }

  /**
   * Extract 65-byte public key from SPKI
   * @param {string} spkiBase64 - Base64 SPKI format
   * @returns {Uint8Array} - 65-byte uncompressed public key
   */
  extractPublicKeyFromSPKI(spkiBase64) {
    const spkiBytes = new Uint8Array(base64ToArrayBuffer(spkiBase64));
    return extractPublicKeyFromSPKI(spkiBytes); // Calls the standalone function above
  }

  /**
   * Execute payment using passkey authentication
   * @param {string} destinationAddress - Destination Stellar address
   * @param {string} amount - Amount in XLM (will be converted to stroops)
   * @param {string} assetAddress - Asset contract address (optional, defaults to native XLM)
   * @param {string} credentialId - Base64-encoded credential ID
   * @param {string} passkeyPublicKeySPKI - Base64 SPKI format public key
   * @param {string} userPublicKey - User's Stellar public key
   * @param {string} userSecretKey - User's Stellar secret key
   * @returns {Promise<{success: boolean, hash: string, ledger: number}>}
   */
  async executePaymentWithPasskey(
    destinationAddress,
    amount, // In XLM
    assetAddress,
    credentialId,
    passkeyPublicKeySPKI,
    userPublicKey,
    userSecretKey
  ) {
    // Step 1: Create transaction data
    const transactionData = {
      source: userPublicKey,
      destination: destinationAddress,
      amount: (parseFloat(amount) * 10000000).toString(), // Convert to stroops
      asset: assetAddress || 'native',
    };
    const signaturePayload = JSON.stringify(transactionData);

    // Step 2: Authenticate with passkey
    const authResult = await this.authenticateWithPasskey(credentialId, signaturePayload);

    // Step 3: Call backend API to execute payment
    const api = (await import('./api')).default;
    const response = await api.post('/smart-wallet/execute-payment', {
      userPublicKey,
      userSecretKey,
      destinationAddress,
      amount: transactionData.amount, // In stroops
      assetAddress: assetAddress || null,
      signaturePayload,
      passkeyPublicKeySPKI,
      webauthnSignature: authResult.signature,
      webauthnAuthenticatorData: authResult.authenticatorData,
      webauthnClientData: authResult.clientDataJSON,
    });

    return response.data;
  }
}

const webauthnService = new WebAuthnService();
export default webauthnService;

