import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Alert
} from '@mui/material';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const ApiKeyRequestForm = ({ open, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        purpose: '',
        organization_name: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Set organization name from user profile when form opens
        if (open && user) {
            setFormData(prev => ({
                ...prev,
                organization_name: user.organization || ''
            }));
        }
    }, [open, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/user/api-key-request', {
                purpose: formData.purpose,
                organization_name: formData.organization_name || user?.organization
            });
            onSuccess?.();
            onClose();
            setFormData({ purpose: '', organization_name: '' }); // Reset form
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit API key request');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({ purpose: '', organization_name: '' }); // Reset form
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Request API Key</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    
                    <TextField
                        fullWidth
                        label="Purpose"
                        multiline
                        rows={4}
                        value={formData.purpose}
                        onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                        margin="normal"
                        required
                        helperText="Please describe how you plan to use the API"
                    />
                    <TextField
                        fullWidth
                        label="Organization Name"
                        value={formData.organization_name || user?.organization || ''}
                        onChange={(e) => setFormData({...formData, organization_name: e.target.value})}
                        margin="normal"
                        required
                        disabled={!!user?.organization}
                        helperText={user?.organization ? "Organization name from your profile" : ""}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button 
                        type="submit" 
                        variant="contained" 
                        color="primary"
                        disabled={loading || !formData.purpose}
                    >
                        Submit Request
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default ApiKeyRequestForm; 