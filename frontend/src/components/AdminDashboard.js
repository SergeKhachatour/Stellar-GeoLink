import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Tabs,
    Tab,
    Alert,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { format } from 'date-fns';
import LoadingSpinner from './LoadingSpinner';
import api from '../services/api';

const AdminDashboard = () => {
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        users: [],
        providers: [],
        locations: []
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [users, providers, locations] = await Promise.all([
                api.get('/admin/users'),
                api.get('/admin/providers'),
                api.get('/admin/locations')
            ]);

            setData({
                users: users.data,
                providers: providers.data,
                locations: locations.data
            });
        } catch (err) {
            setError('Failed to load admin data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const userColumns = [
        { field: 'id', headerName: 'ID', width: 90 },
        { field: 'email', headerName: 'Email', width: 200 },
        { field: 'role', headerName: 'Role', width: 130 },
        { field: 'created_at', headerName: 'Created', width: 180 },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 180,
            renderCell: (params) => (
                <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleUserAction(params.row)}
                >
                    Manage
                </Button>
            )
        }
    ];

    const providerColumns = [
        { field: 'id', headerName: 'ID', width: 90 },
        { field: 'name', headerName: 'Name', width: 200 },
        { field: 'api_key', headerName: 'API Key', width: 300 },
        { field: 'status', headerName: 'Status', width: 130 }
    ];

    const locationColumns = [
        { field: 'public_key', headerName: 'Public Key', width: 300 },
        { field: 'blockchain', headerName: 'Blockchain', width: 130 },
        { field: 'latitude', headerName: 'Latitude', width: 130 },
        { field: 'longitude', headerName: 'Longitude', width: 130 },
        { field: 'last_updated', headerName: 'Last Updated', width: 180 }
    ];

    const handleUserAction = (user) => {
        // Implement user management actions
        console.log('Managing user:', user);
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                Admin Dashboard
            </Typography>
            
            <Paper sx={{ mb: 3 }}>
                <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
                    <Tab label="Users" />
                    <Tab label="Providers" />
                    <Tab label="Locations" />
                </Tabs>
            </Paper>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    {tab === 0 && (
                        <DataGrid
                            rows={data.users}
                            columns={userColumns}
                            pageSize={10}
                            autoHeight
                            disableSelectionOnClick
                        />
                    )}
                    {tab === 1 && (
                        <DataGrid
                            rows={data.providers}
                            columns={providerColumns}
                            pageSize={10}
                            autoHeight
                            disableSelectionOnClick
                        />
                    )}
                    {tab === 2 && (
                        <DataGrid
                            rows={data.locations}
                            columns={locationColumns}
                            pageSize={10}
                            autoHeight
                            disableSelectionOnClick
                        />
                    )}
                </Grid>
            </Grid>
        </Box>
    );
};

export const ApiKeyRequests = () => {
    const [requests, setRequests] = useState([]);

    useEffect(() => {
        fetchApiKeyRequests();
    }, []);

    const fetchApiKeyRequests = async () => {
        try {
            const response = await api.get('/admin/api-key-requests');
            setRequests(response.data);
        } catch (error) {
            console.error('Error fetching API key requests:', error);
        }
    };

    const handleApproval = async (requestId, approved) => {
        try {
            await api.post(`/admin/api-key-requests/${requestId}`, {
                approved,
                apiKey: approved ? crypto.randomBytes(32).toString('hex') : null
            });
            fetchApiKeyRequests();
        } catch (error) {
            console.error('Error processing request:', error);
        }
    };

    return (
        <div className="api-key-requests">
            <h2>API Key Requests</h2>
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
                                        color="secondary"
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
        </div>
    );
};

export default AdminDashboard; 