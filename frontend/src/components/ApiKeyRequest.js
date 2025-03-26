import React, { useState } from 'react';
import {
    Container,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    Box
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const ApiKeyRequest = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        purpose: '',
        organization_name: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/user/api-key-request', formData);
            navigate(-1); // Go back to previous page
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit API key request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Request API Key
                </Typography>
                
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                <form onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Purpose"
                        multiline
                        rows={4}
                        value={formData.purpose}
                        onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                        margin="normal"
                        required
                    />
                    <TextField
                        fullWidth
                        label="Organization Name"
                        value={formData.organization_name}
                        onChange={(e) => setFormData({...formData, organization_name: e.target.value})}
                        margin="normal"
                        required
                    />
                    <Box sx={{ mt: 2 }}>
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            disabled={loading}
                        >
                            Submit Request
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Container>
    );
};

export default ApiKeyRequest; 