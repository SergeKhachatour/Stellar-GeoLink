import React, { useState } from 'react';
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
  Tabs,
  Tab,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  Chip,
  Divider
} from '@mui/material';
import {
  AccountBalanceWallet,
  Visibility,
  VisibilityOff,
  ContentCopy,
  CheckCircle,
  Warning,
  Info
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

const WalletConnection = ({ open, onClose }) => {
  const {
    connectWallet,
    generateWallet,
    isConnected,
    publicKey,
    balance,
    loading,
    error
  } = useWallet();

  const [tabValue, setTabValue] = useState(0);
  const [secretKey, setSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState(null);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setSecretKey('');
    setGeneratedWallet(null);
    setLocalError(null);
  };

  const handleConnect = async () => {
    if (!secretKey.trim()) {
      setLocalError('Please enter your secret key');
      return;
    }

    try {
      await connectWallet(secretKey.trim());
      onClose();
    } catch (err) {
      console.error('Connection failed:', err);
    }
  };

  const handleGenerate = () => {
    const wallet = generateWallet();
    if (wallet) {
      setGeneratedWallet(wallet);
    }
  };

  const handleUseGenerated = async () => {
    if (generatedWallet) {
      try {
        await connectWallet(generatedWallet.secretKey);
        onClose();
      } catch (err) {
        console.error('Connection failed:', err);
      }
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatPublicKey = (key) => {
    if (!key) return '';
    return `${key.slice(0, 8)}...${key.slice(-8)}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <AccountBalanceWallet color="primary" />
          <Typography variant="h6">Connect Stellar Wallet</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {isConnected ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Wallet Connected Successfully!
            </Alert>
            
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Wallet Information
                </Typography>
                
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Public Key
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontFamily="monospace">
                      {formatPublicKey(publicKey)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(publicKey)}
                    >
                      {copied ? <CheckCircle color="success" /> : <ContentCopy />}
                    </IconButton>
                  </Box>
                </Box>

                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Balance
                  </Typography>
                  <Typography variant="h6" color="primary">
                    {balance ? `${balance.toFixed(4)} XLM` : 'Loading...'}
                  </Typography>
                </Box>

                <Chip
                  label="Testnet"
                  color="info"
                  size="small"
                  icon={<Info />}
                />
              </CardContent>
            </Card>
          </Box>
        ) : (
          <Box>
            <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
              <Tab label="Import Wallet" />
              <Tab label="Generate New" />
            </Tabs>

            {(error || localError) && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error || localError}
              </Alert>
            )}

            {tabValue === 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Enter your Stellar secret key to connect your existing wallet.
                </Typography>
                
                <TextField
                  fullWidth
                  label="Secret Key"
                  type={showSecretKey ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowSecretKey(!showSecretKey)}
                          edge="end"
                        >
                          {showSecretKey ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                  helperText="Your secret key is stored locally and never transmitted"
                />

                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Security Notice:</strong> Never share your secret key with anyone. 
                    This application stores your key locally and never transmits it.
                  </Typography>
                </Alert>
              </Box>
            )}

            {tabValue === 1 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Generate a new Stellar wallet for testing purposes.
                </Typography>

                {!generatedWallet ? (
                  <Button
                    variant="outlined"
                    onClick={handleGenerate}
                    startIcon={<AccountBalanceWallet />}
                    fullWidth
                    sx={{ mb: 2 }}
                  >
                    Generate New Wallet
                  </Button>
                ) : (
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        New Wallet Generated
                      </Typography>
                      
                      <Box mb={2}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Public Key
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" fontFamily="monospace">
                            {formatPublicKey(generatedWallet.publicKey)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(generatedWallet.publicKey)}
                          >
                            {copied ? <CheckCircle color="success" /> : <ContentCopy />}
                          </IconButton>
                        </Box>
                      </Box>

                      <Box mb={2}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Secret Key
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" fontFamily="monospace">
                            {generatedWallet.secretKey}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(generatedWallet.secretKey)}
                          >
                            {copied ? <CheckCircle color="success" /> : <ContentCopy />}
                          </IconButton>
                        </Box>
                      </Box>

                      <Alert severity="error" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          <strong>Important:</strong> Save your secret key securely! 
                          You cannot recover your wallet without it.
                        </Typography>
                      </Alert>

                      <Divider sx={{ my: 2 }} />

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        This is a testnet wallet. You can fund it with test XLM from the Stellar Friendbot.
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {isConnected ? 'Close' : 'Cancel'}
        </Button>
        
        {!isConnected && (
          <>
            {tabValue === 0 && (
              <Button
                onClick={handleConnect}
                variant="contained"
                disabled={!secretKey.trim() || loading}
              >
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </Button>
            )}
            
            {tabValue === 1 && generatedWallet && (
              <Button
                onClick={handleUseGenerated}
                variant="contained"
                disabled={loading}
              >
                {loading ? 'Connecting...' : 'Use This Wallet'}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default WalletConnection;
