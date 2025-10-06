# Azure Deployment Guide for Stellar-GeoLink

This guide will help you deploy your Stellar-GeoLink application to Azure with PostgreSQL and PostGIS support.

## Prerequisites

1. Azure account with active subscription
2. Azure CLI installed locally
3. GitHub repository with your code
4. Domain name (optional, for custom domain)

## Step 1: Set Up Azure PostgreSQL Server

### 1.1 Create PostgreSQL Server

1. Go to Azure Portal
2. Click "Create a resource" → "Databases" → "Azure Database for PostgreSQL"
3. Choose "Flexible server" (recommended for PostGIS support)
4. Configure:
   - **Server name**: `stellargeolink-postgres`
   - **Region**: Choose closest to your users
   - **PostgreSQL version**: 14 or higher
   - **Workload type**: Development
   - **Compute + storage**: Burstable, B1ms (1 vCore, 2 GiB RAM)
   - **Admin username**: `geolink_admin`
   - **Password**: Generate a strong password

### 1.2 Configure Network Access

1. In your PostgreSQL server, go to "Networking"
2. Add your current IP address to firewall rules
3. Enable "Allow access to Azure services"
4. Save the configuration

### 1.3 Install PostGIS Extension

Connect to your PostgreSQL server and run:

```sql
-- Connect to your database
\c postgres;

-- Create the geolink database
CREATE DATABASE geolink;

-- Connect to geolink database
\c geolink;

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify PostGIS installation
SELECT PostGIS_Version();
```

## Step 2: Set Up Azure Web App

### 2.1 Create Web App

1. Go to Azure Portal
2. Click "Create a resource" → "Web App"
3. Configure:
   - **Name**: `stellargeolink-webapp`
   - **Runtime stack**: Node 18 LTS
   - **Operating System**: Linux
   - **Region**: Same as your PostgreSQL server
   - **Pricing plan**: F1 (Free) or B1 (Basic)

### 2.2 Configure Application Settings

In your Web App, go to "Configuration" → "Application settings" and add:

```
NODE_ENV=production
PORT=8080
DB_HOST=your-postgres-server.postgres.database.azure.com
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user@your-postgres-server
DB_PASSWORD=your-database-password
DB_SSL=true
JWT_SECRET=your-jwt-secret
MAPBOX_TOKEN=your-mapbox-token
```

## Step 3: Database Setup

### 3.1 Run Database Schema

1. Connect to your Azure VM via SSH:
   ```bash
   ssh Serge369x33@20.253.209.97
   ```

2. Upload the schema file to your VM:
   ```bash
   scp scripts/azure-database-schema-setup.sql Serge369x33@20.253.209.97:~/
   ```

3. Run the schema setup:
   ```bash
   # Install PostgreSQL client if not already installed
   sudo apt install postgresql-client -y
   
   # Connect to your Azure PostgreSQL and run the schema
   psql -h your-postgres-server.postgres.database.azure.com -U geolink_admin -d geolink -f azure-database-schema-setup.sql
   ```

### 3.2 Create Database User

```sql
-- Connect to your Azure PostgreSQL server
-- Create a dedicated user for the application
CREATE USER geolink_user WITH PASSWORD '[REDACTED]!';
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO geolink_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO geolink_user;
```

## Step 4: Deploy Application

### 4.1 Prepare for Deployment

1. Update your `backend/config/database.js` to handle Azure PostgreSQL SSL:

```javascript
const poolConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'GeoLink',
    password: process.env.DB_PASSWORD || 'your_password',
    port: process.env.DB_PORT || 5432
};

// Azure PostgreSQL requires SSL
if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}
```

2. Create a `web.config` file in your project root:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="backend/app.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^backend/app.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="frontend/build{REQUEST_URI}"/>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <action type="Rewrite" url="backend/app.js"/>
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
```

### 4.2 Deploy via Azure CLI

1. Install Azure CLI:
   ```bash
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   ```

2. Login to Azure:
   ```bash
   az login
   ```

3. Create deployment package:
   ```bash
   # Build frontend
   cd frontend
   npm run build
   cd ..
   
   # Create deployment zip
   zip -r deployment.zip . -x "node_modules/*" ".git/*" "*.log"
   ```

4. Deploy to Azure:
   ```bash
   az webapp deployment source config-zip \
     --resource-group your-resource-group \
     --name stellargeolink-webapp \
     --src deployment.zip
   ```

## Step 5: GitHub Actions (Optional)

### 5.1 Create GitHub Actions Workflow

Create `.github/workflows/azure-deploy.yml`:

```yaml
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
        app-name: 'stellargeolink-webapp'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: '.'
```

### 5.2 Configure GitHub Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add `AZURE_WEBAPP_PUBLISH_PROFILE` secret
4. Get the publish profile from Azure Web App → Deployment Center → Download publish profile

## Step 6: Testing

### 6.1 Test Database Connection

1. SSH into your Azure VM:
   ```bash
   ssh Serge369x33@20.253.209.97
   ```

2. Test PostgreSQL connection:
   ```bash
   psql -h your-postgres-server.postgres.database.azure.com -U geolink_user -d geolink -c "SELECT PostGIS_Version();"
   ```

### 6.2 Test Web Application

1. Visit your Azure Web App URL
2. Check the application logs in Azure Portal
3. Test the API endpoints

## Troubleshooting

### Common Issues

1. **PostGIS not available**: Ensure you're using PostgreSQL Flexible Server, not Single Server
2. **SSL connection issues**: Verify SSL configuration in your database connection
3. **Build failures**: Check Node.js version compatibility
4. **Database connection**: Verify firewall rules and connection strings

### Useful Commands

```bash
# Check Azure Web App logs
az webapp log tail --name stellargeolink-webapp --resource-group your-resource-group

# Restart Azure Web App
az webapp restart --name stellargeolink-webapp --resource-group your-resource-group

# Check PostgreSQL connection
psql -h your-server.postgres.database.azure.com -U geolink_user -d geolink
```

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to your repository
2. **Database Access**: Use least privilege principle for database users
3. **SSL/TLS**: Always use encrypted connections in production
4. **Firewall**: Restrict database access to necessary IP addresses only

## Cost Optimization

1. **Database**: Use Burstable tier for development, scale up for production
2. **Web App**: Start with F1 (Free) tier, upgrade as needed
3. **Monitoring**: Set up alerts for unexpected usage spikes

## Next Steps

1. Set up monitoring and logging
2. Configure custom domain (optional)
3. Set up automated backups
4. Implement CI/CD pipeline
5. Add SSL certificate for custom domain
