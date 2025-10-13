#!/bin/bash

# Azure Web App startup script
echo "Starting Stellar-GeoLink application..."

# Navigate to backend directory
cd backend

# Install dependencies
echo "Installing Node.js dependencies..."
npm install --production

# Start the application
echo "Starting the application..."
node app.js
