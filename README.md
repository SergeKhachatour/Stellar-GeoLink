# Stellar-GeoLink

Stellar-GeoLink is a geolocation-based platform that connects wallet providers with data consumers, providing secure and efficient location data management services. This project was created to serve as a backend data provider for the [BlockchainMaps Unity 3D visualization tool](https://github.com/SergeKhachatour/BlockchainMaps-Server), which requires structured geolocation data for blockchain nodes and transactions.

## Integration with BlockchainMaps

The Stellar-GeoLink platform provides:
- Standardized geolocation data for blockchain nodes
- Real-time updates for node locations and statuses
- Secure API endpoints compatible with Unity's HTTP client
- Role-based access for different data providers
- Structured data format optimized for 3D visualization

The data from this platform feeds directly into the BlockchainMaps Unity project, enabling:
- 3D visualization of blockchain nodes on a world map
- Real-time marker updates based on geographical coordinates
- Visual connections between blockchain nodes
- Differentiation between various blockchain types (Stellar, USDC/Circle)

## Project Structure

```
Stellar-GeoLink/
├── backend/
│   ├── config/             # Database and API configurations
│   ├── middleware/         # Auth, API key, and request handling
│   ├── routes/            # API endpoint definitions
│   ├── services/          # Business logic and data processing
│   └── app.js             # Main application entry point
├── frontend/
│   ├── public/            # Static assets
│   └── src/
│       ├── components/    # Reusable UI components
│       ├── contexts/      # React context providers
│       ├── pages/         # Main application views
│       └── services/      # API integration services
```

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL with PostGIS extensions
- Redis
- Mapbox API key (for maps functionality)

## Environment Variables

### Backend (.env)
```bash
PORT=4000
DATABASE_URL=postgresql://username:password@localhost:5432/geolink
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
MAPBOX_TOKEN=your_mapbox_token
```

### Frontend (.env)
```bash
REACT_APP_API_URL=http://localhost:4000/api
REACT_APP_MAPBOX_TOKEN=your_mapbox_token
```

## Installation

### Prerequisites
Before installing, ensure you have the following installed:
- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (v12 or higher) with PostGIS extensions - [Download here](https://www.postgresql.org/download/)
- **Redis** (v6 or higher) - [Download here](https://redis.io/download)
- **Git** - [Download here](https://git-scm.com/downloads)

### Step 1: Clone the Repository
```bash
git clone https://github.com/SergeKhachatour/Stellar-GeoLink.git
cd Stellar-GeoLink
```

### Step 2: Install Dependencies

#### Install Backend Dependencies
```bash
cd backend
npm install
```

#### Install Frontend Dependencies
```bash
cd frontend
npm install
```

#### Install Root Dependencies (Optional)
```bash
# From the root directory
npm install
```

### Step 3: Database Setup

#### Create PostgreSQL Database
```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE geolink;
CREATE USER geolink_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;

-- Connect to the geolink database
\c geolink;

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

#### Run Database Schema
```bash
# From the project root
psql -U geolink_user -d geolink -f database/schema.sql
```

### Step 4: Environment Configuration

#### Backend Environment (.env in backend directory)
```bash
# Database Configuration
DB_USER=geolink_user
DB_HOST=localhost
DB_NAME=geolink
DB_PASSWORD=your_secure_password
DB_PORT=5432

# JWT Configuration
JWT_SECRET=your_very_secure_jwt_secret_key_here

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Mapbox Configuration
MAPBOX_TOKEN=your_mapbox_token_here

# Server Configuration
PORT=4000
NODE_ENV=development
```

#### Frontend Environment (.env in frontend directory)
```bash
REACT_APP_API_URL=http://localhost:4000/api
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
```

### Step 5: Initialize Admin User
```bash
# From the backend directory
node scripts/addAdminUser.js
```

### Step 6: Verify Installation
```bash
# Test database connection
node scripts/testConnection.js

# Test admin login
node scripts/test-admin-login.js
```

## Running the Application

### Development Mode

#### Start Backend Server
```bash
cd backend
npm run dev
```

#### Start Frontend Development Server
```bash
cd frontend
npm start
```

### Production Mode

#### Start Backend Server (Production)
```bash
cd backend
npm run prod
```

#### Build and Serve Frontend (Production)
```bash
cd frontend
npm run build
# Serve the build folder with a static server
```

### Application URLs
Once both servers are running, the application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **API Documentation**: http://localhost:4000/api-docs
- **Health Check**: http://localhost:4000/health

### Development Scripts

#### Backend Scripts
```bash
# Development with auto-reload
npm run dev

# Development with local environment
npm run dev:local

# Development with Azure environment
npm run dev:azure

# Production mode
npm run prod

# Switch to development environment
npm run switch:dev

# Switch to production environment
npm run switch:prod
```

#### Frontend Scripts
```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Eject from Create React App (not recommended)
npm run eject
```

### Troubleshooting Startup Issues

#### Backend Won't Start
1. **Check database connection**:
   ```bash
   node scripts/testConnection.js
   ```

2. **Verify environment variables**:
   ```bash
   node scripts/test-env.js
   ```

3. **Check if port is available**:
   ```bash
   netstat -an | grep 4000
   ```

#### Frontend Won't Start
1. **Clear node_modules and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check for missing dependencies**:
   ```bash
   npm audit
   npm audit fix
   ```

3. **Clear browser cache** and try again

## User Roles

- **Admin**: Full system access and management capabilities
- **Wallet Provider**: Manage wallet locations and transaction data
- **Data Consumer**: Access location data through API endpoints
- **NFT Manager**: Manage location-based NFTs and collections
- **SDF Employee**: Special role for Stellar Development Foundation employees with:
  - Access to sensitive blockchain node data
  - Ability to manage node configurations
  - Permission to view detailed analytics
  - Authorization to approve data provider requests

## Features

- **User Authentication & Authorization**: JWT-based authentication with refresh tokens
- **Role-based Access Control**: Admin, Wallet Provider, Data Consumer, SDF Employee, and NFT Manager roles
- **API Key Management**: Comprehensive API key lifecycle management with approval workflows
- **Real-time Geolocation Tracking**: PostGIS-powered location tracking with historical data
- **Interactive Maps**: Mapbox GL JS integration for visualization
- **NFT System**: Location-based NFT collection and management system
- **NFT Dashboard**: Complete NFT management interface with map visualization
- **Real Stellar Blockchain Integration**: Deploy, mint, and transfer NFTs on actual Stellar testnet
- **OpenZeppelin Stellar Contracts**: Custom NFT contracts with location-based features
- **Smart Contract Deployment**: Deploy and manage NFT contracts on Stellar blockchain
- **IPFS Metadata Management**: Full IPFS integration with image URL building
- **Location-based NFT Validation**: Radius-based minting and transfer restrictions
- **Role-based NFT Access Control**: NFT managers can override location restrictions
- **Usage Analytics**: Detailed API usage tracking and analytics dashboard
- **Geofencing Capabilities**: Polygon-based geofencing with notifications
- **Privacy Controls**: User privacy and visibility settings
- **Admin Dashboard**: Complete administrative interface for user and API key management
- **Request Management**: API key request workflow with approval/rejection system
- **Smart Wallet Management**: Advanced wallet connection and reconnection system with cross-session persistence

## API Documentation

API documentation is available through Swagger UI at `/api-docs` when the server is running.

## Stellar Blockchain NFT Features

### Real Blockchain Integration
Stellar-GeoLink now includes full integration with the Stellar blockchain for real NFT operations:

#### **Smart Contract Deployment**
- Deploy custom NFT contracts on Stellar testnet
- OpenZeppelin Stellar Contracts integration
- Location-based NFT validation
- Role-based access control for NFT managers

#### **NFT Operations**
- **Mint NFTs**: Create location-based NFTs with IPFS metadata
- **Transfer NFTs**: Transfer NFTs with radius validation
- **Metadata Management**: Full IPFS URL building and management
- **Location Validation**: Users must be within radius to mint/transfer

#### **Wallet Integration**
- **View-Only Mode**: Connect wallets for viewing NFTs
- **Full Access Mode**: Upgrade to full access for transactions
- **Automatic Testnet Funding**: Fund accounts with testnet XLM
- **Transaction History**: Track all blockchain transactions

#### **PIN NFT Process**
- **Database PIN**: Traditional database storage (existing)
- **Blockchain PIN**: Real Stellar blockchain minting (new)
- **Dual Options**: Choose between database or blockchain storage
- **Seamless Integration**: Works with existing PIN NFT workflow

### NFT System Architecture

#### **Smart Contract Structure**
The system uses a custom Soroban smart contract (`LocationNFT`) with the following features:

```rust
// Contract Functions
pub fn initialize(env: &Env, admin: Address, name: String, symbol: String)
pub fn mint(env: &Env, to: Address, token_id: u32, name: String, symbol: String, uri: String, latitude: i64, longitude: i64, radius: u32)
pub fn transfer(env: &Env, from: Address, to: Address, token_id: u32)
pub fn owner_of(env: &Env, token_id: u32) -> Result<Address, Val>
pub fn get_metadata(env: &Env, token_id: u32) -> Result<TokenMetadata, Val>
pub fn get_location(env: &Env, token_id: u32) -> Result<LocationData, Val>
```

#### **Data Structures**
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

#### **Contract Deployment Process**
1. **WASM Compilation**: Rust contract compiled to WebAssembly
2. **Stellar Laboratory**: Deploy via web interface at https://laboratory.stellar.org/
3. **Contract Initialization**: Initialize with admin, name, and symbol
4. **Frontend Integration**: Contract ID stored and used for operations

#### **Frontend Integration**
- **RealPinNFT Component**: Main interface for blockchain operations
- **Contract Management**: Deploy, initialize, and manage contracts
- **Wallet Context**: Handle wallet connections and transactions
- **Transaction History**: Track all blockchain operations

### Usage Instructions

#### **1. Connect Your Wallet**
- Go to NFT Dashboard
- Click "Pin NFT (Blockchain)" for real blockchain features
- Connect your wallet (view-only or full access)

#### **2. Deploy NFT Contract**
- Click "Deploy New Contract" in the Real PIN NFT dialog
- Enter contract name (e.g., "StellarGeoLinkNFT")
- Deploy to Stellar testnet

#### **3. Mint Real NFTs**
- Select "Mint New NFT" option
- Enter NFT details and IPFS hash
- Mint on actual Stellar blockchain

#### **4. Transfer NFTs**
- Select "Transfer Existing NFT" option
- Choose NFT from your collection
- Transfer with location validation

#### **5. Upgrade Wallet Access**
- If in view-only mode, click "Upgrade to Full Access"
- Enter your secret key (starts with "S...")
- Gain full transaction capabilities

### Technical Implementation Details

#### **Coordinate Precision**
- **Storage Format**: Coordinates stored as `i64` (64-bit integers) in microdegrees
- **Conversion**: Multiply decimal degrees by 1,000,000 for storage
- **Example**: `34.230479` becomes `34230479` in contract
- **Precision**: Maintains 6 decimal places of precision

#### **Transaction Flow**
1. **User Input**: Enter NFT details and location
2. **Coordinate Conversion**: Convert decimal degrees to microdegrees
3. **Contract Call**: Call `mint` function with converted coordinates
4. **Transaction Signing**: Sign transaction with user's secret key
5. **Blockchain Submission**: Submit to Stellar testnet via Soroban RPC
6. **Confirmation**: Wait for transaction confirmation

#### **Error Handling**
- **Coordinate Validation**: Ensure coordinates are valid decimal degrees
- **Contract Validation**: Verify contract is deployed and initialized
- **Wallet Validation**: Ensure wallet has sufficient XLM for transaction fees
- **Network Validation**: Handle network errors and retry logic

#### **Security Features**
- **Admin Controls**: Contract admin can manage minting permissions
- **Location Validation**: Users must be within radius to mint/transfer
- **Wallet Security**: Secret keys handled securely in browser
- **Transaction Signing**: All transactions signed with user's private key

### Contract Management

#### **Deployed Contracts**
- **Contract ID**: `CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46`
- **Network**: Stellar Testnet
- **Status**: Active and ready for minting
- **Admin**: Connected wallet address

#### **Contract Functions Available**
- `mint`: Create new location-based NFTs
- `transfer`: Transfer NFTs between addresses
- `owner_of`: Get NFT owner
- `get_metadata`: Get NFT metadata
- `get_location`: Get NFT location data
- `total_supply`: Get total number of NFTs
- `balance_of`: Get NFT count for address

#### **StellarExpert Integration**
- **Contract View**: https://stellar.expert/explorer/testnet/contract/CBDWQWTY6KVVHOS4FHWCGHYCHY7RLPX64OLOT4VMULGNAO7U6LKTXC46
- **Transaction History**: View all contract transactions
- **Real-time Updates**: Monitor contract activity

### Development and Testing

#### **Local Development**
```bash
# Build the contract
cd soroban-contracts/location-nft
cargo build --target wasm32v1-none --release

# Deploy via Stellar Laboratory
# 1. Go to https://laboratory.stellar.org/
# 2. Upload the compiled WASM
# 3. Deploy and initialize the contract
```

#### **Testing the System**
1. **Connect Wallet**: Use testnet wallet with XLM
2. **Deploy Contract**: Deploy via Stellar Laboratory
3. **Initialize Contract**: Set admin and contract details
4. **Mint NFTs**: Create location-based NFTs
5. **Transfer NFTs**: Test transfer functionality
6. **Verify on StellarExpert**: Check transaction history

#### **Debugging**
- **Console Logs**: Comprehensive logging for all operations
- **Coordinate Debugging**: Track coordinate conversion process
- **Transaction Debugging**: Monitor transaction submission and confirmation
- **Error Handling**: Detailed error messages for troubleshooting

## Wallet Context System

The Stellar-GeoLink platform features a sophisticated wallet management system that handles wallet connections, reconnections, and cross-session persistence. This system ensures seamless user experience across login/logout cycles and prevents wallet connection issues.

### 🔧 **Wallet Context Architecture**

The wallet system is built around three core components:

#### 1. **WalletContext (`frontend/src/contexts/WalletContext.js`)**
The central wallet management system that handles:
- **Wallet Connection State**: Tracks connection status, public/secret keys, balance, and account info
- **Stellar SDK Integration**: Manages Stellar network connections and transactions
- **Cross-Session Persistence**: Automatically restores wallet connections after page refresh
- **User Change Detection**: Clears wallet state when different users log in
- **Event-Driven Updates**: Responds to logout events and storage changes

#### 2. **AuthContext Integration (`frontend/src/contexts/AuthContext.js`)**
Enhanced authentication system that:
- **Logout Event Dispatch**: Sends custom `userLogout` events to notify wallet context
- **Token Management**: Handles JWT token lifecycle and cleanup
- **Cross-Tab Synchronization**: Ensures consistent state across browser tabs

#### 3. **NFTDashboard Auto-Reconnection (`frontend/src/components/NFT/NFTDashboard.js`)**
Smart wallet reconnection logic that:
- **User Detection**: Identifies when different users log in
- **Automatic Reconnection**: Connects to the correct user's wallet automatically
- **Retry Logic**: Implements robust retry mechanisms for connection failures
- **State Validation**: Ensures wallet state matches current user

### 🔄 **Wallet Connection Flow**

#### **App Startup Process (Fixed Race Condition):**
1. **WalletContext Mounts**: Initializes but waits for user information
2. **AuthContext Loads**: Authenticates user and sets user data
3. **User Coordination**: NFTDashboard calls `setUser()` to notify WalletContext
4. **Wallet Validation**: WalletContext checks if saved wallet matches current user
5. **Smart Restoration**: 
   - **Same User**: Restores wallet from localStorage
   - **Different User**: Clears saved data and prepares for new connection
   - **No Saved Data**: Prepares for auto-connection

#### **Initial Connection Process:**
1. **User Login**: AuthContext authenticates user and sets user data
2. **User Notification**: NFTDashboard calls `setUser()` to coordinate with WalletContext
3. **Wallet Detection**: NFTDashboard detects user has a public key
4. **Auto-Connection**: Automatically connects to user's wallet using `connectWalletViewOnly()`
5. **State Persistence**: Wallet state is saved to localStorage for future sessions
6. **Backend Sync**: User's public key is updated in the backend database

#### **Logout Process:**
1. **Logout Trigger**: User clicks logout or session expires
2. **Event Dispatch**: AuthContext dispatches `userLogout` custom event
3. **User Clearing**: NFTDashboard calls `setUser(null)` to notify WalletContext
4. **Wallet Clearing**: WalletContext clears wallet state (but preserves localStorage)
5. **Cross-Tab Sync**: All browser tabs receive logout notification
6. **State Reset**: All wallet-related state is reset to initial values

#### **Reconnection Process:**
1. **User Login**: New user logs in with their credentials
2. **User Notification**: NFTDashboard calls `setUser()` with new user data
3. **User Validation**: WalletContext validates saved wallet against current user
4. **State Management**: 
   - **Same User**: Restores wallet from localStorage automatically
   - **Different User**: Clears all wallet data and connects to new user's wallet
5. **Automatic Connection**: Wallet connects automatically without user intervention
6. **Retry Logic**: Implements retry mechanism for failed connections

### 🔧 **Race Condition Fix & User Coordination**

#### **Problem Solved:**
The original implementation had a **race condition** where the WalletContext would try to restore the wallet from localStorage immediately on mount, before user authentication was complete. This caused:
- Wallet connecting to wrong user after restart
- Wallet not reconnecting after login
- Inconsistent behavior across sessions

#### **Solution Implemented:**
1. **User Coordination**: Added `setUser()` function to WalletContext
2. **Delayed Restoration**: Wallet restoration now waits for user information
3. **User Validation**: Wallet only restores if it matches the current user
4. **Automatic Cleanup**: Different users automatically clear saved wallet data

#### **Coordination Mechanism:**
```javascript
// NFTDashboard coordinates user changes with WalletContext
useEffect(() => {
  if (user) {
    setUser(user);  // Notify WalletContext of current user
  } else {
    setUser(null);  // Clear user in WalletContext
  }
}, [user, setUser]);

// WalletContext waits for user before restoring wallet
useEffect(() => {
  if (!currentUser) {
    // No user, clear wallet state
    return;
  }
  
  const savedPublicKey = localStorage.getItem('stellar_public_key');
  
  if (savedPublicKey && currentUser.public_key && savedPublicKey === currentUser.public_key) {
    // Same user, restore wallet
    restoreWallet(savedPublicKey);
  } else if (savedPublicKey && currentUser.public_key && savedPublicKey !== currentUser.public_key) {
    // Different user, clear saved data
    clearWalletCompletely();
  }
}, [currentUser]);
```

### 🛠️ **Key Functions and Methods**

#### **WalletContext Functions:**
```javascript
// Core connection functions
connectWallet(secretKey)           // Connect with secret key (full access)
connectWalletViewOnly(publicKey)  // Connect with public key (view-only)
disconnectWallet()                // Disconnect and clear localStorage
clearWallet()                     // Clear state but keep localStorage
clearWalletCompletely()           // Clear everything including localStorage

// User coordination (NEW)
setUser(user)                     // Set current user for wallet coordination

// Account management
loadAccountInfo(publicKey)        // Load account details from Stellar network
sendTransaction(destination, amount) // Send XLM transactions
getTransactionHistory(limit)       // Get transaction history
fundAccount()                     // Fund account with testnet XLM

// State management
generateWallet()                  // Generate new wallet keypair
```

#### **Event System:**
```javascript
// Custom events for cross-component communication
window.dispatchEvent(new CustomEvent('userLogout'));  // Triggered on logout
window.addEventListener('userLogout', handleUserLogout); // Listened by WalletContext
```

### 🔍 **State Management Logic**

#### **Wallet State Variables:**
- `isConnected`: Boolean indicating wallet connection status
- `publicKey`: User's Stellar public key
- `secretKey`: User's Stellar secret key (null for view-only mode)
- `balance`: XLM balance from Stellar network
- `account`: Full account object from Stellar network
- `loading`: Loading state for async operations
- `error`: Error messages for failed operations

#### **localStorage Keys:**
- `stellar_public_key`: Stores user's public key for persistence
- `stellar_secret_key`: Stores user's secret key for persistence
- `token`: JWT authentication token
- `refreshToken`: JWT refresh token

### 🚀 **Auto-Reconnection Logic**

The system implements intelligent auto-reconnection with the following logic:

```javascript
// NFTDashboard auto-reconnection useEffect
useEffect(() => {
  if (user && user.public_key) {
    // Check if we need to reconnect
    const needsReconnection = !isConnected || (publicKey && publicKey !== user.public_key);
    const isDifferentUser = publicKey && publicKey !== user.public_key;
    
    if (isDifferentUser) {
      // Clear wallet completely for different user
      clearWalletCompletely();
    }
    
    if (needsReconnection) {
      // Attempt automatic reconnection
      connectWalletViewOnly(user.public_key);
    }
  }
}, [user, isConnected, publicKey, connectWalletViewOnly, clearWalletCompletely]);
```

### 🔒 **Security Features**

#### **Data Protection:**
- **Secret Key Handling**: Secret keys are only stored in memory during active sessions
- **View-Only Mode**: Public key connections don't store secret keys
- **Automatic Cleanup**: Wallet state is cleared on logout
- **Cross-Tab Security**: Logout in one tab affects all tabs

#### **User Isolation:**
- **User-Specific Data**: Each user's wallet data is isolated
- **Automatic Switching**: System automatically switches wallets when users change
- **State Validation**: Ensures wallet state matches current authenticated user

### 🐛 **Troubleshooting Wallet Issues**

#### **Common Issues and Solutions:**

1. **Wallet Not Reconnecting After Login (FIXED):**
   - **Cause**: Race condition between wallet restoration and user authentication
   - **Solution**: Added user coordination mechanism with `setUser()` function
   - **Prevention**: Wallet restoration now waits for user authentication

2. **Wrong User's Wallet Connected (FIXED):**
   - **Cause**: Wallet restored from localStorage before user validation
   - **Solution**: User validation ensures wallet matches current user
   - **Prevention**: Automatic cleanup for different users

3. **Wallet Not Connecting After App Restart (FIXED):**
   - **Cause**: WalletContext trying to restore before user is authenticated
   - **Solution**: Delayed restoration with user coordination
   - **Prevention**: Proper sequencing of authentication and wallet restoration

4. **Wallet Connection Fails:**
   - **Cause**: Network issues or invalid public key
   - **Solution**: Retry logic with exponential backoff
   - **Prevention**: Robust error handling and user feedback

5. **Cross-Tab Inconsistency:**
   - **Cause**: Wallet state not synchronized across tabs
   - **Solution**: Storage event listeners for cross-tab sync
   - **Prevention**: Event-driven state management

#### **Debug Information:**
The system provides comprehensive logging for debugging:
```javascript
console.log('User logged in with public key:', user.public_key);
console.log('Current wallet connection state:', { isConnected, publicKey });
console.log('Wallet needs reconnection:', { needsReconnection, currentPublicKey: publicKey, userPublicKey: user.public_key });
console.log('User logout detected, clearing wallet state');
```

### 📱 **User Experience Benefits**

- **Seamless Login**: Wallet automatically connects when user logs in
- **No Manual Reconnection**: Users don't need to manually reconnect wallets
- **Cross-Session Persistence**: Wallet stays connected across browser sessions
- **Multi-Tab Support**: Consistent wallet state across all browser tabs
- **Automatic User Switching**: System handles user changes transparently
- **Error Recovery**: Automatic retry and recovery from connection failures

This wallet context system ensures a smooth, professional user experience while maintaining security and data integrity across all user sessions.

## Dependencies

### Backend
- Express.js
- PostgreSQL (pg)
- Redis
- JSON Web Tokens (jsonwebtoken)
- bcrypt
- cors
- and others (see package.json)

### Frontend
- React
- Material-UI
- Mapbox GL
- Axios
- React Router
- Chart.js
- and others (see package.json)

## API Usage for Data Consumers

1. Register as a data consumer
2. Request an API key through the dashboard
3. Wait for admin approval
4. Use the API key in requests:
   ```bash
   curl -H "X-API-Key: your_api_key" https://api.stellar-geolink.com/api/location/wallet-locations
   ```

### Rate Limits
- 60 requests per minute
- 5000 requests per day

### Available Endpoints
- GET /api/location/wallet-locations - Get all wallet locations
- GET /api/location/wallet-statistics - Get location statistics
- GET /api/location/active-regions - Get active regions
- GET /api/user/locations - Get user-specific locations (Wallet Providers)
- POST /api/user/privacy-settings - Update privacy settings
- POST /api/user/visibility-settings - Update visibility settings

## API Usage for Wallet Providers

1. Register as a wallet provider
2. API key is automatically created (pending approval)
3. Wait for admin approval
4. Submit wallet locations:
   ```bash
   curl -X POST -H "X-API-Key: your_api_key" \
        -H "Content-Type: application/json" \
        -d '{"public_key":"G...","latitude":40.7128,"longitude":-74.0060}' \
        https://api.stellar-geolink.com/api/user/locations
   ```

## Admin Dashboard Features

- **User Management**: View, edit, and manage all users
- **API Key Management**: Approve/reject API key requests
- **Pending Requests**: Handle API key requests with approval workflow
- **Active Keys**: Manage approved API keys
- **Rejected Keys**: View and potentially re-approve rejected keys
- **Analytics**: System-wide usage statistics and monitoring

## Deployment

### Azure Web App Deployment
The application is deployed on Azure Web Apps with the following configuration:

- **Frontend**: React application served from Azure Web App
- **Backend**: Node.js API server with PostgreSQL database
- **Database**: Azure PostgreSQL with PostGIS extensions
- **URL**: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net

### Deployment Status
✅ **Azure Web App Deployment**: Successfully deployed to Azure with complete database schema  
✅ **GitHub Actions CI/CD**: Automated deployment pipeline configured  
✅ **PostgreSQL with PostGIS**: Full spatial database with 26+ tables deployed  
✅ **ESLint Issues Resolved**: Frontend build optimized for production  
✅ **GitHub Secrets Configured**: Publish profile authentication set up  

### Deployment Process
1. Code is automatically deployed via GitHub Actions when changes are pushed to main branch
2. Frontend and backend are built and deployed to Azure Web Apps
3. Database schema is automatically applied during deployment
4. Environment variables are configured through Azure App Settings

## Troubleshooting

### Common Issues

#### Frontend Build Failures
The NFT functionality is now fully integrated and working. If you encounter build issues:

1. **Clear node_modules and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check for missing dependencies**:
   ```bash
   npm audit
   npm audit fix
   ```

3. **Verify environment variables** are properly set for Mapbox integration

#### Database Connection Issues
- Ensure PostgreSQL is running and accessible
- Check environment variables for correct database credentials
- Verify PostGIS extensions are installed

#### API Key Issues
- Ensure API keys are properly generated and stored
- Check admin approval status for new API key requests
- Verify rate limiting configuration

## Development

### Local Development Setup
1. Clone the repository
2. Install dependencies for both frontend and backend
3. Set up PostgreSQL database with PostGIS
4. Configure environment variables
5. Run database migrations
6. Start both frontend and backend servers

### Testing
- Backend tests: `npm test` in the backend directory
- Frontend tests: `npm test` in the frontend directory
- API testing: Use the Swagger documentation at `/api-docs`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Documentation

- **[Deployment Guide](DEPLOYMENT.md)**: Complete deployment instructions and troubleshooting
- **[Troubleshooting Guide](TROUBLESHOOTING.md)**: Common issues and solutions
- **[Security Guidelines](SECURITY.md)**: Security best practices and configuration
- **[Wallet Context Documentation](WALLET_CONTEXT_DOCUMENTATION.md)**: Comprehensive guide to the wallet management system

## Support and Contact

For support, questions, or contributions:
- **Email**: sergekhachatour@gmail.com
- **GitHub Issues**: [Create an issue](https://github.com/SergeKhachatour/Stellar-GeoLink/issues)
- **Documentation**: See the documentation files above for detailed guides