import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material';
import {
  Search as SearchIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

const SharedMap = ({ 
  locations = [], 
  title = "Interactive Map", 
  height = "500px",
  showControls = true,
  onLocationClick = null,
  onMapReady = null,
  userLocation = null,
  onNFTDetails = null,
  zoomTarget = null
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapView, setMapView] = useState('3d');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(null);
  const fullscreenMapContainer = useRef(null);

  const initializeMap = useCallback((container) => {
    if (map.current) {
      console.log('Map already initialized');
      return;
    }

    console.log('Initializing shared map with container:', container);

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      return;
    }

    // Start with globe view
    const initialCenter = userLocation ? [userLocation.longitude, userLocation.latitude] : [0, 0];
    const initialZoom = 1;
    const initialPitch = 0;
    const initialBearing = 0;

    try {
      map.current = new Mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: initialCenter,
        zoom: initialZoom,
        pitch: initialPitch,
        bearing: initialBearing,
        projection: 'globe',
        antialias: true,
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true,
        globe: {
          enableAtmosphere: true,
          atmosphereColor: '#FFD700',
          atmosphereIntensity: 0.3,
          enableStars: true,
          starIntensity: 0.5
        }
      });

      map.current.on('load', () => {
        console.log('Shared map loaded');
        setMapLoaded(true);
        
        // Add navigation control
        const navControl = new Mapboxgl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
          showFullscreen: true
        });
        map.current.addControl(navControl, 'top-right');
        
        // Add scale control
        map.current.addControl(new Mapboxgl.ScaleControl({
          maxWidth: 100,
          unit: 'metric'
        }), 'bottom-right');

        // Add geolocate control
        const geolocateControl = new Mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        });
        map.current.addControl(geolocateControl, 'top-right');

        // Add custom 3D control
        const custom3DControl = createCustom3DControl();
        map.current.addControl(custom3DControl, 'top-left');

        // Move all top controls down to avoid title overlay
        setTimeout(() => {
          // Move top-right controls (navigation, geolocate, fullscreen)
          const topRightControls = map.current.getContainer().querySelectorAll('.mapboxgl-ctrl-top-right');
          topRightControls.forEach(control => {
            control.style.top = '100px'; // Move down by title overlay height
          });
          
          // Move top-left controls (custom 3D control)
          const topLeftControls = map.current.getContainer().querySelectorAll('.mapboxgl-ctrl-top-left');
          topLeftControls.forEach(control => {
            control.style.top = '100px'; // Move down by title overlay height
          });
        }, 100);

        // Call onMapReady callback
        if (onMapReady) {
          onMapReady(map.current);
        }

        // Add markers for locations
        addMarkersToMap();
      });

      map.current.on('click', (e) => {
        if (onLocationClick) {
          onLocationClick(e.lngLat);
        }
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setError('Failed to initialize map');
    }
  }, [userLocation, onLocationClick, onMapReady, addMarkersToMap, createCustom3DControl]);

  const addMarkersToMap = useCallback(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    Object.values(markers.current).forEach(marker => {
      if (marker && marker.remove) {
        marker.remove();
      }
    });
    markers.current = {};

    if (!locations || locations.length === 0) return;

    locations.forEach((location, index) => {
      const lat = parseFloat(location.latitude);
      const lng = parseFloat(location.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Invalid coordinates for location ${index}:`, location);
        return;
      }

      // Create marker element based on type
      const el = document.createElement('div');
      el.className = 'location-marker';
      
      if (location.type === 'nft') {
        // NFT marker with image - use correct IPFS URL construction
        const imageUrl = location.ipfs_hash && location.server_url 
          ? `${location.server_url}${location.ipfs_hash}`
          : location.image_url || location.full_ipfs_url;
        
        el.style.cssText = `
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-position: center;
          border: 3px solid #9c27b0;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: white;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        el.textContent = '🎨';
      } else if (location.type === 'wallet') {
        // Wallet marker
        el.style.cssText = `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: #1976d2;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
          font-weight: bold;
        `;
        el.textContent = '💳';
      } else {
        // Default marker
        el.style.cssText = `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: #1976d2;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
          font-weight: bold;
        `;
        el.textContent = (index + 1).toString();
      }

      const marker = new Mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(map.current);

      // Add click and double-click handlers for NFT markers
      if (location.type === 'nft' && onNFTDetails) {
        let clickTimeout;
        
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Clear any existing timeout
          if (clickTimeout) {
            clearTimeout(clickTimeout);
          }
          
          // Set a timeout to allow double-click to be detected
          clickTimeout = setTimeout(() => {
            console.log('NFT marker clicked:', location);
            onNFTDetails(location);
          }, 200); // 200ms delay to allow double-click detection
        });

        // Add double-click zoom functionality
        el.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Clear the click timeout to prevent single-click from firing
          if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
          }
          
          console.log('NFT marker double-clicked, zooming in:', location);
          
          if (map.current) {
            map.current.flyTo({
              center: [lng, lat],
              zoom: 18,
              duration: 1000
            });
          }
        });
      }

      // Add popup
      if (location.public_key || location.description) {
        const popup = new Mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 12px; min-width: 200px;">
              <h4 style="margin: 0 0 8px 0; color: #1976d2;">Location ${index + 1}</h4>
              ${location.public_key ? `<p style="margin: 4px 0; font-family: monospace; font-size: 12px; color: #666;">${location.public_key.substring(0, 20)}...</p>` : ''}
              ${location.description ? `<p style="margin: 4px 0; color: #333;">${location.description}</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `);
        marker.setPopup(popup);
      }

      markers.current[`marker_${index}`] = marker;
    });

    // Fit map to show all locations
    if (locations.length > 0) {
      const bounds = new Mapboxgl.LngLatBounds();
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
  }, [mapLoaded, locations, onLocationClick, onNFTDetails]);

  const createCustom3DControl = useCallback(() => {
    const control = {
      onAdd: function(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this._container.style.background = 'rgba(255, 255, 255, 0.9)';
        this._container.style.borderRadius = '4px';
        this._container.style.padding = '8px';
        this._container.style.display = 'flex';
        this._container.style.flexDirection = 'column';
        this._container.style.gap = '4px';

        // 3D View Button
        const button3D = document.createElement('button');
        button3D.className = 'mapboxgl-ctrl-icon';
        button3D.innerHTML = '🌍';
        button3D.title = '3D Globe View';
        button3D.style.fontSize = '16px';
        button3D.onclick = () => changeMapView('3d');
        this._container.appendChild(button3D);

        // 2D View Button
        const button2D = document.createElement('button');
        button2D.className = 'mapboxgl-ctrl-icon';
        button2D.innerHTML = '🗺️';
        button2D.title = '2D Map View';
        button3D.style.fontSize = '16px';
        button2D.onclick = () => changeMapView('2d');
        this._container.appendChild(button2D);

        // Satellite View Button
        const buttonSat = document.createElement('button');
        buttonSat.className = 'mapboxgl-ctrl-icon';
        buttonSat.innerHTML = '🛰️';
        buttonSat.title = 'Satellite View';
        buttonSat.style.fontSize = '16px';
        buttonSat.onclick = () => changeMapView('satellite');
        this._container.appendChild(buttonSat);

        return this._container;
      },
      onRemove: function() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    };
    
    return control;
  }, []);

  const changeMapView = (view) => {
    setMapView(view);
    
    if (map.current) {
      switch (view) {
        case '2d':
          map.current.setStyle('mapbox://styles/mapbox/streets-v12');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        case '3d':
          map.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
          map.current.easeTo({ pitch: 60, bearing: 0, duration: 1000 });
          break;
        case 'satellite':
          map.current.setStyle('mapbox://styles/mapbox/satellite-v9');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        default:
          break;
      }

      // Re-add 3D buildings for 3D view
      if (view === '3d') {
        setTimeout(() => {
          if (map.current && !map.current.getLayer('3d-buildings')) {
            try {
              const sources = map.current.getStyle().sources;
              if (sources && sources.composite && sources.composite.tiles) {
                map.current.addLayer({
                  'id': '3d-buildings',
                  'source': 'composite',
                  'source-layer': 'building',
                  'filter': ['==', 'extrude', 'true'],
                  'type': 'fill-extrusion',
                  'minzoom': 15,
                  'paint': {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      15,
                      0,
                      15.05,
                      ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      15,
                      0,
                      15.05,
                      ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                  }
                });
              }
            } catch (error) {
              console.warn('Could not add 3D buildings:', error);
            }
          }
        }, 1000);
      }
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchResults(true);
      } else {
        setError('No results found for your search');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchResultClick = (result) => {
    const [lng, lat] = result.center;
    setSearchQuery(result.place_name);
    setShowSearchResults(false);
    
    if (map.current) {
      map.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        pitch: mapView === '3d' ? 60 : 0,
        duration: 2000
      });
    }
  };

  const initializeFullscreenMap = useCallback((container) => {
    if (fullscreenMap) {
      console.log('Fullscreen map already initialized');
      return;
    }

    console.log('Initializing fullscreen map with container:', container);

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      return;
    }

    // Start with globe view
    const initialCenter = userLocation ? [userLocation.longitude, userLocation.latitude] : [0, 0];
    const initialZoom = 1;
    const initialPitch = 0;
    const initialBearing = 0;

    try {
      const fullscreenMapInstance = new Mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: initialCenter,
        zoom: initialZoom,
        pitch: initialPitch,
        bearing: initialBearing,
        projection: 'globe',
        antialias: true,
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true,
        globe: {
          enableAtmosphere: true,
          atmosphereColor: '#FFD700',
          atmosphereIntensity: 0.3,
          enableStars: true,
          starIntensity: 0.5
        }
      });

      fullscreenMapInstance.on('load', () => {
        console.log('Fullscreen map loaded');
        
        // Add navigation control
        const navControl = new Mapboxgl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
          showFullscreen: true
        });
        fullscreenMapInstance.addControl(navControl, 'top-right');
        
        // Add scale control
        fullscreenMapInstance.addControl(new Mapboxgl.ScaleControl({
          maxWidth: 100,
          unit: 'metric'
        }), 'bottom-right');

        // Add geolocate control
        const geolocateControl = new Mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        });
        fullscreenMapInstance.addControl(geolocateControl, 'top-right');

        // Add fullscreen control
        fullscreenMapInstance.addControl(new Mapboxgl.FullscreenControl(), 'top-right');

        // Add custom 3D control
        const custom3DControl = createCustom3DControl();
        fullscreenMapInstance.addControl(custom3DControl, 'top-left');

        // Move all top controls down to avoid title overlay
        setTimeout(() => {
          // Move top-right controls (navigation, geolocate, fullscreen)
          const topRightControls = fullscreenMapInstance.getContainer().querySelectorAll('.mapboxgl-ctrl-top-right');
          topRightControls.forEach(control => {
            control.style.top = '100px'; // Move down by title overlay height
          });
          
          // Move top-left controls (custom 3D control)
          const topLeftControls = fullscreenMapInstance.getContainer().querySelectorAll('.mapboxgl-ctrl-top-left');
          topLeftControls.forEach(control => {
            control.style.top = '100px'; // Move down by title overlay height
          });
        }, 100);

        // Add markers for locations
        addMarkersToFullscreenMap(fullscreenMapInstance);
      });

      fullscreenMapInstance.on('click', (e) => {
        if (onLocationClick) {
          onLocationClick(e.lngLat);
        }
      });

      setFullscreenMap(fullscreenMapInstance);

    } catch (error) {
      console.error('Error initializing fullscreen map:', error);
      setError('Failed to initialize fullscreen map');
    }
  }, [userLocation, onLocationClick, addMarkersToFullscreenMap, createCustom3DControl, fullscreenMap]);

  const addMarkersToFullscreenMap = useCallback((mapInstance) => {
    if (!mapInstance || !locations || locations.length === 0) return;

    // Clear existing markers
    Object.values(markers.current).forEach(marker => {
      if (marker && marker.remove) {
        marker.remove();
      }
    });
    markers.current = {};

    locations.forEach((location, index) => {
      const lat = parseFloat(location.latitude);
      const lng = parseFloat(location.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Invalid coordinates for location ${index}:`, location);
        return;
      }

      // Create marker element based on type
      const el = document.createElement('div');
      el.className = 'location-marker';
      
      if (location.type === 'nft') {
        // NFT marker with image - use correct IPFS URL construction
        const imageUrl = location.ipfs_hash && location.server_url 
          ? `${location.server_url}${location.ipfs_hash}`
          : location.image_url || location.full_ipfs_url;
        
        el.style.cssText = `
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-position: center;
          border: 3px solid #9c27b0;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: white;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        el.textContent = '🎨';
      } else if (location.type === 'wallet') {
        // Wallet marker
        el.style.cssText = `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: #1976d2;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
          font-weight: bold;
        `;
        el.textContent = '💳';
      } else {
        // Default marker
        el.style.cssText = `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: #1976d2;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
          font-weight: bold;
        `;
        el.textContent = (index + 1).toString();
      }

      const marker = new Mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(mapInstance);

      // Add click and double-click handlers for NFT markers
      if (location.type === 'nft' && onNFTDetails) {
        let clickTimeout;
        
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Clear any existing timeout
          if (clickTimeout) {
            clearTimeout(clickTimeout);
          }
          
          // Set a timeout to allow double-click to be detected
          clickTimeout = setTimeout(() => {
            console.log('NFT marker clicked in fullscreen:', location);
            onNFTDetails(location);
          }, 200); // 200ms delay to allow double-click detection
        });

        // Add double-click zoom functionality
        el.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Clear the click timeout to prevent single-click from firing
          if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
          }
          
          console.log('NFT marker double-clicked in fullscreen, zooming in:', location);
          
          if (mapInstance) {
            mapInstance.flyTo({
              center: [lng, lat],
              zoom: 18,
              duration: 1000
            });
          }
        });
      }

      // Add popup
      if (location.public_key || location.description) {
        const popup = new Mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 12px; min-width: 200px;">
              <h4 style="margin: 0 0 8px 0; color: #1976d2;">Location ${index + 1}</h4>
              ${location.public_key ? `<p style="margin: 4px 0; font-family: monospace; font-size: 12px; color: #666;">${location.public_key.substring(0, 20)}...</p>` : ''}
              ${location.description ? `<p style="margin: 4px 0; color: #333;">${location.description}</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `);
        marker.setPopup(popup);
      }

      markers.current[`marker_${index}`] = marker;
    });

    // Fit map to show all locations
    if (locations.length > 0) {
      const bounds = new Mapboxgl.LngLatBounds();
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
        mapInstance.fitBounds(bounds, { padding: 50 });
      }
    }
  }, [locations, onLocationClick, onNFTDetails]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    
    if (!isFullscreen) {
      // Opening fullscreen - initialize map after dialog opens
      setTimeout(() => {
        if (fullscreenMapContainer.current && !fullscreenMap) {
          initializeFullscreenMap(fullscreenMapContainer.current);
        }
      }, 100);
    }
  };

  const resetView = () => {
    if (map.current && locations && locations.length > 0) {
      const bounds = new Mapboxgl.LngLatBounds();
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

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      initializeMap(mapContainer.current);
    }
  }, [initializeMap]);

  useEffect(() => {
    if (map.current && mapLoaded && locations) {
      addMarkersToMap();
    }
  }, [locations, mapLoaded, addMarkersToMap]);

  // Handle zoom target
  useEffect(() => {
    if (zoomTarget && map.current && mapLoaded) {
      map.current.flyTo({
        center: [zoomTarget.longitude, zoomTarget.latitude],
        zoom: 18,
        duration: 1000
      });
    }
  }, [zoomTarget, mapLoaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        markers.current = {};
      }
      if (fullscreenMap) {
        fullscreenMap.remove();
        setFullscreenMap(null);
      }
    };
  }, [fullscreenMap]);

  return (
    <>
      <Paper 
        sx={{ 
          height: height,
          position: 'relative',
          width: '100%'
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
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          p: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          minHeight: '80px'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          
          {showControls && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {/* Search Box */}
              <TextField
                size="small"
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 200 }}
              />
              
              <Tooltip title="Reset View">
                <IconButton size="small" onClick={resetView}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              
              <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                <IconButton size="small" onClick={toggleFullscreen}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <Box sx={{
            position: 'absolute',
            top: '80px',
            left: '20px',
            right: '20px',
            zIndex: 1001,
            background: 'white',
            borderRadius: 1,
            boxShadow: 3,
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            {searchResults.map((result, index) => (
              <Box
                key={index}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee',
                  '&:hover': { bgcolor: '#f5f5f5' }
                }}
                onClick={() => handleSearchResultClick(result)}
              >
                <Typography variant="body2" fontWeight="bold">
                  {result.place_name}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Map Container */}
        <Box 
          ref={mapContainer} 
          sx={{ 
            height: '100%', 
            width: '100%',
            mt: showControls ? '100px' : 0
          }} 
        />

        {/* Loading Overlay */}
        {loading && (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1002
          }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              position: 'absolute', 
              top: '80px', 
              left: '20px', 
              right: '20px', 
              zIndex: 1002 
            }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

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

      {/* Fullscreen Map Dialog */}
      <Dialog 
        open={isFullscreen} 
        onClose={() => setIsFullscreen(false)} 
        maxWidth={false}
        fullWidth
        fullScreen
        sx={{ zIndex: 1400 }}
        PaperProps={{
          sx: {
            margin: 0,
            maxHeight: '100vh',
            height: '100vh',
            width: '100vw',
            borderRadius: 0
          }
        }}
      >
        <DialogTitle sx={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0,0,0,0.1)'
        }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mr: 2 }}>
              🗺️ {title} - Fullscreen View
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {/* Search Box */}
              <TextField
                size="small"
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 200 }}
              />
              
              <Tooltip title="Reset View">
                <IconButton size="small" onClick={resetView}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Exit Fullscreen">
                <IconButton size="small" onClick={() => setIsFullscreen(false)}>
                  <FullscreenExitIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0, position: 'relative', mt: '100px' }}>
          <Box 
            ref={fullscreenMapContainer} 
            sx={{ 
              height: 'calc(100vh - 100px)', 
              width: '100%'
            }} 
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SharedMap;
