const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// Simplified Swagger UI configuration
const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #3b4151; }
    
    /* Enhanced parameter styling */
    .swagger-ui .parameter__name {
      font-weight: bold;
      color: #007bff;
    }
    
    .swagger-ui .parameter__type {
      color: #28a745;
      font-weight: bold;
    }
    
    .swagger-ui .parameter__description {
      color: #6c757d;
      font-style: italic;
    }
    
    /* Location parameter highlighting */
    .swagger-ui .parameter[data-name*="lat"],
    .swagger-ui .parameter[data-name*="lon"],
    .swagger-ui .parameter[data-name*="latitude"],
    .swagger-ui .parameter[data-name*="longitude"] {
      border-left: 4px solid #007bff;
      padding-left: 10px;
      background: #f8f9fa;
    }
    
    .swagger-ui .parameter[data-name*="lat"] .parameter__name::before,
    .swagger-ui .parameter[data-name*="lon"] .parameter__name::before,
    .swagger-ui .parameter[data-name*="latitude"] .parameter__name::before,
    .swagger-ui .parameter[data-name*="longitude"] .parameter__name::before {
      content: "🗺️ ";
      margin-right: 5px;
    }
    
    /* Authentication notice */
    .auth-notice {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 4px;
      padding: 15px;
      margin: 20px 0;
      color: #856404;
    }
    
    .auth-notice h4 {
      margin: 0 0 10px 0;
      color: #856404;
    }
    
    .auth-notice code {
      background: #f8f9fa;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    
    /* Error styling */
    .swagger-ui .responses-inner .responses-table .response-col_status {
      color: #dc3545;
    }
    
    .swagger-ui .responses-inner .responses-table .response-col_status.response-col_status-401 {
      background: #f8d7da;
      color: #721c24;
    }
    
    /* API Key persistence styling */
    .swagger-ui .auth-wrapper {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 10px;
      margin: 10px 0;
    }
    
    .swagger-ui .auth-wrapper .auth-btn-wrapper {
      margin: 5px 0;
    }
    
    .swagger-ui .auth-wrapper .auth-btn-wrapper button {
      background: #007bff;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .swagger-ui .auth-wrapper .auth-btn-wrapper button:hover {
      background: #0056b3;
    }
  `,
  swaggerOptions: {
    tryItOutEnabled: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    persistAuthorization: true, // This makes Swagger UI remember API keys
    // Pre-fill API keys for testing (using your actual API keys)
    preauthorizeApiKey: {
      DataConsumerAuth: {
        name: 'X-API-Key',
        schema: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        },
        value: 'bb0f2efe14d56a1918e49c9bca8766f0cfefde786d4fd5eaaba27eb4e6cee64e'
      },
      WalletProviderAuth: {
        name: 'X-API-Key',
        schema: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        },
        value: 'bb0f2efe14d56a1918e49c9bca8766f0cfefde786d4fd5eaaba27eb4e6cee64e'
      }
    }
  }
};

module.exports = { swaggerUi, swaggerSpec, swaggerUiOptions };
