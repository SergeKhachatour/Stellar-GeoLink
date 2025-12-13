import axios from 'axios';

// Version constant to verify deployment - update this to force cache refresh
// Updated: 2025-01-13 16:00 UTC - Force cache refresh for stellargeolink.com
const API_SERVICE_VERSION = 'v2.0.6-2025-01-13-FINAL-FIX';

// CRITICAL: This will show immediately when the module loads
if (typeof window !== 'undefined') {
    console.log(`%c🚀 API Service Module Loaded: ${API_SERVICE_VERSION}`, 'color: #00ff00; font-size: 18px; font-weight: bold; background: #000; padding: 10px; border: 2px solid #00ff00;');
}

// Determine the API base URL based on environment (called at runtime, not build time)
const getApiBaseURL = () => {
    // Always check window.location at runtime (not build time)
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname || '';
        const protocol = window.location.protocol || 'https:';
        const port = window.location.port;
        const origin = window.location.origin;
        
        // CRITICAL: Log version and hostname immediately to verify new code is running
        if (!window._apiVersionLogged) {
            console.log(`%c🔍 [${API_SERVICE_VERSION}] API URL Detection`, 'color: #00ff00; font-size: 16px; font-weight: bold;');
            console.log(`%cHostname: ${hostname}, Protocol: ${protocol}, Origin: ${origin}`, 'color: #00ff00;');
            console.log(`%c✅ NEW CODE IS RUNNING - If you see this, cache is cleared!`, 'color: #00ff00; font-size: 14px; font-weight: bold; background: #000; padding: 5px;');
            window._apiVersionLogged = true;
        }
        
        // PRIORITY 1: Explicit check for stellargeolink.com - ALWAYS production
        // This includes testnet.stellargeolink.com, www.stellargeolink.com, etc.
        // Check both includes and endsWith to catch all subdomains
        if (hostname && (hostname.includes('stellargeolink.com') || hostname.endsWith('.stellargeolink.com') || hostname === 'stellargeolink.com')) {
            const baseUrl = port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
            if (!window._apiBaseUrlLogged) {
                console.log(`🌐 [${API_SERVICE_VERSION}] Production API URL detected (stellargeolink.com):`, { 
                    hostname, 
                    protocol, 
                    port, 
                    origin,
                    baseUrl,
                    version: API_SERVICE_VERSION,
                    'window.location': window.location.href
                });
                window._apiBaseUrlLogged = true;
            }
            return baseUrl;
        }
        
        // PRIORITY 2: Check for azurewebsites.net - ALWAYS production
        if (hostname.includes('azurewebsites.net')) {
            const baseUrl = port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
            if (!window._apiBaseUrlLogged) {
                console.log(`🌐 [${API_SERVICE_VERSION}] Production API URL detected (azurewebsites.net):`, { 
                    hostname, 
                    protocol, 
                    port, 
                    origin,
                    baseUrl,
                    version: API_SERVICE_VERSION
                });
                window._apiBaseUrlLogged = true;
            }
            return baseUrl;
        }
        
        // PRIORITY 3: If protocol is HTTPS, it's production
        if (protocol === 'https:') {
            const baseUrl = port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
            if (!window._apiBaseUrlLogged) {
                console.log(`🌐 [${API_SERVICE_VERSION}] Production API URL detected (HTTPS):`, { 
                    hostname, 
                    protocol, 
                    port, 
                    origin,
                    baseUrl,
                    version: API_SERVICE_VERSION
                });
                window._apiBaseUrlLogged = true;
            }
            return baseUrl;
        }
        
        // PRIORITY 4: Check if it's NOT localhost
        const isLocalhost = hostname === 'localhost' || 
                           hostname === '127.0.0.1' || 
                           hostname.startsWith('192.168.') ||
                           hostname.startsWith('10.') ||
                           hostname === '' ||
                           hostname.includes('localhost');
        
        if (!isLocalhost && hostname.includes('.')) {
            const baseUrl = port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
            if (!window._apiBaseUrlLogged) {
                console.log(`🌐 [${API_SERVICE_VERSION}] Production API URL detected (domain):`, { 
                    hostname, 
                    protocol, 
                    port, 
                    origin,
                    baseUrl,
                    version: API_SERVICE_VERSION
                });
                window._apiBaseUrlLogged = true;
            }
            return baseUrl;
        }
    }
    // For local development only
    const devUrl = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
    if (typeof window !== 'undefined' && !window._apiBaseUrlLogged) {
        console.log(`🏠 [${API_SERVICE_VERSION}] Local development API URL:`, { 
            devUrl,
            version: API_SERVICE_VERSION,
            'window.location': window.location?.href || 'N/A',
            hostname: window.location?.hostname || 'N/A'
        });
        window._apiBaseUrlLogged = true;
    }
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
    
    // Log request details
    console.log('🚀 API Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullURL: `${config.baseURL}${config.url}`,
        headers: config.headers,
        data: config.data,
        params: config.params,
        timestamp: new Date().toISOString()
    });
    
    return config;
});

// Handle token expiration
api.interceptors.response.use(
    (response) => {
        // Add end time for response time calculation
        response.config.metadata.endTime = Date.now();
        
        // Log successful response details
        console.log('✅ API Response:', {
            method: response.config?.method?.toUpperCase(),
            url: response.config?.url,
            fullURL: `${response.config?.baseURL}${response.config?.url}`,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
            responseTime: response.config?.metadata?.endTime - response.config?.metadata?.startTime,
            timestamp: new Date().toISOString()
        });
        
        return response;
    },
    async (error) => {
        // Add end time for response time calculation
        if (error.config?.metadata) {
            error.config.metadata.endTime = Date.now();
        }
        
        // Log error response details
        console.log('❌ API Error:', {
            method: error.config?.method?.toUpperCase(),
            url: error.config?.url,
            fullURL: `${error.config?.baseURL}${error.config?.url}`,
            status: error.response?.status,
            statusText: error.response?.statusText,
            headers: error.response?.headers,
            data: error.response?.data,
            message: error.message,
            responseTime: error.config?.metadata?.endTime - error.config?.metadata?.startTime,
            timestamp: new Date().toISOString()
        });
        
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