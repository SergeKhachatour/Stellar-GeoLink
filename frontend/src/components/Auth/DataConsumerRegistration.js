import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Alert,
    Box
} from '@mui/material';
import api from '../../utils/api';

const DataConsumerRegistration = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        organization: '',
        useCase: ''
    });
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        
        try {
            await api.post('/user/register/data-consumer', formData);
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (error) {
            setError(error.response?.data?.error || 'Registration failed');
        }
    };

    return (
        <Box sx={{ maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
            <Card>
                <CardContent>
                    <Typography variant="h5" gutterBottom>
                        Register as Data Consumer
                    </Typography>
                    <Typography variant="body2" color="textSecondary" paragraph>
                        Get access to wallet location data through our secure API.
                    </Typography>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Registration successful! Your API key request is pending approval.
                            You will be redirected to login...
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            label="Email"
                            type="email"
                            required
                            fullWidth
                            margin="normal"
                            value={formData.email}
                            onChange={(e) => setFormData({
                                ...formData,
                                email: e.target.value
                            })}
                        />
                        <TextField
                            label="Password"
                            type="password"
                            required
                            fullWidth
                            margin="normal"
                            value={formData.password}
                            onChange={(e) => setFormData({
                                ...formData,
                                password: e.target.value
                            })}
                        />
                        <TextField
                            label="First Name"
                            required
                            fullWidth
                            margin="normal"
                            value={formData.firstName}
                            onChange={(e) => setFormData({
                                ...formData,
                                firstName: e.target.value
                            })}
                        />
                        <TextField
                            label="Last Name"
                            required
                            fullWidth
                            margin="normal"
                            value={formData.lastName}
                            onChange={(e) => setFormData({
                                ...formData,
                                lastName: e.target.value
                            })}
                        />
                        <TextField
                            label="Organization"
                            required
                            fullWidth
                            margin="normal"
                            value={formData.organization}
                            onChange={(e) => setFormData({
                                ...formData,
                                organization: e.target.value
                            })}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="useCase"
                            label="Use Case Description"
                            multiline
                            rows={4}
                            value={formData.useCase}
                            onChange={(e) => setFormData({
                                ...formData,
                                useCase: e.target.value
                            })}
                            helperText="Please provide a detailed description of how you plan to use our API (minimum 50 characters)"
                        />
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            fullWidth
                            size="large"
                            sx={{ mt: 2 }}
                            disabled={success}
                        >
                            Register
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default DataConsumerRegistration; 