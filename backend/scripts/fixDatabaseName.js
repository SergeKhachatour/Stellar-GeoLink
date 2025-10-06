const fs = require('fs');
const path = require('path');

// Read current .env file
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

try {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('📖 Current .env content:');
    console.log(envContent);
    
    // Update database name from geolink to GeoLink
    const updatedContent = envContent.replace('DB_NAME=geolink', 'DB_NAME=GeoLink');
    
    if (updatedContent !== envContent) {
        fs.writeFileSync(envPath, updatedContent);
        console.log('✅ Updated database name to GeoLink');
    } else {
        console.log('ℹ️  Database name already correct');
    }
    
    console.log('📖 Updated .env content:');
    console.log(updatedContent);
    
} catch (error) {
    console.error('❌ Error reading/updating .env file:', error.message);
}
