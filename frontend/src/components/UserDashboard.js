import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import AdminDashboard from './admin/AdminDashboard';
import DataConsumerDashboard from './DataConsumerDashboard';
import WalletProviderDashboard from './WalletProviderDashboard';
import NFTDashboard from './NFT/NFTDashboard';

const UserDashboard = () => {
    const { user } = useAuth();

    if (!user) {
        return <div>Loading...</div>;
    }

    // Route to appropriate dashboard based on user role
    switch (user.role) {
        case 'admin':
            return <AdminDashboard />;
        case 'data_consumer':
            return <DataConsumerDashboard />;
        case 'wallet_provider':
            return <WalletProviderDashboard />;
        case 'nft_manager':
            return <NFTDashboard />;
        default:
            return (
                <div>
                    <h2>Welcome, {user.firstName}!</h2>
                    <p>Your role: {user.role}</p>
                    <p>No specific dashboard available for your role.</p>
                </div>
            );
    }
};

export default UserDashboard; 