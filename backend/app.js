require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
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
const configRoutes = require('./routes/config');
const { rateLimiter } = require('./middleware/rateLimiter');
const { authenticateUser } = require('./middleware/authUser');
const path = require('path');

const app = express();

// Configure CORS to accept requests from frontend
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://your-production-domain.com'  // Update this with your production domain
        : 'http://localhost:3000',
    credentials: true
}));

app.use(express.json());
app.use(trackApiUsage);
app.use(rateLimiter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
app.use('/api/config', configRoutes);

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