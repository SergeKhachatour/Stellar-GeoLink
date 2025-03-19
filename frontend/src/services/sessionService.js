import api from '../utils/api';

const sessionService = {
    setToken(token) {
        localStorage.setItem('token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    },

    getToken() {
        return localStorage.getItem('token');
    },

    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },

    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    clearSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    getRole() {
        const user = this.getUser();
        return user ? user.role : null;
    },

    isTokenExpired() {
        const token = this.getToken();
        if (!token) return true;

        try {
            const tokenData = JSON.parse(atob(token.split('.')[1]));
            return tokenData.exp < Math.floor(Date.now() / 1000);
        } catch {
            return true;
        }
    },

    getTokenExpiryTime() {
        const token = this.getToken();
        if (!token) return 0;

        try {
            const tokenData = JSON.parse(atob(token.split('.')[1]));
            return tokenData.exp;
        } catch {
            return 0;
        }
    }
};

export default sessionService; 