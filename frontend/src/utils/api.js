import axios from 'axios';
import sessionService from '../services/sessionService';

// Determine the API base URL based on environment (called at runtime, not build time)
const getApiBaseURL = () => {
    // Always check window.location at runtime (not build time)
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname || '';
        const protocol = window.location.protocol || 'https:';
        const port = window.location.port;
        
        // Explicit check: if we're on HTTPS or have a domain (not localhost), use production URL
        const isLocalhost = hostname === 'localhost' || 
                           hostname === '127.0.0.1' || 
                           hostname.startsWith('192.168.') ||
                           hostname.startsWith('10.') ||
                           hostname === '' ||
                           hostname.includes('localhost');
        
        // If protocol is HTTPS or hostname contains a domain (not localhost), use production
        if (protocol === 'https:' || (!isLocalhost && hostname.includes('.'))) {
            // Production: use same domain as frontend
            return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
        }
    }
    // For local development only
    return process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
};

// Create axios instance - baseURL will be set dynamically in interceptor
const api = axios.create();

// Set baseURL dynamically before each request and add auth token
api.interceptors.request.use((config) => {
    // Set baseURL dynamically at request time
    if (!config.baseURL) {
        config.baseURL = getApiBaseURL();
    }
    
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add timing metadata for response time calculation
    config.metadata = { startTime: Date.now() };
    
    // Log request details
    console.log('🚀 API Request (utils):', {
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

api.interceptors.response.use(
    response => {
        // Add end time for response time calculation
        response.config.metadata.endTime = Date.now();
        
        // Log successful response details
        console.log('✅ API Response (utils):', {
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
    async error => {
        const originalRequest = error.config;
        
        // Add end time for response time calculation
        if (error.config?.metadata) {
            error.config.metadata.endTime = Date.now();
        }
        
        // Log error response details
        console.log('❌ API Error (utils):', {
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

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const response = await api.post('/api/auth/refresh-token');
                sessionService.setToken(response.data.token);
                return api(originalRequest);
            } catch (refreshError) {
                sessionService.clearSession();
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api; 