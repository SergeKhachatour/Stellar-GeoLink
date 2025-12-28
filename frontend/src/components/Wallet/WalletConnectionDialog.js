import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ContentCopy as CopyIcon,
  AccountBalance as WalletIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`wallet-tabpanel-${index}`}
      aria-labelledby={`wallet-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `wallet-tab-${index}`,
    'aria-controls': `wallet-tabpanel-${index}`,
  };
}

const WalletConnectionDialog = ({ open, onClose, onRegister }) => {
  const { connectWallet, connectWalletViewOnly, generateWallet, loading, error, setPublicKey: setWalletPublicKey, setSecretKey: setWalletSecretKey, setIsConnected } = useWallet();
  const [tabValue, setTabValue] = useState(0);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState(null);
  const [localError, setLocalError] = useState('');
  const [availableWallets, setAvailableWallets] = useState([]);
  const [connectingWallet, setConnectingWallet] = useState(null);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setLocalError('');
  };

  const handleImportWallet = async () => {
    if (!secretKey.trim()) {
      setLocalError('Please enter your secret key');
      return;
    }

    try {
      setLocalError('');
      await connectWallet(secretKey.trim());
      // Clear the form
      setSecretKey('');
      // Close dialog after a brief delay to allow state to update
      // WalletConnectionGuard will detect the connection and show the content
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (err) {
      setLocalError(err.message || 'Failed to import wallet');
    }
  };

  const handleViewOnlyWallet = async () => {
    if (!publicKey.trim()) {
      setLocalError('Please enter a public key');
      return;
    }

    try {
      setLocalError('');
      await connectWalletViewOnly(publicKey.trim());
      // Clear the form
      setPublicKey('');
      // Close dialog after a brief delay to allow state to update
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (err) {
      setLocalError(err.message || 'Failed to connect view-only wallet');
    }
  };

  const handleGenerateWallet = async () => {
    try {
      setLocalError('');
      const wallet = await generateWallet();
      if (wallet) {
        setGeneratedWallet(wallet);
      } else {
        setLocalError('Failed to generate wallet: No wallet data returned');
      }
    } catch (err) {
      console.error('Error generating wallet:', err);
      setLocalError(err.message || 'Failed to generate wallet. Please try again.');
    }
  };

  const handleUseGeneratedWallet = async () => {
    if (generatedWallet) {
      try {
        setLocalError('');
        
        // Connect the wallet
        await connectWallet(generatedWallet.secretKey);
        
        // Passkey registration may be in progress (asynchronous)
        // Show appropriate message based on status
        if (generatedWallet.passkeyRegistered) {
          console.log('✅ Wallet connected with passkey already registered');
        } else if (generatedWallet.passkeyInProgress) {
          console.log('⏳ Wallet connected - passkey registration in progress (will complete in background)');
        } else if (generatedWallet.passkeyError) {
          console.warn('⚠️ Wallet connected but passkey registration failed:', generatedWallet.passkeyError);
        }
        
        // Clear the generated wallet
        setGeneratedWallet(null);
        
        // If onRegister callback is provided (e.g., from Login page), call it to redirect to registration
        if (onRegister) {
          console.log('Redirecting to registration with new wallet...');
          onClose();
          onRegister();
        } else {
          // Otherwise, just close the dialog after a brief delay
          setTimeout(() => {
            onClose();
          }, 300);
        }
      } catch (err) {
        setLocalError(err.message || 'Failed to use generated wallet');
      }
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleWalletConnect = async (walletId) => {
    try {
      setConnectingWallet(walletId);
      setLocalError('');
      
      const result = await walletConnectService.connectWallet(walletId);
      
      // Update wallet context with connected wallet
      setWalletPublicKey(result.address);
      // Note: External wallets don't provide secret keys, so we set it to null
      // The wallet will be used for signing transactions through the wallet connect service
      setWalletSecretKey(null);
      setIsConnected(true);
      
      // Store wallet connection info in localStorage
      localStorage.setItem('stellar_public_key', result.address);
      localStorage.setItem('stellar_wallet_connect_id', walletId);
      
      // Close dialog after a brief delay
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setLocalError(err.message || 'Failed to connect wallet');
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleClose = () => {
    setSecretKey('');
    setPublicKey('');
    setGeneratedWallet(null);
    setLocalError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <WalletIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Connect Stellar Wallet</Typography>
          </Box>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="wallet connection tabs">
            <Tab label="Wallet Connect" {...a11yProps(0)} />
            <Tab label="Import Wallet" {...a11yProps(1)} />
            <Tab label="View Only" {...a11yProps(2)} />
            <Tab label="Create New" {...a11yProps(3)} />
          </Tabs>
        </Box>

        {/* Wallet Connect Tab */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Connect using a Stellar wallet extension or mobile wallet. Supported wallets include Freighter, Albedo, WalletConnect, Hana, Rabet, Lobstr, and xBull.
          </Typography>
          
          {availableWallets.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Loading available wallets...
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {availableWallets.map((wallet) => (
                <Card key={wallet.id} sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center" gap={2}>
                        {wallet.icon && (
                          <Box
                            component="img"
                            src={wallet.icon}
                            alt={wallet.name}
                            sx={{ width: 40, height: 40, borderRadius: 1 }}
                          />
                        )}
                        <Box>
                          <Typography variant="h6">{wallet.name}</Typography>
                          {wallet.installUrl && (
                            <Typography variant="caption" color="text.secondary">
                              {wallet.installed ? 'Installed' : 'Not installed'}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Button
                        variant="contained"
                        onClick={() => handleWalletConnect(wallet.id)}
                        disabled={connectingWallet === wallet.id || loading}
                        startIcon={connectingWallet === wallet.id ? <CircularProgress size={20} /> : <WalletIcon />}
                      >
                        {connectingWallet === wallet.id ? 'Connecting...' : 'Connect'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>About Wallet Connect:</strong> When using external wallets, your secret key never leaves your wallet. 
            Transactions are signed securely through your wallet extension or mobile app.
          </Alert>
        </TabPanel>

        {/* Import Wallet Tab */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter your existing Stellar secret key to import your wallet.
          </Typography>
          
          <TextField
            fullWidth
            label="Secret Key"
            type={showSecretKey ? 'text' : 'password'}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="S... (56 characters)"
            helperText="Your secret key starts with 'S' and is used to sign transactions. Keep it secure and never share it."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    edge="end"
                  >
                    {showSecretKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Security Warning:</strong> Never share your secret key with anyone. 
            This application stores your key locally and never transmits it to our servers.
          </Alert>

          <Button
            variant="contained"
            onClick={handleImportWallet}
            disabled={loading || !secretKey.trim()}
            fullWidth
            startIcon={loading ? <CircularProgress size={20} /> : <WalletIcon />}
          >
            {loading ? 'Connecting...' : 'Import Wallet'}
          </Button>
        </TabPanel>

        {/* View Only Tab */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter a public key to view wallet information without the ability to send transactions.
          </Typography>
          
          <TextField
            fullWidth
            label="Public Key"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="G... (56 characters)"
            helperText="Public keys are safe to share and allow viewing wallet information."
            sx={{ mb: 2 }}
          />

          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>View Only Mode:</strong> You can view wallet information and collect NFTs, 
            but cannot send transactions without the secret key.
          </Alert>

          <Button
            variant="contained"
            onClick={handleViewOnlyWallet}
            disabled={loading || !publicKey.trim()}
            fullWidth
            startIcon={loading ? <CircularProgress size={20} /> : <WalletIcon />}
          >
            {loading ? 'Connecting...' : 'Connect View Only'}
          </Button>
        </TabPanel>

        {/* Create New Tab */}
        <TabPanel value={tabValue} index={3}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Generate a new Stellar wallet. Make sure to save your secret key securely.
          </Typography>

          {!generatedWallet ? (
            <Button
              variant="contained"
              onClick={handleGenerateWallet}
              disabled={loading}
              fullWidth
              startIcon={loading ? <CircularProgress size={20} /> : <AddIcon />}
            >
              {loading ? 'Generating Wallet & Registering Passkey...' : 'Generate New Wallet'}
            </Button>
          ) : (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Your New Wallet
                </Typography>
                
                <TextField
                  fullWidth
                  label="Public Key"
                  value={generatedWallet.publicKey}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => copyToClipboard(generatedWallet.publicKey)}>
                          <CopyIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Secret Key"
                  type={showSecretKey ? 'text' : 'password'}
                  value={generatedWallet.secretKey}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => copyToClipboard(generatedWallet.secretKey)}>
                          <CopyIcon />
                        </IconButton>
                        <IconButton onClick={() => setShowSecretKey(!showSecretKey)}>
                          {showSecretKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />

                {generatedWallet.passkeyRegistered && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <strong>✅ Passkey Registered!</strong> Your wallet is secured with a passkey. You can use biometrics or device security to sign transactions.
                  </Alert>
                )}
                {generatedWallet.passkeyInProgress && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <strong>⏳ Passkey Registration In Progress</strong> Your wallet is being created. Passkey registration is happening in the background and may take 30-60 seconds to complete. You can use your wallet now, and the passkey will be ready shortly.
                  </Alert>
                )}
                {generatedWallet.passkeyError && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <strong>⚠️ Passkey Registration Skipped:</strong> {generatedWallet.passkeyError}. You can register a passkey later from the Passkey Manager.
                  </Alert>
                )}
                <Alert severity="error" sx={{ mb: 2 }}>
                  <strong>IMPORTANT:</strong> Save your secret key securely! You cannot recover your wallet without it.
                </Alert>
              </CardContent>
              <CardActions>
                <Button
                  variant="contained"
                  onClick={handleUseGeneratedWallet}
                  disabled={loading}
                  fullWidth
                  startIcon={loading ? <CircularProgress size={20} /> : <WalletIcon />}
                >
                  {loading ? 'Connecting...' : 'Use This Wallet'}
                </Button>
              </CardActions>
            </Card>
          )}
        </TabPanel>

        {/* Error Display */}
        {(error || localError) && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error || localError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WalletConnectionDialog;
