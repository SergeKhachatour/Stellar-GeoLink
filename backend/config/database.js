const { Pool } = require('pg');
const { loadEnvironmentConfig, getDatabaseConfig } = require('./envLoader');

// Load environment configuration
loadEnvironmentConfig();

// Get database configuration based on environment
const poolConfig = getDatabaseConfig();

const pool = new Pool(poolConfig);

// Add error handling for the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Test the connection
pool.connect()
    .then(client => {
        console.log('Successfully connected to GeoLink database');
        client.release();
    })
    .catch(err => {
        console.error('Error connecting to database:', err);
    });

module.exports = pool; 