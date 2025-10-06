const fs = require('fs');
const path = require('path');

// Read existing .env file or create new one
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
}

// Add Stellar configuration if not already present
const stellarConfig = `
# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
`;

// Check if Stellar config already exists
if (!envContent.includes('STELLAR_NETWORK')) {
    envContent += stellarConfig;
    
    // Write back to .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Stellar configuration added to .env file');
} else {
    console.log('✅ Stellar configuration already exists in .env file');
}

console.log('Stellar configuration:');
console.log('- Network:', process.env.STELLAR_NETWORK || 'testnet');
console.log('- Horizon URL:', process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
console.log('- Network Passphrase:', process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015');
