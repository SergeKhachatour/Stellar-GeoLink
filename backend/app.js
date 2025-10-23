require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { swaggerUi, swaggerSpec, swaggerUiOptions } = require('./swagger-ui-config');
const trackApiUsage = require('./middleware/apiTracking');
const locationRoutes = require('./routes/location');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const geofenceRoutes = require('./routes/geofence');
const analyticsRoutes = require('./routes/analytics');
const alertRoutes = require('./routes/alerts');
const walletProviderRoutes = require('./routes/walletProvider');
const nftRoutes = require('./routes/nft');
const locationVerificationRoutes = require('./routes/locationVerification');
const nftAnalyticsRoutes = require('./routes/nftAnalytics');
const geospatialRoutes = require('./routes/geospatial');
const adminGeospatialRoutes = require('./routes/adminGeospatial');
const dataConsumerRoutes = require('./routes/dataConsumer');
// const configRoutes = require('./routes/config');
const { rateLimiter } = require('./middleware/rateLimiter');
const { authenticateUser } = require('./middleware/authUser');
const path = require('path');

const app = express();

// Configure CORS to accept requests from frontend
app.use(cors({
    origin: true,  // Allow all origins for debugging
    credentials: true
}));

app.use(express.json());
app.use(trackApiUsage);
app.use(rateLimiter);

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'public')));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

app.use('/api/location', locationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/geofence', geofenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/wallet-provider', walletProviderRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/location-verification', locationVerificationRoutes);
app.use('/api/nft-analytics', nftAnalyticsRoutes);
app.use('/api/geospatial', geospatialRoutes);
app.use('/api/admin/geospatial', adminGeospatialRoutes);
app.use('/api/data-consumer', dataConsumerRoutes);
// app.use('/api/config', configRoutes);

// Debug endpoint to check environment variables and database connection
app.get('/api/test', async (req, res) => {
  try {
    const pool = require('./config/database');
    
    // Test database connection and query
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) as user_count FROM users');
    const adminResult = await client.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      ['admin@stellar-geolink.com']
    );
    client.release();
    
    res.json({
      message: 'Test endpoint working',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        userCount: result.rows[0].user_count,
        adminUser: adminResult.rows.length > 0 ? adminResult.rows[0] : 'NOT FOUND'
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]',
        DB_SSL: process.env.DB_SSL,
        JWT_SECRET: process.env.JWT_SECRET ? '[SET]' : '[NOT SET]',
        PORT: process.env.PORT
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Database connection failed',
      error: error.message,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]',
        DB_SSL: process.env.DB_SSL,
        JWT_SECRET: process.env.JWT_SECRET ? '[SET]' : '[NOT SET]',
        PORT: process.env.PORT
      }
    });
  }
});

// Catch all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 