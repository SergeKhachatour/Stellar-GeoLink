import React, { createContext, useState, useContext, useEffect } from 'react';
import api, { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');
        console.log('checkAuth - token from storage:', token ? 'exists' : 'none');

        if (!token) {
            setLoading(false);
            return;
        }

        try {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            console.log('checkAuth - sending request with token');
            const response = await authApi.verifyToken();
            console.log('checkAuth - verify response:', response.data);
            
            if (response.data) {
                setUser(response.data);
                console.log('checkAuth - user set:', response.data);
            } else {
                // Token is invalid or expired
                localStorage.removeItem('token');
                delete api.defaults.headers.common['Authorization'];
                setUser(null);
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const login = async (credentials) => {
        try {
            // Clear any existing auth data
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
            
            const response = await authApi.login(credentials);
            console.log('Login response:', response.data);

            const { token, user } = response.data;
            
            if (!token || !user) {
                throw new Error('Invalid response from server');
            }

            // Store token and set up API
            localStorage.setItem('token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            // Set user in state
            setUser(user);
            setError(null);
            
            console.log('Login successful - user:', user);
            return user;
        } catch (err) {
            console.error('Login error:', err);
            setError(err.response?.data?.message || 'Login failed');
            throw err;
        }
    };

    const register = async (userData) => {
        try {
            await authApi.register(userData);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
            throw err;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setError(null);
    };

    return (
        <AuthContext.Provider 
            value={{ 
                user, 
                loading, 
                error, 
                login, 
                logout, 
                register,
                isAuthenticated: !!user 
            }}
        >
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext); 