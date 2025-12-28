const pool = require('../config/database');
const { findNearbyLocations, getGeospatialStats } = require('../utils/postgisUtils-simple');
const { verifyLocation } = require('../utils/locationUtils');
const axios = require('axios');

// Mapbox Geocoding API
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.REACT_APP_MAPBOX_TOKEN;

// Base API URL - will be set from environment or detect from context
const getApiBaseUrl = () => {
  // If API_BASE_URL is explicitly set, use it (ensure it ends with /api)
  if (process.env.API_BASE_URL) {
    const baseUrl = process.env.API_BASE_URL;
    return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
  }
  
  // If running on Azure, use Azure URL
  const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
  if (isAzure) {
    // Get the hostname from environment or use default
    const hostname = process.env.WEBSITE_HOSTNAME || process.env.WEBSITE_SITE_NAME || 'geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net';
    // Ensure we use the full hostname (not just site name)
    const fullHostname = hostname.includes('.') ? hostname : `${hostname}.azurewebsites.net`;
    const apiUrl = `https://${fullHostname}/api`;
    console.log(`[getApiBaseUrl] Azure detected, using: ${apiUrl}`);
    return apiUrl;
  }
  
  // Default to localhost for local development
  return 'http://localhost:4000/api';
};

/**
 * Find nearby wallet locations using geospatial queries
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Search radius in meters (default: 1000)
 * @param {string} token - User authentication token (optional)
 * @returns {Promise<object>} - Nearby locations
 */
