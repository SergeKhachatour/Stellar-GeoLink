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
  Tooltip,
  useTheme,
  useMediaQuery
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

// Add CSS styles for Stellar node markers (matching NFT Dashboard style)
const nodeMarkerStyles = `
  .node-marker {
    width: 20px !important;
    height: 20px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 50% !important;
    border: 3px solid #ffffff !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    overflow: hidden !important;
    /* Allow Mapbox to transform markers for 3D globe projection */
    transition: none !important;
  }
  
  .node-marker img,
  .node-marker div {
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
  
  /* Specific styling for node popups */
  .node-popup {
    z-index: 3000 !important;
  }
  
  .node-popup .mapboxgl-popup-content {
    z-index: 3001 !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important;
  }
  
  .node-popup .mapboxgl-popup-tip {
    z-index: 3002 !important;
  }
`;

// Inject styles into the document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = nodeMarkerStyles;
  document.head.appendChild(styleSheet);
}

const RealTimeNodeTracking = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNodes, setFilteredNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [fetchInProgress, setFetchInProgress] = useState(false);
  const [nodeDetailsOpen, setNodeDetailsOpen] = useState(false);
  
  // Enhanced search filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [validatorTypeFilter, setValidatorTypeFilter] = useState('all');
  
  // Search panel state - minimized by default on mobile
  const [searchPanelExpanded, setSearchPanelExpanded] = useState(!isMobile);
  
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

  // Create node marker with popup (simplified like NFT markers)
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

    // Create marker element with pointer cursor (matching NFT Dashboard style)
    const el = document.createElement('div');
    el.className = 'node-marker';
    el.style.cursor = 'pointer';
    el.style.backgroundColor = markerColor;
    
    // Hover effect - use opacity and shadow instead of scale to prevent marker movement
    el.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      el.style.opacity = '0.9';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    });
    el.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      el.style.opacity = '1';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    // Create popup content (mobile-friendly)
    const popupContent = document.createElement('div');
    popupContent.style.cssText = `
      min-width: 200px;
      max-width: 300px;
      font-family: 'Roboto', sans-serif;
      padding: 0;
    `;
    
    const network = node.network || 'public';
    const stellarExpertBase = network === 'testnet' 
      ? 'https://stellar.expert/explorer/testnet'
      : 'https://stellar.expert/explorer/public';
    
    popupContent.innerHTML = `
      <div style="padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px 8px 0 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${node.name || 'Stellar Node'}</h3>
        <div style="font-size: 12px; opacity: 0.9;">
          ${node.city ? `${node.city}, ` : ''}${node.country || 'Unknown'}
        </div>
      </div>
      <div style="padding: 12px; background: white;">
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 12px; color: #666;">Status:</strong>
          <span style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background: ${markerColor}; color: white;">
            ${node.status || 'unknown'}
          </span>
        </div>
        ${node.publicKey ? `
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 12px; color: #666;">Public Key:</strong>
            <div style="font-size: 11px; word-break: break-all; color: #333; margin-top: 4px;">
              ${node.publicKey.substring(0, 20)}...
            </div>
          </div>
        ` : ''}
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 12px;">
          <button 
            onclick="window.openNodeDetails('${node.id}')"
            style="
              width: 100%;
              padding: 8px 12px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              font-weight: 500;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='#5568d3'"
            onmouseout="this.style.background='#667eea'"
          >
            View Details
          </button>
          ${node.publicKey ? `
            <button 
              onclick="window.open('${stellarExpertBase}/account/${node.publicKey}', '_blank')"
              style="
                width: 100%;
                padding: 8px 12px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: background 0.2s;
              "
              onmouseover="this.style.background='#45a049'"
              onmouseout="this.style.background='#4CAF50'"
            >
              View on StellarExpert
            </button>
          ` : ''}
          <button 
            onclick="window.zoomToNode('${node.id}', ${finalLng}, ${finalLat})"
            style="
              width: 100%;
              padding: 8px 12px;
              background: #FF9800;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              font-weight: 500;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='#f57c00'"
            onmouseout="this.style.background='#FF9800'"
          >
            Zoom In
          </button>
        </div>
      </div>
    `;

    // Create marker with popup (matching NFT Dashboard - no draggable, stable positioning)
    const marker = new mapboxgl.Marker(el)
      .setLngLat([finalLng, finalLat])
      .setPopup(
        new mapboxgl.Popup({ 
          offset: 25,
          closeButton: true,
          closeOnClick: false,
          maxWidth: '300px',
          className: 'node-popup'
        }).setDOMContent(popupContent)
      )
      .addTo(mapInstance);

    // Add click handler to open details dialog
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedNode(node);
      setNodeDetailsOpen(true);
    });

    return marker;
  }, []);

  // Create markers for the card map - now updates when filteredNodes changes
  const createCardMarkers = useCallback(() => {
    if (!map.current) return;

    // Always clear existing markers to reflect current filter state
    Object.values(currentMarkers.current).forEach(marker => marker.remove());
    currentMarkers.current = {};

    // Only create markers for filtered nodes
    if (filteredNodes.length === 0) {
      return;
    }

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

    // Fit map bounds to show all filtered markers
    if (filteredNodes.length > 0 && map.current) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidBounds = false;
      
      filteredNodes.forEach(node => {
        if (node.location && node.location.lat && node.location.lng) {
          bounds.extend([node.location.lng, node.location.lat]);
          hasValidBounds = true;
        }
      });
      
      // Fit the map to show all filtered markers
      if (hasValidBounds) {
        setTimeout(() => {
          if (map.current) {
            map.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 8,
              duration: 1000
            });
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
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true,
        globe: {
          enableAtmosphere: true,
          atmosphereColor: '#FFD700',
          atmosphereIntensity: 0.3,
          enableStars: true,
          starIntensity: 0.5
        }
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

      // Track user interaction (removed unused state)

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
        optimizeForTerrain: true,
        maxPitch: 85,
        maxZoom: 22,
        minZoom: 0,
        maxBounds: [[-180, -85], [180, 85]],
        renderWorldCopies: false,
        interactive: true,
        globe: {
          enableAtmosphere: true,
          atmosphereColor: '#FFD700',
          atmosphereIntensity: 0.3,
          enableStars: true,
          starIntensity: 0.5
        }
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

  // Create markers for fullscreen map - updates when filteredNodes changes
  const createFullscreenMarkers = useCallback(() => {
    if (!fullscreenMap.current) return;

    // Always clear existing fullscreen markers to reflect current filter state
    Object.values(fullscreenMarkers.current).forEach(marker => marker.remove());
    fullscreenMarkers.current = {};

    // Only create markers for filtered nodes
    if (filteredNodes.length === 0) {
      return;
    }

    filteredNodes.forEach(node => {
      if (node.location && node.location.lat && node.location.lng) {
        const marker = createNodeMarker(node, fullscreenMap.current);
        if (marker) {
          fullscreenMarkers.current[node.id] = marker;
        }
      } else {
        console.warn(`❌ Invalid location data for ${node.name}:`, node.location);
      }
    });
    
    // Fit map bounds to show all filtered markers
    if (filteredNodes.length > 0 && fullscreenMap.current) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidBounds = false;
      
      filteredNodes.forEach(node => {
        if (node.location && node.location.lat && node.location.lng) {
          bounds.extend([node.location.lng, node.location.lat]);
          hasValidBounds = true;
        }
      });
      
      // Fit the map to show all filtered markers
      if (hasValidBounds) {
        setTimeout(() => {
          if (fullscreenMap.current) {
            fullscreenMap.current.fitBounds(bounds, {
              padding: 100,
              maxZoom: 8,
              duration: 1000
            });
          }
        }, 500);
      }
    }
  }, [filteredNodes, createNodeMarker]);

  // Initialize maps when component mounts
  useEffect(() => {
    if (mapContainer.current && !map.current) {
      initializeCardMap();
    }
  }, [initializeCardMap]);

  // Update markers when filtered nodes change - always update to reflect filters
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      createCardMarkers();
    }
  }, [filteredNodes, createCardMarkers]);

  // Setup global functions for popup buttons
  useEffect(() => {
    window.openNodeDetails = (nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        setNodeDetailsOpen(true);
      }
    };

    window.zoomToNode = (nodeId, lng, lat) => {
      if (map.current) {
        map.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 1500
        });
      }
      if (fullscreenMap.current) {
        fullscreenMap.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 1500
        });
      }
    };

    return () => {
      delete window.openNodeDetails;
      delete window.zoomToNode;
    };
  }, [nodes]);

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
              Stellar Network
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
            
            {/* Refresh Button - Compact */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Tooltip title="Refresh node data">
                <IconButton
                  onClick={handleRefresh}
                  disabled={loading}
                  size="small"
                  sx={{ 
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    }
                  }}
                >
                  {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                </IconButton>
              </Tooltip>
            </Box>
            
            {/* XLM Price Card - On its own row above others */}
            <Grid 
              container 
              spacing={2} 
              justifyContent="center" 
              mb={2}
              sx={{ px: { xs: 1, sm: 0 } }}
            >
              <Grid item xs={12} sm={8} md={6}>
                <Paper sx={{ 
                  p: { xs: 2, sm: 2.5 }, 
                  textAlign: 'center'
                }}>
                  {xlmPriceLoading ? (
                    <CircularProgress size={20} />
                  ) : xlmPrice ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                        <MoneyIcon sx={{ 
                          color: xlmPriceChange !== null 
                            ? (xlmPriceChange > 0 ? 'success.main' : 'error.main')
                            : 'text.secondary', 
                          fontSize: { xs: 16, sm: 20 } 
                        }} />
                        <Typography 
                          variant="h5" 
                          color={xlmPriceChange !== null 
                            ? (xlmPriceChange > 0 ? 'success.main' : 'error.main')
                            : 'text.primary'} 
                          fontWeight="bold"
                          sx={{ fontSize: { xs: '1rem', sm: '1.5rem' } }}
                        >
                          {xlmPrice.toFixed(7)}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                      >
                        XLM Price
                      </Typography>
                      {xlmPriceChange !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5 }}>
                          {xlmPriceChange > 0 ? (
                            <TrendingUpIcon sx={{ color: 'success.main', fontSize: { xs: 12, sm: 16 } }} />
                          ) : (
                            <TrendingDownIcon sx={{ color: 'error.main', fontSize: { xs: 12, sm: 16 } }} />
                          )}
                          <Typography 
                            variant="caption" 
                            color={xlmPriceChange > 0 ? 'success.main' : 'error.main'}
                            fontWeight="bold"
                            sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                          >
                            {xlmPriceChange > 0 ? '+' : ''}{xlmPriceChange.toFixed(2)}%
                          </Typography>
                        </Box>
                      )}
                    </>
                  ) : (
                    <>
                      <Typography variant="h6" color="text.secondary" sx={{ fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                        N/A
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                        XLM Price
                      </Typography>
                    </>
                  )}
                </Paper>
              </Grid>
            </Grid>
            
            {/* Other Stats Cards - Below XLM Price */}
            <Grid 
              container 
              spacing={{ xs: 1, sm: 2 }} 
              justifyContent="center" 
              mb={4}
              sx={{ px: { xs: 1, sm: 0 } }}
            >
              <Grid item xs={6} sm="auto">
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  textAlign: 'center', 
                  minWidth: { xs: 'auto', sm: 120 },
                  width: { xs: '100%', sm: 'auto' }
                }}>
                  <Typography 
                    variant="h4" 
                    color="primary" 
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.25rem', sm: '2.125rem' } }}
                  >
                    {nodes.filter(n => n.status === 'active').length}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                  >
                    Active Validators
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm="auto">
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  textAlign: 'center', 
                  minWidth: { xs: 'auto', sm: 120 },
                  width: { xs: '100%', sm: 'auto' }
                }}>
                  <Typography 
                    variant="h4" 
                    color="text.primary" 
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.25rem', sm: '2.125rem' } }}
                  >
                    {nodes.filter(n => n.validatorType === 'core').length}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                  >
                    Core Nodes
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm="auto">
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  textAlign: 'center', 
                  minWidth: { xs: 'auto', sm: 120 },
                  width: { xs: '100%', sm: 'auto' }
                }}>
                  <Typography 
                    variant="h4" 
                    color="success.main" 
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.25rem', sm: '2.125rem' } }}
                  >
                    {networkStats?.ledgerInfo?.sequence?.toLocaleString() || 'Loading...'}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                  >
                    Current Ledger
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm="auto">
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  textAlign: 'center', 
                  minWidth: { xs: 'auto', sm: 120 },
                  width: { xs: '100%', sm: 'auto' }
                }}>
                  <Typography 
                    variant="h4" 
                    color="info.main" 
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.25rem', sm: '2.125rem' } }}
                  >
                    {networkStats?.ledgerInfo?.protocol_version || networkStats?.networkInfo?.protocolVersion || 'Loading...'}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                  >
                    Protocol Version
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Box>

          <Grid container spacing={4} alignItems="center">
            {/* Map Preview */}
            <Grid item xs={12} md={8}>
              <Card sx={{ 
                height: { xs: searchPanelExpanded ? 400 : 500, md: 600 }, 
                position: 'relative', 
                display: 'flex', 
                flexDirection: 'column',
                transition: 'height 0.3s ease-in-out'
              }}>
                <Box
                  ref={mapContainer}
                  sx={{
                    width: '100%',
                    flex: 1,
                    borderRadius: 1,
                    minHeight: { xs: searchPanelExpanded ? '250px' : '300px', md: '400px' }
                  }}
                />
                
                {/* Top Action Buttons - IconButtons only to avoid duplicates */}
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
                    <IconButton
                      size="small"
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: 'text.primary',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      {loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip title="View fullscreen map">
                    <IconButton
                      size="small"
                      onClick={() => setOpen(true)}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: 'text.primary',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      <FullscreenIcon />
                    </IconButton>
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
                    transform: searchPanelExpanded ? 'translateY(0)' : 'translateY(calc(100% - 48px))',
                    maxHeight: { xs: searchPanelExpanded ? '50vh' : '48px', sm: 'none' }
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
              <Card sx={{ height: { xs: 300, md: 600 }, overflow: 'auto' }}>
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

      {/* Node Details Dialog - Mobile Friendly */}
      <Dialog
        open={nodeDetailsOpen}
        onClose={() => setNodeDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 600}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 2 },
            maxHeight: { xs: '100vh', sm: '90vh' }
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          pb: 1
        }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
            {selectedNode?.name || 'Node Details'}
          </Typography>
          <IconButton onClick={() => setNodeDetailsOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ pt: 2, overflowY: 'auto' }}>
          {selectedNode && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                      <LocationIcon sx={{ mr: 1 }} />
                      Location Information
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        <strong>City:</strong> {selectedNode.city || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        <strong>Country:</strong> {selectedNode.country || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Coordinates:</strong> {selectedNode.location?.lat?.toFixed(4) || 'N/A'}, {selectedNode.location?.lng?.toFixed(4) || 'N/A'}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                      <NetworkIcon sx={{ mr: 1 }} />
                      Network Status
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography component="div" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        <strong>Status:</strong> 
                        <Chip 
                          label={selectedNode.status} 
                          size="small" 
                          sx={{ 
                            ml: 1,
                            backgroundColor: getStatusColor(selectedNode.status),
                            color: 'white',
                            fontSize: '0.7rem'
                          }} 
                        />
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        <strong>Network:</strong> {selectedNode.network || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Version:</strong> {selectedNode.version || 'N/A'}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                      <SpeedIcon sx={{ mr: 1 }} />
                      Performance
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        <strong>Uptime:</strong> {selectedNode.uptime || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        <strong>Latency:</strong> {selectedNode.latency || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Last Seen:</strong> {selectedNode.lastSeen ? new Date(selectedNode.lastSeen).toLocaleString() : 'N/A'}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
                
                {selectedNode.publicKey && (
                  <Grid item xs={12}>
                    <Paper component="div" sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 2 }}>
                      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        <SecurityIcon sx={{ mr: 1 }} />
                        Blockchain Verification
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, wordBreak: 'break-all', fontSize: '0.85rem' }}>
                          <strong>Public Key:</strong><br />
                          {selectedNode.publicKey}
                        </Typography>
                        <Typography component="div" variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          <strong>Verification:</strong> 
                          <Chip 
                            label="Verified" 
                            size="small" 
                            color="success" 
                            sx={{ ml: 1 }} 
                          />
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                          <Button
                            variant="contained"
                            color="primary"
                            fullWidth
                            onClick={() => {
                              const network = selectedNode.network || 'public';
                              const baseUrl = network === 'testnet' 
                                ? 'https://stellar.expert/explorer/testnet'
                                : 'https://stellar.expert/explorer/public';
                              window.open(`${baseUrl}/account/${selectedNode.publicKey}`, '_blank');
                            }}
                            sx={{ textTransform: 'none' }}
                          >
                            View on StellarExpert
                          </Button>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            onClick={() => {
                              if (map.current && selectedNode.location) {
                                map.current.flyTo({
                                  center: [selectedNode.location.lng, selectedNode.location.lat],
                                  zoom: 12,
                                  duration: 1500
                                });
                              }
                              if (fullscreenMap.current && selectedNode.location) {
                                fullscreenMap.current.flyTo({
                                  center: [selectedNode.location.lng, selectedNode.location.lat],
                                  zoom: 12,
                                  duration: 1500
                                });
                              }
                              setNodeDetailsOpen(false);
                            }}
                            sx={{ textTransform: 'none' }}
                          >
                            Zoom In on Map
                          </Button>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RealTimeNodeTracking;
