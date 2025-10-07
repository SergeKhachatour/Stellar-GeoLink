#!/bin/bash

# Fix Azure Web App startup by setting environment variables
echo "Setting Azure Web App startup configuration..."

# Set the startup command via environment variables
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n '[YOUR_AZURE_CREDENTIALS]' | base64)" \
  -d '{"WEBSITE_NODE_DEFAULT_VERSION": "18.17.0", "WEBSITE_RUN_FROM_PACKAGE": "1"}' \
  https://[YOUR_AZURE_WEBAPP].scm.westus-01.azurewebsites.net/api/settings

echo "Environment variables set for Node.js startup"
echo "Please restart the Azure Web App for changes to take effect"
