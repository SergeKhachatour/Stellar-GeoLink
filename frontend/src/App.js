import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import { AIMapProvider } from './contexts/AIMapContext';
import Navbar from './components/Navigation/Navbar';
import HomePage from './components/Home/HomePage';
import Features from './pages/Features';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import ApiKeyManagement from './components/ApiKeyManagement';
import DataConsumerDashboard from './components/DataConsumerDashboard';
import WalletProviderDashboard from './components/WalletProviderDashboard';
import NFTDashboard from './components/NFT/NFTDashboard';
import EnhancedNFTDashboard from './components/NFT/EnhancedNFTDashboard';
import Profile from './components/Profile';
import NFTCollectionAnalytics from './components/Analytics/NFTCollectionAnalytics';
import WalletConnectionGuard from './components/Wallet/WalletConnectionGuard';

// Inner component that has access to router context
function AppContent() {
    const location = useLocation();
    
    return (
        <>
            <Navbar />
            <Routes key={location.pathname}>
                <Route path="/" element={<HomePage />} />
                <Route path="/features" element={<Features />} />
                <Route path="/contact" element={<HomePage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route 
                    path="/dashboard/consumer" 
                    element={
                        <ProtectedRoute roles={['data_consumer']}>
                            <WalletConnectionGuard>
                                <DataConsumerDashboard />
                            </WalletConnectionGuard>
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/dashboard/provider" 
                    element={
                        <ProtectedRoute roles={['wallet_provider']}>
                            <WalletConnectionGuard>
                                <WalletProviderDashboard />
                            </WalletConnectionGuard>
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/dashboard/nft" 
                    element={
                        <ProtectedRoute roles={['nft_manager']}>
                            <WalletConnectionGuard>
                                <NFTDashboard />
                            </WalletConnectionGuard>
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/enhanced-nft-dashboard" 
                    element={
                        <ProtectedRoute roles={['nft_manager', 'admin']}>
                            <WalletConnectionGuard>
                                <EnhancedNFTDashboard />
                            </WalletConnectionGuard>
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/admin" 
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <WalletConnectionGuard>
                                <AdminDashboard />
                            </WalletConnectionGuard>
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
                <Route 
                    path="/profile" 
                    element={
                        <ProtectedRoute>
                            <Profile />
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/analytics" 
                    element={
                        <ProtectedRoute roles={['nft_manager', 'admin']}>
                            <NFTCollectionAnalytics />
                        </ProtectedRoute>
                    } 
                />
            </Routes>
        </>
    );
}

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AuthProvider>
                <WalletProvider>
                    <AIMapProvider>
                        <BrowserRouter>
                            <AppContent />
                        </BrowserRouter>
                    </AIMapProvider>
                </WalletProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
