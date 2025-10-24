const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'GeoLink API Documentation',
            version: '1.0.0',
            description: 'API documentation for GeoLink wallet location tracking service',
        },
        servers: [
            {
                url: 'https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net',
                description: 'Production server (Azure)',
            },
            {
                url: 'http://localhost:4000',
                description: 'Development server (Local)',
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for authentication'
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token for authentication'
                }
            }
        },
        security: [{
            ApiKeyAuth: []
        }]
    },
    apis: [
        './routes/*.js',
        './routes/admin.js',
        './routes/adminGeospatial.js', 
        './routes/alerts.js',
        './routes/analytics.js',
        './routes/auth.js',
        './routes/dataConsumer.js',
        './routes/geofence.js',
        './routes/geospatial.js',
        './routes/location.js',
        './routes/locationVerification.js',
        './routes/nft.js',
        './routes/nftAnalytics.js',
        './routes/user.js',
        './routes/walletProvider.js'
    ], // Path to the API routes
};

module.exports = swaggerJsdoc(options); 