import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, Container, Grid, Paper, Typography } from '@mui/material';
import Map from './Map';

const Dashboard = () => {
    const { user } = useAuth();

    if (!user) return null;

    // Redirect based on user role
    switch (user.role) {
        case 'data_consumer':
            return <Navigate to="/dashboard/consumer" replace />;
        case 'wallet_provider':
            return <Navigate to="/dashboard/provider" replace />;
        case 'nft_manager':
            return <Navigate to="/dashboard/nft" replace />;
        case 'admin':
            return <Navigate to="/admin" replace />;
        default:
            return <Navigate to="/" replace />;
    }
};

export default Dashboard; 