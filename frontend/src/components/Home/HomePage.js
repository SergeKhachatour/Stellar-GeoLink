import React from 'react';
import { 
    Container, 
    Typography, 
    Box, 
    Grid, 
    Button, 
    Card, 
    CardContent,
    Chip,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    Divider
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
    LocationOn,
    Security,
    Analytics,
    Speed,
    Notifications,
    Public,
    AccountBalance,
    Timeline,
    Map,
    Shield,
    Api,
    Dashboard
} from '@mui/icons-material';

const HomePage = () => {
    return (
        <>
            {/* Hero Section */}
            <Box
                sx={{
                    background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
                    color: 'white',
                    py: 10,
                    mb: 6,
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                <Container maxWidth="lg">
                    <Grid container spacing={6} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box sx={{ textAlign: 'center', mb: 4 }}>
                                <Typography variant="h2" component="h1" sx={{ fontWeight: 'bold', mb: 1 }}>
                                    Stellar GeoLink
                                </Typography>
                                <Typography variant="h4" component="h2" sx={{ opacity: 0.9 }}>
                                    Track Stellar Assets in Real-Time
                                </Typography>
                            </Box>
                            <Typography variant="h6" paragraph sx={{ mb: 4, opacity: 0.9 }}>
                                The premier platform for real-time location tracking of Stellar-based Real World Assets (RWAs). 
                                Bridge the physical and digital worlds with blockchain-powered geolocation services.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Button 
                                    variant="contained" 
                                    color="secondary" 
                                    size="large"
                                    component={RouterLink}
                                    to="/register"
                                    sx={{ px: 4, py: 1.5 }}
                                >
                                    Get Started Free
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    color="inherit" 
                                    size="large"
                                    component={RouterLink}
                                    to="/login"
                                    sx={{ px: 4, py: 1.5 }}
                                >
                                    Sign In
                                </Button>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Box
                                    component="img"
                                    src="/images/Stellar_Logo.png"
                                    alt="Stellar Logo"
                                    sx={{ 
                                        width: 275, 
                                        height: 100, 
                                        mb: 3,
                                        filter: 'brightness(0) invert(1)',
                                        zIndex: 2,
                                        position: 'relative'
                                    }}
                                />
                                <Paper 
                                    elevation={10} 
                                    sx={{ 
                                        p: 3, 
                                        backgroundColor: 'rgba(255,255,255,0.1)', 
                                        backdropFilter: 'blur(10px)',
                                        borderRadius: 3
                                    }}
                                >
                                    <Typography variant="h6" gutterBottom>
                                        🚀 Live Asset Tracking
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Monitor your Stellar-based assets across the globe with precision and security
                                    </Typography>
                                </Paper>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Core Features Section */}
            <Container maxWidth="lg" sx={{ mb: 8 }}>
                <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                    Core Features
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: 2 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                    <LocationOn color="primary" sx={{ fontSize: 40, mr: 2 }} />
                                    <Typography variant="h5" component="h3">
                                        Real-Time Tracking
                                    </Typography>
                                </Box>
                                <Typography paragraph>
                                    Monitor your Stellar-based assets with GPS precision. Get instant location updates 
                                    and track movement patterns in real-time.
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><Speed fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Sub-second location updates" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><Timeline fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Historical movement tracking" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><Map fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Interactive map visualization" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: 2 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                    <Security color="primary" sx={{ fontSize: 40, mr: 2 }} />
                                    <Typography variant="h5" component="h3">
                                        Geofencing & Alerts
                                    </Typography>
                                </Box>
                                <Typography paragraph>
                                    Set up virtual boundaries and receive instant notifications when assets 
                                    enter or exit designated areas.
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><Notifications fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Custom geofence zones" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><Shield fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Security breach alerts" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><Public fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Multi-zone monitoring" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: 2 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                    <Analytics color="primary" sx={{ fontSize: 40, mr: 2 }} />
                                    <Typography variant="h5" component="h3">
                                        Advanced Analytics
                                    </Typography>
                                </Box>
                                <Typography paragraph>
                                    Comprehensive analytics dashboard with detailed insights into asset 
                                    performance, usage patterns, and optimization opportunities.
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><Dashboard fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Real-time dashboards" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><AccountBalance fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Asset value tracking" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><Api fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="API integrations" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>

            {/* Use Cases Section */}
            <Box sx={{ bgcolor: 'grey.50', py: 8 }}>
                <Container maxWidth="lg">
                    <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                        Use Cases
                    </Typography>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, height: '100%' }}>
                                <Typography variant="h5" gutterBottom>
                                    🏭 Supply Chain Management
                                </Typography>
                                <Typography paragraph>
                                    Track products from manufacturing to delivery. Monitor temperature, 
                                    humidity, and location throughout the entire supply chain.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip label="Logistics" color="primary" size="small" />
                                    <Chip label="Cold Chain" color="primary" size="small" />
                                    <Chip label="Compliance" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, height: '100%' }}>
                                <Typography variant="h5" gutterBottom>
                                    🏠 Real Estate Assets
                                </Typography>
                                <Typography paragraph>
                                    Tokenize and track real estate properties. Monitor property conditions, 
                                    tenant activities, and maintenance schedules.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip label="Property Management" color="primary" size="small" />
                                    <Chip label="Tenant Tracking" color="primary" size="small" />
                                    <Chip label="Maintenance" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, height: '100%' }}>
                                <Typography variant="h5" gutterBottom>
                                    🚗 Vehicle Fleet Management
                                </Typography>
                                <Typography paragraph>
                                    Monitor fleet vehicles, optimize routes, and ensure driver safety. 
                                    Track fuel consumption and maintenance schedules.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip label="Fleet Tracking" color="primary" size="small" />
                                    <Chip label="Route Optimization" color="primary" size="small" />
                                    <Chip label="Driver Safety" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, height: '100%' }}>
                                <Typography variant="h5" gutterBottom>
                                    💎 High-Value Assets
                                </Typography>
                                <Typography paragraph>
                                    Secure tracking of precious metals, artwork, and luxury items. 
                                    Ensure authenticity and prevent theft with blockchain verification.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip label="Art Authentication" color="primary" size="small" />
                                    <Chip label="Luxury Goods" color="primary" size="small" />
                                    <Chip label="Precious Metals" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Benefits Section */}
            <Container maxWidth="lg" sx={{ py: 8 }}>
                <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                    Why Choose Stellar GeoLink?
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Security sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                            <Typography variant="h5" gutterBottom>
                                Enterprise Security
                            </Typography>
                            <Typography>
                                Bank-grade security with API key management, encrypted communications, 
                                and blockchain-verified data integrity.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Speed sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                            <Typography variant="h5" gutterBottom>
                                Lightning Fast
                            </Typography>
                            <Typography>
                                Built on Stellar's high-performance blockchain for instant transactions 
                                and real-time updates with minimal fees.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Api sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                            <Typography variant="h5" gutterBottom>
                                Developer Friendly
                            </Typography>
                            <Typography>
                                Comprehensive REST APIs, SDKs, and documentation for seamless 
                                integration with your existing systems.
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Container>

            {/* Call to Action */}
            <Box sx={{ 
                background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', 
                color: 'white', 
                py: 8 
            }}>
                <Container maxWidth="lg">
                    <Typography variant="h4" component="h2" align="center" gutterBottom>
                        Ready to Transform Your Asset Tracking?
                    </Typography>
                    <Typography align="center" paragraph sx={{ mb: 4, opacity: 0.9 }}>
                        Join hundreds of companies already using Stellar GeoLink to track their most valuable assets
                    </Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button 
                            variant="contained" 
                            color="secondary" 
                            size="large"
                            component={RouterLink}
                            to="/register"
                            sx={{ px: 6, py: 2, mr: 2 }}
                        >
                            Start Free Trial
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="inherit" 
                            size="large"
                            component={RouterLink}
                            to="/contact"
                            sx={{ px: 6, py: 2 }}
                        >
                            Contact Sales
                        </Button>
                        <Box sx={{ mt: 4 }}>
                        <Box
                            component="img"
                            src="/images/Stellar_Logo.png"
                            alt="Stellar Logo"
                            sx={{ 
                                width: 275, 
                                height: 100, 
                                filter: 'brightness(0) invert(1)',
                                zIndex: 2,
                                position: 'relative'
                            }}
                        />
                        </Box>
                    </Box>
                </Container>
            </Box>

            {/* Footer */}
            <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 6 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={4} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Typography variant="h4" component="h3" sx={{ fontWeight: 'bold', mb: 2 }}>
                                Stellar GeoLink
                            </Typography>
                            <Typography variant="body1" sx={{ opacity: 0.9, mb: 2 }}>
                                Real-time location tracking for Stellar-based Real World Assets (RWAs)
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                Powered by Stellar Network
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
                                Built on the Stellar blockchain for secure, fast, and cost-effective asset tracking. 
                                Leveraging the power of decentralized technology for enterprise solutions.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Chip label="Blockchain" color="secondary" size="small" />
                                <Chip label="Decentralized" color="secondary" size="small" />
                                <Chip label="Secure" color="secondary" size="small" />
                                <Chip label="Fast" color="secondary" size="small" />
                            </Box>
                        </Grid>
                    </Grid>
                    <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.2)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                            © 2024 Stellar GeoLink. All rights reserved. | Built with ❤️ on Stellar Network
                        </Typography>
                    </Box>
                </Container>
            </Box>
        </>
    );
};

export default HomePage; 