# Database Setup Guide

## Environment Variables Required

Create a `.env` file in the `backend` directory with these variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=GeoLink
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT Secret
JWT_SECRET=your_jwt_secret_here

# API Configuration
API_URL=http://localhost:4000
```

## SQL Commands to Run

After setting up the environment variables, run these SQL commands in your PostgreSQL database:

### 1. Create demo users:
```sql
-- Create demo data consumer user
INSERT INTO users (email, password_hash, first_name, last_name, role, organization)
VALUES (
    'demo-consumer@example.com',
    '$2b$10$demo.hash.for.testing',
    'Demo',
    'Consumer',
    'data_consumer',
    'Demo Organization'
)
ON CONFLICT (email) DO NOTHING;

-- Create demo wallet provider user
INSERT INTO users (email, password_hash, first_name, last_name, role, organization)
VALUES (
    'demo-provider@example.com',
    '$2b$10$demo.hash.for.testing',
    'Demo',
    'Provider',
    'wallet_provider',
    'Demo Wallet Provider'
)
ON CONFLICT (email) DO NOTHING;
```

### 2. Create API keys:
```sql
-- Create data consumer API key
INSERT INTO api_keys (user_id, api_key, name, status)
SELECT 
    u.id,
    'demo-data-consumer-key-12345',
    'Demo Data Consumer Key',
    true
FROM users u 
WHERE u.email = 'demo-consumer@example.com'
ON CONFLICT (api_key) DO NOTHING;

-- Create wallet provider API key
INSERT INTO api_keys (user_id, api_key, name, status)
SELECT 
    u.id,
    'demo-wallet-provider-key-67890',
    'Demo Wallet Provider Key',
    true
FROM users u 
WHERE u.email = 'demo-provider@example.com'
ON CONFLICT (api_key) DO NOTHING;
```

### 3. Create data consumer record:
```sql
INSERT INTO data_consumers (user_id, status)
SELECT u.id, true
FROM users u 
WHERE u.email = 'demo-consumer@example.com'
ON CONFLICT (user_id) DO NOTHING;
```

### 4. Create wallet provider record with proper api_key_id reference:
```sql
INSERT INTO wallet_providers (user_id, name, api_key_id, status)
SELECT 
    u.id,
    'Demo Wallet Provider',
    ak.id,
    true
FROM users u 
JOIN api_keys ak ON ak.user_id = u.id
WHERE u.email = 'demo-provider@example.com' 
AND ak.api_key = 'demo-wallet-provider-key-67890'
ON CONFLICT (user_id) DO NOTHING;
```

### 5. Add demo wallet types:
```sql
INSERT INTO wallet_types (name, description)
VALUES 
    ('Mobile Wallet', 'Mobile wallet application'),
    ('Desktop Wallet', 'Desktop wallet application')
ON CONFLICT (name) DO NOTHING;
```

## After Running SQL Commands

1. **Restart your backend server**
2. **Test the API endpoints** in Swagger UI using:
   - **Data Consumer Key:** `demo-data-consumer-key-12345`
   - **Wallet Provider Key:** `demo-wallet-provider-key-67890`

## Troubleshooting

If you still get 401 errors:
1. Check that the backend server is running: `netstat -ano | findstr :4000`
2. Check the backend console for database connection errors
3. Verify the API keys exist in the database
4. Make sure you're using the correct API key in the Swagger UI "Authorize" section
