import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  CircularProgress,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { ArrowDownward, AccountBalanceWallet } from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import webauthnService from '../../services/webauthnService';
import WalletConnectionDialog from './WalletConnectionDialog';

const DepositDialog = ({ open, onClose, onDepositSuccess }) => {
  const { isConnected, publicKey, secretKey, balance, account } = useWallet();
  const walletConnectId = localStorage.getItem('stellar_wallet_connect_id');
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('XLM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState('');
  const [contractBalance, setContractBalance] = useState(null);
  const [depositResponse, setDepositResponse] = useState(null);
  const [showWalletDialog, setShowWalletDialog] = useState(false);

  const fetchContractBalance = useCallback(async () => {
    try {
      // Use the effective public key (from wallet context or user)
      const effectivePublicKey = publicKey || (user && user.public_key);
      if (!effectivePublicKey) {
        return;
      }
      
      const response = await api.get('/smart-wallet/balance', {
        params: {
          userPublicKey: effectivePublicKey
        }
      });
      setContractBalance(response.data.balanceInXLM);
      console.log('[DepositDialog] Contract balance updated:', response.data.balanceInXLM);
    } catch (err) {
      console.error('Failed to fetch contract balance:', err);
      // Don't set to null on error, keep previous value
    }
  }, [publicKey, user]);

  useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      setAmount('');
      setAsset('XLM');
      setError('');
      setSuccess('');
      setStatus('');
      setShowWalletDialog(false);
      // Fetch contract balance when dialog opens
      const effectivePublicKey = publicKey || (user && user.public_key);
      if (effectivePublicKey) {
        fetchContractBalance();
      }
    }
  }, [open, user, publicKey, fetchContractBalance]);

  // Close wallet dialog when wallet is connected with secret key
  useEffect(() => {
    if (isConnected && publicKey && secretKey && showWalletDialog) {
      setShowWalletDialog(false);
      setError(''); // Clear any previous error
    }
  }, [isConnected, publicKey, secretKey, showWalletDialog]);

  // Check if wallet is encrypted when dialog opens
  useEffect(() => {
    if (open && isConnected && publicKey && !secretKey) {
      // Wallet is connected but no secret key - check if it's encrypted
      (async () => {
        try {
          const walletEncryptionHelper = await import('../../utils/walletEncryptionHelper');
          if (walletEncryptionHelper.default.isWalletEncrypted()) {
            console.log('DepositDialog: Wallet is encrypted, will decrypt on deposit attempt');
            // Don't show wallet dialog - we'll handle decryption when user tries to deposit
          }
        } catch (err) {
          console.error('DepositDialog: Error checking wallet encryption:', err);
        }
      })();
    }
  }, [open, isConnected, publicKey, secretKey]);

  // Get available balance from wallet context
  // balance is the XLM balance as a number, or we can get it from account.balances
  const availableBalance = (() => {
    if (balance !== null && balance !== undefined) {
      return balance.toString();
    }
    // Fallback: try to get from account.balances if available
    if (account && account.balances && Array.isArray(account.balances)) {
      const xlmBalance = account.balances.find(b => 
        b.asset_type === 'native' || b.asset === 'XLM'
      );
      return xlmBalance ? xlmBalance.balance : '0';
    }
    return '0';
  })();

  const handleDeposit = async () => {
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!isConnected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    // Check if wallet is connected via WalletConnect (external wallet)
    // If so, we can't use WebAuthn deposits - we need to use direct wallet signing
    if (walletConnectId && !secretKey) {
      setError('Smart wallet deposits require WebAuthn passkeys. External wallets (like Freighter) can sign regular transactions but not smart wallet deposits. Please import your wallet with a secret key to use smart wallet deposits, or use regular transactions instead.');
      return;
    }

    setError('');
    setSuccess('');
    setStatus('Preparing deposit transaction...');
    setLoading(true);

    try {
      // Retrieve secret key - check state first, then try to decrypt encrypted wallet
      let userSecretKey = secretKey;
      if (!userSecretKey) {
        // Check for plaintext secret key in localStorage
        const storedSecretKey = localStorage.getItem('stellar_secret_key');
        if (storedSecretKey) {
          // Verify the stored secret key matches the current public key
          try {
            const StellarSdk = await import('@stellar/stellar-sdk');
            const keypair = StellarSdk.Keypair.fromSecret(storedSecretKey);
            if (keypair.publicKey() === publicKey) {
              userSecretKey = storedSecretKey;
              console.log('DepositDialog: Using secret key from localStorage');
            } else {
              throw new Error('Stored secret key does not match current wallet address');
            }
          } catch (err) {
            console.error('DepositDialog: Invalid secret key in localStorage:', err);
            setError('Secret key in storage is invalid. Please import your wallet with secret key using the "Import Wallet" option.');
            setShowWalletDialog(true);
            setLoading(false);
            return;
          }
        } else {
          // Try to decrypt encrypted wallet
          try {
            const walletEncryptionHelper = await import('../../utils/walletEncryptionHelper');
            if (walletEncryptionHelper.default.isWalletEncrypted()) {
              console.log('DepositDialog: Attempting to decrypt encrypted wallet...');
              // Try decryption first without requiring passkey auth (may work with credentialId fallback)
              try {
                userSecretKey = await walletEncryptionHelper.default.decryptWallet(publicKey);
                console.log('DepositDialog: Encrypted wallet decrypted successfully');
              } catch (decryptError) {
                // If decryption fails and it mentions PRF or passkey, prompt user
                if (decryptError.message.includes('passkey') || decryptError.message.includes('PRF')) {
                  setError('This wallet requires passkey authentication to decrypt. Please authenticate with your passkey to continue.');
                  setStatus('Waiting for passkey authentication...');
                  // Try again with passkey auth requirement
                  userSecretKey = await walletEncryptionHelper.default.decryptWallet(publicKey, { requirePasskeyAuth: true });
                  console.log('DepositDialog: Encrypted wallet decrypted after passkey authentication');
                } else {
                  throw decryptError;
                }
              }
            } else {
              throw new Error('No encrypted wallet found');
            }
          } catch (decryptError) {
            console.error('DepositDialog: Could not decrypt wallet:', decryptError);
            // Don't show wallet dialog if wallet is already connected (even in view-only mode)
            // Instead, show error message with option to decrypt
            if (isConnected && publicKey) {
              setError(decryptError.message || 'Secret key is required for deposits. Your wallet is encrypted. Please authenticate with your passkey to decrypt, or import your wallet with secret key using the "Import Wallet" option.');
            } else {
              setError(decryptError.message || 'Secret key is required for deposits. Please import your wallet with secret key using the "Import Wallet" option.');
              setShowWalletDialog(true);
            }
            setLoading(false);
            return;
          }
        }
      }

      // Get user's passkeys
      const passkeysResponse = await api.get('/webauthn/passkeys');
      const passkeys = passkeysResponse.data.passkeys || [];
      
      if (passkeys.length === 0) {
        throw new Error('No passkey registered. Please register a passkey first.');
      }

      const selectedPasskey = passkeys[0]; // Use first passkey

      // Create deposit data JSON for signature
      const timestamp = Date.now();
      const depositData = {
        source: publicKey,
        asset: asset,
        amount: (parseFloat(amount) * 10000000).toString(), // Convert to stroops
        action: 'deposit',
        timestamp: timestamp
      };
      const signaturePayload = JSON.stringify(depositData);

      // Authenticate with passkey
      setStatus('Authenticating with passkey...');
      
      // Ensure credentialId is a valid string
      const credentialId = selectedPasskey.credentialId || selectedPasskey.credential_id;
      if (!credentialId) {
        throw new Error('No credential ID found in passkey data');
      }
      
      console.log('Using credential ID for authentication:', credentialId.substring(0, 20) + '...');
      
      const authResult = await webauthnService.authenticateWithPasskey(
        credentialId,
        signaturePayload
      );

      // Get passkey public key from backend
      // The passkey info is already in selectedPasskey, but we need the SPKI format
      // Check if we have it in the passkey data, otherwise fetch it
      let passkeyPublicKeySPKI;
      if (selectedPasskey.publicKey || selectedPasskey.public_key_spki) {
        passkeyPublicKeySPKI = selectedPasskey.publicKey || selectedPasskey.public_key_spki;
        console.log('Using passkey public key from passkey list');
      } else {
        // Fallback: try to fetch from backend
        // Note: There's no endpoint to get a single passkey by ID, so we'll use the one from the list
        console.warn('Passkey public key not found in passkey list, cannot proceed');
        throw new Error('Passkey public key not found. Please ensure your passkey is properly registered.');
      }
      
      if (!passkeyPublicKeySPKI) {
        throw new Error('Passkey public key not found');
      }

      setStatus('Submitting deposit transaction...');

      // Call backend deposit endpoint
      const depositResponse = await api.post('/smart-wallet/deposit', {
        userPublicKey: publicKey,
        userSecretKey: userSecretKey, // Use retrieved secret key
        amount: depositData.amount, // In stroops
        assetAddress: null, // Native XLM
        signaturePayload,
        passkeyPublicKeySPKI: passkeyPublicKeySPKI,
        webauthnSignature: authResult.signature,
        webauthnAuthenticatorData: authResult.authenticatorData,
        webauthnClientData: authResult.clientDataJSON
      });

      if (depositResponse.data.success) {
        setDepositResponse(depositResponse.data);
        setSuccess('Deposit successful! Your tokens are now in the smart wallet.');
        setStatus('');
        
        // Wait a moment for the transaction to propagate on the network
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Refresh the contract balance displayed in this dialog
        const effectivePublicKey = publicKey || (user && user.public_key);
        if (effectivePublicKey) {
          await fetchContractBalance();
        }
        
        // Refresh balances in parent component (SmartWalletBalance)
        if (onDepositSuccess) {
          onDepositSuccess();
        }

        // Show success confirmation dialog instead of auto-closing
        // The success message will be displayed in the dialog
        // User can close manually after reviewing transaction details
      } else {
        throw new Error(depositResponse.data.error || 'Deposit failed');
      }
    } catch (err) {
      console.error('Deposit error:', err);
      setStatus('');
      setError(err.response?.data?.error || err.message || 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArrowDownward color="primary" />
          <Typography variant="h6">Deposit to Smart Wallet</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box component="div">
            <Typography variant="body2" component="div">
              <strong>How it works:</strong>
              <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                <li>Deposit tokens into your smart wallet balance</li>
                <li>Use your deposited balance to make payments</li>
                <li>All deposits are secured with passkey authentication</li>
              </ol>
            </Typography>
          </Box>
        </Alert>

        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Available Balance:
          </Typography>
          <Typography variant="h6">
            {parseFloat(availableBalance).toFixed(7)} {asset}
          </Typography>
          {contractBalance !== null && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your Contract Balance:
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {parseFloat(contractBalance).toFixed(7)} {asset}
              </Typography>
            </>
          )}
        </Box>

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
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: <InputAdornment position="end">{asset}</InputAdornment>
          }}
          helperText="Enter amount with up to 7 decimal places"
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Asset</InputLabel>
          <Select value={asset} onChange={(e) => setAsset(e.target.value)} label="Asset">
            <MenuItem value="XLM">XLM (Native)</MenuItem>
          </Select>
        </FormControl>

        {status && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              {status}
            </Box>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            {!secretKey && isConnected && publicKey && (
              <Box sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    // If wallet is encrypted, show message to authenticate
                    // Otherwise, show wallet connection dialog
                    if (isConnected && publicKey) {
                      setError('To decrypt your encrypted wallet, please try depositing again - you will be prompted to authenticate with your passkey. Alternatively, you can import your wallet with secret key.');
                    } else {
                      setShowWalletDialog(true);
                    }
                  }}
                  startIcon={<AccountBalanceWallet />}
                >
                  {isConnected && publicKey ? 'Decrypt Wallet' : 'Import Wallet with Secret Key'}
                </Button>
              </Box>
            )}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="body1" fontWeight="bold" gutterBottom>
                ✅ Deposit Successful!
              </Typography>
              <Typography variant="body2">
                {success}
              </Typography>
              {depositResponse?.hash && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Transaction Hash: {depositResponse.hash.substring(0, 20)}...
                  </Typography>
                </Box>
              )}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {success ? (
          <Button onClick={onClose} variant="contained" color="success">
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleDeposit}
              disabled={loading || !amount || parseFloat(amount) <= 0 || !isConnected}
              startIcon={loading ? <CircularProgress size={20} /> : <ArrowDownward />}
            >
              {loading ? 'Processing...' : 'Deposit Tokens'}
            </Button>
          </>
        )}
      </DialogActions>
      
      {/* Wallet Connection Dialog - shown when secret key is needed */}
      <WalletConnectionDialog
        open={showWalletDialog}
        onClose={() => {
          setShowWalletDialog(false);
          setError(''); // Clear error when dialog is closed
        }}
      />
    </Dialog>
  );
};

export default DepositDialog;

