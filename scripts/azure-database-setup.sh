#!/bin/bash

# Azure PostgreSQL Database Setup Script for Stellar-GeoLink
# This script sets up the database on your Azure VM

echo "🚀 Setting up Stellar-GeoLink database on Azure PostgreSQL..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL if not already installed
echo "🐘 Installing PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y

# Install PostGIS extension
echo "🗺️ Installing PostGIS..."
sudo apt install postgis postgresql-14-postgis-3 -y

# Start and enable PostgreSQL service
echo "🔄 Starting PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Switch to postgres user and create database
echo "🔧 Creating GeoLink database..."
sudo -u postgres psql -c "CREATE DATABASE geolink;"
sudo -u postgres psql -c "CREATE USER geolink_user WITH PASSWORD '[REDACTED]!';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;"

# Enable PostGIS extension
echo "🗺️ Enabling PostGIS extension..."
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Configure PostgreSQL for remote connections
echo "🔧 Configuring PostgreSQL for remote connections..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/14/main/postgresql.conf

# Update pg_hba.conf for remote connections
echo "🔐 Configuring authentication..."
echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a /etc/postgresql/14/main/pg_hba.conf

# Restart PostgreSQL
echo "🔄 Restarting PostgreSQL..."
sudo systemctl restart postgresql

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 5432/tcp
sudo ufw --force enable

echo "✅ Database setup completed!"
echo "📋 Connection details:"
echo "   Host: $(curl -s ifconfig.me)"
echo "   Port: 5432"
echo "   Database: geolink"
echo "   Username: geolink_user"
echo "   Password: [REDACTED]!"
echo ""
echo "🔧 Next steps:"
echo "1. Run the schema setup: sudo -u postgres psql -d geolink -f /path/to/schema.sql"
echo "2. Test connection from your local machine"
echo "3. Update your .env file with the Azure database credentials"
