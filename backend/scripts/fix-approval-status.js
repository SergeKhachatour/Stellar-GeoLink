// Load environment variables
require('dotenv').config();
const pool = require('../config/database');

// Script to fix the approval status mismatch
async function fixApprovalStatus() {
    const client = await pool.connect();
    
    try {
        console.log('🔧 Fixing approval status mismatch...\n');
        await client.query('BEGIN');

        // Find users with approved requests but inactive keys
        const mismatches = await client.query(`
            SELECT DISTINCT
                u.id as user_id,
                u.email,
                u.role,
                r.organization_name,
                ak.id as key_id,
                ak.status as key_status,
                ak.created_at
            FROM users u
            JOIN api_key_requests r ON r.user_id = u.id AND r.status = 'approved'
            JOIN api_keys ak ON ak.user_id = u.id
            WHERE ak.status = false
            ORDER BY u.id, ak.created_at DESC
        `);

        console.log(`Found ${mismatches.rows.length} mismatched API keys to fix:`);
        
        let fixed = 0;
        for (const mismatch of mismatches.rows) {
            console.log(`Fixing User: ${mismatch.email}, Key ID: ${mismatch.key_id}, Role: ${mismatch.role}`);
            
            // Update the API key status to active
            await client.query(
                `UPDATE api_keys SET status = true
                 WHERE id = $1`,
                [mismatch.key_id]
            );
            
            // Note: Provider/consumer records are managed separately
            // The main fix is updating the API key status to active
            
            fixed++;
        }

        await client.query('COMMIT');
        console.log(`\n✅ Successfully fixed ${fixed} API keys!`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Fix failed:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

// Run the fix
fixApprovalStatus().catch(console.error);
