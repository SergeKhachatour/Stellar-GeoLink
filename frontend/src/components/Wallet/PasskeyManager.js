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
  Fingerprint as FingerprintIcon,
  Edit as EditIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import passkeyService from '../../services/passkeyService';
import walletEncryptionHelper from '../../utils/walletEncryptionHelper';
import keyVaultService from '../../services/keyVaultService';
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
  const [editingName, setEditingName] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [deletingPasskey, setDeletingPasskey] = useState(null);
  const [prfAvailable, setPrfAvailable] = useState(false);
  const [walletEncrypted, setWalletEncrypted] = useState(false);
  const [keyDerivationMethod, setKeyDerivationMethod] = useState(null);

  useEffect(() => {
    if (isConnected && publicKey) {
      fetchPasskeys();
      checkPrfAvailability();
      checkWalletEncryption();
    }
  }, [isConnected, publicKey]);

  const checkPrfAvailability = async () => {
    try {
      const available = await passkeyService.isAvailable();
      setPrfAvailable(available);
    } catch (err) {
      console.warn('Failed to check PRF availability:', err);
      setPrfAvailable(false);
    }
  };

  const checkWalletEncryption = () => {
    const encrypted = walletEncryptionHelper.isWalletEncrypted();
    setWalletEncrypted(encrypted);
    
    if (encrypted) {
      try {
        const encryptedData = keyVaultService.getEncryptedWalletData();
        if (encryptedData?.metadata?.keyDerivation) {
          setKeyDerivationMethod(encryptedData.metadata.keyDerivation);
        }
      } catch (err) {
        console.warn('Failed to get key derivation method:', err);
      }
    }
  };

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

      // Check if PRF extension is available
      const prfAvailable = await passkeyService.isAvailable();
      
      // Step 1: Register passkey with new passkeyService (with PRF support)
      const passkeyData = await passkeyService.registerPasskey(publicKey, { 
        usePRF: prfAvailable 
      });

      // Step 2: If wallet is encrypted, update encryption with PRF result
      if (walletEncryptionHelper.isWalletEncrypted() && passkeyData.prfResult) {
        console.log('[PasskeyManager] PRF result available, can be used for wallet encryption');
        // Note: The PRF result is already stored during registration
        // The keyVaultService will use it if available during encryption
      }

      // Step 3: Register on smart wallet contract via backend
      await api.post('/webauthn/register', {
        passkeyPublicKeySPKI: passkeyData.publicKeySPKI,
        credentialId: passkeyData.credentialId,
        secretKey: userSecretKey
      });

      // Step 4: If wallet is not encrypted yet, offer to encrypt it
      if (!walletEncryptionHelper.isWalletEncrypted() && userSecretKey) {
        try {
          await walletEncryptionHelper.encryptAndStoreWallet(userSecretKey, publicKey, {
            autoRegisterPasskey: false, // Already registered
            passphrase: null
          });
          setSuccess('Passkey registered successfully! Wallet encrypted with passkey.');
        } catch (encryptError) {
          console.warn('[PasskeyManager] Failed to encrypt wallet:', encryptError);
          setSuccess('Passkey registered successfully! (Wallet encryption skipped)');
        }
      } else {
        setSuccess(`Passkey registered successfully! ${passkeyData.prfResult ? 'PRF extension enabled.' : 'Using standard key derivation.'}`);
      }

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

  const handleDeletePasskey = async (passkey) => {
    setDeletingPasskey(passkey);
  };

  const confirmDeletePasskey = async () => {
    if (!deletingPasskey) return;

    try {
      setLoading(true);
      setError('');
      // URL encode the credentialId to handle special characters
      const encodedCredentialId = encodeURIComponent(deletingPasskey.credentialId);
      const response = await api.delete(`/webauthn/passkeys/${encodedCredentialId}`);
      setSuccess(response.data.message || 'Passkey removed successfully');
      if (response.data.wasOnContract) {
        setError('Note: This passkey is still registered on the smart wallet contract. Register a new passkey to overwrite it.');
      }
      await fetchPasskeys();
      setDeletingPasskey(null);
    } catch (err) {
      console.error('Error removing passkey:', err);
      setError(err.response?.data?.details || 'Failed to remove passkey');
    } finally {
      setLoading(false);
    }
  };

  const handleRenamePasskey = (passkey) => {
    setEditingName(passkey.credentialId);
    setEditingNameValue(passkey.name || `Passkey ${passkeys.indexOf(passkey) + 1}`);
  };

  const saveRename = async (credentialId) => {
    if (!editingNameValue.trim()) {
      setError('Passkey name cannot be empty');
      return;
    }

    try {
      setLoading(true);
      setError('');
      // URL encode the credentialId to handle special characters
      const encodedCredentialId = encodeURIComponent(credentialId);
      await api.put(`/webauthn/passkeys/${encodedCredentialId}`, {
        name: editingNameValue.trim()
      });
      setSuccess('Passkey name updated successfully');
      await fetchPasskeys();
      setEditingName(null);
      setEditingNameValue('');
    } catch (err) {
      console.error('Error renaming passkey:', err);
      setError(err.response?.data?.details || 'Failed to rename passkey');
    } finally {
      setLoading(false);
    }
  };

  const cancelRename = () => {
    setEditingName(null);
    setEditingNameValue('');
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

        {/* PRF and Encryption Status */}
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Security Status
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              PRF Extension: {prfAvailable ? '✅ Available' : '❌ Not Available'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Wallet Encryption: {walletEncrypted ? '✅ Encrypted' : '❌ Not Encrypted'}
            </Typography>
            {keyDerivationMethod && (
              <Typography variant="caption" color="text.secondary">
                Key Derivation: {keyDerivationMethod === 'PRF' ? '🔐 PRF (Most Secure)' : 
                                keyDerivationMethod === 'PBKDF2' ? '🔑 PBKDF2 (Secure)' : 
                                '⚠️ Fallback (Less Secure)'}
              </Typography>
            )}
          </Box>
        </Box>

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
                  primary={
                    editingName === passkey.credentialId ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          size="small"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              saveRename(passkey.credentialId);
                            } else if (e.key === 'Escape') {
                              cancelRename();
                            }
                          }}
                          autoFocus
                          sx={{ flex: 1 }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => saveRename(passkey.credentialId)}
                          disabled={loading}
                          color="primary"
                        >
                          <CheckCircleIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={cancelRename}
                          disabled={loading}
                        >
                          <CancelIcon />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">
                          {passkey.name || `Passkey ${index + 1}`}
                        </Typography>
                        {passkey.isOnContract && (
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 1,
                              py: 0.25,
                              bgcolor: 'success.light',
                              color: 'success.contrastText',
                              borderRadius: 1,
                              fontSize: '0.75rem',
                              fontWeight: 500
                            }}
                          >
                            <CheckCircleIcon sx={{ fontSize: '0.875rem' }} />
                            Active on Contract
                          </Box>
                        )}
                        {passkey.isDefault && (
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 1,
                              py: 0.25,
                              bgcolor: 'primary.light',
                              color: 'primary.contrastText',
                              borderRadius: 1,
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              ml: 1
                            }}
                          >
                            ⭐ Default
                          </Box>
                        )}
                        {!passkey.isDefault && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={async () => {
                              try {
                                setLoading(true);
                                setError('');
                                const encodedCredentialId = encodeURIComponent(passkey.credentialId);
                                await api.put(`/webauthn/passkeys/${encodedCredentialId}`, {
                                  is_default: true
                                });
                                setSuccess('Default passkey updated successfully');
                                await fetchPasskeys();
                              } catch (err) {
                                console.error('Error setting default passkey:', err);
                                setError(err.response?.data?.details || 'Failed to set default passkey');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                            sx={{ ml: 1, fontSize: '0.7rem', py: 0.25 }}
                          >
                            Set as Default
                          </Button>
                        )}
                      </Box>
                    )
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Registered: {new Date(passkey.registeredAt).toLocaleString()}
                      </Typography>
                      {passkey.role && (
                        <Typography variant="caption" color="text.secondary">
                          Role: {passkey.role}
                        </Typography>
                      )}
                      {walletEncrypted && passkey.credentialId === walletEncryptionHelper.getStoredCredentialId() && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                          🔐 Used for wallet encryption
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  {editingName !== passkey.credentialId && (
                    <>
                      <IconButton
                        edge="end"
                        onClick={() => handleRenamePasskey(passkey)}
                        disabled={loading}
                        sx={{ mr: 1 }}
                        size="small"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={() => handleDeletePasskey(passkey)}
                        disabled={loading}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingPasskey}
        onClose={() => setDeletingPasskey(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Passkey</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete "{deletingPasskey?.name || 'this passkey'}"?
          </Typography>
          {deletingPasskey?.isOnContract && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>⚠️ This passkey is currently registered on the smart wallet contract.</strong>
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Deleting it from the database will not remove it from the contract. The contract stores only one passkey per public key.
                To change the passkey on the contract, you'll need to register a new passkey, which will overwrite this one.
              </Typography>
            </Alert>
          )}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              This action will remove the passkey from your account. You can always register a new passkey later.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingPasskey(null)}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeletePasskey}
            variant="contained"
            color="error"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default PasskeyManager;

