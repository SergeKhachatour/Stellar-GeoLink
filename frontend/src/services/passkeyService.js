/**
 * Improved Passkey Service for GeoLink
 * Based on XYZ-Wallet-v1 but with security improvements:
 * - Proper DER signature normalization to raw64 format
 * - SPKI pubkey extraction with validation
 * - Support for PRF extension (when available)
 * - Better error handling
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
    throw new Error(`Invalid base64 string: ${error.message}`);
  }
}

/**
 * Normalize WebAuthn signature from DER format to raw64 format (r || s, 64 bytes)
 * DER format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
 * Raw format: [r (32 bytes, padded)] || [s (32 bytes, padded)]
 * 
 * @param {ArrayBuffer|Uint8Array} derSignature - DER-encoded signature (70-72 bytes)
 * @returns {Uint8Array} - Raw signature (64 bytes: r || s)
 */
export function normalizeWebAuthnSignatureToRaw64(derSignature) {
  const bytes = derSignature instanceof Uint8Array 
    ? derSignature 
    : new Uint8Array(derSignature);

  if (bytes.length < 70 || bytes.length > 72) {
    throw new Error(`Invalid DER signature length: ${bytes.length} bytes (expected 70-72)`);
  }

  // DER format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
  if (bytes[0] !== 0x30) {
    throw new Error('Invalid DER signature: missing SEQUENCE tag (0x30)');
  }

  let pos = 2; // Skip 0x30 and length byte

  // Parse r
  if (bytes[pos] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for r (0x02)');
  }
  pos++; // Skip 0x02

  const rLength = bytes[pos++];
  let r = bytes.slice(pos, pos + rLength);
  pos += rLength;

  // Remove leading zero padding from r (if present)
  if (r[0] === 0x00 && r.length > 32) {
    r = r.slice(1);
  }

  // Parse s
  if (bytes[pos] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for s (0x02)');
  }
  pos++; // Skip 0x02

  const sLength = bytes[pos++];
  let s = bytes.slice(pos, pos + sLength);

  // Remove leading zero padding from s (if present)
  if (s[0] === 0x00 && s.length > 32) {
    s = s.slice(1);
  }

  // Pad r and s to 32 bytes each
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  
  if (r.length > 32 || s.length > 32) {
    throw new Error(`Invalid signature component length: r=${r.length}, s=${s.length}`);
  }

  // Right-align (pad from left)
  rPadded.set(r, 32 - r.length);
  sPadded.set(s, 32 - s.length);

  // Concatenate: r || s
  const raw64 = new Uint8Array(64);
  raw64.set(rPadded, 0);
  raw64.set(sPadded, 32);

  return raw64;
}

/**
 * Extract uncompressed P-256 public key (65 bytes: 0x04 || X || Y) from SPKI format
 * SPKI structure: SEQUENCE (algorithm) BIT STRING (public key)
 * 
 * @param {ArrayBuffer|Uint8Array|string} spki - SPKI format (91 bytes) or base64 string
 * @returns {Uint8Array} - 65-byte uncompressed public key (0x04 || X || Y)
 */
