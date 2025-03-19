import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children, roles = [] }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    console.log('Protected Route:', { 
        user, 
        loading, 
        currentPath: location.pathname,
        roles,
        hasRequiredRole: user && roles.includes(user.role)
    });

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!user) {
        console.log('No user found, redirecting to login');
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
        console.log('User role not authorized:', user.role);
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default ProtectedRoute; 