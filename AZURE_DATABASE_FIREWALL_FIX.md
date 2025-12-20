# Azure Database Connection Fix

## Problem
The Azure Web App cannot connect to the PostgreSQL database at `20.253.209.97` due to firewall restrictions.

## Solution: Allow Azure Web App Outbound IPs

### Step 1: Find Your Azure Web App's Outbound IPs

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Web App (GeoLink)
3. Go to **Settings** → **Properties**
4. Find **Outbound IP addresses** - Copy all the IP addresses listed

Alternatively, use Azure CLI:
```bash
az webapp show --resource-group <your-resource-group> --name GeoLink --query outboundIpAddresses --output tsv
```

### Step 2: Allow IPs in Database Firewall

Since your database is on an Azure VM (`20.253.209.97`), you need to configure the firewall on that VM:

#### Option A: If using PostgreSQL on Azure VM with firewall (ufw/iptables)

SSH into your VM:
```bash
ssh Serge369x33@20.253.209.97
```

Add firewall rules for each outbound IP:
```bash
# Example - replace with your actual outbound IPs
sudo ufw allow from <OUTBOUND_IP_1> to any port 5432
sudo ufw allow from <OUTBOUND_IP_2> to any port 5432
# ... repeat for all outbound IPs
```

Or if using iptables:
```bash
sudo iptables -A INPUT -p tcp --dport 5432 -s <OUTBOUND_IP_1> -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -s <OUTBOUND_IP_2> -j ACCEPT
# ... repeat for all outbound IPs
sudo iptables-save
```

#### Option B: If using Azure PostgreSQL Flexible Server

1. Go to Azure Portal → Your PostgreSQL Server
2. Go to **Networking** → **Firewall rules**
3. Click **Add current client IP address** (for testing)
4. Or add each outbound IP manually:
   - Click **Add firewall rule**
   - Enter a rule name (e.g., "GeoLink-WebApp-1")
   - Enter the outbound IP address
   - Click **Save**

#### Option C: Allow All Azure Services (Less Secure)

If your database is Azure PostgreSQL Flexible Server:
1. Go to **Networking** → **Firewall rules**
2. Enable **Allow Azure services and resources to access this server**
3. Click **Save**

**Note:** This is less secure but allows all Azure services to connect.

### Step 3: Verify PostgreSQL is Listening on the Right Interface

SSH into your VM and check:
```bash
sudo netstat -tlnp | grep 5432
```

PostgreSQL should be listening on `0.0.0.0:5432` (all interfaces) or at least on the VM's IP.

If it's only listening on `127.0.0.1`, edit `/etc/postgresql/*/main/postgresql.conf`:
```
listen_addresses = '*'  # or '0.0.0.0'
```

Then restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Step 4: Check PostgreSQL pg_hba.conf

Ensure PostgreSQL allows connections from Azure:
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Add or verify this line (allows SSL connections from any IP):
```
hostssl    all    all    0.0.0.0/0    md5
```

Or more securely, only allow your Azure Web App IPs:
```
hostssl    all    all    <OUTBOUND_IP_1>/32    md5
hostssl    all    all    <OUTBOUND_IP_2>/32    md5
```

Reload PostgreSQL:
```bash
sudo systemctl reload postgresql
```

### Step 5: Test Connection

After configuring the firewall, test the connection from Azure Web App:

1. Go to Azure Portal → Your Web App → **Console** (or **SSH**)
2. Try to connect:
```bash
psql -h 20.253.209.97 -U geolink_user -d GeoLink
```

Or use a simple test script in the Web App console:
```bash
node -e "const {Pool}=require('pg');const p=new Pool({host:'20.253.209.97',port:5432,database:'GeoLink',user:'geolink_user',password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false}});p.connect().then(c=>{console.log('Connected!');c.release();process.exit(0)}).catch(e=>{console.error('Error:',e.message);process.exit(1)});"
```

### Alternative: Use Azure Private Link (Recommended for Production)

For better security and performance:
1. Set up Azure Private Link between your Web App and database
2. Use VNet integration
3. This keeps traffic within Azure's private network

## Troubleshooting

### Check if port 5432 is accessible:
```bash
# From Azure Web App console
telnet 20.253.209.97 5432
# Or
nc -zv 20.253.209.97 5432
```

### Check database logs:
```bash
# On the database VM
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Verify environment variables in Azure:
1. Go to Azure Portal → Your Web App → **Configuration** → **Application settings**
2. Verify these are set:
   - `DB_HOST=20.253.209.97`
   - `DB_PORT=5432`
   - `DB_NAME=GeoLink`
   - `DB_USER=geolink_user`
   - `DB_PASSWORD=<your-password>`
   - `DB_SSL=true`

## Quick Fix Script

If you have SSH access to the database VM, run this to allow Azure IPs (replace with your actual IPs):

```bash
#!/bin/bash
# Allow Azure Web App outbound IPs
OUTBOUND_IPS=(
  "1.2.3.4"  # Replace with your actual outbound IPs
  "5.6.7.8"
  # Add more as needed
)

for ip in "${OUTBOUND_IPS[@]}"; do
  sudo ufw allow from $ip to any port 5432
  echo "Allowed $ip"
done

sudo ufw reload
```

