import axios from 'axios';

// Version constant for build tracking
const API_SERVICE_VERSION = 'v2.0.9-2025-01-13-18:20-FORCE-REBUILD-1736791200000';

// Determine the API base URL based on environment (called at runtime, not build time)
const getApiBaseURL = () => {
    // Always check window.location at runtime (not build time)
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname || '';
        const protocol = window.location.protocol || 'https:';
        const port = window.location.port;
        
        // PRIORITY 1: Explicit check for stellargeolink.com - ALWAYS production
        if (hostname && (hostname.includes('stellargeolink.com') || hostname.endsWith('.stellargeolink.com') || hostname === 'stellargeolink.com')) {
            return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
        }
        
        // PRIORITY 2: Check for azurewebsites.net - ALWAYS production
        if (hostname.includes('azurewebsites.net')) {
            return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
        }
        
        // PRIORITY 3: If protocol is HTTPS, it's production
        if (protocol === 'https:') {
            return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
        }
        
        // PRIORITY 4: Check if it's NOT localhost
        const isLocalhost = hostname === 'localhost' || 
                           hostname === '127.0.0.1' || 
                           hostname.startsWith('192.168.') ||
                           hostname.startsWith('10.') ||
                           hostname === '' ||
                           hostname.includes('localhost');
        
        if (!isLocalhost && hostname.includes('.')) {
            return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
        }
    }
    // For local development only
    return devUrl;
};

// Create axios instance - baseURL will be set dynamically in interceptor
const api = axios.create({
    headers: {
        'Content-Type': 'application/json'
    }
});

// Set baseURL dynamically before each request and add auth token
api.interceptors.request.use((config) => {
    // Set baseURL dynamically at request time
    if (!config.baseURL) {
        config.baseURL = getApiBaseURL();
        // Version logging is now handled in getApiBaseURL()
    }
    
    // Add auth token to requests
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add timing metadata for response time calculation
    config.metadata = { startTime: Date.now() };
    
    return config;
});

// Handle token expiration
api.interceptors.response.use(
    (response) => {
        // Add end time for response time calculation
        response.config.metadata.endTime = Date.now();
        return response;
    },
    async (error) => {
        // Add end time for response time calculation
        if (error.config?.metadata) {
            error.config.metadata.endTime = Date.now();
        }
        
        // Only log actual errors (not 401s which are handled)
        if (error.response?.status && error.response.status !== 401) {
            console.error('API Error:', error.response.status, error.config?.url, error.message);
        }
        
        if (error.response?.status === 401) {
            // Prevent infinite loops by checking if this is already a refresh request
            if (error.config.url?.includes('/auth/refresh-token')) {
                // This is a refresh token request that failed, don't try to refresh again
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return Promise.reject(error);
            }
            
            // Try to refresh the token
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                try {
                    const response = await authApi.refresh(refreshToken);
                    const newToken = response.data.token;
                    localStorage.setItem('token', newToken);
                    
                    // Retry the original request with new token
                    error.config.headers.Authorization = `Bearer ${newToken}`;
                    return api(error.config);
                } catch (refreshError) {
                    // Refresh failed, clear tokens and redirect to login
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            } else {
                // No refresh token, redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    verifyToken: () => api.get('/auth/verify'),
    logout: () => api.post('/auth/logout'),
    refresh: (refreshToken) => api.post('/auth/refresh-token', { refreshToken })
};

export const locationApi = {
    getNearby: (lat, lon, radius) => 
        api.get(`/location/nearby?lat=${lat}&lon=${lon}&radius=${radius}`),
    updateLocation: (data) => api.post('/location/update', data),
    getHistory: (publicKey, blockchain) => 
        api.get(`/location/${publicKey}/history?blockchain=${blockchain}`)
};

export const alertApi = {
    getAll: () => api.get('/alerts'),
    getPreferences: () => api.get('/alerts/preferences'),
    updatePreferences: (prefs) => api.put('/alerts/preferences', prefs),
    markAsRead: (alertId) => api.patch(`/alerts/${alertId}`),
    getStats: () => api.get('/alerts/stats')
};

export const analyticsApi = {
    getStats: () => api.get('/analytics/stats'),
    getBlockchainDistribution: () => api.get('/analytics/blockchain-distribution'),
    getActivity: (interval, range) => 
        api.get(`/analytics/activity?interval=${interval}&range=${range}`),
    getGeofenceStats: () => api.get('/analytics/geofences'),
    getApiUsage: () => api.get('/analytics/api-usage')
};

export default api; 