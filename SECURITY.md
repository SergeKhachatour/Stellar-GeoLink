# Security Guidelines

## Environment Variables

This project requires the following environment variables to be set:

### Backend (.env)
```bash
# Database Configuration
DB_USER=postgres
DB_HOST=localhost
DB_NAME=GeoLink
DB_PASSWORD=your_secure_database_password
DB_PORT=5432

# JWT Configuration
JWT_SECRET=your_very_secure_jwt_secret_key_here

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Mapbox Configuration
MAPBOX_TOKEN=your_mapbox_token_here

# Admin User (for initial setup)
ADMIN_PASSWORD=your_secure_admin_password
```

### Frontend (.env)
```bash
REACT_APP_API_URL=http://localhost:4000/api
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
```

## Security Best Practices

### 1. Password Security
- **Never commit passwords to version control**
- Use strong, unique passwords for all accounts
- Change default passwords immediately after deployment
- Use environment variables for all sensitive configuration

### 2. API Key Management
- All API keys are stored in the database with proper encryption
- API keys are generated using cryptographically secure random methods
- Admin approval is required for all API key requests
- API keys can be revoked at any time through the admin dashboard

### 3. Database Security
- Use strong database passwords
- Enable SSL connections in production
- Regularly backup and encrypt database files
- Use connection pooling to prevent connection exhaustion

### 4. JWT Security
- Use a strong, random JWT secret (minimum 32 characters)
- Implement refresh token rotation
- Set appropriate token expiration times
- Store refresh tokens securely in the database

### 5. Production Deployment
- Use HTTPS in production
- Set up proper CORS policies
- Implement rate limiting
- Use environment-specific configuration files
- Regular security updates

## Initial Setup

1. **Set up environment variables** as shown above
2. **Create admin user** using the secure script:
   ```bash
   ADMIN_PASSWORD=your_secure_password node scripts/addAdminUser.js
   ```
3. **Change default passwords** immediately after first login
4. **Review and update** all default configurations

## Test Files Security

**Important**: Test and debug files often contain hardcoded credentials and should never be committed to version control.

### Files to Avoid Committing:
- `test-*.js` - Test files with hardcoded credentials
- `debug-*.js` - Debug files with sensitive data
- `check-*.js` - Database check files with connection strings
- Any files containing hardcoded passwords, API keys, or tokens

### Safe Development Practices:
1. Use environment variables for all sensitive data
2. Create test files with placeholder values
3. Use `.env` files for local development (never commit these)
4. Clean up test files before committing

## Security Checklist

Before deploying to production:

- [ ] All environment variables are set with secure values
- [ ] Default passwords have been changed
- [ ] HTTPS is enabled
- [ ] Database connections use SSL
- [ ] Rate limiting is configured
- [ ] CORS policies are properly set
- [ ] All API keys are properly secured
- [ ] Test files with credentials have been removed
- [ ] Regular security updates are scheduled

## Reporting Security Issues

If you discover a security vulnerability, please report it to:
- Email: sergekhachatour@gmail.com
- Include detailed information about the vulnerability
- Do not publicly disclose until the issue has been resolved

## Security Updates

This document should be reviewed and updated regularly to reflect current security best practices and any changes to the application's security model.
