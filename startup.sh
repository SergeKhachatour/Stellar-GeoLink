#!/bin/bash

# Azure Linux App Service startup script
echo "Starting Stellar-GeoLink application on Linux..."

# Navigate to backend directory
cd /home/site/wwwroot/backend

# Install dependencies
echo "Installing Node.js dependencies..."
npm install --production

# Start the application
echo "Starting the application..."
node app.js
