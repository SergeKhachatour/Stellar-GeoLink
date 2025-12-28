/**
 * Migration script to update Azure database privacy/visibility settings tables
 * to match the local database schema
 * 
 * Usage: 
 *   Option 1: Set environment variables for Azure:
 *   - DB_HOST=<azure-host>
 *   - DB_NAME=GeoLink
 *   - DB_USER=<azure-user>
 *   - DB_PASSWORD=<azure-password>
 *   - DB_SSL=true
 *   
 *   Option 2: Pass Azure credentials as command line arguments:
 *   node scripts/migrate-azure-privacy-visibility.js <host> <user> <password>
 *   
 *   Then run: node scripts/migrate-azure-privacy-visibility.js
 */

require('dotenv').config();
const { Pool } = require('pg');

// Azure database credentials (set these or pass as environment variables)
const azureHost = process.env.AZURE_DB_HOST || process.argv[2] || '20.253.209.97';
const azureUser = process.env.AZURE_DB_USER || process.argv[3] || 'geolink_user';
const azurePassword = process.env.AZURE_DB_PASSWORD || process.argv[4];
const azureDatabase = process.env.AZURE_DB_NAME || 'GeoLink';

// Check if we should use Azure (if password is provided or host is Azure)
const useAzure = azurePassword || azureHost.includes('20.253') || azureHost.includes('azure');

// Create pool with Azure credentials if available
let pool;
if (useAzure && azurePassword) {
    console.log('🔑 Using Azure database credentials');
    console.log(`📍 Connecting to: ${azureHost}`);
    pool = new Pool({
        host: azureHost,
        port: 5432,
        database: azureDatabase,
        user: azureUser,
        password: azurePassword,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    });
} else if (azureHost.includes('20.253') || azureHost.includes('azure')) {
    console.log('❌ Azure password required to connect to Azure database.');
    console.log('💡 To run on Azure, set: AZURE_DB_PASSWORD=<password>');
    console.log('   Or pass as: node scripts/migrate-azure-privacy-visibility.js <host> <user> <password>');
    console.log('\n⚠️  Cannot proceed without Azure password. Exiting...');
    process.exit(1);
} else {
    // Use default config (from environment variables) for local
    console.log('📍 Using local database configuration');
    pool = require('../config/database');
}

async function migrateAzureTables() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🔄 Starting Azure database migration of privacy/visibility settings tables...');
        const connectedHost = azureHost || process.env.DB_HOST || pool.options?.host || 'localhost';
        console.log(`📍 Connected to: ${connectedHost}\n`);
        
        // Check current schema of user_privacy_settings
        const privacyColumns = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'user_privacy_settings' 
            ORDER BY ordinal_position
        `);
        
        console.log('📋 Current user_privacy_settings columns:', privacyColumns.rows.map(r => r.column_name).join(', '));
        
        const hasUserId = privacyColumns.rows.some(r => r.column_name === 'user_id');
        const hasPrivacyLevel = privacyColumns.rows.some(r => r.column_name === 'privacy_level');
        const hasLocationSharing = privacyColumns.rows.some(r => r.column_name === 'location_sharing');
        const hasDataRetentionDays = privacyColumns.rows.some(r => r.column_name === 'data_retention_days');
        const hasCreatedAt = privacyColumns.rows.some(r => r.column_name === 'created_at');
        
        if (!hasUserId || !hasPrivacyLevel || !hasLocationSharing || !hasDataRetentionDays || !hasCreatedAt) {
            console.log('📋 Dropping old user_privacy_settings table...');
            await client.query('DROP TABLE IF EXISTS user_privacy_settings CASCADE');
            
            console.log('✅ Creating new user_privacy_settings table with correct schema...');
            await client.query(`
                CREATE TABLE user_privacy_settings (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    public_key VARCHAR(56) NOT NULL,
                    privacy_level VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (privacy_level IN ('public', 'private', 'restricted')),
                    location_sharing BOOLEAN DEFAULT true,
                    data_retention_days INTEGER DEFAULT 30,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, public_key)
                )
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_public_key ON user_privacy_settings(public_key)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_user_id ON user_privacy_settings(user_id)
            `);
            
            console.log('✅ user_privacy_settings table created successfully');
        } else {
            console.log('✅ user_privacy_settings table already has correct schema');
        }
        
        // Check current schema of user_visibility_settings
        const visibilityColumns = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'user_visibility_settings' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Current user_visibility_settings columns:', visibilityColumns.rows.map(r => r.column_name).join(', '));
        
        const hasVisibilityUserId = visibilityColumns.rows.some(r => r.column_name === 'user_id');
        const hasVisibilityLevel = visibilityColumns.rows.some(r => r.column_name === 'visibility_level');
        const hasShowLocation = visibilityColumns.rows.some(r => r.column_name === 'show_location');
        const hasShowActivity = visibilityColumns.rows.some(r => r.column_name === 'show_activity');
        const hasVisibilityCreatedAt = visibilityColumns.rows.some(r => r.column_name === 'created_at');
        
        if (!hasVisibilityUserId || !hasVisibilityLevel || !hasShowLocation || !hasShowActivity || !hasVisibilityCreatedAt) {
            console.log('📋 Dropping old user_visibility_settings table...');
            await client.query('DROP TABLE IF EXISTS user_visibility_settings CASCADE');
            
            console.log('✅ Creating new user_visibility_settings table with correct schema...');
            await client.query(`
                CREATE TABLE user_visibility_settings (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    public_key VARCHAR(56) NOT NULL,
                    visibility_level VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility_level IN ('public', 'private', 'friends_only')),
                    show_location BOOLEAN DEFAULT true,
                    show_activity BOOLEAN DEFAULT false,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, public_key)
                )
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_user_visibility_settings_public_key ON user_visibility_settings(public_key)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_user_visibility_settings_user_id ON user_visibility_settings(user_id)
            `);
            
            console.log('✅ user_visibility_settings table created successfully');
        } else {
            console.log('✅ user_visibility_settings table already has correct schema');
        }
        
        await client.query('COMMIT');
        console.log('\n✅ Migration completed successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        pool.end();
    }
}

// Run migration
migrateAzureTables()
    .then(() => {
        console.log('✅ Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Migration script failed:', error);
        process.exit(1);
    });

