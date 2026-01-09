import React, { useState, useEffect } from 'react';
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
  MenuItem
} from '@mui/material';
import {
  ExpandMore,
  Code,
  PlayArrow,
  LocationOn,
  CheckCircle,
  Cancel,
  SmartToy
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const ContractDetailsOverlay = ({ open, onClose, item, itemType = 'nft' }) => {
  const { publicKey, isConnected, secretKey } = useWallet();
  const { user } = useAuth();
  const [contract, setContract] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [distance, setDistance] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [functionParams, setFunctionParams] = useState({});
  const [expandedFunction, setExpandedFunction] = useState(null);

  useEffect(() => {
    if (open && item) {
      // Get contract info from item
      if (item.contract) {
        setContract(item.contract);
      } else if (item.contract_id || item.contract_address) {
        // Fetch contract details
        fetchContractDetails(item.contract_id || item.contract_address);
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
          },
          (error) => {
            console.warn('Error getting user location:', error);
          }
        );
      }
    }
  }, [open, item]);

  const fetchContractDetails = async (contractIdOrAddress) => {
    try {
      // Try to get by ID first
      const response = await api.get(`/contracts/${contractIdOrAddress}`);
      if (response.data.success && response.data.contract) {
        setContract(response.data.contract);
      }
    } catch (error) {
      console.error('Error fetching contract details:', error);
    }
  };

  const checkProximity = (userLoc, targetItem) => {
    if (!targetItem.latitude || !targetItem.longitude) return;

    const R = 6371000; // Earth's radius in meters
    const lat1 = userLoc.latitude * Math.PI / 180;
    const lat2 = targetItem.latitude * Math.PI / 180;
    const deltaLat = (targetItem.latitude - userLoc.latitude) * Math.PI / 180;
    const deltaLon = (targetItem.longitude - userLoc.longitude) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    setDistance(dist);

    // Check if within range (use radius_meters for NFTs, or default 100m for wallets)
    const radius = targetItem.radius_meters || targetItem.radius || 100;
    setIsWithinRange(dist <= radius);
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

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
      const discoveredFunction = contract.discovered_functions?.find(f => f.name === selectedFunction);

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
  const itemRadius = item.radius_meters || item.radius || 100;
  const distanceText = distance 
    ? distance < 1000 
      ? `${Math.round(distance)}m` 
      : `${(distance / 1000).toFixed(2)}km`
    : 'Unknown';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <Code />
            <Typography variant="h6">
              {itemType === 'nft' ? 'NFT' : 'Wallet'} Contract Details
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
      </DialogTitle>

      <DialogContent>
        {/* Item Information */}
        <Box mb={3}>
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
              Location: {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
            </Typography>
          )}
          {itemRadius && (
            <Typography variant="body2" color="text.secondary">
              Range: {itemRadius}m
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Contract Information */}
        {contract ? (
          <>
            <Box mb={2}>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Smart Contract</strong>
              </Typography>
              <Typography variant="body2">
                <strong>Name:</strong> {contract.name || contract.contract_name || 'Unnamed Contract'}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                <strong>Address:</strong> {contract.address || contract.contract_address}
              </Typography>
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

            {/* Contract Functions */}
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

