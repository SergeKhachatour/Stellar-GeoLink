const { Pool } = require('pg');

const poolConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'GeoLink',
    password: process.env.DB_PASSWORD || 'your_password',
    port: process.env.DB_PORT || 5432
};

// Only add SSL configuration if explicitly required
if (process.env.NODE_ENV === 'production') {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}

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