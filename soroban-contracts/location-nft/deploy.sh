#!/bin/bash

# Deploy script for LocationNFT Manager Contract

echo "🚀 Deploying LocationNFT Manager Contract to Stellar Testnet..."
echo "📁 Working directory: $(pwd)"

# Check if Stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo "❌ Error: Stellar CLI is not installed. Please install it first."
    echo "Visit: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
    exit 1
fi

# Check if WASM file exists
WASM_FILE="target/wasm32v1-none/release/location_nft.wasm"
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ Error: WASM file not found. Please build the contract first."
    echo "Run: ./build.sh"
    exit 1
fi

# Set network to testnet
echo "🌐 Setting network to testnet..."
stellar config network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015"

# Deploy the contract
echo "📤 Deploying contract to testnet..."
echo "⚠️  Note: You need to provide your wallet's secret key for deployment"
echo "💡 Use the connected wallet from the NFT Manager interface"
CONTRACT_ID=$(stellar contract deploy \
    --wasm $WASM_FILE \
    --source-account <YOUR_WALLET_ADDRESS> \
    --network testnet \
    --alias location_nft)

if [ $? -eq 0 ]; then
    echo "✅ Contract deployed successfully!"
    echo "🆔 Contract ID: $CONTRACT_ID"
    echo "🌐 Network: testnet"
    echo "🔗 View on StellarExpert: https://testnet.stellar.expert/contract/$CONTRACT_ID"
    
    # Save contract ID to file
    echo "$CONTRACT_ID" > contract_id.txt
    echo "💾 Contract ID saved to contract_id.txt"
    
    echo ""
    echo "🎯 Next steps:"
    echo "1. Initialize the contract: stellar contract invoke --id $CONTRACT_ID --source-account <YOUR_WALLET_ADDRESS> --network testnet -- initialize --admin <YOUR_WALLET_ADDRESS> --name 'StellarGeoLinkNFT' --symbol 'SGL'"
    echo "2. Use the NFT Manager interface to deploy and manage contracts"
    echo "3. The frontend will handle contract deployment using your connected wallet"
else
    echo "❌ Deployment failed!"
    exit 1
fi
