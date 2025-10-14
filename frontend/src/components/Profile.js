// Enhanced Profile Component - Cache Bust v1.1
import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Typography,
    Box,
    TextField,
    Alert,
    CircularProgress,
    Grid,
    Card,
    CardContent,
    Chip,
    Avatar,
    Divider,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemIcon
} from '@mui/material';
import {
    Person,
    Email,
    Business,
    Security,
    Wallet,
    Collections,
    LocationOn,
    TrendingUp,
    AccountBalance,
    Star
} from '@mui/icons-material';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [nftStats, setNftStats] = useState(null);
    const [walletInfo, setWalletInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchProfile();
        if (user?.role === 'nft_manager') {
            fetchNftStats();
            fetchWalletInfo();
        }
    }, [user]);

    const fetchProfile = async () => {
        try {
            const response = await api.get('/user/me');
            setProfile(response.data);
        } catch (err) {
            setError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const fetchNftStats = async () => {
        try {
            const response = await api.get('/nft/user-collection');
            setNftStats({
                totalNFTs: response.data.length,
                collections: [...new Set(response.data.map(nft => nft.collection_name))].length
            });
        } catch (err) {
            console.error('Failed to fetch NFT stats:', err);
        }
    };

    const fetchWalletInfo = async () => {
        try {
            if (user?.public_key) {
                setWalletInfo({
                    publicKey: user.public_key,
                    isConnected: true
                });
            }
        } catch (err) {
            console.error('Failed to fetch wallet info:', err);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    const getRoleColor = (role) => {
        switch (role) {
            case 'admin': return 'error';
            case 'nft_manager': return 'primary';
            case 'wallet_provider': return 'secondary';
            case 'data_consumer': return 'success';
            default: return 'default';
        }
    };

    const getRoleIcon = (role) => {
        switch (role) {
            case 'admin': return <Security />;
            case 'nft_manager': return <Collections />;
            case 'wallet_provider': return <Wallet />;
            case 'data_consumer': return <TrendingUp />;
            default: return <Person />;
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: { xs: 2, md: 4 }, mb: { xs: 2, md: 4 } }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
            <Grid container spacing={3}>
                {/* Profile Header */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <Avatar sx={{ 
                                    width: { xs: 60, md: 80 }, 
                                    height: { xs: 60, md: 80 }, 
                                    mr: 2,
                                    bgcolor: 'primary.main'
                                }}>
                                    {profile?.firstName?.charAt(0)}{profile?.lastName?.charAt(0)}
                                </Avatar>
                    <Box>
                                    <Typography variant="h4" sx={{ 
                                        fontSize: { xs: '1.5rem', md: '2rem' },
                                        fontWeight: 'bold'
                                    }}>
                                        {profile?.firstName} {profile?.lastName}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                        <Chip
                                            icon={getRoleIcon(profile?.role)}
                                            label={profile?.role?.replace('_', ' ').toUpperCase()}
                                            color={getRoleColor(profile?.role)}
                                            size="small"
                                            sx={{ mr: 1 }}
                                        />
                                        <Typography variant="body2" color="text.secondary">
                                            Member since {new Date(profile?.createdAt).toLocaleDateString()}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Basic Information */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                            <Typography variant="h6" gutterBottom sx={{ 
                                fontSize: { xs: '1.1rem', md: '1.25rem' },
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                <Person sx={{ mr: 1 }} />
                                Basic Information
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            
                            <List dense>
                                <ListItem>
                                    <ListItemIcon>
                                        <Email />
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary="Email" 
                                        secondary={profile?.email}
                                        primaryTypographyProps={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                        secondaryTypographyProps={{ fontSize: { xs: '0.8rem', md: '0.875rem' } }}
                                    />
                                </ListItem>
                                <ListItem>
                                    <ListItemIcon>
                                        <Business />
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary="Organization" 
                                        secondary={profile?.organization || 'Not specified'}
                                        primaryTypographyProps={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                                        secondaryTypographyProps={{ fontSize: { xs: '0.8rem', md: '0.875rem' } }}
                                    />
                                </ListItem>
                            </List>
                        </CardContent>
                    </Card>
                </Grid>

                {/* NFT Manager Specific Content */}
                {user?.role === 'nft_manager' && (
                    <>
                        {/* NFT Statistics */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                                    <Typography variant="h6" gutterBottom sx={{ 
                                        fontSize: { xs: '1.1rem', md: '1.25rem' },
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        <Collections sx={{ mr: 1 }} />
                                        NFT Statistics
                                    </Typography>
                                    <Divider sx={{ mb: 2 }} />
                                    
                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
                                                <Typography variant="h4" sx={{ 
                                                    fontSize: { xs: '1.5rem', md: '2rem' },
                                                    fontWeight: 'bold',
                                                    color: 'primary.contrastText'
                                                }}>
                                                    {nftStats?.totalNFTs || 0}
                                                </Typography>
                                                <Typography variant="body2" sx={{ 
                                                    fontSize: { xs: '0.8rem', md: '0.875rem' },
                                                    color: 'primary.contrastText'
                                                }}>
                                                    Total NFTs
                                                </Typography>
                                            </Box>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'secondary.light', borderRadius: 1 }}>
                                                <Typography variant="h4" sx={{ 
                                                    fontSize: { xs: '1.5rem', md: '2rem' },
                                                    fontWeight: 'bold',
                                                    color: 'secondary.contrastText'
                                                }}>
                                                    {nftStats?.collections || 0}
                                                </Typography>
                                                <Typography variant="body2" sx={{ 
                                                    fontSize: { xs: '0.8rem', md: '0.875rem' },
                                                    color: 'secondary.contrastText'
                                                }}>
                                                    Collections
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Wallet Information */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                                    <Typography variant="h6" gutterBottom sx={{ 
                                        fontSize: { xs: '1.1rem', md: '1.25rem' },
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        <Wallet sx={{ mr: 1 }} />
                                        Wallet Information
                                    </Typography>
                                    <Divider sx={{ mb: 2 }} />
                                    
                                    {walletInfo?.isConnected ? (
                                        <Box>
                                            <Typography variant="body2" color="success.main" sx={{ 
                                                fontSize: { xs: '0.8rem', md: '0.875rem' },
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 1
                                            }}>
                                                <Star sx={{ mr: 0.5, fontSize: '1rem' }} />
                                                Wallet Connected
                                            </Typography>
                                            <Typography variant="body2" sx={{ 
                                                fontSize: { xs: '0.7rem', md: '0.75rem' },
                                                fontFamily: 'monospace',
                                                wordBreak: 'break-all'
                                            }}>
                                                {walletInfo.publicKey}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ 
                                            fontSize: { xs: '0.8rem', md: '0.875rem' }
                                        }}>
                                            No wallet connected
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Quick Actions */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                                    <Typography variant="h6" gutterBottom sx={{ 
                                        fontSize: { xs: '1.1rem', md: '1.25rem' },
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        <LocationOn sx={{ mr: 1 }} />
                                        Quick Actions
                                    </Typography>
                                    <Divider sx={{ mb: 2 }} />
                                    
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Button 
                                            variant="contained" 
                                            color="primary"
                                            href="/dashboard/nft"
                                            sx={{ 
                                                fontSize: { xs: '0.8rem', md: '0.875rem' },
                                                py: { xs: 1, md: 1.5 }
                                            }}
                                        >
                                            🎨 NFT Dashboard
                                        </Button>
                                        <Button 
                                            variant="outlined" 
                                            color="secondary"
                                            href="/enhanced-nft-dashboard"
                                            sx={{ 
                                                fontSize: { xs: '0.8rem', md: '0.875rem' },
                                                py: { xs: 1, md: 1.5 }
                                            }}
                                        >
                                            🚀 Enhanced Dashboard
                                        </Button>
                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    </>
                )}

                {/* Other Role Content */}
                {user?.role !== 'nft_manager' && (
                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                                <Typography variant="h6" gutterBottom sx={{ 
                                    fontSize: { xs: '1.1rem', md: '1.25rem' },
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    <AccountBalance sx={{ mr: 1 }} />
                                    Account Overview
                                </Typography>
                                <Divider sx={{ mb: 2 }} />
                                
                                <Typography variant="body2" color="text.secondary" sx={{ 
                                    fontSize: { xs: '0.8rem', md: '0.875rem' }
                                }}>
                                    Welcome to your profile! Your account is set up and ready to use.
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>
        </Container>
    );
};

export default Profile; 