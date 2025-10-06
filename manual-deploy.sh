#!/bin/bash

echo "Manual Azure Web App Deployment Script"
echo "====================================="

# Create deployment directory
mkdir -p manual-deploy
cd manual-deploy

# Copy backend files
echo "Copying backend files..."
cp -r ../backend/* .

# Verify package.json exists
echo "Verifying package.json:"
ls -la package.json
cat package.json

# Create zip file
echo "Creating deployment zip..."
zip -r ../manual-deploy.zip *

cd ..

echo "Deployment zip created:"
ls -la manual-deploy.zip

echo ""
echo "Now you can manually upload this zip file to Azure Web App:"
echo "1. Go to Azure Portal -> Your Web App"
echo "2. Go to Deployment Center"
echo "3. Upload the manual-deploy.zip file"
echo "4. Or use the zip deploy API manually"
