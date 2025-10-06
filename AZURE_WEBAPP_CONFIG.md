# Azure Web App Configuration

## 🎯 **Your Azure Web App Details**
- **Name**: GeoLink
- **URL**: geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net
- **Resource Group**: geolink_group
- **Location**: West US
- **Runtime**: Node.js 22 LTS
- **Operating System**: Linux

## 🔧 **Environment Variables to Set in Azure**

### **Required Environment Variables**

```bash
# Environment
NODE_ENV=production
PORT=8080

# Database Configuration (Azure PostgreSQL)
DB_HOST=20.253.209.97
DB_PORT=5432
DB_NAME=GeoLink
DB_USER=geolink_user
DB_PASSWORD=StellarGeoLink2024
DB_SSL=false

# JWT Configuration
JWT_SECRET=your_production_jwt_secret_key_here

# Mapbox Configuration
MAPBOX_TOKEN=your_production_mapbox_token

# Redis Configuration (if using Azure Redis Cache)
REDIS_HOST=your_redis_cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your_redis_password
REDIS_SSL=true

# Email Configuration
SENDGRID_API_KEY=your_production_sendgrid_api_key
FROM_EMAIL=noreply@stellargeolink.com

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=your_production_stellar_secret_key

# API Configuration
API_BASE_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net
FRONTEND_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net

# Azure Web App Specific
WEBSITE_NODE_DEFAULT_VERSION=22.0.0
WEBSITE_RUN_FROM_PACKAGE=1
```

## 🚀 **How to Set Environment Variables in Azure**

### **Option 1: Azure Portal**
1. Go to your Azure Web App in the Azure Portal
2. Navigate to **Configuration** → **Application settings**
3. Add each environment variable as a new application setting
4. Click **Save** to apply changes

### **Option 2: Azure CLI**
```bash
# Set environment variables using Azure CLI
az webapp config appsettings set --resource-group geolink_group --name GeoLink --settings \
  NODE_ENV=production \
  PORT=8080 \
  DB_HOST=20.253.209.97 \
  DB_PORT=5432 \
  DB_NAME=GeoLink \
  DB_USER=geolink_user \
  DB_PASSWORD=StellarGeoLink2024 \
  DB_SSL=false \
  JWT_SECRET=your_production_jwt_secret_key_here \
  API_BASE_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net \
  FRONTEND_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net
```

## 📋 **Next Steps**

1. **Set Environment Variables** in Azure Web App
2. **Configure GitHub Actions** for automated deployment
3. **Deploy the Application** to Azure
4. **Test the Production Environment**

## 🔒 **Security Notes**

- Replace all placeholder values with actual production secrets
- Use Azure Key Vault for sensitive data in production
- Ensure JWT_SECRET is a strong, random string
- Use production-ready API keys and tokens
