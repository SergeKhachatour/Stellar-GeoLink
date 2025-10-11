#!/bin/bash

# Build script for LocationNFT Manager Contract

echo "🏗️  Building LocationNFT Manager Contract..."
echo "📁 Working directory: $(pwd)"

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "❌ Error: Rust is not installed. Please install Rust first."
    echo "Visit: https://rustup.rs/"
    exit 1
fi

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Cargo is not installed. Please install Rust with Cargo."
    exit 1
fi

# Install the wasm32v1-none target if not already installed
echo "📦 Installing wasm32v1-none target..."
rustup target add wasm32v1-none

# Build the contract
echo "🔨 Building contract for wasm32v1-none target..."
cargo build --target wasm32v1-none --release

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Contract built successfully!"
    echo "📁 WASM file location: target/wasm32v1-none/release/location_nft.wasm"
    
    # Get file size
    if [ -f "target/wasm32v1-none/release/location_nft.wasm" ]; then
        SIZE=$(stat -c%s "target/wasm32v1-none/release/location_nft.wasm" 2>/dev/null || stat -f%z "target/wasm32v1-none/release/location_nft.wasm" 2>/dev/null)
        echo "📊 WASM file size: $SIZE bytes"
    fi
    
    echo "🚀 Ready for deployment to Stellar testnet!"
else
    echo "❌ Build failed!"
    exit 1
fi
