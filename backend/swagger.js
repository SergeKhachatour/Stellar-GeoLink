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
                url: process.env.NODE_ENV === 'production' 
                    ? 'https://api.geolink.example.com'
                    : 'http://localhost:4000',
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'API key for authentication'
                }
            }
        },
        security: [{
            ApiKeyAuth: []
        }]
    },
    apis: ['./routes/*.js'], // Path to the API routes
};

module.exports = swaggerJsdoc(options); 