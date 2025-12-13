const { Pool } = require('pg');

// Database configuration using environment variables
// For Azure PostgreSQL, SSL is typically required and connection timeout should be longer
const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'GeoLink',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  // Azure PostgreSQL requires SSL, enable it if DB_SSL is true or if running on Azure
  ssl: (process.env.DB_SSL === 'true' || isAzure) ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  // Increase connection timeout for Azure (30 seconds)
  connectionTimeoutMillis: isAzure ? 30000 : 2000,
  // Additional Azure-friendly settings
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Add error handling for the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Log connection configuration (without password)
console.log('🔌 Database Configuration:', {
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  ssl: poolConfig.ssl ? 'enabled' : 'disabled',
  connectionTimeout: poolConfig.connectionTimeoutMillis + 'ms',
  isAzure: !!isAzure
});

// Test the connection
pool.connect()
    .then(client => {
        console.log('✅ Successfully connected to GeoLink database');
        client.release();
    })
    .catch(err => {
        console.error('❌ Error connecting to database:', err.message);
        console.error('   Connection details:', {
          host: poolConfig.host,
          port: poolConfig.port,
          database: poolConfig.database,
          user: poolConfig.user,
          ssl: poolConfig.ssl ? 'enabled' : 'disabled'
        });
    });

module.exports = pool; 