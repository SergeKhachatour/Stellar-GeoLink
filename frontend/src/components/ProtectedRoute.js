import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children, roles = [] }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    // Don't show loading spinner for too long - if auth check takes more than 3 seconds, assume not logged in
    // This prevents the app from hanging on slow networks or when the backend is slow to respond
    const [showLoading, setShowLoading] = useState(true);
    
    useEffect(() => {
        if (loading) {
            const timer = setTimeout(() => {
                setShowLoading(false);
            }, 3000); // Max 3 seconds loading - prevents indefinite hang on slow networks
            return () => clearTimeout(timer);
        } else {
            setShowLoading(false);
        }
    }, [loading]);

    if (showLoading && loading) {
        return <LoadingSpinner />;
    }

    if (!user) {
        // Only redirect if we're not already on the login page to prevent redirect loops
        if (location.pathname !== '/login') {
            return <Navigate to="/login" state={{ from: location }} replace />;
        }
        return null;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default ProtectedRoute; 