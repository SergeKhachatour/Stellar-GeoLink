import React, { useState, useEffect } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Button,
  Chip,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import api from '../../services/api';
import CustomContractDialog from './CustomContractDialog';

/**
 * CustomContractSelector Component
 * 
 * Allows NFT managers to select from:
 * 1. Default GeoLink contract
 * 2. Their custom saved contracts
 * 3. Add a new custom contract
 */
const CustomContractSelector = ({ 
  value, 
  onChange, 
  label = "Select Contract",
  showDefault = true,
  defaultContractId = null
}) => {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await api.get('/contracts');
      
      if (response.data.success) {
        setContracts(response.data.contracts || []);
      } else {
        setError('Failed to load contracts');
      }
    } catch (err) {
      console.error('Error loading contracts:', err);
      setError(err.response?.data?.error || 'Failed to load custom contracts');
    } finally {
      setLoading(false);
    }
  };

  const handleContractSaved = (newContract) => {
    // Reload contracts list
    loadContracts();
    // Optionally select the newly saved contract
    if (onChange && newContract) {
      onChange(`custom_${newContract.id}`);
    }
  };

  const handleChange = (event) => {
    const selectedValue = event.target.value;
    if (onChange) {
      onChange(selectedValue);
    }
  };

  // Build options list
  const options = [];
  
  if (showDefault && defaultContractId) {
    options.push({
      value: `default_${defaultContractId}`,
      label: 'Default GeoLink Contract',
      isDefault: true
    });
  }

  contracts.forEach(contract => {
    options.push({
      value: `custom_${contract.id}`,
      label: contract.contract_name || contract.contract_address.substring(0, 8) + '...',
      contract: contract,
      isDefault: false
    });
  });

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <FormControl fullWidth sx={{ minWidth: 200 }}>
          <InputLabel id="contract-selector-label">{label}</InputLabel>
          <Select
            labelId="contract-selector-label"
            id="contract-selector"
            value={value || ''}
            label={label}
            onChange={handleChange}
            disabled={loading}
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                <Box display="flex" alignItems="center" gap={1} width="100%">
                  {option.isDefault && (
                    <CheckCircleIcon color="primary" fontSize="small" />
                  )}
                  <Typography variant="body1" sx={{ flexGrow: 1 }}>
                    {option.label}
                  </Typography>
                  {!option.isDefault && option.contract && (
                    <Chip
                      label={option.contract.network}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ ml: 2 }}
        >
          Add Contract
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Show selected contract details */}
      {value && value.startsWith('custom_') && (
        <Box mt={1}>
          {(() => {
            const contractId = value.replace('custom_', '');
            const contract = contracts.find(c => c.id.toString() === contractId);
            if (contract) {
              return (
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Contract:</strong> {contract.contract_address}
                  </Typography>
                  {contract.contract_name && (
                    <Typography variant="body2">
                      <strong>Name:</strong> {contract.contract_name}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    <strong>Network:</strong> {contract.network}
                  </Typography>
                  {contract.use_smart_wallet && (
                    <Typography variant="body2" color="success.main">
                      <strong>Smart Wallet:</strong> Enabled
                    </Typography>
                  )}
                </Alert>
              );
            }
            return null;
          })()}
        </Box>
      )}

      <CustomContractDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onContractSaved={handleContractSaved}
      />
    </Box>
  );
};

export default CustomContractSelector;

