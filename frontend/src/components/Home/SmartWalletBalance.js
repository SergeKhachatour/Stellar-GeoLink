import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  CircularProgress,
  Alert,
  Chip,
  Button,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import { AccountBalanceWallet, ArrowDownward, Visibility, VisibilityOff, Lock, History } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../contexts/WalletContext';
import api from '../../services/api';
import DepositDialog from '../Wallet/DepositDialog';
import TransactionHistoryDialog from '../Wallet/TransactionHistoryDialog';
import webauthnService from '../../services/webauthnService';

const SmartWalletBalance = () => {
  const { user } = useAuth();
  const { isConnected, publicKey, balance: walletBalance, loadAccountInfo } = useWallet();
  const [balance, setBalance] = useState(null);
  const [balanceInXLM, setBalanceInXLM] = useState(null);
  const [vaultBalance, setVaultBalance] = useState(null);
  const [vaultBalanceInXLM, setVaultBalanceInXLM] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [contractId, setContractId] = useState(null);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [transactionHistoryOpen, setTransactionHistoryOpen] = useState(false);
  const [xlmBalanceRevealed, setXlmBalanceRevealed] = useState(false);
  const [revealingBalance, setRevealingBalance] = useState(false);

  // Determine which public key to use: connected wallet takes priority, then user's public_key
  const effectivePublicKey = publicKey || (user && user.public_key);

  useEffect(() => {
    if (effectivePublicKey) {
      fetchBalance();
    }
    fetchVaultBalance(); // Vault balance doesn't need a user public key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePublicKey, user]);

  const fetchBalance = async () => {
    if (!effectivePublicKey) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use backend API endpoint (recommended)
      const response = await api.get('/smart-wallet/balance', {
        params: {
          userPublicKey: effectivePublicKey
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

  const fetchVaultBalance = async () => {
    try {
      const response = await api.get('/smart-wallet/vault-balance');
      setVaultBalance(response.data.balance);
      setVaultBalanceInXLM(response.data.balanceInXLM);
    } catch (err) {
      console.error('Failed to fetch vault balance:', err);
      // Don't show error for vault balance, just set to null
      setVaultBalance(null);
      setVaultBalanceInXLM(null);
    }
  };

  const handleDepositSuccess = async () => {
    // Wait for the transaction to propagate on the network
    // Horizon can take a few seconds to reflect balance changes
    console.log('[SmartWalletBalance] Waiting for transaction to propagate...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Refresh both balances after successful deposit
    fetchBalance();
    fetchVaultBalance();
    
    // Also refresh the wallet balance from WalletContext if wallet is connected
    // This updates the XLM balance shown in the wallet connection UI
    // Retry a few times as Horizon may not have updated immediately
    if (isConnected && publicKey) {
      let retries = 3;
      let success = false;
      
      while (retries > 0 && !success) {
        try {
          console.log(`[SmartWalletBalance] Refreshing account balance (${4 - retries}/3 attempts)...`);
          await loadAccountInfo(publicKey);
          console.log('[SmartWalletBalance] ✅ Account balance refreshed successfully');
          success = true;
          
          // Verify the balance was updated by checking if it changed
          // (This is just for logging, the state will update automatically)
        } catch (err) {
          retries--;
          if (retries > 0) {
            console.warn(`[SmartWalletBalance] ⚠️ Failed to refresh account balance, retrying in 2 seconds... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.warn('[SmartWalletBalance] ⚠️ Failed to refresh account balance after all retries:', err);
            // Don't throw - this is not critical, balances will update on next page refresh
          }
        }
      }
    }
  };

  const handleRevealBalance = async () => {
    if (!isConnected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setRevealingBalance(true);
    setError(null);

    try {
      // Get user's passkeys
      const passkeysResponse = await api.get('/webauthn/passkeys');
      const passkeys = passkeysResponse.data.passkeys || [];
      
      if (passkeys.length === 0) {
        throw new Error('No passkey registered. Please register a passkey first to reveal your balance.');
      }

      const selectedPasskey = passkeys[0];
      const credentialId = selectedPasskey.credentialId || selectedPasskey.credential_id;
      
      if (!credentialId) {
        throw new Error('No credential ID found in passkey data');
      }

      // Create a challenge for authentication
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const challengeBase64 = btoa(String.fromCharCode(...challenge));

      // Authenticate with passkey
      await webauthnService.authenticateWithPasskey(
        credentialId,
        challengeBase64
      );

      // If authentication succeeds, reveal the balance
      setXlmBalanceRevealed(true);
    } catch (err) {
      console.error('Failed to reveal balance:', err);
      setError(err.response?.data?.error || err.message || 'Failed to reveal balance. Please try again.');
    } finally {
      setRevealingBalance(false);
    }
  };

  // Show if user is logged in OR wallet is connected
  if (!user && !isConnected) {
    return null; // Don't show if user is not logged in and no wallet is connected
  }

  return (
    <>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <AccountBalanceWallet sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" component="h3">
                Smart Wallet Vault
              </Typography>
            </Box>
            {isConnected && publicKey && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<History />}
                  onClick={() => setTransactionHistoryOpen(true)}
                >
                  Transactions
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ArrowDownward />}
                  onClick={() => setDepositDialogOpen(true)}
                >
                  Deposit
                </Button>
              </Box>
            )}
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

        {!loading && !error && (
          <Box>
            {/* Vault Balance (Total) */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Total Vault Balance
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                {vaultBalanceInXLM ? parseFloat(vaultBalanceInXLM).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7
                }) : '0.00'} XLM
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* User's Personal Balance */}
            {balance !== null && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Your Balance
                  </Typography>
                  {!xlmBalanceRevealed && (
                    <Tooltip title="Reveal balance with passkey authentication">
                      <IconButton
                        size="small"
                        onClick={handleRevealBalance}
                        disabled={revealingBalance}
                        sx={{ color: 'text.secondary' }}
                      >
                        {revealingBalance ? <CircularProgress size={16} /> : <VisibilityOff />}
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                {xlmBalanceRevealed ? (
                  <>
                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                      {balanceInXLM ? parseFloat(balanceInXLM).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 7
                      }) : '0.00'} XLM
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                      {balance ? (() => {
                        try {
                          // Use BigInt for large numbers, fallback to Number
                          // eslint-disable-next-line no-undef
                          return BigInt(balance).toLocaleString();
                        } catch {
                          return Number(balance).toLocaleString();
                        }
                      })() : '0'} stroops
                    </Typography>
                  </>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Lock sx={{ fontSize: 20, color: 'text.secondary' }} />
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                      ••••••• XLM
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleRevealBalance}
                      disabled={revealingBalance}
                      startIcon={revealingBalance ? <CircularProgress size={16} /> : <Visibility />}
                      sx={{ ml: 1 }}
                    >
                      {revealingBalance ? 'Authenticating...' : 'Reveal'}
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* Wallet XLM Balance (Hidden by default) */}
            {isConnected && publicKey && walletBalance !== null && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Account Balance
                  </Typography>
                  <Tooltip title="Your Stellar account balance (on-chain). This is separate from your smart wallet balance. Deposits reduce this balance.">
                    <IconButton size="small" sx={{ color: 'text.secondary' }}>
                      <AccountBalanceWallet fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {walletBalance ? parseFloat(walletBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7
                  }) : '0.00'} XLM
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                  Your on-chain Stellar account balance. When you deposit to the smart wallet, this balance decreases.
                </Typography>
              </Box>
            )}

            {contractId && (
              <Chip 
                label={`Contract: ${contractId.substring(0, 8)}...`}
                size="small"
                sx={{ mt: 2 }}
              />
            )}
          </Box>
        )}

        {!loading && !error && balance === null && vaultBalance === null && (
          <Typography variant="body2" color="text.secondary">
            No balance data available
          </Typography>
        )}
      </CardContent>
    </Card>

    <DepositDialog
      open={depositDialogOpen}
      onClose={() => setDepositDialogOpen(false)}
      onDepositSuccess={handleDepositSuccess}
    />
    
    <TransactionHistoryDialog
      open={transactionHistoryOpen}
      onClose={() => setTransactionHistoryOpen(false)}
    />
    </>
  );
};

export default SmartWalletBalance;

