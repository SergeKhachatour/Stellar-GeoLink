import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    InputAdornment
} from '@mui/material';
import { 
    MapOutlined, 
    TableChart, 
    Search as SearchIcon,
    MyLocation as MyLocationIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    Close as CloseIcon,
    Refresh as RefreshIcon,
    AccountBalanceWallet as WalletIcon
} from '@mui/icons-material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../../utils/api';
import { useWallet } from '../../contexts/WalletContext';
import WalletConnectionDialog from '../Wallet/WalletConnectionDialog';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

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
    
    // Map-related state
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const fetchingRef = useRef(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    // Wallet connection state
    const [openWalletDialog, setOpenWalletDialog] = useState(false);

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
                api.get('/nft/nearby', {
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

    // Add wallet and NFT markers to map
    const addWalletMarkers = useCallback(() => {
        if (!map.current || !filteredLocations.length) return;

        // Clear existing markers
        const markers = document.querySelectorAll('.wallet-marker, .nft-marker');
        markers.forEach(marker => marker.remove());

        filteredLocations.forEach(location => {
            // Validate and convert coordinates
            const lat = parseFloat(location.latitude);
            const lng = parseFloat(location.longitude);
            
            // Skip locations with invalid coordinates
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
                console.warn('Skipping location with invalid coordinates:', location);
                return;
            }
            
            const el = document.createElement('div');
            
            // Determine if this is an NFT or wallet
            const isNFT = location.collection_id || location.token_id;
            
            if (isNFT) {
                // NFT marker styling - square like NFT Manager
                el.className = 'nft-marker';
                el.style.cssText = `
                    background-image: url('${location.full_ipfs_url || 'https://via.placeholder.com/50x50/4caf50/ffffff?text=NFT'}');
                    background-size: cover;
                    background-position: center;
                    width: 50px;
                    height: 50px;
                    border-radius: 8px;
                    border: 3px solid #4caf50;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    position: relative;
                    transition: box-shadow 0.2s ease, border-color 0.2s ease;
                `;
                
                // Add hover effect without scaling
                el.addEventListener('mouseenter', () => {
                    el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
                    el.style.borderColor = '#66bb6a';
                });
                el.addEventListener('mouseleave', () => {
                    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                    el.style.borderColor = '#4caf50';
                });
                
                // Add NFT indicator
                const indicator = document.createElement('div');
                indicator.style.cssText = `
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    width: 16px;
                    height: 16px;
                    background-color: #ff9800;
                    border-radius: 50%;
                    border: 3px solid white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: bold;
                    color: white;
                `;
                indicator.textContent = 'N';
                el.appendChild(indicator);
            } else {
                // Wallet marker styling
                el.className = 'wallet-marker';
                el.style.cssText = `
                    background-color: ${location.location_enabled ? '#4caf50' : '#f44336'};
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 2px solid white;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                `;
            }

            new Mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .setPopup(new Mapboxgl.Popup({ 
                    offset: 25,
                    maxWidth: '500px',
                    className: 'custom-popup',
                    closeButton: true,
                    closeOnClick: false,
                    anchor: 'bottom'
                })
                    .setHTML(isNFT ? `
                        <div style="padding: 20px; max-width: 400px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <div style="display: flex; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e0e0e0;">
                                <span style="font-size: 24px; margin-right: 12px;">🎨</span>
                                <h3 style="margin: 0; color: #333; font-size: 18px; font-weight: 600;">NFT Collection</h3>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Name</p>
                                    <p style="margin: 0; font-size: 16px; font-weight: 500; color: #333;">${location.name || 'Unnamed NFT'}</p>
                                </div>
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Collection</p>
                                    <p style="margin: 0; font-size: 16px; font-weight: 500; color: #333;">${location.collection?.name || 'Unknown Collection'}</p>
                                </div>
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Token ID</p>
                                    <p style="margin: 0; font-size: 16px; font-weight: 500; color: #333;">#${location.token_id || 'N/A'}</p>
                                </div>
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Radius</p>
                                    <p style="margin: 0; font-size: 16px; font-weight: 500; color: #333;">${location.radius_meters || 100}m</p>
                                </div>
                            </div>
                            
                            <div style="margin-bottom: 16px;">
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Location</p>
                                <p style="margin: 0; font-size: 14px; color: #333; font-family: monospace;">${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                            </div>
                            
                            ${location.description ? `
                                <div style="margin-bottom: 16px;">
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Description</p>
                                    <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.4;">${location.description}</p>
                                </div>
                            ` : ''}
                            
                            <div style="margin-bottom: 16px; text-align: center;">
                                <img src="${location.full_ipfs_url || 'https://via.placeholder.com/300x300'}" 
                                     style="width: 100%; max-width: 300px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" 
                                     alt="NFT Image" />
                            </div>
                            
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                                <button onclick="window.open('https://stellar.expert/explorer/testnet/contract/${location.smart_contract_address}', '_blank')" 
                                        style="background: linear-gradient(135deg, #4caf50, #45a049); color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3); transition: all 0.2s ease;">
                                    📄 View Contract
                                </button>
                                <button onclick="window.open('https://stellar.expert/explorer/testnet/tx/${location.transaction_hash}', '_blank')" 
                                        style="background: linear-gradient(135deg, #FFD700, #FFA500); color: black; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3); transition: all 0.2s ease;">
                                    🔗 View Transaction
                                </button>
                                <button onclick="navigator.clipboard.writeText('${lat}, ${lng}')" 
                                        style="background: linear-gradient(135deg, #ff9800, #f57c00); color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3); transition: all 0.2s ease;">
                                    📋 Copy Coords
                                </button>
                            </div>
                        </div>
                    ` : `
                        <div style="padding: 8px;">
                            <h4 style="margin: 0 0 8px 0; color: #333;">${location.blockchain} Wallet</h4>
                            <p style="margin: 4px 0; font-size: 14px;"><strong>Type:</strong> ${location.wallet_type}</p>
                            <p style="margin: 4px 0; font-size: 14px;"><strong>Provider:</strong> ${location.provider_name}</p>
                            <p style="margin: 4px 0; font-size: 14px;"><strong>Status:</strong> ${location.location_enabled ? 'Active' : 'Disabled'}</p>
                            <p style="margin: 4px 0; font-size: 14px;"><strong>Location:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                            ${location.description ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Description:</strong> ${location.description}</p>` : ''}
                        </div>
                    `))
                .addTo(map.current);
        });
    }, [filteredLocations]);

    // Initialize map with enhanced features
    const initializeMap = useCallback(() => {
        if (!mapContainer.current) return;
        
        // Clean up existing map if it exists
        if (map.current) {
            map.current.remove();
            map.current = null;
            setMapLoaded(false);
        }

        map.current = new Mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [-74.5, 40],
            zoom: 2, // Start with global view
            projection: 'globe' // Enable 3D globe
        });

        map.current.on('load', () => {
            setMapLoaded(true);
            addWalletMarkers();
            addMapControls();
            add3DEffects();
        });

        // Add click handler for location selection
        map.current.on('click', (e) => {
            setSelectedLocation({
                latitude: e.lngLat.lat,
                longitude: e.lngLat.lng
            });
        });

        // Add double-click zoom functionality
        map.current.on('dblclick', (e) => {
            map.current.flyTo({
                center: [e.lngLat.lng, e.lngLat.lat],
                zoom: 18,
                duration: 1000
            });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Add 3D effects and globe styling
    const add3DEffects = () => {
        if (!map.current) return;

        try {
            // Add 3D buildings with enhanced styling
            if (map.current.getLayer('building')) {
                map.current.setPaintProperty('building', 'fill-extrusion-height', [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'height']
                ]);
                map.current.setPaintProperty('building', 'fill-extrusion-base', [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'min_height']
                ]);
                map.current.setPaintProperty('building', 'fill-extrusion-color', [
                    'interpolate',
                    ['linear'],
                    ['get', 'height'],
                    0,
                    '#74cc7d',
                    50,
                    '#5ca3d6',
                    100,
                    '#ffa500',
                    200,
                    '#ff6b6b'
                ]);
            }

            // Add atmospheric effects
            map.current.setFog({
                color: 'rgb(186, 210, 235)',
                'high-color': 'rgb(36, 92, 223)',
                'horizon-blend': 0.02,
                'space-color': 'rgb(11, 11, 25)',
                'star-intensity': 0.6
            });

            // Add terrain
            map.current.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14
            });

            map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

            // Add sky layer
            map.current.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                    'sky-type': 'atmosphere',
                    'sky-atmosphere-sun': [0.0, 0.0],
                    'sky-atmosphere-sun-intensity': 15
                }
            });

        } catch (error) {
            console.log('3D effects not available:', error.message);
        }
    };

    // Add map controls
    const addMapControls = () => {
        if (!map.current) return;

        // Add navigation controls
        map.current.addControl(new Mapboxgl.NavigationControl(), 'top-right');
        
        // Add geolocate control
        map.current.addControl(new Mapboxgl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true,
            showUserHeading: true
        }), 'top-right');

        // Add fullscreen control
        map.current.addControl(new Mapboxgl.FullscreenControl(), 'top-right');
    };


    // Autocomplete functionality
    const handleSearchInput = async (value) => {
        setSearchQuery(value);
        
        if (value.length < 3) {
            setSearchSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,locality,neighborhood,address`
            );
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
                const suggestions = data.features.map(feature => ({
                    name: feature.place_name,
                    latitude: feature.center[1],
                    longitude: feature.center[0],
                    address: feature.place_name,
                    context: feature.context
                }));
                setSearchSuggestions(suggestions);
                setShowSuggestions(true);
            } else {
                setSearchSuggestions([]);
                setShowSuggestions(false);
            }
        } catch (error) {
            console.log('Autocomplete error:', error);
            setSearchSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Search functionality with geocoding
    const handleSearch = async (query = null) => {
        const searchTerm = query || searchQuery;
        if (!searchTerm.trim()) return;

        try {
            setLoading(true);
            setShowSuggestions(false);
            
            // Try geocoding first (for addresses)
            try {
                const geocodeResponse = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchTerm)}.json?access_token=${MAPBOX_TOKEN}`
                );
                const geocodeData = await geocodeResponse.json();
                
                if (geocodeData.features && geocodeData.features.length > 0) {
                    const results = geocodeData.features.map(feature => ({
                        name: feature.place_name,
                        latitude: feature.center[1],
                        longitude: feature.center[0],
                        address: feature.place_name
                    }));
                    
                    setSearchResults(results);
                    setShowSearchResults(true);
                    
                    if (results.length > 0) {
                        const firstResult = results[0];
                        map.current.flyTo({
                            center: [firstResult.longitude, firstResult.latitude],
                            zoom: 15,
                            duration: 1000
                        });
                    }
                    return;
                }
            } catch (geocodeError) {
                console.log('Geocoding failed, trying local search:', geocodeError);
            }
            
            // Fallback to local search
            const response = await api.get(`/location/search`, {
                params: { query: searchTerm }
            });
            setSearchResults(response.data);
            setShowSearchResults(true);
            
            if (response.data.length > 0) {
                const firstResult = response.data[0];
                map.current.flyTo({
                    center: [firstResult.longitude, firstResult.latitude],
                    zoom: 15,
                    duration: 1000
                });
            } else {
                setError('No locations found for your search');
            }
        } catch (error) {
            console.error('Search error:', error);
            setError('Search failed - please try a different query');
        } finally {
            setLoading(false);
        }
    };

    // Get user's current location
    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser');
            return;
        }

        setLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.current.flyTo({
                    center: [longitude, latitude],
                    zoom: 15,
                    duration: 1000
                });
                setLoading(false);
            },
            (error) => {
                setError('Unable to retrieve your location');
                setLoading(false);
            }
        );
    };

    // Toggle fullscreen mode
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (mapContainer.current.requestFullscreen) {
                mapContainer.current.requestFullscreen();
            } else if (mapContainer.current.webkitRequestFullscreen) {
                mapContainer.current.webkitRequestFullscreen();
            } else if (mapContainer.current.msRequestFullscreen) {
                mapContainer.current.msRequestFullscreen();
            }
            setIsFullscreen(true);
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            setIsFullscreen(false);
        }
    };

    // Initialize map when component mounts or when switching to map view
    useEffect(() => {
        if (viewMode === 'map') {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                initializeMap();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [viewMode, initializeMap]);

    // Update markers when locations change
    useEffect(() => {
        if (mapLoaded && map.current) {
            addWalletMarkers();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredLocations, mapLoaded]);

    // Cleanup map on unmount
    useEffect(() => {
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
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

            {/* Enhanced Search and Controls */}
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

                        {/* Search Bar with Autocomplete */}
                        <Box sx={{ position: 'relative', minWidth: 300 }}>
                            <TextField
                                size="small"
                                placeholder="Search addresses or locations..."
                                value={searchQuery}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                onFocus={() => setShowSuggestions(searchSuggestions.length > 0)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    ),
                                    endAdornment: searchQuery && (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => {
                                                setSearchQuery('');
                                                setSearchSuggestions([]);
                                                setShowSuggestions(false);
                                            }}>
                                                <CloseIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                                sx={{ width: '100%' }}
                            />
                            
                            {/* Autocomplete Suggestions */}
                            {showSuggestions && searchSuggestions.length > 0 && (
                                <Paper 
                                    sx={{ 
                                        position: 'absolute', 
                                        top: '100%', 
                                        left: 0, 
                                        right: 0, 
                                        zIndex: 1000,
                                        maxHeight: 200,
                                        overflow: 'auto',
                                        mt: 0.5,
                                        boxShadow: 3
                                    }}
                                >
                                    {searchSuggestions.map((suggestion, index) => (
                                        <Box
                                            key={index}
                                            sx={{
                                                p: 1.5,
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #eee',
                                                '&:hover': { backgroundColor: '#f5f5f5' },
                                                '&:last-child': { borderBottom: 'none' }
                                            }}
                                            onClick={() => {
                                                setSearchQuery(suggestion.name);
                                                setShowSuggestions(false);
                                                handleSearch(suggestion.name);
                                            }}
                                        >
                                            <Typography variant="body2" fontWeight="bold">
                                                {suggestion.name}
                                            </Typography>
                                            {suggestion.context && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {suggestion.context.map(c => c.text).join(', ')}
                                                </Typography>
                                            )}
                                        </Box>
                                    ))}
                                </Paper>
                            )}
                        </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<MyLocationIcon />}
                        onClick={getCurrentLocation}
                        disabled={loading}
                    >
                        My Location
                    </Button>
                    
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
                    {/* Map Container */}
                    <Box 
                        ref={mapContainer}
                        sx={{ 
                            height: isFullscreen ? '100vh' : '600px', 
                            width: '100%', 
                            borderRadius: 1, 
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                    />
                    
                    {/* Map Overlay Controls */}
                    <Box sx={{ 
                        position: 'absolute', 
                        top: 16, 
                        left: 16, 
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1
                    }}>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                            onClick={toggleFullscreen}
                            sx={{ 
                                backgroundColor: 'white',
                                color: 'black',
                                '&:hover': { backgroundColor: 'grey.100' }
                            }}
                        >
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </Button>
                    </Box>

                            {/* Search Results with Toggle */}
                            {searchResults.length > 0 && showSearchResults && (
                                <Card sx={{ 
                                    position: 'absolute', 
                                    top: 16, 
                                    right: 16, 
                                    zIndex: 1000,
                                    maxWidth: 350,
                                    maxHeight: 500,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <CardContent sx={{ pb: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="h6">
                                                Search Results ({searchResults.length})
                                            </Typography>
                                            <IconButton 
                                                size="small" 
                                                onClick={() => setShowSearchResults(false)}
                                                sx={{ ml: 1 }}
                                            >
                                                <CloseIcon />
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                    <Box sx={{ overflow: 'auto', flex: 1, px: 2, pb: 2 }}>
                                        {searchResults.map((result, index) => (
                                            <Box 
                                                key={index} 
                                                sx={{ 
                                                    mb: 1, 
                                                    p: 1.5, 
                                                    border: '1px solid #ddd', 
                                                    borderRadius: 1,
                                                    cursor: 'pointer',
                                                    '&:hover': { backgroundColor: '#f5f5f5' }
                                                }}
                                                onClick={() => {
                                                    map.current.flyTo({
                                                        center: [result.longitude, result.latitude],
                                                        zoom: 15,
                                                        duration: 1000
                                                    });
                                                }}
                                            >
                                                <Typography variant="body2" fontWeight="bold">
                                                    {result.name || result.address}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                </Card>
                            )}
                            
                            {/* Search Results Toggle Button (when hidden) */}
                            {searchResults.length > 0 && !showSearchResults && (
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => setShowSearchResults(true)}
                                    sx={{ 
                                        position: 'absolute', 
                                        top: 16, 
                                        right: 80, 
                                        zIndex: 1000,
                                        backgroundColor: 'primary.main',
                                        '&:hover': { backgroundColor: 'primary.dark' }
                                    }}
                                >
                                    Show Results ({searchResults.length})
                                </Button>
                            )}

                    {/* Selected Location Info */}
                    {selectedLocation && (
                        <Card sx={{ 
                            position: 'absolute', 
                            bottom: 16, 
                            left: 16, 
                            zIndex: 1000,
                            maxWidth: 300
                        }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Selected Location
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Latitude:</strong> {selectedLocation.latitude.toFixed(6)}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Longitude:</strong> {selectedLocation.longitude.toFixed(6)}
                                </Typography>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    onClick={() => setSelectedLocation(null)}
                                    sx={{ mt: 1 }}
                                >
                                    Clear
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Wallet Connection Status */}
                    {isConnected && (
                        <Card sx={{ 
                            position: 'absolute', 
                            bottom: 16, 
                            right: 16, 
                            zIndex: 1000,
                            backgroundColor: 'success.light',
                            color: 'success.contrastText'
                        }}>
                            <CardContent sx={{ py: 1 }}>
                                <Typography variant="body2" fontWeight="bold">
                                    Wallet Connected
                                </Typography>
                                <Typography variant="caption">
                                    {publicKey?.substring(0, 8)}...
                                </Typography>
                            </CardContent>
                        </Card>
                    )}
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
        </Box>
    );
};

export default WalletLocationsManager; 