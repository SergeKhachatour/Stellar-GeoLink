const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Stellar GeoLink API Documentation',
            version: '1.0.0',
            description: 'API documentation for Wallet Providers and Data Consumers',
            contact: {
                email: 'your-email@example.com'
            }
        },
        servers: [
            {
                url: process.env.API_URL || 'http://localhost:4000',
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for authentication'
                }
            }
        },
        security: [
            {
                ApiKeyAuth: []
            }
        ],
        tags: [
            {
                name: 'Wallet Provider',
                description: 'Endpoints for managing wallet locations'
            },
            {
                name: 'Data Consumer',
                description: 'Endpoints for retrieving wallet data'
            }
        ]
    },
    apis: ['./routes/*.js'] // Path to the API routes
};

module.exports = swaggerJsdoc(options); 