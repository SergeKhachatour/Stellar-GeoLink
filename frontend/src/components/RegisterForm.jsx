import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Link as RouterLink } from 'react-router-dom';

const RegisterForm = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        organization: '',
        role: '', // New field for role selection
        useCase: '' // Only required for data_consumer role
    });

    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Available roles for selection
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

        if (!formData.email) newErrors.email = 'Email is required';
        if (!formData.password) newErrors.password = 'Password is required';
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }
        if (!formData.firstName) newErrors.firstName = 'First name is required';
        if (!formData.lastName) newErrors.lastName = 'Last name is required';
        if (!formData.role) newErrors.role = 'Please select a role';
        if (!formData.organization) newErrors.organization = 'Organization is required';
        if (formData.role === 'data_consumer' && !formData.useCase) {
            newErrors.useCase = 'Use case is required for Data Consumer role';
        }

        // Add specific validation for use case length
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
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    organization: formData.organization,
                    role: formData.role,
                    useCase: formData.role === 'data_consumer' ? formData.useCase : undefined
                })
            });

            if (!response.ok) {
                throw new Error('Registration failed');
            }

            // Redirect based on role
            if (formData.role === 'data_consumer') {
                navigate('/dashboard/consumer');
            } else if (formData.role === 'wallet_provider') {
                navigate('/dashboard/provider');
            }
        } catch (error) {
            setSubmitError(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Paper elevation={3} sx={{ p: 4, mt: 4, mb: 4 }}>
                <Typography variant="h5" component="h1" gutterBottom align="center">
                    Create Account
                </Typography>

                {submitError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {submitError}
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} noValidate>
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
                    />

                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        label="First Name"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        error={!!errors.firstName}
                        helperText={errors.firstName}
                    />

                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        label="Last Name"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        error={!!errors.lastName}
                        helperText={errors.lastName}
                    />

                    <FormControl fullWidth margin="normal" error={!!errors.role}>
                        <InputLabel id="role-label">Account Type *</InputLabel>
                        <Select
                            labelId="role-label"
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                            label="Account Type"
                        >
                            {roles.map((role) => (
                                <MenuItem key={role.value} value={role.value}>
                                    {role.label}
                                </MenuItem>
                            ))}
                        </Select>
                        {errors.role && (
                            <Typography color="error" variant="caption">
                                {errors.role}
                            </Typography>
                        )}
                    </FormControl>

                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        label="Organization"
                        name="organization"
                        value={formData.organization}
                        onChange={handleChange}
                        error={!!errors.organization}
                        helperText={errors.organization}
                    />

                    {formData.role === 'data_consumer' && (
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            label="Use Case Description"
                            name="useCase"
                            multiline
                            rows={4}
                            value={formData.useCase}
                            onChange={handleChange}
                            error={!!errors.useCase}
                            helperText={errors.useCase || "Please provide a detailed description of how you plan to use our API (minimum 50 characters)"}
                        />
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={isSubmitting}
                        sx={{ mt: 3, mb: 2 }}
                    >
                        {isSubmitting ? 'Registering...' : 'Register'}
                    </Button>

                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">
                            Already have an account?{' '}
                            <Button
                                component={RouterLink}
                                to="/login"
                                color="primary"
                                sx={{ textTransform: 'none' }}
                            >
                                Sign in
                            </Button>
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Container>
    );
};

export default RegisterForm; 