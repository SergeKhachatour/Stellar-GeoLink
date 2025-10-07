# 🚀 Deployment Guide

## Azure Web App Deployment

### Current Deployment Status
✅ **Azure Web App Deployment**: Successfully deployed to Azure with complete database schema  
✅ **GitHub Actions CI/CD**: Automated deployment pipeline configured  
✅ **PostgreSQL with PostGIS**: Full spatial database with 26+ tables deployed  
✅ **ESLint Issues Resolved**: Frontend build optimized for production  
✅ **GitHub Secrets Configured**: Publish profile authentication set up  

### Production URL
- **Application**: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net
- **API Documentation**: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api-docs

## Deployment Process

### Automatic Deployment
1. Code is automatically deployed via GitHub Actions when changes are pushed to main branch
2. Frontend and backend are built and deployed to Azure Web Apps
3. Database schema is automatically applied during deployment
4. Environment variables are configured through Azure App Settings

### Manual Deployment
If you need to manually trigger deployment:

1. **Go to GitHub Actions**
   - Navigate to the Actions tab in your repository
   - Find the deployment workflow
   - Click "Run workflow" to trigger manual deployment

2. **Check Deployment Status**
   - Monitor the workflow progress
   - Check for any build errors
   - Verify successful deployment

## Database Schema Deployment

### Current Database Status
The Azure PostgreSQL database includes the complete schema with 26+ tables:

#### Core Tables
- ✅ users
- ✅ wallet_types  
- ✅ wallet_locations
- ✅ refresh_tokens
- ✅ wallet_providers
- ✅ data_consumers
- ✅ user_sessions

#### API Management
- ✅ api_key_requests
- ✅ api_usage_logs
- ✅ api_keys
- ✅ rate_limits

#### Location & Tracking
- ✅ wallet_location_history
- ✅ location_events
- ✅ location_verifications

#### Geofencing & Alerts
- ✅ geofences
- ✅ notification_preferences
- ✅ alert_preferences
- ✅ alert_history

#### NFT System
- ✅ nft_collections
- ✅ pinned_nfts
- ✅ user_nft_ownership
- ✅ nft_transfers

#### Privacy & Settings
- ✅ user_privacy_settings
- ✅ user_visibility_settings
- ✅ webhook_configurations

### Schema Deployment Scripts
- `scripts/azure-database-schema-setup.sql` - Complete schema deployment
- `scripts/azure-setup-guide.md` - Step-by-step setup instructions
- `scripts/complete-azure-setup.sh` - Automated setup script

## Troubleshooting Deployment Issues

### Frontend Build Failures

#### Issue: Missing NFT Components
If the frontend build fails due to missing NFT components:

**Solution**: Temporarily disable NFT-related imports in `frontend/src/App.js`:

```javascript
// Find this line (around line 22):
import NFTDashboard from './components/NFT/NFTDashboard';

// Replace with:
// import NFTDashboard from './components/NFT/NFTDashboard'; // Temporarily disabled
```

**Also comment out the NFT route:**
```javascript
// Find this section (around lines 53-60):
<Route 
    path="/dashboard/nft" 
    element={
        <ProtectedRoute roles={['nft_manager']}>
            <NFTDashboard />
        </ProtectedRoute>
    } 
/>

// Replace with:
{/* <Route 
    path="/dashboard/nft" 
    element={
        <ProtectedRoute roles={['nft_manager']}>
            <NFTDashboard />
        </ProtectedRoute>
    } 
/> */}
```

### Database Connection Issues

#### Issue: Database Schema Mismatch
If you encounter database errors due to missing tables:

**Solution**: Deploy the complete schema to Azure PostgreSQL:

1. **Connect to Azure Database**:
   ```bash
   # Use the SSH script to connect
   ./scripts/sshToAzure.js
   ```

2. **Run Schema Deployment**:
   ```bash
   # Deploy complete schema
   ./scripts/deploy-azure-schema.sh
   ```

3. **Verify Schema**:
   ```bash
   # Check database status
   ./scripts/checkAzureDatabase.js
   ```

### Environment Variables

#### Required Azure App Settings
Ensure these environment variables are configured in Azure:

```bash
# Database Configuration
DB_USER=postgres
DB_HOST=your-azure-postgres-host
DB_NAME=GeoLink
DB_PASSWORD=your_secure_database_password
DB_PORT=5432

# JWT Configuration
JWT_SECRET=your_very_secure_jwt_secret_key_here

# Redis Configuration
REDIS_URL=your_azure_redis_connection_string

# Mapbox Configuration
MAPBOX_TOKEN=your_mapbox_token_here

# Admin User
ADMIN_PASSWORD=your_secure_admin_password
```

## Monitoring and Maintenance

### Health Checks
- **Application Health**: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/health
- **Database Status**: Use `scripts/checkAzureDatabase.js`
- **API Status**: Check Swagger docs at `/api-docs`

### Logs and Monitoring
- **Azure Logs**: Available in Azure Portal under App Service logs
- **Application Insights**: Configured for performance monitoring
- **Database Monitoring**: PostgreSQL metrics available in Azure Portal

### Backup and Recovery
- **Database Backups**: Automated daily backups configured
- **Code Backup**: GitHub repository serves as code backup
- **Configuration Backup**: Environment variables documented in this guide

## Security Considerations

### Production Security
- ✅ HTTPS enabled for all connections
- ✅ Database connections use SSL
- ✅ API keys are properly secured
- ✅ Rate limiting configured
- ✅ CORS policies properly set

### Regular Maintenance
- [ ] Monitor application performance
- [ ] Review security logs
- [ ] Update dependencies regularly
- [ ] Backup database regularly
- [ ] Review and rotate API keys

## Support and Troubleshooting

### Common Issues and Solutions

1. **Build Failures**: Check GitHub Actions logs for specific error messages
2. **Database Errors**: Verify schema deployment and connection strings
3. **API Issues**: Check Swagger documentation and test endpoints
4. **Performance Issues**: Monitor Azure metrics and logs

### Getting Help
- **Email**: sergekhachatour@gmail.com
- **GitHub Issues**: Create an issue in the repository
- **Documentation**: Refer to this guide and API documentation

## Quick Fixes

### Emergency Deployment Fix
If deployment fails and you need a quick fix:

1. **Disable problematic components** (like NFT dashboard)
2. **Commit changes directly to main branch**
3. **Monitor GitHub Actions** for successful deployment
4. **Verify application is running** at the production URL

### Database Emergency Fix
If database issues occur:

1. **Check connection strings** in Azure App Settings
2. **Verify database is running** in Azure Portal
3. **Run diagnostic scripts** to identify issues
4. **Contact support** if issues persist
