# GeoLink - Platform Overview

## What is GeoLink?

**GeoLink** (Stellar-GeoLink) is a comprehensive geolocation-based blockchain platform that seamlessly integrates Stellar blockchain operations with real-world location data. It serves as a powerful bridge between wallet providers, data consumers, and blockchain applications, enabling location-aware smart contracts, NFT management, and geospatial analytics.

GeoLink combines:
- **Stellar Blockchain Integration**: Full support for Stellar accounts, assets, smart contracts, and Soroban operations
- **Geospatial Intelligence**: PostGIS-powered location tracking, geofencing, and proximity detection
- **Location-Based NFTs**: Create, mint, transfer, and manage NFTs tied to real-world locations
- **Smart Contract Automation**: Automatically execute contracts based on wallet location and geofence triggers
- **AI-Powered Assistant**: Natural language interface for blockchain and location operations
- **Analytics & Insights**: Comprehensive geospatial analytics and blockchain distribution statistics

---

## Core Features

### 1. **Location Tracking & Management**

GeoLink provides robust location tracking capabilities:

- **Real-time Location Updates**: Track wallet locations with precise coordinates (6 decimal places precision)
- **Historical Location Data**: Complete location history for wallets with timestamp tracking
- **PostGIS Integration**: Advanced spatial database operations for efficient geospatial queries
- **Privacy Controls**: User-configurable privacy and visibility settings
- **Location Validation**: Radius-based validation for location-dependent operations

**Key Capabilities:**
- Submit wallet locations via API or dashboard
- Query nearby wallets within specified radius
- Track location history and movement patterns
- Set location-based triggers and rules

### 2. **Location-Based NFT System**

GeoLink features a complete NFT ecosystem tied to real-world locations:

#### **Blockchain Integration**
- **Real Stellar Testnet/Mainnet**: Deploy and interact with actual Stellar blockchain
- **Smart Contract Deployment**: Deploy custom Soroban NFT contracts
- **IPFS Metadata**: Full IPFS integration for NFT images and metadata
- **Location Validation**: NFTs can only be minted/transferred within specified radius
- **Ownership Tracking**: Complete ownership history and transfer tracking

#### **NFT Operations**
- **Mint NFTs**: Create location-based NFTs with geographic coordinates
- **Transfer NFTs**: Transfer NFTs with location validation
- **Pin NFTs**: Pin NFTs to specific locations on the map
- **NFT Collections**: Organize NFTs into collections
- **Nearby NFT Discovery**: Find NFTs within proximity of your location
- **NFT Verification**: Verify NFT location and ownership

#### **Workflow Options**
- **Direct Blockchain Mint**: Mint directly on Stellar blockchain
- **IPFS Server Workflow**: Upload to IPFS server first, then pin to blockchain
- **Database Storage**: Traditional database storage for non-blockchain NFTs

### 3. **Smart Contract Management**

GeoLink provides comprehensive smart contract management for all user roles:

#### **Contract Discovery & Introspection**
- **Automatic Function Discovery**: Discover contract functions and parameters automatically
- **Contract Spec Analysis**: Analyze Soroban contract specifications
- **Function Mapping**: Map GeoLink fields to contract parameters
- **WASM File Management**: Upload, download, and verify WASM contract files

#### **Contract Operations**
- **Unlimited Contracts**: Users can manage unlimited custom contracts
- **Contract CRUD**: Full Create, Read, Update, Delete operations
- **Function Execution**: Execute contract functions dynamically
- **Smart Wallet Integration**: Support for smart wallet contracts
- **WebAuthn Support**: Passwordless authentication for contract operations

#### **Contract Execution Rules**
- **Location-Based Triggers**: Execute contracts when wallets enter/exit specific areas
- **Geofence Triggers**: Trigger contracts based on geofence boundaries
- **Proximity Triggers**: Execute based on proximity to locations
- **Target Wallet Options**: Target specific wallets or any wallet in area
- **Auto-Execution**: Optional automatic execution without confirmation
- **Payment Integration**: Support for payment contracts and asset transfers

### 4. **Geofencing System**

Advanced geofencing capabilities for location-based alerts and triggers:

