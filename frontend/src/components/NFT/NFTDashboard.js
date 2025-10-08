import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as turf from '@turf/turf';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  CardMedia,
  CardHeader,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
} from '@mui/material';
import {
  ArrowBackIos,
  ArrowForwardIos,
  Add as AddIcon,
  LocationOn as LocationIcon,
  Map as MapIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
  MyLocation as MyLocationIcon,
  Close as CloseIcon,
  AccountBalanceWallet as WalletIcon,
  AccountBalance as StellarIcon,
  Collections as CollectionsIcon,
  GetApp as CollectIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../contexts/WalletContext';
import WalletConnectionDialog from '../Wallet/WalletConnectionDialog';
import LocationSettings from '../LocationSettings';
import api from '../../services/api';

// Mapbox Token - Ensure this is loaded from your .env file
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

// Add CSS styles for stable NFT image markers
const markerStyles = `
  .nft-image-marker {
    width: 60px !important;
    height: 60px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 12px !important;
    border: 3px solid #ffffff !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    overflow: hidden !important;
    transform: none !important;
    transition: none !important;
    will-change: auto !important;
  }
  
  .nft-image-marker img,
  .nft-image-marker div {
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

// Inject styles into the document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = markerStyles;
  document.head.appendChild(styleSheet);
}

// Helper to get rarity color
const getRarityColor = (rarity) => {
  switch (rarity) {
    case 'common': return 'success';
    case 'rare': return 'info';
    case 'legendary': return 'warning';
    default: return 'default';
  }
};

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const NFTDashboard = () => {
  const { user } = useAuth();
  const { wallet, disconnectWallet, isConnected, balance, connectWalletViewOnly } = useWallet();
  const [tabValue, setTabValue] = useState(0);
  const [nearbyNFTs, setNearbyNFTs] = useState([]);
  const [userCollection, setUserCollection] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openNFTDialog, setOpenNFTDialog] = useState(false);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [openMapDialog, setOpenMapDialog] = useState(false);
  const [openWalletDialog, setOpenWalletDialog] = useState(false);
  const [openLocationSettings, setOpenLocationSettings] = useState(false);
  const [openPinDialog, setOpenPinDialog] = useState(false);
  const [pinLocation, setPinLocation] = useState(null);
  const [autoDetectingLocation, setAutoDetectingLocation] = useState(false);
  const [pinForm, setPinForm] = useState({
    name: '',
    description: '',
    ipfs_hash: '',
    radius_meters: 10,
    collection_id: '',
    address: '',
    latitude: null,
    longitude: null,
    smart_contract_address: ''
  });
  const [pinMarker, setPinMarker] = useState(null);
  const [pinMarkerLocked, setPinMarkerLocked] = useState(false);
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const [pinMarkerProtected, setPinMarkerProtected] = useState(false);
  const [addedRadiusCircles, setAddedRadiusCircles] = useState(new Set());
  const [geocoding, setGeocoding] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [collectionFetched, setCollectionFetched] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [mapView, setMapView] = useState('3d'); // '2d', '3d', 'satellite'
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedRarity, setSelectedRarity] = useState('');
  const [radiusFilter, setRadiusFilter] = useState(1000);
  // Clustering removed - individual markers only
  const [markerUpdateTimeout, setMarkerUpdateTimeout] = useState(null);
  const [isUserMovingMap, setIsUserMovingMap] = useState(false);
  const [markersStable, setMarkersStable] = useState(false);
  const [markersCreated, setMarkersCreated] = useState(false);
  const [markersLocked, setMarkersLocked] = useState(false);
  const [markersNeverUpdate, setMarkersNeverUpdate] = useState(false);
  const [showPinSuccess, setShowPinSuccess] = useState(false);
  const requestCooldown = 3000; // 3 seconds cooldown between requests
  // Trigger new deployment - ESLint errors fixed, ready for production build
  const mapContainer = useRef(null);
  const overlayMapContainer = useRef(null);
  const map = useRef(null);
  const overlayMap = useRef(null);
  const markers = useRef({});
  const overlayMarkers = useRef({});
  const currentMarkers = useRef({});

  // Function definitions (moved before useEffect to avoid hoisting issues)
  const fetchUserCollection = useCallback(async () => {
    if (!isConnected || collectionFetched) return;
    
    console.log('Fetching user collection...');
    setCollectionFetched(true);
    setLoading(true);
    try {
      const response = await api.get('/nft/user-collection');
      console.log('User collection response:', response.data);
      
      // Handle the actual API response structure
      const collectionArray = response.data.collection || response.data || [];
      const collectionData = collectionArray.map(item => {
        const nftData = item.nft || item;
        const collectionData = nftData.collection || {};
        return {
          ...nftData,
          full_ipfs_url: nftData.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nftData.ipfs_hash}` : null,
          collection: {
            ...collectionData,
            full_image_url: collectionData.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${collectionData.image_url}` : null
          }
        };
      });
      
      setUserCollection(collectionData);
      console.log('User collection updated:', collectionData.length, 'NFTs');
    } catch (err) {
      console.error('Error fetching user collection:', err);
      setError('Failed to fetch your NFT collection.');
      // Set empty collection on error
      setUserCollection([]);
    } finally {
      setLoading(false);
    }
  }, [isConnected, collectionFetched]);

  const fetchNearbyNFTs = useCallback(async () => {
    if (!userLocation || requestInProgress) {
      if (!userLocation) {
        setError('Location not available. Please enable location services.');
      }
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastRequestTime < requestCooldown) {
      console.log('Request too soon, skipping...');
      return;
    }

    setRequestInProgress(true);
    setLastRequestTime(now);
    setError('');
    setLoading(true);
    setMapLoading(true);
    try {
      console.log('Fetching ALL NFTs globally with location:', userLocation);
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radius: 999999999 // Very large radius to get ALL NFTs globally
        }
      });
      
      console.log('Nearby NFTs API response:', response.data);
      
      // Process the NFTs to add full IPFS URLs
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
        collection: {
          ...nft.collection,
          full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
        }
      }));
      
      console.log('Processed NFTs:', processedNFTs);
      setNearbyNFTs(processedNFTs);
    } catch (err) {
      console.error('Error fetching nearby NFTs:', err);
      setError('Failed to fetch nearby NFTs.');
    } finally {
      setRequestInProgress(false);
      setLoading(false);
      setMapLoading(false);
    }
  }, [userLocation, requestInProgress, lastRequestTime, requestCooldown]);

  const fetchNearbyNFTsWithLocation = useCallback(async (location) => {
    if (!location || requestInProgress) {
      if (!location) {
        setError('Location not available. Please enable location services.');
      }
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastRequestTime < requestCooldown) {
      console.log('Request too soon, skipping...');
      return;
    }

    setRequestInProgress(true);
    setLastRequestTime(now);
    setError('');
    try {
      console.log('Fetching ALL NFTs globally with provided location:', location);
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          radius: 999999999 // Very large radius to get ALL NFTs globally
        }
      });
      
      console.log('Nearby NFTs API response (with location):', response.data);
      
      // Process the NFTs to add full IPFS URLs
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
        collection: {
          ...nft.collection,
          full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
        }
      }));
      
      console.log('Processed NFTs (with location):', processedNFTs);
      setNearbyNFTs(processedNFTs);
    } catch (err) {
      console.error('Error fetching nearby NFTs:', err);
      setError('Failed to fetch nearby NFTs.');
    } finally {
      setRequestInProgress(false);
    }
  }, [requestInProgress, lastRequestTime, requestCooldown]);

  // Debounced marker update to prevent excessive updates
  const debouncedUpdateMarkers = useCallback((mapType = 'main') => {
    // Clear existing timeout
    if (markerUpdateTimeout) {
      clearTimeout(markerUpdateTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      updateMapMarkers(mapType);
      setMarkerUpdateTimeout(null);
    }, 500); // 500ms debounce
    
    setMarkerUpdateTimeout(timeout);
  }, [markerUpdateTimeout]);

  // Helper function to calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  // Helper function to clear all radius circles
  const clearAllRadiusCircles = (map) => {
    try {
      // Get all sources and layers
      const style = map.getStyle();
      if (style && style.layers) {
        // Remove layers first (in reverse order)
        style.layers.forEach(layer => {
          if (layer.id.startsWith('radius-circle-')) {
            try {
              if (map.getLayer(layer.id)) {
                map.removeLayer(layer.id);
              }
            } catch (error) {
              console.log(`Layer ${layer.id} already removed or doesn't exist`);
            }
          }
        });
      }
      
      if (style && style.sources) {
        // Then remove sources
        Object.keys(style.sources).forEach(sourceId => {
          if (sourceId.startsWith('radius-circle-')) {
            try {
              if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
              }
            } catch (error) {
              console.log(`Source ${sourceId} already removed or doesn't exist`);
            }
          }
        });
      }
      
      // Clear tracking set
      setAddedRadiusCircles(new Set());
      
      console.log('✅ All radius circles cleared');
    } catch (error) {
      console.error('Error clearing radius circles:', error);
    }
  };

  // Helper function to add radius circle to map
  const addRadiusCircle = (map, lng, lat, radiusMeters) => {
    try {
      const radiusKm = radiusMeters / 1000;
      
      // Create circle source
      const circleId = `radius-circle-${lng}-${lat}`;
      const strokeId = `${circleId}-stroke`;
      
      // Check if already added
      if (addedRadiusCircles.has(circleId)) {
        console.log(`⏭️ Radius circle already exists for ${lat}, ${lng}`);
        return;
      }
      
      // Remove existing layers first (in reverse order)
      if (map.getLayer(strokeId)) {
        map.removeLayer(strokeId);
      }
      if (map.getLayer(circleId)) {
        map.removeLayer(circleId);
      }
      
      // Remove existing source
      if (map.getSource(circleId)) {
        map.removeSource(circleId);
      }
      
      // Wait a bit to ensure cleanup is complete
      setTimeout(() => {
        try {
          // Create circle geometry using turf.js
          const circle = turf.circle([lng, lat], radiusKm, { steps: 64, units: 'kilometers' });
          
          // Add source
          map.addSource(circleId, {
            type: 'geojson',
            data: circle
          });
          
          // Add fill layer
          map.addLayer({
            id: circleId,
            type: 'fill',
            source: circleId,
            paint: {
              'fill-color': '#ff0000',
              'fill-opacity': 0.1
            }
          });
          
          // Add stroke layer
          map.addLayer({
            id: strokeId,
            type: 'line',
            source: circleId,
            paint: {
              'line-color': '#ff0000',
              'line-width': 2,
              'line-opacity': 0.8
            }
          });
          
          // Track this circle
          setAddedRadiusCircles(prev => new Set([...prev, circleId]));
          
          console.log(`✅ Radius circle added for NFT at ${lat}, ${lng} with radius ${radiusMeters}m`);
        } catch (innerError) {
          console.error('Error in radius circle creation:', innerError);
        }
      }, 100); // Small delay to ensure cleanup is complete
      
    } catch (error) {
      console.error('Error adding radius circle:', error);
      // Don't throw error, just log it
    }
  };

  const updateMapMarkers = useCallback((mapType = 'main', forceUpdate = false) => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    const currentMarkers = mapType === 'overlay' ? overlayMarkers : markers;
    
    console.log(`updateMapMarkers called: mapType=${mapType}, forceUpdate=${forceUpdate}, markersCreated=${markersCreated}, markersLocked=${markersLocked}`);
    console.log(`Pin marker protected: ${pinMarkerProtected}, pin marker exists: ${!!pinMarker}`);
    
    // ULTRA-PROTECTION: Don't update markers if pin marker is protected
    if (pinMarkerProtected && pinMarker) {
      console.log('🚨 PIN MARKER IS PROTECTED - SKIPPING ALL MARKER UPDATES');
      return;
    }
    
    if (!currentMap.current) {
      console.warn('Map not initialized, cannot add markers');
      return;
    }

    // AGGRESSIVE: Prevent updates unless explicitly forced OR initial load
    if (!forceUpdate && markersCreated) {
      console.log('Marker updates disabled - markers are locked to coordinates');
      return;
    }
    
    // ULTRA-AGGRESSIVE: Prevent updates if markers are locked (but allow initial creation)
    if (markersLocked && !forceUpdate && markersCreated) {
      console.log('Markers are locked to coordinates - no updates allowed');
      return;
    }
    
    // ZOOM-PROOF: Prevent any updates during zoom operations
    if (isUserMovingMap && !forceUpdate) {
      console.log('User is interacting with map - no marker updates allowed');
      return;
    }
    
    // NEVER UPDATE: Once markers are created, never update them
    if (markersNeverUpdate && !forceUpdate) {
      console.log('Markers are set to never update - no changes allowed');
      return;
    }

    // Prevent multiple simultaneous marker updates
    if (mapLoading) {
      console.log('Map is already loading markers, skipping...');
      return;
    }
    
    // Additional check to prevent excessive updates
    if (currentMap.current._isUpdatingMarkers) {
      console.log('Map is already updating markers, skipping...');
      return;
    }
    
    // Skip updates if markers are already created and stable
    if (markersCreated && markersStable && !forceUpdate) {
      console.log('Markers already created and stable, skipping update...');
      return;
    }
    
    // Set flag to prevent concurrent updates
    currentMap.current._isUpdatingMarkers = true;
    
    // Get current map bounds for visibility checking
    const mapBounds = currentMap.current.getBounds();
    const mapCenter = currentMap.current.getCenter();
    const currentZoom = currentMap.current.getZoom();
    
    console.log('Map bounds:', mapBounds);
    console.log('Map center:', mapCenter);
    console.log('Current zoom:', currentZoom);
    
    try {
    
    // Ensure map is loaded before adding markers
    if (!currentMap.current.isStyleLoaded()) {
      console.log('Map style not loaded, waiting...');
      setMapLoading(true);
      
      // Use a longer timeout and better retry logic
      const checkStyleLoaded = (attempt = 1) => {
        if (currentMap.current && currentMap.current.isStyleLoaded()) {
          console.log('Style loaded on retry, updating markers...');
          setMapLoading(false);
          updateMapMarkers(mapType);
        } else if (attempt < 5) {
          console.log(`Style not ready, retrying in ${attempt * 500}ms...`);
          setTimeout(() => checkStyleLoaded(attempt + 1), attempt * 500);
        } else {
          console.warn('Style still not loaded after multiple attempts, proceeding anyway');
          setMapLoading(false);
          updateMapMarkers(mapType);
        }
      };
      
      setTimeout(() => checkStyleLoaded(), 1000);
      return;
    }

    // Only clear markers if we're actually recreating them and they're not locked
    if ((forceUpdate || !markersCreated || Object.keys(currentMarkers.current).length === 0) && !markersLocked) {
      // Clear all markers except recently updated ones
      const now = Date.now();
      Object.entries(currentMarkers.current).forEach(([key, marker]) => {
        if (marker._lastUpdated && (now - marker._lastUpdated) < 5000) {
          console.log(`Preserving recently updated marker: ${key}`);
          return;
        }
        marker.remove();
      });
      
      // Clean up the currentMarkers object
      const recentMarkers = {};
      Object.entries(currentMarkers.current).forEach(([key, marker]) => {
        if (marker._lastUpdated && (now - marker._lastUpdated) < 5000) {
          recentMarkers[key] = marker;
        }
      });
      currentMarkers.current = recentMarkers;
    }
    
    // No radius circles - removed to prevent flickering
    
    // Pin marker is stored separately and should not be affected by NFT marker updates
    console.log('NFT markers cleared, pin marker preserved');
    console.log('Pin marker protected:', pinMarkerProtected);
    console.log('Pin marker exists:', !!pinMarker);
    
    // Debug: Check map center and bounds
    const mapCenter = currentMap.current.getCenter();
    const mapBounds = currentMap.current.getBounds();
    console.log('Map center:', mapCenter);
    console.log('Map bounds:', mapBounds);
    console.log('Number of NFTs to place:', nearbyNFTs.length);
      console.log('Nearby NFTs data:', nearbyNFTs);

      // Create markers with zoom-based clustering
      const currentZoom = currentMap.current.getZoom();
      const clusterThreshold = 10; // Zoom level below which to cluster (higher = more clustering)
      
      console.log(`Creating markers for ${nearbyNFTs.length} NFTs with zoom-based clustering (zoom: ${currentZoom.toFixed(2)})`);
      
      // Check if markers are already created and prevent recreation
      if (markersCreated && Object.keys(currentMarkers.current).length > 0 && !forceUpdate) {
        console.log('🚫 Markers already exist, preventing recreation');
        return;
      }
      
      // Prevent recreation if markers are locked or stable
      if (markersLocked || markersStable || markersNeverUpdate) {
        console.log('🚫 Markers are locked/stable, preventing recreation');
        return;
      }
      
      // Prevent recreation if any marker is being dragged
      const isDragging = Object.values(currentMarkers.current).some(marker => 
        marker._isDragging || marker._dragStart
      );
      if (isDragging) {
        console.log('🚫 Marker is being dragged, preventing recreation');
        return;
      }
      
      // Prevent recreation if markers were recently updated (within last 5 seconds)
      const now = Date.now();
      const recentlyUpdated = Object.values(currentMarkers.current).some(marker => 
        marker._lastUpdated && (now - marker._lastUpdated) < 5000
      );
      if (recentlyUpdated) {
        console.log('🚫 Markers were recently updated, preventing recreation');
        return;
      }
      
      if (currentZoom < clusterThreshold) {
        // Create clusters when zoomed out
        console.log('🔍 Zoomed out - creating clusters');
        createClusters(nearbyNFTs, currentMap.current);
      } else {
        // Create individual markers when zoomed in
        console.log('🔍 Zoomed in - creating individual markers');
        createIndividualMarkers(nearbyNFTs, currentMap.current);
      }
      
      // Mark markers as created to prevent recreation
      setMarkersCreated(true);
      setMarkersLocked(true);
      setMarkersStable(true);
    } catch (error) {
      console.error('Error in updateMapMarkers:', error);
    } finally {
      // Always clear the loading flag
      if (currentMap.current) {
        currentMap.current._isUpdatingMarkers = false;
      }
      setLoading(false);
      setMapLoading(false);
    }
  }, [nearbyNFTs, userLocation, map, overlayMap, markers, overlayMarkers, markersCreated, markersLocked, markersStable, isUserMovingMap, markersNeverUpdate, pinMarkerProtected, pinMarker]);

  // Function to create clusters when zoomed out
  const createClusters = (nfts, map) => {
    const clusterDistance = 0.1; // ~11km at equator - much larger distance for proper clustering
    const clusters = [];
    
    console.log(`Creating clusters for ${nfts.length} NFTs with distance threshold: ${clusterDistance}`);
    
    nfts.forEach(nft => {
      const nftLng = parseFloat(nft.longitude);
      const nftLat = parseFloat(nft.latitude);
      
      // Find existing cluster or create new one
      let assignedCluster = null;
      for (const cluster of clusters) {
        const clusterLng = cluster.centerLng;
        const clusterLat = cluster.centerLat;
        const distance = Math.sqrt(
          Math.pow(nftLng - clusterLng, 2) + Math.pow(nftLat - clusterLat, 2)
        );
        
        if (distance < clusterDistance) {
          assignedCluster = cluster;
          break;
        }
      }
      
      if (assignedCluster) {
        assignedCluster.nfts.push(nft);
        // Update cluster center to be the average of all NFTs in the cluster
        const totalLng = assignedCluster.nfts.reduce((sum, n) => sum + parseFloat(n.longitude), 0);
        const totalLat = assignedCluster.nfts.reduce((sum, n) => sum + parseFloat(n.latitude), 0);
        assignedCluster.centerLng = totalLng / assignedCluster.nfts.length;
        assignedCluster.centerLat = totalLat / assignedCluster.nfts.length;
      } else {
        clusters.push({
          centerLng: nftLng,
          centerLat: nftLat,
          nfts: [nft]
        });
      }
    });
    
    console.log(`Created ${clusters.length} clusters:`, clusters.map(c => ({ count: c.nfts.length, center: [c.centerLng, c.centerLat] })));
    
    // Create cluster markers - only if they don't already exist
    clusters.forEach((cluster, clusterIndex) => {
      const clusterId = `cluster-${clusterIndex}`;
      
      // Check if cluster marker already exists
      if (currentMarkers.current[clusterId]) {
        console.log(`Cluster marker ${clusterId} already exists, skipping creation`);
        return;
      }
      
      if (cluster.nfts.length === 1) {
        // Single NFT - create individual marker
        createSingleMarker(cluster.nfts[0], map);
      } else {
        // Multiple NFTs - create cluster marker
        createClusterMarker(cluster, map, clusterIndex);
      }
    });
  };

  // Function to create individual markers when zoomed in
  const createIndividualMarkers = (nfts, map) => {
    nfts.forEach((nft, nftIndex) => {
      createSingleMarker(nft, map, nftIndex);
    });
  };

  // Function to create a single NFT marker
  const createSingleMarker = (nft, map, nftIndex = 0) => {
    try {
      // Check if marker already exists
      if (currentMarkers.current[nft.id]) {
        console.log(`Marker for NFT ${nft.id} already exists, skipping creation`);
        return;
      }

      // Ensure we have valid base coordinates first
      if (!nft.longitude || !nft.latitude || 
          isNaN(nft.longitude) || isNaN(nft.latitude) ||
          !isFinite(nft.longitude) || !isFinite(nft.latitude)) {
        console.warn('Invalid base coordinates for NFT:', nft.id, 'Skipping marker creation.');
        return;
      }

      // Use exact coordinates with tiny visual offset to prevent stacking
      const baseLng = parseFloat(nft.longitude);
      const baseLat = parseFloat(nft.latitude);
      
      // Add tiny random offset (0.0001 degrees = ~11 meters) to prevent visual stacking
      const offsetLng = (Math.random() - 0.5) * 0.0002; // ±0.0001 degrees
      const offsetLat = (Math.random() - 0.5) * 0.0002; // ±0.0001 degrees
      
      const finalLng = baseLng + offsetLng;
      const finalLat = baseLat + offsetLat;
        
        // Final validation of coordinates
      if (isNaN(finalLat) || isNaN(finalLng) || !isFinite(finalLat) || !isFinite(finalLng)) {
          console.warn('Invalid coordinates for NFT:', nft.id, 'Skipping marker creation.');
          return;
        }
        
        // Check if coordinates are in a reasonable range
      if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) {
        console.warn(`Invalid coordinate range for NFT ${nft.id}:`, { lat: finalLat, lng: finalLng });
          return;
        }

      // Create simple square element for NFT marker
          const el = document.createElement('div');
      el.className = 'nft-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.borderRadius = '8px'; // Square with rounded corners
      el.style.border = '3px solid #fff';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '12px';
      el.style.fontWeight = 'bold';
      el.style.color = '#fff';
      el.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          el.style.position = 'relative';
          el.style.zIndex = '1000';
          
      // Add NFT image if available
      if (nft.ipfs_hash) {
        const img = document.createElement('img');
        img.src = `https://ipfs.io/ipfs/${nft.ipfs_hash}`;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '8px'; // Square with rounded corners
        img.style.objectFit = 'cover';
        img.onerror = () => {
          console.log('Image failed to load:', this.src);
          el.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)';
          el.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
        };
        el.appendChild(img);
          } else {
        el.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
          }

          // Add click handler to show NFT details
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Update carousel index to show this NFT
            const nftIndex = nearbyNFTs.findIndex(n => n.id === nft.id);
            if (nftIndex !== -1) {
              setCarouselIndex(nftIndex);
              setSelectedNFT(nft);
              setOpenDetailsDialog(true);
            }
          });

      // Create marker at exact coordinates
          const marker = new Mapboxgl.Marker({
            element: el,
        draggable: true
      })
      .setLngLat([finalLng, finalLat])
      .addTo(map);

      // Add drag functionality for existing NFTs
      marker.on('dragstart', () => {
        console.log('Started dragging NFT marker:', nft.id);
        el.style.transform = 'scale(1.2)';
        el.style.zIndex = '2000';
      });

      marker.on('dragstart', () => {
        marker._isDragging = true;
        console.log(`Started dragging NFT ${nft.id}`);
      });

      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat();
        console.log(`Dragging NFT ${nft.id} to:`, { lng, lat });
      });

      marker.on('dragend', async () => {
        marker._isDragging = false;
        const { lng, lat } = marker.getLngLat();
        console.log(`Finished dragging NFT ${nft.id} to:`, { lng, lat });
        
        // Reset visual state
        el.style.transform = 'scale(1)';
        el.style.zIndex = '1000';
        
        try {
          // Update NFT coordinates in database with exact coordinates (no offset)
          const response = await api.put(`/nft/pinned/${nft.id}`, {
            latitude: lat,
            longitude: lng
          });
          console.log('NFT coordinates updated:', response.data);
          setSuccess(`NFT "${nft.name || nft.id}" moved to ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          
          // Update the NFT data in the nearbyNFTs array to reflect the new coordinates
          const nftIndex = nearbyNFTs.findIndex(n => n.id === nft.id);
          if (nftIndex !== -1) {
            nearbyNFTs[nftIndex].latitude = lat;
            nearbyNFTs[nftIndex].longitude = lng;
            console.log(`Updated NFT ${nft.id} coordinates in local data:`, { lat, lng });
          }
          
          // Lock markers to prevent recreation after drag
          setMarkersLocked(true);
          setMarkersStable(true);
          setMarkersCreated(true);
          
          // Mark this marker as recently updated
          marker._lastUpdated = Date.now();
          
        } catch (error) {
          console.error('Error updating NFT coordinates:', error);
          setError('Failed to update NFT location');
        }
      });

      // Store marker reference
          currentMarkers.current[nft.id] = marker;
      
      console.log(`NFT image marker created for NFT ${nft.id} at:`, [finalLng, finalLat]);
        } catch (error) {
      console.error(`Error processing NFT ${nft.id}:`, error);
    }
  };

  // Function to create a cluster marker
  const createClusterMarker = (cluster, map, clusterIndex) => {
    try {
      const clusterId = `cluster-${clusterIndex}`;
      
      // Double-check if cluster marker already exists
      if (currentMarkers.current[clusterId]) {
        console.log(`Cluster marker ${clusterId} already exists, skipping creation`);
        return;
      }
      
      // Create cluster element
      const el = document.createElement('div');
      el.className = 'cluster-marker';
      el.style.width = '50px';
      el.style.height = '50px';
      el.style.borderRadius = '50%';
      el.style.border = '4px solid #fff';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '16px';
      el.style.fontWeight = 'bold';
      el.style.color = '#fff';
      el.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)';
      el.style.position = 'relative';
      el.style.zIndex = '1000';
      
      // Add count number
      el.innerHTML = cluster.nfts.length;
      
      // Add click handler to zoom in
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Zoom in to the cluster area
        map.flyTo({
          center: [cluster.centerLng, cluster.centerLat],
          zoom: 12,
          duration: 1000
        });
      });

      // Create cluster marker
      const marker = new Mapboxgl.Marker({
        element: el,
        draggable: false
      })
      .setLngLat([cluster.centerLng, cluster.centerLat])
      .addTo(map);

      // Store cluster marker reference
      currentMarkers.current[clusterId] = marker;
      
      console.log(`Cluster marker created for ${cluster.nfts.length} NFTs at:`, [cluster.centerLng, cluster.centerLat]);
    } catch (error) {
      console.error(`Error creating cluster ${clusterIndex}:`, error);
    }
  };

  // Add zoom event listener to update markers when zoom changes
  const addZoomListener = (map) => {
    if (map && !map._zoomListenerAdded) {
      map.on('zoomend', () => {
        const currentZoom = map.getZoom();
        const clusterThreshold = 10;
        
        // Only update if zoom level crosses the clustering threshold
        const shouldCluster = currentZoom < clusterThreshold;
        const wasClustering = Object.keys(currentMarkers.current).some(key => key.startsWith('cluster-'));
        
        if (shouldCluster !== wasClustering) {
          // Check if any markers were recently updated
          const now = Date.now();
          const recentlyUpdated = Object.values(currentMarkers.current).some(marker => 
            marker._lastUpdated && (now - marker._lastUpdated) < 5000
          );
          
          if (recentlyUpdated) {
            console.log('🚫 Markers were recently updated, skipping zoom-based recreation');
            return;
          }
          
          console.log(`Zoom changed from ${wasClustering ? 'clustering' : 'individual'} to ${shouldCluster ? 'clustering' : 'individual'} mode`);
          // Clear existing markers and recreate based on new zoom level
          Object.values(currentMarkers.current).forEach(marker => marker.remove());
          currentMarkers.current = {};
          
          // Reset marker states to allow recreation
          setMarkersCreated(false);
          setMarkersLocked(false);
          setMarkersStable(false);
          setMarkersNeverUpdate(false);
          
          // Recreate markers with new zoom level
          updateMapMarkers('main', true);
        } else {
          console.log('Zoom changed but clustering mode unchanged, keeping existing markers');
        }
      });
      map._zoomListenerAdded = true;
    }
  };

  const initializeMap = useCallback((container, mapType) => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    
    if (currentMap.current) {
      console.log('Map already initialized for', mapType);
      return;
    }

    console.log('Initializing map for', mapType, 'with container:', container);

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      setError('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      return;
    }

    // Start with globe view (zoom level 1) and animate to user location
    const initialCenter = userLocation ? [userLocation.longitude, userLocation.latitude] : [0, 0]; // Center of globe
    const initialZoom = 1; // Always start with globe view
    const initialPitch = 0; // Start flat, then tilt to 3D
    const initialBearing = 0;

    try {
      currentMap.current = new Mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/satellite-streets-v12', // Satellite with streets
        center: initialCenter,
        zoom: initialZoom,
        pitch: initialPitch,
        bearing: initialBearing,
        projection: 'globe', // Enable globe projection
        antialias: true, // Enable antialiasing for better 3D rendering
        optimizeForTerrain: true // Optimize for 3D terrain
      });

      console.log('Map created for', mapType);

      currentMap.current.on('load', () => {
        console.log('Map loaded for', mapType);
        
        // Add navigation control with enhanced options
        currentMap.current.addControl(new Mapboxgl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true
        }), 'top-right');

        // Add scale control
        currentMap.current.addControl(new Mapboxgl.ScaleControl({
          maxWidth: 100,
          unit: 'metric'
        }), 'bottom-left');

        // Add geolocate control
        currentMap.current.addControl(new Mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }), 'top-right');

        // Add fullscreen control
          currentMap.current.addControl(new Mapboxgl.FullscreenControl(), 'top-right');

        // Add custom NFT filter control
        const nftFilterControl = createNFTFilterControl();
        currentMap.current.addControl(nftFilterControl, 'top-left');

        // Add zoom listener for clustering
        addZoomListener(currentMap.current);

        // Add 3D buildings layer
        try {
          if (currentMap.current.getSource('composite') && currentMap.current.getLayer('building')) {
            currentMap.current.addLayer({
              id: '3d-buildings',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 15,
              paint: {
                'fill-extrusion-color': '#aaa',
                'fill-extrusion-height': [
                  'case',
                  ['has', 'height'],
                  ['get', 'height'],
                  0
                ],
                'fill-extrusion-base': [
                  'case',
                  ['has', 'min_height'],
                  ['get', 'min_height'],
                  0
                ],
                'fill-extrusion-opacity': 0.6
              }
            });
            console.log('3D buildings layer added');
          }
        } catch (error) {
          console.log('Could not add 3D buildings layer:', error.message);
        }

        // DISABLED: Zoom-based marker updates to prevent infinite loops
        // TODO: Implement manual clustering control instead
        console.log('Zoom-based marker updates disabled to prevent infinite loops');
        
        // Track user map movement to prevent marker updates during user interaction
        currentMap.current.on('movestart', () => {
          setIsUserMovingMap(true);
          setMarkersStable(false); // Reset stability when user starts moving
          console.log('User started moving map - markers no longer stable');
          if (pinMarkerProtected && pinMarker) {
            console.log('🚨 PIN MARKER IS PROTECTED - IGNORING MAP MOVEMENT');
          }
        });
        
        currentMap.current.on('moveend', () => {
          setIsUserMovingMap(false);
          console.log('User finished moving map - markers remain locked to coordinates');
          // Markers stay locked to their exact coordinates - no updates
        });
        
        // PREVENT ALL ZOOM-BASED UPDATES
        currentMap.current.on('zoomstart', () => {
          console.log('Zoom started - preventing marker updates');
          setIsUserMovingMap(true);
          setMarkersStable(false);
          if (pinMarkerProtected && pinMarker) {
            console.log('🚨 PIN MARKER IS PROTECTED - IGNORING ZOOM START');
          }
        });
        
        currentMap.current.on('zoomend', () => {
          console.log('Zoom ended - markers remain locked to coordinates');
          setIsUserMovingMap(false);
          // NO marker updates on zoom - markers stay at exact coordinates
          if (pinMarkerProtected && pinMarker) {
            console.log('🚨 PIN MARKER IS PROTECTED - IGNORING ZOOM END');
        }
      });

      // Handle map errors
      currentMap.current.on('error', (e) => {
        console.error('Map error for', mapType, ':', e);
          setError(`Map error: ${e.error?.message || 'Unknown error'}`);
        });

        // Set style loaded flag after a delay
        setTimeout(() => {
          console.log('Style loaded via timeout for', mapType);
          if (nearbyNFTs.length > 0) {
            console.log('Updating markers for', nearbyNFTs.length, 'NFTs');
            if (mapType === 'main') {
              console.log('Updating main map markers...');
              updateMapMarkers(mapType, true); // Force initial creation
            }
            if (mapType === 'overlay') {
              console.log('Updating overlay map markers...');
              updateMapMarkers(mapType, true); // Force initial creation
            }
          }
        }, 1000);
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setError(`Failed to initialize map: ${error.message}`);
    }
  }, [userLocation, nearbyNFTs, updateMapMarkers]);


  useEffect(() => {
    if (user && user.role !== 'nft_manager' && user.role !== 'admin') {
      setError('You do not have permission to view this dashboard.');
      setLoading(false);
      return;
    }
    
    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000); // 5 second timeout
    
    // Only fetch data if wallet is connected and not already in progress
    if (isConnected && wallet?.publicKey && !requestInProgress && !loading) {
      // Add a small delay to prevent rapid calls
      const fetchTimeout = setTimeout(() => {
        fetchUserCollection();
      }, 500); // Increased delay to 500ms
      
      return () => {
        clearTimeout(timeout);
        clearTimeout(fetchTimeout);
      };
    }
    
    return () => clearTimeout(timeout);
  }, [user, isConnected, wallet?.publicKey, fetchUserCollection, loading, requestInProgress]);

  // Reset collection fetched flag when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setCollectionFetched(false);
    }
  }, [isConnected]);

  // Fetch user collection when wallet connects
  useEffect(() => {
    if (isConnected && wallet?.publicKey && !collectionFetched) {
      console.log('Wallet connected, fetching user collection...');
      fetchUserCollection();
    }
  }, [isConnected, wallet?.publicKey, collectionFetched, fetchUserCollection]);

  // Request counter removed - no longer needed

  // Auto-connect wallet using user's stored public key
  useEffect(() => {
    if (user && user.public_key && !isConnected) {
      console.log('Auto-connecting wallet with stored public key:', user.public_key);
      connectWalletViewOnly(user.public_key);
    }
  }, [user, isConnected, connectWalletViewOnly]);

  // Auto-detect location on page load
  useEffect(() => {
    if (user && (user.role === 'nft_manager' || user.role === 'admin')) {
      // Try to get location automatically
      if (navigator.geolocation) {
        setAutoDetectingLocation(true);
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            console.log('Auto-detected location:', { latitude, longitude });
            setUserLocation({ latitude, longitude });
            setSuccess('Location detected automatically!');
            setAutoDetectingLocation(false);
            
            // Clear success message after 3 seconds
            setTimeout(() => {
              setSuccess('');
            }, 3000);
            
            // Fetch nearby NFTs if wallet is connected
            if (isConnected && wallet?.publicKey) {
              fetchNearbyNFTsWithLocation({ latitude, longitude });
            }
          },
          (error) => {
            // Silently fail - don't show error for automatic location detection
            console.log('Automatic location detection failed:', error.message);
            setAutoDetectingLocation(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
          }
        );
      }
    }
  }, [user, isConnected, wallet, fetchNearbyNFTsWithLocation]);

  // Carousel navigation functions
  const handlePreviousNFT = () => {
    const newIndex = carouselIndex > 0 ? carouselIndex - 1 : nearbyNFTs.length - 1;
    setCarouselIndex(newIndex);
    setSelectedNFT(nearbyNFTs[newIndex]);
  };

  const handleNextNFT = () => {
    const newIndex = carouselIndex < nearbyNFTs.length - 1 ? carouselIndex + 1 : 0;
    setCarouselIndex(newIndex);
    setSelectedNFT(nearbyNFTs[newIndex]);
  };

  // Reset carousel index when nearby NFTs change
  useEffect(() => {
    setCarouselIndex(0);
  }, [nearbyNFTs]);

  useEffect(() => {
    if (tabValue === 2 && mapContainer.current && !map.current) {
      initializeMap(mapContainer.current, 'main');
    }
  }, [tabValue, initializeMap]);

  useEffect(() => {
    if (openMapDialog) {
      // Wait for the dialog to be fully rendered before initializing map
      const attemptInitialization = (attempt = 1) => {
        console.log(`Attempt ${attempt} to initialize overlay map...`);
        
        // Check if container exists and is visible
        if (overlayMapContainer.current && overlayMapContainer.current.offsetParent !== null && !overlayMap.current) {
          console.log('Container found and visible, initializing map...');
          initializeMap(overlayMapContainer.current, 'overlay');
        } else if (attempt < 3) {
          console.log(`Container not ready, retrying in ${attempt * 300}ms...`);
          setTimeout(() => attemptInitialization(attempt + 1), attempt * 300);
        } else {
          console.warn('Overlay map initialization skipped - container not ready');
          // Don't show error, just skip the map initialization
        }
      };
      
      // Start with a longer delay to ensure dialog is fully rendered
      setTimeout(() => attemptInitialization(), 500);
    }
    
    // Cleanup overlay map when dialog closes
    if (!openMapDialog && overlayMap.current) {
      console.log('Cleaning up overlay map...');
      overlayMap.current.remove();
      overlayMap.current = null;
      overlayMarkers.current = {};
    }
  }, [openMapDialog, initializeMap]);

  // Force marker update when overlay map is ready and nearbyNFTs exist
  useEffect(() => {
    if (openMapDialog && overlayMap.current && nearbyNFTs.length > 0) {
      console.log('Overlay map is ready, forcing marker update with', nearbyNFTs.length, 'NFTs');
      setTimeout(() => {
        if (overlayMap.current && overlayMap.current.isStyleLoaded()) {
          updateMapMarkers('overlay');
        }
      }, 1000);
    }
  }, [openMapDialog, nearbyNFTs.length, updateMapMarkers]);

  // Update map markers when nearbyNFTs change
  useEffect(() => {
    if (nearbyNFTs.length > 0) {
      console.log('Updating markers for', nearbyNFTs.length, 'NFTs');
      if (map.current) {
        console.log('Updating main map markers...');
        updateMapMarkers('main', true); // Force update when NFTs change
      }
      if (overlayMap.current) {
        console.log('Updating overlay map markers...');
        updateMapMarkers('overlay', true); // Force update when NFTs change
      }
    }
  }, [nearbyNFTs, updateMapMarkers]);

  // Force initial marker creation when map is ready
  useEffect(() => {
    if (map.current && nearbyNFTs.length > 0 && !markersCreated) {
      console.log('Force creating initial markers...');
      updateMapMarkers('main', true);
    }
  }, [map.current, nearbyNFTs.length, markersCreated, updateMapMarkers]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (markerUpdateTimeout) {
        clearTimeout(markerUpdateTimeout);
      }
      // Clear success animation on unmount
      setShowPinSuccess(false);
    };
  }, [markerUpdateTimeout]);




  const getUserLocation = () => {
    // Clear all previous messages first
    setError('');
    setSuccess('');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const locationData = { latitude, longitude };
          console.log('Manual location detection:', locationData);
          setUserLocation(locationData);
          // Only set success message, error should already be cleared
          setSuccess('Location obtained successfully!');
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            setSuccess('');
          }, 3000);
          
          if (isConnected) {
            fetchNearbyNFTsWithLocation(locationData);
          }
        },
        (error) => {
          console.error('Error getting user location:', error);
          // Only set error message, success should already be cleared
          setError('Could not retrieve your current location. Please enable location services.');
          
          // Clear error message after 5 seconds
          setTimeout(() => {
            setError('');
          }, 5000);
          
          setOpenLocationSettings(true); // Open location settings on error
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } else {
      setError('Geolocation is not supported by your browser.');
      
      // Clear error message after 5 seconds
      setTimeout(() => {
        setError('');
      }, 5000);
      
      setOpenLocationSettings(true); // Open location settings on error
    }
  };

  const handleLocationUpdate = (locationData) => {
    console.log('Location updated via handleLocationUpdate:', locationData);
    setUserLocation(locationData);
    setSuccess('Location updated successfully!');
    if (isConnected) {
      fetchNearbyNFTs();
    }
  };

  const geocodeAddress = async (address) => {
    if (!address.trim()) return null;
    
    setGeocoding(true);
    try {
      // Use Mapbox Geocoding API
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding failed');
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { latitude: lat, longitude: lng, address: data.features[0].place_name };
      }
      
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      setError('Failed to find location for the address.');
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const handleAddressSearch = async () => {
    if (!pinForm.address.trim()) {
      setError('Please enter an address to search.');
      return;
    }

    const result = await geocodeAddress(pinForm.address);
    if (result) {
      setPinForm(prev => ({
        ...prev,
        latitude: result.latitude,
        longitude: result.longitude
      }));
      setPinLocation(result);
      
      // Add/update pin marker on map
      if (map.current) {
        addPinMarker(result.longitude, result.latitude);
        
        // Auto-refresh map to searched location with maximum zoom for precise positioning
        map.current.flyTo({
          center: [result.longitude, result.latitude],
          zoom: 20, // Maximum zoom for precise positioning
          pitch: mapView === '3d' ? 60 : 0,
          bearing: 0,
          duration: 2000,
          essential: true
        });
      }
      
      setSuccess(`Location found: ${result.address}`);
    }
  };

  const handleDropPin = () => {
    if (!map.current) {
      setError('Map not loaded yet. Please wait for the map to initialize.');
      return;
    }
    
    // Check if pin marker is already locked
    if (pinMarkerLocked && pinMarker) {
      setError('Pin marker is already placed. Please remove it first or drag it to a new position.');
      return;
    }
    
    // Get current map center
    const center = map.current.getCenter();
    console.log('Map center:', center);
    console.log('Map bounds:', map.current.getBounds());
    console.log('Map zoom:', map.current.getZoom());
    
    // Validate center coordinates
    if (!center || !center.lat || !center.lng || isNaN(center.lat) || isNaN(center.lng)) {
      setError('Unable to get map center. Please try again.');
      return;
    }
    
    // Set form coordinates immediately
    setPinForm(prev => ({
      ...prev,
      latitude: center.lat,
      longitude: center.lng
    }));
    setPinLocation({ latitude: center.lat, longitude: center.lng });
    
    // Add pin marker at map center
    addPinMarker(center.lng, center.lat);
    
    // Then zoom in for precise positioning
    map.current.flyTo({
      center: [center.lng, center.lat],
      zoom: 20, // Maximum zoom for precise positioning
      duration: 1000
    });
    
    setSuccess(`Pin dropped at map center: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}! Drag to adjust position.`);
  };

  const handleUseMyLocation = () => {
    if (!userLocation) {
      setError('Your location is not available. Please enable location services.');
      return;
    }
    
    // Check if pin marker is already locked
    if (pinMarkerLocked && pinMarker) {
      setError('Pin marker is already placed. Please remove it first or drag it to a new position.');
      return;
    }
    
    setPinForm(prev => ({
      ...prev,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude
    }));
    setPinLocation({ latitude: userLocation.latitude, longitude: userLocation.longitude });
    
    // Add pin marker at user location
    addPinMarker(userLocation.longitude, userLocation.latitude);
    
    // Fly to user location with maximum zoom for precise positioning
    if (map.current) {
      map.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 20, // Maximum zoom for precise positioning
        pitch: mapView === '3d' ? 60 : 0,
        bearing: 0,
        duration: 2000,
        essential: true
      });
    }
    
    setSuccess('Using your current location! Drag to adjust position.');
  };

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    try {
      const response = await api.get('/nft/collections');
      setCollections(response.data || []);
    } catch (err) {
      console.error('Error fetching collections:', err);
    }
  }, []);

  // Fetch collections on component mount
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // Set default collection when dialog opens
  useEffect(() => {
    if (openPinDialog && collections.length > 0 && !pinForm.collection_id) {
      setPinForm(prev => ({
        ...prev,
        collection_id: collections[0].id
      }));
    }
  }, [openPinDialog, collections, pinForm.collection_id]);

  // Autocomplete search functionality
  const searchAddress = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&limit=5`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchResults(true);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setPinForm(prev => ({ ...prev, address: query }));
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      searchAddress(query);
    }, 300);
    
    setSearchTimeout(timeout);
  };

  const handleSearchResultClick = (result) => {
    const [lng, lat] = result.center;
    setPinForm(prev => ({
      ...prev,
      address: result.place_name,
      latitude: lat,
      longitude: lng
    }));
    setSearchResults([]);
    setShowSearchResults(false);
    
    // Add/update pin marker on map
    if (map.current) {
      addPinMarker(lng, lat);
      
      // Auto-refresh map to searched location with maximum zoom for precise positioning
      map.current.flyTo({
        center: [lng, lat],
        zoom: 20, // Maximum zoom for precise positioning
        pitch: mapView === '3d' ? 60 : 0,
        bearing: 0,
        duration: 2000,
        essential: true
      });
    }
    
    setSuccess(`Location found: ${result.place_name}`);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSearchResultClick(searchResults[0]);
      } else {
        handleAddressSearch();
      }
    }
  };

  const handleClickOutside = (e) => {
    if (e.target.closest('.search-container')) return;
    setShowSearchResults(false);
  };

  // 3D Map View Functions
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
              // Check if the composite source and building layer exist
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
                      'case',
                      ['has', 'height'],
                      ['get', 'height'],
                      0
                    ],
                    'fill-extrusion-base': [
                      'case',
                      ['has', 'min_height'],
                      ['get', 'min_height'],
                      0
                    ],
                    'fill-extrusion-opacity': 0.6
                  }
                });
              }
            } catch (error) {
              console.log('3D buildings not available for this style:', error);
            }
          }
        }, 1000);
      }
    }
  };

  // Filter Functions - Fetch filtered data from API
  const applyFilters = async () => {
    console.log('applyFilters called');
    try {
      setLoading(true);
      
      // Build query parameters for API
      const params = {
        latitude: userLocation?.latitude || userLocation?.lat,
        longitude: userLocation?.longitude || userLocation?.lng,
        radius: 999999999 // Very large radius to get ALL NFTs globally
      };
      
      // Ensure we have valid coordinates
      if (!params.latitude || !params.longitude) {
        setError('Location not available for filtering. Please enable location access.');
        setLoading(false);
        return;
      }
      
      // Add collection filter if selected
      if (selectedCollection) {
        params.collection_id = selectedCollection;
      }
      
      // Add rarity filter if selected
      if (selectedRarity) {
        params.rarity_level = selectedRarity;
      }
      
      // Fetch filtered data from API
      console.log('Applying filters with params:', params);
      console.log('Filter state:', { selectedCollection, selectedRarity, radiusFilter });
      const response = await api.get('/nft/nearby', { params });
      console.log('Filter API response:', response.data);
      const filteredNFTs = response.data.nfts || [];
      
      // Update state with filtered results
      setNearbyNFTs(filteredNFTs);
      
      // Update map markers with filtered results using the existing function
      setMarkersStable(false); // Reset stability when filters change
      setMarkersLocked(false); // Reset lock when filters change
      setMarkersNeverUpdate(false); // Reset never update when filters change
      updateMapMarkers('main', true); // Force update when filters change
      
      setSuccess(`Found ${filteredNFTs.length} NFTs matching your filters`);
    } catch (error) {
      console.error('Error applying filters:', error);
      setError('Failed to apply filters');
    } finally {
      setLoading(false);
    }
  };

  const navigateToFilteredArea = () => {
    if (nearbyNFTs.length === 0) return;
    
    // Calculate bounds of filtered NFTs
    const lngs = nearbyNFTs.map(nft => nft.longitude);
    const lats = nearbyNFTs.map(nft => nft.latitude);
    
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    ];
    
    if (map.current) {
      // First fit to bounds
      map.current.fitBounds(bounds, {
        padding: 50,
        duration: 2000
      });
      
      // Then switch to 3D view with slight slant
      setTimeout(() => {
        setMapView('3d');
        if (map.current) {
          map.current.easeTo({
            pitch: 60, // 3D slant
            bearing: 0,
            duration: 2000
          });
        }
      }, 1000); // Wait for bounds animation to complete
    }
  };

  // Custom NFT Filter Control for Mapbox
  const createNFTFilterControl = () => {
    class NFTFilterControl {
      onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this._container.style.background = 'white';
        this._container.style.padding = '10px';
        this._container.style.borderRadius = '4px';
        this._container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        this._container.style.minWidth = '200px';
        
        this._container.innerHTML = `
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px;">Collection</label>
            <select id="nft-collection-filter" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
              <option value="">All Collections</option>
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px;">Rarity</label>
            <select id="nft-rarity-filter" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
              <option value="">All Rarities</option>
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </div>
          <button id="apply-nft-filters" style="width: 100%; padding: 8px; background: #007cba; color: white; border: none; border-radius: 3px; cursor: pointer;">
            Apply Filters
          </button>
        `;
        
        // Add event listeners for autopostback
        const collectionSelect = this._container.querySelector('#nft-collection-filter');
        const raritySelect = this._container.querySelector('#nft-rarity-filter');
        const applyButton = this._container.querySelector('#apply-nft-filters');
        
        // Autopostback on collection change
        collectionSelect.addEventListener('change', () => {
          console.log('Collection filter changed to:', collectionSelect.value);
          setSelectedCollection(collectionSelect.value);
          applyFilters();
        });
        
        // Autopostback on rarity change
        raritySelect.addEventListener('change', () => {
          console.log('Rarity filter changed to:', raritySelect.value);
          setSelectedRarity(raritySelect.value);
          applyFilters();
        });
        
        // Manual apply button (for additional filters)
        applyButton.addEventListener('click', () => {
          setSelectedCollection(collectionSelect.value);
          setSelectedRarity(raritySelect.value);
          applyFilters();
        });
        
        return this._container;
      }
      
      onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }
    
    return new NFTFilterControl();
  };

  const addPinMarker = (lng, lat) => {
    console.log('🚨 addPinMarker called with coordinates:', { lng, lat });
    console.log('🚨 Current pinMarker state:', pinMarker);
    console.log('🚨 Pin marker locked:', pinMarkerLocked);
    console.log('🚨 Is dragging pin:', isDraggingPin);
    console.log('🚨 Pin marker protected:', pinMarkerProtected);
    console.log('🚨 Stack trace:', new Error().stack);
    
    // ULTRA-AGGRESSIVE: Don't recreate if pin marker is protected
    if (pinMarkerProtected) {
      console.log('🚨 PIN MARKER IS PROTECTED - BLOCKING RECREATION');
      return;
    }
    
    // Don't recreate pin marker if it's already locked or being dragged
    if ((pinMarkerLocked && pinMarker) || isDraggingPin) {
      console.log('🚨 Pin marker is locked or being dragged, not recreating');
      return;
    }
    
    // Don't recreate if coordinates are the same (within small tolerance)
    if (pinMarker && pinLocation) {
      const currentLng = pinLocation.longitude;
      const currentLat = pinLocation.latitude;
      const tolerance = 0.000001; // Very small tolerance for coordinate comparison
      
      if (Math.abs(lng - currentLng) < tolerance && Math.abs(lat - currentLat) < tolerance) {
        console.log('Pin marker coordinates are the same, not recreating');
        return;
      }
    }
    
    // ULTRA-AGGRESSIVE: Don't recreate if pin marker exists and is locked
    if (pinMarker && pinMarkerLocked) {
      console.log('Pin marker is locked and exists, not recreating');
      return;
    }
    
    // Remove existing pin marker (only if not protected)
    if (pinMarker && !pinMarkerProtected) {
      console.log('Removing existing pin marker');
      // Clear the lock interval
      if (pinMarker._lockInterval) {
        clearInterval(pinMarker._lockInterval);
      }
      pinMarker.remove();
      setPinMarker(null);
    } else if (pinMarker && pinMarkerProtected) {
      console.log('🚨 PIN MARKER IS PROTECTED - NOT REMOVING');
      return;
    }

    // Validate coordinates
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
      console.error('Invalid coordinates for pin marker:', { lng, lat });
      setError('Invalid coordinates for pin marker');
      return;
    }

    // Create draggable pin marker with better visual design
    const pinElement = document.createElement('div');
    pinElement.innerHTML = '📍';
    pinElement.style.fontSize = '32px'; // Larger for better visibility
    pinElement.style.cursor = 'move';
    pinElement.style.zIndex = '1000';
    pinElement.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
    pinElement.style.transition = 'all 0.2s ease';

    console.log('Creating pin marker at coordinates:', [lng, lat]);
    const marker = new Mapboxgl.Marker({
      element: pinElement,
      draggable: true
    })
      .setLngLat([lng, lat]) // Use exact coordinates
      .addTo(map.current);

    // Add drag event listeners with coordinate display
    marker.on('dragstart', () => {
      console.log('🔒 Pin drag started - ULTRA PROTECTION ACTIVATED');
      setIsDraggingPin(true);
      setPinMarkerProtected(true);
      pinElement.style.transform = 'scale(1.3)';
      pinElement.style.filter = 'drop-shadow(0 6px 12px rgba(0,0,0,0.5))';
      pinElement.style.zIndex = '1001';
    });

    marker.on('drag', () => {
      const { lng, lat } = marker.getLngLat();
      // Show coordinates while dragging with high precision
      setSuccess(`Dragging to: ${lat.toFixed(8)}, ${lng.toFixed(8)}`);
    });

    marker.on('dragend', () => {
      console.log('🔒 Pin drag ended - MAINTAINING ULTRA PROTECTION');
      const { lng, lat } = marker.getLngLat();
      console.log('Final drag coordinates:', { lng, lat });
      
      // Reset visual state
      pinElement.style.transform = 'scale(1)';
      pinElement.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
      pinElement.style.zIndex = '1000';
      
      // Update form and location with exact coordinates
      setPinForm(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng
      }));
      setPinLocation({ latitude: lat, longitude: lng });
      
      console.log('🔒 Pin drag ended - coordinates updated:', { lat, lng });
      console.log('🔒 Pin location state updated:', { latitude: lat, longitude: lng });
      console.log('🔒 Form state should now have:', { latitude: lat, longitude: lng });
      
      // Show final coordinates with high precision
      setSuccess(`Pin positioned at: ${lat.toFixed(8)}, ${lng.toFixed(8)}`);
      
      // Keep protection active for much longer
      setTimeout(() => {
        setIsDraggingPin(false);
        console.log('🔒 Pin dragging flag reset, but PROTECTION REMAINS ACTIVE');
      }, 2000); // Increased to 2000ms
      
      // Keep protection active indefinitely
      setPinMarkerProtected(true);
      
      // ULTRA-AGGRESSIVE: Lock the marker to its exact position
      marker.setLngLat([lng, lat]);
      console.log('🔒 Pin marker locked to exact coordinates:', [lng, lat]);
    });

    // Store the pin marker in state and lock it
    setPinMarker(marker);
    setPinMarkerLocked(true);
    setPinMarkerProtected(true);
    console.log('🔒 Pin marker created, stored in state, locked, and PROTECTED');
    
    // ULTRA-AGGRESSIVE: Continuously lock the marker to its position
    const lockMarkerPosition = () => {
      if (marker && pinMarkerProtected) {
        const currentPos = marker.getLngLat();
        const expectedPos = [lng, lat];
        if (Math.abs(currentPos.lng - expectedPos[0]) > 0.000001 || 
            Math.abs(currentPos.lat - expectedPos[1]) > 0.000001) {
          console.log('🔒 Pin marker position corrected:', currentPos, '->', expectedPos);
          marker.setLngLat(expectedPos);
        }
      }
    };
    
    // Lock position every 100ms
    const lockInterval = setInterval(lockMarkerPosition, 100);
    
    // Store the interval ID for cleanup
    marker._lockInterval = lockInterval;
  };

  const handlePinNFT = async () => {
    if (!pinForm.latitude || !pinForm.longitude || !pinForm.name.trim() || !pinForm.collection_id) {
      setError('Please search for an address, select a collection, and fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      // Get the exact coordinates from the pin marker if it exists
      let finalLatitude = pinForm.latitude;
      let finalLongitude = pinForm.longitude;
      
      console.log('🔍 DEBUG: Pin marker exists:', !!pinMarker);
      console.log('🔍 DEBUG: Pin marker locked:', pinMarkerLocked);
      console.log('🔍 DEBUG: Pin marker protected:', pinMarkerProtected);
      console.log('🔍 DEBUG: Pin location state:', pinLocation);
      console.log('🔍 DEBUG: Form coordinates:', { lat: pinForm.latitude, lng: pinForm.longitude });
      
      // Force update form coordinates from pin marker if available
      if (pinMarker) {
        const markerCoords = pinMarker.getLngLat();
        console.log('🔍 DEBUG: Force updating form with pin marker coordinates:', markerCoords);
        setPinForm(prev => ({
          ...prev,
          latitude: markerCoords.lat,
          longitude: markerCoords.lng
        }));
        // Use the marker coordinates directly
        finalLatitude = markerCoords.lat;
        finalLongitude = markerCoords.lng;
      }
      
      // Try to get coordinates from multiple sources
      if (pinMarker) {
        try {
          const markerCoords = pinMarker.getLngLat();
          console.log('🔍 DEBUG: Pin marker getLngLat() result:', markerCoords);
          console.log('🔍 DEBUG: Pin marker isDraggable:', pinMarker.isDraggable());
          console.log('🔍 DEBUG: Pin marker element:', pinMarker.getElement());
        } catch (error) {
          console.error('🔍 DEBUG: Error getting pin marker coordinates:', error);
        }
      }
      
      if (pinMarker) {
        const markerCoords = pinMarker.getLngLat();
        finalLatitude = markerCoords.lat;
        finalLongitude = markerCoords.lng;
        console.log('🎯 Pin marker getLngLat():', markerCoords);
        console.log('🎯 Using exact pin marker coordinates:', { lat: finalLatitude, lng: finalLongitude });
        console.log('🎯 Original form coordinates:', { lat: pinForm.latitude, lng: pinForm.longitude });
        
        // Check if coordinates are different
        const latDiff = Math.abs(finalLatitude - pinForm.latitude);
        const lngDiff = Math.abs(finalLongitude - pinForm.longitude);
        console.log('🎯 Coordinate differences:', { latDiff, lngDiff });
        
        if (latDiff > 0.000001 || lngDiff > 0.000001) {
          console.log('✅ Pin marker coordinates are different from form - using pin marker coordinates');
        } else {
          console.log('⚠️ Pin marker coordinates are the same as form coordinates');
        }
      } else if (pinLocation) {
        // Fallback to pinLocation state if pin marker is not available
        finalLatitude = pinLocation.latitude;
        finalLongitude = pinLocation.longitude;
        console.log('🎯 Using pinLocation state coordinates:', { lat: finalLatitude, lng: finalLongitude });
      } else {
        console.log('⚠️ No pin marker or pinLocation found - using form coordinates');
      }
      
      const pinData = {
        name: pinForm.name,
        description: pinForm.description,
        ipfs_hash: pinForm.ipfs_hash,
        radius_meters: pinForm.radius_meters,
        collection_id: pinForm.collection_id,
        latitude: finalLatitude,
        longitude: finalLongitude,
        smart_contract_address: pinForm.smart_contract_address
      };
      
      console.log('Pinning NFT with data:', pinData);
      const response = await api.post('/nft/pin', pinData);

      // Enhanced success confirmation
      setSuccess(`🎉 NFT "${pinForm.name}" pinned successfully at ${finalLatitude.toFixed(8)}, ${finalLongitude.toFixed(8)}!`);
      setShowPinSuccess(true);
      setOpenPinDialog(false);
      
      // Hide success animation after 3 seconds
      setTimeout(() => {
        setShowPinSuccess(false);
      }, 3000);
      
      // Clean up pin marker
      if (pinMarker) {
        // Clear the lock interval
        if (pinMarker._lockInterval) {
          clearInterval(pinMarker._lockInterval);
        }
        pinMarker.remove();
        setPinMarker(null);
        setPinMarkerLocked(false);
        setPinMarkerProtected(false);
      }
      
      // Reset form
      setPinForm({
        name: '',
        description: '',
        ipfs_hash: '',
        radius_meters: 10,
        collection_id: null,
        address: '',
        latitude: null,
        longitude: null
      });
      setPinLocation(null);

      // Refresh nearby NFTs and map markers
      if (userLocation) {
        await fetchNearbyNFTsWithLocation(userLocation);
      }
    } catch (err) {
      console.error('Error pinning NFT:', err);
      setError(err.response?.data?.error || 'Failed to pin NFT.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollectNFT = async (nft) => {
    if (!userLocation) {
      setError('Location not available. Cannot collect NFT.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/nft/collect', {
        nft_id: nft.id,
        user_latitude: userLocation.latitude,
        user_longitude: userLocation.longitude
      });

      setSuccess(response.data.message);
      fetchNearbyNFTs(); // Refresh nearby NFTs
      setCollectionFetched(false); // Reset flag to allow collection refresh
      fetchUserCollection(); // Refresh user collection
    } catch (err) {
      console.error('Error collecting NFT:', err);
      setError(err.response?.data?.error || 'Failed to collect NFT.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleNFTDetails = (nft) => {
    setSelectedNFT(nft);
    setOpenNFTDialog(true);
  };

  const handleOpenMap = () => {
    console.log('Opening map dialog...');
    setOpenMapDialog(true);
    
    // Force map initialization after dialog opens
    setTimeout(() => {
      if (overlayMapContainer.current && !overlayMap.current) {
        console.log('Manual map initialization triggered...');
        initializeMap(overlayMapContainer.current, 'overlay');
      }
    }, 500);
  };

  const handleCloseMap = () => {
    setOpenMapDialog(false);
    if (overlayMap.current) {
      overlayMap.current.remove();
      overlayMap.current = null;
      overlayMarkers.current = {};
    }
  };

  // Cleanup maps on component unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        markers.current = {};
      }
      if (overlayMap.current) {
        overlayMap.current.remove();
        overlayMap.current = null;
        overlayMarkers.current = {};
      }
    };
  }, []);

  // Handle click outside search results
  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Only show loading spinner if we're actually loading and have no data
  if (loading && !nearbyNFTs.length && !userCollection.length && isConnected) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error && !user) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header with Location Controls */}
      <Box sx={{ mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        NFT Dashboard
      </Typography>
        
        {/* Location Controls in Header */}
        {isConnected && wallet?.publicKey && (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<LocationIcon />}
              onClick={getUserLocation}
              size="small"
              disabled={loading}
            >
              {autoDetectingLocation ? 'Detecting...' : 'Get Location'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<LocationIcon />}
              onClick={() => setOpenLocationSettings(true)}
              size="small"
            >
              Location Settings
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchNearbyNFTs}
              size="small"
              disabled={!userLocation}
            >
              Find Nearby NFTs
            </Button>
            {userLocation && (
              <Typography variant="body2" color="text.secondary">
                📍 {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Main Dashboard Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Wallet Status Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<StellarIcon color="primary" />}
              title="Wallet Status"
              subheader={isConnected ? "Connected" : "Not Connected"}
            />
            <CardContent sx={{ flexGrow: 1 }}>
              {!isConnected || !wallet?.publicKey ? (
                <Box textAlign="center">
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Connect your Stellar wallet to start collecting NFTs
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<WalletIcon />}
                    onClick={() => setOpenWalletDialog(true)}
                    fullWidth
                    disabled={loading}
                  >
                    {loading ? 'Connecting...' : 'Connect Wallet'}
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Wallet: {wallet?.publicKey?.substring(0, 12)}...
                  </Typography>
                  {balance !== null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Balance: {balance.toFixed(2)} XLM
                    </Typography>
                  )}
                  <Button
                    variant="outlined"
                    onClick={disconnectWallet}
                    fullWidth
                    color="error"
                  >
                    Disconnect Wallet
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* My Collection Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<CollectionsIcon color="primary" />}
              title="My Collection"
              subheader={`${userCollection.length} NFTs collected`}
            />
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {userCollection.length > 0 
                  ? `You have collected ${userCollection.length} NFTs. View and manage your collection.`
                  : "No NFTs collected yet. Start exploring to find and collect NFTs!"
                }
              </Typography>
                <Button
                  variant="contained"
                  startIcon={<CollectionsIcon />}
                  onClick={() => setTabValue(1)}
                  fullWidth
                  disabled={!isConnected || !wallet?.publicKey}
                >
                {userCollection.length > 0 ? 'View Collection' : 'View Collection'}
                </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* NFT Map Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<MapIcon color="primary" />}
              title="NFT Map"
              subheader={`${nearbyNFTs.length} NFTs nearby`}
            />
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {nearbyNFTs.length > 0 
                  ? `Explore ${nearbyNFTs.length} NFTs on the interactive 3D map. Find and collect NFTs in your area.`
                  : "No NFTs found nearby. Make sure location services are enabled and you're in an area with pinned NFTs."
                }
              </Typography>
                <Button
                  variant="contained"
                  startIcon={<MapIcon />}
                  onClick={handleOpenMap}
                  fullWidth
                  disabled={!isConnected || !wallet?.publicKey || !userLocation}
                >
                {nearbyNFTs.length > 0 ? 'Open Map' : 'Open Map'}
                </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabbed Content */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="NFT dashboard tabs">
          <Tab label="Nearby NFTs" {...a11yProps(0)} />
          <Tab label="My Collection" {...a11yProps(1)} />
          <Tab label="NFT Map" {...a11yProps(2)} />
        </Tabs>
      </Box>

      {/* Nearby NFTs Tab */}
      <TabPanel value={tabValue} index={0}>
        <Typography variant="h5" gutterBottom>
          Nearby NFTs
        </Typography>
        {loading ? (
          <Box display="flex" flexDirection="column" alignItems="center" p={4}>
            <CircularProgress size={40} thickness={4} sx={{ color: '#007cba', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1, color: '#333', fontWeight: 'bold' }}>
              Loading NFT Map...
            </Typography>
            <Typography variant="body2" sx={{ color: '#666' }}>
              Fetching nearby NFTs and initializing 3D view
            </Typography>
          </Box>
        ) : nearbyNFTs.length === 0 ? (
          <Alert severity="info">
            No NFTs found nearby. Make sure you have enabled location services and are within range of pinned NFTs.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {nearbyNFTs.map((nft) => (
              <Grid item xs={12} sm={6} md={4} key={nft.id}>
                <Card>
                  {nft.full_ipfs_url && (
                    <CardMedia
                      component="img"
                      height="200"
                      image={nft.full_ipfs_url}
                      alt={nft.collection?.name || 'NFT'}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <CardContent>
                    <Typography variant="h6" component="div">
                      {nft.collection?.name || 'Unknown NFT'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Rarity: {nft.collection?.rarity_level || 'common'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Distance: {Math.round(nft.distance || 0)}m
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Radius: {nft.radius_meters}m
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<InfoIcon />}
                      onClick={() => handleNFTDetails(nft)}
                    >
                      Details
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<CollectIcon />}
                      onClick={() => handleCollectNFT(nft)}
                      disabled={!userLocation}
                    >
                      Collect
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* My Collection Tab */}
      <TabPanel value={tabValue} index={1}>
        <Typography variant="h5" gutterBottom>
          My NFT Collection
        </Typography>
        {userCollection.length === 0 ? (
          <Alert severity="info">
            You haven't collected any NFTs yet. Start exploring nearby NFTs to build your collection!
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {userCollection.map((item) => (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <Card>
                  {item.full_ipfs_url && (
                    <CardMedia
                      component="img"
                      height="200"
                      image={item.full_ipfs_url}
                      alt={item.collection?.name || 'NFT'}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <CardContent>
                    <Typography variant="h6" component="div">
                      {item.collection?.name || 'Unknown NFT'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Rarity: {item.collection?.rarity_level || 'common'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Collected: {new Date(item.collected_at).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Transfers: {item.transfer_count}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<InfoIcon />}
                      onClick={() => handleNFTDetails(item.nft)}
                    >
                      Details
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* NFT Map Tab */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h5" gutterBottom>
            NFT Map
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            View and pin NFTs on the map. Use the "Pin New NFT" button to add new NFTs by address.
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<LocationIcon />}
              onClick={getUserLocation}
              disabled={loading}
            >
              Get My Location
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                if (userLocation) {
                  fetchNearbyNFTsWithLocation(userLocation);
                }
              }}
              disabled={!userLocation || loading}
            >
              Refresh NFTs
            </Button>
            <Button
              variant="outlined"
              startIcon={<MapIcon />}
              onClick={() => {
                if (mapContainer.current && !map.current) {
                  console.log('Manually initializing main map...');
                  initializeMap(mapContainer.current, 'main');
                } else if (map.current) {
                  console.log('Main map already initialized');
                }
              }}
              disabled={loading}
            >
              Initialize Map
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                console.log('Main map container:', mapContainer.current);
                console.log('Main map instance:', map.current);
                console.log('Main map markers:', markers.current);
                console.log('Nearby NFTs:', nearbyNFTs.length);
              }}
              size="small"
            >
              Debug Map
            </Button>
            {(user?.role === 'nft_manager' || user?.role === 'admin') && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<LocationIcon />}
                onClick={() => setOpenPinDialog(true)}
                disabled={loading}
              >
                Pin New NFT
              </Button>
            )}
          </Box>
        </Box>
        
        {/* Map View Controls */}
        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 3D View Controls */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant={mapView === '2d' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => changeMapView('2d')}
              startIcon={<MapIcon />}
            >
              2D
            </Button>
            <Button
              variant={mapView === '3d' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => changeMapView('3d')}
              startIcon={<MapIcon />}
            >
              3D
            </Button>
            <Button
              variant={mapView === 'satellite' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => changeMapView('satellite')}
              startIcon={<MapIcon />}
            >
              Satellite
            </Button>
          </Box>

          {/* Individual Markers Only - No Clustering */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              label="Individual Markers"
              color="primary"
              size="small"
              icon={<FilterListIcon />}
            />
          </Box>

          {/* Navigate to Filtered Area */}
          <Button
            variant="outlined"
            size="small"
            onClick={navigateToFilteredArea}
            disabled={nearbyNFTs.length === 0}
            startIcon={<MyLocationIcon />}
          >
            Navigate to NFTs
          </Button>
        </Box>
        
        <Paper sx={{ 
          height: '800px', 
          width: '100%', 
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid #e0e0e0',
          borderRadius: 1
        }}>
          <div 
            ref={mapContainer} 
            style={{ 
              width: '100%', 
              height: '100%',
              position: 'relative',
              backgroundColor: '#f5f5f5' // Fallback background
            }} 
          />
          {!map.current && (
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              zIndex: 1000
            }}>
              <CircularProgress size={60} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Loading 3D Map...
              </Typography>
            </Box>
          )}
          
          {/* Pin Success Animation */}
          {showPinSuccess && (
            <Box
              sx={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1001,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #4CAF50, #45a049)',
                color: 'white',
                padding: '16px 24px',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(76, 175, 80, 0.3)',
                animation: 'pulse 0.6s ease-in-out',
                '@keyframes pulse': {
                  '0%': { transform: 'translateX(-50%) scale(0.8)', opacity: 0 },
                  '50%': { transform: 'translateX(-50%) scale(1.05)', opacity: 1 },
                  '100%': { transform: 'translateX(-50%) scale(1)', opacity: 1 }
                }
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                ✅ NFT Pinned Successfully!
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Your NFT has been added to the map
              </Typography>
            </Box>
          )}
        </Paper>
      </TabPanel>

      {/* NFT Details Dialog */}
      <Dialog open={openNFTDialog} onClose={() => setOpenNFTDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              {selectedNFT?.collection?.name || 'NFT Details'}
            </Typography>
            <IconButton onClick={() => setOpenNFTDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedNFT && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                {selectedNFT.full_ipfs_url && (
                  <img
                    src={selectedNFT.full_ipfs_url}
                    alt={selectedNFT.collection?.name || 'NFT'}
                    style={{
                      width: '100%',
                      height: 'auto',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Collection Information
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {selectedNFT.collection?.description || 'No description available'}
                </Typography>
                
                <Typography variant="subtitle2" gutterBottom>
                  Rarity Level
                </Typography>
                <Chip
                  label={selectedNFT.collection?.rarity_level || 'common'}
                  color={getRarityColor(selectedNFT.collection?.rarity_level)}
                  sx={{ mb: 2 }}
                />

                <Typography variant="subtitle2" gutterBottom>
                  Location Details
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Latitude: {typeof selectedNFT.latitude === 'number' ? selectedNFT.latitude.toFixed(6) : selectedNFT.latitude || 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Longitude: {typeof selectedNFT.longitude === 'number' ? selectedNFT.longitude.toFixed(6) : selectedNFT.longitude || 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Collection Radius: {selectedNFT.radius_meters}m
                </Typography>
                {selectedNFT.distance && (
                  <Typography variant="body2" color="text.secondary">
                    Distance from you: {Math.round(selectedNFT.distance)}m
                  </Typography>
                )}

                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                  IPFS Hash
                </Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                  {selectedNFT.ipfs_hash}
                </Typography>

                {selectedNFT.smart_contract_address && (
                  <>
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Smart Contract
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                      {selectedNFT.smart_contract_address}
                    </Typography>
                  </>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNFTDialog(false)}>
            Close
          </Button>
          {selectedNFT && (
            <Button
              variant="contained"
              startIcon={<CollectIcon />}
              onClick={() => {
                handleCollectNFT(selectedNFT);
                setOpenNFTDialog(false);
              }}
              disabled={!userLocation}
            >
              Collect NFT
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Map Dialog - Fullscreen with 3D View */}
      <Dialog 
        open={openMapDialog} 
        onClose={handleCloseMap} 
        maxWidth={false}
        fullWidth
        fullScreen
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
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              🗺️ NFT Map - 3D View
            </Typography>
            <Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenPinDialog(true)}
                sx={{ mr: 1 }}
                size="small"
              >
                Pin New NFT
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  console.log('Container ref:', overlayMapContainer.current);
                  console.log('Map instance:', overlayMap.current);
                  if (overlayMapContainer.current && !overlayMap.current) {
                    console.log('Manually initializing map...');
                    initializeMap(overlayMapContainer.current, 'overlay');
                  }
                }}
                sx={{ mr: 1 }}
                size="small"
              >
                Debug Map
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  console.log('Manually updating overlay markers...');
                  console.log('Nearby NFTs:', nearbyNFTs.length);
                  console.log('Overlay map exists:', !!overlayMap.current);
                  if (overlayMap.current) {
                    updateMapMarkers('overlay');
                  }
                }}
                sx={{ mr: 1 }}
                size="small"
              >
                Update Markers
              </Button>
              <IconButton onClick={handleCloseMap} sx={{ ml: 1 }}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ 
          padding: 0, 
          margin: 0, 
          height: 'calc(100vh - 64px)', // Account for header height
          overflow: 'hidden',
          position: 'relative',
          minHeight: '600px' // Ensure minimum height
        }}>
          <div 
            ref={overlayMapContainer} 
            style={{ 
              width: '100%', 
              height: '100%',
              minHeight: '600px',
              position: 'relative',
              backgroundColor: '#f5f5f5' // Fallback background
            }} 
          />
          {!overlayMap.current && (
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              zIndex: 1000
            }}>
              <CircularProgress size={60} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Loading 3D Map...
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Wallet Connection Dialog */}
      <WalletConnectionDialog
        open={openWalletDialog}
        onClose={() => setOpenWalletDialog(false)}
      />

      {/* Location Settings Dialog */}
      <LocationSettings
        open={openLocationSettings}
        onClose={() => setOpenLocationSettings(false)}
        onLocationUpdate={handleLocationUpdate}
      />

      {/* Pin NFT Dialog */}
      <Dialog open={openPinDialog} onClose={() => setOpenPinDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Pin New NFT</Typography>
            <IconButton onClick={() => setOpenPinDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Search for an address to pin your NFT, then drag the pin to the exact location.
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2, position: 'relative' }}>
            <Box sx={{ flexGrow: 1, position: 'relative' }} className="search-container">
            <TextField
              fullWidth
              label="Search Address"
              value={pinForm.address}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
              placeholder="Enter address (e.g., 123 Main St, New York, NY)"
                InputProps={{
                  startAdornment: <LocationIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
              
              {/* Search Results Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <Paper
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    maxHeight: 200,
                    overflow: 'auto',
                    mt: 1,
                    boxShadow: 3
                  }}
                >
                  {searchResults.map((result, index) => (
                    <Box
                      key={index}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                          backgroundColor: 'action.hover'
                        }
                      }}
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <Typography variant="body2" fontWeight="bold">
                        {result.text}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {result.place_name}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
            
            <Button
              variant="outlined"
              onClick={handleAddressSearch}
              disabled={geocoding || !pinForm.address.trim()}
              startIcon={geocoding ? <CircularProgress size={20} /> : <LocationIcon />}
            >
              {geocoding ? 'Searching...' : 'Search'}
            </Button>
          </Box>
          
          {/* Drop Pin and Use Location Buttons */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              onClick={handleDropPin}
              startIcon={<LocationIcon />}
              sx={{ flex: 1 }}
            >
              Drop Pin
            </Button>
            <Button
              variant="outlined"
              onClick={handleUseMyLocation}
              startIcon={<MyLocationIcon />}
              sx={{ flex: 1 }}
              disabled={!userLocation}
            >
              Use My Location
            </Button>
          </Box>
          
          {pinForm.latitude && pinForm.longitude && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Location: {pinForm.latitude.toFixed(6)}, {pinForm.longitude.toFixed(6)}
              <br />
              <small>Drag the pin on the map to adjust the exact position</small>
            </Alert>
          )}
          
          <TextField
            fullWidth
            label="NFT Name"
            value={pinForm.name}
            onChange={(e) => setPinForm({ ...pinForm, name: e.target.value })}
            required
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="Description"
            value={pinForm.description}
            onChange={(e) => setPinForm({ ...pinForm, description: e.target.value })}
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Collection *</InputLabel>
            <Select
              value={pinForm.collection_id || ''}
              onChange={(e) => setPinForm({ ...pinForm, collection_id: e.target.value })}
              label="Collection *"
              required
            >
              {collections.map((collection) => (
                <MenuItem key={collection.id} value={collection.id}>
                  {collection.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            label="Smart Contract Address"
            value={pinForm.smart_contract_address}
            onChange={(e) => setPinForm({ ...pinForm, smart_contract_address: e.target.value })}
            placeholder="0x1234567890abcdef1234567890abcdef12345678"
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="IPFS Hash"
            value={pinForm.ipfs_hash}
            onChange={(e) => setPinForm({ ...pinForm, ipfs_hash: e.target.value })}
            placeholder="bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png"
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="Collection Radius (meters)"
            type="number"
            value={pinForm.radius_meters}
            onChange={(e) => setPinForm({ ...pinForm, radius_meters: parseInt(e.target.value) || 10 })}
            inputProps={{ min: 1, max: 1000 }}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPinDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handlePinNFT}
            disabled={loading || !pinForm.name.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <LocationIcon />}
          >
            {loading ? 'Pinning...' : 'Pin NFT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* NFT Details Dialog */}
      <Dialog 
        open={openDetailsDialog} 
        onClose={() => setOpenDetailsDialog(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" sx={{ flexGrow: 1 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: selectedNFT?.collection?.rarity_level === 'legendary' ? '#ff9800' : 
                                selectedNFT?.collection?.rarity_level === 'rare' ? '#2196f3' : '#4caf50',
                marginRight: 6
              }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {selectedNFT?.name || selectedNFT?.collection?.name || 'Unknown NFT'}
              </Typography>
            </Box>
            
            {/* Carousel Navigation */}
            {nearbyNFTs.length > 1 && (
              <Box display="flex" alignItems="center" sx={{ mx: 2 }}>
                <IconButton 
                  size="small" 
                  onClick={handlePreviousNFT}
                  disabled={nearbyNFTs.length <= 1}
                >
                  <ArrowBackIos fontSize="small" />
                </IconButton>
                <Typography variant="caption" sx={{ mx: 1, minWidth: '60px', textAlign: 'center' }}>
                  {carouselIndex + 1} of {nearbyNFTs.length}
                </Typography>
                <IconButton 
                  size="small" 
                  onClick={handleNextNFT}
                  disabled={nearbyNFTs.length <= 1}
                >
                  <ArrowForwardIos fontSize="small" />
                </IconButton>
              </Box>
            )}
            
            <IconButton size="small" onClick={() => setOpenDetailsDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 1, pb: 1 }}>
          {selectedNFT && (
            <Box>
              {/* NFT Image - Smaller */}
              {selectedNFT.full_ipfs_url && (
                <Box textAlign="center" mb={2}>
                  <img 
                    src={selectedNFT.full_ipfs_url} 
                    alt={selectedNFT.name || 'NFT'} 
                    style={{
                      maxWidth: '100%',
                      maxHeight: '200px',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'block';
                    }}
                  />
                  <div style={{ display: 'none', padding: '20px', background: '#f5f5f5', borderRadius: '8px', color: '#666', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '14px' }}>Image not available</p>
                  </div>
                </Box>
              )}

              {/* Compact NFT Details Grid */}
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      RARITY
                    </Typography>
                    <Chip 
                      label={selectedNFT.collection?.rarity_level || 'common'} 
                      color={getRarityColor(selectedNFT.collection?.rarity_level)}
                      size="small"
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      RADIUS
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                      {selectedNFT.radius_meters}m
                    </Typography>
                  </Box>
                </Grid>
                {selectedNFT.distance && (
                  <Grid item xs={6}>
                    <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        DISTANCE
                      </Typography>
                      <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                        {Math.round(selectedNFT.distance)}m
                      </Typography>
                    </Box>
                  </Grid>
                )}
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      STATUS
                    </Typography>
                    <Box display="flex" alignItems="center" sx={{ mt: 0.5 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: selectedNFT.is_active ? '#4caf50' : '#f44336',
                        marginRight: 4
                      }} />
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', fontSize: '11px' }}>
                        {selectedNFT.is_active ? 'Active' : 'Inactive'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      COLLECTION
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedNFT.collection?.name || 'Unknown Collection'}
                    </Typography>
                  </Box>
                </Grid>
                {selectedNFT.description && (
                  <Grid item xs={12}>
                    <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        DESCRIPTION
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontSize: '13px' }}>
                        {selectedNFT.description}
                      </Typography>
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      LOCATION
                    </Typography>
                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', fontSize: '11px' }}>
                      Lat: {typeof selectedNFT.latitude === 'number' ? selectedNFT.latitude.toFixed(4) : selectedNFT.latitude || 'N/A'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '11px' }}>
                      Lng: {typeof selectedNFT.longitude === 'number' ? selectedNFT.longitude.toFixed(4) : selectedNFT.longitude || 'N/A'}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetailsDialog(false)}>
            Close
          </Button>
          {selectedNFT && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                // Add collect functionality here if needed
                console.log('Collect NFT:', selectedNFT);
              }}
            >
              Collect NFT
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTDashboard;