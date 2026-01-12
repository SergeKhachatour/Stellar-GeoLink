import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  CardActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Divider,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  TablePagination,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Collapse
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  PlayArrow as PlayArrowIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Rule as RuleIcon,
  CheckCircle as CheckCircleIcon,
  Map as MapIcon,
  PowerSettingsNew as PowerSettingsNewIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  LocationOn as LocationOnIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import api from '../../services/api';
import CustomContractDialog from '../NFT/CustomContractDialog';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';
import { useWallet } from '../../contexts/WalletContext';
import webauthnService from '../../services/webauthnService';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Tab Panel Component
function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`contract-tabpanel-${index}`}
      aria-labelledby={`contract-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `contract-tab-${index}`,
    'aria-controls': `contract-tabpanel-${index}`,
  };
}

const ContractManagement = () => {
  const { publicKey, secretKey } = useWallet();
  const [contracts, setContracts] = useState([]);
  const [rules, setRules] = useState([]);
  const [pendingRules, setPendingRules] = useState([]);
  const [loadingPendingRules, setLoadingPendingRules] = useState(false);
  const [rejectingRuleId, setRejectingRuleId] = useState(null);
  const [expandedPendingRule, setExpandedPendingRule] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [ruleToReject, setRuleToReject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stepperOrientation, setStepperOrientation] = useState(window.innerWidth < 768 ? "vertical" : "horizontal");
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tabValue, setTabValue] = useState(0);
  
  // Contract Dialog States
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  
  // Rule Dialog States
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [selectedContractForRule, setSelectedContractForRule] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [testingFunction, setTestingFunction] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    contract_id: '',
    rule_name: '',
    rule_type: 'location',
    center_latitude: '',
    center_longitude: '',
    radius_meters: '100',
    function_name: '',
    function_parameters: '{}',
    trigger_on: 'enter',
    auto_execute: false,
    requires_confirmation: true,
    target_wallet_public_key: '',
    required_wallet_public_keys: [],
    minimum_wallet_count: null,
    quorum_type: 'any'
  });
  
  // Map states for location selection
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState([]);
  const [showLocationSearchResults, setShowLocationSearchResults] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  
  // WASM Upload States
  const [wasmUploadOpen, setWasmUploadOpen] = useState(false);
  const [wasmFile, setWasmFile] = useState(null);
  const [uploadingWasm, setUploadingWasm] = useState(false);
  const [selectedContractForWasm, setSelectedContractForWasm] = useState(null);
  
  // Quorum Check States
  const [quorumCheckOpen, setQuorumCheckOpen] = useState(false);
  const [quorumStatus, setQuorumStatus] = useState(null);
  const [checkingQuorum, setCheckingQuorum] = useState(false);
  const [selectedRuleForQuorum, setSelectedRuleForQuorum] = useState(null);
  
  // Rules Table Pagination
  const [rulesPage, setRulesPage] = useState(0);
  const [rulesRowsPerPage, setRulesRowsPerPage] = useState(10);
  
  // Quick Map View States
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const [selectedRuleForMap, setSelectedRuleForMap] = useState(null);
  const mapViewContainerRef = useRef(null);
  const mapViewRef = useRef(null);

  useEffect(() => {
    loadContracts();
    loadRules();
    loadPendingRules();
  }, []);

  // Reload pending rules when switching to pending tab
  useEffect(() => {
    if (tabValue === 2) {
      loadPendingRules();
    }
  }, [tabValue]);
  
  // Update stepper orientation on window resize
  useEffect(() => {
    const handleResize = () => {
      setStepperOrientation(window.innerWidth < 768 ? "vertical" : "horizontal");
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Initialize map for quick view
  useEffect(() => {
    if (!mapViewOpen || !selectedRuleForMap || !MAPBOX_TOKEN) {
      return;
    }
    
    if (!selectedRuleForMap.center_latitude || !selectedRuleForMap.center_longitude) {
      return;
    }
    
    // Wait for dialog to fully render and container to be available
    const timer = setTimeout(() => {
      if (!mapViewContainerRef.current || mapViewRef.current) {
        return;
      }
      
      const container = mapViewContainerRef.current;
      if (!container) {
        console.log('[ContractManagement] Map container not ready');
        return;
      }
      
      const lat = parseFloat(selectedRuleForMap.center_latitude);
      const lng = parseFloat(selectedRuleForMap.center_longitude);
      const radius = selectedRuleForMap.radius_meters ? parseFloat(selectedRuleForMap.radius_meters) : 1000;
      
      console.log('[ContractManagement] Initializing map view:', { lat, lng, radius });
      
      const newMap = new mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [lng, lat],
        zoom: radius > 5000 ? 10 : radius > 1000 ? 12 : 14
      });
      
      mapViewRef.current = newMap;
      
      newMap.on('load', () => {
        console.log('[ContractManagement] Map loaded, adding marker and circle');
        // Add marker for center
        new mapboxgl.Marker({ color: '#1976d2' })
          .setLngLat([lng, lat])
          .addTo(newMap);
        
        // Add circle for radius
        if (radius) {
          const circle = turf.circle([lng, lat], radius / 1000, { steps: 64, units: 'kilometers' });
          
          newMap.addSource('rule-radius', {
            type: 'geojson',
            data: circle
          });
          
          newMap.addLayer({
            id: 'rule-radius-fill',
            type: 'fill',
            source: 'rule-radius',
            paint: {
              'fill-color': '#1976d2',
              'fill-opacity': 0.1
            }
          });
          
          newMap.addLayer({
            id: 'rule-radius-border',
            type: 'line',
            source: 'rule-radius',
            paint: {
              'line-color': '#1976d2',
              'line-width': 2,
              'line-opacity': 0.5
            }
          });
        }
      });
      
      newMap.on('error', (e) => {
        console.error('[ContractManagement] Map error:', e);
      });
    }, 100); // Small delay to ensure dialog is fully rendered
    
    return () => {
      clearTimeout(timer);
      if (mapViewRef.current) {
        mapViewRef.current.remove();
        mapViewRef.current = null;
      }
    };
  }, [mapViewOpen, selectedRuleForMap]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/contracts');
      if (response.data.success) {
        // Parse discovered_functions for each contract to ensure proper format
        const contracts = (response.data.contracts || []).map(contract => {
          if (contract.discovered_functions) {
            let functions = contract.discovered_functions;
            if (typeof functions === 'string') {
              try {
                functions = JSON.parse(functions);
              } catch (e) {
                console.error('Error parsing discovered_functions:', e);
                functions = {};
              }
            }
            
            // Log raw structure to debug
            console.log('[ContractManagement] Raw discovered_functions structure:', {
              type: typeof functions,
              isArray: Array.isArray(functions),
              keys: typeof functions === 'object' && !Array.isArray(functions) ? Object.keys(functions) : 'N/A',
              sampleFunction: typeof functions === 'object' && !Array.isArray(functions) && Object.keys(functions).length > 0 
                ? functions[Object.keys(functions)[0]] 
                : (Array.isArray(functions) && functions.length > 0 ? functions[0] : 'N/A')
            });
            
            // Ensure functions have parameters array
            if (typeof functions === 'object' && !Array.isArray(functions)) {
              functions = Object.values(functions).map(func => {
                const funcObj = typeof func === 'string' ? { name: func } : func;
                const processed = {
                  ...funcObj,
                  parameters: Array.isArray(funcObj.parameters) ? funcObj.parameters : []
                };
                // Log if function has no parameters to debug
                if (processed.parameters.length === 0 && processed.name) {
                  console.log(`[ContractManagement] Function ${processed.name} has no parameters. Full object:`, JSON.stringify(processed, null, 2));
                }
                return processed;
              });
            }
            contract.discovered_functions = functions;
          }
          return contract;
        });
        setContracts(contracts);
      } else {
        setError('Failed to load contracts');
      }
    } catch (err) {
      console.error('Error loading contracts:', err);
      setError(err.response?.data?.error || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    try {
      const response = await api.get('/contracts/rules');
      if (response.data.success) {
        setRules(response.data.rules || []);
      }
    } catch (err) {
      console.error('Error loading rules:', err);
    }
  };

  const loadPendingRules = async () => {
    try {
      setLoadingPendingRules(true);
      const response = await api.get('/contracts/rules/pending');
      if (response.data.success) {
        setPendingRules(response.data.pending_rules || []);
      }
    } catch (err) {
      console.error('Error loading pending rules:', err);
      setError(err.response?.data?.error || 'Failed to load pending rules');
    } finally {
      setLoadingPendingRules(false);
    }
  };

  const handleDeleteContract = async (contractId) => {
    if (!window.confirm('Are you sure you want to delete this contract?')) {
      return;
    }
    try {
      const response = await api.delete(`/contracts/${contractId}`);
      if (response.data.success) {
        setSuccess('Contract deleted successfully');
        loadContracts();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to delete contract');
      }
    } catch (err) {
      console.error('Error deleting contract:', err);
      setError(err.response?.data?.error || 'Failed to delete contract');
    }
  };

  const handleEditContract = (contract) => {
    setEditingContract(contract);
    setContractDialogOpen(true);
  };

  const handleAddRule = (contract = null) => {
    setSelectedContractForRule(contract);
    setRuleForm({
      contract_id: contract?.id || '',
      rule_name: '',
      rule_type: 'location',
      center_latitude: '',
      center_longitude: '',
      radius_meters: '',
      function_name: '',
      function_parameters: '{}',
      trigger_on: 'enter',
      auto_execute: false,
      requires_confirmation: true,
      target_wallet_public_key: '',
      required_wallet_public_keys: [],
      minimum_wallet_count: null,
      quorum_type: 'any'
    });
    setEditingRule(null);
    setActiveStep(0);
    setSelectedLocation(null);
    setRuleDialogOpen(true);
  };
  
  const handleRuleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };
  
  const handleRuleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };
  
  // Auto-generate parameters JSON when function is selected
  const handleFunctionSelect = (functionName) => {
    console.log('[ContractManagement] handleFunctionSelect called with:', functionName);
    console.log('[ContractManagement] Current ruleForm.contract_id:', ruleForm.contract_id);
    console.log('[ContractManagement] Available contracts:', contracts.map(c => ({ id: c.id, name: c.contract_name })));
    
    const contract = contracts.find(c => c.id === ruleForm.contract_id);
    if (!contract) {
      console.log('[ContractManagement] No contract found for ID:', ruleForm.contract_id);
      setRuleForm({ ...ruleForm, function_name: functionName, function_parameters: '{}' });
      return;
    }
    
    console.log('[ContractManagement] Found contract:', { id: contract.id, name: contract.contract_name });
    console.log('[ContractManagement] Contract discovered_functions type:', typeof contract.discovered_functions);
    console.log('[ContractManagement] Contract discovered_functions:', contract.discovered_functions);
    
    const functions = discoveredFunctions(contract);
    console.log('[ContractManagement] All functions for contract:', functions);
    console.log('[ContractManagement] Looking for function:', functionName);
    const selectedFunc = functions.find(f => f.name === functionName);
    console.log('[ContractManagement] Selected function:', selectedFunc);
    console.log('[ContractManagement] Selected function keys:', selectedFunc ? Object.keys(selectedFunc) : 'null');
    console.log('[ContractManagement] Selected function full object:', selectedFunc ? JSON.stringify(selectedFunc, null, 2) : 'null');
    console.log('[ContractManagement] Selected function parameters check:', {
      hasSelectedFunc: !!selectedFunc,
      hasParameters: !!(selectedFunc && selectedFunc.parameters),
      parametersIsArray: !!(selectedFunc && Array.isArray(selectedFunc.parameters)),
      parametersLength: selectedFunc?.parameters?.length || 0,
      parameters: selectedFunc?.parameters
    });
    
    if (selectedFunc && selectedFunc.parameters && selectedFunc.parameters.length > 0) {
      console.log('[ContractManagement] Function has parameters:', selectedFunc.parameters);
      // Generate parameter object with default values based on mapped_from
      const params = {};
      selectedFunc.parameters.forEach(param => {
        console.log('[ContractManagement] Processing parameter:', param);
        switch (param.mapped_from) {
          case 'latitude':
            params[param.name] = ruleForm.center_latitude || 0;
            break;
          case 'longitude':
            params[param.name] = ruleForm.center_longitude || 0;
            break;
          case 'user_public_key':
            params[param.name] = '';
            break;
          case 'amount':
            params[param.name] = 0;
            break;
          case 'asset_code':
            params[param.name] = '';
            break;
          default:
            // For custom_value, use empty string or 0 based on type
            if (param.type === 'I128' || param.type === 'I64' || param.type === 'I32' || 
                param.type === 'U128' || param.type === 'U64' || param.type === 'U32') {
              params[param.name] = 0;
            } else if (param.type === 'Bool') {
              params[param.name] = false;
            } else {
              params[param.name] = '';
            }
        }
      });
      console.log('[ContractManagement] Generated params object:', params);
      setRuleForm({ ...ruleForm, function_name: functionName, function_parameters: JSON.stringify(params, null, 2) });
    } else {
      console.log('[ContractManagement] No parameters found for function. selectedFunc:', selectedFunc);
      console.log('[ContractManagement] Parameters check:', {
        hasSelectedFunc: !!selectedFunc,
        hasParameters: !!(selectedFunc && selectedFunc.parameters),
        parametersLength: selectedFunc?.parameters?.length || 0
      });
      setRuleForm({ ...ruleForm, function_name: functionName, function_parameters: '{}' });
    }
  };
  
  // Update radius circle on map - MUST be defined before useEffect hooks that use it
  const updateRadiusCircle = useCallback((mapInstance, lat, lng, radius) => {
    if (!mapInstance) return;
    // Use default radius of 100 if not provided or invalid
    const validRadius = radius && radius > 0 ? radius : 100;
    
    // Check if map style is loaded before adding sources/layers
    if (!mapInstance.isStyleLoaded()) {
      // Wait for style to load
      mapInstance.once('style.load', () => {
        updateRadiusCircle(mapInstance, lat, lng, validRadius);
      });
      return;
    }
    
    try {
      const circle = turf.circle([lng, lat], validRadius, { units: 'meters', steps: 64 });
      
      if (mapInstance.getLayer('radius-circle-fill')) {
        mapInstance.removeLayer('radius-circle-fill');
      }
      if (mapInstance.getLayer('radius-circle-outline')) {
        mapInstance.removeLayer('radius-circle-outline');
      }
      if (mapInstance.getSource('radius-circle')) {
        mapInstance.removeSource('radius-circle');
      }
      
      mapInstance.addSource('radius-circle', {
        type: 'geojson',
        data: circle
      });
      
      mapInstance.addLayer({
        id: 'radius-circle-fill',
        type: 'fill',
        source: 'radius-circle',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.2  // Increased opacity for better visibility
        }
      });
      
      mapInstance.addLayer({
        id: 'radius-circle-outline',
        type: 'line',
        source: 'radius-circle',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3,  // Increased width for better visibility
          'line-opacity': 0.8  // Increased opacity for better visibility
        }
      });
    } catch (error) {
      console.warn('Error updating radius circle:', error);
      // If style isn't loaded yet, wait for it
      if (error.message && error.message.includes('Style is not done loading')) {
        mapInstance.once('style.load', () => {
          updateRadiusCircle(mapInstance, lat, lng, validRadius);
        });
      }
    }
  }, []);
  
  // Initialize map for location selection
  useEffect(() => {
    if (!ruleDialogOpen || activeStep !== 1 || !mapContainerRef.current || mapRef.current || !MAPBOX_TOKEN) {
      return;
    }
    
    const container = mapContainerRef.current;
    const newMap = new mapboxgl.Map({
      container: container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: ruleForm.center_longitude && ruleForm.center_latitude 
        ? [parseFloat(ruleForm.center_longitude), parseFloat(ruleForm.center_latitude)]
        : [0, 0],
      zoom: ruleForm.center_longitude && ruleForm.center_latitude ? 12 : 2
    });
    
    mapRef.current = newMap;
    
    newMap.on('load', () => {
      // Add click handler for location selection
      newMap.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        
        // Get current radius before state update, ensure it defaults to 100
        const currentRadius = parseFloat(ruleForm.radius_meters) || 100;
        const radiusToUse = currentRadius > 0 ? currentRadius : 100;
        
        setSelectedLocation({ lat, lng });
        setRuleForm(prev => ({
          ...prev,
          center_latitude: lat.toString(),
          center_longitude: lng.toString(),
          radius_meters: prev.radius_meters || '100' // Ensure default radius is set
        }));
        
        // Update marker
        if (newMap.getLayer('location-marker')) {
          newMap.removeLayer('location-marker');
          newMap.removeSource('location-marker');
        }
        
        newMap.addSource('location-marker', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          }
        });
        
        newMap.addLayer({
          id: 'location-marker',
          type: 'circle',
          source: 'location-marker',
          paint: {
            'circle-radius': 8,
            'circle-color': '#FF0000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF'
          }
        });
        
        // Calculate appropriate zoom level based on radius
        let zoomLevel = 16; // Default to closer zoom
        if (radiusToUse > 5000) {
          zoomLevel = 11;
        } else if (radiusToUse > 2000) {
          zoomLevel = 12;
        } else if (radiusToUse > 1000) {
          zoomLevel = 13;
        } else if (radiusToUse > 500) {
          zoomLevel = 14;
        } else if (radiusToUse > 200) {
          zoomLevel = 15;
        } else {
          zoomLevel = 16; // For small radii, zoom in close
        }
        
        // Update radius circle immediately with the radius we're using
        updateRadiusCircle(newMap, lat, lng, radiusToUse);
        
        // Also update after a short delay to ensure it's visible after zoom
        setTimeout(() => {
          if (newMap.isStyleLoaded()) {
            updateRadiusCircle(newMap, lat, lng, radiusToUse);
          }
          newMap.flyTo({
            center: [lng, lat],
            zoom: zoomLevel,
            duration: 1000
          });
        }, 200);
      });
      
      // If location already set, show it
      if (ruleForm.center_latitude && ruleForm.center_longitude) {
        const lat = parseFloat(ruleForm.center_latitude);
        const lng = parseFloat(ruleForm.center_longitude);
        setSelectedLocation({ lat, lng });
        
        // Calculate appropriate zoom level based on radius
        const currentRadius = parseFloat(ruleForm.radius_meters) || 100;
        let zoomLevel = 16;
        if (currentRadius > 5000) {
          zoomLevel = 11;
        } else if (currentRadius > 2000) {
          zoomLevel = 12;
        } else if (currentRadius > 1000) {
          zoomLevel = 13;
        } else if (currentRadius > 500) {
          zoomLevel = 14;
        } else if (currentRadius > 200) {
          zoomLevel = 15;
        } else {
          zoomLevel = 16;
        }
        
        newMap.flyTo({ center: [lng, lat], zoom: zoomLevel });
        
        newMap.addSource('location-marker', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          }
        });
        
        newMap.addLayer({
          id: 'location-marker',
          type: 'circle',
          source: 'location-marker',
          paint: {
            'circle-radius': 8,
            'circle-color': '#FF0000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF'
          }
        });
        
        // Update radius circle after a short delay to ensure map is ready
        setTimeout(() => {
          const radius = parseFloat(ruleForm.radius_meters) || 100;
          updateRadiusCircle(newMap, lat, lng, radius);
        }, 300);
      }
    });
    
    // Cleanup function
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [ruleDialogOpen, activeStep, ruleForm.center_latitude, ruleForm.center_longitude, ruleForm.radius_meters, updateRadiusCircle]);
  
  // Update map when location or radius changes (but only if map exists and is loaded)
  useEffect(() => {
    if (!mapRef.current || activeStep !== 1 || !selectedLocation) return;
    
    // Always use a radius (default to 100 if not set)
    const radius = parseFloat(ruleForm.radius_meters) || 100;
    
    // Only update if map style is loaded
    if (!mapRef.current.isStyleLoaded()) {
      // Wait for style to load
      const handleStyleLoad = () => {
        if (selectedLocation && radius > 0) {
          updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
        }
      };
      mapRef.current.once('style.load', handleStyleLoad);
      return () => {
        if (mapRef.current) {
          mapRef.current.off('style.load', handleStyleLoad);
        }
      };
    }
    
    // Update radius circle whenever location or radius changes
    if (selectedLocation && radius > 0) {
      updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
    }
  }, [selectedLocation, ruleForm.radius_meters, activeStep, updateRadiusCircle]);
  
  // Cleanup map on dialog close
  useEffect(() => {
    if (!ruleDialogOpen) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setSelectedLocation(null);
      setLocationSearchQuery('');
      setLocationSearchResults([]);
      setShowLocationSearchResults(false);
    }
  }, [ruleDialogOpen]);

  // Location search handler with debouncing
  const handleLocationSearch = useCallback(async (query) => {
    if (!query || !query.trim() || !MAPBOX_TOKEN) {
      setLocationSearchResults([]);
      setShowLocationSearchResults(false);
      return;
    }

    setLocationSearchLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setLocationSearchResults(data.features);
        setShowLocationSearchResults(true);
      } else {
        setLocationSearchResults([]);
        setShowLocationSearchResults(false);
      }
    } catch (error) {
      console.error('Location search error:', error);
      setLocationSearchResults([]);
      setShowLocationSearchResults(false);
    } finally {
      setLocationSearchLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (locationSearchQuery.trim()) {
        handleLocationSearch(locationSearchQuery);
      } else {
        setLocationSearchResults([]);
        setShowLocationSearchResults(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [locationSearchQuery, handleLocationSearch]);

  // Zoom to user's current location
  const handleZoomToMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLocationSearchLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Get current radius, ensure it defaults to 100
        const currentRadius = parseFloat(ruleForm.radius_meters) || 100;
        const radiusToUse = currentRadius > 0 ? currentRadius : 100;
        
        setSelectedLocation({ lat: latitude, lng: longitude });
        setRuleForm(prev => ({
          ...prev,
          center_latitude: latitude.toString(),
          center_longitude: longitude.toString(),
          radius_meters: prev.radius_meters || '100' // Ensure default radius is set
        }));

        if (mapRef.current) {
          const updateMap = () => {
            if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
              if (mapRef.current) {
                mapRef.current.once('style.load', updateMap);
              }
              return;
            }

            mapRef.current.flyTo({
              center: [longitude, latitude],
              zoom: 15,
              duration: 2000
            });

            // Update marker
            if (mapRef.current.getLayer('location-marker')) {
              mapRef.current.removeLayer('location-marker');
              mapRef.current.removeSource('location-marker');
            }

            mapRef.current.addSource('location-marker', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [longitude, latitude]
                }
              }
            });

            mapRef.current.addLayer({
              id: 'location-marker',
              type: 'circle',
              source: 'location-marker',
              paint: {
                'circle-radius': 8,
                'circle-color': '#FF0000',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF'
              }
            });

            // Update radius circle immediately with the radius we're using
            updateRadiusCircle(mapRef.current, latitude, longitude, radiusToUse);
            
            // Also update after a short delay to ensure it's visible
            setTimeout(() => {
              if (mapRef.current && mapRef.current.isStyleLoaded()) {
                updateRadiusCircle(mapRef.current, latitude, longitude, radiusToUse);
              }
            }, 500);
          };
          
          updateMap();
        }
        setLocationSearchLoading(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setError('Unable to get your location. Please ensure location permissions are enabled.');
        setLocationSearchLoading(false);
      }
    );
  };

  // Handle location search result click
  const handleLocationSearchResultClick = (result) => {
    const [lng, lat] = result.center;
    setLocationSearchQuery(result.place_name);
    setShowLocationSearchResults(false);
    setSelectedLocation({ lat, lng });
    setRuleForm(prev => ({
      ...prev,
      center_latitude: lat.toString(),
      center_longitude: lng.toString(),
      radius_meters: prev.radius_meters || '100' // Ensure default radius is set
    }));
    
    if (mapRef.current) {
      const updateMap = () => {
        if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
          if (mapRef.current) {
            mapRef.current.once('style.load', updateMap);
          }
          return;
        }

        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 2000
        });
        
        // Update marker
        if (mapRef.current.getLayer('location-marker')) {
          mapRef.current.removeLayer('location-marker');
          mapRef.current.removeSource('location-marker');
        }
        
        mapRef.current.addSource('location-marker', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          }
        });
        
        mapRef.current.addLayer({
          id: 'location-marker',
          type: 'circle',
          source: 'location-marker',
          paint: {
            'circle-radius': 8,
            'circle-color': '#FF0000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF'
          }
        });
        
        // Update radius circle - ensure it shows
        const radius = parseFloat(ruleForm.radius_meters) || 100;
        updateRadiusCircle(mapRef.current, lat, lng, radius);
      };
      
      updateMap();
    }
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setRuleForm({
      contract_id: rule.contract_id,
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      center_latitude: rule.center_latitude || '',
      center_longitude: rule.center_longitude || '',
      radius_meters: rule.radius_meters || '',
      function_name: rule.function_name,
      function_parameters: typeof rule.function_parameters === 'string' 
        ? rule.function_parameters 
        : JSON.stringify(rule.function_parameters || {}, null, 2),
      trigger_on: rule.trigger_on,
      auto_execute: rule.auto_execute,
      requires_confirmation: rule.requires_confirmation,
      target_wallet_public_key: rule.target_wallet_public_key || '',
      required_wallet_public_keys: rule.required_wallet_public_keys || [],
      minimum_wallet_count: rule.minimum_wallet_count || null,
      quorum_type: rule.quorum_type || 'any'
    });
    setRuleDialogOpen(true);
  };

  const handleSaveRule = async () => {
    try {
      setError('');
      setSuccess('');
      
      // Validate required fields
      if (!ruleForm.contract_id || !ruleForm.rule_name || !ruleForm.function_name) {
        setError('Please fill in all required fields');
        return;
      }

      // Validate location-based rule
      if (ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') {
        if (!ruleForm.center_latitude || !ruleForm.center_longitude || !ruleForm.radius_meters) {
          setError('Please provide center coordinates and radius for location-based rules');
          return;
        }
      }

      // Validate quorum config
      if (ruleForm.required_wallet_public_keys && ruleForm.required_wallet_public_keys.length > 0) {
        if (!ruleForm.minimum_wallet_count || ruleForm.minimum_wallet_count <= 0) {
          setError('Minimum wallet count must be set when required wallets are specified');
          return;
        }
        if (ruleForm.minimum_wallet_count > ruleForm.required_wallet_public_keys.length) {
          setError('Minimum wallet count cannot exceed the number of required wallets');
          return;
        }
      }

      // Parse function parameters
      let functionParams = {};
      try {
        functionParams = JSON.parse(ruleForm.function_parameters);
      } catch (e) {
        setError('Invalid JSON in function parameters');
        return;
      }

      // Parse required wallet public keys (comma-separated string to array)
      let requiredWallets = [];
      if (ruleForm.required_wallet_public_keys && typeof ruleForm.required_wallet_public_keys === 'string') {
        requiredWallets = ruleForm.required_wallet_public_keys.split(',').map(w => w.trim()).filter(w => w);
      } else if (Array.isArray(ruleForm.required_wallet_public_keys)) {
        requiredWallets = ruleForm.required_wallet_public_keys;
      }

      const ruleData = {
        contract_id: parseInt(ruleForm.contract_id),
        rule_name: ruleForm.rule_name,
        rule_type: ruleForm.rule_type,
        function_name: ruleForm.function_name,
        function_parameters: functionParams,
        trigger_on: ruleForm.trigger_on,
        auto_execute: ruleForm.auto_execute,
        requires_confirmation: ruleForm.requires_confirmation,
        target_wallet_public_key: ruleForm.target_wallet_public_key || null,
        required_wallet_public_keys: requiredWallets.length > 0 ? requiredWallets : null,
        minimum_wallet_count: ruleForm.minimum_wallet_count || null,
        quorum_type: ruleForm.quorum_type
      };

      if (ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') {
        ruleData.center_latitude = parseFloat(ruleForm.center_latitude);
        ruleData.center_longitude = parseFloat(ruleForm.center_longitude);
        ruleData.radius_meters = parseInt(ruleForm.radius_meters);
      }

      const url = editingRule 
        ? `/contracts/rules/${editingRule.id}`
        : '/contracts/rules';
      const method = editingRule ? 'put' : 'post';

      const response = await api[method](url, ruleData);
      if (response.data.success) {
        setSuccess(editingRule ? 'Rule updated successfully' : 'Rule created successfully');
        loadRules();
        setTimeout(() => {
          setRuleDialogOpen(false);
          setSuccess('');
        }, 1500);
      } else {
        setError('Failed to save rule');
      }
    } catch (err) {
      console.error('Error saving rule:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save rule');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) {
      return;
    }
    try {
      const response = await api.delete(`/contracts/rules/${ruleId}`);
      if (response.data.success) {
        setSuccess('Rule deleted successfully');
        loadRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to delete rule');
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
      setError(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const handleToggleRuleActive = async (rule) => {
    try {
      const newActiveStatus = !rule.is_active;
      const response = await api.put(`/contracts/rules/${rule.id}`, {
        is_active: newActiveStatus
      });
      if (response.data.success) {
        setSuccess(`Rule ${newActiveStatus ? 'activated' : 'deactivated'} successfully`);
        loadRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to update rule status');
      }
    } catch (err) {
      console.error('Error toggling rule status:', err);
      setError(err.response?.data?.error || 'Failed to update rule status');
    }
  };

  const [testingRule, setTestingRule] = useState(false);
  const [executingRule, setExecutingRule] = useState(false);
  const [ruleTestResult, setRuleTestResult] = useState(null);
  const [executeConfirmDialog, setExecuteConfirmDialog] = useState({ open: false, rule: null });
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [executionStatus, setExecutionStatus] = useState('');
  // Note: executionStep is set but not currently displayed in UI
  // eslint-disable-next-line no-unused-vars
  const [executionStep, setExecutionStep] = useState(0);
  
  // Helper function to determine current execution step based on status
  const getExecutionStep = () => {
    if (!executingRule) return -1;
    const status = executionStatus.toLowerCase();
    if (status.includes('authenticating') || status.includes('passkey')) return 1;
    if (status.includes('signing')) return 2;
    if (status.includes('submitting') || status.includes('executing')) return 3;
    if (status.includes('waiting') || status.includes('polling') || status.includes('confirmation') || status.includes('confirmed')) return 4;
    return 0; // Preparing
  };

  const handleTestRule = async (rule) => {
    setTestingRule(true);
    setRuleTestResult(null);
    try {
      const functionParams = typeof rule.function_parameters === 'string'
        ? JSON.parse(rule.function_parameters)
        : rule.function_parameters || {};

      const response = await api.post(`/contracts/${rule.contract_id}/test-function`, {
        function_name: rule.function_name,
        parameters: functionParams
      });

      if (response.data.success) {
        setRuleTestResult({
          success: true,
          message: response.data.message,
          result: response.data.test_result
        });
        setSuccess('Function test successful!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setRuleTestResult({
          success: false,
          error: response.data.error || 'Test failed',
          details: response.data.validation_errors || response.data.message
        });
      }
    } catch (err) {
      console.error('Error testing rule function:', err);
      setRuleTestResult({
        success: false,
        error: err.response?.data?.error || 'Test failed',
        details: err.response?.data?.validation_errors || err.response?.data?.message || err.message,
        expected_parameters: err.response?.data?.expected_parameters
      });
    } finally {
      setTestingRule(false);
    }
  };

  // Helper function to detect read-only functions
  const isReadOnlyFunction = (functionName) => {
    if (!functionName) return false;
    const readOnlyPrefixes = ['get_', 'is_', 'has_', 'check_', 'query_', 'view_', 'read_', 'fetch_'];
    return readOnlyPrefixes.some(prefix => functionName.toLowerCase().startsWith(prefix));
  };

  // Helper function to check if a function requires WebAuthn
  const requiresWebAuthn = (rule, contract) => {
    // Debug logging
    console.log('[ContractManagement] requiresWebAuthn check:', {
      contractId: contract?.id,
      contractRequiresWebAuthn: contract?.requires_webauthn,
      contractUseSmartWallet: contract?.use_smart_wallet,
      functionName: rule?.function_name,
      hasContract: !!contract
    });
    
    // Check contract-level WebAuthn requirement FIRST (this should catch all cases)
    if (contract?.requires_webauthn) {
      console.log('[ContractManagement] ✅ WebAuthn required: contract.requires_webauthn is true');
      return true;
    }
    
    // Check if function parameters include WebAuthn fields
    try {
      const functionParams = typeof rule.function_parameters === 'string'
        ? JSON.parse(rule.function_parameters)
        : rule.function_parameters || {};
      
      const webauthnParamNames = [
        'webauthn_signature',
        'webauthn_authenticator_data',
        'webauthn_client_data',
        'signature_payload'
      ];
      
      const hasWebAuthnParams = webauthnParamNames.some(paramName => 
        functionParams.hasOwnProperty(paramName) || 
        Object.keys(functionParams).some(key => key.toLowerCase().includes(paramName.toLowerCase()))
      );
      
      if (hasWebAuthnParams) {
        console.log('[ContractManagement] ✅ WebAuthn required: function parameters include WebAuthn fields');
        return true;
      }
    } catch (e) {
      console.error('[ContractManagement] Error checking WebAuthn params:', e);
    }
    
    console.log('[ContractManagement] ❌ WebAuthn NOT required');
    return false;
  };

  // Helper function to detect if a function is payment-related
  const isPaymentFunction = (functionName, functionParams) => {
    if (!functionName) return false;
    
    const paymentPatterns = ['transfer', 'payment', 'send', 'pay', 'withdraw', 'deposit'];
    const funcNameLower = functionName.toLowerCase();
    
    // Check function name
    if (paymentPatterns.some(pattern => funcNameLower.includes(pattern))) {
      return true;
    }
    
    // Check parameters for payment-related fields
    if (functionParams && typeof functionParams === 'object') {
      const paymentParams = ['destination', 'recipient', 'to', 'amount', 'asset', 'asset_address'];
      const paramKeys = Object.keys(functionParams).map(k => k.toLowerCase());
      const hasDestination = paymentParams.some(p => paramKeys.includes(p.toLowerCase()));
      const hasAmount = paramKeys.some(k => k.includes('amount'));
      if (hasDestination && hasAmount) {
        return true;
      }
    }
    
    return false;
  };

  const handleExecuteRule = (rule, event) => {
    // Prevent double execution
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    // Check if already executing
    if (executingRule) {
      return;
    }

    // Open confirmation dialog
    setExecuteConfirmDialog({ open: true, rule });
  };

  const handleConfirmExecute = async () => {
    const rule = executeConfirmDialog.rule;
    if (!rule) {
      setExecuteConfirmDialog({ open: false, rule: null });
      setSecretKeyInput('');
      return;
    }

    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    const contract = contracts.find(c => c.id === rule.contract_id);
    const isReadOnly = isReadOnlyFunction(rule.function_name);
    
    setExecutingRule(true);
    try {
      let functionParams = typeof rule.function_parameters === 'string'
        ? JSON.parse(rule.function_parameters)
        : rule.function_parameters || {};

      // Check if payment will route through smart wallet
      const willRouteThroughSmartWallet = contract?.use_smart_wallet && 
                                         contract?.smart_wallet_contract_id &&
                                         isPaymentFunction(rule.function_name, functionParams);

      // Determine if WebAuthn is needed:
      // 1. Contract-level requires_webauthn flag (always require if enabled)
      // 2. Function parameters include WebAuthn fields
      // 3. If routing through smart wallet, check contract's requires_webauthn flag
      const needsWebAuthn = contract?.requires_webauthn || 
                           requiresWebAuthn(rule, contract);

      console.log('[ContractManagement] WebAuthn check:', {
        contractRequiresWebAuthn: contract?.requires_webauthn,
        willRouteThroughSmartWallet,
        needsWebAuthn,
        functionName: rule.function_name,
        contractId: contract?.id
      });

      let userSecretKey = null;
      let webauthnData = null;

      if (needsWebAuthn) {
        // Use passkey authentication (like deposit feature)
        // First, get secret key from localStorage or context (like deposit does)
        // NOTE: Don't use 'let' here - we need to update the outer userSecretKey variable
        userSecretKey = secretKeyInput.trim() || secretKey;
        if (!userSecretKey) {
          const storedSecretKey = localStorage.getItem('stellar_secret_key');
          if (storedSecretKey) {
            // Verify the stored secret key matches the current public key
            try {
              const StellarSdk = await import('@stellar/stellar-sdk');
              const keypair = StellarSdk.Keypair.fromSecret(storedSecretKey);
              if (keypair.publicKey() === publicKey) {
                userSecretKey = storedSecretKey;
                console.log('[ContractManagement] Using secret key from localStorage for WebAuthn function');
              } else {
                throw new Error('Stored secret key does not match current wallet address');
              }
            } catch (err) {
              console.error('[ContractManagement] Invalid secret key in localStorage:', err);
              setError('Secret key in storage is invalid or does not match your wallet. Please enter your secret key above.');
              setExecutingRule(false);
              return;
            }
          } else {
            setError('Secret key is required to sign the transaction. Please enter your secret key above.');
            setExecutingRule(false);
            return;
          }
        } else {
          // Verify the provided secret key matches the public key
          try {
            const StellarSdk = await import('@stellar/stellar-sdk');
            const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
            if (keypair.publicKey() !== publicKey) {
              setError('Secret key does not match the connected wallet. Please check your secret key.');
              setExecutingRule(false);
              return;
            }
          } catch (err) {
            setError('Invalid secret key format. Please check your secret key.');
            setExecutingRule(false);
            return;
          }
        }

        setExecutionStatus('Getting passkeys...');
        
        // Get user's passkeys
        const passkeysResponse = await api.get('/webauthn/passkeys');
        const passkeys = passkeysResponse.data.passkeys || [];
        
        if (passkeys.length === 0) {
          setError('No passkey registered. Please register a passkey first.');
          setExecutingRule(false);
          return;
        }

        const selectedPasskey = passkeys[0]; // Use first passkey
        const credentialId = selectedPasskey.credentialId || selectedPasskey.credential_id;
        
        if (!credentialId) {
          setError('No credential ID found in passkey data');
          setExecutingRule(false);
          return;
        }

        // Get passkey public key
        let passkeyPublicKeySPKI = selectedPasskey.publicKey || selectedPasskey.public_key_spki;
        if (!passkeyPublicKeySPKI) {
          setError('Passkey public key not found. Please ensure your passkey is properly registered.');
          setExecutingRule(false);
          return;
        }

        // Create signature payload from function parameters
        // For smart wallet payments, include payment details in signature payload
        let signaturePayload;
        if (willRouteThroughSmartWallet) {
          // For smart wallet payments, create signature payload with payment details
          const paymentData = {
            function: rule.function_name,
            contract_id: rule.contract_id,
            destination: functionParams.destination || functionParams.recipient || functionParams.to,
            amount: functionParams.amount || functionParams.value || functionParams.quantity,
            asset: functionParams.asset || functionParams.asset_address || functionParams.token || 'native',
            timestamp: Date.now()
          };
          signaturePayload = functionParams.signature_payload || JSON.stringify(paymentData);
        } else {
          // For regular functions, use existing logic
          signaturePayload = functionParams.signature_payload || JSON.stringify({
            function: rule.function_name,
            contract_id: rule.contract_id,
            parameters: functionParams,
            timestamp: Date.now()
          });
        }

        setExecutionStatus('Authenticating with passkey...');
        setExecutionStep(1);
        
        // Small delay to show authentication step
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Authenticate with passkey
        const authResult = await webauthnService.authenticateWithPasskey(
          credentialId,
          signaturePayload
        );

        // Prepare WebAuthn data
        webauthnData = {
          passkeyPublicKeySPKI,
          webauthnSignature: authResult.signature,
          webauthnAuthenticatorData: authResult.authenticatorData,
          webauthnClientData: authResult.clientDataJSON,
          signaturePayload
        };

        // Update function parameters with WebAuthn data
        functionParams = {
          ...functionParams,
          signature_payload: signaturePayload,
          webauthn_signature: authResult.signature,
          webauthn_authenticator_data: authResult.authenticatorData,
          webauthn_client_data: authResult.clientDataJSON
        };
      } else {
        // Use secret key authentication (traditional)
        userSecretKey = secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
        
        // For write operations, secret key is required
        if (!isReadOnly && !userSecretKey) {
          setError('Secret key is required for executing write transactions. Please enter your secret key above.');
          setExecutingRule(false);
          return;
        }
        
        // For read-only functions without secret key, we can only simulate (not submit to ledger)
        // The user can still execute, but it will be simulated only
        // No error here - we'll just not submit to ledger
        
        // Verify the secret key matches the public key
        if (userSecretKey && publicKey) {
          try {
            const StellarSdk = await import('@stellar/stellar-sdk');
            const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
            if (keypair.publicKey() !== publicKey) {
              setError('Secret key does not match the connected wallet. Please check your secret key.');
              setExecutingRule(false);
              return;
            }
          } catch (err) {
            setError('Invalid secret key format. Please check your secret key.');
            setExecutingRule(false);
            return;
          }
        }
      }

      // Keep dialog open to show execution progress
      // Don't close yet - we'll close it after success
      setSecretKeyInput('');

      setExecutionStatus('Preparing transaction...');
      setExecutionStep(0);
      
      // Small delay to show preparing step
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setExecutionStatus('Signing transaction...');
      setExecutionStep(2);
      
      // Small delay to show signing step
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setExecutionStatus('Submitting to blockchain...');
      setExecutionStep(3);
      
      // Small delay to show submitting step
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setExecutionStatus('Waiting for confirmation...');
      setExecutionStep(4);

      const submitToLedger = !isReadOnly || !!userSecretKey;
      
      // Debug logging
      console.log('[ContractManagement] Execute request:', {
        functionName: rule.function_name,
        isReadOnly,
        userSecretKeyProvided: !!userSecretKey,
        userSecretKeyLength: userSecretKey ? userSecretKey.length : 0,
        submitToLedger,
        hasWebAuthn: !!webauthnData
      });
      
      const requestBody = {
        function_name: rule.function_name,
        parameters: functionParams,
        user_public_key: publicKey,
        user_secret_key: userSecretKey,
        submit_to_ledger: submitToLedger, // Only submit to ledger if it's a write function OR if we have a secret key for read-only
        rule_id: rule.id
      };

      // Add WebAuthn data if needed
      if (webauthnData) {
        requestBody.passkeyPublicKeySPKI = webauthnData.passkeyPublicKeySPKI;
        requestBody.webauthnSignature = webauthnData.webauthnSignature;
        requestBody.webauthnAuthenticatorData = webauthnData.webauthnAuthenticatorData;
        requestBody.webauthnClientData = webauthnData.webauthnClientData;
        requestBody.signaturePayload = webauthnData.signaturePayload;
      }

      const response = await api.post(`/contracts/${rule.contract_id}/execute`, requestBody);

      if (response.data.success) {
        setExecutionStatus('✅ Transaction confirmed!');
        let resultMessage = '';
        if (response.data.transaction_hash) {
          const txHash = response.data.transaction_hash;
          const network = response.data.network || 'testnet';
          const stellarExpertUrl = response.data.stellar_expert_url || `https://stellar.expert/explorer/${network}/tx/${txHash}`;
          resultMessage = `Function "${rule.function_name}" executed successfully! Transaction: ${txHash}`;
          if (response.data.stellar_expert_url) {
            resultMessage += `\nView on StellarExpert: ${stellarExpertUrl}`;
          }
        } else {
          resultMessage = `Function "${rule.function_name}" executed successfully!`;
        }
        setSuccess(resultMessage);
        setTimeout(() => setSuccess(''), 8000);
        
        // Reload pending rules to remove the executed rule from the list
        await loadPendingRules();
        
        // Close dialog after a short delay to show success
        setTimeout(() => {
          setExecuteConfirmDialog({ open: false, rule: null });
          setExecutionStatus('');
          setExecutionStep(0);
        }, 2000);
      } else {
        setError(response.data.error || 'Execution failed');
      }
    } catch (err) {
      console.error('Error executing rule function:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to execute function';
      const errorDetails = err.response?.data?.details || '';
      const errorSuggestion = err.response?.data?.suggestion || '';
      
      // Handle passkey mismatch error specifically
      if (errorMessage.toLowerCase().includes('passkey') && errorMessage.toLowerCase().includes('mismatch')) {
        setError(
          `🔐 Passkey Mismatch: ${errorDetails || errorMessage}\n\n` +
          `💡 ${errorSuggestion || 'Please re-register your passkey for this role, or use the passkey that was last registered for this public key.'}`
        );
      } else {
        setError(errorMessage + (errorDetails ? `\n\nDetails: ${errorDetails}` : '') + (errorSuggestion ? `\n\nSuggestion: ${errorSuggestion}` : ''));
      }
    } finally {
      setExecutingRule(false);
      // Don't clear executionStatus immediately if it was successful - let user see the success message
      if (!executionStatus.includes('confirmed') && !executionStatus.includes('success')) {
        setExecutionStatus('');
      }
      setExecutionStep(0);
      // Clear secret key input for security
      setSecretKeyInput('');
      setShowSecretKey(false);
    }
  };

  const handleWasmUpload = async () => {
    if (!wasmFile || !selectedContractForWasm) {
      setError('Please select a contract and WASM file');
      return;
    }
    try {
      setUploadingWasm(true);
      setError('');
      const formData = new FormData();
      formData.append('wasm', wasmFile); // Note: backend expects 'wasm' field name
      
      const response = await api.post(`/contracts/${selectedContractForWasm.id}/upload-wasm`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setSuccess('WASM file uploaded successfully');
        loadContracts();
        setTimeout(() => {
          setWasmUploadOpen(false);
          setWasmFile(null);
          setSelectedContractForWasm(null);
          setSuccess('');
        }, 1500);
      } else {
        setError('Failed to upload WASM file');
      }
    } catch (err) {
      console.error('Error uploading WASM:', err);
      setError(err.response?.data?.error || 'Failed to upload WASM file');
    } finally {
      setUploadingWasm(false);
    }
  };

  const handleDownloadWasm = async (contract) => {
    try {
      const response = await api.get(`/contracts/${contract.id}/wasm`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', contract.wasm_file_name || `${contract.contract_address}.wasm`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess('WASM file download initiated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error downloading WASM:', err);
      setError(err.response?.data?.error || 'Failed to download WASM file');
    }
  };

  const handleCheckQuorum = async (rule) => {
    try {
      setCheckingQuorum(true);
      setError('');
      setSelectedRuleForQuorum(rule);
      
      const response = await api.get(`/contracts/rules/${rule.id}/quorum`);
      
      setQuorumStatus(response.data);
      setQuorumCheckOpen(true);
    } catch (err) {
      console.error('Error checking quorum:', err);
      setError(err.response?.data?.error || 'Failed to check quorum status');
    } finally {
      setCheckingQuorum(false);
    }
  };

  const getContractName = (contractId) => {
    const contract = contracts.find(c => c.id === contractId);
    return contract ? (contract.contract_name || contract.contract_address.substring(0, 10) + '...') : 'Unknown';
  };
  
  const getRuleCountForContract = (contractId) => {
    return rules.filter(r => r.contract_id === contractId).length;
  };
  
  const handleRulesPageChange = (event, newPage) => {
    setRulesPage(newPage);
  };
  
  const handleRulesRowsPerPageChange = (event) => {
    setRulesRowsPerPage(parseInt(event.target.value, 10));
    setRulesPage(0);
  };
  
  const handleViewRuleMap = (rule) => {
    setSelectedRuleForMap(rule);
    setMapViewOpen(true);
  };

  const discoveredFunctions = (contract) => {
    if (!contract.discovered_functions) {
      console.log('[ContractManagement] No discovered_functions for contract:', contract.id);
      return [];
    }
    try {
      let functions = typeof contract.discovered_functions === 'string'
        ? JSON.parse(contract.discovered_functions)
        : contract.discovered_functions;
      
      console.log('[ContractManagement] Raw discovered_functions:', functions);
      
      // Convert object to array if needed, preserving function name from key if missing
      if (typeof functions === 'object' && !Array.isArray(functions)) {
        functions = Object.entries(functions).map(([key, func]) => {
          // If func is a string, convert to object
          if (typeof func === 'string') {
            return { name: func };
          }
          // If func doesn't have a name property, use the key
          if (!func.name) {
            return { ...func, name: key };
          }
          return func;
        });
      }
      
      // Ensure each function has parameters array
      const processedFunctions = Array.isArray(functions) ? functions.map(func => {
        const funcObj = typeof func === 'string' ? { name: func } : func;
        // Log the raw function object to see its structure
        console.log('[ContractManagement] Raw function object:', funcObj);
        const processed = {
          ...funcObj,
          // Ensure name exists
          name: funcObj.name || 'unknown',
          // Ensure parameters array exists and is properly structured
          parameters: Array.isArray(funcObj.parameters) 
            ? funcObj.parameters.map(p => ({
                name: p.name || 'unknown',
                type: p.type || 'unknown',
                mapped_from: p.mapped_from || null
              }))
            : []
        };
        console.log('[ContractManagement] Processed function:', processed.name, 'with', processed.parameters.length, 'parameters');
        if (processed.parameters.length > 0) {
          console.log('[ContractManagement] Parameters:', processed.parameters);
        } else {
          // Log the full object to see what properties it has
          console.log('[ContractManagement] Function object keys:', Object.keys(processed));
          console.log('[ContractManagement] Full function object:', JSON.stringify(processed, null, 2));
        }
        return processed;
      }) : [];
      
      console.log('[ContractManagement] Final processed functions:', processedFunctions);
      return processedFunctions;
    } catch (e) {
      console.error('[ContractManagement] Error parsing discovered_functions:', e);
      return [];
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          Smart Contract Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingContract(null);
            setContractDialogOpen(true);
          }}
        >
          Add Contract
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Contracts" {...a11yProps(0)} />
          <Tab label="Execution Rules" {...a11yProps(1)} />
          <Tab 
            label={
              <Box display="flex" alignItems="center" gap={1}>
                Pending Rules
                {pendingRules.length > 0 && (
                  <Chip 
                    label={pendingRules.length} 
                    size="small" 
                    color="warning"
                    sx={{ minWidth: '24px', height: '20px' }}
                  />
                )}
              </Box>
            } 
            {...a11yProps(2)} 
          />
        </Tabs>
      </Box>

      {/* Contracts Tab */}
      <TabPanel value={tabValue} index={0}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : contracts.length === 0 ? (
          <Alert severity="info">
            No contracts found. Click "Add Contract" to create your first smart contract.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {contracts.map((contract) => (
              <Grid item xs={12} md={6} lg={4} key={contract.id}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                      <Typography variant="h6" gutterBottom>
                        {contract.contract_name || 'Unnamed Contract'}
                      </Typography>
                      <Chip 
                        label={contract.is_active ? 'Active' : 'Inactive'} 
                        color={contract.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>Address:</strong> {contract.contract_address.substring(0, 10)}...
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>Network:</strong> {contract.network}
                    </Typography>
                    {contract.wasm_file_name && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>WASM:</strong> {contract.wasm_file_name}
                      </Typography>
                    )}
                    {discoveredFunctions(contract).length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Functions:</strong> {discoveredFunctions(contract).length} discovered
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      <strong>Rules:</strong> {getRuleCountForContract(contract.id)} execution rule{getRuleCountForContract(contract.id) !== 1 ? 's' : ''}
                    </Typography>
                    {contract.use_smart_wallet && (
                      <Box sx={{ mt: 1 }}>
                        <Chip 
                          label="💳 Smart Wallet Enabled" 
                          size="small" 
                          color="primary" 
                          sx={{ mb: 0.5 }}
                        />
                        {contract.smart_wallet_contract_id && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Wallet: {contract.smart_wallet_contract_id.substring(0, 10)}...
                          </Typography>
                        )}
                        {contract.requires_webauthn && (
                          <Chip 
                            label="🔐 Passkey Required" 
                            size="small" 
                            color="secondary" 
                            sx={{ mt: 0.5 }}
                          />
                        )}
                      </Box>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => handleEditContract(contract)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      startIcon={<RuleIcon />}
                      onClick={() => handleAddRule(contract)}
                    >
                      Add Rule
                    </Button>
                    {contract.wasm_file_name ? (
                      <Button
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleDownloadWasm(contract)}
                      >
                        Download WASM
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        startIcon={<UploadIcon />}
                        onClick={() => {
                          setSelectedContractForWasm(contract);
                          setWasmUploadOpen(true);
                        }}
                      >
                        Upload WASM
                      </Button>
                    )}
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteContract(contract.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* Execution Rules Tab */}
      <TabPanel value={tabValue} index={1}>
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleAddRule()}
          >
            Add Execution Rule
          </Button>
        </Box>
        {rules.length === 0 ? (
          <Alert severity="info">
            No execution rules found. Create rules to automatically execute contract functions based on location.
          </Alert>
        ) : (
          <>
            {/* Desktop Table View */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Rule Name</TableCell>
                      <TableCell>Contract</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Function</TableCell>
                      <TableCell>Trigger</TableCell>
                      <TableCell>Quorum</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rules
                      .slice(rulesPage * rulesRowsPerPage, rulesPage * rulesRowsPerPage + rulesRowsPerPage)
                      .map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{rule.rule_name}</TableCell>
                        <TableCell>{getContractName(rule.contract_id)}</TableCell>
                        <TableCell>
                          <Chip label={rule.rule_type} size="small" />
                        </TableCell>
                        <TableCell>{rule.function_name}</TableCell>
                        <TableCell>
                          <Chip label={rule.trigger_on} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {rule.required_wallet_public_keys && rule.required_wallet_public_keys.length > 0 ? (
                            <Tooltip title={`${rule.minimum_wallet_count} of ${rule.required_wallet_public_keys.length} required (${rule.quorum_type})`}>
                              <Chip 
                                label={`${rule.minimum_wallet_count}/${rule.required_wallet_public_keys.length}`} 
                                size="small" 
                                color="primary"
                              />
                            </Tooltip>
                          ) : (
                            <Chip label="None" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={rule.is_active ? 'Active' : 'Inactive'} 
                            color={rule.is_active ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {rule.rule_type === 'location' && rule.center_latitude && rule.center_longitude && (
                            <Tooltip title="View Location on Map">
                              <IconButton
                                size="small"
                                onClick={() => handleViewRuleMap(rule)}
                                color="primary"
                              >
                                <MapIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Test Function">
                            <IconButton
                              size="small"
                              onClick={() => handleTestRule(rule)}
                              disabled={testingRule || executingRule}
                              color="info"
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Execute Function">
                            <IconButton
                              size="small"
                              onClick={(e) => handleExecuteRule(rule, e)}
                              disabled={testingRule || executingRule}
                              color="success"
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={rule.is_active ? 'Deactivate Rule' : 'Activate Rule'}>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleRuleActive(rule)}
                              color={rule.is_active ? 'success' : 'default'}
                            >
                              <PowerSettingsNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <IconButton
                            size="small"
                            onClick={() => handleCheckQuorum(rule)}
                            disabled={checkingQuorum || !rule.required_wallet_public_keys || rule.required_wallet_public_keys.length === 0}
                            title="Check Quorum Status"
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEditRule(rule)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Mobile Card View */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {rules
                .slice(rulesPage * rulesRowsPerPage, rulesPage * rulesRowsPerPage + rulesRowsPerPage)
                .map((rule) => (
                <Card key={rule.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                      <Typography variant="h6">{rule.rule_name}</Typography>
                      <Chip 
                        label={rule.is_active ? 'Active' : 'Inactive'} 
                        color={rule.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                          <strong>Contract:</strong>
                        </Typography>
                        <Typography variant="body2">{getContractName(rule.contract_id)}</Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                          <strong>Type:</strong>
                        </Typography>
                        <Chip label={rule.rule_type} size="small" />
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                          <strong>Function:</strong>
                        </Typography>
                        <Typography variant="body2">{rule.function_name}</Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                          <strong>Trigger:</strong>
                        </Typography>
                        <Chip label={rule.trigger_on} size="small" variant="outlined" />
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                          <strong>Quorum:</strong>
                        </Typography>
                        {rule.required_wallet_public_keys && rule.required_wallet_public_keys.length > 0 ? (
                          <Tooltip title={`${rule.minimum_wallet_count} of ${rule.required_wallet_public_keys.length} required (${rule.quorum_type})`}>
                            <Chip 
                              label={`${rule.minimum_wallet_count}/${rule.required_wallet_public_keys.length}`} 
                              size="small" 
                              color="primary"
                            />
                          </Tooltip>
                        ) : (
                          <Chip label="None" size="small" />
                        )}
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box display="flex" gap={1} flexWrap="wrap">
                        {rule.rule_type === 'location' && rule.center_latitude && rule.center_longitude && (
                          <Tooltip title="View Location on Map">
                            <IconButton
                              size="small"
                              onClick={() => handleViewRuleMap(rule)}
                              color="primary"
                            >
                              <MapIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={rule.is_active ? 'Deactivate Rule' : 'Activate Rule'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleRuleActive(rule)}
                            color={rule.is_active ? 'success' : 'default'}
                          >
                            <PowerSettingsNewIcon />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={() => handleCheckQuorum(rule)}
                          disabled={checkingQuorum || !rule.required_wallet_public_keys || rule.required_wallet_public_keys.length === 0}
                          title="Check Quorum Status"
                        >
                          <VisibilityIcon />
                        </IconButton>
                        <Tooltip title="Test Function">
                          <IconButton
                            size="small"
                            onClick={() => handleTestRule(rule)}
                            disabled={testingRule || executingRule}
                            color="info"
                          >
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Execute Function">
                          <IconButton
                            size="small"
                            onClick={(e) => handleExecuteRule(rule, e)}
                            disabled={testingRule || executingRule}
                            color="success"
                          >
                            <CheckCircleIcon />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={() => handleEditRule(rule)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
            <TablePagination
              component="div"
              count={rules.length}
              page={rulesPage}
              onPageChange={handleRulesPageChange}
              rowsPerPage={rulesRowsPerPage}
              onRowsPerPageChange={handleRulesRowsPerPageChange}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />

            {/* Test Result Dialog */}
            {ruleTestResult && (
              <Dialog open={!!ruleTestResult} onClose={() => setRuleTestResult(null)} maxWidth="md" fullWidth>
                <DialogTitle>
                  {ruleTestResult.success ? '✅ Test Successful' : '❌ Test Failed'}
                </DialogTitle>
                <DialogContent>
                  {ruleTestResult.message && (
                    <Typography variant="body1" sx={{ mb: 2 }}>{ruleTestResult.message}</Typography>
                  )}
                  {ruleTestResult.error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>Error:</Typography>
                      <Typography variant="body2">{ruleTestResult.error}</Typography>
                    </Alert>
                  )}
                  {ruleTestResult.details && (
                    <Box sx={{ mt: 2 }}>
                      {Array.isArray(ruleTestResult.details) ? (
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {ruleTestResult.details.map((detail, idx) => (
                            <li key={idx}>{detail}</li>
                          ))}
                        </ul>
                      ) : (
                        <Typography variant="body2">{ruleTestResult.details}</Typography>
                      )}
                    </Box>
                  )}
                  {ruleTestResult.result && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>Test Result:</Typography>
                      <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
                        {JSON.stringify(ruleTestResult.result, null, 2)}
                      </pre>
                    </Box>
                  )}
                  {ruleTestResult.expected_parameters && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>Expected Parameters:</Typography>
                      <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
                        {JSON.stringify(ruleTestResult.expected_parameters, null, 2)}
                      </pre>
                    </Box>
                  )}
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setRuleTestResult(null)}>Close</Button>
                </DialogActions>
              </Dialog>
            )}
          </>
        )}
      </TabPanel>

      {/* Pending Rules Tab */}
      <TabPanel value={tabValue} index={2}>
        <Box mb={3}>
          <Alert severity="info" icon={<ScheduleIcon />}>
            <Typography variant="subtitle2" gutterBottom>
              Pending Rules Requiring Authentication
            </Typography>
            <Typography variant="body2">
              These rules matched your location but require WebAuthn/passkey authentication to execute. 
              Follow the steps below to complete each transaction.
            </Typography>
          </Alert>
        </Box>

        {loadingPendingRules ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : pendingRules.length === 0 ? (
          <Alert severity="success">
            No pending rules. All matched rules have been executed automatically.
          </Alert>
        ) : (
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {pendingRules.map((pendingRule) => {
              const contract = contracts.find(c => c.id === pendingRule.contract_id);
              const rule = rules.find(r => r.id === pendingRule.rule_id);
              const isExpanded = expandedPendingRule === pendingRule.rule_id;
              
              return (
                <React.Fragment key={pendingRule.rule_id}>
                  <Paper 
                    sx={{ 
                      mb: 1.5, 
                      border: '2px solid', 
                      borderColor: 'warning.main',
                      borderRadius: 2,
                      overflow: 'hidden'
                    }}
                  >
                    <ListItemButton
                      onClick={() => setExpandedPendingRule(isExpanded ? null : pendingRule.rule_id)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                            {pendingRule.rule_name}
                          </Typography>
                          <Chip 
                            icon={<WarningIcon />} 
                            label="Auth Required" 
                            color="warning" 
                            size="small"
                            sx={{ fontSize: '0.7rem', height: '20px' }}
                          />
                        </Box>
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                            <strong>Function:</strong> {pendingRule.function_name}
                          </Typography>
                          {contract && (
                            <Chip 
                              label={contract.contract_name || 'Unknown'} 
                              variant="outlined"
                              size="small"
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          )}
                          {pendingRule.matched_at && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {new Date(pendingRule.matched_at).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPendingRule(isExpanded ? null : pendingRule.rule_id);
                        }}
                        sx={{ ml: 1 }}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </ListItemButton>
                    
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ px: 2, pb: 2 }}>
                        <Divider sx={{ mb: 2 }} />
                        
                        {/* Rule Details */}
                        <Box mb={2}>
                          {pendingRule.location && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <LocationOnIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                Matched at: {pendingRule.location.latitude.toFixed(6)}, {pendingRule.location.longitude.toFixed(6)}
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        {/* Function Parameters Preview */}
                        {pendingRule.function_parameters && (
                          <Box mb={2}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
                              Function Parameters:
                            </Typography>
                            <Paper 
                              variant="outlined" 
                              sx={{ 
                                p: 1.5, 
                                bgcolor: 'grey.50',
                                maxHeight: '150px',
                                overflow: 'auto'
                              }}
                            >
                              <pre style={{ margin: 0, fontSize: '0.75rem' }}>
                                {JSON.stringify(
                                  typeof pendingRule.function_parameters === 'string'
                                    ? JSON.parse(pendingRule.function_parameters)
                                    : pendingRule.function_parameters,
                                  null,
                                  2
                                )}
                              </pre>
                            </Paper>
                          </Box>
                        )}

                        {/* Message */}
                        {pendingRule.message && (
                          <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
                            {pendingRule.message}
                          </Alert>
                        )}

                        {/* Action Buttons */}
                        <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MapIcon />}
                            onClick={() => {
                              if (pendingRule.location) {
                                setSelectedRuleForMap({
                                  ...rule,
                                  center_latitude: pendingRule.location.latitude,
                                  center_longitude: pendingRule.location.longitude
                                });
                                setMapViewOpen(true);
                              }
                            }}
                            disabled={!pendingRule.location}
                            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 'auto' } }}
                          >
                            View Location
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<DeleteIcon />}
                            onClick={() => {
                              setRuleToReject(pendingRule);
                              setRejectDialogOpen(true);
                            }}
                            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 'auto' } }}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<CheckCircleIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (rule) {
                                handleExecuteRule(rule, e);
                              }
                            }}
                            disabled={!rule}
                            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 'auto' } }}
                          >
                            Execute Now
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Paper>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </TabPanel>

      {/* Contract Dialog */}
      <CustomContractDialog
        open={contractDialogOpen}
        editingContract={editingContract}
        onClose={() => {
          setContractDialogOpen(false);
          setEditingContract(null);
        }}
        onContractSaved={() => {
          loadContracts();
          setContractDialogOpen(false);
          setEditingContract(null);
        }}
      />

      {/* Rule Dialog - Step by Step */}
      <Dialog 
        open={ruleDialogOpen} 
        onClose={() => {
          setRuleDialogOpen(false);
          setActiveStep(0);
        }} 
        maxWidth="lg" 
        fullWidth
        fullScreen={window.innerWidth < 768}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {editingRule ? 'Edit Execution Rule' : 'Create Execution Rule'}
          </Typography>
          <IconButton
            onClick={() => {
              setRuleDialogOpen(false);
              setActiveStep(0);
            }}
            sx={{ ml: 2 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Stepper activeStep={activeStep} orientation={stepperOrientation}>
              <Step>
                <StepLabel>Contract & Rule Details</StepLabel>
                {stepperOrientation === "vertical" ? (
                  <StepContent>
                    {activeStep === 0 && (
                    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Contract</InputLabel>
              <Select
                value={ruleForm.contract_id}
                label="Contract"
                onChange={(e) => setRuleForm({ ...ruleForm, contract_id: e.target.value })}
                disabled={!!selectedContractForRule}
              >
                {contracts.map((contract) => (
                  <MenuItem key={contract.id} value={contract.id}>
                    {contract.contract_name || contract.contract_address.substring(0, 10) + '...'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Rule Name"
              value={ruleForm.rule_name}
              onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
              fullWidth
              required
            />

            <FormControl fullWidth>
              <InputLabel>Rule Type</InputLabel>
              <Select
                value={ruleForm.rule_type}
                label="Rule Type"
                onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
              >
                <MenuItem value="location">Location (Circular)</MenuItem>
                <MenuItem value="geofence">Geofence</MenuItem>
                <MenuItem value="proximity">Proximity</MenuItem>
              </Select>
            </FormControl>

                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack} disabled={activeStep === 0}>
                        Back
                      </Button>
                      <Button onClick={handleRuleNext} variant="contained" disabled={!ruleForm.contract_id || !ruleForm.rule_name}>
                        Next
                      </Button>
                    </Box>
                  </Box>
                    )}
                  </StepContent>
                ) : (
                  activeStep === 0 && (
                    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                      <FormControl fullWidth>
                        <InputLabel>Contract</InputLabel>
                        <Select
                          value={ruleForm.contract_id}
                          label="Contract"
                          onChange={(e) => setRuleForm({ ...ruleForm, contract_id: e.target.value })}
                          disabled={!!selectedContractForRule}
                        >
                          {contracts.map((contract) => (
                            <MenuItem key={contract.id} value={contract.id}>
                              {contract.contract_name || contract.contract_address.substring(0, 10) + '...'}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <TextField
                        label="Rule Name"
                        value={ruleForm.rule_name}
                        onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                        fullWidth
                        required
                      />

                      <FormControl fullWidth>
                        <InputLabel>Rule Type</InputLabel>
                        <Select
                          value={ruleForm.rule_type}
                          label="Rule Type"
                          onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                        >
                          <MenuItem value="location">Location (Circular)</MenuItem>
                          <MenuItem value="geofence">Geofence</MenuItem>
                          <MenuItem value="proximity">Proximity</MenuItem>
                        </Select>
                      </FormControl>

                      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <Button onClick={handleRuleBack} disabled={activeStep === 0}>
                          Back
                        </Button>
                        <Button onClick={handleRuleNext} variant="contained" disabled={!ruleForm.contract_id || !ruleForm.rule_name}>
                          Next
                        </Button>
                      </Box>
                    </Box>
                  )
                )}
              </Step>
              
              <Step>
                <StepLabel>Location Selection</StepLabel>
                {stepperOrientation === "vertical" ? (
                  <StepContent>
                    {activeStep === 1 && (
                      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') ? (
                      <>
                        <Alert severity="info">
                          Click on the map to select the center location, then adjust the radius below. Or use the search box to find a location.
                        </Alert>
                        <Box sx={{ position: 'relative', height: '400px', width: '100%', mb: 2, border: '1px solid #ccc', borderRadius: 1 }}>
                          {/* Location Search Box and Zoom Button */}
                          <Box sx={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000, display: 'flex', gap: 1 }}>
                            <TextField
                              fullWidth
                              size="small"
                              placeholder="Search for a location..."
                              value={locationSearchQuery}
                              onChange={(e) => setLocationSearchQuery(e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    {locationSearchLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                                  </InputAdornment>
                                ),
                                endAdornment: locationSearchQuery && (
                                  <InputAdornment position="end">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setLocationSearchQuery('');
                                        setShowLocationSearchResults(false);
                                      }}
                                    >
                                      <CloseIcon fontSize="small" />
                                    </IconButton>
                                  </InputAdornment>
                                )
                              }}
                              sx={{ bgcolor: 'white', borderRadius: 1 }}
                            />
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<LocationOnIcon />}
                              onClick={handleZoomToMyLocation}
                              disabled={locationSearchLoading}
                              sx={{ 
                                bgcolor: 'primary.main',
                                minWidth: 'auto',
                                px: 1.5,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              My Location
                            </Button>
                          </Box>
                          {/* Search Results Dropdown */}
                          {showLocationSearchResults && locationSearchResults.length > 0 && (
                            <Box sx={{
                              position: 'absolute',
                              top: 50,
                              left: 10,
                              right: 10,
                              zIndex: 1001,
                              bgcolor: 'white',
                              borderRadius: 1,
                              boxShadow: 3,
                              maxHeight: '200px',
                              overflow: 'auto',
                              border: '1px solid #ccc'
                            }}>
                              {locationSearchResults.map((result, index) => (
                                <Box
                                  key={index}
                                  sx={{
                                    p: 1.5,
                                    cursor: 'pointer',
                                    borderBottom: index < locationSearchResults.length - 1 ? '1px solid #eee' : 'none',
                                    '&:hover': { bgcolor: '#f5f5f5' }
                                  }}
                                  onClick={() => handleLocationSearchResultClick(result)}
                                >
                                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {result.text}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {result.place_name}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )}
                          <div 
                            ref={mapContainerRef}
                            style={{ width: '100%', height: '100%' }}
                          />
                        </Box>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Latitude"
                              type="number"
                              value={ruleForm.center_latitude}
                              onChange={(e) => {
                                const lat = parseFloat(e.target.value);
                                setRuleForm({ ...ruleForm, center_latitude: e.target.value });
                                if (mapRef.current && !isNaN(lat) && mapRef.current.isStyleLoaded()) {
                                  const lng = parseFloat(ruleForm.center_longitude) || 0;
                                  setSelectedLocation({ lat, lng });
                                  mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
                                  updateRadiusCircle(mapRef.current, lat, lng, parseFloat(ruleForm.radius_meters) || 100);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ step: "any" }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Longitude"
                              type="number"
                              value={ruleForm.center_longitude}
                              onChange={(e) => {
                                const lng = parseFloat(e.target.value);
                                setRuleForm({ ...ruleForm, center_longitude: e.target.value });
                                if (mapRef.current && !isNaN(lng) && mapRef.current.isStyleLoaded()) {
                                  const lat = parseFloat(ruleForm.center_latitude) || 0;
                                  setSelectedLocation({ lat, lng });
                                  mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
                                  updateRadiusCircle(mapRef.current, lat, lng, parseFloat(ruleForm.radius_meters) || 100);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ step: "any" }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Radius (meters)"
                              type="number"
                              value={ruleForm.radius_meters}
                              onChange={(e) => {
                                setRuleForm({ ...ruleForm, radius_meters: e.target.value });
                                if (mapRef.current && selectedLocation && mapRef.current.isStyleLoaded()) {
                                  const radius = parseFloat(e.target.value) || 100;
                                  updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ min: 1 }}
                            />
                          </Grid>
                        </Grid>
                      </>
                    ) : (
                      <Alert severity="info">
                        Location selection is not required for this rule type.
                      </Alert>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack}>Back</Button>
                      <Button 
                        onClick={handleRuleNext} 
                        variant="contained"
                        disabled={(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') && (!ruleForm.center_latitude || !ruleForm.center_longitude || !ruleForm.radius_meters)}
                      >
                        Next
                      </Button>
                    </Box>
                      </Box>
                    )}
                  </StepContent>
                ) : (
                  activeStep === 1 && (
                    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                      {(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') ? (
                      <>
                        <Alert severity="info">
                          Click on the map to select the center location, then adjust the radius below. Or use the search box to find a location.
                        </Alert>
                        <Box sx={{ position: 'relative', height: '400px', width: '100%', mb: 2, border: '1px solid #ccc', borderRadius: 1 }}>
                          {/* Location Search Box and Zoom Button */}
                          <Box sx={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000, display: 'flex', gap: 1 }}>
                            <TextField
                              fullWidth
                              size="small"
                              placeholder="Search for a location..."
                              value={locationSearchQuery}
                              onChange={(e) => setLocationSearchQuery(e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    {locationSearchLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                                  </InputAdornment>
                                ),
                                endAdornment: locationSearchQuery && (
                                  <InputAdornment position="end">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setLocationSearchQuery('');
                                        setShowLocationSearchResults(false);
                                      }}
                                    >
                                      <CloseIcon fontSize="small" />
                                    </IconButton>
                                  </InputAdornment>
                                )
                              }}
                              sx={{ bgcolor: 'white', borderRadius: 1 }}
                            />
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<LocationOnIcon />}
                              onClick={handleZoomToMyLocation}
                              disabled={locationSearchLoading}
                              sx={{ 
                                bgcolor: 'primary.main',
                                minWidth: 'auto',
                                px: 1.5,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              My Location
                            </Button>
                          </Box>
                          {/* Search Results Dropdown */}
                          {showLocationSearchResults && locationSearchResults.length > 0 && (
                            <Box sx={{
                              position: 'absolute',
                              top: 50,
                              left: 10,
                              right: 10,
                              zIndex: 1001,
                              bgcolor: 'white',
                              borderRadius: 1,
                              boxShadow: 3,
                              maxHeight: '200px',
                              overflow: 'auto',
                              border: '1px solid #ccc'
                            }}>
                              {locationSearchResults.map((result, index) => (
                                <Box
                                  key={index}
                                  sx={{
                                    p: 1.5,
                                    cursor: 'pointer',
                                    borderBottom: index < locationSearchResults.length - 1 ? '1px solid #eee' : 'none',
                                    '&:hover': { bgcolor: '#f5f5f5' }
                                  }}
                                  onClick={() => handleLocationSearchResultClick(result)}
                                >
                                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {result.text}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {result.place_name}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )}
                          <div 
                            ref={mapContainerRef}
                            style={{ width: '100%', height: '100%' }}
                          />
                        </Box>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Latitude"
                              type="number"
                              value={ruleForm.center_latitude}
                              onChange={(e) => {
                                const lat = parseFloat(e.target.value);
                                setRuleForm({ ...ruleForm, center_latitude: e.target.value });
                                if (mapRef.current && !isNaN(lat) && mapRef.current.isStyleLoaded()) {
                                  const lng = parseFloat(ruleForm.center_longitude) || 0;
                                  setSelectedLocation({ lat, lng });
                                  mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
                                  updateRadiusCircle(mapRef.current, lat, lng, parseFloat(ruleForm.radius_meters) || 100);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ step: "any" }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Longitude"
                              type="number"
                              value={ruleForm.center_longitude}
                              onChange={(e) => {
                                const lng = parseFloat(e.target.value);
                                setRuleForm({ ...ruleForm, center_longitude: e.target.value });
                                if (mapRef.current && !isNaN(lng) && mapRef.current.isStyleLoaded()) {
                                  const lat = parseFloat(ruleForm.center_latitude) || 0;
                                  setSelectedLocation({ lat, lng });
                                  mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
                                  updateRadiusCircle(mapRef.current, lat, lng, parseFloat(ruleForm.radius_meters) || 100);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ step: "any" }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label="Radius (meters)"
                              type="number"
                              value={ruleForm.radius_meters}
                              onChange={(e) => {
                                setRuleForm({ ...ruleForm, radius_meters: e.target.value });
                                if (mapRef.current && selectedLocation && mapRef.current.isStyleLoaded()) {
                                  const radius = parseFloat(e.target.value) || 100;
                                  updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                }
                              }}
                              fullWidth
                              required
                              inputProps={{ min: 1 }}
                            />
                          </Grid>
                        </Grid>
                      </>
                    ) : (
                      <Alert severity="info">
                        Location selection is not required for this rule type.
                      </Alert>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack}>Back</Button>
                      <Button 
                        onClick={handleRuleNext} 
                        variant="contained"
                        disabled={(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') && (!ruleForm.center_latitude || !ruleForm.center_longitude || !ruleForm.radius_meters)}
                      >
                        Next
                      </Button>
                    </Box>
                    </Box>
                  )
                )}
              </Step>
              
              <Step>
                <StepLabel>Function & Parameters</StepLabel>
                {stepperOrientation === "vertical" ? (
                  <StepContent>
                    {activeStep === 2 && (
                      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth required>
                      <InputLabel>Function Name</InputLabel>
                      <Select
                        value={ruleForm.function_name}
                        label="Function Name"
                        onChange={(e) => handleFunctionSelect(e.target.value)}
                        disabled={!ruleForm.contract_id}
                      >
                        {ruleForm.contract_id ? (
                          (() => {
                            const contract = contracts.find(c => c.id === ruleForm.contract_id);
                            const functions = contract ? discoveredFunctions(contract) : [];
                            return functions.length > 0 ? (
                              functions.map((func) => (
                                <MenuItem key={func.name} value={func.name}>
                                  {func.name} {func.parameters && func.parameters.length > 0 && `(${func.parameters.length} params)`}
                                </MenuItem>
                              ))
                            ) : (
                              <MenuItem disabled>No functions discovered for this contract</MenuItem>
                            );
                          })()
                        ) : (
                          <MenuItem disabled>Select a contract first</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                    
                    {ruleForm.function_name && (
                      <Alert severity="success">
                        Parameters JSON has been auto-generated based on the selected function. You can edit it below if needed.
                      </Alert>
                    )}
                    
                    <TextField
                      label="Function Parameters (JSON)"
                      value={ruleForm.function_parameters}
                      onChange={(e) => {
                        setRuleForm({ ...ruleForm, function_parameters: e.target.value });
                        setTestResult(null); // Clear test result when parameters change
                      }}
                      fullWidth
                      multiline
                      rows={6}
                      helperText='JSON object with function parameters. Auto-generated when function is selected.'
                    />
                    
                    {/* Test Function Button and Result */}
                    {ruleForm.function_name && ruleForm.contract_id && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={testingFunction ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                          onClick={async () => {
                            try {
                              setTestingFunction(true);
                              setTestResult(null);
                              setError('');
                              
                              // Parse function parameters
                              let functionParams = {};
                              try {
                                if (ruleForm.function_parameters && ruleForm.function_parameters.trim()) {
                                  functionParams = JSON.parse(ruleForm.function_parameters);
                                }
                              } catch (parseError) {
                                setTestResult({
                                  success: false,
                                  error: 'Invalid JSON in function parameters',
                                  details: parseError.message
                                });
                                setTestingFunction(false);
                                return;
                              }
                              
                              // Call test endpoint
                              const response = await api.post(`/contracts/${ruleForm.contract_id}/test-function`, {
                                function_name: ruleForm.function_name,
                                parameters: functionParams
                              });
                              
                              if (response.data.success) {
                                setTestResult({
                                  success: true,
                                  message: response.data.message,
                                  result: response.data.test_result
                                });
                                setSuccess('Function test successful!');
                                setTimeout(() => setSuccess(''), 3000);
                              } else {
                                setTestResult({
                                  success: false,
                                  error: response.data.error || 'Test failed',
                                  details: response.data.validation_errors || response.data.message
                                });
                              }
                            } catch (err) {
                              console.error('Error testing function:', err);
                              setTestResult({
                                success: false,
                                error: err.response?.data?.error || 'Test failed',
                                details: err.response?.data?.validation_errors || err.response?.data?.message || err.message,
                                expected_parameters: err.response?.data?.expected_parameters
                              });
                            } finally {
                              setTestingFunction(false);
                            }
                          }}
                          disabled={testingFunction || !ruleForm.function_parameters}
                          fullWidth
                        >
                          {testingFunction ? 'Testing Function...' : 'Test Function'}
                        </Button>
                        
                        {testResult && (
                          <Alert 
                            severity={testResult.success ? 'success' : 'error'} 
                            sx={{ mt: 2 }}
                            onClose={() => setTestResult(null)}
                          >
                            <Typography variant="subtitle2" gutterBottom>
                              {testResult.success ? '✅ Test Successful' : '❌ Test Failed'}
                            </Typography>
                            {testResult.message && (
                              <Typography variant="body2">{testResult.message}</Typography>
                            )}
                            {testResult.error && (
                              <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1 }}>
                                Error: {testResult.error}
                              </Typography>
                            )}
                            {testResult.details && (
                              <Box sx={{ mt: 1 }}>
                                {Array.isArray(testResult.details) ? (
                                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {testResult.details.map((detail, idx) => (
                                      <li key={idx}>{detail}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                    {testResult.details}
                                  </Typography>
                                )}
                              </Box>
                            )}
                            {testResult.expected_parameters && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Expected Parameters:</Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                  {testResult.expected_parameters.map((param, idx) => (
                                    <li key={idx}>
                                      <strong>{param.name}</strong> ({param.type}) {param.required ? '(required)' : '(optional)'}
                                    </li>
                                  ))}
                                </ul>
                              </Box>
                            )}
                            {testResult.result && testResult.result.validation && (
                              <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  <strong>Validation:</strong> Function exists: ✓, Mapping exists: ✓, Parameters valid: ✓
                                </Typography>
                              </Box>
                            )}
                          </Alert>
                        )}
                      </Box>
                    )}
                    
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack}>Back</Button>
                      <Button 
                        onClick={handleRuleNext} 
                        variant="contained"
                        disabled={!ruleForm.function_name}
                      >
                        Next
                      </Button>
                    </Box>
                  </Box>
                  )}
                </StepContent>
              ) : (
                activeStep === 2 && (
                  <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    {/* Function & Parameters content for horizontal stepper */}
                    <FormControl fullWidth required>
                    <InputLabel>Function Name</InputLabel>
                    <Select
                      value={ruleForm.function_name}
                      label="Function Name"
                      onChange={(e) => handleFunctionSelect(e.target.value)}
                      disabled={!ruleForm.contract_id}
                    >
                      {ruleForm.contract_id ? (
                          (() => {
                            const contract = contracts.find(c => c.id === ruleForm.contract_id);
                            const functions = contract ? discoveredFunctions(contract) : [];
                            return functions.length > 0 ? (
                              functions.map((func) => (
                                <MenuItem key={func.name} value={func.name}>
                                  {func.name} {func.parameters && func.parameters.length > 0 && `(${func.parameters.length} params)`}
                                </MenuItem>
                              ))
                            ) : (
                              <MenuItem disabled>No functions discovered for this contract</MenuItem>
                            );
                          })()
                        ) : (
                          <MenuItem disabled>Select a contract first</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                    
                    {ruleForm.function_name && (
                      <Alert severity="success">
                        Parameters JSON has been auto-generated based on the selected function. You can edit it below if needed.
                      </Alert>
                    )}
                    
                    <TextField
                      label="Function Parameters (JSON)"
                      value={ruleForm.function_parameters}
                      onChange={(e) => {
                        setRuleForm({ ...ruleForm, function_parameters: e.target.value });
                        setTestResult(null);
                      }}
                      fullWidth
                      multiline
                      rows={6}
                      helperText='JSON object with function parameters. Auto-generated when function is selected.'
                    />
                    
                    {ruleForm.function_name && ruleForm.contract_id && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={testingFunction ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                          onClick={async () => {
                            try {
                              setTestingFunction(true);
                              setTestResult(null);
                              setError('');
                              
                              let functionParams = {};
                              try {
                                if (ruleForm.function_parameters && ruleForm.function_parameters.trim()) {
                                  functionParams = JSON.parse(ruleForm.function_parameters);
                                }
                              } catch (parseError) {
                                setTestResult({
                                  success: false,
                                  error: 'Invalid JSON in function parameters',
                                  details: parseError.message
                                });
                                setTestingFunction(false);
                                return;
                              }
                              
                              const response = await api.post(`/contracts/${ruleForm.contract_id}/test-function`, {
                                function_name: ruleForm.function_name,
                                parameters: functionParams
                              });
                              
                              if (response.data.success) {
                                setTestResult({
                                  success: true,
                                  message: response.data.message,
                                  result: response.data.test_result
                                });
                                setSuccess('Function test successful!');
                                setTimeout(() => setSuccess(''), 3000);
                              } else {
                                setTestResult({
                                  success: false,
                                  error: response.data.error || 'Test failed',
                                  details: response.data.validation_errors || response.data.message
                                });
                              }
                            } catch (err) {
                              console.error('Error testing function:', err);
                              setTestResult({
                                success: false,
                                error: err.response?.data?.error || 'Test failed',
                                details: err.response?.data?.validation_errors || err.response?.data?.message || err.message,
                                expected_parameters: err.response?.data?.expected_parameters
                              });
                            } finally {
                              setTestingFunction(false);
                            }
                          }}
                          disabled={testingFunction || !ruleForm.function_parameters}
                          fullWidth
                        >
                          {testingFunction ? 'Testing Function...' : 'Test Function'}
                        </Button>
                        
                        {testResult && (
                          <Alert 
                            severity={testResult.success ? 'success' : 'error'} 
                            sx={{ mt: 2 }}
                            onClose={() => setTestResult(null)}
                          >
                            <Typography variant="subtitle2" gutterBottom>
                              {testResult.success ? '✅ Test Successful' : '❌ Test Failed'}
                            </Typography>
                            {testResult.message && (
                              <Typography variant="body2">{testResult.message}</Typography>
                            )}
                            {testResult.error && (
                              <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1 }}>
                                Error: {testResult.error}
                              </Typography>
                            )}
                            {testResult.details && (
                              <Box sx={{ mt: 1 }}>
                                {Array.isArray(testResult.details) ? (
                                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {testResult.details.map((detail, idx) => (
                                      <li key={idx}>{detail}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                    {testResult.details}
                                  </Typography>
                                )}
                              </Box>
                            )}
                            {testResult.expected_parameters && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Expected Parameters:</Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                  {testResult.expected_parameters.map((param, idx) => (
                                    <li key={idx}>
                                      <strong>{param.name}</strong> ({param.type}) {param.required ? '(required)' : '(optional)'}
                                    </li>
                                  ))}
                                </ul>
                              </Box>
                            )}
                            {testResult.result && testResult.result.validation && (
                              <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  <strong>Validation:</strong> Function exists: ✓, Mapping exists: ✓, Parameters valid: ✓
                                </Typography>
                              </Box>
                            )}
                          </Alert>
                        )}
                      </Box>
                    )}
                    
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack}>Back</Button>
                      <Button 
                        onClick={handleRuleNext} 
                        variant="contained"
                        disabled={!ruleForm.function_name}
                      >
                        Next
                      </Button>
                    </Box>
                  </Box>
                  )
                )}
              </Step>
              
              <Step>
                <StepLabel>Advanced Settings</StepLabel>
                {stepperOrientation === "vertical" ? (
                  <StepContent>
                    {activeStep === 3 && (
                      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth>
                          <InputLabel>Trigger On</InputLabel>
                          <Select
                            value={ruleForm.trigger_on}
                            label="Trigger On"
                            onChange={(e) => setRuleForm({ ...ruleForm, trigger_on: e.target.value })}
                          >
                            <MenuItem value="enter">Enter Area</MenuItem>
                            <MenuItem value="exit">Exit Area</MenuItem>
                            <MenuItem value="within">Within Area</MenuItem>
                            <MenuItem value="proximity">Proximity</MenuItem>
                          </Select>
                        </FormControl>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={ruleForm.auto_execute}
                          onChange={(e) => setRuleForm({ ...ruleForm, auto_execute: e.target.checked })}
                        />
                      }
                      label="Auto Execute"
                    />

                    <FormControlLabel
                      control={
                        <Switch
                          checked={ruleForm.requires_confirmation}
                          onChange={(e) => setRuleForm({ ...ruleForm, requires_confirmation: e.target.checked })}
                        />
                      }
                      label="Requires Confirmation"
                    />

                    <TextField
                      label="Target Wallet Public Key (Optional)"
                      value={ruleForm.target_wallet_public_key}
                      onChange={(e) => setRuleForm({ ...ruleForm, target_wallet_public_key: e.target.value })}
                      fullWidth
                      helperText="Leave empty to apply to any wallet"
                    />

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6">Multi-Wallet Quorum (Optional)</Typography>

                    <TextField
                      label="Required Wallet Public Keys (comma-separated)"
                      value={Array.isArray(ruleForm.required_wallet_public_keys) 
                        ? ruleForm.required_wallet_public_keys.join(', ')
                        : ruleForm.required_wallet_public_keys || ''}
                      onChange={(e) => {
                        const wallets = e.target.value.split(',').map(w => w.trim()).filter(w => w);
                        setRuleForm({ ...ruleForm, required_wallet_public_keys: wallets });
                      }}
                      fullWidth
                      multiline
                      rows={2}
                      helperText="Enter wallet public keys separated by commas"
                    />

                    <TextField
                      label="Minimum Wallet Count"
                      type="number"
                      value={ruleForm.minimum_wallet_count || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, minimum_wallet_count: e.target.value ? parseInt(e.target.value) : null })}
                      fullWidth
                      helperText="Minimum number of required wallets that must be in range"
                    />

                    <FormControl fullWidth>
                      <InputLabel>Quorum Type</InputLabel>
                      <Select
                        value={ruleForm.quorum_type}
                        label="Quorum Type"
                        onChange={(e) => setRuleForm({ ...ruleForm, quorum_type: e.target.value })}
                      >
                        <MenuItem value="any">Any (at least minimum)</MenuItem>
                        <MenuItem value="all">All (all required wallets)</MenuItem>
                        <MenuItem value="exact">Exact (exactly minimum count)</MenuItem>
                      </Select>
                    </FormControl>
                    
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                      <Button onClick={handleRuleBack}>Back</Button>
                      <Button onClick={handleRuleNext} variant="contained">
                        Next
                      </Button>
                    </Box>
                      </Box>
                    )}
                  </StepContent>
                ) : (
                  activeStep === 3 && (
                    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                      <FormControl fullWidth>
                        <InputLabel>Trigger On</InputLabel>
                        <Select
                          value={ruleForm.trigger_on}
                          label="Trigger On"
                          onChange={(e) => setRuleForm({ ...ruleForm, trigger_on: e.target.value })}
                        >
                          <MenuItem value="enter">Enter Area</MenuItem>
                          <MenuItem value="exit">Exit Area</MenuItem>
                          <MenuItem value="within">Within Area</MenuItem>
                          <MenuItem value="proximity">Proximity</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={ruleForm.auto_execute}
                            onChange={(e) => setRuleForm({ ...ruleForm, auto_execute: e.target.checked })}
                          />
                        }
                        label="Auto Execute"
                      />

                      <FormControlLabel
                        control={
                          <Switch
                            checked={ruleForm.requires_confirmation}
                            onChange={(e) => setRuleForm({ ...ruleForm, requires_confirmation: e.target.checked })}
                          />
                        }
                        label="Requires Confirmation"
                      />

                      <TextField
                        label="Target Wallet Public Key (Optional)"
                        value={ruleForm.target_wallet_public_key}
                        onChange={(e) => setRuleForm({ ...ruleForm, target_wallet_public_key: e.target.value })}
                        fullWidth
                        helperText="Leave empty to apply to any wallet"
                      />

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="h6">Multi-Wallet Quorum (Optional)</Typography>

                      <TextField
                        label="Required Wallet Public Keys (comma-separated)"
                        value={Array.isArray(ruleForm.required_wallet_public_keys) 
                          ? ruleForm.required_wallet_public_keys.join(', ')
                          : ruleForm.required_wallet_public_keys || ''}
                        onChange={(e) => {
                          const wallets = e.target.value.split(',').map(w => w.trim()).filter(w => w);
                          setRuleForm({ ...ruleForm, required_wallet_public_keys: wallets });
                        }}
                        fullWidth
                        multiline
                        rows={2}
                        helperText="Enter wallet public keys separated by commas"
                      />

                      <TextField
                        label="Minimum Wallet Count"
                        type="number"
                        value={ruleForm.minimum_wallet_count || ''}
                        onChange={(e) => setRuleForm({ ...ruleForm, minimum_wallet_count: e.target.value ? parseInt(e.target.value) : null })}
                        fullWidth
                        helperText="Minimum number of required wallets that must be in range"
                      />

                      <FormControl fullWidth>
                        <InputLabel>Quorum Type</InputLabel>
                        <Select
                          value={ruleForm.quorum_type}
                          label="Quorum Type"
                          onChange={(e) => setRuleForm({ ...ruleForm, quorum_type: e.target.value })}
                        >
                          <MenuItem value="any">Any (at least minimum)</MenuItem>
                          <MenuItem value="all">All (all required wallets)</MenuItem>
                          <MenuItem value="exact">Exact (exactly minimum count)</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <Button onClick={handleRuleBack}>Back</Button>
                        <Button onClick={handleRuleNext} variant="contained">
                          Next
                        </Button>
                      </Box>
                    </Box>
                  )
                )}
              </Step>
              
              <Step>
                <StepLabel>Confirmation</StepLabel>
                {stepperOrientation === "vertical" ? (
                  <StepContent>
                    {activeStep === 4 && (
                      <Box sx={{ mb: 2 }}>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                          Please review all details before creating the rule. This action will create a new execution rule.
                        </Alert>
                        
                        <Paper sx={{ p: 2, mb: 2 }}>
                          <Typography variant="h6" gutterBottom>Rule Summary</Typography>
                          <Typography><strong>Rule Name:</strong> {ruleForm.rule_name}</Typography>
                          <Typography><strong>Contract:</strong> {contracts.find(c => c.id === ruleForm.contract_id)?.contract_name || 'N/A'}</Typography>
                          <Typography><strong>Rule Type:</strong> {ruleForm.rule_type}</Typography>
                          {(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') && (
                            <>
                              <Typography><strong>Location:</strong> {ruleForm.center_latitude}, {ruleForm.center_longitude}</Typography>
                              <Typography><strong>Radius:</strong> {ruleForm.radius_meters} meters</Typography>
                            </>
                          )}
                          <Typography><strong>Function:</strong> {ruleForm.function_name || 'N/A'}</Typography>
                          <Typography><strong>Trigger:</strong> {ruleForm.trigger_on}</Typography>
                          <Typography><strong>Auto Execute:</strong> {ruleForm.auto_execute ? 'Yes' : 'No'}</Typography>
                        </Paper>
                        
                        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                          <Button onClick={handleRuleBack}>Back</Button>
                          <Button onClick={handleSaveRule} variant="contained" color="success">
                            {editingRule ? 'Update' : 'Create'} Rule
                          </Button>
                        </Box>
                      </Box>
                    )}
                  </StepContent>
                ) : (
                  activeStep === 4 && (
                    <Box sx={{ mb: 2, mt: 2 }}>
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        Please review all details before creating the rule. This action will create a new execution rule.
                      </Alert>
                      
                      <Paper sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>Rule Summary</Typography>
                        <Typography><strong>Rule Name:</strong> {ruleForm.rule_name}</Typography>
                        <Typography><strong>Contract:</strong> {contracts.find(c => c.id === ruleForm.contract_id)?.contract_name || 'N/A'}</Typography>
                        <Typography><strong>Rule Type:</strong> {ruleForm.rule_type}</Typography>
                        {(ruleForm.rule_type === 'location' || ruleForm.rule_type === 'proximity') && (
                          <>
                            <Typography><strong>Location:</strong> {ruleForm.center_latitude}, {ruleForm.center_longitude}</Typography>
                            <Typography><strong>Radius:</strong> {ruleForm.radius_meters} meters</Typography>
                          </>
                        )}
                        <Typography><strong>Function:</strong> {ruleForm.function_name || 'N/A'}</Typography>
                        <Typography><strong>Trigger:</strong> {ruleForm.trigger_on}</Typography>
                        <Typography><strong>Auto Execute:</strong> {ruleForm.auto_execute ? 'Yes' : 'No'}</Typography>
                      </Paper>
                      
                      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <Button onClick={handleRuleBack}>Back</Button>
                        <Button onClick={handleSaveRule} variant="contained" color="success">
                          {editingRule ? 'Update' : 'Create'} Rule
                        </Button>
                      </Box>
                    </Box>
                  )
                )}
              </Step>
            </Stepper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setRuleDialogOpen(false);
            setActiveStep(0);
          }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* WASM Upload Dialog */}
      <Dialog open={wasmUploadOpen} onClose={() => setWasmUploadOpen(false)}>
        <DialogTitle>Upload WASM File</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2, minWidth: 400 }}>
            <Typography variant="body2" color="text.secondary">
              Contract: {selectedContractForWasm?.contract_name || selectedContractForWasm?.contract_address}
            </Typography>
            <input
              type="file"
              accept=".wasm"
              onChange={(e) => setWasmFile(e.target.files[0])}
              style={{ marginTop: 16 }}
            />
            {wasmFile && (
              <Typography variant="body2" color="text.secondary">
                Selected: {wasmFile.name} ({(wasmFile.size / 1024).toFixed(2)} KB)
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWasmUploadOpen(false)}>Cancel</Button>
          <Button
            onClick={handleWasmUpload}
            variant="contained"
            disabled={!wasmFile || uploadingWasm}
            startIcon={uploadingWasm ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {uploadingWasm ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Quorum Status Dialog */}
      <Dialog open={quorumCheckOpen} onClose={() => setQuorumCheckOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Quorum Status: {selectedRuleForQuorum?.rule_name}
        </DialogTitle>
        <DialogContent>
          {quorumStatus && (
            <Box sx={{ mt: 2 }}>
              <Alert 
                severity={quorumStatus.quorum_met ? 'success' : 'warning'}
                sx={{ mb: 2 }}
              >
                {quorumStatus.message}
              </Alert>
              <Typography variant="subtitle2" gutterBottom>
                Wallets In Range ({quorumStatus.count_in_range} / {quorumStatus.minimum_required}):
              </Typography>
              {quorumStatus.wallets_in_range && quorumStatus.wallets_in_range.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  {quorumStatus.wallets_in_range.map((wallet, idx) => (
                    <Chip
                      key={idx}
                      label={wallet.substring(0, 10) + '...'}
                      color="success"
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">None</Typography>
              )}
              {quorumStatus.wallets_out_of_range && quorumStatus.wallets_out_of_range.length > 0 && (
                <>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Wallets Out of Range:
                  </Typography>
                  <Box>
                    {quorumStatus.wallets_out_of_range.map((wallet, idx) => (
                      <Chip
                        key={idx}
                        label={wallet.substring(0, 10) + '...'}
                        color="error"
                        size="small"
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))}
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuorumCheckOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Quick Map View Dialog */}
      <Dialog 
        open={mapViewOpen} 
        onClose={() => {
          setMapViewOpen(false);
          setSelectedRuleForMap(null);
          if (mapViewRef.current) {
            mapViewRef.current.remove();
            mapViewRef.current = null;
          }
        }} 
        maxWidth="md" 
        fullWidth
        TransitionProps={{ onEntered: () => {
          // Force map resize after dialog animation completes
          if (mapViewRef.current) {
            setTimeout(() => {
              mapViewRef.current.resize();
            }, 100);
          }
        }}}
      >
        <DialogTitle>
          Rule Location: {selectedRuleForMap?.rule_name}
        </DialogTitle>
        <DialogContent>
          {selectedRuleForMap && selectedRuleForMap.center_latitude && selectedRuleForMap.center_longitude ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Location:</strong> {selectedRuleForMap.center_latitude}, {selectedRuleForMap.center_longitude}
              </Typography>
              {selectedRuleForMap.radius_meters && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Radius:</strong> {selectedRuleForMap.radius_meters} meters
                </Typography>
              )}
              <Box
                ref={mapViewContainerRef}
                sx={{
                  width: '100%',
                  height: { xs: '300px', sm: '400px' },
                  mt: 2,
                  borderRadius: 1,
                  overflow: 'hidden',
                  minHeight: '300px'
                }}
              />
            </Box>
          ) : (
            <Alert severity="info">This rule does not have location data.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setMapViewOpen(false);
            setSelectedRuleForMap(null);
            if (mapViewRef.current) {
              mapViewRef.current.remove();
              mapViewRef.current = null;
            }
          }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Execute Confirmation Dialog - Mobile Friendly */}
      <Dialog
        open={executeConfirmDialog.open}
        onClose={() => {
          setExecuteConfirmDialog({ open: false, rule: null });
          setSecretKeyInput('');
          setShowSecretKey(false);
        }}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 768}
        PaperProps={{
          sx: {
            m: window.innerWidth < 768 ? 0 : 2,
            maxHeight: window.innerWidth < 768 ? '100vh' : '90vh'
          }
        }}
      >
        <DialogTitle sx={{ 
          pb: 1,
          fontSize: window.innerWidth < 768 ? '1.1rem' : '1.25rem',
          fontWeight: 600
        }}>
          Confirm Function Execution
        </DialogTitle>
        <DialogContent dividers sx={{ 
          maxHeight: window.innerWidth < 768 ? 'calc(100vh - 200px)' : '60vh',
          overflowY: 'auto',
          px: window.innerWidth < 768 ? 2 : 3,
          py: 2
        }}>
          {executeConfirmDialog.rule && (() => {
            const rule = executeConfirmDialog.rule;
            const isReadOnly = isReadOnlyFunction(rule.function_name);
            const hasSecretKey = secretKey || localStorage.getItem('stellar_secret_key');
            const needsSecretKey = !hasSecretKey;
            const contract = contracts.find(c => c.id === rule.contract_id);
            const needsWebAuthn = requiresWebAuthn(rule, contract);
            
            // Debug logging
            console.log('[ContractManagement] Execute Dialog - Contract check:', {
              ruleContractId: rule.contract_id,
              contractFound: !!contract,
              contractId: contract?.id,
              contractRequiresWebAuthn: contract?.requires_webauthn,
              contractUseSmartWallet: contract?.use_smart_wallet,
              needsWebAuthn,
              functionName: rule.function_name
            });
            
            // Check if this is a payment function that will be routed through smart wallet
            let functionParams = {};
            try {
              functionParams = typeof rule.function_parameters === 'string'
                ? JSON.parse(rule.function_parameters)
                : rule.function_parameters || {};
            } catch (e) {
              // Ignore parse errors
            }
            const willRouteThroughSmartWallet = contract?.use_smart_wallet && 
                                                 contract?.smart_wallet_contract_id &&
                                                 isPaymentFunction(rule.function_name, functionParams);
            
            return (
              <>
                <Typography 
                  variant="body1" 
                  gutterBottom
                  sx={{ 
                    fontSize: window.innerWidth < 768 ? '0.95rem' : '1rem',
                    mb: 2
                  }}
                >
                  Are you sure you want to execute the function <strong>"{rule.function_name}"</strong>?
                </Typography>
                
                {willRouteThroughSmartWallet && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      <strong>💳 Payment will be routed through Smart Wallet</strong>
                    </Typography>
                    <Typography variant="body2">
                      This payment function will be executed through the smart wallet contract: <code>{contract.smart_wallet_contract_id?.substring(0, 10)}...</code>
                    </Typography>
                    {contract.requires_webauthn && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        🔐 Passkey authentication will be required for the smart wallet payment.
                      </Typography>
                    )}
                  </Alert>
                )}
                {isReadOnly ? (
                  <Alert severity="info" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" gutterBottom sx={{ fontSize: 'inherit' }}>
                      This is a read-only function.
                    </Typography>
                    {needsSecretKey ? (
                      <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                        <strong>To submit it to the blockchain and see it on StellarExpert, please provide your secret key below.</strong>
                        {' '}Without a secret key, the function will only be simulated (not submitted to the ledger).
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                        ✅ Secret key found. This function will be submitted to the blockchain and appear on StellarExpert.
                      </Typography>
                    )}
                  </Alert>
                ) : (
                  <Alert severity="warning" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                      This will submit a transaction to the blockchain and may incur fees.
                    </Typography>
                  </Alert>
                )}
                
                {needsWebAuthn ? (
                  <Alert severity="info" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" gutterBottom sx={{ fontSize: 'inherit' }}>
                      <strong>🔐 This function requires passkey authentication.</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                      You will be prompted to authenticate with your passkey when you click Execute.
                      {needsSecretKey && ' A secret key is also required to sign the base transaction.'}
                    </Typography>
                  </Alert>
                ) : contract?.requires_webauthn ? (
                  <Alert severity="warning" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" gutterBottom sx={{ fontSize: 'inherit' }}>
                      <strong>⚠️ Contract requires WebAuthn but function check returned false</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 'inherit' }}>
                      Debug: contract.requires_webauthn = {String(contract.requires_webauthn)}, 
                      needsWebAuthn = {String(needsWebAuthn)}
                    </Typography>
                  </Alert>
                ) : null}
                
                {needsSecretKey && (
                  <TextField
                    fullWidth
                    label="Secret Key"
                    type={showSecretKey ? 'text' : 'password'}
                    value={secretKeyInput}
                    onChange={(e) => setSecretKeyInput(e.target.value)}
                    placeholder="Enter your Stellar secret key"
                    helperText={needsWebAuthn 
                      ? "Required to sign the base transaction (passkey will be used for contract authentication)"
                      : "Required to sign and submit the transaction to the blockchain"}
                    sx={{ 
                      mt: 2,
                      '& .MuiInputBase-input': {
                        fontSize: window.innerWidth < 768 ? '16px' : '14px' // Prevent zoom on iOS
                      }
                    }}
                    autoFocus={!needsWebAuthn}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowSecretKey(!showSecretKey)}
                            edge="end"
                            size={window.innerWidth < 768 ? 'medium' : 'small'}
                          >
                            {showSecretKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                )}
                
                {!needsSecretKey && needsWebAuthn && (
                  <Alert severity="success" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                      Secret key found. You will be prompted for passkey authentication when you click Execute.
                    </Typography>
                  </Alert>
                )}
                
                {!needsSecretKey && !needsWebAuthn && (
                  <Alert severity="success" sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}>
                    <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                      Secret key found. Transaction will be signed and submitted to the blockchain.
                    </Typography>
                  </Alert>
                )}
                
                {executionStatus && (
                  <Alert 
                    severity="info" 
                    sx={{ mt: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}
                    icon={executingRule ? <CircularProgress size={16} /> : null}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {executingRule && <CircularProgress size={16} />}
                      <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                        {executionStatus}
                      </Typography>
                    </Box>
                  </Alert>
                )}
                
                {executingRule && (
                  <Box sx={{ mt: 2 }}>
                    <Stepper activeStep={getExecutionStep()} orientation="vertical">
                      <Step>
                        <StepLabel>Preparing Transaction</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            Building transaction parameters and validating inputs...
                          </Typography>
                        </StepContent>
                      </Step>
                      {needsWebAuthn && (
                        <Step>
                          <StepLabel>Authenticating with Passkey</StepLabel>
                          <StepContent>
                            <Typography variant="body2" color="text.secondary">
                              Please authenticate with your passkey when prompted...
                            </Typography>
                          </StepContent>
                        </Step>
                      )}
                      <Step>
                        <StepLabel>Signing Transaction</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            Signing the transaction with your secret key...
                          </Typography>
                        </StepContent>
                      </Step>
                      <Step>
                        <StepLabel>Submitting to Blockchain</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            Submitting transaction to the Stellar network...
                          </Typography>
                        </StepContent>
                      </Step>
                      <Step>
                        <StepLabel>Waiting for Confirmation</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            Waiting for transaction to be included in a ledger...
                          </Typography>
                        </StepContent>
                      </Step>
                    </Stepper>
                  </Box>
                )}
              </>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ 
          px: window.innerWidth < 768 ? 2 : 3,
          py: 2,
          gap: 1,
          flexDirection: window.innerWidth < 768 ? 'column-reverse' : 'row',
          '& > button': {
            width: window.innerWidth < 768 ? '100%' : 'auto',
            minHeight: '44px' // Better touch target for mobile
          }
        }}>
          <Button 
            onClick={() => {
              setExecuteConfirmDialog({ open: false, rule: null });
              setSecretKeyInput('');
              setShowSecretKey(false);
            }}
            variant={window.innerWidth < 768 ? 'outlined' : 'text'}
            fullWidth={window.innerWidth < 768}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmExecute} 
            variant="contained" 
            color="primary"
            disabled={executingRule}
            fullWidth={window.innerWidth < 768}
            startIcon={executingRule ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {executingRule ? 'Executing...' : 'Execute'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Pending Rule Confirmation Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onClose={() => {
          setRejectDialogOpen(false);
          setRuleToReject(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reject Pending Rule</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to reject the pending rule <strong>"{ruleToReject?.rule_name}"</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              This will remove the rule from your pending list. The rule will not be executed automatically in the future.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRejectDialogOpen(false);
              setRuleToReject(null);
            }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!ruleToReject) return;
              setRejectingRuleId(ruleToReject.rule_id);
              try {
                await api.post(`/contracts/rules/pending/${ruleToReject.rule_id}/reject`);
                setSuccess(`Pending rule "${ruleToReject.rule_name}" rejected successfully`);
                setTimeout(() => setSuccess(''), 3000);
                loadPendingRules(); // Reload to remove rejected rule
                setRejectDialogOpen(false);
                setRuleToReject(null);
              } catch (err) {
                setError(err.response?.data?.error || 'Failed to reject pending rule');
              } finally {
                setRejectingRuleId(null);
              }
            }}
            variant="contained"
            color="error"
            disabled={rejectingRuleId === ruleToReject?.rule_id}
            startIcon={rejectingRuleId === ruleToReject?.rule_id ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {rejectingRuleId === ruleToReject?.rule_id ? 'Rejecting...' : 'Reject Rule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContractManagement;

