require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/database');

/**
 * Script to add a new admin user to the database
 * Usage: node scripts/addAdminUser.js
 */

async function addAdminUser() {
    const client = await pool.connect();
    
    try {
        // Get user input (in a real scenario, you might want to use readline or command line args)
        const email = 'admin@stellar-geolink.com';
        const password = process.env.ADMIN_PASSWORD || 'CHANGE_ME_IMMEDIATELY'; // Use environment variable or prompt for password
        const firstName = 'System';
        const lastName = 'Administrator';
        const organization = 'Stellar GeoLink';
        
        // Check if user already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            console.log('❌ User with email', email, 'already exists');
            return;
        }
        
        // Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Insert the new admin user
        const result = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, organization, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, email, first_name, last_name, role, organization, created_at`,
            [email, passwordHash, firstName, lastName, 'admin', organization, true]
        );
        
        const newUser = result.rows[0];
        
        console.log('✅ Admin user created successfully!');
        console.log('📧 Email:', newUser.email);
        console.log('👤 Name:', newUser.first_name, newUser.last_name);
        console.log('🏢 Organization:', newUser.organization);
        console.log('🔑 Role:', newUser.role);
        console.log('🆔 User ID:', newUser.id);
        console.log('📅 Created:', newUser.created_at);
        console.log('');
        console.log('🔐 Default credentials:');
        console.log('   Email:', email);
        console.log('   Password:', password);
        console.log('');
        console.log('⚠️  IMPORTANT: Change the default password after first login!');
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        client.release();
    }
}

// Interactive version for custom admin user
async function addCustomAdminUser() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const client = await pool.connect();
    
    try {
        console.log('🔧 Creating a new admin user...\n');
        
        // Get user input
        const email = await new Promise((resolve) => {
            rl.question('📧 Enter email address: ', resolve);
        });
        
        const password = await new Promise((resolve) => {
            rl.question('🔐 Enter password: ', resolve);
        });
        
        const firstName = await new Promise((resolve) => {
            rl.question('👤 Enter first name: ', resolve);
        });
        
        const lastName = await new Promise((resolve) => {
            rl.question('👤 Enter last name: ', resolve);
        });
        
        const organization = await new Promise((resolve) => {
            rl.question('🏢 Enter organization: ', resolve);
        });
        
        // Check if user already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            console.log('❌ User with email', email, 'already exists');
            rl.close();
            return;
        }
        
        // Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Insert the new admin user
        const result = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, organization, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, email, first_name, last_name, role, organization, created_at`,
            [email, passwordHash, firstName, lastName, 'admin', organization, true]
        );
        
        const newUser = result.rows[0];
        
        console.log('\n✅ Admin user created successfully!');
        console.log('📧 Email:', newUser.email);
        console.log('👤 Name:', newUser.first_name, newUser.last_name);
        console.log('🏢 Organization:', newUser.organization);
        console.log('🔑 Role:', newUser.role);
        console.log('🆔 User ID:', newUser.id);
        console.log('📅 Created:', newUser.created_at);
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
    } finally {
        client.release();
        rl.close();
    }
}

// Check command line arguments
if (process.argv.includes('--interactive') || process.argv.includes('-i')) {
    addCustomAdminUser();
} else {
    addAdminUser();
}

// Close the database connection when done
process.on('exit', () => {
    pool.end();
});
