import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Container,
    Grid,
    Card,
    CardContent,
    CardActions,
    Button,
    Chip,
    Alert,
    CircularProgress
} from '@mui/material';
import {
    LocationOn,
    Visibility,
    Add,
    Analytics,
    Map
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import NFTManager from './NFTManager';
import NFTCollection from './NFTCollection';
import NFTMap from './NFTMap';
import api from '../../services/api';

const NFTDashboard = () => {
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [stats, setStats] = useState({
        pinnedNFTs: 0,
        collectedNFTs: 0,
        transfers: 0
    });

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            
            // Fetch user collection to get collected NFTs count
            const collectionResponse = await api.get('/nft/user-collection');
            const collectedCount = collectionResponse.data.nfts?.length || 0;
            
            // Fetch all NFTs to get pinned count (this user's pinned NFTs)
            const allNFTsResponse = await api.get('/nft/all');
            const pinnedCount = allNFTsResponse.data.nfts?.length || 0;
            
            setStats({
                pinnedNFTs: pinnedCount,
                collectedNFTs: collectedCount,
                transfers: 0 // TODO: Implement transfer tracking
            });
        } catch (error) {
            console.error('Error loading stats:', error);
            setError('Failed to load dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    const handleViewChange = (view) => {
        setActiveView(view);
    };

    const renderContent = () => {
        switch (activeView) {
            case 'manager':
                return <NFTManager />;
            case 'collection':
                return <NFTCollection />;
            case 'map':
                return <NFTMap />;
            default:
                return <OverviewContent />;
        }
    };

    const OverviewContent = () => (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom>
                NFT Manager Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Welcome to the NFT Management System. Here you can pin NFTs to locations, 
                collect nearby NFTs, and manage your NFT collection.
            </Typography>

            <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Add color="primary" sx={{ mr: 1 }} />
                                <Typography variant="h6">Pin NFTs</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                Pin NFTs to specific GPS coordinates for others to discover and collect.
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button 
                                variant="contained" 
                                onClick={() => handleViewChange('manager')}
                                fullWidth
                            >
                                Manage NFTs
                            </Button>
                        </CardActions>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Visibility color="primary" sx={{ mr: 1 }} />
                                <Typography variant="h6">My Collection</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                View and manage your collected NFTs, transfer them to other users.
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button 
                                variant="contained" 
                                onClick={() => handleViewChange('collection')}
                                fullWidth
                            >
                                View Collection
                            </Button>
                        </CardActions>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={2}>
                                <Map color="primary" sx={{ mr: 1 }} />
                                <Typography variant="h6">NFT Map</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                Explore NFTs on an interactive map and collect nearby NFTs.
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button 
                                variant="contained" 
                                onClick={() => handleViewChange('map')}
                                fullWidth
                            >
                                Open Map
                            </Button>
                        </CardActions>
                    </Card>
                </Grid>
            </Grid>

            <Box sx={{ mt: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Quick Stats
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="primary">
                                    {stats.pinnedNFTs}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    NFTs Pinned
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="secondary">
                                    {stats.collectedNFTs}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    NFTs Collected
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Card>
                            <CardContent>
                                <Typography variant="h4" color="success.main">
                                    {stats.transfers}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Transfers Made
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Box>
        </Container>
    );

    return (
        <Box>
            {activeView !== 'overview' && (
                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100' }}>
                    <Button 
                        onClick={() => handleViewChange('overview')}
                        startIcon={<Analytics />}
                        variant="outlined"
                    >
                        Back to Dashboard
                    </Button>
                </Box>
            )}
            
            {loading && (
                <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ m: 2 }}>
                    {error}
                </Alert>
            )}

            {renderContent()}
        </Box>
    );
};

export default NFTDashboard;
