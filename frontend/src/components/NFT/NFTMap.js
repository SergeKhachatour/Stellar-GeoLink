import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    CircularProgress,
    Fab,
    IconButton,
    Tooltip,
    Menu,
    MenuItem,
    FormControl,
    InputLabel,
    Select
} from '@mui/material';
import {
    LocationOn,
    MyLocation,
    Visibility,
    Add,
    Map,
    Satellite,
    Terrain,
    Public,
    ViewInAr,
    RotateLeft,
    RotateRight,
    ZoomIn,
    ZoomOut,
    ContentCopy
} from '@mui/icons-material';
import api from '../../services/api';

const NFTMap = () => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    console.log('NFTMap component loaded - v2');
    const [nfts, setNfts] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mapboxToken, setMapboxToken] = useState('');
    const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
    const [is3D, setIs3D] = useState(false);
    const [pitch, setPitch] = useState(0);
    const [bearing, setBearing] = useState(0);
    const [styleMenuAnchor, setStyleMenuAnchor] = useState(null);

    const mapStyles = [
        { id: 'satellite', name: 'Satellite', style: 'mapbox://styles/mapbox/satellite-streets-v12', icon: <Satellite /> },
        { id: 'streets', name: 'Streets', style: 'mapbox://styles/mapbox/streets-v12', icon: <Map /> },
        { id: 'outdoors', name: 'Outdoors', style: 'mapbox://styles/mapbox/outdoors-v12', icon: <Terrain /> },
        { id: 'light', name: 'Light', style: 'mapbox://styles/mapbox/light-v11', icon: <Public /> },
        { id: 'dark', name: 'Dark', style: 'mapbox://styles/mapbox/dark-v11', icon: <Public /> },
        { id: 'navigation', name: 'Navigation', style: 'mapbox://styles/mapbox/navigation-day-v1', icon: <Map /> }
    ];

    useEffect(() => {
        // Load Mapbox token from environment
        const token = process.env.REACT_APP_MAPBOX_TOKEN;
        if (token) {
            setMapboxToken(token);
            initializeMap(token);
        } else {
            setError('Mapbox token not configured');
            setLoading(false);
        }
    }, []);

    const initializeMap = (token) => {
        if (!window.mapboxgl) {
            setError('Mapbox GL JS not loaded');
            setLoading(false);
            return;
        }

        // Wait for the container to be available
        if (!mapRef.current) {
            setTimeout(() => initializeMap(token), 100);
            return;
        }

        const mapInstance = new window.mapboxgl.Map({
            container: mapRef.current,
            style: mapStyle,
            center: [0, 0],
            zoom: 2,
            pitch: pitch,
            bearing: bearing,
            accessToken: token,
            projection: 'globe'
        });

        mapInstance.on('load', () => {
            console.log('Map loaded successfully - v2');
            mapInstanceRef.current = mapInstance;
            console.log('Map instance stored in ref:', mapInstanceRef.current);
            loadNFTs();
            getUserLocation();
        });

        mapInstance.on('click', (e) => {
            // Handle map clicks if needed
        });
    };

    const loadNFTs = async () => {
        try {
            setLoading(true);
            console.log('Loading NFTs...');
            const response = await api.get('/nft/all');
            console.log('NFTs loaded:', response.data);
            setNfts(response.data.nfts);
            addNFTsToMap(response.data.nfts);
        } catch (error) {
            console.error('Error loading NFTs:', error);
            setError('Failed to load NFTs');
        } finally {
            setLoading(false);
        }
    };

    const addNFTsToMap = (nftData, retryCount = 0) => {
        if (!mapInstanceRef.current) {
            if (retryCount < 50) { // Max 5 seconds of retries
                console.log(`Map not ready, retrying in 100ms... (attempt ${retryCount + 1})`);
                setTimeout(() => addNFTsToMap(nftData, retryCount + 1), 100);
            } else {
                console.error('Map failed to initialize after 5 seconds');
                setError('Map failed to initialize');
            }
            return;
        }

        console.log('Adding NFTs to map:', nftData);
        console.log('Map instance available:', mapInstanceRef.current);

        // Clear existing markers
        const existingMarkers = document.querySelectorAll('.nft-marker');
        existingMarkers.forEach(marker => marker.remove());

        nftData.forEach((nft) => {
            console.log('Creating marker for NFT:', nft);
            const marker = document.createElement('div');
            marker.className = 'nft-marker';
            marker.style.cssText = `
                width: 60px;
                height: 60px;
                border-radius: 8px;
                border: 4px solid white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                background-color: ${getRarityColor(nft.rarity_level)};
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                transition: box-shadow 0.2s ease, border-width 0.2s ease;
                position: relative;
            `;

            // Set background image if available
            const imageUrl = nft.ipfs_hash 
                ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}`
                : nft.image_url;
            
            console.log('Image URL for NFT:', imageUrl);
            
            if (imageUrl) {
                marker.style.backgroundImage = `url(${imageUrl})`;
            } else {
                // Fallback to rarity color with letter
                marker.innerHTML = nft.rarity_level.charAt(0).toUpperCase();
                marker.style.color = 'white';
                marker.style.fontWeight = 'bold';
                marker.style.fontSize = '14px';
            }

            // Add hover effects
            marker.addEventListener('mouseenter', () => {
                marker.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
                marker.style.borderWidth = '5px';
            });
            
            marker.addEventListener('mouseleave', () => {
                marker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                marker.style.borderWidth = '4px';
            });

            marker.addEventListener('click', () => {
                setSelectedNFT(nft);
                setDetailsDialogOpen(true);
            });

            // Add rarity indicator
            const rarityIndicator = document.createElement('div');
            rarityIndicator.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background-color: ${getRarityColor(nft.rarity_level)};
                border: 2px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                font-weight: bold;
                color: white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                z-index: 10;
            `;
            rarityIndicator.innerHTML = nft.rarity_level.charAt(0).toUpperCase();
            marker.appendChild(rarityIndicator);

            const mapboxMarker = new window.mapboxgl.Marker(marker)
                .setLngLat([parseFloat(nft.longitude), parseFloat(nft.latitude)])
                .addTo(mapInstanceRef.current);
            
            console.log('Marker added to map at:', [nft.longitude, nft.latitude]);
        });
    };

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    setUserLocation(location);
                    
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo({
                            center: [location.lon, location.lat],
                            zoom: 15
                        });

                        // Add user location marker
                        new window.mapboxgl.Marker({
                            color: '#2196F3'
                        })
                        .setLngLat([location.lon, location.lat])
                        .addTo(mapInstanceRef.current);
                    }
                },
                (error) => {
                    console.error('Error getting location:', error);
                }
            );
        }
    };

    const centerOnUserLocation = () => {
        if (userLocation && mapInstanceRef.current) {
            mapInstanceRef.current.flyTo({
                center: [userLocation.lon, userLocation.lat],
                zoom: 15
            });
        } else {
            getUserLocation();
        }
    };

    const changeMapStyle = (style) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setStyle(style);
            setMapStyle(style);
        }
    };

    const toggle3D = () => {
        if (mapInstanceRef.current) {
            const newPitch = is3D ? 0 : 60;
            const newBearing = is3D ? 0 : bearing;
            
            mapInstanceRef.current.easeTo({
                pitch: newPitch,
                bearing: newBearing,
                duration: 1000
            });
            
            setPitch(newPitch);
            setIs3D(!is3D);
        }
    };

    const rotateMap = (direction) => {
        if (mapInstanceRef.current) {
            const newBearing = bearing + (direction === 'left' ? -45 : 45);
            setBearing(newBearing);
            
            mapInstanceRef.current.easeTo({
                bearing: newBearing,
                duration: 500
            });
        }
    };

    const zoomIn = () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.zoomIn();
        }
    };

    const zoomOut = () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.zoomOut();
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            // You could add a toast notification here
            console.log('Copied to clipboard:', text);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    const getRarityColor = (rarity) => {
        switch (rarity) {
            case 'common': return '#4CAF50';
            case 'rare': return '#2196F3';
            case 'legendary': return '#9C27B0';
            default: return '#757575';
        }
    };

    const handleCollectNFT = async (nft) => {
        try {
            if (!userLocation) {
                setError('User location required to collect NFT');
                return;
            }

            await api.post('/nft/collect', {
                nft_id: nft.id,
                user_latitude: userLocation.lat,
                user_longitude: userLocation.lon
            });

            setDetailsDialogOpen(false);
            loadNFTs(); // Refresh the map
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to collect NFT');
        }
    };

    if (!mapboxToken) {
        return (
            <Alert severity="error">
                Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your environment.
            </Alert>
        );
    }

    return (
        <Box sx={{ position: 'relative', height: '100vh', width: '100%' }}>
            <Box
                ref={mapRef}
                sx={{
                    height: '100%',
                    width: '100%',
                    position: 'relative'
                }}
            />

            {loading && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        zIndex: 1000
                    }}
                >
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <CircularProgress size={24} />
                                <Typography>Loading NFTs...</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Box>
            )}

            {error && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        right: 16,
                        zIndex: 1000
                    }}
                >
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                </Box>
            )}

            {/* Map Controls */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1
                }}
            >
                {/* Style Selector */}
                <Card sx={{ p: 1 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Tooltip title="Map Style">
                            <IconButton
                                onClick={(e) => setStyleMenuAnchor(e.currentTarget)}
                                size="small"
                            >
                                <Map />
                            </IconButton>
                        </Tooltip>
                        <Typography variant="caption" sx={{ minWidth: 60 }}>
                            {mapStyles.find(s => s.style === mapStyle)?.name || 'Style'}
                        </Typography>
                    </Box>
                </Card>

                {/* 3D Controls */}
                <Card sx={{ p: 1 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Tooltip title="Toggle 3D View">
                            <IconButton onClick={toggle3D} size="small">
                                <ViewInAr />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Rotate Left">
                            <IconButton onClick={() => rotateMap('left')} size="small">
                                <RotateLeft />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Rotate Right">
                            <IconButton onClick={() => rotateMap('right')} size="small">
                                <RotateRight />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Card>

                {/* Zoom Controls */}
                <Card sx={{ p: 1 }}>
                    <Box display="flex" flexDirection="column" gap={0.5}>
                        <Tooltip title="Zoom In">
                            <IconButton onClick={zoomIn} size="small">
                                <ZoomIn />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Zoom Out">
                            <IconButton onClick={zoomOut} size="small">
                                <ZoomOut />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Card>

                {/* Location Button */}
                <Fab
                    color="primary"
                    onClick={centerOnUserLocation}
                    size="medium"
                >
                    <MyLocation />
                </Fab>
            </Box>

            {/* Style Menu */}
            <Menu
                anchorEl={styleMenuAnchor}
                open={Boolean(styleMenuAnchor)}
                onClose={() => setStyleMenuAnchor(null)}
            >
                {mapStyles.map((style) => (
                    <MenuItem
                        key={style.id}
                        onClick={() => {
                            changeMapStyle(style.style);
                            setStyleMenuAnchor(null);
                        }}
                        selected={style.style === mapStyle}
                    >
                        <Box display="flex" alignItems="center" gap={1}>
                            {style.icon}
                            {style.name}
                        </Box>
                    </MenuItem>
                ))}
            </Menu>

            {/* 3D Status Indicator */}
            {is3D && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        zIndex: 1000
                    }}
                >
                    <Card>
                        <CardContent sx={{ p: 1 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <ViewInAr color="primary" />
                                <Typography variant="caption" color="primary">
                                    3D View Active
                                </Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Box>
            )}

            {/* Legend */}
            <Box
                sx={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    zIndex: 1000
                }}
            >
                <Card>
                    <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                            NFT Legend
                        </Typography>
                        <Box display="flex" flexDirection="column" gap={1}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Box
                                    sx={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: '4px',
                                        backgroundColor: '#4CAF50',
                                        border: '2px solid white',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                    }}
                                />
                                <Typography variant="body2">Common</Typography>
                            </Box>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Box
                                    sx={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: '4px',
                                        backgroundColor: '#2196F3',
                                        border: '2px solid white',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                    }}
                                />
                                <Typography variant="body2">Rare</Typography>
                            </Box>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Box
                                    sx={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: '4px',
                                        backgroundColor: '#9C27B0',
                                        border: '2px solid white',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                    }}
                                />
                                <Typography variant="body2">Legendary</Typography>
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            </Box>

            {/* NFT Details Dialog */}
            <Dialog 
                open={detailsDialogOpen} 
                onClose={() => setDetailsDialogOpen(false)}
                maxWidth="md"
                fullWidth
                sx={{
                    '& .MuiDialog-paper': {
                        maxHeight: '90vh',
                        overflow: 'hidden'
                    }
                }}
            >
                <DialogTitle>
                    {selectedNFT?.collection_name}
                </DialogTitle>
                <DialogContent sx={{ overflow: 'auto', maxHeight: '70vh' }}>
                    {selectedNFT && (
                        <Box sx={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {/* NFT Image */}
                            {(selectedNFT.ipfs_hash || selectedNFT.image_url) && (
                                <Box 
                                    sx={{ 
                                        width: '100%', 
                                        height: '400px', 
                                        mb: 3,
                                        borderRadius: 2,
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: '#f5f5f5'
                                    }}
                                >
                                    <img
                                        src={selectedNFT.ipfs_hash 
                                            ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${selectedNFT.ipfs_hash}`
                                            : selectedNFT.image_url}
                                        alt={selectedNFT.collection_name}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '100%',
                                            width: 'auto',
                                            height: 'auto',
                                            objectFit: 'contain'
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                </Box>
                            )}

                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                <Typography variant="h6">
                                    {selectedNFT.collection_name}
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
                            
                            <Typography variant="body2" color="text.secondary" paragraph>
                                {selectedNFT.description}
                            </Typography>

                            <Box display="flex" flexDirection="column" gap={1}>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Location:</strong> {selectedNFT.latitude}, {selectedNFT.longitude}
                                </Typography>
                                
                                <Typography variant="body2" gutterBottom>
                                    <strong>Collection Radius:</strong> {selectedNFT.radius_meters}m
                                </Typography>

                                {selectedNFT.ipfs_hash && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" gutterBottom>
                                            <strong>IPFS Hash:</strong>
                                        </Typography>
                                        <Box 
                                            sx={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: 1,
                                                p: 1,
                                                backgroundColor: '#f5f5f5',
                                                borderRadius: 1,
                                                border: '1px solid #e0e0e0'
                                            }}
                                        >
                                            <Typography 
                                                variant="body2" 
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                    wordBreak: 'break-all',
                                                    overflowWrap: 'break-word',
                                                    flex: 1
                                                }}
                                            >
                                                {selectedNFT.ipfs_hash}
                                            </Typography>
                                            <Tooltip title="Copy IPFS Hash">
                                                <IconButton 
                                                    size="small"
                                                    onClick={() => copyToClipboard(selectedNFT.ipfs_hash)}
                                                >
                                                    <ContentCopy fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                )}

                                {userLocation && (
                                    <Box mt={2}>
                                        <Typography variant="body2" color="text.secondary">
                                            Distance from you: {calculateDistance(
                                                userLocation.lat,
                                                userLocation.lon,
                                                selectedNFT.latitude,
                                                selectedNFT.longitude
                                            )}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsDialogOpen(false)}>
                        Close
                    </Button>
                    {userLocation && (
                        <Button 
                            onClick={() => handleCollectNFT(selectedNFT)}
                            variant="contained"
                        >
                            Collect NFT
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
};

// Helper function to calculate distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`;
};

export default NFTMap;
