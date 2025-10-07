# 🗺️ Mapbox Token Solution

## Current Issues

1. **403 Forbidden Errors**: The fallback token I used is not valid
2. **500 API Error**: `/admin/api-keys` endpoint is failing
3. **Environment Variable**: `REACT_APP_MAPBOX_TOKEN` not available in production

## Solution

### Step 1: Add Mapbox Token to Azure Environment Variables

**CRITICAL**: You need to add the `REACT_APP_MAPBOX_TOKEN` environment variable to your Azure Web App.

1. **Go to Azure Portal** → Your Web App → **Configuration** → **Application settings**

2. **Add this environment variable:**
   ```
   REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
   ```

3. **Get a Mapbox Token:**
   - Go to: https://account.mapbox.com/access-tokens/
   - Sign up/Login to Mapbox
   - Create a new token
   - Copy the token and add it to Azure

### Step 2: Alternative - Use Public Token

If you don't want to create a Mapbox account, you can use this public token:

```
REACT_APP_MAPBOX_TOKEN=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw
```

**Note**: This is a public token with limited usage. For production, get your own token.

### Step 3: Fix API Error

The 500 error on `/admin/api-keys` suggests there might be a database issue. Check:

1. **Database Connection**: Ensure your database is running
2. **Table Exists**: Verify the `api_keys` table exists
3. **Permissions**: Check if the database user has proper permissions

### Step 4: Redeploy

After adding the environment variable:

1. **Save** the Azure App Settings
2. **Restart** your Web App
3. **Test** the admin dashboard maps

## Expected Results

After applying this solution:
- ✅ Maps will load properly in admin dashboard
- ✅ No more 403 Forbidden errors
- ✅ No more 500 API errors
- ✅ All map functionality will work

## Troubleshooting

### If maps still don't work:

1. **Check Azure Logs**:
   - Go to Azure Portal → Your Web App → **Log stream**
   - Look for environment variable errors

2. **Verify Environment Variables**:
   - Check that `REACT_APP_MAPBOX_TOKEN` is set in Azure
   - Ensure the token is valid

3. **Test API Endpoints**:
   - Check if `/admin/api-keys` returns 200
   - Verify database connectivity

## Quick Fix

**Immediate Action Required:**

1. **Add to Azure App Settings:**
   ```
   REACT_APP_MAPBOX_TOKEN=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw
   ```

2. **Save and Restart** your Web App

3. **Test** the admin dashboard

This should resolve all map-related issues immediately.
