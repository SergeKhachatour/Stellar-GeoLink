const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

(async () => {
    try {
        const dryRun = process.argv.includes('--dry-run');
        
        if (dryRun) {
            console.log('🔍 DRY RUN MODE - No changes will be made\n');
        } else {
            console.log('⚠️  LIVE MODE - Changes will be PERMANENT\n');
        }
        
        // Count entries to delete
        const countResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM location_update_queue
            WHERE execution_results IS NULL
                OR jsonb_array_length(execution_results) = 0
        `);
        
        const countToDelete = parseInt(countResult.rows[0].count);
        console.log(`Found ${countToDelete} empty entries to delete\n`);
        
        if (countToDelete === 0) {
            console.log('✅ No empty entries to clean up!');
            await pool.end();
            return;
        }
        
        // Show sample of what will be deleted
        const sampleResult = await pool.query(`
            SELECT id, status, received_at, execution_results IS NOT NULL as has_results
            FROM location_update_queue
            WHERE execution_results IS NULL
                OR jsonb_array_length(execution_results) = 0
            ORDER BY id DESC
            LIMIT 10
        `);
        
        console.log('Sample entries that will be deleted:');
        sampleResult.rows.forEach((row, idx) => {
            console.log(`  ${idx + 1}. ID: ${row.id}, Status: ${row.status}, Has Results: ${row.has_results}, ID: ${row.id}`);
        });
        console.log('');
        
        if (!dryRun) {
            // Ask for confirmation
            console.log('⚠️  This will permanently delete these entries!');
            console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Delete empty entries
            const deleteResult = await pool.query(`
                DELETE FROM location_update_queue
                WHERE execution_results IS NULL
                    OR jsonb_array_length(execution_results) = 0
            `);
            
            console.log(`✅ Deleted ${deleteResult.rowCount} empty entries`);
        } else {
            console.log('✅ Would delete these entries (dry run)');
        }
        
        // Show remaining entries
        const remainingResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM location_update_queue
            WHERE execution_results IS NOT NULL
                AND jsonb_array_length(execution_results) > 0
        `);
        
        console.log(`\nRemaining entries with execution_results: ${remainingResult.rows[0].count}`);
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})();
