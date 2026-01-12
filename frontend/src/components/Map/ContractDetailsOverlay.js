import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  IconButton
} from '@mui/material';
import {
  ExpandMore,
  Code,
  PlayArrow,
  CheckCircle,
  Cancel,
  SmartToy,
  ZoomIn,
  MyLocation,
  Close
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import api from '../../services/api';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

const ContractDetailsOverlay = ({ open, onClose, item, itemType = 'nft' }) => {
  const { publicKey, isConnected, secretKey } = useWallet();
  const [contract, setContract] = useState(null);
  const [ruleDetails, setRuleDetails] = useState(null); // Full rule details for contract_rule
  const [userLocation, setUserLocation] = useState(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [distance, setDistance] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [functionParams, setFunctionParams] = useState({});
  const [expandedFunction, setExpandedFunction] = useState(null);
  const [mapContainer, setMapContainer] = useState(null);
  const mapRef = useRef(null);
  const [nearbyWallets, setNearbyWallets] = useState([]);
  const markersRef = useRef([]);

  // Calculate itemRadius early to avoid initialization errors
  const itemRadius = item ? (item.radius_meters || item.radius || 100) : 100;

  const fetchContractDetails = async (contractIdOrAddress) => {
    if (!contractIdOrAddress) {
      console.warn('No contract ID or address provided, skipping contract details fetch');
      return;
    }
    try {
      // Try to get by ID first
      const response = await api.get(`/contracts/${contractIdOrAddress}`);
      if (response.data.success && response.data.contract) {
        setContract(response.data.contract);
      }
    } catch (error) {
      // Don't let API errors cause logout - just log and continue
      if (error.response?.status === 404) {
        console.warn('Contract not found:', contractIdOrAddress);
      } else {
        console.error('Error fetching contract details:', error);
      }
    }
  };

  const fetchRuleDetails = useCallback(async (ruleId) => {
    if (!ruleId) {
      console.warn('No rule ID provided, skipping rule details fetch');
      return;
    }
    try {
      const response = await api.get(`/contracts/rules/${ruleId}`);
      if (response.data.success && response.data.rule) {
        setRuleDetails(response.data.rule);
        // Also fetch contract details if we have contract_id
        if (response.data.rule.contract_id) {
          fetchContractDetails(response.data.rule.contract_id);
        }
      }
    } catch (error) {
      // Don't log out on 404 or other non-auth errors
      if (error.response?.status === 404) {
        console.warn('Rule not found:', ruleId);
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('Authentication error fetching rule details:', error);
        // Don't let this trigger logout - just show an error
      } else {
        console.error('Error fetching rule details:', error);
      }
    }
  }, []);

  const fetchNearbyWallets = useCallback(async (lat, lon, radius) => {
    if (!lat || !lon || !radius) {
      console.warn('Invalid parameters for fetching nearby wallets');
      return;
    }
    try {
      const response = await api.get(`/location/nearby?lat=${lat}&lon=${lon}&radius=${radius * 2}`); // Use 2x radius to show more context
      if (response.data && Array.isArray(response.data)) {
        // Filter out the current user's wallet if they have one
        const filtered = response.data.filter(wallet => wallet.public_key !== publicKey);
        setNearbyWallets(filtered);
      }
    } catch (error) {
      // Don't let API errors cause logout - this is non-critical
      console.warn('Error fetching nearby wallets (non-critical):', error);
    }
  }, [publicKey]);

  const checkProximity = useCallback((userLoc, targetItem) => {
    if (!targetItem || !targetItem.latitude || !targetItem.longitude || !userLoc || !userLoc.latitude || !userLoc.longitude) {
      console.warn('Missing coordinates for distance calculation', { userLoc, targetItem });
      return;
    }

    // Parse coordinates as floats to ensure they're numbers
    const lat1 = parseFloat(userLoc.latitude);
    const lon1 = parseFloat(userLoc.longitude);
    const lat2 = parseFloat(targetItem.latitude);
    const lon2 = parseFloat(targetItem.longitude);

    // Validate coordinates are valid numbers
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
      console.error('Invalid coordinates for distance calculation', { lat1, lon1, lat2, lon2 });
      return;
    }

    // Validate coordinate ranges (latitude: -90 to 90, longitude: -180 to 180)
    if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90 || Math.abs(lon1) > 180 || Math.abs(lon2) > 180) {
      console.error('Coordinates out of valid range', { lat1, lon1, lat2, lon2 });
      return;
    }

    const R = 6371000; // Earth's radius in meters
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    console.log('Distance calculation:', {
      userLocation: { lat: lat1, lon: lon1 },
      contractLocation: { lat: lat2, lon: lon2 },
      distanceMeters: dist,
      distanceKm: (dist / 1000).toFixed(2)
    });

    setDistance(dist);

    // Check if within range (use radius_meters for contract rules, or default 100m)
    const radius = targetItem.radius_meters || targetItem.radius || 100;
    setIsWithinRange(dist <= radius);
  }, []);

  useEffect(() => {
    if (open && item) {
      // For contract rules, fetch full rule details
      if (itemType === 'contract_rule' && item.id) {
        fetchRuleDetails(item.id);
      }
      
      // Get contract info from item
      if (item.contract) {
        setContract(item.contract);
      } else if (item.contract_id || item.contract_address) {
        // Fetch contract details
        fetchContractDetails(item.contract_id || item.contract_address);
      } else if (itemType === 'contract_rule' && item.contract_address) {
        // For contract rules, fetch by contract address
        fetchContractDetails(item.contract_address);
      }

      // Get user location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const loc = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            setUserLocation(loc);
            checkProximity(loc, item);
            
            // Fetch nearby wallets if this is a contract rule
            if (itemType === 'contract_rule' && item.latitude && item.longitude) {
              fetchNearbyWallets(item.latitude, item.longitude, itemRadius);
            }
          },
          (error) => {
            console.warn('Error getting user location:', error);
            // Fetch nearby wallets even without user location
            if (itemType === 'contract_rule' && item.latitude && item.longitude) {
              fetchNearbyWallets(item.latitude, item.longitude, itemRadius);
            }
          }
        );
      } else if (itemType === 'contract_rule' && item.latitude && item.longitude) {
        // Fetch nearby wallets even without user location
        fetchNearbyWallets(item.latitude, item.longitude, itemRadius);
      }
    } else {
      // Reset state when dialog closes
      setRuleDetails(null);
      setMapContainer(null);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    }
  }, [open, item, itemType, fetchRuleDetails, fetchNearbyWallets, itemRadius, checkProximity]);
  
  // Recalculate distance whenever item or userLocation changes
  useEffect(() => {
    if (userLocation && item && item.latitude && item.longitude) {
      checkProximity(userLocation, item);
    }
  }, [item, userLocation, checkProximity]); // Recalculate when item changes (different marker clicked)
  
  // Calculate distanceText early to avoid initialization errors
  const distanceText = distance 
    ? distance < 1000 
      ? `${Math.round(distance)}m` 
      : `${(distance / 1000).toFixed(2)}km`
    : 'Unknown';

  // Initialize map for rule location visualization
  useEffect(() => {
    if (!mapContainer || !item || itemType !== 'contract_rule' || !item.latitude || !item.longitude) {
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.warn('Mapbox token not configured for rule location map');
      return;
    }

    mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

    const ruleLat = parseFloat(item.latitude);
    const ruleLng = parseFloat(item.longitude);
    const radius = itemRadius;

    // Create map
    const map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [ruleLng, ruleLat],
      zoom: 13,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add radius circle
      const center = [ruleLng, ruleLat];
      const circle = turf.circle(center, radius, { units: 'meters', steps: 64 });
      
      if (!map.getSource('rule-radius')) {
        map.addSource('rule-radius', {
          type: 'geojson',
          data: circle
        });
      }

      if (!map.getLayer('rule-radius-fill')) {
        map.addLayer({
          id: 'rule-radius-fill',
          type: 'fill',
          source: 'rule-radius',
          paint: {
            'fill-color': isWithinRange ? '#4caf50' : '#ff9800',
            'fill-opacity': 0.2
          }
        });
      } else {
        // Update existing layer color
        map.setPaintProperty('rule-radius-fill', 'fill-color', isWithinRange ? '#4caf50' : '#ff9800');
      }

      if (!map.getLayer('rule-radius-line')) {
        map.addLayer({
          id: 'rule-radius-line',
          type: 'line',
          source: 'rule-radius',
          paint: {
            'line-color': isWithinRange ? '#4caf50' : '#ff9800',
            'line-width': 2,
            'line-opacity': 0.8
          }
        });
      } else {
        // Update existing layer color
        map.setPaintProperty('rule-radius-line', 'line-color', isWithinRange ? '#4caf50' : '#ff9800');
      }

      // Create custom contract rule marker to match the regular map style
      const createContractRuleMarker = () => {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: white;
          font-weight: bold;
        `;
        el.textContent = '📜';
        return el;
      };

      // Add rule location marker with custom style
      const ruleMarker = new mapboxgl.Marker({ element: createContractRuleMarker() })
        .setLngLat(center)
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="padding: 8px;">
            <strong>📜 ${item.rule_name || 'Contract Rule'}</strong><br/>
            <small>Function: ${item.function_name || 'N/A'}</small>
          </div>
        `))
        .addTo(map);
      markersRef.current.push(ruleMarker);

      // Create custom user icon marker
      const createUserIcon = (color) => {
        const el = document.createElement('div');
        el.className = 'user-marker';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = color;
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '18px';
        el.innerHTML = '👤';
        return el;
      };

      // Add user location marker with custom icon if available
      if (userLocation) {
        const userIcon = createUserIcon(isWithinRange ? '#4caf50' : '#f44336');
        const userMarkerLngLat = [userLocation.longitude, userLocation.latitude];
        const userMarker = new mapboxgl.Marker({ element: userIcon })
          .setLngLat(userMarkerLngLat)
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="padding: 8px;">
              <strong>👤 Your Location</strong><br/>
              <small>Distance: ${distanceText}</small>
            </div>
          `))
          .addTo(map);
        markersRef.current.push(userMarker);

        // Add dotted line from user location to contract location
        const lineCoordinates = [
          userMarkerLngLat,
          center
        ];
        
        const lineFeature = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: lineCoordinates
          }
        };

        if (!map.getSource('user-to-contract-line')) {
          map.addSource('user-to-contract-line', {
            type: 'geojson',
            data: lineFeature
          });
        } else {
          map.getSource('user-to-contract-line').setData(lineFeature);
        }

        if (!map.getLayer('user-to-contract-line-layer')) {
          map.addLayer({
            id: 'user-to-contract-line-layer',
            type: 'line',
            source: 'user-to-contract-line',
            paint: {
              'line-color': '#667eea',
              'line-width': 2,
              'line-opacity': 0.6,
              'line-dasharray': [2, 2]
            }
          });
        }
      }

      // Add nearby wallet markers
      nearbyWallets.forEach((wallet) => {
        if (wallet.latitude && wallet.longitude) {
          const walletMarker = new mapboxgl.Marker({ color: '#9e9e9e' })
            .setLngLat([wallet.longitude, wallet.latitude])
            .setPopup(new mapboxgl.Popup().setHTML(`
              <div style="padding: 8px;">
                <strong>💼 Wallet</strong><br/>
                <small>${wallet.public_key?.substring(0, 8)}...${wallet.public_key?.substring(wallet.public_key.length - 8)}</small><br/>
                ${wallet.provider_name ? `<small>Provider: ${wallet.provider_name}</small>` : ''}
              </div>
            `))
            .addTo(map);
          markersRef.current.push(walletMarker);
        }
      });

      // Fit bounds to show all markers
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(center);
      if (userLocation) {
        bounds.extend([userLocation.longitude, userLocation.latitude]);
      }
      nearbyWallets.forEach((wallet) => {
        if (wallet.latitude && wallet.longitude) {
          bounds.extend([wallet.longitude, wallet.latitude]);
        }
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50 });
      }
    });

    return () => {
      // Clean up markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapContainer, item, itemType, itemRadius, userLocation, nearbyWallets, isWithinRange, distanceText]);

  // Update map colors when proximity changes
  useEffect(() => {
    if (mapRef.current && mapRef.current.loaded && mapRef.current.loaded()) {
      // Update circle colors
      if (mapRef.current.getLayer('rule-radius-fill')) {
        mapRef.current.setPaintProperty('rule-radius-fill', 'fill-color', isWithinRange ? '#4caf50' : '#ff9800');
      }
      if (mapRef.current.getLayer('rule-radius-line')) {
        mapRef.current.setPaintProperty('rule-radius-line', 'line-color', isWithinRange ? '#4caf50' : '#ff9800');
      }
      
      // Update user marker color if it exists
      if (userLocation && markersRef.current.length > 0) {
        // Find user marker by checking coordinates
        const userMarker = markersRef.current.find((marker) => {
          try {
            const lngLat = marker.getLngLat();
            return Math.abs(lngLat.lng - userLocation.longitude) < 0.0001 && 
                   Math.abs(lngLat.lat - userLocation.latitude) < 0.0001;
          } catch (e) {
            return false;
          }
        });
        
        if (userMarker && userMarker._element) {
          const color = isWithinRange ? '#4caf50' : '#f44336';
          userMarker._element.style.backgroundColor = color;
        }

        // Update dotted line if it exists
        if (mapRef.current.getSource('user-to-contract-line') && item.latitude && item.longitude) {
          const lineCoordinates = [
            [userLocation.longitude, userLocation.latitude],
            [parseFloat(item.longitude), parseFloat(item.latitude)]
          ];
          
          const lineFeature = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: lineCoordinates
            }
          };
          
          mapRef.current.getSource('user-to-contract-line').setData(lineFeature);
        }
      }
    }
  }, [isWithinRange, userLocation, item]);


  const handleExecuteFunction = async () => {
    if (!selectedFunction || !contract || !isWithinRange) {
      setExecutionError('Please select a function and ensure you are within range');
      return;
    }

    if (!isConnected || !publicKey) {
      setExecutionError('Please connect your wallet first');
      return;
    }

    if (!secretKey && contract.requires_webauthn) {
      setExecutionError('This contract requires WebAuthn. Please use a passkey-enabled wallet.');
      return;
    }

    setExecuting(true);
    setExecutionError(null);

    try {
      // Get function mapping to determine parameters
      const functionMapping = contract.function_mappings?.[selectedFunction];
      // Build parameters based on mapping or use provided params
      let finalParams = {};
      if (functionMapping && functionMapping.parameters) {
        functionMapping.parameters.forEach(param => {
          if (functionParams[param.name] !== undefined) {
            finalParams[param.name] = functionParams[param.name];
          }
        });
      } else {
        finalParams = functionParams;
      }

      // Execute contract function
      const response = await api.post(`/contracts/${contract.id}/execute`, {
        function_name: selectedFunction,
        parameters: finalParams,
        user_public_key: publicKey,
        user_secret_key: secretKey,
        network: contract.network || 'testnet'
      });

      if (response.data.success) {
        alert(`Function "${selectedFunction}" executed successfully!`);
        onClose();
      }
    } catch (error) {
      console.error('Error executing contract function:', error);
      setExecutionError(error.response?.data?.message || error.message || 'Failed to execute function');
    } finally {
      setExecuting(false);
    }
  };

  const handleFunctionParamChange = (functionName, paramName, value) => {
    setFunctionParams(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  if (!item) return null;

  const contractFunctions = contract?.discovered_functions || contract?.functions || [];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      sx={{ zIndex: 1500 }} // Higher z-index to appear above fullscreen map
      PaperProps={{ sx: { zIndex: 1500 } }}
    >
      <DialogTitle sx={{ position: 'relative', pr: 6 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <Code />
            <Typography variant="h6">
              Contract Details
            </Typography>
          </Box>
          {contract && (
            <Chip 
              label={contract.network || 'testnet'} 
              size="small" 
              color={contract.network === 'mainnet' ? 'error' : 'default'}
            />
          )}
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {itemType === 'contract_rule' ? (
          // Side-by-side layout for contract rules
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {/* Contract Execution Rule Information */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                    Contract Execution Rule
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Rule Name:</strong> {item.rule_name || ruleDetails?.rule_name || 'Unnamed Rule'}
                    </Typography>
                    {(item.function_name || ruleDetails?.function_name) && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Function:</strong> {item.function_name || ruleDetails?.function_name}
                      </Typography>
                    )}
                    {(item.trigger_on || ruleDetails?.trigger_on) && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Trigger:</strong> {item.trigger_on || ruleDetails?.trigger_on}
                      </Typography>
                    )}
                    {(item.auto_execute !== undefined || ruleDetails?.auto_execute !== undefined) && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Auto-execute:</strong> {(item.auto_execute !== undefined ? item.auto_execute : ruleDetails?.auto_execute) ? 'Enabled' : 'Disabled'}
                      </Typography>
                    )}
                    {item.latitude && item.longitude && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Location:</strong> {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                      </Typography>
                    )}
                    {itemRadius && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Range:</strong> {itemRadius}m
                      </Typography>
                    )}
                    {ruleDetails?.minimum_wallet_count && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Min Wallets:</strong> {ruleDetails.minimum_wallet_count}
                      </Typography>
                    )}
                    {ruleDetails?.quorum_type && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Quorum:</strong> {ruleDetails.quorum_type}
                      </Typography>
                    )}
                  </Box>
                  {ruleDetails?.function_parameters && Object.keys(ruleDetails.function_parameters).length > 0 && (
                    <Box mt={1.5} pt={1.5} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Parameters:
                      </Typography>
                      {Object.entries(ruleDetails.function_parameters).map(([key, value]) => (
                        <Typography key={key} variant="body2" color="text.secondary" sx={{ ml: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {ruleDetails?.required_wallet_public_keys && ruleDetails.required_wallet_public_keys.length > 0 && (
                    <Box mt={1.5} pt={1.5} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Required Wallets ({ruleDetails.required_wallet_public_keys.length}):
                      </Typography>
                      {ruleDetails.required_wallet_public_keys.slice(0, 3).map((key, idx) => (
                        <Typography key={idx} variant="body2" color="text.secondary" sx={{ ml: 1, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                          {key.substring(0, 8)}...{key.substring(key.length - 8)}
                        </Typography>
                      ))}
                      {ruleDetails.required_wallet_public_keys.length > 3 && (
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 1, fontSize: '0.7rem', fontStyle: 'italic' }}>
                          +{ruleDetails.required_wallet_public_keys.length - 3} more
                        </Typography>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Smart Contract Information */}
            <Grid item xs={12} md={6}>
              {contract ? (
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 1.5 }}>
                      Smart Contract
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Typography variant="body2">
                        <strong>Name:</strong> {contract.name || contract.contract_name || item.contract_name || 'Unnamed Contract'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                        <strong>Address:</strong> {contract.address || contract.contract_address || item.contract_address || 'N/A'}
                      </Typography>
                      {contract.network && (
                        <Typography variant="body2" color="text.secondary">
                          <strong>Network:</strong> {contract.network}
                        </Typography>
                      )}
                      {item.contract_name && !contract.name && (
                        <Typography variant="body2" color="text.secondary">
                          <strong>Contract Name:</strong> {item.contract_name}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                        {contract.use_smart_wallet && (
                          <Chip 
                            icon={<SmartToy />} 
                            label="Smart Wallet" 
                            size="small" 
                            color="primary"
                          />
                        )}
                        {contract.requires_webauthn && (
                          <Chip 
                            label="WebAuthn Required" 
                            size="small" 
                            color="warning"
                          />
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ) : (
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="body2" color="text.secondary">
                      Loading contract information...
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
        ) : (
          // Original layout for NFT/Wallet types
          <>
            <Box mb={2}>
              <Typography variant="subtitle1" gutterBottom>
                <strong>{itemType === 'nft' ? 'NFT' : 'Wallet'} Information</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {itemType === 'nft' 
                  ? `Collection: ${item.collection_name || item.collection?.name || 'Unknown'}`
                  : `Type: ${item.wallet_type || 'Unknown'} | Address: ${item.public_key?.substring(0, 8)}...`
                }
              </Typography>
              {item.latitude && item.longitude && (
                <Typography variant="body2" color="text.secondary">
                  <strong>Location:</strong> {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                </Typography>
              )}
              {itemRadius && (
                <Typography variant="body2" color="text.secondary">
                  <strong>Range:</strong> {itemRadius}m
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Contract Information */}
            {contract && (
              <Box mb={2}>
                <Typography variant="subtitle1" gutterBottom>
                  <strong>Smart Contract</strong>
                </Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {contract.name || contract.contract_name || item.contract_name || 'Unnamed Contract'}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  <strong>Address:</strong> {contract.address || contract.contract_address || item.contract_address || 'N/A'}
                </Typography>
                {contract.network && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Network:</strong> {contract.network}
                  </Typography>
                )}
                {item.contract_name && !contract.name && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Contract Name:</strong> {item.contract_name}
                  </Typography>
                )}
                {contract.use_smart_wallet && (
                  <Chip 
                    icon={<SmartToy />} 
                    label="Smart Wallet" 
                    size="small" 
                    color="primary" 
                    sx={{ mt: 1 }}
                  />
                )}
                {contract.requires_webauthn && (
                  <Chip 
                    label="WebAuthn Required" 
                    size="small" 
                    color="warning" 
                    sx={{ mt: 1, ml: 1 }}
                  />
                )}
              </Box>
            )}
          </>
        )}

        {/* User Location & Proximity Check */}
        {userLocation && (
          <Box mb={2}>
            <Alert 
              severity={isWithinRange ? 'success' : 'warning'}
              icon={isWithinRange ? <CheckCircle /> : <Cancel />}
            >
              <Typography variant="body2">
                <strong>Your Location:</strong> {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}
              </Typography>
              <Typography variant="body2">
                <strong>Distance:</strong> {distanceText}
                {isWithinRange 
                  ? ' - You are within range!' 
                  : ` - You need to be within ${itemRadius}m to execute functions`
                }
              </Typography>
            </Alert>
          </Box>
        )}

        {/* Rule Location Map - Only for contract_rule */}
        {itemType === 'contract_rule' && item.latitude && item.longitude && (
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1">
                <strong>Rule Location & Eligibility</strong>
              </Typography>
              <Box display="flex" gap={1}>
                {userLocation && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<MyLocation />}
                    onClick={() => {
                      if (mapRef.current && userLocation) {
                        mapRef.current.flyTo({
                          center: [userLocation.longitude, userLocation.latitude],
                          zoom: 18,
                          duration: 1000
                        });
                      }
                    }}
                  >
                    Zoom to Me
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ZoomIn />}
                  onClick={() => {
                    if (mapRef.current && item.latitude && item.longitude) {
                      mapRef.current.flyTo({
                        center: [parseFloat(item.longitude), parseFloat(item.latitude)],
                        zoom: 18,
                        duration: 1000
                      });
                    }
                  }}
                >
                  Zoom to Contract
                </Button>
              </Box>
            </Box>
            <Box 
              ref={(el) => {
                if (el && !mapContainer) {
                  setMapContainer(el);
                }
              }}
              sx={{ 
                height: '300px', 
                width: '100%', 
                borderRadius: 1, 
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                mt: 1,
                position: 'relative'
              }}
            />
            {userLocation && (
              <Alert 
                severity={isWithinRange ? 'success' : 'info'} 
                sx={{ mt: 1 }}
                icon={isWithinRange ? <CheckCircle /> : <Cancel />}
              >
                <Typography variant="body2">
                  {isWithinRange 
                    ? `✅ You are within the ${itemRadius}m range and can execute this rule.`
                    : `⚠️ You are ${distanceText} away. Move within ${itemRadius}m to execute this rule.`
                  }
                </Typography>
              </Alert>
            )}
          </Box>
        )}

        {/* Contract Functions */}
        {contract ? (
          <>
            {contractFunctions.length > 0 ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  <strong>Available Functions</strong>
                </Typography>
                {contractFunctions.map((func, index) => (
                  <Accordion 
                    key={index}
                    expanded={expandedFunction === index}
                    onChange={() => setExpandedFunction(expandedFunction === index ? null : index)}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box display="flex" alignItems="center" gap={1} width="100%">
                        <Code fontSize="small" />
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {func.name || func}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {func.parameters && func.parameters.length > 0 ? (
                        <Box>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Parameters:
                          </Typography>
                          {func.parameters.map((param, paramIndex) => (
                            <TextField
                              key={paramIndex}
                              fullWidth
                              size="small"
                              label={param.name}
                              type={param.type === 'u32' || param.type === 'i32' ? 'number' : 'text'}
                              value={functionParams[param.name] || ''}
                              onChange={(e) => handleFunctionParamChange(func.name, param.name, e.target.value)}
                              margin="dense"
                              helperText={`Type: ${param.type || 'unknown'}`}
                            />
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No parameters required
                        </Typography>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}

                {/* Function Selection & Execution */}
                {contractFunctions.length > 0 && (
                  <Box mt={2}>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Select Function to Execute</InputLabel>
                      <Select
                        value={selectedFunction}
                        onChange={(e) => setSelectedFunction(e.target.value)}
                        label="Select Function to Execute"
                      >
                        {contractFunctions.map((func, index) => (
                          <MenuItem key={index} value={func.name || func}>
                            {func.name || func}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {selectedFunction && (
                      <Box mt={2}>
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={executing ? <CircularProgress size={20} /> : <PlayArrow />}
                          onClick={handleExecuteFunction}
                          disabled={!isWithinRange || !isConnected || executing}
                          fullWidth
                        >
                          {executing 
                            ? 'Executing...' 
                            : isWithinRange 
                              ? `Execute "${selectedFunction}"` 
                              : 'Move within range to execute'
                          }
                        </Button>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            ) : (
              <Alert severity="info">
                No functions discovered for this contract. You may need to discover functions first.
              </Alert>
            )}

            {executionError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {executionError}
              </Alert>
            )}
          </>
        ) : (
          <Alert severity="info">
            No smart contract associated with this {itemType === 'nft' ? 'NFT' : 'wallet'}.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContractDetailsOverlay;

