import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle token expiration
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    verifyToken: () => api.get('/auth/verify')
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