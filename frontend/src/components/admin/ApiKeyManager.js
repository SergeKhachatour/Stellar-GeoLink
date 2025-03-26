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
    Chip
} from '@mui/material';
import { format } from 'date-fns';
import api from '../../utils/api';

const ApiKeyManager = () => {
    const [tab, setTab] = useState(0);
    const [requests, setRequests] = useState([]);
    const [activeKeys, setActiveKeys] = useState([]);

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
            setActiveKeys(keysRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleApproval = async (requestId, approved) => {
        try {
            await api.post(`/admin/api-key-requests/${requestId}/process`, {
                approved,
                apiKey: approved ? crypto.randomBytes(32).toString('hex') : null
            });
            fetchData();
        } catch (error) {
            console.error('Error processing request:', error);
        }
    };

    const handleKeyStatus = async (keyId, type, active) => {
        try {
            await api.patch(`/admin/api-keys/${keyId}`, {
                type,
                active
            });
            fetchData();
        } catch (error) {
            console.error('Error updating key status:', error);
        }
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
                    <Tab label="Active Keys" />
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
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 1 && (
                <TableContainer component={Paper} elevation={0}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>API Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeKeys.map((key) => (
                                <TableRow key={key.id}>
                                    <TableCell>{key.api_key}</TableCell>
                                    <TableCell>{key.type}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.active ? 'Active' : 'Inactive'}
                                            color={key.active ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleKeyStatus(key.id, key.type, !key.active)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            {key.active ? 'Deactivate' : 'Activate'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default ApiKeyManager; 