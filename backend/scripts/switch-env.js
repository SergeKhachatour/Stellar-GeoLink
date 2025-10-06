#!/usr/bin/env node

/**
 * Environment Switcher Script
 * Usage: node scripts/switch-env.js [development|production]
 */

const fs = require('fs');
const path = require('path');

const targetEnv = process.argv[2] || 'development';

if (!['development', 'production'].includes(targetEnv)) {
    console.error('❌ Invalid environment. Use: development or production');
    process.exit(1);
}

const envFile = path.join(__dirname, '..', '..', `env.${targetEnv}`);
const targetFile = path.join(__dirname, '..', '..', '.env');

console.log(`🔄 Switching to ${targetEnv} environment...`);

if (fs.existsSync(envFile)) {
    // Copy environment file to .env
    fs.copyFileSync(envFile, targetFile);
    console.log(`✅ Environment switched to ${targetEnv}`);
    console.log(`📁 Copied ${envFile} to .env`);
    
    // Display current configuration
    const envContent = fs.readFileSync(targetFile, 'utf8');
    const lines = envContent.split('\n').filter(line => 
        line.trim() && !line.startsWith('#') && line.includes('=')
    );
    
    console.log(`\n📋 Current configuration:`);
    lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            // Hide sensitive information
            if (key.includes('PASSWORD') || key.includes('SECRET') || key.includes('KEY')) {
                console.log(`   ${key}=***`);
            } else {
                console.log(`   ${key}=${value}`);
            }
        }
    });
    
    console.log(`\n🚀 To start the application:`);
    console.log(`   NODE_ENV=${targetEnv} npm start`);
    
} else {
    console.error(`❌ Environment file not found: ${envFile}`);
    console.log(`📝 Available environment files:`);
    
    const files = fs.readdirSync(path.join(__dirname, '..', '..'))
        .filter(file => file.startsWith('env.') && file !== '.env');
    
    files.forEach(file => {
        console.log(`   - ${file}`);
    });
    
    process.exit(1);
}
