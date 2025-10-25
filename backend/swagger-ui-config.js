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
    
    /* Interactive Map Container */
    .map-container {
      width: 100%;
      height: 400px;
      border: 2px solid #007bff;
      border-radius: 8px;
      margin: 15px 0;
      position: relative;
      background: #f8f9fa;
    }
    
    .map-container .mapboxgl-map {
      border-radius: 6px;
    }
    
    .map-controls {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: white;
      padding: 10px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .map-controls button {
      background: #007bff;
      color: white;
      border: none;
      padding: 5px 10px;
      margin: 2px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .map-controls button:hover {
      background: #0056b3;
    }
    
    .coordinates-display {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      z-index: 1000;
    }
    
    .map-instructions {
      background: #e3f2fd;
      border: 1px solid #2196f3;
      border-radius: 4px;
      padding: 10px;
      margin: 10px 0;
      font-size: 14px;
    }
    
    .map-instructions h4 {
      margin: 0 0 8px 0;
      color: #1976d2;
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
    },
    // Custom JavaScript for interactive map
    onComplete: function() {
      // Add interactive map functionality
      addInteractiveMap();
    }
  }
};

// Add interactive map functionality
function addInteractiveMap() {
  // Wait for DOM to be ready
  setTimeout(() => {
    // Add map container to the info section
    const infoSection = document.querySelector('.swagger-ui .info');
    if (infoSection && !document.querySelector('.map-container')) {
      const mapHTML = `
        <div class="map-instructions">
          <h4>🗺️ Interactive Map for Location Selection</h4>
          <p>Click anywhere on the map to get coordinates, or use the buttons to load actual wallet and NFT locations from the API.</p>
        </div>
        <div class="map-container" id="swagger-map">
          <div class="map-controls">
            <button onclick="loadWallets()">📍 Load Wallets</button>
            <button onclick="loadNFTs()">🎨 Load NFTs</button>
            <button onclick="clearMarkers()">🗑️ Clear</button>
          </div>
          <div class="coordinates-display" id="coordinates-display">
            Click on map to get coordinates
          </div>
        </div>
      `;
      
      infoSection.insertAdjacentHTML('beforeend', mapHTML);
      
      // Initialize Mapbox
      initializeMapbox();
    }
  }, 1000);
}

function initializeMapbox() {
  // Check if Mapbox GL is available
  if (typeof mapboxgl === 'undefined') {
    // Load Mapbox GL JS
    const link = document.createElement('link');
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.onload = () => {
      initializeMap();
    };
    document.head.appendChild(script);
  } else {
    initializeMap();
  }
}

function initializeMap() {
  // Use Mapbox token (you can replace this with your actual token)
  mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';
  
  const map = new mapboxgl.Map({
    container: 'swagger-map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-74.006, 40.7128], // New York City
    zoom: 10
  });
  
  // Store map reference globally
  window.swaggerMap = map;
  
  // Add click handler
  map.on('click', (e) => {
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    
    // Update coordinates display
    document.getElementById('coordinates-display').textContent = 
      `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    
    // Auto-fill latitude/longitude fields in the current form
    fillCoordinates(lat, lng);
  });
  
  // Add marker on click
  map.on('click', (e) => {
    // Remove existing markers
    const existingMarkers = document.querySelectorAll('.swagger-marker');
    existingMarkers.forEach(marker => marker.remove());
    
    // Add new marker
    new mapboxgl.Marker({ className: 'swagger-marker' })
      .setLngLat([e.lngLat.lng, e.lngLat.lat])
      .addTo(map);
  });
}

function fillCoordinates(lat, lng) {
  // Find latitude and longitude input fields in the current form
  const latInputs = document.querySelectorAll('input[data-name*="lat"], input[data-name*="latitude"]');
  const lngInputs = document.querySelectorAll('input[data-name*="lon"], input[data-name*="longitude"]');
  
  latInputs.forEach(input => {
    input.value = lat.toFixed(6);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  
  lngInputs.forEach(input => {
    input.value = lng.toFixed(6);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// Global functions for map controls
window.loadWallets = function() {
  if (!window.swaggerMap) return;
  
  // Fetch wallet locations from API
  fetch('/api/location/wallet-locations')
    .then(response => response.json())
    .then(data => {
      // Clear existing markers
      clearMarkers();
      
      // Add wallet markers
      data.forEach(wallet => {
        if (wallet.latitude && wallet.longitude) {
          const marker = new mapboxgl.Marker({ 
            color: '#007bff',
            className: 'swagger-marker wallet-marker'
          })
          .setLngLat([parseFloat(wallet.longitude), parseFloat(wallet.latitude)])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div>
              <strong>Wallet:</strong> ${wallet.public_key}<br>
              <strong>Provider:</strong> ${wallet.provider_name || 'Unknown'}<br>
              <strong>Last Updated:</strong> ${new Date(wallet.last_updated).toLocaleString()}
            </div>
          `))
          .addTo(window.swaggerMap);
        }
      });
      
      // Fit map to show all markers
      if (data.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        data.forEach(wallet => {
          if (wallet.latitude && wallet.longitude) {
            bounds.extend([parseFloat(wallet.longitude), parseFloat(wallet.latitude)]);
          }
        });
        window.swaggerMap.fitBounds(bounds, { padding: 50 });
      }
    })
    .catch(error => {
      console.error('Error loading wallets:', error);
      alert('Error loading wallet locations. Make sure you are authenticated.');
    });
};

window.loadNFTs = function() {
  if (!window.swaggerMap) return;
  
  // Fetch NFT locations from API
  fetch('/api/nft/public')
    .then(response => response.json())
    .then(data => {
      // Clear existing markers
      clearMarkers();
      
      // Add NFT markers
      data.forEach(nft => {
        if (nft.latitude && nft.longitude) {
          const marker = new mapboxgl.Marker({ 
            color: '#28a745',
            className: 'swagger-marker nft-marker'
          })
          .setLngLat([parseFloat(nft.longitude), parseFloat(nft.latitude)])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div>
              <strong>NFT:</strong> ${nft.collection_name || 'Unknown Collection'}<br>
              <strong>Description:</strong> ${nft.description || 'No description'}<br>
              <strong>Radius:</strong> ${nft.radius_meters}m<br>
              <strong>Created:</strong> ${new Date(nft.created_at).toLocaleString()}
            </div>
          `))
          .addTo(window.swaggerMap);
        }
      });
      
      // Fit map to show all markers
      if (data.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        data.forEach(nft => {
          if (nft.latitude && nft.longitude) {
            bounds.extend([parseFloat(nft.longitude), parseFloat(nft.latitude)]);
          }
        });
        window.swaggerMap.fitBounds(bounds, { padding: 50 });
      }
    })
    .catch(error => {
      console.error('Error loading NFTs:', error);
      alert('Error loading NFT locations. Make sure you are authenticated.');
    });
};

window.clearMarkers = function() {
  const markers = document.querySelectorAll('.swagger-marker');
  markers.forEach(marker => marker.remove());
};

module.exports = { swaggerUi, swaggerSpec, swaggerUiOptions };
