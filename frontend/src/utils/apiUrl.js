/**
 * Get the API base URL based on the current environment
 * @returns {string} The API base URL
 */
export const getApiBaseURL = () => {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || '';
    const protocol = window.location.protocol || 'https:';
    const port = window.location.port;
    
    // PRIORITY 1: Explicit check for stellargeolink.com - ALWAYS production
    if (hostname.includes('stellargeolink.com')) {
      return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }
    
    // PRIORITY 2: Check for azurewebsites.net - ALWAYS production
    if (hostname.includes('azurewebsites.net')) {
      return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }
    
    // PRIORITY 3: If protocol is HTTPS, it's production
    if (protocol === 'https:') {
      return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }
    
    // PRIORITY 4: Check if it's NOT localhost
    const isLocalhost = hostname === 'localhost' || 
                       hostname === '127.0.0.1' || 
                       hostname.startsWith('192.168.') ||
                       hostname.startsWith('10.') ||
                       hostname === '' ||
                       hostname.includes('localhost');
    
    if (!isLocalhost && hostname.includes('.')) {
      return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }
  }
  // For local development only
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

