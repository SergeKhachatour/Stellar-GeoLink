# 🔐 GitHub Secrets Setup Guide

## The Problem

Your maps aren't working because **React environment variables need to be available at build time**, not just runtime. The GitHub Actions workflow builds your frontend, but it doesn't have access to the `REACT_APP_MAPBOX_TOKEN`.

## The Solution

You need to add the Mapbox token as a **GitHub Secret** so it's available during the build process.

## Step-by-Step Instructions

### 1. Go to GitHub Repository Settings

1. **Navigate to your repository**: https://github.com/SergeKhachatour/Stellar-GeoLink
2. **Click on "Settings"** (top menu bar)
3. **Click on "Secrets and variables"** (left sidebar)
4. **Click on "Actions"** (under Secrets and variables)

### 2. Add the Mapbox Token Secret

1. **Click "New repository secret"**
2. **Name**: `REACT_APP_MAPBOX_TOKEN`
3. **Secret**: `[YOUR_MAPBOX_TOKEN_HERE]` - Use the token you set in Azure
4. **Click "Add secret"**

### 3. Verify the Secret

You should now see `REACT_APP_MAPBOX_TOKEN` in your secrets list.

## What This Fixes

- ✅ **Maps will work** in NFT Dashboard
- ✅ **Maps will work** in Admin Dashboard  
- ✅ **Maps will work** in Wallet Provider Dashboard
- ✅ **Maps will work** in Data Consumer Dashboard
- ✅ **No more "REACT_APP_MAPBOX_TOKEN is not set" errors**

## How It Works

1. **GitHub Actions** builds your frontend with the secret available
2. **React** embeds the token into the built JavaScript files
3. **Azure** serves the pre-built files with the token included
4. **Maps** work because the token is available in the browser

## Alternative: Get Your Own Mapbox Token

If you want to use your own Mapbox token:

1. **Go to**: https://account.mapbox.com/access-tokens/
2. **Sign up/Login** to Mapbox
3. **Create a new token**
4. **Copy the token** and use it in both Azure and GitHub secrets

## After Adding the Secret

1. **Commit and push** this workflow change
2. **GitHub Actions will automatically trigger** a new deployment
3. **Wait for deployment to complete** (check the Actions tab)
4. **Test your maps** - they should work now!

## Troubleshooting

### If maps still don't work:

1. **Check GitHub Actions logs**:
   - Go to Actions tab in your repository
   - Click on the latest workflow run
   - Look for any errors in the build step

2. **Verify the secret is set**:
   - Go to Settings → Secrets and variables → Actions
   - Make sure `REACT_APP_MAPBOX_TOKEN` is listed

3. **Check the build output**:
   - Look for "REACT_APP_MAPBOX_TOKEN" in the build logs
   - It should show the token is being used

## Expected Result

After adding the GitHub secret and deploying:
- ✅ All maps will load properly
- ✅ No more environment variable errors
- ✅ NFT Dashboard maps will work
- ✅ Admin Dashboard maps will work
- ✅ All map functionality will be available

## Security Note

- **Never commit API keys to your repository**
- **Use GitHub Secrets for sensitive data**
- **Consider getting your own Mapbox account for production use**
- **The token should be the same in both Azure and GitHub secrets**
