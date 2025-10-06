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
    Tooltip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Divider
} from '@mui/material';
import { Link } from 'react-router-dom';
import { DataUsage, Key, ContentCopy, ExpandMore, Code, Description } from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../utils/api';
import ApiKeyRequestForm from './ApiKeyRequestForm';
import WalletMap from './Map/WalletMap';

const WalletProviderDashboard = () => {
    const [wallets, setWallets] = useState([]);
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState([]);
    const [, setRequestHistory] = useState([]);
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

                {/* API Usage or Getting Started */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <DataUsage sx={{ mr: 1 }} />
                                <Typography variant="h6">
                                    {apiKey ? 'API Usage Statistics' : 'Getting Started'}
                                </Typography>
                            </Box>
                            {apiKey ? (
                                apiUsage && (
                                    <Box>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Monthly Requests:</strong> {apiUsage.monthly_requests || 0}
                                        </Typography>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Daily Average:</strong> {apiUsage.daily_average || 0}
                                        </Typography>
                                        <Typography variant="body1" gutterBottom>
                                            <strong>Last Request:</strong> {apiUsage.last_request_at ? format(new Date(apiUsage.last_request_at), 'MMM d, h:mm a') : 'Never'}
                                        </Typography>
                                    </Box>
                                )
                            ) : (
                                <Box>
                                    <Typography variant="body1" gutterBottom>
                                        Welcome to GeoLink! As a wallet provider, you can:
                                    </Typography>
                                    <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Submit wallet locations to our network
                                        </Typography>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Track user privacy and visibility settings
                                        </Typography>
                                        <Typography component="li" variant="body2" gutterBottom>
                                            Access real-time geolocation data
                                        </Typography>
                                    </Box>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={() => setRequestFormOpen(true)}
                                        sx={{ mt: 2 }}
                                    >
                                        Get Started - Request API Key
                                    </Button>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Wallet Map */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Wallet Locations</Typography>
                            <WalletMap 
                                wallets={wallets}
                                center={wallets[0] && [wallets[0].longitude, wallets[0].latitude]}
                            />
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
                                                    <Button size="small" variant="outlined" sx={{ mr: 1 }}>
                                                        Edit
                                                    </Button>
                                                    <Button size="small" variant="outlined">
                                                        {wallet.location_enabled ? 'Disable' : 'Enable'}
                                                    </Button>
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

            {/* API Documentation */}
            <Grid item xs={12}>
                <Card>
                    <CardContent>
                        <Box display="flex" alignItems="center" mb={2}>
                            <Description sx={{ mr: 1 }} />
                            <Typography variant="h6">Wallet Provider API Documentation</Typography>
                        </Box>
                        
                        <Accordion>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="h6">Submit Wallet Location</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Endpoint:</strong> POST /api/location/update
                                </Typography>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Headers:</strong> Authorization: Bearer YOUR_API_KEY
                                </Typography>
                                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
{`{
  "public_key": "GABC123...",
  "blockchain": "Stellar",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "wallet_type_id": 1,
  "description": "User wallet location"
}`}
                                    </Typography>
                                </Box>
                            </AccordionDetails>
                        </Accordion>

                        <Accordion>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="h6">Update User Privacy Settings</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Endpoint:</strong> POST /api/wallet-provider/privacy-settings
                                </Typography>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Headers:</strong> Authorization: Bearer YOUR_API_KEY
                                </Typography>
                                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
{`{
  "public_key": "GABC123...",
  "privacy_enabled": true,
  "visibility_enabled": false
}`}
                                    </Typography>
                                </Box>
                            </AccordionDetails>
                        </Accordion>

                        <Accordion>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="h6">Update User Visibility Settings</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Endpoint:</strong> POST /api/wallet-provider/visibility-settings
                                </Typography>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Headers:</strong> Authorization: Bearer YOUR_API_KEY
                                </Typography>
                                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
{`{
  "public_key": "GABC123...",
  "is_visible": true
}`}
                                    </Typography>
                                </Box>
                            </AccordionDetails>
                        </Accordion>

                        <Accordion>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="h6">Get User Locations</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Endpoint:</strong> GET /api/wallet-provider/user-locations?public_key=GABC123...
                                </Typography>
                                <Typography variant="body2" gutterBottom>
                                    <strong>Headers:</strong> Authorization: Bearer YOUR_API_KEY
                                </Typography>
                                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
{`{
  "locations": [
    {
      "id": 1,
      "public_key": "GABC123...",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "timestamp": "2025-10-03T19:00:00Z"
    }
  ]
}`}
                                    </Typography>
                                </Box>
                            </AccordionDetails>
                        </Accordion>

                        <Divider sx={{ my: 2 }} />
                        
                        <Box display="flex" gap={2} flexWrap="wrap">
                            <Button
                                variant="outlined"
                                startIcon={<Code />}
                                href="/api-docs"
                                target="_blank"
                            >
                                Full API Documentation
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<Description />}
                                onClick={() => {
                                    // Download Postman collection
                                    const postmanCollection = {
                                        "info": {
                                            "name": "GeoLink Wallet Provider API",
                                            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
                                        },
                                        "item": [
                                            {
                                                "name": "Submit Wallet Location",
                                                "request": {
                                                    "method": "POST",
                                                    "header": [
                                                        {
                                                            "key": "Authorization",
                                                            "value": "Bearer {{api_key}}"
                                                        }
                                                    ],
                                                    "body": {
                                                        "mode": "raw",
                                                        "raw": "{\n  \"public_key\": \"GABC123...\",\n  \"blockchain\": \"Stellar\",\n  \"latitude\": 40.7128,\n  \"longitude\": -74.0060,\n  \"wallet_type_id\": 1,\n  \"description\": \"User wallet location\"\n}"
                                                    },
                                                    "url": {
                                                        "raw": "{{base_url}}/api/location/update",
                                                        "host": ["{{base_url}}"],
                                                        "path": ["api", "location", "update"]
                                                    }
                                                }
                                            }
                                        ]
                                    };
                                    
                                    const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'GeoLink-Wallet-Provider-API.postman_collection.json';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                            >
                                Download Postman Collection
                            </Button>
                        </Box>
                    </CardContent>
                </Card>
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