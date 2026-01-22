/**
 * Key Vault Service for GeoLink
 * Implements encrypted secret key storage with WebAuthn-gated access
 * 
 * Improvements over XYZ-Wallet:
 * - PRF extension support for key derivation (if available)
 * - PBKDF2 fallback with user passphrase
 * - Proper wrapIv storage and validation
 * - Never stores plaintext secret keys
 * - Clear security warnings for fallback methods
 */

/**
 * Encrypted wallet data structure
 * @typedef {Object} EncryptedWalletData
 * @property {string} wrappedDEK - Base64 encoded wrapped DEK
 * @property {string} ciphertext - Base64 encoded encrypted secret key
 * @property {string} iv - Base64 encoded IV for data encryption
 * @property {string} wrapIv - Base64 encoded IV for key wrapping (REQUIRED)
 * @property {string} salt - Base64 encoded salt for KEK derivation
 * @property {Object} metadata - Encryption metadata
 * @property {string} metadata.algorithm - 'AES-GCM'
 * @property {string} metadata.keyDerivation - 'PRF' | 'PBKDF2' | 'FALLBACK'
 * @property {number} metadata.timestamp - Encryption timestamp
 * @property {string} metadata.version - Version string
 */

/**
 * Keying material for KEK derivation
 * @typedef {Object} KeyingMaterial
 * @property {string} [prfResult] - PRF result from WebAuthn (base64, if available)
 * @property {string} [passphrase] - User-provided passphrase (if PRF not available)
 * @property {string} credentialId - Passkey credential ID (for fallback)
 */

