# 🚀 URGENT: Deploy Complete Schema to Azure

## ⚠️ **Critical Issue**
Your Azure PostgreSQL only has 3-4 basic tables, but your application needs 26+ tables to function properly.

## 🔧 **Immediate Action Required**

### **Step 1: Upload Schema File**
Open PowerShell or Command Prompt and run:
```bash
scp database/schema.sql Serge369x33@20.253.209.97:~/complete-schema.sql
```

### **Step 2: Connect to Azure VM**
```bash
ssh Serge369x33@20.253.209.97
```

### **Step 3: Deploy Complete Schema**
Once connected to the VM, run:
```bash
sudo -u postgres psql -d "GeoLink" -f ~/complete-schema.sql
```

### **Step 4: Verify Deployment**
```bash
sudo -u postgres psql -d "GeoLink" -c "\dt"
```

## 📊 **What This Will Create (26 Tables):**

### **Core Tables:**
- users, wallet_providers, data_consumers
- wallet_types, wallet_locations
- user_sessions, refresh_tokens

### **API & Security:**
- api_keys, api_key_requests, api_usage_logs
- rate_limits, user_privacy_settings

### **Geospatial Features:**
- geofences, location_events, location_verifications
- wallet_location_history

### **NFT System:**
- nft_collections, pinned_nfts, user_nft_ownership
- nft_transfers

### **Alerts & Notifications:**
- alert_preferences, alert_history
- notification_preferences, webhook_configurations

## 🎯 **Expected Result:**
- ✅ All 26 tables created
- ✅ Proper relationships established
- ✅ PostGIS spatial indexing enabled
- ✅ Sample data inserted
- ✅ Your deployed application will work properly

## 🚨 **Without This:**
Your deployed app will have database errors and broken functionality.

**Please run these commands now to fix your Azure database!**
