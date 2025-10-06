# Database Setup Guide for Stellar-GeoLink NFT System

## Prerequisites

### 1. Install PostgreSQL

#### Option A: Download from Official Website
1. Go to https://www.postgresql.org/download/windows/
2. Download PostgreSQL 14 or later
3. Run the installer with default settings
4. Remember the password you set for the `postgres` user

#### Option B: Using Chocolatey (if installed)
```powershell
choco install postgresql
```

#### Option C: Using Docker
```bash
docker run --name postgres-nft -e POSTGRES_PASSWORD=yourpassword -e POSTGRES_DB=geolink -p 5432:5432 -d postgres:14
```

### 2. Install PostGIS Extension (Required for spatial operations)
```sql
-- Connect to your database and run:
CREATE EXTENSION IF NOT EXISTS postgis;
```

## Database Configuration

### 1. Create Database
```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE geolink;
CREATE USER geolink_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;
```

### 2. Environment Variables
Create or update your `.env` file in the backend directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user
DB_PASSWORD=your_secure_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here

# Mapbox Configuration
MAPBOX_TOKEN=your_mapbox_token_here

# Server Configuration
PORT=4000
NODE_ENV=development
```

### 3. Run Database Migration
```bash
cd backend
node scripts/runNFTMigration.js
```

## Verification

### Test Database Connection
```bash
# Test connection
node -e "
const pool = require('./config/database');
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Connection failed:', err);
  else console.log('Database connected successfully:', res.rows[0]);
  pool.end();
});
"
```

### Verify NFT Tables
```sql
-- Connect to your database and check:
\dt nft_*
SELECT * FROM nft_collections;
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure PostgreSQL service is running
   - Check if port 5432 is available
   - Verify firewall settings

2. **Authentication Failed**
   - Double-check username and password
   - Ensure user has proper privileges
   - Try connecting with `psql -U postgres -h localhost`

3. **Migration Fails**
   - Ensure database exists
   - Check user permissions
   - Verify PostGIS extension is installed

### Windows Service Management
```powershell
# Start PostgreSQL service
net start postgresql-x64-14

# Stop PostgreSQL service
net stop postgresql-x64-14

# Check service status
sc query postgresql-x64-14
```

## Next Steps

1. Complete database setup
2. Configure environment variables
3. Run the NFT migration
4. Test the system functionality
