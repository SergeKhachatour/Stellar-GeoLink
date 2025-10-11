# LocationNFT Manager Contract

A comprehensive Soroban smart contract for managing location-based NFTs on the Stellar blockchain. This contract enables minting, transferring, and managing NFTs with geographical data.

## 🚀 Features

### Core NFT Functions
- **Mint**: Create new location-based NFTs with metadata
- **Transfer**: Transfer NFTs between addresses
- **Metadata**: Store and retrieve NFT metadata including location data
- **Ownership**: Track and verify NFT ownership

### Location-Specific Features
- **Geographic Data**: Store latitude, longitude, and radius for each NFT
- **Location Updates**: Admin can update location data for existing NFTs
- **Location Queries**: Retrieve location information for any token
- **Coordinate Precision**: Coordinates stored as microdegrees (i64) for precision

### Admin Functions
- **Access Control**: Admin-only functions for minting and location updates
- **Contract Management**: Initialize contract with custom name and symbol
- **Supply Tracking**: Track total supply of minted NFTs

### Deployment Status
- ✅ **Contract Deployed**: `CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46`
- ✅ **Network**: Stellar Testnet
- ✅ **Status**: Active and ready for minting
- ✅ **Frontend Integration**: Fully integrated with React frontend
- ✅ **Real Transactions**: Successfully minted NFTs on blockchain

## 📋 Contract Functions

### Public Functions
- `initialize(admin, name, symbol)` - Initialize the contract
- `mint(to, token_id, name, symbol, uri, latitude, longitude, radius)` - Mint new NFT
- `transfer(from, to, token_id)` - Transfer NFT between addresses
- `owner_of(token_id)` - Get owner of specific token
- `get_metadata(token_id)` - Get metadata for a token
- `get_location(token_id)` - Get location data for a token
- `name()` - Get contract name
- `symbol()` - Get contract symbol
- `total_supply()` - Get total number of minted NFTs
- `balance_of(owner)` - Get number of NFTs owned by address
- `is_owner(owner, token_id)` - Check if address owns specific token

### Admin Functions
- `update_location(token_id, latitude, longitude, radius)` - Update location data

## 🛠️ Setup & Deployment

### Prerequisites
1. **Rust**: Install from [rustup.rs](https://rustup.rs/)
2. **Stellar CLI**: Install from [Stellar Docs](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
3. **Testnet Account**: Funded account on Stellar testnet

### Build Contract
```bash
# Install Rust target (correct target for Stellar)
rustup target add wasm32v1-none

# Build the contract
./build.sh
```

### Deploy to Testnet
```bash
# Deploy contract (using your connected wallet)
./deploy.sh

# Initialize contract (using your connected wallet address)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  -- \
  initialize \
  --admin <YOUR_WALLET_ADDRESS> \
  --name "StellarGeoLinkNFT" \
  --symbol "SGL"
```

**Note**: This contract is designed to work with the Stellar-GeoLink NFT Manager interface, which handles wallet connection and contract deployment automatically.

## 🎯 Usage Examples

### Mint an NFT
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  -- \
  mint \
  --to <RECIPIENT_ADDRESS> \
  --token-id 1 \
  --name "Central Park NFT" \
  --symbol "CP" \
  --uri "https://example.com/metadata.json" \
  --latitude 40.7829 \
  --longitude -73.9654 \
  --radius 100
```

### Transfer an NFT
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  -- \
  transfer \
  --from <FROM_ADDRESS> \
  --to <TO_ADDRESS> \
  --token-id 1
```

### Get NFT Metadata
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  -- \
  get_metadata \
  --token-id 1
```

### Get Location Data
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  -- \
  get_location \
  --token-id 1
```

## 📊 Data Structures

### TokenMetadata
```rust
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub latitude: i64,      // Stored as microdegrees (multiply by 1,000,000)
    pub longitude: i64,     // Stored as microdegrees (multiply by 1,000,000)
    pub radius: u32,
    pub created_at: u64,
}
```

### LocationData
```rust
pub struct LocationData {
    pub latitude: i64,      // Stored as microdegrees (multiply by 1,000,000)
    pub longitude: i64,     // Stored as microdegrees (multiply by 1,000,000)
    pub radius: u32,
}
```

### Coordinate Precision
- **Storage Format**: Coordinates stored as `i64` (64-bit integers) in microdegrees
- **Conversion**: Multiply decimal degrees by 1,000,000 for storage
- **Example**: `34.230479` becomes `34230479` in contract
- **Precision**: Maintains 6 decimal places of precision

## 🔒 Security Features

- **Admin-Only Functions**: Only admin can mint NFTs and update locations
- **Ownership Validation**: All transfers verify current ownership
- **Duplicate Prevention**: Prevents minting tokens with existing IDs
- **Access Control**: Proper permission checks for all operations

## 🌐 Integration

This contract is designed to work with the Stellar-GeoLink frontend application, providing:

- **Real Blockchain Operations**: Actual Stellar testnet deployment
- **Location-Based NFTs**: Geographic data storage and retrieval
- **NFT Management**: Complete lifecycle management
- **Admin Controls**: Secure admin functions for contract management

## 📁 Project Structure

```
location-nft/
├── src/
│   └── lib.rs          # Main contract implementation
├── Cargo.toml          # Contract dependencies
├── build.sh            # Build script
├── deploy.sh           # Deployment script
└── README.md           # This file
```

## 🚀 Next Steps

1. **Deploy Contract**: Use the deployment scripts to deploy to testnet
2. **Initialize**: Set up the contract with admin and basic info
3. **Frontend Integration**: Connect with the Stellar-GeoLink frontend
4. **Mint NFTs**: Start creating location-based NFTs
5. **Transfer NFTs**: Enable NFT trading and transfers

## 🔗 Live Contract Information

### Deployed Contract
- **Contract ID**: `CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46`
- **Network**: Stellar Testnet
- **Status**: Active and ready for minting

### StellarExpert Links
- **Contract View**: https://stellar.expert/explorer/testnet/contract/CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46
- **Recent Transaction**: https://stellar.expert/explorer/testnet/tx/446f078181d4b0b34a629ae820c155d524a9fa6cf4b51ed67087be458b9ed2ed

### Frontend Integration
- **React Component**: `RealPinNFT` component handles all blockchain operations
- **Wallet Context**: Integrated with wallet management system
- **Transaction History**: All operations tracked and displayed
- **Real-time Updates**: Contract state synchronized with frontend

## 🔗 Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Smart Contracts](https://developers.stellar.org/docs/build/smart-contracts/)
- [StellarExpert Explorer](https://testnet.stellar.expert/)
- [Stellar Laboratory](https://laboratory.stellar.org/)

---

**Ready to deploy location-based NFTs on Stellar! 🎉**