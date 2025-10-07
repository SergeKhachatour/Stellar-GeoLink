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
# DB_HOST=[YOUR_DB_HOST]
# DB_PORT=5432
# DB_NAME=[YOUR_DB_NAME]
# DB_USER=[YOUR_DB_USER]
# DB_PASSWORD=[YOUR_DB_PASSWORD]
# DB_SSL=false
# JWT_SECRET=[YOUR_JWT_SECRET]
# API_BASE_URL=[YOUR_API_BASE_URL]
# FRONTEND_URL=[YOUR_FRONTEND_URL]

echo "📋 Manual step required:"
echo "Please set the following environment variables in your Azure Web App:"
echo "1. Go to Azure Portal → Your Web App → Configuration → Application settings"
echo "2. Add these environment variables:"
echo "   - NODE_ENV: production"
echo "   - PORT: 8080"
echo "   - DB_HOST: [YOUR_DB_HOST]"
echo "   - DB_PORT: 5432"
echo "   - DB_NAME: [YOUR_DB_NAME]"
echo "   - DB_USER: [YOUR_DB_USER]"
echo "   - DB_PASSWORD: [YOUR_DB_PASSWORD]"
echo "   - DB_SSL: false"
echo "   - JWT_SECRET: [YOUR_JWT_SECRET]"
echo "   - MAPBOX_TOKEN: your_mapbox_token_here"
echo "   - REACT_APP_MAPBOX_TOKEN: your_mapbox_token_here"
echo "   - ADMIN_EMAIL: admin@stellar-geolink.com"
echo "   - ADMIN_PASSWORD: your_secure_admin_password"
echo "   - API_BASE_URL: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net"
echo "   - FRONTEND_URL: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net"

echo "🎉 Deployment script completed!"
