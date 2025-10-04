const bcrypt = require('bcrypt');

/**
 * Script to generate a bcrypt hash for a password
 * Usage: node scripts/generatePasswordHash.js [password]
 */

const password = process.argv[2] || (() => {
    console.error('❌ Error: No password provided');
    console.log('Usage: node scripts/generatePasswordHash.js <password>');
    process.exit(1);
})();

async function generateHash() {
    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        
        console.log('🔐 Password Hash Generator');
        console.log('========================');
        console.log('Password:', password);
        console.log('Hash:', hash);
        console.log('');
        console.log('You can use this hash in your SQL script or database directly.');
        
    } catch (error) {
        console.error('❌ Error generating hash:', error.message);
    }
}

generateHash();
