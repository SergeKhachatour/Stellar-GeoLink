import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    Chip,
    IconButton,
    Tooltip
} from '@mui/material';
import { Link } from 'react-router-dom';
import { DataUsage, Key, ContentCopy } from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../utils/api';
import ApiKeyRequestForm from './shared/ApiKeyRequestForm';
import WalletMap from './Map/WalletMap';

const WalletProviderDashboard = () => {
    const [wallets, setWallets] = useState([]);
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState([]);
    const [requestHistory, setRequestHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [requestFormOpen, setRequestFormOpen] = useState(false);
    const [newWallet, setNewWallet] = useState({
        public_key: '',
        blockchain: 'Stellar',
        wallet_type_id: '',
        description: '',
        latitude: '',
        longitude: '',
        location_enabled: true
    });

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [walletsRes, keyRes, usageRes, historyRes] = await Promise.all([
                api.get('/user/wallets'),
                api.get('/user/api-keys'),
                api.get('/user/api-usage'),
                api.get('/user/api-key-requests')
            ]);
            setWallets(walletsRes.data);
            setApiKey(keyRes.data[0] || null);
            setApiUsage(usageRes.data);
            setRequestHistory(historyRes.data);
        } catch (err) {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyApiKey = async () => {
        try {
            await navigator.clipboard.writeText(apiKey.api_key);
            setSuccess('API key copied to clipboard');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to copy API key');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/location/update', newWallet);
            fetchDashboardData();
            setNewWallet({
                public_key: '',
                blockchain: 'Stellar',
                wallet_type_id: '',
                description: '',
                latitude: '',
                longitude: '',
                location_enabled: true
            });
        } catch (error) {
            console.error('Error adding wallet:', error);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Wallet Provider Dashboard
                </Typography>
                <Box>
                    {!apiKey && (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => setRequestFormOpen(true)}
                            startIcon={<Key />}
                        >
                            Request API Key
                        </Button>
                    )}
                    {apiKey && (
                        <>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={() => setRequestFormOpen(true)}
                                startIcon={<Key />}
                                sx={{ mr: 2 }}
                            >
                                Request Additional Key
                            </Button>
                            <Button
                                variant="outlined"
                                component={Link}
                                to="/api-keys/manage"
                                startIcon={<DataUsage />}
                            >
                                Manage API Keys
                            </Button>
                        </>
                    )}
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            <Grid container spacing={3}>
                {/* API Key Status */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Key sx={{ mr: 1 }} />
                                <Typography variant="h6">API Key Management</Typography>
                            </Box>
                            {apiKey ? (
                                <>
                                    <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                        Your API Key:
                                    </Typography>
                                    <Box sx={{ 
                                        bgcolor: 'grey.100',
                                        p: 2,
                                        borderRadius: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        mb: 2
                                    }}>
                                        <Typography
                                            sx={{
                                                fontFamily: 'monospace',
                                                flexGrow: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {apiKey.api_key}
                                        </Typography>
                                        <Tooltip title="Copy to clipboard">
                                            <IconButton onClick={handleCopyApiKey} size="small">
                                                <ContentCopy />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                    <Chip
                                        label={apiKey.status ? 'Active' : 'Inactive'}
                                        color={apiKey.status ? 'success' : 'error'}
                                        size="small"
                                    />
                                </>
                            ) : (
                                <Box>
                                    <Typography color="textSecondary" paragraph>
                                        You don't have an active API key.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={() => setRequestFormOpen(true)}
                                    >
                                        Request API Key
                                    </Button>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* API Usage */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <DataUsage sx={{ mr: 1 }} />
                                <Typography variant="h6">Recent API Usage</Typography>
                            </Box>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Timestamp</TableCell>
                                            <TableCell>Endpoint</TableCell>
                                            <TableCell>Method</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Response Time</TableCell>
                                            <TableCell>IP Address</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {apiUsage.map(usage => (
                                            <TableRow key={usage.id}>
                                                <TableCell>{format(new Date(usage.created_at), 'MMM d, h:mm a')}</TableCell>
                                                <TableCell>{usage.endpoint}</TableCell>
                                                <TableCell>{usage.method}</TableCell>
                                                <TableCell>{usage.status_code}</TableCell>
                                                <TableCell>{usage.response_time}ms</TableCell>
                                                <TableCell>{usage.ip_address}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Wallet Map */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <WalletMap 
                                    wallets={wallets}
                                    center={wallets[0] && [wallets[0].longitude, wallets[0].latitude]}
                                />
                            </Box>
                            <Typography variant="h6">Wallet Locations</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Wallet Management */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Manage Wallets</Typography>
                            <form onSubmit={handleSubmit}>
                                {/* Form fields for new wallet */}
                            </form>

                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Public Key</TableCell>
                                            <TableCell>Blockchain</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Description</TableCell>
                                            <TableCell>Location</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {wallets.map(wallet => (
                                            <TableRow key={wallet.id}>
                                                <TableCell>{wallet.public_key}</TableCell>
                                                <TableCell>{wallet.blockchain}</TableCell>
                                                <TableCell>{wallet.wallet_type}</TableCell>
                                                <TableCell>{wallet.description}</TableCell>
                                                <TableCell>{`${wallet.latitude}, ${wallet.longitude}`}</TableCell>
                                                <TableCell>{wallet.location_enabled ? 'Active' : 'Disabled'}</TableCell>
                                                <TableCell>
                                                    <button onClick={() => handleEditWallet(wallet)}>Edit</button>
                                                    <button onClick={() => handleToggleStatus(wallet)}>
                                                        {wallet.location_enabled ? 'Disable' : 'Enable'}
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <ApiKeyRequestForm
                open={requestFormOpen}
                onClose={() => setRequestFormOpen(false)}
                userType="wallet_provider"
                onRequestSubmitted={fetchDashboardData}
            />
        </Container>
    );
};

export default WalletProviderDashboard; 