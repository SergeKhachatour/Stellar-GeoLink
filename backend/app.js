require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
const contractsRoutes = require('./routes/contracts');
const locationVerificationRoutes = require('./routes/locationVerification');
const nftAnalyticsRoutes = require('./routes/nftAnalytics');
const geospatialRoutes = require('./routes/geospatial');
const adminGeospatialRoutes = require('./routes/adminGeospatial');
const dataConsumerRoutes = require('./routes/dataConsumer');
const ipfsRoutes = require('./routes/ipfs');
const stellarRoutes = require('./routes/stellar');
const aiRoutes = require('./routes/ai');
const zkProofRoutes = require('./routes/zkProof');
const smartWalletRoutes = require('./routes/smartWallet');
const webauthnRoutes = require('./routes/webauthn');
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(trackApiUsage);
app.use(rateLimiter);

// Custom Swagger UI with interactive map
app.get('/api-docs/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'swagger-ui-custom.html'));
});

// Swagger JSON endpoint
app.get('/api-docs/swagger.json', (req, res) => {
  res.json(swaggerSpec);
});

// API Documentation - Custom landing page and Postman download
const docsRoutes = require('./routes/docs');
app.use('/docs', docsRoutes);

app.use('/api/location', locationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/geofence', geofenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/wallet-provider', walletProviderRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/location-verification', locationVerificationRoutes);
app.use('/api/nft-analytics', nftAnalyticsRoutes);
app.use('/api/geospatial', geospatialRoutes);
app.use('/api/admin/geospatial', adminGeospatialRoutes);
app.use('/api/data-consumer', dataConsumerRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/stellar', stellarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/zk-proof', zkProofRoutes);
app.use('/api/smart-wallet', smartWalletRoutes);
app.use('/api/webauthn', webauthnRoutes);
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

// Serve static files from the React app build directory (after all API routes)
// Add cache-control headers: no-cache for JS/CSS files to prevent stale bundles
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        // Don't cache JS, CSS, or HTML files - force browser to check for updates
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else {
            // Cache other assets (images, fonts) for 1 year
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// Serve React app for all non-API routes (SPA routing)
app.get('*', (req, res, next) => {
    // Skip API routes and docs
    if (req.path.startsWith('/api/') || req.path.startsWith('/api-docs') || req.path.startsWith('/docs')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
            error: 'File too large',
            details: 'File size exceeds 10MB limit. Please upload a smaller file.'
        });
    }
    
    // Handle file type errors
    if (err.message && err.message.includes('Only image files')) {
        return res.status(400).json({ 
            error: 'Invalid file type',
            details: 'Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'
        });
    }
    
    // Handle multer errors (check for multer error codes)
    if (err.code && (err.code.startsWith('LIMIT_') || err.code === 'MULTER_ERROR')) {
        return res.status(400).json({ 
            error: 'File upload error',
            details: err.message || 'File upload failed. Please check file type and size.'
        });
    }
    
    res.status(500).json({ 
        error: 'Something broke!',
        message: err.message || 'An unexpected error occurred'
    });
});

// Ensure uploads directory exists on startup
const fs = require('fs').promises;

const ensureUploadsDir = async () => {
    try {
        // Check if we're on Azure (Linux Web App)
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        let nftUploadDir;
        let wasmUploadDir;
        
        if (isAzure) {
            // Azure: Use /home directory which is writable and persistent
            nftUploadDir = '/home/uploads/nft-files';
            wasmUploadDir = '/home/uploads/contract-wasm';
            console.log(`${logPrefix} 🔧 Configuring upload directories for Azure`);
            console.log(`${logPrefix} Environment variables:`, {
                WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME,
                AZURE_WEBSITE_INSTANCE_ID: process.env.AZURE_WEBSITE_INSTANCE_ID
            });
        } else {
            // Local development: Use relative path
            nftUploadDir = path.join(__dirname, 'uploads/nft-files');
            wasmUploadDir = path.join(__dirname, 'uploads/contract-wasm');
            console.log(`${logPrefix} 🔧 Configuring upload directories for local development`);
        }
        
        // Create both upload directories
        await fs.mkdir(nftUploadDir, { recursive: true });
        await fs.mkdir(wasmUploadDir, { recursive: true });
        console.log(`${logPrefix} ✅ NFT upload directory ensured:`, nftUploadDir);
        console.log(`${logPrefix} ✅ WASM upload directory ensured:`, wasmUploadDir);
        
        // Verify directories exist and get stats
        for (const dir of [nftUploadDir, wasmUploadDir]) {
            try {
                const stats = await fs.stat(dir);
                console.log(`${logPrefix} 📊 Directory stats:`, {
                    path: dir,
                    isDirectory: stats.isDirectory(),
                    mode: stats.mode.toString(8),
                    size: stats.size
                });
            } catch (statError) {
                console.error(`${logPrefix} ⚠️  Cannot get directory stats for ${dir}:`, statError.message);
            }
        }
    } catch (error) {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        console.error(`${logPrefix} ❌ Error ensuring upload directories:`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        // Don't exit - app can still run, but uploads will fail
    }
};

// Ensure uploads directory exists before starting server
ensureUploadsDir();

// Start background AI service for processing location updates
const backgroundAIService = require('./services/backgroundAIService');
const BACKGROUND_AI_INTERVAL = parseInt(process.env.BACKGROUND_AI_INTERVAL_MS || '5000', 10); // Default 5 seconds

// Start background AI worker
if (process.env.ENABLE_BACKGROUND_AI !== 'false') {
    backgroundAIService.start(BACKGROUND_AI_INTERVAL);
    console.log(`[BackgroundAI] ✅ Background AI service started (interval: ${BACKGROUND_AI_INTERVAL}ms)`);
} else {
    console.log(`[BackgroundAI] ⏸️  Background AI service disabled (ENABLE_BACKGROUND_AI=false)`);
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[BackgroundAI] ⏹️  Stopping background AI service...');
    backgroundAIService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[BackgroundAI] ⏹️  Stopping background AI service...');
    backgroundAIService.stop();
    process.exit(0);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 