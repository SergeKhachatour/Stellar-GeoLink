#!/bin/bash

# Azure Web App Deployment Script for Stellar-GeoLink
# This script prepares and deploys the application to Azure

echo "🚀 Preparing Stellar-GeoLink for Azure deployment..."

# Create production environment file
echo "📝 Creating production environment configuration..."
cat > .env.production << EOF
# Production Environment Configuration
NODE_ENV=production
PORT=8080

# Azure PostgreSQL Database Configuration
DB_HOST=your-azure-postgres-host.postgres.database.azure.com
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user@your-azure-postgres-host
DB_PASSWORD=StellarGeoLink2024!
DB_SSL=true

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-for-production

# Mapbox Configuration
MAPBOX_TOKEN=your-mapbox-token

# Redis Configuration (if using Azure Redis Cache)
REDIS_HOST=your-redis-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your-redis-password
REDIS_SSL=true

# Email Configuration (if using SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@stellargeolink.com

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=your-stellar-secret-key
EOF

# Create Azure Web App configuration
echo "⚙️ Creating Azure Web App configuration..."
cat > web.config << EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="app.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^app.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}"/>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <action type="Rewrite" url="app.js"/>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="bin"/>
        </hiddenSegments>
      </requestFiltering>
    </security>
    <iisnode watchedFiles="web.config;*.js"/>
  </system.webServer>
</configuration>
EOF

# Create package.json for Azure deployment
echo "📦 Creating deployment package.json..."
cat > package.deploy.json << EOF
{
  "name": "stellar-geolink",
  "version": "1.0.0",
  "description": "Stellar-GeoLink NFT System",
  "main": "backend/app.js",
  "scripts": {
    "start": "cd backend && node app.js",
    "build": "cd frontend && npm run build",
    "postinstall": "cd frontend && npm install && npm run build"
  },
  "dependencies": {
    "express": "^4.21.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "pg": "^8.14.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^7.5.0",
    "ioredis": "^5.6.0",
    "nodemailer": "^6.9.3",
    "axios": "^1.8.3",
    "swagger-jsdoc": "^6.2.8",
    "swagger-ui-express": "^4.6.3"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  }
}
EOF

# Create startup script for Azure
echo "🚀 Creating Azure startup script..."
cat > startup.sh << EOF
#!/bin/bash

# Azure Web App startup script
echo "Starting Stellar-GeoLink application..."

# Install dependencies
cd backend
npm install --production

# Run database migrations
node scripts/runNFTMigration.js

# Start the application
node app.js
EOF

chmod +x startup.sh

# Create GitHub Actions workflow
echo "🔄 Creating GitHub Actions workflow..."
mkdir -p .github/workflows
cat > .github/workflows/azure-deploy.yml << EOF
name: Deploy to Azure Web App

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: 'backend/package-lock.json'
    
    - name: Install backend dependencies
      run: |
        cd backend
        npm ci
    
    - name: Install frontend dependencies
      run: |
        cd frontend
        npm ci
    
    - name: Build frontend
      run: |
        cd frontend
        npm run build
    
    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'your-azure-web-app-name'
        publish-profile: \${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: '.'
EOF

echo "✅ Azure deployment configuration created!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env.production file with your actual Azure credentials"
echo "2. Update the GitHub Actions workflow with your Azure Web App name"
echo "3. Add AZURE_WEBAPP_PUBLISH_PROFILE to your GitHub repository secrets"
echo "4. Commit and push your changes to trigger deployment"
echo ""
echo "🔧 Manual deployment steps:"
echo "1. Install Azure CLI: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
echo "2. Login to Azure: az login"
echo "3. Deploy: az webapp deployment source config-zip --resource-group your-rg --name your-webapp --src deployment.zip"
