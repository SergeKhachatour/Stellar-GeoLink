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
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Button,
} from '@mui/material';
import ApiKeyManager from './ApiKeyManager';
import UsersManager from './UsersManager';
import WalletLocationsManager from './WalletLocationsManager';
import SharedMap from '../SharedMap';
import api from '../../utils/api';
import { Close as CloseIcon } from '@mui/icons-material';

const AdminDashboard = () => {
    const [tabValue, setTabValue] = useState(0);
    const [stats, setStats] = useState({
        total_locations: 0,
        total_providers: 0,
        total_users: 0,
        api_calls_24h: 0
    });
    const [geospatialStats, setGeospatialStats] = useState(null);
    const [walletLocations, setWalletLocations] = useState([]);
    const [nfts, setNfts] = useState([]);
    const [marketAnalysis, setMarketAnalysis] = useState(null);
    const [, setLoading] = useState(true);
    const [, setError] = useState('');
    const [selectedNFT, setSelectedNFT] = useState(null);
    const [openNFTDialog, setOpenNFTDialog] = useState(false);
    const [zoomTarget, setZoomTarget] = useState(null);
    const [selectedAnalytics, setSelectedAnalytics] = useState(null);
    const [openAnalyticsDialog, setOpenAnalyticsDialog] = useState(false);

    useEffect(() => {
        fetchDashboardStats();
    }, []);

    const fetchDashboardStats = async () => {
        try {
            const statsRes = await api.get('/admin/stats');
            setStats(statsRes.data);
            
            // Fetch PostGIS analytics
            const geospatialRes = await api.get('/admin/geospatial/global-analytics');
            setGeospatialStats(geospatialRes.data);
            
            // Fetch wallet locations
            const locationsRes = await api.get('/admin/wallet-locations');
            setWalletLocations(locationsRes.data);
            
            // Fetch NFTs for map
            const nftsRes = await api.get('/nft/public');
            setNfts(nftsRes.data.nfts || []);
            
            // Try to fetch market analysis separately
            try {
                const marketRes = await api.get('/admin/market-analysis');
                setMarketAnalysis(marketRes.data);
            } catch (marketErr) {
                console.warn('Market analysis not available:', marketErr);
                setMarketAnalysis(null);
            }
        } catch (err) {
            setError('Failed to load dashboard statistics');
        } finally {
            setLoading(false);
        }
    };

    const handleNFTDetails = (nft) => {
        setSelectedNFT(nft);
        setOpenNFTDialog(true);
    };

    // Analytics details handler
    const handleAnalyticsClick = async (analyticsData, title, page = 1) => {
        setSelectedAnalytics({ data: analyticsData, title, loading: true });
        setOpenAnalyticsDialog(true);
        
        try {
            let endpoint = '';
            if (title.includes('Wallet Providers')) {
                endpoint = '/admin/wallet-providers-details';
            } else if (title.includes('Total Users')) {
                endpoint = '/admin/users-details';
            } else if (title.includes('API Calls')) {
                endpoint = '/admin/api-calls-details';
            } else if (title.includes('Total Locations')) {
                endpoint = '/admin/locations-details';
            }
            
            if (endpoint) {
                const response = await api.get(`${endpoint}?page=${page}&limit=10`);
                setSelectedAnalytics({ 
                    data: response.data.data, 
                    pagination: response.data.pagination,
                    title, 
                    loading: false 
                });
            } else {
                setSelectedAnalytics({ data: analyticsData, title, loading: false });
            }
        } catch (error) {
            console.error('Error fetching detailed data:', error);
            setSelectedAnalytics({ data: analyticsData, title, loading: false, error: 'Failed to load detailed data' });
        }
    };

    const renderStats = () => (
        <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={3}>
                <Card 
                    sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                    onClick={() => handleAnalyticsClick(stats, 'Total Locations Details')}
                >
                    <CardContent>
                        <Typography variant="h6">Total Locations</Typography>
                        <Typography variant="h4">{stats.total_locations}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card 
                    sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                    onClick={() => handleAnalyticsClick(stats, 'Wallet Providers Details')}
                >
                    <CardContent>
                        <Typography variant="h6">Wallet Providers</Typography>
                        <Typography variant="h4">{stats.total_providers}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card 
                    sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                    onClick={() => handleAnalyticsClick(stats, 'Total Users Details')}
                >
                    <CardContent>
                        <Typography variant="h6">Total Users</Typography>
                        <Typography variant="h4">{stats.total_users}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card 
                    sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                    onClick={() => handleAnalyticsClick(stats, 'API Calls Details')}
                >
                    <CardContent>
                        <Typography variant="h6">API Calls (24h)</Typography>
                        <Typography variant="h4">{stats.api_calls_24h}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );

    const renderGeospatialAnalytics = () => {
        if (!geospatialStats) {
            return <Typography>Loading geospatial analytics...</Typography>;
        }

        return (
            <Box>
                <Typography variant="h5" gutterBottom>
                    🗺️ Global Geospatial Analytics
                </Typography>
                
                {/* Global Statistics */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" color="primary">Total Locations</Typography>
                                <Typography variant="h4">{geospatialStats.global_statistics?.total_locations || 0}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" color="secondary">Active Providers</Typography>
                                <Typography variant="h4">{geospatialStats.global_statistics?.active_providers || 0}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" color="success.main">Coverage Area</Typography>
                                <Typography variant="h4">
                                    {geospatialStats.global_statistics?.global_coverage_area ? 
                                        `${(geospatialStats.global_statistics.global_coverage_area / 1000000).toFixed(2)} km²` : 
                                        'N/A'
                                    }
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" color="info.main">Avg Distance</Typography>
                                <Typography variant="h4">
                                    {geospatialStats.global_statistics?.avg_distance_from_center ? 
                                        `${(geospatialStats.global_statistics.avg_distance_from_center / 1000).toFixed(1)} km` : 
                                        'N/A'
                                    }
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* Market Analysis Section */}
                <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
                    📊 Market Analysis
                </Typography>
                
                {marketAnalysis ? (
                    <>
                        {/* NFT Market Overview */}
                        <Grid container spacing={3} sx={{ mb: 4 }}>
                            <Grid item xs={12} md={3}>
                                <Card 
                                    sx={{ 
                                        bgcolor: 'primary.light', 
                                        color: 'primary.contrastText',
                                        cursor: 'pointer', 
                                        '&:hover': { boxShadow: 3 } 
                                    }}
                                    onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_overview, 'Total NFTs Details')}
                                >
                                    <CardContent>
                                        <Typography variant="h6">Total NFTs</Typography>
                                        <Typography variant="h4">{marketAnalysis.nft_market_overview?.total_nfts || 0}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Card 
                                    sx={{ 
                                        bgcolor: 'primary.light', 
                                        color: 'primary.contrastText',
                                        cursor: 'pointer', 
                                        '&:hover': { boxShadow: 3 } 
                                    }}
                                    onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_overview, 'Collections Details')}
                                >
                                    <CardContent>
                                        <Typography variant="h6">Collections</Typography>
                                        <Typography variant="h4">{marketAnalysis.nft_market_overview?.total_collections || 0}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Card 
                                    sx={{ 
                                        bgcolor: 'primary.light', 
                                        color: 'primary.contrastText',
                                        cursor: 'pointer', 
                                        '&:hover': { boxShadow: 3 } 
                                    }}
                                    onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_overview, 'NFT Managers Details')}
                                >
                                    <CardContent>
                                        <Typography variant="h6">NFT Managers</Typography>
                                        <Typography variant="h4">{marketAnalysis.nft_market_overview?.unique_nft_managers || 0}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Card 
                                    sx={{ 
                                        bgcolor: 'primary.light', 
                                        color: 'primary.contrastText',
                                        cursor: 'pointer', 
                                        '&:hover': { boxShadow: 3 } 
                                    }}
                                    onClick={() => handleAnalyticsClick(marketAnalysis.nft_market_overview, 'Active NFTs Details')}
                                >
                                    <CardContent>
                                        <Typography variant="h6">Active NFTs</Typography>
                                        <Typography variant="h4">{marketAnalysis.nft_market_overview?.active_nfts || 0}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </>
                ) : (
                    <Card sx={{ mb: 4 }}>
                        <CardContent>
                            <Typography variant="body1" color="textSecondary" align="center">
                                Market analysis data is not available at the moment. 
                                This feature requires location and NFT data to be available in the system.
                            </Typography>
                        </CardContent>
                    </Card>
                )}

                {/* Interactive Map */}
                <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                    Global Location Map
                </Typography>
                <SharedMap 
                    locations={[
                        // Wallet locations
                        ...walletLocations
                            .filter(location => location.latitude && location.longitude && 
                                !isNaN(parseFloat(location.latitude)) && !isNaN(parseFloat(location.longitude)))
                            .map(location => ({
                                latitude: parseFloat(location.latitude),
                                longitude: parseFloat(location.longitude),
                                public_key: location.public_key,
                                description: `Provider: ${location.provider_name} | Type: ${location.wallet_type} | Status: ${location.tracking_status}`,
                                type: 'wallet'
                            })),
                        // NFTs
                        ...nfts
                            .filter(nft => nft.latitude && nft.longitude && 
                                !isNaN(parseFloat(nft.latitude)) && !isNaN(parseFloat(nft.longitude)))
                            .map(nft => ({
                                latitude: parseFloat(nft.latitude),
                                longitude: parseFloat(nft.longitude),
                                id: nft.id,
                                name: nft.name || 'NFT',
                                description: `NFT: ${nft.name || 'Unnamed'} | Collection: ${nft.collection?.name || 'Unknown'}`,
                                type: 'nft',
                                image_url: nft.image_url,
                                ipfs_hash: nft.ipfs_hash,
                                server_url: nft.server_url,
                                full_ipfs_url: nft.ipfs_hash ? `https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/${nft.ipfs_hash}` : null,
                                collection: nft.collection
                            }))
                    ]}
                    title="Global Wallet Locations & NFTs"
                    height="700px"
                    showControls={true}
                    onNFTDetails={handleNFTDetails}
                    zoomTarget={zoomTarget}
                />

                {/* Provider Comparison Table */}
                <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                    Provider Performance Comparison
                </Typography>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Provider</TableCell>
                                <TableCell>Locations</TableCell>
                                <TableCell>Coverage Area</TableCell>
                                <TableCell>Recent Activity</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {geospatialStats.provider_comparison?.slice(0, 10).map((provider, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Typography variant="body2" fontFamily="monospace">
                                            {provider.provider_public_key?.substring(0, 15)}...
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{provider.location_count}</TableCell>
                                    <TableCell>
                                        {provider.coverage_area ? 
                                            `${(provider.coverage_area / 1000000).toFixed(2)} km²` : 
                                            'N/A'
                                        }
                                    </TableCell>
                                    <TableCell>{provider.recent_activity}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={provider.recent_activity > 0 ? 'Active' : 'Inactive'} 
                                            color={provider.recent_activity > 0 ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
        );
    };

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
                        <Tab label="🗺️ Geospatial Analytics" />
                    </Tabs>
                </Box>

                <Box sx={{ p: 3 }}>
                    {tabValue === 0 && <UsersManager />}
                    {tabValue === 1 && <ApiKeyManager />}
                    {tabValue === 2 && <WalletLocationsManager />}
                    {tabValue === 3 && renderGeospatialAnalytics()}
                </Box>
            </Paper>

            {/* NFT Details Dialog */}
            <Dialog
                open={openNFTDialog}
                onClose={() => setOpenNFTDialog(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    NFT Details
                    <IconButton
                        aria-label="close"
                        onClick={() => setOpenNFTDialog(false)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selectedNFT && (
                        <Box>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    {selectedNFT.full_ipfs_url && (
                                        <img
                                            src={selectedNFT.full_ipfs_url}
                                            alt={selectedNFT.name || 'NFT'}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                            }}
                                        />
                                    )}
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" gutterBottom>
                                        {selectedNFT.name || 'Unnamed NFT'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Collection: {selectedNFT.collection?.name || 'Unknown'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Location: {selectedNFT.latitude}, {selectedNFT.longitude}
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        sx={{ mt: 1 }}
                                        onClick={() => {
                                            setZoomTarget({
                                                latitude: parseFloat(selectedNFT.latitude),
                                                longitude: parseFloat(selectedNFT.longitude)
                                            });
                                            setOpenNFTDialog(false);
                                        }}
                                    >
                                        🔍 Zoom to Location
                                    </Button>
                                    {selectedNFT.description && (
                                        <Typography variant="body2" sx={{ mt: 2 }}>
                                            {selectedNFT.description}
                                        </Typography>
                                    )}
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Analytics Details Dialog */}
            <Dialog
                open={openAnalyticsDialog}
                onClose={() => setOpenAnalyticsDialog(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {selectedAnalytics?.title || 'Analytics Details'}
                    <IconButton onClick={() => setOpenAnalyticsDialog(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selectedAnalytics && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                {selectedAnalytics.title}
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                                {selectedAnalytics.loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                        <Typography>Loading detailed data...</Typography>
                                    </Box>
                                ) : selectedAnalytics.error ? (
                                    <Typography color="error">{selectedAnalytics.error}</Typography>
                                ) : selectedAnalytics.data && Array.isArray(selectedAnalytics.data) ? (
                                    <Box>
                                        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                                            <Table stickyHeader>
                                                <TableHead>
                                                    <TableRow>
                                                        {selectedAnalytics.data.length > 0 && Object.keys(selectedAnalytics.data[0]).map((key) => (
                                                            <TableCell key={key}>
                                                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {selectedAnalytics.data.map((row, index) => (
                                                        <TableRow key={index}>
                                                            {Object.values(row).map((value, cellIndex) => (
                                                                <TableCell key={cellIndex}>
                                                                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
                                                                     typeof value === 'number' ? value.toLocaleString() :
                                                                     value ? String(value) : '-'}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                        
                                        {selectedAnalytics.pagination && (
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Showing {((selectedAnalytics.pagination.page - 1) * selectedAnalytics.pagination.limit) + 1} to {Math.min(selectedAnalytics.pagination.page * selectedAnalytics.pagination.limit, selectedAnalytics.pagination.total)} of {selectedAnalytics.pagination.total} entries
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button 
                                                        size="small" 
                                                        disabled={selectedAnalytics.pagination.page <= 1}
                                                        onClick={() => handleAnalyticsClick({}, selectedAnalytics.title, selectedAnalytics.pagination.page - 1)}
                                                    >
                                                        Previous
                                                    </Button>
                                                    <Button 
                                                        size="small" 
                                                        disabled={selectedAnalytics.pagination.page >= selectedAnalytics.pagination.pages}
                                                        onClick={() => handleAnalyticsClick({}, selectedAnalytics.title, selectedAnalytics.pagination.page + 1)}
                                                    >
                                                        Next
                                                    </Button>
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                ) : (
                                    <Grid container spacing={2}>
                                        {Object.entries(selectedAnalytics.data).map(([key, value]) => (
                                            <Grid item xs={12} sm={6} md={4} key={key}>
                                                <Card sx={{ p: 2, height: '100%' }}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                    </Typography>
                                                    <Typography variant="h6" color="primary">
                                                        {typeof value === 'number' ? value.toLocaleString() : value}
                                                    </Typography>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                )}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Container>
    );
};

export default AdminDashboard; 