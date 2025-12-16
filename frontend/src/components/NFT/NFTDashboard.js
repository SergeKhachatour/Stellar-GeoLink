import React, { useState, useEffect, useRef, useCallback } from 'react';
// import * as turf from '@turf/turf'; // Removed unused import
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  // Slider, // Removed unused import
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
  ZoomIn as ZoomInIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../contexts/WalletContext';
import WalletConnectionDialog from '../Wallet/WalletConnectionDialog';
import LocationSettings from '../LocationSettings';
import api from '../../services/api';
import realNFTService from '../../services/realNFTService';
import EnhancedNFTManager from './EnhancedNFTManager';
import RealPinNFT from './RealPinNFT';
import IPFSServerManager from '../IPFS/IPFSServerManager';
import FileUploadManager from '../IPFS/FileUploadManager';
import EnhancedPinNFT from '../IPFS/EnhancedPinNFT';

// IPFS Management Tabs Component
const IPFSManagementTabs = ({ user }) => {
  const [ipfsTabValue, setIpfsTabValue] = useState(0);

  const handleIpfsTabChange = (event, newValue) => {
    setIpfsTabValue(newValue);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        IPFS Management
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage your IPFS servers and upload files for NFT pinning.
      </Typography>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={ipfsTabValue} onChange={handleIpfsTabChange} aria-label="IPFS management tabs">
          <Tab label="File Uploads" {...a11yProps(0)} />
          <Tab label="IPFS Servers" {...a11yProps(1)} />
        </Tabs>
      </Box>

      {/* File Uploads Tab */}
      <TabPanel value={ipfsTabValue} index={0}>
        <FileUploadManager user={user} />
      </TabPanel>

      {/* IPFS Servers Tab */}
      <TabPanel value={ipfsTabValue} index={1}>
        <IPFSServerManager />
      </TabPanel>
    </Box>
  );
};

// Mapbox Token - Ensure this is loaded from your .env file
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
Mapboxgl.accessToken = MAPBOX_TOKEN;

// Add CSS styles for stable NFT image markers (matching XYZ-Wallet guide)
const markerStyles = `
  .nft-marker {
    width: 64px !important;
    height: 64px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 8px !important;
    border: 3px solid #FFD700 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
    overflow: hidden !important;
    /* CRITICAL: Disable transitions to prevent animation, but allow Mapbox transforms for positioning */
    transition: none !important;
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

// Helper function to construct IPFS URL from server_url and hash
// Matches the implementation in EnhancedPinNFT.js for consistency
// Handles cases where server_url might already contain /ipfs/ path
// Always uses the hash from ipfs_hash field, not from server_url
const constructIPFSUrl = (serverUrl, hash) => {
  if (!hash) return null;
  if (!serverUrl) return `https://ipfs.io/ipfs/${hash}`; // Fallback to public gateway
  
  let baseUrl = serverUrl.trim();
  
  // Remove any existing /ipfs/ path and everything after it
  // This handles cases where server_url might be: "domain.com/ipfs/somehash" or "domain.com/ipfs/somehash/"
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

