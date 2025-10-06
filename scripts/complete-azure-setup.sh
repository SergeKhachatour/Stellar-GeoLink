#!/bin/bash

# Complete Azure Setup Script for Stellar-GeoLink
# This script sets up everything needed for Azure deployment

echo "🚀 Starting complete Azure setup for Stellar-GeoLink..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root"
    exit 1
fi

print_header "Azure VM Setup for Stellar-GeoLink"

# Step 1: Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install PostgreSQL and PostGIS
print_status "Installing PostgreSQL and PostGIS..."
sudo apt install postgresql postgresql-contrib postgis postgresql-14-postgis-3 postgresql-client -y

# Step 3: Start and enable PostgreSQL
print_status "Starting PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Step 4: Configure PostgreSQL for remote connections
print_status "Configuring PostgreSQL for remote connections..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/14/main/postgresql.conf

# Step 5: Configure authentication
print_status "Configuring PostgreSQL authentication..."
echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a /etc/postgresql/14/main/pg_hba.conf

# Step 6: Restart PostgreSQL
print_status "Restarting PostgreSQL..."
sudo systemctl restart postgresql

# Step 7: Configure firewall
print_status "Configuring firewall..."
sudo ufw allow 5432/tcp
sudo ufw --force enable

# Step 8: Create database and user
print_status "Creating database and user..."
sudo -u postgres psql -c "CREATE DATABASE geolink;"
sudo -u postgres psql -c "CREATE USER geolink_user WITH PASSWORD 'StellarGeoLink2024!';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;"

# Step 9: Enable PostGIS extension
print_status "Enabling PostGIS extension..."
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql -d geolink -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Step 10: Install Node.js
print_status "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y

# Step 11: Install Azure CLI
print_status "Installing Azure CLI..."
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Step 12: Install Git
print_status "Installing Git..."
sudo apt install git -y

# Step 13: Create application directory
print_status "Creating application directory..."
mkdir -p /home/$USER/stellar-geolink
cd /home/$USER/stellar-geolink

# Step 14: Clone repository (if not already present)
if [ ! -d ".git" ]; then
    print_status "Cloning repository..."
    git clone https://github.com/your-username/Stellar-GeoLink.git .
fi

# Step 15: Install dependencies
print_status "Installing Node.js dependencies..."
cd backend
npm install
cd ../frontend
npm install
cd ..

# Step 16: Build frontend
print_status "Building frontend..."
cd frontend
npm run build
cd ..

# Step 17: Create production environment file
print_status "Creating production environment configuration..."
cat > .env.production << EOF
# Production Environment Configuration
NODE_ENV=production
PORT=8080

# Azure PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geolink
DB_USER=geolink_user
DB_PASSWORD=StellarGeoLink2024!
DB_SSL=false

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-for-production

# Mapbox Configuration
MAPBOX_TOKEN=your-mapbox-token

# Redis Configuration (if using)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_SSL=false

# Email Configuration
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@stellargeolink.com

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=your-stellar-secret-key
EOF

# Step 18: Run database migration
print_status "Running database migration..."
cd backend
node scripts/runNFTMigration.js
cd ..

# Step 19: Test database connection
print_status "Testing database connection..."
cd backend
node -e "
const pool = require('./config/database');
pool.query('SELECT PostGIS_Version()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully!');
    console.log('PostGIS Version:', res.rows[0].postgis_version);
    pool.end();
  }
});
"
cd ..

# Step 20: Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/stellar-geolink.service > /dev/null << EOF
[Unit]
Description=Stellar-GeoLink Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/stellar-geolink
Environment=NODE_ENV=production
ExecStart=/usr/bin/node backend/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Step 21: Enable and start service
print_status "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable stellar-geolink
sudo systemctl start stellar-geolink

# Step 22: Install PM2 for process management (alternative to systemd)
print_status "Installing PM2 for process management..."
sudo npm install -g pm2

# Step 23: Create PM2 ecosystem file
print_status "Creating PM2 ecosystem file..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'stellar-geolink',
    script: 'backend/app.js',
    cwd: '/home/$USER/stellar-geolink',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    }
  }]
};
EOF

# Step 24: Start with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Step 25: Install Nginx for reverse proxy
print_status "Installing and configuring Nginx..."
sudo apt install nginx -y

# Step 26: Configure Nginx
print_status "Configuring Nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/stellar-geolink > /dev/null << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Step 27: Enable Nginx site
print_status "Enabling Nginx site..."
sudo ln -s /etc/nginx/sites-available/stellar-geolink /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Step 28: Configure firewall for web traffic
print_status "Configuring firewall for web traffic..."
sudo ufw allow 'Nginx Full'
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Step 29: Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

print_header "Setup Complete!"
print_status "Your Stellar-GeoLink application is now running!"
print_status "Public IP: $PUBLIC_IP"
print_status "Application URL: http://$PUBLIC_IP"
print_status "Database: PostgreSQL with PostGIS enabled"
print_status "Process Manager: PM2"
print_status "Web Server: Nginx"

print_header "Next Steps"
echo "1. Update your Azure PostgreSQL server with the database schema"
echo "2. Configure your Azure Web App with the correct environment variables"
echo "3. Set up GitHub Actions for automated deployment"
echo "4. Configure SSL certificate for HTTPS"

print_header "Useful Commands"
echo "Check application status: pm2 status"
echo "View application logs: pm2 logs stellar-geolink"
echo "Restart application: pm2 restart stellar-geolink"
echo "Check database: psql -h localhost -U geolink_user -d geolink"
echo "Check Nginx status: sudo systemctl status nginx"

print_header "Database Connection Details"
echo "Host: localhost (or your Azure PostgreSQL server)"
echo "Port: 5432"
echo "Database: geolink"
echo "Username: geolink_user"
echo "Password: StellarGeoLink2024!"

print_warning "Remember to:"
echo "1. Change default passwords"
echo "2. Configure SSL certificates"
echo "3. Set up monitoring and logging"
echo "4. Configure backup strategies"
echo "5. Update firewall rules for production"

print_status "Setup completed successfully! 🎉"
