import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api, { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const checkAuth = useCallback(async () => {
        // Don't run checkAuth if we're in the middle of a login process
        if (isLoggingIn) {
            return;
        }
        
        // Add a small delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const token = localStorage.getItem('token');
        
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const response = await authApi.verifyToken();
            
            if (response.data) {
                setUser(response.data);
                
                // Store debug info
                localStorage.setItem('debug_checkAuth', JSON.stringify({
                    timestamp: new Date().toISOString(),
                    user: response.data,
                    success: true
                }));
            } else {
                // Token is invalid or expired
                localStorage.removeItem('token');
                delete api.defaults.headers.common['Authorization'];
                setUser(null);
                
                // Store debug info
                localStorage.setItem('debug_checkAuth', JSON.stringify({
                    timestamp: new Date().toISOString(),
                    success: false,
                    reason: 'no response data'
                }));
                
                // Store when user is cleared
                localStorage.setItem('debug_user_cleared', JSON.stringify({
                    timestamp: new Date().toISOString(),
                    reason: 'no response data from verify'
                }));
                
            }
        } catch (err) {
            console.error('❌ Auth check failed:', err);
            console.error('❌ Auth check error details:', {
                message: err.message,
                status: err.response?.status,
                statusText: err.response?.statusText,
                data: err.response?.data
            });
            console.error('❌ Token being used:', token.substring(0, 20) + '...');
            console.error('❌ Authorization header:', api.defaults.headers.common['Authorization']);
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
            
            // Store debug info
            localStorage.setItem('debug_checkAuth', JSON.stringify({
                timestamp: new Date().toISOString(),
                success: false,
                reason: 'error',
                error: err.message,
                status: err.response?.status,
                statusText: err.response?.statusText
            }));
            
            // Store when user is cleared
            localStorage.setItem('debug_user_cleared', JSON.stringify({
                timestamp: new Date().toISOString(),
                reason: 'checkAuth error',
                error: err.message,
                status: err.response?.status
            }));
            
        } finally {
            setLoading(false);
        }
    }, [isLoggingIn]);

    useEffect(() => {
        // Run checkAuth on initial load only
        checkAuth();
    }, [checkAuth]);

    const login = async (credentials) => {
        try {
            setIsLoggingIn(true);
            // Clear any existing auth data
            localStorage.removeItem('token');
            localStorage.removeItem('debug_login');
            localStorage.removeItem('debug_checkAuth');
            delete api.defaults.headers.common['Authorization'];

            // console.log('🔐 Starting login process for:', credentials.email);
            
            const response = await authApi.login(credentials);
            // console.log('Login response:', response.data);
            // console.log('Login response status:', response.status);
            // console.log('Login response headers:', response.headers);

            // Check if multiple roles require selection
            if (response.data.requiresRoleSelection && response.data.roles) {
                // Return roles for selection instead of logging in
                return {
                    requiresRoleSelection: true,
                    roles: response.data.roles,
                    public_key: response.data.public_key
                };
            }

            const { token, refreshToken, user } = response.data;

            // console.log('Extracted from response:', { token: !!token, refreshToken: !!refreshToken, user: !!user });

            if (!token || !user) {
                console.error('Missing token or user in response:', { token: !!token, user: !!user });
                throw new Error('Invalid response from server');
            }

            // Store tokens and set up API
            localStorage.setItem('token', token);
            // console.log('Token stored in localStorage:', localStorage.getItem('token') ? 'YES' : 'NO');
            
            // Verify token is still there after a short delay
            setTimeout(() => {
                const tokenCheck = localStorage.getItem('token');
                // console.log('Token check after 50ms:', tokenCheck ? 'EXISTS' : 'MISSING');
                if (!tokenCheck) {
                    console.error('❌ Token was cleared after storage!');
                }
            }, 50);

            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
                // console.log('Refresh token stored in localStorage:', localStorage.getItem('refreshToken') ? 'YES' : 'NO');
            }

            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            // console.log('API headers set:', api.defaults.headers.common['Authorization'] ? 'YES' : 'NO');

            // Set user in state
            setUser(user);
            setError(null);
            
            // console.log('Login successful - user set in state:', user);
            // console.log('User state after login:', { id: user.id, email: user.email, role: user.role });
            
            // Store the user in localStorage for debugging
            localStorage.setItem('debug_user_set', JSON.stringify({
                timestamp: new Date().toISOString(),
                user: user,
                success: true
            }));
            
            // Store debug info in localStorage to persist across refreshes
            localStorage.setItem('debug_login', JSON.stringify({
                timestamp: new Date().toISOString(),
                user: user,
                token: !!token,
                refreshToken: !!refreshToken,
                success: true
            }));
            
            // console.log('🔐 Login completed successfully, user role:', user.role);
            
            // Don't set isLoggingIn to false immediately - let the component handle the navigation
            // The isLoggingIn flag will be reset when the component unmounts or when checkAuth runs
            
            return user;
        } catch (err) {
            console.error('Login error:', err);
            setError(err.response?.data?.message || 'Login failed');
            setIsLoggingIn(false);
            throw err;
        }
    };

    const selectRole = async (roleData) => {
        try {
            setIsLoggingIn(true);
            const response = await authApi.selectRole(roleData);
            const { token, refreshToken, user } = response.data;

            if (!token || !user) {
                throw new Error('Invalid response from server');
            }

            localStorage.setItem('token', token);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
            setError(null);
            setIsLoggingIn(false);
            return user;
        } catch (err) {
            console.error('Role selection error:', err);
            setError(err.response?.data?.message || 'Role selection failed');
            setIsLoggingIn(false);
            throw err;
        }
    };

    const register = async (userData) => {
        try {
            const response = await authApi.register(userData);
            setError(null);
            
            // If registration returns a token and user, automatically log them in
            if (response.data && response.data.token && response.data.user) {
                const { token, user } = response.data;
                localStorage.setItem('token', token);
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                setUser(user);
                return { token, user };
            }
            
            return response.data;
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed');
            throw err;
        }
    };

    const logout = async () => {
        try {
            // Call logout endpoint to invalidate refresh token
            const token = localStorage.getItem('token');
            if (token) {
                await authApi.logout();
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage regardless of API call success
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            setUser(null);
            setError(null);
            
            // Dispatch custom event to notify wallet context about logout
            window.dispatchEvent(new CustomEvent('userLogout'));
        }
    };

    const setUserFromToken = (userData) => {
        setUser(userData);
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
                selectRole,
                setUserFromToken,
                isAuthenticated: !!user 
            }}
        >
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext); 