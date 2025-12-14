/**
 * Passkey Manager Component
 * Allows users to register and manage WebAuthn passkeys for smart wallet authentication
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  Security as SecurityIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Fingerprint as FingerprintIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import webauthnService from '../../services/webauthnService';
import api from '../../services/api';

const PasskeyManager = () => {
  const { isConnected, publicKey, secretKey } = useWallet();
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registering, setRegistering] = useState(false);
  const [showSecretKeyDialog, setShowSecretKeyDialog] = useState(false);
  const [secretKeyInput, setSecretKeyInput] = useState('');

  useEffect(() => {
    if (isConnected && publicKey) {
      fetchPasskeys();
    }
  }, [isConnected, publicKey]);

  const fetchPasskeys = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/webauthn/passkeys');
      setPasskeys(response.data.passkeys || []);
    } catch (err) {
      console.error('Error fetching passkeys:', err);
      setError(err.response?.data?.details || 'Failed to fetch passkeys');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!isConnected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    // Check if we have secret key
    const effectiveSecretKey = secretKey || localStorage.getItem('stellar_secret_key');
    if (!effectiveSecretKey) {
      // Prompt for secret key
      setShowSecretKeyDialog(true);
      return;
    }

    await registerPasskeyWithSecretKey(effectiveSecretKey);
  };

  const registerPasskeyWithSecretKey = async (userSecretKey) => {
    try {
      setRegistering(true);
      setError('');
      setSuccess('');

      // Step 1: Register passkey with WebAuthn API
      const passkeyData = await webauthnService.registerPasskey(publicKey);

      // Step 2: Register on smart wallet contract via backend
      await api.post('/webauthn/register', {
        passkeyPublicKeySPKI: passkeyData.publicKey,
        credentialId: passkeyData.credentialId,
        secretKey: userSecretKey
      });

      setSuccess('Passkey registered successfully!');
      await fetchPasskeys();
    } catch (err) {
      console.error('Error registering passkey:', err);
      setError(err.response?.data?.details || err.message || 'Failed to register passkey');
    } finally {
      setRegistering(false);
      setShowSecretKeyDialog(false);
      setSecretKeyInput('');
    }
  };

  const handleDeletePasskey = async (credentialId) => {
    if (!window.confirm('Are you sure you want to remove this passkey?')) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.delete(`/webauthn/passkeys/${credentialId}`);
      setSuccess('Passkey removed successfully');
      await fetchPasskeys();
    } catch (err) {
      console.error('Error removing passkey:', err);
      setError(err.response?.data?.details || 'Failed to remove passkey');
    } finally {
      setLoading(false);
    }
  };

  const handleSecretKeySubmit = () => {
    if (!secretKeyInput.trim()) {
      setError('Please enter your secret key');
      return;
    }

    registerPasskeyWithSecretKey(secretKeyInput.trim());
  };

  if (!isConnected || !publicKey) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <SecurityIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Passkey Management</Typography>
          </Box>
          <Alert severity="info">
            Please connect your wallet to manage passkeys.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SecurityIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Passkey Management</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={registering ? <CircularProgress size={20} /> : <AddIcon />}
            onClick={handleRegisterPasskey}
            disabled={registering}
          >
            {registering ? 'Registering...' : 'Register Passkey'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Passkeys allow you to authenticate transactions using biometrics or device security.
          You can register multiple passkeys for backup.
        </Typography>

        {loading && passkeys.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : passkeys.length === 0 ? (
          <Alert severity="info">
            No passkeys registered. Click "Register Passkey" to add one.
          </Alert>
        ) : (
          <List>
            {passkeys.map((passkey, index) => (
              <ListItem key={passkey.credentialId}>
                <FingerprintIcon sx={{ mr: 2, color: 'primary.main' }} />
                <ListItemText
                  primary={`Passkey ${index + 1}`}
                  secondary={`Registered: ${new Date(passkey.registeredAt).toLocaleString()}`}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => handleDeletePasskey(passkey.credentialId)}
                    disabled={loading}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>

      {/* Secret Key Dialog */}
      <Dialog
        open={showSecretKeyDialog}
        onClose={() => {
          setShowSecretKeyDialog(false);
          setSecretKeyInput('');
          setError('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Enter Secret Key</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your secret key is required to register the passkey on the smart wallet contract.
            It will only be used for this registration and is not stored.
          </Typography>
          <TextField
            label="Secret Key"
            type="password"
            value={secretKeyInput}
            onChange={(e) => {
              setSecretKeyInput(e.target.value);
              setError('');
            }}
            fullWidth
            placeholder="Enter your secret key (starts with S...)"
            helperText="Your secret key will not be stored"
            sx={{ mb: 2 }}
            error={!!error}
          />
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowSecretKeyDialog(false);
              setSecretKeyInput('');
              setError('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSecretKeySubmit}
            variant="contained"
            disabled={!secretKeyInput.trim() || registering}
          >
            {registering ? <CircularProgress size={20} /> : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default PasskeyManager;

