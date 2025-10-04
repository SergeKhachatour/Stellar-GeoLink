import React, { useState, useEffect } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Button,
    Typography,
    Tabs,
    Tab,
    Box,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField
} from '@mui/material';
import { format } from 'date-fns';
import api from '../../utils/api';

const ApiKeyManager = () => {
    const [tab, setTab] = useState(0);
    const [requests, setRequests] = useState([]);
    const [pendingKeys, setPendingKeys] = useState([]);
    const [activeKeys, setActiveKeys] = useState([]);
    const [rejectedKeys, setRejectedKeys] = useState([]);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectionDialog, setShowRejectionDialog] = useState(false);
    const [keyToReject, setKeyToReject] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [requestsRes, keysRes] = await Promise.all([
                api.get('/admin/api-key-requests'),
                api.get('/admin/api-keys')
            ]);
            setRequests(requestsRes.data);
            
            // Separate pending, active, and rejected API keys
            const pendingKeys = keysRes.data.filter(key => key.status === false && !key.rejection_reason);
            const activeKeys = keysRes.data.filter(key => key.status === true);
            const rejectedKeys = keysRes.data.filter(key => key.status === false && key.rejection_reason);
            
            setPendingKeys(pendingKeys);
            setActiveKeys(activeKeys);
            setRejectedKeys(rejectedKeys);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const generateApiKey = () => {
        // Generate a random 64-character hex string (32 bytes)
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    };

    const handleApproval = async (requestId, status) => {
        try {
            console.log('Processing request:', requestId, status);
            
            let statusValue, reason;
            if (status === true) {
                statusValue = 'approved';
                reason = 'API key approved by admin';
            } else if (status === false) {
                statusValue = 'rejected';
                reason = 'API key request rejected by admin';
            } else if (status === 'pending') {
                statusValue = 'pending';
                reason = 'Request status reset to pending';
            } else {
                statusValue = status;
                reason = `Request status changed to ${status}`;
            }
            
            const response = await api.put(`/admin/api-key-requests/${requestId}`, {
                status: statusValue,
                reason: reason
            });
            console.log('Request processed successfully:', response.data);
            fetchData();
        } catch (error) {
            console.error('Error processing request:', error);
            alert('Error processing request: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleKeyStatus = async (keyId, active) => {
        try {
            await api.patch(`/admin/api-keys/${keyId}`, {
                status: active
            });
            fetchData();
        } catch (error) {
            console.error('Error updating key status:', error);
        }
    };

    const handleRejectKey = (key) => {
        setKeyToReject(key);
        setShowRejectionDialog(true);
    };

    const handleRejectionSubmit = async () => {
        if (!rejectionReason.trim()) {
            alert('Please provide a rejection reason');
            return;
        }

        try {
            await api.patch(`/admin/api-keys/${keyToReject.id}`, {
                status: false,
                rejection_reason: rejectionReason
            });
            setShowRejectionDialog(false);
            setRejectionReason('');
            setKeyToReject(null);
            fetchData();
        } catch (error) {
            console.error('Error rejecting key:', error);
        }
    };

    const handleRejectionCancel = () => {
        setShowRejectionDialog(false);
        setRejectionReason('');
        setKeyToReject(null);
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom sx={{ 
                fontWeight: 500,
                color: 'text.primary'
            }}>
                API Key Management
            </Typography>

            <Box sx={{ 
                borderBottom: 1, 
                borderColor: 'divider', 
                mb: 3
            }}>
                <Tabs 
                    value={tab} 
                    onChange={(e, newValue) => setTab(newValue)}
                    sx={{
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 500
                        }
                    }}
                >
                    <Tab label="Pending Requests" />
                    <Tab label="Pending API Keys" />
                    <Tab label="Active Keys" />
                    <Tab label="Rejected Keys" />
                </Tabs>
            </Box>

            {tab === 0 && (
                <TableContainer component={Paper} elevation={0} sx={{ mb: 3 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>Organization</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Purpose</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Requested</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {requests.map((request) => (
                                <TableRow key={request.id}>
                                    <TableCell>{request.organization_name}</TableCell>
                                    <TableCell>{request.request_type}</TableCell>
                                    <TableCell>{request.purpose}</TableCell>
                                    <TableCell>
                                        {format(new Date(request.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        {request.status === 'pending' ? (
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Button
                                                    variant="contained"
                                                    color="success"
                                                    size="small"
                                                    onClick={() => handleApproval(request.id, true)}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="error"
                                                    size="small"
                                                    onClick={() => handleApproval(request.id, false)}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Reject
                                                </Button>
                                            </Box>
                                        ) : request.status === 'rejected' ? (
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <Chip 
                                                    label="Rejected"
                                                    color="error"
                                                    size="small"
                                                />
                                                <Button
                                                    variant="outlined"
                                                    color="primary"
                                                    size="small"
                                                    onClick={() => handleApproval(request.id, 'pending')}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Undo Reject
                                                </Button>
                                            </Box>
                                        ) : (
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <Chip 
                                                    label="Approved"
                                                    color="success"
                                                    size="small"
                                                />
                                                <Button
                                                    variant="outlined"
                                                    color="error"
                                                    size="small"
                                                    onClick={() => handleApproval(request.id, false)}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Reject
                                                </Button>
                                            </Box>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 1 && (
                <TableContainer component={Paper} elevation={0} sx={{ mb: 3 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>API Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>User</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Organization</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Created</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pendingKeys.map((key, index) => (
                                <TableRow key={`pending-${key.id}-${index}`}>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                        {key.api_key.substring(0, 16)}...
                                    </TableCell>
                                    <TableCell>{key.email}</TableCell>
                                    <TableCell>{key.organization || key.provider_name || key.consumer_organization}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.role === 'wallet_provider' ? 'Wallet Provider' : 'Data Consumer'}
                                            color="info"
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {format(new Date(key.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                size="small"
                                                onClick={() => handleKeyStatus(key.id, true)}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                size="small"
                                                onClick={() => handleRejectKey(key)}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                Reject
                                            </Button>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 3 && (
                <TableContainer component={Paper} elevation={0} sx={{ mb: 3 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>API Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>User</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Organization</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Rejection Reason</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Rejected At</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rejectedKeys.map((key, index) => (
                                <TableRow key={`rejected-${key.id}-${index}`}>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                        {key.api_key.substring(0, 16)}...
                                    </TableCell>
                                    <TableCell>{key.email}</TableCell>
                                    <TableCell>{key.organization || key.provider_name || key.consumer_organization}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.role === 'wallet_provider' ? 'Wallet Provider' : 'Data Consumer'}
                                            color="info"
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>{key.rejection_reason}</TableCell>
                                    <TableCell>
                                        {key.reviewed_at ? format(new Date(key.reviewed_at), 'MMM d, yyyy') : 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="contained"
                                            color="success"
                                            size="small"
                                            onClick={() => handleKeyStatus(key.id, true)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            Approve
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 2 && (
                <TableContainer component={Paper} elevation={0}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>API Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>User</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Organization</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeKeys.map((key, index) => (
                                <TableRow key={`active-${key.id}-${index}`}>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                        {key.api_key.substring(0, 16)}...
                                    </TableCell>
                                    <TableCell>{key.email}</TableCell>
                                    <TableCell>{key.organization || key.provider_name || key.consumer_organization}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.role === 'wallet_provider' ? 'Wallet Provider' : 'Data Consumer'}
                                            color="info"
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.status ? 'Active' : 'Inactive'}
                                            color={key.status ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleKeyStatus(key.id, !key.status)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            {key.status ? 'Deactivate' : 'Activate'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Rejection Dialog */}
            <Dialog open={showRejectionDialog} onClose={handleRejectionCancel} maxWidth="sm" fullWidth>
                <DialogTitle>Reject API Key</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Please provide a reason for rejecting this API key:
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter rejection reason..."
                        variant="outlined"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleRejectionCancel} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={handleRejectionSubmit} color="error" variant="contained">
                        Reject API Key
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ApiKeyManager; 