import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Grid } from '@mui/material';
import 'mapbox-gl/dist/mapbox-gl.css';
import { filterWallets, groupWalletsByCountry } from '../utils/coordinates';

// Initialize Mapbox with your access token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
console.log('Mapbox Token:', MAPBOX_TOKEN ? 'Token exists' : 'No token found');

if (!MAPBOX_TOKEN) {
    console.error('REACT_APP_MAPBOX_TOKEN is not set. Please check your environment variables.');
} else {
    mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Sample data for testing
const sampleWallets = [
    {
        id: 1,
        organization: "Sample Corp",
        blockchain: "ethereum",
        asset_name: "ETH Wallet",
        latitude: 40.7128,
        longitude: -74.0060,
        country: "United States"
    },
    {
        id: 2,
        organization: "Test Ltd",
        blockchain: "bitcoin",
        asset_name: "BTC Wallet",
        latitude: 51.5074,
        longitude: -0.1278,
        country: "United Kingdom"
    },
    {
        id: 3,
        organization: "Demo Inc",
        blockchain: "polygon",
        asset_name: "MATIC Wallet",
        latitude: 35.6762,
        longitude: 139.6503,
        country: "Japan"
    }
];

const PublicWalletMap = () => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [wallets, setWallets] = useState([]);
    const [filteredWallets, setFilteredWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        blockchain: '',
        organization: '',
        assetName: '',
        country: ''
    });
    const [countries, setCountries] = useState([]);
    const [mapInitialized, setMapInitialized] = useState(false);
    const fetchAttempts = useRef(0);
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    const MAX_CONTAINER_RETRIES = 10; // Maximum number of container retries
    const containerRetries = useRef(0);

    // Initialize map when component mounts
    useEffect(() => {
        let mapInitializationTimer;

        const initializeMap = () => {
            if (map.current) {
                console.log('Map already initialized');
                return;
            }

            if (!mapContainer.current) {
                containerRetries.current += 1;
                if (containerRetries.current >= MAX_CONTAINER_RETRIES) {
                    console.error('Max container retries reached');
                    setError('Failed to initialize map container');
                    return;
                }
                console.log(`Container not ready, retrying... (${containerRetries.current}/${MAX_CONTAINER_RETRIES})`);
                mapInitializationTimer = setTimeout(initializeMap, 500); // Increased delay
                return;
            }

            if (!MAPBOX_TOKEN) {
                console.error('No Mapbox token found');
                setError('Mapbox token is missing. Please check your environment variables.');
                return;
            }

            try {
                console.log('Initializing map...');
                map.current = new mapboxgl.Map({
                    container: mapContainer.current,
                    style: 'mapbox://styles/mapbox/streets-v12',
                    center: [0, 0],
                    zoom: 2,
                    projection: 'globe'
                });

                // Add navigation controls
                map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

                // Add 3D terrain
                map.current.on('load', () => {
                    console.log('Map loaded successfully');
                    map.current.addSource('mapbox-dem', {
                        'type': 'raster-dem',
                        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                        'tileSize': 512,
                        'maxzoom': 14
                    });
                    map.current.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
                    setMapInitialized(true);
                });

                map.current.on('error', (e) => {
                    console.error('Mapbox error:', e);
                    setError('Error initializing map: ' + e.message);
                });

            } catch (err) {
                console.error('Error creating map:', err);
                setError('Failed to initialize map: ' + err.message);
            }
        };

        initializeMap();

        return () => {
            if (mapInitializationTimer) {
                clearTimeout(mapInitializationTimer);
            }
            if (map.current) {
                console.log('Cleaning up map instance');
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Fetch wallet locations with retry logic
    useEffect(() => {
        const fetchWallets = async () => {
            if (fetchAttempts.current >= MAX_RETRIES) {
                console.log('Max retries reached, using sample data');
                setWallets(sampleWallets);
                setFilteredWallets(sampleWallets);
                const countryGroups = await groupWalletsByCountry(sampleWallets);
                setCountries(Object.keys(countryGroups));
                setLoading(false);
                return;
            }

            try {
                // Determine API URL based on environment
                const apiUrl = window.location.hostname.includes('azurewebsites.net') 
                    ? `${window.location.protocol}//${window.location.hostname}/api/locations/public`
                    : 'https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net/api/locations/public';
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        throw new Error('429');
                    }
                    throw new Error(`Failed to fetch wallet locations: ${response.status}`);
                }

                const data = await response.json();
                
                if (!data || data.length === 0) {
                    console.log('No locations found, using sample data');
                    setWallets(sampleWallets);
                    setFilteredWallets(sampleWallets);
                    const countryGroups = await groupWalletsByCountry(sampleWallets);
                    setCountries(Object.keys(countryGroups));
                } else {
                    setWallets(data);
                    setFilteredWallets(data);
                    const countryGroups = await groupWalletsByCountry(data);
                    setCountries(Object.keys(countryGroups));
                }
                setLoading(false);
            } catch (err) {
                console.error('Error in fetchWallets:', err);
                
                if (err.message === '429') {
                    fetchAttempts.current += 1;
                    console.log(`Rate limited, retrying in ${RETRY_DELAY}ms (attempt ${fetchAttempts.current}/${MAX_RETRIES})`);
                    setTimeout(fetchWallets, RETRY_DELAY);
                } else {
                    console.log('Error fetching data, using sample data');
                    setWallets(sampleWallets);
                    setFilteredWallets(sampleWallets);
                    const countryGroups = await groupWalletsByCountry(sampleWallets);
                    setCountries(Object.keys(countryGroups));
                    setLoading(false);
                }
            }
        };

        fetchWallets();
    }, []);

    // Update filtered wallets when filters change
    useEffect(() => {
        const filtered = filterWallets(wallets, filters);
        setFilteredWallets(filtered);
    }, [filters, wallets]);

    // Add markers when filtered wallets change
    useEffect(() => {
        if (!map.current) return;

        // Remove existing markers
        const markers = document.getElementsByClassName('mapboxgl-marker');
        while (markers[0]) {
            markers[0].remove();
        }

        // Add new markers if there are filtered wallets
        if (filteredWallets.length > 0) {
            filteredWallets.forEach(wallet => {
                const el = document.createElement('div');
                el.className = 'marker';
                el.style.width = '20px';
                el.style.height = '20px';
                el.style.borderRadius = '50%';
                el.style.backgroundColor = '#FF0000';
                el.style.border = '2px solid white';
                el.style.cursor = 'pointer';

                new mapboxgl.Marker(el)
                    .setLngLat([wallet.longitude, wallet.latitude])
                    .setPopup(
                        new mapboxgl.Popup({ offset: 25 })
                            .setHTML(`
                                <h3>${wallet.organization}</h3>
                                <p>Blockchain: ${wallet.blockchain}</p>
                                <p>Asset: ${wallet.asset_name}</p>
                            `)
                    )
                    .addTo(map.current);
            });
        }
    }, [filteredWallets]);

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (loading) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography>Loading map data...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="error">Error: {error}</Typography>
            </Box>
        );
    }

    return (
        <div style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%'
        }}>
            <div 
                ref={mapContainer} 
                style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%'
                }} 
            />
            
            <Box sx={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: 2,
                borderRadius: 1,
                boxShadow: 3,
                width: '80%',
                maxWidth: '1200px'
            }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth>
                            <InputLabel>Blockchain</InputLabel>
                            <Select
                                value={filters.blockchain}
                                onChange={(e) => handleFilterChange('blockchain', e.target.value)}
                                size="small"
                            >
                                <MenuItem value="">All</MenuItem>
                                <MenuItem value="ethereum">Ethereum</MenuItem>
                                <MenuItem value="bitcoin">Bitcoin</MenuItem>
                                <MenuItem value="polygon">Polygon</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth>
                            <InputLabel>Country</InputLabel>
                            <Select
                                value={filters.country}
                                onChange={(e) => handleFilterChange('country', e.target.value)}
                                size="small"
                            >
                                <MenuItem value="">All</MenuItem>
                                {countries.map(country => (
                                    <MenuItem key={country} value={country}>{country}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            label="Organization"
                            value={filters.organization}
                            onChange={(e) => handleFilterChange('organization', e.target.value)}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            label="Asset Name"
                            value={filters.assetName}
                            onChange={(e) => handleFilterChange('assetName', e.target.value)}
                            size="small"
                        />
                    </Grid>
                </Grid>
            </Box>

            <style>
                {`
                    .mapboxgl-map {
                        width: 100% !important;
                        height: 100% !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                    }
                    .mapboxgl-canvas {
                        width: 100% !important;
                        height: 100% !important;
                    }
                    .mapboxgl-canvas-container {
                        width: 100% !important;
                        height: 100% !important;
                    }
                    .mapboxgl-marker {
                        width: 20px !important;
                        height: 20px !important;
                    }
                `}
            </style>
        </div>
    );
};

export default PublicWalletMap; 