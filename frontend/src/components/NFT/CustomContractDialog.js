import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Search as SearchIcon,
  Upload as UploadIcon,
  CloudUpload as CloudUploadIcon
} from '@mui/icons-material';
import api from '../../services/api';

/**
 * CustomContractDialog Component
 * 
 * Allows NFT managers to:
 * 1. Enter a smart contract address
 * 2. Discover contract functions
 * 3. Configure function mappings
 * 4. Save the contract for use in NFT minting
 */
const CustomContractDialog = ({ open, onClose, onContractSaved, editingContract = null }) => {
  const [contractAddress, setContractAddress] = useState('');
  const [contractName, setContractName] = useState('');
  const [network, setNetwork] = useState('testnet');
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discoveredFunctions, setDiscoveredFunctions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [useSmartWallet, setUseSmartWallet] = useState(false);
  const [smartWalletContractId, setSmartWalletContractId] = useState('');
  const [requiresWebAuthn, setRequiresWebAuthn] = useState(false);
  const [wasmUploadOpen, setWasmUploadOpen] = useState(false);
  const [wasmFile, setWasmFile] = useState(null);
  const [uploadingWasm, setUploadingWasm] = useState(false);
  const [needsWasmUpload, setNeedsWasmUpload] = useState(false);

  // Reset form when dialog opens/closes, or load editing contract
  useEffect(() => {
    if (!open) {
      setContractAddress('');
      setContractName('');
      setNetwork('testnet');
      setDiscoveredFunctions([]);
      setError('');
      setSuccess('');
      setUseSmartWallet(false);
      setSmartWalletContractId('');
      setRequiresWebAuthn(false);
      setNeedsWasmUpload(false);
      setWasmFile(null);
      setWasmUploadOpen(false);
    } else if (open && editingContract) {
      // Load editing contract data
      setContractAddress(editingContract.contract_address || '');
      setContractName(editingContract.contract_name || '');
      setNetwork(editingContract.network || 'testnet');
      setUseSmartWallet(editingContract.use_smart_wallet || false);
      setSmartWalletContractId(editingContract.smart_wallet_contract_id || '');
      setRequiresWebAuthn(editingContract.requires_webauthn || false);
      
      // Load discovered functions if available
      if (editingContract.discovered_functions) {
        let functions = editingContract.discovered_functions;
        
        // Parse if it's a string
        if (typeof functions === 'string') {
          try {
            functions = JSON.parse(functions);
          } catch (e) {
            console.error('Error parsing discovered_functions:', e);
            functions = {};
          }
        }
        
        // Convert object to array if needed
        const functionsArray = Array.isArray(functions) 
          ? functions 
          : Object.values(functions || {});
        
        // Ensure each function has parameters array
        const functionsWithParams = functionsArray.map(func => {
          const funcObj = typeof func === 'string' ? { name: func } : func;
          return {
            ...funcObj,
            name: funcObj.name || 'unknown',
            parameters: Array.isArray(funcObj.parameters) ? funcObj.parameters : [],
            return_type: funcObj.return_type || 'void',
            discovered: funcObj.discovered !== undefined ? funcObj.discovered : true,
            note: funcObj.note || 'Extracted from contract spec'
          };
        });
        
        setDiscoveredFunctions(functionsWithParams);
      }
    }
  }, [open, editingContract]);

  const handleDiscover = async () => {
    if (!contractAddress.trim()) {
      setError('Please enter a contract address');
      return;
    }

    // Validate contract address format (Stellar address format)
    if (!/^[A-Z0-9]{56}$/.test(contractAddress.trim())) {
      setError('Invalid contract address format. Must be 56 characters (Stellar address format)');
      return;
    }

    setError('');
    setSuccess('');
    setDiscovering(true);
    setDiscoveredFunctions([]);

    try {
      const response = await api.post('/contracts/discover', {
        contract_address: contractAddress.trim(),
        network
      });

      if (response.data.success) {
        const functions = response.data.functions || [];
        setDiscoveredFunctions(functions);
        
        // Check if all functions are templates (not discovered) with WASM note
        const allTemplates = functions.length > 0 && functions.every(func => 
          !func.discovered && 
          (func.note?.toLowerCase().includes('wasm') || 
           func.note?.toLowerCase().includes('upload') ||
           func.note?.toLowerCase().includes('no wasm'))
        );
        
        if (allTemplates) {
          // This is a template response - show WASM upload prompt
          setNeedsWasmUpload(true);
          setError('WASM file required for function discovery. Please upload your contract WASM file to discover functions.');
          setDiscoveredFunctions([]); // Don't show template functions
          setSuccess(''); // Clear any success message
        } else if (functions.length > 0) {
          // Real functions discovered
          setDiscoveredFunctions(functions);
          setSuccess(`Discovered ${response.data.discovered_count || functions.length} function(s)`);
          setNeedsWasmUpload(false);
        } else {
          // No functions found
          setDiscoveredFunctions([]);
          setNeedsWasmUpload(true);
          setError('No functions discovered. Please upload WASM file to enable function discovery.');
        }
      } else {
        setError('Failed to discover functions');
      }
    } catch (err) {
      console.error('Error discovering contract:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to discover contract functions';
      setError(errorMessage);
      
      // Check if error indicates WASM file is needed
      if (errorMessage.includes('WASM') || errorMessage.includes('wasm') || 
          errorMessage.includes('No WASM file found') || 
          errorMessage.includes('upload WASM')) {
        setNeedsWasmUpload(true);
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handleWasmUpload = async () => {
    if (!wasmFile || !contractAddress.trim()) {
      setError('Please select a WASM file');
      return;
    }

    setError('');
    setUploadingWasm(true);

    try {
      const formData = new FormData();
      formData.append('wasm', wasmFile); // Note: backend expects 'wasm' field name

      // First, check if contract exists, if not create it
      let contractId = null;
      try {
        const contractsResponse = await api.get('/contracts');
        const existingContract = contractsResponse.data.contracts?.find(
          c => c.contract_address === contractAddress.trim()
        );
        
        if (existingContract) {
          contractId = existingContract.id;
        } else {
          // Create contract first
          const createResponse = await api.post('/contracts', {
            contract_address: contractAddress.trim(),
            contract_name: contractName.trim() || null,
            network,
            discovered_functions: {},
            function_mappings: {}
          });
          contractId = createResponse.data.contract?.id;
        }
      } catch (createErr) {
        console.error('Error creating/finding contract:', createErr);
        throw new Error('Failed to create or find contract');
      }

      if (!contractId) {
        throw new Error('Contract ID not found');
      }

      // Upload WASM
      const response = await api.post(`/contracts/${contractId}/upload-wasm`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setSuccess('WASM file uploaded successfully! Now discovering functions...');
        setWasmUploadOpen(false);
        setNeedsWasmUpload(false);
        setWasmFile(null);
        
        // Automatically retry discovery
        setTimeout(() => {
          handleDiscover();
        }, 1000);
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

  const handleSave = async () => {
    if (!contractAddress.trim()) {
      setError('Please enter a contract address');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      // Ensure all functions have their parameters preserved
      const functionsToSave = discoveredFunctions.map(func => ({
        ...func,
        // Ensure parameters array exists and is preserved
        parameters: Array.isArray(func.parameters) ? func.parameters : [],
        // Ensure other required fields
        name: func.name || 'unknown',
        return_type: func.return_type || 'void',
        discovered: func.discovered !== undefined ? func.discovered : true,
        note: func.note || 'Extracted from contract spec'
      }));
      
      console.log('[CustomContractDialog] Saving functions with parameters:', functionsToSave.map(f => ({
        name: f.name,
        paramCount: f.parameters?.length || 0,
        params: f.parameters
      })));
      
      const contractData = {
        contract_address: contractAddress.trim(),
        contract_name: contractName.trim() || null,
        network,
        discovered_functions: functionsToSave.reduce((acc, func) => {
          acc[func.name] = func;
          return acc;
        }, {}),
        function_mappings: editingContract?.function_mappings || {}, // Preserve existing mappings when editing
        use_smart_wallet: useSmartWallet,
        smart_wallet_contract_id: smartWalletContractId.trim() || null,
        requires_webauthn: requiresWebAuthn
      };

      let response;
      if (editingContract) {
        // Update existing contract
        response = await api.put(`/contracts/${editingContract.id}`, contractData);
      } else {
        // Create new contract
        response = await api.post('/contracts', contractData);
      }

      if (response.data.success) {
        setSuccess(editingContract ? 'Contract updated successfully!' : 'Contract saved successfully!');
        if (onContractSaved) {
          onContractSaved(response.data.contract);
        }
        // Close dialog after a short delay
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError('Failed to save contract');
      }
    } catch (err) {
      console.error('Error saving contract:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <SearchIcon />
          <Typography variant="h6">
            {editingContract ? 'Edit Smart Contract' : 'Add Custom Smart Contract'}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
          {/* Contract Address */}
          <TextField
            label="Contract Address"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value.toUpperCase())}
            placeholder="Enter Stellar contract address (56 characters)"
            fullWidth
            required
            helperText="The Stellar address of your smart contract"
            error={contractAddress.length > 0 && !/^[A-Z0-9]{56}$/.test(contractAddress)}
          />

          {/* Contract Name */}
          <TextField
            label="Contract Name (Optional)"
            value={contractName}
            onChange={(e) => setContractName(e.target.value)}
            placeholder="e.g., My Custom NFT Contract"
            fullWidth
            helperText="A friendly name for this contract"
          />

          {/* Network */}
          <TextField
            label="Network"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            select
            SelectProps={{ native: true }}
            fullWidth
          >
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet</option>
          </TextField>

          {/* Discover Button */}
          <Button
            variant="contained"
            onClick={handleDiscover}
            disabled={discovering || !contractAddress.trim()}
            startIcon={discovering ? <CircularProgress size={20} /> : <SearchIcon />}
            fullWidth
          >
            {discovering ? 'Discovering Functions...' : 'Discover Contract Functions'}
          </Button>

          {/* Discovered Functions */}
          {discoveredFunctions.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Discovered Functions ({discoveredFunctions.length})
              </Typography>
              {discoveredFunctions.map((func, index) => (
                <Accordion key={index} sx={{ mb: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1} width="100%">
                      {func.discovered ? (
                        <CheckCircleIcon color="success" />
                      ) : (
                        <ErrorIcon color="warning" />
                      )}
                      <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                        {func.name}
                      </Typography>
                      <Chip 
                        label={func.discovered ? 'Discovered' : 'Manual'} 
                        size="small"
                        color={func.discovered ? 'success' : 'warning'}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {func.note || 'No additional information'}
                      </Typography>
                      {func.parameters && func.parameters.length > 0 && (
                        <Box mt={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Parameters:
                          </Typography>
                          {func.parameters.map((param, pIndex) => (
                            <Chip
                              key={pIndex}
                              label={`${param.name}: ${param.type}`}
                              size="small"
                              sx={{ mr: 1, mb: 1 }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}

          {/* Smart Wallet Integration */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">Smart Wallet Integration (Optional)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={useSmartWallet}
                      onChange={(e) => setUseSmartWallet(e.target.checked)}
                    />
                  }
                  label="Use Smart Wallet for Payments"
                />
                {useSmartWallet && (
                  <TextField
                    label="Smart Wallet Contract ID"
                    value={smartWalletContractId}
                    onChange={(e) => setSmartWalletContractId(e.target.value)}
                    placeholder="Enter smart wallet contract address"
                    fullWidth
                    helperText="The contract address of the smart wallet to use for payments"
                  />
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={requiresWebAuthn}
                      onChange={(e) => setRequiresWebAuthn(e.target.checked)}
                      disabled={!useSmartWallet}
                    />
                  }
                  label="Require WebAuthn/Passkey Authentication"
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Error/Success Messages */}
          {error && (
            <Alert 
              severity="error" 
              onClose={() => {
                setError('');
                setNeedsWasmUpload(false);
              }}
              action={
                needsWasmUpload && (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setWasmUploadOpen(true)}
                    startIcon={<CloudUploadIcon />}
                  >
                    Upload WASM
                  </Button>
                )
              }
            >
              {error}
              {needsWasmUpload && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    To discover contract functions, please upload the WASM file for this contract.
                  </Typography>
                </Box>
              )}
            </Alert>
          )}
          {success && (
            <Alert severity="success" onClose={() => setSuccess('')}>
              {success}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !contractAddress.trim()}
          startIcon={saving ? <CircularProgress size={20} /> : null}
        >
          {saving ? 'Saving...' : 'Save Contract'}
        </Button>
      </DialogActions>

      {/* WASM Upload Dialog */}
      <Dialog open={wasmUploadOpen} onClose={() => setWasmUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload WASM File</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Upload the compiled WASM file for contract <strong>{contractAddress || 'N/A'}</strong>.
              This will enable automatic function discovery.
            </Typography>
            
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
              fullWidth
            >
              {wasmFile ? wasmFile.name : 'Select WASM File'}
              <input
                type="file"
                hidden
                accept=".wasm"
                onChange={(e) => setWasmFile(e.target.files[0])}
              />
            </Button>
            
            {wasmFile && (
              <Typography variant="caption" color="text.secondary">
                Selected: {wasmFile.name} ({(wasmFile.size / 1024).toFixed(2)} KB)
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setWasmUploadOpen(false);
            setWasmFile(null);
          }}>
            Cancel
          </Button>
          <Button
            onClick={handleWasmUpload}
            variant="contained"
            disabled={!wasmFile || uploadingWasm}
            startIcon={uploadingWasm ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {uploadingWasm ? 'Uploading...' : 'Upload & Discover'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default CustomContractDialog;

