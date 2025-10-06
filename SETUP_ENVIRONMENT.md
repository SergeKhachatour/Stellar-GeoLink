# Environment Variables Setup

## Backend .env Configuration

Add this to your `backend/.env` file:

```env
# Database Configuration (you already have this)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geolink
DB_USER=postgres
DB_PASSWORD=your_actual_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random_123456789

# Mapbox Configuration (FIXED - use MAPBOX_TOKEN not BACKEND_MAPBOX_TOKEN)
MAPBOX_TOKEN=pk.eyJ1Ijoic2VyZ2UzNjl4MzMiLCJhIjoiY20zZHkzb2xoMDA0eTJxcHU4MTNoYjNlaCJ9.Xl6OxzF9td1IgTTeUp526w

# Server Configuration
PORT=4000
NODE_ENV=development
```

## Frontend .env Configuration

Create a `frontend/.env` file with:

```env
# API Configuration
REACT_APP_API_URL=http://localhost:4000/api

# Mapbox Configuration
REACT_APP_MAPBOX_TOKEN=pk.eyJ1Ijoic2VyZ2UzNjl4MzMiLCJhIjoiY20zZHkzb2xoMDA0eTJxcHU4MTNoYjNlaCJ9.Xl6OxzF9td1IgTTeUp526w

# Application Configuration
REACT_APP_NAME=Stellar-GeoLink NFT
REACT_APP_VERSION=1.0.0
```

## Key Changes Made:

1. ✅ **Registration Form**: Added "NFT Manager" role option
2. 🔧 **Mapbox Token**: 
   - Backend: Use `MAPBOX_TOKEN` (not `BACKEND_MAPBOX_TOKEN`)
   - Frontend: Use `REACT_APP_MAPBOX_TOKEN`

## Next Steps:

1. **Update your backend .env** with the correct `MAPBOX_TOKEN` variable name
2. **Create frontend .env** with the `REACT_APP_MAPBOX_TOKEN`
3. **Test the system** by starting both servers

## Test Commands:

```bash
# Start backend
cd backend
npm start

# Start frontend (in another terminal)
cd frontend
npm start

# Test NFT system (in another terminal)
cd backend
node scripts/testNFTSystem.js
```

## What's Fixed:

- ✅ Registration page now includes "NFT Manager" role
- ✅ Mapbox token configuration corrected
- ✅ All NFT tables created and ready
- ✅ 17 new API endpoints available
- ✅ 3 new React components ready
