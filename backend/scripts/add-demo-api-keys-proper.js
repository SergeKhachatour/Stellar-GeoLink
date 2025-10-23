const pool = require('../config/database');

async function addDemoApiKeys() {
    try {
        console.log('🔑 Adding demo API keys with proper relationships...');

        // First, ensure we have demo users
        console.log('👤 Creating demo users...');
        
        // Create demo data consumer user
        const consumerResult = await pool.query(`
            INSERT INTO users (email, password_hash, first_name, last_name, role, organization)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        `, [
            'demo-consumer@example.com',
            '$2b$10$demo.hash.for.testing',
            'Demo',
            'Consumer',
            'data_consumer',
            'Demo Organization'
        ]);

        let consumerId;
        if (consumerResult.rows.length > 0) {
            consumerId = consumerResult.rows[0].id;
        } else {
            const existingConsumer = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                ['demo-consumer@example.com']
            );
            consumerId = existingConsumer.rows[0].id;
        }

        // Create demo wallet provider user
        const providerResult = await pool.query(`
            INSERT INTO users (email, password_hash, first_name, last_name, role, organization)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        `, [
            'demo-provider@example.com',
            '$2b$10$demo.hash.for.testing',
            'Demo',
            'Provider',
            'wallet_provider',
            'Demo Wallet Provider'
        ]);

        let providerId;
        if (providerResult.rows.length > 0) {
            providerId = providerResult.rows[0].id;
        } else {
            const existingProvider = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                ['demo-provider@example.com']
            );
            providerId = existingProvider.rows[0].id;
        }

        // Create API keys
        console.log('🔑 Creating API keys...');
        
        // Data consumer API key
        const consumerApiKeyResult = await pool.query(`
            INSERT INTO api_keys (user_id, api_key, name, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (api_key) DO NOTHING
            RETURNING id
        `, [consumerId, 'demo-data-consumer-key-12345', 'Demo Data Consumer Key', true]);

        let consumerApiKeyId;
        if (consumerApiKeyResult.rows.length > 0) {
            consumerApiKeyId = consumerApiKeyResult.rows[0].id;
        } else {
            const existingConsumerKey = await pool.query(
                'SELECT id FROM api_keys WHERE api_key = $1',
                ['demo-data-consumer-key-12345']
            );
            consumerApiKeyId = existingConsumerKey.rows[0].id;
        }

        // Wallet provider API key
        const providerApiKeyResult = await pool.query(`
            INSERT INTO api_keys (user_id, api_key, name, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (api_key) DO NOTHING
            RETURNING id
        `, [providerId, 'demo-wallet-provider-key-67890', 'Demo Wallet Provider Key', true]);

        let providerApiKeyId;
        if (providerApiKeyResult.rows.length > 0) {
            providerApiKeyId = providerApiKeyResult.rows[0].id;
        } else {
            const existingProviderKey = await pool.query(
                'SELECT id FROM api_keys WHERE api_key = $1',
                ['demo-wallet-provider-key-67890']
            );
            providerApiKeyId = existingProviderKey.rows[0].id;
        }

        // Create data consumer record
        console.log('👤 Creating data consumer record...');
        await pool.query(`
            INSERT INTO data_consumers (user_id, status)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO NOTHING
        `, [consumerId, true]);

        // Create wallet provider record with api_key_id reference
        console.log('🏦 Creating wallet provider record...');
        await pool.query(`
            INSERT INTO wallet_providers (user_id, name, api_key_id, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) DO NOTHING
        `, [providerId, 'Demo Wallet Provider', providerApiKeyId, true]);

        // Add demo wallet types
        console.log('💳 Adding demo wallet types...');
        await pool.query(`
            INSERT INTO wallet_types (name, description)
            VALUES 
                ($1, $2),
                ($3, $4)
            ON CONFLICT (name) DO NOTHING
        `, [
            'Mobile Wallet',
            'Mobile wallet application',
            'Desktop Wallet',
            'Desktop wallet application'
        ]);

        console.log('✅ Demo API keys added successfully!');
        console.log('📝 Data Consumer Key: demo-data-consumer-key-12345');
        console.log('📝 Wallet Provider Key: demo-wallet-provider-key-67890');
        console.log('🌐 You can now test the API endpoints in Swagger UI');

    } catch (error) {
        console.error('❌ Error adding demo API keys:', error);
    } finally {
        process.exit(0);
    }
}

addDemoApiKeys();
