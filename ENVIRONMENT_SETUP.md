# Environment Variables Setup for Stellar-GeoLink NFT System

## Required Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user
DB_PASSWORD=your_secure_password_here

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# Mapbox Configuration (Required for NFT Map functionality)
MAPBOX_TOKEN=your_mapbox_token_here

# Server Configuration
PORT=4000
NODE_ENV=development

# Redis Configuration (Optional - for caching)
REDIS_URL=redis://localhost:6379

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# API Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# NFT System Configuration
NFT_DEFAULT_RADIUS=10
NFT_MAX_RADIUS=1000
NFT_VERIFICATION_TIMEOUT=30000

# Location Verification
LOCATION_VERIFICATION_ENABLED=true
LOCATION_ACCURACY_THRESHOLD=100

# Analytics Configuration
ANALYTICS_RETENTION_DAYS=90
ANALYTICS_BATCH_SIZE=1000
```

## Frontend Environment Variables

Create a `.env` file in the `frontend` directory:

```env
# API Configuration
REACT_APP_API_URL=http://localhost:4000/api

# Mapbox Configuration (Required for NFT Map)
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here

# Application Configuration
REACT_APP_NAME=Stellar-GeoLink NFT
REACT_APP_VERSION=1.0.0
```

## Getting Mapbox Token

1. Go to https://account.mapbox.com/
2. Sign up for a free account
3. Go to "Access tokens" section
4. Copy your default public token
5. Add it to both backend and frontend `.env` files

## Database Setup Commands

### 1. Install PostgreSQL
```bash
# Windows (using Chocolatey)
choco install postgresql

# Or download from https://www.postgresql.org/download/windows/
```

### 2. Create Database and User
```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE geolink;
CREATE USER geolink_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;
```

### 3. Install PostGIS Extension
```sql
-- Connect to the geolink database
\c geolink
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 4. Run NFT Migration
```bash
cd backend
node scripts/runNFTMigration.js
```

## Verification Steps

### 1. Test Database Connection
```bash
cd backend
node -e "
const pool = require('./config/database');
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Connection failed:', err);
  else console.log('Database connected successfully:', res.rows[0]);
  pool.end();
});
"
```

### 2. Test API Endpoints
```bash
# Start the backend server
cd backend
npm start

# In another terminal, test the API
curl http://localhost:4000/api/nft/collections
```

### 3. Test Frontend
```bash
cd frontend
npm start
# Open http://localhost:3000
```

## Security Notes

1. **Never commit `.env` files to version control**
2. **Use strong, unique passwords for database**
3. **Generate a secure JWT secret (32+ characters)**
4. **Keep Mapbox tokens secure and rotate regularly**
5. **Use environment-specific configurations for production**

## Production Considerations

For production deployment, consider:
- Using environment-specific database configurations
- Setting up SSL/TLS for database connections
- Configuring proper CORS origins
- Setting up monitoring and logging
- Using secrets management services
