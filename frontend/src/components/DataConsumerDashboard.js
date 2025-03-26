import React, { useState, useEffect } from 'react';
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
    Grid,
    Chip,
    IconButton,
    Tooltip
} from '@mui/material';
import { DataUsage, Key, Speed, ContentCopy } from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../utils/api';
import ApiKeyRequestForm from './shared/ApiKeyRequestForm';
import { Link } from 'react-router-dom';

const DataConsumerDashboard = () => {
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState(null);
    const [requestHistory, setRequestHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [requestFormOpen, setRequestFormOpen] = useState(false);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [keyRes, usageRes, historyRes] = await Promise.all([
                api.get('/user/api-keys'),
                api.get('/user/api-usage'),
                api.get('/user/api-key-requests')
            ]);
            
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

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Data Consumer Dashboard
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
                            <Typography variant="h6" gutterBottom>
                                API Key Status
                            </Typography>
                            {apiKey ? (
                                <Box>
                                    <Typography variant="body1" gutterBottom>
                                        Active API Key:
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                bgcolor: 'grey.100',
                                                p: 1,
                                                borderRadius: 1
                                            }}
                                        >
                                            {apiKey.api_key}
                                        </Typography>
                                        <Tooltip title="Copy API Key">
                                            <IconButton
                                                onClick={handleCopyApiKey}
                                                size="small"
                                            >
                                                <ContentCopy />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No active API key. Request one to get started.
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* API Usage Stats */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                API Usage Statistics
                            </Typography>
                            {apiUsage ? (
                                <Box>
                                    <Typography>
                                        Requests this month: {apiUsage.monthly_requests}
                                    </Typography>
                                    <Typography>
                                        Daily average: {apiUsage.daily_average}
                                    </Typography>
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No usage data available
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <ApiKeyRequestForm
                open={requestFormOpen}
                onClose={() => setRequestFormOpen(false)}
                onSuccess={fetchDashboardData}
            />
        </Container>
    );
};

export default DataConsumerDashboard; 