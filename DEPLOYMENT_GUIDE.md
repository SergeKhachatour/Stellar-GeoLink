# 🚀 Deployment Guide - AI Integration & Wallet Auto-Connect

## Overview

This guide covers:
1. Committing and pushing the new AI integration and wallet auto-connect features
2. Setting up environment variables in Azure Web App
3. What needs to be configured for GitHub Actions (if applicable)

---

## 📦 Step 1: Commit and Push Changes

### Files to Commit

**New Files:**
- `AI_INTEGRATION_GUIDE.md` - Documentation
- `backend/routes/ai.js` - AI chat endpoints
- `backend/services/azureOpenAIService.js` - Azure OpenAI service
- `backend/services/geolinkOperations.js` - GeoLink operations for AI
- `backend/services/stellarOperations.js` - Stellar operations service
- `frontend/src/components/AI/` - AI chat components
- `frontend/src/components/Wallet/WalletConnectionGuard.js` - Wallet guard component
- `frontend/src/contexts/AIMapContext.js` - AI map context

**Modified Files:**
- All dashboard components (Admin, DataConsumer, WalletProvider) - Added wallet auto-connect
- `backend/app.js` - Added AI routes
- `backend/package.json` - Added new dependencies
- `frontend/src/App.js` - Added AIMapProvider
- Various other files for AI integration

### Git Commands

```bash
# Navigate to project root
cd C:\Users\serge\OneDrive\Desktop\NodeJS\Stellar-GeoLink

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add Azure OpenAI AI integration and wallet auto-connect

- Integrated Azure OpenAI with custom functions for Stellar operations
- Added AI chat component accessible from home page and dashboards
- Implemented wallet auto-connect for all dashboard roles
- Added GeoLink operations as AI tools (NFTs, geospatial, analytics)
- Renamed AI assistant from 'TML Assistant' to 'GeoLink Agent'
- Added dynamic map rendering based on AI responses
- Enhanced chat UI with Markdown rendering and memory box"

# Push to remote
git push origin main
```

