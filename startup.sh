#!/bin/bash

# Azure Linux App Service startup script
echo "Starting Stellar-GeoLink application on Linux..."

# Set working directory
export WORKDIR="/home/site/wwwroot"
cd $WORKDIR

# Install Soroban CLI if not already installed
if ! command -v soroban &> /dev/null && [ ! -f "/home/soroban/soroban" ]; then
    echo "Installing Soroban CLI..."
    # Install to /home directory (writable in Azure)
    SOROBAN_DIR="/home/soroban"
    mkdir -p $SOROBAN_DIR
    
    # Get latest release URL from GitHub API
    echo "📥 Fetching latest Soroban CLI release info from GitHub API..."
    RELEASE_INFO=$(curl -s -L "https://api.github.com/repos/stellar/soroban-tools/releases/latest")
    
    if [ $? -eq 0 ] && [ ! -z "$RELEASE_INFO" ]; then
        # Extract download URL using grep and sed (since we don't have jq)
        DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -o '"browser_download_url"[^"]*"[^"]*soroban[^"]*x86_64-unknown-linux-gnu[^"]*\.tar\.gz"' | head -1 | sed 's/.*"browser_download_url":"\([^"]*\)".*/\1/')
        
        if [ -z "$DOWNLOAD_URL" ]; then
            echo "⚠️  Could not find download URL in release info, using fallback..."
            DOWNLOAD_URL="https://github.com/stellar/soroban-tools/releases/download/v21.4.0/soroban-x86_64-unknown-linux-gnu.tar.gz"
        else
            echo "✅ Found download URL: $DOWNLOAD_URL"
        fi
    else
        echo "⚠️  Failed to fetch release info, using fallback URL..."
        DOWNLOAD_URL="https://github.com/stellar/soroban-tools/releases/download/v21.4.0/soroban-x86_64-unknown-linux-gnu.tar.gz"
    fi
    
    # Download and install Soroban CLI
    echo "📥 Downloading Soroban CLI from: $DOWNLOAD_URL"
    curl -L -f -s -S "$DOWNLOAD_URL" -o /tmp/soroban.tar.gz
    if [ $? -eq 0 ] && [ -f /tmp/soroban.tar.gz ]; then
        FILE_SIZE=$(stat -c%s /tmp/soroban.tar.gz 2>/dev/null || stat -f%z /tmp/soroban.tar.gz 2>/dev/null || echo "0")
        if [ "$FILE_SIZE" -gt 1000 ]; then
            echo "✅ Downloaded $FILE_SIZE bytes"
            echo "📦 Extracting Soroban CLI..."
            tar -xzf /tmp/soroban.tar.gz -C $SOROBAN_DIR
            if [ -f "$SOROBAN_DIR/soroban" ]; then
                chmod +x $SOROBAN_DIR/soroban
                export PATH="$SOROBAN_DIR:$PATH"
                echo "✅ Soroban CLI installed successfully at $SOROBAN_DIR/soroban"
            else
                echo "⚠️  Soroban binary not found after extraction"
            fi
        else
            echo "⚠️  Downloaded file too small ($FILE_SIZE bytes), may be an error page"
        fi
    else
        echo "⚠️  Failed to download Soroban CLI - WASM parsing will use fallback methods"
    fi
elif [ -f "/home/soroban/soroban" ]; then
    echo "✅ Soroban CLI found at /home/soroban/soroban"
    export PATH="/home/soroban:$PATH"
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
