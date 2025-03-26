import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Tabs,
    Tab,
    Switch,
    FormControlLabel,
    TextField,
    Alert,
    Divider,
    List,
    ListItem,
    ListItemText,
    Chip
} from '@mui/material';

const UserManagementModal = ({ open, onClose, userId }) => {
    const [activeTab, setActiveTab] = useState(0);
    const [userData, setUserData] = useState(null);
    const [apiKeys, setApiKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (open && userId) {
            fetchUserData();
            fetchApiKeys();
        }
    }, [open, userId]);

    const fetchUserData = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setUserData(data);
        } catch (error) {
            setError('Failed to fetch user data');
        }
    };

    const fetchApiKeys = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}/api-keys`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setApiKeys(data);
        } catch (error) {
            setError('Failed to fetch API keys');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/admin/users/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            setSuccess('User status updated successfully');
            fetchUserData();
        } catch (error) {
            setError('Failed to update user status');
        }
    };

    const fetchApiKeyDetails = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}/api-keys`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setApiKeys(data);
        } catch (error) {
            setError('Failed to fetch API key details');
        }
    };

    const handleApiKeyStatusChange = async (keyId, enabled) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/admin/api-keys/${keyId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled })
            });
            await fetchApiKeyDetails(userId);
        } catch (error) {
            setError('Failed to update API key status');
        }
    };

    const handleApproveApiKeyRequest = async (requestId) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/admin/api-key-requests/${requestId}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            setSuccess('API key request approved successfully');
            fetchApiKeys();
            fetchUserData();
        } catch (error) {
            setError('Failed to approve API key request');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                User Management
                {userData && (
                    <Typography variant="subtitle1" color="textSecondary">
                        {userData.email} - {userData.role}
                    </Typography>
                )}
            </DialogTitle>

            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
                    <Tab label="User Details" />
                    <Tab label="API Keys" />
                    <Tab label="Usage & Limits" />
                </Tabs>

                {activeTab === 0 && userData && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="h6">Account Information</Typography>
                        <Box sx={{ mt: 2 }}>
                            <Typography><strong>Name:</strong> {userData.firstName} {userData.lastName}</Typography>
                            <Typography><strong>Organization:</strong> {userData.organization}</Typography>
                            <Typography><strong>Role:</strong> {userData.role}</Typography>
                            <Typography><strong>Status:</strong> {userData.status}</Typography>
                        </Box>

                        <Box sx={{ mt: 3 }}>
                            <Typography variant="h6">Account Status</Typography>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={userData.status === 'active'}
                                        onChange={(e) => handleStatusChange(e.target.checked ? 'active' : 'suspended')}
                                    />
                                }
                                label={userData.status === 'active' ? 'Active' : 'Suspended'}
                            />
                        </Box>
                    </Box>
                )}

                {activeTab === 1 && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="h6">API Keys</Typography>
                        
                        {/* Pending API Key Requests */}
                        {apiKeys.filter(key => key.status === 'pending').length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle1">Pending Requests</Typography>
                                <List>
                                    {apiKeys
                                        .filter(key => key.status === 'pending')
                                        .map(request => (
                                            <ListItem key={request.id}>
                                                <ListItemText
                                                    primary={`Request from ${new Date(request.created_at).toLocaleDateString()}`}
                                                    secondary={request.use_case}
                                                />
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={() => handleApproveApiKeyRequest(request.id)}
                                                >
                                                    Approve
                                                </Button>
                                            </ListItem>
                                        ))}
                                </List>
                                <Divider sx={{ my: 2 }} />
                            </Box>
                        )}

                        {/* Active API Keys */}
                        <List>
                            {apiKeys
                                .filter(key => key.status !== 'pending')
                                .map(key => (
                                    <ListItem key={key.id}>
                                        <ListItemText
                                            primary={key.api_key}
                                            secondary={`Created: ${new Date(key.created_at).toLocaleDateString()}`}
                                        />
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Chip
                                                label={key.enabled ? 'Active' : 'Disabled'}
                                                color={key.enabled ? 'success' : 'error'}
                                            />
                                            <Switch
                                                checked={key.enabled}
                                                onChange={(e) => handleApiKeyStatusChange(key.id, e.target.checked)}
                                            />
                                        </Box>
                                    </ListItem>
                                ))}
                        </List>
                    </Box>
                )}

                {activeTab === 2 && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="h6">Usage & Rate Limits</Typography>
                        
                        <Box sx={{ mt: 2 }}>
                            <TextField
                                label="Requests per minute"
                                type="number"
                                defaultValue={userData?.rateLimits?.requestsPerMinute || 60}
                                fullWidth
                                sx={{ mb: 2 }}
                            />
                            
                            <TextField
                                label="Requests per day"
                                type="number"
                                defaultValue={userData?.rateLimits?.requestsPerDay || 5000}
                                fullWidth
                                sx={{ mb: 2 }}
                            />

                            <Button
                                variant="contained"
                                color="primary"
                                onClick={() => {/* Handle rate limit updates */}}
                            >
                                Update Limits
                            </Button>
                        </Box>

                        <Box sx={{ mt: 4 }}>
                            <Typography variant="subtitle1">Usage Statistics</Typography>
                            {/* Add usage statistics here */}
                        </Box>
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default UserManagementModal; 