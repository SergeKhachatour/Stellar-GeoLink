// Load environment variables
require('dotenv').config();
const pool = require('../config/database');

// Script to clean up duplicate API keys directly from database
async function cleanupDuplicates() {
    const client = await pool.connect();
    
    try {
        console.log('🧹 Starting cleanup of duplicate API keys...');
        await client.query('BEGIN');

        // Find and remove duplicate API keys (keep the most recent one)
        const duplicateKeys = await client.query(`
            SELECT api_key, COUNT(*) as count, 
                   ARRAY_AGG(id ORDER BY created_at DESC) as ids
            FROM api_keys 
            GROUP BY api_key 
            HAVING COUNT(*) > 1
        `);

        console.log(`Found ${duplicateKeys.rows.length} groups of duplicate API keys`);

        let cleanedCount = 0;
        for (const duplicate of duplicateKeys.rows) {
            const ids = duplicate.ids;
            const keepId = ids[0]; // Keep the most recent (first in DESC order)
            const deleteIds = ids.slice(1); // Delete the rest

            console.log(`Processing duplicate API key: ${duplicate.api_key.substring(0, 16)}... (${duplicate.count} copies)`);

            for (const deleteId of deleteIds) {
                // Delete related records first
                await client.query('DELETE FROM wallet_providers WHERE api_key_id = $1', [deleteId]);
                
                // Delete the API key
                await client.query('DELETE FROM api_keys WHERE id = $1', [deleteId]);
                cleanedCount++;
            }
        }

        await client.query('COMMIT');
        console.log('✅ Cleanup completed successfully!');
        console.log(`📊 Results:`);
        console.log(`   - Duplicate groups found: ${duplicateKeys.rows.length}`);
        console.log(`   - API keys removed: ${cleanedCount}`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Cleanup failed:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

// Run the cleanup
cleanupDuplicates().catch(console.error);
