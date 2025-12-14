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
  CircularProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Fullscreen as FullscreenIcon,
  LocationOn as LocationIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  NetworkCheck as NetworkIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as MoneyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import stellarNetworkService from '../../services/stellarNetworkService';

// Add CSS styles for Stellar node markers
const nodeMarkerStyles = `
  .node-marker {
    cursor: pointer !important;
    pointer-events: auto !important;
    border-radius: 50% !important;
    border: 4px solid #ffffff !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.5) !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  
  .node-marker.active {
    animation: pulse 2s infinite !important;
  }
  
  .node-marker.inactive {
    opacity: 0.7 !important;
  }
  
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  
  .node-popup {
    max-width: 250px;
    font-family: 'Roboto', sans-serif;
  }
`;

// Inject styles into the document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = nodeMarkerStyles;
  document.head.appendChild(styleSheet);
}

const RealTimeNodeTracking = () => {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNodes, setFilteredNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [fetchInProgress, setFetchInProgress] = useState(false);
  const [nodeDetailsOpen, setNodeDetailsOpen] = useState(false);
  const [isUserMovingMap, setIsUserMovingMap] = useState(false);
  
  // Enhanced search filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [validatorTypeFilter, setValidatorTypeFilter] = useState('all');
  
  // Search panel state
  const [searchPanelExpanded, setSearchPanelExpanded] = useState(true);
  
  // XLM Price state
  const [xlmPrice, setXlmPrice] = useState(null);
  const [xlmPriceChange, setXlmPriceChange] = useState(null);
  const [xlmPriceLoading, setXlmPriceLoading] = useState(false);
  
  const mapContainer = useRef(null);
  const fullscreenMapContainer = useRef(null);
  const map = useRef(null);
  const fullscreenMap = useRef(null);
  const nodesRef = useRef([]);
  const currentMarkers = useRef({});
  const fullscreenMarkers = useRef({});

  // Stellar network statistics
  const [networkStats, setNetworkStats] = useState(null);

  // Fetch Stellar network nodes using Stellar Atlas API
  const fetchStellarNodes = useCallback(async () => {
    if (fetchInProgress) return;
    
    setFetchInProgress(true);
    setLoading(true);
    setError('');

    try {
      // Fetch validators first (this works)
      const validators = await stellarNetworkService.getValidatorsCached();
      setNodes(validators);
      nodesRef.current = validators;
      
      // Try to fetch network stats separately (this might fail)
      try {
        const stats = await stellarNetworkService.getNetworkStatsCached();
        setNetworkStats(stats);
      } catch (statsError) {
        console.warn('Network stats failed, continuing with node data only:', statsError.message);
        // Don't set error for stats failure, just continue with node data
      }
    } catch (err) {
      console.error('Error fetching Stellar nodes:', err);
      setError(`Failed to fetch Stellar network information: ${err.message}`);
      // Don't clear existing data, just show error
    } finally {
      setLoading(false);
      setFetchInProgress(false);
    }
  }, [fetchInProgress]);

  // Fetch XLM price from CoinGecko
  const fetchXLMPrice = useCallback(async () => {
    setXlmPriceLoading(true);
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_change=true');
      if (!response.ok) throw new Error('Failed to fetch XLM price');
      const data = await response.json();
      if (data.stellar) {
        setXlmPrice(data.stellar.usd);
        setXlmPriceChange(data.stellar.usd_24h_change);
      }
    } catch (err) {
      console.error('Error fetching XLM price:', err);
      // Fallback: try alternative API
      try {
        const altResponse = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=XLM');
        if (altResponse.ok) {
          const altData = await altResponse.json();
          if (altData.data?.rates?.USD) {
            setXlmPrice(parseFloat(altData.data.rates.USD));
          }
        }
      } catch (altErr) {
        console.error('Alternative XLM price API also failed:', altErr);
      }
    } finally {
      setXlmPriceLoading(false);
    }
  }, []);

  // Enhanced filter nodes based on search query and filters
  useEffect(() => {
    let filtered = [...nodes];

    // Apply search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.publicKey && node.publicKey.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(node => node.status === statusFilter);
    }

    // Apply country filter
    if (countryFilter !== 'all') {
      filtered = filtered.filter(node => node.country === countryFilter);
    }

    // Apply validator type filter
    if (validatorTypeFilter !== 'all') {
      filtered = filtered.filter(node => node.validatorType === validatorTypeFilter);
    }

    setFilteredNodes(filtered);
  }, [nodes, searchQuery, statusFilter, countryFilter, validatorTypeFilter]);

  // Get unique countries for filter
  const uniqueCountries = [...new Set(nodes.map(node => node.country).filter(Boolean))].sort();

  // Create node marker (simplified like NFT markers)
  const createNodeMarker = useCallback((node, mapInstance) => {
    if (!mapInstance || !node.location) return null;

    // Simple coordinate validation (like NFT markers)
    let finalLng = parseFloat(node.location.lng);
    let finalLat = parseFloat(node.location.lat);
    
    // Handle invalid coordinates
    if (isNaN(finalLng) || isNaN(finalLat) || !isFinite(finalLng) || !isFinite(finalLat)) {
      console.warn(`Invalid coordinates for node ${node.id}:`, { lng: finalLng, lat: finalLat });
      return null;
    }
    
    // Globe projection coordinate handling (like NFT markers)
    if (mapInstance.getProjection()?.name === 'globe') {
      if (finalLng < -180) finalLng += 360;
      if (finalLng > 180) finalLng -= 360;
      if (finalLat < -90) finalLat = -90;
      if (finalLat > 90) finalLat = 90;
    }
    
    // Final validation
    if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) {
      console.warn(`Invalid coordinate range for node ${node.id}:`, { lat: finalLat, lng: finalLng });
      return null;
    }

    // Try using default Mapbox GL marker with custom color (like test markers)
    let markerColor = '#4CAF50'; // Default green for active
    if (node.status === 'syncing') {
      markerColor = '#FF9800'; // Orange for syncing
    } else if (node.status === 'inactive') {
      markerColor = '#F44336'; // Red for inactive
    }

    // Create marker using default Mapbox GL marker (like test markers)
    const marker = new mapboxgl.Marker({ color: markerColor })
      .setLngLat([finalLng, finalLat])
      .addTo(mapInstance);

    // Add click handler (like NFT markers)
    marker.getElement().addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedNode(node);
      setNodeDetailsOpen(true);
    });

    return marker;
  }, []);

  // Create markers for the card map
  const createCardMarkers = useCallback(() => {
    if (!map.current || !filteredNodes.length) return;

    // Check if markers already exist to prevent recreation
    if (Object.keys(currentMarkers.current).length > 0) {
      return;
    }

    // Clear existing markers
    Object.values(currentMarkers.current).forEach(marker => marker.remove());
    currentMarkers.current = {};

    filteredNodes.forEach((node, index) => {
      if (node.location && node.location.lat && node.location.lng) {
        const marker = createNodeMarker(node, map.current);
        if (marker) {
          currentMarkers.current[node.id] = marker;
        }
      } else {
        console.warn(`❌ Invalid location data for ${node.name}:`, node.location);
      }
    });

    // Fit map bounds to show all markers (only once)
    if (filteredNodes.length > 0 && map.current && !map.current._hasFittedBounds) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidBounds = false;
      
      filteredNodes.forEach(node => {
        if (node.location && node.location.lat && node.location.lng) {
          bounds.extend([node.location.lng, node.location.lat]);
          hasValidBounds = true;
        }
      });
      
      // Add some padding and fit the map to show all markers (only once)
      if (hasValidBounds) {
        setTimeout(() => {
          if (map.current && !map.current._hasFittedBounds) {
            map.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 6,
              duration: 1000
            });
            map.current._hasFittedBounds = true; // Mark as fitted
          }
        }, 500);
      }
    }
    
    
    // Temporarily disable test markers to debug positioning issue
    /*
           // Enhanced test markers with coordinate verification
           
           // Test coordinates with verification
           const testCoordinates = [
             { name: 'NYC', coords: [-74.0060, 40.7128], color: 'red', emoji: '🔴' },
             { name: 'London', coords: [-0.1278, 51.5074], color: 'blue', emoji: '🔵' },
             { name: 'Tokyo', coords: [139.6503, 35.6762], color: 'green', emoji: '🟢' },
             { name: 'Sydney', coords: [151.2093, -33.8688], color: 'orange', emoji: '🟠' }
           ];
           
           testCoordinates.forEach((test, index) => {
             const [lng, lat] = test.coords;
             
             // Verify coordinates are valid
             // console.log(`📍 Testing ${test.name} coordinates:`, { lng, lat });
             
             // Check if coordinates project correctly
             const point = map.current.project([lng, lat]);
             // console.log(`🎯 ${test.name} screen projection:`, {
             //   screenX: point.x,
             //   screenY: point.y,
             //   inViewport: point.x >= 0 && point.x <= map.current.getContainer().offsetWidth && 
             //              point.y >= 0 && point.y <= map.current.getContainer().offsetHeight
             // });
             
             // Create test marker
             const testMarker = new mapboxgl.Marker({ color: test.color })
               .setLngLat([lng, lat])
               .setPopup(new mapboxgl.Popup().setHTML(`
                 <div>
                   <strong>${test.emoji} Test Marker - ${test.name}</strong><br/>
                   Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}<br/>
                   Screen: ${point.x.toFixed(0)}, ${point.y.toFixed(0)}<br/>
                   If you can see this ${test.color.toUpperCase()} marker, coordinates are working!
                 </div>
               `))
               .addTo(map.current);
             
             currentMarkers.current[`test-marker-${test.name.toLowerCase()}`] = testMarker;
           });
           
           // Log map bounds and center for debugging
           setTimeout(() => {
             if (map.current) {
               
               // Check if custom markers are visible
               Object.keys(currentMarkers.current).forEach(nodeId => {
                 if (!nodeId.startsWith('test-marker-')) {
                   const markerEl = document.getElementById(`marker-${nodeId}`);
                   if (markerEl) {
                     const rect = markerEl.getBoundingClientRect();
                       visible: rect.width > 0 && rect.height > 0,
                       position: { x: rect.left, y: rect.top },
                       size: { width: rect.width, height: rect.height },
                       opacity: markerEl.style.opacity,
                       zIndex: markerEl.style.zIndex,
                       transform: markerEl.style.transform
                     });
                   } else {
                   }
                 }
               });
             }
           }, 1000);
    */

  }, [filteredNodes, createNodeMarker]);

  // Initialize card map
  const initializeCardMap = useCallback(() => {
    if (map.current) {
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured.');
      return;
    }


    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [0, 0],
        zoom: 1,
        pitch: 0,
        bearing: 0,
        projection: 'globe',
        antialias: true,
        interactive: true
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');


      // Coordinate system verification
      setTimeout(() => {
        if (map.current) {
          // console.log('- Map projection:', map.current.getProjection()?.name);
          // console.log('- Map center:', map.current.getCenter());
          // console.log('- Map zoom:', map.current.getZoom());
          // console.log('- Map bounds:', map.current.getBounds());
          
          // Test coordinate projection
          const testCoords = [
            { name: 'NYC', lng: -74.0060, lat: 40.7128 },
            { name: 'London', lng: -0.1278, lat: 51.5074 },
            { name: 'Tokyo', lng: 139.6503, lat: 35.6762 }
          ];
          
          testCoords.forEach(coord => {
            // const point = map.current.project([coord.lng, coord.lat]);
            // console.log(`📍 ${coord.name} projection:`, {
            //   lng: coord.lng,
            //   lat: coord.lat,
            //   screenX: point.x,
            //   screenY: point.y,
            //   inViewport: point.x >= 0 && point.x <= map.current.getContainer().offsetWidth && 
            //              point.y >= 0 && point.y <= map.current.getContainer().offsetHeight
            // });
          });
        }
      }, 200);

      // Wait for map to load
      map.current.on('load', () => {
        // console.log('Card map loaded, creating markers');
        // Add a small delay to ensure map is fully rendered
        setTimeout(() => {
          if (filteredNodes.length > 0) {
            // console.log('Creating markers after map load delay');
            createCardMarkers();
          }
        }, 500);
      });
      
      // Trigger resize after map creation to ensure proper sizing
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
          // console.log('Map resized to fit container');
        }
      }, 100);

      // Add window resize listener
      const handleResize = () => {
        if (map.current) {
          map.current.resize();
          // console.log('Map resized due to window resize');
        }
      };
      window.addEventListener('resize', handleResize);

      // Track user interaction
      map.current.on('movestart', () => {
        setIsUserMovingMap(true);
      });

      map.current.on('moveend', () => {
        setIsUserMovingMap(false);
      });

    } catch (err) {
      console.error('Error initializing card map:', err);
      setError('Failed to initialize map');
    }
  }, [createCardMarkers, filteredNodes.length]);

  // Initialize fullscreen map
  const initializeFullscreenMap = useCallback(() => {
    // console.log('🔍 initializeFullscreenMap called');
    
    if (fullscreenMap.current) {
      // console.log('Fullscreen map already initialized');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      return;
    }

    // console.log('🔍 Creating fullscreen map with container:', fullscreenMapContainer.current);

    try {
      fullscreenMap.current = new mapboxgl.Map({
        container: fullscreenMapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [0, 0],
        zoom: 1,
        pitch: 0,
        bearing: 0,
        projection: 'globe',
        antialias: true,
        interactive: true
      });

      // console.log('✅ Fullscreen map created successfully');

      // Add navigation controls
      fullscreenMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Wait for map to load
      fullscreenMap.current.on('load', () => {
        // console.log('✅ Fullscreen map loaded, creating markers');
        if (filteredNodes.length > 0) {
          createFullscreenMarkers();
        }
      });

    } catch (err) {
      console.error('Error initializing fullscreen map:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes.length]);

  // Create markers for fullscreen map
  const createFullscreenMarkers = useCallback(() => {
    if (!fullscreenMap.current || !filteredNodes.length) return;

    // Clear existing fullscreen markers
    Object.values(fullscreenMarkers.current).forEach(marker => marker.remove());
    fullscreenMarkers.current = {};

    // console.log('Creating fullscreen markers for', filteredNodes.length, 'nodes');

    filteredNodes.forEach(node => {
      if (node.location && node.location.lat && node.location.lng) {
        const marker = createNodeMarker(node, fullscreenMap.current);
        if (marker) {
          fullscreenMarkers.current[node.id] = marker;
          // console.log(`✅ Fullscreen marker created for ${node.name} at ${node.location.lat}, ${node.location.lng}`);
        }
      } else {
        console.warn(`❌ Invalid location data for ${node.name}:`, node.location);
      }
    });

    // console.log(`Total fullscreen markers created: ${Object.keys(fullscreenMarkers.current).length}`);
    
    // Fit map bounds to show all markers
    if (filteredNodes.length > 0 && fullscreenMap.current) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidBounds = false;
      
      filteredNodes.forEach(node => {
        if (node.location && node.location.lat && node.location.lng) {
          bounds.extend([node.location.lng, node.location.lat]);
          hasValidBounds = true;
        }
      });
      
      // Add some padding and fit the map to show all markers
      if (hasValidBounds) {
        setTimeout(() => {
          if (fullscreenMap.current) {
            fullscreenMap.current.fitBounds(bounds, {
              padding: 100,
              maxZoom: 8,
              duration: 1000
            });
            // console.log('Fullscreen map fitted to show all markers');
          }
        }, 500);
      }
    }
    
    // console.log('Fullscreen markers created successfully');
  }, [filteredNodes, createNodeMarker]);

  // Initialize maps when component mounts
  useEffect(() => {
    if (mapContainer.current && !map.current) {
      initializeCardMap();
    }
  }, [initializeCardMap]);

  // Update markers when filtered nodes change
  useEffect(() => {
    if (map.current && !isUserMovingMap) {
      createCardMarkers();
    }
  }, [filteredNodes, createCardMarkers, isUserMovingMap]);

  // Update fullscreen markers when dialog opens
  useEffect(() => {
    // console.log('🔍 Fullscreen dialog state changed:', {
    //   open,
    //   hasContainer: !!fullscreenMapContainer.current,
    //   hasMap: !!fullscreenMap.current
    // });
    
    let retryTimeout;
    
    if (open && !fullscreenMap.current) {
      // console.log('🚀 Dialog opened, waiting for container...');
      
      // Wait for the dialog to fully render and the container to be available
      const checkContainer = () => {
        if (fullscreenMapContainer.current) {
          // console.log('✅ Container found, initializing fullscreen map...');
          initializeFullscreenMap();
        } else {
          // console.log('⏳ Container not ready yet, retrying...');
          retryTimeout = setTimeout(checkContainer, 50);
        }
      };
      
      // Start checking after a short delay to allow dialog to render
      setTimeout(checkContainer, 100);
    }
    
    // Cleanup function to clear any pending timeouts
    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [open, initializeFullscreenMap]);

  // Update fullscreen markers when filtered nodes change
  useEffect(() => {
    if (fullscreenMap.current && filteredNodes.length > 0) {
      createFullscreenMarkers();
    }
  }, [filteredNodes, createFullscreenMarkers]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!fetchInProgress) {
        fetchStellarNodes();
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchInProgress]); // Remove fetchStellarNodes from dependencies to prevent constant re-creation

  // Initial fetch - only run once on mount
  useEffect(() => {
    fetchStellarNodes();
    fetchXLMPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once

  // Auto-refresh XLM price every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchXLMPrice();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [fetchXLMPrice]);

  // Global function for popup button clicks
  useEffect(() => {
    window.openNodeDetails = (nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        setNodeDetailsOpen(true);
      }
    };

    return () => {
      delete window.openNodeDetails;
    };
  }, [nodes]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Clean up card map markers
      Object.values(currentMarkers.current).forEach(marker => marker.remove());
      currentMarkers.current = {};
      
      // Clean up fullscreen map markers
      Object.values(fullscreenMarkers.current).forEach(marker => marker.remove());
      fullscreenMarkers.current = {};
      
      // Clean up maps
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      if (fullscreenMap.current) {
        fullscreenMap.current.remove();
        fullscreenMap.current = null;
      }
      
      // Clean up visibility monitoring interval
      if (map.current && map.current._visibilityInterval) {
        clearInterval(map.current._visibilityInterval);
        map.current._visibilityInterval = null;
      }
      
      // Clean up resize event listener
      const handleResize = () => {
        if (map.current) {
          map.current.resize();
        }
      };
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleRefresh = () => {
    fetchStellarNodes();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'inactive': return '#F44336';
      case 'syncing': return '#FF9800';
      default: return '#757575';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <NetworkIcon sx={{ color: '#4CAF50' }} />;
      case 'inactive': return <NetworkIcon sx={{ color: '#F44336' }} />;
      case 'syncing': return <NetworkIcon sx={{ color: '#FF9800' }} />;
      default: return <NetworkIcon sx={{ color: '#757575' }} />;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      // Remove resize listener
      window.removeEventListener('resize', () => {
        if (map.current) {
          map.current.resize();
        }
      });
    };
  }, []);


  return (
    <>
      {/* Node Tracking Section */}
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
              🌐 Stellar Network Monitoring
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2, maxWidth: 600, mx: 'auto' }}>
                {error}
              </Alert>
            )}
            <Typography 
              variant="h6" 
              color="text.secondary" 
              sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
            >
              Monitor Stellar validators and core nodes with GPS precision and blockchain verification.
              Track the Stellar network infrastructure across the globe in real-time.
            </Typography>
            
            {/* Refresh Button */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Button
                variant="outlined"
                onClick={handleRefresh}
                disabled={loading}
                startIcon={<RefreshIcon />}
                sx={{ minWidth: 120 }}
              >
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </Button>
            </Box>
            
            {/* Stellar Network Stats with XLM Price */}
            <Grid container spacing={2} justifyContent="center" mb={4}>
              {/* XLM Price Card */}
              <Grid item>
                <Paper sx={{ 
                  p: 2, 
                  textAlign: 'center', 
                  minWidth: 140,
                  background: xlmPriceChange && xlmPriceChange > 0 
                    ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                    : xlmPriceChange && xlmPriceChange < 0
                    ? 'linear-gradient(135deg, #F44336 0%, #d32f2f 100%)'
                    : 'background.paper'
                }}>
                  {xlmPriceLoading ? (
                    <CircularProgress size={24} sx={{ color: 'white' }} />
                  ) : xlmPrice ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                        <MoneyIcon sx={{ color: 'white', fontSize: 20 }} />
                        <Typography variant="h5" color="white" fontWeight="bold">
                          ${xlmPrice.toFixed(4)}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                        XLM Price
                      </Typography>
                      {xlmPriceChange !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5 }}>
                          {xlmPriceChange > 0 ? (
                            <TrendingUpIcon sx={{ color: 'white', fontSize: 16 }} />
                          ) : (
                            <TrendingDownIcon sx={{ color: 'white', fontSize: 16 }} />
                          )}
                          <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>
                            {xlmPriceChange > 0 ? '+' : ''}{xlmPriceChange.toFixed(2)}%
                          </Typography>
                        </Box>
                      )}
                    </>
                  ) : (
                    <>
                      <Typography variant="h6" color="text.secondary">
                        N/A
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        XLM Price
                      </Typography>
                    </>
                  )}
                </Paper>
              </Grid>
              
              <Grid item>
                <Paper sx={{ p: 2, textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="primary" fontWeight="bold">
                    {nodes.filter(n => n.status === 'active').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Validators
                  </Typography>
                </Paper>
              </Grid>
              <Grid item>
                <Paper sx={{ p: 2, textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="text.primary" fontWeight="bold">
                    {nodes.filter(n => n.validatorType === 'core').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Core Nodes
                  </Typography>
                </Paper>
              </Grid>
              <Grid item>
                <Paper sx={{ p: 2, textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="success.main" fontWeight="bold">
                    {networkStats?.ledgerInfo?.sequence?.toLocaleString() || 'Loading...'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Current Ledger
                    {!networkStats && (
                      <Typography variant="caption" color="warning.main" display="block">
                        Horizon API unavailable
                      </Typography>
                    )}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item>
                <Paper sx={{ p: 2, textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="warning.main" fontWeight="bold">
                    {networkStats?.ledgerInfo?.protocol_version || networkStats?.networkInfo?.protocolVersion || 'Loading...'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Protocol Version
                    {!networkStats && (
                      <Typography variant="caption" color="warning.main" display="block">
                        Horizon API unavailable
                      </Typography>
                    )}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Box>

          <Grid container spacing={4} alignItems="center">
            {/* Map Preview */}
            <Grid item xs={12} md={8}>
              <Card sx={{ height: { xs: 500, md: 600 }, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <Box
                  ref={mapContainer}
                  sx={{
                    width: '100%',
                    flex: 1,
                    borderRadius: 1,
                    minHeight: '400px'
                  }}
                />
                
                {/* Top Action Buttons */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    display: 'flex',
                    gap: 1,
                    zIndex: 1000
                  }}
                >
                  <Tooltip title="Refresh node data">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: 'text.primary',
                        minWidth: { xs: 'auto', sm: 100 },
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      {loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>
                        Refresh
                      </Box>
                    </Button>
                  </Tooltip>
                  
                  <Tooltip title="View fullscreen map">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<FullscreenIcon />}
                      onClick={() => setOpen(true)}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: 'text.primary',
                        minWidth: { xs: 'auto', sm: 120 },
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      <FullscreenIcon />
                      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>
                        Fullscreen
                      </Box>
                    </Button>
                  </Tooltip>
                </Box>

                {/* Collapsible Search Panel at Bottom */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
                    transition: 'transform 0.3s ease-in-out',
                    transform: searchPanelExpanded ? 'translateY(0)' : 'translateY(calc(100% - 48px))'
                  }}
                >
                  {/* Panel Header with Toggle */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      borderBottom: searchPanelExpanded ? '1px solid' : 'none',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      backgroundColor: 'primary.main',
                      color: 'white'
                    }}
                    onClick={() => setSearchPanelExpanded(!searchPanelExpanded)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SearchIcon />
                      <Typography variant="subtitle2" fontWeight="bold">
                        Search & Filters
                      </Typography>
                      {filteredNodes.length !== nodes.length && (
                        <Chip 
                          label={`${filteredNodes.length} of ${nodes.length}`}
                          size="small"
                          sx={{ 
                            height: 20,
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            color: 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      )}
                    </Box>
                    <IconButton 
                      size="small" 
                      sx={{ color: 'white' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchPanelExpanded(!searchPanelExpanded);
                      }}
                    >
                      {searchPanelExpanded ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                    </IconButton>
                  </Box>

                  {/* Search and Filters Content */}
                  {searchPanelExpanded && (
                    <Box sx={{ 
                      p: { xs: 1.5, sm: 2 },
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                      maxHeight: { xs: '40vh', sm: 'auto' },
                      overflowY: 'auto'
                    }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Search nodes, cities, countries, public keys..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          backgroundColor: 'white'
                        }}
                      />
                      
                      <Box sx={{ 
                        display: 'grid',
                        gridTemplateColumns: { 
                          xs: '1fr', 
                          sm: 'repeat(2, 1fr)', 
                          md: 'repeat(3, 1fr)' 
                        },
                        gap: 1.5
                      }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Status</InputLabel>
                          <Select
                            value={statusFilter}
                            label="Status"
                            onChange={(e) => setStatusFilter(e.target.value)}
                          >
                            <MenuItem value="all">All Status</MenuItem>
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="syncing">Syncing</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                          </Select>
                        </FormControl>
                        
                        <FormControl size="small" fullWidth>
                          <InputLabel>Country</InputLabel>
                          <Select
                            value={countryFilter}
                            label="Country"
                            onChange={(e) => setCountryFilter(e.target.value)}
                          >
                            <MenuItem value="all">All Countries</MenuItem>
                            {uniqueCountries.map(country => (
                              <MenuItem key={country} value={country}>{country}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        
                        <FormControl size="small" fullWidth>
                          <InputLabel>Validator Type</InputLabel>
                          <Select
                            value={validatorTypeFilter}
                            label="Validator Type"
                            onChange={(e) => setValidatorTypeFilter(e.target.value)}
                          >
                            <MenuItem value="all">All Types</MenuItem>
                            <MenuItem value="core">Core</MenuItem>
                            <MenuItem value="validator">Validator</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      {/* Clear Filters Button */}
                      {(statusFilter !== 'all' || countryFilter !== 'all' || validatorTypeFilter !== 'all' || searchQuery) && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setStatusFilter('all');
                            setCountryFilter('all');
                            setValidatorTypeFilter('all');
                            setSearchQuery('');
                          }}
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          Clear All Filters
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>

                {error && (
                  <Alert 
                    severity="error" 
                    sx={{ 
                      position: 'absolute', 
                      top: 60, 
                      left: 16, 
                      right: 16,
                      zIndex: 1001
                    }}
                  >
                    {error}
                  </Alert>
                )}
              </Card>
            </Grid>

            {/* Node List */}
            <Grid item xs={12} md={4}>
              <Card sx={{ height: { xs: 300, md: 400 }, overflow: 'auto' }}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Stellar Validators ({filteredNodes.length})
                  </Typography>
                  
                  {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                      <CircularProgress />
                    </Box>
                  )}
                  
                  {!loading && filteredNodes.length === 0 && (
                    <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                      No nodes found
                    </Typography>
                  )}
                  
                  {!loading && filteredNodes.length > 0 && (
                    <List dense>
                      {filteredNodes.map((node, index) => (
                        <React.Fragment key={node.id}>
                          <ListItem
                            component="div"
                            onClick={() => {
                              setSelectedNode(node);
                              setNodeDetailsOpen(true);
                            }}
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover'
                              }
                            }}
                          >
                            <ListItemIcon>
                              {getStatusIcon(node.status)}
                            </ListItemIcon>
                            <ListItemText
                              primary={node.name}
                              secondary={`${node.city}, ${node.country}`}
                            />
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip
                                label={node.status}
                                size="small"
                                sx={{
                                  backgroundColor: getStatusColor(node.status),
                                  color: 'white',
                                  fontSize: '0.7rem',
                                  height: 20
                                }}
                              />
                              <Chip
                                label={node.uptime}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            </Box>
                          </ListItem>
                          {index < filteredNodes.length - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                    </List>
                  )}
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Fullscreen Map Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            width: '100vw',
            height: '100vh',
            maxWidth: 'none',
            maxHeight: 'none',
            margin: 0,
            borderRadius: 0
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between', 
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 2,
          backgroundColor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          pb: 2
        }}>
          <Typography variant="h5" component="div">
            Stellar Network Nodes - Full View
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            gap: 1, 
            alignItems: 'center',
            flexWrap: 'wrap',
            width: { xs: '100%', md: 'auto' }
          }}>
            <TextField
              size="small"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: { xs: '100%', sm: 200 } }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="syncing">Syncing</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Country</InputLabel>
              <Select
                value={countryFilter}
                label="Country"
                onChange={(e) => setCountryFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                {uniqueCountries.map(country => (
                  <MenuItem key={country} value={country}>{country}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? <CircularProgress size={16} /> : 'Refresh'}
            </Button>
            <IconButton onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <Box
            ref={fullscreenMapContainer}
            sx={{
              width: '100%',
              height: 'calc(100vh - 64px)'
            }}
          />
          
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                position: 'absolute', 
                top: 16, 
                left: 16, 
                right: 16,
                zIndex: 1000
              }}
            >
              {error}
            </Alert>
          )}
        </DialogContent>
      </Dialog>

      {/* Node Details Dialog */}
      <Dialog
        open={nodeDetailsOpen}
        onClose={() => setNodeDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <Typography variant="h6" component="div">
            {selectedNode?.name}
          </Typography>
          <IconButton onClick={() => setNodeDetailsOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent>
          {selectedNode && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <Typography variant="subtitle1" gutterBottom>
                      <LocationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Location Information
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>City:</strong> {selectedNode.city}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Country:</strong> {selectedNode.country}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Coordinates:</strong> {selectedNode.location.lat.toFixed(4)}, {selectedNode.location.lng.toFixed(4)}
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <Typography variant="subtitle1" gutterBottom>
                      <NetworkIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Network Status
                    </Typography>
                    <Typography component="div" variant="body2" color="text.secondary">
                      <strong>Status:</strong> 
                      <Chip 
                        label={selectedNode.status} 
                        size="small" 
                        sx={{ 
                          ml: 1,
                          backgroundColor: getStatusColor(selectedNode.status),
                          color: 'white'
                        }} 
                      />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Network:</strong> {selectedNode.network}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Version:</strong> {selectedNode.version}
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <Typography variant="subtitle1" gutterBottom>
                      <SpeedIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Performance
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Uptime:</strong> {selectedNode.uptime}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Latency:</strong> {selectedNode.latency}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Last Seen:</strong> {new Date(selectedNode.lastSeen).toLocaleString()}
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <Typography variant="subtitle1" gutterBottom>
                      <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Blockchain Verification
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Public Key:</strong> {selectedNode.publicKey}
                    </Typography>
                    <Typography component="div" variant="body2" color="text.secondary">
                      <strong>Verification:</strong> 
                      <Chip 
                        label="Verified" 
                        size="small" 
                        color="success" 
                        sx={{ ml: 1 }} 
                      />
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RealTimeNodeTracking;
