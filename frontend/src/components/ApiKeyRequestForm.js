import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress
} from '@mui/material';
import { Send, Description } from '@mui/icons-material';
import api from '../utils/api';

const ApiKeyRequestForm = ({ onSuccess, onCancel }) => {
    const [formData, setFormData] = useState({
        request_type: 'data_consumer',
        organization_name: '',
        purpose: '',
        business_justification: '',
        expected_usage: '',
        contact_email: '',
        contact_phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Prevent multiple submissions
        if (loading) return;
        
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.post('/user/api-key-request', formData);
            setSuccess('API key request submitted successfully! You will be notified once it\'s reviewed.');
            if (onSuccess) onSuccess(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card sx={{ maxWidth: 800, mx: 'auto', mt: 2 }}>
            <CardContent>
                <Box display="flex" alignItems="center" mb={3}>
                    <Description sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h5" component="h2">
                        Request API Key
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Submit a request for API access. Our team will review your request and get back to you within 24-48 hours.
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        {success}
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth required>
                                <InputLabel>Request Type</InputLabel>
                                <Select
                                    name="request_type"
                                    value={formData.request_type}
                                    onChange={handleChange}
                                    label="Request Type"
                                >
                                    <MenuItem value="data_consumer">Data Consumer</MenuItem>
                                    <MenuItem value="wallet_provider">Wallet Provider</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="organization_name"
                                label="Organization Name"
                                value={formData.organization_name}
                                onChange={handleChange}
                                required
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                name="purpose"
                                label="Purpose of API Access"
                                value={formData.purpose}
                                onChange={handleChange}
                                placeholder="e.g., Building a wallet integration, Analytics dashboard, etc."
                                required
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                name="business_justification"
                                label="Business Justification"
                                value={formData.business_justification}
                                onChange={handleChange}
                                placeholder="Please explain why you need API access and how you plan to use it..."
                                required
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="expected_usage"
                                label="Expected Usage (requests/month)"
                                value={formData.expected_usage}
                                onChange={handleChange}
                                placeholder="e.g., 10,000 requests/month"
                                type="number"
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="contact_email"
                                label="Contact Email"
                                value={formData.contact_email}
                                onChange={handleChange}
                                type="email"
                                required
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="contact_phone"
                                label="Contact Phone (Optional)"
                                value={formData.contact_phone}
                                onChange={handleChange}
                                placeholder="+1 (555) 123-4567"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Box display="flex" gap={2} justifyContent="flex-end">
                                {onCancel && (
                                    <Button
                                        variant="outlined"
                                        onClick={onCancel}
                                        disabled={loading}
                                    >
                                        Cancel
                                    </Button>
                                )}
                                <Button
                                    type="submit"
                                    variant="contained"
                                    startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                                    disabled={loading}
                                >
                                    {loading ? 'Submitting...' : 'Submit Request'}
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </form>
            </CardContent>
        </Card>
    );
};

export default ApiKeyRequestForm;
