#!/bin/bash

# Set Azure Web App startup command
echo "Setting startup command for Azure Web App..."

# Set the startup command using Azure CLI
az webapp config set \
  --resource-group "your-resource-group" \
  --name "geolink-buavavc6gse5c9fw" \
  --startup-file "npm start"

echo "Startup command set to 'npm start'"
echo "The app should now start properly on the next deployment."
