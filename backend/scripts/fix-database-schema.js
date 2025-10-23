const pool = require('../config/database');

async function fixDatabaseSchema() {
    try {
        console.log('🔧 Fixing database schema...');

        // Add api_key column to wallet_providers table
        console.log('📝 Adding api_key column to wallet_providers table...');
        await pool.query(`
            ALTER TABLE wallet_providers 
            ADD COLUMN IF NOT EXISTS api_key VARCHAR(255) UNIQUE
        `);

        // Add index for better performance
        console.log('📊 Creating index for api_key...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_wallet_providers_api_key 
            ON wallet_providers(api_key)
        `);

        // Ensure api_keys table exists
        console.log('📝 Ensuring api_keys table exists...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                api_key VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                status BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for api_keys table
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key)
        `);

        // Add demo API keys
        console.log('🔑 Adding demo API keys...');
        
        // Add demo data consumer API key
        await pool.query(`
            INSERT INTO api_keys (user_id, api_key, name, status)
            SELECT 
                u.id,
                'demo-data-consumer-key-12345',
                'Demo Data Consumer Key',
                true
            FROM users u 
            WHERE u.role = 'data_consumer' 
            AND NOT EXISTS (
                SELECT 1 FROM api_keys ak 
                WHERE ak.api_key = 'demo-data-consumer-key-12345'
            )
            LIMIT 1
        `);

        // Add demo wallet provider
        await pool.query(`
            INSERT INTO wallet_providers (user_id, name, api_key, status)
            SELECT 
                u.id,
                'Demo Wallet Provider',
                'demo-wallet-provider-key-67890',
                true
            FROM users u 
            WHERE u.role = 'wallet_provider' 
            AND NOT EXISTS (
                SELECT 1 FROM wallet_providers wp 
                WHERE wp.api_key = 'demo-wallet-provider-key-67890'
            )
            LIMIT 1
        `);

        console.log('✅ Database schema fixed successfully!');
        console.log('🔑 Demo API keys added:');
        console.log('   - Data Consumer: demo-data-consumer-key-12345');
        console.log('   - Wallet Provider: demo-wallet-provider-key-67890');

    } catch (error) {
        console.error('❌ Error fixing database schema:', error);
    } finally {
        process.exit(0);
    }
}

fixDatabaseSchema();
