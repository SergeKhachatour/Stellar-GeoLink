#!/bin/bash

# Script to connect to Azure VM and set up Stellar-GeoLink
# Run this from your local machine

echo "🚀 Connecting to Azure VM and setting up Stellar-GeoLink..."

# Azure VM details
VM_USER="Serge369x33"
VM_IP="20.253.209.97"

echo "📋 Azure VM Details:"
echo "   User: $VM_USER"
echo "   IP: $VM_IP"
echo ""

echo "🔧 Step 1: Upload setup scripts to Azure VM"
echo "Run these commands to upload the setup scripts:"
echo ""
echo "scp scripts/complete-azure-setup.sh $VM_USER@$VM_IP:~/"
echo "scp scripts/azure-database-schema-setup.sql $VM_USER@$VM_IP:~/"
echo "scp database/schema.sql $VM_USER@$VM_IP:~/"
echo ""

echo "🔧 Step 2: Connect to Azure VM"
echo "Run this command to connect:"
echo ""
echo "ssh $VM_USER@$VM_IP"
echo ""

echo "🔧 Step 3: Run the complete setup script"
echo "Once connected to the VM, run:"
echo ""
echo "chmod +x complete-azure-setup.sh"
echo "./complete-azure-setup.sh"
echo ""

echo "🔧 Step 4: Set up Azure PostgreSQL database"
echo "After the VM setup is complete, you'll need to:"
echo "1. Create an Azure PostgreSQL server"
echo "2. Configure firewall rules"
echo "3. Run the database schema on Azure PostgreSQL"
echo ""

echo "📋 Manual steps to complete:"
echo "1. SSH into your Azure VM: ssh $VM_USER@$VM_IP"
echo "2. Upload the setup scripts using scp"
echo "3. Run the complete setup script"
echo "4. Create Azure PostgreSQL server in Azure Portal"
echo "5. Configure your application to use Azure PostgreSQL"
echo "6. Deploy your application to Azure Web App"
echo ""

echo "🔗 Useful Azure Portal links:"
echo "- Create PostgreSQL: https://portal.azure.com/#create/Microsoft.PostgreSQLFlexibleServer"
echo "- Create Web App: https://portal.azure.com/#create/Microsoft.WebApp"
echo "- Resource Groups: https://portal.azure.com/#view/Microsoft_Azure_Resources/ResourceGroupMenuBlade/~/overview"
echo ""

echo "📖 For detailed instructions, see: scripts/azure-setup-guide.md"
echo ""

read -p "Press Enter to continue with the setup process..."
