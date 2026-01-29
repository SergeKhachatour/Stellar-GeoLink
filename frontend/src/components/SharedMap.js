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
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardContent,
  Divider,
  Chip
} from '@mui/material';
import {
  Search as SearchIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import {
  FormControlLabel,
  Switch
} from '@mui/material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

// Utility function to calculate distance between two coordinates (Haversine formula)
// Returns distance in kilometers
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
};

// Format distance for display
const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else if (distanceKm < 10) {
    return `${distanceKm.toFixed(2)}km`;
  } else {
    return `${Math.round(distanceKm)}km`;
  }
};

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
  onFullscreenMapReady = null, // Callback to expose fullscreen map instance
  enableAdvanced3D = false // Enable advanced 3D controls for wallet provider
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const fullscreenMarkers = useRef({});
  const geolocateControl = useRef(null); // Ref for geolocate control
  const fullscreenGeolocateControl = useRef(null); // Ref for fullscreen geolocate control
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
  const searchTimeout = useRef(null); // Debounce search queries
  // Separate filter states for main map and fullscreen map
  const [mainMapFilters, setMainMapFilters] = useState({
    showWallets: true,
    showNFTs: true,
    showContractRules: true
  });
  const [fullscreenMapFilters, setFullscreenMapFilters] = useState({
    showWallets: true,
    showNFTs: true,
    showContractRules: true
  });
  const [showMainMapFilters, setShowMainMapFilters] = useState(false);
  const [showFullscreenMapFilters, setShowFullscreenMapFilters] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [showWalletDetails, setShowWalletDetails] = useState(false);
  const fullscreenSearchBoxRef = useRef(null); // Ref for fullscreen search box positioning
  const userInteractedWithMap = useRef(false); // Track if user has searched or interacted with map
  const lastInteractionTime = useRef(0); // Track when user last interacted (search, click, etc.)
  
  // Advanced 3D state
  const [showAdvanced3D, setShowAdvanced3D] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [bearing, setBearing] = useState(0);
  const [enable3DBuildings, setEnable3DBuildings] = useState(false);
  const [enableTerrain, setEnableTerrain] = useState(false);
  const defaultViewState = useRef({ center: [0, 0], zoom: 1, pitch: 0, bearing: 0 }); // Store default view

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
        // console.log('Shared map loaded');
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
        const geolocateControlInstance = new Mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
            timeout: 15000, // Increased timeout to 15 seconds
            maximumAge: 30000 // Allow cached locations up to 30 seconds since we already have location from watchPosition
          },
          trackUserLocation: false, // Disable auto-tracking to prevent constant re-centering
          showUserHeading: false, // Disable heading since we're not tracking
          showAccuracyCircle: true,
          fitBoundsOptions: {
            maxZoom: 15
          }
        });
        map.current.addControl(geolocateControlInstance, 'top-right');
        geolocateControl.current = geolocateControlInstance;
        
        // Function to clear error state from geolocate button
        const clearGeolocateErrorState = () => {
          setTimeout(() => {
            const geolocateButton = map.current?.getContainer()?.querySelector('.mapboxgl-ctrl-geolocate');
            if (geolocateButton) {
              // Remove error classes that cause red color
              geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error');
              // Reset button appearance if we have valid location
              if (userLocation && userLocation.latitude && userLocation.longitude) {
                geolocateButton.style.opacity = '1';
              }
            }
          }, 100);
        };
        
        // Listen to all geolocate events for debugging
        geolocateControlInstance.on('geolocate', (e) => {
          // console.log('[SharedMap] Geolocate event - location found:', e.coords);
          // Location is already tracked by watchPosition in parent component
          // Clear any error state when location is successfully found
          clearGeolocateErrorState();
        });
        
        geolocateControlInstance.on('error', (e) => {
          // Log specific error codes - check both e.error.code and e.code (different error formats)
          const errorCode = (e && e.error && typeof e.error.code === 'number') ? e.error.code : 
                           (e && typeof e.code === 'number') ? e.code : null;
          
          // Check if we already have location from watchPosition
          const hasLocation = userLocation && userLocation.latitude && userLocation.longitude;
          
          if (errorCode !== null) {
            if (errorCode === 1) {
              console.error('[SharedMap] Geolocation permission denied - user needs to grant permission');
            } else if (errorCode === 2) {
              console.error('[SharedMap] Geolocation position unavailable');
            } else if (errorCode === 3) {
              // Timeout is less critical if we already have location from watchPosition
              if (hasLocation) {
                // console.log('[SharedMap] Geolocation timeout (but we have location from watchPosition, clearing error state)');
              } else {
                console.warn('[SharedMap] Geolocation timeout - will retry');
              }
            } else {
              console.error('[SharedMap] Geolocation error code:', errorCode);
            }
          } else {
            console.error('[SharedMap] Geolocation error (unknown format):', e);
          }
          
          // If we have location from watchPosition, clear error state immediately
          // This allows the control to recover since we already have location
          if (hasLocation) {
            clearGeolocateErrorState();
          }
        });
        
        geolocateControlInstance.on('trackuserlocationstart', () => {
          // console.log('[SharedMap] Started tracking user location via geolocate control');
          // Clear error state when tracking starts
          clearGeolocateErrorState();
        });
        
        geolocateControlInstance.on('trackuserlocationend', () => {
          // console.log('[SharedMap] Stopped tracking user location via geolocate control');
        });
        
        // Add click handler to the geolocate button to ensure it works
        // Wait for the control to be added to DOM
        setTimeout(() => {
          const geolocateButton = map.current.getContainer().querySelector('.mapboxgl-ctrl-geolocate');
          if (geolocateButton) {
            geolocateButton.addEventListener('click', (e) => {
              // console.log('[SharedMap] Geolocate button clicked');
              // Clear error state on click attempt
              setTimeout(clearGeolocateErrorState, 500);
            });
          }
        }, 500);
        
        // DISABLED: Auto-trigger geolocate control
        // This was causing the map to constantly re-center on user location, interfering with navigation
        // Users can manually click the geolocate button if they want to center on their location
        // const tryAutoTrigger = () => {
        //   if (userLocation && userLocation.latitude && userLocation.longitude) {
        //     try {
        //       geolocateControlInstance.trigger();
        //     } catch (error) {
        //       // Silently fail - user can click button manually
        //     }
        //   }
        // };

        // Add advanced 3D control if enabled (includes map style controls)
        if (enableAdvanced3D) {
          const advanced3DControl = createAdvanced3DControl();
          map.current.addControl(advanced3DControl, 'top-left');
        } else {
          // Only add custom 3D control if advanced 3D is not enabled
          const custom3DControl = createCustom3DControl();
          map.current.addControl(custom3DControl, 'top-left');
        }

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
        // Mark that user has interacted with the map (clicked)
        userInteractedWithMap.current = true;
        lastInteractionTime.current = Date.now();
        
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
    if (!map.current || !mapLoaded) {
      console.log('[addMarkersToMap] Map not ready:', { hasMap: !!map.current, mapLoaded });
      return;
    }
    
    // Ensure map style is loaded before adding markers
    if (!map.current.isStyleLoaded()) {
      console.log('[addMarkersToMap] Map style not loaded, waiting...');
      map.current.once('style.load', () => {
        addMarkersToMap();
      });
      return;
    }
    
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
        // console.log('[addMarkersToMap] No locations to add');
        return;
      }
      
      // Debug: Log all locations, especially user location
      const userLocationMarker = locations.find(loc => loc.isCurrentUser);
      if (userLocationMarker) {
        // console.log('[addMarkersToMap] Found user location marker in locations array:', {
        //   latitude: userLocationMarker.latitude,
        //   longitude: userLocationMarker.longitude,
        //   isCurrentUser: userLocationMarker.isCurrentUser,
        //   type: userLocationMarker.type,
        //   marker_type: userLocationMarker.marker_type
        // });
      } else {
        // console.warn('[addMarkersToMap] No user location marker found in locations array!', {
        //   locationsCount: locations.length,
        //   locations: locations.map(loc => ({
        //     type: loc.type,
        //     marker_type: loc.marker_type,
        //     isCurrentUser: loc.isCurrentUser,
        //     latitude: loc.latitude,
        //     longitude: loc.longitude
        //   }))
        // });
      }
      
      // console.log('[addMarkersToMap] Adding', locations.length, 'markers to regular map');

      // Filter locations based on main map filter state
      const filteredLocations = locations.filter(location => {
        const locationType = location.type || location.marker_type;
        // If no type is set, show it (for backward compatibility)
        if (!locationType) {
          return true;
        }
        if (locationType === 'wallet') return mainMapFilters.showWallets;
        if (locationType === 'nft') return mainMapFilters.showNFTs;
        if (locationType === 'contract_rule') return mainMapFilters.showContractRules;
        return true; // Show unknown types by default
      });

      filteredLocations.forEach((location, index) => {
      // Parse coordinates - handle both number and string types
      const lat = typeof location.latitude === 'number' ? location.latitude : parseFloat(location.latitude);
      const lng = typeof location.longitude === 'number' ? location.longitude : parseFloat(location.longitude);
      
      // Debug log for user location markers
      if (location.isCurrentUser) {
        console.log(`[addMarkersToMap] Processing user location marker:`, {
          index,
          latitude: location.latitude,
          longitude: location.longitude,
          parsedLat: lat,
          parsedLng: lng,
          isNaNLat: isNaN(lat),
          isNaNLng: isNaN(lng),
          isFiniteLat: isFinite(lat),
          isFiniteLng: isFinite(lng)
        });
      }
      
      if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
        console.warn(`[SharedMap] Invalid coordinates for location ${index}:`, {
          location,
          lat,
          lng,
          isCurrentUser: location.isCurrentUser
        });
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
        // Wallet marker - distinguish current user from other users
        const isCurrentUser = location.isCurrentUser;
        el.style.cssText = `
          width: ${isCurrentUser ? '36px' : '30px'};
          height: ${isCurrentUser ? '36px' : '30px'};
          border-radius: 50%;
          background-color: ${isCurrentUser ? '#4caf50' : '#1976d2'};
          border: 3px solid ${isCurrentUser ? '#2e7d32' : 'white'};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isCurrentUser ? '18px' : '14px'};
          color: white;
          font-weight: bold;
          ${isCurrentUser ? 'animation: pulseMarker 2s ease-in-out infinite;' : ''}
        `;
        el.textContent = isCurrentUser ? '📍' : '💳';
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

      // Ensure coordinates are valid numbers and within valid ranges
      if (!isFinite(lat) || !isFinite(lng)) {
        console.warn(`[addMarkersToMap] Invalid coordinates (not finite) for location ${index}:`, { lat, lng, location });
        return;
      }
      
      // Ensure coordinates are within valid WGS84 ranges
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn(`[addMarkersToMap] Coordinates out of range for location ${index}:`, { lat, lng });
        return;
      }
      
      // Normalize longitude to -180 to 180 range
      let finalLng = lng;
      while (finalLng > 180) finalLng -= 360;
      while (finalLng < -180) finalLng += 360;
      
      // Normalize latitude to -90 to 90 range
      let finalLat = lat;
      if (finalLat > 90) finalLat = 90;
      if (finalLat < -90) finalLat = -90;

      // Create marker with draggable: false and explicit anchor
      const marker = new Mapboxgl.Marker({ 
        element: el, 
        draggable: false,
        anchor: 'center' // Explicitly set anchor to center
      });
      
      // Set position BEFORE adding to map - this is critical
      // For user location markers, add extra validation
      if (location.isCurrentUser) {
        // console.log(`[addMarkersToMap] Setting user location marker position: [${finalLng}, ${finalLat}]`, {
        //   originalCoords: { lat, lng },
        //   normalizedCoords: { finalLat, finalLng },
        //   location
        // });
        
        // Double-check coordinates are valid
        if (finalLng === 0 && finalLat === 0) {
          console.error(`[addMarkersToMap] User location marker has 0,0 coordinates! This is likely invalid.`, location);
        }
      }
      
      // Ensure coordinates are valid before setting
      if (!isFinite(finalLng) || !isFinite(finalLat)) {
        console.error(`[addMarkersToMap] Cannot set marker position - invalid coordinates: [${finalLng}, ${finalLat}]`);
        return;
      }
      
      marker.setLngLat([finalLng, finalLat]);
      
      // Verify the marker has the correct position before adding
      const markerPos = marker.getLngLat();
      if (location.isCurrentUser) {
        // console.log(`[addMarkersToMap] User location marker position after setLngLat:`, {
        //   expected: [finalLng, finalLat],
        //   actual: [markerPos.lng, markerPos.lat],
        //   difference: {
        //     lng: Math.abs(markerPos.lng - finalLng),
        //     lat: Math.abs(markerPos.lat - finalLat)
        //   }
        // });
      }
      
      if (Math.abs(markerPos.lng - finalLng) > 0.0001 || Math.abs(markerPos.lat - finalLat) > 0.0001) {
        console.warn(`[addMarkersToMap] Marker position mismatch for location ${index}. Expected [${finalLng}, ${finalLat}], got [${markerPos.lng}, ${markerPos.lat}]`);
        // Re-set if wrong
        marker.setLngLat([finalLng, finalLat]);
      }
      
      // Add to map - ensure map is ready
      if (!map.current) {
        console.error(`[addMarkersToMap] Map instance is null for marker ${index}!`);
        return;
      }
      
      if (!map.current.isStyleLoaded()) {
        console.warn(`[addMarkersToMap] Map style not loaded for marker ${index}, waiting...`);
        map.current.once('style.load', () => {
          if (marker && map.current) {
            marker.addTo(map.current);
            if (location.isCurrentUser) {
              // console.log(`[addMarkersToMap] User location marker added to map after style load`);
            }
          }
        });
      } else {
        marker.addTo(map.current);
        if (location.isCurrentUser) {
          // console.log(`[addMarkersToMap] User location marker added to map immediately`);
        }
      }
      
      // Store marker reference with a unique key
      const markerKey = location.isCurrentUser ? 'current_user' : 
                       location.public_key ? `wallet_${location.public_key}` :
                       location.id ? `${locationType}_${location.id}` :
                       `${locationType}_${index}`;
      markers.current[markerKey] = marker;
      
      // After adding, verify position again and re-set if needed (especially for user location)
      if (location.isCurrentUser) {
        // Multiple checks to ensure user location marker is positioned correctly
        const verifyPosition = (attempt = 0) => {
          if (attempt > 5) return; // Max 5 attempts
          
          setTimeout(() => {
            if (marker && marker.getLngLat) {
              const currentPos = marker.getLngLat();
              // If marker is at wrong position (e.g., 0,0 or top-left), re-set it
              if ((Math.abs(currentPos.lng) < 0.001 && Math.abs(currentPos.lat) < 0.001 && (finalLng !== 0 || finalLat !== 0)) ||
                  Math.abs(currentPos.lng - finalLng) > 0.1 || Math.abs(currentPos.lat - finalLat) > 0.1) {
                console.warn(`[addMarkersToMap] User location marker at wrong position [${currentPos.lng}, ${currentPos.lat}], re-setting to [${finalLng}, ${finalLat}] (attempt ${attempt + 1})`);
                marker.setLngLat([finalLng, finalLat]);
                // Try again if still wrong
                verifyPosition(attempt + 1);
              } else {
                // console.log(`[addMarkersToMap] User location marker correctly positioned at [${currentPos.lng}, ${currentPos.lat}]`);
              }
            }
          }, 100 * (attempt + 1));
        };
        verifyPosition();
      }
      
      // Debug: Log marker creation
      // console.log(`[addMarkersToMap] Created marker ${index} at [${finalLng}, ${finalLat}] for type: ${locationType}`, {
      //   isCurrentUser: location.isCurrentUser,
      //   public_key: location.public_key,
      //   markerKey,
      //   originalCoords: { lat, lng },
      //   finalCoords: { finalLat, finalLng }
      // });

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
          
          // console.log('NFT marker double-clicked, zooming in:', location);
          
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

      // Add click handler for wallet markers to show details overlay
      if (locationType === 'wallet' && !location.isCurrentUser) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // console.log('Wallet marker clicked:', location);
          setSelectedWallet(location);
          setShowWalletDetails(true);
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
  }, [mapLoaded, locations, onNFTDetails, mainMapFilters]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const createAdvanced3DControl = useCallback(() => {
    const control = {
      onAdd: function(mapInstance) {
        this._map = mapInstance;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl';
        this._container.style.background = 'rgba(255, 255, 255, 0.95)';
        this._container.style.borderRadius = '4px';
        this._container.style.padding = '4px';
        this._container.style.minWidth = 'auto';
        this._container.style.width = 'auto';
        this._container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        this._container.style.zIndex = '1000';
        this._container.style.fontSize = '12px';

        // Toggle button to show/hide advanced controls (compact)
        const toggleButton = document.createElement('button');
        toggleButton.innerHTML = '🎮';
        toggleButton.title = '3D Tools';
        toggleButton.style.width = '32px';
        toggleButton.style.height = '32px';
        toggleButton.style.padding = '0';
        toggleButton.style.margin = '0';
        toggleButton.style.border = '1px solid #ddd';
        toggleButton.style.borderRadius = '4px';
        toggleButton.style.background = showAdvanced3D ? '#1976d2' : '#f5f5f5';
        toggleButton.style.color = showAdvanced3D ? 'white' : '#333';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.fontSize = '16px';
        toggleButton.style.display = 'flex';
        toggleButton.style.alignItems = 'center';
        toggleButton.style.justifyContent = 'center';
        
        let isExpanded = false;
        toggleButton.onclick = () => {
          isExpanded = !isExpanded;
          setShowAdvanced3D(isExpanded);
          toggleButton.style.background = isExpanded ? '#1976d2' : '#f5f5f5';
          toggleButton.style.color = isExpanded ? 'white' : '#333';
          controlsPanel.style.display = isExpanded ? 'block' : 'none';
          // Update button icon
          toggleButton.innerHTML = isExpanded ? '▼' : '🎮';
          toggleButton.title = isExpanded ? 'Hide 3D Tools' : 'Show 3D Tools';
        };
        this._container.appendChild(toggleButton);

        // Controls panel (initially hidden, compact design)
        const controlsPanel = document.createElement('div');
        controlsPanel.style.display = 'none';
        controlsPanel.style.marginTop = '4px';
        controlsPanel.style.padding = '6px';
        controlsPanel.style.background = 'rgba(255, 255, 255, 0.98)';
        controlsPanel.style.borderRadius = '4px';
        controlsPanel.style.border = '1px solid #ddd';
        controlsPanel.style.minWidth = '180px';

        // Map Style Section
        const styleSection = document.createElement('div');
        styleSection.style.marginBottom = '8px';
        styleSection.style.paddingBottom = '6px';
        styleSection.style.borderBottom = '1px solid #eee';
        
        const styleLabel = document.createElement('div');
        styleLabel.textContent = 'Map Style:';
        styleLabel.style.fontSize = '11px';
        styleLabel.style.fontWeight = 'bold';
        styleLabel.style.marginBottom = '4px';
        styleSection.appendChild(styleLabel);
        
        const styleButtonsContainer = document.createElement('div');
        styleButtonsContainer.style.display = 'flex';
        styleButtonsContainer.style.gap = '4px';
        styleButtonsContainer.style.flexWrap = 'wrap';
        
        // Globe View Button
        const buttonGlobe = document.createElement('button');
        buttonGlobe.innerHTML = '🌍';
        buttonGlobe.title = 'Globe View';
        buttonGlobe.style.width = '28px';
        buttonGlobe.style.height = '28px';
        buttonGlobe.style.padding = '0';
        buttonGlobe.style.border = '1px solid #ddd';
        buttonGlobe.style.borderRadius = '3px';
        buttonGlobe.style.background = mapView === 'globe' ? '#1976d2' : '#f5f5f5';
        buttonGlobe.style.color = mapView === 'globe' ? 'white' : '#333';
        buttonGlobe.style.cursor = 'pointer';
        buttonGlobe.style.fontSize = '14px';
        buttonGlobe.onclick = () => {
          changeMapView('globe');
          // Update button states
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          buttonGlobe.style.background = '#1976d2';
          buttonGlobe.style.color = 'white';
        };
        styleButtonsContainer.appendChild(buttonGlobe);

        // 2D Streets View Button
        const button2D = document.createElement('button');
        button2D.innerHTML = '🗺️';
        button2D.title = 'Streets View';
        button2D.style.width = '28px';
        button2D.style.height = '28px';
        button2D.style.padding = '0';
        button2D.style.border = '1px solid #ddd';
        button2D.style.borderRadius = '3px';
        button2D.style.background = mapView === 'streets' ? '#1976d2' : '#f5f5f5';
        button2D.style.color = mapView === 'streets' ? 'white' : '#333';
        button2D.style.cursor = 'pointer';
        button2D.style.fontSize = '14px';
        button2D.onclick = () => {
          changeMapView('streets');
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          button2D.style.background = '#1976d2';
          button2D.style.color = 'white';
        };
        styleButtonsContainer.appendChild(button2D);

        // Satellite View Button
        const buttonSat = document.createElement('button');
        buttonSat.innerHTML = '🛰️';
        buttonSat.title = 'Satellite View';
        buttonSat.style.width = '28px';
        buttonSat.style.height = '28px';
        buttonSat.style.padding = '0';
        buttonSat.style.border = '1px solid #ddd';
        buttonSat.style.borderRadius = '3px';
        buttonSat.style.background = mapView === 'satellite' ? '#1976d2' : '#f5f5f5';
        buttonSat.style.color = mapView === 'satellite' ? 'white' : '#333';
        buttonSat.style.cursor = 'pointer';
        buttonSat.style.fontSize = '14px';
        buttonSat.onclick = () => {
          changeMapView('satellite');
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          buttonSat.style.background = '#1976d2';
          buttonSat.style.color = 'white';
        };
        styleButtonsContainer.appendChild(buttonSat);

        // Light View Button
        const buttonLight = document.createElement('button');
        buttonLight.innerHTML = '☀️';
        buttonLight.title = 'Light View';
        buttonLight.style.width = '28px';
        buttonLight.style.height = '28px';
        buttonLight.style.padding = '0';
        buttonLight.style.border = '1px solid #ddd';
        buttonLight.style.borderRadius = '3px';
        buttonLight.style.background = mapView === 'light' ? '#1976d2' : '#f5f5f5';
        buttonLight.style.color = mapView === 'light' ? 'white' : '#333';
        buttonLight.style.cursor = 'pointer';
        buttonLight.style.fontSize = '14px';
        buttonLight.onclick = () => {
          changeMapView('light');
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          buttonLight.style.background = '#1976d2';
          buttonLight.style.color = 'white';
        };
        styleButtonsContainer.appendChild(buttonLight);

        // Dark View Button
        const buttonDark = document.createElement('button');
        buttonDark.innerHTML = '🌙';
        buttonDark.title = 'Dark View';
        buttonDark.style.width = '28px';
        buttonDark.style.height = '28px';
        buttonDark.style.padding = '0';
        buttonDark.style.border = '1px solid #ddd';
        buttonDark.style.borderRadius = '3px';
        buttonDark.style.background = mapView === 'dark' ? '#1976d2' : '#f5f5f5';
        buttonDark.style.color = mapView === 'dark' ? 'white' : '#333';
        buttonDark.style.cursor = 'pointer';
        buttonDark.style.fontSize = '14px';
        buttonDark.onclick = () => {
          changeMapView('dark');
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          buttonDark.style.background = '#1976d2';
          buttonDark.style.color = 'white';
        };
        styleButtonsContainer.appendChild(buttonDark);
        
        styleSection.appendChild(styleButtonsContainer);
        controlsPanel.appendChild(styleSection);

        // 2D/3D/Globe Toggle Section
        const viewModeSection = document.createElement('div');
        viewModeSection.style.marginBottom = '8px';
        viewModeSection.style.paddingBottom = '6px';
        viewModeSection.style.borderBottom = '1px solid #eee';
        
        const viewModeLabel = document.createElement('div');
        viewModeLabel.textContent = 'View Mode:';
        viewModeLabel.style.fontSize = '11px';
        viewModeLabel.style.fontWeight = 'bold';
        viewModeLabel.style.marginBottom = '4px';
        viewModeSection.appendChild(viewModeLabel);
        
        const viewModeButtonsContainer = document.createElement('div');
        viewModeButtonsContainer.style.display = 'flex';
        viewModeButtonsContainer.style.gap = '4px';
        
        // 2D Button
        const button2DMode = document.createElement('button');
        button2DMode.textContent = '2D';
        button2DMode.title = '2D View';
        button2DMode.style.flex = '1';
        button2DMode.style.padding = '4px';
        button2DMode.style.border = '1px solid #ddd';
        button2DMode.style.borderRadius = '3px';
        button2DMode.style.background = '#f5f5f5';
        button2DMode.style.color = '#333';
        button2DMode.style.cursor = 'pointer';
        button2DMode.style.fontSize = '11px';
        button2DMode.onclick = () => {
          if (this._map) {
            this._map.setProjection('mercator');
            this._map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
            setPitch(0);
            setBearing(0);
            pitchSlider.value = 0;
            bearingSlider.value = 0;
            pitchLabel.textContent = 'Pitch: 0°';
            bearingLabel.textContent = 'Rot: 0°';
            [button2DMode, button3DMode, buttonGlobeMode].forEach(btn => {
              btn.style.background = '#f5f5f5';
              btn.style.color = '#333';
            });
            button2DMode.style.background = '#1976d2';
            button2DMode.style.color = 'white';
          }
        };
        viewModeButtonsContainer.appendChild(button2DMode);

        // 3D Button
        const button3DMode = document.createElement('button');
        button3DMode.textContent = '3D';
        button3DMode.title = '3D View';
        button3DMode.style.flex = '1';
        button3DMode.style.padding = '4px';
        button3DMode.style.border = '1px solid #ddd';
        button3DMode.style.borderRadius = '3px';
        button3DMode.style.background = '#f5f5f5';
        button3DMode.style.color = '#333';
        button3DMode.style.cursor = 'pointer';
        button3DMode.style.fontSize = '11px';
        button3DMode.onclick = () => {
          if (this._map) {
            this._map.setProjection('mercator');
            this._map.easeTo({ pitch: 60, bearing: 0, duration: 500 });
            setPitch(60);
            setBearing(0);
            pitchSlider.value = 60;
            bearingSlider.value = 0;
            pitchLabel.textContent = 'Pitch: 60°';
            bearingLabel.textContent = 'Rot: 0°';
            [button2DMode, button3DMode, buttonGlobeMode].forEach(btn => {
              btn.style.background = '#f5f5f5';
              btn.style.color = '#333';
            });
            button3DMode.style.background = '#1976d2';
            button3DMode.style.color = 'white';
          }
        };
        viewModeButtonsContainer.appendChild(button3DMode);

        // Globe Button
        const buttonGlobeMode = document.createElement('button');
        buttonGlobeMode.textContent = 'Globe';
        buttonGlobeMode.title = 'Globe View';
        buttonGlobeMode.style.flex = '1';
        buttonGlobeMode.style.padding = '4px';
        buttonGlobeMode.style.border = '1px solid #ddd';
        buttonGlobeMode.style.borderRadius = '3px';
        buttonGlobeMode.style.background = '#f5f5f5';
        buttonGlobeMode.style.color = '#333';
        buttonGlobeMode.style.cursor = 'pointer';
        buttonGlobeMode.style.fontSize = '11px';
        buttonGlobeMode.onclick = () => {
          if (this._map) {
            this._map.setProjection('globe');
            this._map.easeTo({ pitch: 60, bearing: 0, duration: 500 });
            setPitch(60);
            setBearing(0);
            pitchSlider.value = 60;
            bearingSlider.value = 0;
            pitchLabel.textContent = 'Pitch: 60°';
            bearingLabel.textContent = 'Rot: 0°';
            [button2DMode, button3DMode, buttonGlobeMode].forEach(btn => {
              btn.style.background = '#f5f5f5';
              btn.style.color = '#333';
            });
            buttonGlobeMode.style.background = '#1976d2';
            buttonGlobeMode.style.color = 'white';
          }
        };
        viewModeButtonsContainer.appendChild(buttonGlobeMode);
        
        viewModeSection.appendChild(viewModeButtonsContainer);
        controlsPanel.appendChild(viewModeSection);

        // Pitch slider (compact)
        const pitchLabel = document.createElement('label');
        pitchLabel.textContent = `Pitch: ${pitch}°`;
        pitchLabel.style.display = 'block';
        pitchLabel.style.marginBottom = '2px';
        pitchLabel.style.fontSize = '11px';
        controlsPanel.appendChild(pitchLabel);

        const pitchSlider = document.createElement('input');
        pitchSlider.type = 'range';
        pitchSlider.min = '0';
        pitchSlider.max = '85';
        pitchSlider.value = pitch;
        pitchSlider.style.width = '100%';
        pitchSlider.style.marginBottom = '6px';
        pitchSlider.style.height = '4px';
        pitchSlider.oninput = (e) => {
          const newPitch = parseInt(e.target.value);
          setPitch(newPitch);
          pitchLabel.textContent = `Pitch: ${newPitch}°`;
          if (this._map) {
            this._map.easeTo({ pitch: newPitch, duration: 300 });
          }
        };
        controlsPanel.appendChild(pitchSlider);

        // Bearing slider (compact)
        const bearingLabel = document.createElement('label');
        bearingLabel.textContent = `Rot: ${bearing}°`;
        bearingLabel.style.display = 'block';
        bearingLabel.style.marginBottom = '2px';
        bearingLabel.style.fontSize = '11px';
        controlsPanel.appendChild(bearingLabel);

        const bearingSlider = document.createElement('input');
        bearingSlider.type = 'range';
        bearingSlider.min = '-180';
        bearingSlider.max = '180';
        bearingSlider.value = bearing;
        bearingSlider.style.width = '100%';
        bearingSlider.style.marginBottom = '6px';
        bearingSlider.style.height = '4px';
        bearingSlider.oninput = (e) => {
          const newBearing = parseInt(e.target.value);
          setBearing(newBearing);
          bearingLabel.textContent = `Rotation: ${newBearing}°`;
          if (this._map) {
            this._map.easeTo({ bearing: newBearing, duration: 300 });
          }
        };
        controlsPanel.appendChild(bearingSlider);

        // 3D Buildings toggle (compact)
        const buildingsContainer = document.createElement('div');
        buildingsContainer.style.display = 'flex';
        buildingsContainer.style.alignItems = 'center';
        buildingsContainer.style.justifyContent = 'space-between';
        buildingsContainer.style.marginBottom = '4px';

        const buildingsLabel = document.createElement('label');
        buildingsLabel.textContent = '3D Buildings';
        buildingsLabel.style.fontSize = '11px';
        buildingsContainer.appendChild(buildingsLabel);

        const buildingsToggle = document.createElement('input');
        buildingsToggle.type = 'checkbox';
        buildingsToggle.checked = enable3DBuildings;
        buildingsToggle.onchange = (e) => {
          setEnable3DBuildings(e.target.checked);
          if (this._map && this._map.isStyleLoaded()) {
            const layers = this._map.getStyle().layers;
            const buildingLayer = layers.find(layer => layer.id === '3d-buildings');
            
            if (e.target.checked) {
              // Add 3D buildings layer if it doesn't exist
              if (!buildingLayer) {
                this._map.addLayer({
                  'id': '3d-buildings',
                  'source': 'composite',
                  'source-layer': 'building',
                  'filter': ['==', 'extrude', 'true'],
                  'type': 'fill-extrusion',
                  'minzoom': 14,
                  'paint': {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      14, 0,
                      14.05, ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      14, 0,
                      14.05, ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                  }
                });
              } else {
                this._map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
              }
            } else {
              // Hide 3D buildings
              if (buildingLayer) {
                this._map.setLayoutProperty('3d-buildings', 'visibility', 'none');
              }
            }
          }
        };
        buildingsContainer.appendChild(buildingsToggle);
        controlsPanel.appendChild(buildingsContainer);

        // Terrain toggle (compact)
        const terrainContainer = document.createElement('div');
        terrainContainer.style.display = 'flex';
        terrainContainer.style.alignItems = 'center';
        terrainContainer.style.justifyContent = 'space-between';
        terrainContainer.style.marginBottom = '6px';

        const terrainLabel = document.createElement('label');
        terrainLabel.textContent = 'Terrain';
        terrainLabel.style.fontSize = '11px';
        terrainContainer.appendChild(terrainLabel);

        const terrainToggle = document.createElement('input');
        terrainToggle.type = 'checkbox';
        terrainToggle.checked = enableTerrain;
        terrainToggle.onchange = (e) => {
          setEnableTerrain(e.target.checked);
          if (this._map && this._map.isStyleLoaded()) {
            if (e.target.checked) {
              // Add terrain source
              this._map.addSource('mapbox-dem', {
                'type': 'raster-dem',
                'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                'tileSize': 512,
                'maxzoom': 14
              });
              this._map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
            } else {
              // Remove terrain
              this._map.setTerrain(null);
              if (this._map.getSource('mapbox-dem')) {
                this._map.removeSource('mapbox-dem');
              }
            }
          }
        };
        terrainContainer.appendChild(terrainToggle);
        controlsPanel.appendChild(terrainContainer);

        // Reset button (compact)
        const resetButton = document.createElement('button');
        resetButton.textContent = '🔄 Reset';
        resetButton.style.width = '100%';
        resetButton.style.padding = '4px';
        resetButton.style.border = '1px solid #ddd';
        resetButton.style.borderRadius = '3px';
        resetButton.style.background = '#f5f5f5';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontSize = '11px';
        resetButton.onclick = () => {
          const defaultView = defaultViewState.current;
          setPitch(0);
          setBearing(0);
          setEnable3DBuildings(false);
          setEnableTerrain(false);
          pitchSlider.value = 0;
          bearingSlider.value = 0;
          buildingsToggle.checked = false;
          terrainToggle.checked = false;
          pitchLabel.textContent = 'Pitch: 0°';
          bearingLabel.textContent = 'Rot: 0°';
          
          // Reset to Light Globe View (globe projection with light style)
          changeMapView('light-globe');
          [buttonGlobe, button2D, buttonSat, buttonLight, buttonDark].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          // Highlight both globe and light buttons to show it's light-globe
          buttonGlobe.style.background = '#1976d2';
          buttonGlobe.style.color = 'white';
          buttonLight.style.background = '#1976d2';
          buttonLight.style.color = 'white';
          
          // Reset view mode to Globe
          [button2DMode, button3DMode, buttonGlobeMode].forEach(btn => {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
          });
          buttonGlobeMode.style.background = '#1976d2';
          buttonGlobeMode.style.color = 'white';
          
          if (this._map) {
            // Set to globe projection with light style
            this._map.setStyle('mapbox://styles/mapbox/light-v11');
            this._map.setProjection('globe');
            
            this._map.easeTo({
              center: defaultView.center,
              zoom: defaultView.zoom,
              pitch: 0,
              bearing: 0,
              duration: 1000
            });
            
            // Remove 3D buildings and terrain
            if (this._map.getLayer('3d-buildings')) {
              this._map.setLayoutProperty('3d-buildings', 'visibility', 'none');
            }
            if (this._map.getTerrain()) {
              this._map.setTerrain(null);
              if (this._map.getSource('mapbox-dem')) {
                this._map.removeSource('mapbox-dem');
              }
            }
          }
        };
        controlsPanel.appendChild(resetButton);

        this._container.appendChild(controlsPanel);

        return this._container;
      },
      onRemove: function() {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._map = undefined;
      }
    };
    
    return control;
  }, [showAdvanced3D, pitch, bearing, enable3DBuildings, enableTerrain, mapView, setShowAdvanced3D, setPitch, setBearing, setEnable3DBuildings, setEnableTerrain, changeMapView]);

  const handleSearch = async (query = null) => {
    const searchTerm = query !== null ? query : searchQuery;
    
    // Mark that user has interacted with the map (searching)
    if (searchTerm.trim()) {
      userInteractedWithMap.current = true;
      lastInteractionTime.current = Date.now();
    }
    
    if (!searchTerm.trim()) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchTerm)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchResults(true);
        // Clear any previous errors
        setError('');
      } else {
        setShowSearchResults(false);
        setSearchResults([]);
        setError('No results found for your search');
      }
    } catch (error) {
      console.error('Search error:', error);
      setShowSearchResults(false);
      setSearchResults([]);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Real-time search with debouncing
  useEffect(() => {
    // Clear any existing timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // If search query is empty, hide results immediately
    if (!searchQuery.trim()) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    // Debounce search - wait 300ms after user stops typing
    searchTimeout.current = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    // Cleanup timeout on unmount or when searchQuery changes
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchResultClick = (result) => {
    const [lng, lat] = result.center;
    setSearchQuery(result.place_name);
    setShowSearchResults(false);
    
    // Mark that user has interacted with the map (searched)
    userInteractedWithMap.current = true;
    lastInteractionTime.current = Date.now();
    
    // Use fullscreen map if in fullscreen mode, otherwise use main map
    const targetMap = isFullscreen && fullscreenMap ? fullscreenMap : map.current;
    
    if (targetMap) {
      targetMap.flyTo({
        center: [lng, lat],
        zoom: 15,
        pitch: mapView === 'globe' || mapView === '3d' || mapView === 'light-globe' ? 60 : 0,
        duration: 2000
      });
    }
  };

  const initializeFullscreenMap = useCallback((container) => {
    // Check if map exists and if it's still attached to a valid container
    if (fullscreenMap) {
      try {
        const existingContainer = fullscreenMap.getContainer();
        // If container is valid and matches, map is already initialized
        if (existingContainer && existingContainer === container && container.offsetWidth > 0 && container.offsetHeight > 0) {
          console.log('[initializeFullscreenMap] Fullscreen map already initialized and container is valid');
          return;
        } else {
          // Map exists but container is invalid or different - clean it up
          console.log('[initializeFullscreenMap] Fullscreen map exists but container is invalid, cleaning up...');
          try {
            // Clear markers first
            Object.keys(fullscreenMarkers.current).forEach(key => {
              const marker = fullscreenMarkers.current[key];
              if (marker && typeof marker.remove === 'function') {
                try {
                  marker.remove();
                } catch (markerError) {
                  console.warn('[initializeFullscreenMap] Error removing marker:', markerError);
                }
              }
            });
            fullscreenMarkers.current = {};
            
            // Check if map is still valid before removing
            try {
              const oldContainer = fullscreenMap.getContainer();
              if (oldContainer && typeof fullscreenMap.remove === 'function') {
                fullscreenMap.remove();
              }
            } catch (mapError) {
              // Map is already destroyed or in invalid state
              console.warn('[initializeFullscreenMap] Map already destroyed, skipping remove:', mapError);
            }
          } catch (error) {
            console.warn('[initializeFullscreenMap] Error cleaning up old map:', error);
          } finally {
            setFullscreenMap(null);
            hasFullscreenInitialFitBounds.current = false;
          }
        }
      } catch (error) {
        // Map instance is in an invalid state, clean it up
        console.warn('[initializeFullscreenMap] Map instance is invalid, cleaning up:', error);
        try {
          // Try to get container to check if map is still valid
          try {
            const oldContainer = fullscreenMap.getContainer();
            if (oldContainer && typeof fullscreenMap.remove === 'function') {
              fullscreenMap.remove();
            }
          } catch (containerError) {
            // Map is already destroyed
            console.warn('[initializeFullscreenMap] Map already destroyed:', containerError);
          }
        } catch (removeError) {
          console.warn('[initializeFullscreenMap] Error removing invalid map:', removeError);
        } finally {
          setFullscreenMap(null);
          hasFullscreenInitialFitBounds.current = false;
        }
      }
    }

    console.log('[initializeFullscreenMap] Initializing fullscreen map with container:', container);

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
        const fullscreenGeolocateControlInstance = new Mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
            timeout: 15000, // Increased timeout to 15 seconds
            maximumAge: 30000 // Allow cached locations up to 30 seconds since we already have location from watchPosition
          },
          trackUserLocation: false, // Disable auto-tracking to prevent constant re-centering
          showUserHeading: false, // Disable heading since we're not tracking
          showAccuracyCircle: true,
          fitBoundsOptions: {
            maxZoom: 15
          }
        });
        fullscreenMapInstance.addControl(fullscreenGeolocateControlInstance, 'top-right');
        fullscreenGeolocateControl.current = fullscreenGeolocateControlInstance;
        
        // Function to clear error state from fullscreen geolocate button
        const clearFullscreenGeolocateErrorState = () => {
          // Try multiple times to ensure it clears
          const tryClear = (attempt = 0) => {
            const fullscreenGeolocateButton = fullscreenMapInstance?.getContainer()?.querySelector('.mapboxgl-ctrl-geolocate');
            if (fullscreenGeolocateButton) {
              // Remove error classes that cause red color
              fullscreenGeolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error');
              // Also remove any other error-related classes
              fullscreenGeolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error-state');
              // Reset button appearance if we have valid location
              if (userLocation && userLocation.latitude && userLocation.longitude) {
                fullscreenGeolocateButton.style.opacity = '1';
                fullscreenGeolocateButton.style.color = '';
                // Force remove inline styles that might cause red color
                const computedStyle = window.getComputedStyle(fullscreenGeolocateButton);
                if (computedStyle.color === 'rgb(255, 0, 0)' || computedStyle.color === 'red') {
                  fullscreenGeolocateButton.style.color = '';
                }
              }
              console.log('[SharedMap] Cleared fullscreen geolocate error state');
            } else if (attempt < 3) {
              // Retry if button not found yet
              setTimeout(() => tryClear(attempt + 1), 200);
            }
          };
          tryClear();
        };
        
        // Listen to all geolocate events
        fullscreenGeolocateControlInstance.on('geolocate', (e) => {
          console.log('[SharedMap] Fullscreen geolocate event - location found:', e.coords);
          // Location is already tracked by watchPosition in parent component
          // Clear any error state when location is successfully found
          clearFullscreenGeolocateErrorState();
        });
        
        fullscreenGeolocateControlInstance.on('error', (e) => {
          // Log specific error codes - check both e.error.code and e.code (different error formats)
          const errorCode = (e && e.error && typeof e.error.code === 'number') ? e.error.code : 
                           (e && typeof e.code === 'number') ? e.code : null;
          
          // Check if we already have location from watchPosition
          const hasLocation = userLocation && userLocation.latitude && userLocation.longitude;
          
          if (errorCode !== null) {
            if (errorCode === 1) {
              console.error('[SharedMap] Fullscreen geolocation permission denied - user needs to grant permission');
            } else if (errorCode === 2) {
              console.error('[SharedMap] Fullscreen geolocation position unavailable');
            } else if (errorCode === 3) {
              // Timeout is less critical if we already have location from watchPosition
              if (hasLocation) {
                console.log('[SharedMap] Fullscreen geolocation timeout (but we have location from watchPosition, clearing error state)');
              } else {
                console.warn('[SharedMap] Fullscreen geolocation timeout - will retry');
              }
            } else {
              console.error('[SharedMap] Fullscreen geolocation error code:', errorCode);
            }
          } else {
            console.error('[SharedMap] Fullscreen geolocation error (unknown format):', e);
          }
          
          // If we have location from watchPosition, clear error state immediately
          // This allows the control to recover since we already have location
          if (hasLocation) {
            clearFullscreenGeolocateErrorState();
          }
        });
        
        fullscreenGeolocateControlInstance.on('trackuserlocationstart', () => {
          console.log('[SharedMap] Fullscreen started tracking user location via geolocate control');
          // Clear error state when tracking starts
          clearFullscreenGeolocateErrorState();
        });
        
        fullscreenGeolocateControlInstance.on('trackuserlocationend', () => {
          console.log('[SharedMap] Fullscreen stopped tracking user location via geolocate control');
        });
        
        // Add click handler to the fullscreen geolocate button to ensure it works
        setTimeout(() => {
          const fullscreenGeolocateButton = fullscreenMapInstance.getContainer().querySelector('.mapboxgl-ctrl-geolocate');
          if (fullscreenGeolocateButton) {
            fullscreenGeolocateButton.addEventListener('click', (e) => {
              console.log('[SharedMap] Fullscreen geolocate button clicked');
              // Clear error state on click attempt
              setTimeout(clearFullscreenGeolocateErrorState, 500);
            });
          }
        }, 500);
        
        // DISABLED: Auto-trigger geolocate control for fullscreen map
        // This was causing the map to constantly re-center on user location, interfering with navigation
        // Users can manually click the geolocate button if they want to center on their location
        // const tryFullscreenAutoTrigger = () => {
        //   if (userLocation && userLocation.latitude && userLocation.longitude) {
        //     try {
        //       fullscreenGeolocateControlInstance.trigger();
        //     } catch (error) {
        //       // Silently fail - user can click button manually
        //     }
        //   }
        // };

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
          
          // Wait for map to be fully rendered - use multiple checks
          const ensureMapReady = () => {
            // Check if map container has dimensions
            const container = fullscreenMapInstance.getContainer();
            if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
              console.log('[FullscreenMap] Container not sized yet, waiting...');
              setTimeout(ensureMapReady, 100);
              return;
            }
            
            // Additional check: ensure map is fully rendered
            requestAnimationFrame(() => {
              // Double-check map is ready
              if (!fullscreenMapInstance.loaded() || !fullscreenMapInstance.isStyleLoaded()) {
                console.log('[FullscreenMap] Map not fully ready in requestAnimationFrame, retrying...');
                setTimeout(ensureMapReady, 100);
                return;
              }
              
              console.log('[FullscreenMap] Map fully ready, checking locations:', locations?.length || 0);
              if (locations && locations.length > 0) {
                // console.log('[FullscreenMap] Adding', locations.length, 'markers to fullscreen map');
                // Add a small delay to ensure map projection is fully initialized
                setTimeout(() => {
                  addMarkersToFullscreenMap(fullscreenMapInstance);
                }, 200);
              } else {
                console.warn('[FullscreenMap] No locations available to add to fullscreen map. Locations:', locations);
              }
            });
          };
          
          ensureMapReady();
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
        // Mark that user has interacted with the map (clicked)
        userInteractedWithMap.current = true;
        lastInteractionTime.current = Date.now();
        
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
    
    // Ensure map is fully loaded and ready before adding markers
    if (!mapInstance.loaded() || !mapInstance.isStyleLoaded()) {
      // console.log('[addMarkersToFullscreenMap] Map not fully loaded, waiting...', { loaded: mapInstance.loaded(), styleLoaded: mapInstance.isStyleLoaded() });
      const waitForLoad = () => {
        if (mapInstance.loaded() && mapInstance.isStyleLoaded()) {
          addMarkersToFullscreenMap(mapInstance);
        } else {
          // Wait for both loaded and style.load events
          if (!mapInstance.loaded()) {
            mapInstance.once('load', waitForLoad);
          }
          if (!mapInstance.isStyleLoaded()) {
            mapInstance.once('style.load', waitForLoad);
          }
        }
      };
      waitForLoad();
      return;
    }
    
    if (!locations || locations.length === 0) {
      console.warn('[addMarkersToFullscreenMap] No locations to add, locations:', locations);
      return;
    }
    
    // Filter locations based on filter state (only for fullscreen map)
    // Also exclude user location marker (isCurrentUser) from fullscreen map
    const filteredLocations = locations.filter(location => {
      // Exclude user location marker from fullscreen map
      if (location.isCurrentUser) {
        return false;
      }
      
      const locationType = location.type || location.marker_type;
      // If no type is set, show it (for backward compatibility)
      if (!locationType) {
        // console.log('[addMarkersToFullscreenMap] Location has no type, showing by default:', location);
        return true;
      }
      if (locationType === 'wallet') return fullscreenMapFilters.showWallets;
      if (locationType === 'nft') return fullscreenMapFilters.showNFTs;
      if (locationType === 'contract_rule') return fullscreenMapFilters.showContractRules;
      return true; // Show unknown types by default
    });
    
    // console.log('[addMarkersToFullscreenMap] Adding', filteredLocations.length, 'filtered markers to fullscreen map (total:', locations.length, 'filters:', fullscreenMapFilters, 'sample location:', filteredLocations[0]);

    // Use requestAnimationFrame to ensure smooth updates, but also wait for map to be ready
    requestAnimationFrame(() => {
      if (!mapInstance) {
        console.warn('[addMarkersToFullscreenMap] No map instance in requestAnimationFrame, skipping');
        return;
      }
      
      // Double-check map is ready
      if (typeof mapInstance.loaded !== 'function' || typeof mapInstance.isStyleLoaded !== 'function') {
        console.warn('[addMarkersToFullscreenMap] Map instance methods not available, skipping');
        return;
      }
      
      if (!mapInstance.loaded() || !mapInstance.isStyleLoaded()) {
        console.warn('[addMarkersToFullscreenMap] Map not ready in requestAnimationFrame, waiting...', {
          loaded: mapInstance.loaded(),
          styleLoaded: mapInstance.isStyleLoaded()
        });
        // Wait for map to be ready
        const waitForReady = () => {
          if (mapInstance && mapInstance.loaded() && mapInstance.isStyleLoaded()) {
            addMarkersToFullscreenMap(mapInstance);
          } else {
            setTimeout(waitForReady, 100);
          }
        };
        waitForReady();
        return;
      }

      // Clear existing fullscreen markers only - ensure we remove them properly
      Object.keys(fullscreenMarkers.current).forEach(key => {
        const marker = fullscreenMarkers.current[key];
        if (marker) {
          try {
            if (typeof marker.remove === 'function') {
              marker.remove();
            }
          } catch (removeError) {
            console.warn(`[addMarkersToFullscreenMap] Error removing marker ${key}:`, removeError);
          }
        }
      });
      fullscreenMarkers.current = {};

      filteredLocations.forEach((location, index) => {
        // Parse and validate coordinates more strictly - handle both number and string types
        let lat = typeof location.latitude === 'number' ? location.latitude : parseFloat(location.latitude);
        let lng = typeof location.longitude === 'number' ? location.longitude : parseFloat(location.longitude);
        
        // Debug log for user location markers
        if (location.isCurrentUser) {
          // console.log(`[addMarkersToFullscreenMap] Processing user location marker:`, {
          //   index,
          //   latitude: location.latitude,
          //   longitude: location.longitude,
          //   parsedLat: lat,
          //   parsedLng: lng,
          //   isNaNLat: isNaN(lat),
          //   isNaNLng: isNaN(lng),
          //   isFiniteLat: isFinite(lat),
          //   isFiniteLng: isFinite(lng)
          // });
        }
        
        // Validate coordinates are numbers and within valid ranges
        if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
          console.warn(`[addMarkersToFullscreenMap] Invalid coordinates for location ${index}:`, { 
            lat, 
            lng, 
            location,
            isCurrentUser: location.isCurrentUser
          });
          return;
        }
        
        // Ensure coordinates are within valid WGS84 ranges
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`[addMarkersToFullscreenMap] Coordinates out of range for location ${index}:`, { lat, lng });
          return;
        }
        
        // Normalize longitude to -180 to 180 range
        while (lng > 180) lng -= 360;
        while (lng < -180) lng += 360;
        
        // Normalize latitude to -90 to 90 range
        if (lat > 90) lat = 90;
        if (lat < -90) lat = -90;
        
        // Additional validation: reject coordinates that are exactly 0,0 (likely invalid)
        if (lat === 0 && lng === 0) {
          console.warn(`[addMarkersToFullscreenMap] Coordinates are 0,0 (likely invalid) for location ${index}:`, location);
          // Don't return - allow 0,0 if it's actually valid (Null Island)
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
        // Wallet marker - distinguish current user from other users
        const isCurrentUser = location.isCurrentUser;
        el.style.cssText = `
          width: ${isCurrentUser ? '36px' : '30px'};
          height: ${isCurrentUser ? '36px' : '30px'};
          border-radius: 50%;
          background-color: ${isCurrentUser ? '#4caf50' : '#1976d2'};
          border: 3px solid ${isCurrentUser ? '#2e7d32' : 'white'};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isCurrentUser ? '18px' : '14px'};
          color: white;
          font-weight: bold;
          ${isCurrentUser ? 'animation: pulseMarker 2s ease-in-out infinite;' : ''}
        `;
        el.textContent = isCurrentUser ? '📍' : '💳';
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
      // Ensure marker is positioned correctly by setting coordinates before adding to map
      let marker = null;
      try {
        // Create marker with validated coordinates
        marker = new Mapboxgl.Marker({ 
          element: el, 
          draggable: false,
          anchor: 'center' // Explicitly set anchor to center
        });
        
        // Use normalized coordinates (already normalized above)
        const finalLng = lng; // Already normalized
        const finalLat = lat; // Already normalized
        
        // For user location markers, add extra validation
        if (location.isCurrentUser) {
          // console.log(`[addMarkersToFullscreenMap] Setting user location marker position: [${finalLng}, ${finalLat}]`);
        }
        
        // Set position BEFORE adding to map - this is critical
        marker.setLngLat([finalLng, finalLat]);
        
        // Verify the marker has the correct position before adding
        const markerPos = marker.getLngLat();
        if (Math.abs(markerPos.lng - finalLng) > 0.0001 || Math.abs(markerPos.lat - finalLat) > 0.0001) {
          console.warn(`[addMarkersToFullscreenMap] Marker position mismatch for location ${index}. Expected [${finalLng}, ${finalLat}], got [${markerPos.lng}, ${markerPos.lat}]`);
        }
        
        // Only add to map if it's fully loaded and valid
        if (mapInstance && typeof mapInstance.loaded === 'function' && typeof mapInstance.isStyleLoaded === 'function') {
          if (mapInstance.loaded() && mapInstance.isStyleLoaded()) {
            try {
              // Add marker to map
              marker.addTo(mapInstance);
              
              // Store marker reference with a unique key (same as main map)
              const markerKey = location.isCurrentUser ? 'current_user' : 
                               location.public_key ? `wallet_${location.public_key}` :
                               location.id ? `${locationType}_${location.id}` :
                               `${locationType}_${index}`;
              fullscreenMarkers.current[markerKey] = marker;
              
              // After adding, verify position again and re-set if needed (especially for user location)
              if (location.isCurrentUser) {
                // Multiple checks to ensure user location marker is positioned correctly
                const verifyPosition = (attempt = 0) => {
                  if (attempt > 5) return; // Max 5 attempts
                  
                  setTimeout(() => {
                    if (marker && marker.getLngLat) {
                      const currentPos = marker.getLngLat();
                      // If marker is at wrong position (e.g., 0,0 or top-left), re-set it
                      if ((Math.abs(currentPos.lng) < 0.001 && Math.abs(currentPos.lat) < 0.001 && (finalLng !== 0 || finalLat !== 0)) ||
                          Math.abs(currentPos.lng - finalLng) > 0.1 || Math.abs(currentPos.lat - finalLat) > 0.1) {
                        console.warn(`[addMarkersToFullscreenMap] User location marker at wrong position [${currentPos.lng}, ${currentPos.lat}], re-setting to [${finalLng}, ${finalLat}] (attempt ${attempt + 1})`);
                        marker.setLngLat([finalLng, finalLat]);
                        // Try again if still wrong
                        verifyPosition(attempt + 1);
                      } else {
                        // console.log(`[addMarkersToFullscreenMap] User location marker correctly positioned at [${currentPos.lng}, ${currentPos.lat}]`);
                      }
                    }
                  }, 100 * (attempt + 1));
                };
                verifyPosition();
              } else {
                // For other markers, single check
                setTimeout(() => {
                  if (marker && marker.getLngLat) {
                    const currentPos = marker.getLngLat();
                    // If marker is at wrong position (e.g., 0,0 or top-left), re-set it
                    if ((Math.abs(currentPos.lng) < 0.001 && Math.abs(currentPos.lat) < 0.001 && (finalLng !== 0 || finalLat !== 0)) ||
                        Math.abs(currentPos.lng - finalLng) > 0.1 || Math.abs(currentPos.lat - finalLat) > 0.1) {
                      console.warn(`[addMarkersToFullscreenMap] Marker ${index} at wrong position [${currentPos.lng}, ${currentPos.lat}], re-setting to [${finalLng}, ${finalLat}]`);
                      marker.setLngLat([finalLng, finalLat]);
                    }
                  }
                }, 100);
              }
              
              // Debug: Log marker creation
              // console.log(`[addMarkersToFullscreenMap] Created marker ${index} at [${finalLng}, ${finalLat}] for type: ${locationType}`, {
              //   isCurrentUser: location.isCurrentUser,
              //   public_key: location.public_key,
              //   locationId: location.id,
              //   ruleName: location.rule_name,
              //   contractName: location.contract_name,
              //   markerKey
              // });
            } catch (addError) {
              console.error(`[addMarkersToFullscreenMap] Error adding marker ${index} to map:`, addError);
              // Clean up marker element if adding failed
              if (marker && marker.remove) {
                marker.remove();
              }
              marker = null;
              return;
            }
          } else {
            console.warn(`[addMarkersToFullscreenMap] Map not ready for marker ${index}, skipping. Loaded: ${mapInstance.loaded()}, StyleLoaded: ${mapInstance.isStyleLoaded()}`);
            if (marker && marker.remove) {
              marker.remove();
            }
            marker = null;
            return;
          }
        } else {
          console.warn(`[addMarkersToFullscreenMap] Invalid map instance for marker ${index}, skipping`);
          if (marker && marker.remove) {
            marker.remove();
          }
          marker = null;
          return;
        }
      } catch (markerError) {
        console.error(`[addMarkersToFullscreenMap] Error creating marker ${index}:`, markerError);
        if (marker && marker.remove) {
          marker.remove();
        }
        marker = null;
        return;
      }

      // Only add event handlers and popup if marker was successfully created and added
      if (!marker) {
        return;
      }

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

      // Add click handler for contract rule markers
      if (locationType === 'contract_rule' && onLocationClick) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onLocationClick(location);
        });
      }

      // Add click handler for wallet markers in fullscreen map
      if (locationType === 'wallet' && !location.isCurrentUser) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Wallet marker clicked in fullscreen:', location);
          setSelectedWallet(location);
          setShowWalletDetails(true);
        });
      }

      // Add popup (only if marker was successfully created)
      if (marker && (location.public_key || location.description || location.rule_name)) {
        try {
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
        } catch (popupError) {
          console.error(`[addMarkersToFullscreenMap] Error adding popup to marker ${index}:`, popupError);
        }
      }
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
  }, [locations, fullscreenMapFilters, onNFTDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFullscreen = () => {
    const newFullscreenState = !isFullscreen;
    setIsFullscreen(newFullscreenState);
    
    if (newFullscreenState) {
      // Opening fullscreen - reset fitBounds flag and initialize map after dialog opens
      hasFullscreenInitialFitBounds.current = false;
      // Wait for dialog to be fully rendered and container to have dimensions
      setTimeout(() => {
        if (fullscreenMapContainer.current) {
          // Ensure container has dimensions before initializing
          const container = fullscreenMapContainer.current;
          if (container.offsetWidth > 0 && container.offsetHeight > 0) {
            console.log('[toggleFullscreen] Container ready, initializing fullscreen map');
            initializeFullscreenMap(container);
          } else {
            // Retry if container not ready
            console.log('[toggleFullscreen] Container not sized yet, retrying...');
            setTimeout(() => {
              if (fullscreenMapContainer.current) {
                initializeFullscreenMap(fullscreenMapContainer.current);
              }
            }, 200);
          }
        }
      }, 200);
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
            // console.log('[toggleFullscreen] Re-adding', locations.length, 'markers to main map');
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
  }, [locations, mapLoaded, addMarkersToMap, mainMapFilters]);

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
      if (!fullscreenMap) return;
      
      // Ensure map is fully loaded and container has dimensions
      const container = fullscreenMap.getContainer();
      const hasDimensions = container && container.offsetWidth > 0 && container.offsetHeight > 0;
      
      if (fullscreenMap.loaded() && fullscreenMap.isStyleLoaded() && hasDimensions) {
        console.log('[SharedMap] Locations changed, updating fullscreen map markers:', locations.length);
        addMarkersToFullscreenMap(fullscreenMap);
      } else {
        // Wait for map to be fully loaded and container to have dimensions
        console.log('[SharedMap] Fullscreen map not ready, waiting for load...', { 
          loaded: fullscreenMap.loaded(), 
          styleLoaded: fullscreenMap.isStyleLoaded(),
          hasDimensions
        });
        
        const waitForReady = () => {
          const container = fullscreenMap.getContainer();
          const hasDimensions = container && container.offsetWidth > 0 && container.offsetHeight > 0;
          
          if (fullscreenMap && fullscreenMap.loaded() && fullscreenMap.isStyleLoaded() && hasDimensions) {
            // console.log('[SharedMap] Fullscreen map ready, updating markers:', locations.length);
            addMarkersToFullscreenMap(fullscreenMap);
          } else {
            // Wait for map to be ready or container to have dimensions
            if (!fullscreenMap.loaded()) {
              fullscreenMap.once('load', waitForReady);
            } else if (!fullscreenMap.isStyleLoaded()) {
              fullscreenMap.once('style.load', waitForReady);
            } else if (!hasDimensions) {
              // Retry after a short delay if container doesn't have dimensions
              setTimeout(waitForReady, 100);
            }
          }
        };
        waitForReady();
      }
    }, 500);
    
    return () => {
      if (fullscreenMarkerUpdateTimeout.current) {
        clearTimeout(fullscreenMarkerUpdateTimeout.current);
      }
    };
  }, [locations, fullscreenMap, addMarkersToFullscreenMap, fullscreenMapFilters]);

  // DISABLED: Auto-centering map on userLocation changes
  // This was causing the map to constantly move back to user location, which is annoying
  // Users can manually use the geolocate control button if they want to center on their location
  // useEffect(() => {
  //   if (userLocation && userLocation.latitude && userLocation.longitude) {
  //     // Update main map center
  //     if (map.current && mapLoaded) {
  //       // Check if geolocate control is actively tracking
  //       const isTracking = geolocateControl.current?._watchState === 'ACTIVE_LOCK' || 
  //                         geolocateControl.current?._watchState === 'ACTIVE';
  //       
  //       // Always update center from watchPosition, but use different animation if geolocate is tracking
  //       if (isTracking) {
  //         // If geolocate is tracking, just update center smoothly without zoom change
  //         map.current.easeTo({
  //           center: [userLocation.longitude, userLocation.latitude],
  //           duration: 1000
  //         });
  //       } else {
  //         // If geolocate is not tracking, fly to location (first time or when user moves significantly)
  //         const currentCenter = map.current.getCenter();
  //         const distance = Math.sqrt(
  //           Math.pow(currentCenter.lng - userLocation.longitude, 2) + 
  //           Math.pow(currentCenter.lat - userLocation.latitude, 2)
  //         );
  //         
  //         // Only fly if distance is significant (more than ~100m)
  //         if (distance > 0.001) {
  //           map.current.flyTo({
  //             center: [userLocation.longitude, userLocation.latitude],
  //             zoom: map.current.getZoom() < 15 ? 15 : map.current.getZoom(),
  //             duration: 1000
  //           });
  //         }
  //       }
  //     }
  //     
  //     // Update fullscreen map center
  //     if (fullscreenMap && fullscreenMap.loaded()) {
  //       // Check if fullscreen geolocate control is actively tracking
  //       const isFullscreenTracking = fullscreenGeolocateControl.current?._watchState === 'ACTIVE_LOCK' || 
  //                                    fullscreenGeolocateControl.current?._watchState === 'ACTIVE';
  //       
  //       if (isFullscreenTracking) {
  //         fullscreenMap.easeTo({
  //           center: [userLocation.longitude, userLocation.latitude],
  //           duration: 1000
  //         });
  //       } else {
  //         const currentCenter = fullscreenMap.getCenter();
  //         const distance = Math.sqrt(
  //           Math.pow(currentCenter.lng - userLocation.longitude, 2) + 
  //           Math.pow(currentCenter.lat - userLocation.latitude, 2)
  //         );
  //         
  //         if (distance > 0.001) {
  //           fullscreenMap.flyTo({
  //             center: [userLocation.longitude, userLocation.latitude],
  //             zoom: fullscreenMap.getZoom() < 15 ? 15 : fullscreenMap.getZoom(),
  //             duration: 1000
  //           });
  //         }
  //       }
  //     }
  //   }
  // }, [userLocation, mapLoaded, fullscreenMap]);

  // DISABLED: Auto-trigger geolocate control when userLocation is available
  // This was causing the map to constantly re-center, interfering with user navigation and search
  // The geolocate control will still work when user clicks it manually
  // User's location is already tracked via watchPosition in parent component
  // useEffect(() => {
  //   if (userLocation && userLocation.latitude && userLocation.longitude && mapLoaded) {
  //     // Try to auto-trigger main map geolocate
  //     if (geolocateControl.current && map.current) {
  //       const tryTrigger = () => {
  //         try {
  //           // Check if control is ready and not already tracking
  //           if (geolocateControl.current && typeof geolocateControl.current.trigger === 'function') {
  //             const watchState = geolocateControl.current._watchState;
  //             // Only trigger if not already actively tracking
  //             if (watchState !== 'ACTIVE' && watchState !== 'ACTIVE_LOCK') {
  //               // console.log('[SharedMap] Auto-triggering geolocate control (current state:', watchState, ')');
  //               geolocateControl.current.trigger();
  //               // console.log('[SharedMap] Successfully auto-triggered geolocate');
  //             } else {
  //               // console.log('[SharedMap] Geolocate control already active, state:', watchState);
  //             }
  //           }
  //         } catch (error) {
  //           // Browser may require user interaction for first-time permission
  //           // console.log('[SharedMap] Auto-trigger failed (may need user interaction):', error.message);
  //         }
  //       };
  //       
  //       tryTrigger();
  //       setTimeout(tryTrigger, 500);
  //       setTimeout(tryTrigger, 1500);
  //       setTimeout(tryTrigger, 3000);
  //       
  //       // DISABLED: Periodic auto-triggering causes map to constantly re-center
  //       // This interferes with user navigation and search
  //       // The geolocate control will still work when user clicks it manually
  //       // const keepActiveInterval = setInterval(() => {
  //       //   // Don't auto-trigger if user has interacted with map in the last 30 seconds
  //       //   const timeSinceInteraction = Date.now() - lastInteractionTime.current;
  //       //   if (userInteractedWithMap.current && timeSinceInteraction < 30000) {
  //       //     console.log('[SharedMap] Skipping geolocate auto-trigger - user recently interacted with map');
  //       //     return;
  //       //   }
  //       //   
  //       //   if (geolocateControl.current && map.current) {
  //       //     const watchState = geolocateControl.current._watchState;
  //       //     // If not tracking, try to activate again
  //       //     if (watchState !== 'ACTIVE' && watchState !== 'ACTIVE_LOCK') {
  //       //       tryTrigger();
  //       //     }
  //       //   }
  //       // }, 10000); // Check every 10 seconds
  //       
  //       // No cleanup needed since we're not using intervals
  //     }
  //     
  //     // Try to auto-trigger fullscreen map geolocate
  //     if (fullscreenGeolocateControl.current && fullscreenMap && fullscreenMap.loaded()) {
  //       const tryFullscreenTrigger = () => {
  //         try {
  //           if (fullscreenGeolocateControl.current && typeof fullscreenGeolocateControl.current.trigger === 'function') {
  //             const watchState = fullscreenGeolocateControl.current._watchState;
  //             if (watchState !== 'ACTIVE' && watchState !== 'ACTIVE_LOCK') {
  //               // console.log('[SharedMap] Auto-triggering fullscreen geolocate control');
  //               fullscreenGeolocateControl.current.trigger();
  //               // console.log('[SharedMap] Successfully auto-triggered fullscreen geolocate');
  //             }
  //           }
  //         } catch (error) {
  //           // console.log('[SharedMap] Fullscreen auto-trigger failed:', error.message);
  //         }
  //       };
  //       
  //       tryFullscreenTrigger();
  //       setTimeout(tryFullscreenTrigger, 500);
  //       setTimeout(tryFullscreenTrigger, 1500);
  //     }
  //   }
  // }, [userLocation, mapLoaded, fullscreenMap]);

  // Periodically clear geolocate error state when we have valid location
  // This helps recover from error states automatically
  useEffect(() => {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      return;
    }

    const clearErrorState = () => {
      // Clear error state on main map
      if (map.current && geolocateControl.current) {
        const geolocateButton = map.current.getContainer()?.querySelector('.mapboxgl-ctrl-geolocate');
        if (geolocateButton) {
          if (geolocateButton.classList.contains('mapboxgl-ctrl-geolocate-error')) {
            geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error');
            geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error-state');
            geolocateButton.style.opacity = '1';
            geolocateButton.style.color = '';
            // console.log('[SharedMap] Cleared error state from main map geolocate button');
          }
        }
      }

      // Clear error state on fullscreen map - more aggressive clearing
      if (fullscreenMap && fullscreenGeolocateControl.current) {
        const fullscreenGeolocateButton = fullscreenMap.getContainer()?.querySelector('.mapboxgl-ctrl-geolocate');
        if (fullscreenGeolocateButton) {
          // Always try to clear error state, not just if class exists
          fullscreenGeolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error');
          fullscreenGeolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error-state');
          fullscreenGeolocateButton.style.opacity = '1';
          // Force remove any red color styling
          const computedStyle = window.getComputedStyle(fullscreenGeolocateButton);
          if (computedStyle.color === 'rgb(255, 0, 0)' || computedStyle.color === 'red') {
            fullscreenGeolocateButton.style.color = '';
          }
          // Also check child elements (the icon inside the button)
          const icon = fullscreenGeolocateButton.querySelector('span, svg, .mapboxgl-ctrl-icon');
          if (icon) {
            icon.style.color = '';
            const iconStyle = window.getComputedStyle(icon);
            if (iconStyle.color === 'rgb(255, 0, 0)' || iconStyle.color === 'red') {
              icon.style.color = '';
            }
          }
        }
      }
    };

    // Clear immediately if we have location
    clearErrorState();

    // Set up periodic check every 2 seconds to clear error state (more frequent for fullscreen)
    const interval = setInterval(clearErrorState, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [userLocation, mapLoaded, fullscreenMap]);

  // Ensure main map is visible when exiting fullscreen and clean up fullscreen map
  useEffect(() => {
    if (!isFullscreen) {
      // Clean up fullscreen map when dialog closes
      if (fullscreenMap) {
        console.log('[SharedMap] Cleaning up fullscreen map on dialog close');
        try {
          // Clear markers first
          Object.keys(fullscreenMarkers.current).forEach(key => {
            const marker = fullscreenMarkers.current[key];
            if (marker && typeof marker.remove === 'function') {
              try {
                marker.remove();
              } catch (markerError) {
                console.warn('[SharedMap] Error removing marker:', markerError);
              }
            }
          });
          fullscreenMarkers.current = {};
          
          // Check if map is still valid before removing
          try {
            // Try to get the container - if this fails, the map is already destroyed
            const container = fullscreenMap.getContainer();
            if (container && typeof fullscreenMap.remove === 'function') {
              fullscreenMap.remove();
            }
          } catch (mapError) {
            // Map is already destroyed or in invalid state
            console.warn('[SharedMap] Map already destroyed or invalid, skipping remove:', mapError);
          }
        } catch (error) {
          console.warn('[SharedMap] Error cleaning up fullscreen map:', error);
        } finally {
          // Always clear the state, even if removal failed
          setFullscreenMap(null);
          fullscreenGeolocateControl.current = null; // Clear the ref to prevent conflicts
          hasFullscreenInitialFitBounds.current = false;
        }
      }
      
      // DISABLED: Re-activate geolocate control after fullscreen closes
      // This was causing the map to auto-center on user location, interfering with navigation
      // Users can manually click the geolocate button if they want to center on their location
      // if (map.current && geolocateControl.current && userLocation && userLocation.latitude && userLocation.longitude) {
      //   setTimeout(() => {
      //     try {
      //       // Clear any error state
      //       const geolocateButton = map.current?.getContainer()?.querySelector('.mapboxgl-ctrl-geolocate');
      //       if (geolocateButton) {
      //         geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-error');
      //         geolocateButton.style.opacity = '1';
      //       }
      //     } catch (error) {
      //       console.warn('[SharedMap] Could not clear geolocate error state:', error);
      //     }
      //   }, 500);
      // }
      
      // Ensure main map is visible
      if (map.current && mapContainer.current) {
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
    }
  }, [isFullscreen, fullscreenMap, userLocation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up main map
      if (map.current) {
        try {
          // Check if map is still valid before removing
          const container = map.current.getContainer();
          if (container && typeof map.current.remove === 'function') {
            map.current.remove();
          }
        } catch (error) {
          console.warn('[SharedMap] Error removing main map on unmount:', error);
        } finally {
          map.current = null;
          markers.current = {};
        }
      }
      
      // Clean up fullscreen map
      if (fullscreenMap) {
        try {
          // Check if map is still valid before removing
          const container = fullscreenMap.getContainer();
          if (container && typeof fullscreenMap.remove === 'function') {
            fullscreenMap.remove();
          }
        } catch (error) {
          console.warn('[SharedMap] Error removing fullscreen map on unmount:', error);
        } finally {
          setFullscreenMap(null);
        }
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
      /* Allow transforms (Mapbox needs this for positioning) but prevent transitions */
      .location-marker {
        transition: none !important;
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
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', position: 'relative' }}>
              {/* Search Box with autocomplete dropdown */}
              <Box sx={{ position: 'relative' }}>
                <TextField
                  size="small"
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => {
                    // Show results when search box is focused if there are results
                    if (searchResults.length > 0) {
                      setShowSearchResults(true);
                    }
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSearchQuery('');
                            setShowSearchResults(false);
                            setSearchResults([]);
                          }}
                          sx={{ p: 0.5 }}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{ minWidth: 200 }}
                />
                
                {/* Search Results Dropdown - Positioned directly under search box */}
                {!isFullscreen && showSearchResults && searchResults.length > 0 && (
                  <Box sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1002,
                    background: 'white',
                    borderRadius: 1,
                    boxShadow: 3,
                    maxHeight: '300px',
                    overflow: 'auto',
                    mt: 0.5,
                    border: '1px solid #e0e0e0'
                  }}>
                    {searchResults.map((result, index) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderBottom: index < searchResults.length - 1 ? '1px solid #eee' : 'none',
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
              </Box>
              
              {/* Filter Toggle Button */}
              <Tooltip title="Toggle Filters">
                <IconButton 
                  size="small" 
                  onClick={() => setShowMainMapFilters(!showMainMapFilters)}
                  color={showMainMapFilters ? 'primary' : 'default'}
                >
                  <FilterListIcon />
                </IconButton>
              </Tooltip>
              
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

        {/* Filters Panel - Show on main map (bottom left) */}
        {!isFullscreen && showMainMapFilters && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 20,
              left: 20,
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
                  checked={mainMapFilters.showWallets}
                  onChange={(e) => setMainMapFilters(prev => ({ ...prev, showWallets: e.target.checked }))}
                />
              }
              label={<Typography variant="caption">Wallets</Typography>}
              sx={{ mb: 0.5, display: 'block' }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={mainMapFilters.showNFTs}
                  onChange={(e) => setMainMapFilters(prev => ({ ...prev, showNFTs: e.target.checked }))}
                />
              }
              label={<Typography variant="caption">NFTs</Typography>}
              sx={{ mb: 0.5, display: 'block' }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={mainMapFilters.showContractRules}
                  onChange={(e) => setMainMapFilters(prev => ({ ...prev, showContractRules: e.target.checked }))}
                />
              }
              label={<Typography variant="caption" sx={{ color: '#667eea' }}>Contract Rules</Typography>}
              sx={{ display: 'block' }}
            />
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
            display: isFullscreen ? 'none' : 'block', // Hide main map when in fullscreen
            visibility: isFullscreen ? 'hidden' : 'visible'
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
            
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
              {/* Search Box with autocomplete dropdown */}
              <Box sx={{ position: 'relative' }}>
                <TextField
                  inputRef={fullscreenSearchBoxRef}
                  size="small"
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => {
                    // Show results when search box is focused if there are results
                    if (searchResults.length > 0) {
                      setShowSearchResults(true);
                    }
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSearchQuery('');
                            setShowSearchResults(false);
                            setSearchResults([]);
                          }}
                          sx={{ p: 0.5 }}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{ minWidth: 200 }}
                />
                
                {/* Search Results Dropdown - Positioned directly under search box */}
                {isFullscreen && showSearchResults && searchResults.length > 0 && (
                  <Box sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1002,
                    background: 'white',
                    borderRadius: 1,
                    boxShadow: 3,
                    maxHeight: '300px',
                    overflow: 'auto',
                    mt: 0.5,
                    border: '1px solid #e0e0e0'
                  }}>
                    {searchResults.map((result, index) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderBottom: index < searchResults.length - 1 ? '1px solid #eee' : 'none',
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
              </Box>
              
              {/* Filter Toggle Button */}
              <Tooltip title="Toggle Filters">
                <IconButton 
                  size="small" 
                  onClick={() => setShowFullscreenMapFilters(!showFullscreenMapFilters)}
                  color={showFullscreenMapFilters ? 'primary' : 'default'}
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
          {/* Search results are now shown directly under the search box in DialogTitle */}

          {/* Filters Panel - Moved to bottom left */}
          {showFullscreenMapFilters && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 20,
                left: 20,
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
                    checked={fullscreenMapFilters.showWallets}
                    onChange={(e) => setFullscreenMapFilters(prev => ({ ...prev, showWallets: e.target.checked }))}
                  />
                }
                label={<Typography variant="caption">Wallets</Typography>}
                sx={{ mb: 0.5, display: 'block' }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={fullscreenMapFilters.showNFTs}
                    onChange={(e) => setFullscreenMapFilters(prev => ({ ...prev, showNFTs: e.target.checked }))}
                  />
                }
                label={<Typography variant="caption">NFTs</Typography>}
                sx={{ mb: 0.5, display: 'block' }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={fullscreenMapFilters.showContractRules}
                    onChange={(e) => setFullscreenMapFilters(prev => ({ ...prev, showContractRules: e.target.checked }))}
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

      {/* Wallet Details Dialog */}
      <Dialog
        open={showWalletDetails}
        onClose={() => setShowWalletDetails(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          pb: 2
        }}>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              💳 Wallet Details
            </Typography>
          </Box>
          <IconButton
            onClick={() => setShowWalletDetails(false)}
            sx={{ color: 'white' }}
            size="small"
          >
            <FullscreenExitIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedWallet && (
            <Box>
              {/* Distance from user */}
              {userLocation && userLocation.latitude && userLocation.longitude && (
                <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                        📍 Distance from You
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1565c0', mb: 1 }}>
                      {formatDistance(calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        parseFloat(selectedWallet.latitude),
                        parseFloat(selectedWallet.longitude)
                      ))}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        parseFloat(selectedWallet.latitude),
                        parseFloat(selectedWallet.longitude)
                      ).toFixed(3)} kilometers away
                    </Typography>
                  </CardContent>
                </Card>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Wallet Information */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Public Key
                </Typography>
                <Typography variant="body1" sx={{ 
                  fontFamily: 'monospace', 
                  wordBreak: 'break-all',
                  backgroundColor: '#f5f5f5',
                  padding: 1,
                  borderRadius: 1
                }}>
                  {selectedWallet.public_key || 'N/A'}
                </Typography>
              </Box>

              {selectedWallet.description && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body1">
                    {selectedWallet.description}
                  </Typography>
                </Box>
              )}

              {/* Parse description for additional info */}
              {selectedWallet.description && selectedWallet.description.includes('|') && (
                <Box sx={{ mb: 2 }}>
                  {selectedWallet.description.split('|').map((part, index) => {
                    const trimmed = part.trim();
                    if (!trimmed) return null;
                    const [key, value] = trimmed.split(':').map(s => s.trim());
                    if (!key || !value) return null;
                    return (
                      <Box key={index} sx={{ mb: 1 }}>
                        <Chip 
                          label={String(`${key}: ${value}`)}
                          size="small"
                          sx={{ mr: 1, mb: 0.5 }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Location Coordinates */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Location
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  Lat: {parseFloat(selectedWallet.latitude).toFixed(6)}, 
                  Lng: {parseFloat(selectedWallet.longitude).toFixed(6)}
                </Typography>
              </Box>

              {/* Additional wallet data if available */}
              {selectedWallet.provider_name && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Provider
                  </Typography>
                  <Typography variant="body1">
                    {selectedWallet.provider_name}
                  </Typography>
                </Box>
              )}

              {selectedWallet.wallet_type && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Wallet Type
                  </Typography>
                  <Chip 
                    label={String(selectedWallet.wallet_type)}
                    color="primary"
                    size="small"
                  />
                </Box>
              )}

              {selectedWallet.tracking_status && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Tracking Status
                  </Typography>
                  <Chip 
                    label={String(selectedWallet.tracking_status)}
                    color={String(selectedWallet.tracking_status).toLowerCase() === 'active' ? 'success' : 'default'}
                    size="small"
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button 
            onClick={() => {
              if (selectedWallet) {
                const targetMap = isFullscreen && fullscreenMap ? fullscreenMap : map.current;
                if (targetMap) {
                  targetMap.flyTo({
                    center: [parseFloat(selectedWallet.longitude), parseFloat(selectedWallet.latitude)],
                    zoom: 15,
                    duration: 1000
                  });
                }
              }
            }}
            variant="outlined"
            startIcon={<SearchIcon />}
          >
            Focus on Map
          </Button>
          <Button 
            onClick={() => setShowWalletDetails(false)}
            variant="contained"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SharedMap;
