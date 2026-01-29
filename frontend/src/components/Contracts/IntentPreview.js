/**
 * Intent Preview Component
 * Shows ContractCallIntent details before execution
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckCircleIcon,
  Security as SecurityIcon,
  Schedule as ScheduleIcon,
  Fingerprint as FingerprintIcon
} from '@mui/icons-material';
import { encodeIntentBytes, challengeFromIntent } from '../../services/intentService';
import { arrayBufferToBase64 } from '../../services/passkeyService';

const IntentPreview = ({ open, onClose, intent, onConfirm, loading = false }) => {
  const [intentBytes, setIntentBytes] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [copied, setCopied] = useState({});
  const [editableArgs, setEditableArgs] = useState([]);
  const [modifiedIntent, setModifiedIntent] = useState(null);

  useEffect(() => {
    if (open && intent) {
      // Initialize editable args from intent
      setEditableArgs(intent.args ? [...intent.args] : []);
      setModifiedIntent(null);
      loadIntentDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intent]);

  const loadIntentDetails = async (intentToEncode = null) => {
    try {
      // Use provided intent, modified intent, or original intent
      const intentToUse = intentToEncode || modifiedIntent || intent;
      if (!intentToUse) return;
      
      const bytes = await encodeIntentBytes(intentToUse);
      setIntentBytes(bytes);
      
      const challenge32 = await challengeFromIntent(bytes);
      setChallenge(challenge32);
    } catch (error) {
      console.error('Failed to load intent details:', error);
    }
  };

  // Update intent details when editable args change (debounced)
  useEffect(() => {
    if (editableArgs.length > 0 && intent) {
      const updatedIntent = {
        ...intent,
        args: editableArgs
      };
      setModifiedIntent(updatedIntent);
      
      // Debounce the reload to avoid too many recalculations
      const timeoutId = setTimeout(() => {
        loadIntentDetails(updatedIntent);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableArgs]);

  const handleArgChange = (index, newValue) => {
    const updatedArgs = [...editableArgs];
    updatedArgs[index] = {
      ...updatedArgs[index],
      value: newValue
    };
    setEditableArgs(updatedArgs);
  };

  const getDisplayType = (arg) => {
    // Check if type includes Address (case-insensitive)
    const type = arg.type || 'String';
    const name = (arg.name || '').toLowerCase();
    
    // Check type first
    if (type.toLowerCase().includes('address')) {
      return 'Address';
    }
    
    // Also check parameter name for common address field names
    const addressFieldNames = ['address', 'destination', 'recipient', 'to', 'signer_address', 'signer', 'from', 'sender'];
    if (addressFieldNames.some(fieldName => name.includes(fieldName))) {
      return 'Address';
    }
    
    return type;
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [key]: true });
    setTimeout(() => {
      setCopied({ ...copied, [key]: false });
    }, 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    return Array.from(bytes.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ') + (bytes.length > 16 ? '...' : '');
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const getExpirationTime = () => {
    if (!intent?.exp) return 'N/A';
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = intent.exp - now;
    if (secondsLeft <= 0) return 'Expired';
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${minutes}m ${seconds}s`;
  };

  if (!intent) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          <Typography variant="h6">Contract Call Intent Preview</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Review the intent details before confirming. This intent will be used to create a deterministic challenge for WebAuthn authentication.
        </Alert>

        {/* Intent Summary */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Intent Summary
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Chip 
                label={`Version ${intent.v}`} 
                size="small" 
                color="primary" 
              />
              <Chip 
                label={intent.network} 
                size="small" 
                variant="outlined" 
              />
              <Chip 
                label={intent.authMode === 'webauthn' ? 'WebAuthn' : 'Classic'} 
                size="small" 
                icon={intent.authMode === 'webauthn' ? <FingerprintIcon /> : <SecurityIcon />}
                color={intent.authMode === 'webauthn' ? 'success' : 'default'}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Contract</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {intent.contractId}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Function</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {intent.fn}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Signer</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {intent.signer.substring(0, 12)}...{intent.signer.substring(44)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Expires In</Typography>
                <Typography variant="body2" color={intent.exp <= Math.floor(Date.now() / 1000) ? 'error.main' : 'text.primary'}>
                  {getExpirationTime()}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Arguments */}
        {intent.args && intent.args.length > 0 && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                Arguments ({intent.args.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editableArgs.map((arg, index) => {
                  const displayType = getDisplayType(arg);
                  const isAddressType = displayType === 'Address';
                  const isNumberType = displayType.includes('I128') || displayType.includes('U128') || 
                                     displayType.includes('u32') || displayType.includes('i32');
                  
                  return (
                    <TextField
                      key={index}
                      fullWidth
                      label={arg.name}
                      value={arg.value || ''}
                      onChange={(e) => handleArgChange(index, e.target.value)}
                      type={isNumberType ? 'number' : 'text'}
                      helperText={`Type: ${displayType}`}
                      InputProps={{
                        startAdornment: isAddressType ? (
                          <InputAdornment position="start">
                            <Chip label="Address" size="small" sx={{ mr: 1 }} />
                          </InputAdornment>
                        ) : null
                      }}
                      sx={{
                        '& .MuiInputBase-root': {
                          fontFamily: isAddressType ? 'monospace' : 'inherit'
                        }
                      }}
                    />
                  );
                })}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Security Details */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              Security Details
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    Nonce (Anti-Replay)
                  </Typography>
                  <Tooltip title={copied.nonce ? 'Copied!' : 'Copy'}>
                    <IconButton 
                      size="small" 
                      onClick={() => copyToClipboard(intent.nonce, 'nonce')}
                    >
                      {copied.nonce ? <CheckCircleIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', bgcolor: 'background.default', p: 1, borderRadius: 1 }}>
                  {intent.nonce}
                </Typography>
              </Box>

              <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  Timestamps
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Issued At</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {formatTimestamp(intent.iat)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Expires At</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {formatTimestamp(intent.exp)}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {intentBytes && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">
                      Intent Bytes (First 16 bytes)
                    </Typography>
                    <Tooltip title={copied.intentBytes ? 'Copied!' : 'Copy'}>
                      <IconButton 
                        size="small" 
                        onClick={() => copyToClipboard(arrayBufferToBase64(intentBytes.buffer), 'intentBytes')}
                      >
                        {copied.intentBytes ? <CheckCircleIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'background.default', p: 1, borderRadius: 1 }}>
                    {formatBytes(intentBytes)}
                  </Typography>
                </Box>
              )}

              {challenge && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">
                      WebAuthn Challenge (SHA-256 hash)
                    </Typography>
                    <Tooltip title={copied.challenge ? 'Copied!' : 'Copy'}>
                      <IconButton 
                        size="small" 
                        onClick={() => copyToClipboard(arrayBufferToBase64(challenge.buffer), 'challenge')}
                      >
                        {copied.challenge ? <CheckCircleIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'background.default', p: 1, borderRadius: 1 }}>
                    {formatBytes(challenge)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Derived from: SHA-256(intentBytes).slice(0, 32)
                  </Typography>
                </Box>
              )}

              {intent.ruleBinding && (
                <Box>
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Rule Binding
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    Rule ID: {intent.ruleBinding}
                  </Typography>
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            // Pass modified intent if available
            if (modifiedIntent) {
              // Update the intent in parent component before confirming
              onConfirm(modifiedIntent);
            } else {
              onConfirm();
            }
          }}
          variant="contained"
          disabled={loading || (intent.exp <= Math.floor(Date.now() / 1000))}
          startIcon={loading ? <ScheduleIcon /> : <CheckCircleIcon />}
        >
          {loading ? 'Processing...' : 'Confirm & Execute'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default IntentPreview;
