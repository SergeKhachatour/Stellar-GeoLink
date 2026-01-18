const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function cleanupAll() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🧹 Starting complete cleanup of all execution data...\n');
        
        // Step 1: Show current counts
        const beforeCounts = await client.query(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(*) FILTER (WHERE execution_results IS NOT NULL) as entries_with_results,
                COUNT(*) FILTER (WHERE execution_results IS NULL) as entries_without_results,
                COUNT(*) FILTER (WHERE status = 'matched') as matched_status,
                COUNT(*) FILTER (WHERE status = 'executed') as executed_status,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_status,
                COUNT(*) FILTER (WHERE status = 'processing') as processing_status
            FROM location_update_queue
        `);
        
        console.log('📊 Current State:');
        console.log(`   Total entries: ${beforeCounts.rows[0].total_entries}`);
        console.log(`   Entries with execution_results: ${beforeCounts.rows[0].entries_with_results}`);
        console.log(`   Entries without execution_results: ${beforeCounts.rows[0].entries_without_results}`);
        console.log(`   Status - Matched: ${beforeCounts.rows[0].matched_status}, Executed: ${beforeCounts.rows[0].executed_status}, Pending: ${beforeCounts.rows[0].pending_status}, Processing: ${beforeCounts.rows[0].processing_status}\n`);
        
        // Step 2: Remove all execution_results
        console.log('🗑️  Step 1: Removing all execution_results...');
        const step1 = await client.query(`
            UPDATE location_update_queue
            SET execution_results = NULL,
                status = 'matched',
                processed_at = NULL
            WHERE execution_results IS NOT NULL
        `);
        console.log(`   ✅ Removed execution_results from ${step1.rowCount} entries\n`);
        
        // Step 3: Delete all location_update_queue entries (optional - uncomment if you want to delete everything)
        console.log('🗑️  Step 2: Deleting all location_update_queue entries...');
        const step2 = await client.query(`
            DELETE FROM location_update_queue
        `);
        console.log(`   ✅ Deleted ${step2.rowCount} location_update_queue entries\n`);
        
        // Step 4: Show final counts
        const afterCounts = await client.query(`
            SELECT COUNT(*) as total_entries
            FROM location_update_queue
        `);
        
        console.log('📊 Final State:');
        console.log(`   Total entries: ${afterCounts.rows[0].total_entries}\n`);
        
        // Commit the transaction
        await client.query('COMMIT');
        console.log('✅ Cleanup completed successfully!');
        console.log('   All execution data, pending rules, completed rules, and rejected rules have been removed.');
        console.log('   The location_update_queue table is now empty and ready for fresh testing.\n');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Check for --dry-run flag
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
    console.log('This script will:');
    console.log('  1. Remove all execution_results from location_update_queue');
    console.log('  2. Delete all location_update_queue entries');
    console.log('  3. Reset all statuses to "matched"\n');
    console.log('To actually run the cleanup, remove the --dry-run flag.\n');
    process.exit(0);
}

// Run the cleanup
cleanupAll()
    .then(() => {
        console.log('✨ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
