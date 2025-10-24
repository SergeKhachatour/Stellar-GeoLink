#!/bin/bash

# Azure Linux App Service startup script
echo "Starting Stellar-GeoLink application on Linux..."

# Set working directory
export WORKDIR="/home/site/wwwroot"
cd $WORKDIR

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo "ERROR: Backend directory not found!"
    ls -la
    exit 1
fi

# Navigate to backend directory
cd backend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "ERROR: Backend package.json not found!"
    ls -la
    exit 1
fi

# Install dependencies
echo "Installing Node.js dependencies..."
npm install --production

# Check if app.js exists
if [ ! -f "app.js" ]; then
    echo "ERROR: Backend app.js not found!"
    ls -la
    exit 1
fi

# Start the application
echo "Starting the application..."
node app.js
