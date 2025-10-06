# Environment Configuration Guide

This guide explains how to manage different environments (development and production) for your Stellar-GeoLink application.

## 📁 Environment Files Structure

```
Stellar-GeoLink/
├── env.development          # Development environment (local database)
├── env.production           # Production environment (Azure database)
├── backend/
│   ├── config/
│   │   ├── envLoader.js     # Environment loader
│   │   └── database.js      # Updated database config
│   └── scripts/
│       └── switch-env.js    # Environment switcher
└── frontend/
    ├── env.development      # Frontend development config
    └── env.production       # Frontend production config
```

## 🔧 How It Works

### Automatic Environment Detection
The application automatically detects the environment based on `NODE_ENV`:
- `NODE_ENV=development` → Uses `env.development`
- `NODE_ENV=production` → Uses `env.production`

### Database Configuration
- **Development**: Connects to local PostgreSQL
- **Production**: Connects to Azure PostgreSQL (20.253.209.97)

## 🚀 Usage Examples

### Development Mode (Local Database)
```bash
# Switch to development environment
npm run switch:dev

# Start development server with local database
npm run dev:local

# Or manually set environment
NODE_ENV=development npm run dev
```

### Development Mode (Azure Database)
```bash
# Switch to production environment but run in development mode
npm run dev:azure

# This uses Azure database but runs in development mode
```

### Production Mode (Azure Database)
```bash
# Switch to production environment
npm run switch:prod

# Start production server
npm run prod:azure

# Or manually set environment
NODE_ENV=production npm start
```

## 📋 Environment Variables

### Development Environment (`env.development`)
```env
NODE_ENV=development
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=GeoLink
DB_USER=postgres
DB_PASSWORD=your_local_password
DB_SSL=false
```

### Production Environment (`env.production`)
```env
NODE_ENV=production
PORT=8080
DB_HOST=20.253.209.97
DB_PORT=5432
DB_NAME=GeoLink
DB_USER=geolink_user
DB_PASSWORD=StellarGeoLink2024
DB_SSL=false
```

## 🛠️ Setup Instructions

### 1. Configure Your Local Database
1. Install PostgreSQL locally
2. Create a local `GeoLink` database
3. Update `env.development` with your local database credentials

### 2. Configure Azure Database
The Azure database is already configured:
- Host: `20.253.209.97`
- Database: `GeoLink`
- User: `geolink_user`
- Password: `StellarGeoLink2024`

### 3. Update Environment Files
1. **Backend**: Update `env.development` and `env.production` with your actual values
2. **Frontend**: Update `frontend/env.development` and `frontend/env.production`

## 🔄 Environment Switching

### Manual Switching
```bash
# Copy development environment to .env
cp env.development .env

# Copy production environment to .env
cp env.production .env
```

### Using Scripts
```bash
# Switch to development
npm run switch:dev

# Switch to production
npm run switch:prod
```

## 🧪 Testing Different Environments

### Test Development Environment
```bash
# Switch to development
npm run switch:dev

# Test database connection
node test-db-connection.js

# Start development server
npm run dev
```

### Test Production Environment
```bash
# Switch to production
npm run switch:prod

# Test database connection
node test-db-connection.js

# Start production server
npm run prod
```

## 📱 Frontend Environment

The frontend also supports environment-specific configuration:

### Development Frontend
```bash
cd frontend
cp env.development .env
npm start
```

### Production Frontend
```bash
cd frontend
cp env.production .env
npm run build
```

## 🔒 Security Notes

1. **Never commit `.env` files** - They contain sensitive information
2. **Use different secrets** for development and production
3. **Update passwords** before deploying to production
4. **Use environment variables** in Azure Web App settings

## 🚀 Deployment

### Azure Web App Deployment
1. Set environment variables in Azure Web App settings
2. Use `NODE_ENV=production`
3. The application will automatically use the Azure database

### Local Development
1. Use `NODE_ENV=development`
2. The application will automatically use the local database

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test database connection
node test-db-connection.js

# Check environment variables
node -e "console.log(process.env.DB_HOST)"
```

### Environment Not Loading
```bash
# Check if environment file exists
ls -la env.*

# Check current environment
echo $NODE_ENV
```

### Wrong Database Connection
1. Check your `.env` file
2. Verify environment variables
3. Restart the application

## 📋 Quick Commands

```bash
# Development with local database
npm run dev:local

# Development with Azure database
npm run dev:azure

# Production with Azure database
npm run prod:azure

# Switch environments
npm run switch:dev
npm run switch:prod

# Test database connection
node test-db-connection.js
```

## 🎯 Best Practices

1. **Always use environment variables** for configuration
2. **Test both environments** before deploying
3. **Keep secrets** out of your code repository
4. **Use different databases** for development and production
5. **Document your environment setup** for your team

This setup gives you complete flexibility to work with both local and Azure databases seamlessly!
