import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material';
import Map from './Map';
import { locationApi } from '../services/api';

const UserDashboard = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await locationApi.getNearby(0, 0, 1000);
                setLocations(response.data);
            } catch (err) {
                setError('Failed to load locations');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLocations();
    }, []);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>{error}</div>;

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Dashboard
            </Typography>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Paper sx={{ p: 2, height: '70vh' }}>
                        <Map locations={locations} />
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default UserDashboard; 