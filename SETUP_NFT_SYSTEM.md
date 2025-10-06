# Complete NFT System Setup Guide

## 🚀 Quick Start

Follow these steps to get the Stellar-GeoLink NFT system running:

### Step 1: Install PostgreSQL

#### Option A: Download and Install
1. Go to https://www.postgresql.org/download/windows/
2. Download PostgreSQL 14 or later
3. Run installer with default settings
4. **Remember the password** you set for the `postgres` user

#### Option B: Using Chocolatey
```powershell
# Install Chocolatey if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install PostgreSQL
choco install postgresql
```

### Step 2: Create Database and User

Open Command Prompt or PowerShell as Administrator and run:

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database and user
CREATE DATABASE geolink;
CREATE USER geolink_user WITH PASSWORD 'nft_secure_password_123';
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;

-- Connect to the new database
\c geolink

-- Install PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Exit psql
\q
```

### Step 3: Configure Environment Variables

Create `.env` file in `backend` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user
DB_PASSWORD=nft_secure_password_123

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random_123456789

# Mapbox Configuration (Get from https://account.mapbox.com/)
MAPBOX_TOKEN=your_mapbox_token_here

# Server Configuration
PORT=4000
NODE_ENV=development
```

Create `.env` file in `frontend` directory:

```env
# API Configuration
REACT_APP_API_URL=http://localhost:4000/api

# Mapbox Configuration
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
```

### Step 4: Run Database Migration

```bash
cd backend
node scripts/runNFTMigration.js
```

### Step 5: Install Frontend Dependencies

```bash
cd frontend
npm install mapbox-gl
```

### Step 6: Add Mapbox Script to HTML

Add to `frontend/public/index.html` before the closing `</head>` tag:

```html
<script src='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js'></script>
<link href='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css' rel='stylesheet' />
```

### Step 7: Test the System

```bash
# Start backend server
cd backend
npm start

# In another terminal, start frontend
cd frontend
npm start

# In a third terminal, run tests
cd backend
node scripts/testNFTSystem.js
```

## 🔧 Manual Setup (If Quick Start Fails)

### Database Troubleshooting

1. **Check PostgreSQL Service**
   ```powershell
   # Check if PostgreSQL is running
   Get-Service postgresql*
   
   # Start PostgreSQL if not running
   Start-Service postgresql-x64-14
   ```

2. **Test Database Connection**
   ```bash
   # Test connection
   psql -U geolink_user -h localhost -d geolink
   ```

3. **Manual Migration**
   ```sql
   -- Connect to database
   psql -U geolink_user -h localhost -d geolink
   
   -- Run migration manually
   \i database/migrations/001_add_nft_tables.sql
   ```

### Environment Variables Troubleshooting

1. **Check if .env files exist**
   ```bash
   # Backend
   ls backend/.env
   
   # Frontend
   ls frontend/.env
   ```

2. **Verify database connection**
   ```bash
   cd backend
   node -e "
   require('dotenv').config();
   const pool = require('./config/database');
   pool.query('SELECT NOW()', (err, res) => {
     if (err) console.error('Connection failed:', err);
     else console.log('Database connected:', res.rows[0]);
     pool.end();
   });
   "
   ```

## 🧪 Testing the System

### 1. Backend API Tests
```bash
cd backend
node scripts/testNFTSystem.js
```

### 2. Frontend Tests
1. Open http://localhost:3000
2. Register a new user with role "NFT Manager"
3. Navigate to NFT Manager section
4. Try pinning an NFT
5. Try collecting nearby NFTs

### 3. Manual API Testing
```bash
# Test collections endpoint
curl http://localhost:4000/api/nft/collections

# Test nearby NFTs (replace with your coordinates)
curl "http://localhost:4000/api/nft/nearby?latitude=40.7128&longitude=-74.0060&radius=1000"
```

## 🎯 Expected Results

After successful setup, you should have:

1. **Database**: 5 new NFT tables with sample data
2. **Backend**: 17 new API endpoints for NFT management
3. **Frontend**: 3 new React components for NFT functionality
4. **Features**: Location-based NFT pinning, collection, and transfer

## 🚨 Common Issues and Solutions

### Issue: "password authentication failed"
**Solution**: Check database credentials in `.env` file

### Issue: "Cannot find module '../config/database'"
**Solution**: Run migration from the correct directory (`backend/`)

### Issue: "Mapbox token not configured"
**Solution**: Get token from https://account.mapbox.com/ and add to `.env` files

### Issue: "PostGIS extension not found"
**Solution**: Install PostGIS extension in your database

### Issue: "CORS error in frontend"
**Solution**: Check CORS configuration in backend `app.js`

## 📞 Support

If you encounter issues:

1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Ensure PostgreSQL is running and accessible
4. Check that all dependencies are installed
5. Verify Mapbox token is valid and active

## 🎉 Success!

Once everything is working, you'll have a fully functional location-based NFT system with:
- GPS-based NFT pinning and collection
- Rarity system with different requirements
- Comprehensive analytics and reporting
- Interactive map visualization
- User management and role-based access
