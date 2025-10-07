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
- **Usage Analytics**: Detailed API usage tracking and analytics dashboard
- **Geofencing Capabilities**: Polygon-based geofencing with notifications
- **Privacy Controls**: User privacy and visibility settings
- **Admin Dashboard**: Complete administrative interface for user and API key management
- **Request Management**: API key request workflow with approval/rejection system

## API Documentation

API documentation is available through Swagger UI at `/api-docs` when the server is running.

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

## Support and Contact

For support, questions, or contributions:
- **Email**: sergekhachatour@gmail.com
- **GitHub Issues**: [Create an issue](https://github.com/SergeKhachatour/Stellar-GeoLink/issues)
- **Documentation**: See the documentation files above for detailed guides