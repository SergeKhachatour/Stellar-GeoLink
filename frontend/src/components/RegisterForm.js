import React, { useState } from 'react';
import {
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Typography
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const RegisterForm = () => {
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        organization: '',
        role: '',
        useCase: ''
    });

    const roles = [
        { value: 'wallet_provider', label: 'Wallet Provider' },
        { value: 'data_consumer', label: 'Data Consumer' }
    ];

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await register(formData);
            // Handle successful registration
        } catch (error) {
            // Handle registration error
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
            <Typography variant="h5" gutterBottom>
                Register
            </Typography>

            <TextField
                fullWidth
                margin="normal"
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
            />

            <TextField
                fullWidth
                margin="normal"
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
            />

            <TextField
                fullWidth
                margin="normal"
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
            />

            <TextField
                fullWidth
                margin="normal"
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
            />

            <FormControl fullWidth margin="normal">
                <InputLabel>Account Type</InputLabel>
                <Select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    required
                >
                    {roles.map((role) => (
                        <MenuItem key={role.value} value={role.value}>
                            {role.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            <TextField
                fullWidth
                margin="normal"
                label="Organization"
                name="organization"
                value={formData.organization}
                onChange={handleChange}
                required
            />

            {formData.role === 'data_consumer' && (
                <TextField
                    fullWidth
                    margin="normal"
                    label="Use Case"
                    name="useCase"
                    multiline
                    rows={4}
                    value={formData.useCase}
                    onChange={handleChange}
                    required
                    helperText="Please describe how you plan to use the API"
                />
            )}

            <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                sx={{ mt: 3 }}
            >
                Register
            </Button>
        </Box>
    );
};

export default RegisterForm; 