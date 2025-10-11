# Soroban Contracts

This directory contains all Soroban smart contracts for the Stellar-GeoLink project. Each contract is organized in its own folder for better maintainability and development.

## 📁 Contract Structure

```
soroban-contracts/
├── location-nft/          # LocationNFT Manager Contract
│   ├── src/
│   │   └── lib.rs         # Contract implementation
│   ├── Cargo.toml         # Contract dependencies
│   ├── build.sh           # Build script
│   ├── deploy.sh          # Deployment script
│   └── README.md          # Contract documentation
├── future-contract/       # Future contracts will go here
└── README.md              # This file
```

## 🚀 Available Contracts

### LocationNFT Manager (`location-nft/`)
A comprehensive NFT contract for managing location-based NFTs on Stellar.

**Features:**
- Mint location-based NFTs with metadata
- Transfer NFTs between addresses
- Store geographic data (latitude, longitude, radius)
- Admin controls for contract management
- Real blockchain deployment ready
- **Currently Deployed**: Contract ID `CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46`

**Contract Functions:**
```rust
pub fn initialize(env: &Env, admin: Address, name: String, symbol: String)
pub fn mint(env: &Env, to: Address, token_id: u32, name: String, symbol: String, uri: String, latitude: i64, longitude: i64, radius: u32)
pub fn transfer(env: &Env, from: Address, to: Address, token_id: u32)
pub fn owner_of(env: &Env, token_id: u32) -> Result<Address, Val>
pub fn get_metadata(env: &Env, token_id: u32) -> Result<TokenMetadata, Val>
pub fn get_location(env: &Env, token_id: u32) -> Result<LocationData, Val>
pub fn total_supply(env: &Env) -> u32
pub fn balance_of(env: &Env, owner: Address) -> u32
```

**Data Structures:**
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

pub struct LocationData {
    pub latitude: i64,
    pub longitude: i64,
    pub radius: u32,
}
```

**Quick Start:**
```bash
cd location-nft
./build.sh
./deploy.sh
```

**Deployment Status:**
- ✅ **Contract Deployed**: `CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46`
- ✅ **Network**: Stellar Testnet
- ✅ **Status**: Active and ready for minting
- ✅ **Frontend Integration**: Fully integrated with React frontend
- ✅ **Real Transactions**: Successfully minted NFTs on blockchain

**StellarExpert Links:**
- **Contract**: https://stellar.expert/explorer/testnet/contract/CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46
- **Recent Transaction**: https://stellar.expert/explorer/testnet/tx/446f078181d4b0b34a629ae820c155d524a9fa6cf4b51ed67087be458b9ed2ed

## 🛠️ Development Workflow

### Adding a New Contract

1. **Create Contract Folder:**
   ```bash
   mkdir new-contract-name
   cd new-contract-name
   ```

2. **Initialize Rust Project:**
   ```bash
   cargo init --lib
   ```

3. **Configure Cargo.toml:**
   ```toml
   [package]
   name = "new-contract"
   version = "0.1.0"
   edition = "2021"

   [lib]
   crate-type = ["cdylib"]

   [dependencies]
   soroban-sdk = "23.0.0"

   [profile.release]
   opt-level = "z"
   overflow-checks = true
   debug = 0
   strip = "symbols"
   debug-assertions = false
   panic = "abort"
   codegen-units = 1
   rpath = false
   lto = true
   ```

4. **Create Build Script:**
   ```bash
   # Copy and modify from location-nft/build.sh
   cp ../location-nft/build.sh .
   # Edit the script for your contract
   ```

5. **Create Deploy Script:**
   ```bash
   # Copy and modify from location-nft/deploy.sh
   cp ../location-nft/deploy.sh .
   # Edit the script for your contract
   ```

6. **Create Documentation:**
   ```bash
   # Copy and modify from location-nft/README.md
   cp ../location-nft/README.md .
   # Edit the documentation for your contract
   ```

### Building Contracts

Each contract has its own build process:

```bash
# Build specific contract
cd location-nft
./build.sh

# Or build manually
cargo build --target wasm32v1-none --release
```

### Deploying Contracts

Each contract has its own deployment process:

```bash
# Deploy specific contract
cd location-nft
./deploy.sh

# Or deploy manually
stellar contract deploy \
  --wasm target/wasm32v1-none/release/location_nft.wasm \
  --source-account <YOUR_WALLET_ADDRESS> \
  --network testnet \
  --alias location_nft
```

## 🔧 Prerequisites

- **Rust**: Install from [rustup.rs](https://rustup.rs/)
- **Stellar CLI**: Install from [Stellar Docs](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
- **Target**: `rustup target add wasm32v1-none`

## 📚 Resources

- [Stellar Smart Contracts](https://developers.stellar.org/docs/build/smart-contracts/)
- [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts/)
- [Stellar CLI Reference](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)

---

**Ready to build and deploy Stellar smart contracts! 🎉**
