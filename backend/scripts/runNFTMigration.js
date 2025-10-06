#!/usr/bin/env node

/**
 * Script to run the NFT database migration
 * Usage: node scripts/runNFTMigration.js
 */

const { runAllMigrations } = require('../database/migrations/runMigration');

async function main() {
    try {
        console.log('🚀 Starting NFT database migration...');
        await runAllMigrations();
        console.log('✅ NFT database migration completed successfully!');
        console.log('\n📋 Migration Summary:');
        console.log('- Added NFT_manager role to user_role enum');
        console.log('- Created nft_collections table');
        console.log('- Created pinned_nfts table');
        console.log('- Created user_nft_ownership table');
        console.log('- Created nft_transfers table');
        console.log('- Created location_verifications table');
        console.log('- Added performance indexes');
        console.log('- Inserted default NFT collections');
        console.log('\n🎉 Your Stellar-GeoLink system is now ready for location-based NFTs!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