- **Polygon-Based Geofences**: Create custom polygon boundaries
- **Circular Geofences**: Create circular geofences from center point and radius
- **Place Name Geocoding**: Create geofences by place name (e.g., "New York", "San Francisco")
- **Webhook Notifications**: Automatic webhook notifications when wallets enter/exit geofences
- **Geofence Management**: Full CRUD operations for geofences
- **Intersection Detection**: Check if locations intersect with geofences
- **Multi-Geofence Support**: Wallets can be in multiple geofences simultaneously

**Use Cases:**
- Store location boundaries
- Park and landmark definitions
- Event venue perimeters
- Delivery zones
- Contract execution triggers

### 5. **AI-Powered Assistant (GeoLink Agent)**

GeoLink includes an intelligent AI assistant powered by Azure OpenAI:

#### **Natural Language Interface**
- **Conversational Operations**: Perform blockchain and location operations through natural language
- **Context Awareness**: Understands user location, wallet, and preferences
- **Interactive Maps**: Automatically displays locations on interactive maps
- **Markdown Support**: Rich text responses with formatting

#### **Available Operations**
The AI can perform:
- **Stellar Operations**: Create accounts, issue assets, transfer assets, manage trustlines
- **Location Services**: Find nearby wallets, get geospatial statistics
- **NFT Management**: Create collections, find nearby NFTs, verify locations
- **Smart Wallet Operations**: Check balances, manage smart wallets
- **Contract Operations**: Discover contracts, execute functions, manage custom contracts
- **Geofence Management**: Create and manage geofences
- **Analytics**: Get system statistics and blockchain distribution data
- **WebAuthn/Passkeys**: Register and manage passkeys for passwordless authentication

#### **Access Modes**
- **Public Chat**: Available on home page for general inquiries
- **Authenticated Chat**: Full access in user dashboards with user context

### 6. **Analytics & Insights**

Comprehensive analytics and reporting:

- **System Statistics**: Total wallets, blockchains, providers, active wallets
- **Blockchain Distribution**: Wallet count and percentage by blockchain type
- **Geospatial Analytics**: Location-based statistics and heatmaps
- **Usage Tracking**: API usage analytics and rate limiting
- **Activity Monitoring**: Real-time activity logs and session tracking
- **Background AI Logs**: Monitor AI processing and rule matches

### 7. **Role-Based Access Control**

GeoLink supports multiple user roles with specific capabilities:

#### **Admin**
- Full system access and management
- User management and API key approval
- System-wide analytics and monitoring
- Contract management across all users

#### **Wallet Provider**
- Submit wallet locations and transaction data
- Manage wallet location history
- Create geofences and location rules
- Contract management for wallet integrations
- Privacy and visibility settings

#### **Data Consumer**
- Access location data through API endpoints
- Query nearby wallets and geospatial data
- Analytics and reporting access
- Contract management for data processing

#### **NFT Manager**
- Full NFT collection and management
- Mint, transfer, and manage location-based NFTs
- Contract management for NFT operations
- Override location restrictions (role-specific)

#### **SDF Employee**
- Access to sensitive blockchain node data
- Node configuration management
- Detailed analytics access
- Data provider request approval

### 8. **API Key Management**

Comprehensive API key lifecycle management:

- **Request Workflow**: Request API keys through dashboard
- **Admin Approval**: Approval/rejection workflow for API key requests
- **Rate Limiting**: Configurable rate limits (60 requests/minute, 5000/day)
- **Key Management**: View, activate, deactivate, and regenerate keys
- **Usage Tracking**: Monitor API usage and analytics

### 9. **Wallet Management**

Advanced wallet connection and management system:

- **Auto-Connection**: Automatic wallet connection on login
- **Cross-Session Persistence**: Wallet stays connected across browser sessions
- **Multi-Tab Support**: Consistent wallet state across browser tabs
- **View-Only Mode**: Connect wallets for viewing without secret keys
- **Full Access Mode**: Upgrade to full access for transactions
- **Automatic Funding**: Testnet XLM funding for new accounts
- **Transaction History**: Track all blockchain transactions
- **User Isolation**: Automatic wallet switching when users change

### 10. **WebAuthn/Passkey Support**

Passwordless authentication for enhanced security:

