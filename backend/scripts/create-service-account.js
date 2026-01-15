/**
 * Script to create a service account keypair for submitting read-only functions to ledger
 * 
 * Usage: node scripts/create-service-account.js
 * 
 * This will generate a new Stellar keypair and display:
 * - Public Key (to fund with XLM)
 * - Secret Key (to add to .env as SERVICE_ACCOUNT_SECRET_KEY)
 */

const StellarSdk = require('@stellar/stellar-sdk');

function createServiceAccount() {
  console.log('🔑 Creating Stellar Service Account Keypair...\n');
  
  // Generate a new keypair
  const keypair = StellarSdk.Keypair.random();
  
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();
  
  console.log('✅ Service Account Created!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 PUBLIC KEY (Fund this account with XLM for transaction fees):');
  console.log(`   ${publicKey}\n`);
  console.log('🔐 SECRET KEY (Add this to your .env file as SERVICE_ACCOUNT_SECRET_KEY):');
  console.log(`   ${secretKey}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 Next Steps:');
  console.log('   1. Fund the public key with XLM (at least 1-2 XLM for fees)');
  console.log('   2. Add the secret key to your .env file:');
  console.log(`      SERVICE_ACCOUNT_SECRET_KEY=${secretKey}`);
  console.log('   3. Restart your backend server\n');
  console.log('⚠️  SECURITY WARNING:');
  console.log('   - Keep the secret key secure and never commit it to version control');
  console.log('   - This account will be used to sign transactions for read-only functions');
  console.log('   - Only fund it with enough XLM for transaction fees (1-2 XLM is usually enough)\n');
  
  return { publicKey, secretKey };
}

// Run if called directly
if (require.main === module) {
  createServiceAccount();
}

module.exports = { createServiceAccount };
