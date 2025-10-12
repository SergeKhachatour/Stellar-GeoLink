// Load environment variables
require('dotenv').config();
const pool = require('../config/database');

// Script to analyze the data in the tables
async function analyzeData() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Analyzing database tables...\n');
        
        // Query api_key_requests
        console.log('📋 API KEY REQUESTS:');
        console.log('==================');
        const requests = await client.query(`
            SELECT * FROM public.api_key_requests 
            ORDER BY id ASC
        `);
        
        if (requests.rows.length === 0) {
            console.log('No api_key_requests found');
        } else {
            requests.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, User: ${row.user_id}, Type: ${row.request_type}, Org: ${row.organization_name}, Status: ${row.status}`);
            });
        }
        
        console.log('\n');
        
        // Query api_keys
        console.log('🔑 API KEYS:');
        console.log('============');
        const keys = await client.query(`
            SELECT * FROM public.api_keys 
            ORDER BY id ASC
        `);
        
        if (keys.rows.length === 0) {
            console.log('No api_keys found');
        } else {
            keys.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, User: ${row.user_id}, Key: ${row.api_key.substring(0, 16)}..., Name: ${row.name}, Status: ${row.status}, Created: ${row.created_at}`);
            });
        }
        
        console.log('\n');
        
        // Query users
        console.log('👥 USERS:');
        console.log('==========');
        const users = await client.query(`
            SELECT * FROM public.users 
            ORDER BY id ASC
        `);
        
        if (users.rows.length === 0) {
            console.log('No users found');
        } else {
            users.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, Email: ${row.email}, Role: ${row.role}, Org: ${row.organization}`);
            });
        }
        
        console.log('\n');
        
        // Check for duplicates in api_keys
        console.log('🔍 CHECKING FOR DUPLICATES:');
        console.log('===========================');
        const duplicates = await client.query(`
            SELECT api_key, COUNT(*) as count, 
                   ARRAY_AGG(id ORDER BY created_at DESC) as ids,
                   ARRAY_AGG(user_id ORDER BY created_at DESC) as user_ids
            FROM api_keys 
            GROUP BY api_key 
            HAVING COUNT(*) > 1
        `);
        
        if (duplicates.rows.length === 0) {
            console.log('✅ No duplicate API keys found');
        } else {
            console.log(`❌ Found ${duplicates.rows.length} groups of duplicate API keys:`);
            duplicates.rows.forEach((dup, index) => {
                console.log(`${index + 1}. Key: ${dup.api_key.substring(0, 16)}..., Count: ${dup.count}, IDs: [${dup.ids.join(', ')}], Users: [${dup.user_ids.join(', ')}]`);
            });
        }
        
        console.log('\n');
        
        // Check wallet_providers
        console.log('🏦 WALLET PROVIDERS:');
        console.log('====================');
        const providers = await client.query(`
            SELECT * FROM public.wallet_providers 
            ORDER BY id ASC
        `);
        
        if (providers.rows.length === 0) {
            console.log('No wallet_providers found');
        } else {
            providers.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, User: ${row.user_id}, Name: ${row.name}, API Key ID: ${row.api_key_id}, Status: ${row.status}`);
            });
        }
        
        console.log('\n');
        
        // Check data_consumers
        console.log('📊 DATA CONSUMERS:');
        console.log('==================');
        const consumers = await client.query(`
            SELECT * FROM public.data_consumers 
            ORDER BY id ASC
        `);
        
        if (consumers.rows.length === 0) {
            console.log('No data_consumers found');
        } else {
            consumers.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}, User: ${row.user_id}, Org: ${row.organization_name}, Status: ${row.status}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

// Run the analysis
analyzeData().catch(console.error);
