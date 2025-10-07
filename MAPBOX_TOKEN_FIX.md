# 🗺️ Mapbox Token Fix for Azure Deployment

## Issue
The admin dashboard wallet locations map is showing the error:
```
Error: An API access token is required to use Mapbox GL
```

## Root Cause
The `REACT_APP_MAPBOX_TOKEN` environment variable is not being properly embedded in the production build.

## Solution

### Step 1: Verify Azure Environment Variables

1. **Go to Azure Portal** → Your Web App → **Configuration** → **Application settings**

2. **Ensure these variables are set:**
   ```
   REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
   MAPBOX_TOKEN=your_mapbox_token_here
   ```

### Step 2: Get Your Mapbox Token

If you don't have a Mapbox token:

1. **Go to**: https://account.mapbox.com/access-tokens/
2. **Sign up/Login** to Mapbox
3. **Create a new token** or use the default public token
4. **Copy the token** and add it to Azure

### Step 3: Update Azure App Settings

1. **In Azure Portal**:
   - Go to your Web App
   - Click **Configuration**
   - Click **Application settings**
   - Add/Update: `REACT_APP_MAPBOX_TOKEN` = `your_token_here`
   - Add/Update: `MAPBOX_TOKEN` = `your_token_here`
   - Click **Save**

### Step 4: Redeploy

After updating the environment variables:

1. **Trigger a new deployment** by pushing to your repository
2. **Or restart your Web App** in Azure Portal

### Step 5: Verify the Fix

1. **Check browser console** for the token status
2. **Test the admin dashboard** wallet locations map
3. **Verify maps load properly**

## Alternative: Use Public Mapbox Token

If you don't want to create a Mapbox account, you can use the public token:

```
REACT_APP_MAPBOX_TOKEN=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw
```

**Note**: This is a public token with limited usage. For production, get your own token.

## Troubleshooting

### If the error persists:

1. **Check Azure Logs**:
   - Go to Azure Portal → Your Web App → **Log stream**
   - Look for environment variable errors

2. **Verify Build Process**:
   - Check GitHub Actions logs
   - Ensure environment variables are available during build

3. **Test Locally**:
   ```bash
   # Create .env file in frontend directory
   echo "REACT_APP_MAPBOX_TOKEN=your_token_here" > frontend/.env
   
   # Test locally
   cd frontend
   npm start
   ```

### Common Issues:

- **Token not set**: Environment variable missing in Azure
- **Token invalid**: Wrong token format or expired
- **Build issues**: Environment variable not available during build
- **Caching**: Browser cache might need clearing

## Expected Result

After applying this fix:
- ✅ Maps load properly in admin dashboard
- ✅ No more "API access token required" errors
- ✅ Wallet locations display on map
- ✅ All map functionality works

## Support

If you continue to have issues:
1. Check the browser console for specific error messages
2. Verify the environment variables are set correctly in Azure
3. Test with a fresh browser session (clear cache)
4. Contact support if the issue persists
