import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Chip,
  Card,
  Grid,
  Container,
  TextField,
  InputAdornment,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Close as CloseIcon,
  Fullscreen as FullscreenIcon,
  LocationOn as LocationIcon,
  Visibility as VisibilityIcon,
  Public as PublicIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../../services/api';

// Add CSS styles for stable NFT image markers (like NFT Manager)
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

const PublicNFTShowcase = () => {
  const [open, setOpen] = useState(false);
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNFTs, setFilteredNFTs] = useState([]);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [nftDetailsOpen, setNftDetailsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isUserMovingMap, setIsUserMovingMap] = useState(false);
  const mapContainer = useRef(null);
  const fullscreenMapContainer = useRef(null);
  const map = useRef(null);
  const fullscreenMap = useRef(null);
  const nftsRef = useRef([]);
  const currentMarkers = useRef({});
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Fetch all public NFTs using the same approach as NFT Dashboard
  const fetchPublicNFTs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // Use the same endpoint as NFT Dashboard but with a default location (center of globe)
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: 0, // Center of globe
          longitude: 0, // Center of globe
          radius: 999999999 // Very large radius to get ALL NFTs globally
        }
      });
      
      console.log('Public NFTs API response:', response.data);
      
      // Process the NFTs to add full IPFS URLs (same as NFT Dashboard)
      const processedNFTs = response.data.nfts.map(nft => ({
        ...nft,
        full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
        collection: {
          ...nft.collection,
          full_image_url: nft.collection?.image_url ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.collection.image_url}` : null
        }
      }));
      
      console.log('Processed public NFTs:', processedNFTs);
      console.log('Setting NFTs state with', processedNFTs.length, 'items');
      setNfts(processedNFTs);
      setFilteredNFTs(processedNFTs);
      nftsRef.current = processedNFTs;
      console.log('NFTs state set, current nfts.length:', processedNFTs.length);
      console.log('nftsRef.current updated with', nftsRef.current.length, 'items');
      
      // Try to add markers immediately if map is ready
      if (map.current) {
        console.log('Map is ready, adding markers immediately after NFT fetch');
        setTimeout(() => {
          addCardNFTMarkers();
        }, 100);
      }
    } catch (err) {
      console.error('Error fetching public NFTs:', err);
      setError('Failed to load NFT locations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [addCardNFTMarkers]);

  // Initialize card map (interactive)
  const initializeCardMap = useCallback(() => {
    if (map.current) {
      console.log('Card map already initialized');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured.');
      return;
    }

    console.log('Initializing card map with container:', mapContainer.current);
    console.log('Mapbox token found:', process.env.REACT_APP_MAPBOX_TOKEN.substring(0, 10) + '...');

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [0, 0], // Start with globe view
        zoom: 1,
        pitch: 0,
        bearing: 0,
        projection: 'globe',
        antialias: true,
        interactive: true // Enable interaction for card map
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      console.log('Card map created successfully');

      // Wait for map to load
      map.current.on('load', () => {
        console.log('🔍 Card map loaded, using DIRECT marker creation');
        console.log('🔍 Map load - nfts.length:', nfts.length, 'nftsRef.length:', nftsRef.current.length);
        
        // Use direct marker creation - bypasses all complex logic
        if (nftsRef.current.length > 0) {
          console.log('🚀 Card map loaded with NFTs available, using DIRECT creation');
          createMarkersDirectly();
        }
        
        // Fallback: Try again after a delay
        setTimeout(() => {
          if (nftsRef.current.length > 0) {
            console.log('🚀 Fallback: Direct marker creation after delay');
            createMarkersDirectly();
          }
        }, 1000);
      });

      // MARKER STABILITY: Track user map interaction to prevent marker updates during zoom/pan
      map.current.on('movestart', () => {
        setIsUserMovingMap(true);
        console.log('User started moving card map - BLOCKING marker updates');
      });
      
      map.current.on('moveend', () => {
        setIsUserMovingMap(false);
        console.log('User finished moving card map - allowing marker updates');
      });
      
      map.current.on('zoomstart', () => {
        console.log('Card map zoom started - BLOCKING marker updates');
        setIsUserMovingMap(true);
      });
      
      map.current.on('zoomend', () => {
        console.log('Card map zoom ended - allowing marker updates');
        setIsUserMovingMap(false);
      });
      
      map.current.on('dragstart', () => {
        setIsUserMovingMap(true);
        console.log('Card map drag started - BLOCKING marker updates');
      });
      
      map.current.on('dragend', () => {
        setIsUserMovingMap(false);
        console.log('Card map drag ended - allowing marker updates');
      });

      // Markers will be added by useEffect when NFTs are available

    } catch (err) {
      console.error('Card map initialization error:', err);
      setError('Failed to initialize card map.');
    }
  }, [createMarkersDirectly, nfts.length]);

  // Initialize fullscreen map
  const initializeFullscreenMap = useCallback(() => {
    console.log('initializeFullscreenMap called');
    if (fullscreenMap.current) {
      console.log('Fullscreen map already exists, skipping initialization');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      setError('Mapbox token not configured.');
      return;
    }

    // Check if container exists and is visible
    if (!fullscreenMapContainer.current || fullscreenMapContainer.current.offsetParent === null) {
      console.warn('Fullscreen map container not ready');
      return;
    }

    try {
      fullscreenMap.current = new mapboxgl.Map({
        container: fullscreenMapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [0, 0], // Start with globe view
        zoom: 1,
        pitch: 0,
        bearing: 0,
        projection: 'globe',
        antialias: true
      });

      // Add navigation controls
      fullscreenMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add fullscreen control
      fullscreenMap.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

      // Add scale control
      fullscreenMap.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

      // Wait for map to load
      fullscreenMap.current.on('load', () => {
        console.log('🔍 Fullscreen map loaded, using DIRECT marker creation');
        console.log('🔍 Fullscreen map load - nfts.length:', nfts.length, 'filteredNFTs.length:', filteredNFTs.length);
        
        // Use direct marker creation - bypasses all complex logic
        if (nfts.length > 0) {
          console.log('🚀 Fullscreen map loaded with NFTs available, using DIRECT creation');
          createFullscreenMarkersDirectly();
          
          // Auto-zoom to show all NFTs
          const bounds = new mapboxgl.LngLatBounds();
          nfts.forEach(nft => {
            if (nft.latitude && nft.longitude) {
              bounds.extend([Number(nft.longitude), Number(nft.latitude)]);
            }
          });
          
          if (!bounds.isEmpty()) {
            fullscreenMap.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 10
            });
          }
        } else {
          console.log('🚀 Fullscreen map loaded but no NFTs yet, will add markers when NFTs are available');
        }
        
        // Fallback: Try again after a delay
        setTimeout(() => {
          if (nfts.length > 0) {
            console.log('🚀 Fallback: Direct fullscreen marker creation after delay');
            createFullscreenMarkersDirectly();
          }
        }, 1000);
      });

      // MARKER STABILITY: Track user fullscreen map interaction to prevent marker updates during zoom/pan
      fullscreenMap.current.on('movestart', () => {
        setIsUserMovingMap(true);
        console.log('User started moving fullscreen map - BLOCKING marker updates');
      });
      
      fullscreenMap.current.on('moveend', () => {
        setIsUserMovingMap(false);
        console.log('User finished moving fullscreen map - allowing marker updates');
      });
      
      fullscreenMap.current.on('zoomstart', () => {
        console.log('Fullscreen map zoom started - BLOCKING marker updates');
        setIsUserMovingMap(true);
      });
      
      fullscreenMap.current.on('zoomend', () => {
        console.log('Fullscreen map zoom ended - allowing marker updates');
        setIsUserMovingMap(false);
      });
      
      fullscreenMap.current.on('dragstart', () => {
        setIsUserMovingMap(true);
        console.log('Fullscreen map drag started - BLOCKING marker updates');
      });
      
      fullscreenMap.current.on('dragend', () => {
        setIsUserMovingMap(false);
        console.log('Fullscreen map drag ended - allowing marker updates');
      });

    } catch (err) {
      console.error('Fullscreen map initialization error:', err);
      setError('Failed to initialize fullscreen map.');
    }
  }, [createFullscreenMarkersDirectly, filteredNFTs.length, nfts]);

  // Create a single NFT marker with advanced coordinate validation (like NFT Manager)
  const createSingleMarker = useCallback((nft, map, nftIndex = 0) => {
    try {
      console.log(`🎯 Creating single marker for NFT ${nft.id} at index ${nftIndex}`);
      
      // Check if marker already exists (prevent duplicates)
      if (currentMarkers.current[nft.id]) {
        console.log(`Marker for NFT ${nft.id} already exists, skipping creation`);
        return currentMarkers.current[nft.id];
      }
      
      // Ensure we have valid base coordinates first
      if (!nft.longitude || !nft.latitude || 
          isNaN(nft.longitude) || isNaN(nft.latitude) ||
          !isFinite(nft.longitude) || !isFinite(nft.latitude)) {
        console.warn('Invalid base coordinates for NFT:', nft.id, 'Skipping marker creation.');
        return null;
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

      // Create marker element (like NFT Manager)
      const markerEl = document.createElement('div');
      markerEl.className = 'nft-marker';
      markerEl.style.width = '40px';
      markerEl.style.height = '40px';
      markerEl.style.borderRadius = '8px'; // Square with rounded corners
      markerEl.style.border = '3px solid #fff';
      markerEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      markerEl.style.cursor = 'pointer';
      markerEl.style.display = 'flex';
      markerEl.style.alignItems = 'center';
      markerEl.style.justifyContent = 'center';
      markerEl.style.fontSize = '12px';
      markerEl.style.fontWeight = 'bold';
      markerEl.style.color = '#fff';
      markerEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      markerEl.style.position = 'relative';
      markerEl.style.zIndex = '1000';

      // Add NFT image if available (like NFT Manager)
      if (nft.ipfs_hash) {
        const img = document.createElement('img');
        img.src = `https://ipfs.io/ipfs/${nft.ipfs_hash}`;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '6px';
        img.style.objectFit = 'cover';
        img.onerror = () => {
          console.log('Image failed to load:', img.src);
          markerEl.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)';
          markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
        };
        markerEl.appendChild(img);
      } else {
        markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
      }

      // Create marker
      const marker = new mapboxgl.Marker(markerEl)
        .setLngLat([finalLng, finalLat])
        .addTo(map);

      // Add click handler for NFT details with delay to allow double-click (like NFT Manager)
      let clickTimeout;
      markerEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          console.log('Marker clicked, opening NFT details:', nft);
          handleNFTDetails(nft);
        }, 200); // Delay to allow double-click
      });

      // Add double-click handler for zoom
      markerEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(clickTimeout);
        console.log('Marker double-clicked, zooming to location');
        map.flyTo({
          center: [finalLng, finalLat],
          zoom: 15,
          duration: 1000
        });
      });

      console.log(`Marker ${nftIndex + 1} added successfully at coordinates:`, finalLng, finalLat);
      console.log('Marker element:', markerEl);
      console.log('Marker added to map:', marker);
      
      // Store marker in ref for stability tracking
      currentMarkers.current[nft.id] = marker;
      
      return marker;
    } catch (error) {
      console.error(`Error creating marker for NFT ${nft.id}:`, error);
      return null;
    }
  }, []);

  // Simple direct marker creation - bypasses all complex logic
  const createMarkersDirectly = useCallback(() => {
    console.log('🚀 DIRECT MARKER CREATION - bypassing all logic');
    
    if (!map.current) {
      console.log('❌ No map available for direct creation');
      return;
    }
    
    const currentNFTs = nftsRef.current || [];
    console.log('🚀 Direct creation with', currentNFTs.length, 'NFTs');
    
    if (currentNFTs.length === 0) {
      console.log('❌ No NFTs for direct creation');
      return;
    }
    
    // Clear any existing markers
    const existingMarkers = document.querySelectorAll('.nft-marker');
    console.log('🚀 Clearing', existingMarkers.length, 'existing markers');
    existingMarkers.forEach(marker => marker.remove());
    
    // Create markers directly
    currentNFTs.forEach((nft, index) => {
      console.log(`🚀 Creating direct marker ${index + 1} for NFT:`, nft.name || 'Unnamed', 'at', nft.latitude, nft.longitude);
      
      try {
        // Create marker element with NFT image
        const markerEl = document.createElement('div');
        markerEl.className = 'nft-marker';
        markerEl.style.width = '40px';
        markerEl.style.height = '40px';
        markerEl.style.borderRadius = '8px';
        markerEl.style.border = '3px solid #fff';
        markerEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        markerEl.style.cursor = 'pointer';
        markerEl.style.display = 'flex';
        markerEl.style.alignItems = 'center';
        markerEl.style.justifyContent = 'center';
        markerEl.style.fontSize = '12px';
        markerEl.style.fontWeight = 'bold';
        markerEl.style.color = '#fff';
        markerEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        markerEl.style.overflow = 'hidden';

        // Add NFT image if available
        if (nft.ipfs_hash) {
          const img = document.createElement('img');
          img.src = `https://ipfs.io/ipfs/${nft.ipfs_hash}`;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.borderRadius = '6px';
          img.style.objectFit = 'cover';
          img.onerror = () => {
            console.log('Image failed to load for NFT:', nft.id);
            markerEl.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)';
            markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
          };
          markerEl.appendChild(img);
        } else {
          markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
        }

        // Add click handler for NFT details
        markerEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Direct marker clicked, opening NFT details:', nft);
          handleNFTDetails(nft);
        });

        // Add double-click handler for zoom
        markerEl.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Direct marker double-clicked, zooming to location');
          map.current.flyTo({
            center: [Number(nft.longitude), Number(nft.latitude)],
            zoom: 15,
            duration: 1000
          });
        });
        
        // Create marker
        new mapboxgl.Marker(markerEl)
          .setLngLat([Number(nft.longitude), Number(nft.latitude)])
          .addTo(map.current);
        
        console.log(`✅ Direct marker ${index + 1} created successfully with image`);
      } catch (error) {
        console.error(`❌ Error creating direct marker ${index + 1}:`, error);
      }
    });
    
    console.log('🚀 Direct marker creation completed');
  }, []);

  // Simple direct marker creation for fullscreen map - bypasses all complex logic
  const createFullscreenMarkersDirectly = useCallback(() => {
    console.log('🚀 DIRECT FULLSCREEN MARKER CREATION - bypassing all logic');
    
    if (!fullscreenMap.current) {
      console.log('❌ No fullscreen map available for direct creation');
      return;
    }
    
    const nftsToShow = filteredNFTs.length > 0 ? filteredNFTs : nfts;
    console.log('🚀 Direct fullscreen creation with', nftsToShow.length, 'NFTs');
    
    if (nftsToShow.length === 0) {
      console.log('❌ No NFTs for direct fullscreen creation');
      return;
    }
    
    // Clear any existing markers
    const existingMarkers = document.querySelectorAll('.nft-marker');
    console.log('🚀 Clearing', existingMarkers.length, 'existing fullscreen markers');
    existingMarkers.forEach(marker => marker.remove());
    
    // Create markers directly
    nftsToShow.forEach((nft, index) => {
      console.log(`🚀 Creating direct fullscreen marker ${index + 1} for NFT:`, nft.name || 'Unnamed', 'at', nft.latitude, nft.longitude);
      
      try {
        // Create marker element with NFT image
        const markerEl = document.createElement('div');
        markerEl.className = 'nft-marker';
        markerEl.style.width = '50px';
        markerEl.style.height = '50px';
        markerEl.style.borderRadius = '8px';
        markerEl.style.border = '3px solid #fff';
        markerEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        markerEl.style.cursor = 'pointer';
        markerEl.style.display = 'flex';
        markerEl.style.alignItems = 'center';
        markerEl.style.justifyContent = 'center';
        markerEl.style.fontSize = '12px';
        markerEl.style.fontWeight = 'bold';
        markerEl.style.color = '#fff';
        markerEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        markerEl.style.overflow = 'hidden';

        // Add NFT image if available
        if (nft.ipfs_hash) {
          const img = document.createElement('img');
          img.src = `https://ipfs.io/ipfs/${nft.ipfs_hash}`;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.borderRadius = '6px';
          img.style.objectFit = 'cover';
          img.onerror = () => {
            console.log('Image failed to load for fullscreen NFT:', nft.id);
            markerEl.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)';
            markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
          };
          markerEl.appendChild(img);
        } else {
          markerEl.innerHTML = nft.name ? nft.name.charAt(0).toUpperCase() : 'N';
        }

        // Add click handler for NFT details
        markerEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Direct fullscreen marker clicked, opening NFT details:', nft);
          handleNFTDetails(nft);
        });

        // Add double-click handler for zoom
        markerEl.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Direct fullscreen marker double-clicked, zooming to location');
          fullscreenMap.current.flyTo({
            center: [Number(nft.longitude), Number(nft.latitude)],
            zoom: 15,
            duration: 1000
          });
        });
        
        // Create marker
        new mapboxgl.Marker(markerEl)
          .setLngLat([Number(nft.longitude), Number(nft.latitude)])
          .addTo(fullscreenMap.current);
        
        console.log(`✅ Direct fullscreen marker ${index + 1} created successfully with image`);
      } catch (error) {
        console.error(`❌ Error creating direct fullscreen marker ${index + 1}:`, error);
      }
    });
    
    console.log('🚀 Direct fullscreen marker creation completed');
  }, [nfts, filteredNFTs]);

  // Add NFT markers to card map
  const addCardNFTMarkers = useCallback((forceCreation = false) => {
    console.log('🔍 addCardNFTMarkers called - DEBUGGING MARKER CREATION', { forceCreation });
    console.log('🔍 Map state:', { 
      hasMap: !!map.current, 
      mapContainer: !!mapContainer.current,
      mapReady: map.current ? 'ready' : 'not ready'
    });
    console.log('🔍 NFT state:', { 
      nftsLength: nfts.length,
      nftsRefLength: nftsRef.current.length,
      isUserMovingMap
    });
    
    // Always get fresh data from ref
    const currentNFTs = [...nftsRef.current]; // Create a copy to ensure we have the latest data
    console.log('🔍 Current NFTs data:', currentNFTs.map(nft => ({ 
      id: nft.id, 
      name: nft.name, 
      lat: nft.latitude, 
      lng: nft.longitude 
    })));
    
    if (!map.current || !currentNFTs.length) {
      console.log('❌ No NFTs to display on card map - map:', !!map.current, 'nfts:', currentNFTs.length);
      return;
    }

    // MARKER STABILITY: Prevent updates during user interaction (unless forced)
    if (isUserMovingMap && !forceCreation) {
      console.log('❌ User is interacting with map - no marker updates allowed');
      return;
    }
    
    // MARKER STABILITY: If markers exist and are positioned correctly, don't update them (unless forced)
    if (Object.keys(currentMarkers.current).length > 0 && !forceCreation) {
      console.log('❌ Markers already exist and are positioned - preventing any updates');
      return;
    }

    // MARKER STABILITY: Check if markers are already on the map (unless forced)
    const existingMarkersOnMap = document.querySelectorAll('.nft-marker');
    if (existingMarkersOnMap.length > 0 && !forceCreation) {
      console.log('❌ Markers already exist on map - preventing recreation');
      return;
    }

    console.log('✅ All stability checks passed - proceeding with marker creation');

    // Clear existing markers
    const existingMarkers = document.querySelectorAll('.nft-marker');
    console.log('Clearing', existingMarkers.length, 'existing markers');
    existingMarkers.forEach(marker => marker.remove());

    console.log('Adding', currentNFTs.length, 'card markers');
    currentNFTs.forEach((nft, index) => {
      console.log(`Adding marker ${index + 1} for NFT:`, nft.name || nft.nft_name || 'Unnamed', 'at', nft.latitude, nft.longitude);
      console.log('NFT data:', nft);
      
      // Use the advanced marker creation function
      createSingleMarker(nft, map.current, index);
    });
    
    // Mark markers as created and stable
    console.log('✅ All card markers added successfully');
    
    console.log('All card markers added');
  }, [nfts, isUserMovingMap, createSingleMarker]);


  // Handle dialog open
  const handleOpen = () => {
    setOpen(true);
    // NFTs are already loaded, no need to fetch again
    // Initialize fullscreen map with retry logic like NFT Manager
    const attemptInitialization = (attempt = 1) => {
      console.log(`Attempt ${attempt} to initialize fullscreen map...`);
      
      // Check if container exists and is visible
      if (fullscreenMapContainer.current && fullscreenMapContainer.current.offsetParent !== null && !fullscreenMap.current) {
        console.log('Container found and visible, initializing map...');
        try {
          initializeFullscreenMap();
        } catch (error) {
          console.error('Map initialization failed:', error);
          setError('Failed to initialize map. Please check your Mapbox token.');
        }
      } else if (attempt < 5) {
        console.log(`Container not ready, retrying in ${attempt * 300}ms...`);
        setTimeout(() => attemptInitialization(attempt + 1), attempt * 300);
      } else {
        console.warn('Fullscreen map initialization failed after 5 attempts - container not ready');
        setError('Map failed to load. Please refresh the page and try again.');
      }
    };
    
    // Start with a longer delay to ensure dialog is fully rendered
    setTimeout(() => attemptInitialization(), 500);
  };

  // Handle search autocomplete (like NFT Manager)
  const handleSearchAutocomplete = async (query) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    try {
      console.log('Autocomplete search for:', query);
      
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      if (!mapboxToken) {
        console.error('Mapbox token not configured');
        return;
      }
      
      // Use Mapbox Geocoding API for autocomplete
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=5&autocomplete=true`
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

  // Handle search functionality (like NFT Manager)
  const handleSearch = async (selectedResult = null) => {
    const query = selectedResult ? selectedResult.place_name : searchQuery;
    
    if (!query.trim()) {
      setFilteredNFTs([]);
      setShowSearchResults(false);
      return;
    }
    
    try {
      console.log('Searching for:', query);
      
      if (selectedResult) {
        // Search by location
        const [lng, lat] = selectedResult.center;
        
        if (fullscreenMap.current) {
          fullscreenMap.current.flyTo({
            center: [lng, lat],
            zoom: 15,
            duration: 1000
          });
        }
        
        setShowSearchResults(false);
        setSearchQuery('');
      } else {
        // Search by NFT name/description/collection
        const searchTerm = query.toLowerCase().trim();
        const filtered = nfts.filter(nft => {
          const name = (nft.name || nft.nft_name || '').toLowerCase();
          const description = (nft.description || nft.nft_description || '').toLowerCase();
          const collection = (nft.collection?.name || '').toLowerCase();
          
          return name.includes(searchTerm) || 
                 description.includes(searchTerm) || 
                 collection.includes(searchTerm);
        });
        
        console.log(`Search "${query}" found ${filtered.length} results:`, filtered.map(nft => nft.name || nft.nft_name));
        setFilteredNFTs(filtered);
        
        // Auto-zoom to search results
        if (fullscreenMap.current && filtered.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          filtered.forEach(nft => {
            if (nft.latitude && nft.longitude) {
              bounds.extend([Number(nft.longitude), Number(nft.latitude)]);
            }
          });
          
          if (!bounds.isEmpty()) {
            fullscreenMap.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15
            });
          }
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  // Handle NFT details
  const handleNFTDetails = (nft) => {
    setSelectedNFT(nft);
    setNftDetailsOpen(true);
  };

  // Handle NFT details close
  const handleNFTDetailsClose = () => {
    setNftDetailsOpen(false);
    setSelectedNFT(null);
  };

  // Handle dialog close
  const handleClose = () => {
    setOpen(false);
    setSearchQuery('');
    setFilteredNFTs(nfts);
    if (fullscreenMap.current) {
      fullscreenMap.current.remove();
      fullscreenMap.current = null;
    }
  };


  // Initialize card map when component mounts and fetch NFTs
  useEffect(() => {
    const initializeAndFetch = async () => {
      if (mapContainer.current && !map.current) {
        // First fetch NFTs
        await fetchPublicNFTs();
        // Wait a bit for state to update, then initialize map
        setTimeout(() => {
          initializeCardMap();
        }, 500);
      }
    };
    
    initializeAndFetch();
  }, [fetchPublicNFTs, initializeCardMap]);

  // Initialize fullscreen map when dialog opens
  useEffect(() => {
    if (open && fullscreenMapContainer.current && !fullscreenMap.current) {
      setTimeout(() => {
        initializeFullscreenMap();
      }, 100);
    }
  }, [open, initializeFullscreenMap]);

  // Add markers to fullscreen map when it's ready and dialog is open
  useEffect(() => {
    if (open && fullscreenMap.current && nfts.length > 0) {
      console.log('🚀 Fullscreen dialog opened with map ready - creating markers for', nfts.length, 'NFTs');
      createFullscreenMarkersDirectly();
    }
  }, [open, nfts.length, createFullscreenMarkersDirectly]);

  // Aggressive fullscreen marker creation when dialog opens
  useEffect(() => {
    if (open) {
      console.log('🚀 Dialog opened - attempting fullscreen marker creation');
      // Try immediately
      if (fullscreenMap.current && nfts.length > 0) {
        console.log('🚀 Immediate fullscreen marker creation');
        createFullscreenMarkersDirectly();
      }
      
      // Try after a short delay
      setTimeout(() => {
        if (fullscreenMap.current && nfts.length > 0) {
          console.log('🚀 Delayed fullscreen marker creation');
          createFullscreenMarkersDirectly();
        }
      }, 500);
      
      // Try after a longer delay
      setTimeout(() => {
        if (fullscreenMap.current && nfts.length > 0) {
          console.log('🚀 Long delayed fullscreen marker creation');
          createFullscreenMarkersDirectly();
        }
      }, 1500);
    }
  }, [open, nfts.length, createFullscreenMarkersDirectly]);

  // SIMPLIFIED: Add markers when NFTs are loaded (only one useEffect for markers)
  useEffect(() => {
    console.log('🔍 NFTs useEffect triggered with nfts.length:', nfts.length);
    console.log('🔍 Map states - card map:', !!map.current, 'fullscreen map:', !!fullscreenMap.current);
    
    if (map.current && nfts.length > 0) {
      console.log('✅ NFTs useEffect: Using DIRECT marker creation for', nfts.length, 'NFTs');
      createMarkersDirectly();
    } else {
      console.log('❌ NFTs useEffect: Conditions not met', {
        hasMap: !!map.current,
        hasNFTs: nfts.length > 0
      });
    }
    if (fullscreenMap.current && nfts.length > 0) {
      console.log('✅ NFTs useEffect: Using DIRECT fullscreen marker creation for', nfts.length, 'NFTs');
      createFullscreenMarkersDirectly();
    }
  }, [nfts, createMarkersDirectly, createFullscreenMarkersDirectly]);

  // Add markers when map becomes available and NFTs exist
  useEffect(() => {
    console.log('🔍 Map availability useEffect - card map:', !!map.current, 'fullscreen map:', !!fullscreenMap.current, 'NFTs:', nfts.length);
    
    if (map.current && nfts.length > 0) {
      console.log('✅ Map availability: Using DIRECT marker creation for', nfts.length, 'NFTs');
      createMarkersDirectly();
    } else {
      console.log('❌ Map availability: Conditions not met', {
        hasMap: !!map.current,
        hasNFTs: nfts.length > 0
      });
    }
    if (fullscreenMap.current && nfts.length > 0) {
      console.log('✅ Map availability: Using DIRECT fullscreen marker creation for', nfts.length, 'NFTs');
      createFullscreenMarkersDirectly();
    }
  }, [nfts.length, createMarkersDirectly, createFullscreenMarkersDirectly]);

  // Update fullscreen markers when search results change
  useEffect(() => {
    if (fullscreenMap.current && open) {
      console.log('Search results changed, using DIRECT fullscreen marker creation');
      createFullscreenMarkersDirectly();
    }
  }, [filteredNFTs, open, createFullscreenMarkersDirectly]);

  return (
    <>
      {/* Showcase Section */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Box textAlign="center" mb={4}>
            <Typography 
              variant="h3" 
              component="h2" 
              gutterBottom
              sx={{ 
                fontWeight: 'bold',
                color: 'text.primary',
                mb: 2
              }}
            >
              Explore Global NFT Collection
            </Typography>
            <Typography 
              variant="h6" 
              color="text.secondary" 
              sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
            >
              Discover NFTs pinned by NFT Managers around the world. 
              Browse the interactive map to see the global distribution of blockchain assets.
            </Typography>
          </Box>

          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Card 
                sx={{ 
                  height: 300,
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.02)'
                  }
                }}
                onClick={handleOpen}
              >
                {/* Map Preview */}
                <Box
                  ref={mapContainer}
                  sx={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                />
                
                {/* Full Map Button */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 16,
                    right: 16
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<VisibilityIcon />}
                    size="small"
                    sx={{
                      background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                      color: 'black',
                      fontWeight: 'bold',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #FFA500, #FF8C00)',
                      }
                    }}
                  >
                    View Full Map
                  </Button>
                </Box>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Global NFT Showcase
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Our platform hosts NFTs from NFT Managers worldwide, creating a comprehensive 
                  view of blockchain asset distribution across the globe.
                </Typography>
                
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                  <Chip 
                    icon={<LocationIcon />} 
                    label="Global Coverage" 
                    color="primary" 
                    variant="outlined" 
                  />
                  <Chip 
                    icon={<PublicIcon />} 
                    label="Public Access" 
                    color="secondary" 
                    variant="outlined" 
                  />
                  <Chip 
                    icon={<VisibilityIcon />} 
                    label="Interactive View" 
                    color="primary" 
                    variant="outlined" 
                  />
                </Box>

                <Button
                  variant="outlined"
                  size="large"
                  onClick={handleOpen}
                  startIcon={<FullscreenIcon />}
                  sx={{
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    '&:hover': {
                      borderColor: 'primary.dark',
                      backgroundColor: 'primary.light',
                      color: 'primary.dark'
                    }
                  }}
                >
                  Explore Full Map
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Fullscreen Map Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        fullScreen={isMobile}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: isMobile ? '100vh' : '80vh',
            maxHeight: '80vh'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          bgcolor: 'primary.main',
          color: 'white',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2
        }}>
          <Typography variant="h6" component="div">
            🌍 Global NFT Collection Map
            {searchQuery && (
              <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
                {filteredNFTs.length > 0 
                  ? `Found ${filteredNFTs.length} result${filteredNFTs.length === 1 ? '' : 's'} for "${searchQuery}"`
                  : `No results found for "${searchQuery}"`
                }
              </Typography>
            )}
          </Typography>
          
          {/* Search Box */}
          <Box sx={{ position: 'relative' }}>
            <TextField
              placeholder="Search locations or NFTs..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearchAutocomplete(e.target.value);
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'rgba(0,0,0,0.6)' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                minWidth: 300,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'white',
                  '& fieldset': {
                    borderColor: 'rgba(255,255,255,0.3)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255,255,255,0.5)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'white',
                  },
                },
                '& .MuiInputBase-input': {
                  color: 'black',
                },
              }}
            />
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <Box sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                bgcolor: 'white',
                border: '1px solid #ccc',
                borderRadius: 1,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxHeight: 200,
                overflow: 'auto'
              }}>
                {searchResults.map((result, index) => (
                  <Box
                    key={index}
                    onClick={() => handleSearch(result)}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      '&:hover': {
                        bgcolor: '#f5f5f5'
                      },
                      '&:last-child': {
                        borderBottom: 'none'
                      }
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#333' }}>
                      {result.place_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#666' }}>
                      {result.context?.map(c => c.text).join(', ')}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          
          {searchQuery && (
            <Button
              onClick={() => {
                setSearchQuery('');
                setFilteredNFTs([]);
                setSearchResults([]);
                setShowSearchResults(false);
              }}
              size="small"
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.3)',
                '&:hover': {
                  borderColor: 'rgba(255,255,255,0.5)',
                  backgroundColor: 'rgba(255,255,255,0.1)'
                }
              }}
              variant="outlined"
            >
              Clear
            </Button>
          )}
          
          <IconButton
            onClick={handleClose}
            sx={{ color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          {error && (
            <Box sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
              {error}
            </Box>
          )}
          
          <Box
            ref={fullscreenMapContainer}
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 400
            }}
          />
          
          {loading && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                bgcolor: 'rgba(255,255,255,0.9)',
                p: 2,
                borderRadius: 1,
                boxShadow: 2
              }}
            >
              <Typography>Loading NFT locations...</Typography>
            </Box>
          )}
          
          {!loading && nfts.length === 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                bgcolor: 'rgba(255,255,255,0.9)',
                p: 3,
                borderRadius: 1,
                boxShadow: 2,
                textAlign: 'center'
              }}
            >
              <Typography variant="h6" gutterBottom>
                No NFTs Available
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No NFTs have been pinned yet. Check back later!
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* NFT Details Dialog */}
      <Dialog
        open={nftDetailsOpen}
        onClose={handleNFTDetailsClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: 'linear-gradient(135deg, #f8f9fa, #ffffff)'
          }
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
                          e.target.nextSibling.style.display = 'flex';
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
                    {selectedNFT.collection?.name && (
                      <Box sx={{ mb: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'warning.contrastText' }}>
                          🏷️ Collection
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'warning.contrastText' }}>
                          {selectedNFT.collection.name}
                        </Typography>
                      </Box>
                    )}

                    {/* Action Buttons */}
                    <Box sx={{ mt: 'auto', display: 'flex', gap: 2 }}>
                      <Button
                        variant="contained"
                        startIcon={<LocationIcon />}
                        onClick={() => {
                          handleNFTDetailsClose();
                          setOpen(true);
                          // Initialize fullscreen map and then zoom to location
                          setTimeout(() => {
                            if (fullscreenMapContainer.current && !fullscreenMap.current) {
                              console.log('Initializing fullscreen map from zoom to location...');
                              initializeFullscreenMap();
                              // After map is initialized, zoom to the selected NFT location
                              setTimeout(() => {
                                if (fullscreenMap.current && selectedNFT) {
                                  console.log('Zooming to NFT location:', selectedNFT.latitude, selectedNFT.longitude);
                                  fullscreenMap.current.flyTo({
                                    center: [Number(selectedNFT.longitude), Number(selectedNFT.latitude)],
                                    zoom: 15,
                                    duration: 1000
                                  });
                                }
                              }, 500); // Wait for map to be fully initialized
                            } else if (fullscreenMap.current) {
                              // Map already exists, just zoom to location
                              fullscreenMap.current.flyTo({
                                center: [Number(selectedNFT.longitude), Number(selectedNFT.latitude)],
                                zoom: 15,
                                duration: 1000
                              });
                            }
                          }, 100);
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
    </>
  );
};

export default PublicNFTShowcase;
