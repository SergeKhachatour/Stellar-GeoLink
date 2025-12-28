/**
 * Migration script to update user_privacy_settings and user_visibility_settings tables
 * to match the API requirements
 */

const pool = require('../config/database');

async function migrateTables() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🔄 Starting migration of privacy/visibility settings tables...');
        
        // Check if user_privacy_settings exists with old schema
        const privacyCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_privacy_settings' AND column_name = 'user_id'
        `);
        
        const hasPrivacyUserId = privacyCheck.rows.length > 0;
        
        if (!hasPrivacyUserId) {
            console.log('📋 Dropping old user_privacy_settings table...');
            await client.query('DROP TABLE IF EXISTS user_privacy_settings CASCADE');
            
            console.log('✅ Creating new user_privacy_settings table...');
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
        } else {
            console.log('✅ user_privacy_settings table already has correct schema');
        }
        
        // Check if user_visibility_settings exists with old schema
        const visibilityCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_visibility_settings' AND column_name = 'user_id'
        `);
        
        const hasVisibilityUserId = visibilityCheck.rows.length > 0;
        
        if (!hasVisibilityUserId) {
            console.log('📋 Dropping old user_visibility_settings table...');
            await client.query('DROP TABLE IF EXISTS user_visibility_settings CASCADE');
            
            console.log('✅ Creating new user_visibility_settings table...');
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
        } else {
            console.log('✅ user_visibility_settings table already has correct schema');
        }
        
        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
migrateTables()
    .then(() => {
        console.log('✅ Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Migration script failed:', error);
        process.exit(1);
    });

