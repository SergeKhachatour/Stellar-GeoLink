/**
 * Middleware to validate signed XDR transactions
 * Ensures backend never receives secret keys, only signed XDR
 */

const StellarSdk = require('@stellar/stellar-sdk');

/**
 * Validate that a request contains signed XDR instead of secret key
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function validateSignedXDR(req, res, next) {
  // Check if request contains secret key
  const hasSecretKey = !!(
    req.body.user_secret_key ||
    req.body.secretKey ||
    req.body.secret_key ||
    req.body.userSecretKey
  );

  // Check if request contains signed XDR
  const hasSignedXDR = !!(
    req.body.signed_xdr ||
    req.body.signedXDR ||
    req.body.transaction_xdr
  );

  if (hasSecretKey && !hasSignedXDR) {
    // Warn but don't block (for backward compatibility during migration)
    console.warn('[Security] ⚠️ Request contains secret key. Consider migrating to signed XDR.');
    console.warn('[Security] Secret key found in:', {
      has_user_secret_key: !!req.body.user_secret_key,
      has_secretKey: !!req.body.secretKey,
      has_secret_key: !!req.body.secret_key,
      has_userSecretKey: !!req.body.userSecretKey
    });

    // For now, allow but log warning
    // In production, you might want to return an error:
    // return res.status(400).json({
    //   error: 'Secret keys are not accepted. Please sign the transaction client-side and send signed XDR instead.',
    //   migration_guide: 'See WEBAUTHN_IMPROVEMENTS_IMPLEMENTATION.md for migration instructions'
    // });
  }

  // If signed XDR is provided, validate it
  if (hasSignedXDR) {
    try {
      const signedXDR = req.body.signed_xdr || req.body.signedXDR || req.body.transaction_xdr;
      const networkPassphrase = req.body.network_passphrase || 
        (req.body.network === 'testnet' 
          ? StellarSdk.Networks.TESTNET 
          : StellarSdk.Networks.PUBLIC);

      // Parse and validate XDR
      const transaction = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
      
      // Verify transaction is signed
      if (!transaction.signatures || transaction.signatures.length === 0) {
        return res.status(400).json({
          error: 'Signed XDR must contain at least one signature'
        });
      }

      // Store parsed transaction in request for use in route handlers
      req.parsedTransaction = transaction;
      req.signedXDR = signedXDR;

      console.log('[Security] ✅ Signed XDR validated:', {
        source: transaction.source,
        operationCount: transaction.operations.length,
        signatureCount: transaction.signatures.length
      });
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid signed XDR format',
        details: error.message
      });
    }
  }

  next();
}

/**
 * Middleware to require signed XDR (no secret keys allowed)
 * Use this for new endpoints that should never accept secret keys
 */
function requireSignedXDR(req, res, next) {
  const hasSecretKey = !!(
    req.body.user_secret_key ||
    req.body.secretKey ||
    req.body.secret_key ||
    req.body.userSecretKey
  );

  if (hasSecretKey) {
    return res.status(400).json({
      error: 'Secret keys are not accepted. Please sign the transaction client-side and send signed XDR instead.',
      migration_guide: 'See WEBAUTHN_IMPROVEMENTS_IMPLEMENTATION.md for migration instructions'
    });
  }

  const hasSignedXDR = !!(
    req.body.signed_xdr ||
    req.body.signedXDR ||
    req.body.transaction_xdr
  );

  if (!hasSignedXDR) {
    return res.status(400).json({
      error: 'Signed XDR is required. Please sign the transaction client-side and send the signed XDR.',
      migration_guide: 'See WEBAUTHN_IMPROVEMENTS_IMPLEMENTATION.md for migration instructions'
    });
  }

  // Validate XDR
  try {
    const signedXDR = req.body.signed_xdr || req.body.signedXDR || req.body.transaction_xdr;
    const networkPassphrase = req.body.network_passphrase || 
      (req.body.network === 'testnet' 
        ? StellarSdk.Networks.TESTNET 
        : StellarSdk.Networks.PUBLIC);

    const transaction = StellarSdk.TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
    
    if (!transaction.signatures || transaction.signatures.length === 0) {
      return res.status(400).json({
        error: 'Signed XDR must contain at least one signature'
      });
    }

    req.parsedTransaction = transaction;
    req.signedXDR = signedXDR;
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid signed XDR format',
      details: error.message
    });
  }

  next();
}

module.exports = {
  validateSignedXDR,
  requireSignedXDR
};
