const path = require('path');
const fs = require('fs');

/**
 * Environment Configuration Loader
 * Automatically loads the correct .env file based on NODE_ENV
 */
function loadEnvironmentConfig() {
    const env = process.env.NODE_ENV || 'development';
    const envFile = path.join(__dirname, '..', '..', `env.${env}`);
    
    console.log(`🔧 Loading environment configuration for: ${env}`);
    console.log(`📁 Environment file: ${envFile}`);
    
    // Check if environment file exists
    if (fs.existsSync(envFile)) {
        console.log(`✅ Found environment file: env.${env}`);
        
        // Read and parse the environment file
        const envContent = fs.readFileSync(envFile, 'utf8');
        const envVars = {};
        
        envContent.split('\n').forEach(line => {
            line = line.trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                return;
            }
            
            // Parse KEY=VALUE format
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim();
                envVars[key] = value;
                
                // Set environment variable if not already set
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        
        console.log(`📋 Loaded ${Object.keys(envVars).length} environment variables`);
        return envVars;
    } else {
        console.log(`⚠️  Environment file not found: env.${env}`);
        console.log(`📝 Using default environment variables`);
        return {};
    }
}

/**
 * Get database configuration based on environment
 */
function getDatabaseConfig() {
    const env = process.env.NODE_ENV || 'development';
    
    const config = {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'GeoLink',
        password: process.env.DB_PASSWORD || 'your_password',
        port: parseInt(process.env.DB_PORT) || 5432
    };
    
    // SSL configuration
    if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
        config.ssl = {
            rejectUnauthorized: false
        };
    }
    
    console.log(`🗄️  Database configuration for ${env}:`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);
    console.log(`   SSL: ${config.ssl ? 'enabled' : 'disabled'}`);
    
    return config;
}

module.exports = {
    loadEnvironmentConfig,
    getDatabaseConfig
};
