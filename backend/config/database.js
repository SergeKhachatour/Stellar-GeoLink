const { Pool } = require('pg');

// Database configuration using environment variables
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'GeoLink',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

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