export function extractUncompressedP256PubKey65FromSPKI(spki) {
  let spkiBytes;
  
  if (typeof spki === 'string') {
    // Base64 string
    spkiBytes = new Uint8Array(base64ToArrayBuffer(spki));
  } else if (spki instanceof ArrayBuffer) {
    spkiBytes = new Uint8Array(spki);
  } else if (spki instanceof Uint8Array) {
    spkiBytes = spki;
  } else {
    throw new Error('Invalid SPKI format: expected string, ArrayBuffer, or Uint8Array');
  }

  if (spkiBytes.length < 65) {
    throw new Error(`SPKI format too short: ${spkiBytes.length} bytes (expected at least 65)`);
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

  // Fallback: search for 0x04 byte (uncompressed point marker)
  for (let i = spkiBytes.length - 65; i >= 0; i--) {
    if (spkiBytes[i] === 0x04) {
      const extracted = spkiBytes.slice(i, i + 65);
      if (extracted.length === 65) {
        return extracted;
      }
    }
  }

  // Last resort: take last 65 bytes and ensure 0x04 prefix
  const last65 = spkiBytes.slice(-65);
  if (last65[0] === 0x04) {
    return last65;
  }
  
  // Prepend 0x04 if missing
  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(last65.slice(1), 1);
  return result;
}

class PasskeyService {
  constructor() {
    this.rpId = window.location.hostname;
    this.rpName = 'GeoLink';
  }

  /**
   * Check if WebAuthn is supported
   */
  isSupported() {
    return !!(
      window.PublicKeyCredential &&
      window.navigator.credentials &&
      typeof window.navigator.credentials.create === 'function' &&
      typeof window.navigator.credentials.get === 'function'
    );
  }

  /**
   * Check if passkeys are available on this device
   */
  async isAvailable() {
    if (!this.isSupported()) {
      return false;
    }

    try {
      // eslint-disable-next-line no-undef
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch (error) {
      console.warn('Passkey availability check failed:', error);
      return false;
    }
  }

  /**
   * Register a new passkey
   * @param {string} userId - User identifier (typically public key)
   * @param {Object} [options] - Registration options
   * @param {boolean} [options.usePRF] - Request PRF extension for key derivation
   * @returns {Promise<{credentialId: string, publicKey: string, publicKeySPKI: string, counter: number}>}
   */
  async registerPasskey(userId, options = {}) {
    if (!this.isSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    try {
      // Generate a challenge (in production, this should come from your server)
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const publicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          id: this.rpId,
          name: this.rpName,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: 'GeoLink User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (secp256r1)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer platform authenticators
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
        // Request PRF extension if available (for key derivation)
        ...(options.usePRF && {
          extensions: {
            prf: {
              eval: {
                first: new Uint8Array(32), // Salt for PRF evaluation
              }
            }
          }
        })
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      });

      if (!credential) {
        throw new Error('Failed to create passkey');
      }

      // Extract the credential data
      const response = credential.response;
      const publicKeySPKI = response.getPublicKey(); // SPKI format (91 bytes)
      const publicKeySPKIBase64 = arrayBufferToBase64(publicKeySPKI);
      
      // Extract 65-byte uncompressed public key
      const publicKey65 = extractUncompressedP256PubKey65FromSPKI(publicKeySPKI);
      const publicKey65Base64 = arrayBufferToBase64(publicKey65.buffer);
      
      const credentialId = arrayBufferToBase64(credential.rawId);

      // Extract PRF result if available
      let prfResult = null;
      if (response.getPublicKeyAlgorithm() === -7 && response.getClientExtensionResults) {
        const extensions = response.getClientExtensionResults();
        if (extensions.prf && extensions.prf.enabled) {
          prfResult = extensions.prf.results?.first;
        }
      }

      return {
        credentialId,
        publicKey: publicKey65Base64, // 65-byte uncompressed (0x04 || X || Y)
        publicKeySPKI: publicKeySPKIBase64, // Full SPKI format (91 bytes)
        counter: 0,
        prfResult: prfResult ? arrayBufferToBase64(prfResult) : null
      };
    } catch (error) {
      console.error('Passkey registration failed:', error);
      throw new Error(`Passkey registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Authenticate using an existing passkey
   * @param {string} [credentialId] - Optional credential ID (if not provided, shows all passkeys)
   * @param {Uint8Array} [customChallenge] - Optional custom challenge (32 bytes)
   * @returns {Promise<{credentialId: string, signature: string, signatureRaw64: string, authenticatorData: string, clientDataJSON: string}>}
   */
  async authenticatePasskey(credentialId, customChallenge) {
    if (!this.isSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    try {
      // Use custom challenge if provided, otherwise generate a random one
      const challenge = customChallenge || (() => {
        const randomChallenge = new Uint8Array(32);
        crypto.getRandomValues(randomChallenge);
        return randomChallenge;
      })();
      
      if (challenge.length !== 32) {
        throw new Error('Challenge must be exactly 32 bytes');
      }

      const publicKeyCredentialRequestOptions = {
        challenge,
        timeout: 60000,
        rpId: this.rpId,
        userVerification: 'required',
        allowCredentials: credentialId ? [{
          id: base64ToArrayBuffer(credentialId),
          type: 'public-key',
        }] : undefined,
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });

      if (!credential) {
        throw new Error('Failed to authenticate with passkey');
      }

      const response = credential.response;
      const signatureDER = new Uint8Array(response.signature);
      const signatureDERBase64 = arrayBufferToBase64(response.signature);
      
      // Normalize DER signature to raw64 format
      const signatureRaw64 = normalizeWebAuthnSignatureToRaw64(signatureDER);
      const signatureRaw64Base64 = arrayBufferToBase64(signatureRaw64.buffer);
      
      const credentialIdBase64 = arrayBufferToBase64(credential.rawId);
      const authenticatorData = arrayBufferToBase64(response.authenticatorData);
      const clientDataJSON = arrayBufferToBase64(response.clientDataJSON);

      return {
        credentialId: credentialIdBase64,
        signature: signatureDERBase64, // DER format (for compatibility)
        signatureRaw64: signatureRaw64Base64, // Raw64 format (r || s, 64 bytes)
        authenticatorData,
        clientDataJSON,
      };
    } catch (error) {
      console.error('Passkey authentication failed:', error);
      throw new Error(`Passkey authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const passkeyService = new PasskeyService();

// Export utility functions (normalizeWebAuthnSignatureToRaw64 and extractUncompressedP256PubKey65FromSPKI already exported above)
export {
  arrayBufferToBase64,
  base64ToArrayBuffer
};

export default passkeyService;
