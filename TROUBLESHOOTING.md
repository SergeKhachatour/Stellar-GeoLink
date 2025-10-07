# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### Frontend Build Issues

#### Issue: Missing NFT Components
**Symptoms**: Build fails with errors about missing NFT components or imports

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

#### Issue: ESLint Errors
**Symptoms**: Build fails due to ESLint errors

**Solution**: 
1. Check the specific ESLint errors in the build logs
2. Fix formatting issues (missing semicolons, indentation, etc.)
3. Ensure all imports are properly resolved
4. Run `npm run lint` locally to catch issues before deployment

### Database Issues

#### Issue: Database Connection Failed
**Symptoms**: Application can't connect to database, 500 errors

**Solutions**:
1. **Check Environment Variables**:
   ```bash
   # Verify these are set correctly in Azure App Settings
   DB_USER=postgres
   DB_HOST=your-azure-postgres-host
   DB_NAME=GeoLink
   DB_PASSWORD=your_secure_database_password
   DB_PORT=5432
   ```

2. **Test Database Connection**:
   ```bash
   # Run the connection test script
   node scripts/testConnection.js
   ```

3. **Check Database Status**:
   ```bash
   # Check if database is running
   node scripts/checkAzureDatabase.js
   ```

#### Issue: Missing Database Tables
**Symptoms**: Database errors about missing tables, schema mismatch

**Solutions**:
1. **Deploy Complete Schema**:
   ```bash
   # Run the complete schema deployment
   ./scripts/deploy-azure-schema.sh
   ```

2. **Check Schema Status**:
   ```bash
   # Verify all tables exist
   node scripts/checkAndFixSchema.js
   ```

3. **Manual Schema Deployment**:
   ```bash
   # Connect to Azure database and run schema
   ./scripts/sshToAzure.js
   # Then run: psql -f scripts/azure-database-schema-setup.sql
   ```

### API Issues

#### Issue: API Key Not Working
**Symptoms**: 401 Unauthorized errors, API requests failing

**Solutions**:
1. **Check API Key Status**:
   - Log into admin dashboard
   - Check if API key is approved
   - Verify API key is not expired

2. **Test API Key**:
   ```bash
   curl -H "X-API-Key: your_api_key" \
        https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api/location/wallet-locations
   ```

3. **Generate New API Key**:
   - Go to admin dashboard
   - Revoke old API key
   - Generate new API key
   - Update your application with new key

#### Issue: Rate Limiting
**Symptoms**: 429 Too Many Requests errors

**Solutions**:
1. **Check Rate Limits**:
   - Current limits: 60 requests/minute, 5000 requests/day
   - Monitor your usage in the admin dashboard

2. **Implement Backoff Strategy**:
   ```javascript
   // Implement exponential backoff for retries
   const delay = Math.pow(2, retryCount) * 1000;
   setTimeout(() => retryRequest(), delay);
   ```

### Authentication Issues

#### Issue: Login Failures
**Symptoms**: Can't log in, authentication errors

**Solutions**:
1. **Check Admin User**:
   ```bash
   # Verify admin user exists
   node scripts/test-admin-login.js
   ```

2. **Reset Admin Password**:
   ```bash
   # Generate new admin password
   node scripts/reset-admin-password.js
   ```

3. **Check JWT Configuration**:
   - Verify JWT_SECRET is set in environment variables
   - Ensure JWT secret is strong and secure

#### Issue: Session Expired
**Symptoms**: Users getting logged out frequently

**Solutions**:
1. **Check Refresh Token Configuration**:
   - Verify refresh token expiration settings
   - Check if refresh tokens are being stored properly

2. **Clear Browser Data**:
   - Clear cookies and local storage
   - Try logging in again

### Performance Issues

#### Issue: Slow API Responses
**Symptoms**: API requests taking too long to respond

**Solutions**:
1. **Check Database Performance**:
   ```bash
   # Monitor database queries
   node scripts/checkAzureDatabase.js
   ```