const NFTDashboard = () => {
  const { user } = useAuth();
  const { wallet, disconnectWallet, isConnected, balance, connectWalletViewOnly, clearWalletCompletely, publicKey, setUser } = useWallet();
  
  // Flag to prevent auto-connection after manual disconnect
  const [hasManuallyDisconnected, setHasManuallyDisconnected] = useState(false);
  
  // Wrapper function for disconnect that sets the flag
  const handleDisconnect = () => {
    console.log('NFTDashboard: Manual disconnect triggered');
    setHasManuallyDisconnected(true);
    disconnectWallet();
  };
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
  const [openRealPinDialog, setOpenRealPinDialog] = useState(false);
  const [openEnhancedPinDialog, setOpenEnhancedPinDialog] = useState(false);
  const [pinLocation, setPinLocation] = useState(null);
  const [miniMap, setMiniMap] = useState(null);
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
  // const [addedRadiusCircles, setAddedRadiusCircles] = useState(new Set()); // Removed unused variables
  const [geocoding, setGeocoding] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [collectionFetched, setCollectionFetched] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapView, setMapView] = useState('3d'); // '2d', '3d', 'satellite'
  // const [showFilters, setShowFilters] = useState(false); // Removed unused variables
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedRarity, setSelectedRarity] = useState('');
  const [radiusFilter] = useState(1000); // Removed setRadiusFilter as it's unused
  // Clustering removed - individual markers only
  // const [markerUpdateTimeout, setMarkerUpdateTimeout] = useState(null); // Removed unused variable
  const [isUserMovingMap, setIsUserMovingMap] = useState(false);
  const [markersStable, setMarkersStable] = useState(false);
  const [markersCreated, setMarkersCreated] = useState(false);
  const [markersLocked, setMarkersLocked] = useState(false);
  const [markersNeverUpdate, setMarkersNeverUpdate] = useState(false);
  const [showPinSuccess, setShowPinSuccess] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState(null);
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
          full_ipfs_url: constructIPFSUrl(nftData.server_url, nftData.ipfs_hash),
          collection: {
            ...collectionData,
            full_image_url: constructIPFSUrl(collectionData.server_url, collectionData.image_url)
          },
          // Preserve associations if they exist
          associations: nftData.associations || item.associations
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
      const response = await api.get('/nft/dashboard/nearby', {
        params: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radius: 999999999 // Very large radius to get ALL NFTs globally
        }
      });
      
      console.log('Nearby NFTs API response:', response.data);
      
      // Process the NFTs to add full IPFS URLs using dynamic server_url
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: constructIPFSUrl(nft.server_url, nft.ipfs_hash),
        collection: {
          ...nft.collection,
          full_image_url: constructIPFSUrl(nft.server_url, nft.collection?.image_url)
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
      const response = await api.get('/nft/dashboard/nearby', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          radius: 999999999 // Very large radius to get ALL NFTs globally
        }
      });
      
      console.log('Nearby NFTs API response (with location):', response.data);
      
      // Process the NFTs to add full IPFS URLs using dynamic server_url
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: constructIPFSUrl(nft.server_url, nft.ipfs_hash),
        collection: {
          ...nft.collection,
          full_image_url: constructIPFSUrl(nft.server_url, nft.collection?.image_url)
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

  // Debounced marker update to prevent excessive updates - REMOVED UNUSED
  // const debouncedUpdateMarkers = useCallback((mapType = 'main') => {
  //   // Clear existing timeout
  //   if (markerUpdateTimeout) {
  //     clearTimeout(markerUpdateTimeout);
  //   }
  //   
  //   // Set new timeout
  //   const timeout = setTimeout(() => {
  //     updateMapMarkers(mapType);
  //     setMarkerUpdateTimeout(null);
  //   }, 500); // 500ms debounce
  //   
  //   setMarkerUpdateTimeout(timeout);
  // }, [markerUpdateTimeout]);

  // Helper function to calculate distance between two points - REMOVED UNUSED
  // const calculateDistance = (lat1, lon1, lat2, lon2) => {
  //   const R = 6371e3; // Earth's radius in meters
  //   const φ1 = lat1 * Math.PI/180;
  //   const φ2 = lat2 * Math.PI/180;
  //   const Δφ = (lat2-lat1) * Math.PI/180;
  //   const Δλ = (lon2-lon1) * Math.PI/180;

  //   const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
  //           Math.cos(φ1) * Math.cos(φ2) *
  //           Math.sin(Δλ/2) * Math.sin(Δλ/2);
  //   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  //   return R * c; // Distance in meters
  // };

  // Helper functions for radius circles - REMOVED UNUSED
  // const clearAllRadiusCircles = (map) => { ... }
  // const addRadiusCircle = (map, lng, lat, radiusMeters) => { ... }

  // Function to create a single NFT marker
  const createSingleMarker = useCallback((nft, map, nftIndex = 0, markersRef = null) => {
    try {
      console.log(`🎯 Creating single marker for NFT ${nft.id} at index ${nftIndex}`);
      
      // Use the passed markersRef or fall back to currentMarkers
      const currentMarkersRef = markersRef || currentMarkers;
      
      // Check if marker already exists
      if (currentMarkersRef.current[nft.id]) {
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

      // Use exact NFT coordinates without any offsets
      let finalLng = parseFloat(nft.longitude);
      let finalLat = parseFloat(nft.latitude);
      
      // Globe projection coordinate handling
      // Ensure coordinates are in proper WGS84 format for globe projection
      if (map.getProjection()?.name === 'globe') {
        // Globe projection requires coordinates to be in WGS84 decimal degrees
        // Ensure longitude is between -180 and 180, latitude between -90 and 90
        if (finalLng < -180) finalLng += 360;
        if (finalLng > 180) finalLng -= 360;
        if (finalLat < -90) finalLat = -90;
        if (finalLat > 90) finalLat = 90;
        
        console.log(`🌍 Globe projection: Normalized coordinates for NFT ${nft.id}:`, { lng: finalLng, lat: finalLat });
      }
      
      // TEMPORARY FIX: Check if coordinates seem to be swapped
      // If longitude is in latitude range and vice versa, swap them
      if (Math.abs(finalLng) <= 90 && Math.abs(finalLat) > 90) {
        console.log(`🔄 COORDINATE SWAP DETECTED for NFT ${nft.id}: Swapping lat/lng`);
        const temp = finalLng;
        finalLng = finalLat;
        finalLat = temp;
      }
      
      // Additional check: If coordinates are clearly in the ocean, try swapping
      // Ocean coordinates are typically outside normal land boundaries
      if (Math.abs(finalLng) > 180 || Math.abs(finalLat) > 90) {
        console.log(`🔄 INVALID COORDINATES for NFT ${nft.id}: Trying coordinate swap`);
        const temp = finalLng;
        finalLng = finalLat;
        finalLat = temp;
      }
      
      // Check if coordinates might be in UTM or another coordinate system
      // UTM coordinates are typically much larger numbers (hundreds of thousands)
      if (Math.abs(finalLng) > 1000 || Math.abs(finalLat) > 1000) {
        console.log(`🚨 LARGE COORDINATES for NFT ${nft.id}: Possible UTM or other coordinate system`, { lng: finalLng, lat: finalLat });
        console.log(`🚨 These coordinates are likely in UTM or another system, not WGS84 GPS coordinates`);
      }
      
      // Debug: Log raw coordinate values
      console.log(`🔍 Raw coordinates for NFT ${nft.id}:`, {
        rawLongitude: nft.longitude,
        rawLatitude: nft.latitude,
        parsedLng: finalLng,
        parsedLat: finalLat,
        coordinateType: typeof nft.longitude,
        isString: typeof nft.longitude === 'string',
        stringLength: typeof nft.longitude === 'string' ? nft.longitude.length : 'N/A'
      });
      
      console.log(`NFT ${nft.id} coordinates:`, {
        lat: finalLat,
        lng: finalLng,
        name: nft.name,
        nftIndex,
        originalCoords: { lat: nft.latitude, lng: nft.longitude }
      });
      
      // Debug: Check if coordinates are reasonable
      if (Math.abs(finalLng) > 180 || Math.abs(finalLat) > 90) {
        console.error(`🚨 INVALID COORDINATES for NFT ${nft.id}:`, { lat: finalLat, lng: finalLng });
      }
      
      // Debug: Check if coordinates are in expected ranges
      // California should be roughly: -124 to -114 longitude, 32 to 42 latitude
      // Rio de Janeiro should be roughly: -43 to -42 longitude, -23 to -22 latitude
      if (finalLng >= -124 && finalLng <= -114 && finalLat >= 32 && finalLat <= 42) {
        console.log(`✅ NFT ${nft.id} appears to be in California region`);
      } else if (finalLng >= -43 && finalLng <= -42 && finalLat >= -23 && finalLat <= -22) {
        console.log(`✅ NFT ${nft.id} appears to be in Rio de Janeiro region`);
      } else {
        console.log(`❓ NFT ${nft.id} coordinates don't match expected regions:`, { lat: finalLat, lng: finalLng });
        
        // Test if swapping lat/lng makes more sense
        const swappedLng = finalLat;
        const swappedLat = finalLng;
        console.log(`🔄 Testing swapped coordinates for NFT ${nft.id}:`, { lat: swappedLat, lng: swappedLng });
        
        if (swappedLng >= -124 && swappedLng <= -114 && swappedLat >= 32 && swappedLat <= 42) {
          console.log(`🔄 SWAPPED: NFT ${nft.id} would be in California region if coordinates were swapped`);
        } else if (swappedLng >= -43 && swappedLng <= -42 && swappedLat >= -23 && swappedLat <= -22) {
          console.log(`🔄 SWAPPED: NFT ${nft.id} would be in Rio de Janeiro region if coordinates were swapped`);
        }
      }

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

      // Create marker element (matching XYZ-Wallet guide - using background-image CSS property)
      const el = document.createElement('div');
      el.className = 'nft-marker'; // Use CSS class (defined in stylesheet above)
      
      // Construct image URL using the utility function
      const imageUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/48x48?text=NFT';
      
      // Set only dynamic styles inline (background-image) - matching XYZ-Wallet guide
      // Set background image immediately
      el.style.backgroundImage = `url('${imageUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      
      // CRITICAL: Disable transitions that interfere with Mapbox positioning
      // NOTE: Do NOT set transform: none - Mapbox needs to transform markers for positioning
      el.style.transition = 'none';
      
      // Handle image load errors with fallback - ensure image loads before setting background
      const img = new Image();
      img.onload = () => {
        // Image loaded successfully, ensure background is set
        el.style.backgroundImage = `url('${imageUrl}')`;
      };
      img.onerror = () => {
        console.log('Image failed to load:', imageUrl);
        el.style.backgroundImage = 'none';
        el.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        el.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
        el.style.fontSize = '16px';
      el.style.fontWeight = 'bold';
      el.style.color = '#fff';
      };
      img.src = imageUrl; // Trigger image load check

      // Add click handler to show NFT details
      // Add click handler for NFT details with delay to allow double-click
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
          console.log('NFT marker clicked:', nft);
          handleNFTDetails(nft);
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
        
        console.log('NFT marker double-clicked, zooming in:', nft);
        console.log('Map reference for double-click:', map);
        console.log('Map type:', map === overlayMap.current ? 'overlay' : 'main');
        
        map.flyTo({
          center: [finalLng, finalLat],
          zoom: 18,
          duration: 1000
        });
      });

      // Create marker (matching XYZ-Wallet guide - draggable: false for stable positioning)
      const marker = new Mapboxgl.Marker({
        element: el,
        draggable: false // CRITICAL: Must be false for stable positioning
      })
      .setLngLat([finalLng, finalLat])
      .addTo(map);

      // Store marker reference
      console.log(`🎯 Before storing marker ${nft.id} - currentMarkers ref:`, currentMarkersRef.current);
      currentMarkersRef.current[nft.id] = marker;
      console.log(`🎯 After storing marker ${nft.id} - currentMarkers ref:`, currentMarkersRef.current);
      
      console.log(`NFT image marker created for NFT ${nft.id} at:`, [finalLng, finalLat]);
      console.log(`Stored marker in currentMarkers:`, Object.keys(currentMarkersRef.current));
    } catch (error) {
      console.error(`Error creating marker for NFT ${nft.id}:`, error);
    }
  }, [currentMarkers]);


  // Function to create individual markers when zoomed in
  const createIndividualMarkers = useCallback((nfts, map, markersRef) => {
    console.log(`🎯 createIndividualMarkers called with ${nfts.length} NFTs`);
    nfts.forEach((nft, nftIndex) => {
      console.log(`🎯 Processing NFT ${nftIndex}: ${nft.id}`);
      createSingleMarker(nft, map, nftIndex, markersRef);
    });
  }, [createSingleMarker]);



  const updateMapMarkers = useCallback((mapType = 'main', forceUpdate = false) => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    // Use global references directly instead of local variables
    const currentMarkersRef = mapType === 'overlay' ? overlayMarkers : markers;
    
    const callId = Math.random().toString(36).substr(2, 9);
    console.log(`[${callId}] updateMapMarkers called: mapType=${mapType}, forceUpdate=${forceUpdate}, markersCreated=${markersCreated}, markersLocked=${markersLocked}`);
    console.log(`[${callId}] Pin marker protected: ${pinMarkerProtected}, pin marker exists: ${!!pinMarker}`);
    console.log(`[${callId}] Current map reference:`, currentMap.current);
    console.log(`[${callId}] Map type check:`, currentMap === overlayMap ? 'overlay' : 'main');
    
    // DEBOUNCE: Prevent multiple rapid calls
    if (updateMapMarkers._lastCall && Date.now() - updateMapMarkers._lastCall < 100) {
      console.log(`[${callId}] 🚫 Debouncing rapid call, skipping`);
      return;
    }
    updateMapMarkers._lastCall = Date.now();
    
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
    
    // AGGRESSIVE PROTECTION: If markers exist and are positioned correctly, don't update them
    if (markersCreated && Object.keys(currentMarkersRef.current).length > 0 && !forceUpdate) {
      console.log('🚫 Markers already exist and are positioned - preventing any updates');
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
      
      console.log(`Creating markers for ${nearbyNFTs.length} NFTs with zoom-based clustering (zoom: ${currentZoom.toFixed(2)})`);
      console.log(`🔍 nearbyNFTs data:`, nearbyNFTs);
      console.log(`🔍 nearbyNFTs length:`, nearbyNFTs.length);
      
      // Check if any markers were recently dragged
      const hasRecentlyDraggedMarkers = Object.values(currentMarkersRef.current).some(marker => 
        marker && marker._wasRecentlyDragged
      );
      
      if (hasRecentlyDraggedMarkers) {
        console.log(`[${callId}] 🚫 Recently dragged markers detected, skipping all marker updates`);
        return;
      }
      
      // Only prevent recreation if we're not forcing an update
      if (markersCreated && Object.keys(currentMarkersRef.current).length > 0 && !forceUpdate) {
        console.log(`[${callId}] 🚫 Markers already exist, preventing recreation. Current markers:`, Object.keys(currentMarkersRef.current));
        return;
      }
      
      // Allow updates when zoom level changes significantly

      // Only clear markers if we need to recreate them
      const hasExistingMarkers = Object.keys(currentMarkersRef.current).length > 0;
      const needsRecreation = forceUpdate || !hasExistingMarkers;
      
      // Additional check: if markers were just created (within last 500ms), don't clear them
      const markersJustCreated = Object.values(currentMarkersRef.current).some(marker => 
        marker._lastUpdated && (Date.now() - marker._lastUpdated) < 500
      );
      
      if (markersJustCreated && !forceUpdate) {
        console.log(`[${callId}] ✅ Markers were just created, skipping clearing`);
        return;
      }
      
      if (needsRecreation) {
        console.log(`[${callId}] 🗑️ Clearing existing markers for recreation...`);
        console.log(`[${callId}] 🗑️ Current markers before clearing:`, Object.keys(currentMarkersRef.current));
        console.log(`[${callId}] 🗑️ needsRecreation: ${needsRecreation}, hasExistingMarkers: ${hasExistingMarkers}, forceUpdate: ${forceUpdate}`);
        
        // Remove all tracked markers from the map, but preserve recently dragged ones
        Object.values(currentMarkersRef.current).forEach(marker => {
          if (marker && typeof marker.remove === 'function') {
            // Don't remove recently dragged markers
            if (marker._wasRecentlyDragged) {
              console.log(`🚫 Preserving recently dragged marker: ${marker._nftId || 'unknown'}`);
              return;
            }
            marker.remove();
          }
        });
        
        // Also clear any orphaned markers that might exist in the DOM
        const mapContainer = currentMap.current.getContainer();
        const orphanedMarkers = mapContainer.querySelectorAll('.cluster-marker, .nft-marker');
        console.log(`[${callId}] 🗑️ Found ${orphanedMarkers.length} orphaned markers to remove`);
        orphanedMarkers.forEach(marker => {
          if (marker && marker.parentNode) {
            marker.parentNode.removeChild(marker);
          }
        });
        
        // Clear the markers object completely
        console.log(`[${callId}] 🗑️ Before clearing - currentMarkers ref:`, currentMarkersRef.current);
        console.log(`[${callId}] 🗑️ Before clearing - currentMarkers keys:`, Object.keys(currentMarkersRef.current));
        currentMarkersRef.current = {};
        console.log(`[${callId}] 🗑️ After clearing - currentMarkers ref:`, currentMarkersRef.current);
        console.log(`[${callId}] 🗑️ After clearing - currentMarkers keys:`, Object.keys(currentMarkersRef.current));
        
        console.log(`[${callId}] 🗑️ Markers cleared, current count:`, Object.keys(currentMarkersRef.current).length);
      } else {
        console.log(`[${callId}] ✅ Markers already exist, skipping clearing`);
        console.log(`[${callId}] ✅ Current markers:`, Object.keys(currentMarkersRef.current));
        return; // Exit early if markers already exist and we don't need to recreate
      }
      
      // Always create individual markers (no clustering) - matching XYZ-Wallet guide
      console.log(`[${callId}] 🔍 Creating individual markers for all NFTs (zoom:`, currentZoom, ')');
        console.log(`[${callId}] 🔍 Number of NFTs to create individual markers for:`, nearbyNFTs.length);
        createIndividualMarkers(nearbyNFTs, currentMap.current, currentMarkersRef);
        console.log(`[${callId}] 🔍 After individual marker creation, markers:`, Object.keys(currentMarkersRef.current));
        console.log(`[${callId}] 🔍 Total markers stored:`, Object.keys(currentMarkersRef.current).length);
        console.log(`[${callId}] 🔍 currentMarkers ref after individual creation:`, currentMarkersRef.current);
      
      // Mark markers as created
      console.log(`[${callId}] ✅ Setting markersCreated to true`);
      setMarkersCreated(true);
      
      // AGGRESSIVE: Set markers to never update once they're positioned correctly
      console.log(`[${callId}] 🔒 LOCKING markers to prevent any future updates`);
      setMarkersNeverUpdate(true);
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
  }, [nearbyNFTs, map, overlayMap, markers, overlayMarkers, markersCreated, markersLocked, markersStable, isUserMovingMap, markersNeverUpdate, pinMarkerProtected, pinMarker, createIndividualMarkers, mapLoading]);

  // Filter Functions - Fetch filtered data from API
  const applyFilters = useCallback(async () => {
    console.log('🔍 applyFilters called');
    console.log('🔍 Current filter state:', { selectedCollection, selectedRarity, radiusFilter });
    console.log('🔍 Current nearbyNFTs count:', nearbyNFTs.length);
    
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
        console.log('🔍 No valid coordinates, using existing nearbyNFTs');
        setError('Location not available for filtering. Please enable location access.');
        setLoading(false);
        return;
      }
      
      // Add collection filter if selected
      if (selectedCollection) {
        params.collection_id = selectedCollection;
        console.log('🔍 Added collection filter:', selectedCollection);
      }
      
      // Add rarity filter if selected
      if (selectedRarity) {
        params.rarity_level = selectedRarity;
        console.log('🔍 Added rarity filter:', selectedRarity);
      }
      
      // Fetch filtered data from API
      console.log('🔍 Applying filters with params:', params);
      console.log('🔍 Filter state:', { selectedCollection, selectedRarity, radiusFilter });
      const response = await api.get('/nft/nearby', { params });
      console.log('🔍 Filter API response:', response.data);
      const filteredNFTs = response.data.nfts || [];
      console.log('🔍 Filtered NFTs count:', filteredNFTs.length);
      
      // Update state with filtered results
      setNearbyNFTs(filteredNFTs);
      
      // Update map markers with filtered results using the existing function
      console.log('🔍 Resetting marker states for filter update');
      setMarkersStable(false); // Reset stability when filters change
      setMarkersLocked(false); // Reset lock when filters change
      setMarkersNeverUpdate(false); // Reset never update when filters change
      
      console.log('🔍 Calling updateMapMarkers with filtered NFTs:', filteredNFTs.length);
      updateMapMarkers('main', true); // Force update when filters change
      
      setSuccess(`Found ${filteredNFTs.length} NFTs matching your filters`);
    } catch (error) {
      console.error('Error applying filters:', error);
      setError('Failed to apply filters');
    } finally {
      setLoading(false);
    }
  }, [selectedCollection, selectedRarity, radiusFilter, nearbyNFTs, setLoading, setError, setNearbyNFTs, setSuccess, updateMapMarkers, userLocation?.lat, userLocation?.latitude, userLocation?.lng, userLocation?.longitude]);

  // Custom NFT Filter Control for Mapbox
  const createNFTFilterControl = useCallback(() => {
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
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; cursor: pointer;" id="collections-header">
            <div style="font-weight: bold; color: #333;">📚 Collections</div>
            <div style="font-size: 14px; color: #666;" id="collections-toggle">▶</div>
          </div>
          <div id="collections-content" style="display: none; flex-direction: column; gap: 10px;">
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
          </div>
        `;
        
        // Add collapsible functionality for Collections
        const collectionsHeader = this._container.querySelector('[id="collections-header"]');
        const collectionsContent = this._container.querySelector('[id="collections-content"]');
        const collectionsToggle = this._container.querySelector('[id="collections-toggle"]');
        
        collectionsHeader.addEventListener('click', () => {
          const isVisible = collectionsContent.style.display !== 'none';
          collectionsContent.style.display = isVisible ? 'none' : 'flex';
          collectionsToggle.textContent = isVisible ? '▶' : '▼';
        });
        
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
        
        // Manual apply button
        applyButton.addEventListener('click', () => {
          console.log('Apply filters button clicked');
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
  }, [setSelectedCollection, setSelectedRarity, applyFilters]);

  // Create custom 3D control panel
  const createCustom3DControl = () => {
    const control = {
      onAdd: function(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this._container.style.background = 'rgba(255, 255, 255, 0.9)';
        this._container.style.borderRadius = '8px';
        this._container.style.padding = '10px';
        this._container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        
        // 3D Controls HTML with collapsible functionality
        this._container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; cursor: pointer;" id="3d-controls-header">
            <div style="font-weight: bold; color: #333;">🌍 3D Globe Controls</div>
            <div style="font-size: 14px; color: #666;" id="3d-controls-toggle">▶</div>
          </div>
          <div id="3d-controls-content" style="display: none; flex-direction: column; gap: 8px;">
            <button id="reset-view" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
              🎯 Reset View
            </button>
            <button id="orbit-earth" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
              🌎 Orbit Earth
            </button>
            <button id="toggle-terrain" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
              🏔️ Toggle Terrain
            </button>
            <button id="toggle-buildings" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
              🏢 Toggle Buildings
            </button>
            <button id="toggle-fog" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
              🌫️ Toggle Fog
            </button>
            <div style="margin-top: 5px;">
              <label style="font-size: 12px; color: #666;">Pitch: <span id="pitch-value">0°</span></label><br>
              <input type="range" id="pitch-slider" min="0" max="85" value="0" style="width: 100%; margin-top: 2px;">
            </div>
            <div style="margin-top: 5px;">
              <label style="font-size: 12px; color: #666;">Bearing: <span id="bearing-value">0°</span></label><br>
              <input type="range" id="bearing-slider" min="0" max="360" value="0" style="width: 100%; margin-top: 2px;">
            </div>
          </div>
        `;
        
        // Add collapsible functionality
        const header = this._container.querySelector('[id="3d-controls-header"]');
        const content = this._container.querySelector('[id="3d-controls-content"]');
        const toggle = this._container.querySelector('[id="3d-controls-toggle"]');
        
        header.addEventListener('click', () => {
          const isVisible = content.style.display !== 'none';
          content.style.display = isVisible ? 'none' : 'flex';
          toggle.textContent = isVisible ? '▶' : '▼';
        });
        
        // Add event listeners
        this._container.querySelector('#reset-view').addEventListener('click', () => {
          map.flyTo({
            center: [0, 0],
            zoom: 1,
            pitch: 0,
            bearing: 0,
            duration: 2000
          });
        });
        
        this._container.querySelector('#orbit-earth').addEventListener('click', () => {
          let bearing = 0;
          const orbit = () => {
            bearing += 1;
            map.setBearing(bearing);
            if (bearing < 360) {
              requestAnimationFrame(orbit);
            }
          };
          orbit();
        });
        
        let terrainEnabled = true;
        this._container.querySelector('#toggle-terrain').addEventListener('click', () => {
          try {
            if (terrainEnabled) {
              map.setTerrain(null);
              terrainEnabled = false;
              this._container.querySelector('#toggle-terrain').textContent = '🏔️ Enable Terrain';
            } else {
              map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
              terrainEnabled = true;
              this._container.querySelector('#toggle-terrain').textContent = '🏔️ Disable Terrain';
            }
          } catch (error) {
            console.warn('Terrain toggle failed:', error.message);
            this._container.querySelector('#toggle-terrain').textContent = '🏔️ Terrain Unavailable';
          }
        });
        
        let buildingsEnabled = true;
        this._container.querySelector('#toggle-buildings').addEventListener('click', () => {
          if (buildingsEnabled) {
            map.setLayoutProperty('3d-buildings', 'visibility', 'none');
            buildingsEnabled = false;
            this._container.querySelector('#toggle-buildings').textContent = '🏢 Show Buildings';
          } else {
            map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
            buildingsEnabled = true;
            this._container.querySelector('#toggle-buildings').textContent = '🏢 Hide Buildings';
          }
        });
        
        let fogEnabled = true;
        this._container.querySelector('#toggle-fog').addEventListener('click', () => {
          try {
            // Ensure map style is loaded before toggling fog
            if (!map.isStyleLoaded()) {
              console.warn('Map style not loaded, cannot toggle fog');
              return;
            }
            
            if (fogEnabled) {
              map.setFog(null);
              fogEnabled = false;
              this._container.querySelector('#toggle-fog').textContent = '🌫️ Enable Fog';
            } else {
              map.setFog({
                color: 'rgb(186, 210, 235)',
                'high-color': 'rgb(36, 92, 223)',
                'horizon-blend': 0.02,
                'space-color': 'rgb(11, 11, 25)',
                'star-intensity': 0.6
              });
              fogEnabled = true;
              this._container.querySelector('#toggle-fog').textContent = '🌫️ Disable Fog';
            }
          } catch (error) {
            console.warn('Fog toggle failed:', error.message);
            this._container.querySelector('#toggle-fog').textContent = '🌫️ Fog Unavailable';
            fogEnabled = false; // Reset state on error
          }
        });
        
        // Pitch slider
        const pitchSlider = this._container.querySelector('#pitch-slider');
        const pitchValue = this._container.querySelector('#pitch-value');
        pitchSlider.addEventListener('input', (e) => {
          const pitch = parseInt(e.target.value);
          map.setPitch(pitch);
          pitchValue.textContent = pitch + '°';
        });
        
        // Bearing slider
        const bearingSlider = this._container.querySelector('#bearing-slider');
        const bearingValue = this._container.querySelector('#bearing-value');
        bearingSlider.addEventListener('input', (e) => {
          const bearing = parseInt(e.target.value);
          map.setBearing(bearing);
          bearingValue.textContent = bearing + '°';
        });
        
        // Update sliders when map changes
        map.on('pitch', () => {
          const pitch = Math.round(map.getPitch());
          pitchSlider.value = pitch;
          pitchValue.textContent = pitch + '°';
        });
        
        map.on('bearing', () => {
          const bearing = Math.round(map.getBearing());
          bearingSlider.value = bearing;
          bearingValue.textContent = bearing + '°';
        });
        
        return this._container;
      },
      
      onRemove: function() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    };
    
    return control;
  };

  const initializeMap = useCallback((container, mapType) => {
    const currentMap = mapType === 'overlay' ? overlayMap : map;
    
    if (currentMap.current) {
      console.log('Map already initialized for', mapType);
      return;
    }

    console.log('Initializing map for', mapType, 'with container:', container);
    console.log('Mapbox token check:', process.env.REACT_APP_MAPBOX_TOKEN ? 'Token exists' : 'No token found');
    console.log('Token value:', process.env.REACT_APP_MAPBOX_TOKEN ? process.env.REACT_APP_MAPBOX_TOKEN.substring(0, 10) + '...' : 'undefined');

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      setError('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      return;
    }

    console.log('Mapbox token found, initializing map...');

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
        optimizeForTerrain: true, // Optimize for 3D terrain
        // Advanced 3D settings
        maxPitch: 85, // Allow extreme pitch angles
        maxZoom: 22, // Maximum zoom level
        minZoom: 0, // Minimum zoom level
        maxBounds: [[-180, -85], [180, 85]], // Prevent over-rotation
        // Enhanced 3D rendering
        renderWorldCopies: false, // Don't render world copies for better performance
        interactive: true, // Enable all interactions
        // Advanced globe settings
        globe: {
          enableAtmosphere: true, // Enable atmospheric glow
          atmosphereColor: '#FFD700', // Stellar gold atmosphere
          atmosphereIntensity: 0.3, // Subtle atmosphere
          enableStars: true, // Enable star field
          starIntensity: 0.5 // Star visibility
        }
      });

      console.log('Map created for', mapType);

      currentMap.current.on('load', () => {
        console.log('Map loaded for', mapType);
        
        // Add enhanced navigation control with 3D features
        const navControl = new Mapboxgl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
          showFullscreen: true
        });
        currentMap.current.addControl(navControl, 'top-right');
        
        // Move all top controls down to avoid title overlay
        setTimeout(() => {
          // Move top-right controls (navigation, geolocate, fullscreen)
          const topRightControls = currentMap.current.getContainer().querySelectorAll('.mapboxgl-ctrl-top-right');
          topRightControls.forEach(control => {
            control.style.top = '80px'; // Move down by title overlay height
          });
          
          // Move top-left controls (custom 3D control)
          const topLeftControls = currentMap.current.getContainer().querySelectorAll('.mapboxgl-ctrl-top-left');
          topLeftControls.forEach(control => {
            control.style.top = '80px'; // Move down by title overlay height
          });
        }, 100);
        
        // Note: TerrainControl and SkyControl are not standard Mapbox GL JS controls
        // They require additional extensions. Using custom 3D control panel instead.

        // Add scale control
        currentMap.current.addControl(new Mapboxgl.ScaleControl({
          maxWidth: 100,
          unit: 'metric'
        }), 'bottom-left');
        
        // Add custom 3D control panel
        const custom3DControl = createCustom3DControl();
        currentMap.current.addControl(custom3DControl, 'top-left');

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

        // Add double-click zoom functionality
        currentMap.current.on('dblclick', (e) => {
          console.log('Map double-clicked, zooming in to:', e.lngLat);
          currentMap.current.flyTo({
            center: [e.lngLat.lng, e.lngLat.lat],
            zoom: 18,
            duration: 1000
          });
        });

        // Add custom NFT filter control
        const nftFilterControl = createNFTFilterControl();
        currentMap.current.addControl(nftFilterControl, 'top-left');

        // Zoom listener removed - markers stay locked to coordinates
        // addZoomListener(currentMap.current);

        // Add comprehensive 3D layers and effects
        try {
          // Add 3D buildings with enhanced styling
          if (currentMap.current.getSource('composite')) {
            currentMap.current.addLayer({
              id: '3d-buildings',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 10,
              paint: {
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'height'],
                  0, '#87CEEB',
                  50, '#4682B4',
                  100, '#4169E1',
                  200, '#0000CD'
                ],
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
                'fill-extrusion-opacity': 0.8
              }
            });
            console.log('Enhanced 3D buildings layer added');
          }
          
          // Add 3D terrain with exaggeration (if supported)
          try {
            currentMap.current.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14
            });
            
            // Add terrain layer
            currentMap.current.setTerrain({
              source: 'mapbox-dem',
              exaggeration: 1.5
            });
            console.log('3D terrain added successfully');
          } catch (terrainError) {
            console.warn('3D terrain not supported:', terrainError.message);
          }
          
          // Add fog for depth perception (if supported)
          // Only set fog after ensuring map style is fully loaded
          try {
            if (currentMap.current && currentMap.current.isStyleLoaded()) {
              currentMap.current.setFog({
                color: 'rgb(186, 210, 235)',
                'high-color': 'rgb(36, 92, 223)',
                'horizon-blend': 0.02,
                'space-color': 'rgb(11, 11, 25)',
                'star-intensity': 0.6
              });
              console.log('Fog effects added successfully');
            } else {
              // Wait for style to load before setting fog
              currentMap.current.once('style.load', () => {
                try {
                  if (currentMap.current) {
                    currentMap.current.setFog({
                      color: 'rgb(186, 210, 235)',
                      'high-color': 'rgb(36, 92, 223)',
                      'horizon-blend': 0.02,
                      'space-color': 'rgb(11, 11, 25)',
                      'star-intensity': 0.6
                    });
                    console.log('Fog effects added after style load');
                  }
                } catch (fogError) {
                  console.warn('Fog effects not supported after style load:', fogError.message);
                }
              });
            }
          } catch (fogError) {
            console.warn('Fog effects not supported:', fogError.message);
          }
          
          console.log('3D terrain, fog, and enhanced buildings added');
        } catch (error) {
          console.log('Could not add 3D layers:', error.message);
        }

        // Mapbox handles marker positioning automatically when transition: none is applied
        // No manual marker repositioning needed - XYZ-Wallet approach

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
  }, [userLocation, nearbyNFTs, updateMapMarkers, pinMarkerProtected, pinMarker, createNFTFilterControl]);


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

  // Set user in wallet context when user changes
  useEffect(() => {
    if (user) {
      console.log('NFTDashboard: Setting user in wallet context:', user);
      setUser(user);
    } else {
      console.log('NFTDashboard: No user, clearing wallet context');
      setUser(null);
    }
  }, [user, setUser]);

  // Initialize mini map when NFT details dialog opens
  useEffect(() => {
    if (openNFTDialog && selectedNFT) {
      const initializeMiniMap = () => {
        const mapContainer = document.getElementById('nft-details-mini-map');
        if (mapContainer && !miniMap) {
          // Clear any existing map first
          if (miniMap && typeof miniMap.remove === 'function') {
            try {
              miniMap.remove();
            } catch (error) {
              console.warn('Error removing existing mini map:', error);
            }
          }
          const miniMapInstance = new Mapboxgl.Map({
            container: 'nft-details-mini-map',
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [parseFloat(selectedNFT.longitude), parseFloat(selectedNFT.latitude)],
            zoom: 15,
            interactive: true
          });

          // Add marker for NFT location
          new Mapboxgl.Marker({ color: 'red' })
            .setLngLat([parseFloat(selectedNFT.longitude), parseFloat(selectedNFT.latitude)])
            .addTo(miniMapInstance);

          // Add circle for collection radius
          miniMapInstance.on('load', () => {
            miniMapInstance.addSource('nft-radius', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [parseFloat(selectedNFT.longitude), parseFloat(selectedNFT.latitude)]
                }
              }
            });

            miniMapInstance.addLayer({
              id: 'nft-radius-circle',
              type: 'circle',
              source: 'nft-radius',
              paint: {
                'circle-radius': {
                  stops: [
                    [0, 0],
                    [20, selectedNFT.radius_meters || 50]
                  ],
                  base: 2
                },
                'circle-color': '#ff0000',
                'circle-opacity': 0.2,
                'circle-stroke-color': '#ff0000',
                'circle-stroke-width': 2
              }
            });
          });

          setMiniMap(miniMapInstance);
        }
      };

      // Small delay to ensure DOM is ready
      setTimeout(initializeMiniMap, 100);
    }

    // Cleanup mini map when dialog closes
    return () => {
      if (miniMap && typeof miniMap.remove === 'function') {
        try {
          miniMap.remove();
        } catch (error) {
          console.warn('Error removing mini map:', error);
        }
        setMiniMap(null);
      }
    };
  }, [openNFTDialog, selectedNFT, miniMap]);

  // Auto-connect wallet using user's stored public key
  useEffect(() => {
    console.log('NFTDashboard: Auto-connect effect triggered', { 
      user: user ? { id: user.id, email: user.email, public_key: user.public_key, allKeys: Object.keys(user) } : null,
      isConnected, 
      publicKey 
    });
    
    if (user && user.public_key) {
      console.log('NFTDashboard: User logged in with public key:', user.public_key);
      console.log('NFTDashboard: Current wallet connection state:', { isConnected, publicKey });
      console.log('NFTDashboard: Has manually disconnected:', hasManuallyDisconnected);
      
      // Check if we need to reconnect (different user or not connected)
      const needsReconnection = !isConnected || (publicKey && publicKey !== user.public_key);
      const isDifferentUser = publicKey && publicKey !== user.public_key;
      
      if (isDifferentUser) {
        console.log('NFTDashboard: Different user detected, clearing wallet completely');
        clearWalletCompletely();
        setHasManuallyDisconnected(false); // Reset flag for new user
      }
      
      if (needsReconnection && !hasManuallyDisconnected) {
        console.log('NFTDashboard: Wallet needs reconnection:', { needsReconnection, currentPublicKey: publicKey, userPublicKey: user.public_key });
        
        // Add a longer delay to allow wallet restoration to complete first
        const connectTimeout = setTimeout(() => {
          // Double-check that we still need to connect and haven't manually disconnected
          if (!isConnected || (publicKey && publicKey !== user.public_key)) {
            console.log('NFTDashboard: Attempting wallet auto-connection...');
            connectWalletViewOnly(user.public_key).catch(error => {
              console.error('NFTDashboard: Auto-connection failed, will retry:', error);
              // Retry once after a longer delay
              setTimeout(() => {
                if (!isConnected || (publicKey && publicKey !== user.public_key)) {
                  console.log('NFTDashboard: Retrying wallet auto-connection...');
                  connectWalletViewOnly(user.public_key);
                }
              }, 1000);
            });
          } else {
            console.log('NFTDashboard: Wallet already connected during timeout');
          }
        }, 1000); // Increased delay to allow wallet restoration
        
        return () => clearTimeout(connectTimeout);
      } else if (hasManuallyDisconnected) {
        console.log('NFTDashboard: User has manually disconnected, skipping auto-connection');
      } else {
        console.log('NFTDashboard: Wallet already connected to correct user');
      }
    } else if (user && !user.public_key) {
      console.log('NFTDashboard: User has no public_key in profile, checking for saved wallet data...');
      
      // Check if there's saved wallet data in localStorage
      const savedPublicKey = localStorage.getItem('stellar_public_key');
      
      if (savedPublicKey && !isConnected) {
        console.log('NFTDashboard: Found saved wallet data, attempting auto-connection with saved public key:', savedPublicKey);
        
        // Try to connect with the saved public key
        const connectTimeout = setTimeout(() => {
          if (!isConnected) {
            console.log('NFTDashboard: Attempting auto-connection with saved public key...');
            connectWalletViewOnly(savedPublicKey).catch(error => {
              console.error('NFTDashboard: Auto-connection with saved key failed:', error);
            });
          }
        }, 1000);
        
        return () => clearTimeout(connectTimeout);
      } else {
        console.log('NFTDashboard: No saved wallet data found or wallet already connected');
      }
    }
  }, [user, isConnected, publicKey, connectWalletViewOnly, clearWalletCompletely, hasManuallyDisconnected]);

  // Reset manual disconnect flag when wallet connects
  useEffect(() => {
    if (isConnected && hasManuallyDisconnected) {
      console.log('NFTDashboard: Wallet connected, resetting manual disconnect flag');
      setHasManuallyDisconnected(false);
    }
  }, [isConnected, hasManuallyDisconnected, setHasManuallyDisconnected]);

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
          try {
            initializeMap(overlayMapContainer.current, 'overlay');
          } catch (error) {
            console.error('Map initialization failed:', error);
            setError('Failed to initialize map. Please check your Mapbox token.');
          }
        } else if (attempt < 5) {
          console.log(`Container not ready, retrying in ${attempt * 300}ms...`);
          setTimeout(() => attemptInitialization(attempt + 1), attempt * 300);
        } else {
          console.warn('Overlay map initialization failed after 5 attempts - container not ready');
          setError('Map failed to load. Please refresh the page and try again.');
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
  }, [nearbyNFTs.length, markersCreated, updateMapMarkers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear success animation on unmount
      setShowPinSuccess(false);
    };
  }, []);

  // Check for success overlay in localStorage on component mount
  useEffect(() => {
    const saved = localStorage.getItem('nftMintSuccess');
    if (saved) {
      try {
        const successData = JSON.parse(saved);
        console.log('Success overlay found in NFTDashboard:', successData);
        setSuccessOverlay(successData);
      } catch (error) {
        console.error('Error parsing saved success data:', error);
        localStorage.removeItem('nftMintSuccess');
      }
    }
  }, []);




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
      // Remove fog before style change to prevent state issues
      try {
        if (map.current.getFog()) {
          map.current.setFog(null);
        }
      } catch (error) {
        // Ignore errors when removing fog
      }
      
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
      
      // Re-add 3D buildings and fog for 3D view after style loads
      if (view === '3d') {
        map.current.once('style.load', () => {
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
            
            // Re-set fog after style loads
            try {
              if (map.current && map.current.isStyleLoaded()) {
                map.current.setFog({
                  color: 'rgb(186, 210, 235)',
                  'high-color': 'rgb(36, 92, 223)',
                  'horizon-blend': 0.02,
                  'space-color': 'rgb(11, 11, 25)',
                  'star-intensity': 0.6
                });
              }
            } catch (fogError) {
              console.warn('Fog not supported after style change:', fogError.message);
            }
          }, 500);
        });
      }
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
      await api.post('/nft/pin', pinData); // Response not needed

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

    if (!isConnected || !publicKey) {
      setError('Wallet not connected. Please connect your wallet to collect NFTs.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Real Stellar blockchain NFT collection
      console.log('Collecting NFT on Stellar blockchain:', nft);
      
      // Check if NFT has a smart contract address
      if (!nft.smart_contract_address) {
        throw new Error('NFT does not have a smart contract address. Cannot collect on blockchain.');
      }

      // Use real NFT service to transfer NFT on Stellar blockchain
      const result = await realNFTService.transferLocationNFT(
        nft.smart_contract_address,
        nft.token_id || nft.id, // Use token_id if available, fallback to id
        nft.current_owner || nft.owner, // From current owner
        publicKey, // To current user
        userLocation.latitude,
        userLocation.longitude
      );

      console.log('Real blockchain NFT collection successful:', result);

      // Update database with blockchain transaction
      await api.post('/nft/collect', {
        nft_id: nft.id,
        user_latitude: userLocation.latitude,
        user_longitude: userLocation.longitude,
        blockchain_transaction_hash: result.transactionHash,
        blockchain_ledger: result.ledger,
        blockchain_network: 'testnet'
      });

      setSuccess(`NFT collected successfully! Transaction: ${result.transactionHash}`);
      fetchNearbyNFTs(); // Refresh nearby NFTs
      setCollectionFetched(false); // Reset flag to allow collection refresh
      fetchUserCollection(); // Refresh user collection
    } catch (err) {
      console.error('Error collecting NFT on blockchain:', err);
      setError(err.message || 'Failed to collect NFT on Stellar blockchain.');
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
    console.log('Opening fullscreen map dialog...');
    setOpenMapDialog(true);
    
    // Force map initialization after dialog opens
    setTimeout(() => {
      if (overlayMapContainer.current && !overlayMap.current) {
        console.log('Manual map initialization triggered...');
        initializeMap(overlayMapContainer.current, 'overlay');
      }
    }, 500);
  };

  // Handle search autocomplete
  const handleSearchAutocomplete = async (query) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    try {
      console.log('Autocomplete search for:', query);
      
      // Use Mapbox Geocoding API for autocomplete
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&limit=5&autocomplete=true`
      );
      
      if (!response.ok) {
        throw new Error('Autocomplete search failed');
      }
      
      const data = await response.json();
      console.log('Autocomplete results:', data.features);
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchResults(true);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  // Handle search functionality
  const handleSearch = async (selectedResult = null) => {
    try {
      let result;
      if (selectedResult) {
        // Use the selected autocomplete result
        result = selectedResult;
      } else {
        // Use Mapbox Geocoding API for new search
        const query = searchQuery.trim();
        if (!query) return;
        
        console.log('Searching for:', query);
        
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&limit=1`
        );
        
        if (!response.ok) {
          throw new Error('Search failed');
        }
        
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          result = data.features[0];
        } else {
          throw new Error('No results found');
        }
      }
      
      const [lng, lat] = result.center;
      
      console.log('Navigating to:', result.place_name, 'at', lng, lat);
      
      // Navigate the overlay map to the search result
      if (overlayMap.current) {
        overlayMap.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 2000
        });
      } else {
        console.error('Overlay map not available for navigation');
      }
      
      // Clear search query and results
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);
    } catch (error) {
      console.error('Search error:', error);
      setError('Search failed. Please try again.');
    }
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

  // Handle click outside map search autocomplete
  const handleMapSearchClickOutside = (event) => {
    const searchContainer = document.querySelector('.map-search-container');
    if (searchContainer && !searchContainer.contains(event.target)) {
      setShowSearchResults(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleMapSearchClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleMapSearchClickOutside);
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
    <Container maxWidth="xl" sx={{ mt: { xs: 2, md: 4 }, mb: { xs: 2, md: 4 } }}>
      {/* Header with Dashboard Cards */}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
        borderRadius: 2,
        p: { xs: 2, md: 3 },
        mb: { xs: 3, md: 4 },
        color: 'white'
      }}>
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center" 
          sx={{ 
            mb: { xs: 2, md: 3 },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 2, sm: 0 }
          }}
        >
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              color: 'white',
              fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
            }}
          >
            🌍 NFT Dashboard
          </Typography>
          <Button
            variant="contained"
            href="/enhanced-nft-dashboard"
            sx={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              color: 'black',
              border: '1px solid #FFD700',
              '&:hover': {
                background: 'linear-gradient(135deg, #FFA500 0%, #E6C200 100%)',
                boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
              },
              fontSize: { xs: '0.875rem', md: '1rem' },
              px: { xs: 2, md: 3 },
              fontWeight: 'bold'
            }}
            startIcon={<WalletIcon />}
          >
            🚀 Enhanced Dashboard
          </Button>
        </Box>
        
        {/* Compact Dashboard Cards */}
        <Grid container spacing={{ xs: 1, md: 2 }} sx={{ mb: { xs: 2, md: 3 } }}>
          {/* Wallet Status Card */}
          <Grid item xs={12} sm={6} md={4}>
            <Paper sx={{ 
              p: { xs: 1.5, md: 2 }, 
              background: 'rgba(255, 255, 255, 0.1)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 2
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                mb: 1,
                flexDirection: { xs: 'column', sm: 'row' },
                textAlign: { xs: 'center', sm: 'left' }
              }}>
                <StellarIcon sx={{ 
                  color: 'white', 
                  mr: { xs: 0, sm: 1 }, 
                  mb: { xs: 0.5, sm: 0 },
                  fontSize: { xs: 18, md: 20 }
                }} />
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: 'white', 
                    fontWeight: 'bold',
                    fontSize: { xs: '0.9rem', md: '1rem' }
                  }}
                >
                  Wallet Status
                </Typography>
              </Box>
              <Typography 
                variant="body2" 
                sx={{ 
                  color: 'rgba(255, 255, 255, 0.8)', 
                  mb: 2,
                  fontSize: { xs: '0.8rem', md: '0.875rem' },
                  textAlign: { xs: 'center', sm: 'left' }
                }}
              >
                {isConnected ? "✅ Connected" : "❌ Not Connected"}
              </Typography>
              {!isConnected || !wallet?.publicKey ? (
                <Button
                  variant="contained"
                  startIcon={<WalletIcon />}
                  onClick={() => setOpenWalletDialog(true)}
                  size="small"
                  disabled={loading}
                  sx={{ 
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    color: 'black',
                    '&:hover': { 
                      background: 'linear-gradient(135deg, #FFA500 0%, #E6C200 100%)',
                      boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)'
                    },
                    fontWeight: 'bold'
                  }}
                >
                  {loading ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              ) : (
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', mb: 1 }}>
                    {wallet?.publicKey?.substring(0, 12)}...
                  </Typography>
                  {balance !== null && (
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', mb: 1 }}>
                      Balance: {balance.toFixed(2)} XLM
                    </Typography>
                  )}
                  <Button
                    variant="outlined"
                    onClick={handleDisconnect}
                    size="small"
                    color="error"
                    sx={{ 
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                      color: 'white',
                      '&:hover': { borderColor: 'white' }
                    }}
                  >
                    Disconnect
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* My Collection Card */}
          <Grid item xs={12} sm={6} md={4}>
            <Paper sx={{ 
              p: 2, 
              background: 'rgba(255, 255, 255, 0.1)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 2
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CollectionsIcon sx={{ color: 'white', mr: 1 }} />
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                  My Collection
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 2 }}>
                {userCollection.length} NFTs collected
              </Typography>
              <Button
                variant="contained"
                startIcon={<CollectionsIcon />}
                onClick={() => setTabValue(1)}
                size="small"
                disabled={!isConnected || !wallet?.publicKey}
                sx={{ 
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                  color: 'black',
                  '&:hover': { 
                    background: 'linear-gradient(135deg, #FFA500 0%, #E6C200 100%)',
                    boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)'
                  },
                  fontWeight: 'bold'
                }}
              >
                View Collection
              </Button>
            </Paper>
          </Grid>

          {/* NFT Map Card */}
          <Grid item xs={12} sm={6} md={4}>
            <Paper sx={{ 
              p: 2, 
              background: 'rgba(255, 255, 255, 0.1)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 2
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MapIcon sx={{ color: 'white', mr: 1 }} />
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                  NFT Map
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 2 }}>
                {nearbyNFTs.length} NFTs nearby
              </Typography>
              <Button
                variant="contained"
                startIcon={<MapIcon />}
                onClick={handleOpenMap}
                size="small"
                disabled={!isConnected || !wallet?.publicKey || !userLocation}
                sx={{ 
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                  color: 'black',
                  '&:hover': { 
                    background: 'linear-gradient(135deg, #FFA500 0%, #E6C200 100%)',
                    boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)'
                  },
                  fontWeight: 'bold'
                }}
              >
                Open Map
              </Button>
            </Paper>
          </Grid>
        </Grid>
        
        {/* Location Controls in Header */}
        {isConnected && wallet?.publicKey && (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<LocationIcon />}
              onClick={getUserLocation}
              size="small"
              disabled={loading}
              sx={{ 
                borderColor: 'rgba(255, 255, 255, 0.5)',
                color: 'white',
                '&:hover': { borderColor: 'white', background: 'rgba(255, 255, 255, 0.1)' }
              }}
            >
              {autoDetectingLocation ? 'Detecting...' : 'Get Location'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<LocationIcon />}
              onClick={() => setOpenLocationSettings(true)}
              size="small"
              sx={{ 
                borderColor: 'rgba(255, 255, 255, 0.5)',
                color: 'white',
                '&:hover': { borderColor: 'white', background: 'rgba(255, 255, 255, 0.1)' }
              }}
            >
              Location Settings
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchNearbyNFTs}
              size="small"
              disabled={!userLocation}
              sx={{ 
                borderColor: 'rgba(255, 255, 255, 0.5)',
                color: 'white',
                '&:hover': { borderColor: 'white', background: 'rgba(255, 255, 255, 0.1)' }
              }}
            >
              Find Nearby NFTs
            </Button>
            {userLocation && (
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                📍 {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}


      {/* Tabbed Content */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="NFT dashboard tabs">
          <Tab label="Nearby NFTs" {...a11yProps(0)} />
          <Tab label="My Collection" {...a11yProps(1)} />
          <Tab label="NFT Map" {...a11yProps(2)} />
          <Tab label="Stellar Wallet" {...a11yProps(3)} />
          <Tab label="IPFS Management" {...a11yProps(4)} />
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
          <Grid container spacing={2}>
            {nearbyNFTs.map((nft) => (
              <Grid item xs={12} sm={6} md={3} lg={2} key={nft.id}>
                <Card>
                  {nft.full_ipfs_url && (
                    <CardMedia
                      component="img"
                      height="120"
                      image={nft.full_ipfs_url}
                      alt={nft.collection?.name || 'NFT'}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <CardContent sx={{ p: 1.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="subtitle2" component="div" sx={{ fontWeight: 'bold' }}>
                      {nft.collection?.name || 'Unknown NFT'}
                    </Typography>
                      {nft.associations?.has_upload && (
                        <Chip 
                          label="IPFS" 
                          size="small" 
                          color="primary" 
                          sx={{ height: '18px', fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {nft.collection?.rarity_level || 'common'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(nft.distance || 0)}m
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Radius: {nft.radius_meters}m
                    </Typography>
                    {nft.associations?.ipfs_server_name && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        Server: {nft.associations.ipfs_server_name}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions sx={{ p: 1, pt: 0 }}>
                    <Button
                      size="small"
                      startIcon={<InfoIcon />}
                      onClick={() => handleNFTDetails(nft)}
                      sx={{ fontSize: '0.75rem', minWidth: 'auto', px: 1 }}
                    >
                      Details
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<CollectIcon />}
                      onClick={() => handleCollectNFT(nft)}
                      disabled={!userLocation}
                      sx={{ fontSize: '0.75rem', minWidth: 'auto', px: 1 }}
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
          <Grid container spacing={2}>
            {userCollection.map((item) => (
              <Grid item xs={12} sm={6} md={3} lg={2} key={item.id}>
                <Card>
                  {item.full_ipfs_url && (
                    <CardMedia
                      component="img"
                      height="120"
                      image={item.full_ipfs_url}
                      alt={item.collection?.name || 'NFT'}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <CardContent sx={{ p: 1.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="subtitle2" component="div" sx={{ fontWeight: 'bold' }}>
                      {item.collection?.name || 'Unknown NFT'}
                    </Typography>
                      {item.associations?.has_upload && (
                        <Chip 
                          label="IPFS" 
                          size="small" 
                          color="primary" 
                          sx={{ height: '18px', fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {item.collection?.rarity_level || 'common'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.transfer_count} transfers
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.collected_at).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ p: 1, pt: 0 }}>
                    <Button
                      size="small"
                      startIcon={<InfoIcon />}
                      onClick={() => handleNFTDetails(item.nft)}
                      sx={{ fontSize: '0.75rem', minWidth: 'auto', px: 1 }}
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
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<LocationIcon />}
                  onClick={() => setOpenPinDialog(true)}
                  disabled={loading}
                >
                  Pin NFT (Database)
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<LocationIcon />}
                  onClick={() => setOpenEnhancedPinDialog(true)}
                  disabled={loading}
                >
                  Pin NFT (Blockchain)
                </Button>
              </Box>
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

      {/* Stellar Wallet Tab */}
      <TabPanel value={tabValue} index={3}>
        <EnhancedNFTManager />
      </TabPanel>

      {/* IPFS Management Tab */}
      <TabPanel value={tabValue} index={4}>
        <IPFSManagementTabs user={user} />
      </TabPanel>

      {/* NFT Details Dialog */}
      <Dialog 
        open={openNFTDialog} 
        onClose={() => setOpenNFTDialog(false)} 
        maxWidth="md" 
        fullWidth
        sx={{ zIndex: 1500 }}
      >
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
                
                {/* Mini Map for NFT Location */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    NFT Location
                  </Typography>
                  <Box 
                    id="nft-details-mini-map"
                    sx={{ 
                      height: '200px', 
                      width: '100%', 
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      overflow: 'hidden'
                    }}
                  />
                </Box>
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

                {/* Association Information for Workflow 2 NFTs */}
                {(selectedNFT.associations?.has_upload || selectedNFT.associations?.has_ipfs_server || selectedNFT.associations?.has_pin) && (
                  <>
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      IPFS Management Associations
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      {selectedNFT.associations?.has_upload && (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Upload Record
                          </Typography>
                          <Typography variant="body2">
                            <strong>Filename:</strong> {selectedNFT.associations.upload_filename || 'N/A'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            <strong>Status:</strong> {selectedNFT.associations.upload_status || 'N/A'}
                          </Typography>
                        </Box>
                      )}
                      {selectedNFT.associations?.has_ipfs_server && (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            IPFS Server
                          </Typography>
                          <Typography variant="body2">
                            <strong>Server:</strong> {selectedNFT.associations.ipfs_server_name || 'N/A'}
                          </Typography>
                        </Box>
                      )}
                      {selectedNFT.associations?.has_pin && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            IPFS Pin Record
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            <strong>Pin Status:</strong> {selectedNFT.associations.pin_status || 'N/A'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </>
                )}

                {selectedNFT.smart_contract_address && (
                  <>
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Smart Contract
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                      {selectedNFT.smart_contract_address}
                    </Typography>
                    
                    {/* Real Blockchain Data */}
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Blockchain Information
                    </Typography>
                    {selectedNFT.blockchain_transaction_hash && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Transaction Hash:</strong> {selectedNFT.blockchain_transaction_hash}
                      </Typography>
                    )}
                    {selectedNFT.blockchain_ledger && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Ledger:</strong> {selectedNFT.blockchain_ledger}
                      </Typography>
                    )}
                    {selectedNFT.blockchain_network && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Network:</strong> {selectedNFT.blockchain_network}
                      </Typography>
                    )}
                    
                    {/* Ownership Information */}
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Ownership
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Current Owner:</strong> {selectedNFT.current_owner || selectedNFT.owner || 'Unknown'}
                    </Typography>
                    {selectedNFT.transfer_count && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Transfer Count:</strong> {selectedNFT.transfer_count}
                      </Typography>
                    )}
                    {selectedNFT.collected_at && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Collected:</strong> {new Date(selectedNFT.collected_at).toLocaleString()}
                      </Typography>
                    )}
                    
                    {/* Contract Functions */}
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Available Contract Functions
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip label="mint" size="small" color="primary" />
                      <Chip label="transfer" size="small" color="primary" />
                      <Chip label="approve" size="small" color="primary" />
                      <Chip label="balanceOf" size="small" color="secondary" />
                      <Chip label="ownerOf" size="small" color="secondary" />
                      <Chip label="getLocationData" size="small" color="secondary" />
                    </Box>
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
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
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
              <Button
                variant="outlined"
                startIcon={<ZoomInIcon />}
                onClick={() => {
                  console.log('Zooming mini map to NFT location:', selectedNFT);
                  
                  if (miniMap) {
                    console.log('Zooming mini map to NFT location');
                    miniMap.flyTo({
                      center: [parseFloat(selectedNFT.longitude), parseFloat(selectedNFT.latitude)],
                      zoom: 18,
                      duration: 1000
                    });
                    console.log('Zoomed mini map to:', parseFloat(selectedNFT.longitude), parseFloat(selectedNFT.latitude));
                  } else {
                    console.log('Mini map not available yet');
                  }
                }}
              >
                Zoom In
              </Button>
            </Box>
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
              🗺️ NFT Map - 3D View
            </Typography>
            
            {/* Search Box with Autocomplete */}
            <Box className="map-search-container" sx={{ flexGrow: 1, maxWidth: '400px', mx: 2, position: 'relative' }}>
              <TextField
                placeholder="Search addresses, places, cities..."
                size="small"
                fullWidth
                variant="outlined"
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchQuery(value);
                  
                  // Clear existing timeout
                  if (searchTimeout) {
                    clearTimeout(searchTimeout);
                  }
                  
                  // Set new timeout for autocomplete
                  const timeout = setTimeout(() => {
                    handleSearchAutocomplete(value);
                  }, 300);
                  setSearchTimeout(timeout);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setShowSearchResults(true);
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 1)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'rgba(255, 255, 255, 1)',
                    }
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                      🔍
                    </Box>
                  ),
                  endAdornment: searchQuery && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                        setShowSearchResults(false);
                        if (searchTimeout) {
                          clearTimeout(searchTimeout);
                        }
                      }}
                      sx={{ mr: -1 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )
                }}
              />
              
              {/* Autocomplete Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <Paper
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1001,
                    maxHeight: '200px',
                    overflow: 'auto',
                    mt: 0.5,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: 1
                  }}
                >
                  {searchResults.map((result, index) => (
                    <Box
                      key={index}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSearch(result);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSearch(result);
                      }}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        borderBottom: index < searchResults.length - 1 ? '1px solid #eee' : 'none',
                        '&:hover': {
                          backgroundColor: '#f5f5f5'
                        },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {result.place_name}
                      </Typography>
                      {result.context && (
                        <Typography variant="caption" color="text.secondary">
                          {result.context.map(ctx => ctx.text).join(', ')}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
            
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
              <Button
                variant="outlined"
                startIcon={<MyLocationIcon />}
                onClick={() => {
                  console.log('Zooming to user location in overlay map');
                  if (overlayMap.current && userLocation) {
                    overlayMap.current.flyTo({
                      center: [userLocation.longitude, userLocation.latitude],
                      zoom: 15,
                      duration: 1000
                    });
                  }
                }}
                sx={{ mr: 1 }}
                size="small"
                disabled={!userLocation}
              >
                Zoom to Me
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
      <Dialog 
        open={openPinDialog} 
        onClose={() => setOpenPinDialog(false)} 
        maxWidth="sm" 
        fullWidth
        sx={{ zIndex: 1500 }}
      >
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
        sx={{ zIndex: 1500 }}
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

      {/* Real PIN NFT Dialog - Stellar Blockchain */}
      <Dialog 
        open={openRealPinDialog} 
        onClose={() => setOpenRealPinDialog(false)} 
        maxWidth="lg" 
        fullWidth
        sx={{ zIndex: 1500 }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Real PIN NFT - Stellar Blockchain</Typography>
            <IconButton onClick={() => setOpenRealPinDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <RealPinNFT 
            onClose={() => setOpenRealPinDialog(false)}
            onSuccess={(result) => {
              console.log('Real NFT operation successful:', result);
              setOpenRealPinDialog(false);
              // Set success overlay in parent component
              setSuccessOverlay(result);
              // Refresh the map or show success message
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Enhanced Pin NFT Dialog */}
      <EnhancedPinNFT
        open={openEnhancedPinDialog}
        onClose={() => setOpenEnhancedPinDialog(false)}
        onPinComplete={(nft) => {
          console.log('Enhanced NFT pinning successful:', nft);
          setOpenEnhancedPinDialog(false);
          setSuccessOverlay({
            title: 'NFT Pinned Successfully!',
            message: `Your NFT has been pinned to IPFS and added to the blockchain.`,
            nft: nft
          });
          // Refresh the map or show success message
        }}
      />

      {/* Success Overlay Dialog */}
      <Dialog
        open={!!successOverlay}
        onClose={() => {
          setSuccessOverlay(null);
          localStorage.removeItem('nftMintSuccess');
        }}
        maxWidth="md"
        fullWidth
        sx={{ zIndex: 10000 }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 2 }}>
          🎉 NFT Successfully Minted!
        </DialogTitle>
        <DialogContent>
          {successOverlay && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom color="primary">
                {successOverlay.name}
              </Typography>
              
              <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        📊 Transaction Details
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Token ID:</strong> {successOverlay.tokenId}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Status:</strong> {successOverlay.status}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Ledger:</strong> {successOverlay.ledger || 'N/A'}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Hash:</strong> 
                        <br />
                        <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>
                          {successOverlay.transactionHash || 'N/A'}
                        </code>
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        📍 Location Details
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Latitude:</strong> {successOverlay.location?.latitude?.toFixed(6) || 'N/A'}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Longitude:</strong> {successOverlay.location?.longitude?.toFixed(6) || 'N/A'}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Radius:</strong> {successOverlay.location?.radius || 'N/A'}m
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Contract:</strong> 
                        <br />
                        <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>
                          {successOverlay.contractId || 'N/A'}
                        </code>
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="primary"
                  href={successOverlay.stellarExpertUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  disabled={!successOverlay.stellarExpertUrl}
                  sx={{ minWidth: 200 }}
                >
                  🔗 View on StellarExpert
                </Button>
                <Button
                  variant="outlined"
                  href={successOverlay.contractUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  disabled={!successOverlay.contractUrl}
                  sx={{ minWidth: 200 }}
                >
                  📄 View Contract
                </Button>
              </Box>

              <Alert severity="success" sx={{ mt: 3 }}>
                <Typography variant="body2">
                  <strong>✅ Success!</strong> Your NFT has been minted on the Stellar testnet and added to the database. 
                  It will now appear in nearby NFT searches within the specified radius.
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setSuccessOverlay(null);
            localStorage.removeItem('nftMintSuccess');
          }} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTDashboard;