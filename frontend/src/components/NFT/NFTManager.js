import React, { useState, useEffect, Component } from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Card,
    CardContent,
    CardMedia,
    Button,
    Grid,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    Snackbar,
    CircularProgress,
    IconButton
} from '@mui/material';
import {
    LocationOn,
    Add,
    Visibility,
    TransferWithinAStation,
    Analytics,
    Edit,
    Delete,
    MyLocation,
    Settings,
    AccountBalanceWallet,
    NavigateBefore,
    NavigateNext,
    Close
} from '@mui/icons-material';
import api from '../../services/api';
import LocationSettings from '../LocationSettings';
import PinNFTMap from './PinNFTMap';
import WalletConnection from '../Wallet/WalletConnection';
import WalletStatus from '../Wallet/WalletStatus';
import NFTTransfer from './NFTTransfer';
import NFT3DMap from './NFT3DMap';
import { useWallet } from '../../contexts/WalletContext';

const NFTManager = () => {
    const { isConnected, publicKey } = useWallet();
    
    const [activeTab, setActiveTab] = useState(0);
    const [nfts, setNfts] = useState([]);
    const [collections, setCollections] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [nearbyNFTs, setNearbyNFTs] = useState([]);
    const [userCollection, setUserCollection] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [walletDialogOpen, setWalletDialogOpen] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [selectedNFTForTransfer, setSelectedNFTForTransfer] = useState(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [carouselOpen, setCarouselOpen] = useState(false);
    const [nearbyCarouselIndex, setNearbyCarouselIndex] = useState(0);
    const [nearbyCarouselOpen, setNearbyCarouselOpen] = useState(false);

    // Dialog states
    const [pinDialogOpen, setPinDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [editingNFT, setEditingNFT] = useState(null);

    // Form states
    const [pinForm, setPinForm] = useState({
        collection_id: '',
        latitude: '',
        longitude: '',
        radius_meters: 10,
        ipfs_hash: '',
        smart_contract_address: ''
    });

    const [transferForm, setTransferForm] = useState({
        to_user_public_key: '',
        transaction_hash: '',
        smart_contract_tx: ''
    });

    const [editFormData, setEditFormData] = useState({
        collection_id: '',
        latitude: '',
        longitude: '',
        radius_meters: 10,
        ipfs_hash: '',
        smart_contract_address: ''
    });

    // Location settings
    const [locationSettingsOpen, setLocationSettingsOpen] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);

    // Confirmation dialog
    const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
    const [pinnedNFT, setPinnedNFT] = useState(null);

    useEffect(() => {
        try {
            loadCollections();
            loadUserCollection();
            getUserLocation();
        } catch (error) {
            console.error('Error in initial useEffect:', error);
        }
    }, []);

    // Keyboard navigation for carousel
    useEffect(() => {
        const handleKeyPress = (event) => {
            try {
                if (!carouselOpen && !nearbyCarouselOpen) return;
                
                if (event.key === 'ArrowLeft') {
                    if (carouselOpen) handlePrevious();
                    if (nearbyCarouselOpen) handleNearbyPrevious();
                } else if (event.key === 'ArrowRight') {
                    if (carouselOpen) handleNext();
                    if (nearbyCarouselOpen) handleNearbyNext();
                } else if (event.key === 'Escape') {
                    if (carouselOpen) handleCloseCarousel();
                    if (nearbyCarouselOpen) handleCloseNearbyCarousel();
                }
            } catch (error) {
                console.error('Error in keyboard navigation:', error);
            }
        };

        if (carouselOpen || nearbyCarouselOpen) {
            document.addEventListener('keydown', handleKeyPress);
            return () => document.removeEventListener('keydown', handleKeyPress);
        }
    }, [carouselOpen, nearbyCarouselOpen]);

    // Load nearby NFTs when user location changes
    useEffect(() => {
        try {
            if (userLocation) {
                loadNearbyNFTs(userLocation.lat, userLocation.lon);
            }
        } catch (error) {
            console.error('Error in location useEffect:', error);
        }
    }, [userLocation]);

    const loadCollections = async () => {
        try {
            const response = await api.get('/nft/collections');
            setCollections(response.data);
        } catch (error) {
            console.error('Error loading collections:', error);
        }
    };

    const loadUserCollection = async () => {
        try {
            const response = await api.get('/nft/user-collection');
            console.log('User collection data:', response.data.collection);
            setUserCollection(response.data.collection);
        } catch (error) {
            console.error('Error loading user collection:', error);
        }
    };

    const getUserLocation = () => {
        if (navigator.geolocation) {
            console.log('Requesting user location...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('Location obtained:', position.coords);
                    const location = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    setUserLocation(location);
                    console.log('User location set:', location);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    let errorMessage = 'Unable to get your location. ';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage += 'Please allow location access.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage += 'Location information is unavailable.';
                            break;
                        case error.TIMEOUT:
                            errorMessage += 'Location request timed out.';
                            break;
                        default:
                            errorMessage += 'Please enable location services.';
                            break;
                    }
                    setError(errorMessage);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    };

    const loadNearbyNFTs = async (lat, lon) => {
        try {
            console.log('Loading nearby NFTs for location:', { lat, lon });
            setLoading(true);
            const response = await api.get(`/nft/nearby?latitude=${lat}&longitude=${lon}&radius=1000`);
            console.log('Nearby NFTs API response:', response.data);
            const nfts = response.data.nfts || [];
            console.log('Setting nearby NFTs:', nfts);
            setNearbyNFTs(nfts);
            
            if (nfts.length === 0) {
                console.log('No NFTs found nearby');
            }
        } catch (error) {
            console.error('Error loading nearby NFTs:', error);
            setError('Failed to load nearby NFTs. Please try again.');
            setNearbyNFTs([]);
        } finally {
            setLoading(false);
        }
    };

    const handlePinNFT = async () => {
        try {
            setLoading(true);
            const response = await api.post('/nft/pin', pinForm);
            const pinnedNFTData = response.data.nft;
            
            // Get collection details for the confirmation
            const collection = collections.find(c => c.id === parseInt(pinForm.collection_id));
            
            setPinnedNFT({
                ...pinnedNFTData,
                collection_name: collection?.name || 'Unknown Collection',
                collection_description: collection?.description || '',
                collection_image: collection?.image_url || '',
                collection_rarity: collection?.rarity_level || 'common'
            });
            
            setPinDialogOpen(false);
            setConfirmationDialogOpen(true);
            
            // Reset form
            setPinForm({
                collection_id: '',
                latitude: '',
                longitude: '',
                radius_meters: 10,
                ipfs_hash: '',
                smart_contract_address: ''
            });
            
            // Refresh all data
            await refreshAllData();
            
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to pin NFT');
        } finally {
            setLoading(false);
        }
    };

    const refreshAllData = async () => {
        try {
            await Promise.all([
                loadCollections(),
                loadUserCollection(),
                userLocation ? loadNearbyNFTs(userLocation.lat, userLocation.lon) : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Error refreshing data:', error);
        }
    };

    const handleLocationUpdate = (location) => {
        setCurrentLocation(location);
        if (location) {
            setPinForm(prev => ({
                ...prev,
                latitude: location.lat.toString(),
                longitude: location.lon.toString()
            }));
        }
    };

    const useCurrentLocation = () => {
        if (currentLocation) {
            setPinForm(prev => ({
                ...prev,
                latitude: currentLocation.lat.toString(),
                longitude: currentLocation.lon.toString()
            }));
        } else {
            setError('No location available. Please enable location services.');
        }
    };

    const handleCollectNFT = async (nftId) => {
        try {
            setLoading(true);
            await api.post('/nft/collect', {
                nft_id: nftId,
                user_latitude: userLocation.lat,
                user_longitude: userLocation.lon
            });
            setSuccess('NFT collected successfully!');
            loadUserCollection();
            loadNearbyNFTs(userLocation.lat, userLocation.lon);
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to collect NFT');
        } finally {
            setLoading(false);
        }
    };

    const handleEditNFT = (nft) => {
        setEditingNFT(nft);
        setEditFormData({
            collection_id: nft.collection_id,
            latitude: nft.latitude,
            longitude: nft.longitude,
            radius_meters: nft.radius_meters,
            ipfs_hash: nft.ipfs_hash,
            smart_contract_address: nft.smart_contract_address
        });
        setEditDialogOpen(true);
    };

    const handleDeleteNFT = async (nftId) => {
        if (window.confirm('Are you sure you want to delete this NFT?')) {
            try {
                setLoading(true);
                await api.delete(`/nft/${nftId}`);
                setSuccess('NFT deleted successfully!');
                loadNearbyNFTs(userLocation.lat, userLocation.lon);
                loadUserCollection();
            } catch (error) {
                setError(error.response?.data?.error || 'Failed to delete NFT');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleEditSubmit = async () => {
        try {
            setLoading(true);
            await api.put(`/nft/${editingNFT.id}`, editFormData);
            setSuccess('NFT updated successfully!');
            setEditDialogOpen(false);
            loadNearbyNFTs(userLocation.lat, userLocation.lon);
            loadUserCollection();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to update NFT');
        } finally {
            setLoading(false);
        }
    };

    const handleTransferNFT = async () => {
        try {
            setLoading(true);
            await api.post('/nft/transfer', {
                nft_id: selectedNFT.id,
                ...transferForm
            });
            setSuccess('NFT transferred successfully!');
            setTransferDialogOpen(false);
            setTransferForm({
                to_user_public_key: '',
                transaction_hash: '',
                smart_contract_tx: ''
            });
            loadUserCollection();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to transfer NFT');
        } finally {
            setLoading(false);
        }
    };

    // Carousel functions
    const handleOpenCarousel = (index) => {
        setCarouselIndex(index);
        setCarouselOpen(true);
    };

    const handleCloseCarousel = () => {
        setCarouselOpen(false);
    };

    const handlePrevious = () => {
        setCarouselIndex((prev) => (prev > 0 ? prev - 1 : userCollection.length - 1));
    };

    const handleNext = () => {
        setCarouselIndex((prev) => (prev < userCollection.length - 1 ? prev + 1 : 0));
    };

    // Nearby carousel functions
    const handleOpenNearbyCarousel = (index) => {
        try {
            if (!nearbyNFTs || nearbyNFTs.length === 0) {
                console.warn('No nearby NFTs available for carousel');
                return;
            }
            if (index < 0 || index >= nearbyNFTs.length) {
                console.warn('Invalid carousel index:', index);
                return;
            }
            setNearbyCarouselIndex(index);
            setNearbyCarouselOpen(true);
        } catch (error) {
            console.error('Error opening nearby carousel:', error);
        }
    };

    const handleCloseNearbyCarousel = () => {
        try {
            setNearbyCarouselOpen(false);
        } catch (error) {
            console.error('Error closing nearby carousel:', error);
        }
    };

    const handleNearbyPrevious = () => {
        try {
            if (!nearbyNFTs || nearbyNFTs.length === 0) return;
            setNearbyCarouselIndex((prev) => (prev > 0 ? prev - 1 : nearbyNFTs.length - 1));
        } catch (error) {
            console.error('Error in nearby previous:', error);
        }
    };

    const handleNearbyNext = () => {
        try {
            if (!nearbyNFTs || nearbyNFTs.length === 0) return;
            setNearbyCarouselIndex((prev) => (prev < nearbyNFTs.length - 1 ? prev + 1 : 0));
        } catch (error) {
            console.error('Error in nearby next:', error);
        }
    };

    const getRarityColor = (rarity) => {
        switch (rarity) {
            case 'common': return '#4CAF50';
            case 'rare': return '#2196F3';
            case 'legendary': return '#9C27B0';
            default: return '#757575';
        }
    };

    const TabPanel = ({ children, value, index }) => (
        <div hidden={value !== index}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );

    try {
        return (
            <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom>
                NFT Manager
            </Typography>

            {/* Wallet Status */}
            <Box sx={{ mb: 3 }}>
                <WalletStatus />
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
                    <Tab label="Nearby NFTs" icon={<LocationOn />} />
                    <Tab label="My Collection" icon={<Visibility />} />
                    <Tab label="Pin NFT" icon={<Add />} />
                    <Tab label="Analytics" icon={<Analytics />} />
                </Tabs>
                <Box sx={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 16,
                    zIndex: 1,
                    display: 'flex',
                    gap: 1,
                    '@media (max-width: 600px)': {
                        position: 'static',
                        display: 'flex',
                        justifyContent: 'center',
                        mt: 1,
                        mb: 1
                    }
                }}>
                    {!isConnected && (
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<AccountBalanceWallet />}
                            onClick={() => setWalletDialogOpen(true)}
                            sx={{
                                '@media (max-width: 600px)': {
                                    fontSize: '0.75rem',
                                    px: 1,
                                    py: 0.5
                                }
                            }}
                        >
                            Connect Wallet
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Settings />}
                        onClick={() => setLocationSettingsOpen(true)}
                        sx={{
                            '@media (max-width: 600px)': {
                                fontSize: '0.75rem',
                                px: 1,
                                py: 0.5
                            }
                        }}
                    >
                        Location Settings
                    </Button>
                </Box>
            </Box>

            <TabPanel value={activeTab} index={0}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        NFTs Near You
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            if (userLocation) {
                                loadNearbyNFTs(userLocation.lat, userLocation.lon);
                            } else {
                                getUserLocation();
                            }
                        }}
                        disabled={loading}
                        startIcon={<LocationOn />}
                    >
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                </Box>
                
                {userLocation ? (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Your location: {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}
                    </Typography>
                ) : (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Location not available. Please enable location services and refresh.
                    </Alert>
                )}

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                        <CircularProgress />
                    </Box>
                )}

                {!loading && nearbyNFTs.length === 0 && userLocation && (
                    <Alert severity="info">
                        No NFTs found nearby. Try pinning a new NFT or check a different location.
                    </Alert>
                )}

                {!loading && nearbyNFTs.length > 0 && (
                    <Grid container spacing={1}>
                        {nearbyNFTs.map((nft) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={nft.id}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    {(nft.ipfs_hash || nft.image_url) && (
                                        <CardMedia
                                            component="img"
                                            image={nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : nft.image_url}
                                            alt={nft.collection_name}
                                            sx={{ 
                                                objectFit: 'cover',
                                                width: '100%',
                                                aspectRatio: '1 / 1',
                                                height: 'auto'
                                            }}
                                        />
                                    )}
                                    <CardContent sx={{ flexGrow: 1, p: 1 }}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                {nft.collection_name}
                                            </Typography>
                                            <Chip
                                                label={nft.rarity_level}
                                                size="small"
                                                sx={{ 
                                                    backgroundColor: getRarityColor(nft.rarity_level), 
                                                    color: 'white',
                                                    fontSize: '0.6rem',
                                                    height: '16px'
                                                }}
                                            />
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {nft.distance}m away
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {nft.radius_meters}m radius
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                                            <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => handleCollectNFT(nft.id)}
                                                disabled={!nft.is_within_range || loading}
                                                sx={{ fontSize: '0.7rem', py: 0.5 }}
                                            >
                                                {nft.is_within_range ? 'Collect' : 'Out of Range'}
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => {
                                                    try {
                                                        const index = nearbyNFTs.indexOf(nft);
                                                        if (index >= 0) {
                                                            handleOpenNearbyCarousel(index);
                                                        }
                                                    } catch (error) {
                                                        console.error('Error opening nearby carousel:', error);
                                                    }
                                                }}
                                                sx={{ fontSize: '0.6rem', py: 0.5 }}
                                            >
                                                View
                                            </Button>
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    onClick={() => handleEditNFT(nft)}
                                                    startIcon={<Edit />}
                                                    sx={{ fontSize: '0.6rem', minWidth: 'auto', px: 1 }}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleDeleteNFT(nft.id)}
                                                    startIcon={<Delete />}
                                                    sx={{ fontSize: '0.6rem', minWidth: 'auto', px: 1 }}
                                                >
                                                    Delete
                                                </Button>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </TabPanel>

            <TabPanel value={activeTab} index={1}>
                <Typography variant="h6" gutterBottom>
                    My NFT Collection
                </Typography>
                <Grid container spacing={1}>
                    {userCollection.map((nft) => (
                        <Grid item xs={6} sm={4} md={3} lg={2} key={nft.id}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                {(nft.ipfs_hash || nft.image_url) && (
                                    <CardMedia
                                        component="img"
                                        image={nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : nft.image_url}
                                        alt={nft.collection_name}
                                        sx={{ 
                                            objectFit: 'cover',
                                            width: '100%',
                                            aspectRatio: '1 / 1',
                                            height: 'auto'
                                        }}
                                    />
                                )}
                                <CardContent sx={{ flexGrow: 1, p: 1 }}>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            {nft.collection_name}
                                        </Typography>
                                        <Chip
                                            label={nft.rarity_level}
                                            size="small"
                                            sx={{ 
                                                backgroundColor: getRarityColor(nft.rarity_level), 
                                                color: 'white',
                                                fontSize: '0.6rem',
                                                height: '16px'
                                            }}
                                        />
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Collected: {new Date(nft.collected_at).toLocaleDateString()}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Transfers: {nft.transfer_count}
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={() => {
                                                setSelectedNFTForTransfer(nft);
                                                setTransferDialogOpen(true);
                                            }}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            Transfer
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleOpenCarousel(userCollection.indexOf(nft))}
                                            sx={{ fontSize: '0.6rem', py: 0.5 }}
                                        >
                                            View
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </TabPanel>

            <TabPanel value={activeTab} index={2}>
                <PinNFTMap 
                    onNFTPinned={(nft) => {
                        setSuccess('NFT pinned successfully!');
                        refreshAllData();
                    }}
                    collections={collections}
                />
            </TabPanel>

            <TabPanel value={activeTab} index={3}>
                <Typography variant="h6" gutterBottom>
                    NFT Analytics
                </Typography>
                
                <Grid container spacing={3}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="primary">
                                    {nfts.length}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Total NFTs Nearby
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="secondary">
                                    {userCollection.length}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    My Collection
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="success.main">
                                    {collections.length}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Available Collections
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="warning.main">
                                    {nfts.filter(nft => nft.is_within_range).length}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    In Range
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
                
                <Box sx={{ mt: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        Collection Distribution
                    </Typography>
                    <Grid container spacing={1}>
                        {collections.map((collection) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={collection.id}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    {collection.image_url && (
                                        <CardMedia
                                            component="img"
                                            image={collection.image_url}
                                            alt={collection.name}
                                            sx={{ 
                                                objectFit: 'cover',
                                                width: '100%',
                                                aspectRatio: '1 / 1',
                                                height: 'auto'
                                            }}
                                        />
                                    )}
                                    <CardContent sx={{ flexGrow: 1, p: 1 }}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                {collection.name}
                                            </Typography>
                                            <Chip 
                                                label={collection.rarity_level}
                                                size="small"
                                                color={collection.rarity_level === 'common' ? 'success' : 
                                                       collection.rarity_level === 'rare' ? 'primary' : 'secondary'}
                                                sx={{ 
                                                    fontSize: '0.6rem',
                                                    height: '16px'
                                                }}
                                            />
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {collection.description}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            </TabPanel>

            {/* Pin NFT Dialog */}
            <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Pin NFT to Location</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Collection</InputLabel>
                        <Select
                            value={pinForm.collection_id}
                            onChange={(e) => setPinForm({ ...pinForm, collection_id: e.target.value })}
                        >
                            {collections.map((collection) => (
                                <MenuItem key={collection.id} value={collection.id}>
                                    {collection.name} ({collection.rarity_level})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        label="Latitude"
                        type="number"
                        value={pinForm.latitude}
                        onChange={(e) => setPinForm({ ...pinForm, latitude: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Longitude"
                        type="number"
                        value={pinForm.longitude}
                        onChange={(e) => setPinForm({ ...pinForm, longitude: e.target.value })}
                        margin="normal"
                    />
                    
                    <Box display="flex" gap={1} sx={{ mt: 2 }}>
                        <Button
                            variant="outlined"
                            startIcon={<MyLocation />}
                            onClick={useCurrentLocation}
                            disabled={!currentLocation}
                        >
                            Use Current Location
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<Settings />}
                            onClick={() => setLocationSettingsOpen(true)}
                        >
                            Location Settings
                        </Button>
                    </Box>
                    
                    <TextField
                        fullWidth
                        label="Radius (meters)"
                        type="number"
                        value={pinForm.radius_meters}
                        onChange={(e) => setPinForm({ ...pinForm, radius_meters: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="IPFS Hash"
                        value={pinForm.ipfs_hash}
                        onChange={(e) => setPinForm({ ...pinForm, ipfs_hash: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Smart Contract Address"
                        value={pinForm.smart_contract_address}
                        onChange={(e) => setPinForm({ ...pinForm, smart_contract_address: e.target.value })}
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPinDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handlePinNFT} variant="contained" disabled={loading}>
                        Pin NFT
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Transfer NFT Dialog */}
            <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Transfer NFT</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="To User Public Key"
                        value={transferForm.to_user_public_key}
                        onChange={(e) => setTransferForm({ ...transferForm, to_user_public_key: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Transaction Hash"
                        value={transferForm.transaction_hash}
                        onChange={(e) => setTransferForm({ ...transferForm, transaction_hash: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Smart Contract Transaction"
                        value={transferForm.smart_contract_tx}
                        onChange={(e) => setTransferForm({ ...transferForm, smart_contract_tx: e.target.value })}
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTransferDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleTransferNFT} variant="contained" disabled={loading}>
                        Transfer NFT
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={!!error}
                autoHideDuration={6000}
                onClose={() => setError('')}
            >
                <Alert severity="error" onClose={() => setError('')}>
                    {error}
                </Alert>
            </Snackbar>

            <Snackbar
                open={!!success}
                autoHideDuration={6000}
                onClose={() => setSuccess('')}
            >
                <Alert severity="success" onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            </Snackbar>

            {/* Edit NFT Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit NFT</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Collection</InputLabel>
                        <Select
                            value={editFormData.collection_id}
                            onChange={(e) => setEditFormData({ ...editFormData, collection_id: e.target.value })}
                        >
                            {collections.map((collection) => (
                                <MenuItem key={collection.id} value={collection.id}>
                                    {collection.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    
                    <TextField
                        fullWidth
                        margin="normal"
                        label="Latitude"
                        type="number"
                        value={editFormData.latitude}
                        onChange={(e) => setEditFormData({ ...editFormData, latitude: e.target.value })}
                    />
                    
                    <TextField
                        fullWidth
                        margin="normal"
                        label="Longitude"
                        type="number"
                        value={editFormData.longitude}
                        onChange={(e) => setEditFormData({ ...editFormData, longitude: e.target.value })}
                    />
                    
                    <TextField
                        fullWidth
                        margin="normal"
                        label="Radius (meters)"
                        type="number"
                        value={editFormData.radius_meters}
                        onChange={(e) => setEditFormData({ ...editFormData, radius_meters: e.target.value })}
                    />
                    
                    <TextField
                        fullWidth
                        margin="normal"
                        label="IPFS Hash"
                        value={editFormData.ipfs_hash}
                        onChange={(e) => setEditFormData({ ...editFormData, ipfs_hash: e.target.value })}
                    />
                    
                    <TextField
                        fullWidth
                        margin="normal"
                        label="Smart Contract Address"
                        value={editFormData.smart_contract_address}
                        onChange={(e) => setEditFormData({ ...editFormData, smart_contract_address: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleEditSubmit} variant="contained" disabled={loading}>
                        {loading ? <CircularProgress size={20} /> : 'Update NFT'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* NFT Pin Confirmation Dialog */}
            <Dialog 
                open={confirmationDialogOpen} 
                onClose={() => setConfirmationDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    🎉 NFT Successfully Pinned!
                </DialogTitle>
                <DialogContent>
                    {pinnedNFT && (
                        <Box>
                            {/* Success Message */}
                            <Alert severity="success" sx={{ mb: 3 }}>
                                Your NFT has been successfully pinned to the location and is now available for collection!
                            </Alert>

                            {/* NFT Details */}
                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        {pinnedNFT.collection_name}
                                    </Typography>
                                    
                                    {/* NFT Image */}
                                    {(pinnedNFT.ipfs_hash || pinnedNFT.collection_image) && (
                                        <CardMedia
                                            component="img"
                                            height="200"
                                            image={pinnedNFT.ipfs_hash 
                                                ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${pinnedNFT.ipfs_hash}` 
                                                : pinnedNFT.collection_image}
                                            alt={pinnedNFT.collection_name}
                                            sx={{ objectFit: 'cover', borderRadius: 1, mb: 2 }}
                                        />
                                    )}

                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Collection:</strong> {pinnedNFT.collection_name}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Rarity:</strong> 
                                                <Chip 
                                                    label={pinnedNFT.collection_rarity} 
                                                    size="small" 
                                                    color={pinnedNFT.collection_rarity === 'common' ? 'success' : 
                                                           pinnedNFT.collection_rarity === 'rare' ? 'primary' : 'secondary'}
                                                    sx={{ ml: 1 }}
                                                />
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Location:</strong> {pinnedNFT.latitude}, {pinnedNFT.longitude}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Collection Radius:</strong> {pinnedNFT.radius_meters}m
                                            </Typography>
                                        </Grid>
                                        {pinnedNFT.ipfs_hash && (
                                            <Grid item xs={12}>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>IPFS Hash:</strong> {pinnedNFT.ipfs_hash}
                                                </Typography>
                                            </Grid>
                                        )}
                                        {pinnedNFT.smart_contract_address && (
                                            <Grid item xs={12}>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Smart Contract:</strong> {pinnedNFT.smart_contract_address}
                                                </Typography>
                                            </Grid>
                                        )}
                                    </Grid>
                                </CardContent>
                            </Card>

                            {/* Next Steps */}
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        What's Next?
                                    </Typography>
                                    <Box component="ul" sx={{ pl: 2 }}>
                                        <li>
                                            <Typography variant="body2">
                                                Your NFT is now visible on the map and can be collected by other users
                                            </Typography>
                                        </li>
                                        <li>
                                            <Typography variant="body2">
                                                Check the "Nearby NFTs" tab to see your pinned NFT
                                            </Typography>
                                        </li>
                                        <li>
                                            <Typography variant="body2">
                                                Monitor collection activity in the "Analytics" tab
                                            </Typography>
                                        </li>
                                        <li>
                                            <Typography variant="body2">
                                                You can edit or delete your NFT from the "Manage NFTs" section
                                            </Typography>
                                        </li>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => setConfirmationDialogOpen(false)} 
                        variant="contained" 
                        color="primary"
                        size="large"
                    >
                        Continue
                    </Button>
                </DialogActions>
            </Dialog>

            {/* NFT Details Dialog */}
            <Dialog 
                open={!!selectedNFT} 
                onClose={() => setSelectedNFT(null)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {selectedNFT?.collection_name} Details
                </DialogTitle>
                <DialogContent>
                    {selectedNFT && (
                        <Box>
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                    {(selectedNFT.ipfs_hash || selectedNFT.image_url) && (
                                        <CardMedia
                                            component="img"
                                            height="300"
                                            image={selectedNFT.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${selectedNFT.ipfs_hash}` : selectedNFT.image_url}
                                            alt={selectedNFT.collection_name}
                                            sx={{ borderRadius: 1 }}
                                        />
                                    )}
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" gutterBottom>
                                        {selectedNFT.collection_name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" paragraph>
                                        {selectedNFT.description}
                                    </Typography>
                                    
                                    <Box mb={2}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Rarity Level
                                        </Typography>
                                        <Chip
                                            label={selectedNFT.rarity_level}
                                            sx={{ 
                                                backgroundColor: getRarityColor(selectedNFT.rarity_level), 
                                                color: 'white',
                                                textTransform: 'capitalize'
                                            }}
                                        />
                                    </Box>

                                    <Box mb={2}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Location
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {selectedNFT.latitude}, {selectedNFT.longitude}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Collection radius: {selectedNFT.radius_meters}m
                                        </Typography>
                                    </Box>

                                    {selectedNFT.ipfs_hash && (
                                        <Box mb={2}>
                                            <Typography variant="subtitle2" gutterBottom>
                                                IPFS Hash
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                                {selectedNFT.ipfs_hash}
                                            </Typography>
                                        </Box>
                                    )}

                                    {selectedNFT.smart_contract_address && (
                                        <Box mb={2}>
                                            <Typography variant="subtitle2" gutterBottom>
                                                Smart Contract
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                                {selectedNFT.smart_contract_address}
                                            </Typography>
                                        </Box>
                                    )}

                                    {selectedNFT.current_owner && (
                                        <Box mb={2}>
                                            <Typography variant="subtitle2" gutterBottom>
                                                Current Owner
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                                {selectedNFT.current_owner}
                                            </Typography>
                                        </Box>
                                    )}
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedNFT(null)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Location Settings Dialog */}
            {locationSettingsOpen && (
                <LocationSettings
                    onLocationUpdate={handleLocationUpdate}
                    onClose={() => setLocationSettingsOpen(false)}
                />
            )}

            {/* Wallet Connection Dialog */}
            <WalletConnection
                open={walletDialogOpen}
                onClose={() => setWalletDialogOpen(false)}
            />

            {/* NFT Transfer Dialog */}
            <NFTTransfer
                open={transferDialogOpen}
                onClose={() => {
                    setTransferDialogOpen(false);
                    setSelectedNFTForTransfer(null);
                }}
                nft={selectedNFTForTransfer}
                onTransferComplete={() => {
                    setSuccess('NFT transferred successfully!');
                    refreshAllData();
                }}
            />

            {/* NFT Carousel Dialog */}
            <Dialog
                open={carouselOpen}
                onClose={handleCloseCarousel}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                        position: 'relative'
                    }
                }}
            >
                <Box sx={{ position: 'relative', backgroundColor: 'background.paper', borderRadius: 2, overflow: 'hidden' }}>
                    {/* Close Button */}
                    <IconButton
                        onClick={handleCloseCarousel}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 10,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'rgba(0,0,0,0.7)'
                            }
                        }}
                    >
                        <Close />
                    </IconButton>

                    {/* Navigation Buttons */}
                    {userCollection.length > 1 && (
                        <>
                            <IconButton
                                onClick={handlePrevious}
                                sx={{
                                    position: 'absolute',
                                    left: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    zIndex: 10,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'rgba(0,0,0,0.7)'
                                    }
                                }}
                            >
                                <NavigateBefore />
                            </IconButton>
                            <IconButton
                                onClick={handleNext}
                                sx={{
                                    position: 'absolute',
                                    right: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    zIndex: 10,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'rgba(0,0,0,0.7)'
                                    }
                                }}
                            >
                                <NavigateNext />
                            </IconButton>
                        </>
                    )}

                    {/* NFT Display */}
                    {userCollection[carouselIndex] && (
                        <Box>
                            {/* Image */}
                            {(userCollection[carouselIndex].ipfs_hash || userCollection[carouselIndex].image_url) && (
                                <CardMedia
                                    component="img"
                                    height="400"
                                    image={userCollection[carouselIndex].ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${userCollection[carouselIndex].ipfs_hash}` : userCollection[carouselIndex].image_url}
                                    alt={userCollection[carouselIndex].collection_name}
                                    sx={{ objectFit: 'cover' }}
                                />
                            )}

                            {/* Content */}
                            <CardContent sx={{ p: 3 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <Typography variant="h5" fontWeight="bold">
                                        {userCollection[carouselIndex].collection_name}
                                    </Typography>
                                    <Chip
                                        label={userCollection[carouselIndex].rarity_level}
                                        sx={{
                                            backgroundColor: getRarityColor(userCollection[carouselIndex].rarity_level),
                                            color: 'white',
                                            textTransform: 'capitalize',
                                            fontWeight: 'bold'
                                        }}
                                    />
                                </Box>

                                <Typography variant="body1" color="text.secondary" paragraph>
                                    {userCollection[carouselIndex].description}
                                </Typography>

                                <Grid container spacing={2} mb={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Location
                                        </Typography>
                                        <Typography variant="body2">
                                            {userCollection[carouselIndex].latitude}, {userCollection[carouselIndex].longitude}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Radius: {userCollection[carouselIndex].radius_meters}m
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Collection Info
                                        </Typography>
                                        <Typography variant="body2">
                                            Collected: {new Date(userCollection[carouselIndex].collected_at).toLocaleDateString()}
                                        </Typography>
                                        <Typography variant="body2">
                                            Transfers: {userCollection[carouselIndex].transfer_count}
                                        </Typography>
                                    </Grid>
                                </Grid>

                                {userCollection[carouselIndex].ipfs_hash && (
                                    <Box mb={2}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            IPFS Hash
                                        </Typography>
                                        <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                                            {userCollection[carouselIndex].ipfs_hash}
                                        </Typography>
                                    </Box>
                                )}

                                {userCollection[carouselIndex].smart_contract_address && (
                                    <Box mb={2}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Smart Contract
                                        </Typography>
                                        <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                                            {userCollection[carouselIndex].smart_contract_address}
                                        </Typography>
                                    </Box>
                                )}

                                {/* Action Buttons */}
                                <Box display="flex" gap={2} mt={3}>
                                    {isConnected && (
                                        <Button
                                            variant="contained"
                                            startIcon={<TransferWithinAStation />}
                                            onClick={() => {
                                                setSelectedNFTForTransfer(userCollection[carouselIndex]);
                                                setTransferDialogOpen(true);
                                                setCarouselOpen(false);
                                            }}
                                        >
                                            Transfer NFT
                                        </Button>
                                    )}
                                    <Button
                                        variant="outlined"
                                        onClick={handleCloseCarousel}
                                    >
                                        Close
                                    </Button>
                                </Box>
                            </CardContent>
                        </Box>
                    )}

                    {/* Carousel Indicator */}
                    {userCollection.length > 1 && (
                        <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Typography variant="caption" color="white" sx={{ mr: 1 }}>
                                {carouselIndex + 1} of {userCollection.length}
                            </Typography>
                            {userCollection.map((_, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: index === carouselIndex ? 'white' : 'rgba(255,255,255,0.5)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onClick={() => setCarouselIndex(index)}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
            </Dialog>

            {/* Nearby NFTs Carousel Dialog with 3D Map */}
            {nearbyNFTs && nearbyNFTs.length > 0 && (
                <Dialog
                    open={nearbyCarouselOpen}
                    onClose={handleCloseNearbyCarousel}
                    maxWidth="md"
                    fullWidth
                    PaperProps={{
                        sx: {
                            backgroundColor: 'transparent',
                            boxShadow: 'none',
                            position: 'relative',
                            height: '80vh',
                            maxHeight: '800px'
                        }
                    }}
                >
                <Box sx={{ position: 'relative', backgroundColor: 'background.paper', borderRadius: 2, overflow: 'hidden' }}>
                    {/* Close Button */}
                    <IconButton
                        onClick={handleCloseNearbyCarousel}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 10,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'rgba(0,0,0,0.7)'
                            }
                        }}
                    >
                        <Close />
                    </IconButton>

                    {/* Navigation Buttons */}
                    {nearbyNFTs.length > 1 && (
                        <>
                            <IconButton
                                onClick={handleNearbyPrevious}
                                sx={{
                                    position: 'absolute',
                                    left: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    zIndex: 10,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'rgba(0,0,0,0.7)'
                                    }
                                }}
                            >
                                <NavigateBefore />
                            </IconButton>
                            <IconButton
                                onClick={handleNearbyNext}
                                sx={{
                                    position: 'absolute',
                                    right: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    zIndex: 10,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'rgba(0,0,0,0.7)'
                                    }
                                }}
                            >
                                <NavigateNext />
                            </IconButton>
                        </>
                    )}

                    {/* 3D Map Display */}
                    {nearbyNFTs && nearbyNFTs.length > 0 && nearbyNFTs[nearbyCarouselIndex] ? (
                        <Box>
                            <NFT3DMap
                                key={`nft-3d-map-${nearbyNFTs[nearbyCarouselIndex].id}`}
                                nft={nearbyNFTs[nearbyCarouselIndex]}
                                userLocation={userLocation}
                                onCollect={() => {
                                    try {
                                        if (nearbyNFTs[nearbyCarouselIndex] && nearbyNFTs[nearbyCarouselIndex].id) {
                                            handleCollectNFT(nearbyNFTs[nearbyCarouselIndex].id);
                                        }
                                    } catch (error) {
                                        console.error('Error collecting NFT from carousel:', error);
                                    }
                                }}
                                onClose={handleCloseNearbyCarousel}
                                isCollecting={loading}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary">No NFT data available</Typography>
                        </Box>
                    )}

                    {/* Carousel Indicator */}
                    {nearbyNFTs && nearbyNFTs.length > 1 && (
                        <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Typography variant="caption" color="white" sx={{ mr: 1 }}>
                                {nearbyCarouselIndex + 1} of {nearbyNFTs.length}
                            </Typography>
                            {nearbyNFTs.map((_, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: index === nearbyCarouselIndex ? 'white' : 'rgba(255,255,255,0.5)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onClick={() => setNearbyCarouselIndex(index)}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
            </Dialog>
            )}
        </Box>
        );
    } catch (error) {
        console.error('Error rendering NFTManager:', error);
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" color="error" gutterBottom>
                    Error loading NFT Manager
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {error.message || 'An unexpected error occurred'}
                </Typography>
            </Box>
        );
    }
};

// React Error Boundary Class Component
class NFTManagerErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('NFTManager Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="error" gutterBottom>
                        Something went wrong
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Please refresh the page or contact support if the problem persists.
                    </Typography>
                    <Button 
                        variant="contained" 
                        onClick={() => window.location.reload()}
                        sx={{ mt: 2 }}
                    >
                        Refresh Page
                    </Button>
                </Box>
            );
        }

        return this.props.children;
    }
}

// Error Boundary Wrapper
const NFTManagerWithErrorBoundary = () => {
    return (
        <NFTManagerErrorBoundary>
            <NFTManager />
        </NFTManagerErrorBoundary>
    );
};

export default NFTManagerWithErrorBoundary;
