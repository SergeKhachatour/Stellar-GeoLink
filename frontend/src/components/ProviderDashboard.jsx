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
import { Map, LocationOn, Analytics } from '@mui/icons-material';

const ProviderDashboard = () => {
    const [statistics, setStatistics] = useState(null);
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const token = localStorage.getItem('token');
            
            // Fetch provider statistics
            const statsResponse = await fetch('/api/analytics', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const statsData = await statsResponse.json();

            // Fetch recent wallet updates
            const walletsResponse = await fetch('/api/location/recent', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const walletsData = await walletsResponse.json();

            setStatistics(statsData);
            setWallets(walletsData);
        } catch (err) {
            setError('Failed to load dashboard data');
            console.error(err);
        } finally {
            setLoading(false);
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
                Wallet Provider Dashboard
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* Statistics Cards */}
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <LocationOn sx={{ mr: 1 }} />
                                <Typography variant="h6">Active Wallets</Typography>
                            </Box>
                            <Typography variant="h4">
                                {statistics?.active_wallets || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Analytics sx={{ mr: 1 }} />
                                <Typography variant="h6">Updates Today</Typography>
                            </Box>
                            <Typography variant="h4">
                                {statistics?.updates_today || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Map sx={{ mr: 1 }} />
                                <Typography variant="h6">Total Locations</Typography>
                            </Box>
                            <Typography variant="h4">
                                {statistics?.total_locations || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Recent Updates Table */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>
                            Recent Wallet Updates
                        </Typography>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Wallet ID</TableCell>
                                        <TableCell>Location</TableCell>
                                        <TableCell>Last Updated</TableCell>
                                        <TableCell>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {wallets.map((wallet) => (
                                        <TableRow key={wallet.id}>
                                            <TableCell>{wallet.public_key}</TableCell>
                                            <TableCell>
                                                {`${wallet.latitude}, ${wallet.longitude}`}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(wallet.last_updated).toLocaleString()}
                                            </TableCell>
                                            <TableCell>{wallet.status}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* API Integration Guide */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Integration Guide
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            To update wallet locations, use our location update endpoint:
                        </Typography>
                        <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                            <code>
                                POST /api/location/update
                            </code>
                        </Paper>
                        <Button
                            variant="outlined"
                            color="primary"
                            sx={{ mt: 2 }}
                            href="/docs/integration"
                            target="_blank"
                        >
                            View Integration Guide
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default ProviderDashboard; 