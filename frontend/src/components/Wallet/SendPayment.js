import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Box,
  Alert,
  IconButton,
  Paper,
  Divider,
  CircularProgress,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Close,
  Send,
  QrCodeScanner,
  CameraAlt
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import webauthnService from '../../services/webauthnService';

const SendPayment = ({ open, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { publicKey, secretKey, balance: walletBalance, sendTransaction, loadAccountInfo } = useWallet();
  const { user } = useAuth();
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('XLM');
  const [memo, setMemo] = useState('');
  const [paymentSource, setPaymentSource] = useState('wallet');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [vaultBalanceInXLM, setVaultBalanceInXLM] = useState(null);
  const [userStake, setUserStake] = useState(null);
  
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);
  
  const effectivePublicKey = publicKey || (user && user.public_key);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setRecipient('');
      setAmount('');
      setAsset('XLM');
      setMemo('');
      setPaymentSource('wallet');
      setError('');
      setSuccess('');
      fetchSmartWalletBalance();
      fetchVaultBalance();
    } else {
      stopQRScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchSmartWalletBalance = async () => {
    if (!effectivePublicKey) return;
    
    try {
      const response = await api.get('/smart-wallet/balance', {
        params: { userPublicKey: effectivePublicKey }
      });
      setUserStake(response.data.balanceInXLM);
    } catch (err) {
      console.error('Failed to fetch smart wallet balance:', err);
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

  // Start QR scanner
  const startQRScanner = async () => {
    try {
      // Dynamically import qr-scanner
      const QrScanner = (await import('qr-scanner')).default;
      
      // Check if camera is available
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setScannerError('No camera found on this device');
        return;
      }

      setIsScannerOpen(true);
      setScannerError('');

      // Wait for modal to render, then start scanner
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
                console.log('QR Code detected:', result);
                setRecipient(result.data);
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
          console.error('Error starting scanner:', error);
          setScannerError('Failed to start camera. Please check permissions.');
        }
      }, 100);
    } catch (error) {
      console.error('Error loading QR scanner:', error);
      setScannerError('QR scanner not available. Please install qr-scanner package.');
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

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      stopQRScanner();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!recipient.trim()) {
      setError('Please enter a recipient address');
      return;
    }

    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Validate balance for smart wallet payments
    if (paymentSource === 'smart-wallet') {
      const amountNum = parseFloat(amount);
      const userStakeNum = userStake ? parseFloat(userStake.toString()) : 0;
      
      if (userStakeNum <= 0) {
        setError('You have no stake in the smart wallet contract. Please deposit funds first.');
        return;
      }
      
      if (amountNum > userStakeNum) {
        setError(`Insufficient stake. You have ${userStakeNum.toFixed(7)} ${asset} stake, but trying to send ${amountNum.toFixed(7)} ${asset}.`);
        return;
      }
    }

    try {
      setLoading(true);
      
      if (paymentSource === 'wallet') {
        // Traditional Stellar payment from wallet balance
        const result = await sendTransaction(recipient, amount, memo);
        if (result) {
          setSuccess('Payment sent successfully!');
          await loadAccountInfo(publicKey);
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          setError('Payment failed');
        }
      } else {
        // Smart wallet payment from contract balance
        await sendSmartWalletPayment(recipient, amount, asset, memo);
      }
    } catch (err) {
      console.error('Error sending payment:', err);
      setError(err.response?.data?.error || err.message || 'Failed to send payment');
    } finally {
      setLoading(false);
    }
  };

  const sendSmartWalletPayment = async (destination, amount, asset, memo) => {
    try {
      // Get passkeys
      const passkeysResponse = await api.get('/webauthn/passkeys');
      const passkeys = passkeysResponse.data.passkeys || [];
      
      if (passkeys.length === 0) {
        throw new Error('No passkeys registered. Please register a passkey first.');
      }

      // Use the first passkey (or let user select)
      const passkey = passkeys[0];
      
      // Create transaction data
      const amountInStroops = (parseFloat(amount) * 10000000).toString();
      const timestamp = Date.now();
      const transactionData = {
        source: effectivePublicKey,
        destination,
        amount: amountInStroops,
        asset: asset === 'XLM' ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' : asset,
        memo,
        timestamp
      };
      
      const signaturePayload = JSON.stringify(transactionData);
      
      // Authenticate with passkey - pass the signaturePayload string
      // The service will extract the first 32 bytes and use them as the challenge
      const authResult = await webauthnService.authenticateWithPasskey(
        passkey.credentialId,
        signaturePayload
      );
      
      if (!authResult) {
        throw new Error('Passkey authentication failed');
      }
      
      // Extract public key from passkey - use the service method
      // The passkey already has public_key_spki in base64 format
      const passkeyPublicKeySPKI = passkey.public_key_spki;
      
      // Call smart wallet execute-payment endpoint
      const response = await api.post('/smart-wallet/execute-payment', {
        userPublicKey: effectivePublicKey,
        userSecretKey: secretKey,
        destinationAddress: destination,
        amount: amountInStroops,
        assetAddress: asset === 'XLM' ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' : asset,
        signaturePayload,
        passkeyPublicKeySPKI,
        webauthnSignature: authResult.signature,
        webauthnAuthenticatorData: authResult.authenticatorData,
        webauthnClientData: authResult.clientDataJSON
      });
      
      if (response.data.success) {
        setSuccess(`Payment sent successfully! Transaction: ${response.data.hash}`);
        await fetchSmartWalletBalance();
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error(response.data.error || 'Payment failed');
      }
    } catch (err) {
      console.error('Error sending smart wallet payment:', err);
      throw err;
    }
  };

  const walletBalanceNum = walletBalance ? parseFloat(walletBalance) : 0;
  const totalBalance = walletBalanceNum;

  if (!open) return null;

  return (
    <>
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
            <Send color="primary" />
            <Typography variant="h6">Send Payment</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ 
          overflowY: 'auto',
          fontSize: fullScreen ? '1rem' : '0.875rem'
        }}>
          <Box sx={{ mb: 2 }}>
            <Paper elevation={1} sx={{ p: 2, bgcolor: 'rgba(16, 185, 129, 0.1)' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                Wallet Balance:
              </Typography>
              <Typography variant="h6" sx={{ color: 'success.main', fontFamily: 'monospace' }}>
                {totalBalance.toFixed(7)} XLM
              </Typography>
              
              {vaultBalanceInXLM !== null && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Smart Wallet Vault (Total):
                  </Typography>
                  <Typography variant="h6" sx={{ color: 'info.main', fontFamily: 'monospace' }}>
                    {parseFloat(vaultBalanceInXLM || 0).toFixed(7)} XLM
                  </Typography>
                </>
              )}
              
              {userStake !== null && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Your Stake in Contract:
                  </Typography>
                  <Typography variant="h6" sx={{ color: 'primary.main', fontFamily: 'monospace' }}>
                    {parseFloat(userStake || 0).toFixed(7)} XLM
                  </Typography>
                </>
              )}
            </Paper>
          </Box>

          <form onSubmit={handleSubmit}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Payment Source</InputLabel>
              <Select
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value)}
                label="Payment Source"
              >
                <MenuItem value="wallet">
                  From Wallet Balance ({totalBalance.toFixed(7)} XLM)
                </MenuItem>
                <MenuItem value="smart-wallet">
                  From Smart Wallet Balance ({parseFloat(userStake || 0).toFixed(7)} XLM)
                </MenuItem>
              </Select>
              <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>
                {paymentSource === 'wallet' 
                  ? 'Pay directly from your Stellar wallet balance'
                  : 'Pay from your smart wallet contract balance (requires passkey authentication)'}
              </Typography>
            </FormControl>

            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                label="Recipient Address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter Stellar address (G...)"
                required
                InputProps={{
                  endAdornment: (
                    <IconButton
                      onClick={startQRScanner}
                      edge="end"
                      title="Scan QR Code"
                    >
                      <QrCodeScanner />
                    </IconButton>
                  )
                }}
                sx={{ fontSize: fullScreen ? '1rem' : '0.875rem' }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                label="Amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  const pattern = /^\d*\.?\d{0,7}$/;
                  if (value === '' || pattern.test(value)) {
                    setAmount(value);
                  }
                }}
                placeholder="0.0000000"
                required
                sx={{ fontSize: fullScreen ? '1rem' : '0.875rem' }}
              />
              <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>
                {paymentSource === 'smart-wallet' 
                  ? `Enter amount with up to 7 decimal places. Max: ${userStake ? parseFloat(userStake).toFixed(7) : '0.0000000'} XLM (your stake)`
                  : 'Enter amount with up to 7 decimal places (e.g., 33.0000000)'}
              </Typography>
            </Box>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Asset</InputLabel>
              <Select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                label="Asset"
              >
                <MenuItem value="XLM">XLM (Lumens)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Memo (Optional)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add a note for this transaction..."
              multiline
              rows={2}
              inputProps={{ maxLength: 28 }}
              sx={{ mb: 2, fontSize: fullScreen ? '1rem' : '0.875rem' }}
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}
          </form>
        </DialogContent>

        <DialogActions sx={{ 
          p: 2, 
          gap: 1,
          flexDirection: fullScreen ? 'column' : 'row'
        }}>
          <Button
            onClick={onClose}
            variant="outlined"
            fullWidth={fullScreen}
            sx={{ 
              minHeight: fullScreen ? '48px' : '36px',
              fontSize: fullScreen ? '1rem' : '0.875rem'
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={20} /> : <Send />}
            disabled={loading}
            fullWidth={fullScreen}
            sx={{ 
              minHeight: fullScreen ? '48px' : '36px',
              fontSize: fullScreen ? '1rem' : '0.875rem'
            }}
          >
            {loading ? 'Sending...' : 'Send Payment'}
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
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          fontSize: fullScreen ? '1.5rem' : '1.25rem'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CameraAlt />
            <Typography variant="h6">Scan QR Code</Typography>
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
              marginBottom: '1rem'
            }}
            autoPlay
            playsInline
            muted
          />
          
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Position the QR code within the frame. Scanning happens automatically.
          </Typography>
          
          {scannerError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {scannerError}
            </Alert>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button
            onClick={() => {
              setIsScannerOpen(false);
              stopQRScanner();
            }}
            variant="outlined"
            fullWidth
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SendPayment;
