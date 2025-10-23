const pool = require('../config/database');

async function addDemoApiKeys() {
    try {
        console.log('🔑 Adding demo API keys for Swagger testing...');

        // Add demo data consumer
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

        // Add demo data consumer API key
        await pool.query(`
            INSERT INTO api_keys (user_id, api_key, name, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (api_key) DO NOTHING
        `, [consumerId, 'demo-data-consumer-key-12345', 'Demo Data Consumer Key', true]);

        // Add demo wallet provider
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

        // Add demo wallet provider
        await pool.query(`
            INSERT INTO wallet_providers (user_id, name, api_key, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (api_key) DO NOTHING
        `, [providerId, 'Demo Wallet Provider', 'demo-wallet-provider-key-67890', true]);

        // Add demo wallet types
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
