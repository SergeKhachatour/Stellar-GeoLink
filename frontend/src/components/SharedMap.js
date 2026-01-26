import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
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
  Refresh as RefreshIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import {
  FormControlLabel,
  Switch,
  Divider
} from '@mui/material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

// Utility function to construct IPFS URLs properly
const constructIPFSUrl = (serverUrl, hash) => {
  if (!hash) return null;
  if (!serverUrl) return `https://ipfs.io/ipfs/${hash}`; // Fallback to public gateway
  
  let baseUrl = serverUrl.trim();
  
  // Remove any existing /ipfs/ path and everything after it
  // This handles cases where server_url might be: 
  // - "domain.com/ipfs/somehash" 
  // - "domain.com/ipfs/somehash/"
  // - "https://domain.com/ipfs/somehash"
  // - "domain.com/ipfs/" (just the path without hash)
  // IMPORTANT: We always use the hash from ipfs_hash field, not from server_url
  baseUrl = baseUrl.replace(/\/ipfs\/.*$/i, '');
  
  // Remove trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  // Remove protocol if present (we'll add https://)
  baseUrl = baseUrl.replace(/^https?:\/\//i, '');
  
  // Ensure it has https:// protocol
  if (baseUrl) {
    baseUrl = `https://${baseUrl}`;
  } else {
    // If baseUrl is empty after cleaning, fallback to public gateway
    return `https://ipfs.io/ipfs/${hash}`;
  }
  
  // Construct full IPFS URL using the hash from ipfs_hash field
  // Note: hash might already include filename for Workflow 2 NFTs (e.g., "hash/filename.png")
  return `${baseUrl}/ipfs/${hash}`;
};

const SharedMap = ({ 
  locations = [], 
  title = "Interactive Map", 
  height = "500px",
  showControls = true,
  onLocationClick = null,
  onMapReady = null,
  userLocation = null,
  onNFTDetails = null,
  zoomTarget = null,
  initialMapStyle = "satellite",
  onFullscreenMapReady = null // Callback to expose fullscreen map instance
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const fullscreenMarkers = useRef({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapView, setMapView] = useState(initialMapStyle || 'globe');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(null);
  const fullscreenMapContainer = useRef(null);
  const hasInitialFitBounds = useRef(false); // Track if we've done initial fitBounds
  const hasFullscreenInitialFitBounds = useRef(false); // Track if fullscreen map has done initial fitBounds
  const markerUpdateTimeout = useRef(null); // Debounce marker updates
  const fullscreenMarkerUpdateTimeout = useRef(null); // Debounce fullscreen marker updates
  const [filters, setFilters] = useState({
    showWallets: true,
    showNFTs: true,
    showContractRules: true
  });
  const [showFilters, setShowFilters] = useState(false);

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

    // Determine map style based on initialMapStyle prop
    let mapStyle = 'mapbox://styles/mapbox/satellite-streets-v12';
    let projection = 'globe';
    let globeConfig = {
      enableAtmosphere: true,
      atmosphereColor: '#FFD700',
      atmosphereIntensity: 0.3,
      enableStars: true,
      starIntensity: 0.5
    };
    
    if (initialMapStyle === 'light') {
      mapStyle = 'mapbox://styles/mapbox/light-v11';
      projection = 'mercator';
      globeConfig = null;
    } else if (initialMapStyle === 'light-globe') {
      // Light style with globe projection
      mapStyle = 'mapbox://styles/mapbox/light-v11';
      projection = 'globe';
      globeConfig = {
        enableAtmosphere: true,
        atmosphereColor: '#FFD700',
        atmosphereIntensity: 0.3,
        enableStars: true,
        starIntensity: 0.5
      };
    } else if (initialMapStyle === 'globe' || !initialMapStyle) {
      // Default to globe view
      mapStyle = 'mapbox://styles/mapbox/satellite-streets-v12';
      projection = 'globe';
    }

    try {
      const mapConfig = {
        container: container,
        style: mapStyle,
        center: initialCenter,
        zoom: initialZoom,
        pitch: initialPitch,
        bearing: initialBearing,
        projection: projection,
        antialias: true,
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true
      };
      
      if (globeConfig) {
        mapConfig.globe = globeConfig;
      }
      
      map.current = new Mapboxgl.Map(mapConfig);

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
        hasInitialFitBounds.current = false; // Reset on map load
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
  }, [userLocation, onLocationClick, onMapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMarkersToMap = useCallback(() => {
    if (!map.current || !mapLoaded) return;
    
    // Use requestAnimationFrame to ensure smooth updates
    requestAnimationFrame(() => {
      if (!map.current) return;

      // Clear existing markers
      Object.values(markers.current).forEach(marker => {
        if (marker && marker.remove) {
          marker.remove();
        }
      });
      markers.current = {};

      if (!locations || locations.length === 0) {
        return;
      }

      locations.forEach((location, index) => {
      const lat = parseFloat(location.latitude);
      const lng = parseFloat(location.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`[SharedMap] Invalid coordinates for location ${index}:`, location);
        return;
      }

      // Determine location type - check both type and marker_type
      const locationType = location.type || location.marker_type;
      
      // Debug: Log if type is not recognized
      if (!locationType || (locationType !== 'nft' && locationType !== 'contract_rule' && locationType !== 'wallet')) {
        console.warn(`[SharedMap] Unknown location type for location ${index}:`, { type: location.type, marker_type: location.marker_type, resolved: locationType });
      }

      // Create marker element based on type
      const el = document.createElement('div');
      el.className = 'location-marker';
      
      if (locationType === 'nft') {
        // NFT marker with image - use correct IPFS URL construction
        const imageUrl = constructIPFSUrl(location.server_url, location.ipfs_hash) 
          || location.image_url 
          || location.full_ipfs_url
          || 'https://via.placeholder.com/64x64?text=NFT';
        
        el.style.cssText = `
          width: 64px;
          height: 64px;
          border-radius: 8px;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          border: 3px solid #FFD700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: white;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        // No text content needed - using background-image
      } else if (locationType === 'contract_rule') {
        // Smart Contract Execution Rule marker
        const hasMatch = location.hasMatch;
        const hasExecution = location.hasExecution;

        // Simple, stable styling – avoid animations that could hide the icon
        el.style.cssText = `
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 3px solid ${hasExecution ? '#4caf50' : hasMatch ? '#ff9800' : 'white'};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: white;
          font-weight: bold;
        `;
        // Keep the 📜 icon clearly visible
        el.textContent = '📜';
      } else if (locationType === 'wallet') {
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

      // Create marker with draggable: false to prevent animation
      const marker = new Mapboxgl.Marker({ 
        element: el, 
        draggable: false 
      })
        .setLngLat([lng, lat])
        .addTo(map.current);

      // Add click and double-click handlers for NFT markers
      if (locationType === 'nft' && onNFTDetails) {
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

      // Add click handler for contract rule markers
      if (locationType === 'contract_rule' && onLocationClick) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onLocationClick(location);
        });
      }

      // Add click handler for wallet markers to prevent map click handler from firing
      if (locationType === 'wallet') {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Wallet markers just show popup, no special action needed
        });
      }

      // Add popup
      if (location.public_key || location.description || location.rule_name || location.name) {
        let popupHTML = '';
        
        if (locationType === 'contract_rule') {
          popupHTML = `
            <div style="padding: 12px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; color: #667eea;">📜 ${location.rule_name || 'Contract Rule'}</h3>
              ${location.contract_name ? `<p style="margin: 4px 0;"><strong>Contract:</strong> ${location.contract_name}</p>` : ''}
              ${location.function_name ? `<p style="margin: 4px 0;"><strong>Function:</strong> ${location.function_name}</p>` : ''}
              ${location.trigger_on ? `<p style="margin: 4px 0;"><strong>Trigger:</strong> ${location.trigger_on}</p>` : ''}
              ${location.radius_meters ? `<p style="margin: 4px 0;"><strong>Radius:</strong> ${location.radius_meters}m</p>` : ''}
              ${location.auto_execute ? `<p style="margin: 4px 0; color: #4caf50;"><strong>Auto-execute:</strong> Enabled</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `;
        } else {
          popupHTML = `
            <div style="padding: 12px; min-width: 200px;">
              <h4 style="margin: 0 0 8px 0; color: #1976d2;">${location.name || `Location ${index + 1}`}</h4>
              ${location.public_key ? `<p style="margin: 4px 0; font-family: monospace; font-size: 12px; color: #666;">${location.public_key.substring(0, 20)}...</p>` : ''}
              ${location.description ? `<p style="margin: 4px 0; color: #333;">${location.description}</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `;
        }
        
        const popup = new Mapboxgl.Popup({ offset: 25 })
          .setHTML(popupHTML);
        marker.setPopup(popup);
      }

        markers.current[`marker_${index}`] = marker;
      });

      // Only fit bounds on initial load, not on every data refresh
      if (!hasInitialFitBounds.current && locations.length > 0) {
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
        
        if (validLocations > 0 && map.current) {
          map.current.fitBounds(bounds, { padding: 50 });
          hasInitialFitBounds.current = true;
        }
      }
      // Don't restore position - let the map stay where the user positioned it
    });
  }, [mapLoaded, locations, onNFTDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMapView = useCallback((view) => {
    setMapView(view);
    
    if (map.current) {
      switch (view) {
        case 'globe':
          map.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
          map.current.setProjection('globe');
          map.current.easeTo({ pitch: 60, bearing: 0, duration: 1000 });
          break;
        case 'light-globe':
          map.current.setStyle('mapbox://styles/mapbox/light-v11');
          map.current.setProjection('globe');
          map.current.easeTo({ pitch: 60, bearing: 0, duration: 1000 });
          break;
        case 'streets':
        case '2d':
          map.current.setStyle('mapbox://styles/mapbox/streets-v12');
          map.current.setProjection('mercator');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        case 'satellite':
          map.current.setStyle('mapbox://styles/mapbox/satellite-v9');
          map.current.setProjection('mercator');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        case 'light':
          map.current.setStyle('mapbox://styles/mapbox/light-v11');
          map.current.setProjection('mercator');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        case 'dark':
          map.current.setStyle('mapbox://styles/mapbox/dark-v11');
          map.current.setProjection('mercator');
          map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
          break;
        default:
          break;
      }

      // Sync style change to fullscreen map if it exists
      if (fullscreenMap && fullscreenMap._syncStyle) {
        fullscreenMap._syncStyle(view);
      }

      // Re-add 3D buildings and globe config for globe views
      if (view === 'globe' || view === 'light-globe') {
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
  }, [map, fullscreenMap]);

  const createCustom3DControl = useCallback((isFullscreen = false) => {
    const control = {
      onAdd: function(mapInstance) {
        this._map = mapInstance;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this._container.style.background = 'rgba(255, 255, 255, 0.9)';
        this._container.style.borderRadius = '4px';
        this._container.style.padding = '8px';
        this._container.style.display = 'flex';
        this._container.style.flexDirection = 'column';
        this._container.style.gap = '4px';

        // Helper function to change view on both maps
        const handleViewChange = (view) => {
          // Always update the main map view state
          changeMapView(view);
        };

        // Globe/3D View Button
        const buttonGlobe = document.createElement('button');
        buttonGlobe.className = 'mapboxgl-ctrl-icon';
        buttonGlobe.innerHTML = '🌍';
        buttonGlobe.title = 'Globe View';
        buttonGlobe.style.fontSize = '16px';
        buttonGlobe.onclick = () => handleViewChange('globe');
        this._container.appendChild(buttonGlobe);

        // 2D Streets View Button
        const button2D = document.createElement('button');
        button2D.className = 'mapboxgl-ctrl-icon';
        button2D.innerHTML = '🗺️';
        button2D.title = 'Streets View';
        button2D.style.fontSize = '16px';
        button2D.onclick = () => handleViewChange('streets');
        this._container.appendChild(button2D);

        // Satellite View Button
        const buttonSat = document.createElement('button');
        buttonSat.className = 'mapboxgl-ctrl-icon';
        buttonSat.innerHTML = '🛰️';
        buttonSat.title = 'Satellite View';
        buttonSat.style.fontSize = '16px';
        buttonSat.onclick = () => handleViewChange('satellite');
        this._container.appendChild(buttonSat);

        // Light View Button
        const buttonLight = document.createElement('button');
        buttonLight.className = 'mapboxgl-ctrl-icon';
        buttonLight.innerHTML = '☀️';
        buttonLight.title = 'Light View';
        buttonLight.style.fontSize = '16px';
        buttonLight.onclick = () => handleViewChange('light');
        this._container.appendChild(buttonLight);

        // Dark View Button
        const buttonDark = document.createElement('button');
        buttonDark.className = 'mapboxgl-ctrl-icon';
        buttonDark.innerHTML = '🌙';
        buttonDark.title = 'Dark View';
        buttonDark.style.fontSize = '16px';
        buttonDark.onclick = () => handleViewChange('dark');
        this._container.appendChild(buttonDark);

        return this._container;
      },
      onRemove: function() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    };
    
    return control;
  }, [changeMapView]);

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
        pitch: mapView === 'globe' || mapView === '3d' || mapView === 'light-globe' ? 60 : 0,
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

    // Use the same style as the main map
    const initialCenter = userLocation ? [userLocation.longitude, userLocation.latitude] : (map.current ? map.current.getCenter().toArray() : [0, 0]);
    const initialZoom = map.current ? map.current.getZoom() : 1;
    const initialPitch = 0; // Always start with 0 pitch for fullscreen
    const initialBearing = 0; // Always start with 0 bearing for fullscreen

    // Determine map style based on current mapView state
    let fullscreenMapStyle = 'mapbox://styles/mapbox/satellite-streets-v12';
    let fullscreenProjection = 'globe';
    let fullscreenGlobeConfig = {
      enableAtmosphere: true,
      atmosphereColor: '#FFD700',
      atmosphereIntensity: 0.3,
      enableStars: true,
      starIntensity: 0.5
    };

    switch (mapView) {
      case 'globe':
      case '3d':
        fullscreenMapStyle = 'mapbox://styles/mapbox/satellite-streets-v12';
        fullscreenProjection = 'globe';
        break;
      case 'light-globe':
        fullscreenMapStyle = 'mapbox://styles/mapbox/light-v11';
        fullscreenProjection = 'globe';
        break;
      case 'streets':
      case '2d':
        fullscreenMapStyle = 'mapbox://styles/mapbox/streets-v12';
        fullscreenProjection = 'mercator';
        fullscreenGlobeConfig = null;
        break;
      case 'satellite':
        fullscreenMapStyle = 'mapbox://styles/mapbox/satellite-v9';
        fullscreenProjection = 'mercator';
        fullscreenGlobeConfig = null;
        break;
      case 'light':
        fullscreenMapStyle = 'mapbox://styles/mapbox/light-v11';
        fullscreenProjection = 'mercator';
        fullscreenGlobeConfig = null;
        break;
      case 'dark':
        fullscreenMapStyle = 'mapbox://styles/mapbox/dark-v11';
        fullscreenProjection = 'mercator';
        fullscreenGlobeConfig = null;
        break;
      default:
        // Default to globe
        break;
    }

    try {
      const fullscreenMapConfig = {
        container: container,
        style: fullscreenMapStyle,
        center: initialCenter,
        zoom: initialZoom,
        pitch: initialPitch,
        bearing: initialBearing,
        projection: fullscreenProjection,
        antialias: true,
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true
      };

      if (fullscreenGlobeConfig) {
        fullscreenMapConfig.globe = fullscreenGlobeConfig;
      }

      const fullscreenMapInstance = new Mapboxgl.Map(fullscreenMapConfig);

        fullscreenMapInstance.on('load', () => {
        console.log('Fullscreen map loaded');
        
        // Reset fullscreen fitBounds flag when map loads
        hasFullscreenInitialFitBounds.current = false;
        
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
        const custom3DControl = createCustom3DControl(true); // Pass true to indicate this is for fullscreen
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

        // Add markers for locations after map style is fully loaded
        // Wait for style to be ready, especially important for globe projection
        const addMarkersWhenReady = () => {
          if (!fullscreenMapInstance.isStyleLoaded()) {
            console.log('[FullscreenMap] Style not loaded yet, waiting...');
            fullscreenMapInstance.once('style.load', addMarkersWhenReady);
            return;
          }
          
          // Additional check: ensure map is fully rendered
          requestAnimationFrame(() => {
            console.log('[FullscreenMap] Map ready, checking locations:', locations?.length || 0);
            if (locations && locations.length > 0) {
              console.log('[FullscreenMap] Adding', locations.length, 'markers to fullscreen map');
              addMarkersToFullscreenMap(fullscreenMapInstance);
            } else {
              console.warn('[FullscreenMap] No locations available to add to fullscreen map. Locations:', locations);
            }
          });
        };
        
        addMarkersWhenReady();

        // Add sync function to fullscreen map instance
        fullscreenMapInstance._syncStyle = (view) => {
          if (!fullscreenMapInstance) return;
          
          switch (view) {
            case 'globe':
            case '3d':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
              fullscreenMapInstance.setProjection('globe');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            case 'light-globe':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/light-v11');
              fullscreenMapInstance.setProjection('globe');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            case 'streets':
            case '2d':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/streets-v12');
              fullscreenMapInstance.setProjection('mercator');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            case 'satellite':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/satellite-v9');
              fullscreenMapInstance.setProjection('mercator');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            case 'light':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/light-v11');
              fullscreenMapInstance.setProjection('mercator');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            case 'dark':
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/dark-v11');
              fullscreenMapInstance.setProjection('mercator');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
            default:
              // Default to globe view
              fullscreenMapInstance.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
              fullscreenMapInstance.setProjection('globe');
              fullscreenMapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
              break;
          }
        };
      });

      fullscreenMapInstance.on('click', (e) => {
        if (onLocationClick) {
          onLocationClick(e.lngLat);
        }
      });

      setFullscreenMap(fullscreenMapInstance);
      
      // Notify parent component that fullscreen map is ready
      if (onFullscreenMapReady) {
        onFullscreenMapReady(fullscreenMapInstance);
      }

    } catch (error) {
      console.error('Error initializing fullscreen map:', error);
      setError('Failed to initialize fullscreen map');
    }
  }, [userLocation, onLocationClick, fullscreenMap, mapView, map, locations, onFullscreenMapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMarkersToFullscreenMap = useCallback((mapInstance) => {
    if (!mapInstance) {
      console.warn('[addMarkersToFullscreenMap] No map instance provided');
      return;
    }
    
    // Ensure map style is loaded before adding markers
    if (!mapInstance.isStyleLoaded()) {
      console.log('[addMarkersToFullscreenMap] Map style not loaded, waiting...');
      mapInstance.once('style.load', () => {
        addMarkersToFullscreenMap(mapInstance);
      });
      return;
    }
    
    if (!locations || locations.length === 0) {
      console.warn('[addMarkersToFullscreenMap] No locations to add, locations:', locations);
      return;
    }
    
    // Filter locations based on filter state
    const filteredLocations = locations.filter(location => {
      const locationType = location.type || location.marker_type;
      if (locationType === 'wallet') return filters.showWallets;
      if (locationType === 'nft') return filters.showNFTs;
      if (locationType === 'contract_rule') return filters.showContractRules;
      return true; // Show unknown types by default
    });
    
    console.log('[addMarkersToFullscreenMap] Adding', filteredLocations.length, 'filtered markers to fullscreen map (total:', locations.length, ')');

    // Use requestAnimationFrame to ensure smooth updates
    requestAnimationFrame(() => {
      if (!mapInstance) return;

      // Clear existing fullscreen markers only
      Object.values(fullscreenMarkers.current).forEach(marker => {
        if (marker && marker.remove) {
          marker.remove();
        }
      });
      fullscreenMarkers.current = {};

      filteredLocations.forEach((location, index) => {
        const lat = parseFloat(location.latitude);
        const lng = parseFloat(location.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`[addMarkersToFullscreenMap] Invalid coordinates for location ${index}:`, location);
          return;
        }

      // Determine location type
      const locationType = location.type || location.marker_type;

      // Create marker element based on type
      const el = document.createElement('div');
      el.className = 'location-marker';
      
      if (locationType === 'nft') {
        // NFT marker with image - use correct IPFS URL construction
        const imageUrl = constructIPFSUrl(location.server_url, location.ipfs_hash) 
          || location.image_url 
          || location.full_ipfs_url
          || 'https://via.placeholder.com/64x64?text=NFT';
        
        el.style.cssText = `
          width: 64px;
          height: 64px;
          border-radius: 8px;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          border: 3px solid #FFD700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: white;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        // No text content needed - using background-image
      } else if (locationType === 'contract_rule') {
        // Smart Contract Execution Rule marker
        const hasMatch = location.hasMatch;
        const hasExecution = location.hasExecution;
        
        el.style.cssText = `
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 3px solid ${hasExecution ? '#4caf50' : hasMatch ? '#ff9800' : 'white'};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: white;
          font-weight: bold;
          position: relative;
          ${hasMatch || hasExecution ? 'animation: pulseMarker 1.5s ease-in-out infinite;' : ''}
        `;
        el.textContent = '📜';
        
        // Add indicator ring for matches/executions
        if (hasMatch || hasExecution) {
          const ring = document.createElement('div');
          ring.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 8px;
            border: 3px solid ${hasExecution ? '#4caf50' : '#ff9800'};
            animation: ringPulse 1.5s ease-in-out infinite;
            pointer-events: none;
            top: -3px;
            left: -3px;
          `;
          el.appendChild(ring);
        }
      } else if (locationType === 'wallet') {
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

      // Create marker with draggable: false to prevent animation
      const marker = new Mapboxgl.Marker({ 
        element: el, 
        draggable: false 
      })
        .setLngLat([lng, lat])
        .addTo(mapInstance);

      // Add click and double-click handlers for NFT markers
      if (locationType === 'nft' && onNFTDetails) {
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

      // Add click and double-click handlers for contract_rule markers in fullscreen
      if (locationType === 'contract_rule') {
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
            console.log('Contract rule marker clicked in fullscreen:', location);
            // Call onLocationClick if available, or trigger a custom event
            if (onLocationClick) {
              onLocationClick(location);
            }
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
          
          console.log('Contract rule marker double-clicked in fullscreen, zooming in:', location);
          
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
      if (location.public_key || location.description || location.rule_name) {
        let popupHTML = '';
        
        if (locationType === 'contract_rule') {
          popupHTML = `
            <div style="padding: 12px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; color: #667eea;">📜 ${location.rule_name || 'Contract Rule'}</h3>
              ${location.contract_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Contract:</strong> ${location.contract_name}</p>` : ''}
              ${location.function_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Function:</strong> ${location.function_name}</p>` : ''}
              ${location.trigger_on ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Trigger:</strong> ${location.trigger_on}</p>` : ''}
              ${location.radius_meters ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Radius:</strong> ${location.radius_meters}m</p>` : ''}
              ${location.auto_execute ? `<p style="margin: 4px 0; font-size: 12px; color: #4caf50;"><strong>Auto-execute:</strong> Enabled</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `;
        } else {
          popupHTML = `
            <div style="padding: 12px; min-width: 200px;">
              <h4 style="margin: 0 0 8px 0; color: #1976d2;">Location ${index + 1}</h4>
              ${location.public_key ? `<p style="margin: 4px 0; font-family: monospace; font-size: 12px; color: #666;">${location.public_key.substring(0, 20)}...</p>` : ''}
              ${location.description ? `<p style="margin: 4px 0; color: #333;">${location.description}</p>` : ''}
              <p style="margin: 4px 0; font-size: 11px; color: #999;">
                Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
              </p>
            </div>
          `;
        }
        
        const popup = new Mapboxgl.Popup({ offset: 25 })
          .setHTML(popupHTML);
        marker.setPopup(popup);
      }

        fullscreenMarkers.current[`marker_${index}`] = marker;
      });

      // Only fit bounds on initial load, not on every data refresh (prevents map reset)
      if (!hasFullscreenInitialFitBounds.current && filteredLocations.length > 0) {
        const bounds = new Mapboxgl.LngLatBounds();
        let validLocations = 0;
        
        filteredLocations.forEach(location => {
          const lat = parseFloat(location.latitude);
          const lng = parseFloat(location.longitude);
          
          if (!isNaN(lat) && !isNaN(lng)) {
            bounds.extend([lng, lat]);
            validLocations++;
          }
        });
        
        if (validLocations > 0 && mapInstance) {
          // Use setTimeout to ensure markers are rendered before fitting bounds
          setTimeout(() => {
            if (mapInstance && !mapInstance.isStyleLoaded()) {
              mapInstance.once('style.load', () => {
                mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 15 });
                hasFullscreenInitialFitBounds.current = true;
              });
            } else {
              mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 15 });
              hasFullscreenInitialFitBounds.current = true;
            }
          }, 100);
        }
      }
      // Don't restore position - let the map stay where the user positioned it
    });
  }, [locations, filters, onNFTDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFullscreen = () => {
    const newFullscreenState = !isFullscreen;
    setIsFullscreen(newFullscreenState);
    
    if (newFullscreenState) {
      // Opening fullscreen - initialize map after dialog opens
      setTimeout(() => {
        if (fullscreenMapContainer.current && !fullscreenMap) {
          initializeFullscreenMap(fullscreenMapContainer.current);
        }
      }, 100);
    } else {
      // Closing fullscreen - ensure main map is still visible
      // The main map should remain intact, but we can trigger a resize to ensure it renders
      if (map.current) {
        setTimeout(() => {
          console.log('[toggleFullscreen] Restoring main map');
          // Ensure map container is visible first
          if (mapContainer.current) {
            mapContainer.current.style.display = 'block';
            mapContainer.current.style.visibility = 'visible';
            // Force the container to have its full dimensions
            const container = mapContainer.current;
            if (container.parentElement) {
              container.style.height = '100%';
              container.style.width = '100%';
            }
          }
          // Force map to resize and re-render - call resize multiple times to ensure it works
          if (map.current) {
            map.current.resize();
            // Call resize again after a short delay to ensure it takes effect
            setTimeout(() => {
              if (map.current) {
                map.current.resize();
              }
            }, 100);
          }
          // Re-add markers to main map to ensure they're visible
          if (mapLoaded && locations && locations.length > 0) {
            console.log('[toggleFullscreen] Re-adding', locations.length, 'markers to main map');
            addMarkersToMap();
          }
          // Force a repaint by triggering a resize event
          window.dispatchEvent(new Event('resize'));
        }, 200);
      }
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

  // Debounced marker update to prevent glitches during frequent data refreshes
  useEffect(() => {
    if (!map.current || !mapLoaded || !locations) return;
    
    // Clear any pending update
    if (markerUpdateTimeout.current) {
      clearTimeout(markerUpdateTimeout.current);
    }
    
    // Debounce marker updates by 500ms to prevent glitches and freezing
    markerUpdateTimeout.current = setTimeout(() => {
      if (map.current && mapLoaded) {
        addMarkersToMap();
      }
    }, 500);
    
    return () => {
      if (markerUpdateTimeout.current) {
        clearTimeout(markerUpdateTimeout.current);
      }
    };
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

  // Update fullscreen map markers when locations change (with debouncing)
  useEffect(() => {
    if (!fullscreenMap || !locations) return;
    
    // Clear any pending update
    if (fullscreenMarkerUpdateTimeout.current) {
      clearTimeout(fullscreenMarkerUpdateTimeout.current);
    }
    
    // Debounce marker updates by 500ms to prevent glitches and ensure map is ready
    fullscreenMarkerUpdateTimeout.current = setTimeout(() => {
      if (fullscreenMap && fullscreenMap.isStyleLoaded()) {
        console.log('[SharedMap] Locations changed, updating fullscreen map markers:', locations.length);
        addMarkersToFullscreenMap(fullscreenMap);
      } else if (fullscreenMap) {
        // Wait for style to load if not ready
        fullscreenMap.once('style.load', () => {
          console.log('[SharedMap] Fullscreen map style loaded, updating markers:', locations.length);
          addMarkersToFullscreenMap(fullscreenMap);
        });
      }
    }, 500);
    
    return () => {
      if (fullscreenMarkerUpdateTimeout.current) {
        clearTimeout(fullscreenMarkerUpdateTimeout.current);
      }
    };
  }, [locations, fullscreenMap, addMarkersToFullscreenMap]);

  // Ensure main map is visible when exiting fullscreen
  useEffect(() => {
    if (!isFullscreen && map.current && mapContainer.current) {
      console.log('[SharedMap] Exited fullscreen, ensuring main map is visible');
      // Ensure container is visible
      mapContainer.current.style.display = 'block';
      mapContainer.current.style.visibility = 'visible';
      mapContainer.current.style.height = '100%';
      mapContainer.current.style.width = '100%';
      
      // Force map resize after a short delay to ensure container is rendered
      setTimeout(() => {
        if (map.current) {
          console.log('[SharedMap] Resizing main map after fullscreen exit');
          map.current.resize();
          // Call resize again to ensure it takes effect
          setTimeout(() => {
            if (map.current) {
              map.current.resize();
            }
          }, 100);
        }
      }, 100);
    }
  }, [isFullscreen]);

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

  // Add CSS for pulse animations and stable markers (CRITICAL for 3D globe projection)
  useEffect(() => {
    const styleId = 'shared-map-pulse-animations';
    if (document.getElementById(styleId)) return; // Already added
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes pulseMarker {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.9;
        }
      }
      @keyframes ringPulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }
      /* CRITICAL: Prevent marker animation/transition on zoom for 3D globe projection */
      .location-marker {
        transition: none !important;
        transform: none !important;
        will-change: auto !important;
      }
      .mapboxgl-marker {
        transition: none !important;
      }
      .mapboxgl-marker svg,
      .mapboxgl-marker div {
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  return (
    <>
      <Box 
        sx={{ 
          height: height,
          position: 'relative',
          width: '100%',
          m: 0,
          p: 0,
          overflow: 'hidden',
          display: isFullscreen ? 'none' : 'block', // Hide main map when fullscreen is open
          visibility: isFullscreen ? 'hidden' : 'visible' // Also use visibility for better control
        }}
      >
      <Box sx={{ position: 'relative', height: '100%', width: '100%', m: 0, p: 0 }}>
        {/* Map Header */}
        <Box sx={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          p: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          minHeight: '64px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
        }}>
          {title && (
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          )}
          
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
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'block',
            visibility: 'visible'
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
      </Box>

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
            {title && (
              <Typography variant="h6" sx={{ fontWeight: 'bold', mr: 2 }}>
                🗺️ {title} - Fullscreen View
              </Typography>
            )}
            
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
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
              
              {/* Filter Toggle Button */}
              <Tooltip title="Toggle Filters">
                <IconButton 
                  size="small" 
                  onClick={() => setShowFilters(!showFilters)}
                  color={showFilters ? 'primary' : 'default'}
                >
                  <FilterListIcon />
                </IconButton>
              </Tooltip>
              
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
          {/* Filters Panel */}
          {showFilters && (
            <Box
              sx={{
                position: 'absolute',
                top: 20,
                right: 20,
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: 2,
                p: 2,
                minWidth: 200,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Filters
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showWallets}
                    onChange={(e) => setFilters(prev => ({ ...prev, showWallets: e.target.checked }))}
                  />
                }
                label={<Typography variant="caption">Wallets</Typography>}
                sx={{ mb: 0.5, display: 'block' }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showNFTs}
                    onChange={(e) => setFilters(prev => ({ ...prev, showNFTs: e.target.checked }))}
                  />
                }
                label={<Typography variant="caption">NFTs</Typography>}
                sx={{ mb: 0.5, display: 'block' }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showContractRules}
                    onChange={(e) => setFilters(prev => ({ ...prev, showContractRules: e.target.checked }))}
                  />
                }
                label={<Typography variant="caption" sx={{ color: '#667eea' }}>Contract Rules</Typography>}
                sx={{ display: 'block' }}
              />
            </Box>
          )}
          
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