2. **Optimize Queries**:
   - Add database indexes for frequently queried fields
   - Use connection pooling
   - Implement query caching

3. **Check Redis Connection**:
   - Verify Redis is running and accessible
   - Check Redis configuration in environment variables

#### Issue: Memory Issues
**Symptoms**: Application crashes, out of memory errors

**Solutions**:
1. **Monitor Memory Usage**:
   - Check Azure App Service metrics
   - Monitor memory consumption patterns

2. **Optimize Code**:
   - Review for memory leaks
   - Implement proper cleanup for event listeners
   - Use streaming for large data operations

### Deployment Issues

#### Issue: GitHub Actions Failing
**Symptoms**: Deployment pipeline failing, build errors

**Solutions**:
1. **Check Build Logs**:
   - Review GitHub Actions logs for specific errors
   - Look for missing dependencies or configuration issues

2. **Verify Secrets**:
   - Check that all required GitHub secrets are configured
   - Verify Azure publish profile is correct

3. **Manual Deployment**:
   - If automated deployment fails, try manual deployment
   - Use Azure CLI or Azure Portal for manual deployment

#### Issue: Environment Variables Not Set
**Symptoms**: Application failing due to missing environment variables

**Solutions**:
1. **Check Azure App Settings**:
   - Verify all required environment variables are set
   - Check variable names and values

2. **Test Environment Variables**:
   ```bash
   # Test if environment variables are accessible
   node scripts/test-env.js
   ```

### Network Issues

#### Issue: CORS Errors
**Symptoms**: Browser blocking requests due to CORS policy

**Solutions**:
1. **Check CORS Configuration**:
   - Verify CORS settings in backend configuration
   - Ensure frontend URL is allowed in CORS policy

2. **Update CORS Settings**:
   ```javascript
   // In backend configuration
   app.use(cors({
     origin: ['http://localhost:3000', 'https://your-frontend-url.com'],
     credentials: true
   }));
   ```

#### Issue: SSL Certificate Issues
**Symptoms**: HTTPS connection errors, certificate warnings

**Solutions**:
1. **Check SSL Configuration**:
   - Verify SSL certificate is valid
   - Check certificate expiration date

2. **Update Certificate**:
   - Renew SSL certificate if expired
   - Configure proper SSL settings in Azure

## Diagnostic Tools

### Database Diagnostics
```bash
# Check database connection
node scripts/testConnection.js

# Check database schema
node scripts/checkAndFixSchema.js

# Diagnose Azure database issues
node scripts/diagnoseAzureDB.js
```

### Application Diagnostics
```bash
# Test admin login
node scripts/test-admin-login.js

# Test API endpoints
node scripts/test-endpoint.js

# Check environment variables
node scripts/test-env.js
```

### Network Diagnostics
```bash
# Test database connection
node scripts/test-db-connection.js

# Test Azure database connection
node scripts/test-azure-db-connection.js
```

## Getting Help

### Before Contacting Support
1. **Check this troubleshooting guide** for common solutions
2. **Review application logs** for specific error messages
3. **Test with diagnostic scripts** to identify the issue
4. **Document the exact error** and steps to reproduce

### Contact Information
- **Email**: sergekhachatour@gmail.com
- **GitHub Issues**: [Create an issue](https://github.com/SergeKhachatour/Stellar-GeoLink/issues)

### When Reporting Issues
Include the following information:
1. **Error message** (exact text)
2. **Steps to reproduce** the issue
3. **Expected behavior** vs actual behavior
4. **Environment details** (browser, OS, etc.)
5. **Log files** if available
6. **Screenshots** if applicable

## Prevention

### Best Practices
1. **Test changes locally** before deploying
2. **Use version control** properly
3. **Monitor application health** regularly
4. **Keep dependencies updated**
5. **Backup database** regularly
6. **Review logs** for potential issues

### Regular Maintenance
- [ ] Check application performance weekly
- [ ] Review security logs monthly
- [ ] Update dependencies quarterly
- [ ] Backup database daily
- [ ] Test disaster recovery procedures annually
