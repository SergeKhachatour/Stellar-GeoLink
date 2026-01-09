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
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

// Ensure Soroban CLI is available
const ensureSorobanCLI = async () => {
    try {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        
        // Check if soroban is already in PATH
        try {
            await execPromise('which soroban');
            console.log(`${logPrefix} ✅ Soroban CLI found in PATH`);
            return true;
        } catch {
            // Not in PATH, check custom location
            const customPath = '/home/soroban/soroban';
            try {
                await fs.access(customPath);
                // Add to PATH for this process
                process.env.PATH = `/home/soroban:${process.env.PATH}`;
                console.log(`${logPrefix} ✅ Soroban CLI found at ${customPath}, added to PATH`);
                return true;
            } catch {
                // Not found, try to install on Azure
                if (isAzure) {
                    console.log(`${logPrefix} 🔧 Soroban CLI not found, attempting installation...`);
                    try {
                        const SOROBAN_DIR = '/home/soroban';
                        await fs.mkdir(SOROBAN_DIR, { recursive: true });
                        
                        // Download and install - get latest release URL first via GitHub API
                        console.log(`${logPrefix} 📥 Fetching latest Soroban CLI release info from GitHub API...`);
                        let downloadUrl;
                        try {
                            const { stdout: releaseInfo, stderr: apiStderr } = await execPromise(
                                `curl -s -L "https://api.github.com/repos/stellar/soroban-tools/releases/latest"`,
                                { maxBuffer: 1024 * 1024, timeout: 15000 }
                            );
                            
                            if (apiStderr) {
                                console.log(`${logPrefix} ⚠️  GitHub API stderr: ${apiStderr}`);
                            }
                            
                            if (!releaseInfo || releaseInfo.trim().length === 0) {
                                throw new Error('Empty response from GitHub API');
                            }
                            
                            const release = JSON.parse(releaseInfo);
                            
                            // Check for API errors
                            if (release.message) {
                                throw new Error(`GitHub API error: ${release.message}`);
                            }
                            
                            // Find the asset for x86_64-unknown-linux-gnu
                            // Asset names may be: soroban-x86_64-unknown-linux-gnu.tar.gz OR stellar-cli-X.X.X-x86_64-unknown-linux-gnu.tar.gz
                            const asset = release.assets?.find(a => 
                                a.name && 
                                (a.name.includes('soroban') || a.name.includes('stellar-cli')) && 
                                a.name.includes('x86_64-unknown-linux-gnu') && 
                                !a.name.includes('aarch64') && // Exclude ARM builds
                                a.name.endsWith('.tar.gz')
                            );
                            
                            if (!asset) {
                                console.log(`${logPrefix} ⚠️  Available assets:`, release.assets?.map(a => a.name).join(', ') || 'none');
                                throw new Error('Could not find soroban/stellar-cli x86_64-unknown-linux-gnu.tar.gz in latest release');
                            }
                            
                            downloadUrl = asset.browser_download_url;
                            console.log(`${logPrefix} ✅ Found release: ${release.tag_name}, download URL: ${downloadUrl}`);
                        } catch (apiError) {
                            // Fallback: Try to get a specific release that we know exists
                            console.log(`${logPrefix} ⚠️  Failed to fetch release info (${apiError.message}), trying fallback release...`);
                            try {
                                // Try v23.4.1 which we saw in the logs
                                const { stdout: fallbackRelease } = await execPromise(
                                    `curl -s -L "https://api.github.com/repos/stellar/soroban-tools/releases/tags/v23.4.1"`,
                                    { maxBuffer: 1024 * 1024, timeout: 10000 }
                                );
                                const fallback = JSON.parse(fallbackRelease);
                                const fallbackAsset = fallback.assets?.find(a => 
                                    a.name && 
                                    (a.name.includes('soroban') || a.name.includes('stellar-cli')) && 
                                    a.name.includes('x86_64-unknown-linux-gnu') && 
                                    !a.name.includes('aarch64') &&
                                    a.name.endsWith('.tar.gz')
                                );
                                if (fallbackAsset) {
                                    downloadUrl = fallbackAsset.browser_download_url;
                                    console.log(`${logPrefix} 📥 Using fallback release v23.4.1: ${downloadUrl}`);
                                } else {
                                    throw new Error('Could not find asset in fallback release');
                                }
                            } catch (fallbackError) {
                                // Last resort: try a direct URL pattern (may not work)
                                console.log(`${logPrefix} ⚠️  Fallback release also failed, trying direct URL pattern...`);
                                downloadUrl = 'https://github.com/stellar/soroban-tools/releases/download/v23.4.1/stellar-cli-23.4.1-x86_64-unknown-linux-gnu.tar.gz';
                                console.log(`${logPrefix} 📥 Using direct URL: ${downloadUrl}`);
                            }
                        }
                        
                        const tarPath = '/tmp/soroban.tar.gz';
                        console.log(`${logPrefix} 📥 Downloading Soroban CLI from: ${downloadUrl}`);
                        // Use curl with better error handling (-f fails on HTTP errors)
                        await execPromise(
                            `curl -L -f -s -S "${downloadUrl}" -o "${tarPath}"`,
                            { maxBuffer: 10 * 1024 * 1024 }
                        );
                        
                        // Check if file was downloaded and is valid
                        try {
                            const stats = await fs.stat(tarPath);
                            if (stats.size < 1000) {
                                // File too small, probably HTML error page
                                const content = await fs.readFile(tarPath, 'utf8', { limit: 100 });
                                if (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('Not Found')) {
                                    throw new Error('Downloaded file appears to be HTML (error page), not a valid tar.gz');
                                }
                            }
                            console.log(`${logPrefix} ✅ Downloaded ${stats.size} bytes`);
                        } catch (statError) {
                            throw new Error(`Downloaded file validation failed: ${statError.message}`);
                        }
                        
                        // Extract
                        console.log(`${logPrefix} 📦 Extracting Soroban CLI...`);
                        await execPromise(`tar -xzf "${tarPath}" -C "${SOROBAN_DIR}"`);
                        
                        // The tar might extract to a subdirectory or directly to soroban
                        // Check for both possibilities
                        let sorobanPath = `${SOROBAN_DIR}/soroban`;
                        let extractedPath = null;
                        
                        // List contents to see what was extracted
                        const extractedFiles = await fs.readdir(SOROBAN_DIR);
                        console.log(`${logPrefix} 📋 Extracted files: ${extractedFiles.join(', ')}`);
                        
                        // Check if soroban is directly in SOROBAN_DIR
                        if (extractedFiles.includes('soroban')) {
                            extractedPath = sorobanPath;
                        } else {
                            // Check if there's a subdirectory (could be named: soroban-x86_64-unknown-linux-gnu, stellar-cli-23.4.1-x86_64-unknown-linux-gnu, or just "stellar")
                            let subdir = null;
                            for (const f of extractedFiles) {
                                try {
                                    const stats = await fs.stat(`${SOROBAN_DIR}/${f}`);
                                    if (stats.isDirectory() && 
                                        (f.includes('soroban') || f.includes('stellar')) && 
                                        !f.includes('.tar')) {
                                        subdir = f;
                                        break;
                                    }
                                } catch (err) {
                                    // Not a directory or doesn't exist, continue
                                }
                            }
                            
                            if (subdir) {
                                const subdirPath = `${SOROBAN_DIR}/${subdir}`;
                                const subdirFiles = await fs.readdir(subdirPath);
                                console.log(`${logPrefix} 📋 Files in ${subdir}: ${subdirFiles.join(', ')}`);
                                
                                // Look for soroban binary in subdirectory
                                let sorobanInSubdir = null;
                                for (const file of subdirFiles) {
                                    try {
                                        const filePath = `${subdirPath}/${file}`;
                                        const stats = await fs.stat(filePath);
                                        // Check if it's a file (not directory) and named soroban or contains soroban
                                        if (!stats.isDirectory() && (file === 'soroban' || file.includes('soroban'))) {
                                            sorobanInSubdir = file;
                                            break;
                                        }
                                    } catch (err) {
                                        // Continue searching
                                    }
                                }
                                
                                if (sorobanInSubdir) {
                                    const sourcePath = `${subdirPath}/${sorobanInSubdir}`;
                                    await fs.rename(sourcePath, sorobanPath);
                                    console.log(`${logPrefix} 📦 Moved soroban from ${subdir}/${sorobanInSubdir} to ${sorobanPath}`);
                                    // Clean up subdirectory
                                    await fs.rm(subdirPath, { recursive: true, force: true });
                                    extractedPath = sorobanPath;
                                } else {
                                    // Maybe the binary has a different name - check all files in the subdirectory
                                    // The stellar-cli tar might extract with a different structure
                                    console.log(`${logPrefix} ⚠️  No soroban binary found in ${subdir}, checking all files...`);
                                    for (const file of subdirFiles) {
                                        try {
                                            const filePath = `${subdirPath}/${file}`;
                                            const stats = await fs.stat(filePath);
                                            if (!stats.isDirectory()) {
                                                // This might be the binary - try renaming it to soroban
                                                await fs.rename(filePath, sorobanPath);
                                                console.log(`${logPrefix} 📦 Renamed ${subdir}/${file} to soroban`);
                                                await fs.rm(subdirPath, { recursive: true, force: true });
                                                extractedPath = sorobanPath;
                                                break;
                                            }
                                        } catch (err) {
                                            // Continue searching
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Verify soroban binary exists
                        try {
                            await fs.access(sorobanPath);
                            await execPromise(`chmod +x "${sorobanPath}"`);
                            
                            // Test that it works
                            const { stdout: versionOutput } = await execPromise(`"${sorobanPath}" --version`, {
                                env: { ...process.env, PATH: `${SOROBAN_DIR}:${process.env.PATH}` }
                            });
                            console.log(`${logPrefix} ✅ Soroban CLI version: ${versionOutput.trim()}`);
                            
                            // Add to PATH
                            process.env.PATH = `${SOROBAN_DIR}:${process.env.PATH}`;
                            console.log(`${logPrefix} ✅ Soroban CLI installed successfully at ${sorobanPath}`);
                            return true;
                        } catch (verifyError) {
                            throw new Error(`Soroban binary not found or not executable after extraction: ${verifyError.message}`);
                        }
                    } catch (installError) {
                        console.error(`${logPrefix} ⚠️  Failed to install Soroban CLI:`, installError.message);
                        console.error(`${logPrefix}    Error details:`, installError.stack);
                        console.log(`${logPrefix} 💡 WASM parsing will use fallback methods`);
                        // Clean up failed download
                        try {
                            await fs.unlink('/tmp/soroban.tar.gz').catch(() => {});
                        } catch {}
                        return false;
                    }
                } else {
                    console.log(`${logPrefix} ⚠️  Soroban CLI not found. Install from: https://soroban.stellar.org/docs/getting-started/soroban-cli`);
                    return false;
                }
            }
        }
    } catch (error) {
        const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
        const logPrefix = isAzure ? '🌐 [AZURE]' : '💻 [LOCAL]';
        console.error(`${logPrefix} ❌ Error checking Soroban CLI:`, error.message);
        return false;
    }
};

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

// Ensure Soroban CLI and uploads directory exist before starting server
(async () => {
    try {
        await ensureSorobanCLI();
        await ensureUploadsDir();
        console.log('✅ Startup checks complete');
    } catch (error) {
        console.error('❌ Error during startup checks:', error);
        // Don't exit - app can still run with limited functionality
    }
})();

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