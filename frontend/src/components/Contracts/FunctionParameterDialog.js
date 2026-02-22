/**
 * Function Parameter Dialog
 * Prompts user to enter required function parameters before execution
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Divider,
  IconButton,
  InputAdornment
} from '@mui/material';
import { Code, QrCodeScanner, CameraAlt, Close } from '@mui/icons-material';

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
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTargetParam, setScannerTargetParam] = useState(null);
  const [scannerError, setScannerError] = useState('');
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);

  // Initialize param values from existing params or defaults
  useEffect(() => {
    if (open && parameters.length > 0) {
      const initialValues = {};
      parameters.forEach(param => {
        const paramName = param.name || param.parameter_name;
        const paramType = param.type || param.parameter_type || 'String';
        
        // Use existing value if available
        if (existingParams[paramName] !== undefined) {
          let value = existingParams[paramName];
          
          // For amount fields, convert from stroops to XLM for display
          if ((paramName === 'amount' || paramName === 'value' || paramName === 'quantity') && 
              (paramType.includes('I128') || paramType.includes('U128') || paramType.includes('i128') || paramType.includes('u128'))) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue >= 1000000) {
              // Likely in stroops, convert to XLM for display
              value = (numValue / 10000000).toString();
              console.log(`[FunctionParameterDialog] Converted ${paramName} from stroops (${numValue}) to XLM (${value}) for display`);
            }
          }
          
          initialValues[paramName] = value;
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
      // Convert amount fields from XLM to stroops before sending to backend
      const convertedParams = { ...paramValues };
      parameters.forEach(param => {
        const paramName = param.name || param.parameter_name;
        const paramType = param.type || param.parameter_type || 'String';
        
        // For amount fields, convert from XLM to stroops
        if ((paramName === 'amount' || paramName === 'value' || paramName === 'quantity') && 
            (paramType.includes('I128') || paramType.includes('U128') || paramType.includes('i128') || paramType.includes('u128'))) {
          const value = convertedParams[paramName];
          if (value && value !== '') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              // If value is less than 1,000,000, assume it's in XLM and convert to stroops
              // If value is >= 1,000,000, assume it's already in stroops
              if (numValue < 1000000) {
                convertedParams[paramName] = Math.floor(numValue * 10000000).toString();
                console.log(`[FunctionParameterDialog] Converted ${paramName} from XLM (${numValue}) to stroops (${convertedParams[paramName]})`);
              } else {
                // Already in stroops, keep as is
                convertedParams[paramName] = Math.floor(numValue).toString();
              }
            }
          }
        }
      });
      onConfirm(convertedParams);
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
      return 'Amount in XLM (will be automatically converted to stroops when executing)';
    }
    
    return `Type: ${paramType}`;
  };

  // Filter out WebAuthn parameters (they're auto-generated)
  const visibleParams = parameters.filter(param => {
    const paramName = param.name || param.parameter_name;
    return !['webauthn_signature', 'webauthn_authenticator_data', 
             'webauthn_client_data', 'signature_payload'].includes(paramName);
  });

  // Start QR scanner for address fields
  const startQRScanner = async (paramName) => {
    try {
      // Dynamically import qr-scanner
      const QrScanner = (await import('qr-scanner')).default;
      
      // Check if camera is available
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setScannerError('No camera found on this device');
        setIsScannerOpen(true);
        return;
      }

      setScannerTargetParam(paramName);
      setIsScannerOpen(true);
      setScannerError('');

      // Wait for dialog to render, then start scanner
      setTimeout(async () => {
        try {
          if (videoRef.current) {
            const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
            if (!isSecure) {
              setScannerError('Camera access requires HTTPS. Please use the secure version of the site.');
              setIsScannerOpen(false);
              return;
            }
            
            const scanner = new QrScanner(
              videoRef.current,
              (result) => {
                console.log('QR Code detected for', paramName, ':', result);
                handleParamChange(paramName, result.data);
                setIsScannerOpen(false);
                stopQRScanner();
              },
              {
                highlightScanRegion: true,
                highlightCodeOutline: true,
                preferredCamera: 'environment',
                maxScansPerSecond: 5,
              }
            );
            
            qrScannerRef.current = scanner;
            await scanner.start();
          }
        } catch (error) {
          console.error('Error starting QR scanner:', error);
          setScannerError('Failed to start camera. Please check permissions.');
        }
      }, 100);
    } catch (error) {
      console.error('Error loading QR scanner:', error);
      setScannerError('QR scanner not available. Please install qr-scanner package.');
      setIsScannerOpen(true);
    }
  };

  // Stop QR scanner
  const stopQRScanner = () => {
    if (qrScannerRef.current) {
      try {
        qrScannerRef.current.stop();
        qrScannerRef.current.destroy();
      } catch (e) {
        console.warn('Error stopping QR scanner:', e);
      }
      qrScannerRef.current = null;
    }
  };

  // Cleanup scanner on unmount or dialog close
  useEffect(() => {
    if (!isScannerOpen) {
      stopQRScanner();
    }
    return () => {
      stopQRScanner();
    };
  }, [isScannerOpen]);

  return (
    <>
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{ zIndex: 1400 }} // Higher than contract details overlay (1300)
      PaperProps={{ sx: { zIndex: 1400 } }}
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
                
                // Check if this is an address field
                const isAddressType = paramType.includes('Address') || paramType.includes('address') || 
                                     paramName.includes('address') || paramName.includes('destination') || 
                                     paramName === 'to' || paramName === 'recipient';
                
                // Check if this is an amount field (for XLM display)
                const isAmountField = paramName === 'amount' || paramName === 'value' || paramName === 'quantity';

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
                        label={`${paramName} ${!isOptional && '*'}`}
                        value={value}
                        onChange={(e) => handleParamChange(paramName, e.target.value)}
                        type={inputType === 'number' ? 'number' : 'text'}
                        error={hasError}
                        helperText={hasError ? error : getHelperText(param, paramName)}
                        placeholder={paramName === 'destination' ? 'G...' : paramName === 'amount' ? '0.0' : ''}
                        InputProps={{
                          startAdornment: isAddressType ? (
                            <Chip label="Address" size="small" sx={{ mr: 1 }} />
                          ) : isAmountField ? (
                            <InputAdornment position="start">
                              <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                                XLM
                              </Typography>
                            </InputAdornment>
                          ) : null,
                          endAdornment: isAddressType ? (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => startQRScanner(paramName)}
                                edge="end"
                                title="Scan QR Code"
                                size="small"
                              >
                                <QrCodeScanner fontSize="small" />
                              </IconButton>
                            </InputAdornment>
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

    {/* QR Scanner Dialog */}
    <Dialog
      open={isScannerOpen}
      onClose={() => {
        setIsScannerOpen(false);
        stopQRScanner();
      }}
      maxWidth="sm"
      fullWidth
      sx={{ zIndex: 1500 }} // Higher than parameter dialog
      PaperProps={{ sx: { zIndex: 1500 } }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CameraAlt />
          <Typography variant="h6">Scan QR Code</Typography>
          {scannerTargetParam && (
            <Typography variant="body2" color="text.secondary">
              for {scannerTargetParam}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={() => {
            setIsScannerOpen(false);
            stopQRScanner();
          }}
          size="small"
        >
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ textAlign: 'center' }}>
        <video
          ref={videoRef}
          style={{
            width: '100%',
            maxWidth: '400px',
            height: '300px',
            borderRadius: '8px',
            background: '#000',
            objectFit: 'cover'
          }}
          playsInline
        />
        {scannerError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {scannerError}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Position the QR code within the frame
        </Typography>
      </DialogContent>
      
      <DialogActions>
        <Button
          onClick={() => {
            setIsScannerOpen(false);
            stopQRScanner();
          }}
          variant="outlined"
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default FunctionParameterDialog;
