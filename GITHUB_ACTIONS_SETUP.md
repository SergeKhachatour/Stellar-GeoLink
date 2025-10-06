# 🚀 GitHub Actions Setup for Azure Deployment

## 📋 **Step-by-Step Setup Guide**

### **Step 1: Get Azure Web App Publish Profile**

1. **Go to Azure Portal** → Your GeoLink Web App
2. **Click "Get publish profile"** (download button in the top toolbar)
3. **Save the file** as `GeoLink.PublishSettings`

### **Step 2: Add GitHub Secrets**

1. **Go to your GitHub repository**
2. **Click "Settings"** (in the repository menu)
3. **Click "Secrets and variables"** → **"Actions"**
4. **Click "New repository secret"**

#### **Add these secrets:**

**Secret 1:**
- **Name**: `AZURE_WEBAPP_PUBLISH_PROFILE`
- **Value**: Copy the entire content of your `GeoLink.PublishSettings` file

**Secret 2:**
- **Name**: `DB_PASSWORD`
- **Value**: `StellarGeoLink2024`

**Secret 3:**
- **Name**: `JWT_SECRET`
- **Value**: Your production JWT secret (generate a strong one)

### **Step 3: Push to GitHub**

```bash
# Add the GitHub Actions workflow
git add .github/workflows/azure-deploy.yml
git commit -m "Add GitHub Actions workflow for Azure deployment"
git push origin main
```

### **Step 4: Monitor Deployment**

1. **Go to your GitHub repository**
2. **Click "Actions"** tab
3. **Watch the deployment workflow** run
4. **Check for any errors** in the logs

### **Step 5: Test Your Deployment**

Once the workflow completes successfully:

1. **Visit your Web App**: `https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net`
2. **Check API docs**: `https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api-docs`
3. **Test database connection** through the API

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Publish Profile Error**: Make sure you copied the entire file content
2. **Build Failures**: Check Node.js version compatibility
3. **Deployment Timeout**: Azure Web App might need a few minutes to start

### **Debug Steps:**

1. **Check GitHub Actions logs** for specific error messages
2. **Verify Azure Web App is running** in Azure Portal
3. **Check Application Settings** in Azure Portal
4. **Review deployment logs** in Azure Web App

## 🎯 **What This Workflow Does:**

1. **Triggers** on push to main branch
2. **Installs** Node.js 22 and dependencies
3. **Builds** the frontend React app
4. **Creates** a deployment package
5. **Deploys** to Azure Web App
6. **Configures** environment variables

## 🚀 **Ready to Deploy!**

Once you've added the GitHub secrets and pushed the code, your application will automatically deploy to Azure every time you push to the main branch!