async function findNearbyWallets(latitude, longitude, radius = 1000, token = null) {
  try {
    const apiUrl = `${getApiBaseUrl()}/geospatial/nearby`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    console.log(`[findNearbyWallets] Calling API: ${apiUrl}`);
    console.log(`[findNearbyWallets] Params: lat=${latitude}, lon=${longitude}, radius=${radius}`);
    
    const response = await axios.get(apiUrl, {
      params: { latitude, longitude, radius },
      headers
    });
    
    console.log(`[findNearbyWallets] Response status: ${response.status}`);
    console.log(`[findNearbyWallets] Response data:`, JSON.stringify(response.data, null, 2));
    console.log(`[findNearbyWallets] Response has locations: ${!!response.data?.locations}`);
    console.log(`[findNearbyWallets] Locations count: ${response.data?.locations?.length || 0}`);
    
    // Ensure we return the data in the expected format
    if (response.data && response.data.locations) {
      console.log(`[findNearbyWallets] Returning ${response.data.locations.length} locations`);
      return response.data;
    } else if (Array.isArray(response.data)) {
      // If response is directly an array, wrap it
      console.log(`[findNearbyWallets] Response is array, wrapping with ${response.data.length} items`);
      return {
        locations: response.data,
        count: response.data.length
      };
    }
    
    console.log(`[findNearbyWallets] Returning raw response data`);
    return response.data;
  } catch (error) {
    console.error(`[findNearbyWallets] Error:`, error.response?.data || error.message);
    console.error(`[findNearbyWallets] Error status:`, error.response?.status);
    console.error(`[findNearbyWallets] Error URL:`, error.config?.url);
    throw new Error(`Failed to find nearby wallets: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Get geospatial statistics
 * @param {string} token - User authentication token (optional)
 * @returns {Promise<object>} - Geospatial statistics
 */
async function getGeospatialStatistics(token = null) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${getApiBaseUrl()}/geospatial/stats`, {
      headers
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get geospatial statistics: ${error.message}`);
  }
}

/**
 * Get all NFT collections
 * @param {string} token - User authentication token
 * @returns {Promise<array>} - List of NFT collections
 */
async function getNFTCollections(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/nft/collections`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get NFT collections: ${error.message}`);
  }
}

/**
 * Get pinned NFTs
 * @param {string} token - User authentication token
 * @returns {Promise<array>} - List of pinned NFTs
 */
async function getPinnedNFTs(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/nft/pinned`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get pinned NFTs: ${error.message}`);
  }
}

/**
 * Get NFTs near a location
 * @param {number} latitude - Center latitude (optional - if not provided, fetches all NFTs globally)
 * @param {number} longitude - Center longitude (optional - if not provided, fetches all NFTs globally)
 * @param {number} radius - Search radius in meters (default: 1000, or very large if no location provided)
 * @returns {Promise<array>} - List of nearby NFTs
 */
async function getNearbyNFTs(latitude, longitude, radius = 1000) {
  try {
    // If no location provided, fetch all NFTs globally using /nft/public endpoint (no auth required)
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      console.log(`[getNearbyNFTs] No location provided, fetching all NFTs globally via /nft/public`);
      const response = await axios.get(`${getApiBaseUrl()}/nft/public`);
      console.log(`[getNearbyNFTs] Fetched ${response.data.nfts?.length || 0} NFTs globally`);
      return response.data;
    }
    
    // If radius is very large (>= 20000 km), fetch all NFTs globally using public endpoint
    // This matches xyz-wallet which uses 20000000m (20,000 km) for global mode
    if (radius >= 20000000) {
      console.log(`[getNearbyNFTs] Very large radius (${radius}m = ${(radius / 1000).toFixed(0)}km), fetching all NFTs globally via /nft/public (Global mode)`);
      const response = await axios.get(`${getApiBaseUrl()}/nft/public`);
      console.log(`[getNearbyNFTs] Fetched ${response.data.nfts?.length || 0} NFTs globally`);
      return response.data;
    }
    
    // Otherwise, use the nearby endpoint with location and radius
    // Note: /nft/nearby requires authentication, so we'll use /nft/public if auth fails
    try {
      const response = await axios.get(`${getApiBaseUrl()}/nft/nearby`, {
        params: { latitude, longitude, radius }
      });
      console.log(`[getNearbyNFTs] Called with lat: ${latitude}, lon: ${longitude}, radius: ${radius}`);
      console.log(`[getNearbyNFTs] Response:`, response.data);
      return response.data;
    } catch (nearbyError) {
      // If /nft/nearby fails due to auth, fallback to /nft/public for global view
      if (nearbyError.response?.status === 401 || nearbyError.response?.status === 403) {
        console.log(`[getNearbyNFTs] Auth required for /nft/nearby, falling back to /nft/public for global view`);
        const response = await axios.get(`${getApiBaseUrl()}/nft/public`);
        console.log(`[getNearbyNFTs] Fetched ${response.data.nfts?.length || 0} NFTs globally (fallback)`);
        return response.data;
      }
      throw nearbyError;
    }
  } catch (error) {
    console.error(`[getNearbyNFTs] Error:`, error.response?.data || error.message);
    throw new Error(`Failed to get nearby NFTs: ${error.message}`);
  }
}

/**
 * Verify NFT location
 * @param {number} nftId - NFT ID
 * @param {number} userLatitude - User's current latitude
 * @param {number} userLongitude - User's current longitude
 * @param {string} token - User authentication token
 * @returns {Promise<object>} - Verification result
 */
async function verifyNFTLocation(nftId, userLatitude, userLongitude, token) {
  try {
    const response = await axios.post(
      `${getApiBaseUrl()}/location-verification/verify-nft`,
      {
        nft_id: nftId,
        user_latitude: userLatitude,
        user_longitude: userLongitude
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to verify NFT location: ${error.message}`);
  }
}

/**
 * Create a new NFT collection
 * @param {string} name - Collection name
 * @param {string} description - Collection description
 * @param {string} imageUrl - Collection image URL (optional)
 * @param {string} rarityLevel - Rarity level (common, uncommon, rare, epic, legendary)
 * @param {string} token - User authentication token
 * @returns {Promise<object>} - Created collection
 */
async function createNFTCollection(name, description, imageUrl = null, rarityLevel = 'common', token) {
  try {
    const response = await axios.post(
      `${getApiBaseUrl()}/nft/collections`,
      {
        name,
        description,
        image_url: imageUrl,
        rarity_level: rarityLevel
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to create NFT collection: ${error.message}`);
  }
}

/**
 * Get smart wallet balance
 * @param {string} userPublicKey - User's Stellar public key
 * @param {string} token - User authentication token
 * @param {string} assetAddress - Asset contract address (optional, defaults to native XLM)
 * @returns {Promise<object>} - Wallet balance
 */
async function getSmartWalletBalance(userPublicKey, token, assetAddress = null) {
  try {
    const params = { userPublicKey };
    if (assetAddress) params.assetAddress = assetAddress;
    
    const response = await axios.get(`${getApiBaseUrl()}/smart-wallet/balance`, {
      params,
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get smart wallet balance: ${error.message}`);
  }
}

/**
 * Get user's registered passkeys
 * @param {string} token - User authentication token
 * @returns {Promise<array>} - List of registered passkeys
 */
async function getPasskeys(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/webauthn/passkeys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get passkeys: ${error.message}`);
  }
}

/**
 * Get analytics statistics
 * @param {string} token - User authentication token (API key)
 * @returns {Promise<object>} - Analytics statistics
 */
async function getAnalyticsStats(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/analytics/stats`, {
      headers: { 'X-API-Key': token }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get analytics stats: ${error.message}`);
  }
}

/**
 * Get blockchain distribution analytics
 * @param {string} token - User authentication token (API key)
 * @returns {Promise<array>} - Blockchain distribution data
 */
async function getBlockchainDistribution(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/analytics/blockchain-distribution`, {
      headers: { 'X-API-Key': token }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get blockchain distribution: ${error.message}`);
  }
}

/**
 * Get geofences for a user
 * @param {string} token - User authentication token (API key)
 * @returns {Promise<array>} - List of geofences
 */
async function getGeofences(token) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/geofence`, {
      headers: { 'X-API-Key': token }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get geofences: ${error.message}`);
  }
}

/**
 * Geocode a place name to coordinates using Mapbox Geocoding API
 * @param {string} placeName - Place name (e.g., "New York", "San Francisco", "Times Square")
 * @returns {Promise<{latitude: number, longitude: number, placeName: string}>} - Coordinates and place name
 */
async function geocodePlaceName(placeName) {
  if (!MAPBOX_TOKEN) {
    throw new Error('Mapbox token not configured. Please set MAPBOX_TOKEN environment variable.');
  }

  try {
    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeName)}.json`,
      {
        params: {
          access_token: MAPBOX_TOKEN,
          limit: 1,
          types: 'place,poi,address,neighborhood,locality'
        }
      }
    );

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error(`Could not find location: ${placeName}`);
    }

    const feature = response.data.features[0];
    const [longitude, latitude] = feature.center;
    const fullPlaceName = feature.place_name || placeName;

    return {
      latitude,
      longitude,
      placeName: fullPlaceName
    };
  } catch (error) {
    if (error.response) {
      throw new Error(`Geocoding failed: ${error.response.data?.message || error.message}`);
    }
    throw new Error(`Geocoding failed: ${error.message}`);
  }
}

/**
 * Generate a circular polygon from center point and radius
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radiusMeters - Radius in meters
 * @returns {object} - GeoJSON polygon
 */
function generateCircularPolygon(latitude, longitude, radiusMeters) {
  // Number of points to approximate the circle (more points = smoother circle)
  const numPoints = 32;
  const points = [];
  
  // Convert radius from meters to degrees (approximate)
  // 1 degree latitude ≈ 111,320 meters
  // 1 degree longitude ≈ 111,320 * cos(latitude) meters
  const latRadius = radiusMeters / 111320;
  const lonRadius = radiusMeters / (111320 * Math.cos(latitude * Math.PI / 180));
  
  // Generate points around the circle
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 360 / numPoints) * (Math.PI / 180);
    const lat = latitude + latRadius * Math.cos(angle);
    const lon = longitude + lonRadius * Math.sin(angle);
    points.push([lon, lat]); // GeoJSON format: [longitude, latitude]
  }
  
  // Close the polygon (first point = last point)
  return {
    type: 'Polygon',
    coordinates: [points]
  };
}

