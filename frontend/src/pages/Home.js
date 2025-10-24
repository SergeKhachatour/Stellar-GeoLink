import React from 'react';
import { Box, Container, Typography, Grid, Card, CardContent } from '@mui/material';
import Navbar from '../components/Navigation/Navbar';
import PublicWalletMap from '../components/PublicWalletMap';
import ApiDocumentation from '../components/shared/ApiDocumentation';

const Home = () => {
    return (
        <Box sx={{ 
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
        }}>
            {/* Map Section - Full screen background */}
            <Box sx={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100vh',
                zIndex: -1
            }}>
                <PublicWalletMap />
            </Box>

            {/* Content Section - Overlay on top of map */}
            <Box sx={{ 
                position: 'relative',
                zIndex: 2,
                backgroundColor: 'transparent'
            }}>
                <Navbar />

                {/* Hero Section */}
                <Box sx={{ 
                    pt: 8,
                    textAlign: 'center',
                    py: 4,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(5px)',
                    position: 'relative',
                    zIndex: 2
                }}>
                    <Typography variant="h3" component="h1" gutterBottom>
                        Discover Real-World Assets on the Blockchain
                    </Typography>
                    <Typography variant="h6" color="text.secondary" paragraph>
                        Explore and track blockchain assets across the globe
                    </Typography>
                </Box>

                {/* Features Section */}
                <Box sx={{ 
                    py: 8, 
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(5px)',
                    position: 'relative',
                    zIndex: 2
                }}>
                    <Container>
                        <Typography variant="h4" component="h2" align="center" gutterBottom>
                            Features
                        </Typography>
                        <Grid container spacing={4} sx={{ mt: 2 }}>
                            <Grid item xs={12} md={4}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h5" component="h3" gutterBottom>
                                            Real-Time Tracking
                                        </Typography>
                                        <Typography>
                                            Monitor blockchain assets in real-time with precise location data
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h5" component="h3" gutterBottom>
                                            Secure Authentication
                                        </Typography>
                                        <Typography>
                                            Enterprise-grade security with API key management
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h5" component="h3" gutterBottom>
                                            Analytics Dashboard
                                        </Typography>
                                        <Typography>
                                            Comprehensive analytics and reporting tools
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Container>
                </Box>

                {/* API Documentation Section */}
                <Box sx={{ 
                    py: 4, 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(5px)',
                    position: 'relative',
                    zIndex: 2
                }}>
                    <Container>
                        <ApiDocumentation />
                    </Container>
                </Box>

                {/* Footer */}
                <Box component="footer" sx={{ 
                    py: 3, 
                    backgroundColor: 'rgba(25, 118, 210, 0.9)',
                    backdropFilter: 'blur(5px)',
                    color: 'white',
                    position: 'relative',
                    zIndex: 2
                }}>
                    <Container>
                        <Typography variant="body1" align="center">
                            © 2024 Stellar GeoLink. All rights reserved.
                        </Typography>
                    </Container>
                </Box>
            </Box>
        </Box>
    );
};

export default Home; 