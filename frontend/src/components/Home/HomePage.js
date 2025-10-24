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
import PublicNFTShowcase from './PublicNFTShowcase';
import ApiDocumentation from '../shared/ApiDocumentation';

const HomePage = () => {
    return (
        <>
            {/* Hero Section */}
            <Box
                sx={{
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    color: 'black',
                    py: { xs: 6, md: 10 },
                    mb: { xs: 4, md: 6 },
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                <Container maxWidth="lg">
                    <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box sx={{ textAlign: { xs: 'center', md: 'left' }, mb: { xs: 3, md: 4 } }}>
                                <Typography 
                                    variant="h2" 
                                    component="h1" 
                                    sx={{ 
                                        fontWeight: 'bold', 
                                        mb: 1,
                                        fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                    }}
                                >
                                    Stellar GeoLink
                                </Typography>
                                <Typography 
                                    variant="h4" 
                                    component="h2" 
                                    sx={{ 
                                        opacity: 0.9,
                                        fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' }
                                    }}
                                >
                                    Track Stellar Assets in Real-Time
                                </Typography>
                            </Box>
                            <Typography 
                                variant="h6" 
                                paragraph 
                                sx={{ 
                                    mb: { xs: 3, md: 4 }, 
                                    opacity: 0.9,
                                    fontSize: { xs: '1rem', md: '1.25rem' }
                                }}
                            >
                                The premier platform for real-time location tracking of Stellar-based Real World Assets (RWAs). 
                                Bridge the physical and digital worlds with blockchain-powered geolocation services.
                            </Typography>
                            <Box sx={{ 
                                display: 'flex', 
                                gap: 2, 
                                flexWrap: 'wrap',
                                justifyContent: { xs: 'center', md: 'flex-start' }
                            }}>
                                <Button 
                                    variant="contained" 
                                    color="primary" 
                                    size="large"
                                    component={RouterLink}
                                    to="/register"
                                    sx={{ 
                                        px: { xs: 3, md: 4 }, 
                                        py: 1.5,
                                        width: { xs: '100%', sm: 'auto' },
                                        backgroundColor: '#000000',
                                        color: '#FFFFFF',
                                        '&:hover': {
                                            backgroundColor: '#1a1a1a',
                                            boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
                                        }
                                    }}
                                >
                                    Get Started Free
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    color="inherit" 
                                    size="large"
                                    component={RouterLink}
                                    to="/login"
                                    sx={{ 
                                        px: { xs: 3, md: 4 }, 
                                        py: 1.5,
                                        width: { xs: '100%', sm: 'auto' },
                                        borderColor: '#000000',
                                        color: '#000000',
                                        '&:hover': {
                                            borderColor: '#000000',
                                            backgroundColor: 'rgba(0, 0, 0, 0.1)'
                                        }
                                    }}
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
                                        width: { xs: 200, sm: 250, md: 275 }, 
                                        height: { xs: 75, sm: 90, md: 100 }, 
                                        mb: 3,
                                        filter: 'brightness(0) invert(1)',
                                        zIndex: 2,
                                        position: 'relative'
                                    }}
                                />
                                <Paper 
                                    elevation={10} 
                                    sx={{ 
                                        p: { xs: 2, md: 3 }, 
                                        backgroundColor: 'rgba(255,255,255,0.1)', 
                                        backdropFilter: 'blur(10px)',
                                        borderRadius: 3,
                                        mx: { xs: 2, md: 0 }
                                    }}
                                >
                                    <Typography 
                                        variant="h6" 
                                        gutterBottom
                                        sx={{ fontSize: { xs: '1.1rem', md: '1.25rem' } }}
                                    >
                                        🚀 Live Asset Tracking
                                    </Typography>
                                    <Typography 
                                        variant="body2" 
                                        sx={{ 
                                            opacity: 0.9,
                                            fontSize: { xs: '0.875rem', md: '0.9rem' }
                                        }}
                                    >
                                        Monitor your Stellar-based assets across the globe with precision and security
                                    </Typography>
                                </Paper>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Public NFT Showcase */}
            <PublicNFTShowcase />

            {/* Core Features Section */}
            <Box sx={{ 
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                py: { xs: 6, md: 8 }
            }}>
                <Container maxWidth="lg" sx={{ mb: { xs: 6, md: 8 } }}>
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
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: { xs: 1.5, md: 2 } }}>
                            <CardContent>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    mb: 2,
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    textAlign: { xs: 'center', sm: 'left' }
                                }}>
                                    <LocationOn color="primary" sx={{ fontSize: { xs: 30, md: 40 }, mr: { xs: 0, sm: 2 }, mb: { xs: 1, sm: 0 } }} />
                                    <Typography 
                                        variant="h5" 
                                        component="h3"
                                        sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                    >
                                        Real-Time Tracking
                                    </Typography>
                                </Box>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
                                    Monitor your Stellar-based assets with GPS precision. Get instant location updates 
                                    and track movement patterns in real-time.
                                </Typography>
                                <List dense>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Speed fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Sub-second location updates" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Timeline fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Historical movement tracking" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Map fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Interactive map visualization" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: { xs: 1.5, md: 2 } }}>
                            <CardContent>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    mb: 2,
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    textAlign: { xs: 'center', sm: 'left' }
                                }}>
                                    <Security color="primary" sx={{ fontSize: { xs: 30, md: 40 }, mr: { xs: 0, sm: 2 }, mb: { xs: 1, sm: 0 } }} />
                                    <Typography 
                                        variant="h5" 
                                        component="h3"
                                        sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                    >
                                        Geofencing & Alerts
                                    </Typography>
                                </Box>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
                                    Set up virtual boundaries and receive instant notifications when assets 
                                    enter or exit designated areas.
                                </Typography>
                                <List dense>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Notifications fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Custom geofence zones" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Shield fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Security breach alerts" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Public fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Multi-zone monitoring" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%', p: { xs: 1.5, md: 2 } }}>
                            <CardContent>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    mb: 2,
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    textAlign: { xs: 'center', sm: 'left' }
                                }}>
                                    <Analytics color="primary" sx={{ fontSize: { xs: 30, md: 40 }, mr: { xs: 0, sm: 2 }, mb: { xs: 1, sm: 0 } }} />
                                    <Typography 
                                        variant="h5" 
                                        component="h3"
                                        sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                    >
                                        Advanced Analytics
                                    </Typography>
                                </Box>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
                                    Comprehensive analytics dashboard with detailed insights into asset 
                                    performance, usage patterns, and optimization opportunities.
                                </Typography>
                                <List dense>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Dashboard fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Real-time dashboards" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><AccountBalance fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="Asset value tracking" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                    <ListItem sx={{ px: 0 }}>
                                        <ListItemIcon><Api fontSize="small" /></ListItemIcon>
                                        <ListItemText 
                                            primary="API integrations" 
                                            primaryTypographyProps={{ fontSize: { xs: '0.85rem', md: '0.9rem' } }}
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>

            {/* Use Cases Section */}
            <Box sx={{ bgcolor: 'grey.50', py: { xs: 6, md: 8 } }}>
                <Container maxWidth="lg">
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
                        Use Cases
                    </Typography>
                    <Grid container spacing={{ xs: 3, md: 4 }}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: { xs: 2, md: 4 }, height: '100%' }}>
                                <Typography 
                                    variant="h5" 
                                    gutterBottom
                                    sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                >
                                    🏭 Supply Chain Management
                                </Typography>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
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
                            <Paper sx={{ p: { xs: 2, md: 4 }, height: '100%' }}>
                                <Typography 
                                    variant="h5" 
                                    gutterBottom
                                    sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                >
                                    🏠 Real Estate Assets
                                </Typography>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
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
                            <Paper sx={{ p: { xs: 2, md: 4 }, height: '100%' }}>
                                <Typography 
                                    variant="h5" 
                                    gutterBottom
                                    sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                >
                                    🚗 Vehicle Fleet Management
                                </Typography>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
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
                            <Paper sx={{ p: { xs: 2, md: 4 }, height: '100%' }}>
                                <Typography 
                                    variant="h5" 
                                    gutterBottom
                                    sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                                >
                                    💎 High-Value Assets
                                </Typography>
                                <Typography 
                                    paragraph
                                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                >
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
                    Why Choose Stellar GeoLink?
                </Typography>
                <Grid container spacing={{ xs: 3, md: 4 }}>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: { xs: 2, md: 3 } }}>
                            <Security sx={{ fontSize: { xs: 40, md: 60 }, color: 'primary.main', mb: 2 }} />
                            <Typography 
                                variant="h5" 
                                gutterBottom
                                sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                            >
                                Enterprise Security
                            </Typography>
                            <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}>
                                Bank-grade security with API key management, encrypted communications, 
                                and blockchain-verified data integrity.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: { xs: 2, md: 3 } }}>
                            <Speed sx={{ fontSize: { xs: 40, md: 60 }, color: 'primary.main', mb: 2 }} />
                            <Typography 
                                variant="h5" 
                                gutterBottom
                                sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                            >
                                Lightning Fast
                            </Typography>
                            <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}>
                                Built on Stellar's high-performance blockchain for instant transactions 
                                and real-time updates with minimal fees.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center', p: { xs: 2, md: 3 } }}>
                            <Api sx={{ fontSize: { xs: 40, md: 60 }, color: 'primary.main', mb: 2 }} />
                            <Typography 
                                variant="h5" 
                                gutterBottom
                                sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                            >
                                Developer Friendly
                            </Typography>
                            <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}>
                                Comprehensive REST APIs, SDKs, and documentation for seamless 
                                integration with your existing systems.
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Container>
            </Box>

            {/* Call to Action */}
            <Box sx={{ 
                background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', 
                color: 'white', 
                py: { xs: 6, md: 8 } 
            }}>
                <Container maxWidth="lg">
                    <Typography 
                        variant="h4" 
                        component="h2" 
                        align="center" 
                        gutterBottom
                        sx={{ 
                            fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
                            color: 'white'
                        }}
                    >
                        Ready to Transform Your Asset Tracking?
                    </Typography>
                    <Typography 
                        align="center" 
                        paragraph 
                        sx={{ 
                            mb: { xs: 3, md: 4 }, 
                            opacity: 0.9,
                            fontSize: { xs: '0.9rem', md: '1rem' },
                            color: 'white'
                        }}
                    >
                        Join hundreds of companies already using Stellar GeoLink to track their most valuable assets
                    </Typography>
                    <Box sx={{ 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'center',
                        gap: 2,
                        alignItems: 'center'
                    }}>
                        <Button 
                            variant="contained" 
                            color="primary" 
                            size="large"
                            component={RouterLink}
                            to="/register"
                            sx={{ 
                                px: { xs: 4, md: 6 }, 
                                py: 2,
                                width: { xs: '100%', sm: 'auto' },
                                backgroundColor: '#FFD700',
                                color: '#000000',
                                '&:hover': {
                                    backgroundColor: '#E6C200',
                                    boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
                                }
                            }}
                        >
                            Start Free Trial
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="inherit" 
                            size="large"
                            component={RouterLink}
                            to="/contact"
                            sx={{ 
                                px: { xs: 4, md: 6 }, 
                                py: 2,
                                width: { xs: '100%', sm: 'auto' },
                                borderColor: '#FFFFFF',
                                color: '#FFFFFF',
                                '&:hover': {
                                    borderColor: '#FFD700',
                                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                                    color: '#FFD700'
                                }
                            }}
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

            {/* API Documentation Section */}
            <Box sx={{ bgcolor: 'grey.50', py: 6 }}>
                <Container maxWidth="lg">
                    <ApiDocumentation />
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