**Note:** The `backend/.env` file should NOT be committed (it's in `.gitignore`). Environment variables will be set in Azure Portal.

---

## 🔐 Step 2: Environment Variables Setup

### Azure Web App Configuration

**You MUST set these environment variables in Azure Portal** (not GitHub Actions for backend variables):

1. **Go to Azure Portal** → Your Web App → **Configuration** → **Application settings**

2. **Add/Update the following environment variables:**

#### Azure OpenAI Configuration (NEW)
```
AZURE_OPENAI_RESOURCE=8063b3a2-c0f6-4e47-b1ae-fc051018de2e
AZURE_OPENAI_MODEL=TextMelater
AZURE_OPENAI_KEY=your_azure_openai_key_here
AZURE_OPENAI_MODEL_NAME=gpt-4o
AZURE_OPENAI_TEMPERATURE=0
AZURE_OPENAI_TOP_P=1.0
AZURE_OPENAI_MAX_TOKENS=1000
AZURE_OPENAI_STOP_SEQUENCE=
AZURE_OPENAI_PREVIEW_API_VERSION=2024-08-01-preview
AZURE_OPENAI_ENDPOINT=https://tml.openai.azure.com
AZURE_OPENAI_SYSTEM_MESSAGE=You are GeoLink Agent, an AI assistant for the Stellar GeoLink platform. GeoLink is a location-based blockchain platform that combines Stellar blockchain operations with geospatial data and location-based NFTs.
AZURE_OPENAI_TOOL_CHOICE=auto
```

#### Stellar Network Configuration (NEW)
```
STELLAR_SERVER_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK=TESTNET
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org:443
```

#### Existing Variables (Verify these are set)
```
NODE_ENV=production
PORT=8080
DB_HOST=[YOUR_DB_HOST]
DB_PORT=5432
DB_NAME=[YOUR_DB_NAME]
DB_USER=[YOUR_DB_USER]
DB_PASSWORD=[YOUR_DB_PASSWORD]
DB_SSL=true
JWT_SECRET=[YOUR_JWT_SECRET]
MAPBOX_TOKEN=[YOUR_MAPBOX_TOKEN]
REACT_APP_MAPBOX_TOKEN=[YOUR_MAPBOX_TOKEN]
API_BASE_URL=[YOUR_API_URL]
FRONTEND_URL=[YOUR_FRONTEND_URL]
```

3. **Click "Save"** - Azure will automatically restart your app

---

## 🔄 Step 3: GitHub Actions (Frontend Build)

If you have GitHub Actions set up for automatic deployment:

### Frontend Environment Variables (GitHub Secrets)

**Go to:** GitHub Repository → Settings → Secrets and variables → Actions

**Add/Verify these secrets** (if not already set):
- `REACT_APP_MAPBOX_TOKEN` - Your Mapbox token

**Note:** Backend environment variables (Azure OpenAI, Stellar) are **NOT** set in GitHub Secrets. They are set in Azure Portal because:
- Backend variables are read at **runtime** (when the app runs)
- Frontend variables are read at **build time** (when React builds the app)
- Azure Portal is the correct place for runtime backend configuration

---

## ✅ Step 4: Verify Deployment

After pushing and setting environment variables:

1. **Check GitHub Actions** (if applicable):
   - Go to Actions tab in your repository
   - Verify the deployment workflow completed successfully

2. **Check Azure Portal**:
   - Go to your Web App → Deployment Center
   - Verify the latest deployment is active

3. **Test the Application**:
   - Visit your home page - AI chat should appear in bottom right
   - Log in to any dashboard - wallet should auto-connect
   - Try asking the AI: "Find nearby wallets" or "Show me nearby NFTs"

---

## 🔍 Troubleshooting

### AI Chat Not Working

1. **Check Azure Portal** - Verify all Azure OpenAI environment variables are set
2. **Check Backend Logs** - Go to Azure Portal → Log stream
3. **Verify API Key** - Make sure `AZURE_OPENAI_KEY` is correct
4. **Check Endpoint** - Verify `AZURE_OPENAI_ENDPOINT` matches your Azure OpenAI resource

### Wallet Not Auto-Connecting

1. **Check Browser Console** - Look for JavaScript errors
2. **Verify User Has Public Key** - User must have a `public_key` in their profile
3. **Check Network Tab** - Verify API calls are succeeding
4. **Clear Browser Cache** - Sometimes cached state causes issues

### Environment Variables Not Loading

1. **Restart Azure Web App** - After setting variables, restart the app
2. **Check Variable Names** - Ensure exact spelling (case-sensitive)
3. **Verify No Spaces** - Environment variable values shouldn't have leading/trailing spaces
4. **Check Backend Logs** - Look for "Azure OpenAI configuration missing" errors

---

## 📋 Quick Checklist

- [ ] All code changes committed
- [ ] Changes pushed to GitHub
- [ ] Azure OpenAI environment variables set in Azure Portal
- [ ] Stellar network environment variables set in Azure Portal
- [ ] Existing environment variables verified
- [ ] Azure Web App restarted after setting variables
- [ ] GitHub Actions deployment completed (if applicable)
- [ ] AI chat tested on home page
- [ ] Wallet auto-connect tested on all dashboards
- [ ] Backend logs checked for errors

---

## 🔒 Security Notes

1. **Never commit `.env` files** - They contain sensitive API keys
2. **Use Azure Portal** for backend secrets - More secure than GitHub Secrets for runtime vars
3. **Rotate API keys regularly** - Especially for production
4. **Monitor usage** - Check Azure OpenAI usage in Azure Portal
5. **Set up alerts** - Configure alerts for high API usage

---

## 📚 Additional Resources

- **AI Integration Guide**: See `AI_INTEGRATION_GUIDE.md`
- **GitHub Secrets Setup**: See `GITHUB_SECRETS_SETUP.md`
- **Azure Setup Guide**: See `scripts/azure-setup-guide.md`

---

## 🎉 Success Indicators

After successful deployment, you should see:

- ✅ AI chat icon appears on home page
- ✅ Wallet automatically connects when logging into dashboards
- ✅ AI can answer questions about Stellar and GeoLink
- ✅ AI can perform Stellar operations (create account, transfer assets, etc.)
- ✅ AI can find nearby wallets and NFTs
- ✅ Maps appear when AI provides location-based responses
- ✅ No errors in browser console or Azure logs

