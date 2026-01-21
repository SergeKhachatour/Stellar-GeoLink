import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Container,
  Tooltip,
  Divider,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  TablePagination,
  InputAdornment,
  List,
  ListItemButton,
  Collapse,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  CloudUpload as CloudUploadIcon,
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
  ExpandLess as ExpandLessIcon,
  QrCodeScanner as QrCodeScannerIcon,
  CameraAlt as CameraAltIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  ContentCopy as ContentCopyIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  SmartToy as SmartToyIcon
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import CustomContractDialog from '../NFT/CustomContractDialog';
import AIChat from '../AI/AIChat';
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
    <Box
      role="tabpanel"
      id={`contract-tabpanel-${index}`}
      aria-labelledby={`contract-tab-${index}`}
      sx={{
        p: 3,
        display: value === index ? 'block' : 'none'
      }}
      {...other}
    >
      {children}
    </Box>
  );
}

function a11yProps(index) {
  return {
    id: `contract-tab-${index}`,
    'aria-controls': `contract-tabpanel-${index}`,
  };
}

const ContractManagement = () => {
  const { publicKey, secretKey, balance: walletBalance } = useWallet();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isAuthenticated = !!user;
  const [contracts, setContracts] = useState([]);
  const [allRules, setAllRules] = useState([]); // Store all rules for public view
  const [filterNetwork, setFilterNetwork] = useState('all');
  const [filterContractName, setFilterContractName] = useState('');
  const [showActiveRulesOnly, setShowActiveRulesOnly] = useState(true);
  const [rules, setRules] = useState([]);
  const [pendingRules, setPendingRules] = useState([]);
  const [loadingPendingRules, setLoadingPendingRules] = useState(false);
  const [completedRules, setCompletedRules] = useState([]);
  const [loadingCompletedRules, setLoadingCompletedRules] = useState(false);
  const [rejectedRules, setRejectedRules] = useState([]);
  const [loadingRejectedRules, setLoadingRejectedRules] = useState(false);
  const [rejectingRuleId, setRejectingRuleId] = useState(null);
  const [expandedPendingRule, setExpandedPendingRule] = useState(null);
  const [selectedPendingRules, setSelectedPendingRules] = useState(new Set());
  const [batchExecuting, setBatchExecuting] = useState(false);
  const [batchExecutionProgress, setBatchExecutionProgress] = useState({ current: 0, total: 0, currentRule: null });
  const [batchSecretKeyDialogOpen, setBatchSecretKeyDialogOpen] = useState(false);
  const [batchSecretKeyInput, setBatchSecretKeyInput] = useState('');
  const [batchSecretKeyShow, setBatchSecretKeyShow] = useState(false);
  const [expandedCompletedRule, setExpandedCompletedRule] = useState(null);
  const [expandedRejectedRule, setExpandedRejectedRule] = useState(null);
  const [functionsDialogOpen, setFunctionsDialogOpen] = useState(false);
  const [selectedContractForFunctions, setSelectedContractForFunctions] = useState(null);
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
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentContractAddress, setAgentContractAddress] = useState('');
  const [agentProcessing, setAgentProcessing] = useState(false);
  const [agentResult, setAgentResult] = useState(null);
  
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
    quorum_type: 'any',
    // Rate limiting
    max_executions_per_public_key: null,
    execution_time_window_seconds: null,
    // Time-based triggers
    min_location_duration_seconds: null,
    // Auto-deactivation
    auto_deactivate_on_balance_threshold: false,
    balance_threshold_xlm: null,
    balance_check_asset_address: null,
    use_smart_wallet_balance: false,
    // Submit read-only to ledger
    submit_readonly_to_ledger: false
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
  const [quorumConfig, setQuorumConfig] = useState({
    required_wallet_public_keys: [],
    minimum_wallet_count: null,
    quorum_type: 'any'
  });
  const [newWalletKey, setNewWalletKey] = useState('');
  const [savingQuorum, setSavingQuorum] = useState(false);
  const [quorumDialogTab, setQuorumDialogTab] = useState(0); // 0 = Configure, 1 = Status
  const [isQuorumScannerOpen, setIsQuorumScannerOpen] = useState(false);
  const [quorumScannerError, setQuorumScannerError] = useState('');
  const quorumVideoRef = useRef(null);
  const quorumQrScannerRef = useRef(null);
  
  // Pagination state for all tabs
  const [contractsPage, setContractsPage] = useState(0);
  const [contractsRowsPerPage, setContractsRowsPerPage] = useState(12); // 12 for grid (3x4 or 4x3)
  const [rulesPage, setRulesPage] = useState(0);
  const [rulesRowsPerPage, setRulesRowsPerPage] = useState(10);
  const [pendingRulesPage, setPendingRulesPage] = useState(0);
  const [pendingRulesRowsPerPage, setPendingRulesRowsPerPage] = useState(10);
  const [completedRulesPage, setCompletedRulesPage] = useState(0);
  const [completedRulesRowsPerPage, setCompletedRulesRowsPerPage] = useState(10);
  const [rejectedRulesPage, setRejectedRulesPage] = useState(0);
  const [rejectedRulesRowsPerPage, setRejectedRulesRowsPerPage] = useState(10);
  
  // Quick Map View States
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const [selectedRuleForMap, setSelectedRuleForMap] = useState(null);
  const mapViewContainerRef = useRef(null);
  const mapViewRef = useRef(null);

  useEffect(() => {
    loadContracts();
    loadRules();
    // Only load user-specific data if authenticated
    if (isAuthenticated) {
      loadPendingRules();
      loadCompletedRules();
      loadRejectedRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Reload rules when switching tabs (only if authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      if (tabValue === 2) {
        loadPendingRules();
      } else if (tabValue === 3) {
        loadCompletedRules();
      } else if (tabValue === 4) {
        loadRejectedRules();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabValue, isAuthenticated]);

  // Reload rules when toggle changes (for non-authenticated users)
  useEffect(() => {
    if (!isAuthenticated) {
      loadRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActiveRulesOnly, isAuthenticated]);

  // Auto-refresh pending rules count every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (tabValue === 2 && !batchExecuting) {
        // Only refresh if we're on the pending rules tab and not executing a batch
        loadPendingRules();
      }
    }, 10000); // Refresh every 10 seconds (increased from 5 to reduce flickering)

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabValue, batchExecuting]);
  
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
      // Use public endpoint if not authenticated, authenticated endpoint if logged in
      const endpoint = isAuthenticated ? '/contracts' : '/contracts/public';
      const response = await api.get(endpoint);
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
      // Use public endpoint if not authenticated, authenticated endpoint if logged in
      const endpoint = isAuthenticated ? '/contracts/rules' : '/contracts/rules/public';
      
      let loadedRules = [];
      
      if (!isAuthenticated && !showActiveRulesOnly) {
        // For public endpoint when toggle is off, fetch both active and inactive rules
        try {
          const [activeResponse, inactiveResponse] = await Promise.all([
            api.get('/contracts/rules/public', { params: { is_active: true } }),
            api.get('/contracts/rules/public', { params: { is_active: false } })
          ]);
          
          const activeRules = activeResponse.data?.success ? (activeResponse.data.rules || []) : [];
          const inactiveRules = inactiveResponse.data?.success ? (inactiveResponse.data.rules || []) : [];
          
          // Combine active and inactive rules, removing duplicates
          const allRulesMap = new Map();
          activeRules.forEach(rule => allRulesMap.set(rule.id, rule));
          inactiveRules.forEach(rule => allRulesMap.set(rule.id, rule));
          loadedRules = Array.from(allRulesMap.values());
        } catch (fetchErr) {
          console.error('Error loading rules (both active and inactive):', fetchErr);
          // Fallback to just active rules
          const response = await api.get('/contracts/rules/public');
          if (response.data.success) {
            loadedRules = response.data.rules || [];
          }
        }
      } else {
        // For authenticated users or when toggle is on, use normal endpoint
        const params = {};
        if (!isAuthenticated && showActiveRulesOnly) {
          // Public endpoint with active only (default behavior, but explicit for clarity)
          params.is_active = true;
        }
        
        const response = await api.get(endpoint, { params });
        if (response.data.success) {
          loadedRules = response.data.rules || [];
        }
      }
      
      setRules(loadedRules);
      setAllRules(loadedRules); // Store all rules for filtering
    } catch (err) {
      console.error('Error loading rules:', err);
      // If authenticated endpoint fails and user is logged in, try public endpoint as fallback
      if (isAuthenticated) {
        try {
          const publicResponse = await api.get('/contracts/rules/public');
          if (publicResponse.data.success) {
            const loadedRules = publicResponse.data.rules || [];
            setRules(loadedRules);
            setAllRules(loadedRules);
          }
        } catch (publicErr) {
          console.error('Error loading public rules:', publicErr);
        }
      }
    }
  };

  const loadPendingRules = async () => {
    // Don't refresh if batch execution is in progress
    if (batchExecuting) {
      return;
    }
    
    // Delay showing loading indicator to reduce flickering for quick refreshes
    let loadingTimeout = setTimeout(() => {
      setLoadingPendingRules(true);
    }, 300);
    
    try {
      const response = await api.get('/contracts/rules/pending');
      if (response.data.success) {
        const pending = response.data.pending_rules || [];
        
        // Preserve selection state by filtering out keys that no longer exist
        setSelectedPendingRules(prevSelected => {
          const validKeys = new Set();
          pending.forEach((pr, index) => {
            const uniqueKey = getPendingRuleKey(pr, index);
            if (prevSelected.has(uniqueKey)) {
              validKeys.add(uniqueKey);
            }
          });
          return validKeys;
        });
        
        setPendingRules(pending);

        // Auto-finalize any pending rules that we successfully executed on-chain but didn't get marked completed.
        // We persist the last tx hash per (rule_id + matched_public_key) when we execute via smart-wallet.
        try {
          const candidates = pending
            .map((r) => {
              const rid = r.rule_id || r.id;
              const mpk = r.matched_public_key || '';
              const key = `rule_tx_${rid}_${mpk}`;
              const txHash = localStorage.getItem(key);
              return txHash ? { rid, mpk, key, txHash } : null;
            })
            .filter(Boolean);

          if (candidates.length > 0) {
            await Promise.all(
              candidates.map((c) => {
                const pendingRule = pending.find(r => (r.rule_id || r.id) === c.rid && (r.matched_public_key || '') === c.mpk);
                return api.post(`/contracts/rules/pending/${c.rid}/complete`, {
                  matched_public_key: c.mpk || undefined,
                  transaction_hash: c.txHash,
                  update_id: pendingRule?.update_id // Include update_id if available to mark only the specific location update as completed
                });
              })
            );

            // Clear stored hashes once we've attempted finalization
            candidates.forEach((c) => localStorage.removeItem(c.key));

            // Refresh pending + completed views
            const refreshed = await api.get('/contracts/rules/pending');
            if (refreshed.data?.success) {
              setPendingRules(refreshed.data.pending_rules || []);
            }
            await loadCompletedRules();
          }
        } catch (finalizeErr) {
          console.warn('[ContractManagement] Auto-finalize pending rules failed:', finalizeErr?.message || finalizeErr);
        }
      }
    } catch (err) {
      console.error('Error loading pending rules:', err);
      setError(err.response?.data?.error || 'Failed to load pending rules');
    } finally {
      clearTimeout(loadingTimeout);
      setLoadingPendingRules(false);
    }
  };

  const loadCompletedRules = async () => {
    try {
      setLoadingCompletedRules(true);
      const response = await api.get('/contracts/rules/completed');
      if (response.data.success) {
        const rawRules = response.data.completed_rules || [];
        
        // Deduplicate completed rules using a Set with unique keys
        // Key format: rule_id + transaction_hash + update_id + matched_public_key
        const seenKeys = new Set();
        const deduplicatedRules = [];
        
        for (const rule of rawRules) {
          // Extract transaction_hash from execution_results if not directly available
          let transactionHash = rule.transaction_hash;
          let matchedPublicKey = rule.matched_public_key || rule.public_key || 'unknown';
          let updateId = rule.update_id;
          let completedAt = rule.completed_at;
          
          // If transaction_hash is not directly on the rule, try to extract it from execution_results
          if (!transactionHash && rule.execution_results) {
            try {
              const executionResults = typeof rule.execution_results === 'string'
                ? JSON.parse(rule.execution_results)
                : rule.execution_results || [];
              
              const completedResult = executionResults.find(r => 
                r.rule_id === rule.rule_id && 
                r.completed === true
              );
              
              if (completedResult) {
                transactionHash = completedResult.transaction_hash || transactionHash;
                matchedPublicKey = completedResult.matched_public_key || matchedPublicKey;
                updateId = updateId || completedResult.update_id;
                completedAt = completedResult.completed_at || completedAt;
              }
            } catch (e) {
              console.error('Error parsing execution_results for deduplication:', e);
            }
          }
          
          // Create unique key: rule_id + transaction_hash + update_id + matched_public_key
          // This ensures each unique execution instance appears only once
          const uniqueKey = `${rule.rule_id}_${transactionHash || 'no-tx'}_${updateId || 'no-update'}_${matchedPublicKey}`;
          
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            // Add the extracted fields to the rule object for easier access
            deduplicatedRules.push({
              ...rule,
              transaction_hash: transactionHash,
              matched_public_key: matchedPublicKey,
              update_id: updateId,
              completed_at: completedAt
            });
          }
        }
        
        console.log(`[CompletedRules] Loaded ${rawRules.length} raw rules, deduplicated to ${deduplicatedRules.length} unique rules`);
        setCompletedRules(deduplicatedRules);
      }
    } catch (err) {
      console.error('Error loading completed rules:', err);
      setError(err.response?.data?.error || 'Failed to load completed rules');
    } finally {
      setLoadingCompletedRules(false);
    }
  };

  const loadRejectedRules = async () => {
    try {
      setLoadingRejectedRules(true);
      const response = await api.get('/contracts/rules/rejected');
      if (response.data.success) {
        setRejectedRules(response.data.rejected_rules || []);
      }
    } catch (err) {
      console.error('Error loading rejected rules:', err);
      setError(err.response?.data?.error || 'Failed to load rejected rules');
    } finally {
      setLoadingRejectedRules(false);
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

  const handleUpdateWasm = async (contract) => {
    if (!contract.id) {
      setError('Contract ID not found');
      return;
    }

    setError('');
    setSuccess('');
    
    try {
      const response = await api.post(`/contracts/${contract.id}/fetch-wasm`, {
        network: contract.network || 'testnet'
      });

      if (response.data.success) {
        setSuccess(`WASM file updated from ${contract.network || 'testnet'} network successfully!`);
        // Reload contracts to show updated WASM info
        loadContracts();
      } else {
        setError('Failed to update WASM file');
      }
    } catch (err) {
      console.error('Error updating WASM:', err);
      setError(err.response?.data?.error || err.message || 'Failed to update WASM file');
    }
  };

  const handleAgentOnboard = async () => {
    if (!agentContractAddress.trim()) {
      setError('Please enter a contract address');
      return;
    }

    // Validate contract address format
    if (!/^[A-Z0-9]{56}$/.test(agentContractAddress.trim())) {
      setError('Invalid contract address format. Must be 56 characters (Stellar address format)');
      return;
    }

    setError('');
    setSuccess('');
    setAgentProcessing(true);
    setAgentResult(null);

    try {
      console.log('[GeoLink Agent] 🤖 Starting automated onboarding...');
      const response = await api.post('/contracts/agent-onboard', {
        contract_address: agentContractAddress.trim().toUpperCase()
      });

      if (response.data.success) {
        setAgentResult(response.data);
        setSuccess(`Contract onboarded successfully on ${response.data.detected_network}!`);
        // Reload contracts to refresh the list
        loadContracts();
        // Close agent dialog and open edit dialog with the newly created contract
        setAgentDialogOpen(false);
        // Use the contract data directly from the response instead of refetching
        // This ensures we have the latest data including the inferred name and correct contract address
        const contractData = response.data.contract;
        if (contractData) {
          // Ensure we're using the exact contract address from the input, not any default
          const contractToEdit = {
            ...contractData,
            // Force the contract address to match what the user entered
            contract_address: agentContractAddress.trim().toUpperCase(),
            // Ensure we have the latest inferred name from the onboarding process
            contract_name: contractData.contract_name || `Contract ${agentContractAddress.trim().substring(0, 8)}`,
            // Use the network that was detected
            network: response.data.detected_network || contractData.network || 'testnet'
          };
          
          // Fetch full contract details to ensure we have all fields (id, etc.)
          try {
            const contractsResponse = await api.get('/contracts');
            const fullContract = contractsResponse.data.contracts?.find(
              c => c.contract_address === agentContractAddress.trim().toUpperCase()
            );
            if (fullContract) {
              // Merge: use full contract data but override with latest onboarding data
              const mergedContract = {
                ...fullContract,
                // Override with onboarding data to ensure latest name and functions
                contract_name: contractData.contract_name || fullContract.contract_name,
                discovered_functions: contractData.discovered_functions || fullContract.discovered_functions,
                function_mappings: contractData.function_mappings || fullContract.function_mappings,
                network: response.data.detected_network || contractData.network || fullContract.network,
                // Ensure contract address matches what user entered
                contract_address: agentContractAddress.trim().toUpperCase()
              };
              setEditingContract(mergedContract);
              setContractDialogOpen(true);
            } else {
              // Fallback: use the contract data from response with forced address
              setEditingContract(contractToEdit);
              setContractDialogOpen(true);
            }
          } catch (fetchError) {
            console.error('Error fetching full contract details:', fetchError);
            // Fallback: use the contract data from response with forced address
            setEditingContract(contractToEdit);
            setContractDialogOpen(true);
          }
        }
      } else {
        setError(response.data.error || 'Failed to onboard contract');
      }
    } catch (err) {
      console.error('Error in GeoLink Agent onboarding:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to onboard contract';
      setError(errorMessage);
    } finally {
      setAgentProcessing(false);
    }
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
      quorum_type: 'any',
      // Rate limiting
      max_executions_per_public_key: null,
      execution_time_window_seconds: null,
      // Time-based triggers
      min_location_duration_seconds: null,
      // Auto-deactivation
      auto_deactivate_on_balance_threshold: false,
      balance_threshold_xlm: null,
      balance_check_asset_address: null,
      use_smart_wallet_balance: false,
      // Submit read-only to ledger
      submit_readonly_to_ledger: false
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
    
    if (selectedFunc && selectedFunc.parameters && Array.isArray(selectedFunc.parameters) && selectedFunc.parameters.length > 0) {
      console.log('[ContractManagement] Function has parameters:', selectedFunc.parameters);
      // Generate parameter object with default values based on mapped_from
      const params = {};
      selectedFunc.parameters.forEach(param => {
        console.log('[ContractManagement] Processing parameter:', param);
        const paramName = param.name || param.parameter_name || 'unknown';
        const paramType = param.type || 'String';
        const mappedFrom = param.mapped_from || null;
        
        switch (mappedFrom) {
          case 'latitude':
            params[paramName] = ruleForm.center_latitude || 0;
            break;
          case 'longitude':
            params[paramName] = ruleForm.center_longitude || 0;
            break;
          case 'user_public_key':
            params[paramName] = publicKey || '[Will be system-generated from matched wallet]';
            break;
          case 'amount':
            params[paramName] = 0;
            break;
          case 'asset_code':
            params[paramName] = '';
            break;
          default:
            // Pre-fill based on parameter name and type
            if (paramName === 'signer_address' && (paramType === 'Address' || paramType === 'address')) {
              params[paramName] = publicKey || '[Will be system-generated from your wallet]';
            } else if (paramName === 'destination' && (paramType === 'Address' || paramType === 'address')) {
              params[paramName] = '[Will be system-generated from matched wallet]';
            } else if (paramName === 'asset' && (paramType === 'Address' || paramType === 'address')) {
              params[paramName] = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // XLM contract address
            } else if (paramName.includes('webauthn') || paramName.includes('signature')) {
              params[paramName] = '[Will be system-generated during WebAuthn authentication]';
            } else if (paramName === 'signature_payload') {
              params[paramName] = '[Will be system-generated from transaction data]';
            } else if (paramType === 'I128' || paramType === 'I64' || paramType === 'I32' || 
                paramType === 'U128' || paramType === 'U64' || paramType === 'U32') {
              params[paramName] = 0;
            } else if (paramType === 'Bool') {
              params[paramName] = false;
            } else if (paramType === 'Address') {
              params[paramName] = '';
            } else {
              params[paramName] = '';
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
        isArray: Array.isArray(selectedFunc?.parameters),
        parametersLength: selectedFunc?.parameters?.length || 0,
        parameters: selectedFunc?.parameters
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
        
        // Update radius circle - ensure map is ready first
        const updateCircleAfterPinDrop = () => {
          if (newMap.isStyleLoaded()) {
            try {
              updateRadiusCircle(newMap, lat, lng, radiusToUse);
            } catch (error) {
              console.warn('Error updating radius circle after pin drop:', error);
            }
          } else {
            newMap.once('style.load', () => {
              try {
                updateRadiusCircle(newMap, lat, lng, radiusToUse);
              } catch (error) {
                console.warn('Error updating radius circle after style load:', error);
              }
            });
          }
        };
        
        // Wait a bit for state to update, then try
        setTimeout(() => {
          updateCircleAfterPinDrop();
        }, 100);
        
        // Also update after a short delay to ensure it's visible after zoom
        setTimeout(() => {
          updateCircleAfterPinDrop();
          newMap.flyTo({
            center: [lng, lat],
            zoom: zoomLevel,
            duration: 1000
          });
          // Update again after flyTo completes
          setTimeout(() => {
            updateCircleAfterPinDrop();
          }, 1100);
          // And once more after that
          setTimeout(() => {
            updateCircleAfterPinDrop();
          }, 2000);
        }, 300);
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
        
        // Update radius circle - try multiple times to ensure it shows
        const updateCircle = () => {
          const radius = parseFloat(ruleForm.radius_meters) || 100;
          if (radius > 0 && !isNaN(lat) && !isNaN(lng)) {
            if (newMap.isStyleLoaded()) {
              updateRadiusCircle(newMap, lat, lng, radius);
            } else {
              // If map not ready, wait and try again
              newMap.once('style.load', () => {
                updateRadiusCircle(newMap, lat, lng, radius);
              });
            }
          }
        };
        
        // Try immediately if map is loaded
        if (newMap.isStyleLoaded()) {
          updateCircle();
        } else {
          // Wait for style to load
          newMap.once('style.load', () => {
            updateCircle();
            // Also try again after a short delay to ensure it's visible
            setTimeout(() => {
              updateCircle();
            }, 200);
          });
        }
        
        // Also try after delays as fallback to ensure it shows
        // Use multiple timeouts to handle different loading scenarios
        setTimeout(() => {
          updateCircle();
        }, 300);
        setTimeout(() => {
          updateCircle();
        }, 600);
        setTimeout(() => {
          updateCircle();
        }, 1000);
        setTimeout(() => {
          updateCircle();
        }, 1500);
      }
      
      // Also add a listener for when the map becomes idle (fully loaded)
      const handleMapIdle = () => {
        if (ruleForm.center_latitude && ruleForm.center_longitude) {
          const lat = parseFloat(ruleForm.center_latitude);
          const lng = parseFloat(ruleForm.center_longitude);
          const radius = parseFloat(ruleForm.radius_meters) || 100;
          if (!isNaN(lat) && !isNaN(lng) && radius > 0) {
            updateRadiusCircle(newMap, lat, lng, radius);
          }
        }
      };
      newMap.on('idle', handleMapIdle);
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
    if (!mapRef.current || activeStep !== 1) return;
    
    // If we have coordinates in ruleForm but no selectedLocation, set it
    if (!selectedLocation && ruleForm.center_latitude && ruleForm.center_longitude) {
      setSelectedLocation({
        lat: parseFloat(ruleForm.center_latitude),
        lng: parseFloat(ruleForm.center_longitude)
      });
      return; // Will trigger this effect again with selectedLocation set
    }
    
    if (!selectedLocation) return;
    
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
  }, [selectedLocation, ruleForm.radius_meters, ruleForm.center_latitude, ruleForm.center_longitude, activeStep, updateRadiusCircle]);
  
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
            if (!mapRef.current) return;
            
            if (!mapRef.current.isStyleLoaded()) {
              mapRef.current.once('style.load', updateMap);
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
        if (!mapRef.current) return;
        
        if (!mapRef.current.isStyleLoaded()) {
          mapRef.current.once('style.load', updateMap);
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
        
        // Also update after flyTo completes
        setTimeout(() => {
          if (mapRef.current && mapRef.current.isStyleLoaded()) {
            updateRadiusCircle(mapRef.current, lat, lng, radius);
          }
        }, 2100);
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
      quorum_type: rule.quorum_type || 'any',
      // Rate limiting
      max_executions_per_public_key: rule.max_executions_per_public_key || null,
      execution_time_window_seconds: rule.execution_time_window_seconds || null,
      // Time-based triggers
      min_location_duration_seconds: rule.min_location_duration_seconds || null,
      // Auto-deactivation
      auto_deactivate_on_balance_threshold: rule.auto_deactivate_on_balance_threshold || false,
      balance_threshold_xlm: rule.balance_threshold_xlm || null,
      balance_check_asset_address: rule.balance_check_asset_address || null,
      use_smart_wallet_balance: rule.use_smart_wallet_balance || false,
      // Submit read-only to ledger
      submit_readonly_to_ledger: rule.submit_readonly_to_ledger || false
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
        quorum_type: ruleForm.quorum_type,
        // Rate limiting
        max_executions_per_public_key: ruleForm.max_executions_per_public_key || null,
        execution_time_window_seconds: ruleForm.execution_time_window_seconds || null,
        // Time-based triggers
        min_location_duration_seconds: ruleForm.min_location_duration_seconds || null,
        // Auto-deactivation
        auto_deactivate_on_balance_threshold: ruleForm.auto_deactivate_on_balance_threshold || false,
        balance_threshold_xlm: ruleForm.balance_threshold_xlm || null,
        balance_check_asset_address: ruleForm.balance_check_asset_address || null,
        use_smart_wallet_balance: ruleForm.use_smart_wallet_balance || false,
        // Submit read-only to ledger
        submit_readonly_to_ledger: ruleForm.submit_readonly_to_ledger || false
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
        // Refresh tab counts
        loadPendingRules();
        loadCompletedRules();
        loadRejectedRules();
        // Dispatch event to notify WalletProviderDashboard to refresh contract rules
        window.dispatchEvent(new CustomEvent('contractRuleChanged'));
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
        // Refresh tab counts
        loadPendingRules();
        loadCompletedRules();
        loadRejectedRules();
        // Dispatch event to notify WalletProviderDashboard to refresh contract rules
        window.dispatchEvent(new CustomEvent('contractRuleChanged'));
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
        // Refresh tab counts
        loadPendingRules();
        loadCompletedRules();
        loadRejectedRules();
        // Dispatch event to notify WalletProviderDashboard to refresh contract rules
        window.dispatchEvent(new CustomEvent('contractRuleChanged'));
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
  const [executionResult, setExecutionResult] = useState(null); // Store execution result details
  const executionContentRef = useRef(null);
  const [paymentSource, setPaymentSource] = useState('wallet'); // 'wallet' or 'smart-wallet'
  // eslint-disable-next-line no-unused-vars
  const [vaultBalanceInXLM, setVaultBalanceInXLM] = useState(null); // Reserved for future use (vault balance display)
  // eslint-disable-next-line no-unused-vars
  const [userStake, setUserStake] = useState(null); // Reserved for future use
  // Note: executionStep is set but not currently displayed in UI
  // eslint-disable-next-line no-unused-vars
  const [executionStep, setExecutionStep] = useState(0);
  
  // Helper function to determine current execution step based on status
  const getExecutionStep = () => {
    if (!executingRule) return -1;
    const status = executionStatus.toLowerCase();
    if (status.includes('confirmed') || status.includes('success') || status.includes('complete')) return 5;
    if (status.includes('waiting') || status.includes('polling') || status.includes('confirmation')) return 4;
    if (status.includes('submitting') || status.includes('executing')) return 3;
    if (status.includes('signing')) return 2;
    if (status.includes('authenticating') || status.includes('passkey')) return 1;
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

  // Helper function to generate unique key for pending rules
  const getPendingRuleKey = useCallback((pendingRule, fallbackIndex = null) => {
    // Use update_id if available (most reliable), otherwise use provided index or find in array
    let identifier;
    if (pendingRule.update_id !== undefined && pendingRule.update_id !== null) {
      identifier = pendingRule.update_id;
    } else if (fallbackIndex !== null) {
      identifier = fallbackIndex;
    } else {
      // Find absolute index in full array, or use contract_id + matched_at as fallback
      const absoluteIndex = pendingRules.findIndex(pr => pr === pendingRule);
      if (absoluteIndex !== -1) {
        identifier = absoluteIndex;
      } else {
        // Last resort: use contract_id + matched_at for uniqueness
        const contractId = pendingRule.contract_id || 'unknown';
        const matchedAt = pendingRule.matched_at || 'no-time';
        identifier = `${contractId}_${matchedAt}`;
      }
    }
    
    return `${pendingRule.rule_id}_${pendingRule.matched_public_key || 'unknown'}_${identifier}`;
  }, [pendingRules]);

  // Calculate valid selection count (only count keys that exist in current pendingRules)
  const validSelectionCount = useMemo(() => {
    let count = 0;
    pendingRules.forEach((pr, index) => {
      const uniqueKey = getPendingRuleKey(pr, index);
      if (selectedPendingRules.has(uniqueKey)) {
        count++;
      }
    });
    return count;
  }, [pendingRules, selectedPendingRules, getPendingRuleKey]);

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

  // Fetch smart wallet balance when execute dialog opens for payment functions
  useEffect(() => {
    if (executeConfirmDialog.open && executeConfirmDialog.rule) {
      const rule = executeConfirmDialog.rule;
      const contract = contracts.find(c => c.id === rule.contract_id);
      let functionParams = {};
      try {
        functionParams = typeof rule.function_parameters === 'string'
          ? JSON.parse(rule.function_parameters)
          : rule.function_parameters || {};
      } catch (e) {
        // Ignore parse errors
      }
      
      const isPayment = isPaymentFunction(rule.function_name, functionParams);
      // Check if payment will route through smart wallet
      // Backend will use config fallback if smart_wallet_contract_id is null
      // So we show the option if use_smart_wallet is true and it's a payment function
      const willRouteThroughSmartWallet = contract?.use_smart_wallet && isPayment;
      
      if (isPayment && publicKey) {
        // Fetch smart wallet balance
        const fetchSmartWalletBalance = async () => {
          try {
            const response = await api.get('/smart-wallet/balance', {
              params: { userPublicKey: publicKey }
            });
            setUserStake(response.data.balanceInXLM);
          } catch (err) {
            console.error('Failed to fetch smart wallet balance:', err);
            setUserStake(null);
          }
        };
        
        const fetchVaultBalance = async () => {
          try {
            const response = await api.get('/smart-wallet/vault-balance');
            setVaultBalanceInXLM(response.data.balanceInXLM);
          } catch (err) {
            console.error('Failed to fetch vault balance:', err);
            setVaultBalanceInXLM(null);
          }
        };
        
        fetchSmartWalletBalance();
        if (willRouteThroughSmartWallet) {
          fetchVaultBalance();
        }
      } else {
        setUserStake(null);
        setVaultBalanceInXLM(null);
      }
      
      // Reset payment source to wallet by default
      // If contract uses smart wallet and this is a payment function, default to smart-wallet source
      const isPaymentFunc = isPaymentFunction(rule.function_name, functionParams) || 
                           rule.function_name.toLowerCase().includes('payment') ||
                           rule.function_name.toLowerCase().includes('transfer') ||
                           rule.function_name.toLowerCase().includes('send') ||
                           rule.function_name.toLowerCase().includes('pay');
      
      if (contract?.use_smart_wallet && isPaymentFunc) {
        setPaymentSource('smart-wallet');
        console.log('[ContractManagement] Auto-setting payment_source to smart-wallet for payment function with use_smart_wallet enabled');
      } else {
        setPaymentSource('wallet');
      }
    } else {
      setUserStake(null);
      setVaultBalanceInXLM(null);
      setPaymentSource('wallet');
    }
  }, [executeConfirmDialog.open, executeConfirmDialog.rule, contracts, publicKey]);

  const handleExecuteRule = async (rule, event) => {
    // Prevent double execution
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    // Check if already executing
    if (executingRule) {
      return;
    }

    // Skip confirmation dialog - go straight to execution
    setExecuteConfirmDialog({ open: true, rule });
    // Start execution immediately
    await handleConfirmExecute(rule);
  };

  const handleBatchExecuteSelected = async () => {
    console.log('[BatchExecute] handleBatchExecuteSelected called', {
      selectedCount: selectedPendingRules.size,
      batchExecuting,
      hasPublicKey: !!publicKey
    });
    
    if (selectedPendingRules.size === 0 || batchExecuting) {
      console.log('[BatchExecute] Early return:', { selectedCount: selectedPendingRules.size, batchExecuting });
      return;
    }

    if (!publicKey) {
      console.log('[BatchExecute] No public key - returning early');
      setError('Please connect your wallet first');
      return;
    }

    console.log('[BatchExecute] Public key check passed, getting selected rules...');
    // Get all selected pending rules
    const selectedRules = pendingRules.filter((pr, index) => {
      const uniqueKey = getPendingRuleKey(pr, index);
      return selectedPendingRules.has(uniqueKey);
    });

    if (selectedRules.length === 0) {
      setError('No rules selected');
      return;
    }

    // Check if any rule requires a secret key
    // Smart wallet payments need secret key even with WebAuthn (same as send payment)
    console.log('[BatchExecute] Checking for write operations...');
    const writeOperationsNeedingSecretKey = selectedRules.filter(pr => {
      const rule = rules.find(r => r.id === pr.rule_id);
      const contract = contracts.find(c => c.id === pr.contract_id);
      if (!rule) return false;
      
      const isReadOnly = isReadOnlyFunction(rule.function_name);
      if (isReadOnly) return false; // Read-only doesn't need secret key
      
      // Check if this is a smart wallet payment
      const isPayment = isPaymentFunction(rule.function_name, rule.function_parameters || {});
      const isSmartWalletPayment = contract?.use_smart_wallet && isPayment;
      
      // Smart wallet payments always need secret key (even with WebAuthn) - same as send payment
      if (isSmartWalletPayment) {
        return true; // Smart wallet payments need secret key
      }
      
      // For non-smart-wallet payments: If WebAuthn is available, we don't need secret key
      const needsWebAuthn = contract?.requires_webauthn || requiresWebAuthn(rule, contract);
      if (needsWebAuthn) return false; // WebAuthn will handle signing
      
      // Write operation without WebAuthn needs secret key
      return true;
    });
    
    console.log('[BatchExecute] Write operations needing secret key:', writeOperationsNeedingSecretKey.length);

    // Get secret key from various sources
    let userSecretKey = secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
    console.log('[BatchExecute] Secret key available:', !!userSecretKey);

    // Only require secret key if we have write operations that don't use WebAuthn
    if (writeOperationsNeedingSecretKey.length > 0 && !userSecretKey) {
      console.log('[BatchExecute] Secret key needed for non-WebAuthn write operations - showing dialog');
      setBatchSecretKeyDialogOpen(true);
      return;
    }

    // Proceed with execution (userSecretKey may be null if all operations use WebAuthn)
    await performBatchExecution(userSecretKey);
  };

  // Helper function to perform the actual batch execution
  const performBatchExecution = async (userSecretKey) => {
    console.log('[BatchExecute] performBatchExecution called with secret key:', !!userSecretKey);
    
    // Get all selected pending rules
    console.log('[BatchExecute] Filtering selected rules from', pendingRules.length, 'pending rules');
    console.log('[BatchExecute] Selected keys:', Array.from(selectedPendingRules));
    const selectedRules = pendingRules.filter((pr, index) => {
      const uniqueKey = getPendingRuleKey(pr, index);
      const isSelected = selectedPendingRules.has(uniqueKey);
      if (isSelected) {
        console.log('[BatchExecute] Found selected rule:', { rule_id: pr.rule_id, uniqueKey, index });
      }
      return isSelected;
    });

    console.log('[BatchExecute] Selected rules count:', selectedRules.length);
    if (selectedRules.length === 0) {
      console.log('[BatchExecute] No rules selected - returning early');
      setError('No rules selected');
      return;
    }

    setBatchExecuting(true);
    setBatchExecutionProgress({ current: 0, total: selectedRules.length, currentRule: null });
    setError('');
    setSuccess('');

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      console.log('[BatchExecute] Starting try block');
      
      // Get passkeys once for all rules that need WebAuthn
      let passkeys = [];
      let selectedPasskey = null;
      let passkeyPublicKeySPKI = null;
      let credentialId = null;

      // Check which rules need WebAuthn and prepare their authentication data upfront
      console.log('[BatchExecute] Checking which rules need WebAuthn...');
      const rulesNeedingWebAuthn = selectedRules.filter(pr => {
        const rule = rules.find(r => r.id === pr.rule_id);
        const contract = contracts.find(c => c.id === pr.contract_id);
        return contract?.requires_webauthn || (rule && requiresWebAuthn(rule, contract));
      });

      console.log('[BatchExecute] Rules needing WebAuthn:', rulesNeedingWebAuthn.length, 'out of', selectedRules.length);

      // Store authentication data for each rule that needs it (authenticate all upfront)
      const ruleAuthData = new Map(); // Map of rule_id -> webauthnData

      // If any rules need WebAuthn, authenticate ALL of them upfront (one prompt per rule, but all at once)
      if (rulesNeedingWebAuthn.length > 0) {
        console.log('[BatchExecute] Fetching passkeys...');
        // Get user's passkeys once
        const passkeysResponse = await api.get('/webauthn/passkeys');
        passkeys = passkeysResponse.data.passkeys || [];
        
        if (passkeys.length === 0) {
          setError('No passkey registered. Please register a passkey first.');
          setBatchExecuting(false);
          return;
        }

        // Use the passkey that's registered on the contract
        selectedPasskey = passkeys.find(p => p.isOnContract === true);
        if (!selectedPasskey) {
          // Try to auto-register the first available passkey
          console.warn('[ContractManagement] ⚠️ No passkey matches contract in batch execution, attempting auto-registration...');
          
          // Get secret key from various sources
          const availableSecretKey = secretKey || localStorage.getItem('stellar_secret_key');
          
          if (passkeys.length > 0 && availableSecretKey) {
            const firstPasskey = passkeys[0];
            const passkeyPublicKeySPKI = firstPasskey.publicKey || firstPasskey.public_key_spki;
            
            if (passkeyPublicKeySPKI) {
              try {
                setSuccess('Auto-registering passkey on contract...');
                console.log('[ContractManagement] 🔐 Attempting to auto-register passkey for batch execution...');
                
                const registerResponse = await api.post('/smart-wallet/register-signer', {
                  userPublicKey: publicKey,
                  userSecretKey: availableSecretKey,
                  passkeyPublicKeySPKI: passkeyPublicKeySPKI,
                  rpId: window.location.hostname
                });
                
                if (registerResponse.data.success) {
                  console.log('[ContractManagement] ✅ Passkey auto-registered successfully');
                  
                  // Wait a moment for the contract to update
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Re-fetch passkeys to get updated isOnContract status
                  const refreshedPasskeysResponse = await api.get('/webauthn/passkeys');
                  const refreshedPasskeys = refreshedPasskeysResponse.data.passkeys || [];
                  selectedPasskey = refreshedPasskeys.find(p => p.isOnContract === true);
                  
                  if (selectedPasskey) {
                    console.log('[ContractManagement] ✅ Found registered passkey, continuing batch execution...');
                    setSuccess('Passkey registered! Continuing with batch execution...');
                  } else {
                    throw new Error('Passkey registered but not found in refreshed list');
                  }
                } else {
                  throw new Error(registerResponse.data.error || 'Registration failed');
                }
              } catch (regError) {
                console.error('[ContractManagement] ❌ Auto-registration failed in batch execution:', regError);
                // Fall through to show helpful error message
              }
            }
          }
          
          // If auto-registration failed or no passkey available, show helpful error
          if (!selectedPasskey) {
            const errorMsg = `No passkey found that matches the one registered on the contract. ${passkeys.length > 0 ? 'Auto-registration failed. ' : ''}Please go to Settings > Passkeys to register or update your passkey.\n\nTo access: Click your profile menu (top right) → Settings → Passkeys`;
            console.error('[ContractManagement] ❌', errorMsg);
            setError(errorMsg);
            setBatchExecuting(false);
            return;
          }
        }

        credentialId = selectedPasskey.credentialId || selectedPasskey.credential_id;
        passkeyPublicKeySPKI = selectedPasskey.publicKey || selectedPasskey.public_key_spki;

        if (!credentialId || !passkeyPublicKeySPKI) {
          setError('Passkey data incomplete. Please ensure your passkey is properly registered.');
          setBatchExecuting(false);
          return;
        }

        // Show message to user
        if (rulesNeedingWebAuthn.length > 0) {
          setSuccess(`You will be asked to authenticate ${rulesNeedingWebAuthn.length} rule(s) with your passkey. Please approve each one to continue...`);
        }
        
        // Authenticate ALL rules upfront (user will see prompts for each, but all at once before execution)
        console.log('[BatchExecute] Authenticating all rules upfront...');
        let authProgress = 0;
        for (const pendingRule of rulesNeedingWebAuthn) {
          authProgress++;
          if (rulesNeedingWebAuthn.length > 1) {
            setSuccess(`Authenticating rule ${authProgress}/${rulesNeedingWebAuthn.length} - please approve with your passkey...`);
          }
          const rule = rules.find(r => r.id === pendingRule.rule_id);
          const contract = contracts.find(c => c.id === pendingRule.contract_id);
          
          if (!rule || !contract) continue;

          let functionParams = typeof rule.function_parameters === 'string'
            ? JSON.parse(rule.function_parameters)
            : rule.function_parameters || {};

          // Create rule-specific signature payload
          let signaturePayload;
          const isPaymentFunc = isPaymentFunction(rule.function_name, functionParams);
          const willRouteThroughSmartWallet = (paymentSource === 'smart-wallet') ||
                                             (contract?.use_smart_wallet && isPaymentFunc);

          if (isPaymentFunc || willRouteThroughSmartWallet || paymentSource === 'smart-wallet') {
            let destination = functionParams.destination || functionParams.recipient || functionParams.to || 
                            functionParams.to_address || functionParams.destination_address || '';
            // Check if destination is a placeholder or empty, and replace with matched_public_key if available
            const isPlaceholder = destination && (
              destination.includes('[Will be') || 
              destination.includes('system-generated') ||
              destination.trim() === ''
            );
            
            if ((!destination || isPlaceholder) && pendingRule.matched_public_key) {
              destination = pendingRule.matched_public_key;
            }
            let amount = functionParams.amount || functionParams.value || functionParams.quantity || '0';
            if (typeof amount === 'number' && amount < 1000000) {
              amount = Math.floor(amount * 10000000).toString();
            } else {
              amount = amount.toString();
            }
            let asset = functionParams.asset || functionParams.asset_address || functionParams.token || 'native';
            if (asset === 'XLM' || asset === 'native' || asset === 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC') {
              asset = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
            }

            const paymentData = {
              source: publicKey,
              destination: destination,
              amount: amount,
              asset: asset,
              memo: '',
              timestamp: Date.now()
            };
            signaturePayload = JSON.stringify(paymentData);
          } else {
            signaturePayload = functionParams.signature_payload || JSON.stringify({
              function: rule.function_name,
              contract_id: rule.contract_id,
              parameters: functionParams,
              timestamp: Date.now()
            });
          }

          try {
            console.log(`[BatchExecute] Authenticating rule ${rule.rule_name} upfront...`);
            const authResult = await webauthnService.authenticateWithPasskey(credentialId, signaturePayload);
            
            ruleAuthData.set(pendingRule.rule_id, {
              passkeyPublicKeySPKI,
              webauthnSignature: authResult.signature,
              webauthnAuthenticatorData: authResult.authenticatorData,
              webauthnClientData: authResult.clientDataJSON,
              signaturePayload
            });
            
            console.log(`[BatchExecute] Rule ${rule.rule_name} authenticated successfully`);
          } catch (err) {
            console.error(`[BatchExecute] Failed to authenticate rule ${rule.rule_name}:`, err);
            errors.push(`${rule.rule_name}: Authentication failed - ${err.message}`);
            failCount++;
          }
        }

        console.log('[BatchExecute] All authentications complete -', ruleAuthData.size, 'rules authenticated');
        if (ruleAuthData.size > 0) {
          setSuccess(`Authentication complete! Executing ${ruleAuthData.size} rule(s)...`);
          // Clear message after a moment
          setTimeout(() => setSuccess(''), 2000);
        }
      }

      // Validate secret key if provided
      if (userSecretKey && publicKey) {
        try {
          const StellarSdk = await import('@stellar/stellar-sdk');
          const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
          if (keypair.publicKey() !== publicKey) {
            setError('Secret key does not match the connected wallet. Please check your secret key.');
            setBatchExecuting(false);
            return;
          }
        } catch (err) {
          setError('Invalid secret key format. Please check your secret key.');
          setBatchExecuting(false);
          return;
        }
      }

      // Filter out rules that failed authentication during upfront phase
      const rulesToExecute = selectedRules.filter(pr => {
        const rule = rules.find(r => r.id === pr.rule_id);
        const contract = contracts.find(c => c.id === pr.contract_id);
        const needsWebAuthn = contract?.requires_webauthn || (rule && requiresWebAuthn(rule, contract));
        
        // If rule needs WebAuthn but doesn't have auth data, skip it (already failed)
        if (needsWebAuthn && !ruleAuthData.has(pr.rule_id)) {
          console.log(`[BatchExecute] Skipping rule ${pr.rule_id} - authentication failed during upfront phase`);
          return false;
        }
        return true;
      });

      console.log('[BatchExecute] Rules to execute after filtering:', rulesToExecute.length, 'out of', selectedRules.length);

      // Execute each rule sequentially using pre-authenticated data
      console.log('[BatchExecute] Starting execution loop for', rulesToExecute.length, 'rules');
      for (let i = 0; i < rulesToExecute.length; i++) {
        const pendingRule = rulesToExecute[i];
        console.log(`[BatchExecute] Processing rule ${i + 1}/${rulesToExecute.length}:`, {
          pending_rule_id: pendingRule.rule_id,
          contract_id: pendingRule.contract_id,
          matched_key: pendingRule.matched_public_key?.substring(0, 8) + '...'
        });
        
        const rule = rules.find(r => r.id === pendingRule.rule_id);
        const contract = contracts.find(c => c.id === pendingRule.contract_id);
        
        if (!rule || !contract) {
          console.warn(`[BatchExecute] Rule or contract not found:`, {
            rule_found: !!rule,
            contract_found: !!contract,
            pending_rule_id: pendingRule.rule_id,
            contract_id: pendingRule.contract_id
          });
          errors.push(`Rule ${pendingRule.rule_name || pendingRule.rule_id} not found`);
          failCount++;
          continue;
        }

        // Merge matched_public_key and update_id into rule
        const ruleWithMatchedKey = {
          ...rule,
          matched_public_key: pendingRule.matched_public_key,
          update_id: pendingRule.update_id // Include update_id to mark only the specific location update as completed
        };

        console.log(`[BatchExecute] About to execute rule:`, {
          rule_id: rule.id,
          rule_name: rule.rule_name,
          function_name: rule.function_name,
          contract_id: contract.id,
          has_secret_key: !!userSecretKey,
          has_rule_auth: !!ruleAuthData.get(pendingRule.rule_id)
        });

        setBatchExecutionProgress({
          current: i + 1,
          total: rulesToExecute.length,
          currentRule: pendingRule
        });

        try {
          // Get pre-authenticated data for this rule (if it needed WebAuthn)
          const ruleAuth = ruleAuthData.get(pendingRule.rule_id);
          
          // Execute the rule using pre-authenticated data (no authentication needed during execution)
          console.log(`[BatchExecute] Calling handleConfirmExecuteBatch for rule ${rule.rule_name}`);
          await handleConfirmExecuteBatch(
            ruleWithMatchedKey, 
            contract, 
            userSecretKey, 
            ruleAuth // Pass pre-authenticated data for this specific rule (null if not needed)
          );
          console.log(`[BatchExecute] Successfully executed rule ${rule.rule_name}`);
          successCount++;
          
          // Small delay between executions
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`[BatchExecute] Error executing rule ${rule.rule_name}:`, err);
          console.error(`[BatchExecute] Error stack:`, err.stack);
          errors.push(`${rule.rule_name}: ${err.message || 'Execution failed'}`);
          failCount++;
        }
      }
      
      console.log('[BatchExecute] Execution loop complete:', {
        successCount,
        failCount,
        total: selectedRules.length
      });

      // Show final results
      let resultMessage = `Batch execution complete: ${successCount} succeeded`;
      if (failCount > 0) {
        resultMessage += `, ${failCount} failed`;
      }
      if (errors.length > 0) {
        resultMessage += `\n\nErrors:\n${errors.join('\n')}`;
      }
      
      if (successCount > 0) {
        setSuccess(resultMessage);
        setTimeout(() => setSuccess(''), 10000);
      } else {
        setError(resultMessage);
      }

      // Reload pending and completed rules
      await Promise.all([
        loadPendingRules(),
        loadCompletedRules()
      ]);

      // Clear selection
      setSelectedPendingRules(new Set());
    } catch (err) {
      console.error('[BatchExecute] Fatal error:', err);
      setError(`Batch execution failed: ${err.message || 'Unknown error'}`);
    } finally {
      setBatchExecuting(false);
      setBatchExecutionProgress({ current: 0, total: 0, currentRule: null });
    }
  };

  const handleBatchSecretKeyConfirm = async () => {
    const enteredSecretKey = batchSecretKeyInput.trim();
    if (!enteredSecretKey) {
      setError('Please enter your secret key');
      return;
    }

    // Validate secret key format and match with public key
    if (publicKey) {
      try {
        const StellarSdk = await import('@stellar/stellar-sdk');
        const keypair = StellarSdk.Keypair.fromSecret(enteredSecretKey);
        if (keypair.publicKey() !== publicKey) {
          setError('Secret key does not match the connected wallet. Please check your secret key.');
          return;
        }
      } catch (err) {
        setError('Invalid secret key format. Please check your secret key.');
        return;
      }
    }

    // Close dialog and continue execution
    setBatchSecretKeyDialogOpen(false);
    setBatchSecretKeyInput('');
    
    // Continue with batch execution using the entered secret key
    await performBatchExecution(enteredSecretKey);
  };

  const handleBatchSecretKeyCancel = () => {
    setBatchSecretKeyDialogOpen(false);
    setBatchSecretKeyInput('');
    setError('');
  };

  const handleConfirmExecuteBatch = async (rule, contract, userSecretKey, ruleAuth) => {
    // This is a simplified version of handleConfirmExecute for batch execution
    // It uses pre-authenticated data that was done upfront, so no authentication needed during execution
    
    console.log('[BatchExecute] handleConfirmExecuteBatch called with:', {
      rule_id: rule?.id,
      rule_name: rule?.rule_name,
      function_name: rule?.function_name,
      contract_id: contract?.id,
      has_secret_key: !!userSecretKey,
      has_rule_auth: !!ruleAuth
    });
    
    const isReadOnly = isReadOnlyFunction(rule.function_name);
    console.log('[BatchExecute] Function type check:', { function_name: rule.function_name, isReadOnly });
    let functionParams = typeof rule.function_parameters === 'string'
      ? JSON.parse(rule.function_parameters)
      : rule.function_parameters || {};

    const needsWebAuthn = contract?.requires_webauthn || requiresWebAuthn(rule, contract);

    // For write operations, secret key is only required if WebAuthn is not available
    if (!isReadOnly && !needsWebAuthn && !userSecretKey) {
      throw new Error('Secret key is required for executing write operations without WebAuthn');
    }

    let webauthnData = null;

    // Use pre-authenticated data if WebAuthn is needed (already authenticated upfront)
    if (needsWebAuthn) {
      if (!ruleAuth) {
        throw new Error('WebAuthn required but authentication data not available for this rule');
      }

      // Use the pre-authenticated data (no need to authenticate again)
      webauthnData = {
        passkeyPublicKeySPKI: ruleAuth.passkeyPublicKeySPKI,
        webauthnSignature: ruleAuth.webauthnSignature,
        webauthnAuthenticatorData: ruleAuth.webauthnAuthenticatorData,
        webauthnClientData: ruleAuth.webauthnClientData,
        signaturePayload: ruleAuth.signaturePayload // Use the payload that was signed
      };

      functionParams = {
        ...functionParams,
        signature_payload: ruleAuth.signaturePayload,
        webauthn_signature: ruleAuth.webauthnSignature,
        webauthn_authenticator_data: ruleAuth.webauthnAuthenticatorData,
        webauthn_client_data: ruleAuth.webauthnClientData
      };
    }

    // Execute the rule - use contract ID, not rule ID
    const isPayment = isPaymentFunction(rule.function_name, functionParams);
    
    // Check if this should route through smart wallet
    // For batch execution, determine based on contract settings (not user selection)
    const shouldRouteThroughSmartWallet = contract?.use_smart_wallet && isPayment;
    
    if (isPayment && shouldRouteThroughSmartWallet) {
      // Handle smart wallet payment execution
      let destination = functionParams.destination || functionParams.recipient || functionParams.to || functionParams.to_address || functionParams.destination_address || '';
      
      // Check if destination is a placeholder or empty, and replace with matched_public_key if available
      const isPlaceholder = destination && (
        destination.includes('[Will be') || 
        destination.includes('system-generated') ||
        destination.trim() === ''
      );
      
      if ((!destination || isPlaceholder) && rule.matched_public_key) {
        destination = rule.matched_public_key;
        console.log('[BatchExecute] Using matched_public_key as destination:', destination.substring(0, 8) + '...');
      }
      
      let amount = functionParams.amount || functionParams.value || functionParams.quantity || '';
      if (functionParams.signature_payload) {
        try {
          const payload = typeof functionParams.signature_payload === 'string' 
            ? JSON.parse(functionParams.signature_payload) 
            : functionParams.signature_payload;
          // Only use payload.destination if it's not a placeholder and destination is still empty or a placeholder
          if (payload.destination && 
              !payload.destination.includes('[Will be') && 
              !payload.destination.includes('system-generated') &&
              (!destination || isPlaceholder)) {
            destination = payload.destination;
          }
          if (payload.amount && !amount) {
            const amountNum = parseFloat(payload.amount);
            amount = amountNum >= 1000000 ? (amountNum / 10000000).toString() : payload.amount;
          }
        } catch (e) {
          console.warn('[BatchExecute] Could not parse signature_payload:', e);
        }
      }
      
      if (!destination || !amount) {
        throw new Error('Payment destination and amount are required');
      }
      
      const asset = functionParams.asset || functionParams.asset_address || functionParams.token || 'XLM';
      const amountInStroops = (parseFloat(amount) * 10000000).toString();
      
      // Use pre-authenticated data for smart wallet (already authenticated upfront)
      if (!webauthnData && ruleAuth) {
        // Use the pre-authenticated data (no need to authenticate again)
        webauthnData = {
          passkeyPublicKeySPKI: ruleAuth.passkeyPublicKeySPKI,
          webauthnSignature: ruleAuth.webauthnSignature,
          webauthnAuthenticatorData: ruleAuth.webauthnAuthenticatorData,
          webauthnClientData: ruleAuth.webauthnClientData,
          signaturePayload: ruleAuth.signaturePayload // Use the payload that was signed
        };
      }
      
      if (!userSecretKey) {
        throw new Error('Secret key is required for smart wallet payments');
      }
      
      if (!webauthnData) {
        throw new Error('WebAuthn authentication is required for smart wallet payments');
      }
      
      // Call smart wallet endpoint
      // Only include update_id and matched_public_key if they are defined and valid
      const requestBody = {
        userPublicKey: publicKey,
        userSecretKey: userSecretKey,
        destinationAddress: destination,
        amount: amountInStroops,
        assetAddress: asset === 'XLM' ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' : asset,
        signaturePayload: webauthnData.signaturePayload,
        passkeyPublicKeySPKI: webauthnData.passkeyPublicKeySPKI,
        webauthnSignature: webauthnData.webauthnSignature,
        webauthnAuthenticatorData: webauthnData.webauthnAuthenticatorData,
        webauthnClientData: webauthnData.webauthnClientData,
        rule_id: rule.id
      };
      
      // Only add optional parameters if they are defined and valid
      if (rule.update_id && !isNaN(parseInt(rule.update_id))) {
        requestBody.update_id = parseInt(rule.update_id);
      }
      if (rule.matched_public_key && typeof rule.matched_public_key === 'string' && rule.matched_public_key.trim() !== '') {
        requestBody.matched_public_key = rule.matched_public_key;
      }
      
      const response = await api.post('/smart-wallet/execute-payment', requestBody);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Smart wallet payment failed');
      }
      
      // Mark as completed
      if (rule.matched_public_key) {
        try {
          await api.post(`/contracts/rules/pending/${rule.id}/complete`, {
            matched_public_key: rule.matched_public_key,
            transaction_hash: response.data.hash,
            update_id: rule.update_id // Include update_id to mark only the specific location update as completed
          });
        } catch (e) {
          console.warn('[BatchExecute] Could not mark rule as completed:', e);
        }
      }
      
      return; // Success for smart wallet payment
    }
    
    // Regular contract execution
    const submitToLedger = !isReadOnly || !!userSecretKey;

    // Validate required fields
    if (!rule.function_name) {
      throw new Error('Function name is required');
    }
    if (!publicKey) {
      throw new Error('User public key is required');
    }
    if (!rule.contract_id) {
      throw new Error('Contract ID is required');
    }

    // For write operations, secret key is required only if WebAuthn is not being used
    if (!isReadOnly && !needsWebAuthn && !userSecretKey) {
      throw new Error('Secret key is required for executing write operations without WebAuthn');
    }

    const executePayload = {
      function_name: rule.function_name,
      parameters: functionParams || {}, // Ensure parameters is always an object
      user_public_key: publicKey,
      submit_to_ledger: submitToLedger,
      rule_id: rule.id,
      update_id: rule.update_id, // Include update_id to mark only the specific location update as completed
      matched_public_key: rule.matched_public_key // Include matched_public_key for additional filtering
    };

    // Include secret_key (required for write operations without WebAuthn, optional for read-only)
    // Backend will validate this, but we include it if available
    if (userSecretKey) {
      executePayload.user_secret_key = userSecretKey;
    } else if (!isReadOnly && !needsWebAuthn) {
      // This should have been caught above, but double-check
      throw new Error('Secret key is required for write operations without WebAuthn');
    }

    // Include payment_source only if it's a payment function
    // For batch execution, determine based on contract settings
    if (isPayment) {
      executePayload.payment_source = shouldRouteThroughSmartWallet ? 'smart-wallet' : 'wallet';
    }

    console.log('[BatchExecute] Executing rule:', {
      rule_id: rule.id,
      rule_name: rule.rule_name,
      function_name: rule.function_name,
      contract_id: rule.contract_id,
      isReadOnly,
      hasSecretKey: !!userSecretKey,
      hasWebAuthn: !!webauthnData,
      payload_keys: Object.keys(executePayload)
    });

    // Include WebAuthn data if available
    if (webauthnData) {
      executePayload.passkeyPublicKeySPKI = webauthnData.passkeyPublicKeySPKI;
      executePayload.webauthnSignature = webauthnData.webauthnSignature;
      executePayload.webauthnAuthenticatorData = webauthnData.webauthnAuthenticatorData;
      executePayload.webauthnClientData = webauthnData.webauthnClientData;
      executePayload.signaturePayload = webauthnData.signaturePayload;
    }

    // Use contract ID, not rule ID
    let response;
    try {
      console.log('[BatchExecute] Sending request to backend:', {
        url: `/contracts/${rule.contract_id}/execute`,
        payload_keys: Object.keys(executePayload),
        has_function_name: !!executePayload.function_name,
        has_user_public_key: !!executePayload.user_public_key,
        has_user_secret_key: !!executePayload.user_secret_key,
        has_webauthn: !!webauthnData,
        has_passkeyPublicKeySPKI: !!executePayload.passkeyPublicKeySPKI,
        has_webauthnSignature: !!executePayload.webauthnSignature,
        has_webauthnAuthenticatorData: !!executePayload.webauthnAuthenticatorData,
        has_webauthnClientData: !!executePayload.webauthnClientData,
        isReadOnly,
        needsWebAuthn
      });
      response = await api.post(`/contracts/${rule.contract_id}/execute`, executePayload);
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Execution failed';
      const errorDetails = error.response?.data || {};
      console.error('[BatchExecute] API error:', {
        status: error.response?.status,
        error: errorMessage,
        details: errorDetails,
        payload: {
          function_name: executePayload.function_name,
          contract_id: rule.contract_id,
          has_secret_key: !!executePayload.user_secret_key,
          has_webauthn: !!webauthnData,
          has_passkeyPublicKeySPKI: !!executePayload.passkeyPublicKeySPKI,
          has_webauthnSignature: !!executePayload.webauthnSignature,
          has_webauthnAuthenticatorData: !!executePayload.webauthnAuthenticatorData,
          has_webauthnClientData: !!executePayload.webauthnClientData,
          isReadOnly,
          needsWebAuthn
        }
      });
      throw new Error(`${errorMessage}${error.response?.status ? ` (Status: ${error.response.status})` : ''}`);
    }

    if (!response.data.success) {
      const errorMsg = response.data.error || 'Execution failed';
      console.error('[BatchExecute] Execution failed:', {
        rule_id: rule.id,
        rule_name: rule.rule_name,
        error: errorMsg,
        response: response.data
      });
      throw new Error(errorMsg);
    }

    // Mark as completed if it was a pending rule
    if (rule.matched_public_key) {
      try {
        await api.post(`/contracts/rules/pending/${rule.id}/complete`, {
          matched_public_key: rule.matched_public_key,
          transaction_hash: response.data.transaction_hash,
          update_id: rule.update_id // Include update_id to mark only the specific location update as completed
        });
      } catch (e) {
        console.warn('[BatchExecute] Could not mark rule as completed:', e);
      }
    }
  };

  const handleConfirmExecute = async (ruleParam = null) => {
    const rule = ruleParam || executeConfirmDialog.rule;
    if (!rule) {
      setExecuteConfirmDialog({ open: false, rule: null });
      setSecretKeyInput('');
      return;
    }
    
    // Ensure dialog is open
    if (!executeConfirmDialog.open && !ruleParam) {
      setExecuteConfirmDialog({ open: true, rule });
    }

    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    const contract = contracts.find(c => c.id === rule.contract_id);
    const isReadOnly = isReadOnlyFunction(rule.function_name);
    
    // Keep confirmation dialog open to show execution steps
    // Don't close it - it will show the execution progress
    setExecutingRule(true);
      try {
      let functionParams = typeof rule.function_parameters === 'string'
        ? JSON.parse(rule.function_parameters)
        : rule.function_parameters || {};

      // Check if payment will route through smart wallet
      // If payment source is smart-wallet, always route through smart wallet
      // Otherwise, check contract settings
      // Check if payment will route through smart wallet
      // Backend will use config fallback if smart_wallet_contract_id is null
      // So we check use_smart_wallet and payment function, not smart_wallet_contract_id
      const willRouteThroughSmartWallet = (paymentSource === 'smart-wallet') ||
                                         (contract?.use_smart_wallet && 
                                          isPaymentFunction(rule.function_name, functionParams));

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

        // IMPORTANT: Use the passkey that's registered on the contract, not just the first one
        // The contract stores only ONE passkey per public_key, so we must use the one that's on the contract
        let selectedPasskey = passkeys.find(p => p.isOnContract === true);
        
        if (!selectedPasskey) {
          // No passkey matches the contract - try to auto-register the first available passkey
          console.warn('[ContractManagement] ⚠️ No passkey matches contract, attempting auto-registration...');
          
          // Get secret key from various sources (same logic as used later in the function)
          const availableSecretKey = userSecretKey || secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
          
          if (passkeys.length > 0 && availableSecretKey) {
            const firstPasskey = passkeys[0];
            const passkeyPublicKeySPKI = firstPasskey.publicKey || firstPasskey.public_key_spki;
            
            if (passkeyPublicKeySPKI) {
              try {
                setExecutionStatus('Auto-registering passkey on contract...');
                console.log('[ContractManagement] 🔐 Attempting to auto-register passkey on contract...');
                
                const registerResponse = await api.post('/smart-wallet/register-signer', {
                  userPublicKey: publicKey,
                  userSecretKey: availableSecretKey,
                  passkeyPublicKeySPKI: passkeyPublicKeySPKI,
                  rpId: window.location.hostname
                });
                
                if (registerResponse.data.success) {
                  console.log('[ContractManagement] ✅ Passkey auto-registered successfully');
                  setExecutionStatus('Passkey registered! Refreshing passkeys...');
                  
                  // Wait a moment for the contract to update
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Re-fetch passkeys to get updated isOnContract status
                  const refreshedPasskeysResponse = await api.get('/webauthn/passkeys');
                  const refreshedPasskeys = refreshedPasskeysResponse.data.passkeys || [];
                  selectedPasskey = refreshedPasskeys.find(p => p.isOnContract === true);
                  
                  if (selectedPasskey) {
                    console.log('[ContractManagement] ✅ Found registered passkey, continuing execution...');
                    setExecutionStatus('Passkey registered! Continuing execution...');
                  } else {
                    throw new Error('Passkey registered but not found in refreshed list');
                  }
                } else {
                  throw new Error(registerResponse.data.error || 'Registration failed');
                }
              } catch (regError) {
                console.error('[ContractManagement] ❌ Auto-registration failed:', regError);
                // Fall through to show helpful error message
              }
            }
          }
          
          // If auto-registration failed or no passkey available, show helpful error
          if (!selectedPasskey) {
            const errorMsg = passkeysResponse.data.contractPasskeyHex
              ? `No passkey found that matches the one registered on the contract. ${passkeys.length > 0 ? 'Auto-registration failed. ' : ''}Please go to Settings > Passkeys to register or update your passkey.\n\nTo access: Click your profile menu (top right) → Settings → Passkeys`
              : `No passkey found that is registered on the contract. ${passkeys.length > 0 ? 'Auto-registration failed. ' : ''}Please go to Settings > Passkeys to register a passkey.\n\nTo access: Click your profile menu (top right) → Settings → Passkeys`;
            console.error('[ContractManagement] ❌', errorMsg);
            console.error('[ContractManagement] Available passkeys:', passkeys.map(p => ({
              credentialId: p.credentialId || p.credential_id,
              isOnContract: p.isOnContract
            })));
            setError(errorMsg);
            setExecutingRule(false);
            return;
          }
        }
        
        console.log('[ContractManagement] ✅ Using passkey that matches contract:', {
          credentialId: selectedPasskey.credentialId || selectedPasskey.credential_id,
          isOnContract: selectedPasskey.isOnContract,
          hasPublicKey: !!(selectedPasskey.publicKey || selectedPasskey.public_key_spki)
        });
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

        // If this is a payment function and payment source is wallet, we might need to handle it differently
        // For now, if paymentSource is 'wallet' and it's a payment function, we still execute through the contract
        // but the contract should handle routing based on use_smart_wallet setting
        
        // Create signature payload from function parameters
        // For payment functions (especially those requiring WebAuthn), ALWAYS use the new format
        // Format: {source, destination, amount, asset, memo, timestamp}
        // This matches the format expected by the smart wallet contract
        let signaturePayload;
        
        // Check if this is a payment function
        const isPaymentFunc = isPaymentFunction(rule.function_name, functionParams) || 
                             rule.function_name.toLowerCase().includes('payment') ||
                             rule.function_name.toLowerCase().includes('transfer') ||
                             rule.function_name.toLowerCase().includes('send') ||
                             rule.function_name.toLowerCase().includes('pay');
        
        if (isPaymentFunc || willRouteThroughSmartWallet || paymentSource === 'smart-wallet') {
          // For payment functions, create signature payload in the format expected by the smart wallet contract
          // Format: {source, destination, amount, asset, memo, timestamp}
          // This matches the format used in SendPayment component
          // IMPORTANT: For pending rules, use matched_public_key as destination if available
          // The backend will set destination from matched_public_key, so the signature must match
          let destination = functionParams.destination || functionParams.recipient || functionParams.to || functionParams.to_address || functionParams.destination_address || '';
          
          // Check if destination is a placeholder or empty, and replace with matched_public_key if available
          const isPlaceholder = destination && (
            destination.includes('[Will be') || 
            destination.includes('system-generated') ||
            destination.trim() === ''
          );
          
          // If destination is empty or a placeholder and this is a pending rule, check if matched_public_key is available
          // This ensures the signature payload matches what the backend will use
          if ((!destination || isPlaceholder) && rule.matched_public_key) {
            destination = rule.matched_public_key;
            console.log('[ContractManagement] Using matched_public_key as destination for signature payload:', destination.substring(0, 8) + '...');
          }
          
          // If still empty, log a warning
          if (!destination) {
            console.warn('[ContractManagement] ⚠️ Destination is empty for payment function - signature verification may fail');
          }
          let amount = functionParams.amount || functionParams.value || functionParams.quantity || '0';
          // Convert to stroops if it's a small number (assume XLM)
          if (typeof amount === 'number' && amount < 1000000) {
            amount = Math.floor(amount * 10000000).toString();
          } else {
            amount = amount.toString();
          }
          let asset = functionParams.asset || functionParams.asset_address || functionParams.token || 'native';
          // Convert XLM/native to contract address
          if (asset === 'XLM' || asset === 'native' || asset === 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC') {
            asset = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
          }
          
          // ALWAYS regenerate signature payload for payment functions to ensure correct format
          // The old format payload from functionParams should NOT be used
          // Format must be: {source, destination, amount, asset, memo, timestamp}
          console.log('[ContractManagement] Regenerating signature payload for payment function');
          console.log('[ContractManagement] Old payload (if exists):', functionParams.signature_payload ? (functionParams.signature_payload.length > 100 ? functionParams.signature_payload.substring(0, 100) + '...' : functionParams.signature_payload) : 'none');
          
          const paymentData = {
            source: publicKey, // User's public key (source of payment)
            destination: destination,
            amount: amount,
            asset: asset,
            memo: '', // Empty memo for contract execution
            timestamp: Date.now()
          };
          signaturePayload = JSON.stringify(paymentData);
          console.log('[ContractManagement] Regenerated payload:', signaturePayload);
        } else {
          // For regular (non-payment) functions, use existing logic
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
        // IMPORTANT: Use the regenerated signaturePayload (not the old one from functionParams)
        console.log('[ContractManagement] Using regenerated signaturePayload:', signaturePayload ? (signaturePayload.length > 100 ? signaturePayload.substring(0, 100) + '...' : signaturePayload) : 'undefined');
        webauthnData = {
          passkeyPublicKeySPKI,
          webauthnSignature: authResult.signature,
          webauthnAuthenticatorData: authResult.authenticatorData,
          webauthnClientData: authResult.clientDataJSON,
          signaturePayload // This should be the regenerated payload in correct format
        };

        // Update function parameters with WebAuthn data
        // Use the regenerated signaturePayload, not the old one
        functionParams = {
          ...functionParams,
          signature_payload: signaturePayload, // Use regenerated payload
          webauthn_signature: authResult.signature,
          webauthn_authenticator_data: authResult.authenticatorData,
          webauthn_client_data: authResult.clientDataJSON
        };
        
        console.log('[ContractManagement] Updated functionParams.signature_payload:', functionParams.signature_payload ? (functionParams.signature_payload.length > 100 ? functionParams.signature_payload.substring(0, 100) + '...' : functionParams.signature_payload) : 'undefined');
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

      // If this is a payment function and payment source is smart-wallet, call smart wallet endpoint directly
      const isPayment = isPaymentFunction(rule.function_name, functionParams);
      if (isPayment && paymentSource === 'smart-wallet') {
        console.log('[ContractManagement] Extracting payment parameters for smart wallet execution:', {
          functionParams,
          ruleMatchedPublicKey: rule.matched_public_key,
          hasSignaturePayload: !!functionParams.signature_payload
        });
        
        // Extract payment parameters - check signature_payload first if destination/amount are empty
        let destination = functionParams.destination || functionParams.recipient || functionParams.to || functionParams.to_address || functionParams.destination_address || '';
        let amount = functionParams.amount || functionParams.value || functionParams.quantity || '';
        
        // Check if destination is a placeholder
        const isPlaceholder = destination && (
          destination.includes('[Will be') || 
          destination.includes('system-generated') ||
          destination.trim() === ''
        );
        
        // If destination is empty or a placeholder, try to extract from signature_payload (for pending rules)
        if ((!destination || isPlaceholder) && functionParams.signature_payload) {
          try {
            const payload = typeof functionParams.signature_payload === 'string' 
              ? JSON.parse(functionParams.signature_payload) 
              : functionParams.signature_payload;
            if (payload.destination && !payload.destination.includes('[Will be') && !payload.destination.includes('system-generated')) {
              destination = payload.destination;
              console.log('[ContractManagement] ✅ Extracted destination from signature_payload:', destination.substring(0, 8) + '...');
            }
          } catch (e) {
            console.warn('[ContractManagement] ⚠️ Could not parse signature_payload:', e.message);
          }
        }
        
        // If destination is still empty or a placeholder, check matched_public_key (for pending rules)
        if ((!destination || isPlaceholder) && rule.matched_public_key) {
          destination = rule.matched_public_key;
          console.log('[ContractManagement] ✅ Using matched_public_key as destination:', destination.substring(0, 8) + '...');
        }
        
        // If amount is empty, try to extract from signature_payload
        if (!amount && functionParams.signature_payload) {
          try {
            const payload = typeof functionParams.signature_payload === 'string' 
              ? JSON.parse(functionParams.signature_payload) 
              : functionParams.signature_payload;
            if (payload.amount) {
              // Convert from stroops to XLM if needed
              const amountNum = parseFloat(payload.amount);
              amount = amountNum >= 1000000 ? (amountNum / 10000000).toString() : payload.amount;
              console.log('[ContractManagement] ✅ Extracted amount from signature_payload:', amount);
            }
          } catch (e) {
            console.warn('[ContractManagement] ⚠️ Could not parse signature_payload:', e.message);
          }
        }
        
        const asset = functionParams.asset || functionParams.asset_address || functionParams.token || 'XLM';
        const memo = functionParams.memo || '';
        
        console.log('[ContractManagement] Final payment parameters:', {
          destination: destination ? destination.substring(0, 8) + '...' : 'MISSING',
          amount: amount || 'MISSING',
          asset,
          userStake: userStake ? parseFloat(userStake).toFixed(7) : '0'
        });
        
        if (!destination || !amount) {
          setError(`Payment destination and amount are required. 
            Destination: ${destination ? 'Found' : 'Missing'}
            Amount: ${amount ? 'Found' : 'Missing'}
            Please ensure the rule has destination and amount parameters set, or they are in the signature_payload.`);
          setExecutingRule(false);
          return;
        }
        
        // Validate amount against user stake
        const amountNum = parseFloat(amount);
        const userStakeNum = userStake ? parseFloat(userStake.toString()) : 0;
        
        if (userStakeNum <= 0) {
          setError('You have no stake in the smart wallet contract. Please deposit funds first.');
          setExecutingRule(false);
          return;
        }
        
        if (amountNum > userStakeNum) {
          setError(`Insufficient stake. You have ${userStakeNum.toFixed(7)} XLM stake, but trying to send ${amountNum.toFixed(7)} XLM.`);
          setExecutingRule(false);
          return;
        }
        
        // Convert amount to stroops
        const amountInStroops = (parseFloat(amount) * 10000000).toString();
        
        // Get passkeys if not already done
        if (!webauthnData) {
          setExecutionStatus('Getting passkeys...');
          setExecutionStep(1);
          
          const passkeysResponse = await api.get('/webauthn/passkeys');
          const passkeys = passkeysResponse.data.passkeys || [];
          
          if (passkeys.length === 0) {
            setError('No passkey registered. Please register a passkey first.');
            setExecutingRule(false);
            return;
          }
          
          // IMPORTANT: Use the passkey that's registered on the contract
          // The contract stores only ONE passkey per public_key, so we must use the one that's on the contract
          let selectedPasskey = passkeys.find(p => p.isOnContract === true);
          if (!selectedPasskey) {
            // Try to auto-register the first available passkey
            console.warn('[ContractManagement] ⚠️ No passkey matches contract in smart wallet payment, attempting auto-registration...');
            
            // Get secret key from various sources
            const currentPublicKey = publicKey || localStorage.getItem('stellar_public_key');
            const availableSecretKey = userSecretKey || secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
            
            if (passkeys.length > 0 && availableSecretKey) {
              const firstPasskey = passkeys[0];
              const passkeyPublicKeySPKI = firstPasskey.publicKey || firstPasskey.public_key_spki;
              
              if (passkeyPublicKeySPKI) {
                try {
                  setExecutionStatus('Auto-registering passkey on contract...');
                  console.log('[ContractManagement] 🔐 Attempting to auto-register passkey for smart wallet payment...');
                  
                  const registerResponse = await api.post('/smart-wallet/register-signer', {
                    userPublicKey: currentPublicKey,
                    userSecretKey: availableSecretKey,
                    passkeyPublicKeySPKI: passkeyPublicKeySPKI,
                    rpId: window.location.hostname
                  });
                  
                  if (registerResponse.data.success) {
                    console.log('[ContractManagement] ✅ Passkey auto-registered successfully');
                    setExecutionStatus('Passkey registered! Refreshing passkeys...');
                    
                    // Wait a moment for the contract to update
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Re-fetch passkeys to get updated isOnContract status
                    const refreshedPasskeysResponse = await api.get('/webauthn/passkeys');
                    const refreshedPasskeys = refreshedPasskeysResponse.data.passkeys || [];
                    selectedPasskey = refreshedPasskeys.find(p => p.isOnContract === true);
                    
                    if (selectedPasskey) {
                      console.log('[ContractManagement] ✅ Found registered passkey, continuing smart wallet payment...');
                      setExecutionStatus('Passkey registered! Continuing payment...');
                    } else {
                      throw new Error('Passkey registered but not found in refreshed list');
                    }
                  } else {
                    throw new Error(registerResponse.data.error || 'Registration failed');
                  }
                } catch (regError) {
                  console.error('[ContractManagement] ❌ Auto-registration failed in smart wallet payment:', regError);
                  // Fall through to show helpful error message
                }
              }
            }
            
            // If auto-registration failed or no passkey available, show helpful error
            if (!selectedPasskey) {
              const errorMsg = `No passkey found that matches the one registered on the contract. ${passkeys.length > 0 ? 'Auto-registration failed. ' : ''}Please go to Settings > Passkeys to register or update your passkey.\n\nTo access: Click your profile menu (top right) → Settings → Passkeys`;
              console.error('[ContractManagement] ❌', errorMsg);
              setError(errorMsg);
              setExecutingRule(false);
              return;
            }
          }
          
          const credentialId = selectedPasskey.credentialId || selectedPasskey.credential_id;
          const passkeyPublicKeySPKI = selectedPasskey.publicKey || selectedPasskey.public_key_spki;
          
          if (!credentialId || !passkeyPublicKeySPKI) {
            setError('Passkey data incomplete. Please ensure your passkey is properly registered.');
            setExecutingRule(false);
            return;
          }
          
          console.log('[ContractManagement] Using passkey for smart wallet payment:', {
            credentialId: credentialId.substring(0, 16) + '...',
            isOnContract: selectedPasskey.isOnContract,
            hasPublicKey: !!passkeyPublicKeySPKI
          });
          
          // Create transaction data for signature
          const transactionData = {
            source: publicKey,
            destination,
            amount: amountInStroops,
            asset: asset === 'XLM' ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' : asset,
            memo,
            timestamp: Date.now()
          };
          
          const signaturePayload = JSON.stringify(transactionData);
          
          setExecutionStatus('Authenticating with passkey...');
          setExecutionStep(1);
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Authenticate with passkey
          const authResult = await webauthnService.authenticateWithPasskey(credentialId, signaturePayload);
          
          if (!authResult) {
            setError('Passkey authentication failed');
            setExecutingRule(false);
            return;
          }
          
          webauthnData = {
            passkeyPublicKeySPKI,
            webauthnSignature: authResult.signature,
            webauthnAuthenticatorData: authResult.authenticatorData,
            webauthnClientData: authResult.clientDataJSON,
            signaturePayload
          };
        }
        
        // Get secret key if not already set
        if (!userSecretKey) {
          userSecretKey = secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
          if (!userSecretKey) {
            setError('Secret key is required for smart wallet payments. Please enter your secret key above.');
            setExecutingRule(false);
            return;
          }
        }
        
        setExecutionStatus('Submitting to blockchain...');
        setExecutionStep(3);
        
        // Call smart wallet execute-payment endpoint (same as send payment)
        const response = await api.post('/smart-wallet/execute-payment', {
          userPublicKey: publicKey,
          userSecretKey: userSecretKey,
          destinationAddress: destination,
          amount: amountInStroops,
          assetAddress: asset === 'XLM' ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' : asset,
          signaturePayload: webauthnData.signaturePayload,
          passkeyPublicKeySPKI: webauthnData.passkeyPublicKeySPKI,
          webauthnSignature: webauthnData.webauthnSignature,
          webauthnAuthenticatorData: webauthnData.webauthnAuthenticatorData,
          webauthnClientData: webauthnData.webauthnClientData,
          rule_id: (rule.rule_id || rule.id) // Pass rule_id so backend can mark it as completed
        });
        
        if (response.data.success) {
          setExecutionStep(4);
          setExecutionStatus('Waiting for confirmation...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          setExecutionStep(5);
          setExecutionStatus('✅ Transaction confirmed!');
          
          // Build success message
          const txHash = response.data.hash || 'N/A';

          // Persist tx hash and force-complete the pending entry as a recovery path
          // (in case the smart-wallet endpoint couldn't update location_update_queue)
          const rid = rule.rule_id || rule.id;
          const mpk = rule.matched_public_key || '';
          if (txHash && txHash !== 'N/A' && rid) {
            const key = `rule_tx_${rid}_${mpk}`;
            localStorage.setItem(key, txHash);
            try {
              await api.post(`/contracts/rules/pending/${rid}/complete`, {
                matched_public_key: mpk || undefined,
                transaction_hash: txHash,
                update_id: rule.update_id // Include update_id if available to mark only the specific location update as completed
              });
              localStorage.removeItem(key);
            } catch (e) {
              console.warn('[ContractManagement] Could not finalize pending rule in DB (will retry on refresh):', e?.message || e);
            }
          }

          const stellarExpertUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
          let successMsg = `Payment sent successfully!`;
          if (memo && memo.trim()) {
            successMsg += `\nMemo: ${memo.trim()}`;
          }
          successMsg += `\nTransaction: ${txHash}`;
          successMsg += `\n🔗 View on StellarExpert: ${stellarExpertUrl}`;
          
          // Store execution result details for smart wallet payments
          setExecutionResult({
            functionName: rule.function_name,
            transactionHash: txHash,
            network: 'testnet',
            stellarExpertUrl: stellarExpertUrl,
            executionType: 'smart_wallet_payment',
            timestamp: new Date().toISOString(),
            parameters: {
              destination: destination,
              amount: amount,
              asset: 'XLM'
            }
          });
          
          setSuccess(successMsg);
          // Keep success message visible longer (15 seconds)
          setTimeout(() => setSuccess(''), 15000);
          setExecutingRule(false);
          
          // Dispatch custom event to refresh vault balance in dashboard
          // Wait a moment for the transaction to propagate on the network
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('smartWalletPaymentSuccess', {
              detail: {
                txHash,
                amount: amount, // amount is already in XLM
                destination: destination
              }
            }));
          }, 2000);
          
          // Auto-scroll to bottom to show success message
          setTimeout(() => {
            if (executionContentRef.current) {
              executionContentRef.current.scrollTop = executionContentRef.current.scrollHeight;
            }
          }, 100);
          
          // Reload pending and completed rules after a delay
          setTimeout(async () => {
            await Promise.all([
              loadPendingRules(),
              loadCompletedRules()
            ]);
          }, 1000);
          
          // Keep dialog open to show result - user can close manually with Done button
        } else {
          setError(response.data.error || 'Payment failed');
          setExecutingRule(false);
          // Auto-scroll to show error
          setTimeout(() => {
            if (executionContentRef.current) {
              executionContentRef.current.scrollTop = executionContentRef.current.scrollHeight;
            }
          }, 100);
          // Keep dialog open - user can close with Done button
        }
        
        return; // Exit early for smart wallet payments
      }
      
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
        rule_id: rule.id,
        update_id: rule.update_id, // Include update_id to mark only the specific location update as completed
        matched_public_key: rule.matched_public_key, // Include matched_public_key for additional filtering
        payment_source: isPayment ? paymentSource : undefined // Pass payment source for payment functions
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
        setExecutionStep(5);
        setExecutionStatus('✅ Transaction confirmed!');
        let resultMessage = '';
        const txHash = response.data.transaction_hash;
        const network = response.data.network || 'testnet';
        const stellarExpertUrl = txHash ? (response.data.stellar_expert_url || `https://stellar.expert/explorer/${network}/tx/${txHash}`) : null;
        
        // Store execution result details
        setExecutionResult({
          functionName: rule.function_name,
          transactionHash: txHash,
          network: network,
          stellarExpertUrl: stellarExpertUrl,
          executionType: response.data.execution_type || 'submitted_to_ledger',
          timestamp: new Date().toISOString(),
          parameters: functionParams
        });
        
        if (txHash) {
          resultMessage = `Function "${rule.function_name}" executed successfully! Transaction: ${txHash}`;
          if (stellarExpertUrl) {
            resultMessage += `\nView on StellarExpert: ${stellarExpertUrl}`;
          }
        } else {
          resultMessage = `Function "${rule.function_name}" executed successfully!`;
        }
        setSuccess(resultMessage);
        // Keep success message visible longer (15 seconds instead of 8)
        setTimeout(() => setSuccess(''), 15000);
        
        // Dispatch custom event to refresh vault balance if this was a payment function
        // Wait a moment for the transaction to propagate on the network
        if (isPayment && txHash) {
          // Extract payment parameters from functionParams for the event
          const paymentAmount = functionParams.amount || functionParams.value || functionParams.quantity || null;
          const paymentDestination = functionParams.destination || functionParams.recipient || functionParams.to || null;
          
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('smartWalletPaymentSuccess', {
              detail: {
                txHash,
                amount: paymentAmount || null,
                destination: paymentDestination || null,
                functionName: rule.function_name
              }
            }));
          }, 2000);
        }
        
        // Reload pending rules to remove the executed rule from the list
        // Also reload completed rules to update the count
        await Promise.all([
          loadPendingRules(),
          loadCompletedRules()
        ]);
        
        // Set executing to false and auto-scroll to show success
        setExecutingRule(false);
        setTimeout(() => {
          if (executionContentRef.current) {
            executionContentRef.current.scrollTop = executionContentRef.current.scrollHeight;
          }
        }, 100);
        // Keep dialog open - user can close with Done button
      } else {
        setError(response.data.error || 'Execution failed');
        setExecutingRule(false);
        // Close dialog on error after a delay
        setTimeout(() => {
          setExecuteConfirmDialog({ open: false, rule: null });
          setExecutionStatus('');
          setExecutionStep(0);
        }, 3000);
      }
    } catch (err) {
      console.error('Error executing rule function:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to execute function';
      const errorDetails = err.response?.data?.details || '';
      const errorSuggestion = err.response?.data?.suggestion || '';
      
      // Handle passkey mismatch error specifically
      if (errorMessage.toLowerCase().includes('passkey') && errorMessage.toLowerCase().includes('mismatch')) {
        // Try to automatically re-register the passkey if we have the necessary information
        // Get values from the current execution context
        const currentPublicKey = publicKey || localStorage.getItem('stellar_public_key');
        const availableSecretKey = secretKeyInput.trim() || secretKey || localStorage.getItem('stellar_secret_key');
        
        // Try to get passkey info from the last execution attempt
        // We'll need to fetch it from the API
        if (currentPublicKey && availableSecretKey) {
          try {
            setExecutionStatus('Re-registering passkey on contract...');
            setExecutionStep(1);
            
            // Get passkeys to find the one being used
            const passkeysResponse = await api.get('/webauthn/passkeys');
            const passkeys = passkeysResponse.data.passkeys || [];
            
            if (passkeys.length > 0) {
              // Use the passkey that was likely used (first one or one marked as on contract)
              const selectedPasskey = passkeys.find(p => p.isOnContract === true) || passkeys[0];
              const passkeyPublicKeySPKI = selectedPasskey?.publicKey || selectedPasskey?.public_key_spki;
              
              if (passkeyPublicKeySPKI) {
                try {
                  // Use the API endpoint for registration (cleaner and more reliable)
                  const registerResponse = await api.post('/smart-wallet/register-signer', {
                    userPublicKey: currentPublicKey,
                    userSecretKey: availableSecretKey,
                    passkeyPublicKeySPKI: passkeyPublicKeySPKI,
                    rpId: window.location.hostname
                  });
                  
                  if (registerResponse.data.success) {
                    setExecutionStatus('Passkey re-registered successfully!');
                    setExecutionStep(2);
                    
                    // Wait a moment for the contract to update
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Show success message and ask user to try again
                    setSuccess('✅ Passkey has been re-registered successfully! Please try executing the rule again.');
                    setError('');
                    setExecutingRule(false);
                    return;
                  } else {
                    throw new Error(registerResponse.data.error || 'Registration failed');
                  }
                } catch (apiError) {
                  console.error('API registration failed, trying direct contract call:', apiError);
                  // Fallback to direct contract call
                  const webauthnService = (await import('../../services/webauthnService')).default;
                  const registrationSuccess = await webauthnService.registerSignerOnContract(
                    currentPublicKey,
                    availableSecretKey,
                    passkeyPublicKeySPKI
                  );
                  
                  if (registrationSuccess) {
                    setExecutionStatus('Passkey re-registered successfully!');
                    setExecutionStep(2);
                    
                    // Wait a moment for the contract to update
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Show success message and ask user to try again
                    setSuccess('✅ Passkey has been re-registered successfully! Please try executing the rule again.');
                    setError('');
                    setExecutingRule(false);
                    return;
                  }
                }
              }
            }
          } catch (reRegError) {
            console.error('Failed to auto-re-register passkey:', reRegError);
            // Fall through to show manual registration message
          }
        }
        
        // If auto-registration failed or secret key not available, show manual instructions
        setError(
          `🔐 Passkey Mismatch: ${errorDetails || errorMessage}\n\n` +
          `💡 ${errorSuggestion || 'Please re-register your passkey for this role, or use the passkey that was last registered for this public key.'}\n\n` +
          `🔄 To fix this:\n` +
          `1. Go to your wallet settings\n` +
          `2. Re-register your passkey for this role\n` +
          `3. Try executing the rule again`
        );
      } else {
        setError(errorMessage + (errorDetails ? `\n\nDetails: ${errorDetails}` : '') + (errorSuggestion ? `\n\nSuggestion: ${errorSuggestion}` : ''));
      }
      setExecutingRule(false);
      // Close dialog on error after a delay
      setTimeout(() => {
        setExecuteConfirmDialog({ open: false, rule: null });
        setExecutionStatus('');
        setExecutionStep(0);
      }, 3000);
    } finally {
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
    setSelectedRuleForQuorum(rule);
    // Initialize quorum config from rule
    const existingKeys = rule.required_wallet_public_keys 
      ? (typeof rule.required_wallet_public_keys === 'string' 
          ? JSON.parse(rule.required_wallet_public_keys) 
          : rule.required_wallet_public_keys)
      : [];
    setQuorumConfig({
      required_wallet_public_keys: existingKeys,
      minimum_wallet_count: rule.minimum_wallet_count || null,
      quorum_type: rule.quorum_type || 'any'
    });
    setNewWalletKey('');
    setQuorumStatus(null);
    setQuorumDialogTab(0); // Start with configuration tab
    setQuorumCheckOpen(true);
  };

  const handleAddWalletKey = () => {
    if (newWalletKey.trim() && !quorumConfig.required_wallet_public_keys.includes(newWalletKey.trim())) {
      setQuorumConfig(prev => ({
        ...prev,
        required_wallet_public_keys: [...prev.required_wallet_public_keys, newWalletKey.trim()]
      }));
      setNewWalletKey('');
    }
  };

  const handleRemoveWalletKey = (index) => {
    setQuorumConfig(prev => ({
      ...prev,
      required_wallet_public_keys: prev.required_wallet_public_keys.filter((_, i) => i !== index)
    }));
  };

  const handleSaveQuorumConfig = async () => {
    if (!selectedRuleForQuorum) return;

    try {
      setSavingQuorum(true);
      setError('');

      // Validate configuration
      if (quorumConfig.required_wallet_public_keys.length > 0) {
        if (!quorumConfig.minimum_wallet_count || quorumConfig.minimum_wallet_count <= 0) {
          setError('Minimum wallet count must be set when required wallets are specified');
          setSavingQuorum(false);
          return;
        }
        if (quorumConfig.minimum_wallet_count > quorumConfig.required_wallet_public_keys.length) {
          setError(`Minimum wallet count (${quorumConfig.minimum_wallet_count}) cannot exceed the number of required wallets (${quorumConfig.required_wallet_public_keys.length})`);
          setSavingQuorum(false);
          return;
        }
      }

      const updateData = {
        required_wallet_public_keys: quorumConfig.required_wallet_public_keys.length > 0 
          ? quorumConfig.required_wallet_public_keys 
          : null,
        minimum_wallet_count: quorumConfig.required_wallet_public_keys.length > 0 
          ? quorumConfig.minimum_wallet_count 
          : null,
        quorum_type: quorumConfig.required_wallet_public_keys.length > 0 
          ? quorumConfig.quorum_type 
          : 'any'
      };

      await api.put(`/contracts/rules/${selectedRuleForQuorum.id}`, updateData);
      
      setSuccess('Quorum configuration saved successfully');
      setTimeout(() => setSuccess(''), 3000);
      
      // Reload rules to get updated data
      await loadRules();
      
      // Update selected rule with new data
      const updatedRules = await api.get('/contracts/rules');
      const updatedRule = updatedRules.data.find(r => r.id === selectedRuleForQuorum.id);
      if (updatedRule) {
        setSelectedRuleForQuorum(updatedRule);
      }
    } catch (err) {
      console.error('Error saving quorum config:', err);
      setError(err.response?.data?.error || 'Failed to save quorum configuration');
    } finally {
      setSavingQuorum(false);
    }
  };

  const handleCheckQuorumStatus = async () => {
    if (!selectedRuleForQuorum) return;

    try {
      setCheckingQuorum(true);
      setError('');
      
      const response = await api.get(`/contracts/rules/${selectedRuleForQuorum.id}/quorum`);
      
      setQuorumStatus(response.data);
      setQuorumDialogTab(1); // Switch to status tab
    } catch (err) {
      console.error('Error checking quorum:', err);
      setError(err.response?.data?.error || 'Failed to check quorum status');
    } finally {
      setCheckingQuorum(false);
    }
  };

  // Start QR scanner for quorum wallet key
  const startQuorumQRScanner = async () => {
    try {
      // Dynamically import qr-scanner
      const QrScanner = (await import('qr-scanner')).default;
      
      // Check if camera is available
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setQuorumScannerError('No camera found on this device');
        return;
      }

      setIsQuorumScannerOpen(true);
      setQuorumScannerError('');

      // Wait for modal to render, then start scanner
      setTimeout(async () => {
        try {
          if (quorumVideoRef.current) {
            const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
            if (!isSecure) {
              setQuorumScannerError('Camera access requires HTTPS. Please use the secure version of the site.');
              setIsQuorumScannerOpen(false);
              return;
            }
            
            const scanner = new QrScanner(
              quorumVideoRef.current,
              (result) => {
                console.log('QR Code detected for quorum:', result);
                setNewWalletKey(result.data);
                setIsQuorumScannerOpen(false);
                stopQuorumQRScanner();
              },
              {
                highlightScanRegion: true,
                highlightCodeOutline: true,
                preferredCamera: 'environment',
                maxScansPerSecond: 5,
              }
            );
            
            quorumQrScannerRef.current = scanner;
            await scanner.start();
          }
        } catch (error) {
          console.error('Error starting quorum scanner:', error);
          setQuorumScannerError('Failed to start camera. Please check permissions.');
        }
      }, 100);
    } catch (error) {
      console.error('Error loading QR scanner:', error);
      setQuorumScannerError('QR scanner not available. Please install qr-scanner package.');
    }
  };

  // Stop QR scanner for quorum
  const stopQuorumQRScanner = () => {
    if (quorumQrScannerRef.current) {
      try {
        quorumQrScannerRef.current.stop();
        quorumQrScannerRef.current.destroy();
      } catch (e) {
        console.warn('Error stopping quorum QR scanner:', e);
      }
      quorumQrScannerRef.current = null;
    }
  };

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      stopQuorumQRScanner();
    };
  }, []);

  // Cleanup scanner when dialog closes
  useEffect(() => {
    if (!quorumCheckOpen) {
      stopQuorumQRScanner();
      setIsQuorumScannerOpen(false);
      setQuorumScannerError('');
    }
  }, [quorumCheckOpen]);

  const getContractName = (contractId) => {
    const contract = contracts.find(c => c.id === contractId);
    return contract ? (contract.contract_name || contract.contract_address.substring(0, 10) + '...') : 'Unknown';
  };
  
  // Pagination handlers
  const handleContractsPageChange = (event, newPage) => {
    setContractsPage(newPage);
  };
  
  const handleContractsRowsPerPageChange = (event) => {
    setContractsRowsPerPage(parseInt(event.target.value, 10));
    setContractsPage(0);
  };

  const handleRulesPageChange = (event, newPage) => {
    setRulesPage(newPage);
  };
  
  const handleRulesRowsPerPageChange = (event) => {
    setRulesRowsPerPage(parseInt(event.target.value, 10));
    setRulesPage(0);
  };

  const handlePendingRulesPageChange = (event, newPage) => {
    setPendingRulesPage(newPage);
  };
  
  const handlePendingRulesRowsPerPageChange = (event) => {
    setPendingRulesRowsPerPage(parseInt(event.target.value, 10));
    setPendingRulesPage(0);
  };

  const handleCompletedRulesPageChange = (event, newPage) => {
    setCompletedRulesPage(newPage);
  };
  
  const handleCompletedRulesRowsPerPageChange = (event) => {
    setCompletedRulesRowsPerPage(parseInt(event.target.value, 10));
    setCompletedRulesPage(0);
  };

  const handleRejectedRulesPageChange = (event, newPage) => {
    setRejectedRulesPage(newPage);
  };
  
  const handleRejectedRulesRowsPerPageChange = (event) => {
    setRejectedRulesRowsPerPage(parseInt(event.target.value, 10));
    setRejectedRulesPage(0);
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

  // Filter contracts based on filter state
  const filteredContracts = contracts.filter(contract => {
    if (filterNetwork !== 'all' && contract.network !== filterNetwork) {
      return false;
    }
    if (filterContractName && !contract.contract_name?.toLowerCase().includes(filterContractName.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Get unique networks for filter
  const networks = [...new Set(contracts.map(c => c.network).filter(Boolean))];

  // Get active rules for a contract
  const getActiveRulesForContract = (contractId) => {
    return (allRules.length > 0 ? allRules : rules).filter(r => r.contract_id === contractId && r.is_active);
  };

  // Filter rules based on showActiveRulesOnly toggle
  const filteredRules = showActiveRulesOnly 
    ? rules.filter(r => r.is_active === true)
    : rules;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box>
        <Box 
          display="flex" 
          flexDirection={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between" 
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={{ xs: 2, sm: 0 }}
          mb={3}
        >
          <Typography variant="h4" gutterBottom>
            {isAuthenticated ? 'Smart Contract Management' : 'Explore Smart Contracts'}
          </Typography>
          {isAuthenticated && (
            <Box 
              display="flex" 
              gap={2}
              flexWrap="wrap"
              width={{ xs: '100%', sm: 'auto' }}
            >
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                startIcon={<SmartToyIcon />}
                onClick={() => {
                  setAgentContractAddress('');
                  setAgentResult(null);
                  setAgentDialogOpen(true);
                }}
                sx={{ 
                  flex: { xs: '1 1 auto', sm: '0 0 auto' },
                  minWidth: { xs: 'calc(50% - 8px)', sm: 'auto' },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  padding: { xs: '6px 12px', sm: '8px 16px' }
                }}
              >
                Load Contract
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  setEditingContract(null);
                  setContractDialogOpen(true);
                }}
                sx={{ 
                  flex: { xs: '1 1 auto', sm: '0 0 auto' },
                  minWidth: { xs: 'calc(50% - 8px)', sm: 'auto' },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  padding: { xs: '6px 12px', sm: '8px 16px' }
                }}
              >
                Add Contract
              </Button>
            </Box>
          )}
          {!isAuthenticated && (
            <Button
              variant="outlined"
              onClick={() => window.location.href = '/login'}
            >
              Login to Create Contract
            </Button>
          )}
        </Box>

        {/* Filtering UI */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Network</InputLabel>
            <Select
              value={filterNetwork}
              label="Network"
              onChange={(e) => setFilterNetwork(e.target.value)}
            >
              <MenuItem value="all">All Networks</MenuItem>
              {networks.map(network => (
                <MenuItem key={network} value={network}>{network}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Search Contract Name"
            value={filterContractName}
            onChange={(e) => setFilterContractName(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            Showing {filteredContracts.length} of {contracts.length} contracts
          </Typography>
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
        <Tabs 
          value={tabValue} 
          onChange={(e, newValue) => {
            console.log('[ContractManagement] Tab clicked:', { 
              from: tabValue, 
              to: newValue, 
              isAuthenticated,
              tabNames: ['Contracts', 'Execution Rules', 'Pending Rules', 'Completed Rules', 'Rejected Rules']
            });
            setTabValue(newValue);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTabs-scrollButtons': {
              '&.Mui-disabled': {
                opacity: 0.3
              }
            },
            // Hide scrollbar but keep scrolling functionality
            '& .MuiTabs-scroller': {
              '&::-webkit-scrollbar': {
                display: 'none'
              },
              scrollbarWidth: 'none', // Firefox
              msOverflowStyle: 'none' // IE and Edge
            },
            // Ensure tabs are clickable when not disabled
            '& .MuiTab-root': {
              '&:not(.Mui-disabled)': {
                pointerEvents: 'auto',
                cursor: 'pointer'
              },
              '&.Mui-disabled': {
                pointerEvents: 'none',
                opacity: 0.5
              },
              '&.Mui-selected': {
                color: 'primary.main'
              }
            },
            // Ensure indicator shows for all tabs and is visible
            '& .MuiTabs-indicator': {
              backgroundColor: 'primary.main',
              height: 3,
              zIndex: 1
            }
          }}
        >
          <Tab label="Contracts" {...a11yProps(0)} />
          <Tab label="Execution Rules" {...a11yProps(1)} />
          <Tab 
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" noWrap>Pending Rules</Typography>
                {isAuthenticated && (
                  <Chip 
                    label={loadingPendingRules ? '...' : pendingRules.length} 
                    size="small" 
                    color="warning"
                    sx={{ minWidth: '24px', height: '20px', flexShrink: 0 }}
                  />
                )}
              </Box>
            } 
            {...a11yProps(2)}
            disabled={!isAuthenticated}
          />
          <Tab 
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" noWrap>Completed Rules</Typography>
                {isAuthenticated && (
                  <Chip 
                    label={loadingCompletedRules ? '...' : completedRules.length} 
                    size="small" 
                    color="success"
                    sx={{ minWidth: '24px', height: '20px', flexShrink: 0 }}
                  />
                )}
              </Box>
            } 
            {...a11yProps(3)}
            disabled={!isAuthenticated}
          />
          <Tab 
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" noWrap>Rejected Rules</Typography>
                {isAuthenticated && (
                  <Chip 
                    label={loadingRejectedRules ? '...' : rejectedRules.length} 
                    size="small" 
                    color="error"
                    sx={{ minWidth: '24px', height: '20px', flexShrink: 0 }}
                  />
                )}
              </Box>
            } 
            {...a11yProps(4)}
            disabled={!isAuthenticated}
          />
        </Tabs>
      </Box>

      {/* Contracts Tab */}
      <TabPanel value={tabValue} index={0}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : filteredContracts.length === 0 ? (
          <Alert severity="info">
            {contracts.length === 0 
              ? (isAuthenticated ? 'No contracts found. Click "Add Contract" to create your first smart contract.' : 'No contracts found.')
              : 'No contracts match your filters. Try adjusting your search criteria.'
            }
          </Alert>
        ) : (
          <>
          <Grid container spacing={3}>
            {filteredContracts
              .slice(contractsPage * contractsRowsPerPage, contractsPage * contractsRowsPerPage + contractsRowsPerPage)
              .map((contract) => {
                const activeRules = getActiveRulesForContract(contract.id);
                return (
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
                      <>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Functions:</strong> {discoveredFunctions(contract).length} discovered
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedContractForFunctions(contract);
                            setFunctionsDialogOpen(true);
                          }}
                          sx={{ mt: 1 }}
                        >
                          View Functions ({discoveredFunctions(contract).length})
                        </Button>
                      </>
                    )}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      <strong>Rules:</strong> {activeRules.length} active rule{activeRules.length !== 1 ? 's' : ''} 
                      {allRules.filter(r => r.contract_id === contract.id && !r.is_active).length > 0 && 
                        ` (${allRules.filter(r => r.contract_id === contract.id && !r.is_active).length} inactive)`
                      }
                    </Typography>
                    {activeRules.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                          <strong>Active Execution Rules:</strong>
                        </Typography>
                        {activeRules.slice(0, 3).map(rule => (
                          <Chip
                            key={rule.id}
                            label={rule.rule_name || rule.function_name}
                            size="small"
                            color="success"
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        ))}
                        {activeRules.length > 3 && (
                          <Typography variant="caption" color="text.secondary">
                            +{activeRules.length - 3} more
                          </Typography>
                        )}
                      </Box>
                    )}
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
                    {isAuthenticated && (contract.owner_public_key === publicKey || !contract.owner_public_key) && (
                      <>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditContract(contract)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<CloudUploadIcon />}
                          onClick={() => handleUpdateWasm(contract)}
                          title="Fetch WASM from network"
                        >
                          Update WASM
                        </Button>
                        <Button
                          size="small"
                          startIcon={<RuleIcon />}
                          onClick={() => handleAddRule(contract)}
                        >
                          Add Rule
                        </Button>
                      </>
                    )}
                    {!isAuthenticated && (
                      <Button
                        size="small"
                        onClick={() => window.location.href = '/login'}
                      >
                        Login to Manage
                      </Button>
                    )}
                    {isAuthenticated && (contract.owner_public_key === publicKey || !contract.owner_public_key) && (
                      <>
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
                      </>
                    )}
                  </CardActions>
                </Card>
                  </Grid>
                );
              })}
          </Grid>
          <TablePagination
            component="div"
            count={filteredContracts.length}
            page={contractsPage}
            onPageChange={handleContractsPageChange}
            rowsPerPage={contractsRowsPerPage}
            onRowsPerPageChange={handleContractsRowsPerPageChange}
            rowsPerPageOptions={[6, 12, 24, 48]}
            sx={{ mt: 2 }}
          />
          </>
        )}
      </TabPanel>

      {/* Execution Rules Tab */}
      <TabPanel value={tabValue} index={1}>
        {/* Show Active Rules Only toggle - works for both authenticated and non-authenticated users */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleAddRule()}
            >
              Add Execution Rule
            </Button>
          )}
          <FormControlLabel
            control={
              <Switch
                checked={showActiveRulesOnly}
                onChange={(e) => setShowActiveRulesOnly(e.target.checked)}
              />
            }
            label="Show Active Rules Only"
            sx={{ ml: isAuthenticated ? 'auto' : 0 }}
          />
        </Box>
        {filteredRules.length === 0 ? (
          <Alert severity="info">
            {rules.length === 0 
              ? 'No execution rules found. Create rules to automatically execute contract functions based on location.'
              : 'No rules match your filter. Try adjusting the "Show Active Rules Only" toggle.'
            }
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
                      {isAuthenticated && <TableCell>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRules
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
                        {isAuthenticated ? (
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
                            <Tooltip title="Configure Quorum Requirements">
                              <IconButton
                                size="small"
                                onClick={() => handleCheckQuorum(rule)}
                                disabled={checkingQuorum}
                              >
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
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
                        ) : (
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
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Mobile Card View */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {filteredRules
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
                      {isAuthenticated && <Divider sx={{ my: 1 }} />}
                      {isAuthenticated && (
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
                          <Tooltip title="Configure Quorum Requirements">
                            <IconButton
                              size="small"
                              onClick={() => handleCheckQuorum(rule)}
                              disabled={checkingQuorum}
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
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
                      )}
                      {!isAuthenticated && rule.rule_type === 'location' && rule.center_latitude && rule.center_longitude && (
                        <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                          <Tooltip title="View Location on Map">
                            <IconButton
                              size="small"
                              onClick={() => handleViewRuleMap(rule)}
                              color="primary"
                            >
                              <MapIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
            <TablePagination
              component="div"
              count={filteredRules.length}
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
        {!isAuthenticated ? (
          <Alert severity="info">
            Please log in to view pending rules.
          </Alert>
        ) : (
          <>
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
            {/* Debug: Tab value = {tabValue}, isAuthenticated = {String(isAuthenticated)} */}

            {loadingPendingRules ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : pendingRules.length === 0 ? (
          <Alert severity="success">
            No pending rules. All matched rules have been executed automatically.
          </Alert>
        ) : (
          <>
          {/* Batch Selection and Execution Controls */}
          <Box 
            display="flex" 
            alignItems="center" 
            justifyContent="space-between" 
            mb={2} 
            flexWrap="wrap" 
            gap={2}
            sx={{ 
              width: '100%',
              position: 'relative',
              zIndex: 1
            }}
          >
            <Box display="flex" alignItems="center" gap={1} sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  const currentPageRules = pendingRules.slice(
                    pendingRulesPage * pendingRulesRowsPerPage,
                    pendingRulesPage * pendingRulesRowsPerPage + pendingRulesRowsPerPage
                  );
                  const allSelected = currentPageRules.every(pr => {
                    const uniqueKey = getPendingRuleKey(pr);
                    return selectedPendingRules.has(uniqueKey);
                  });
                  const newSelected = new Set(selectedPendingRules);
                  if (allSelected) {
                    currentPageRules.forEach(pr => {
                      const uniqueKey = getPendingRuleKey(pr);
                      newSelected.delete(uniqueKey);
                    });
                  } else {
                    currentPageRules.forEach(pr => {
                      const uniqueKey = getPendingRuleKey(pr);
                      newSelected.add(uniqueKey);
                    });
                  }
                  setSelectedPendingRules(newSelected);
                }}
                sx={{ flexShrink: 0 }}
              >
                {pendingRules.slice(
                  pendingRulesPage * pendingRulesRowsPerPage,
                  pendingRulesPage * pendingRulesRowsPerPage + pendingRulesRowsPerPage
                ).every(pr => {
                  const uniqueKey = getPendingRuleKey(pr);
                  return selectedPendingRules.has(uniqueKey);
                }) ? (
                  <CheckBoxIcon />
                ) : (
                  <CheckBoxOutlineBlankIcon />
                )}
              </IconButton>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Select All ({validSelectionCount} selected)
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="primary"
              startIcon={batchExecuting ? <CircularProgress size={16} /> : <CheckCircleIcon />}
              onClick={(e) => {
                e.stopPropagation();
                handleBatchExecuteSelected();
              }}
              disabled={validSelectionCount === 0 || batchExecuting}
              sx={{ 
                minWidth: { xs: '100%', sm: 180 },
                flex: { xs: '1 1 100%', sm: '0 1 auto' },
                position: 'relative',
                zIndex: 2
              }}
            >
              {batchExecuting 
                ? `Executing ${batchExecutionProgress.current}/${batchExecutionProgress.total}...`
                : `Execute Selected (${validSelectionCount})`
              }
            </Button>
          </Box>
          
          {batchExecuting && batchExecutionProgress.currentRule && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Executing: <strong>{batchExecutionProgress.currentRule.rule_name}</strong> for wallet {batchExecutionProgress.currentRule.matched_public_key?.substring(0, 8)}...
              </Typography>
            </Alert>
          )}
          
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {pendingRules
              .slice(pendingRulesPage * pendingRulesRowsPerPage, pendingRulesPage * pendingRulesRowsPerPage + pendingRulesRowsPerPage)
              .map((pendingRule, index) => {
              const contract = contracts.find(c => c.id === pendingRule.contract_id);
              const rule = rules.find(r => r.id === pendingRule.rule_id);
              // Merge matched_public_key from pendingRule into rule object for execution
              // This ensures the signature payload uses the correct destination
              const ruleWithMatchedKey = rule ? {
                ...rule,
                matched_public_key: pendingRule.matched_public_key,
                update_id: pendingRule.update_id // Include update_id to mark only the specific location update as completed
              } : null;
              // Use helper function to generate unique key consistently
              const uniqueKey = getPendingRuleKey(pendingRule, pendingRulesPage * pendingRulesRowsPerPage + index);
              const isExpanded = expandedPendingRule === uniqueKey;
              
              return (
                <React.Fragment key={uniqueKey}>
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
                      onClick={() => setExpandedPendingRule(isExpanded ? null : uniqueKey)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newSelected = new Set(selectedPendingRules);
                          if (newSelected.has(uniqueKey)) {
                            newSelected.delete(uniqueKey);
                          } else {
                            newSelected.add(uniqueKey);
                          }
                          setSelectedPendingRules(newSelected);
                        }}
                        sx={{ mr: 1 }}
                      >
                        {selectedPendingRules.has(uniqueKey) ? (
                          <CheckBoxIcon color="primary" />
                        ) : (
                          <CheckBoxOutlineBlankIcon />
                        )}
                      </IconButton>
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
                          {pendingRule.matched_public_key && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                              Wallet: {pendingRule.matched_public_key.substring(0, 8)}...{pendingRule.matched_public_key.substring(pendingRule.matched_public_key.length - 8)}
                            </Typography>
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
                          setExpandedPendingRule(isExpanded ? null : uniqueKey);
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
                          {pendingRule.matched_public_key && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <AccountBalanceWalletIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                <strong>Matched Wallet:</strong> {pendingRule.matched_public_key}
                              </Typography>
                            </Box>
                          )}
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
                        {pendingRule.function_parameters && (() => {
                          const params = typeof pendingRule.function_parameters === 'string'
                            ? JSON.parse(pendingRule.function_parameters)
                            : pendingRule.function_parameters;
                          const systemGenerated = pendingRule.system_generated_params || {};
                          
                          return (
                            <Box mb={2}>
                              <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
                                Function Parameters:
                              </Typography>
                              <Paper 
                                variant="outlined" 
                                sx={{ 
                                  p: 1.5, 
                                  bgcolor: 'grey.50',
                                  maxHeight: '200px',
                                  overflow: 'auto'
                                }}
                              >
                                <Box component="pre" sx={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                  {Object.entries(params).map(([key, value]) => {
                                    const isSystemGenerated = systemGenerated[key];
                                    const valueStr = typeof value === 'string' && value.startsWith('[Will be') 
                                      ? value 
                                      : JSON.stringify(value, null, 2);
                                    return (
                                      <Box key={key} sx={{ mb: 0.5 }}>
                                        <Box component="span" sx={{ fontWeight: 'bold', color: isSystemGenerated ? 'info.main' : 'text.primary' }}>
                                          {key}:
                                        </Box>
                                        <Box component="span" sx={{ 
                                          ml: 1, 
                                          color: isSystemGenerated ? 'info.main' : 'text.secondary',
                                          fontStyle: typeof value === 'string' && value.startsWith('[Will be') ? 'italic' : 'normal'
                                        }}>
                                          {valueStr}
                                        </Box>
                                        {isSystemGenerated && (
                                          <Chip 
                                            label="System Generated" 
                                            size="small" 
                                            color="info"
                                            sx={{ ml: 1, height: '16px', fontSize: '0.65rem' }}
                                          />
                                        )}
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Paper>
                            </Box>
                          );
                        })()}

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
                              if (pendingRule.location && ruleWithMatchedKey) {
                                setSelectedRuleForMap({
                                  ...ruleWithMatchedKey,
                                  center_latitude: pendingRule.location.latitude,
                                  center_longitude: pendingRule.location.longitude
                                });
                                setMapViewOpen(true);
                              }
                            }}
                            disabled={!pendingRule.location || !ruleWithMatchedKey}
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
                              if (ruleWithMatchedKey) {
                                handleExecuteRule(ruleWithMatchedKey, e);
                              }
                            }}
                            disabled={!ruleWithMatchedKey}
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
          <TablePagination
            component="div"
            count={pendingRules.length}
            page={pendingRulesPage}
            onPageChange={handlePendingRulesPageChange}
            rowsPerPage={pendingRulesRowsPerPage}
            onRowsPerPageChange={handlePendingRulesRowsPerPageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ mt: 2 }}
          />
          </>
            )}
          </>
        )}
      </TabPanel>

      {/* Completed Rules Tab */}
      <TabPanel value={tabValue} index={3}>
        {!isAuthenticated && (
          <Alert severity="info">
            Please log in to view completed rules.
          </Alert>
        )}
        {isAuthenticated && (
          <>
            <Box mb={3}>
              <Alert severity="success" icon={<CheckCircleIcon />}>
                <Typography variant="subtitle2" gutterBottom>
                  Successfully Executed Rules
                </Typography>
                <Typography variant="body2">
                  These rules were matched and successfully executed after requiring authentication.
                </Typography>
              </Alert>
            </Box>
            {loadingCompletedRules ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : completedRules.length === 0 ? (
          <Alert severity="info">
            No completed rules yet. Rules that are successfully executed will appear here.
          </Alert>
        ) : (
          <>
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {completedRules
              .slice(completedRulesPage * completedRulesRowsPerPage, completedRulesPage * completedRulesRowsPerPage + completedRulesRowsPerPage)
              .map((completedRule, index) => {
              const contract = contracts.find(c => c.id === completedRule.contract_id);
              const rule = rules.find(r => r.id === completedRule.rule_id);
              // Create unique key using rule_id, transaction_hash, update_id, and matched_public_key
              // This matches the deduplication logic in loadCompletedRules
              const matchedPublicKey = completedRule.matched_public_key || completedRule.public_key || 'unknown';
              const uniqueKey = `${completedRule.rule_id}_${completedRule.transaction_hash || 'no-tx'}_${completedRule.update_id || 'no-update'}_${matchedPublicKey}`;
              const isExpanded = expandedCompletedRule === uniqueKey;
              
              return (
                <React.Fragment key={uniqueKey}>
                  <Paper 
                    sx={{ 
                      mb: 1.5, 
                      border: '2px solid', 
                      borderColor: 'success.main',
                      borderRadius: 2
                    }}
                  >
                    <ListItemButton
                      onClick={() => setExpandedCompletedRule(isExpanded ? null : uniqueKey)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography variant="subtitle1" fontWeight="bold">
                            {completedRule.rule_name}
                          </Typography>
                          <Chip 
                            icon={<CheckCircleIcon />} 
                            label="Completed" 
                            color="success" 
                            size="small"
                          />
                          <Typography variant="body2" color="text.secondary">
                            <strong>Function:</strong> {completedRule.function_name}
                          </Typography>
                          {contract && (
                            <Chip 
                              label={contract.contract_name || 'Unknown'} 
                              variant="outlined"
                              size="small"
                            />
                          )}
                          {completedRule.completed_at && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              Completed: {new Date(completedRule.completed_at).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCompletedRule(isExpanded ? null : uniqueKey);
                        }}
                        sx={{ ml: 1 }}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </ListItemButton>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 2, pt: 0 }}>
                        <Divider sx={{ mb: 2 }} />
                        <Box mb={2}>
                          {completedRule.location && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <LocationOnIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                Executed at: {completedRule.location.latitude.toFixed(6)}, {completedRule.location.longitude.toFixed(6)}
                              </Typography>
                            </Box>
                          )}
                          {completedRule.transaction_hash && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                <strong>Transaction:</strong>{' '}
                                <a 
                                  href={`https://stellar.expert/explorer/testnet/tx/${completedRule.transaction_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#1976d2', textDecoration: 'none' }}
                                >
                                  {completedRule.transaction_hash.substring(0, 16)}...
                                </a>
                              </Typography>
                            </Box>
                          )}
                          {matchedPublicKey && matchedPublicKey !== 'unknown' && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                <strong>Matched Public Key:</strong> {matchedPublicKey}
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        {completedRule.function_parameters && (
                          <Box mb={2}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
                              Function Parameters:
                            </Typography>
                            <Paper 
                              variant="outlined" 
                              sx={{ 
                                p: 1.5, 
                                bgcolor: 'grey.50',
                                maxHeight: '200px',
                                overflow: 'auto'
                              }}
                            >
                              <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(
                                  typeof completedRule.function_parameters === 'string'
                                    ? JSON.parse(completedRule.function_parameters)
                                    : completedRule.function_parameters,
                                  null,
                                  2
                                )}
                              </pre>
                            </Paper>
                          </Box>
                        )}

                        <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MapIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (completedRule.location) {
                                setSelectedRuleForMap({
                                  ...rule,
                                  center_latitude: completedRule.location.latitude,
                                  center_longitude: completedRule.location.longitude
                                });
                                setMapViewOpen(true);
                              }
                            }}
                            disabled={!completedRule.location}
                            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 'auto' } }}
                          >
                            View Location
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Paper>
                </React.Fragment>
              );
            })}
          </List>
          <TablePagination
            component="div"
            count={completedRules.length}
            page={completedRulesPage}
            onPageChange={handleCompletedRulesPageChange}
            rowsPerPage={completedRulesRowsPerPage}
            onRowsPerPageChange={handleCompletedRulesRowsPerPageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ mt: 2 }}
          />
          </>
            )}
          </>
        )}
      </TabPanel>

      {/* Rejected Rules Tab */}
      <TabPanel value={tabValue} index={4}>
        {!isAuthenticated && (
          <Alert severity="info">
            Please log in to view rejected rules.
          </Alert>
        )}
        {isAuthenticated && (
          <>
            <Box mb={3}>
              <Alert severity="warning" icon={<WarningIcon />}>
                <Typography variant="subtitle2" gutterBottom>
                  Rejected Rules
                </Typography>
                <Typography variant="body2">
                  These rules were matched but you chose not to execute them.
                </Typography>
              </Alert>
            </Box>
            {loadingRejectedRules ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : rejectedRules.length === 0 ? (
          <Alert severity="info">
            No rejected rules. Rules that you reject will appear here.
          </Alert>
        ) : (
          <>
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {rejectedRules
              .slice(rejectedRulesPage * rejectedRulesRowsPerPage, rejectedRulesPage * rejectedRulesRowsPerPage + rejectedRulesRowsPerPage)
              .map((rejectedRule, index) => {
              const contract = contracts.find(c => c.id === rejectedRule.contract_id);
              const rule = rules.find(r => r.id === rejectedRule.rule_id);
              // Create unique key using rule_id, update_id, rejected_at, and matched_at
              const uniqueKey = rejectedRule.update_id 
                ? `${rejectedRule.rule_id}_${rejectedRule.update_id}_${rejectedRule.rejected_at || 'no-reject-time'}_${rejectedRule.matched_at || index}`
                : `${rejectedRule.rule_id}_${rejectedRule.rejected_at || 'no-reject-time'}_${rejectedRule.matched_at || index}`;
              const isExpanded = expandedRejectedRule === uniqueKey;
              
              return (
                <React.Fragment key={uniqueKey}>
                  <Paper 
                    sx={{ 
                      mb: 1.5, 
                      border: '2px solid', 
                      borderColor: 'error.main',
                      borderRadius: 2
                    }}
                  >
                    <ListItemButton
                      onClick={() => setExpandedRejectedRule(isExpanded ? null : uniqueKey)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography variant="subtitle1" fontWeight="bold">
                            {rejectedRule.rule_name}
                          </Typography>
                          <Chip 
                            icon={<DeleteIcon />} 
                            label="Rejected" 
                            color="error" 
                            size="small"
                          />
                          <Typography variant="body2" color="text.secondary">
                            <strong>Function:</strong> {rejectedRule.function_name}
                          </Typography>
                          {contract && (
                            <Chip 
                              label={contract.contract_name || 'Unknown'} 
                              variant="outlined"
                              size="small"
                            />
                          )}
                          {rejectedRule.rejected_at && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              Rejected: {new Date(rejectedRule.rejected_at).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRejectedRule(isExpanded ? null : uniqueKey);
                        }}
                        sx={{ ml: 1 }}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </ListItemButton>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 2, pt: 0 }}>
                        <Divider sx={{ mb: 2 }} />
                        <Box mb={2}>
                          {rejectedRule.location && (
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <LocationOnIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                Matched at: {rejectedRule.location.latitude.toFixed(6)}, {rejectedRule.location.longitude.toFixed(6)}
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        {rejectedRule.function_parameters && (
                          <Box mb={2}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
                              Function Parameters:
                            </Typography>
                            <Paper 
                              variant="outlined" 
                              sx={{ 
                                p: 1.5, 
                                bgcolor: 'grey.50',
                                maxHeight: '200px',
                                overflow: 'auto'
                              }}
                            >
                              <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(
                                  typeof rejectedRule.function_parameters === 'string'
                                    ? JSON.parse(rejectedRule.function_parameters)
                                    : rejectedRule.function_parameters,
                                  null,
                                  2
                                )}
                              </pre>
                            </Paper>
                          </Box>
                        )}

                        <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MapIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (rejectedRule.location) {
                                setSelectedRuleForMap({
                                  ...rule,
                                  center_latitude: rejectedRule.location.latitude,
                                  center_longitude: rejectedRule.location.longitude
                                });
                                setMapViewOpen(true);
                              }
                            }}
                            disabled={!rejectedRule.location}
                            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 'auto' } }}
                          >
                            View Location
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Paper>
                </React.Fragment>
              );
            })}
          </List>
          <TablePagination
            component="div"
            count={rejectedRules.length}
            page={rejectedRulesPage}
            onPageChange={handleRejectedRulesPageChange}
            rowsPerPage={rejectedRulesRowsPerPage}
            onRowsPerPageChange={handleRejectedRulesRowsPerPageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ mt: 2 }}
          />
          </>
            )}
          </>
        )}
      </TabPanel>

      {/* Functions Dialog */}
      <Dialog
        open={functionsDialogOpen}
        onClose={() => {
          setFunctionsDialogOpen(false);
          setSelectedContractForFunctions(null);
        }}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              Available Functions{!isAuthenticated ? ' (View Only)' : ''}
            </Typography>
            <IconButton onClick={() => {
              setFunctionsDialogOpen(false);
              setSelectedContractForFunctions(null);
            }}>
              <CloseIcon />
            </IconButton>
          </Box>
          {selectedContractForFunctions && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Contract: {selectedContractForFunctions.contract_name || 'Unnamed Contract'}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedContractForFunctions && discoveredFunctions(selectedContractForFunctions).length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {discoveredFunctions(selectedContractForFunctions).map((func, idx) => (
                <Card key={idx} variant="outlined">
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 'medium' }}>
                      {func.name || 'Unknown'}
                    </Typography>
                    {func.parameters && func.parameters.length > 0 && (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Parameters:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {func.parameters.map((param, pIdx) => (
                            <Chip
                              key={pIdx}
                              label={`${param.name || 'param'}: ${param.type || 'unknown'}`}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                    {func.return_type && func.return_type !== 'void' && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Returns:</strong> {func.return_type}
                      </Typography>
                    )}
                    {(!func.parameters || func.parameters.length === 0) && (!func.return_type || func.return_type === 'void') && (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No parameters, returns void
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : selectedContractForFunctions ? (
            <Alert severity="info">
              No functions discovered for this contract.
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setFunctionsDialogOpen(false);
            setSelectedContractForFunctions(null);
          }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* GeoLink Agent Dialog */}
      <Dialog 
        open={agentDialogOpen} 
        onClose={() => {
          setAgentDialogOpen(false);
          setAgentContractAddress('');
          setAgentResult(null);
          setError('');
        }} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <SmartToyIcon color="primary" />
            <Typography variant="h6">Load Contract</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Enter a contract address and the system will automatically:
            </Typography>
            <Box component="ul" sx={{ pl: 3, mb: 0 }}>
              <li>Detect the network (Testnet/Mainnet)</li>
              <li>Fetch WASM from the network</li>
              <li>Discover contract functions</li>
              <li>Generate a contract name</li>
              <li>Create the contract for you</li>
            </Box>

            <TextField
              label="Contract Address"
              value={agentContractAddress}
              onChange={(e) => setAgentContractAddress(e.target.value.toUpperCase())}
              placeholder="Enter Stellar contract address (56 characters)"
              fullWidth
              required
              helperText="The Stellar address of your smart contract"
              error={agentContractAddress.length > 0 && !/^[A-Z0-9]{56}$/.test(agentContractAddress)}
              disabled={agentProcessing}
            />

            {agentProcessing && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Detecting network, fetching WASM, and discovering functions...
                </Typography>
              </Box>
            )}

            {agentResult && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    ✅ Contract onboarded successfully!
                  </Typography>
                  <Typography variant="body2">
                    Network: <strong>{agentResult.detected_network}</strong><br />
                    Name: <strong>{agentResult.contract.contract_name}</strong><br />
                    Functions discovered: <strong>{agentResult.functions_count}</strong>
                  </Typography>
                </Alert>
                
                {agentResult.wasm_details && (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CloudUploadIcon fontSize="small" />
                      WASM Details
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">Network:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                          {agentResult.wasm_details.network}
                        </Typography>
                      </Box>
                      {agentResult.wasm_details.size_formatted && (
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Size:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {agentResult.wasm_details.size_formatted}
                          </Typography>
                        </Box>
                      )}
                      {agentResult.wasm_details.hash && (
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                          <Typography variant="body2" color="text.secondary">Hash:</Typography>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 500, 
                              fontFamily: 'monospace', 
                              fontSize: '0.75rem',
                              wordBreak: 'break-all',
                              textAlign: 'right',
                              maxWidth: '70%'
                            }}
                          >
                            {agentResult.wasm_details.hash.substring(0, 16)}...{agentResult.wasm_details.hash.substring(agentResult.wasm_details.hash.length - 16)}
                          </Typography>
                        </Box>
                      )}
                      {agentResult.wasm_details.deploy_ledger && (
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Deploy Ledger:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                            #{agentResult.wasm_details.deploy_ledger}
                          </Typography>
                        </Box>
                      )}
                      {agentResult.wasm_details.deploy_date_formatted && (
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Deploy Date:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {new Date(agentResult.wasm_details.deploy_date).toLocaleString()}
                          </Typography>
                        </Box>
                      )}
                      {agentResult.wasm_details.filename && (
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Filename:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {agentResult.wasm_details.filename}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                )}
              </Box>
            )}

            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setAgentDialogOpen(false);
              setAgentContractAddress('');
              setAgentResult(null);
              setError('');
            }}
            disabled={agentProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAgentOnboard}
            disabled={agentProcessing || !agentContractAddress.trim() || !/^[A-Z0-9]{56}$/.test(agentContractAddress)}
            startIcon={agentProcessing ? <CircularProgress size={20} /> : <SearchIcon />}
          >
            {agentProcessing ? 'Processing...' : 'Onboard Contract'}
          </Button>
        </DialogActions>
      </Dialog>

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
                                const radius = parseFloat(e.target.value) || 100;
                                setRuleForm({ ...ruleForm, radius_meters: e.target.value });
                                // Update radius circle on map if location is set
                                if (mapRef.current && mapRef.current.isStyleLoaded()) {
                                  if (selectedLocation) {
                                    updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                  } else if (ruleForm.center_latitude && ruleForm.center_longitude) {
                                    // If selectedLocation not set but coordinates are, use those
                                    const lat = parseFloat(ruleForm.center_latitude);
                                    const lng = parseFloat(ruleForm.center_longitude);
                                    if (!isNaN(lat) && !isNaN(lng)) {
                                      updateRadiusCircle(mapRef.current, lat, lng, radius);
                                    }
                                  }
                                } else if (mapRef.current) {
                                  // Wait for style to load
                                  mapRef.current.once('style.load', () => {
                                    if (selectedLocation) {
                                      updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                    } else if (ruleForm.center_latitude && ruleForm.center_longitude) {
                                      const lat = parseFloat(ruleForm.center_latitude);
                                      const lng = parseFloat(ruleForm.center_longitude);
                                      if (!isNaN(lat) && !isNaN(lng)) {
                                        updateRadiusCircle(mapRef.current, lat, lng, radius);
                                      }
                                    }
                                  });
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
                                const radius = parseFloat(e.target.value) || 100;
                                setRuleForm({ ...ruleForm, radius_meters: e.target.value });
                                // Update radius circle on map if location is set
                                if (mapRef.current && mapRef.current.isStyleLoaded()) {
                                  if (selectedLocation) {
                                    updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                  } else if (ruleForm.center_latitude && ruleForm.center_longitude) {
                                    // If selectedLocation not set but coordinates are, use those
                                    const lat = parseFloat(ruleForm.center_latitude);
                                    const lng = parseFloat(ruleForm.center_longitude);
                                    if (!isNaN(lat) && !isNaN(lng)) {
                                      updateRadiusCircle(mapRef.current, lat, lng, radius);
                                    }
                                  }
                                } else if (mapRef.current) {
                                  // Wait for style to load
                                  mapRef.current.once('style.load', () => {
                                    if (selectedLocation) {
                                      updateRadiusCircle(mapRef.current, selectedLocation.lat, selectedLocation.lng, radius);
                                    } else if (ruleForm.center_latitude && ruleForm.center_longitude) {
                                      const lat = parseFloat(ruleForm.center_latitude);
                                      const lng = parseFloat(ruleForm.center_longitude);
                                      if (!isNaN(lat) && !isNaN(lng)) {
                                        updateRadiusCircle(mapRef.current, lat, lng, radius);
                                      }
                                    }
                                  });
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
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              zIndex: 1600, // Higher than dialog z-index
                              maxHeight: 300
                            }
                          }
                        }}
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

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6">Rate Limiting (Optional)</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Limit how many times a public key can execute this rule within a time window.
                    </Alert>

                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Max Executions per Public Key"
                          type="number"
                          value={ruleForm.max_executions_per_public_key || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, max_executions_per_public_key: e.target.value ? parseInt(e.target.value) : null })}
                          fullWidth
                          helperText="Maximum number of executions per public key (leave empty for unlimited)"
                          inputProps={{ min: 1 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Time Window (seconds)"
                          type="number"
                          value={ruleForm.execution_time_window_seconds || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, execution_time_window_seconds: e.target.value ? parseInt(e.target.value) : null })}
                          fullWidth
                          helperText="Time window in seconds (e.g., 3600 = 1 hour)"
                          inputProps={{ min: 1 }}
                        />
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6">Time-Based Trigger (Optional)</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Require public keys to be at the location for a minimum duration before execution.
                    </Alert>

                    <TextField
                      label="Minimum Location Duration (seconds)"
                      type="number"
                      value={ruleForm.min_location_duration_seconds || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, min_location_duration_seconds: e.target.value ? parseInt(e.target.value) : null })}
                      fullWidth
                      helperText="Minimum time in seconds a public key must be at location before rule can execute (e.g., 300 = 5 minutes)"
                      inputProps={{ min: 0 }}
                    />

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6">Read-Only Function Submission (Optional)</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Submit read-only function calls to the Stellar ledger so they appear on Stellar Expert for tracking and audit purposes. Requires SERVICE_ACCOUNT_SECRET_KEY to be configured on the server.
                    </Alert>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={ruleForm.submit_readonly_to_ledger || false}
                          onChange={(e) => setRuleForm({ ...ruleForm, submit_readonly_to_ledger: e.target.checked })}
                        />
                      }
                      label="Submit Read-Only Functions to Ledger"
                    />

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6">Auto-Deactivation (Optional)</Typography>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Automatically deactivate this rule when balance drops below threshold.
                    </Alert>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={ruleForm.auto_deactivate_on_balance_threshold}
                          onChange={(e) => setRuleForm({ ...ruleForm, auto_deactivate_on_balance_threshold: e.target.checked })}
                        />
                      }
                      label="Auto-Deactivate on Balance Threshold"
                    />

                    {ruleForm.auto_deactivate_on_balance_threshold && (
                      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label="Balance Threshold (XLM)"
                              type="number"
                              value={ruleForm.balance_threshold_xlm || ''}
                              onChange={(e) => setRuleForm({ ...ruleForm, balance_threshold_xlm: e.target.value ? parseFloat(e.target.value) : null })}
                              fullWidth
                              required={ruleForm.auto_deactivate_on_balance_threshold}
                              helperText="Rule deactivates when balance drops below this amount"
                              inputProps={{ min: 0, step: 0.0000001 }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label="Asset Address (Optional)"
                              value={ruleForm.balance_check_asset_address || ''}
                              onChange={(e) => setRuleForm({ ...ruleForm, balance_check_asset_address: e.target.value || null })}
                              fullWidth
                              helperText="Leave empty for native XLM, or enter asset contract address"
                              placeholder="CDLZFC3S..."
                            />
                          </Grid>
                        </Grid>

                        <FormControlLabel
                          control={
                            <Switch
                              checked={ruleForm.use_smart_wallet_balance}
                              onChange={(e) => setRuleForm({ ...ruleForm, use_smart_wallet_balance: e.target.checked })}
                            />
                          }
                          label="Check Smart Wallet Vault Balance (instead of direct wallet balance)"
                        />
                      </Box>
                    )}
                    
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

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="h6">Rate Limiting (Optional)</Typography>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        Limit how many times a public key can execute this rule within a time window.
                      </Alert>

                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            label="Max Executions per Public Key"
                            type="number"
                            value={ruleForm.max_executions_per_public_key || ''}
                            onChange={(e) => setRuleForm({ ...ruleForm, max_executions_per_public_key: e.target.value ? parseInt(e.target.value) : null })}
                            fullWidth
                            helperText="Maximum number of executions per public key (leave empty for unlimited)"
                            inputProps={{ min: 1 }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            label="Time Window (seconds)"
                            type="number"
                            value={ruleForm.execution_time_window_seconds || ''}
                            onChange={(e) => setRuleForm({ ...ruleForm, execution_time_window_seconds: e.target.value ? parseInt(e.target.value) : null })}
                            fullWidth
                            helperText="Time window in seconds (e.g., 3600 = 1 hour)"
                            inputProps={{ min: 1 }}
                          />
                        </Grid>
                      </Grid>

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="h6">Time-Based Trigger (Optional)</Typography>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        Require public keys to be at the location for a minimum duration before execution.
                      </Alert>

                      <TextField
                        label="Minimum Location Duration (seconds)"
                        type="number"
                        value={ruleForm.min_location_duration_seconds || ''}
                        onChange={(e) => setRuleForm({ ...ruleForm, min_location_duration_seconds: e.target.value ? parseInt(e.target.value) : null })}
                        fullWidth
                        helperText="Minimum time in seconds a public key must be at location before rule can execute (e.g., 300 = 5 minutes)"
                        inputProps={{ min: 0 }}
                      />

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="h6">Read-Only Function Submission (Optional)</Typography>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        Submit read-only function calls to the Stellar ledger so they appear on Stellar Expert for tracking and audit purposes. Requires SERVICE_ACCOUNT_SECRET_KEY to be configured on the server.
                      </Alert>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={ruleForm.submit_readonly_to_ledger || false}
                            onChange={(e) => setRuleForm({ ...ruleForm, submit_readonly_to_ledger: e.target.checked })}
                          />
                        }
                        label="Submit Read-Only Functions to Ledger"
                      />

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="h6">Auto-Deactivation (Optional)</Typography>
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        Automatically deactivate this rule when balance drops below threshold.
                      </Alert>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={ruleForm.auto_deactivate_on_balance_threshold}
                            onChange={(e) => setRuleForm({ ...ruleForm, auto_deactivate_on_balance_threshold: e.target.checked })}
                          />
                        }
                        label="Auto-Deactivate on Balance Threshold"
                      />

                      {ruleForm.auto_deactivate_on_balance_threshold && (
                        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Balance Threshold (XLM)"
                                type="number"
                                value={ruleForm.balance_threshold_xlm || ''}
                                onChange={(e) => setRuleForm({ ...ruleForm, balance_threshold_xlm: e.target.value ? parseFloat(e.target.value) : null })}
                                fullWidth
                                required={ruleForm.auto_deactivate_on_balance_threshold}
                                helperText="Rule deactivates when balance drops below this amount"
                                inputProps={{ min: 0, step: 0.0000001 }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField
                                label="Asset Address (Optional)"
                                value={ruleForm.balance_check_asset_address || ''}
                                onChange={(e) => setRuleForm({ ...ruleForm, balance_check_asset_address: e.target.value || null })}
                                fullWidth
                                helperText="Leave empty for native XLM, or enter asset contract address"
                                placeholder="CDLZFC3S..."
                              />
                            </Grid>
                          </Grid>

                          <FormControlLabel
                            control={
                              <Switch
                                checked={ruleForm.use_smart_wallet_balance}
                                onChange={(e) => setRuleForm({ ...ruleForm, use_smart_wallet_balance: e.target.checked })}
                              />
                            }
                            label="Check Smart Wallet Vault Balance (instead of direct wallet balance)"
                          />
                        </Box>
                      )}
                      
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
                        {ruleForm.max_executions_per_public_key && (
                          <Typography><strong>Rate Limit:</strong> {ruleForm.max_executions_per_public_key} executions per {ruleForm.execution_time_window_seconds ? `${ruleForm.execution_time_window_seconds}s` : 'time window'}</Typography>
                        )}
                        {ruleForm.min_location_duration_seconds && (
                          <Typography><strong>Min Location Duration:</strong> {ruleForm.min_location_duration_seconds} seconds</Typography>
                        )}
                        {ruleForm.auto_deactivate_on_balance_threshold && (
                          <Typography><strong>Auto-Deactivate:</strong> When balance drops below {ruleForm.balance_threshold_xlm} XLM</Typography>
                        )}
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
      <Dialog open={quorumCheckOpen} onClose={() => setQuorumCheckOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Quorum Configuration: {selectedRuleForQuorum?.rule_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={quorumDialogTab} onChange={(e, newValue) => setQuorumDialogTab(newValue)}>
              <Tab label="Configure" />
              <Tab label="Check Status" />
            </Tabs>
          </Box>

          {quorumDialogTab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Quorum Requirements
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure which wallets must be present within the rule's geofence for execution to proceed.
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Required Wallet Public Keys
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Enter wallet public key (G...)"
                    value={newWalletKey}
                    onChange={(e) => setNewWalletKey(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddWalletKey();
                      }
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={startQuorumQRScanner}
                            edge="end"
                            title="Scan QR Code"
                            size="small"
                          >
                            <QrCodeScannerIcon />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddWalletKey}
                    disabled={!newWalletKey.trim() || quorumConfig.required_wallet_public_keys.includes(newWalletKey.trim())}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Box>

                {quorumConfig.required_wallet_public_keys.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {quorumConfig.required_wallet_public_keys.map((key, index) => (
                      <Chip
                        key={index}
                        label={key.length > 20 ? `${key.substring(0, 20)}...` : key}
                        onDelete={() => handleRemoveWalletKey(index)}
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No wallets added. Add wallet public keys to enable quorum requirements.
                  </Typography>
                )}
              </Box>

              {quorumConfig.required_wallet_public_keys.length > 0 && (
                <>
                  <Box sx={{ mb: 3 }}>
                    <TextField
                      fullWidth
                      label="Minimum Wallet Count"
                      type="number"
                      size="small"
                      value={quorumConfig.minimum_wallet_count || ''}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        setQuorumConfig(prev => ({
                          ...prev,
                          minimum_wallet_count: isNaN(value) ? null : value
                        }));
                      }}
                      helperText={`Must be between 1 and ${quorumConfig.required_wallet_public_keys.length}`}
                      inputProps={{ min: 1, max: quorumConfig.required_wallet_public_keys.length }}
                    />
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Quorum Type</InputLabel>
                      <Select
                        value={quorumConfig.quorum_type}
                        label="Quorum Type"
                        onChange={(e) => setQuorumConfig(prev => ({ ...prev, quorum_type: e.target.value }))}
                      >
                        <MenuItem value="any">Any (at least minimum count)</MenuItem>
                        <MenuItem value="all">All (all wallets required)</MenuItem>
                      </Select>
                    </FormControl>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {quorumConfig.quorum_type === 'any' 
                        ? 'Execution requires at least the minimum number of wallets to be in range.'
                        : 'Execution requires all specified wallets to be in range.'}
                    </Typography>
                  </Box>
                </>
              )}

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </Box>
          )}

          {quorumDialogTab === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Current Quorum Status
              </Typography>
              
              {quorumConfig.required_wallet_public_keys.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No quorum requirements configured. Configure quorum requirements in the "Configure" tab first.
                </Alert>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    onClick={handleCheckQuorumStatus}
                    disabled={checkingQuorum}
                    startIcon={checkingQuorum ? <CircularProgress size={20} /> : <VisibilityIcon />}
                    sx={{ mb: 2 }}
                  >
                    {checkingQuorum ? 'Checking...' : 'Check Status'}
                  </Button>

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
                              label={wallet.length > 20 ? `${wallet.substring(0, 20)}...` : wallet}
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
                                label={wallet.length > 20 ? `${wallet.substring(0, 20)}...` : wallet}
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
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuorumCheckOpen(false)}>Cancel</Button>
          {quorumDialogTab === 0 && (
            <Button
              variant="contained"
              onClick={handleSaveQuorumConfig}
              disabled={savingQuorum || (quorumConfig.required_wallet_public_keys.length > 0 && (!quorumConfig.minimum_wallet_count || quorumConfig.minimum_wallet_count <= 0))}
              startIcon={savingQuorum ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            >
              {savingQuorum ? 'Saving...' : 'Save Configuration'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* QR Scanner Dialog for Quorum */}
      <Dialog
        open={isQuorumScannerOpen}
        onClose={() => {
          setIsQuorumScannerOpen(false);
          stopQuorumQRScanner();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CameraAltIcon />
            <Typography variant="h6">Scan QR Code</Typography>
          </Box>
          <IconButton
            onClick={() => {
              setIsQuorumScannerOpen(false);
              stopQuorumQRScanner();
            }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ textAlign: 'center' }}>
          <video
            ref={quorumVideoRef}
            style={{
              width: '100%',
              maxWidth: '500px',
              borderRadius: '8px',
              backgroundColor: '#000'
            }}
            playsInline
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Position the QR code within the frame. Scanning happens automatically.
          </Typography>
          
          {quorumScannerError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {quorumScannerError}
            </Alert>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button
            onClick={() => {
              setIsQuorumScannerOpen(false);
              stopQuorumQRScanner();
            }}
            variant="outlined"
            fullWidth
          >
            Close
          </Button>
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
        open={executeConfirmDialog.open || executingRule}
        onClose={() => {
          // Don't allow closing while executing
          if (executingRule) return;
          setExecuteConfirmDialog({ open: false, rule: null });
          setSecretKeyInput('');
          setShowSecretKey(false);
          setExecutionResult(null); // Clear execution result when closing
        }}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 768}
        PaperProps={{
          sx: {
            m: window.innerWidth < 768 ? 0 : 2,
            maxHeight: window.innerWidth < 768 ? '100vh' : '90vh',
            zIndex: executingRule ? 1600 : 1400 // Higher z-index when executing
          }
        }}
        sx={{
          zIndex: executingRule ? 1600 : 1400 // Higher z-index when executing
        }}
      >
        <DialogTitle sx={{ 
          pb: 1,
          fontSize: window.innerWidth < 768 ? '1.1rem' : '1.25rem',
          fontWeight: 600
        }}>
          {executingRule ? 'Executing Function...' : 'Confirm Function Execution'}
        </DialogTitle>
        <DialogContent 
          ref={executionContentRef}
          dividers 
          sx={{ 
          maxHeight: window.innerWidth < 768 ? 'calc(100vh - 200px)' : '60vh',
          overflowY: 'auto',
          px: window.innerWidth < 768 ? 2 : 3,
          py: 2,
          display: executingRule && !success && !error ? 'block' : 'block' // Ensure proper display
        }}>
          {/* Show execution status and stepper when executing */}
          {executingRule && !success && !error && (
            <>
              {executionStatus && (
                <Alert 
                  severity="info" 
                  sx={{ mb: 2, fontSize: window.innerWidth < 768 ? '0.875rem' : '0.9375rem' }}
                  icon={<CircularProgress size={16} />}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                      {executionStatus}
                    </Typography>
                  </Box>
                </Alert>
              )}
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
                  {executeConfirmDialog.rule && (() => {
                    const rule = executeConfirmDialog.rule;
                    const contract = contracts.find(c => c.id === rule.contract_id);
                    const needsWebAuthn = requiresWebAuthn(rule, contract);
                    return needsWebAuthn ? (
                      <Step>
                        <StepLabel>Authenticating with Passkey</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            Please authenticate with your passkey when prompted...
                          </Typography>
                        </StepContent>
                      </Step>
                    ) : null;
                  })()}
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
                  <Step>
                    <StepLabel>Complete</StepLabel>
                    <StepContent>
                      <Typography variant="body2" color="text.secondary">
                        Transaction confirmed and included in ledger!
                      </Typography>
                    </StepContent>
                  </Step>
                </Stepper>
              </Box>
              {success && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {success}
                  </Typography>
                </Alert>
              )}
              
              {/* Execution Result Details - Show when execution completes successfully */}
              {!executingRule && success && executionResult && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontSize: '1rem', fontWeight: 600 }}>
                    Execution Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Function Name
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                          {executionResult.functionName}
                        </Typography>
                      </Box>
                      
                      {executionResult.transactionHash && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            Transaction Hash
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontFamily: 'monospace', 
                                wordBreak: 'break-all',
                                flex: 1,
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' }
                              }}
                              onClick={() => {
                                navigator.clipboard.writeText(executionResult.transactionHash);
                                setSuccess('Transaction hash copied to clipboard!');
                                setTimeout(() => setSuccess(success), 2000);
                              }}
                            >
                              {executionResult.transactionHash}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => {
                                navigator.clipboard.writeText(executionResult.transactionHash);
                                setSuccess('Transaction hash copied to clipboard!');
                                setTimeout(() => setSuccess(success), 2000);
                              }}
                              sx={{ flexShrink: 0 }}
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      )}
                      
                      {executionResult.stellarExpertUrl && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            View on Stellar Expert
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="body2" 
                              component="a"
                              href={executionResult.stellarExpertUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ 
                                color: 'primary.main',
                                textDecoration: 'none',
                                wordBreak: 'break-all',
                                flex: 1,
                                '&:hover': { textDecoration: 'underline' }
                              }}
                            >
                              {executionResult.stellarExpertUrl}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => {
                                navigator.clipboard.writeText(executionResult.stellarExpertUrl);
                                setSuccess('Stellar Expert URL copied to clipboard!');
                                setTimeout(() => setSuccess(success), 2000);
                              }}
                              sx={{ flexShrink: 0 }}
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      )}
                      
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Network
                        </Typography>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {executionResult.network}
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Execution Type
                        </Typography>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {executionResult.executionType.replace(/_/g, ' ')}
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Timestamp
                        </Typography>
                        <Typography variant="body2">
                          {new Date(executionResult.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Box>
              )}
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {error}
                  </Typography>
                </Alert>
              )}
            </>
          )}
          
          {/* Hide confirmation content - skip straight to execution */}
          {false && !executingRule && !success && !error && executeConfirmDialog.rule && (() => {
            // Early return if executingRule becomes true (defensive check)
            if (executingRule) return null;
            
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
            // Check if payment will route through smart wallet
            // Backend will use config fallback if smart_wallet_contract_id is null
            // So we show the option if use_smart_wallet is true and it's a payment function
            const willRouteThroughSmartWallet = contract?.use_smart_wallet && 
                                                 isPaymentFunction(rule.function_name, functionParams);
            
            // Extract payment details from function parameters
            const paymentDestination = functionParams.destination || functionParams.recipient || functionParams.to || functionParams.to_address || functionParams.destination_address || '';
            const paymentAmount = functionParams.amount || functionParams.value || functionParams.quantity || '';
            const paymentAsset = functionParams.asset || functionParams.asset_address || functionParams.token || 'XLM';
            const isPaymentFunc = isPaymentFunction(rule.function_name, functionParams);
            
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
                
                {/* Payment Details Display */}
                {isPaymentFunc && paymentDestination && (
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                      Payment Details
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">To:</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {paymentDestination}
                        </Typography>
                      </Box>
                      {paymentAmount && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">Amount:</Typography>
                          <Typography variant="body2">
                            {paymentAmount} {paymentAsset}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                )}
                
                {/* Payment Source Selection for Payment Functions */}
                {isPaymentFunc && (
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Payment Source</InputLabel>
                    <Select
                      value={paymentSource}
                      onChange={(e) => setPaymentSource(e.target.value)}
                      label="Payment Source"
                    >
                      <MenuItem value="wallet">
                        From Wallet Balance ({walletBalance ? parseFloat(walletBalance).toFixed(7) : '0.0000000'} XLM)
                      </MenuItem>
                      {willRouteThroughSmartWallet && (
                        <MenuItem value="smart-wallet">
                          From Smart Wallet Balance ({userStake ? parseFloat(userStake).toFixed(7) : '0.0000000'} XLM)
                        </MenuItem>
                      )}
                    </Select>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {paymentSource === 'wallet' 
                        ? 'Pay directly from your Stellar wallet balance'
                        : `Pay from your smart wallet balance (your stake: ${userStake ? parseFloat(userStake).toFixed(7) : '0.0000000'} XLM, requires passkey authentication)`}
                    </Typography>
                    {paymentSource === 'smart-wallet' && userStake && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          Your stake in smart wallet: <strong>{parseFloat(userStake).toFixed(7)} XLM</strong>
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          You can send up to {parseFloat(userStake).toFixed(7)} XLM from your stake.
                        </Typography>
                      </Alert>
                    )}
                  </FormControl>
                )}
                
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
          {/* Hide Cancel and Execute buttons - execution starts automatically */}
          {false && !executingRule && !success && !error && (
            <>
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
                fullWidth={window.innerWidth < 768}
              >
                Execute
              </Button>
            </>
          )}
          {/* Show Executing button ONLY when executing and no success/error */}
          {executingRule && !success && !error && (
            <Button 
              variant="contained" 
              color="primary"
              disabled
              fullWidth
              startIcon={<CircularProgress size={20} color="inherit" />}
            >
              Executing...
            </Button>
          )}
          {(success || error) && (
            <Button 
              variant="contained" 
              color={success ? "success" : "error"}
              onClick={() => {
                setExecuteConfirmDialog({ open: false, rule: null });
                setExecutionStatus('');
                setExecutionStep(0);
                setExecutingRule(false);
                setSuccess('');
                setError('');
                setSecretKeyInput('');
                setShowSecretKey(false);
                setExecutionResult(null); // Clear execution result
              }}
              fullWidth
            >
              Done
            </Button>
          )}
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
                // Pass matched_public_key to reject the specific pending rule for that public key
                await api.post(`/contracts/rules/pending/${ruleToReject.rule_id}/reject`, {
                  matched_public_key: ruleToReject.matched_public_key
                });
                setSuccess(`Pending rule "${ruleToReject.rule_name}" rejected successfully`);
                setTimeout(() => setSuccess(''), 3000);
                loadPendingRules(); // Reload to remove rejected rule
                // Also reload rejected rules if we're on that tab
                if (tabValue === 4) {
                  await loadRejectedRules();
                }
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

      {/* Batch Secret Key Dialog */}
      <Dialog open={batchSecretKeyDialogOpen} onClose={handleBatchSecretKeyCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Enter Secret Key for Batch Execution</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Some of the selected rules require write operations. Please enter your Stellar secret key to proceed with batch execution.
          </Typography>
          <TextField
            fullWidth
            label="Secret Key"
            type={batchSecretKeyShow ? 'text' : 'password'}
            value={batchSecretKeyInput}
            onChange={(e) => setBatchSecretKeyInput(e.target.value)}
            margin="normal"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setBatchSecretKeyShow(!batchSecretKeyShow)}
                    edge="end"
                  >
                    {batchSecretKeyShow ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
            helperText="Your secret key will be used to sign transactions for write operations"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBatchSecretKeyCancel}>Cancel</Button>
          <Button
            onClick={handleBatchSecretKeyConfirm}
            variant="contained"
            color="primary"
            disabled={!batchSecretKeyInput.trim()}
          >
            Continue Execution
          </Button>
        </DialogActions>
      </Dialog>

      {/* GeoLink Agent - Available for both logged-in and logged-out users */}
      <AIChat isPublic={!isAuthenticated} initialOpen={false} />
      </Box>
    </Container>
  );
};

export default ContractManagement;

