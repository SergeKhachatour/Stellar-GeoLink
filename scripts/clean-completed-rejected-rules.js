/**
 * Script to clean out completed and rejected rules from location_update_queue
 * This will remove all execution_results entries that are marked as completed or rejected
 * 
 * Usage: node scripts/clean-completed-rejected-rules.js [--dry-run] [--aggressive]
 * 
 * Options:
 *   --dry-run: Show what would be cleaned without making changes
 *   --aggressive: Completely remove all execution_results (not just completed/rejected)
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isAggressive = args.includes('--aggressive');

async function cleanRules() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        if (isDryRun) {
            console.log('🔍 DRY RUN MODE - No changes will be made\n');
        }

        // Get initial counts
        const initialCounts = await client.query(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(*) FILTER (WHERE execution_results IS NOT NULL) as entries_with_results,
                COUNT(*) FILTER (WHERE execution_results IS NULL) as entries_without_results,
                COUNT(*) FILTER (WHERE status = 'matched') as matched_status,
                COUNT(*) FILTER (WHERE status = 'executed') as executed_status,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_status
            FROM location_update_queue
        `);

        console.log('📊 Initial State:');
        console.log(`   Total entries: ${initialCounts.rows[0].total_entries}`);
        console.log(`   Entries with execution_results: ${initialCounts.rows[0].entries_with_results}`);
        console.log(`   Entries without execution_results: ${initialCounts.rows[0].entries_without_results}`);
        console.log(`   Status - Matched: ${initialCounts.rows[0].matched_status}, Executed: ${initialCounts.rows[0].executed_status}, Pending: ${initialCounts.rows[0].pending_status}\n`);

        // Count completed/rejected entries
        const completedRejectedCount = await client.query(`
            SELECT COUNT(*) as count
            FROM location_update_queue luq
            CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result
            WHERE (result->>'completed')::boolean = true
               OR (result->>'rejected')::boolean = true
        `);

        console.log(`📋 Found ${completedRejectedCount.rows[0].count} completed/rejected rule entries\n`);

        if (isAggressive) {
            console.log('🗑️  AGGRESSIVE MODE: Removing ALL execution_results\n');
            
            if (!isDryRun) {
                const result = await client.query(`
                    UPDATE location_update_queue
                    SET execution_results = NULL,
                        status = CASE 
                            WHEN status = 'executed' THEN 'matched'
                            ELSE status
                        END
                    WHERE execution_results IS NOT NULL
                `);
                console.log(`✅ Removed execution_results from ${result.rowCount} entries`);
            } else {
                const wouldUpdate = await client.query(`
                    SELECT COUNT(*) as count
                    FROM location_update_queue
                    WHERE execution_results IS NOT NULL
                `);
                console.log(`   Would remove execution_results from ${wouldUpdate.rows[0].count} entries`);
            }
        } else {
            console.log('🧹 NORMAL MODE: Removing only completed/rejected entries\n');
            
            if (!isDryRun) {
                // Step 1: Remove completed and rejected entries from execution_results arrays
                const step1 = await client.query(`
                    UPDATE location_update_queue
                    SET execution_results = (
                        SELECT jsonb_agg(result.value)
                        FROM jsonb_array_elements(execution_results) AS result(value)
                        WHERE (result.value->>'completed')::boolean IS DISTINCT FROM true
                          AND (result.value->>'rejected')::boolean IS DISTINCT FROM true
                          AND (result.value->>'skipped')::boolean IS DISTINCT FROM true
                    )
                    WHERE execution_results IS NOT NULL
                      AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(execution_results) AS result
                          WHERE (result->>'completed')::boolean = true
                             OR (result->>'rejected')::boolean = true
                      )
                `);
                console.log(`✅ Step 1: Removed completed/rejected entries from ${step1.rowCount} location_update_queue entries`);

                // Step 2: If execution_results becomes empty array, set it to NULL
                const step2 = await client.query(`
                    UPDATE location_update_queue
                    SET execution_results = NULL
                    WHERE execution_results = '[]'::jsonb
                `);
                console.log(`✅ Step 2: Set ${step2.rowCount} empty arrays to NULL`);

                // Step 3: Reset status for entries that had completed/rejected rules
                const step3 = await client.query(`
                    UPDATE location_update_queue
                    SET status = 'matched'
                    WHERE status = 'executed'
                      AND execution_results IS NOT NULL
                      AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(execution_results) AS result
                          WHERE (result->>'skipped')::boolean = true
                            AND (result->>'completed')::boolean IS DISTINCT FROM true
                            AND (result->>'rejected')::boolean IS DISTINCT FROM true
                      )
                `);
                console.log(`✅ Step 3: Reset status to 'matched' for ${step3.rowCount} entries`);

                // Step 4: Reset status for entries with no execution_results
                const step4 = await client.query(`
                    UPDATE location_update_queue
                    SET status = 'matched'
                    WHERE execution_results IS NULL
                      AND status IN ('matched', 'executed')
                `);
                console.log(`✅ Step 4: Reset status for ${step4.rowCount} entries with no execution_results\n`);
            } else {
                console.log('   Would execute all cleanup steps (dry run)');
            }
        }

        // Get final counts
        const finalCounts = await client.query(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(*) FILTER (WHERE execution_results IS NOT NULL) as entries_with_results,
                COUNT(*) FILTER (WHERE execution_results IS NULL) as entries_without_results,
                COUNT(*) FILTER (WHERE status = 'matched') as matched_status,
                COUNT(*) FILTER (WHERE status = 'executed') as executed_status,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_status
            FROM location_update_queue
        `);

        console.log('📊 Final State:');
        console.log(`   Total entries: ${finalCounts.rows[0].total_entries}`);
        console.log(`   Entries with execution_results: ${finalCounts.rows[0].entries_with_results}`);
        console.log(`   Entries without execution_results: ${finalCounts.rows[0].entries_without_results}`);
        console.log(`   Status - Matched: ${finalCounts.rows[0].matched_status}, Executed: ${finalCounts.rows[0].executed_status}, Pending: ${finalCounts.rows[0].pending_status}\n`);

        if (isDryRun) {
            await client.query('ROLLBACK');
            console.log('🔍 Dry run completed - no changes were made');
        } else {
            await client.query('COMMIT');
            console.log('✅ Cleanup completed successfully!');
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the cleanup
cleanRules()
    .then(() => {
        console.log('\n✨ Script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
