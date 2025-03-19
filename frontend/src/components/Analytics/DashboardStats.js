import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Container, 
    Grid, 
    Paper, 
    Typography 
} from '@mui/material';
import { analyticsApi } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';
import { Line } from 'react-chartjs-2';

const DashboardStats = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const [statsRes, distributionRes, activityRes] = await Promise.all([
                analyticsApi.getStats(),
                analyticsApi.getBlockchainDistribution(),
                analyticsApi.getActivity('1 hour', '24 hours')
            ]);

            setStats({
                overview: statsRes.data,
                distribution: distributionRes.data,
                activity: activityRes.data
            });
        } catch (err) {
            setError('Failed to load analytics');
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <Typography color="error">{error}</Typography>;

    return (
        <Container maxWidth="lg">
            <Box sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Analytics Dashboard
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6">Total Wallets</Typography>
                            <Typography variant="h4">
                                {stats.overview.total_wallets}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6">Active Wallets (24h)</Typography>
                            <Typography variant="h4">
                                {stats.overview.active_wallets_24h}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6">Total Blockchains</Typography>
                            <Typography variant="h4">
                                {stats.overview.total_blockchains}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Activity Over Time
                            </Typography>
                            <Box sx={{ height: 300 }}>
                                <Line
                                    data={{
                                        labels: stats.activity.map(d => 
                                            new Date(d.time_period).toLocaleTimeString()
                                        ),
                                        datasets: [{
                                            label: 'Updates',
                                            data: stats.activity.map(d => d.updates),
                                            fill: false,
                                            borderColor: 'rgb(75, 192, 192)',
                                            tension: 0.1
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false
                                    }}
                                />
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
            </Box>
        </Container>
    );
};

export default DashboardStats; 