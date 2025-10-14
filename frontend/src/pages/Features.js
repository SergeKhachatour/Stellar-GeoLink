import React from 'react';
import { 
    Container, 
    Typography, 
    Box, 
    Grid, 
    Card, 
    CardContent,
    Paper,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    Divider
} from '@mui/material';
import {
    LocationOn,
    Security,
    Analytics,
    Speed,
    AccountBalance,
    Shield,
    Api,
    CheckCircle,
    Star,
    TrendingUp,
    Group,
    Cloud,
    SmartToy
} from '@mui/icons-material';

const Features = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* Hero Section */}
            <Box
                sx={{
                    background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
                    color: 'white',
                    py: { xs: 6, md: 8 },
                    textAlign: 'center'
                }}
            >
                <Container maxWidth="lg">
                <Box
                    component="img"
                    src="/images/Stellar_Logo.png"
                    alt="Stellar Logo"
                    sx={{
                        width: { xs: 200, sm: 250, md: 275 },
                        height: { xs: 75, sm: 90, md: 100 },
                        mb: 3,
                        filter: 'brightness(0) invert(1)',
                        zIndex: 2,
                        position: 'relative'
                    }}
                />
                    <Typography 
                        variant="h2" 
                        component="h1" 
                        sx={{ 
                            fontWeight: 'bold', 
                            mb: 2,
                            fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' },
                            color: 'white'
                        }}
                    >
                        Stellar GeoLink Features
                    </Typography>
                    <Typography 
                        variant="h5" 
                        sx={{ 
                            opacity: 0.9, 
                            maxWidth: '800px', 
                            mx: 'auto',
                            fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' },
                            color: 'white'
                        }}
                    >
                        Comprehensive blockchain-powered geolocation services for blockchain nodes and transactions. 
                        Track, monitor, and visualize node locations with precision and security on the Stellar network.
                    </Typography>
                </Container>
            </Box>

            {/* Core Features */}
            <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
                <Typography 
                    variant="h3" 
                    component="h2" 
                    align="center" 
                    gutterBottom 
                    sx={{ 
                        mb: { xs: 4, md: 6 },
                        fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' }
                    }}
                >
                    Core Features
                </Typography>
                <Grid container spacing={{ xs: 3, md: 4 }}>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: { xs: 2, md: 3 } }}>
                            <CardContent>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    mb: { xs: 2, md: 3 },
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    textAlign: { xs: 'center', sm: 'left' }
                                }}>
                                    <LocationOn color="primary" sx={{ fontSize: { xs: 40, md: 50 }, mr: { xs: 0, sm: 2 }, mb: { xs: 1, sm: 0 } }} />
                                    <Typography 
                                        variant="h4" 
                                        component="h3"
                                        sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                    >
                                        Real-Time Node Tracking
                                    </Typography>
                                </Box>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
                                    Monitor blockchain nodes with GPS precision and blockchain verification. 
                                    Get instant location updates and track node status patterns in real-time.
                                </Typography>
                                <List dense>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Sub-second node location updates" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Historical node status tracking" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Interactive map visualization" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Blockchain-verified coordinates" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: { xs: 2, md: 3 } }}>
                            <CardContent>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    mb: { xs: 2, md: 3 },
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    textAlign: { xs: 'center', sm: 'left' }
                                }}>
                                    <Security color="primary" sx={{ fontSize: { xs: 40, md: 50 }, mr: { xs: 0, sm: 2 }, mb: { xs: 1, sm: 0 } }} />
                                    <Typography 
                                        variant="h4" 
                                        component="h3"
                                        sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                    >
                                        Geofencing & Security
                                    </Typography>
                                </Box>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
                                    Set up virtual boundaries and receive instant notifications when nodes 
                                    enter or exit designated areas. Enterprise-grade security features.
                                </Typography>
                                <List dense>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Custom geofence zones" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Security breach alerts" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Multi-zone monitoring" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="API key management" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Analytics color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        Advanced Analytics
                                    </Typography>
                                </Box>
                                <Typography paragraph>
                                    Comprehensive analytics dashboard with detailed insights into node 
                                    performance, network patterns, and optimization opportunities.
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Real-time dashboards" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Node performance tracking" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Performance metrics" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Export capabilities" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Api color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        Developer APIs
                                    </Typography>
                                </Box>
                                <Typography paragraph>
                                    Comprehensive REST APIs, SDKs, and documentation for seamless 
                                    integration with your existing systems and applications.
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="RESTful API endpoints" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="WebSocket real-time updates" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="SDK libraries" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Comprehensive documentation" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>

            {/* Use Cases */}
            <Box sx={{ bgcolor: 'grey.50', py: 8 }}>
                <Container maxWidth="lg">
                    <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                        Use Cases & Applications
                    </Typography>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, height: '100%', textAlign: 'center' }}>
                                <AccountBalance sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                                <Typography variant="h5" gutterBottom>
                                    Blockchain Network Monitoring
                                </Typography>
                                <Typography paragraph>
                                    Monitor blockchain network health and node distribution across 
                                    different geographical regions with real-time status updates.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <Chip label="Network Health" color="primary" size="small" />
                                    <Chip label="Node Distribution" color="primary" size="small" />
                                    <Chip label="Performance" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, height: '100%', textAlign: 'center' }}>
                                <Group sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                                <Typography variant="h5" gutterBottom>
                                    Stellar Network Visualization
                                </Typography>
                                <Typography paragraph>
                                    Visualize Stellar network topology and node connections. Monitor 
                                    validator nodes and network consensus across different regions.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <Chip label="Network Topology" color="primary" size="small" />
                                    <Chip label="Validator Nodes" color="primary" size="small" />
                                    <Chip label="Consensus" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, height: '100%', textAlign: 'center' }}>
                                <SmartToy sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                                <Typography variant="h5" gutterBottom>
                                    Unity 3D Integration
                                </Typography>
                                <Typography paragraph>
                                    Seamless integration with Unity 3D visualization tools for 
                                    blockchain network mapping and interactive 3D node visualization.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <Chip label="3D Visualization" color="primary" size="small" />
                                    <Chip label="Unity Integration" color="primary" size="small" />
                                    <Chip label="Interactive Maps" color="primary" size="small" />
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Benefits */}
            <Container maxWidth="lg" sx={{ py: 8 }}>
                <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                    Why Choose Stellar GeoLink?
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Shield sx={{ fontSize: 80, color: 'primary.main', mb: 3 }} />
                            <Typography variant="h5" gutterBottom>
                                Enterprise Security
                            </Typography>
                            <Typography paragraph>
                                Bank-grade security with API key management, encrypted communications, 
                                and blockchain-verified data integrity. Your network data is protected with 
                                military-grade encryption and decentralized verification.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Speed sx={{ fontSize: 80, color: 'primary.main', mb: 3 }} />
                            <Typography variant="h5" gutterBottom>
                                Lightning Fast
                            </Typography>
                            <Typography paragraph>
                                Built on Stellar's high-performance blockchain for instant transactions 
                                and real-time updates with minimal fees. Experience sub-second response 
                                times and global scalability.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: 3 }}>
                            <Cloud sx={{ fontSize: 80, color: 'primary.main', mb: 3 }} />
                            <Typography variant="h5" gutterBottom>
                                Scalable Infrastructure
                            </Typography>
                            <Typography paragraph>
                                Cloud-native architecture that scales with your network. From tracking 
                                a single node to managing thousands of nodes across multiple locations 
                                and time zones.
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Container>

            {/* Current Features from README */}
            <Container maxWidth="lg" sx={{ py: 8 }}>
                <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                    Current Platform Features
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Security color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        Authentication & Security
                                    </Typography>
                                </Box>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="JWT-based authentication with refresh tokens" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Role-based access control" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="API key management with approval workflows" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Privacy controls and visibility settings" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <LocationOn color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        Location Services
                                    </Typography>
                                </Box>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="PostGIS-powered location tracking" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Historical location data" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Geofencing capabilities with notifications" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Mapbox GL JS integration" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Analytics color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        Analytics & Monitoring
                                    </Typography>
                                </Box>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Detailed API usage tracking" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Analytics dashboard" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Request management system" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Rate limiting and monitoring" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card sx={{ height: '100%', p: 3 }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Api color="primary" sx={{ fontSize: 50, mr: 2 }} />
                                    <Typography variant="h4" component="h3">
                                        API & Integration
                                    </Typography>
                                </Box>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="RESTful API endpoints" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Swagger API documentation" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Unity 3D integration support" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle color="success" fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="BlockchainMaps compatibility" />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>

            {/* Technical Features */}
            <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 8 }}>
                <Container maxWidth="lg">
                    <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ mb: 6 }}>
                        Technical Capabilities
                    </Typography>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Star sx={{ mr: 2 }} />
                                    Blockchain Integration
                                </Typography>
                                <List>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="Stellar Network Integration" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="Smart Contract Automation" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="Decentralized Data Storage" />
                                    </ListItem>
                                </List>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                    <TrendingUp sx={{ mr: 2 }} />
                                    Performance & Reliability
                                </Typography>
                                <List>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="99.9% Uptime Guarantee" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="Global CDN Distribution" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon><CheckCircle sx={{ color: 'white' }} /></ListItemIcon>
                                        <ListItemText primary="Auto-scaling Infrastructure" />
                                    </ListItem>
                                </List>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Footer */}
            <Box sx={{ bgcolor: 'grey.900', color: 'white', py: 6 }}>
                <Container maxWidth="lg">
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" component="h3" sx={{ fontWeight: 'bold', mb: 2 }}>
                            Ready to Get Started?
                        </Typography>
                        <Typography variant="body1" sx={{ opacity: 0.8, mb: 4 }}>
                            Experience the power of blockchain-powered asset tracking
                        </Typography>
                        <Box
                            component="img"
                            src="/images/Stellar_Logo.png"
                            alt="Stellar Logo"
                            sx={{ 
                                width: 165, 
                                height: 60, 
                                filter: 'brightness(0) invert(1)',
                                zIndex: 2,
                                position: 'relative'
                            }}
                        />
                    </Box>
                    <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.2)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                            © 2024 Stellar GeoLink. All rights reserved. | Built with ❤️ on Stellar Network
                        </Typography>
                    </Box>
                </Container>
            </Box>
        </Box>
    );
};

export default Features;
