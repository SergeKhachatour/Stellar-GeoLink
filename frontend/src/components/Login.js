import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import api from '../services/api';
import {
    Container,
    Paper,
    TextField,
    Button,
    Typography,
    Box,
    Alert,
    FormControlLabel,
    Checkbox,
    Link as MuiLink,
    Tabs,
    Tab,
    Dialog,
    DialogTitle,
    DialogContent
} from '@mui/material';
import { AccountBalanceWallet, Email, Fingerprint } from '@mui/icons-material';
import LoadingSpinner from './LoadingSpinner';
import WalletConnectionDialog from './Wallet/WalletConnectionDialog';

const Login = () => {
    const [loginMode, setLoginMode] = useState(0); // 0 = traditional, 1 = wallet-based, 2 = passkey
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const [showWalletDialog, setShowWalletDialog] = useState(false);
    const [showRoleDialog, setShowRoleDialog] = useState(false);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [walletPublicKeyForRoles, setWalletPublicKeyForRoles] = useState(null);
    const { login, selectRole, error, setUserFromToken } = useAuth();
    const { publicKey: walletPublicKey, isConnected, connectWalletViewOnly, connectWallet } = useWallet();
    const navigate = useNavigate();

    // Handle redirect to registration when new wallet is created during login
    const handleRegisterWithNewWallet = () => {
        console.log('Redirecting to registration with new wallet...');
        navigate('/register', { 
            state: { walletMode: true },
            replace: false 
        });
    };

    const validateForm = () => {
        const errors = {};
        const isWalletBased = loginMode === 1;

        if (isWalletBased) {
            if (!walletPublicKey || !isConnected) {
                errors.wallet = 'Please connect your wallet first';
            }
        } else {
            if (!credentials.email) {
                errors.email = 'Email is required';
            } else if (!/\S+@\S+\.\S+/.test(credentials.email)) {
                errors.email = 'Email is invalid';
            }
            if (!credentials.password) {
                errors.password = 'Password is required';
            }
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handlePasskeyLogin = async () => {
        if (!navigator.credentials || !navigator.credentials.get) {
            setValidationErrors({ 
                general: 'WebAuthn is not supported in this browser. Please use a different login method.' 
            });
            return;
        }

        setLoading(true);
        setValidationErrors({});
        
        try {
            // Create a challenge for authentication
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            const challengeBase64 = btoa(String.fromCharCode(...challenge));
            
            // Use WebAuthn API to authenticate (empty allowCredentials to show all available passkeys)
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    timeout: 60000,
                    rpId: window.location.hostname,
                    userVerification: 'required'
                    // Don't specify allowCredentials - this will show all available passkeys
                }
            });

            if (!credential) {
                throw new Error('Passkey authentication cancelled or failed');
            }

            // Convert credential ID to base64
            const credentialIdArray = new Uint8Array(credential.rawId);
            const credentialIdBase64 = btoa(String.fromCharCode(...credentialIdArray));

            // Get authentication data
            const response = credential.response;
            const signature = btoa(String.fromCharCode(...new Uint8Array(response.signature)));
            const authenticatorData = btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData)));
            const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON)));

            // Call passkey login endpoint
            const loginResult = await api.post('/auth/login/passkey', {
                credentialId: credentialIdBase64,
                signature,
                authenticatorData,
                clientDataJSON,
                signaturePayload: challengeBase64
            });

            // Check if role selection is required
            if (loginResult.data.requiresRoleSelection) {
                setAvailableRoles(loginResult.data.roles);
                setWalletPublicKeyForRoles(loginResult.data.public_key);
                setShowRoleDialog(true);
                return;
            }

            // Login successful - set token and user directly
            const { token, refreshToken, user } = loginResult.data;
            
            localStorage.setItem('token', token);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }
            
            // Set API authorization header
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            
            // Update AuthContext state directly
            setUserFromToken(user);
            
            // Auto-connect wallet if user has a public_key
            if (user.public_key) {
                try {
                    await connectWalletViewOnly(user.public_key);
                    console.log('Wallet auto-connected after passkey login');
                } catch (error) {
                    console.warn('Failed to auto-connect wallet after passkey login:', error);
                    // Continue anyway - user can connect manually
                }
            }
            
            console.log('Passkey login successful:', user);
            navigate(user.role === 'admin' ? '/admin' : '/dashboard');
        } catch (err) {
            console.error('Passkey login error:', err);
            setValidationErrors({ 
                general: err.response?.data?.message || err.message || 'Passkey login failed. Please try again.' 
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Handle passkey login separately (no form submission)
        if (loginMode === 2) {
            await handlePasskeyLogin();
            return;
        }
        
        if (!validateForm()) return;

        setLoading(true);
        try {
            const isWalletBased = loginMode === 1;
            
            if (isWalletBased) {
                // Wallet-based login: Use direct public_key login
                // Note: Passkey authentication is used for signing transactions on the smart wallet contract,
                // not for web app login. Web app login uses public_key verification.
                const loginResult = await login({ public_key: walletPublicKey });
                
                // Check if role selection is required
                if (loginResult.requiresRoleSelection) {
                    setAvailableRoles(loginResult.roles);
                    setWalletPublicKeyForRoles(loginResult.public_key);
                    setShowRoleDialog(true);
                    return; // Don't navigate yet, wait for role selection
                }
                
                console.log('Login successful (wallet-based):', loginResult);
                navigate(loginResult.role === 'admin' ? '/admin' : '/dashboard');
            } else {
                // Traditional email/password login
                const user = await login(credentials);
                console.log('Login successful:', user);
                if (rememberMe) {
                    localStorage.setItem('rememberMe', 'true');
                }
                
                // Auto-restore wallet if user has a public_key and we have saved wallet data
                if (user.public_key) {
                    const savedPublicKey = localStorage.getItem('stellar_public_key');
                    const savedSecretKey = localStorage.getItem('stellar_secret_key');
                    
                    // If saved wallet matches user's public key, restore it immediately
                    if (savedPublicKey === user.public_key) {
                        console.log('Login: Restoring wallet from localStorage for user');
                        try {
                            // Restore wallet with secret key if available
                            if (savedSecretKey) {
                                // Use connectWallet to restore with secret key
                                await connectWallet(savedSecretKey);
                                console.log('Login: Wallet restored with secret key');
                            } else {
                                // Connect view-only
                                await connectWalletViewOnly(user.public_key);
                                console.log('Login: Wallet connected view-only');
                            }
                        } catch (error) {
                            console.warn('Login: Failed to restore wallet, will restore on dashboard:', error);
                            // Continue anyway - wallet will be restored by WalletContext
                        }
                    } else if (!savedPublicKey) {
                        // No saved wallet, try to connect view-only
                        try {
                            await connectWalletViewOnly(user.public_key);
                            console.log('Login: Wallet connected view-only (no saved wallet)');
                        } catch (error) {
                            console.warn('Login: Failed to connect wallet view-only:', error);
                            // Continue anyway
                        }
                    }
                }
                
                navigate(user.role === 'admin' ? '/admin' : '/dashboard');
            }
        } catch (err) {
            console.error('Login error:', err);
            setValidationErrors({ 
                general: err.response?.data?.message || err.message || 'Login failed. Please try again.' 
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 4, md: 8 }, mb: { xs: 4, md: 8 } }}>
                <Paper sx={{ p: { xs: 2, md: 4 } }}>
                    <Typography 
                        variant="h4" 
                        align="center" 
                        gutterBottom
                        sx={{ 
                            fontSize: { xs: '1.75rem', md: '2rem' },
                            mb: { xs: 2, md: 3 }
                        }}
                    >
                        Login to GeoLink
                    </Typography>

                    {/* Login Mode Tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                        <Tabs 
                            value={loginMode} 
                            onChange={(e, newValue) => {
                                setLoginMode(newValue);
                                setValidationErrors({});
                            }}
                            aria-label="login mode tabs"
                        >
                            <Tab 
                                icon={<Email />} 
                                iconPosition="start" 
                                label="Email & Password" 
                                sx={{ textTransform: 'none' }}
                            />
                            <Tab 
                                icon={<AccountBalanceWallet />} 
                                iconPosition="start" 
                                label="Wallet" 
                                sx={{ textTransform: 'none' }}
                            />
                            <Tab 
                                icon={<Fingerprint />} 
                                iconPosition="start" 
                                label="Passkey" 
                                sx={{ textTransform: 'none' }}
                            />
                        </Tabs>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {/* Wallet-based login info */}
                    {loginMode === 1 && !isConnected && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Please connect your Stellar wallet to continue with wallet-based login.
                            <Button 
                                variant="outlined" 
                                size="small" 
                                sx={{ ml: 2 }}
                                onClick={() => setShowWalletDialog(true)}
                            >
                                Connect Wallet
                            </Button>
                        </Alert>
                    )}

                    {loginMode === 1 && isConnected && walletPublicKey && (
                        <Alert 
                            severity="success" 
                            sx={{ mb: 2 }}
                            action={
                                <Button
                                    color="inherit"
                                    size="small"
                                    onClick={async () => {
                                        await disconnectWallet();
                                        // Also clear WalletConnect connection
                                        localStorage.removeItem('stellar_wallet_connect_id');
                                        // Clear wallet connect service connection
                                        try {
                                            const walletConnectService = await import('../services/walletConnectService');
                                            walletConnectService.disconnectWallet();
                                        } catch (err) {
                                            console.warn('Error disconnecting WalletConnect:', err);
                                        }
                                    }}
                                >
                                    Disconnect
                                </Button>
                            }
                        >
                            Wallet connected: {walletPublicKey.substring(0, 8)}...{walletPublicKey.substring(48)}
                        </Alert>
                    )}

                    {loginMode === 1 && validationErrors.wallet && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {validationErrors.wallet}
                        </Alert>
                    )}

                    {/* Passkey login info */}
                    {loginMode === 2 && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Use your registered passkey to log in. Click the button below to authenticate.
                        </Alert>
                    )}

                    {loginMode === 2 && validationErrors.general && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {validationErrors.general}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        {/* Traditional login fields - only show if traditional mode */}
                        {loginMode === 0 && (
                            <>
                                <TextField
                                    fullWidth
                                    label="Email"
                                    type="email"
                                    margin="normal"
                                    value={credentials.email}
                                    onChange={(e) => setCredentials({
                                        ...credentials,
                                        email: e.target.value
                                    })}
                                    error={!!validationErrors.email}
                                    helperText={validationErrors.email}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: { xs: '1rem', md: '1rem' }
                                        }
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    label="Password"
                                    type="password"
                                    margin="normal"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({
                                        ...credentials,
                                        password: e.target.value
                                    })}
                                    error={!!validationErrors.password}
                                    helperText={validationErrors.password}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: { xs: '1rem', md: '1rem' }
                                        }
                                    }}
                                />
                            </>
                        )}
                        {/* Remember me only for traditional login */}
                        {loginMode === 0 && (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        color="primary"
                                    />
                                }
                                label="Remember me"
                                sx={{ 
                                    mt: 1,
                                    '& .MuiFormControlLabel-label': {
                                        fontSize: { xs: '0.9rem', md: '1rem' }
                                    }
                                }}
                            />
                        )}
                        {loginMode === 2 ? (
                            <Button
                                fullWidth
                                variant="contained"
                                color="primary"
                                onClick={handlePasskeyLogin}
                                sx={{ 
                                    mt: 3, 
                                    mb: 2,
                                    py: { xs: 1.5, md: 1.5 },
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }}
                                disabled={loading}
                                startIcon={<Fingerprint />}
                            >
                                {loading ? 'Authenticating...' : 'Login with Passkey'}
                            </Button>
                        ) : (
                            <Button
                                fullWidth
                                variant="contained"
                                color="primary"
                                type="submit"
                                sx={{ 
                                    mt: 3, 
                                    mb: 2,
                                    py: { xs: 1.5, md: 1.5 },
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }}
                                disabled={loading}
                            >
                                {loading ? 'Logging in...' : 'Login'}
                            </Button>
                        )}
                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <MuiLink 
                                component={Link} 
                                to="/register" 
                                variant="body2"
                                sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                            >
                                Don't have an account? Sign Up
                            </MuiLink>
                        </Box>
                    </form>
                </Paper>
            </Box>

            {/* Wallet Connection Dialog */}
            <WalletConnectionDialog
                open={showWalletDialog}
                onClose={() => setShowWalletDialog(false)}
                onRegister={handleRegisterWithNewWallet}
            />

            {/* Role Selection Dialog */}
            {showRoleDialog && (
                <Dialog open={showRoleDialog} onClose={() => setShowRoleDialog(false)}>
                    <DialogTitle>Select Role</DialogTitle>
                    <DialogContent>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            This wallet is associated with multiple roles. Please select which role you want to access:
                        </Typography>
                        {availableRoles.map((roleOption) => (
                            <Button
                                key={roleOption.id}
                                fullWidth
                                variant="outlined"
                                sx={{ mb: 1 }}
                                onClick={async () => {
                                    try {
                                        const user = await selectRole({
                                            public_key: walletPublicKeyForRoles,
                                            role: roleOption.role,
                                            userId: roleOption.id
                                        });
                                        setShowRoleDialog(false);
                                        navigate(user.role === 'admin' ? '/admin' : '/dashboard');
                                    } catch (err) {
                                        console.error('Role selection error:', err);
                                        setValidationErrors({
                                            general: err.response?.data?.message || 'Failed to select role'
                                        });
                                    }
                                }}
                            >
                                {roleOption.role === 'nft_manager' ? 'NFT Manager' :
                                 roleOption.role === 'wallet_provider' ? 'Wallet Provider' :
                                 roleOption.role === 'data_consumer' ? 'Data Consumer' :
                                 roleOption.role}
                            </Button>
                        ))}
                    </DialogContent>
                </Dialog>
            )}
        </Container>
    );
};

export default Login; 