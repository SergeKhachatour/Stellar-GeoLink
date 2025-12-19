const pool = require('../config/database');
const { findNearbyLocations, getGeospatialStats } = require('../utils/postgisUtils-simple');
const { verifyLocation } = require('../utils/locationUtils');
const axios = require('axios');

// Base API URL - will be set from environment or use localhost
const getApiBaseUrl = () => {
  return process.env.API_BASE_URL || 'http://localhost:4000/api';
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
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${getApiBaseUrl()}/geospatial/nearby`, {
      params: { latitude, longitude, radius },
      headers
    });
    console.log(`[findNearbyWallets] Called with lat: ${latitude}, lon: ${longitude}, radius: ${radius}`);
    console.log(`[findNearbyWallets] Response:`, response.data);
    
    // Ensure we return the data in the expected format
    if (response.data && response.data.locations) {
      return response.data;
    } else if (Array.isArray(response.data)) {
      // If response is directly an array, wrap it
      return {
        locations: response.data,
        count: response.data.length
      };
    }
    
    return response.data;
  } catch (error) {
    console.error(`[findNearbyWallets] Error:`, error.response?.data || error.message);
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
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Search radius in meters (default: 1000)
 * @returns {Promise<array>} - List of nearby NFTs
 */
async function getNearbyNFTs(latitude, longitude, radius = 1000) {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/nft/nearby`, {
      params: { latitude, longitude, radius }
    });
    console.log(`[getNearbyNFTs] Called with lat: ${latitude}, lon: ${longitude}, radius: ${radius}`);
    console.log(`[getNearbyNFTs] Response:`, response.data);
    return response.data;
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
 * Create a geofence
 * @param {string} name - Geofence name
 * @param {string} description - Geofence description (optional)
 * @param {object} polygon - GeoJSON polygon coordinates
 * @param {string} blockchain - Blockchain type (e.g., 'stellar')
 * @param {string} webhookUrl - Webhook URL for notifications (optional)
 * @param {string} token - User authentication token (API key)
 * @returns {Promise<object>} - Created geofence
 */
async function createGeofence(name, description, polygon, blockchain, webhookUrl = null, token) {
  try {
    const response = await axios.post(
      `${getApiBaseUrl()}/geofence`,
      {
        name,
        description,
        polygon,
        blockchain,
        webhook_url: webhookUrl
      },
      {
        headers: { 'X-API-Key': token }
      }
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

