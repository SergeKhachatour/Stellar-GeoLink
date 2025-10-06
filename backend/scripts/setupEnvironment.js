const fs = require('fs');
const path = require('path');

// Create .env file with proper database configuration
const envContent = `# Database Configuration
DB_USER=postgres
DB_HOST=localhost
DB_NAME=geolink
DB_PASSWORD=your_actual_password_here
DB_PORT=5432

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Mapbox Configuration
BACKEND_MAPBOX_TOKEN=pk.eyJ1Ijoic2VyZ2UzNjl4MzMiLCJhIjoiY20zZHkzb2xoMDA0eTJxcHU4MTNoYjNlaCJ9.Xl6OxzF9td1IgTTeUp526w

# Server Configuration
PORT=4000
NODE_ENV=development`;

const envPath = path.join(__dirname, '..', '.env');

try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully!');
    console.log('📝 Please update the database password in .env file');
    console.log('🔧 Then run: npm start');
} catch (error) {
    console.error('❌ Error creating .env file:', error.message);
    console.log('📝 Please create .env file manually with the following content:');
    console.log(envContent);
}
