/**
 * Get the API base URL based on the current environment
 * @returns {string} The API base URL
 */
export const getApiBaseURL = () => {
  // If we're running in production (not localhost), use the same domain
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}`;
  }
  // For local development
  return process.env.REACT_APP_API_URL || 'http://localhost:4000';
};

/**
 * Get the full API URL for an endpoint
 * @param {string} endpoint - The API endpoint (e.g., '/api/nft/public')
 * @returns {string} The full API URL
 */
export const getApiUrl = (endpoint) => {
  const baseUrl = getApiBaseURL();
  // Ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // If baseUrl already ends with /api, don't add it again
  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}${path}`;
  }
  // Add /api if endpoint doesn't already include it
  if (!path.startsWith('/api')) {
    return `${baseUrl}/api${path}`;
  }
  return `${baseUrl}${path}`;
};

