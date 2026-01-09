const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Stellar GeoLink API Documentation',
            version: '1.0.0',
            description: `
                ## 🔐 Authentication Required
                
                This API requires authentication using API keys. To test the endpoints:
                
                1. Click the **"Authorize"** button at the top of this page
                2. Enter one of these working API keys:
                   - **Data Consumer:** \`bb0f2efe14d56a1918e49c9bca8766f0cfefde786d4fd5eaaba27eb4e6cee64e\`
                   - **Wallet Provider:** \`bb0f2efe14d56a1918e49c9bca8766f0cfefde786d4fd5eaaba27eb4e6cee64e\`
                3. Click **"Authorize"** and then **"Close"**
                4. Now you can test the endpoints!
                
                **💡 Your API keys will be automatically saved and restored between sessions!**
                
                ---
                
                API documentation for Wallet Providers and Data Consumers with Interactive Location Services.
            `,
            contact: {
                email: 'sergekhachatour@gmail.com'
            }
        },
        servers: [
            {
                url: 'https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net',
                description: 'GeoLink Testnet (Azure)',
            },
            {
                url: 'http://localhost:4000',
                description: 'Development server (Local)',
            },
        ],
        components: {
            securitySchemes: {
                DataConsumerAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for Data Consumers - Get this from your dashboard'
                },
                WalletProviderAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for Wallet Providers - Get this from your dashboard'
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token for authenticated users'
                }
            },
            schemas: {
                WalletLocation: {
                    type: 'object',
                    properties: {
                        public_key: {
                            type: 'string',
                            description: 'Stellar wallet public key',
                            example: 'GABC123...'
                        },
                        blockchain: {
                            type: 'string',
                            description: 'Blockchain network',
                            example: 'Stellar'
                        },
                        latitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Latitude coordinate (-90 to 90)',
                            example: 40.7128,
                            minimum: -90,
                            maximum: 90
                        },
                        longitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Longitude coordinate (-180 to 180)',
                            example: -74.0060,
                            minimum: -180,
                            maximum: 180
                        },
                        last_updated: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last update timestamp',
                            example: '2024-01-15T10:30:00Z'
                        },
                        provider_name: {
                            type: 'string',
                            description: 'Wallet provider name',
                            example: 'XYZ Wallet'
                        }
                    }
                },
                LocationCoordinates: {
                    type: 'object',
                    description: 'Geographic coordinates with interactive map picker',
                    properties: {
                        latitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Latitude coordinate (-90 to 90)',
                            example: 40.7128,
                            minimum: -90,
                            maximum: 90
                        },
                        longitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Longitude coordinate (-180 to 180)',
                            example: -74.0060,
                            minimum: -180,
                            maximum: 180
                        }
                    },
                    required: ['latitude', 'longitude']
                },
                CustomContract: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Contract ID'
                        },
                        contract_address: {
                            type: 'string',
                            pattern: '^[A-Z0-9]{56}$',
                            description: 'Stellar contract address'
                        },
                        contract_name: {
                            type: 'string',
                            description: 'Friendly name for the contract'
                        },
                        network: {
                            type: 'string',
                            enum: ['testnet', 'mainnet'],
                            default: 'testnet'
                        },
                        discovered_functions: {
                            type: 'object',
                            description: 'Discovered contract functions'
                        },
                        function_mappings: {
                            type: 'object',
                            description: 'Function parameter mappings'
                        },
                        use_smart_wallet: {
                            type: 'boolean',
                            default: false
                        },
                        requires_webauthn: {
                            type: 'boolean',
                            default: false
                        },
                        wasm_file_name: {
                            type: 'string',
                            description: 'Uploaded WASM filename'
                        },
                        wasm_file_size: {
                            type: 'integer',
                            description: 'WASM file size in bytes'
                        },
                        wasm_source: {
                            type: 'string',
                            enum: ['stellarexpert', 'local', 'manual']
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                ContractExecutionRule: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer'
                        },
                        contract_id: {
                            type: 'integer'
                        },
                        rule_name: {
                            type: 'string'
                        },
                        rule_type: {
                            type: 'string',
                            enum: ['location', 'geofence', 'proximity']
                        },
                        center_latitude: {
                            type: 'number'
                        },
                        center_longitude: {
                            type: 'number'
                        },
                        radius_meters: {
                            type: 'integer'
                        },
                        geofence_id: {
                            type: 'integer'
                        },
                        function_name: {
                            type: 'string'
                        },
                        function_parameters: {
                            type: 'object'
                        },
                        trigger_on: {
                            type: 'string',
                            enum: ['enter', 'exit', 'within', 'proximity']
                        },
                        target_wallet_public_key: {
                            type: 'string',
                            nullable: true,
                            description: 'NULL = any wallet, or specific wallet address'
                        },
                        auto_execute: {
                            type: 'boolean',
                            default: false
                        },
                        requires_confirmation: {
                            type: 'boolean',
                            default: true
                        },
                        is_active: {
                            type: 'boolean',
                            default: true
                        }
                    }
                }
            }
        },
        security: [
            {
                DataConsumerAuth: []
            },
            {
                WalletProviderAuth: []
            }
        ],
        tags: [
            {
                name: 'Location',
                description: 'Location-based endpoints for wallet tracking and NFT discovery'
            },
            {
                name: 'Wallet Provider',
                description: 'Endpoints for wallet providers to manage user locations and settings'
            },
            {
                name: 'Data Consumer',
                description: 'Endpoints for data consumers to query wallet and NFT data'
            },
            {
                name: 'NFT',
                description: 'NFT management and discovery endpoints'
            },
            {
                name: 'Contracts',
                description: 'Smart contract management, discovery, and execution endpoints. Available to all roles via JWT or API key authentication.'
            }
        ]
    },
    apis: ['./routes/*.js'] // Path to the API routes
};

module.exports = swaggerJsdoc(options); 