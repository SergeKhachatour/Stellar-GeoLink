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
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  Fullscreen as FullscreenIcon,
  LocationOn as LocationIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  NetworkCheck as NetworkIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon
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
      
      console.log('Fetched Stellar validators:', validators.length);
      
      // Try to fetch network stats separately (this might fail)
      try {
        const stats = await stellarNetworkService.getNetworkStatsCached();
        setNetworkStats(stats);
        console.log('Network stats:', stats);
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

  // Filter nodes based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredNodes(nodes);
    } else {
      const filtered = nodes.filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.status.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredNodes(filtered);
    }
  }, [nodes, searchQuery]);

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

    console.log(`Creating marker for ${node.name} at:`, { lng: finalLng, lat: finalLat });

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
      console.log('Node marker clicked:', node);
      setSelectedNode(node);
      setNodeDetailsOpen(true);
    });

    console.log(`✅ Marker created for ${node.name} at ${finalLat}, ${finalLng}`);
    return marker;
  }, []);

  // Create markers for the card map
  const createCardMarkers = useCallback(() => {
    if (!map.current || !filteredNodes.length) return;

    // Check if markers already exist to prevent recreation
    if (Object.keys(currentMarkers.current).length > 0) {
      console.log('Markers already exist, skipping recreation');
      return;
    }

    // Clear existing markers
    Object.values(currentMarkers.current).forEach(marker => marker.remove());
    currentMarkers.current = {};

    console.log('Creating card markers for', filteredNodes.length, 'nodes');
    console.log('Map projection:', map.current.getProjection()?.name);
    console.log('Map center:', map.current.getCenter());
    console.log('Map zoom:', map.current.getZoom());

    filteredNodes.forEach((node, index) => {
      console.log(`Processing node ${index + 1}/${filteredNodes.length}:`, {
        id: node.id,
        name: node.name,
        location: node.location,
        city: node.city,
        country: node.country,
        coordinates: `[${node.location?.lng}, ${node.location?.lat}]`
      });

      if (node.location && node.location.lat && node.location.lng) {
        const marker = createNodeMarker(node, map.current);
        if (marker) {
          currentMarkers.current[node.id] = marker;
          console.log(`✅ Marker created for ${node.name} at ${node.location.lat}, ${node.location.lng}`);
        }
      } else {
        console.warn(`❌ Invalid location data for ${node.name}:`, node.location);
      }
    });

    console.log(`Total markers created: ${Object.keys(currentMarkers.current).length}`);
    
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
            console.log('Map fitted to show all markers (one time only)');
          }
        }, 500);
      }
    }
    
    console.log('Card markers created successfully');
    
    // Temporarily disable test markers to debug positioning issue
    /*
           // Enhanced test markers with coordinate verification
           console.log('Adding enhanced test markers to verify map positioning');
           
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
             console.log(`📍 Testing ${test.name} coordinates:`, { lng, lat });
             
             // Check if coordinates project correctly
             const point = map.current.project([lng, lat]);
             console.log(`🎯 ${test.name} screen projection:`, {
               screenX: point.x,
               screenY: point.y,
               inViewport: point.x >= 0 && point.x <= map.current.getContainer().offsetWidth && 
                          point.y >= 0 && point.y <= map.current.getContainer().offsetHeight
             });
             
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
             console.log(`✅ ${test.color.toUpperCase()} test marker added at ${test.name} coordinates`);
           });
           
           // Log map bounds and center for debugging
           setTimeout(() => {
             if (map.current) {
               console.log('🗺️ Map Debug Info:');
               console.log('- Map center:', map.current.getCenter());
               console.log('- Map zoom:', map.current.getZoom());
               console.log('- Map bounds:', map.current.getBounds());
               console.log('- Map projection:', map.current.getProjection()?.name);
               console.log('- Map container size:', map.current.getContainer().getBoundingClientRect());
               
               // Check if custom markers are visible
               console.log('🔍 Checking custom marker visibility:');
               Object.keys(currentMarkers.current).forEach(nodeId => {
                 if (!nodeId.startsWith('test-marker-')) {
                   const markerEl = document.getElementById(`marker-${nodeId}`);
                   if (markerEl) {
                     const rect = markerEl.getBoundingClientRect();
                     console.log(`✅ Custom marker ${nodeId}:`, {
                       visible: rect.width > 0 && rect.height > 0,
                       position: { x: rect.left, y: rect.top },
                       size: { width: rect.width, height: rect.height },
                       opacity: markerEl.style.opacity,
                       zIndex: markerEl.style.zIndex,
                       transform: markerEl.style.transform
                     });
                   } else {
                     console.log(`❌ Custom marker ${nodeId}: NOT FOUND IN DOM`);
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
      console.log('Card map already initialized');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured.');
      return;
    }

    console.log('Initializing card map with container:', mapContainer.current);

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

      console.log('Card map created successfully');

      // Coordinate system verification
      setTimeout(() => {
        if (map.current) {
          console.log('🔍 Coordinate System Verification:');
          console.log('- Map projection:', map.current.getProjection()?.name);
          console.log('- Map center:', map.current.getCenter());
          console.log('- Map zoom:', map.current.getZoom());
          console.log('- Map bounds:', map.current.getBounds());
          
          // Test coordinate projection
          const testCoords = [
            { name: 'NYC', lng: -74.0060, lat: 40.7128 },
            { name: 'London', lng: -0.1278, lat: 51.5074 },
            { name: 'Tokyo', lng: 139.6503, lat: 35.6762 }
          ];
          
          testCoords.forEach(coord => {
            const point = map.current.project([coord.lng, coord.lat]);
            console.log(`📍 ${coord.name} projection:`, {
              lng: coord.lng,
              lat: coord.lat,
              screenX: point.x,
              screenY: point.y,
              inViewport: point.x >= 0 && point.x <= map.current.getContainer().offsetWidth && 
                         point.y >= 0 && point.y <= map.current.getContainer().offsetHeight
            });
          });
        }
      }, 200);

      // Wait for map to load
      map.current.on('load', () => {
        console.log('Card map loaded, creating markers');
        // Add a small delay to ensure map is fully rendered
        setTimeout(() => {
          if (filteredNodes.length > 0) {
            console.log('Creating markers after map load delay');
            createCardMarkers();
          }
        }, 500);
      });
      
      // Trigger resize after map creation to ensure proper sizing
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
          console.log('Map resized to fit container');
        }
      }, 100);

      // Add window resize listener
      const handleResize = () => {
        if (map.current) {
          map.current.resize();
          console.log('Map resized due to window resize');
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
    console.log('🔍 initializeFullscreenMap called');
    
    if (fullscreenMap.current) {
      console.log('Fullscreen map already initialized');
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      return;
    }

    console.log('🔍 Creating fullscreen map with container:', fullscreenMapContainer.current);

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

      console.log('✅ Fullscreen map created successfully');

      // Add navigation controls
      fullscreenMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Wait for map to load
      fullscreenMap.current.on('load', () => {
        console.log('✅ Fullscreen map loaded, creating markers');
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

    console.log('Creating fullscreen markers for', filteredNodes.length, 'nodes');

    filteredNodes.forEach(node => {
      if (node.location && node.location.lat && node.location.lng) {
        const marker = createNodeMarker(node, fullscreenMap.current);
        if (marker) {
          fullscreenMarkers.current[node.id] = marker;
          console.log(`✅ Fullscreen marker created for ${node.name} at ${node.location.lat}, ${node.location.lng}`);
        }
      } else {
        console.warn(`❌ Invalid location data for ${node.name}:`, node.location);
      }
    });

    console.log(`Total fullscreen markers created: ${Object.keys(fullscreenMarkers.current).length}`);
    
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
            console.log('Fullscreen map fitted to show all markers');
          }
        }, 500);
      }
    }
    
    console.log('Fullscreen markers created successfully');
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
    console.log('🔍 Fullscreen dialog state changed:', { 
      open, 
      hasContainer: !!fullscreenMapContainer.current, 
      hasMap: !!fullscreenMap.current 
    });
    
    let retryTimeout;
    
    if (open && !fullscreenMap.current) {
      console.log('🚀 Dialog opened, waiting for container...');
      
      // Wait for the dialog to fully render and the container to be available
      const checkContainer = () => {
        if (fullscreenMapContainer.current) {
          console.log('✅ Container found, initializing fullscreen map...');
          initializeFullscreenMap();
        } else {
          console.log('⏳ Container not ready yet, retrying...');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once

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

  // CRITICAL: Log when component renders to verify it's being included
  useEffect(() => {
    console.log('%c🌐 RealTimeNodeTracking Component Rendered', 'color: #00ff00; font-size: 16px; font-weight: bold;');
    console.log('Component state:', { loading, error, nodesCount: nodes.length, hasNetworkStats: !!networkStats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only log once on mount, not on every state change

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
            
            {/* Stellar Network Stats */}
            <Grid container spacing={2} justifyContent="center" mb={4}>
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
              <Card sx={{ height: { xs: 500, md: 600 }, position: 'relative' }}>
                <Box
                  ref={mapContainer}
                  sx={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 1,
                    minHeight: '500px'
                  }}
                />
                
                {/* Map Overlay Controls */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    right: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 1000
                  }}
                >
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
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: 1,
                      minWidth: 200
                    }}
                  />
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        color: 'text.primary',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      {loading ? <CircularProgress size={16} /> : 'Refresh'}
                    </Button>
                    
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<FullscreenIcon />}
                      onClick={() => {
                        console.log('🔍 View Full Map button clicked');
                        setOpen(true);
                      }}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        color: 'text.primary',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      Fullscreen
                    </Button>
                  </Box>
                </Box>

                {error && (
                  <Alert severity="error" sx={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
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
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider'
        }}>
          <Typography variant="h5" component="div">
            Stellar Network Nodes - Full View
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
              sx={{ minWidth: 200 }}
            />
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
