import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, Button, IconButton, Tooltip } from '@mui/material';
import { Fullscreen, FullscreenExit, Map, Satellite, Terrain } from '@mui/icons-material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const GeospatialMap = ({ 
    locations = [], 
    title = "Geospatial Map", 
    height = "400px",
    showControls = true,
    onLocationClick = null 
}) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/streets-v11');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);

    useEffect(() => {
        if (map.current) return; // Initialize map only once

        const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
        if (!mapboxToken) {
            console.error('Mapbox token not found');
            return;
        }

        mapboxgl.accessToken = mapboxToken;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: [0, 0],
            zoom: 2,
            pitch: 0,
            bearing: 0
        });

        map.current.on('load', () => {
            setMapLoaded(true);
            addLocationsToMap();
        });

        map.current.on('click', (e) => {
            if (onLocationClick) {
                onLocationClick(e.lngLat);
            }
        });

    }, [mapStyle]);

    useEffect(() => {
        if (map.current && mapLoaded) {
            addLocationsToMap();
        }
    }, [locations, mapLoaded]);

    const addLocationsToMap = () => {
        if (!map.current || !mapLoaded) return;

        // Clear existing markers
        const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
        existingMarkers.forEach(marker => marker.remove());

        if (!locations || locations.length === 0) return;

        // Add markers for each location
        locations.forEach((location, index) => {
            // Validate location data
            const lat = parseFloat(location.latitude);
            const lng = parseFloat(location.longitude);
            
            if (isNaN(lat) || isNaN(lng)) {
                console.warn(`Invalid coordinates for location ${index}:`, location);
                return;
            }

            const el = document.createElement('div');
            el.className = 'location-marker';
            el.style.cssText = `
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background-color: #1976d2;
                border: 2px solid white;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            `;

            const marker = new mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .addTo(map.current);

            // Add popup
            if (location.public_key || location.description) {
                const lat = parseFloat(location.latitude) || 0;
                const lng = parseFloat(location.longitude) || 0;
                const popup = new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`
                        <div style="padding: 8px;">
                            <strong>Location ${index + 1}</strong><br/>
                            ${location.public_key ? `Wallet: ${location.public_key.substring(0, 10)}...` : ''}<br/>
                            ${location.description || ''}<br/>
                            <small>Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}</small>
                        </div>
                    `);
                marker.setPopup(popup);
            }
        });

        // Fit map to show all locations
        if (locations.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            let validLocations = 0;
            
            locations.forEach(location => {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    bounds.extend([lng, lat]);
                    validLocations++;
                }
            });
            
            if (validLocations > 0) {
                map.current.fitBounds(bounds, { padding: 50 });
            }
        }
    };

    const changeMapStyle = (style) => {
        const styleMap = {
            'streets': 'mapbox://styles/mapbox/streets-v11',
            'satellite': 'mapbox://styles/mapbox/satellite-v9',
            'terrain': 'mapbox://styles/mapbox/outdoors-v11'
        };
        setMapStyle(styleMap[style] || styleMap.streets);
    };

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    const resetView = () => {
        if (map.current && locations && locations.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            let validLocations = 0;
            
            locations.forEach(location => {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    bounds.extend([lng, lat]);
                    validLocations++;
                }
            });
            
            if (validLocations > 0) {
                map.current.fitBounds(bounds, { padding: 50 });
            }
        }
    };

    return (
        <Paper 
            sx={{ 
                height: isFullscreen ? '100vh' : height,
                position: isFullscreen ? 'fixed' : 'relative',
                top: isFullscreen ? 0 : 'auto',
                left: isFullscreen ? 0 : 'auto',
                zIndex: isFullscreen ? 9999 : 'auto',
                width: isFullscreen ? '100vw' : '100%'
            }}
        >
            <Box sx={{ position: 'relative', height: '100%' }}>
                {/* Map Header */}
                <Box sx={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000,
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(10px)',
                    p: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {title}
                    </Typography>
                    <Box>
                        {showControls && (
                            <>
                                <Tooltip title="Streets">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => changeMapStyle('streets')}
                                        color={mapStyle.includes('streets') ? 'primary' : 'default'}
                                    >
                                        <Map />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Satellite">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => changeMapStyle('satellite')}
                                        color={mapStyle.includes('satellite') ? 'primary' : 'default'}
                                    >
                                        <Satellite />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Terrain">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => changeMapStyle('terrain')}
                                        color={mapStyle.includes('outdoors') ? 'primary' : 'default'}
                                    >
                                        <Terrain />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Reset View">
                                    <Button 
                                        size="small" 
                                        onClick={resetView}
                                        variant="outlined"
                                        sx={{ ml: 1 }}
                                    >
                                        Reset
                                    </Button>
                                </Tooltip>
                            </>
                        )}
                        <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                            <IconButton 
                                size="small" 
                                onClick={toggleFullscreen}
                                color="primary"
                            >
                                {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Map Container */}
                <Box 
                    ref={mapContainer} 
                    sx={{ 
                        height: '100%', 
                        width: '100%',
                        mt: showControls ? '60px' : 0
                    }} 
                />

                {/* Map Footer */}
                <Box sx={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000,
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(10px)',
                    p: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="body2" color="text.secondary">
                        {locations ? locations.length : 0} location{(locations ? locations.length : 0) !== 1 ? 's' : ''} shown
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {locations && locations.length > 0 ? 'Click on markers for details' : 'No locations available'}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default GeospatialMap;
