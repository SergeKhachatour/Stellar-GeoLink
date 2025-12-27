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

// Add CSS styles for NFT image markers (matching XYZ-Wallet implementation)
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
  const [fetchInProgress, setFetchInProgress] = useState(false);
  const [nftDetailsOpen, setNftDetailsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const mapContainer = useRef(null);
  const fullscreenMapContainer = useRef(null);
  const map = useRef(null);
  const fullscreenMap = useRef(null);
  const nftsRef = useRef([]);
  const currentMarkers = useRef([]); // Array of markers like XYZ-Wallet
  const fullscreenMarkers = useRef([]); // Array of markers like XYZ-Wallet
  const stableNFTsRef = useRef([]); // For change detection like XYZ-Wallet
  const lastNFTUpdateRef = useRef(0); // For change detection like XYZ-Wallet
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Fetch all public NFTs using the same approach as NFT Dashboard
  const fetchPublicNFTs = useCallback(async () => {
    if (fetchInProgress) {
      return;
    }
    
    try {
      setFetchInProgress(true);
      setLoading(true);
      setError('');
      
      // Use the public endpoint that doesn't require authentication
      const response = await api.get('/nft/public');
      
      console.log('🌍 Public NFTs API response:', {
        total: response.data.count,
        nfts: response.data.nfts.length,
        sample: response.data.nfts.slice(0, 3),
        allIds: response.data.nfts.map(nft => ({ 
          id: nft.id, 
          name: nft.name, 
          lat: nft.latitude, 
          lng: nft.longitude,
          server_url: nft.server_url,
          ipfs_hash: nft.ipfs_hash,
          image_url: nft.image_url,
          nft_upload_id: nft.nft_upload_id,
          ipfs_server_id: nft.ipfs_server_id,
          associations: nft.associations
        }))
      });
      
      // Log all NFT IDs to see which ones are returned
      const allIds = response.data.nfts.map(nft => nft.id).sort((a, b) => a - b);
      console.log('🌍 All NFT IDs returned (sorted):', allIds);
      console.log('🌍 NFT ID range:', { min: Math.min(...allIds), max: Math.max(...allIds), count: allIds.length });
      
      // Enhanced data quality logging for Azure debugging
      const missingServerUrl = response.data.nfts.filter(nft => !nft.server_url);
      const missingIpfsHash = response.data.nfts.filter(nft => !nft.ipfs_hash);
      const missingBoth = response.data.nfts.filter(nft => !nft.server_url && !nft.ipfs_hash);
      
      console.log('🌍 Data quality check:');
      console.log(`  - NFTs missing server_url: ${missingServerUrl.length}`, missingServerUrl.map(nft => ({ id: nft.id, name: nft.name })));
      console.log(`  - NFTs missing ipfs_hash: ${missingIpfsHash.length}`, missingIpfsHash.map(nft => ({ id: nft.id, name: nft.name })));
      console.log(`  - NFTs missing both: ${missingBoth.length}`, missingBoth.map(nft => ({ id: nft.id, name: nft.name })));
      
      // Log Workflow 2 association data
      const workflow2NFTs = response.data.nfts.filter(nft => nft.associations?.has_upload || nft.nft_upload_id);
      console.log(`🌍 Workflow 2 NFTs found: ${workflow2NFTs.length}`, workflow2NFTs.map(nft => ({
        id: nft.id,
        nft_upload_id: nft.nft_upload_id,
        ipfs_server_id: nft.ipfs_server_id,
        associations: nft.associations
      })));
      
      // Process the NFTs to add full IPFS URLs using dynamic server_url (matching NFT Dashboard)
      const processedNFTs = response.data.nfts.map(nft => {
        const fullIpfsUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash);
        
        // Log if URL construction fails
        if (!fullIpfsUrl && nft.server_url && nft.ipfs_hash) {
          console.warn(`⚠️ Failed to construct IPFS URL for NFT ${nft.id}:`, {
            server_url: nft.server_url,
            ipfs_hash: nft.ipfs_hash
          });
        }
        
        return {
          ...nft,
          full_ipfs_url: fullIpfsUrl,
          collection: {
            ...nft.collection,
            full_image_url: constructIPFSUrl(nft.server_url, nft.collection?.image_url)
          }
        };
      });
      
      // Filter out NFTs without valid coordinates (they can't be displayed on map)
      const nftsWithCoordinates = processedNFTs.filter(nft => {
        const lat = parseFloat(nft.latitude);
        const lng = parseFloat(nft.longitude);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      });
      
      console.log('🌍 Processed NFTs:', {
        total: processedNFTs.length,
        withCoordinates: nftsWithCoordinates.length,
        withoutCoordinates: processedNFTs.length - nftsWithCoordinates.length,
        withValidImageUrl: processedNFTs.filter(nft => nft.full_ipfs_url || nft.image_url).length,
        withoutImageUrl: processedNFTs.filter(nft => !nft.full_ipfs_url && !nft.image_url).length
      });
      
      setNfts(nftsWithCoordinates);
      setFilteredNFTs(nftsWithCoordinates);
      nftsRef.current = nftsWithCoordinates;
      
      // Markers will be created by useEffect when map is ready
      // No need to call addCardNFTMarkers() - createMarkersDirectly() handles it
    } catch (err) {
      console.error('Error fetching public NFTs:', err);
      setError('Failed to load NFT locations. Please try again.');
    } finally {
      setLoading(false);
      setFetchInProgress(false);
    }
  }, [fetchInProgress]);

  // Initialize card map (interactive)
  const initializeCardMap = useCallback(() => {
    if (map.current) {
      // console.log('Card map already initialized');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured.');
      return;
    }


    try {
      // Map initialization - matching XYZ-Wallet implementation exactly
      const initialCenter = [0, 0];
      const initialZoom = 0.5; // Globe view (matching XYZ-Wallet)
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialCenter,
        zoom: initialZoom,
        projection: 'globe', // Matching XYZ-Wallet - supports both globe and mercator
        antialias: true
        // Note: No pitch/bearing set - let Mapbox use defaults for natural globe view
      });
      
      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Wait for map style to be fully loaded before creating markers
      // This ensures markers are properly positioned on 3D globe
      map.current.on('style.load', () => {
        console.log('Map style loaded, ready for markers');
      });
      
      map.current.on('load', () => {
        // Wait for style to be fully loaded and then create markers
        // This ensures 3D globe positioning works correctly
        const createMarkersWhenReady = () => {
          if (map.current && map.current.isStyleLoaded() && nftsRef.current.length > 0) {
            console.log('Map fully ready, creating markers');
            renderNFTMarkers(map.current, currentMarkers);
          } else if (map.current) {
            // Retry if style isn't loaded yet
            setTimeout(createMarkersWhenReady, 100);
          }
        };
        
        createMarkersWhenReady();
      });

      // NOTE: Mapbox handles marker positioning automatically - no manual updates needed

      // Markers will be added by useEffect when NFTs are available

    } catch (err) {
      console.error('Card map initialization error:', err);
      setError('Failed to initialize card map.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize fullscreen map
  const initializeFullscreenMap = useCallback(() => {
    // console.log('initializeFullscreenMap called');
    if (fullscreenMap.current) {
      // console.log('Fullscreen map already exists, skipping initialization');
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
      // Fullscreen map initialization - matching XYZ-Wallet implementation exactly
      const initialCenter = [0, 0];
      const initialZoom = 0.5; // Globe view (matching XYZ-Wallet)
      
      fullscreenMap.current = new mapboxgl.Map({
        container: fullscreenMapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialCenter,
        zoom: initialZoom,
        projection: 'globe', // Matching XYZ-Wallet - supports both globe and mercator
        antialias: true
        // Note: No pitch/bearing set - let Mapbox use defaults for natural globe view
      });

      // Add navigation controls
      fullscreenMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add fullscreen control
      fullscreenMap.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

      // Add scale control
      fullscreenMap.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

      // Wait for map style to be fully loaded before creating markers
      // This ensures markers are properly positioned on 3D globe
      fullscreenMap.current.on('style.load', () => {
        console.log('Fullscreen map style loaded, ready for markers');
      });
      
      fullscreenMap.current.on('load', () => {
        // Wait for style to be fully loaded and then create markers
        // This ensures 3D globe positioning works correctly
        const createMarkersWhenReady = () => {
          if (fullscreenMap.current && fullscreenMap.current.isStyleLoaded() && nftsRef.current.length > 0) {
            console.log('Fullscreen map fully ready, creating markers');
            renderNFTMarkers(fullscreenMap.current, fullscreenMarkers);
          } else if (fullscreenMap.current) {
            // Retry if style isn't loaded yet
            setTimeout(createMarkersWhenReady, 100);
          }
        };
        
        createMarkersWhenReady();
      });

      // NOTE: Mapbox handles marker positioning automatically - no manual updates needed

    } catch (err) {
      console.error('Fullscreen map initialization error:', err);
      setError('Failed to initialize fullscreen map.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render NFT markers - matching XYZ-Wallet implementation exactly
  const renderNFTMarkers = useCallback((mapInstance, markersRef) => {
    console.log('🎨 renderNFTMarkers called with', nftsRef.current.length, 'NFTs');
    
    if (!mapInstance) {
      console.warn('⚠️ No map instance provided to renderNFTMarkers');
      return;
    }
    
    // Ensure map style is loaded for proper 3D globe positioning
    if (!mapInstance.isStyleLoaded()) {
      console.warn('⚠️ Map style not loaded yet, waiting...');
      // Wait for style to load
      mapInstance.once('style.load', () => {
        renderNFTMarkers(mapInstance, markersRef);
      });
      return;
    }
    
    // Clear existing NFT markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    
    const currentNFTs = nftsRef.current || [];
    
    // Track how many markers we create
    let markersCreated = 0;
    let markersSkipped = 0;
    
    // Add markers for all NFTs - no grouping, no filtering
    currentNFTs.forEach((nft, index) => {
      if (nft.latitude && nft.longitude) {
        // Ensure coordinates are numbers (not strings) for accurate positioning
        const lat = parseFloat(nft.latitude);
        const lng = parseFloat(nft.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
          markersSkipped++;
          return;
        }
        
        // Construct image URL using the utility function that handles dynamic IPFS server URLs
        const imageUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/48x48?text=NFT';
        
        const el = document.createElement('div');
        el.className = 'nft-marker';
        el.style.cssText = `
          width: 64px;
          height: 64px;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          border-radius: 8px;
          border: 3px solid #FFD700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        `;

        // Create marker - matching XYZ-Wallet exactly (no anchor specified, uses default 'center')
        // Mapbox automatically handles 3D globe positioning - markers stay at exact coordinates when globe rotates
        const nftMarker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat]) // Use parsed numbers for accurate positioning
          .addTo(mapInstance);
        
        // Add click event to show NFT info
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          console.log('NFT marker clicked:', nft);
          handleNFTDetails(nft);
        });
        
        markersRef.current.push(nftMarker);
        markersCreated++;
      } else {
        markersSkipped++;
        console.warn(`⚠️ Skipping NFT ${nft.id}: Missing coordinates`, { lat: nft.latitude, lng: nft.longitude });
      }
    });
    
    console.log(`✅ Created ${markersCreated} markers, skipped ${markersSkipped} (total NFTs: ${currentNFTs.length})`);
  }, []);

  // Simple direct marker creation for fullscreen map - bypasses all complex logic

  // Handle dialog open
  const handleOpen = () => {
    setOpen(true);
    // NFTs are already loaded, no need to fetch again
    // Initialize fullscreen map with retry logic like NFT Manager
    const attemptInitialization = (attempt = 1) => {
      // console.log(`Attempt ${attempt} to initialize fullscreen map...`);
      
      // Check if container exists and is visible
      if (fullscreenMapContainer.current && fullscreenMapContainer.current.offsetParent !== null && !fullscreenMap.current) {
        // console.log('Container found and visible, initializing map...');
        try {
          initializeFullscreenMap();
        } catch (error) {
          console.error('Map initialization failed:', error);
          setError('Failed to initialize map. Please check your Mapbox token.');
        }
      } else if (attempt < 5) {
        // console.log(`Container not ready, retrying in ${attempt * 300}ms...`);
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
      // console.log('Autocomplete search for:', query);
      
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
      // console.log('Autocomplete results:', data.features);
      
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
      // console.log('Searching for:', query);
      
      if (selectedResult) {
        // Search by location
        const [lng, lat] = selectedResult.center;
        
        if (fullscreenMap.current) {
          // Use jumpTo instead of flyTo to prevent marker animation
          fullscreenMap.current.jumpTo({
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
        
        // console.log(`Search "${query}" found ${filtered.length} results:`, filtered.map(nft => nft.name || nft.nft_name));
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
            // Calculate center and zoom manually, then use jumpTo for instant movement (no animation)
            const center = bounds.getCenter();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const latDiff = ne.lat - sw.lat;
            const lngDiff = ne.lng - sw.lng;
            
            // Calculate zoom level based on bounds
            const latZoom = Math.log2(360 / latDiff);
            const lngZoom = Math.log2(360 / Math.abs(lngDiff));
            const zoom = Math.min(latZoom, lngZoom, 15); // Cap at zoom 15 for search results
            
            // Use jumpTo instead of fitBounds to prevent any animation
            fullscreenMap.current.jumpTo({
              center: [center.lng, center.lat],
              zoom: Math.max(1, zoom - 0.5) // Slight zoom out for padding effect
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
  }, [fetchPublicNFTs, initializeCardMap]); // Add dependencies

  // Initialize fullscreen map when dialog opens
  useEffect(() => {
    if (open && fullscreenMapContainer.current && !fullscreenMap.current) {
      setTimeout(() => {
        initializeFullscreenMap();
      }, 100);
    }
  }, [open, initializeFullscreenMap]); // Add dependency

  // Update NFT markers when nfts changes - matching XYZ-Wallet implementation
  useEffect(() => {
    console.log('🔄 NFT markers useEffect triggered, nfts count:', nfts.length);
    
    // Check if NFT data has actually changed
    const hasChanged = nfts.length !== stableNFTsRef.current.length || 
      nfts.some((nft, index) => {
        const prevNFT = stableNFTsRef.current[index];
        return !prevNFT || nft.id !== prevNFT.id || nft.latitude !== prevNFT.latitude || nft.longitude !== prevNFT.longitude;
      });
    
    if (!hasChanged) {
      console.log('🔄 NFT data unchanged, skipping update');
      return;
    }
    
    console.log('🔄 NFT data changed, updating markers');
    stableNFTsRef.current = [...nfts];
    lastNFTUpdateRef.current = Date.now();
    
    // Update NFT markers - ensure map style is loaded for proper 3D globe positioning
    const updateMarkers = () => {
      if (map.current && map.current.isStyleLoaded()) {
        console.log('🎯 Updating main map NFT markers (style loaded)');
        renderNFTMarkers(map.current, currentMarkers);
      } else if (map.current) {
        // Retry if style isn't loaded yet
        setTimeout(updateMarkers, 100);
        return;
      }
      
      // Also update fullscreen map if it exists
      if (fullscreenMap.current && fullscreenMap.current.isStyleLoaded()) {
        console.log('🎯 Updating fullscreen map NFT markers (style loaded)');
        renderNFTMarkers(fullscreenMap.current, fullscreenMarkers);
      } else if (fullscreenMap.current) {
        // Retry if style isn't loaded yet
        setTimeout(() => {
          if (fullscreenMap.current && fullscreenMap.current.isStyleLoaded()) {
            renderNFTMarkers(fullscreenMap.current, fullscreenMarkers);
          }
        }, 100);
      }
    };
    
    // Small delay to prevent blocking
    setTimeout(updateMarkers, 50);
  }, [nfts, renderNFTMarkers]);

  return (
    <>
      {/* Showcase Section */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.paper' }}>
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
                              // console.log('Initializing fullscreen map from zoom to location...');
                              initializeFullscreenMap();
                              // After map is initialized, zoom to the selected NFT location
                              setTimeout(() => {
                                if (fullscreenMap.current && selectedNFT) {
                                  // console.log('Zooming to NFT location:', selectedNFT.latitude, selectedNFT.longitude);
                                  // Use jumpTo instead of flyTo to prevent marker animation
          fullscreenMap.current.jumpTo({
                                    center: [Number(selectedNFT.longitude), Number(selectedNFT.latitude)],
                                    zoom: 15,
                                    duration: 1000
                                  });
                                }
                              }, 500); // Wait for map to be fully initialized
                            } else if (fullscreenMap.current) {
                              // Map already exists, just zoom to location
                              // Use jumpTo instead of flyTo to prevent marker animation
          fullscreenMap.current.jumpTo({
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
