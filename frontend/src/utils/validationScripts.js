/**
 * Validation Scripts for WebAuthn & Encryption Improvements
 * Tests for deterministic encoding, challenge derivation, signature normalization, etc.
 */

import { 
  createContractCallIntent, 
  encodeIntentBytes, 
  challengeFromIntent,
  generateNonce 
} from '../services/intentService';
import { 
  normalizeWebAuthnSignatureToRaw64,
  extractUncompressedP256PubKey65FromSPKI 
} from '../services/passkeyService';
import keyVaultService from '../services/keyVaultService';

/**
 * Test 1: Deterministic Intent Encoding
 * Verifies that the same intent (with same nonce) produces the same bytes
 */
export async function testDeterministicEncoding() {
  console.log('🧪 Test 1: Deterministic Intent Encoding');
  
  const intent1 = createContractCallIntent({
    contractId: 'CC74XDT7UVLUZCELKBIYXFYIX6A6LGPWURJVUXGRPQO745RWX7WEURMA',
    fn: 'test',
    args: [{ name: 'value', type: 'I128', value: 100 }],
    signer: 'GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA',
    network: 'testnet',
    authMode: 'webauthn'
  });

  // Create second intent with same nonce (for testing determinism)
  const intent2 = {
    ...intent1,
    nonce: intent1.nonce // Same nonce
  };

  const bytes1 = await encodeIntentBytes(intent1);
  const bytes2 = await encodeIntentBytes(intent2);

  const isDeterministic = bytes1.length === bytes2.length &&
    bytes1.every((byte, i) => byte === bytes2[i]);

  console.log('  ✅ Same intent with same nonce produces same bytes:', isDeterministic);
  console.log('  📊 Bytes length:', bytes1.length);
  
  return isDeterministic;
}

/**
 * Test 2: Challenge Derivation
 * Verifies that SHA-256 hash is used correctly
 */
export async function testChallengeDerivation() {
  console.log('🧪 Test 2: Challenge Derivation');
  
  const intent = createContractCallIntent({
    contractId: 'CC74XDT7UVLUZCELKBIYXFYIX6A6LGPWURJVUXGRPQO745RWX7WEURMA',
    fn: 'test',
    args: [],
    signer: 'GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA',
    network: 'testnet',
    authMode: 'webauthn'
  });

  const intentBytes = await encodeIntentBytes(intent);
  const challenge32 = await challengeFromIntent(intentBytes);

  // Verify challenge is 32 bytes
  const is32Bytes = challenge32.length === 32;
  
  // Verify it's a SHA-256 hash (first 32 bytes of hash)
  const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
  const hash = new Uint8Array(hashBuffer);
  const expectedChallenge = hash.slice(0, 32);
  
  const matchesHash = challenge32.every((byte, i) => byte === expectedChallenge[i]);

  console.log('  ✅ Challenge is 32 bytes:', is32Bytes);
  console.log('  ✅ Challenge matches SHA-256 hash:', matchesHash);
  
  return is32Bytes && matchesHash;
}

/**
 * Test 3: Signature Normalization
 * Verifies DER to raw64 conversion
 */
export function testSignatureNormalization() {
  console.log('🧪 Test 3: Signature Normalization');
  
  // Create a mock DER signature (70-72 bytes)
  // Format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
  const r = new Uint8Array(32);
  const s = new Uint8Array(32);
  crypto.getRandomValues(r);
  crypto.getRandomValues(s);
  
  // Ensure r and s are < 256 (remove leading zeros if needed)
  while (r[0] === 0 && r.length > 32) r = r.slice(1);
  while (s[0] === 0 && s.length > 32) s = s.slice(1);
  
  // Build DER signature
  const derSignature = new Uint8Array(2 + 1 + r.length + 1 + 1 + s.length);
  let pos = 0;
  derSignature[pos++] = 0x30; // SEQUENCE
  derSignature[pos++] = 1 + r.length + 1 + 1 + s.length; // Length
  derSignature[pos++] = 0x02; // INTEGER
  derSignature[pos++] = r.length; // r length
  derSignature.set(r, pos);
  pos += r.length;
  derSignature[pos++] = 0x02; // INTEGER
  derSignature[pos++] = s.length; // s length
  derSignature.set(s, pos);
  
  try {
    const raw64 = normalizeWebAuthnSignatureToRaw64(derSignature);
    
    const is64Bytes = raw64.length === 64;
    const rMatches = raw64.slice(0, 32).every((byte, i) => {
      // Account for padding
      const rStart = 32 - r.length;
      if (i < rStart) return byte === 0; // Padding
      return byte === r[i - rStart];
    });
    const sMatches = raw64.slice(32, 64).every((byte, i) => {
      const sStart = 32 - s.length;
      if (i < sStart) return byte === 0; // Padding
      return byte === s[i - sStart];
    });

    console.log('  ✅ Raw64 is 64 bytes:', is64Bytes);
    console.log('  ✅ R component matches:', rMatches);
    console.log('  ✅ S component matches:', sMatches);
    
    return is64Bytes && rMatches && sMatches;
  } catch (error) {
    console.error('  ❌ Signature normalization failed:', error);
    return false;
  }
}

