import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Button,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    Grid,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
} from '@mui/material';
import { DataUsage, Key, ContentCopy, Close as CloseIcon, Send as SendIcon, QrCode as QrCodeIcon } from '@mui/icons-material';
import api from '../utils/api';
import ApiKeyRequestForm from './shared/ApiKeyRequestForm';
import SharedMap from './SharedMap';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '../contexts/AuthContext';
import WalletConnectionDialog from './Wallet/WalletConnectionDialog';
import SmartWalletBalance from './Home/SmartWalletBalance';
import AIChat from './AI/AIChat';
import ContractManagement from './Contracts/ContractManagement';
import SendPayment from './Wallet/SendPayment';
import ReceivePayment from './Wallet/ReceivePayment';

const DataConsumerDashboard = () => {
    const { user } = useAuth();
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState(null);
    const [, setRequestHistory] = useState([]);
    const [marketAnalysis, setMarketAnalysis] = useState(null);
    const [walletLocations, setWalletLocations] = useState([]);
    const [nfts, setNfts] = useState([]);
    const [contractRules, setContractRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [requestFormOpen, setRequestFormOpen] = useState(false);
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [openNFTDialog, setOpenNFTDialog] = useState(false);
    const [zoomTarget, setZoomTarget] = useState(null);
    const [selectedAnalytics, setSelectedAnalytics] = useState(null);
    const [openAnalyticsDialog, setOpenAnalyticsDialog] = useState(false);

    // Wallet state
    const { isConnected, publicKey, disconnectWallet, connectWalletViewOnly, setUser } = useWallet();
    const [walletDialogOpen, setWalletDialogOpen] = useState(false);
    const [sendPaymentOpen, setSendPaymentOpen] = useState(false);
    const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);

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
                    console.log('DataConsumerDashboard: Secret key found in localStorage, WalletContext will restore it');
                    return;
                }
                
                // Add a delay to allow wallet restoration to complete first
                const connectTimeout = setTimeout(() => {
                    // Double-check that wallet still needs connection and no secret key was restored
                    const currentSecretKey = localStorage.getItem('stellar_secret_key');
                    if (currentSecretKey && localStorage.getItem('stellar_public_key') === user.public_key) {
                        console.log('DataConsumerDashboard: Secret key restored, skipping view-only connection');
                        return;
                    }
                    
                    if (!isConnected || (publicKey && publicKey !== user.public_key)) {
                        console.log('DataConsumerDashboard: Attempting wallet auto-connection (view-only)...');
                        connectWalletViewOnly(user.public_key).catch(error => {
                            console.error('DataConsumerDashboard: Auto-connection failed, will retry:', error);
                            // Retry once after a delay
                            setTimeout(() => {
                                if (!isConnected || (publicKey && publicKey !== user.public_key)) {
                                    console.log('DataConsumerDashboard: Retrying wallet auto-connection...');
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
            setLoading(true);
            setError('');
            
            // Fetch basic data first
            const [keyRes, usageRes, historyRes, locationsRes, nftsRes, rulesRes] = await Promise.all([
                api.get('/user/api-keys'),
                api.get('/user/api-usage'),
                api.get('/user/api-key-requests'),
                api.get('/location/dashboard/wallet-locations'),
                api.get('/nft/public'),
                api.get('/contracts/execution-rules/locations').catch(() => ({ data: { success: false, rules: [] } }))
            ]);
            
            setApiKey(keyRes.data[0] || null);
            setApiUsage(usageRes.data);
            setRequestHistory(historyRes.data);
            setWalletLocations(locationsRes.data);
            setNfts(nftsRes.data.nfts || []);
            setContractRules(rulesRes.data?.rules || []);
            
            // Try to fetch market analysis separately
            try {
                const marketRes = await api.get('/data-consumer/market-analysis');
                setMarketAnalysis(marketRes.data);
            } catch (marketErr) {
                console.warn('Market analysis not available:', marketErr);
                setMarketAnalysis(null);
            }
            
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
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
            if (title.includes('Total Wallets') || title.includes('Unique Wallets')) {
                endpoint = '/data-consumer/wallet-locations-details';
            } else if (title.includes('Active Providers')) {
                endpoint = '/data-consumer/wallet-providers-details';
            } else if (title.includes('Total Locations')) {
                endpoint = '/data-consumer/locations-details';
            }
            
            if (endpoint) {
                const response = await api.get(`${endpoint}?page=${page}&limit=10`);
                setSelectedAnalytics({ 
                    data: response.data.data, 
                    pagination: response.data.pagination,
                    title, 
                    loading: false 
                });
            } else {
                setSelectedAnalytics({ data: analyticsData, title, loading: false });
            }
        } catch (error) {
            console.error('Error fetching detailed data:', error);
            setSelectedAnalytics({ data: analyticsData, title, loading: false, error: 'Failed to load detailed data' });
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

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Data Consumer Dashboard
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
                                component={Link}
                                to="/api-keys/manage"
                                startIcon={<DataUsage />}
                            >
                                Manage API Keys
                            </Button>
                        </>
                    )}
                </Box>
            </Box>

            {/* Smart Wallet Vault Balance */}
            <Box sx={{ mb: 3 }}>
                <SmartWalletBalance />
            </Box>

            {/* Data Consumer Wallet Status */}
            <Box sx={{ mb: 3 }}>
                <Card>
                    <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                Consumer Wallet
                            </Typography>
                            {isConnected && publicKey ? (
                                <Typography variant="body2" color="text.secondary">
                                    Connected wallet:{' '}
                                    <span style={{ fontFamily: 'monospace' }}>
                                        {publicKey.substring(0, 6)}...{publicKey.substring(publicKey.length - 6)}
                                    </span>
                                </Typography>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    No Stellar wallet connected. Connect a wallet to sign and authenticate on-chain data requests.
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {isConnected && publicKey ? (
                                <>
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        startIcon={<SendIcon />}
                                        onClick={() => setSendPaymentOpen(true)}
                                        sx={{ mr: 1 }}
                                    >
                                        Send Payment
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="secondary"
                                        startIcon={<QrCodeIcon />}
                                        onClick={() => setReceivePaymentOpen(true)}
                                        sx={{ mr: 1 }}
                                    >
                                        Receive
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="secondary"
                                        onClick={disconnectWallet}
                                    >
                                        Disconnect Wallet
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="contained"
                                    onClick={() => setWalletDialogOpen(true)}
                                >
                                    Connect Wallet
                                </Button>
                            )}
                        </Box>
                    </CardContent>
                </Card>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            <Grid container spacing={3}>
                {/* API Key Status */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                API Key Status
                            </Typography>
                            {apiKey ? (
                                <Box>
                                    <Typography variant="body1" gutterBottom>
                                        Active API Key:
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                bgcolor: 'grey.100',
                                                p: 1,
                                                borderRadius: 1
                                            }}
                                        >
                                            {apiKey.api_key}
                                        </Typography>
                                        <Tooltip title="Copy API Key">
                                            <IconButton
                                                onClick={handleCopyApiKey}
                                                size="small"
                                            >
                                                <ContentCopy />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No active API key. Request one to get started.
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* API Usage Stats */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                API Usage Statistics
                            </Typography>
                            {apiUsage ? (
                                <Box>
                                    <Typography>
                                        Requests this month: {apiUsage.monthly_requests}
                                    </Typography>
                                    <Typography>
                                        Daily average: {apiUsage.daily_average}
                                    </Typography>
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No usage data available
                                </Typography>
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
                                onClick={() => handleAnalyticsClick(marketAnalysis.global_statistics, 'Total Wallets Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="primary">Total Wallets</Typography>
                                    <Typography variant="h4">{marketAnalysis.global_statistics?.unique_wallets || 0}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis.global_statistics, 'Active Providers Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="secondary">Active Providers</Typography>
                                    <Typography variant="h4">{marketAnalysis.global_statistics?.active_providers || 0}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        <Grid item xs={12} md={3}>
                            <Card 
                                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                                onClick={() => handleAnalyticsClick(marketAnalysis.global_statistics, 'Total Locations Details')}
                            >
                                <CardContent>
                                    <Typography variant="h6" color="success.main">Total Locations</Typography>
                                    <Typography variant="h4">{marketAnalysis.global_statistics?.total_locations || 0}</Typography>
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

                {/* Market Overview Map */}
                <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                        📍 Market Overview Map
                    </Typography>
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
                        title="Market Overview - Wallets & NFTs"
                        height="600px"
                        showControls={true}
                        onNFTDetails={handleNFTDetails}
                        zoomTarget={zoomTarget}
                    />
                </Grid>
            </Grid>

            <ApiKeyRequestForm
                open={requestFormOpen}
                onClose={() => setRequestFormOpen(false)}
                onSuccess={fetchDashboardData}
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
                            {selectedAnalytics.loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
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
                                                <Card sx={{ p: 2, height: '100%' }}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                    </Typography>
                                                    <Typography variant="h6" color="primary">
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

            {/* Smart Contracts Section */}
            <Box sx={{ mt: 4, mb: 3 }}>
                <Typography variant="h5" gutterBottom>
                    📜 Smart Contract Management
                </Typography>
                <ContractManagement />
            </Box>

            {/* Wallet Connection Dialog */}
            <WalletConnectionDialog
                open={walletDialogOpen}
                onClose={() => setWalletDialogOpen(false)}
            />
            
            {/* Send Payment Dialog */}
            <SendPayment
                open={sendPaymentOpen}
                onClose={() => setSendPaymentOpen(false)}
            />
            
            {/* Receive Payment Dialog */}
            <ReceivePayment
                open={receivePaymentOpen}
                onClose={() => setReceivePaymentOpen(false)}
            />
            
            {/* GeoLink Agent */}
            <AIChat isPublic={false} initialOpen={false} />
        </Container>
    );
};

export default DataConsumerDashboard; 