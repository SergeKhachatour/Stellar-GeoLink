import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip,
    Card,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';
import {
    Search,
    MyLocation,
    Add,
    ZoomIn,
    ZoomOut,
    Palette,
    ViewInAr,
    ViewInArOutlined,
    RotateLeft,
    RotateRight,
    Settings
} from '@mui/icons-material';
import api from '../../services/api';

const PinNFTMap = ({ onNFTPinned, collections = [] }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [mapboxToken, setMapboxToken] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [locationSettingsOpen, setLocationSettingsOpen] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [addressSearch, setAddressSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [mapReady, setMapReady] = useState(false);

    // Form state
    const [pinForm, setPinForm] = useState({
        collection_id: '',
        latitude: '',
        longitude: '',
        radius_meters: 10,
        ipfs_hash: '',
        smart_contract_address: ''
    });

    // Map style state
    const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-v9');
    const [is3D, setIs3D] = useState(false);
    const [pitch, setPitch] = useState(0);
    const [bearing, setBearing] = useState(0);
    const [auto3D, setAuto3D] = useState(true); // Auto 3D when zoomed in
    const [currentZoom, setCurrentZoom] = useState(10);
    const [auto3DThreshold, setAuto3DThreshold] = useState(16); // Zoom level threshold for auto 3D
    const [styleMenuAnchor, setStyleMenuAnchor] = useState(null);

    const mapStyles = [
        { id: 'streets', name: 'Streets', style: 'mapbox://styles/mapbox/streets-v12', icon: '🗺️' },
        { id: 'satellite', name: 'Satellite', style: 'mapbox://styles/mapbox/satellite-v9', icon: '🛰️' },
        { id: 'dark', name: 'Dark', style: 'mapbox://styles/mapbox/dark-v11', icon: '🌙' },
        { id: 'light', name: 'Light', style: 'mapbox://styles/mapbox/light-v11', icon: '☀️' },
        { id: 'outdoors', name: 'Outdoors', style: 'mapbox://styles/mapbox/outdoors-v12', icon: '🏔️' }
    ];

    useEffect(() => {
        loadMapboxToken();
        getUserLocation();
    }, []);

    useEffect(() => {
        if (mapboxToken && mapRef.current) {
            initializeMap();
        }
    }, [mapboxToken]);

    useEffect(() => {
        if (userLocation && mapInstanceRef.current) {
            addUserLocationMarker();
            mapInstanceRef.current.flyTo({
                center: [userLocation.lon, userLocation.lat],
                zoom: 18, // Reasonable zoom level
                duration: 1000
            });
        }
    }, [userLocation]);

    useEffect(() => {
        if (pinForm.latitude && pinForm.longitude && mapInstanceRef.current) {
            const lat = parseFloat(pinForm.latitude);
            const lng = parseFloat(pinForm.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                console.log('Form coordinates changed, updating map:', { lat, lng });
                mapInstanceRef.current.flyTo({
                    center: [lng, lat],
                    zoom: 18, // Reasonable zoom level
                    duration: 1000
                });
                addLocationMarker(lat, lng);
            }
        }
    }, [pinForm.latitude, pinForm.longitude]);

    const loadMapboxToken = async () => {
        try {
            const response = await api.get('/config/mapbox-token');
            setMapboxToken(response.data.token);
        } catch (error) {
            console.error('Error loading Mapbox token:', error);
            // Fallback token for development
            setMapboxToken('pk.eyJ1Ijoic2VyZ2UzNjl4MzMiLCJhIjoiY20zZHkzb2xoMDA0eTJxcHU4MTNoYjNlaCJ9.Xl6OxzF9td1IgTTeUp526w');
        }
    };

    const getUserLocation = () => {
        if (navigator.geolocation) {
            console.log('Requesting user location...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    console.log('Location obtained:', location);
                    setUserLocation(location);
                    setCurrentLocation(location);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    setError('Unable to get your location. Please enable location services.');
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    };

    const initializeMap = () => {
        if (!window.mapboxgl || !mapboxToken) {
            console.error('Mapbox GL JS not loaded or token not available');
            return;
        }

        console.log('Initializing map with token:', mapboxToken);

        const mapInstance = new window.mapboxgl.Map({
            container: mapRef.current,
            style: mapStyle,
            center: userLocation ? [userLocation.lon, userLocation.lat] : [-118.2321, 34.2305],
            zoom: userLocation ? 18 : 10, // Reasonable zoom when user location is available
            pitch: pitch,
            bearing: bearing,
            accessToken: mapboxToken,
            projection: 'globe',
            // Set explicit zoom limits
            maxZoom: 22,
            minZoom: 0
        });

                mapInstance.on('load', () => {
                    console.log('Map loaded successfully');
                    mapInstanceRef.current = mapInstance;
                    setMapReady(true);

                    // Add zoom event listener for auto 3D with debounce
                    let zoomTimeout;
                    mapInstance.on('zoom', () => {
                        const zoom = mapInstance.getZoom();
                        setCurrentZoom(zoom);
                        
                        // Clear previous timeout
                        if (zoomTimeout) {
                            clearTimeout(zoomTimeout);
                        }
                        
                        // Debounce auto-3D switching to prevent constant triggering
                        zoomTimeout = setTimeout(() => {
                            if (auto3D) {
                                const shouldBe3D = zoom >= auto3DThreshold; // Switch to 3D at configurable threshold
                                
                                if (shouldBe3D && !is3D) {
                                    console.log('Auto-switching to 3D view (zoom:', zoom, ')');
                                    setIs3D(true);
                                    setPitch(60);
                                    mapInstance.flyTo({
                                        pitch: 60,
                                        zoom: zoom, // Preserve current zoom level
                                        duration: 1000
                                    });
                                } else if (!shouldBe3D && is3D) {
                                    console.log('Auto-switching to 2D view (zoom:', zoom, ')');
                                    setIs3D(false);
                                    setPitch(0);
                                    mapInstance.flyTo({
                                        pitch: 0,
                                        zoom: zoom, // Preserve current zoom level
                                        duration: 1000
                                    });
                                }
                            }
                        }, 500); // 500ms debounce
                    });

                    // Add moveend event listener to update zoom level
                    mapInstance.on('moveend', () => {
                        const currentZoom = mapInstance.getZoom();
                        setCurrentZoom(currentZoom);
                    });

                    // Add zoomend event listener for better zoom tracking
                    mapInstance.on('zoomend', () => {
                        const currentZoom = mapInstance.getZoom();
                        const maxZoom = mapInstance.getMaxZoom();
                        setCurrentZoom(currentZoom);
                        console.log('Zoom ended at level:', currentZoom, 'Max zoom:', maxZoom);
                        
                        if (currentZoom >= maxZoom) {
                            console.log('Reached maximum zoom level');
                        }
                    });

                    // Add zoom event listener for real-time zoom tracking
                    mapInstance.on('zoom', () => {
                        const currentZoom = mapInstance.getZoom();
                        const maxZoom = mapInstance.getMaxZoom();
                        setCurrentZoom(currentZoom);
                        console.log('Zoom level:', currentZoom, 'Max zoom:', maxZoom);
                        
                        if (currentZoom >= maxZoom) {
                            console.log('At maximum zoom level');
                        }
                    });

                    // Add wheel event listener to ensure maximum zoom is reached
                    mapInstance.on('wheel', () => {
                        const currentZoom = mapInstance.getZoom();
                        const maxZoom = mapInstance.getMaxZoom();
                        console.log('Wheel zoom - Current:', currentZoom, 'Max:', maxZoom);
                    });

                    // Remove custom wheel handler to allow native zoom behavior

                    // Add click handler for location selection
                    mapInstance.on('click', (e) => {
                        const { lng, lat } = e.lngLat;
                        console.log('Map clicked at:', { lat, lng });
                        setSelectedLocation({ lat, lon: lng });
                        setPinForm(prev => ({
                            ...prev,
                            latitude: lat.toString(),
                            longitude: lng.toString()
                        }));

                        // Add marker for selected location
                        addLocationMarker(lat, lng);

                        // Update address search field with reverse geocoding
                        reverseGeocode(lat, lng);

                        console.log('Updated form with clicked coordinates:', { lat: lat.toString(), lng: lng.toString() });
                    });

            // Add user location marker if available
            if (userLocation) {
                addUserLocationMarker();
                // Center map on user location if available
                mapInstance.flyTo({
                    center: [userLocation.lon, userLocation.lat],
                    zoom: 15,
                    duration: 1000
                });
            }
        });

        mapInstance.on('error', (e) => {
            console.error('Map error:', e);
            setError('Map failed to load. Please try again.');
        });
    };

    const addLocationMarker = (lat, lng) => {
        if (mapInstanceRef.current) {
            // Remove existing location marker
            const existingMarker = document.getElementById('location-marker');
            if (existingMarker) {
                existingMarker.remove();
            }

            // Add new marker
            const marker = new window.mapboxgl.Marker({ color: '#ff4444' })
                .setLngLat([lng, lat])
                .addTo(mapInstanceRef.current);
            
            marker.getElement().id = 'location-marker';
        }
    };

    const addUserLocationMarker = () => {
        if (mapInstanceRef.current && userLocation) {
            // Remove existing user marker
            const existingMarker = document.getElementById('user-marker');
            if (existingMarker) {
                existingMarker.remove();
            }

            // Add user location marker
            const marker = new window.mapboxgl.Marker({ color: '#4444ff' })
                .setLngLat([userLocation.lon, userLocation.lat])
                .addTo(mapInstanceRef.current);
            
            marker.getElement().id = 'user-marker';
        }
    };

    const searchAddress = async () => {
        if (!addressSearch.trim() || !mapboxToken) return;

        try {
            setLoading(true);
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressSearch)}.json?access_token=${mapboxToken}&limit=5`
            );
            const data = await response.json();
            
            if (data.features) {
                setSearchResults(data.features);
                setShowSearchResults(true);
            }
        } catch (error) {
            console.error('Error searching address:', error);
            setError('Failed to search address');
        } finally {
            setLoading(false);
        }
    };

    const selectSearchResult = (result) => {
        const [lng, lat] = result.center;
        console.log('Selected search result:', { lat, lng, name: result.place_name });
        
        setSelectedLocation({ lat, lon: lng });
        setPinForm(prev => ({
            ...prev,
            latitude: lat.toString(),
            longitude: lng.toString()
        }));
        
        // Center map on selected location with maximum zoom
        if (mapInstanceRef.current) {
            console.log('Centering map on selected address with max zoom');
            mapInstanceRef.current.flyTo({
                center: [lng, lat],
                zoom: 18, // Reasonable zoom level
                duration: 1000
            });
            addLocationMarker(lat, lng);
        } else {
            console.log('Map not ready, will center when loaded');
            // Store the location to center when map is ready
            setTimeout(() => {
                if (mapInstanceRef.current) {
                    console.log('Delayed centering map on selected address with max zoom');
                    mapInstanceRef.current.flyTo({
                        center: [lng, lat],
                        zoom: 18, // Reasonable zoom level
                        duration: 1000
                    });
                    addLocationMarker(lat, lng);
                }
            }, 1000);
        }
        
        setShowSearchResults(false);
        setAddressSearch(result.place_name);
        
        // Force form update
        console.log('Updated form with coordinates:', { lat: lat.toString(), lng: lng.toString() });
    };

    const useCurrentLocation = () => {
        if (userLocation) {
            console.log('Using current location:', userLocation);
            setSelectedLocation({ lat: userLocation.lat, lon: userLocation.lon });
            setPinForm(prev => ({
                ...prev,
                latitude: userLocation.lat.toString(),
                longitude: userLocation.lon.toString()
            }));

            // Center map on user location with maximum zoom
            if (mapInstanceRef.current) {
                console.log('Centering map on user location with max zoom');
                mapInstanceRef.current.flyTo({
                    center: [userLocation.lon, userLocation.lat],
                    zoom: 18, // Reasonable zoom level
                    duration: 1000
                });
                addUserLocationMarker();
            }

            // Update address search field with reverse geocoding
            reverseGeocode(userLocation.lat, userLocation.lon);
            
            console.log('Updated form with current location coordinates:', { lat: userLocation.lat.toString(), lng: userLocation.lon.toString() });
        }
    };

    const reverseGeocode = async (lat, lng) => {
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1`
            );
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const placeName = data.features[0].place_name;
                setAddressSearch(placeName);
                console.log('Reverse geocoded address:', placeName);
            }
        } catch (error) {
            console.error('Error reverse geocoding:', error);
        }
    };

    const handlePinNFT = async () => {
        try {
            setLoading(true);
            setError('');
            
            const response = await api.post('/nft/pin', pinForm);
            
            if (response.data.success) {
                setSuccess('NFT pinned successfully!');
                if (onNFTPinned) {
                    onNFTPinned(response.data.nft);
                }
                
                // Reset form
                setPinForm({
                    collection_id: '',
                    latitude: '',
                    longitude: '',
                    radius_meters: 10,
                    ipfs_hash: '',
                    smart_contract_address: ''
                });
                setSelectedLocation(null);
                setAddressSearch('');
            }
        } catch (error) {
            console.error('Error pinning NFT:', error);
            setError(error.response?.data?.error || 'Failed to pin NFT');
        } finally {
            setLoading(false);
        }
    };

    const changeMapStyle = (style) => {
        setMapStyle(style);
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setStyle(style);
        }
    };

    const toggle3D = () => {
        setIs3D(!is3D);
        if (mapInstanceRef.current) {
            const currentZoom = mapInstanceRef.current.getZoom();
            if (!is3D) {
                mapInstanceRef.current.flyTo({ 
                    pitch: 60, 
                    bearing: 0,
                    zoom: currentZoom, // Preserve zoom level
                    duration: 1000
                });
                setPitch(60);
            } else {
                mapInstanceRef.current.flyTo({ 
                    pitch: 0, 
                    bearing: 0,
                    zoom: currentZoom, // Preserve zoom level
                    duration: 1000
                });
                setPitch(0);
            }
        }
        // Disable auto-3D when manually toggled
        setAuto3D(false);
    };

    const toggleAuto3D = () => {
        setAuto3D(!auto3D);
        if (auto3D) {
            // Re-enabling auto-3D, check current zoom and apply 3D if needed
            if (mapInstanceRef.current) {
                const zoom = mapInstanceRef.current.getZoom();
                if (zoom >= auto3DThreshold && !is3D) {
                    setIs3D(true);
                    setPitch(60);
                    mapInstanceRef.current.flyTo({
                        pitch: 60,
                        zoom: zoom, // Preserve current zoom
                        duration: 1000
                    });
                } else if (zoom < auto3DThreshold && is3D) {
                    setIs3D(false);
                    setPitch(0);
                    mapInstanceRef.current.flyTo({
                        pitch: 0,
                        zoom: zoom, // Preserve current zoom
                        duration: 1000
                    });
                }
            }
        }
    };

    const rotateMap = (direction) => {
        const rotation = direction === 'left' ? -15 : 15;
        const newBearing = bearing + rotation;
        setBearing(newBearing);
        if (mapInstanceRef.current) {
            mapInstanceRef.current.easeTo({ bearing: newBearing });
        }
    };

    const zoomIn = () => {
        if (mapInstanceRef.current) {
            const currentZoom = mapInstanceRef.current.getZoom();
            const maxZoom = mapInstanceRef.current.getMaxZoom();
            console.log('Current zoom:', currentZoom, 'Max zoom:', maxZoom);
            
            if (currentZoom < maxZoom) {
                mapInstanceRef.current.zoomIn();
            } else {
                console.log('Already at maximum zoom level');
            }
        }
    };

    const zoomOut = () => {
        if (mapInstanceRef.current) {
            const currentZoom = mapInstanceRef.current.getZoom();
            const minZoom = mapInstanceRef.current.getMinZoom();
            console.log('Current zoom:', currentZoom, 'Min zoom:', minZoom);
            
            if (currentZoom > minZoom) {
                mapInstanceRef.current.zoomOut();
            } else {
                console.log('Already at minimum zoom level');
            }
        }
    };

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Form Fields Above Map */}
            <Paper sx={{ p: 3, mb: 2, backgroundColor: 'white', boxShadow: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Pin NFT to Location
                </Typography>
                
                {/* Address Search */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search for an address..."
                        value={addressSearch}
                        onChange={(e) => setAddressSearch(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchAddress()}
                    />
                    <Button
                        variant="contained"
                        onClick={searchAddress}
                        disabled={loading || !addressSearch.trim()}
                        startIcon={<Search />}
                    >
                        Search
                    </Button>
                </Box>

                {/* Search Results */}
                {showSearchResults && searchResults.length > 0 && (
                    <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
                        {searchResults.map((result, index) => (
                            <Button
                                key={index}
                                fullWidth
                                onClick={() => selectSearchResult(result)}
                                sx={{ justifyContent: 'flex-start', textAlign: 'left', mb: 1 }}
                            >
                                <Typography variant="body2" noWrap>
                                    {result.place_name}
                                </Typography>
                            </Button>
                        ))}
                    </Box>
                )}

                {/* Current Location Button */}
                <Button
                    variant="outlined"
                    fullWidth
                    onClick={useCurrentLocation}
                    disabled={!userLocation}
                    startIcon={<MyLocation />}
                    sx={{ mb: 2 }}
                >
                    Use Current Location
                </Button>

                {/* Selected Location Info */}
                {selectedLocation && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            <strong>Selected Location:</strong> {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
                        </Typography>
                        {addressSearch && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                <strong>Address:</strong> {addressSearch}
                            </Typography>
                        )}
                    </Alert>
                )}

                {/* NFT Form */}
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Collection</InputLabel>
                            <Select
                                value={pinForm.collection_id}
                                onChange={(e) => setPinForm(prev => ({ ...prev, collection_id: e.target.value }))}
                                label="Collection"
                            >
                                {collections.map((collection) => (
                                    <MenuItem key={collection.id} value={collection.id}>
                                        {collection.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Latitude"
                            value={pinForm.latitude}
                            onChange={(e) => setPinForm(prev => ({ ...prev, latitude: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Longitude"
                            value={pinForm.longitude}
                            onChange={(e) => setPinForm(prev => ({ ...prev, longitude: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            size="small"
                            label="IPFS Hash"
                            value={pinForm.ipfs_hash}
                            onChange={(e) => setPinForm(prev => ({ ...prev, ipfs_hash: e.target.value }))}
                            placeholder="Qm..."
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Smart Contract Address"
                            value={pinForm.smart_contract_address}
                            onChange={(e) => setPinForm(prev => ({ ...prev, smart_contract_address: e.target.value }))}
                            placeholder="0x..."
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="contained"
                            fullWidth
                            onClick={handlePinNFT}
                            disabled={loading || !pinForm.collection_id || !pinForm.latitude || !pinForm.longitude}
                            startIcon={<Add />}
                        >
                            {loading ? 'Pinning...' : 'Pin NFT'}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

                    {/* Map Container */}
                    <Box sx={{ flex: 1, position: 'relative', minHeight: '500px', zIndex: 1 }}>
                        <div 
                            ref={mapRef} 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                position: 'relative', 
                                zIndex: 1,
                                cursor: 'grab',
                                touchAction: 'pan-x pan-y'
                            }} 
                        />
                
                {/* Map Loading Indicator */}
                {!mapReady && (
                    <Box sx={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1000,
                        backgroundColor: 'white',
                        padding: 2,
                        borderRadius: 1,
                        boxShadow: 3
                    }}>
                        <CircularProgress />
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Loading map...
                        </Typography>
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
                                <IconButton onClick={(e) => setStyleMenuAnchor(e.currentTarget)} size="small">
                                    <Palette />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Card>

                    {/* 3D Controls */}
                    <Card sx={{ p: 1 }}>
                        <Box display="flex" flexDirection="column" gap={0.5}>
                            <Tooltip title={is3D ? "Exit 3D" : "Enter 3D"}>
                                <IconButton onClick={toggle3D} size="small">
                                    {is3D ? <ViewInArOutlined /> : <ViewInAr />}
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={auto3D ? "Disable Auto 3D" : "Enable Auto 3D"}>
                                <IconButton 
                                    onClick={toggleAuto3D} 
                                    size="small"
                                    color={auto3D ? "primary" : "default"}
                                >
                                    <Settings />
                                </IconButton>
                            </Tooltip>
                            {is3D && (
                                <>
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
                                </>
                            )}
                        </Box>
                    </Card>

                    {/* Status Indicator */}
                    <Card sx={{ p: 1 }}>
                        <Box display="flex" flexDirection="column" gap={0.5}>
                            <Typography variant="caption" sx={{ textAlign: 'center', fontSize: '0.7rem' }}>
                                Zoom: {currentZoom.toFixed(1)}
                            </Typography>
                            <Typography variant="caption" sx={{ textAlign: 'center', fontSize: '0.7rem' }}>
                                {auto3D ? `Auto 3D (≥${auto3DThreshold})` : 'Manual 3D'}
                            </Typography>
                            {is3D && (
                                <Typography variant="caption" sx={{ textAlign: 'center', fontSize: '0.7rem', color: 'primary.main' }}>
                                    3D Active
                                </Typography>
                            )}
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
                    <IconButton
                        color="primary"
                        onClick={getUserLocation}
                        size="medium"
                        sx={{ backgroundColor: 'white', boxShadow: 2 }}
                    >
                        <MyLocation />
                    </IconButton>
                </Box>

                {/* Style Menu */}
                <Dialog
                    open={Boolean(styleMenuAnchor)}
                    onClose={() => setStyleMenuAnchor(null)}
                >
                    <DialogTitle>Choose Map Style</DialogTitle>
                    <DialogContent>
                        {mapStyles.map((style) => (
                            <Button
                                key={style.id}
                                fullWidth
                                onClick={() => {
                                    changeMapStyle(style.style);
                                    setStyleMenuAnchor(null);
                                }}
                                sx={{ justifyContent: 'flex-start', mb: 1 }}
                            >
                                <Typography sx={{ mr: 1 }}>{style.icon}</Typography>
                                {style.name}
                            </Button>
                        ))}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setStyleMenuAnchor(null)}>Close</Button>
                    </DialogActions>
                </Dialog>
            </Box>

            {/* Error/Success Messages */}
            {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                </Alert>
            )}
            {success && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    {success}
                </Alert>
            )}
        </Box>
    );
};

export default PinNFTMap;