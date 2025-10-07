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

const WalletConnectionDialog = ({ open, onClose }) => {
  const { connectWallet, connectWalletViewOnly, generateWallet, loading, error } = useWallet();
  const [tabValue, setTabValue] = useState(0);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState(null);
  const [localError, setLocalError] = useState('');

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
      await connectWallet(secretKey.trim());
      onClose();
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
      await connectWalletViewOnly(publicKey.trim());
      onClose();
    } catch (err) {
      setLocalError(err.message || 'Failed to connect view-only wallet');
    }
  };

  const handleGenerateWallet = async () => {
    try {
      const wallet = await generateWallet();
      if (wallet) {
        setGeneratedWallet(wallet);
      }
    } catch (err) {
      setLocalError(err.message || 'Failed to generate wallet');
    }
  };

  const handleUseGeneratedWallet = async () => {
    if (generatedWallet) {
      try {
        await connectWallet(generatedWallet.secretKey);
        onClose();
      } catch (err) {
        setLocalError(err.message || 'Failed to use generated wallet');
      }
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
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
            <Tab label="Import Wallet" {...a11yProps(0)} />
            <Tab label="View Only" {...a11yProps(1)} />
            <Tab label="Create New" {...a11yProps(2)} />
          </Tabs>
        </Box>

        {/* Import Wallet Tab */}
        <TabPanel value={tabValue} index={0}>
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
        <TabPanel value={tabValue} index={1}>
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
        <TabPanel value={tabValue} index={2}>
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
              {loading ? 'Generating...' : 'Generate New Wallet'}
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