- **Passkey Registration**: Register passkeys for smart wallet operations
- **Biometric Authentication**: Use fingerprint, face ID, or security keys
- **Contract Integration**: WebAuthn-protected contract functions
- **Cross-Device Support**: Passkeys work across devices
- **Security**: Enhanced security for sensitive operations

---

## Key Capabilities

### **Location-Based Automation**

GeoLink enables powerful location-based automation:

1. **Contract Execution Rules**
   - Automatically execute smart contracts when wallets enter/exit areas
   - Support for location, geofence, and proximity triggers
   - Target specific wallets or any wallet in area
   - Optional confirmation or auto-execution

2. **Smart Wallet Collection Rules**
   - Automatically collect nearby NFTs based on location
   - Configurable collection parameters (rarity, distance, payment)
   - Cooldown periods and collection limits
   - Support for multiple trigger types

3. **Background AI Processing**
   - Automatic processing of location updates
   - Rule matching and execution
   - Activity logging and monitoring
   - Context-aware decision making

### **Geospatial Intelligence**

- **Proximity Detection**: Find wallets, NFTs, and locations within specified radius
- **Spatial Queries**: Advanced PostGIS queries for complex geospatial operations
- **Heatmaps**: Visual representation of location density
- **Route Tracking**: Track movement patterns and routes
- **Boundary Detection**: Detect entry/exit from geofences and areas

### **Blockchain Integration**

- **Stellar Network**: Full support for Stellar testnet and mainnet
- **Soroban Contracts**: Deploy and interact with Soroban smart contracts
- **Asset Management**: Issue, transfer, and manage Stellar assets
- **Trustline Management**: Create and manage asset trustlines
- **Transaction Signing**: Secure transaction signing and submission
- **Real-time Updates**: Live blockchain data integration

### **Data Management**

- **Structured Data**: Standardized geolocation data format
- **Real-time Updates**: Live location and status updates
- **Historical Data**: Complete history tracking
- **Data Export**: Export location and transaction data
- **Privacy Controls**: User-configurable privacy settings

---

## Use Cases

### **1. Location-Based Payments**
- Automatically execute payment contracts when wallets enter store locations
- Proximity-based payment triggers
- Geofence-based payment zones

### **2. Location-Based Rewards**
- Mint reward NFTs when wallets visit specific locations
- Park visit rewards
- Event attendance rewards
- Location-based loyalty programs

### **3. NFT Collection & Gaming**
- Location-based NFT collection games
- Proximity-based NFT discovery
- Geofence-based NFT drops
- Location-validated NFT transfers

### **4. Supply Chain & Logistics**
- Track wallet locations for supply chain management
- Geofence-based delivery notifications
- Route optimization based on wallet locations
- Location-based asset transfers

### **5. Event Management**
- Event venue geofences
- Attendee location tracking
- Location-based event rewards
- Proximity-based networking

### **6. Data Analytics**
- Geospatial analytics for blockchain nodes
- Wallet distribution analysis
- Location-based user behavior insights
- Blockchain network visualization

### **7. Smart City Applications**
- Location-based services for smart cities
- Geofence-based city services
- Proximity-based notifications
- Urban planning analytics

### **8. Blockchain Visualization**
- 3D visualization of blockchain nodes (BlockchainMaps integration)
- Real-time node location updates
- Visual connections between nodes
- Geographic distribution analysis

---

## Technical Architecture

### **Backend Stack**
- **Node.js/Express**: RESTful API server
- **PostgreSQL with PostGIS**: Spatial database for geolocation data
- **Redis**: Caching and session management
- **Stellar SDK**: Stellar blockchain integration
- **Soroban RPC**: Smart contract interaction
- **Azure OpenAI**: AI assistant integration
- **IPFS**: NFT metadata storage

### **Frontend Stack**
- **React**: Modern UI framework
- **Material-UI**: Component library
- **Mapbox GL**: Interactive map visualization
- **Axios**: HTTP client for API calls
- **Chart.js**: Analytics and visualization

### **Database Schema**
- **26+ Tables**: Comprehensive database schema
- **Spatial Indexes**: GIST indexes for efficient geospatial queries
- **JSONB Support**: Flexible data storage for contracts and metadata
- **Foreign Key Constraints**: Data integrity and relationships
- **Migration System**: Version-controlled database migrations

