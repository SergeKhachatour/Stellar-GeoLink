import React from 'react';
import { 
    Container, 
    Typography, 
    Box, 
    Grid, 
    Button, 
    Card, 
    CardContent,
    CardMedia,
    Avatar
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const HomePage = () => {
    return (
        <>
            {/* Hero Section */}
            <Box
                sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    py: 8,
                    mb: 6
                }}
            >
                <Container maxWidth="lg">
                    <Grid container spacing={4} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Avatar
                                    src="/images/Stellar_Logo.png"
                                    alt="Stellar Logo"
                                    sx={{ 
                                        width: 64, 
                                        height: 64, 
                                        mr: 2,
                                        backgroundColor: 'transparent'
                                    }}
                                />
                                <Typography variant="h2" component="h1">
                                    Track Stellar Assets in Real-Time
                                </Typography>
                            </Box>
                            <Typography variant="h5" paragraph>
                                GeoLink provides real-time location tracking for Stellar-based RWA's, 
                                enabling seamless integration of physical and digital worlds.
                            </Typography>
                            <Button 
                                variant="contained" 
                                color="secondary" 
                                size="large"
                                component={RouterLink}
                                to="/register"
                                sx={{ mr: 2 }}
                            >
                                Get Started
                            </Button>
                            <Button 
                                variant="outlined" 
                                color="inherit" 
                                size="large"
                                component={RouterLink}
                                to="/features"
                            >
                                Learn More
                            </Button>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            {/* Add hero image here */}
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Features Section */}
            <Container maxWidth="lg" sx={{ mb: 6 }}>
                <Typography variant="h3" component="h2" align="center" gutterBottom>
                    Features
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardMedia
                                component="img"
                                height="140"
                                image="/images/real-time-tracking.jpg"
                                alt="Real-time tracking"
                            />
                            <CardContent>
                                <Typography variant="h5" component="h3" gutterBottom>
                                    Real-Time Tracking
                                </Typography>
                                <Typography>
                                    Monitor your assets' locations in real-time with our advanced tracking system.
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardMedia
                                component="img"
                                height="140"
                                image="/images/geofencing.jpg"
                                alt="Geofencing"
                            />
                            <CardContent>
                                <Typography variant="h5" component="h3" gutterBottom>
                                    Geofencing
                                </Typography>
                                <Typography>
                                    Set up virtual boundaries and receive alerts when assets cross them.
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardMedia
                                component="img"
                                height="140"
                                image="/images/analytics.jpg"
                                alt="Analytics"
                            />
                            <CardContent>
                                <Typography variant="h5" component="h3" gutterBottom>
                                    Advanced Analytics
                                </Typography>
                                <Typography>
                                    Gain insights with comprehensive analytics and reporting tools.
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>

            {/* Call to Action */}
            <Box sx={{ bgcolor: 'grey.100', py: 6 }}>
                <Container maxWidth="lg">
                    <Typography variant="h4" component="h2" align="center" gutterBottom>
                        Ready to Get Started?
                    </Typography>
                    <Typography align="center" paragraph>
                        Join the future of asset tracking with Stellar GeoLink
                    </Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button 
                            variant="contained" 
                            color="primary" 
                            size="large"
                            component={RouterLink}
                            to="/register"
                        >
                            Sign Up Now
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Footer */}
            <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 4 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={4} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Avatar
                                    src="/images/Stellar_Logo.png"
                                    alt="Stellar Logo"
                                    sx={{ 
                                        width: 40, 
                                        height: 40, 
                                        mr: 2,
                                        backgroundColor: 'transparent'
                                    }}
                                />
                                <Typography variant="h5" component="h3">
                                    Stellar GeoLink
                                </Typography>
                            </Box>
                            <Typography variant="body1" color="rgba(255,255,255,0.8)">
                                Real-time location tracking for Stellar-based Real World Assets (RWAs)
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                Powered by Stellar Network
                            </Typography>
                            <Typography variant="body2" color="rgba(255,255,255,0.8)">
                                Built on the Stellar blockchain for secure, fast, and cost-effective asset tracking
                            </Typography>
                        </Grid>
                    </Grid>
                    <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.2)', mt: 3, pt: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="rgba(255,255,255,0.6)">
                            © 2024 Stellar GeoLink. All rights reserved.
                        </Typography>
                    </Box>
                </Container>
            </Box>
        </>
    );
};

export default HomePage; 