import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  Grid,
  Button,
  Slider,
  Chip,
  Card,
  CardContent,
  FormControlLabel,
  Switch,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  LocationOn as LocationIcon,
  Settings as SettingsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useAIMap } from '../../contexts/AIMapContext';
import ContractDetailsOverlay from '../Map/ContractDetailsOverlay';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Add CSS styles for NFT image markers (matching home page implementation exactly)
// NOTE: Do not set position, transform, or will-change - Mapbox needs full control for 3D globe positioning
const markerStyles = `
  .nft-marker {
    width: 64px !important;
    height: 64px !important;
    cursor: pointer !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 8px !important;
    border: 3px solid #FFD700 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
    overflow: hidden !important;
  }
  
  .nft-marker img,
  .nft-marker div {
    pointer-events: none !important;
  }
  
  /* Ensure popups appear above everything */
  .mapboxgl-popup {
    z-index: 2000 !important;
  }
  
  .mapboxgl-popup-content {
    z-index: 2001 !important;
  }
  
  .mapboxgl-popup-tip {
    z-index: 2002 !important;
  }
  
  /* Specific styling for NFT popups */
  .nft-popup {
    z-index: 3000 !important;
  }
  
  .nft-popup .mapboxgl-popup-content {
    z-index: 3001 !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important;
  }
  
  .nft-popup .mapboxgl-popup-tip {
    z-index: 3002 !important;
  }
`;

