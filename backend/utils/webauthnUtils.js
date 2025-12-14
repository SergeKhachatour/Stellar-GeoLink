/**
 * WebAuthn Utility Functions
 * Handles SPKI extraction, DER signature decoding, and signature normalization
 * Based on XYZ-Wallet-v1 implementation pattern
 */

const crypto = require('crypto');

/**
 * Extract 65-byte uncompressed secp256r1 public key from SPKI format
 * SPKI format is 91 bytes, we need to extract the 65-byte public key point
 */
function extractPublicKeyFromSPKI(spkiBytes) {
  if (!Buffer.isBuffer(spkiBytes)) {
    spkiBytes = Buffer.from(spkiBytes);
  }

  if (spkiBytes.length < 65) {
    throw new Error(`SPKI format too short: ${spkiBytes.length} bytes, need at least 65`);
  }
  
  // Look for BIT STRING tag (0x03) followed by length 0x42 (66 bytes: 1 unused bit + 65 bytes key)
  const bitStringIndex = spkiBytes.indexOf(0x03, 20);
  
  if (bitStringIndex !== -1 && spkiBytes[bitStringIndex + 1] === 0x42) {
    // Skip: tag (1) + length (1) + unused bits (1) = 3 bytes
    const publicKey = spkiBytes.slice(bitStringIndex + 3, bitStringIndex + 3 + 65);
    if (publicKey[0] === 0x04) {
      return publicKey;
    }
  }
  
  // Fallback: search for 0x04 byte
  for (let i = spkiBytes.length - 65; i >= 0; i--) {
    if (spkiBytes[i] === 0x04) {
      if (i + 64 < spkiBytes.length) {
        return spkiBytes.slice(i, i + 65);
      }
    }
  }
  
  // Last resort: take last 65 bytes and ensure 0x04 prefix
  if (spkiBytes.length >= 65) {
    const last65 = spkiBytes.slice(-65);
    if (last65[0] === 0x04) {
      return last65;
    }
    // Prepend 0x04 if missing
    return Buffer.concat([Buffer.from([0x04]), last65.slice(1)]);
  }
  
  throw new Error('Could not find uncompressed public key point in SPKI format');
}

/**
 * Decode DER-encoded ECDSA signature to raw bytes (64 bytes: 32 for r, 32 for s)
 * DER format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
 */
function decodeDERSignature(derSignature) {
  if (!Buffer.isBuffer(derSignature)) {
    derSignature = Buffer.from(derSignature);
  }

  if (derSignature.length < 8) {
    throw new Error('DER signature too short');
  }
  
  if (derSignature[0] !== 0x30) {
    throw new Error('Invalid DER signature: must start with 0x30');
  }
  
  let pos = 2; // Skip 0x30 and length
  
  // Read r component
  if (derSignature[pos] !== 0x02) {
    throw new Error('Invalid DER signature: r component must start with 0x02');
  }
  pos++;
  const rLength = derSignature[pos++];
  let r = derSignature.slice(pos, pos + rLength);
  pos += rLength;
  
  // Remove leading zeros from r
  while (r.length > 32 && r[0] === 0) {
    r = r.slice(1);
  }
  if (r.length > 32) {
    throw new Error('Invalid DER signature: r component too large');
  }
  
  // Read s component
  if (derSignature[pos] !== 0x02) {
    throw new Error('Invalid DER signature: s component must start with 0x02');
  }
  pos++;
  const sLength = derSignature[pos++];
  let s = derSignature.slice(pos, pos + sLength);
  
  // Remove leading zeros from s
  while (s.length > 32 && s[0] === 0) {
    s = s.slice(1);
  }
  if (s.length > 32) {
    throw new Error('Invalid DER signature: s component too large');
  }
  
  // Pad to 32 bytes each if needed
  const rPadded = Buffer.alloc(32);
  r.copy(rPadded, 32 - r.length);
  
  const sPadded = Buffer.alloc(32);
  s.copy(sPadded, 32 - s.length);
  
  // Normalize the signature: ensure 's' is in low form (s < n/2)
  return normalizeECDSASignature(Buffer.concat([rPadded, sPadded]));
}

/**
 * Normalize ECDSA signature to ensure 's' component is in low form
 */
function normalizeECDSASignature(signature) {
  if (!Buffer.isBuffer(signature)) {
    signature = Buffer.from(signature);
  }

  if (signature.length !== 64) {
    throw new Error(`Signature must be 64 bytes, got ${signature.length}`);
  }
  
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  
  // secp256r1 curve order n
  const n = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
  const nHalf = n / 2n;
  
  // Convert s to BigInt
  const sBigInt = BigInt('0x' + s.toString('hex'));
  
  // If s > n/2, normalize to n - s
  let normalizedS = sBigInt;
  if (sBigInt > nHalf) {
    normalizedS = n - sBigInt;
  }
  
  // Convert normalized s back to 32-byte buffer
  const normalizedSHex = normalizedS.toString(16).padStart(64, '0');
  const normalizedSBuffer = Buffer.from(normalizedSHex, 'hex');
  
  // Concatenate r and normalized s
  return Buffer.concat([r, normalizedSBuffer]);
}

/**
 * Generate RP ID hash (32-byte SHA-256 hash of domain name)
 */
function generateRPIdHash(rpId) {
  return crypto.createHash('sha256').update(rpId).digest();
}

module.exports = {
  extractPublicKeyFromSPKI,
  decodeDERSignature,
  normalizeECDSASignature,
  generateRPIdHash,
};

