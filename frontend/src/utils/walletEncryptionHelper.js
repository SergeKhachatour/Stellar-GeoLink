/**
 * Wallet Encryption Helper
 * Provides helper functions to integrate KeyVaultService with WalletContext
 * Handles migration from plaintext to encrypted storage
 */

import keyVaultService from '../services/keyVaultService';
import passkeyService from '../services/passkeyService';

/**
 * Encrypt and store secret key with passkey
 * @param {string} secretKey - Plaintext secret key
 * @param {string} publicKey - Stellar public key
 * @param {Object} [options] - Options
 * @param {boolean} [options.autoRegisterPasskey] - Auto-register passkey if available
 * @param {string} [options.passphrase] - User-provided passphrase (if PRF not available)
 * @returns {Promise<{encrypted: boolean, passkeyRegistered: boolean, credentialId?: string}>}
 */
export async function encryptAndStoreWallet(secretKey, publicKey, options = {}) {
  const { autoRegisterPasskey = true, passphrase = null } = options;
  
  let keyingMaterial = {
    credentialId: null,
    prfResult: null,
    passphrase: passphrase
  };

  let passkeyRegistered = false;
  let credentialId = null;

  // Try to register passkey if available and requested
  if (autoRegisterPasskey && await passkeyService.isAvailable()) {
    try {
      const registration = await passkeyService.registerPasskey(publicKey, { usePRF: true });
      credentialId = registration.credentialId;
      keyingMaterial.credentialId = credentialId;
      keyingMaterial.prfResult = registration.prfResult; // If PRF extension available
      passkeyRegistered = true;
      
      console.log('[WalletEncryption] Passkey registered with PRF:', !!registration.prfResult);
    } catch (error) {
      console.warn('[WalletEncryption] Passkey registration failed, using fallback:', error);
      // Continue with fallback keying material
    }
  }

  // If no passkey and no passphrase, use credentialId as fallback (less secure)
  if (!keyingMaterial.prfResult && !keyingMaterial.passphrase && keyingMaterial.credentialId) {
    // Use credentialId as fallback (marked as less secure in KeyVaultService)
    console.warn('[WalletEncryption] ⚠️ Using fallback key derivation (less secure). Consider using PRF extension or passphrase.');
  }

  // Encrypt and store secret key
  const encryptedData = await keyVaultService.encryptAndStoreSecretKey(secretKey, keyingMaterial);

  // Store credentialId separately for later use
  if (credentialId) {
    localStorage.setItem('geolink_passkey_credential_id', credentialId);
    // Get public key from registration if available
    const storedPublicKey = localStorage.getItem('geolink_passkey_public_key');
    if (!storedPublicKey && keyingMaterial.prfResult) {
      // Store public key if we have it (from registration)
      // Note: This is a simplified approach - in production, you might want to store the full registration
    }
  }

  return {
    encrypted: true,
    passkeyRegistered,
    credentialId,
    keyDerivation: encryptedData.metadata.keyDerivation
  };
}

/**
 * Decrypt secret key using stored keying material
 * @param {string} publicKey - Stellar public key
 * @param {Object} [options] - Options
 * @param {string} [options.passphrase] - User-provided passphrase (if needed)
 * @returns {Promise<string>} - Decrypted secret key
 */
export async function decryptWallet(publicKey, options = {}) {
  const { passphrase = null } = options;
  
  const encryptedData = keyVaultService.getEncryptedWalletData();
  if (!encryptedData) {
    throw new Error('No encrypted wallet data found');
  }

  // Try to get credentialId from storage
  const credentialId = localStorage.getItem('geolink_passkey_credential_id');
  
  // Build keying material
  const keyingMaterial = {
    credentialId: credentialId,
    prfResult: null, // PRF result is not stored, would need to re-authenticate
    passphrase: passphrase
  };

  // If we have a credentialId, try to get PRF result by re-authenticating
  // Note: This is a simplified approach - in production, you might want to cache PRF results
  if (credentialId && !passphrase) {
    try {
      // For decryption, we can't use PRF result without re-authenticating
      // So we'll use credentialId as fallback or require passphrase
      console.log('[WalletEncryption] Using credentialId for key derivation (PRF requires re-authentication)');
    } catch (error) {
      console.warn('[WalletEncryption] Could not use PRF, falling back:', error);
    }
  }

  return await keyVaultService.decryptSecretKey(encryptedData, keyingMaterial);
}

/**
 * Check if wallet is encrypted
 * @returns {boolean}
 */
export function isWalletEncrypted() {
  return !!keyVaultService.getEncryptedWalletData();
}

/**
 * Check if passkey is registered
 * @returns {boolean}
 */
export function hasPasskey() {
  return !!localStorage.getItem('geolink_passkey_credential_id');
}

/**
 * Get stored credential ID
 * @returns {string | null}
 */
export function getStoredCredentialId() {
  return localStorage.getItem('geolink_passkey_credential_id');
}

/**
 * Clear encrypted wallet data
 */
export function clearEncryptedWallet() {
  keyVaultService.clearEncryptedWalletData();
  localStorage.removeItem('geolink_passkey_credential_id');
  localStorage.removeItem('geolink_passkey_public_key');
}

/**
 * Migrate from plaintext to encrypted storage
 * @param {string} secretKey - Plaintext secret key (from localStorage)
 * @param {string} publicKey - Stellar public key
 * @param {Object} [options] - Options
 * @returns {Promise<{migrated: boolean, passkeyRegistered: boolean}>}
 */
export async function migrateToEncryptedStorage(secretKey, publicKey, options = {}) {
  if (!secretKey) {
    return { migrated: false, error: 'No secret key to migrate' };
  }

  // Encrypt and store
  const result = await encryptAndStoreWallet(secretKey, publicKey, options);

  // Remove plaintext secret key from localStorage
  localStorage.removeItem('stellar_secret_key');

  return {
    migrated: true,
    passkeyRegistered: result.passkeyRegistered,
    credentialId: result.credentialId
  };
}

const walletEncryptionHelper = {
  encryptAndStoreWallet,
  decryptWallet,
  isWalletEncrypted,
  hasPasskey,
  getStoredCredentialId,
  clearEncryptedWallet,
  migrateToEncryptedStorage
};

export default walletEncryptionHelper;
