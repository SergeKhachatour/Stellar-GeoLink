#!/bin/bash

# Azure Web App Deployment Script
# This script deploys the backend and sets up environment variables

echo "🚀 Starting Azure Web App deployment..."

# Deploy the backend
echo "📦 Deploying backend..."
curl -X POST \
  -H "Content-Type: application/zip" \
  -H "Authorization: Basic $(echo -n '$GeoLink:6qmmlK5DZrCEKzb4zuDSRqjDXTugkf85tTWRQv0sAKCedfcMa5a6S4NTu2hE' | base64)" \
  --data-binary @backend.zip \
  https://geolink-buavavc6gse5c9fw.scm.westus-01.azurewebsites.net/api/zipdeploy

echo "✅ Backend deployed successfully!"

# Set environment variables using Azure CLI (if available)
echo "🔧 Setting up environment variables..."

# Note: You'll need to set these environment variables in your Azure Web App portal:
# NODE_ENV=production
# PORT=8080
# DB_HOST=20.253.209.97
# DB_PORT=5432
# DB_NAME=GeoLink
# DB_USER=geolink_user
# DB_PASSWORD=StellarGeoLink2024
# DB_SSL=false
# JWT_SECRET=StellarGeoLink2024_Production_SuperSecure_JWT_Key_For_WebApp_Deployment
# API_BASE_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net
# FRONTEND_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net

echo "📋 Manual step required:"
echo "Please set the following environment variables in your Azure Web App:"
echo "1. Go to Azure Portal → Your Web App → Configuration → Application settings"
echo "2. Add these environment variables:"
echo "   - NODE_ENV: production"
echo "   - PORT: 8080"
echo "   - DB_HOST: 20.253.209.97"
echo "   - DB_PORT: 5432"
echo "   - DB_NAME: GeoLink"
echo "   - DB_USER: geolink_user"
echo "   - DB_PASSWORD: [REDACTED]"
echo "   - DB_SSL: false"
echo "   - JWT_SECRET: [REDACTED]"
echo "   - MAPBOX_TOKEN: your_mapbox_token_here"
echo "   - REACT_APP_MAPBOX_TOKEN: your_mapbox_token_here"
echo "   - ADMIN_EMAIL: admin@stellar-geolink.com"
echo "   - ADMIN_PASSWORD: your_secure_admin_password"
echo "   - API_BASE_URL: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net"
echo "   - FRONTEND_URL: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net"

echo "🎉 Deployment script completed!"