class KeyVaultService {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12; // 96 bits for GCM
    this.version = '2.0.0'; // Version 2: PRF support + improved security
    this.storageKey = 'geolink_encrypted_wallet';
  }

  /**
   * Derive KEK (Key Encryption Key) from keying material
   * Priority: PRF result > PBKDF2(passphrase) > Fallback (marked insecure)
   * 
   * @param {KeyingMaterial} keyingMaterial
   * @param {string} salt - Base64 encoded salt
   * @returns {Promise<CryptoKey>}
   */
  async deriveKEK(keyingMaterial, salt) {
    const saltBytes = this.base64ToUint8Array(salt);
    
    // Priority 1: PRF extension result (most secure)
    if (keyingMaterial.prfResult) {
      try {
        console.log('[KeyVault] Using PRF extension for KEK derivation');
        return await this.deriveKEKFromPRF(keyingMaterial.prfResult, saltBytes);
      } catch (error) {
        console.warn('[KeyVault] PRF derivation failed, falling back:', error);
      }
    }

    // Priority 2: PBKDF2 with user passphrase
    if (keyingMaterial.passphrase) {
      console.log('[KeyVault] Using PBKDF2 with passphrase for KEK derivation');
      return await this.deriveKEKWithPBKDF2(keyingMaterial.passphrase, saltBytes);
    }

    // Priority 3: Fallback (less secure, but functional)
    // Use credentialId as keying material (not ideal, but better than nothing)
    console.warn('[KeyVault] ⚠️ Using fallback key derivation (less secure). Consider using PRF extension or passphrase.');
    const fallbackMaterial = keyingMaterial.credentialId || 'fallback';
    return await this.deriveKEKWithPBKDF2(fallbackMaterial, saltBytes);
  }

  /**
   * Derive KEK from PRF result
   * @param {string} prfResultBase64 - Base64 encoded PRF result
   * @param {Uint8Array} salt - Salt bytes
   * @returns {Promise<CryptoKey>}
   */
  async deriveKEKFromPRF(prfResultBase64, salt) {
    const prfResult = this.base64ToUint8Array(prfResultBase64);
    
    // Use PRF result directly as key material (it's already cryptographically strong)
    // Apply HKDF-like expansion if needed, or use directly
    // For simplicity, we'll use PBKDF2 with PRF result as input
    const prfKey = await crypto.subtle.importKey(
      'raw',
      prfResult,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000, // Lower iterations since PRF is already strong
        hash: 'SHA-256'
      },
      prfKey,
      { name: this.algorithm, length: this.keyLength },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  /**
   * Derive KEK using PBKDF2
   * @param {string} passphrase - Passphrase or keying material
   * @param {Uint8Array} salt - Salt bytes
   * @returns {Promise<CryptoKey>}
   */
  async deriveKEKWithPBKDF2(passphrase, salt) {
    const secretKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 200000, // Strong iteration count
        hash: 'SHA-256'
      },
      secretKey,
      { name: this.algorithm, length: this.keyLength },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  /**
   * Generate a random DEK (Data Encryption Key)
   * @returns {Promise<CryptoKey>}
   */
  async generateDEK() {
    return await crypto.subtle.generateKey(
      { name: this.algorithm, length: this.keyLength },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt secret key with DEK
   * @param {string} secretKey - Plaintext secret key
   * @param {CryptoKey} dek - Data Encryption Key
   * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
   */
  async encryptSecretKey(secretKey, dek) {
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    const plaintext = new TextEncoder().encode(secretKey);
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: this.algorithm, iv: iv },
      dek,
      plaintext
    );
    
    return {
      ciphertext: new Uint8Array(ciphertext),
      iv: iv
    };
  }

  /**
   * Decrypt secret key with DEK
   * @param {Uint8Array} ciphertext - Encrypted secret key
   * @param {Uint8Array} iv - IV used for encryption
   * @param {CryptoKey} dek - Data Encryption Key
   * @returns {Promise<string>}
   */
  async decryptSecretKeyWithDEK(ciphertext, iv, dek) {
    const plaintext = await crypto.subtle.decrypt(
      { name: this.algorithm, iv: iv },
      dek,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Wrap DEK with KEK
   * @param {CryptoKey} dek - Data Encryption Key
   * @param {CryptoKey} kek - Key Encryption Key
   * @param {Uint8Array} [wrapIv] - Optional wrap IV (generated if not provided)
   * @returns {Promise<{wrappedDEK: ArrayBuffer, wrapIv: Uint8Array}>}
   */
  async wrapDEK(dek, kek, wrapIv) {
    const iv = wrapIv || crypto.getRandomValues(new Uint8Array(this.ivLength));
    
    const wrappedDEK = await crypto.subtle.wrapKey(
      'raw',
      dek,
      kek,
      { 
        name: this.algorithm,
        iv: iv
      }
    );
    
    return {
      wrappedDEK,
      wrapIv: iv
    };
  }

  /**
   * Unwrap DEK with KEK
   * @param {ArrayBuffer} wrappedDEK - Wrapped DEK
   * @param {CryptoKey} kek - Key Encryption Key
   * @param {Uint8Array} wrapIv - Wrap IV (REQUIRED)
   * @returns {Promise<CryptoKey>}
   */
  async unwrapDEK(wrappedDEK, kek, wrapIv) {
    if (!wrapIv || wrapIv.length !== this.ivLength) {
      throw new Error(`Invalid wrap IV: expected ${this.ivLength} bytes, got ${wrapIv?.length || 0}`);
    }

    try {
      return await crypto.subtle.unwrapKey(
        'raw',
        wrappedDEK,
        kek,
        { 
          name: this.algorithm,
          iv: wrapIv
        },
        { name: this.algorithm, length: this.keyLength },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      const errorName = error?.name || 'UnknownError';
      const errorMsg = error?.message || 'Unknown error';
      
      if (errorName === 'OperationError' || errorName === 'InvalidAccessError') {
        throw new Error(`Failed to decrypt wallet encryption key. This wallet may have been created before encryption improvements (missing wrap IV). Please create a new wallet. Original error: ${errorMsg}`);
      }
      
      throw new Error(`Failed to unwrap encryption key: ${errorMsg}`);
    }
  }

  /**
   * Generate a random salt
   * @returns {string} Base64 encoded salt
   */
  generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    return this.uint8ArrayToBase64(salt);
  }

  /**
   * Encrypt and store secret key
   * @param {string} secretKey - Plaintext secret key
   * @param {KeyingMaterial} keyingMaterial - Keying material for KEK derivation
   * @returns {Promise<EncryptedWalletData>}
   */
  async encryptAndStoreSecretKey(secretKey, keyingMaterial) {
    // Generate random salt for this encryption
    const salt = this.generateSalt();
    
    // Derive KEK
    const kek = await this.deriveKEK(keyingMaterial, salt);
    
    // Generate DEK
    const dek = await this.generateDEK();
    
    // Encrypt secret key with DEK
    const { ciphertext, iv } = await this.encryptSecretKey(secretKey, dek);
    
    // Wrap DEK with KEK (generate IV for wrapping)
    const wrapIv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    const { wrappedDEK } = await this.wrapDEK(dek, kek, wrapIv);
    
    // Determine key derivation method for metadata
    let keyDerivation = 'FALLBACK';
    if (keyingMaterial.prfResult) {
      keyDerivation = 'PRF';
    } else if (keyingMaterial.passphrase) {
      keyDerivation = 'PBKDF2';
    }

    const encryptedData = {
      wrappedDEK: this.uint8ArrayToBase64(new Uint8Array(wrappedDEK)),
      ciphertext: this.uint8ArrayToBase64(ciphertext),
      iv: this.uint8ArrayToBase64(iv),
      wrapIv: this.uint8ArrayToBase64(wrapIv), // CRITICAL: Store wrap IV
      salt: salt, // Store salt for KEK derivation
      metadata: {
        algorithm: this.algorithm,
        keyDerivation: keyDerivation,
        timestamp: Date.now(),
        version: this.version
      }
    };

    // Store in localStorage
    this.storeEncryptedWalletData(encryptedData);

    return encryptedData;
  }

  /**
   * Decrypt and retrieve secret key
   * @param {EncryptedWalletData} encryptedData - Encrypted wallet data
   * @param {KeyingMaterial} keyingMaterial - Keying material for KEK derivation
   * @returns {Promise<string>}
   */
  async decryptSecretKey(encryptedData, keyingMaterial) {
    // Validate required fields
    if (!encryptedData.wrapIv || encryptedData.wrapIv.trim() === '') {
      throw new Error('Cannot decrypt wallet: This wallet was created before wrap IV storage was implemented. The encryption key cannot be recovered without the wrap IV. Please create a new wallet.');
    }

    if (!encryptedData.salt || encryptedData.salt.trim() === '') {
      throw new Error('Cannot decrypt wallet: This wallet was created before salt storage was implemented. The encryption key cannot be recovered without the salt. Please create a new wallet.');
    }

    // Derive KEK using stored salt
    const kek = await this.deriveKEK(keyingMaterial, encryptedData.salt);

    // Unwrap DEK
    const wrappedDEK = this.base64ToUint8Array(encryptedData.wrappedDEK);
    const wrapIv = this.base64ToUint8Array(encryptedData.wrapIv);
    
    // Validate wrapIv length
    if (wrapIv.length !== this.ivLength) {
      throw new Error(`Invalid wrap IV length: expected ${this.ivLength} bytes, got ${wrapIv.length}. This wallet may have been created before encryption improvements.`);
    }
    
    let dek;
    try {
      dek = await this.unwrapDEK(wrappedDEK.buffer, kek, wrapIv);
    } catch (unwrapError) {
      const errorMsg = unwrapError?.message || 'Unknown decryption error';
      if (errorMsg.includes('wrap IV') || errorMsg.includes('wrapIv')) {
        throw unwrapError; // Re-throw if it's already our custom error
      }
      throw new Error(`Failed to decrypt wallet encryption key: ${errorMsg}. This may indicate the wallet was created before encryption improvements. Please create a new wallet.`);
    }

    // Decrypt secret key
    const ciphertext = this.base64ToUint8Array(encryptedData.ciphertext);
    const iv = this.base64ToUint8Array(encryptedData.iv);

    return await this.decryptSecretKeyWithDEK(ciphertext, iv, dek);
  }

  /**
   * Store encrypted wallet data in localStorage
   * @param {EncryptedWalletData} encryptedData
   */
  storeEncryptedWalletData(encryptedData) {
    localStorage.setItem(this.storageKey, JSON.stringify(encryptedData));
  }

  /**
   * Retrieve encrypted wallet data from localStorage
   * @returns {EncryptedWalletData | null}
   */
  getEncryptedWalletData() {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return null;
    
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse encrypted wallet data:', error);
      return null;
    }
  }

  /**
   * Clear encrypted wallet data
   */
  clearEncryptedWalletData() {
    localStorage.removeItem(this.storageKey);
  }

  // Utility functions
  base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  uint8ArrayToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// Export singleton instance
export const keyVaultService = new KeyVaultService();

export default keyVaultService;
