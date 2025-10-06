import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardMedia,
    Grid,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    CircularProgress,
    IconButton,
    Paper
} from '@mui/material';
import {
    LocationOn,
    Visibility,
    TransferWithinAStation,
    AccessTime,
    NavigateBefore,
    NavigateNext,
    Close
} from '@mui/icons-material';
import api from '../../services/api';
import NFTTransfer from './NFTTransfer';
import { useWallet } from '../../contexts/WalletContext';

const NFTCollection = () => {
    const [nfts, setNfts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [selectedNFTForTransfer, setSelectedNFTForTransfer] = useState(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [carouselOpen, setCarouselOpen] = useState(false);
    const { isConnected, publicKey } = useWallet();

    useEffect(() => {
        loadUserCollection();
        getUserLocation();
    }, []);

    // Keyboard navigation for carousel
    useEffect(() => {
        const handleKeyPress = (event) => {
            if (!carouselOpen) return;
            
            if (event.key === 'ArrowLeft') {
                handlePrevious();
            } else if (event.key === 'ArrowRight') {
                handleNext();
            } else if (event.key === 'Escape') {
                handleCloseCarousel();
            }
        };

        if (carouselOpen) {
            document.addEventListener('keydown', handleKeyPress);
            return () => document.removeEventListener('keydown', handleKeyPress);
        }
    }, [carouselOpen]);

    const loadUserCollection = async () => {
        try {
            setLoading(true);
            const response = await api.get('/nft/user-collection');
            setNfts(response.data.collection);
        } catch (error) {
            console.error('Error loading collection:', error);
            setError('Failed to load NFT collection');
        } finally {
            setLoading(false);
        }
    };

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => {
                    console.error('Error getting location:', error);
                }
            );
        }
    };

    const handleViewDetails = async (nft) => {
        try {
            const response = await api.get(`/nft/collection/${nft.nft_id}`);
            setSelectedNFT(response.data);
            setDetailsDialogOpen(true);
        } catch (error) {
            console.error('Error loading NFT details:', error);
            setError('Failed to load NFT details');
        }
    };

    const handleTransferNFT = async (nft) => {
        if (!isConnected) {
            setError('Please connect your wallet first to transfer NFTs');
            return;
        }
        setSelectedNFTForTransfer(nft);
        setTransferDialogOpen(true);
    };

    const handleOpenCarousel = (index) => {
        setCarouselIndex(index);
        setCarouselOpen(true);
    };

    const handleCloseCarousel = () => {
        setCarouselOpen(false);
    };

    const handlePrevious = () => {
        setCarouselIndex((prev) => (prev > 0 ? prev - 1 : nfts.length - 1));
    };

    const handleNext = () => {
        setCarouselIndex((prev) => (prev < nfts.length - 1 ? prev + 1 : 0));
    };

    const getRarityColor = (rarity) => {
        switch (rarity) {
            case 'common': return '#4CAF50';
            case 'rare': return '#2196F3';
            case 'legendary': return '#9C27B0';
            default: return '#757575';
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const calculateDistance = (nftLat, nftLon) => {
        if (!userLocation) return 'Unknown';
        
        const R = 6371000; // Earth's radius in meters
        const dLat = (nftLat - userLocation.lat) * Math.PI / 180;
        const dLon = (nftLon - userLocation.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(nftLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`;
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mt: 2 }}>
                {error}
            </Alert>
        );
    }

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                My NFT Collection
            </Typography>
            
            {nfts.length === 0 ? (
                <Card>
                    <CardContent>
                        <Typography variant="h6" color="text.secondary" align="center">
                            No NFTs in your collection yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                            Start exploring to find and collect NFTs near you!
                        </Typography>
                    </CardContent>
                </Card>
            ) : (
                <Grid container spacing={1}>
                    {nfts.map((nft) => (
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
                                                height: '16px',
                                                textTransform: 'capitalize'
                                            }}
                                        />
                                    </Box>
                                    
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {nft.description}
                                    </Typography>

                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {calculateDistance(nft.latitude, nft.longitude)} away
                                    </Typography>

                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Collected {formatDate(nft.collected_at)}
                                    </Typography>

                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Transfers: {nft.transfer_count}
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={<Visibility />}
                                            onClick={() => handleOpenCarousel(nfts.indexOf(nft))}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            View
                                        </Button>
                                        {isConnected && (
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<TransferWithinAStation />}
                                                onClick={() => handleTransferNFT(nft)}
                                                sx={{ fontSize: '0.6rem', py: 0.5 }}
                                            >
                                                Transfer
                                            </Button>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* NFT Details Dialog */}
            <Dialog 
                open={detailsDialogOpen} 
                onClose={() => setDetailsDialogOpen(false)}
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
                    <Button onClick={() => setDetailsDialogOpen(false)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

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
                    {nfts.length > 1 && (
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
                    {nfts[carouselIndex] && (
                        <Box>
                            {/* Image */}
                            {(nfts[carouselIndex].ipfs_hash || nfts[carouselIndex].image_url) && (
                                <CardMedia
                                    component="img"
                                    height="400"
                                    image={nfts[carouselIndex].ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nfts[carouselIndex].ipfs_hash}` : nfts[carouselIndex].image_url}
                                    alt={nfts[carouselIndex].collection_name}
                                    sx={{ objectFit: 'cover' }}
                                />
                            )}

                            {/* Content */}
                            <CardContent sx={{ p: 3 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <Typography variant="h5" fontWeight="bold">
                                        {nfts[carouselIndex].collection_name}
                                    </Typography>
                                    <Chip
                                        label={nfts[carouselIndex].rarity_level}
                                        sx={{
                                            backgroundColor: getRarityColor(nfts[carouselIndex].rarity_level),
                                            color: 'white',
                                            textTransform: 'capitalize',
                                            fontWeight: 'bold'
                                        }}
                                    />
                                </Box>

                                <Typography variant="body1" color="text.secondary" paragraph>
                                    {nfts[carouselIndex].description}
                                </Typography>

                                <Grid container spacing={2} mb={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Location
                                        </Typography>
                                        <Typography variant="body2">
                                            {nfts[carouselIndex].latitude}, {nfts[carouselIndex].longitude}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Radius: {nfts[carouselIndex].radius_meters}m
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Collection Info
                                        </Typography>
                                        <Typography variant="body2">
                                            Collected: {formatDate(nfts[carouselIndex].collected_at)}
                                        </Typography>
                                        <Typography variant="body2">
                                            Transfers: {nfts[carouselIndex].transfer_count}
                                        </Typography>
                                    </Grid>
                                </Grid>

                                {nfts[carouselIndex].ipfs_hash && (
                                    <Box mb={2}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            IPFS Hash
                                        </Typography>
                                        <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                                            {nfts[carouselIndex].ipfs_hash}
                                        </Typography>
                                    </Box>
                                )}

                                {nfts[carouselIndex].smart_contract_address && (
                                    <Box mb={2}>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Smart Contract
                                        </Typography>
                                        <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                                            {nfts[carouselIndex].smart_contract_address}
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
                                                setSelectedNFTForTransfer(nfts[carouselIndex]);
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
                    {nfts.length > 1 && (
                        <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Typography variant="caption" color="white" sx={{ mr: 1 }}>
                                {carouselIndex + 1} of {nfts.length}
                            </Typography>
                            {nfts.map((_, index) => (
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

            {/* NFT Transfer Dialog */}
            {selectedNFTForTransfer && (
                <NFTTransfer
                    nft={selectedNFTForTransfer}
                    open={transferDialogOpen}
                    onClose={() => {
                        setTransferDialogOpen(false);
                        setSelectedNFTForTransfer(null);
                    }}
                    onTransferSuccess={() => {
                        setTransferDialogOpen(false);
                        setSelectedNFTForTransfer(null);
                        loadUserCollection(); // Refresh the collection
                    }}
                />
            )}
        </Box>
    );
};

export default NFTCollection;
