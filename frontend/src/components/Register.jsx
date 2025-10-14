import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
    Alert
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const Register = () => {
    const navigate = useNavigate();
    const { register } = useAuth();
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

        // Other validations
        if (!formData.firstName) newErrors.firstName = 'First name is required';
        if (!formData.lastName) newErrors.lastName = 'Last name is required';
        if (!formData.organization) newErrors.organization = 'Organization is required';

        // Use case validation for data consumers
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
            await register({
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                organization: formData.organization,
                role: formData.role,
                useCase: formData.role === 'data_consumer' ? formData.useCase : undefined
            });

            // Registration successful, redirect to login
            navigate('/login');
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
                    
                    {submitError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {submitError}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit}>
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

                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="firstName"
                        label="First Name"
                        value={formData.firstName}
                        onChange={handleChange}
                        error={!!errors.firstName}
                        helperText={errors.firstName}
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
                        name="lastName"
                        label="Last Name"
                        value={formData.lastName}
                        onChange={handleChange}
                        error={!!errors.lastName}
                        helperText={errors.lastName}
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
                        required
                        fullWidth
                        name="organization"
                        label="Organization"
                        value={formData.organization}
                        onChange={handleChange}
                        error={!!errors.organization}
                        helperText={errors.organization}
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
        </Container>
    );
};

export default Register; 