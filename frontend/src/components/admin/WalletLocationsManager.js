import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    FormControl,
    Select,
    MenuItem,
    InputLabel,
    ToggleButtonGroup,
    ToggleButton,
    Chip,
    TextField,
    IconButton,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    InputAdornment,
    Dialog,
    DialogTitle,
    DialogContent
} from '@mui/material';
import { 
    MapOutlined, 
    TableChart, 
    Search as SearchIcon,
    MyLocation as MyLocationIcon,
    Refresh as RefreshIcon,
    AccountBalanceWallet as WalletIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import api from '../../utils/api';
import { useWallet } from '../../contexts/WalletContext';
import WalletConnectionDialog from '../Wallet/WalletConnectionDialog';
import SharedMap from '../SharedMap';


const WalletLocationsManager = () => {
    const { isConnected, disconnectWallet, publicKey } = useWallet();
    const [locations, setLocations] = useState([]);
    const [walletTypes, setWalletTypes] = useState([]);
    const [filters, setFilters] = useState({
        blockchain: '',
        walletType: '',
        provider: ''
    });
    const [viewMode, setViewMode] = useState('map');
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [openNFTDialog, setOpenNFTDialog] = useState(false);
    const [zoomTarget, setZoomTarget] = useState(null);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const fetchingRef = useRef(false);
    
    // Wallet connection state
    const [openWalletDialog, setOpenWalletDialog] = useState(false);

    // NFT details handler
    const handleNFTDetails = (nft) => {
        setSelectedNFT(nft);
        setOpenNFTDialog(true);
    };

    // Filtered locations - moved to top to avoid initialization order issues
    const filteredLocations = locations.filter(location => {
        return (
            (!filters.blockchain || location.blockchain === filters.blockchain) &&
            (!filters.walletType || location.wallet_type_id === parseInt(filters.walletType)) &&
            (!filters.provider || location.wallet_provider_id === parseInt(filters.provider))
        );
    });

    const fetchData = useCallback(async () => {
        if (fetchingRef.current) {
            console.log('fetchData already running, skipping...');
            return;
        }
        
        try {
            fetchingRef.current = true;
            setLoading(true);
            
            // Fetch data with error handling for each endpoint
            const promises = [
                api.get('/admin/locations'),
                api.get('/nft/dashboard/nearby', {
                    params: {
                        latitude: 0, // Global search
                        longitude: 0,
                        radius: 999999999 // Very large radius to get ALL NFTs globally
                    }
                })
            ];
            
            // Try to fetch wallet types, but don't fail if it doesn't exist
            const typesPromise = api.get('/location/types/list').catch(error => {
                console.warn('Wallet types endpoint not available:', error.message);
                return { data: [] }; // Return empty array if endpoint fails
            });
            
            promises.push(typesPromise);
            
            const [locationsRes, nftsRes, typesRes] = await Promise.all(promises);
            
            setLocations(locationsRes.data);
            setWalletTypes(typesRes.data || []);
            
            // Process NFTs to add full IPFS URLs and validate coordinates
            const processedNFTs = nftsRes.data.nfts
                .filter(nft => {
                    // Only include NFTs with valid coordinates
                    const lat = parseFloat(nft.latitude);
                    const lng = parseFloat(nft.longitude);
                    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
                })
                .map(nft => ({
                    ...nft,
                    latitude: parseFloat(nft.latitude),
                    longitude: parseFloat(nft.longitude),
                    full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
                    collection: {
                        ...nft.collection,
                        full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
                    }
                }));
            
            // Process wallet locations to ensure coordinates are numbers
            const processedWallets = locationsRes.data
                .filter(location => {
                    const lat = parseFloat(location.latitude);
                    const lng = parseFloat(location.longitude);
                    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
                })
                .map(location => ({
                    ...location,
                    latitude: parseFloat(location.latitude),
                    longitude: parseFloat(location.longitude)
                }));
            
            // Combine wallet locations and NFTs for display
            setLocations([...processedWallets, ...processedNFTs]);
        } catch (error) {
            console.error('Error fetching data:', error);
            setError('Failed to fetch wallet locations and NFTs');
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, []);

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);



    const handleToggleStatus = async (locationId, currentStatus) => {
        try {
            await api.patch(`/admin/locations/${locationId}`, {
                location_enabled: !currentStatus
            });
            fetchData();
        } catch (error) {
            console.error('Error updating location status:', error);
        }
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom sx={{ 
                fontWeight: 500,
                color: 'text.primary'
            }}>
                Wallet Locations
            </Typography>

            {/* View Toggle and Controls */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(e, newValue) => newValue && setViewMode(newValue)}
                    size="small"
                >
                    <ToggleButton value="map">
                        <MapOutlined sx={{ mr: 1 }} />
                        Map View
                    </ToggleButton>
                    <ToggleButton value="table">
                        <TableChart sx={{ mr: 1 }} />
                        Table View
                    </ToggleButton>
                </ToggleButtonGroup>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={fetchData}
                        disabled={loading}
                    >
                        Refresh
                    </Button>

                    {isConnected ? (
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<WalletIcon />}
                            onClick={disconnectWallet}
                        >
                            Disconnect Wallet
                        </Button>
                    ) : (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<WalletIcon />}
                            onClick={() => setOpenWalletDialog(true)}
                        >
                            Connect Wallet
                        </Button>
                    )}
                </Box>

                {/* Filters */}
                <Box sx={{ display: 'flex', gap: 2, ml: 'auto' }}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Blockchain</InputLabel>
                        <Select
                            value={filters.blockchain}
                            onChange={(e) => setFilters({...filters, blockchain: e.target.value})}
                            label="Blockchain"
                        >
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="Stellar">Stellar</MenuItem>
                            <MenuItem value="Circle">Circle</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Wallet Type</InputLabel>
                        <Select
                            value={filters.walletType}
                            onChange={(e) => setFilters({...filters, walletType: e.target.value})}
                            label="Wallet Type"
                        >
                            <MenuItem value="">All</MenuItem>
                            {Array.isArray(walletTypes) && walletTypes.map(type => (
                                <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>
            </Box>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Loading Indicator */}
            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                </Box>
            )}

            {viewMode === 'map' ? (
                <Box sx={{ position: 'relative' }}>
                    <SharedMap
                        locations={filteredLocations.map(location => ({
                            ...location,
                            type: location.collection_id || location.token_id ? 'nft' : 'wallet',
                            server_url: location.server_url,
                            full_ipfs_url: location.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${location.ipfs_hash}` : null,
                            collection: location.collection
                        }))}
                        title="Wallet Locations & NFTs"
                        height="600px"
                        showControls={true}
                        onNFTDetails={handleNFTDetails}
                        zoomTarget={zoomTarget}
                    />
                </Box>
            ) : (
                <TableContainer component={Paper} elevation={0}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                        <TableCell sx={{ fontWeight: 500 }}>Image</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>Name/Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Blockchain</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Location</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Provider</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Last Updated</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                                    {filteredLocations.map(location => {
                                        const isNFT = location.collection_id || location.token_id;
                                        return (
                                <TableRow key={location.id}>
                                                <TableCell>
                                                    {isNFT ? (
                                                        <Box sx={{ 
                                                            width: 60, 
                                                            height: 60, 
                                                            borderRadius: 1,
                                                            overflow: 'hidden',
                                                            border: '2px solid #4caf50',
                                                            position: 'relative'
                                                        }}>
                                                            <img 
                                                                src={location.full_ipfs_url || 'https://via.placeholder.com/60x60/4caf50/ffffff?text=NFT'} 
                                                                alt="NFT" 
                                                                style={{ 
                                                                    width: '100%', 
                                                                    height: '100%', 
                                                                    objectFit: 'cover' 
                                                                }} 
                                                            />
                                                            <Box sx={{
                                                                position: 'absolute',
                                                                top: -2,
                                                                right: -2,
                                                                width: 16,
                                                                height: 16,
                                                                backgroundColor: '#ff9800',
                                                                borderRadius: '50%',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '10px',
                                                                fontWeight: 'bold',
                                                                color: 'white',
                                                                border: '2px solid white'
                                                            }}>
                                                                N
                                                            </Box>
                                                        </Box>
                                                    ) : (
                                                        <Box sx={{ 
                                                            width: 60, 
                                                            height: 60, 
                                                            borderRadius: '50%',
                                                            backgroundColor: location.location_enabled ? '#4caf50' : '#f44336',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: 'white',
                                                            fontWeight: 'bold',
                                                            fontSize: '12px'
                                                        }}>
                                                            {location.blockchain?.charAt(0) || 'W'}
                                                        </Box>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isNFT ? (
                                                        <Chip 
                                                            label="NFT" 
                                                            color="primary" 
                                                            size="small" 
                                                            icon={<span>🎨</span>}
                                                        />
                                                    ) : (
                                                        <Chip 
                                                            label={location.wallet_type || 'Wallet'} 
                                                            color="default" 
                                                            size="small" 
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isNFT ? (
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="bold">
                                                                {location.name || 'Unnamed NFT'}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Token ID: #{location.token_id}
                                                            </Typography>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                            {location.public_key?.substring(0, 8)}...
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                    <TableCell>{location.blockchain}</TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {location.description || (isNFT ? location.collection?.name : 'No description')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                                        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{location.provider_name || (isNFT ? 'NFT Collection' : 'Unknown')}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={location.location_enabled ? 'Active' : 'Disabled'}
                                            color={location.location_enabled ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                                    <Typography variant="body2" sx={{ fontSize: '12px' }}>
                                                        {new Date(location.last_updated || location.created_at).toLocaleString()}
                                                    </Typography>
                                    </TableCell>
                                    <TableCell>
                                                    {isNFT ? (
                                                        <Box sx={{ display: 'flex', gap: 0.5, flexDirection: 'column' }}>
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                onClick={() => window.open(`https://stellar.expert/explorer/testnet/contract/${location.smart_contract_address}`, '_blank')}
                                                                sx={{ textTransform: 'none', fontSize: '10px', py: 0.5 }}
                                                            >
                                                                Contract
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                onClick={() => window.open(`https://stellar.expert/explorer/testnet/tx/${location.transaction_hash}`, '_blank')}
                                                                sx={{ textTransform: 'none', fontSize: '10px', py: 0.5 }}
                                                            >
                                                                Transaction
                                                            </Button>
                                                        </Box>
                                                    ) : (
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            color={location.location_enabled ? 'error' : 'success'}
                                            onClick={() => handleToggleStatus(location.id, location.location_enabled)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            {location.location_enabled ? 'Disable' : 'Enable'}
                                        </Button>
                                                    )}
                                    </TableCell>
                                </TableRow>
                                        );
                                    })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Wallet Connection Dialog */}
            <WalletConnectionDialog
                open={openWalletDialog}
                onClose={() => setOpenWalletDialog(false)}
                onSuccess={() => {
                    setOpenWalletDialog(false);
                    setError('');
                }}
            />

            {/* NFT Details Dialog */}
            <Dialog
                open={openNFTDialog}
                onClose={() => setOpenNFTDialog(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    NFT Details
                    <IconButton onClick={() => setOpenNFTDialog(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selectedNFT && (
                        <Box>
                            <Box sx={{ textAlign: 'center', mb: 2 }}>
                                <img 
                                    src={selectedNFT.full_ipfs_url || 'https://via.placeholder.com/300x300'} 
                                    alt="NFT" 
                                    style={{ 
                                        width: '100%', 
                                        maxWidth: 300, 
                                        borderRadius: 12, 
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
                                    }} 
                                />
                            </Box>
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
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default WalletLocationsManager; 