// Inject styles into the document (only once)
if (typeof document !== 'undefined' && !document.getElementById('ai-map-marker-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'ai-map-marker-styles';
  styleSheet.textContent = markerStyles;
  document.head.appendChild(styleSheet);
}

// Helper function to construct IPFS URL from server_url and hash
// Matches the implementation in NFT Dashboard for consistency
// Handles cases where server_url might already contain /ipfs/ path
// Always uses the hash from ipfs_hash field, not from server_url
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

/**
 * AI-Controlled Map Component
 * Displays dynamic map data based on AI responses
 * Supports: wallets, NFTs, Stellar accounts, network nodes
 */
const AIMap = ({ mapData, visible, onMapReady }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [nftDetailsOpen, setNftDetailsOpen] = useState(false);
  const [contractOverlayOpen, setContractOverlayOpen] = useState(false);
  const [selectedContractItem, setSelectedContractItem] = useState(null);
  const [proximitySettingsOpen, setProximitySettingsOpen] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(20000000); // Default to global (20,000 km - matches xyz-wallet)
  const [userLocation, setUserLocation] = useState(null);
  const [locationIntelligence, setLocationIntelligence] = useState(null);
  const [overlayVisible, setOverlayVisible] = useState(true); // Overlay visibility state
  const [filters, setFilters] = useState({
    showWallets: true,
    showNFTs: true,
    showContractRules: true
  });
  
  // Get updateProximityRadius from context
  const { updateProximityRadius: updateContextProximityRadius } = useAIMap();

  // Initialize map function
  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) {
      console.log('[AIMap] Map initialization skipped:', {
        hasContainer: !!mapContainer.current,
        hasMap: !!map.current
      });
      return;
    }
    
    if (!MAPBOX_TOKEN) {
      console.error('[AIMap] MAPBOX_TOKEN is missing! Map cannot be initialized.');
      return;
    }

    console.log('[AIMap] Initializing map...');
    
    // Set up global error handlers BEFORE creating the map to catch fog errors early
    const originalError = window.console.error;
    const originalWindowError = window.onerror;
    
    // Override console.error to suppress fog-related errors
    window.console.error = (...args) => {
      const errorStr = args.map(arg => 
        typeof arg === 'string' ? arg : 
        (arg?.message || arg?.toString() || JSON.stringify(arg))
      ).join(' ');
      
      if (errorStr.includes('fog') || 
          errorStr.includes('opacity') || 
          errorStr.includes('getOpacityAtLatLng') || 
          errorStr.includes('Cannot read properties of undefined') ||
          errorStr.includes('reading \'get\'')) {
        return; // Suppress fog-related errors
      }
      originalError.apply(console, args);
    };
    
    // Also catch unhandled errors
    window.onerror = (message, source, lineno, colno, error) => {
      const errorStr = `${message} ${source} ${error?.stack || ''}`;
      if (errorStr.includes('fog') || 
          errorStr.includes('opacity') || 
          errorStr.includes('getOpacityAtLatLng') || 
          errorStr.includes('Cannot read properties of undefined') ||
          errorStr.includes('reading \'get\'')) {
        return true; // Suppress the error
      }
      if (originalWindowError) {
        return originalWindowError(message, source, lineno, colno, error);
      }
      return false;
    };
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20],
        zoom: 2,
        projection: 'globe',
        antialias: true
      });
      
      // Configure fog for light style
      // The error occurs when Mapbox tries to query fog opacity before fog state is initialized
      // We need to set fog as early as possible
      const configureFog = () => {
        try {
          if (map.current && map.current.loaded && map.current.isStyleLoaded()) {
            // Only try to configure fog if map and style are fully loaded
            if (typeof map.current.setFog === 'function') {
              // Set fog with light colors for light style
              map.current.setFog({
                color: 'rgb(240, 240, 250)', // Light gray-blue
                'high-color': 'rgb(220, 230, 255)', // Light blue for high altitude
                'horizon-blend': 0.2,
                'space-color': 'rgb(240, 240, 240)', // Light gray space
                'star-intensity': 0 // No stars for light style
              });
              console.log('[AIMap] Fog configured for light style');
            }
          }
        } catch (e) {
          // Silently catch errors - fog might not be available or map not ready
        }
      };
      
      // Suppress fog opacity query errors by catching them in the error event
      map.current.on('error', (error) => {
        // Suppress fog-related errors silently
        if (error && error.error && (
          (error.error.message && (
            error.error.message.includes('fog') ||
            error.error.message.includes('opacity') ||
            error.error.message.includes('Cannot read properties of undefined')
          )) ||
          (error.error.toString && error.error.toString().includes('fog')) ||
          (error.error.stack && error.error.stack.includes('getOpacityAtLatLng'))
        )) {
          // Silently ignore fog-related errors - they don't affect functionality
          return;
        }
        // Log other errors normally
        console.error('[AIMap] Map error:', error);
      });
      
      // Restore original handlers after map is ready (they were set up before map creation)
      map.current.once('load', () => {
        setTimeout(() => {
          window.console.error = originalError;
          window.onerror = originalWindowError;
        }, 3000);
      });
      
      // Configure fog when style loads (most reliable)
      map.current.once('style.load', () => {
        setTimeout(configureFog, 100);
      });
      
      // Configure fog when map loads
      map.current.once('load', () => {
        setTimeout(configureFog, 100);
      });
      
      // Also try to configure fog after a delay (fallback)
      setTimeout(() => {
        if (map.current && map.current.loaded && map.current.isStyleLoaded()) {
          configureFog();
        }
      }, 1000);

      map.current.on('load', () => {
        console.log('[AIMap] Map loaded successfully');
        setMapInitialized(true);
        
        // Get user location when map loads
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
              };
              setUserLocation(location);
            },
            (error) => {
              console.warn('[AIMap] Geolocation error:', error);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        }
        
        if (onMapReady) {
          onMapReady(map.current);
        }
      });

      // Error handler is already set up above (line 191) to suppress fog errors
      // This handler is for any additional error handling if needed

      // Add navigation controls (zoom, rotate, pitch)
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add geolocate control for user location
      map.current.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }),
        'top-right'
      );
    } catch (error) {
      console.error('[AIMap] Error initializing AI map:', error);
    }
  }, [onMapReady]);

  // Initialize map when visible
  useEffect(() => {
    // Only initialize if visible and container is available
    if (!visible) {
      console.log('[AIMap] Map not visible, skipping initialization');
      return;
    }
    
    if (!mapContainer.current) {
      console.log('[AIMap] Map container not available yet, will retry');
      // Retry after a short delay to allow ref to be set
      const timer = setTimeout(() => {
        if (mapContainer.current && !map.current) {
          initializeMap();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    
    if (map.current) {
      console.log('[AIMap] Map already initialized');
      // If map exists but container was removed from DOM, we need to reattach
      // Check if map's container is still in the DOM
      if (map.current.getContainer() && !document.body.contains(map.current.getContainer())) {
        console.log('[AIMap] Map container was removed from DOM, reinitializing...');
        // Remove old map instance
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
        // Reinitialize
        initializeMap();
      }
      return;
    }
    
    initializeMap();
  }, [visible, initializeMap]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        console.log('[AIMap] Cleaning up map');
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  // Clear all markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }, []);

  // Create radius circle around a point
  const createRadiusCircle = useCallback((center, radiusMeters, mapInstance) => {
    if (!mapInstance || !center || !radiusMeters) return null;

    // Convert radius from meters to degrees (approximate)
    const radiusDegrees = radiusMeters / 111000; // Rough conversion

    // Create circle points
    const points = 64;
    const circle = [];
    for (let i = 0; i <= points; i++) {
      const angle = (i * 360) / points;
      const lat = center[1] + radiusDegrees * Math.cos(angle * Math.PI / 180);
      const lng = center[0] + radiusDegrees * Math.cos(angle * Math.PI / 180) / Math.cos(center[1] * Math.PI / 180);
      circle.push([lng, lat]);
    }
    circle.push(circle[0]); // Close the circle

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [circle]
      }
    };
  }, []);

  // Create wallet markers with distance and navigation
  const createWalletMarkers = useCallback((wallets, mapInstance, userLocation = null) => {
    if (!mapInstance || !wallets || wallets.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    wallets.forEach((wallet, index) => {
      if (!wallet.longitude || !wallet.latitude) return;

      // Calculate distance if user location is available
      let distance = wallet.distance_meters || wallet.distance;
      if (!distance && userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          wallet.latitude,
          wallet.longitude
        );
      }

      const el = document.createElement('div');
      el.className = 'ai-map-marker wallet-marker';
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#1976d2';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      // Create radius circle for this wallet if radius is provided
      if (wallet.radius && wallet.radius > 0) {
        const circleFeature = createRadiusCircle(
          [wallet.longitude, wallet.latitude],
          wallet.radius,
          mapInstance
        );

        if (circleFeature && !mapInstance.getSource(`wallet-radius-${index}`)) {
          mapInstance.addSource(`wallet-radius-${index}`, {
            type: 'geojson',
            data: circleFeature
          });

          mapInstance.addLayer({
            id: `wallet-radius-${index}-fill`,
            type: 'fill',
            source: `wallet-radius-${index}`,
            paint: {
              'fill-color': '#1976d2',
              'fill-opacity': 0.05
            }
          });

          mapInstance.addLayer({
            id: `wallet-radius-${index}-outline`,
            type: 'line',
            source: `wallet-radius-${index}`,
            paint: {
              'line-color': '#1976d2',
              'line-width': 1,
              'line-opacity': 0.3
            }
          });
        }
      }

      const distanceText = distance 
        ? distance < 1000 
          ? `${Math.round(distance)}m` 
          : `${(distance / 1000).toFixed(2)}km`
        : 'Unknown';

      // Create navigation URL
      const navUrl = userLocation 
        ? `https://www.google.com/maps/dir/${userLocation.latitude},${userLocation.longitude}/${wallet.latitude},${wallet.longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${wallet.latitude},${wallet.longitude}`;

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${wallet.organization || 'Wallet'}</h3>
            ${wallet.public_key ? `<p style="margin: 4px 0; font-size: 12px; word-break: break-all;"><strong>Public Key:</strong> ${wallet.public_key.substring(0, 20)}...</p>` : ''}
            ${wallet.blockchain ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Blockchain:</strong> ${wallet.blockchain}</p>` : ''}
            ${wallet.asset_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Asset:</strong> ${wallet.asset_name}</p>` : ''}
            ${distance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${distanceText}</p>` : ''}
            ${userLocation ? `<a href="${navUrl}" target="_blank" style="display: inline-block; margin-top: 8px; padding: 6px 12px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">🗺️ Navigate</a>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([wallet.longitude, wallet.latitude])
        .setPopup(popup)
        .addTo(mapInstance);

      marker._geolinkType = 'wallet';
      markersRef.current.push(marker);
      bounds.extend([wallet.longitude, wallet.latitude]);
      hasBounds = true;
    });

    if (hasBounds && markersRef.current.length > 0) {
      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      });
    } else if (wallets.length > 0 && wallets[0].longitude && wallets[0].latitude) {
      // If only one marker, center on it
      mapInstance.flyTo({
        center: [wallets[0].longitude, wallets[0].latitude],
        zoom: 12,
        duration: 1000
      });
    }
  }, [calculateDistance, createRadiusCircle]);

  // Create NFT markers with distance and navigation
  const createNFTMarkers = useCallback((nfts, mapInstance, userLocation = null) => {
    if (!mapInstance || !nfts || nfts.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    nfts.forEach((nft, index) => {
      if (!nft.longitude || !nft.latitude) return;

      // Calculate distance if user location is available
      let distance = nft.distance_meters || nft.distance;
      if (!distance && userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          nft.latitude,
          nft.longitude
        );
      }

      // Ensure coordinates are numbers (not strings) for accurate positioning
      const lat = parseFloat(nft.latitude);
      const lng = parseFloat(nft.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        return; // Skip invalid coordinates
      }
      
      // Construct image URL using the utility function that handles dynamic IPFS server URLs
      const imageUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/64x64?text=NFT';
      
      // Create marker element - using same approach as contract rule markers (inline styles only, no CSS class)
      const el = document.createElement('div');
      el.style.width = '48px';
      el.style.height = '48px';
      el.style.borderRadius = '8px';
      el.style.backgroundImage = `url('${imageUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.style.border = '3px solid #FFD700';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.overflow = 'hidden';

      // Create radius circle for this NFT if radius is provided
      if (nft.radius && nft.radius > 0) {
        const circleFeature = createRadiusCircle(
          [nft.longitude, nft.latitude],
          nft.radius,
          mapInstance
        );

        if (circleFeature && !mapInstance.getSource(`nft-radius-${index}`)) {
          mapInstance.addSource(`nft-radius-${index}`, {
            type: 'geojson',
            data: circleFeature
          });

          mapInstance.addLayer({
            id: `nft-radius-${index}-fill`,
            type: 'fill',
            source: `nft-radius-${index}`,
            paint: {
              'fill-color': '#FFD700',
              'fill-opacity': 0.05
            }
          });

          mapInstance.addLayer({
            id: `nft-radius-${index}-outline`,
            type: 'line',
            source: `nft-radius-${index}`,
            paint: {
              'line-color': '#FFD700',
              'line-width': 1,
              'line-opacity': 0.3
            }
          });
        }
      }

      const distanceText = distance 
        ? distance < 1000 
          ? `${Math.round(distance)}m` 
          : `${(distance / 1000).toFixed(2)}km`
        : 'Unknown';

      // Create navigation URL
      const navUrl = userLocation 
        ? `https://www.google.com/maps/dir/${userLocation.latitude},${userLocation.longitude}/${nft.latitude},${nft.longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${nft.latitude},${nft.longitude}`;

      // Check if NFT has contract
      const hasContract = nft.contract || nft.custom_contract_id || nft.contract_address;
      const contractInfo = hasContract 
        ? `<p style="margin: 4px 0; font-size: 11px; color: #7B68EE;"><strong>📜 Contract:</strong> ${nft.contract?.name || nft.contract_name || 'Custom Contract'}</p>`
        : '';

      // Create popup with click handler to open details dialog
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">NFT #${nft.id || index + 1}</h3>
            ${nft.name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Name:</strong> ${nft.name}</p>` : ''}
            ${nft.collection_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Collection:</strong> ${nft.collection_name}</p>` : ''}
            ${nft.rarity_level ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Rarity:</strong> ${nft.rarity_level}</p>` : ''}
            ${distance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${distanceText}</p>` : ''}
            ${contractInfo}
            <button 
              id="nft-details-btn-${nft.id || index}" 
              style="display: inline-block; margin-top: 8px; padding: 6px 12px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold; border: none; cursor: pointer; width: 100%;"
            >
              View Details
            </button>
            ${hasContract ? `<button 
              id="nft-contract-btn-${nft.id || index}" 
              style="display: inline-block; margin-top: 4px; padding: 6px 12px; background-color: #7B68EE; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold; border: none; cursor: pointer; width: 100%;"
            >
              📜 View Contract
            </button>` : ''}
            ${userLocation ? `<a href="${navUrl}" target="_blank" style="display: inline-block; margin-top: 4px; padding: 6px 12px; background-color: #FFD700; color: #000; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold; width: 100%; text-align: center;">🗺️ Navigate</a>` : ''}
          </div>
        `);

      // Create marker - matching home page exactly (no anchor specified, uses default 'center')
      // Mapbox automatically handles 3D globe positioning - markers stay at exact coordinates when globe rotates
      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat]) // Use parsed numbers for accurate positioning (matching home page)
        .setPopup(popup)
        .addTo(mapInstance);

      marker._geolinkType = 'nft';
      // Add click event to marker element to show NFT info (matching home page)
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[AIMap] NFT marker clicked:', nft);
        // Prepare NFT data with full_ipfs_url for dialog
        const nftData = {
          ...nft,
          full_ipfs_url: imageUrl || nft.image_url || null,
          nft_name: nft.name,
          nft_description: nft.description,
          collection: nft.collection_name ? { name: nft.collection_name } : null
        };
        setSelectedNFT(nftData);
        setNftDetailsOpen(true);
      });

      // Add click handler to popup content to open details dialog
      popup.on('open', () => {
        const btn = document.getElementById(`nft-details-btn-${nft.id || index}`);
        if (btn) {
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Prepare NFT data with full_ipfs_url for dialog
            const nftData = {
              ...nft,
              full_ipfs_url: imageUrl || nft.image_url || null,
              nft_name: nft.name,
              nft_description: nft.description,
              collection: nft.collection_name ? { name: nft.collection_name } : null
            };
            setSelectedNFT(nftData);
            setNftDetailsOpen(true);
            popup.remove(); // Close popup when opening dialog
          };
        }
        
        // Add contract button handler
        const contractBtn = document.getElementById(`nft-contract-btn-${nft.id || index}`);
        if (contractBtn) {
          contractBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nftData = {
              ...nft,
              contract: nft.contract,
              custom_contract_id: nft.custom_contract_id,
              contract_address: nft.contract_address
            };
            setSelectedContractItem(nftData);
            setContractOverlayOpen(true);
            popup.remove();
          };
        }
      });

      markersRef.current.push(marker);
      bounds.extend([nft.longitude, nft.latitude]);
      hasBounds = true;
    });

    if (hasBounds && markersRef.current.length > 0) {
      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [calculateDistance, createRadiusCircle]);

  // Create Stellar account markers
  const createStellarMarkers = useCallback((accounts, mapInstance) => {
    if (!mapInstance || !accounts || accounts.length === 0) return;

    clearMarkers();

    accounts.forEach((account, index) => {
      if (!account.longitude || !account.latitude) return;

      const el = document.createElement('div');
      el.className = 'ai-map-marker stellar-marker';
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#7B68EE';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      // Check if wallet has contract
      const hasContract = account.contract_id || account.contract_address || account.contract;
      const contractInfo = hasContract 
        ? `<p style="margin: 4px 0; font-size: 11px; color: #7B68EE;"><strong>📜 Contract:</strong> ${account.contract?.name || account.contract_name || 'Custom Contract'}</p>`
        : '';

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">Stellar Account</h3>
            ${account.public_key ? `<p style="margin: 4px 0; font-size: 12px; word-break: break-all;"><strong>Public Key:</strong> ${account.public_key}</p>` : ''}
            ${account.balance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Balance:</strong> ${account.balance} XLM</p>` : ''}
            ${contractInfo}
            ${hasContract ? `<button 
              id="wallet-contract-btn-${account.public_key || index}" 
              style="display: inline-block; margin-top: 8px; padding: 6px 12px; background-color: #7B68EE; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold; border: none; cursor: pointer; width: 100%;"
            >
              📜 View Contract
            </button>` : ''}
          </div>
        `);
      
      // Add contract button handler
      popup.on('open', () => {
        const contractBtn = document.getElementById(`wallet-contract-btn-${account.public_key || index}`);
        if (contractBtn) {
          contractBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const walletData = {
              ...account,
              contract: account.contract,
              contract_id: account.contract_id,
              contract_address: account.contract_address,
              type: 'wallet'
            };
            setSelectedContractItem(walletData);
            setContractOverlayOpen(true);
            popup.remove();
          };
        }
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([account.longitude, account.latitude])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  // Create contract rule markers
  const createContractRuleMarkers = useCallback((rules, mapInstance, userLocation = null) => {
    if (!mapInstance || !rules || rules.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    rules.forEach((rule, index) => {
      if (!rule.longitude || !rule.latitude) return;

      const lat = parseFloat(rule.latitude);
      const lng = parseFloat(rule.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        return;
      }

      // Calculate distance if user location is available
      let distance = rule.distance_meters || rule.distance;
      if (!distance && userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          lat,
          lng
        );
      }

      // Create marker element
      const el = document.createElement('div');
      el.className = 'ai-map-marker contract-rule-marker';
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '8px';
      el.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      el.style.border = '3px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '18px';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.textContent = '📜';

      // Add radius circle if radius is provided
      if (rule.radius_meters) {
        const radius = parseFloat(rule.radius_meters);
        if (!isNaN(radius) && radius > 0) {
          const circleFeature = createRadiusCircle(
            lng,
            lat,
            radius,
            mapInstance
          );

          if (circleFeature && !mapInstance.getSource(`rule-radius-${index}`)) {
            mapInstance.addSource(`rule-radius-${index}`, {
              type: 'geojson',
              data: circleFeature
            });

            mapInstance.addLayer({
              id: `rule-radius-${index}-fill`,
              type: 'fill',
              source: `rule-radius-${index}`,
              paint: {
                'fill-color': '#667eea',
                'fill-opacity': 0.1
              }
            });

            mapInstance.addLayer({
              id: `rule-radius-${index}-outline`,
              type: 'line',
              source: `rule-radius-${index}`,
              paint: {
                'line-color': '#667eea',
                'line-width': 2,
                'line-opacity': 0.5
              }
            });
          }
        }
      }

      const distanceText = distance 
        ? distance < 1000 
          ? `${Math.round(distance)}m` 
          : `${(distance / 1000).toFixed(2)}km`
        : 'Unknown';

      // Create popup with unique ID for button
      const popupId = `contract-rule-popup-${rule.id || index}`;
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #667eea;">📜 ${rule.rule_name || 'Contract Rule'}</h3>
            ${rule.contract_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Contract:</strong> ${rule.contract_name}</p>` : ''}
            ${rule.function_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Function:</strong> ${rule.function_name}</p>` : ''}
            ${rule.trigger_on ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Trigger:</strong> ${rule.trigger_on}</p>` : ''}
            ${rule.radius_meters ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Radius:</strong> ${rule.radius_meters}m</p>` : ''}
            ${rule.auto_execute ? `<p style="margin: 4px 0; font-size: 12px; color: #4caf50;"><strong>Auto-execute:</strong> Enabled</p>` : ''}
            ${distance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${distanceText}</p>` : ''}
            <button id="${popupId}-btn" style="margin-top: 8px; padding: 6px 12px; background-color: #667eea; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;">View Details</button>
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapInstance);

      // Function to open overlay
      const openOverlay = () => {
        const ruleData = {
          ...rule,
          type: 'contract_rule',
          latitude: lat,
          longitude: lng,
          distance: distance,
          distance_meters: distance
        };
        setSelectedContractItem(ruleData);
        setContractOverlayOpen(true);
        popup.remove();
      };

      // Add click handler to marker element
      marker.getElement().addEventListener('click', openOverlay);

      // Add click handler to popup button after popup is opened
      popup.on('open', () => {
        const btn = document.getElementById(`${popupId}-btn`);
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openOverlay();
          });
        }
      });

      marker._geolinkType = 'contract_rule';
      markersRef.current.push(marker);

      if (!hasBounds) {
        bounds.extend([lng, lat]);
        hasBounds = true;
      } else {
        bounds.extend([lng, lat]);
      }
    });

    // Fit bounds to show all contract rule markers
    if (hasBounds && userLocation) {
      bounds.extend([userLocation.longitude, userLocation.latitude]);
    }
    
    if (hasBounds) {
      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [calculateDistance, createRadiusCircle, setSelectedContractItem, setContractOverlayOpen]);

  // Create geofence visualization
  const createGeofenceVisualization = useCallback((geofence, mapInstance) => {
    if (!mapInstance || !geofence) return;

    clearMarkers();

    // Remove existing geofence layers and sources if they exist
    if (mapInstance.getLayer('geofence-fill')) {
      mapInstance.removeLayer('geofence-fill');
    }
    if (mapInstance.getLayer('geofence-outline')) {
      mapInstance.removeLayer('geofence-outline');
    }
    if (mapInstance.getSource('geofence')) {
      mapInstance.removeSource('geofence');
    }

    const polygon = geofence.polygon || geofence;
    
    if (!polygon || !polygon.coordinates || !polygon.coordinates[0]) {
      console.error('Invalid geofence polygon data');
      return;
    }

    // Add geofence as a source
    mapInstance.addSource('geofence', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: polygon
      }
    });

    // Add fill layer
    mapInstance.addLayer({
      id: 'geofence-fill',
      type: 'fill',
      source: 'geofence',
      paint: {
        'fill-color': '#1976d2',
        'fill-opacity': 0.2
      }
    });

    // Add outline layer
    mapInstance.addLayer({
      id: 'geofence-outline',
      type: 'line',
      source: 'geofence',
      paint: {
        'line-color': '#1976d2',
        'line-width': 3,
        'line-opacity': 0.8
      }
    });

    // Calculate bounds from polygon coordinates
    const coordinates = polygon.coordinates[0];
    const bounds = new mapboxgl.LngLatBounds();
    
    coordinates.forEach(coord => {
      bounds.extend([coord[0], coord[1]]);
    });

    // Add center marker
    const center = bounds.getCenter();
    const el = document.createElement('div');
    el.className = 'ai-map-marker geofence-center';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#1976d2';
    el.style.border = '3px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${geofence.name || 'Geofence'}</h3>
          ${geofence.description ? `<p style="margin: 4px 0; font-size: 12px;">${geofence.description}</p>` : ''}
          ${geofence.id ? `<p style="margin: 4px 0; font-size: 12px;"><strong>ID:</strong> ${geofence.id}</p>` : ''}
          ${geofence.blockchain ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Blockchain:</strong> ${geofence.blockchain}</p>` : ''}
        </div>
      `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([center.lng, center.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    markersRef.current.push(marker);

    // Animate zoom to geofence with padding
    mapInstance.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 100, right: 100 },
      maxZoom: 16,
      duration: 2000, // 2 second animation
      easing: (t) => {
        // Ease-in-out cubic function for smooth animation
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
    });
  }, [clearMarkers]);

  // Create user location marker with radius circle
  const createUserLocationMarker = useCallback((location, mapInstance, radius = null) => {
    if (!mapInstance || !location) return;

    const el = document.createElement('div');
    el.className = 'ai-map-marker user-location-marker';
    el.style.width = '32px';
    el.style.height = '32px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#4caf50';
    el.style.border = '4px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.5)';
    el.style.animation = 'pulse 2s infinite';

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 4px 12px rgba(76, 175, 80, 0.5); }
        50% { box-shadow: 0 4px 20px rgba(76, 175, 80, 0.8); }
        100% { box-shadow: 0 4px 12px rgba(76, 175, 80, 0.5); }
      }
    `;
    if (!document.head.querySelector('style[data-user-location-pulse]')) {
      style.setAttribute('data-user-location-pulse', 'true');
      document.head.appendChild(style);
    }

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">📍 Your Location</h3>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Latitude:</strong> ${location.latitude.toFixed(6)}</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Longitude:</strong> ${location.longitude.toFixed(6)}</p>
          ${radius ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Search Radius:</strong> ${(radius / 1000).toFixed(2)} km</p>` : ''}
        </div>
      `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([location.longitude, location.latitude])
      .setPopup(popup)
      .addTo(mapInstance);

    markersRef.current.push(marker);

    // Add radius circle if provided
    if (radius && radius > 0) {
      const circleFeature = createRadiusCircle(
        [location.longitude, location.latitude],
        radius,
        mapInstance
      );

      if (circleFeature) {
        // Remove existing user radius circle if it exists
        if (mapInstance.getLayer('user-radius-fill')) {
          mapInstance.removeLayer('user-radius-fill');
        }
        if (mapInstance.getLayer('user-radius-outline')) {
          mapInstance.removeLayer('user-radius-outline');
        }
        if (mapInstance.getSource('user-radius')) {
          mapInstance.removeSource('user-radius');
        }

        mapInstance.addSource('user-radius', {
          type: 'geojson',
          data: circleFeature
        });

        mapInstance.addLayer({
          id: 'user-radius-fill',
          type: 'fill',
          source: 'user-radius',
          paint: {
            'fill-color': '#4caf50',
            'fill-opacity': 0.1
          }
        });

        mapInstance.addLayer({
          id: 'user-radius-outline',
          type: 'line',
          source: 'user-radius',
          paint: {
            'line-color': '#4caf50',
            'line-width': 2,
            'line-opacity': 0.5
          }
        });
      }
    }

    // Animate zoom to user location
    mapInstance.flyTo({
      center: [location.longitude, location.latitude],
      zoom: radius && radius > 0 ? Math.max(10, 15 - Math.log10(radius / 100)) : 15,
      duration: 1500,
      easing: (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
    });
  }, [createRadiusCircle]);

  // Update map based on mapData
  useEffect(() => {
    console.log('[AIMap] Map data effect triggered:', {
      hasMap: !!map.current,
      mapInitialized,
      hasMapData: !!mapData,
      mapDataType: mapData?.type,
      mapDataKeys: mapData ? Object.keys(mapData) : [],
      dataCount: mapData?.data?.length
    });
    
    if (!map.current || !mapInitialized || !mapData) {
      if (!map.current) console.log('[AIMap] Map not initialized yet');
      if (!mapInitialized) console.log('[AIMap] Map not loaded yet');
      if (!mapData) console.log('[AIMap] No map data provided');
      return;
    }

    const { type, data, center, zoom } = mapData;
    console.log('[AIMap] Processing map data:', { 
      type, 
      dataCount: data?.length, 
      center, 
      zoom,
      dataSample: data?.[0],
      fullMapData: mapData // Log full mapData for debugging
    });
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[AIMap] Map data has no valid data array:', { 
        type, 
        data, 
        mapDataKeys: Object.keys(mapData || {}),
        mapDataFull: mapData // Log full mapData to see what we're getting
      });
      return;
    }

    const userLocation = mapData.userLocation || null;
    const radius = mapData.radius || null;

    switch (type) {
      case 'combined':
        console.log('[AIMap] Creating combined markers (wallets + NFTs + contract rules)');
        clearMarkers();
        
        // Separate wallets, NFTs, and contract rules
        const wallets = data.filter(item => item.type === 'wallet');
        const nfts = data.filter(item => item.type === 'nft');
        const contractRules = data.filter(item => item.type === 'contract_rule');
        
        // Create user location marker first if available
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        
        // Create wallet markers (if filter enabled)
        if (wallets.length > 0 && filters.showWallets) {
          createWalletMarkers(wallets, map.current, userLocation);
        }
        
        // Create NFT markers (if filter enabled)
        if (nfts.length > 0 && filters.showNFTs) {
          createNFTMarkers(nfts, map.current, userLocation);
        }
        
        // Create contract rule markers (if filter enabled)
        if (contractRules.length > 0 && filters.showContractRules) {
          createContractRuleMarkers(contractRules, map.current, userLocation);
        }
        
        // Fit bounds to show all visible markers (respecting filters)
        const visibleItems = [
          ...(filters.showWallets ? wallets : []),
          ...(filters.showNFTs ? nfts : []),
          ...(filters.showContractRules ? contractRules : [])
        ];
        
        if (visibleItems.length > 0 || userLocation) {
          const bounds = new mapboxgl.LngLatBounds();
          visibleItems.forEach(item => {
            if (item.longitude && item.latitude) {
              bounds.extend([item.longitude, item.latitude]);
            }
          });
          if (userLocation) {
            bounds.extend([userLocation.longitude, userLocation.latitude]);
          }
          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, {
              padding: { top: 50, bottom: 50, left: 50, right: 50 },
              maxZoom: 15,
              duration: 1000
            });
          }
        }
        break;
      case 'wallets':
        console.log('[AIMap] Creating wallet markers for type "wallets"');
        console.log('[AIMap] Wallet data array:', data);
        console.log('[AIMap] First wallet sample:', data?.[0]);
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn('[AIMap] No wallet data to display');
          return;
        }
        clearMarkers();
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        if (filters.showWallets) {
          createWalletMarkers(data, map.current, userLocation);
        }
        break;
      case 'nfts':
        clearMarkers();
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        if (filters.showNFTs) {
          createNFTMarkers(data, map.current, userLocation);
        }
        break;
      case 'contract_rules':
        console.log('[AIMap] Creating contract rule markers');
        clearMarkers();
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        if (filters.showContractRules) {
          createContractRuleMarkers(data, map.current, userLocation);
        }
        break;
      case 'stellar_accounts':
        createStellarMarkers(data, map.current);
        break;
      case 'geofence':
        createGeofenceVisualization(data, map.current);
        break;
      case 'user_location':
        if (data && data.length > 0) {
          createUserLocationMarker(data[0], map.current, radius);
        } else if (center) {
          createUserLocationMarker({ latitude: center[1], longitude: center[0] }, map.current, radius);
        }
        break;
      case 'clear':
        clearMarkers();
        // Remove geofence layers if they exist
        if (map.current.getLayer('geofence-fill')) {
          map.current.removeLayer('geofence-fill');
        }
        if (map.current.getLayer('geofence-outline')) {
          map.current.removeLayer('geofence-outline');
        }
        if (map.current.getSource('geofence')) {
          map.current.removeSource('geofence');
        }
        // Remove user radius layers
        if (map.current.getLayer('user-radius-fill')) {
          map.current.removeLayer('user-radius-fill');
        }
        if (map.current.getLayer('user-radius-outline')) {
          map.current.removeLayer('user-radius-outline');
        }
        if (map.current.getSource('user-radius')) {
          map.current.removeSource('user-radius');
        }
        break;
      default:
        if (center && zoom) {
          map.current.flyTo({
            center,
            zoom,
            duration: 1000
          });
        }
    }
  }, [mapData, mapInitialized, filters, createWalletMarkers, createNFTMarkers, createContractRuleMarkers, createStellarMarkers, createGeofenceVisualization, createUserLocationMarker, clearMarkers]);

  useEffect(() => {
    console.log('[AIMap] Visibility changed:', visible);
    
    // When map becomes visible, ensure it's properly displayed
    if (visible && map.current && mapInitialized) {
      // Resize map to ensure it renders correctly
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
          console.log('[AIMap] Map resized after becoming visible');
        }
      }, 100);
    }
  }, [visible, mapInitialized]);

  // Always render the container, but hide it when not visible
  // This ensures the map instance stays attached to the DOM
  console.log('[AIMap] Rendering map container, visible:', visible);

  const handleNFTDetailsClose = () => {
    setNftDetailsOpen(false);
    setSelectedNFT(null);
  };


  // Update location intelligence when map data or proximity changes
  useEffect(() => {
    // Always show location intelligence if map is visible, even without mapData
    if (visible) {
      const intelligence = {
        userLocation: userLocation || null,
        searchRadius: proximityRadius,
        radiusDisplay: proximityRadius >= 20000000 
          ? 'Global' 
          : proximityRadius < 1000 
            ? `${proximityRadius}m` 
            : `${(proximityRadius / 1000).toFixed(1)}km`,
        itemsFound: 0,
        nftsFound: 0,
        walletsFound: 0,
        contractRulesFound: 0
      };

      if (mapData && mapData.data && Array.isArray(mapData.data)) {
        intelligence.itemsFound = mapData.data.length;
        intelligence.nftsFound = mapData.data.filter(item => item.type === 'nft').length;
        intelligence.walletsFound = mapData.data.filter(item => item.type === 'wallet').length;
        intelligence.contractRulesFound = mapData.data.filter(item => item.type === 'contract_rule').length;
      }

      setLocationIntelligence(intelligence);
    } else {
      setLocationIntelligence(null);
    }
  }, [userLocation, mapData, proximityRadius, visible]);

  // Handle proximity radius change
  const handleProximityChange = (newRadius) => {
    setProximityRadius(newRadius);
    // Update context so AI service can use the new radius
    updateContextProximityRadius(newRadius);
    console.log('[AIMap] Proximity radius changed to:', newRadius);
    // Location intelligence will update automatically via useEffect
  };

  // Format radius for display
  const formatRadius = (radius) => {
    if (radius >= 20000000) return 'Global'; // 20,000 km - matches xyz-wallet
    if (radius < 1000) return `${radius}m`;
    return `${(radius / 1000).toFixed(1)}km`;
  };

  return (
    <>
      <Box
        ref={mapContainer}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100vh',
          zIndex: visible ? 9999 : -1, // High z-index to be above all other components when visible
          pointerEvents: visible ? 'auto' : 'none',
          display: visible ? 'block' : 'none', // Hide with display instead of returning null
          backgroundColor: 'transparent'
        }}
      />

      {/* NFT Details Dialog - matching PublicNFTShowcase */}
      {/* Dialog uses Portal by default, rendering at root level */}
      <Dialog
        open={nftDetailsOpen}
        onClose={handleNFTDetailsClose}
        maxWidth="md"
        fullWidth
        sx={{
          // Dialog container z-index (Material-UI default is 1300, we need higher)
          zIndex: 10001, // Above map (9999) and chat (10000)
          '& .MuiBackdrop-root': {
            zIndex: 10000, // Backdrop should be above map but below dialog
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
          },
          '& .MuiDialog-container': {
            zIndex: 10001 // Container should be above backdrop
          },
          '& .MuiDialog-paper': {
            zIndex: 10001, // Paper should be on top
            position: 'relative'
          }
        }}
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: 'linear-gradient(135deg, #f8f9fa, #ffffff)',
            position: 'relative',
            zIndex: 10001 // Ensure dialog content is on top
          }
        }}
        style={{
          zIndex: 10001 // Inline style as fallback
        }}
      >
        {selectedNFT && (
          <>
            <DialogTitle sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              bgcolor: 'primary.main',
              color: 'white'
            }}>
              <Typography variant="h6" component="div">
                🖼️ {selectedNFT.name || selectedNFT.nft_name || 'Unnamed NFT'}
              </Typography>
              <IconButton
                onClick={handleNFTDetailsClose}
                sx={{ color: 'white' }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            
            <DialogContent sx={{ p: 3 }}>
              <Grid container spacing={3}>
                {/* NFT Image */}
                <Grid item xs={12} md={6}>
                  <Box sx={{ 
                    position: 'relative',
                    borderRadius: 2,
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                  }}>
                    {selectedNFT.full_ipfs_url ? (
                      <img
                        src={selectedNFT.full_ipfs_url}
                        alt={selectedNFT.name || 'NFT'}
                        style={{
                          width: '100%',
                          height: '300px',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <Box sx={{
                      display: selectedNFT.full_ipfs_url ? 'none' : 'flex',
                      width: '100%',
                      height: '300px',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      fontSize: '4rem'
                    }}>
                      🖼️
                    </Box>
                  </Box>
                </Grid>

                {/* NFT Details */}
                <Grid item xs={12} md={6}>
                  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
                      {selectedNFT.name || selectedNFT.nft_name || 'Unnamed NFT'}
                    </Typography>
                    
                    <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary', lineHeight: 1.6 }}>
                      {selectedNFT.description || selectedNFT.nft_description || 'No description available'}
                    </Typography>

                    {/* Location Info */}
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'primary.main' }}>
                        📍 Location
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        {Number(selectedNFT.latitude)?.toFixed(6)}, {Number(selectedNFT.longitude)?.toFixed(6)}
                      </Typography>
                    </Box>

                    {/* Collection Info */}
                    {selectedNFT.collection?.name || selectedNFT.collection_name ? (
                      <Box sx={{ mb: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'warning.contrastText' }}>
                          🏷️ Collection
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'warning.contrastText' }}>
                          {selectedNFT.collection?.name || selectedNFT.collection_name}
                        </Typography>
                      </Box>
                    ) : null}

                    {/* Action Buttons */}
                    <Box sx={{ mt: 'auto', display: 'flex', gap: 2 }}>
                      <Button
                        variant="contained"
                        startIcon={<LocationIcon />}
                        onClick={() => {
                          handleNFTDetailsClose();
                          // Zoom to NFT location on map
                          if (map.current && selectedNFT) {
                            map.current.flyTo({
                              center: [Number(selectedNFT.longitude), Number(selectedNFT.latitude)],
                              zoom: 15,
                              duration: 1000
                            });
                          }
                        }}
                        sx={{
                          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                          color: 'black',
                          fontWeight: 'bold',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #FFA500, #FF8C00)',
                          }
                        }}
                      >
                        Zoom to Location
                      </Button>
                      
                      <Button
                        variant="outlined"
                        onClick={handleNFTDetailsClose}
                        sx={{ borderColor: 'primary.main', color: 'primary.main' }}
                      >
                        Close
                      </Button>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Proximity Settings Dialog */}
      <Dialog
        open={proximitySettingsOpen}
        onClose={() => setProximitySettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          zIndex: 10002, // Above map (9999) and location intelligence overlay (10000)
          '& .MuiBackdrop-root': {
            zIndex: 10001 // Backdrop above map but below dialog
          },
          '& .MuiDialog-container': {
            zIndex: 10002
          },
          '& .MuiDialog-paper': {
            zIndex: 10002,
            position: 'relative'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          bgcolor: 'primary.main',
          color: 'white'
        }}>
          <Typography variant="h6">Proximity Settings</Typography>
          <IconButton onClick={() => setProximitySettingsOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Adjust the search radius for nearby NFTs and wallets. A larger radius will show more items globally.
          </Typography>
          
          <Box sx={{ px: 2 }}>
            <Typography gutterBottom>
              Search Radius: <strong>{formatRadius(proximityRadius)}</strong>
            </Typography>
            <Slider
              value={proximityRadius >= 20000000 ? 20000000 : Math.min(proximityRadius, 20000000)}
              onChange={(e, value) => {
                const newRadius = value >= 20000000 ? 20000000 : value;
                handleProximityChange(newRadius);
              }}
              min={100}
              max={20000000}
              step={100}
              marks={[
                { value: 100, label: '100m' },
                { value: 1000, label: '1km' },
                { value: 10000, label: '10km' },
                { value: 100000, label: '100km' },
                { value: 1000000, label: '1000km' },
                { value: 20000000, label: 'Global' }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => formatRadius(value >= 20000000 ? 20000000 : value)}
            />
          </Box>

          <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="body2" color="info.contrastText">
              <strong>Note:</strong> Changing the proximity will refresh the map data. Use "Global" to see all NFTs and wallets worldwide.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Location Intelligence Overlay - Bottom Left */}
      {locationIntelligence && visible && overlayVisible && (
        <Card
          sx={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 10000, // Above map but below dialogs
            minWidth: 280,
            maxWidth: 350,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <InfoIcon sx={{ fontSize: 18 }} />
                Location Intelligence
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={() => setProximitySettingsOpen(true)}
                  sx={{ color: 'primary.main' }}
                  title="Settings"
                >
                  <SettingsIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setOverlayVisible(false)}
                  sx={{ color: 'text.secondary' }}
                  title="Minimize"
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Search Radius:</Typography>
                <Chip 
                  label={locationIntelligence.radiusDisplay} 
                  size="small" 
                  color="primary"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Items Found:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                  {locationIntelligence.itemsFound}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">NFTs:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                  {locationIntelligence.nftsFound}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Wallets:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                  {locationIntelligence.walletsFound}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Contract Rules:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#667eea' }}>
                  {locationIntelligence.contractRulesFound}
                </Typography>
              </Box>
              
              <Divider sx={{ my: 1 }} />
              
              {/* Filter Options */}
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 'bold' }}>
                Filters:
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showWallets}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, showWallets: e.target.checked }));
                    }}
                  />
                }
                label={<Typography variant="caption">Wallets ({locationIntelligence.walletsFound})</Typography>}
                sx={{ mb: 0.5 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showNFTs}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, showNFTs: e.target.checked }));
                    }}
                  />
                }
                label={<Typography variant="caption">NFTs ({locationIntelligence.nftsFound})</Typography>}
                sx={{ mb: 0.5 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.showContractRules}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, showContractRules: e.target.checked }));
                    }}
                  />
                }
                label={<Typography variant="caption" sx={{ color: '#667eea' }}>Contract Rules ({locationIntelligence.contractRulesFound})</Typography>}
              />
              
              {locationIntelligence.userLocation && (
                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Your Location:
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {locationIntelligence.userLocation.latitude.toFixed(4)}, {locationIntelligence.userLocation.longitude.toFixed(4)}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Proximity Settings Button - Top Right (moved down to avoid zoom controls) */}
      {visible && (
        <IconButton
          onClick={() => {
            if (locationIntelligence && !overlayVisible) {
              // If overlay is hidden, show it when clicking settings
              setOverlayVisible(true);
            } else {
              // Otherwise, open settings dialog
              setProximitySettingsOpen(true);
            }
          }}
          sx={{
            position: 'fixed',
            top: 160, // Moved even further down to avoid overlapping with all controls
            right: 16,
            zIndex: 10000,
            backgroundColor: overlayVisible ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.6)',
            color: overlayVisible ? 'inherit' : 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            '&:hover': {
              backgroundColor: overlayVisible ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.8)'
            }
          }}
          size="small"
          title={overlayVisible ? "Open Settings" : "Show Location Intelligence"}
        >
          <SettingsIcon />
        </IconButton>
      )}

      {/* Contract Details Overlay */}
      <ContractDetailsOverlay
        open={contractOverlayOpen}
        onClose={() => {
          setContractOverlayOpen(false);
          setSelectedContractItem(null);
        }}
        item={selectedContractItem}
        itemType={selectedContractItem?.type || 'nft'}
      />
    </>
  );
};

export default AIMap;

