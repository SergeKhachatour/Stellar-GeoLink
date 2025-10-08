import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from '@mui/material';
import {
  ArrowBackIos,
  ArrowForwardIos
} from '@mui/icons-material';
import {
  Add as AddIcon,
  LocationOn as LocationIcon,
  Map as MapIcon,
  Refresh as RefreshIcon,
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
  const [, setPinLocation] = useState(null);
  const [autoDetectingLocation, setAutoDetectingLocation] = useState(false);
  const [pinForm, setPinForm] = useState({
    name: '',
    description: '',
    ipfs_hash: '',
    radius_meters: 10,
    collection_id: null,
    address: '',
    latitude: null,
    longitude: null
  });
  const [pinMarker, setPinMarker] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [collectionFetched, setCollectionFetched] = useState(false);
  const requestCooldown = 3000; // 3 seconds cooldown between requests
  const mapContainer = useRef(null);
  const overlayMapContainer = useRef(null);
  const map = useRef(null);
  const overlayMap = useRef(null);
  const markers = useRef({});
  const overlayMarkers = useRef({});

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
    try {
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radius: 1000 // 1km radius
        }
      });
      
      // Process the NFTs to add full IPFS URLs
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
        collection: {
          ...nft.collection,
          full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
        }
      }));
      
      setNearbyNFTs(processedNFTs);
    } catch (err) {
      console.error('Error fetching nearby NFTs:', err);
      setError('Failed to fetch nearby NFTs.');
    } finally {
      setRequestInProgress(false);
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
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          radius: 1000 // 1km radius
        }
      });
      
      // Process the NFTs to add full IPFS URLs
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
        collection: {
          ...nft.collection,
          full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
        }
      }));
      
      setNearbyNFTs(processedNFTs);
    } catch (err) {
      console.error('Error fetching nearby NFTs:', err);
      setError('Failed to fetch nearby NFTs.');
    } finally {
      setRequestInProgress(false);
    }
  }, [requestInProgress, lastRequestTime, requestCooldown]);

  const updateMapMarkers = useCallback((mapType = 'main') => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    const currentMarkers = mapType === 'overlay' ? overlayMarkers : markers;
    
    if (!currentMap.current) {
      console.warn('Map not initialized, cannot add markers');
      return;
    }

    // Prevent multiple simultaneous marker updates
    if (mapLoading) {
      console.log('Map is already loading markers, skipping...');
      return;
    }
    
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

    // Remove existing markers
    Object.values(currentMarkers.current).forEach(marker => marker.remove());
    currentMarkers.current = {};
    
    // Debug: Check map center and bounds
    const mapCenter = currentMap.current.getCenter();
    const mapBounds = currentMap.current.getBounds();
    console.log('Map center:', mapCenter);
    console.log('Map bounds:', mapBounds);
    console.log('Number of NFTs to place:', nearbyNFTs.length);

    // Sort NFTs by distance to spread them out better
    const sortedNFTs = [...nearbyNFTs].sort((a, b) => (a.distance || 0) - (b.distance || 0));

    sortedNFTs.forEach((nft, index) => {
      // Validate coordinates before proceeding
      if (nft.latitude && nft.longitude && 
          !isNaN(nft.latitude) && !isNaN(nft.longitude) &&
          isFinite(nft.latitude) && isFinite(nft.longitude)) {
        
        // Use exact coordinates - no offsets to maintain precise positioning
        const exactLat = parseFloat(nft.latitude);
        const exactLng = parseFloat(nft.longitude);
        
        // Final validation of coordinates
        if (isNaN(exactLat) || isNaN(exactLng) || !isFinite(exactLat) || !isFinite(exactLng)) {
          console.warn('Invalid coordinates for NFT:', nft.id, 'Skipping marker creation.');
          return;
        }
        
        // Debug logging to check coordinates
        console.log(`NFT ${nft.id} coordinates:`, { lat: exactLat, lng: exactLng, name: nft.name });
        
        // Check if coordinates are in a reasonable range
        if (exactLat < -90 || exactLat > 90 || exactLng < -180 || exactLng > 180) {
          console.warn(`Invalid coordinate range for NFT ${nft.id}:`, { lat: exactLat, lng: exactLng });
          return;
        }

        // Create NFT image marker with exact positioning
        try {
          // Create custom element for NFT image
          const el = document.createElement('div');
          el.style.width = '60px';
          el.style.height = '60px';
          el.style.borderRadius = '12px';
          el.style.border = '3px solid #ffffff';
          el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          el.style.cursor = 'pointer';
          el.style.overflow = 'hidden';
          el.style.position = 'relative';
          el.style.zIndex = '1000';
          
          if (nft.full_ipfs_url) {
            el.innerHTML = `
              <img src="${nft.full_ipfs_url}" 
                   alt="${nft.name || 'NFT'}" 
                   style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div style="display: none; width: 100%; height: 100%; background: linear-gradient(135deg, #ef4444, #dc2626); align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; position: absolute; top: 0; left: 0;">
                NFT
              </div>
            `;
          } else {
            el.innerHTML = `
              <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #ef4444, #dc2626); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">
                NFT
              </div>
            `;
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

          const marker = new Mapboxgl.Marker({
            element: el,
            anchor: 'center'
          })
            .setLngLat([exactLng, exactLat]) // [longitude, latitude] format for Mapbox
            .addTo(currentMap.current);

          currentMarkers.current[nft.id] = marker;
          console.log(`NFT image marker created for NFT ${nft.id} at:`, [exactLng, exactLat]);
        } catch (error) {
          console.error('Error creating marker for NFT:', nft.id, error);
        }
      }
    });
    
    // Markers are positioned at exact coordinates regardless of zoom level
    console.log(`Successfully placed ${sortedNFTs.length} NFT markers at their exact coordinates`);
    setMapLoading(false);
  }, [nearbyNFTs, mapLoading]);

  const initializeMap = useCallback((container, mapType) => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    
    if (currentMap.current) {
      console.log('Map already initialized for', mapType);
      return;
    }

    console.log('Initializing map for', mapType, 'with container:', container);

    // Check if Mapbox token is available
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_ACCESS_TOKEN') {
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
        }), 'top-left');

        // Add fullscreen control for overlay map
        if (mapType === 'overlay') {
          currentMap.current.addControl(new Mapboxgl.FullscreenControl(), 'top-right');
        }

        // Add user location marker
        if (userLocation) {
          new Mapboxgl.Marker({ 
            color: '#3b82f6',
            scale: 1.2
          })
            .setLngLat([userLocation.longitude, userLocation.latitude])
            .setPopup(new Mapboxgl.Popup().setHTML('<h4>📍 Your Location</h4>'))
            .addTo(currentMap.current);
        }

        // Enhanced 3D animation for overlay map
        if (mapType === 'overlay' && userLocation) {
          // Start with globe view, then animate to user location with moderate 3D effect
          currentMap.current.flyTo({
            center: [userLocation.longitude, userLocation.latitude],
            zoom: 14, // Reduced zoom to prevent performance issues
            pitch: 45, // Reduced pitch for better performance
            bearing: 0,
            duration: 3000, // Reduced duration for better performance
            essential: true
          });
        } else if (mapType === 'main' && userLocation) {
          // Standard animation for main map
          currentMap.current.flyTo({
            center: [userLocation.longitude, userLocation.latitude],
            zoom: 15,
            pitch: 30, // Reduced pitch for better performance
            bearing: 0,
            duration: 2000, // Reduced duration
            essential: true
          });
        }

        // Wait for style to be fully loaded before adding markers
        currentMap.current.on('styledata', () => {
          console.log('Map style loaded for', mapType);
          updateMapMarkers(mapType);
        });
        
        // Fallback: update markers after a delay if styledata event doesn't fire
        setTimeout(() => {
          if (currentMap.current && currentMap.current.isStyleLoaded()) {
            console.log('Style loaded via timeout for', mapType);
            updateMapMarkers(mapType);
          }
        }, 2000);

        // Force marker update for overlay map if nearbyNFTs are already loaded
        if (mapType === 'overlay' && nearbyNFTs.length > 0) {
          console.log('Force updating markers for overlay map with', nearbyNFTs.length, 'NFTs');
          setTimeout(() => {
            if (currentMap.current && currentMap.current.isStyleLoaded()) {
              updateMapMarkers(mapType);
            }
          }, 3000);
        }
      });

      // Handle map errors
      currentMap.current.on('error', (e) => {
        console.error('Map error for', mapType, ':', e);
        setError(`Map initialization failed: ${e.error?.message || 'Unknown error'}`);
      });

    } catch (error) {
      console.error('Error creating map for', mapType, ':', error);
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

  // Reset request counter every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRequestCount(0);
    }, 60000); // Reset every minute

    return () => clearInterval(interval);
  }, []);

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
        updateMapMarkers('main');
      }
      if (overlayMap.current) {
        console.log('Updating overlay map markers...');
        updateMapMarkers('overlay');
      }
    }
  }, [nearbyNFTs, updateMapMarkers]);




  const getUserLocation = () => {
    // Clear all previous messages first
    setError('');
    setSuccess('');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const locationData = { latitude, longitude };
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
      }
      
      setSuccess(`Location found: ${result.address}`);
    }
  };

  const addPinMarker = (lng, lat) => {
    // Remove existing pin marker
    if (pinMarker) {
      pinMarker.remove();
    }

    // Create draggable pin marker
    const pinElement = document.createElement('div');
    pinElement.innerHTML = '📍';
    pinElement.style.fontSize = '24px';
    pinElement.style.cursor = 'move';
    pinElement.style.zIndex = '1000';

    const marker = new Mapboxgl.Marker({
      element: pinElement,
      draggable: true
    })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Update coordinates when dragged
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat();
      setPinForm(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng
      }));
      setPinLocation({ latitude: lat, longitude: lng });
    });

    setPinMarker(marker);
  };

  const handlePinNFT = async () => {
    if (!pinForm.latitude || !pinForm.longitude || !pinForm.name.trim()) {
      setError('Please search for an address and fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/nft/pin', {
        name: pinForm.name,
        description: pinForm.description,
        ipfs_hash: pinForm.ipfs_hash,
        radius_meters: pinForm.radius_meters,
        collection_id: pinForm.collection_id,
        latitude: pinForm.latitude,
        longitude: pinForm.longitude
      });

      setSuccess('NFT pinned successfully!');
      setOpenPinDialog(false);
      
      // Clean up pin marker
      if (pinMarker) {
        pinMarker.remove();
        setPinMarker(null);
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
      <Typography variant="h4" component="h1" gutterBottom>
        NFT Dashboard
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Main Dashboard Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* NFT Manager Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<StellarIcon color="primary" />}
              title="NFT Manager"
              subheader="Connect wallet to discover nearby NFTs"
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
                    {loading ? 'Connecting...' : 'Connect Stellar Wallet'}
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Wallet Connected: {wallet?.publicKey?.substring(0, 8)}...
                  </Typography>
                  {balance !== null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Balance: {balance.toFixed(4)} XLM
                    </Typography>
                  )}
                  {autoDetectingLocation && (
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        Detecting location...
                      </Typography>
                    </Box>
                  )}
                  {userLocation && !autoDetectingLocation && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Location: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                    </Typography>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={disconnectWallet}
                    sx={{ mb: 2 }}
                  >
                    Disconnect Wallet
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<LocationIcon />}
                    onClick={getUserLocation}
                    fullWidth
                    sx={{ mb: 1 }}
                  >
                    Get My Location
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<LocationIcon />}
                    onClick={() => setOpenLocationSettings(true)}
                    fullWidth
                    sx={{ mb: 2 }}
                  >
                    Location Settings
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchNearbyNFTs}
                    fullWidth
                    disabled={!userLocation}
                  >
                    Find Nearby NFTs
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
                View and manage your collected NFTs
              </Typography>
                <Button
                  variant="contained"
                  startIcon={<CollectionsIcon />}
                  onClick={() => setTabValue(1)}
                  fullWidth
                  disabled={!isConnected || !wallet?.publicKey}
                >
                  View Collection
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
              subheader="Explore NFTs on the map"
            />
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Interactive map showing all nearby NFTs
              </Typography>
                <Button
                  variant="contained"
                  startIcon={<MapIcon />}
                  onClick={handleOpenMap}
                  fullWidth
                  disabled={!isConnected || !wallet?.publicKey || !userLocation}
                >
                  Open Map
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
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Loading nearby NFTs...
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
        
        <Paper sx={{ 
          height: '600px', 
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
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              label="Search Address"
              value={pinForm.address}
              onChange={(e) => setPinForm({ ...pinForm, address: e.target.value })}
              placeholder="Enter address (e.g., 123 Main St, New York, NY)"
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="outlined"
              onClick={handleAddressSearch}
              disabled={geocoding || !pinForm.address.trim()}
              startIcon={geocoding ? <CircularProgress size={20} /> : <LocationIcon />}
            >
              {geocoding ? 'Searching...' : 'Search'}
            </Button>
          </Box>
          
          {pinForm.latitude && pinForm.longitude && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Location found: {pinForm.latitude.toFixed(6)}, {pinForm.longitude.toFixed(6)}
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