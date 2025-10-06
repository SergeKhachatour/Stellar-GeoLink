import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Card,
  CardContent,
  Alert
} from '@mui/material';
import {
  AccountBalanceWallet,
  MoreVert,
  AccountBalance,
  History,
  Send,
  Refresh,
  Warning,
  CheckCircle
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

const WalletStatus = () => {
  const {
    isConnected,
    publicKey,
    balance,
    loading,
    error,
    disconnectWallet,
    fundAccount,
    loadAccountInfo
  } = useWallet();

  const [anchorEl, setAnchorEl] = useState(null);
  const [funding, setFunding] = useState(false);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleFundAccount = async () => {
    setFunding(true);
    try {
      const success = await fundAccount();
      if (success) {
        await loadAccountInfo(publicKey);
      }
    } catch (err) {
      console.error('Failed to fund account:', err);
    } finally {
      setFunding(false);
      handleMenuClose();
    }
  };

  const handleRefresh = async () => {
    try {
      await loadAccountInfo(publicKey);
    } catch (err) {
      console.error('Failed to refresh account:', err);
    }
    handleMenuClose();
  };

  const formatPublicKey = (key) => {
    if (!key) return '';
    return `${key.slice(0, 8)}...${key.slice(-8)}`;
  };

  const formatBalance = (bal) => {
    if (bal === null || bal === undefined) return 'Loading...';
    return `${bal.toFixed(4)} XLM`;
  };

  if (!isConnected) {
    return (
      <Card sx={{ maxWidth: 400 }}>
        <CardContent sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="center" py={1}>
            <AccountBalanceWallet color="disabled" sx={{ mr: 1, fontSize: 20 }} />
            <Typography color="text.secondary" variant="body2">
              No wallet connected
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 400 }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
          <Box display="flex" alignItems="center" gap={1}>
            <AccountBalanceWallet color="primary" sx={{ fontSize: 20 }} />
            <Typography variant="subtitle1" fontWeight="bold">Stellar Wallet</Typography>
            <Chip
              label="Testnet"
              color="info"
              size="small"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          </Box>
          
          <IconButton onClick={handleMenuOpen} size="small">
            <MoreVert sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.8rem' }}>
            {error}
          </Alert>
        )}

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Public Key
            </Typography>
            <Typography 
              variant="body2" 
              fontFamily="monospace" 
              fontSize="0.8rem"
              title={publicKey}
              sx={{ cursor: 'help' }}
            >
              {formatPublicKey(publicKey)}
            </Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="caption" color="text.secondary" display="block">
              Balance
            </Typography>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Typography variant="body1" color="primary" fontWeight="bold" fontSize="0.9rem">
                {formatBalance(balance)}
              </Typography>
              {loading && <Refresh sx={{ animation: 'spin 1s linear infinite', fontSize: 16 }} />}
            </Box>
          </Box>
        </Box>

        {balance !== null && balance < 1 && (
          <Alert severity="warning" sx={{ mb: 1, fontSize: '0.75rem' }}>
            <Typography variant="caption">
              Low balance! Fund your account with test XLM.
            </Typography>
          </Alert>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleRefresh} disabled={loading}>
            <ListItemIcon>
              <Refresh />
            </ListItemIcon>
            <ListItemText>Refresh Balance</ListItemText>
          </MenuItem>
          
          <MenuItem onClick={handleFundAccount} disabled={funding}>
            <ListItemIcon>
              <AccountBalance />
            </ListItemIcon>
            <ListItemText>
              {funding ? 'Funding...' : 'Fund with Test XLM'}
            </ListItemText>
          </MenuItem>
          
          <Divider />
          
          <MenuItem onClick={disconnectWallet}>
            <ListItemIcon>
              <Warning />
            </ListItemIcon>
            <ListItemText>Disconnect Wallet</ListItemText>
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
};

export default WalletStatus;
