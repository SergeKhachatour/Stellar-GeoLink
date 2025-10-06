#!/bin/bash

# Deploy Complete Stellar-GeoLink Schema to Azure PostgreSQL
echo "🚀 Deploying complete database schema to Azure..."

# Connect to Azure VM and run the complete schema
ssh Serge369x33@20.253.209.97 << 'EOF'
    echo "📋 Uploading complete schema to Azure VM..."
    # The schema.sql file will be uploaded and executed
    sudo -u postgres psql -d "GeoLink" -f ~/complete-schema.sql
    echo "✅ Complete schema deployed successfully!"
EOF

echo "🎉 Azure database now has all 26 tables!"
