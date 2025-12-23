import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Typography,
    Container,
    Paper,
    Alert,
    Tabs,
    Tab
} from '@mui/material';
import { AccountBalanceWallet, Email } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import WalletConnectionDialog from './Wallet/WalletConnectionDialog';
import webauthnService from '../services/webauthnService';
import api from '../services/api';

const Register = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { register } = useAuth();
    const { publicKey: walletPublicKey, secretKey, isConnected } = useWallet();
    // Check if we're coming from login with a new wallet
    const [registrationMode, setRegistrationMode] = useState(
        (location.state?.walletMode || walletPublicKey) ? 1 : 0
    ); // 0 = traditional, 1 = wallet-based
    const [showWalletDialog, setShowWalletDialog] = useState(false);

    // If coming from login with wallet mode, ensure wallet tab is selected
    useEffect(() => {
        if (location.state?.walletMode && walletPublicKey) {
            setRegistrationMode(1);
        }
    }, [location.state, walletPublicKey]);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        organization: '',
        role: 'data_consumer',
        useCase: ''
    });

    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const roles = [
        { value: 'data_consumer', label: 'Data Consumer' },
        { value: 'wallet_provider', label: 'Wallet Provider' },
        { value: 'nft_manager', label: 'NFT Manager' }
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear error when field is modified
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        const isWalletBased = registrationMode === 1;

        if (isWalletBased) {
            // Wallet-based validation
            if (!walletPublicKey) {
                newErrors.wallet = 'Please connect your wallet first';
            }
        } else {
            // Traditional validation
            // Email validation
            if (!formData.email) {
                newErrors.email = 'Email is required';
            } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
                newErrors.email = 'Email is invalid';
            }

            // Password validation
            if (!formData.password) {
                newErrors.password = 'Password is required';
            } else if (formData.password.length < 8) {
                newErrors.password = 'Password must be at least 8 characters';
            }

            if (formData.password !== formData.confirmPassword) {
                newErrors.confirmPassword = 'Passwords do not match';
            }

            // Other validations (required for traditional)
            if (!formData.firstName) newErrors.firstName = 'First name is required';
            if (!formData.lastName) newErrors.lastName = 'Last name is required';
            if (!formData.organization) newErrors.organization = 'Organization is required';
        }

        // Use case validation for data consumers (required for both modes)
        if (formData.role === 'data_consumer') {
            if (!formData.useCase) {
                newErrors.useCase = 'Use case description is required';
            } else if (formData.useCase.length < 50) {
                newErrors.useCase = 'Use case description must be at least 50 characters';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');
        setIsSubmitting(true);

        if (!validateForm()) {
            setIsSubmitting(false);
            return;
        }

        try {
            const isWalletBased = registrationMode === 1;
            
            // Step 1: Register the account
            const registrationResult = await register({
                // Traditional fields
                email: isWalletBased ? undefined : formData.email,
                password: isWalletBased ? undefined : formData.password,
                // Wallet-based field
                public_key: isWalletBased ? walletPublicKey : undefined,
                // Optional fields (can be empty for wallet-based)
                firstName: formData.firstName || undefined,
                lastName: formData.lastName || undefined,
                organization: formData.organization || undefined,
                role: formData.role,
                useCase: formData.role === 'data_consumer' ? formData.useCase : undefined
            });

            // Registration successful - user is now logged in (token stored in AuthContext)
            console.log('Registration successful:', registrationResult);

            // Step 2: For wallet-based registration, prompt for passkey registration
            if (isWalletBased && walletPublicKey) {
                try {
                    // Check if WebAuthn is supported
                    if (navigator.credentials && navigator.credentials.create) {
                        // Prompt user to register passkey (optional but recommended)
                        const registerPasskey = window.confirm(
                            'Would you like to register a passkey for secure authentication? ' +
                            'This allows you to sign in using biometrics or device security.'
                        );

                        if (registerPasskey) {
                            try {
                                // Get secret key from wallet context or localStorage
                                const effectiveSecretKey = secretKey || localStorage.getItem('stellar_secret_key');
                                
                                if (effectiveSecretKey) {
                                    // Register passkey
                                    const passkeyData = await webauthnService.registerPasskey(walletPublicKey);
                                    
                                    // Register passkey on smart wallet contract via backend
                                    await api.post('/webauthn/register', {
                                        passkeyPublicKeySPKI: passkeyData.publicKey,
                                        credentialId: passkeyData.credentialId,
                                        userPublicKey: walletPublicKey,
                                        secretKey: effectiveSecretKey
                                    });

                                    console.log('✅ Passkey registered successfully');
                                } else {
                                    // Secret key not available, user can register passkey later
                                    console.log('Secret key not available for passkey registration. User can register later.');
                                }
                            } catch (passkeyError) {
                                // Passkey registration failed, but account is still created
                                console.warn('Passkey registration failed:', passkeyError);
                                // Don't block registration if passkey fails
                            }
                        }
                    }
                } catch (webauthnError) {
                    // WebAuthn not supported or failed, but account is still created
                    console.warn('WebAuthn not available:', webauthnError);
                }
            }

            // Registration successful, redirect to appropriate dashboard based on role
            const userRole = registrationResult?.user?.role || registrationResult?.role || formData.role;
            if (userRole === 'admin') {
                navigate('/admin');
            } else if (userRole === 'nft_manager') {
                navigate('/dashboard/nft');
            } else if (userRole === 'wallet_provider') {
                navigate('/dashboard/provider');
            } else if (userRole === 'data_consumer') {
                navigate('/dashboard/consumer');
            } else {
                // Fallback to general dashboard
                navigate('/dashboard');
            }
        } catch (error) {
            setSubmitError(error.message || 'Registration failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: { xs: 2, md: 4 } }}>
                <Paper sx={{ p: { xs: 2, md: 4 } }}>
                    <Typography 
                        variant="h5" 
                        gutterBottom 
                        align="center"
                        sx={{ 
                            fontSize: { xs: '1.5rem', md: '1.75rem' },
                            mb: { xs: 2, md: 3 }
                        }}
                    >
                        Create Account
                    </Typography>

                    {/* Registration Mode Tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                        <Tabs 
                            value={registrationMode} 
                            onChange={(e, newValue) => {
                                setRegistrationMode(newValue);
                                setErrors({});
                                setSubmitError('');
                            }}
                            aria-label="registration mode tabs"
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
                        </Tabs>
                    </Box>
                    
                    {submitError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {submitError}
                        </Alert>
                    )}

                    {/* Wallet-based registration info */}
                    {registrationMode === 1 && !isConnected && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Please connect your Stellar wallet to continue with wallet-based registration.
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

                    {registrationMode === 1 && isConnected && walletPublicKey && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Wallet connected: {walletPublicKey.substring(0, 8)}...{walletPublicKey.substring(48)}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit}>
                    {/* Traditional registration fields - only show if traditional mode */}
                    {registrationMode === 0 && (
                        <>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                label="Email Address"
                                name="email"
                                autoComplete="email"
                                value={formData.email}
                                onChange={handleChange}
                                error={!!errors.email}
                                helperText={errors.email}
                                sx={{
                                    '& .MuiInputBase-input': {
                                        fontSize: { xs: '1rem', md: '1rem' }
                                    }
                                }}
                            />

                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                type="password"
                                value={formData.password}
                                onChange={handleChange}
                                error={!!errors.password}
                                helperText={errors.password}
                                sx={{
                                    '& .MuiInputBase-input': {
                                        fontSize: { xs: '1rem', md: '1rem' }
                                    }
                                }}
                            />

                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="confirmPassword"
                                label="Confirm Password"
                                type="password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                error={!!errors.confirmPassword}
                                helperText={errors.confirmPassword}
                                sx={{
                                    '& .MuiInputBase-input': {
                                        fontSize: { xs: '1rem', md: '1rem' }
                                    }
                                }}
                            />
                        </>
                    )}

                    {/* Wallet error display */}
                    {registrationMode === 1 && errors.wallet && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {errors.wallet}
                        </Alert>
                    )}

                    <TextField
                        margin="normal"
                        required={registrationMode === 0}
                        fullWidth
                        name="firstName"
                        label="First Name (Optional for wallet-based)"
                        value={formData.firstName}
                        onChange={handleChange}
                        error={!!errors.firstName}
                        helperText={errors.firstName || (registrationMode === 1 ? 'Optional' : 'Required')}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontSize: { xs: '1rem', md: '1rem' }
                            }
                        }}
                    />

                    <TextField
                        margin="normal"
                        required={registrationMode === 0}
                        fullWidth
                        name="lastName"
                        label="Last Name (Optional for wallet-based)"
                        value={formData.lastName}
                        onChange={handleChange}
                        error={!!errors.lastName}
                        helperText={errors.lastName || (registrationMode === 1 ? 'Optional' : 'Required')}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontSize: { xs: '1rem', md: '1rem' }
                            }
                        }}
                    />

                    <FormControl fullWidth margin="normal">
                        <InputLabel>Role</InputLabel>
                        <Select
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                            label="Role"
                            sx={{
                                '& .MuiSelect-select': {
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }
                            }}
                        >
                            {roles.map(role => (
                                <MenuItem key={role.value} value={role.value}>
                                    {role.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        margin="normal"
                        required={registrationMode === 0}
                        fullWidth
                        name="organization"
                        label="Organization (Optional for wallet-based)"
                        value={formData.organization}
                        onChange={handleChange}
                        error={!!errors.organization}
                        helperText={errors.organization || (registrationMode === 1 ? 'Optional' : 'Required')}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontSize: { xs: '1rem', md: '1rem' }
                            }
                        }}
                    />

                    {formData.role === 'data_consumer' && (
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="useCase"
                            label="Use Case Description"
                            multiline
                            rows={4}
                            value={formData.useCase}
                            onChange={handleChange}
                            error={!!errors.useCase}
                            helperText={errors.useCase || "Please provide a detailed description of how you plan to use our API (minimum 50 characters)"}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }
                            }}
                        />
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={isSubmitting}
                        sx={{ 
                            mt: 3, 
                            mb: 2,
                            py: { xs: 1.5, md: 1.5 },
                            fontSize: { xs: '1rem', md: '1rem' }
                        }}
                    >
                        {isSubmitting ? 'Registering...' : 'Register'}
                    </Button>

                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Typography 
                            variant="body2" 
                            color="textSecondary"
                            sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                        >
                            Already have an account?{' '}
                            <Button
                                component={RouterLink}
                                to="/login"
                                color="primary"
                                sx={{ 
                                    textTransform: 'none',
                                    fontSize: { xs: '0.9rem', md: '1rem' }
                                }}
                            >
                                Sign in
                            </Button>
                        </Typography>
                    </Box>
                    </Box>
                </Paper>
            </Box>

            {/* Wallet Connection Dialog */}
            <WalletConnectionDialog
                open={showWalletDialog}
                onClose={() => setShowWalletDialog(false)}
            />
        </Container>
    );
};

export default Register; 