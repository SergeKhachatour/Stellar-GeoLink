import React, { useState, useEffect, useRef } from 'react';
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
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    CircularProgress,
    Paper,
    TablePagination
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DataUsage, Key, ContentCopy, AccountBalanceWallet as WalletIcon, Collections as CollectionsIcon, Close as CloseIcon, Send as SendIcon, QrCode as QrCodeIcon } from '@mui/icons-material';
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
import SendPayment from './Wallet/SendPayment';
import ReceivePayment from './Wallet/ReceivePayment';
import NFTLocationMap from './Map/NFTLocationMap';
import ContractDetailsOverlay from './Map/ContractDetailsOverlay';

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
    const [selectedContractRule, setSelectedContractRule] = useState(null);
    const [openContractRuleDialog, setOpenContractRuleDialog] = useState(false);
    const [zoomTarget, setZoomTarget] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [fullscreenMapInstance, setFullscreenMapInstance] = useState(null); // Reserved for future fullscreen map features
    // eslint-disable-next-line no-unused-vars
    const [isFullscreenMapOpen, setIsFullscreenMapOpen] = useState(false); // Reserved for future fullscreen map features
    const [selectedAnalytics, setSelectedAnalytics] = useState(null);
    const [openAnalyticsDialog, setOpenAnalyticsDialog] = useState(false);
    const locationUpdateTimeout = useRef(null); // Debounce location updates
    const [sendPaymentOpen, setSendPaymentOpen] = useState(false);
    const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [matchIndicators, setMatchIndicators] = useState({}); // Track matches: { ruleId: timestamp }
    const [executionIndicators, setExecutionIndicators] = useState({}); // Track executions: { ruleId: timestamp }
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

    // Individual fetch functions to prevent flickering
    const fetchWallets = async () => {
        try {
            const res = await api.get('/user/wallets');
            setWallets(res.data);
        } catch (err) {
            console.warn('Failed to fetch wallets:', err);
        }
    };

    const fetchApiKey = async () => {
        try {
            const res = await api.get('/user/api-keys');
            setApiKey(res.data[0] || null);
        } catch (err) {
            console.warn('Failed to fetch API key:', err);
        }
    };

    const fetchApiUsage = async () => {
        try {
            const res = await api.get('/user/api-usage');
            setApiUsage(res.data);
        } catch (err) {
            console.warn('Failed to fetch API usage:', err);
        }
    };

    const fetchRequestHistory = async () => {
        try {
            const res = await api.get('/user/api-key-requests');
            setRequestHistory(res.data);
        } catch (err) {
            console.warn('Failed to fetch request history:', err);
        }
    };

    const fetchWalletLocations = async () => {
        try {
            const res = await api.get('/location/dashboard/wallet-locations');
            setWalletLocations(res.data);
        } catch (err) {
            console.warn('Failed to fetch wallet locations:', err);
        }
    };

    const fetchNFTs = async () => {
        try {
            const res = await api.get('/nft/public');
            setNfts(res.data.nfts || []);
        } catch (err) {
            console.warn('Failed to fetch NFTs:', err);
        }
    };

    const fetchContractRules = async () => {
        try {
            // Try authenticated endpoint first, fallback to public if it fails
            let res = await api.get('/contracts/execution-rules/locations').catch(() => null);
            if (!res || !res.data?.success) {
                // Fallback to public endpoint
                res = await api.get('/contracts/execution-rules/locations/public').catch(() => ({ data: { success: false, rules: [] } }));
            }
            setContractRules(res?.data?.rules || []);
        } catch (err) {
            console.warn('Failed to fetch contract rules:', err);
            // Try public endpoint as last resort
            try {
                const publicRes = await api.get('/contracts/execution-rules/locations/public');
                setContractRules(publicRes.data?.rules || []);
            } catch (publicErr) {
                console.warn('Failed to fetch public contract rules:', publicErr);
                setContractRules([]);
            }
        }
    };

    const fetchMarketAnalysis = async () => {
        try {
            const res = await api.get('/wallet-provider/market-analysis');
            setMarketAnalysis(res.data);
        } catch (marketErr) {
            console.warn('Market analysis not available:', marketErr);
            setMarketAnalysis(null);
        }
    };

    // Initial data load - fetch all at once for first load
    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            // Fetch all data in parallel for initial load
            await Promise.all([
                fetchWallets(),
                fetchApiKey(),
                fetchApiUsage(),
                fetchRequestHistory(),
                fetchWalletLocations(),
                fetchNFTs(),
                fetchContractRules(),
                fetchMarketAnalysis()
            ]);
        } catch (err) {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        
        // Get user's current location and enable continuous tracking
        if (navigator.geolocation) {
            // First get current position immediately
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    console.warn('Could not get user location:', error);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            
            // Then watch position for continuous updates as user navigates
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const newLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                    setUserLocation(newLocation);
                    console.log('[WalletProviderDashboard] Location updated:', newLocation);
                },
                (error) => {
                    console.warn('[WalletProviderDashboard] Location tracking error:', error);
                },
                { 
                    enableHighAccuracy: true, 
                    timeout: 10000, 
                    maximumAge: 5000 // Update every 5 seconds max
                }
            );
            
            // Cleanup watchPosition on unmount
            return () => {
                if (watchId !== null) {
                    navigator.geolocation.clearWatch(watchId);
                }
                // Clear any pending location updates
                if (locationUpdateTimeout.current) {
                    clearTimeout(locationUpdateTimeout.current);
                }
            };
        }

        // Listen for rule changes from ContractManagement
        const handleRuleChange = () => {
            fetchContractRules();
        };
        window.addEventListener('contractRuleChanged', handleRuleChange);

        return () => {
            window.removeEventListener('contractRuleChanged', handleRuleChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isConnected, publicKey, connectWalletViewOnly]);

    // Automatically update wallet location when user location changes
    useEffect(() => {
        // Only update if user is connected, has a public key, and location is available
        if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
            return;
        }

        if (!isConnected || !publicKey) {
            console.log('[WalletProviderDashboard] Not updating wallet location - wallet not connected');
            return;
        }

        // Debounce location updates to avoid too many API calls (update every 10 seconds)
        if (locationUpdateTimeout.current) {
            clearTimeout(locationUpdateTimeout.current);
        }

        locationUpdateTimeout.current = setTimeout(async () => {
            try {
                // Check if user has API key (required for /location/update endpoint)
                if (!apiKey || !apiKey.api_key) {
                    console.log('[WalletProviderDashboard] Skipping wallet location update - no API key available');
                    return;
                }

                console.log('[WalletProviderDashboard] Updating wallet location automatically:', {
                    public_key: publicKey,
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude
                });

                // Update wallet location in database
                // Note: This endpoint requires API key authentication
                // If it fails with 401/403, it won't cause logout (added to non-critical endpoints)
                try {
                    await api.post('/location/update', {
                        public_key: publicKey,
                        blockchain: 'Stellar',
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude,
                        description: 'Auto-updated from user location tracking'
                    }, {
                        headers: {
                            'X-API-Key': apiKey.api_key  // Add API key to request header
                        }
                    });

                    console.log('[WalletProviderDashboard] Wallet location updated successfully');
                    
                    // Refresh wallet locations to show updated position
                    fetchWalletLocations();
                } catch (updateError) {
                    // Handle specific error cases - prevent them from propagating to interceptor
                    if (updateError.response?.status === 401 || updateError.response?.status === 403) {
                        console.warn('[WalletProviderDashboard] Location update failed - authentication error. This is expected if API key is invalid.');
                        // Don't throw - prevent logout
                        return;
                    }
                    // For other errors, log but don't throw
                    console.warn('[WalletProviderDashboard] Location update failed:', updateError.message);
                }
            } catch (error) {
                // Catch any unexpected errors
                console.warn('[WalletProviderDashboard] Error in location update process:', error);
                // Don't show error to user - this is background update
            }
        }, 10000); // Update every 10 seconds

        return () => {
            if (locationUpdateTimeout.current) {
                clearTimeout(locationUpdateTimeout.current);
            }
        };
    }, [userLocation, isConnected, publicKey, apiKey]); // Added apiKey to dependencies

    // Check for new matches and executions
    const checkForMatchesAndExecutions = async () => {
        try {
            // Check for pending rules (matches)
            const pendingRes = await api.get('/contracts/rules/pending').catch(() => ({ data: { success: false, pending_rules: [] } }));
            if (pendingRes.data.success && pendingRes.data.pending_rules) {
                const newMatches = {};
                pendingRes.data.pending_rules.forEach(rule => {
                    if (rule.rule_id) {
                        newMatches[rule.rule_id] = Date.now();
                    }
                });
                setMatchIndicators(prev => {
                    const updated = { ...prev, ...newMatches };
                    // Remove indicators older than 10 seconds
                    const now = Date.now();
                    Object.keys(updated).forEach(key => {
                        if (now - updated[key] > 10000) {
                            delete updated[key];
                        }
                    });
                    return updated;
                });
            }

            // Check for recent executions (completed in last 5 seconds)
            const completedRes = await api.get('/contracts/rules/completed').catch(() => ({ data: { success: false, completed_rules: [] } }));
            if (completedRes.data.success && completedRes.data.completed_rules) {
                const now = Date.now();
                const newExecutions = {};
                completedRes.data.completed_rules.forEach(rule => {
                    if (rule.rule_id && rule.completed_at) {
                        const completedTime = new Date(rule.completed_at).getTime();
                        // Only show if completed within last 5 seconds
                        if (now - completedTime < 5000) {
                            newExecutions[rule.rule_id] = Date.now();
                        }
                    }
                });
                setExecutionIndicators(prev => {
                    const updated = { ...prev, ...newExecutions };
                    // Remove indicators older than 5 seconds
                    Object.keys(updated).forEach(key => {
                        if (now - updated[key] > 5000) {
                            delete updated[key];
                        }
                    });
                    return updated;
                });
            }
        } catch (err) {
            console.warn('Error checking for matches/executions:', err);
        }
    };

    // Auto-check for matches and executions every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            checkForMatchesAndExecutions();
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const handleNFTDetails = (nft) => {
        setSelectedNFT(nft);
        setOpenNFTDialog(true);
    };

    // Handler for fullscreen map ready
    const handleFullscreenMapReady = (mapInstance) => {
        console.log('[WalletProviderDashboard] Fullscreen map ready:', mapInstance);
        setFullscreenMapInstance(mapInstance);
        setIsFullscreenMapOpen(true);
    };

    // Contract rule details handler
    const handleContractRuleClick = (ruleOrCoords) => {
        // If it's coordinates (from map click), ignore it
        if (ruleOrCoords && typeof ruleOrCoords.lng === 'number' && typeof ruleOrCoords.lat === 'number') {
            console.log('Map clicked (not a marker), ignoring');
            return;
        }
        
        const rule = ruleOrCoords;
        console.log('Contract rule clicked:', rule);
        
        // Validate that the rule has required fields and is actually a contract rule
        if (!rule) {
            console.error('No rule object provided');
            return;
        }
        
        // Only process if this is a contract rule (has rule_name or contract-related fields)
        // Skip if it's a wallet marker (has public_key but no rule_name/contract fields)
        if (rule.public_key && !rule.rule_name && !rule.contract_id && !rule.contract_address) {
            console.log('Skipping wallet marker click - not a contract rule');
            return;
        }
        
        // Ensure the rule has an id - if not, try to get it from the contract_rules array
        if (!rule.id && contractRules && contractRules.length > 0) {
            const fullRule = contractRules.find(r => 
                r.rule_name === rule.rule_name && 
                r.latitude === rule.latitude && 
                r.longitude === rule.longitude
            );
            if (fullRule && fullRule.id) {
                rule.id = fullRule.id;
            }
        }
        
        setSelectedContractRule(rule);
        setOpenContractRuleDialog(true);
        // Zoom to the rule location
        if (rule.latitude && rule.longitude) {
            setZoomTarget({
                latitude: parseFloat(rule.latitude),
                longitude: parseFloat(rule.longitude)
            });
        }
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
            // Refresh only relevant data
            await Promise.all([
                fetchWallets(),
                fetchWalletLocations()
            ]);
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
            <Box 
                display="flex" 
                flexDirection={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between" 
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                gap={{ xs: 2, sm: 0 }}
                mb={3}
            >
                <Typography 
                    variant="h4"
                    sx={{
                        fontSize: { xs: '1.5rem', sm: '2.125rem' },
                        fontWeight: { xs: 500, sm: 400 }
                    }}
                >
                    Wallet Provider Dashboard
                </Typography>
                <Box 
                    display="flex" 
                    gap={1}
                    flexWrap="wrap"
                    width={{ xs: '100%', sm: 'auto' }}
                >
                    {!apiKey && (
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => setRequestFormOpen(true)}
                            startIcon={<Key />}
                            sx={{ 
                                flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                minWidth: { xs: 'auto', sm: 'auto' },
                                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                padding: { xs: '6px 12px', sm: '8px 16px' }
                            }}
                        >
                            Request API Key
                        </Button>
                    )}
                    {apiKey && (
                        <>
                            <Button
                                variant="contained"
                                color="primary"
                                size="small"
                                onClick={() => setRequestFormOpen(true)}
                                startIcon={<Key />}
                                sx={{ 
                                    flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                    minWidth: { xs: 'auto', sm: 'auto' },
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                    padding: { xs: '6px 12px', sm: '8px 16px' },
                                    mr: { xs: 0, sm: 2 }
                                }}
                            >
                                Request Additional Key
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                component={RouterLink}
                                to="/api-keys/manage"
                                startIcon={<DataUsage />}
                                sx={{ 
                                    flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                    minWidth: { xs: 'auto', sm: 'auto' },
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                    padding: { xs: '6px 12px', sm: '8px 16px' }
                                }}
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
                                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    size="small"
                                                    startIcon={<SendIcon />}
                                                    onClick={() => setSendPaymentOpen(true)}
                                                >
                                                    Send Payment
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="primary"
                                                    size="small"
                                                    startIcon={<QrCodeIcon />}
                                                    onClick={() => setReceivePaymentOpen(true)}
                                                >
                                                    Receive
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="secondary"
                                                    size="small"
                                                    onClick={disconnectWallet}
                                                >
                                                    Disconnect Wallet
                                                </Button>
                                            </Box>
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

                    {/* Interactive Map */}
                    <Grid item xs={12} md={7}>
                        <Card sx={{ 
                            height: '100%', 
                            display: 'flex', 
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            <CardContent sx={{ 
                                p: 0, 
                                flex: 1, 
                                display: 'flex', 
                                flexDirection: 'column',
                                '&:last-child': { pb: 0 },
                                height: '100%',
                                overflow: 'hidden'
                            }}>
                                <SharedMap 
                                    enableAdvanced3D={true}
                                    locations={[
                                        // Current user's wallet location (always show at current location if connected)
                                        ...(userLocation && userLocation.latitude && userLocation.longitude && 
                                            isConnected && publicKey
                                            ? (() => {
                                                const userLat = parseFloat(userLocation.latitude);
                                                const userLng = parseFloat(userLocation.longitude);
                                                
                                                // Validate coordinates before adding
                                                if (isNaN(userLat) || isNaN(userLng) || !isFinite(userLat) || !isFinite(userLng)) {
                                                    console.warn('[WalletProviderDashboard] Invalid user location coordinates:', {
                                                        latitude: userLocation.latitude,
                                                        longitude: userLocation.longitude,
                                                        parsedLat: userLat,
                                                        parsedLng: userLng
                                                    });
                                                    return [];
                                                }
                                                
                                                // Ensure coordinates are within valid ranges
                                                if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
                                                    console.warn('[WalletProviderDashboard] User location coordinates out of range:', {
                                                        latitude: userLat,
                                                        longitude: userLng
                                                    });
                                                    return [];
                                                }
                                                
                                                console.log('[WalletProviderDashboard] Adding user location marker:', {
                                                    latitude: userLat,
                                                    longitude: userLng,
                                                    public_key: publicKey
                                                });
                                                
                                                return [{
                                                    latitude: userLat,
                                                    longitude: userLng,
                                                    public_key: publicKey,
                                                    description: `Provider: ${user?.provider_name || 'You'} | Type: Connected Wallet | Status: active`,
                                                    provider_name: user?.provider_name || 'You',
                                                    wallet_type: 'Connected Wallet',
                                                    tracking_status: 'active',
                                                    type: 'wallet',
                                                    marker_type: 'wallet',
                                                    isCurrentUser: true
                                                }];
                                            })()
                                            : []),
                                        // Wallet locations (other users - exclude current user's wallet if it's in the list)
                                        ...walletLocations
                                            .filter(location => 
                                                // Exclude if it's the current user's wallet (we show it above at current location)
                                                !(isConnected && publicKey && location.public_key === publicKey)
                                            )
                                            .filter(location => location.latitude && location.longitude && 
                                                !isNaN(parseFloat(location.latitude)) && !isNaN(parseFloat(location.longitude)))
                                            .map(location => ({
                                                latitude: parseFloat(location.latitude),
                                                longitude: parseFloat(location.longitude),
                                                public_key: location.public_key,
                                                description: `Provider: ${location.provider_name} | Type: ${location.wallet_type} | Status: ${location.tracking_status}`,
                                                provider_name: location.provider_name,
                                                wallet_type: location.wallet_type,
                                                tracking_status: location.tracking_status,
                                                type: 'wallet',
                                                marker_type: 'wallet'
                                            })),
                                        // Contract execution rules (only active ones)
                                        ...contractRules
                                            .filter(rule => rule.latitude && rule.longitude && 
                                                !isNaN(parseFloat(rule.latitude)) && !isNaN(parseFloat(rule.longitude)) &&
                                                rule.is_active !== false) // Only show active rules
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
                                                marker_type: 'contract_rule',
                                                hasMatch: matchIndicators[rule.id] ? true : false,
                                                hasExecution: executionIndicators[rule.id] ? true : false
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
                                    title=""
                                    height="700px"
                                    showControls={true}
                                    onNFTDetails={handleNFTDetails}
                                    onLocationClick={handleContractRuleClick}
                                    zoomTarget={zoomTarget}
                                    initialMapStyle="light-globe"
                                    onFullscreenMapReady={handleFullscreenMapReady}
                                    userLocation={userLocation}
                                />
                            </CardContent>
                        </Card>
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
                onRequestSubmitted={async () => {
                    await Promise.all([
                        fetchApiKey(),
                        fetchRequestHistory()
                    ]);
                }}
            />

            {/* Contract Rule Details Dialog */}
            <ContractDetailsOverlay
                open={openContractRuleDialog}
                onClose={() => {
                    setOpenContractRuleDialog(false);
                    setSelectedContractRule(null);
                }}
                item={selectedContractRule}
                itemType="contract_rule"
                userLocation={userLocation}
            />

            {/* NFT Details Dialog */}
            <Dialog
                open={openNFTDialog}
                onClose={() => setOpenNFTDialog(false)}
                maxWidth="md"
                fullWidth
                sx={{ zIndex: 1500 }} // Higher z-index to appear above fullscreen map
                PaperProps={{ sx: { zIndex: 1500 } }}
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
                                    {(() => {
                                        // Use constructIPFSUrl like SharedMap does
                                        const constructIPFSUrl = (serverUrl, hash) => {
                                            if (!hash) return null;
                                            if (!serverUrl) return `https://ipfs.io/ipfs/${hash}`;
                                            
                                            let baseUrl = serverUrl.trim();
                                            baseUrl = baseUrl.replace(/\/ipfs\/.*$/i, '');
                                            baseUrl = baseUrl.replace(/\/+$/, '');
                                            baseUrl = baseUrl.replace(/^https?:\/\//i, '');
                                            
                                            return `https://${baseUrl}/ipfs/${hash}`;
                                        };
                                        
                                        const imageUrl = constructIPFSUrl(selectedNFT.server_url, selectedNFT.ipfs_hash) 
                                            || selectedNFT.image_url 
                                            || selectedNFT.full_ipfs_url
                                            || 'https://via.placeholder.com/400x400?text=NFT';
                                        
                                        return (
                                            <img
                                                src={imageUrl}
                                                alt={selectedNFT.name || 'NFT'}
                                                style={{
                                                    width: '100%',
                                                    height: 'auto',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                                }}
                                                onError={(e) => {
                                                    e.target.src = 'https://via.placeholder.com/400x400?text=NFT';
                                                }}
                                            />
                                        );
                                    })()}
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
                                    {selectedNFT.description && (
                                        <Typography variant="body2" sx={{ mt: 2, mb: 2 }}>
                                            {selectedNFT.description}
                                        </Typography>
                                    )}
                                </Grid>
                                {/* NFT Location Map */}
                                {selectedNFT.latitude && selectedNFT.longitude && (
                                    <Grid item xs={12}>
                                        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                                            NFT Location
                                        </Typography>
                                        <NFTLocationMap 
                                            nft={selectedNFT}
                                            userLocation={userLocation}
                                        />
                                    </Grid>
                                )}
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
        </Container>
    );
};

export default WalletProviderDashboard; 