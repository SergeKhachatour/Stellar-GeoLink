import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Chip, Alert } from '@mui/material';
import { LocationOn, MyLocation } from '@mui/icons-material';

const NFT3DMap = ({ nft, userLocation, onCollect, onClose, isCollecting = false }) => {
    const mapContainer = useRef(null);
    const mapInstance = useRef(null);
    const initializedNFT = useRef(null);
    const cleanupTimeout = useRef(null);
    const mapLoadedRef = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
    const [is3D, setIs3D] = useState(true);
    const [showControls, setShowControls] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(20);
    const [currentPitch, setCurrentPitch] = useState(60);
    const [currentBearing, setCurrentBearing] = useState(0);

    useEffect(() => {
        if (!mapContainer.current || !nft) return;
        
        // Check if we need to reinitialize for a different NFT
        if (initializedNFT.current !== nft.id && mapInstance.current) {
            console.log('NFT3DMap: Different NFT detected, will cleanup and reinitialize');
            // Don't return here, let it proceed to cleanup and reinitialize
        } else if (initializedNFT.current === nft.id && mapLoaded) {
            console.log('NFT3DMap: Skipping initialization - already initialized and loaded for this NFT');
            return;
        }
        
        if (isInitializing) {
            console.log('NFT3DMap: Skipping initialization - already initializing');
            return;
        }
        
        console.log('NFT3DMap: Starting map initialization for NFT:', nft.id);

        // Cleanup function to prevent multiple map instances
        const cleanup = () => {
            if (mapInstance.current) {
                console.log('NFT3DMap: Cleaning up existing map instance');
                try {
                    // Check if the map instance is valid before removing
                    if (mapInstance.current.getContainer && mapInstance.current.getContainer()) {
                        console.log('NFT3DMap: Removing map instance');
                        mapInstance.current.remove();
                    }
                } catch (error) {
                    console.warn('Error removing map instance:', error);
                } finally {
                    mapInstance.current = null;
                    initializedNFT.current = null;
                    mapLoadedRef.current = false;
                    setMapLoaded(false);
                    setError(null);
                }
            }
        };

        const initializeMap = async () => {
            console.log('NFT3DMap: initializeMap called');
            setIsInitializing(true);
            // Clean up any existing map first
            cleanup();
            
            // Small delay to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Double-check container is still available
            if (!mapContainer.current) {
                console.log('NFT3DMap: Container no longer available, aborting');
                setIsInitializing(false);
                return;
            }
            
            // Check container dimensions
            const containerRect = mapContainer.current.getBoundingClientRect();
            console.log('NFT3DMap: Container dimensions before map creation:', {
                width: containerRect.width,
                height: containerRect.height,
                offsetWidth: mapContainer.current.offsetWidth,
                offsetHeight: mapContainer.current.offsetHeight
            });
            
            if (containerRect.width === 0 || containerRect.height === 0) {
                console.log('NFT3DMap: Container has zero dimensions, aborting');
                setIsInitializing(false);
                return;
            }
            
            try {
                // Set a timeout for map initialization
                const timeoutId = setTimeout(() => {
                    console.error('Map initialization timeout');
                    setMapLoaded(false);
                    setError('Map initialization timeout');
                }, 10000); // 10 second timeout

                // Wait for Mapbox to be available with retry
                let retries = 0;
                const maxRetries = 20;
                
                while (typeof window.mapboxgl === 'undefined' && retries < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retries++;
                }
                
                if (typeof window.mapboxgl === 'undefined') {
                    clearTimeout(timeoutId);
                    console.error('Mapbox GL JS not loaded after retries');
                    setMapLoaded(false);
                    setError('Mapbox GL JS failed to load');
                    return;
                }

                const mapboxgl = window.mapboxgl;
                
                // Fetch Mapbox access token from backend
                try {
                    const response = await fetch('http://localhost:4000/api/config/mapbox-token');
                    if (!response.ok) {
                        throw new Error('Failed to fetch Mapbox token');
                    }
                    const data = await response.json();
                    mapboxgl.accessToken = data.token;
                } catch (tokenError) {
                    console.error('Error fetching Mapbox token:', tokenError);
                    clearTimeout(timeoutId);
                    setMapLoaded(false);
                    setError('Failed to load Mapbox token');
                    return;
                }
                
                // Don't clear the container - let React manage it
                // Mapbox will handle the container content
                
                // Create map instance with error handling
                try {
                const nftLng = parseFloat(nft.longitude);
                const nftLat = parseFloat(nft.latitude);
                
                console.log('NFT3DMap: Initializing map at coordinates:', { lng: nftLng, lat: nftLat });
                
                mapInstance.current = new mapboxgl.Map({
                    container: mapContainer.current,
                    style: 'mapbox://styles/mapbox/satellite-streets-v12',
                    center: [nftLng, nftLat],
                    zoom: 20,
                    pitch: 60,
                    bearing: 0,
                    antialias: true
                });
                } catch (mapError) {
                    clearTimeout(timeoutId);
                    console.error('Error creating map instance:', mapError);
                    setMapLoaded(false);
                    setError('Failed to create map instance');
                    return;
                }

                mapInstance.current.on('load', () => {
                    try {
                        console.log('NFT3DMap: Map loaded successfully');
                        console.log('NFT3DMap: Map container dimensions:', {
                            width: mapContainer.current?.offsetWidth,
                            height: mapContainer.current?.offsetHeight,
                            clientWidth: mapContainer.current?.clientWidth,
                            clientHeight: mapContainer.current?.clientHeight
                        });
                        
                        // Track zoom level changes
                        mapInstance.current.on('zoom', () => {
                            setCurrentZoom(Math.round(mapInstance.current.getZoom()));
                        });

                        // Track pitch changes
                        mapInstance.current.on('pitch', () => {
                            setCurrentPitch(Math.round(mapInstance.current.getPitch()));
                        });

                        // Track bearing changes
                        mapInstance.current.on('bearing', () => {
                            setCurrentBearing(Math.round(mapInstance.current.getBearing()));
                        });
                        
                        clearTimeout(timeoutId);
                        // Clear any pending cleanup
                        if (cleanupTimeout.current) {
                            console.log('NFT3DMap: Clearing pending cleanup timeout');
                            clearTimeout(cleanupTimeout.current);
                            cleanupTimeout.current = null;
                        }
                        // Set ref immediately to prevent cleanup
                        mapLoadedRef.current = true;
                        setMapLoaded(true);
                        setIsInitializing(false);
                        initializedNFT.current = nft.id;
                        
                        // Add user location marker
                        if (userLocation) {
                            new mapboxgl.Marker({
                                color: '#2196F3',
                                scale: 1.2,
                                anchor: 'center'
                            })
                            .setLngLat([parseFloat(userLocation.lon), parseFloat(userLocation.lat)])
                            .addTo(mapInstance.current);
                        }
                    } catch (markerError) {
                        console.error('Error adding user location marker:', markerError);
                    }

                    // Add NFT location marker with custom style (same as main map)
                    try {
                        const nftMarker = document.createElement('div');
                        nftMarker.className = 'nft-marker-3d';
                        nftMarker.style.cssText = `
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
                            position: absolute;
                            transform: translate(-50%, -50%);
                            pointer-events: auto;
                        `;

                        // Set background image if available
                        const imageUrl = nft.ipfs_hash 
                            ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}`
                            : nft.image_url;
                        
                        if (imageUrl) {
                            nftMarker.style.backgroundImage = `url(${imageUrl})`;
                        } else {
                            // Fallback to rarity color with letter
                            nftMarker.innerHTML = nft.rarity_level.charAt(0).toUpperCase();
                            nftMarker.style.color = 'white';
                            nftMarker.style.fontWeight = 'bold';
                            nftMarker.style.fontSize = '14px';
                        }

                        // Add hover effects
                        nftMarker.addEventListener('mouseenter', () => {
                            nftMarker.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
                            nftMarker.style.borderWidth = '5px';
                        });
                        
                        nftMarker.addEventListener('mouseleave', () => {
                            nftMarker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                            nftMarker.style.borderWidth = '4px';
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
                        nftMarker.appendChild(rarityIndicator);

                        const nftLng = parseFloat(nft.longitude);
                        const nftLat = parseFloat(nft.latitude);
                        
                        console.log('NFT3DMap: Setting marker at coordinates:', { lng: nftLng, lat: nftLat });
                        
                        const nftMapboxMarker = new mapboxgl.Marker({
                            element: nftMarker,
                            anchor: 'center'
                        })
                        .setLngLat([nftLng, nftLat])
                        .addTo(mapInstance.current);
                        
                        console.log('NFT3DMap: Marker added successfully');
                    } catch (nftMarkerError) {
                        console.error('Error adding NFT location marker:', nftMarkerError);
                    }

                    // Add collection radius circle
                    try {
                        mapInstance.current.addSource('nft-radius', {
                            type: 'geojson',
                            data: {
                                type: 'Feature',
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [createCircle(nft.longitude, nft.latitude, nft.radius_meters)]
                                }
                            }
                        });

                        mapInstance.current.addLayer({
                            id: 'nft-radius-fill',
                            type: 'fill',
                            source: 'nft-radius',
                            paint: {
                                'fill-color': '#FF5722',
                                'fill-opacity': 0.1
                            }
                        });

                        mapInstance.current.addLayer({
                            id: 'nft-radius-border',
                            type: 'line',
                            source: 'nft-radius',
                            paint: {
                                'line-color': '#FF5722',
                                'line-width': 2
                            }
                        });
                    } catch (circleError) {
                        console.error('Error adding collection radius circle:', circleError);
                    }
                });

            } catch (error) {
                console.error('Error initializing 3D map:', error);
                setMapLoaded(false);
                setError('Failed to load 3D map');
                setIsInitializing(false);
            }
        };

        try {
            initializeMap();
        } catch (error) {
            console.error('Error in map initialization:', error);
            setError('Map initialization failed');
            setIsInitializing(false);
        }

        return () => {
            console.log('NFT3DMap: useEffect cleanup triggered');
            // Clear any existing timeout
            if (cleanupTimeout.current) {
                clearTimeout(cleanupTimeout.current);
            }
            
            // Only cleanup if we're not just loaded
            if (!mapLoadedRef.current) {
                console.log('NFT3DMap: Cleaning up - map not loaded');
                cleanup();
                // Reset states
                setMapLoaded(false);
                setError(null);
                setIsInitializing(false);
                initializedNFT.current = null;
                mapLoadedRef.current = false;
            } else {
                console.log('NFT3DMap: Skipping cleanup - map is loaded');
            }
        };
    }, [nft?.id]); // Only depend on NFT ID, not user location

    // Helper function to create a circle around a point
    const createCircle = (lng, lat, radiusMeters) => {
        const points = 64;
        const coords = [];
        
        for (let i = 0; i < points; i++) {
            const angle = (i * 360) / points;
            const dx = radiusMeters * Math.cos(angle * Math.PI / 180);
            const dy = radiusMeters * Math.sin(angle * Math.PI / 180);
            
            // Convert meters to degrees (approximate)
            const newLng = lng + (dx / (111320 * Math.cos(lat * Math.PI / 180)));
            const newLat = lat + (dy / 110540);
            
            coords.push([newLng, newLat]);
        }
        
        coords.push(coords[0]); // Close the polygon
        return coords;
    };

    const calculateDistance = () => {
        if (!userLocation) return null;
        
        const R = 6371000; // Earth's radius in meters
        const dLat = (nft.latitude - userLocation.lat) * Math.PI / 180;
        const dLon = (nft.longitude - userLocation.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(nft.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return Math.round(distance);
    };

    const distance = calculateDistance();
    const isInRange = distance !== null && distance <= nft.radius_meters;

    // Map control functions
    const changeMapStyle = (style) => {
        if (mapInstance.current) {
            mapInstance.current.setStyle(style);
            setMapStyle(style);
        }
    };

    const toggle3D = () => {
        if (mapInstance.current) {
            const newPitch = is3D ? 0 : 60;
            const newBearing = is3D ? 0 : 0;
            
            mapInstance.current.easeTo({
                pitch: newPitch,
                bearing: newBearing,
                duration: 1000
            });
            
            setIs3D(!is3D);
        }
    };

    const resetView = () => {
        if (mapInstance.current) {
            mapInstance.current.easeTo({
                center: [nft.longitude, nft.latitude],
                zoom: 20,
                pitch: 60,
                bearing: 0,
                duration: 1000
            });
        }
    };

    const centerOnUser = () => {
        if (mapInstance.current && userLocation) {
            mapInstance.current.easeTo({
                center: [userLocation.lon, userLocation.lat],
                zoom: 18,
                pitch: 60,
                bearing: 0,
                duration: 1000
            });
        }
    };

    const focusOnNFT = () => {
        if (mapInstance.current) {
            mapInstance.current.easeTo({
                center: [parseFloat(nft.longitude), parseFloat(nft.latitude)],
                zoom: 20,
                pitch: 60,
                bearing: 0,
                duration: 1000
            });
        }
    };

    const zoomIn = () => {
        if (mapInstance.current) {
            const currentZoomLevel = mapInstance.current.getZoom();
            const newZoom = Math.min(currentZoomLevel + 2, 22);
            mapInstance.current.easeTo({
                zoom: newZoom,
                duration: 500
            });
            setCurrentZoom(Math.round(newZoom));
        }
    };

    const zoomOut = () => {
        if (mapInstance.current) {
            const currentZoomLevel = mapInstance.current.getZoom();
            const newZoom = Math.max(currentZoomLevel - 2, 1);
            mapInstance.current.easeTo({
                zoom: newZoom,
                duration: 500
            });
            setCurrentZoom(Math.round(newZoom));
        }
    };

    const fitToView = () => {
        if (mapInstance.current && userLocation) {
            // Fit both user location and NFT in view
            const bounds = new window.mapboxgl.LngLatBounds();
            bounds.extend([userLocation.lon, userLocation.lat]);
            bounds.extend([parseFloat(nft.longitude), parseFloat(nft.latitude)]);
            
            mapInstance.current.fitBounds(bounds, {
                padding: 50,
                duration: 1000
            });
        } else if (mapInstance.current) {
            // Just focus on NFT if no user location
            focusOnNFT();
        }
    };

    const tiltUp = () => {
        if (mapInstance.current) {
            const newPitch = Math.min(currentPitch + 15, 85);
            mapInstance.current.easeTo({
                pitch: newPitch,
                duration: 500
            });
            setCurrentPitch(newPitch);
        }
    };

    const tiltDown = () => {
        if (mapInstance.current) {
            const newPitch = Math.max(currentPitch - 15, 0);
            mapInstance.current.easeTo({
                pitch: newPitch,
                duration: 500
            });
            setCurrentPitch(newPitch);
        }
    };

    const rotateLeft = () => {
        if (mapInstance.current) {
            const newBearing = (currentBearing - 15) % 360;
            mapInstance.current.easeTo({
                bearing: newBearing,
                duration: 500
            });
            setCurrentBearing(newBearing);
        }
    };

    const rotateRight = () => {
        if (mapInstance.current) {
            const newBearing = (currentBearing + 15) % 360;
            mapInstance.current.easeTo({
                bearing: newBearing,
                duration: 500
            });
            setCurrentBearing(newBearing);
        }
    };

    // Early return if no NFT data
    if (!nft) {
        return (
            <Box sx={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No NFT data available</Typography>
            </Box>
        );
    }

    // Fallback when Mapbox completely fails
    if (error && error.includes('Mapbox GL JS failed to load')) {
        return (
            <Box sx={{ height: '250px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <Typography variant="h6" color="error" gutterBottom>
                    Map Unavailable
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    Unable to load 3D map. Showing NFT information instead.
                </Typography>
                
                {/* NFT Info Fallback */}
                <Box sx={{ mt: 2, p: 2, border: '1px solid #ddd', borderRadius: 1, backgroundColor: 'background.paper' }}>
                    <Typography variant="subtitle1" gutterBottom>
                        {nft.name || 'Unnamed NFT'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Location: {nft.latitude?.toFixed(6)}, {nft.longitude?.toFixed(6)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Collection: {nft.collection_name || 'Unknown'}
                    </Typography>
                    {userLocation && (
                        <Typography variant="body2" color="text.secondary">
                            Distance: {calculateDistance()}m
                        </Typography>
                    )}
                </Box>

                <Button 
                    variant="contained" 
                    onClick={onCollect}
                    disabled={isCollecting}
                    sx={{ mt: 2 }}
                >
                    {isCollecting ? 'Collecting...' : 'Collect NFT'}
                </Button>
            </Box>
        );
    }

    // Add error boundary for map rendering
    if (error && error.includes('removeChild')) {
        return (
            <Box sx={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <Typography variant="h6" color="error" gutterBottom>
                    Map Error
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    There was an issue loading the map. Please try again.
                </Typography>
                <Button 
                    variant="outlined" 
                    onClick={() => {
                        setError(null);
                        setMapLoaded(false);
                    }}
                    sx={{ mt: 1 }}
                >
                    Retry
                </Button>
            </Box>
        );
    }

    try {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* NFT Details Section */}
                <Box sx={{ p: 3, backgroundColor: 'background.paper', borderBottom: '1px solid #e0e0e0' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h5" fontWeight="bold">
                            {nft.name || 'Unnamed NFT'}
                        </Typography>
                        <Chip
                            label={nft.rarity_level}
                            size="small"
                            sx={{
                                backgroundColor: getRarityColor(nft.rarity_level),
                                color: 'white',
                                textTransform: 'capitalize'
                            }}
                        />
                    </Box>

                    <Typography variant="body1" color="text.secondary" paragraph>
                        {nft.description}
                    </Typography>

                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Collection: {nft.collection_name || 'Unknown'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Location: {nft.latitude ? Number(nft.latitude).toFixed(6) : 'N/A'}, {nft.longitude ? Number(nft.longitude).toFixed(6) : 'N/A'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Collection radius: {nft.radius_meters}m
                            </Typography>
                            {userLocation && (
                                <Typography variant="body2" color="text.secondary">
                                    Distance: {distance ? `${distance}m` : 'Unknown'}
                                </Typography>
                            )}
                        </Box>
                        
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<MyLocation />}
                            onClick={onCollect}
                            disabled={!isInRange || isCollecting}
                            sx={{
                                backgroundColor: isInRange ? '#4CAF50' : '#f44336',
                                '&:hover': {
                                    backgroundColor: isInRange ? '#45a049' : '#d32f2f'
                                }
                            }}
                        >
                            {isCollecting ? 'Collecting...' : (isInRange ? 'Collect NFT' : 'Out of Range')}
                        </Button>
                    </Box>

                    {!isInRange && distance && (
                        <Alert severity="warning" sx={{ mt: 1 }}>
                            You need to be within {nft.radius_meters}m to collect this NFT. You are {distance}m away.
                        </Alert>
                    )}
                </Box>

                {/* NFT Image Section */}
                <Box sx={{ p: 2, backgroundColor: 'background.paper', borderBottom: '1px solid #e0e0e0' }}>
                    {nft.ipfs_hash ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <img 
                                src={`https://ipfs.io/ipfs/${nft.ipfs_hash}`}
                                alt={nft.name || 'NFT'}
                                style={{
                                    maxWidth: '200px',
                                    maxHeight: '200px',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    border: '2px solid #e0e0e0'
                                }}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                }}
                            />
                        </Box>
                    ) : nft.image_url ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <img 
                                src={nft.image_url}
                                alt={nft.name || 'NFT'}
                                style={{
                                    maxWidth: '200px',
                                    maxHeight: '200px',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    border: '2px solid #e0e0e0'
                                }}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                }}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                            <Typography variant="body2" color="text.secondary">
                                No image available
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Map Section */}
                <Box sx={{ height: '400px', position: 'relative', flex: 1 }}>
                    <Box
                        ref={mapContainer}
                        key={`map-${nft.id || 'unknown'}`}
                        sx={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 1,
                            overflow: 'hidden',
                            backgroundColor: '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid #e0e0e0',
                            minHeight: '400px'
                        }}
                    >
                {!mapLoaded && !error && (
                    <Box sx={{ textAlign: 'center', p: 3, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            Loading 3D Map...
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Please wait while the map initializes
                        </Typography>
                        <Box sx={{ mt: 2, p: 2, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                Container: {mapContainer.current?.offsetWidth}x{mapContainer.current?.offsetHeight}
                            </Typography>
                        </Box>
                    </Box>
                )}
                {error && (
                    <Box sx={{ textAlign: 'center', p: 3 }}>
                        <Typography variant="h6" color="error" gutterBottom>
                            Map Error
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {error}
                        </Typography>
                        <Button 
                            variant="outlined" 
                            size="small"
                            onClick={() => {
                                setError(null);
                                setMapLoaded(false);
                                // Retry map initialization
                                setTimeout(() => {
                                    if (mapContainer.current && nft) {
                                        const event = new Event('resize');
                                        window.dispatchEvent(event);
                                    }
                                }, 100);
                            }}
                            sx={{ mt: 1 }}
                        >
                            Retry
                        </Button>
                    </Box>
                )}
                    </Box>

                    {/* Distance and Status Overlay */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 16,
                            left: 16,
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: 2,
                            p: 2,
                            minWidth: '200px'
                        }}
                    >
                        <Typography variant="subtitle2" gutterBottom>
                            NFT Location Info
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Distance: {distance ? `${distance}m` : 'Unknown'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Collection Radius: {nft.radius_meters}m
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Zoom: {currentZoom} | Tilt: {currentPitch}° | Bearing: {currentBearing}°
                        </Typography>
                        <Box sx={{ mt: 1 }}>
                            <Chip
                                label={isInRange ? "In Range - Can Collect!" : "Out of Range"}
                                color={isInRange ? "success" : "error"}
                                size="small"
                                sx={{ fontWeight: 'bold' }}
                            />
                        </Box>
                    </Box>

                    {/* Map Controls - Top Right */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            borderRadius: 2,
                            padding: 1,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            backdropFilter: 'blur(10px)'
                        }}
                    >
                        {/* Focus on NFT Button */}
                        <Button
                            variant="contained"
                            size="small"
                            onClick={focusOnNFT}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                backgroundColor: '#1976d2',
                                '&:hover': {
                                    backgroundColor: '#1565c0'
                                }
                            }}
                            title="Focus on NFT Marker"
                        >
                            <LocationOn fontSize="small" />
                        </Button>

                        {/* Zoom Controls */}
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={zoomIn}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Zoom In"
                        >
                            +
                        </Button>

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={zoomOut}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Zoom Out"
                        >
                            −
                        </Button>

                        {/* Tilt Controls */}
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={tiltUp}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Tilt Up"
                        >
                            ↖
                        </Button>

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={tiltDown}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Tilt Down"
                        >
                            ↙
                        </Button>

                        {/* Rotation Controls */}
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={rotateLeft}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Rotate Left"
                        >
                            ↶
                        </Button>

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={rotateRight}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Rotate Right"
                        >
                            ↷
                        </Button>

                        {/* Toggle Controls Button */}
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setShowControls(!showControls)}
                            sx={{ 
                                minWidth: 'auto', 
                                px: 1,
                                borderColor: '#1976d2',
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                    borderColor: '#1565c0'
                                }
                            }}
                            title="Toggle Map Controls"
                        >
                            {showControls ? '−' : '+'}
                        </Button>

                        {/* Extended Controls */}
                        {showControls && (
                            <>
                                {/* 3D Toggle */}
                                <Button
                                    variant={is3D ? "contained" : "outlined"}
                                    size="small"
                                    onClick={toggle3D}
                                    sx={{ minWidth: 'auto', px: 1 }}
                                    title={is3D ? "Switch to 2D" : "Switch to 3D"}
                                >
                                    3D
                                </Button>

                                {/* Center on User */}
                                {userLocation && (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={centerOnUser}
                                        sx={{ minWidth: 'auto', px: 1 }}
                                        title="Center on Your Location"
                                    >
                                        <MyLocation fontSize="small" />
                                    </Button>
                                )}

                                {/* Fit to View */}
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={fitToView}
                                    sx={{ minWidth: 'auto', px: 1 }}
                                    title="Fit Both Locations in View"
                                >
                                    📐
                                </Button>

                                {/* Map Style Buttons */}
                                <Button
                                    variant={mapStyle.includes('satellite') ? "contained" : "outlined"}
                                    size="small"
                                    onClick={() => changeMapStyle('mapbox://styles/mapbox/satellite-streets-v12')}
                                    sx={{ minWidth: 'auto', px: 1, fontSize: '10px' }}
                                    title="Satellite View"
                                >
                                    🛰️
                                </Button>

                                <Button
                                    variant={mapStyle.includes('streets') ? "contained" : "outlined"}
                                    size="small"
                                    onClick={() => changeMapStyle('mapbox://styles/mapbox/streets-v12')}
                                    sx={{ minWidth: 'auto', px: 1, fontSize: '10px' }}
                                    title="Street View"
                                >
                                    🗺️
                                </Button>

                                <Button
                                    variant={mapStyle.includes('dark') ? "contained" : "outlined"}
                                    size="small"
                                    onClick={() => changeMapStyle('mapbox://styles/mapbox/dark-v11')}
                                    sx={{ minWidth: 'auto', px: 1, fontSize: '10px' }}
                                    title="Dark Mode"
                                >
                                    🌙
                                </Button>
                            </>
                        )}
                    </Box>
                </Box>
            </Box>
        );
    } catch (error) {
        console.error('Error rendering NFT3DMap:', error);
        return (
            <Box sx={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="error">Error loading 3D map</Typography>
            </Box>
        );
    }
};

// Helper function for rarity colors
const getRarityColor = (rarity) => {
    switch (rarity) {
        case 'common': return '#4CAF50';
        case 'rare': return '#2196F3';
        case 'legendary': return '#9C27B0';
        default: return '#757575';
    }
};

export default NFT3DMap;
