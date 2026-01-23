/**
 * Function Parameter Dialog
 * Prompts user to enter required function parameters before execution
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider
} from '@mui/material';
import { Code, Info } from '@mui/icons-material';

const FunctionParameterDialog = ({ 
  open, 
  onClose, 
  onConfirm, 
  functionName, 
  parameters = [], 
  existingParams = {},
  contractName = null
}) => {
  const [paramValues, setParamValues] = useState({});
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Initialize param values from existing params or defaults
  useEffect(() => {
    if (open && parameters.length > 0) {
      const initialValues = {};
      parameters.forEach(param => {
        const paramName = param.name || param.parameter_name;
        const paramType = param.type || param.parameter_type || 'String';
        
        // Use existing value if available
        if (existingParams[paramName] !== undefined) {
          initialValues[paramName] = existingParams[paramName];
        } else {
          // Set default based on type
          if (paramType.includes('Address') || paramType.includes('address')) {
            initialValues[paramName] = '';
          } else if (paramType.includes('u32') || paramType.includes('i32') || paramType.includes('I128') || paramType.includes('U128')) {
            initialValues[paramName] = '';
          } else if (paramType.includes('bool') || paramType.includes('Bool')) {
            initialValues[paramName] = 'false';
          } else {
            initialValues[paramName] = '';
          }
        }
      });
      setParamValues(initialValues);
      setErrors({});
      setTouched({});
    }
  }, [open, parameters, existingParams]);

  const handleParamChange = (paramName, value) => {
    setParamValues(prev => ({ ...prev, [paramName]: value }));
    
    // Clear error when user starts typing
    if (errors[paramName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[paramName];
        return newErrors;
      });
    }
    
    setTouched(prev => ({ ...prev, [paramName]: true }));
  };

  const validateParams = () => {
    const newErrors = {};
    
    parameters.forEach(param => {
      const paramName = param.name || param.parameter_name;
      const paramType = param.type || param.parameter_type || 'String';
      const value = paramValues[paramName];
      
      // Check if required (not WebAuthn params, not optional)
      const isWebAuthnParam = ['webauthn_signature', 'webauthn_authenticator_data', 
                                'webauthn_client_data', 'signature_payload'].includes(paramName);
      const isOptional = param.optional || paramName.includes('optional');
      
      if (!isWebAuthnParam && !isOptional) {
        if (!value || value.trim() === '') {
          newErrors[paramName] = `${paramName} is required`;
        } else {
          // Type-specific validation
          if (paramType.includes('Address') || paramName.includes('address') || paramName.includes('destination')) {
            // Stellar address validation (starts with G)
            if (!value.startsWith('G') && !value.startsWith('C')) {
              newErrors[paramName] = 'Must be a valid Stellar address (starts with G or C)';
            } else if (value.length < 56) {
              newErrors[paramName] = 'Stellar address must be 56 characters';
            }
          } else if (paramType.includes('u32') || paramType.includes('i32') || paramType.includes('I128') || paramType.includes('U128')) {
            // Number validation
            if (isNaN(value) && value !== '') {
              newErrors[paramName] = 'Must be a valid number';
            } else if (value !== '' && parseFloat(value) < 0 && paramType.includes('u')) {
              newErrors[paramName] = 'Must be a positive number';
            }
          } else if (paramType.includes('bool') || paramType.includes('Bool')) {
            // Boolean validation
            if (value !== 'true' && value !== 'false') {
              newErrors[paramName] = 'Must be true or false';
            }
          }
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (validateParams()) {
      onConfirm(paramValues);
    }
  };

  const getInputType = (paramType, paramName) => {
    if (paramType.includes('bool') || paramType.includes('Bool')) {
      return 'select';
    } else if (paramType.includes('u32') || paramType.includes('i32') || paramType.includes('I128') || paramType.includes('U128')) {
      return 'number';
    }
    return 'text';
  };

  const getHelperText = (param, paramName) => {
    const paramType = param.type || param.parameter_type || 'String';
    const isWebAuthnParam = ['webauthn_signature', 'webauthn_authenticator_data', 
                              'webauthn_client_data', 'signature_payload'].includes(paramName);
    
    if (isWebAuthnParam) {
      return 'Will be generated automatically during WebAuthn authentication';
    }
    
    if (paramName === 'destination' || paramName === 'to' || paramName === 'recipient') {
      return 'Stellar address (starts with G or C, 56 characters)';
    }
    
    if (paramName === 'amount' || paramName === 'value' || paramName === 'quantity') {
      return 'Amount in XLM (will be converted to stroops)';
    }
    
    return `Type: ${paramType}`;
  };

  // Filter out WebAuthn parameters (they're auto-generated)
  const visibleParams = parameters.filter(param => {
    const paramName = param.name || param.parameter_name;
    return !['webauthn_signature', 'webauthn_authenticator_data', 
             'webauthn_client_data', 'signature_payload'].includes(paramName);
  });

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Code />
          <Typography variant="h6">
            Enter Function Parameters
          </Typography>
        </Box>
        {contractName && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Contract: {contractName}
          </Typography>
        )}
      </DialogTitle>
      
      <DialogContent>
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Function: <strong style={{ fontFamily: 'monospace' }}>{functionName}</strong>
          </Typography>
          {visibleParams.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              This function requires no parameters.
            </Alert>
          )}
        </Box>

        {visibleParams.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" flexDirection="column" gap={2}>
              {visibleParams.map((param, index) => {
                const paramName = param.name || param.parameter_name;
                const paramType = param.type || param.parameter_type || 'String';
                const isOptional = param.optional || paramName.includes('optional');
                const inputType = getInputType(paramType, paramName);
                const value = paramValues[paramName] || '';
                const error = errors[paramName];
                const hasError = touched[paramName] && !!error;

                return (
                  <Box key={index}>
                    {inputType === 'select' && paramType.includes('bool') ? (
                      <FormControl fullWidth error={hasError}>
                        <InputLabel>{paramName} {!isOptional && '*'}</InputLabel>
                        <Select
                          value={value}
                          onChange={(e) => handleParamChange(paramName, e.target.value)}
                          label={`${paramName} ${!isOptional ? '*' : ''}`}
                        >
                          <MenuItem value="true">true</MenuItem>
                          <MenuItem value="false">false</MenuItem>
                        </Select>
                        {hasError && (
                          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                            {error}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                          {getHelperText(param, paramName)}
                        </Typography>
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        label={`${paramName} ${!isOptional ? '*' : ''}`}
                        value={value}
                        onChange={(e) => handleParamChange(paramName, e.target.value)}
                        type={inputType === 'number' ? 'number' : 'text'}
                        error={hasError}
                        helperText={hasError ? error : getHelperText(param, paramName)}
                        placeholder={paramName === 'destination' ? 'G...' : paramName === 'amount' ? '0.0' : ''}
                        InputProps={{
                          startAdornment: paramName === 'destination' || paramName === 'to' ? (
                            <Chip label="Address" size="small" sx={{ mr: 1 }} />
                          ) : null
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        {Object.keys(errors).length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Please fix the errors above before proceeding.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained" 
          color="primary"
          disabled={visibleParams.length > 0 && Object.keys(errors).length > 0}
        >
          Confirm & Execute
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FunctionParameterDialog;