### **API Architecture**
- **RESTful Endpoints**: Standard REST API design
- **JWT Authentication**: Secure token-based authentication
- **API Key Authentication**: Alternative authentication for data consumers
- **Rate Limiting**: Configurable rate limits per API key
- **Swagger Documentation**: Interactive API documentation

### **Deployment**
- **Azure Web Apps**: Cloud hosting for frontend and backend
- **Azure PostgreSQL**: Managed database with PostGIS
- **GitHub Actions**: CI/CD pipeline for automated deployment
- **Environment Configuration**: Secure environment variable management

---

## Integration Points

### **BlockchainMaps Unity 3D**
GeoLink serves as a backend data provider for the BlockchainMaps Unity 3D visualization tool:
- Standardized geolocation data for blockchain nodes
- Real-time updates for node locations and statuses
- Secure API endpoints compatible with Unity's HTTP client
- Structured data format optimized for 3D visualization

### **External APIs**
- **Mapbox**: Map visualization and geocoding
- **Stellar Horizon**: Stellar network access
- **Soroban RPC**: Smart contract interaction
- **IPFS**: Decentralized storage

### **Webhook Support**
- Geofence entry/exit notifications
- Location update webhooks
- Contract execution notifications
- Custom webhook endpoints

---

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **API Key Management**: Secure API key generation and validation
- **Role-Based Access Control**: Granular permissions per role
- **Privacy Controls**: User-configurable privacy settings
- **WebAuthn/Passkeys**: Passwordless authentication
- **Transaction Signing**: Secure blockchain transaction signing
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Comprehensive input validation and sanitization

---

## Getting Started

### **For Wallet Providers**
1. Register as a wallet provider
2. Get API key (automatically created, pending approval)
3. Submit wallet locations via API or dashboard
4. Create geofences and location rules
5. Manage contracts and execution rules

### **For Data Consumers**
1. Register as a data consumer
2. Request API key through dashboard
3. Wait for admin approval
4. Access location data through API endpoints
5. Use analytics and reporting features

### **For NFT Managers**
1. Register as an NFT manager
2. Connect your Stellar wallet
3. Deploy or connect NFT contracts
4. Mint location-based NFTs
5. Manage collections and transfers

### **For Developers**
1. Clone the repository
2. Set up PostgreSQL with PostGIS
3. Configure environment variables
4. Run database migrations
5. Start backend and frontend servers
6. Access API documentation at `/api-docs`

---

## Documentation

GeoLink includes comprehensive documentation:
- **README.md**: Installation and setup guide
- **SMART_CONTRACT_SETUP.md**: Smart contract integration guide
- **AI_INTEGRATION_GUIDE.md**: AI assistant setup and usage
- **WALLET_RULES_GUIDE.md**: Contract execution rules guide
- **CONTRACT_MANAGEMENT_GUIDE.md**: Contract management guide
- **NFT_SYSTEM_DOCUMENTATION.md**: NFT system documentation
- **WALLET_CONTEXT_DOCUMENTATION.md**: Wallet management guide

---

## Support & Contact

- **Email**: sergekhachatour@gmail.com
- **GitHub**: [Stellar-GeoLink Repository](https://github.com/SergeKhachatour/Stellar-GeoLink)
- **Issues**: [GitHub Issues](https://github.com/SergeKhachatour/Stellar-GeoLink/issues)

---

## Summary

GeoLink is a powerful, comprehensive platform that combines:
- ✅ **Stellar Blockchain** operations and smart contracts
- ✅ **Geospatial Intelligence** with PostGIS
- ✅ **Location-Based NFTs** with real blockchain integration
- ✅ **Smart Contract Automation** based on location triggers
- ✅ **AI-Powered Assistant** for natural language operations
- ✅ **Analytics & Insights** for data-driven decisions
- ✅ **Role-Based Access** for different user types
- ✅ **API Integration** for external applications

Whether you're building location-based games, payment systems, supply chain solutions, or blockchain visualizations, GeoLink provides the tools and infrastructure to bring your ideas to life.
