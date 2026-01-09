#!/bin/bash

# Azure Linux App Service startup script
echo "Starting Stellar-GeoLink application on Linux..."

# Set working directory
export WORKDIR="/home/site/wwwroot"
cd $WORKDIR

# Install Soroban CLI if not already installed
if ! command -v soroban &> /dev/null; then
    echo "Installing Soroban CLI..."
    # Install to /home directory (writable in Azure)
    SOROBAN_DIR="/home/soroban"
    mkdir -p $SOROBAN_DIR
    
    # Download and install Soroban CLI
    curl -L https://github.com/stellar/soroban-tools/releases/latest/download/soroban-x86_64-unknown-linux-gnu.tar.gz -o /tmp/soroban.tar.gz
    if [ $? -eq 0 ]; then
        tar -xzf /tmp/soroban.tar.gz -C $SOROBAN_DIR
        chmod +x $SOROBAN_DIR/soroban
        export PATH="$SOROBAN_DIR:$PATH"
        echo "✅ Soroban CLI installed successfully"
    else
        echo "⚠️  Failed to download Soroban CLI - WASM parsing will use fallback methods"
    fi
else
    echo "✅ Soroban CLI already installed"
fi

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
