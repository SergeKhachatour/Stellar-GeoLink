import { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Typography,
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    Grid
} from '@mui/material';
import { DataUsage, Key, Speed } from '@mui/icons-material';

const ConsumerDashboard = () => {
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const token = localStorage.getItem('token');
            
            // Fetch API key status
            const keyResponse = await fetch('/api/user/api-keys', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const keyData = await keyResponse.json();

            // Fetch API usage statistics
            const usageResponse = await fetch('/api/user/api-usage', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const usageData = await usageResponse.json();

            setApiKey(keyData);
            setApiUsage(usageData);
        } catch (err) {
            setError('Failed to load dashboard data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateApiKey = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user/api-keys', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: 'Default API Key' })
            });
            
            const data = await response.json();
            setApiKey(data);
        } catch (err) {
            setError('Failed to generate API key');
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom>
                Data Consumer Dashboard
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* API Key Status */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Key sx={{ mr: 1 }} />
                                <Typography variant="h6">API Key</Typography>
                            </Box>
                            {apiKey ? (
                                <>
                                    <Typography variant="body1" sx={{ mb: 2 }}>
                                        Your API Key: {apiKey.api_key}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                        Created: {new Date(apiKey.created_at).toLocaleDateString()}
                                    </Typography>
                                </>
                            ) : (
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={handleGenerateApiKey}
                                >
                                    Generate API Key
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Usage Statistics */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <DataUsage sx={{ mr: 1 }} />
                                <Typography variant="h6">Usage Statistics</Typography>
                            </Box>
                            <Typography variant="body1">
                                Requests today: {apiUsage?.today_requests || 0}
                            </Typography>
                            <Typography variant="body1">
                                Total requests: {apiUsage?.total_requests || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* API Documentation */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 3, mt: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Quick Start Guide
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            To use the API, include your API key in the request headers:
                        </Typography>
                        <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                            <code>
                                X-API-Key: your_api_key
                            </code>
                        </Paper>
                        <Button
                            variant="outlined"
                            color="primary"
                            sx={{ mt: 2 }}
                            href="/api-docs"
                            target="_blank"
                        >
                            View Full Documentation
                        </Button>
                    </Paper>
                </Grid>

                {/* Recent API Usage */}
                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ mt: 3 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Endpoint</TableCell>
                                    <TableCell>Requests</TableCell>
                                    <TableCell>Average Response Time</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {apiUsage?.history?.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                                        <TableCell>{row.endpoint}</TableCell>
                                        <TableCell>{row.requests}</TableCell>
                                        <TableCell>{row.avg_response_time}ms</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Container>
    );
};

export default ConsumerDashboard; 