/**
 * Create a geofence
 * @param {string} name - Geofence name
 * @param {string} description - Geofence description (optional)
 * @param {object} polygon - GeoJSON polygon coordinates (optional if latitude/longitude/radius or placeName provided)
 * @param {string} placeName - Place name to geocode (e.g., "New York", "San Francisco") (optional)
 * @param {number} latitude - Center latitude (optional, used with longitude and radius)
 * @param {number} longitude - Center longitude (optional, used with latitude and radius)
 * @param {number} radius - Radius in meters (optional, used with latitude/longitude or placeName, default: 1000)
 * @param {string} blockchain - Blockchain type (e.g., 'stellar')
 * @param {string} webhookUrl - Webhook URL for notifications (optional)
 * @param {string} token - User authentication token (API key or JWT Bearer token)
 * @returns {Promise<object>} - Created geofence
 */
async function createGeofence(name, description, polygon, blockchain, webhookUrl = null, token, latitude = null, longitude = null, radius = 1000, placeName = null) {
  try {
    let geofencePolygon = polygon;
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    
    // If place name is provided, geocode it first
    if (placeName && !latitude && !longitude && !polygon) {
      const geocoded = await geocodePlaceName(placeName);
      finalLatitude = geocoded.latitude;
      finalLongitude = geocoded.longitude;
      
      // Update description to include the geocoded place name if not already set
      if (!description && geocoded.placeName !== placeName) {
        description = `Geofence for ${geocoded.placeName}`;
      }
    }
    
    // If latitude and longitude are provided (or geocoded), generate a circular polygon
    if (finalLatitude !== null && finalLongitude !== null && !polygon) {
      geofencePolygon = generateCircularPolygon(finalLatitude, finalLongitude, radius);
    } else if (!polygon && !finalLatitude && !finalLongitude) {
      throw new Error('Either polygon coordinates, latitude/longitude/radius, or placeName must be provided');
    }
    
    // Determine authentication header (API key or JWT Bearer token)
    const headers = {};
    if (token.startsWith('Bearer ') || token.length > 50) {
      // Likely a JWT token
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    } else {
      // API key
      headers['X-API-Key'] = token;
    }
    
    const response = await axios.post(
      `${getApiBaseUrl()}/geofence`,
      {
        name,
        description,
        polygon: geofencePolygon,
        blockchain,
        webhook_url: webhookUrl,
        latitude: finalLatitude,
        longitude: finalLongitude,
        radius: radius
      },
      { headers }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to create geofence: ${error.message}`);
  }
}

/**
 * Get user's wallet information from database
 * @param {number} userId - User ID
 * @returns {Promise<object>} - User wallet information
 */
async function getUserWalletInfo(userId) {
  try {
    const result = await pool.query(
      'SELECT id, email, public_key, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to get user wallet info: ${error.message}`);
  }
}

module.exports = {
  findNearbyWallets,
  getGeospatialStatistics,
  getNFTCollections,
  getPinnedNFTs,
  getNearbyNFTs,
  verifyNFTLocation,
  createNFTCollection,
  getSmartWalletBalance,
  getPasskeys,
  getAnalyticsStats,
  getBlockchainDistribution,
  getGeofences,
  createGeofence,
  getUserWalletInfo
};

