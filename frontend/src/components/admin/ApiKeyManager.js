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
    Box
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
        <div className="api-key-manager">
            <Typography variant="h6" gutterBottom>
                API Key Management
            </Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
                    <Tab label="Pending Requests" />
                    <Tab label="Active Keys" />
                </Tabs>
            </Box>

            {tab === 0 && (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Organization</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Purpose</TableCell>
                                <TableCell>Requested</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {requests.map(request => (
                                <TableRow key={request.id}>
                                    <TableCell>{request.organization_name}</TableCell>
                                    <TableCell>{request.request_type}</TableCell>
                                    <TableCell>{request.purpose}</TableCell>
                                    <TableCell>
                                        {format(new Date(request.created_at), 'PPpp')}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            color="primary"
                                            onClick={() => handleApproval(request.id, true)}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            color="error"
                                            onClick={() => handleApproval(request.id, false)}
                                        >
                                            Reject
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 1 && (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Organization</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>API Key</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Created</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeKeys.map(key => (
                                <TableRow key={key.id}>
                                    <TableCell>{key.organization}</TableCell>
                                    <TableCell>{key.type}</TableCell>
                                    <TableCell>
                                        <code>{key.api_key}</code>
                                    </TableCell>
                                    <TableCell>
                                        {key.status ? 'Active' : 'Disabled'}
                                    </TableCell>
                                    <TableCell>
                                        {format(new Date(key.created_at), 'PPpp')}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            color={key.status ? 'error' : 'primary'}
                                            onClick={() => handleKeyStatus(
                                                key.id,
                                                key.type,
                                                !key.status
                                            )}
                                        >
                                            {key.status ? 'Disable' : 'Enable'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </div>
    );
};

export default ApiKeyManager; 