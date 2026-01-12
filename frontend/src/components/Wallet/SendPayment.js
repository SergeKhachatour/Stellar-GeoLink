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
  useTheme,
  Stepper,
  Step,
  StepLabel,
  StepContent
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
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [executionStep, setExecutionStep] = useState(0);
  const [executionStatus, setExecutionStatus] = useState('');
  
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);
  
  const effectivePublicKey = publicKey || (user && user.public_key);

  // Add global error handler to prevent page refresh on unhandled errors
  useEffect(() => {
    const handleError = (event) => {
      event.preventDefault();
      console.error('Unhandled error prevented:', event.error);
      setError(event.error?.message || 'An unexpected error occurred');
      setLoading(false);
      return false;
    };
    
    const handleUnhandledRejection = (event) => {
      event.preventDefault();
      console.error('Unhandled promise rejection prevented:', event.reason);
      setError(event.reason?.message || 'An unexpected error occurred');
      setLoading(false);
      return false;
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

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
      setConfirmDialogOpen(false);
      setExecutionStep(0);
      setExecutionStatus('');
      setLoading(false);
      fetchSmartWalletBalance();
      fetchVaultBalance();
    } else {
      stopQRScanner();
      // Reset all state when dialog closes
      setRecipient('');
      setAmount('');
      setAsset('XLM');
      setMemo('');
      setPaymentSource('wallet');
      setError('');
      setSuccess('');
      setConfirmDialogOpen(false);
      setExecutionStep(0);
      setExecutionStatus('');
      setLoading(false);
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

  const handleSubmit = async () => {
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

    // Open confirmation dialog
    setConfirmDialogOpen(true);
  };

  const handleConfirmSend = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setError('');
    setSuccess('');
    setExecutionStep(0);
    setExecutionStatus('Preparing transaction...');
    setLoading(true);

    try {
      if (paymentSource === 'wallet') {
        // Traditional Stellar payment from wallet balance
        setExecutionStep(1);
        setExecutionStatus('Signing transaction...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setExecutionStep(2);
        setExecutionStatus('Submitting to blockchain...');
        let result;
        try {
          // Only pass memo if it's not empty
          // Pass skipAccountRefresh=true and skipLoadingState=true to prevent page refresh during transaction
          // skipLoadingState prevents WalletConnectionGuard from showing loading screen
          const memoToSend = memo && memo.trim() ? memo.trim() : null;
          result = await sendTransaction(recipient, amount, memoToSend, true, true);
        } catch (txError) {
          console.error('Transaction submission error:', txError);
          throw new Error(txError.message || 'Transaction submission failed');
        }
        
        if (result) {
          setExecutionStep(3);
          setExecutionStatus('Waiting for confirmation...');
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Step 4 is "Complete" for wallet payments (no passkey step: 0=Prepare, 1=Sign, 2=Submit, 3=Waiting, 4=Complete)
          setExecutionStep(4);
          setExecutionStatus('Transaction confirmed!');
          
          // Build success message with transaction details
          const txHash = result.hash || result.transactionHash || 'N/A';
          const stellarExpertUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
          let successMsg = `Payment sent successfully!`;
          if (memo && memo.trim()) {
            successMsg += `\nMemo: ${memo.trim()}`;
          }
          successMsg += `\nTransaction: ${txHash}`;
          successMsg += `\n🔗 View on StellarExpert: ${stellarExpertUrl}`; // URL will be extracted and rendered as button
          
          setSuccess(successMsg);
          setLoading(false); // Set loading to false so user can click "Done" button
        } else {
          setError('Payment failed');
          setExecutionStep(0);
          setExecutionStatus('');
          setLoading(false);
        }
      } else {
        // Smart wallet payment from contract balance
        await sendSmartWalletPayment(recipient, amount, asset, memo);
      }
    } catch (err) {
      console.error('Error sending payment:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to send payment';
      setError(errorMessage);
      setExecutionStep(0);
      setExecutionStatus('');
      setLoading(false);
      // Don't close dialog on error - let user see the error message
    }
  };

  const sendSmartWalletPayment = async (destination, amount, asset, memo) => {
    try {
      setExecutionStep(0);
      setExecutionStatus('Preparing transaction...');
      
      // Get passkeys
      setExecutionStep(1);
      setExecutionStatus('Getting passkeys...');
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
      
      // Authenticate with passkey
      setExecutionStatus('Authenticating with passkey...');
      setExecutionStep(1); // Keep at step 1 for authentication
      
      const authResult = await webauthnService.authenticateWithPasskey(
        passkey.credentialId,
        signaturePayload
      );
      
      if (!authResult) {
        throw new Error('Passkey authentication failed');
      }
      
      // Extract public key from passkey
      const passkeyPublicKeySPKI = passkey.public_key_spki;
      
      // Signing transaction
      setExecutionStep(2);
      setExecutionStatus('Signing transaction...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Submitting to blockchain
      setExecutionStep(3);
      setExecutionStatus('Submitting to blockchain...');
      
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
        setExecutionStep(4);
        setExecutionStatus('Waiting for confirmation...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setExecutionStep(5);
        setExecutionStatus('Transaction confirmed!');
        
        // Build success message with transaction details
        const txHash = response.data.hash || 'N/A';
        const stellarExpertUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
        let successMsg = `Payment sent successfully!`;
        if (memo && memo.trim()) {
          successMsg += `\nMemo: ${memo.trim()}`;
        }
        successMsg += `\nTransaction: ${txHash}`;
        successMsg += `\n🔗 View on StellarExpert: ${stellarExpertUrl}`;
        
        setSuccess(successMsg);
        setLoading(false); // Set loading to false so user can click "Done" button
      } else {
        throw new Error(response.data.error || 'Payment failed');
      }
    } catch (err) {
      console.error('Error sending smart wallet payment:', err);
      setExecutionStep(0);
      setExecutionStatus('');
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
        onClose={() => {
          if (!confirmDialogOpen && !loading) {
            onClose();
          }
        }}
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: fullScreen ? 0 : 2,
            maxHeight: fullScreen ? '100vh' : '90vh',
            display: confirmDialogOpen ? 'none' : 'block' // Hide main dialog when confirmation is open
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

          <Box>
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
          </Box>
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
            type="button"
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            startIcon={<Send />}
            disabled={loading}
            fullWidth={fullScreen}
            sx={{ 
              minHeight: fullScreen ? '48px' : '36px',
              fontSize: fullScreen ? '1rem' : '0.875rem'
            }}
          >
            Send Payment
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

      {/* Confirmation Dialog with Execution Steps */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => {
          if (!loading) {
            setConfirmDialogOpen(false);
            setExecutionStep(0);
            setExecutionStatus('');
            setError('');
            setSuccess('');
          }
        }}
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
            <Typography variant="h6">Payment Confirmation</Typography>
          </Box>
          <IconButton 
            onClick={() => {
              if (!loading) {
                setConfirmDialogOpen(false);
                setExecutionStep(0);
                setExecutionStatus('');
                setError('');
                setSuccess('');
              }
            }}
            disabled={loading}
            size="small"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ 
          overflowY: 'auto',
          fontSize: fullScreen ? '1rem' : '0.875rem'
        }}>
          <Typography variant="body1" gutterBottom sx={{ mb: 2 }}>
            Review your payment details:
          </Typography>
          
          <Paper elevation={1} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Recipient:</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {recipient}
              </Typography>
            </Box>
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Amount:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {amount} {asset}
              </Typography>
            </Box>
            {memo && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary">Memo:</Typography>
                <Typography variant="body2">
                  {memo}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">Payment Source:</Typography>
              <Typography variant="body2">
                {paymentSource === 'wallet' ? 'From Wallet Balance' : 'From Smart Wallet Balance'}
              </Typography>
            </Box>
          </Paper>

          {paymentSource === 'smart-wallet' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                This payment will be executed through the smart wallet contract and requires passkey authentication.
              </Typography>
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Box>
                {success.split('\n').map((line, index) => {
                  // Check if line contains StellarExpert URL - render as button
                  if (line.includes('stellar.expert')) {
                    const urlMatch = line.match(/https:\/\/[^\s]+/);
                    if (urlMatch) {
                      return (
                        <Box key={index} sx={{ mt: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            href={urlMatch[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ 
                              textTransform: 'none',
                              fontSize: '0.875rem'
                            }}
                          >
                            🔗 View on StellarExpert
                          </Button>
                        </Box>
                      );
                    }
                  }
                  // Check if line contains transaction hash - ensure it wraps
                  if (line.includes('Transaction:')) {
                    const hashMatch = line.match(/Transaction:\s*([a-f0-9]+)/i);
                    if (hashMatch) {
                      return (
                        <Box key={index} sx={{ mb: 0.5 }}>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            Transaction:
                          </Typography>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontFamily: 'monospace', 
                              fontSize: '0.875rem',
                              wordBreak: 'break-all',
                              backgroundColor: 'rgba(0, 0, 0, 0.05)',
                              p: 1,
                              borderRadius: 1
                            }}
                          >
                            {hashMatch[1]}
                          </Typography>
                        </Box>
                      );
                    }
                  }
                  // Skip empty lines and the StellarExpert line (already handled above)
                  if (line.trim() === '' || line.includes('🔗 View on StellarExpert')) {
                    return null;
                  }
                  // Regular lines (Payment sent successfully, Memo, etc.)
                  return (
                    <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                      {line}
                    </Typography>
                  );
                })}
              </Box>
            </Alert>
          )}

          {executionStatus && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {loading && <CircularProgress size={16} />}
                <Typography variant="body2">
                  {executionStatus}
                </Typography>
              </Box>
            </Alert>
          )}

          {(loading || success) && (
            <Box sx={{ mt: 2 }}>
              <Stepper activeStep={executionStep} orientation="vertical">
                <Step>
                  <StepLabel>Prepare Transaction</StepLabel>
                  <StepContent>
                    <Typography variant="body2" color="text.secondary">
                      Building transaction parameters...
                    </Typography>
                  </StepContent>
                </Step>
                {paymentSource === 'smart-wallet' && (
                  <Step>
                    <StepLabel>Authenticate with Passkey</StepLabel>
                    <StepContent>
                      <Typography variant="body2" color="text.secondary">
                        Please authenticate with your passkey when prompted...
                      </Typography>
                    </StepContent>
                  </Step>
                )}
                <Step>
                  <StepLabel>Sign Transaction</StepLabel>
                  <StepContent>
                    <Typography variant="body2" color="text.secondary">
                      Signing the transaction...
                    </Typography>
                  </StepContent>
                </Step>
                <Step>
                  <StepLabel>Submit to Blockchain</StepLabel>
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
                      Transaction confirmed!
                    </Typography>
                  </StepContent>
                </Step>
              </Stepper>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ 
          p: 2, 
          gap: 1,
          flexDirection: fullScreen ? 'column-reverse' : 'row'
        }}>
          <Button
            onClick={() => {
              if (!loading) {
                setConfirmDialogOpen(false);
                setExecutionStep(0);
                setExecutionStatus('');
                setError('');
                setSuccess('');
              }
            }}
            variant="outlined"
            disabled={loading}
            fullWidth={fullScreen}
            sx={{ 
              minHeight: fullScreen ? '48px' : '36px',
              fontSize: fullScreen ? '1rem' : '0.875rem'
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={async (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              
              // If success, close both dialogs and refresh all account info
              if (success) {
                // Close confirmation dialog first
                setConfirmDialogOpen(false);
                setExecutionStep(0);
                setExecutionStatus('');
                setError('');
                setSuccess('');
                
                // Reset form state
                setRecipient('');
                setAmount('');
                setMemo('');
                setPaymentSource('wallet');
                setLoading(false);
                
                // Close main Send Payment dialog
                onClose();
                
                // Refresh all balances and account info AFTER closing dialogs
                setTimeout(() => {
                  if (publicKey) {
                    // Always refresh wallet balance
                    loadAccountInfo(publicKey).catch(loadError => {
                      console.warn('Failed to reload account info:', loadError);
                    });
                    
                    // Always refresh smart wallet balances (for both payment types)
                    fetchSmartWalletBalance().catch(balanceError => {
                      console.warn('Failed to refresh smart wallet balance:', balanceError);
                    });
                    fetchVaultBalance().catch(vaultError => {
                      console.warn('Failed to refresh vault balance:', vaultError);
                    });
                  }
                }, 300);
                
                return;
              }
              
              // Otherwise, proceed with transaction
              try {
                await handleConfirmSend(e);
              } catch (err) {
                console.error('Unhandled error in handleConfirmSend:', err);
                setError(err.message || 'An unexpected error occurred');
                setLoading(false);
                setExecutionStep(0);
                setExecutionStatus('');
              }
            }}
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={20} /> : (success ? null : <Send />)}
            disabled={loading}
            fullWidth={fullScreen}
            sx={{ 
              minHeight: fullScreen ? '48px' : '36px',
              fontSize: fullScreen ? '1rem' : '0.875rem'
            }}
          >
            {loading ? 'Processing...' : success ? 'Done' : 'Confirm & Send'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SendPayment;
