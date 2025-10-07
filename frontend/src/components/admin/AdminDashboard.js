import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Grid,
    Card,
    CardContent,
    Tabs,
    Tab,
    Avatar
} from '@mui/material';
import ApiKeyManager from './ApiKeyManager';
import UsersManager from './UsersManager';
import WalletLocationsManager from './WalletLocationsManager';
import api from '../../utils/api';

const AdminDashboard = () => {
    const [tabValue, setTabValue] = useState(0);
    const [stats, setStats] = useState({
        total_locations: 0,
        total_providers: 0,
        total_users: 0,
        api_calls_24h: 0
    });
    const [, setLoading] = useState(true);
    const [, setError] = useState('');

    useEffect(() => {
        fetchDashboardStats();
    }, []);

    const fetchDashboardStats = async () => {
        try {
            const statsRes = await api.get('/admin/stats');
            setStats(statsRes.data);
        } catch (err) {
            setError('Failed to load dashboard statistics');
        } finally {
            setLoading(false);
        }
    };

    const renderStats = () => (
        <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="h6">Total Locations</Typography>
                        <Typography variant="h4">{stats.total_locations}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="h6">Wallet Providers</Typography>
                        <Typography variant="h4">{stats.total_providers}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="h6">Total Users</Typography>
                        <Typography variant="h4">{stats.total_users}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="h6">API Calls (24h)</Typography>
                        <Typography variant="h4">{stats.api_calls_24h}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ 
                fontWeight: 500,
                color: 'primary.main'
            }}>
                Admin Dashboard
            </Typography>
            
            {renderStats()}

            <Paper sx={{ width: '100%', mb: 2 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs 
                        value={tabValue} 
                        onChange={(e, newValue) => setTabValue(newValue)}
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 500,
                                fontSize: '1rem'
                            }
                        }}
                    >
                        <Tab label="Users" />
                        <Tab label="API Keys" />
                        <Tab label="Wallet Locations" />
                    </Tabs>
                </Box>

                <Box sx={{ p: 3 }}>
                    {tabValue === 0 && <UsersManager />}
                    {tabValue === 1 && <ApiKeyManager />}
                    {tabValue === 2 && <WalletLocationsManager />}
                </Box>
            </Paper>
        </Container>
    );
};

export default AdminDashboard; 