import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import { AccountBalanceWallet } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import smartWalletService from '../../services/smartWalletService';
import api from '../../services/api';

const SmartWalletBalance = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [balanceInXLM, setBalanceInXLM] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [contractId, setContractId] = useState(null);

  useEffect(() => {
    if (user && user.public_key) {
      fetchBalance();
    }
  }, [user]);

  const fetchBalance = async () => {
    if (!user || !user.public_key) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use backend API endpoint (recommended)
      const response = await api.get('/smart-wallet/balance', {
        params: {
          userPublicKey: user.public_key
        }
      });

      setBalance(response.data.balance);
      setBalanceInXLM(response.data.balanceInXLM);
      setContractId(response.data.contractId);
    } catch (err) {
      console.error('Failed to fetch smart wallet balance:', err);
      setError(err.response?.data?.error || 'Failed to load smart wallet balance');
      setBalance(null);
      setBalanceInXLM(null);
    } finally {
      setLoading(false);
    }
  };

  if (!user || !user.public_key) {
    return null; // Don't show if user is not logged in
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <AccountBalanceWallet sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="h3">
            Smart Wallet Balance
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && balance !== null && (
          <Box>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: 'bold' }}>
              {balanceInXLM ? parseFloat(balanceInXLM).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7
              }) : '0.00'} XLM
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {balance ? BigInt(balance).toLocaleString() : '0'} stroops
            </Typography>
            {contractId && (
              <Chip 
                label={`Contract: ${contractId.substring(0, 8)}...`}
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </Box>
        )}

        {!loading && !error && balance === null && (
          <Typography variant="body2" color="text.secondary">
            No balance data available
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default SmartWalletBalance;

