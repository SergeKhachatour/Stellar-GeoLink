import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import Navbar from './components/Navigation/Navbar';
import HomePage from './components/Home/HomePage';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import ApiKeyManagement from './components/ApiKeyManagement';
import DataConsumerDashboard from './components/DataConsumerDashboard';
import WalletProviderDashboard from './components/WalletProviderDashboard';
import NFTDashboard from './components/NFT/NFTDashboard';

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AuthProvider>
                <WalletProvider>
                    <BrowserRouter>
                    <Navbar />
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route 
                            path="/dashboard/consumer" 
                            element={
                                <ProtectedRoute roles={['data_consumer']}>
                                    <DataConsumerDashboard />
                                </ProtectedRoute>
                            } 
                        />
                        <Route 
                            path="/dashboard/provider" 
                            element={
                                <ProtectedRoute roles={['wallet_provider']}>
                                    <WalletProviderDashboard />
                                </ProtectedRoute>
                            } 
                        />
                        <Route 
                            path="/dashboard/nft" 
                            element={
                                <ProtectedRoute roles={['nft_manager']}>
                                    <NFTDashboard />
                                </ProtectedRoute>
                            } 
                        />
                        <Route 
                            path="/admin" 
                            element={
                                <ProtectedRoute roles={['admin']}>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            } 
                        />
                        <Route 
                            path="/api-keys/manage" 
                            element={
                                <ProtectedRoute>
                                    <ApiKeyManagement />
                                </ProtectedRoute>
                            } 
                        />
                    </Routes>
                    </BrowserRouter>
                </WalletProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App; 
