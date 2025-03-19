import React from 'react';
import { 
    Container, 
    Typography, 
    Box, 
    Grid, 
    Button, 
    Card, 
    CardContent,
    CardMedia 
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
                            <Typography variant="h2" component="h1" gutterBottom>
                                Track Stellar Assets in Real-Time
                            </Typography>
                            <Typography variant="h5" paragraph>
                                GeoLink provides real-time location tracking for Stellar-based assets, 
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
        </>
    );
};

export default HomePage; 