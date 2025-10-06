const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

async function runMigration(migrationFile) {
    try {
        console.log(`Running migration: ${migrationFile}`);
        
        // Read the migration file
        const migrationPath = path.join(__dirname, migrationFile);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute the migration
        await pool.query(migrationSQL);
        
        console.log(`✅ Migration ${migrationFile} completed successfully`);
    } catch (error) {
        console.error(`❌ Migration ${migrationFile} failed:`, error.message);
        throw error;
    }
}

async function runAllMigrations() {
    try {
        console.log('Starting database migrations...');
        
        // Get all migration files in order
        const migrationFiles = fs.readdirSync(__dirname)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        for (const file of migrationFiles) {
            await runMigration(file);
        }
        
        console.log('✅ All migrations completed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migrations if this script is executed directly
if (require.main === module) {
    runAllMigrations();
}

module.exports = { runMigration, runAllMigrations };
