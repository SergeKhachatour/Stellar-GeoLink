import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
  Alert,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Close,
  QrCode,
  ContentCopy,
  CheckCircle
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';

const ReceivePayment = ({ open, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { publicKey } = useWallet();
  const { user } = useAuth();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  
  const effectivePublicKey = publicKey || (user && user.public_key);

  useEffect(() => {
    if (open && effectivePublicKey) {
      generateQrCode(effectivePublicKey);
    }
  }, [open, effectivePublicKey]);

  const generateQrCode = async (address) => {
    try {
      const dataUrl = await QRCode.toDataURL(address, { 
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeDataUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleCopyAddress = async () => {
    if (effectivePublicKey) {
      try {
        await navigator.clipboard.writeText(effectivePublicKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: fullScreen ? 0 : 2,
          maxHeight: fullScreen ? '100vh' : '90vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        fontSize: fullScreen ? '1.5rem' : '1.25rem',
        pb: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <QrCode color="primary" />
          <Typography variant="h6">Receive Payment</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ 
        overflowY: 'auto',
        fontSize: fullScreen ? '1rem' : '0.875rem',
        textAlign: 'center'
      }}>
        {!effectivePublicKey ? (
          <Alert severity="warning">
            Please connect your wallet to generate a QR code for receiving payments.
          </Alert>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
              <Typography variant="body2">
                Share this QR code or your wallet address to receive payments. Others can scan the QR code or send to your address.
              </Typography>
            </Alert>

            {/* QR Code */}
            <Paper 
              elevation={3} 
              sx={{ 
                p: 3, 
                mb: 3,
                display: 'inline-block',
                backgroundColor: 'white',
                borderRadius: 2
              }}
            >
              {qrCodeDataUrl ? (
                <img 
                  src={qrCodeDataUrl} 
                  alt="Wallet Address QR Code" 
                  style={{ 
                    maxWidth: '100%', 
                    height: 'auto',
                    maxHeight: '300px'
                  }} 
                />
              ) : (
                <Box sx={{ width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">Generating QR code...</Typography>
                </Box>
              )}
            </Paper>

            {/* Wallet Address */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                Your Wallet Address:
              </Typography>
              <TextField
                fullWidth
                value={effectivePublicKey}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleCopyAddress}
                        edge="end"
                        color={copied ? 'success' : 'default'}
                      >
                        {copied ? <CheckCircle /> : <ContentCopy />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
                sx={{ 
                  fontSize: fullScreen ? '1rem' : '0.875rem',
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: fullScreen ? '0.875rem' : '0.75rem'
                  }
                }}
              />
              {copied && (
                <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
                  Address copied to clipboard!
                </Typography>
              )}
            </Box>

            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Ready to receive!</strong> Share your QR code or address with anyone who wants to send you payments.
              </Typography>
            </Alert>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        p: 2, 
        gap: 1,
        flexDirection: fullScreen ? 'column' : 'row'
      }}>
        <Button
          onClick={onClose}
          variant="contained"
          fullWidth={fullScreen}
          sx={{ 
            minHeight: fullScreen ? '48px' : '36px',
            fontSize: fullScreen ? '1rem' : '0.875rem'
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReceivePayment;
