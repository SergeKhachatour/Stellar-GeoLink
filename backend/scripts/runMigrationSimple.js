#!/usr/bin/env node

/**
 * Simple NFT Migration Script
 * Runs the NFT database migration with proper environment loading
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runNFTMigration() {
    console.log('🚀 Starting NFT database migration...');
    console.log(`Database: ${process.env.DB_NAME || 'GeoLink'}`);
    console.log(`Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`User: ${process.env.DB_USER || 'postgres'}`);
    console.log('');

    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'GeoLink',
        password: process.env.DB_PASSWORD || 'your_password',
        port: process.env.DB_PORT || 5432
    });

    try {
        // Test connection first
        console.log('🔍 Testing database connection...');
        const testResult = await pool.query('SELECT NOW() as current_time');
        console.log(`✅ Connected to database at ${testResult.rows[0].current_time}`);

        // Read and execute the migration
        console.log('📄 Reading migration file...');
        const migrationPath = path.join(__dirname, '../database/migrations/001_add_nft_tables.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('🔄 Executing NFT migration...');
        await pool.query(migrationSQL);
        
        console.log('✅ NFT migration completed successfully!');
        console.log('');
        console.log('📋 Migration Summary:');
        console.log('- Added NFT_manager role to user_role enum');
        console.log('- Created nft_collections table');
        console.log('- Created pinned_nfts table');
        console.log('- Created user_nft_ownership table');
        console.log('- Created nft_transfers table');
        console.log('- Created location_verifications table');
        console.log('- Added performance indexes');
        console.log('- Inserted default NFT collections');
        console.log('');
        console.log('🎉 Your Stellar-GeoLink system is now ready for location-based NFTs!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('');
        console.error('💡 Troubleshooting tips:');
        console.error('   1. Check your .env file has correct database credentials');
        console.error('   2. Ensure PostgreSQL is running');
        console.error('   3. Verify the database exists');
        console.error('   4. Check if PostGIS extension is installed');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    runNFTMigration().catch(console.error);
}

module.exports = { runNFTMigration };
