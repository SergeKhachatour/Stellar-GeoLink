#!/bin/bash

# Azure Linux App Service startup script
echo "Starting Stellar-GeoLink application on Linux..."

# Set working directory
export WORKDIR="/home/site/wwwroot"
cd $WORKDIR

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found!"
    ls -la
    exit 1
fi

# Install dependencies (if needed)
echo "Installing Node.js dependencies..."
npm install --production

# Check if app.js exists
if [ ! -f "app.js" ]; then
    echo "ERROR: app.js not found!"
    ls -la
    exit 1
fi

# Start the application using npm start (which runs "node app.js" from package.json)
echo "Starting the application..."
npm start
