import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    Chip,
    IconButton,
    Tooltip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    CircularProgress,
    Paper,
    TablePagination
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DataUsage, Key, ContentCopy, ExpandMore, Code, Description, AccountBalanceWallet as WalletIcon, Collections as CollectionsIcon, Close as CloseIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../utils/api';
import ApiKeyRequestForm from './shared/ApiKeyRequestForm';
import SharedMap from './SharedMap';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '../contexts/AuthContext';
import WalletConnectionDialog from './Wallet/WalletConnectionDialog';
import SmartWalletBalance from './Home/SmartWalletBalance';
import AIChat from './AI/AIChat';
import ContractManagement from './Contracts/ContractManagement';

const WalletProviderDashboard = () => {
    const { user } = useAuth();
    const [wallets, setWallets] = useState([]);
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState([]);
    const [walletLocations, setWalletLocations] = useState([]);
    const [nfts, setNfts] = useState([]);
    const [contractRules, setContractRules] = useState([]);
    const [, setRequestHistory] = useState([]);
    const [, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [requestFormOpen, setRequestFormOpen] = useState(false);
    const [marketAnalysis, setMarketAnalysis] = useState(null);
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [openNFTDialog, setOpenNFTDialog] = useState(false);
    const [zoomTarget, setZoomTarget] = useState(null);
    const [selectedAnalytics, setSelectedAnalytics] = useState(null);
    const [openAnalyticsDialog, setOpenAnalyticsDialog] = useState(false);
  // Pagination for wallets/NFTs table
  const [walletsPage, setWalletsPage] = useState(0);
  const [walletsRowsPerPage, setWalletsRowsPerPage] = useState(10);

    // Wallet state
    const { isConnected, publicKey, disconnectWallet, connectWalletViewOnly, setUser } = useWallet();
    const [walletDialogOpen, setWalletDialogOpen] = useState(false);
    const [newWallet, setNewWallet] = useState({
        public_key: '',
        blockchain: 'Stellar',
        wallet_type_id: '',
        description: '',
        latitude: '',
        longitude: '',
        location_enabled: true
    });

    // Notify WalletContext of current user
    useEffect(() => {
        if (user) {
            setUser(user);
        } else {
            setUser(null);
        }
    }, [user, setUser]);

    // Auto-connect wallet using user's stored public key
    useEffect(() => {
        if (user && user.public_key) {
            const needsReconnection = !isConnected || (publicKey && publicKey !== user.public_key);
            const isDifferentUser = publicKey && publicKey !== user.public_key;
            
            if (isDifferentUser) {
                // Different user, wallet will be cleared by WalletContext
                return;
            }
            
            if (needsReconnection) {
                // Check if there's a saved secret key for this public key
                const savedSecretKey = localStorage.getItem('stellar_secret_key');
                const savedPublicKey = localStorage.getItem('stellar_public_key');
                
                // If we have a secret key saved for this user's public key, don't connect in view-only mode
                // The WalletContext should restore it automatically
                if (savedSecretKey && savedPublicKey === user.public_key) {
                    console.log('WalletProviderDashboard: Secret key found in localStorage, WalletContext will restore it');
                    return;
                }
                
                // Add a delay to allow wallet restoration to complete first
                const connectTimeout = setTimeout(() => {
                    // Double-check that wallet still needs connection and no secret key was restored
                    const currentSecretKey = localStorage.getItem('stellar_secret_key');
                    if (currentSecretKey && localStorage.getItem('stellar_public_key') === user.public_key) {
                        console.log('WalletProviderDashboard: Secret key restored, skipping view-only connection');
                        return;
                    }
                    
                    if (!isConnected || (publicKey && publicKey !== user.public_key)) {
                        console.log('WalletProviderDashboard: Attempting wallet auto-connection (view-only)...');
                        connectWalletViewOnly(user.public_key).catch(error => {
                            console.error('WalletProviderDashboard: Auto-connection failed, will retry:', error);
                            // Retry once after a delay
                            setTimeout(() => {
                                if (!isConnected || (publicKey && publicKey !== user.public_key)) {
                                    console.log('WalletProviderDashboard: Retrying wallet auto-connection...');
                                    connectWalletViewOnly(user.public_key);
                                }
                            }, 1000);
                        });
                    }
                }, 1000);
                
                return () => clearTimeout(connectTimeout);
            }
        }
    }, [user, isConnected, publicKey, connectWalletViewOnly]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [walletsRes, keyRes, usageRes, historyRes, locationsRes, nftsRes, rulesRes] = await Promise.all([
                api.get('/user/wallets'),
                api.get('/user/api-keys'),
                api.get('/user/api-usage'),
                api.get('/user/api-key-requests'),
                api.get('/location/dashboard/wallet-locations'),
                api.get('/nft/public'),
                api.get('/contracts/execution-rules/locations').catch(() => ({ data: { success: false, rules: [] } }))
            ]);
            setWallets(walletsRes.data);
            setApiKey(keyRes.data[0] || null);
            setApiUsage(usageRes.data);
            setRequestHistory(historyRes.data);
            setWalletLocations(locationsRes.data);
            setNfts(nftsRes.data.nfts || []);
            setContractRules(rulesRes.data?.rules || []);
            
            // Try to fetch market analysis separately
            try {
                const marketRes = await api.get('/wallet-provider/market-analysis');
                setMarketAnalysis(marketRes.data);
            } catch (marketErr) {
                console.warn('Market analysis not available:', marketErr);
                setMarketAnalysis(null);
            }
        } catch (err) {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleNFTDetails = (nft) => {
        setSelectedNFT(nft);
        setOpenNFTDialog(true);
    };

    // Analytics details handler
    const handleAnalyticsClick = async (analyticsData, title, page = 1) => {
        setSelectedAnalytics({ data: analyticsData, title, loading: true });
        setOpenAnalyticsDialog(true);
        
        try {
            let endpoint = '';
            let response;

            // Determine which endpoint to call based on the title
            if (title.includes('Your Locations')) {
                endpoint = '/wallet-provider/locations-details';
            } else if (title.includes('Unique Wallets')) {
                endpoint = '/wallet-provider/wallet-locations-details';
            } else if (title.includes('Recent Activity')) {
                endpoint = '/wallet-provider/api-calls-details';
            } else if (title.includes('Analysis Period')) {
                endpoint = '/wallet-provider/locations-details';
            } else if (title.includes('Total NFTs')) {
                endpoint = '/wallet-provider/nft-details';
            } else if (title.includes('Collections')) {
                endpoint = '/wallet-provider/collections-details';
            } else if (title.includes('NFT Managers')) {
                endpoint = '/wallet-provider/nft-managers-details';
            } else if (title.includes('Active NFTs')) {
                endpoint = '/wallet-provider/active-nfts-details';
            }

            if (endpoint) {
                response = await api.get(endpoint, {
                    params: { page, limit: 10 }
                });

                console.log('🔍 Analytics API Response:', {
                    endpoint,
                    response: response.data,
                    hasData: response.data.data,
                    hasPagination: response.data.pagination
                });

                setSelectedAnalytics({
                    title,
                    data: response.data.data || response.data,
                    pagination: response.data.pagination,
                    page,
                    loading: false
                });
            } else {
                // For summary data, just show the formatted cards
                setSelectedAnalytics({
                    title,
                    data: analyticsData,
                    page,
                    loading: false
                });
            }
        } catch (error) {
            console.error('Error fetching detailed data:', error);
            setSelectedAnalytics({ 
                data: analyticsData, 
                title, 
                loading: false, 
                error: 'Failed to load detailed data' 
            });
        }
    };

    const handleCopyApiKey = async () => {
        try {
            await navigator.clipboard.writeText(apiKey.api_key);
            setSuccess('API key copied to clipboard');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to copy API key');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/location/update', newWallet);
            fetchDashboardData();
            setNewWallet({
                public_key: '',
                blockchain: 'Stellar',
                wallet_type_id: '',
                description: '',
                latitude: '',
                longitude: '',
                location_enabled: true
            });
        } catch (error) {
            console.error('Error adding wallet:', error);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Wallet Provider Dashboard
                </Typography>
                <Box>
                    {!apiKey && (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => setRequestFormOpen(true)}
                            startIcon={<Key />}
                        >
                            Request API Key
                        </Button>
                    )}
                    {apiKey && (
                        <>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={() => setRequestFormOpen(true)}
                                startIcon={<Key />}
                                sx={{ mr: 2 }}
                            >
                                Request Additional Key
                            </Button>
                            <Button
                                variant="outlined"
                                component={RouterLink}
                                to="/api-keys/manage"
                                startIcon={<DataUsage />}
                            >
                                Manage API Keys
                            </Button>
                        </>
                    )}
                </Box>
            </Box>

            {/* Combined Smart Wallet Vault & Smart Contract Management Section */}
            <Box sx={{ mb: 4 }}>
                <Grid container spacing={3}>
                    {/* Left Side: Vault & Connected Wallet */}
                    <Grid item xs={12} md={5}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                                    💰 Smart Wallet Vault
                                </Typography>
                                
                                {/* Vault Balance */}
                                <Box sx={{ mb: 3 }}>
                                    <SmartWalletBalance compact={true} />
                                </Box>
                                
                                <Divider sx={{ my: 3 }} />
                                
                                {/* Connected Wallet Status */}
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        Provider Wallet
                                    </Typography>
                                    {isConnected && publicKey ? (
                                        <>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                                Connected wallet:{' '}
                                                <span style={{ fontFamily: 'monospace' }}>
                                                    {publicKey.substring(0, 6)}...{publicKey.substring(publicKey.length - 6)}
                                                </span>
                                            </Typography>
                                            <Button
                                                variant="outlined"
                                                color="secondary"
                                                size="small"
                                                onClick={disconnectWallet}
                                            >
                                                Disconnect Wallet
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                                No Stellar wallet connected. Connect a wallet to submit locations and manage provider assets on-chain.
                                            </Typography>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                size="small"
                                                onClick={() => setWalletDialogOpen(true)}
                                            >
                                                Connect Wallet
                                            </Button>
                                        </>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Right Side: Smart Contract Banner */}
                    <Grid item xs={12} md={7}>
                        <Paper 
                            elevation={3}
                            sx={{ 
                                p: 3,
                                height: '100%',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                borderRadius: 2,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center'
                            }}
                        >
                            <Box>
                                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: 'white' }}>
                                    📜 Smart Contract Management
                                </Typography>
                                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.9)', mb: 2 }}>
                                    Deploy and manage Soroban smart contracts with advanced WASM introspection, automatic function discovery, and intelligent parameter mapping. Configure location-based execution rules with geofencing, quorum-based multi-signature requirements, and real-time contract invocation triggered by wallet location updates.
                                </Typography>
                                <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    <Chip 
                                        label="WASM Parsing" 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                            color: 'white',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }} 
                                    />
                                    <Chip 
                                        label="Function Introspection" 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                            color: 'white',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }} 
                                    />
                                    <Chip 
                                        label="Geofencing Rules" 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                            color: 'white',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }} 
                                    />
                                    <Chip 
                                        label="Quorum Signatures" 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                            color: 'white',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }} 
                                    />
                                    <Chip 
                                        label="Auto-Execution" 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                            color: 'white',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }} 
                                    />
                                </Box>
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
                
                {/* Contract Management Component Below */}
                <Box sx={{ mt: 3 }}>
                    <ContractManagement />
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            <Grid container spacing={3}>
                {/* API Key Status */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Key sx={{ mr: 1 }} />
                                <Typography variant="h6">API Key Management</Typography>
                            </Box>
                            {apiKey ? (
                                <>
                                    <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                        Your API Key:
                                    </Typography>
                                    <Box sx={{ 
                                        bgcolor: 'grey.100',
                                        p: 2,
                                        borderRadius: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        mb: 2
                                    }}>
                                        <Typography
                                            sx={{
                                                fontFamily: 'monospace',
                                                flexGrow: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {apiKey.api_key}
                                        </Typography>
                                        <Tooltip title="Copy to clipboard">
                                            <IconButton onClick={handleCopyApiKey} size="small">
                                                <ContentCopy />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                    <Chip
                                        label={apiKey.status ? 'Active' : 'Inactive'}
                                        color={apiKey.status ? 'success' : 'error'}
                                        size="small"
                                    />
                                </>
                            ) : (
                                <Box>
                                    <Typography color="textSecondary" paragraph>
                                        You don't have an active API key.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={() => setRequestFormOpen(true)}
                                    >
                                        Request API Key
                                    </Button>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* API Usage or Getting Started */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <DataUsage sx={{ mr: 1 }} />
                                <Typography variant="h6">
                                    {apiKey ? 'API Usage Statistics' : 'Getting Started'}
                                </Typography>
                            </Box>
                            {apiKey ? (
                                apiUsage && (
                                    <Box>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Monthly Requests:</strong> {apiUsage.monthly_requests || 0}
                                        </Typography>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Daily Average:</strong> {apiUsage.daily_average || 0}
                                        </Typography>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Last Request:</strong> {apiUsage.last_request_at ? format(new Date(apiUsage.last_request_at), 'MMM d, h:mm a') : 'Never'}
                                        </Typography>
                                    </Box>
                                )
                            ) : (
                                <Box>
                                    <Typography variant="body1" gutterBottom>
                                        Welcome to GeoLink! As a wallet provider, you can:
                                    </Typography>
                                    <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Submit wallet locations to our network
                                        </Typography>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Track user privacy and visibility settings
                                        </Typography>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Access real-time geolocation data
                                        </Typography>
                                    </Box>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={() => setRequestFormOpen(true)}
                                        sx={{ mt: 2 }}
                                    >
                                        Get Started - Request API Key
                                    </Button>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Market Analysis Section */}
                <Grid item xs={12}>
                    <Typography variant="h5" gutterBottom sx={{ mt: 3, mb: 2 }}>
                        📊 Market Analysis
                    </Typography>
                </Grid>
                
                {marketAnalysis ? (
                    <>
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis.provider_statistics, 'Your Locations Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="primary">Your Locations</Typography>
                                    <Typography variant="h4">{marketAnalysis.provider_statistics?.total_locations || 0}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis.provider_statistics, 'Unique Wallets Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="secondary">Unique Wallets</Typography>
                                    <Typography variant="h4">{marketAnalysis.provider_statistics?.unique_wallets || 0}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis.provider_statistics, 'Recent Activity Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="success.main">Recent Activity</Typography>
                                    <Typography variant="h4">{marketAnalysis.provider_statistics?.recent_activity || 0}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis, 'Analysis Period Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="info.main">Analysis Period</Typography>
                                    <Typography variant="h4">{marketAnalysis.analysis_period_days || 30} days</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        {/* NFT Market Data */}
                        {marketAnalysis.nft_market_data && (
                            <>
                                <Grid item xs={12} md={3}>
                                    <Card 
                                        sx={{ 
                                            bgcolor: 'primary.light', 
                                            color: 'primary.contrastText',
                                            cursor: 'pointer', 
                                            '&:hover': { boxShadow: 3 } 
                                        }}
                                        onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_data, 'Total NFTs Details')}
                                    >
                                        <CardContent>
                                            <Typography variant="h6">Total NFTs</Typography>
                                            <Typography variant="h4">{marketAnalysis.nft_market_data.total_nfts || 0}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                
                                <Grid item xs={12} md={3}>
                                    <Card 
                                        sx={{ 
                                            bgcolor: 'primary.light', 
                                            color: 'primary.contrastText',
                                            cursor: 'pointer', 
                                            '&:hover': { boxShadow: 3 } 
                                        }}
                                        onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_data, 'Collections Details')}
                                    >
                                        <CardContent>
                                            <Typography variant="h6">Collections</Typography>
                                            <Typography variant="h4">{marketAnalysis.nft_market_data.total_collections || 0}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                
                                <Grid item xs={12} md={3}>
                                    <Card 
                                        sx={{ 
                                            bgcolor: 'primary.light', 
                                            color: 'primary.contrastText',
                                            cursor: 'pointer', 
                                            '&:hover': { boxShadow: 3 } 
                                        }}
                                        onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_data, 'NFT Managers Details')}
                                    >
                                        <CardContent>
                                            <Typography variant="h6">NFT Managers</Typography>
                                            <Typography variant="h4">{marketAnalysis.nft_market_data.unique_nft_managers || 0}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                
                                <Grid item xs={12} md={3}>
                                    <Card 
                                        sx={{ 
                                            bgcolor: 'primary.light', 
                                            color: 'primary.contrastText',
                                            cursor: 'pointer', 
                                            '&:hover': { boxShadow: 3 } 
                                        }}
                                        onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_data, 'Active NFTs Details')}
                                    >
                                        <CardContent>
                                            <Typography variant="h6">Active NFTs</Typography>
                                            <Typography variant="h4">{marketAnalysis.nft_market_data.active_nfts || 0}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </>
                        )}
                    </>
                ) : (
                    <Grid item xs={12}>
                        <Card>
                            <CardContent>
                                <Typography variant="body1" color="textSecondary" align="center">
                                    Market analysis data is not available at the moment. 
                                    This feature requires location data to be available in the system.
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                )}

                {/* Interactive Map */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>🗺️ Wallet Locations & NFTs Map</Typography>
                            <SharedMap 
                                locations={[
                                    // Wallet locations
                                    ...walletLocations
                                        .filter(location => location.latitude && location.longitude && 
                                            !isNaN(parseFloat(location.latitude)) && !isNaN(parseFloat(location.longitude)))
                                        .map(location => ({
                                            latitude: parseFloat(location.latitude),
                                            longitude: parseFloat(location.longitude),
                                            public_key: location.public_key,
                                            description: `Provider: ${location.provider_name} | Type: ${location.wallet_type} | Status: ${location.tracking_status}`,
                                            type: 'wallet',
                                            marker_type: 'wallet'
                                        })),
                                    // Contract execution rules
                                    ...contractRules
                                        .filter(rule => rule.latitude && rule.longitude && 
                                            !isNaN(parseFloat(rule.latitude)) && !isNaN(parseFloat(rule.longitude)))
                                        .map(rule => ({
                                            latitude: parseFloat(rule.latitude),
                                            longitude: parseFloat(rule.longitude),
                                            id: rule.id,
                                            rule_name: rule.rule_name,
                                            function_name: rule.function_name,
                                            contract_name: rule.contract_name,
                                            contract_address: rule.contract_address,
                                            trigger_on: rule.trigger_on,
                                            radius_meters: rule.radius_meters,
                                            auto_execute: rule.auto_execute,
                                            description: `Contract Rule: ${rule.rule_name} | Function: ${rule.function_name}`,
                                            type: 'contract_rule',
                                            marker_type: 'contract_rule'
                                        })),
                                    // NFTs
                                    ...nfts
                                        .filter(nft => nft.latitude && nft.longitude && 
                                            !isNaN(parseFloat(nft.latitude)) && !isNaN(parseFloat(nft.longitude)))
                                        .map(nft => ({
                                            latitude: parseFloat(nft.latitude),
                                            longitude: parseFloat(nft.longitude),
                                            id: nft.id,
                                            name: nft.name || 'NFT',
                                            description: `NFT: ${nft.name || 'Unnamed'} | Collection: ${nft.collection?.name || 'Unknown'}`,
                                            type: 'nft',
                                            marker_type: 'nft',
                                            image_url: nft.image_url,
                                            ipfs_hash: nft.ipfs_hash,
                                            server_url: nft.server_url,
                                            full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
                                            collection: nft.collection
                                        }))
                                ]}
                                title="Your Wallet Locations & NFTs"
                                height="700px"
                                showControls={true}
                                onNFTDetails={handleNFTDetails}
                                zoomTarget={zoomTarget}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Wallet Management */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Manage Wallets</Typography>
                            <form onSubmit={handleSubmit}>
                                {/* Form fields for new wallet */}
                            </form>

                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Public Key</TableCell>
                                            <TableCell>Blockchain</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Description</TableCell>
                                            <TableCell>Location</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {/* Combine wallets and NFTs, then paginate */}
                                        {(() => {
                                            const allItems = [
                                                ...wallets.map(w => ({ ...w, type: 'wallet' })),
                                                ...nfts.map(n => ({ ...n, type: 'nft' }))
                                            ];
                                            const paginatedItems = allItems.slice(
                                                walletsPage * walletsRowsPerPage,
                                                walletsPage * walletsRowsPerPage + walletsRowsPerPage
                                            );
                                            
                                            return paginatedItems.map((item) => (
                                                item.type === 'wallet' ? (
                                                    <TableRow key={`wallet-${item.id}`}>
                                                        <TableCell>{item.public_key}</TableCell>
                                                        <TableCell>{item.blockchain}</TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label="Wallet" 
                                                                color="primary" 
                                                                size="small"
                                                                icon={<WalletIcon />}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{item.description}</TableCell>
                                                        <TableCell>{`${item.latitude}, ${item.longitude}`}</TableCell>
                                                        <TableCell>{item.location_enabled ? 'Active' : 'Disabled'}</TableCell>
                                                        <TableCell>
                                                            <Button size="small" variant="outlined" sx={{ mr: 1 }}>
                                                                Edit
                                                            </Button>
                                                            <Button size="small" variant="outlined">
                                                                {item.location_enabled ? 'Disable' : 'Enable'}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    <TableRow key={`nft-${item.id}`}>
                                                        <TableCell>{item.pinned_by_user}</TableCell>
                                                        <TableCell>Stellar</TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label="NFT" 
                                                                color="secondary" 
                                                                size="small"
                                                                icon={<CollectionsIcon />}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{item.name || 'Unnamed NFT'}</TableCell>
                                                        <TableCell>{`${item.latitude}, ${item.longitude}`}</TableCell>
                                                        <TableCell>{item.is_active ? 'Active' : 'Inactive'}</TableCell>
                                                        <TableCell>
                                                            <Button size="small" variant="outlined" sx={{ mr: 1 }}>
                                                                View
                                                            </Button>
                                                            <Button size="small" variant="outlined">
                                                                Details
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            ));
                                        })()}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <TablePagination
                                component="div"
                                count={(() => {
                                    // Calculate actual combined array length
                                    const allItems = [
                                        ...wallets.map(w => ({ ...w, type: 'wallet' })),
                                        ...nfts.map(n => ({ ...n, type: 'nft' }))
                                    ];
                                    return allItems.length;
                                })()}
                                page={walletsPage}
                                onPageChange={(event, newPage) => setWalletsPage(newPage)}
                                rowsPerPage={walletsRowsPerPage}
                                onRowsPerPageChange={(event) => {
                                    setWalletsRowsPerPage(parseInt(event.target.value, 10));
                                    setWalletsPage(0);
                                }}
                                rowsPerPageOptions={[5, 10, 25, 50]}
                            />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>


            <ApiKeyRequestForm
                open={requestFormOpen}
                onClose={() => setRequestFormOpen(false)}
                userType="wallet_provider"
                onRequestSubmitted={fetchDashboardData}
            />

            {/* NFT Details Dialog */}
            <Dialog
                open={openNFTDialog}
                onClose={() => setOpenNFTDialog(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    NFT Details
                    <IconButton
                        aria-label="close"
                        onClick={() => setOpenNFTDialog(false)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selectedNFT && (
                        <Box>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    {selectedNFT.full_ipfs_url && (
                                        <img
                                            src={selectedNFT.full_ipfs_url}
                                            alt={selectedNFT.name || 'NFT'}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                            }}
                                        />
                                    )}
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" gutterBottom>
                                        {selectedNFT.name || 'Unnamed NFT'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Collection: {selectedNFT.collection?.name || 'Unknown'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Location: {selectedNFT.latitude}, {selectedNFT.longitude}
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        sx={{ mt: 1 }}
                                        onClick={() => {
                                            setZoomTarget({
                                                latitude: parseFloat(selectedNFT.latitude),
                                                longitude: parseFloat(selectedNFT.longitude)
                                            });
                                            setOpenNFTDialog(false);
                                        }}
                                    >
                                        🔍 Zoom to Location
                                    </Button>
                                    {selectedNFT.description && (
                                        <Typography variant="body2" sx={{ mt: 2 }}>
                                            {selectedNFT.description}
                                        </Typography>
                                    )}
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Analytics Details Dialog */}
            <Dialog
                open={openAnalyticsDialog}
                onClose={() => setOpenAnalyticsDialog(false)}
                maxWidth="lg"
                fullWidth
                fullScreen={window.innerWidth < 900}
                sx={{
                    '& .MuiDialog-paper': {
                        margin: window.innerWidth < 900 ? 0 : '32px',
                        maxHeight: window.innerWidth < 900 ? '100vh' : '90vh',
                        width: window.innerWidth < 900 ? '100vw' : 'auto'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {selectedAnalytics?.title || 'Analytics Details'}
                    <IconButton onClick={() => setOpenAnalyticsDialog(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selectedAnalytics && (
                        <Box>
                            {console.log('🔍 Analytics Dialog Data:', {
                                selectedAnalytics,
                                hasData: selectedAnalytics.data,
                                hasPagination: selectedAnalytics.pagination,
                                dataLength: selectedAnalytics.data?.length
                            })}
                            {selectedAnalytics.loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                    <CircularProgress />
                                </Box>
                            ) : selectedAnalytics.error ? (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {selectedAnalytics.error}
                                </Alert>
                            ) : selectedAnalytics.pagination ? (
                                // Show detailed data in table format
                                <Box sx={{ mt: 2 }}>
                                    {/* Mobile Card View */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        {selectedAnalytics.data.map((row, index) => (
                                            <Card key={index} sx={{ mb: 2, p: 2 }}>
                                                {Object.entries(row).map(([key, value]) => (
                                                    <Box key={key} sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: '40%' }}>
                                                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ textAlign: 'right', wordBreak: 'break-word', maxWidth: '60%' }}>
                                                            {typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
                                                             typeof value === 'number' ? value.toLocaleString() :
                                                             value ? String(value) : '-'}
                                                        </Typography>
                                                    </Box>
                                                ))}
                                            </Card>
                                        ))}
                                    </Box>

                                    {/* Desktop Table View */}
                                    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                                        <TableContainer 
                                            component={Paper} 
                                            sx={{ 
                                                maxHeight: 500,
                                                overflow: 'auto',
                                                '& .MuiTable-root': {
                                                    minWidth: 800
                                                }
                                            }}
                                        >
                                            <Table stickyHeader size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        {selectedAnalytics.data.length > 0 && Object.keys(selectedAnalytics.data[0]).map((key) => (
                                                            <TableCell 
                                                                key={key}
                                                                sx={{ 
                                                                    fontWeight: 'bold',
                                                                    backgroundColor: 'primary.main',
                                                                    color: 'primary.contrastText',
                                                                    minWidth: 100,
                                                                    fontSize: '0.875rem',
                                                                    padding: '8px 12px'
                                                                }}
                                                            >
                                                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {selectedAnalytics.data.map((row, index) => (
                                                        <TableRow key={index} hover>
                                                            {Object.values(row).map((value, cellIndex) => (
                                                                <TableCell 
                                                                    key={cellIndex}
                                                                    sx={{ 
                                                                        wordBreak: 'break-word',
                                                                        maxWidth: 150,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        fontSize: '0.875rem',
                                                                        padding: '8px 12px'
                                                                    }}
                                                                    title={typeof value === 'string' && value.length > 20 ? String(value) : undefined}
                                                                >
                                                                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
                                                                     typeof value === 'number' ? value.toLocaleString() :
                                                                     value ? String(value) : '-'}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                    
                                    {/* Pagination controls */}
                                    {selectedAnalytics.pagination && (
                                        <Box sx={{ 
                                            display: 'flex', 
                                            flexDirection: { xs: 'column', sm: 'row' },
                                            justifyContent: 'space-between', 
                                            alignItems: 'center', 
                                            mt: 2,
                                            gap: 2,
                                            p: { xs: 1, sm: 0 }
                                        }}>
                                            <Typography 
                                                variant="body2" 
                                                color="text.secondary" 
                                                sx={{ 
                                                    textAlign: { xs: 'center', sm: 'left' },
                                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                                }}
                                            >
                                                Page {selectedAnalytics.pagination.page} of {selectedAnalytics.pagination.pages} 
                                                ({selectedAnalytics.pagination.total} total items)
                                            </Typography>
                                            <Box sx={{ 
                                                display: 'flex', 
                                                gap: 1,
                                                width: { xs: '100%', sm: 'auto' },
                                                justifyContent: { xs: 'center', sm: 'flex-end' }
                                            }}>
                                                <Button 
                                                    disabled={selectedAnalytics.pagination.page <= 1}
                                                    onClick={() => handleAnalyticsClick(selectedAnalytics.data, selectedAnalytics.title, selectedAnalytics.pagination.page - 1)}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ 
                                                        minWidth: { xs: '80px', sm: 'auto' },
                                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                                    }}
                                                >
                                                    Previous
                                                </Button>
                                                <Button 
                                                    disabled={selectedAnalytics.pagination.page >= selectedAnalytics.pagination.pages}
                                                    onClick={() => handleAnalyticsClick(selectedAnalytics.data, selectedAnalytics.title, selectedAnalytics.pagination.page + 1)}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ 
                                                        minWidth: { xs: '80px', sm: 'auto' },
                                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                                    }}
                                                >
                                                    Next
                                                </Button>
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                // Show summary data in card format
                                <Box sx={{ mt: 2 }}>
                                    <Grid container spacing={2}>
                                        {Object.entries(selectedAnalytics.data).map(([key, value]) => (
                                            <Grid item xs={12} sm={6} md={4} key={key}>
                                                <Card sx={{ 
                                                    p: 2, 
                                                    height: '100%',
                                                    '&:hover': {
                                                        boxShadow: 3
                                                    }
                                                }}>
                                                    <Typography 
                                                        variant="subtitle2" 
                                                        color="text.secondary" 
                                                        gutterBottom
                                                        sx={{ 
                                                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                                            fontWeight: 'bold'
                                                        }}
                                                    >
                                                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                    </Typography>
                                                    <Typography 
                                                        variant="h6" 
                                                        color="primary"
                                                        sx={{ 
                                                            fontSize: { xs: '1rem', sm: '1.25rem' },
                                                            wordBreak: 'break-word'
                                                        }}
                                                    >
                                                        {typeof value === 'number' ? value.toLocaleString() : 
                                                         typeof value === 'object' && value !== null ? 
                                                         (Array.isArray(value) ? `${value.length} items` : 'Object') :
                                                         String(value || '-')}
                                                    </Typography>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>


            {/* Wallet Connection Dialog */}
            <WalletConnectionDialog
                open={walletDialogOpen}
                onClose={() => setWalletDialogOpen(false)}
            />
            
            {/* GeoLink Agent */}
            <AIChat isPublic={false} initialOpen={false} />
        </Container>
    );
};

export default WalletProviderDashboard; 