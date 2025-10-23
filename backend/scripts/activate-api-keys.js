// Load environment variables from .env file
require('dotenv').config();

const pool = require('../config/database');

async function activateApiKeys() {
    try {
        console.log('🔧 Activating API keys and users...');

        // Activate all API keys
        console.log('🔑 Activating all API keys...');
        await pool.query('UPDATE api_keys SET status = true');
        console.log('✅ All API keys activated');

        // Activate all data consumers
        console.log('👤 Activating all data consumers...');
        await pool.query('UPDATE data_consumers SET status = true');
        console.log('✅ All data consumers activated');

        // Activate all wallet providers
        console.log('🏦 Activating all wallet providers...');
        await pool.query('UPDATE wallet_providers SET status = true');
        console.log('✅ All wallet providers activated');

        console.log('\n🎉 All API keys and users are now active!');
        console.log('\n📝 You can now test in Swagger UI with any of these API keys:');
        
        const activeKeys = await pool.query(
            'SELECT api_key, name FROM api_keys WHERE status = true LIMIT 3'
        );
        
        activeKeys.rows.forEach((key, index) => {
            console.log(`${index + 1}. ${key.name}: ${key.api_key}`);
        });

    } catch (error) {
        console.error('❌ Error activating API keys:', error);
    } finally {
        process.exit(0);
    }
}

activateApiKeys();