/**
 * Test 4: SPKI Pubkey Extraction
 * Verifies 65-byte pubkey extraction from SPKI
 */
export function testSPKIExtraction() {
  console.log('🧪 Test 4: SPKI Pubkey Extraction');
  
  // Create a mock SPKI (91 bytes)
  // Format: SEQUENCE (algorithm) BIT STRING (0x04 || X || Y)
  const x = new Uint8Array(32);
  const y = new Uint8Array(32);
  crypto.getRandomValues(x);
  crypto.getRandomValues(y);
  
  const pubkey65 = new Uint8Array(65);
  pubkey65[0] = 0x04; // Uncompressed point marker
  pubkey65.set(x, 1);
  pubkey65.set(y, 33);
  
  // Build mock SPKI (simplified)
  const spki = new Uint8Array(91);
  // SEQUENCE header
  spki[0] = 0x30;
  spki[1] = 0x59; // Length
  // Algorithm identifier (simplified)
  spki.set([0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07], 2);
  // BIT STRING
  spki[23] = 0x03; // BIT STRING tag
  spki[24] = 0x42; // Length (66 bytes: 1 unused bit + 65 bytes key)
  spki[25] = 0x00; // Unused bits
  spki.set(pubkey65, 26);
  
  try {
    const extracted = extractUncompressedP256PubKey65FromSPKI(spki);
    
    const is65Bytes = extracted.length === 65;
    const has04Prefix = extracted[0] === 0x04;
    const xMatches = extracted.slice(1, 33).every((byte, i) => byte === x[i]);
    const yMatches = extracted.slice(33, 65).every((byte, i) => byte === y[i]);

    console.log('  ✅ Extracted pubkey is 65 bytes:', is65Bytes);
    console.log('  ✅ Has 0x04 prefix:', has04Prefix);
    console.log('  ✅ X component matches:', xMatches);
    console.log('  ✅ Y component matches:', yMatches);
    
    return is65Bytes && has04Prefix && xMatches && yMatches;
  } catch (error) {
    console.error('  ❌ SPKI extraction failed:', error);
    return false;
  }
}

/**
 * Test 5: Encryption Round Trip
 * Verifies encrypt/decrypt works correctly
 */
export async function testEncryptionRoundTrip() {
  console.log('🧪 Test 5: Encryption Round Trip');
  
  const testSecretKey = 'SDP35ZRDHDMY2VLLHYMO7A3ZKECD37ODYB5NG66AIXUFYKDYST32EM5U';
  const testPublicKey = 'GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA';
  
  // Create keying material (using credentialId as fallback)
  const keyingMaterial = {
    credentialId: 'test-credential-id',
    passphrase: 'test-passphrase-123'
  };
  
  try {
    // Encrypt
    const encryptedData = await keyVaultService.encryptAndStoreSecretKey(testSecretKey, keyingMaterial);
    
    // Verify required fields
    const hasRequiredFields = !!(
      encryptedData.wrappedDEK &&
      encryptedData.ciphertext &&
      encryptedData.iv &&
      encryptedData.wrapIv &&
      encryptedData.salt
    );
    
    console.log('  ✅ Encryption successful, required fields present:', hasRequiredFields);
    
    // Decrypt
    const decryptedSecretKey = await keyVaultService.decryptSecretKey(encryptedData, keyingMaterial);
    
    const matches = decryptedSecretKey === testSecretKey;
    
    console.log('  ✅ Decryption successful');
    console.log('  ✅ Decrypted secret key matches original:', matches);
    
    // Clean up
    keyVaultService.clearEncryptedWalletData();
    
    return hasRequiredFields && matches;
  } catch (error) {
    console.error('  ❌ Encryption round trip failed:', error);
    return false;
  }
}

/**
 * Run all validation tests
 */
export async function runAllValidationTests() {
  console.log('🚀 Running all validation tests...\n');
  
  const results = {
    deterministicEncoding: await testDeterministicEncoding(),
    challengeDerivation: await testChallengeDerivation(),
    signatureNormalization: testSignatureNormalization(),
    spkiExtraction: testSPKIExtraction(),
    encryptionRoundTrip: await testEncryptionRoundTrip()
  };
  
  console.log('\n📊 Test Results:');
  console.log('  Deterministic Encoding:', results.deterministicEncoding ? '✅ PASS' : '❌ FAIL');
  console.log('  Challenge Derivation:', results.challengeDerivation ? '✅ PASS' : '❌ FAIL');
  console.log('  Signature Normalization:', results.signatureNormalization ? '✅ PASS' : '❌ FAIL');
  console.log('  SPKI Extraction:', results.spkiExtraction ? '✅ PASS' : '❌ FAIL');
  console.log('  Encryption Round Trip:', results.encryptionRoundTrip ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(r => r === true);
  console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
  
  return results;
}

export default {
  testDeterministicEncoding,
  testChallengeDerivation,
  testSignatureNormalization,
  testSPKIExtraction,
  testEncryptionRoundTrip,
  runAllValidationTests
};
