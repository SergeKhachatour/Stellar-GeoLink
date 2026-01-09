import React from 'react';
import { 
    AppBar, 
    Toolbar, 
    Typography, 
    Button, 
    Container,
    Box,
    IconButton,
    Menu,
    MenuItem,
    Drawer,
    List,
    ListItem,
    ListItemText,
    ListItemButton,
    Divider,
    useMediaQuery,
    useTheme
} from '@mui/material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AccountCircle from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../../services/api';

const Navbar = () => {
    const { user, logout, setUserFromToken } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    
    const [anchorEl, setAnchorEl] = React.useState(null);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [availableRoles, setAvailableRoles] = React.useState([]);
    const [loadingRoles, setLoadingRoles] = React.useState(false);
    
    // Force re-render when location changes
    React.useEffect(() => {
        // This ensures the component re-renders when route changes
    }, [location.pathname]);

    // Fetch available roles when user is logged in
    React.useEffect(() => {
        const fetchRoles = async () => {
            if (!user || !user.public_key) return;
            
            try {
                setLoadingRoles(true);
                const response = await api.get('/auth/roles');
                if (response.data.success && response.data.roles) {
                    // Filter out current role
                    const otherRoles = response.data.roles.filter(r => r.id !== user.id);
                    setAvailableRoles(otherRoles);
                }
            } catch (err) {
                console.error('Error fetching roles:', err);
            } finally {
                setLoadingRoles(false);
            }
        };

        fetchRoles();
    }, [user]);

    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = () => {
        handleClose();
        logout();
        navigate('/login');
    };

    const handleSwitchRole = async (targetRole) => {
        try {
            handleClose();
            
            // Call the select-role endpoint
            const response = await api.post('/auth/login/select-role', {
                public_key: user.public_key,
                role: targetRole.role,
                userId: targetRole.id
            });

            if (response.data.token) {
                // Update token and user
                localStorage.setItem('token', response.data.token);
                api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                
                // Update user context
                if (setUserFromToken) {
                    setUserFromToken({
                        id: response.data.userId,
                        email: response.data.userEmail,
                        role: targetRole.role,
                        public_key: user.public_key
                    });
                }

                // Navigate to appropriate dashboard
                const roleRoutes = {
                    'admin': '/admin',
                    'nft_manager': '/dashboard',
                    'wallet_provider': '/dashboard',
                    'data_consumer': '/dashboard'
                };
                
                navigate(roleRoutes[targetRole.role] || '/dashboard');
                window.location.reload(); // Force refresh to load new role's dashboard
            }
        } catch (err) {
            console.error('Error switching role:', err);
            alert('Failed to switch role. Please try again.');
        }
    };

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const drawer = (
        <Box sx={{ width: 250 }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'inherit' }}>
                    Stellar GeoLink
                </Typography>
                <IconButton onClick={handleDrawerToggle}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <Divider />
            <List>
                {!user ? (
                    // Public navigation
                    <>
                        <ListItemButton 
                            component={RouterLink} 
                            to="/" 
                            onClick={handleDrawerToggle}
                        >
                            <ListItemText primary="Home" />
                        </ListItemButton>
                        <ListItemButton 
                            component={RouterLink} 
                            to="/features" 
                            onClick={handleDrawerToggle}
                        >
                            <ListItemText primary="Features" />
                        </ListItemButton>
                        <ListItemButton 
                            component="a" 
                            href={(() => {
                              const getApiBaseURL = () => {
                                if (typeof window !== 'undefined' && window.location) {
                                  const hostname = window.location.hostname || '';
                                  const protocol = window.location.protocol || 'https:';
                                  const port = window.location.port;
                                  // PRIORITY: stellargeolink.com, azurewebsites.net, HTTPS, or any domain
                                  if (hostname.includes('stellargeolink.com') || 
                                      hostname.includes('azurewebsites.net') || 
                                      protocol === 'https:' ||
                                      (!hostname.includes('localhost') && hostname.includes('.'))) {
                                    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
                                  }
                                }
                                return process.env.REACT_APP_API_URL || 'http://localhost:4000';
                              };
                              return `${getApiBaseURL()}/docs`;
                            })()}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleDrawerToggle}
                        >
                            <ListItemText primary="📚 API Documentation" />
                        </ListItemButton>
                        <ListItemButton component={RouterLink} to="/register" onClick={handleDrawerToggle}>
                            <ListItemText primary="Sign Up" />
                        </ListItemButton>
                        <ListItemButton component={RouterLink} to="/login" onClick={handleDrawerToggle}>
                            <ListItemText primary="Login" />
                        </ListItemButton>
                    </>
                ) : (
                    // Authenticated navigation
                    <>
                        <ListItemButton component={RouterLink} to="/dashboard" onClick={handleDrawerToggle}>
                            <ListItemText primary="Dashboard" />
                        </ListItemButton>
                        {user.role === 'admin' && (
                            <ListItemButton component={RouterLink} to="/admin" onClick={handleDrawerToggle}>
                                <ListItemText primary="Admin" />
                            </ListItemButton>
                        )}
                        {(user.role === 'nft_manager' || user.role === 'admin') && (
                            <ListItemButton component={RouterLink} to="/analytics" onClick={handleDrawerToggle}>
                                <ListItemText primary="📊 Analytics" />
                            </ListItemButton>
                        )}
                        <Divider />
                        <ListItem>
                            <ListItemText 
                                primary={user.email || user.public_key?.substring(0, 8) + '...'} 
                                secondary={`Current: ${user.role?.replace('_', ' ')}`} 
                            />
                        </ListItem>
                        {availableRoles.length > 0 && (
                            <>
                                <ListItem disabled>
                                    <ListItemText 
                                        primary="Switch Role" 
                                        primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                                    />
                                </ListItem>
                                {availableRoles.map((role) => (
                                    <ListItemButton 
                                        key={role.id}
                                        onClick={() => {
                                            handleDrawerToggle();
                                            handleSwitchRole(role);
                                        }}
                                    >
                                        <ListItemText 
                                            primary={role.role.replace('_', ' ')}
                                            secondary={role.email || 'No email'}
                                        />
                                    </ListItemButton>
                                ))}
                                <Divider />
                            </>
                        )}
                        <ListItemButton component={RouterLink} to="/settings" onClick={handleDrawerToggle}>
                            <ListItemText primary="Settings" />
                        </ListItemButton>
                        <ListItemButton component={RouterLink} to="/profile" onClick={handleDrawerToggle}>
                            <ListItemText primary="Profile" />
                        </ListItemButton>
                        <ListItemButton onClick={() => { handleDrawerToggle(); handleLogout(); }}>
                            <ListItemText primary="Logout" />
                        </ListItemButton>
                    </>
                )}
            </List>
        </Box>
    );

    return (
        <AppBar position="static">
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <Typography
                        variant="h6"
                        component={RouterLink}
                        to="/"
                        sx={{
                            flexGrow: 1,
                            textDecoration: 'none',
                            color: 'inherit',
                            fontSize: { xs: '1rem', sm: '1.25rem' }
                        }}
                    >
                        Stellar GeoLink
                    </Typography>

                    {isMobile ? (
                        // Mobile menu button
                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            edge="end"
                            onClick={handleDrawerToggle}
                            sx={{ ml: 2 }}
                        >
                            <MenuIcon />
                        </IconButton>
                    ) : (
                        // Desktop navigation
                        <>
                            {!user ? (
                                // Public navigation
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Button 
                                        color="inherit" 
                                        component={RouterLink} 
                                        to="/"
                                        size="small"
                                    >
                                        Home
                                    </Button>
                                    <Button 
                                        color="inherit" 
                                        component={RouterLink} 
                                        to="/features"
                                        size="small"
                                    >
                                        Features
                                    </Button>
                                    <Button 
                                        color="inherit" 
                                        component="a"
                                        href={(() => {
                              const getApiBaseURL = () => {
                                if (typeof window !== 'undefined' && window.location) {
                                  const hostname = window.location.hostname || '';
                                  const protocol = window.location.protocol || 'https:';
                                  const port = window.location.port;
                                  // PRIORITY: stellargeolink.com, azurewebsites.net, HTTPS, or any domain
                                  if (hostname.includes('stellargeolink.com') || 
                                      hostname.includes('azurewebsites.net') || 
                                      protocol === 'https:' ||
                                      (!hostname.includes('localhost') && hostname.includes('.'))) {
                                    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
                                  }
                                }
                                return process.env.REACT_APP_API_URL || 'http://localhost:4000';
                              };
                              return `${getApiBaseURL()}/docs`;
                            })()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        size="small"
                                    >
                                        📚 API Docs
                                    </Button>
                                    <Button 
                                        color="inherit" 
                                        component={RouterLink} 
                                        to="/register"
                                        variant="outlined"
                                        size="small"
                                        sx={{ mr: 1 }}
                                    >
                                        Sign Up
                                    </Button>
                                    <Button 
                                        color="inherit" 
                                        component={RouterLink} 
                                        to="/login"
                                        variant="outlined"
                                        size="small"
                                    >
                                        Login
                                    </Button>
                                </Box>
                            ) : (
                                // Authenticated navigation
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Button 
                                        color="inherit" 
                                        component={RouterLink} 
                                        to="/dashboard"
                                        size="small"
                                    >
                                        Dashboard
                                    </Button>
                                    {user.role === 'admin' && (
                                        <Button 
                                            color="inherit" 
                                            component={RouterLink} 
                                            to="/admin"
                                            size="small"
                                        >
                                            Admin
                                        </Button>
                                    )}
                                    {(user.role === 'nft_manager' || user.role === 'admin') && (
                                        <Button 
                                            color="inherit" 
                                            component={RouterLink} 
                                            to="/analytics"
                                            size="small"
                                        >
                                            📊 Analytics
                                        </Button>
                                    )}
                                    <IconButton
                                        size="large"
                                        onClick={handleMenu}
                                        color="inherit"
                                    >
                                        <AccountCircle />
                                    </IconButton>
                                    <Menu
                                        anchorEl={anchorEl}
                                        open={Boolean(anchorEl)}
                                        onClose={handleClose}
                                    >
                                        <MenuItem disabled>
                                            <Box>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {user.email || user.public_key?.substring(0, 8) + '...'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Current: {user.role?.replace('_', ' ')}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                        <Divider />
                                        {availableRoles.length > 0 && (
                                            <>
                                                <MenuItem disabled>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Switch Role
                                                    </Typography>
                                                </MenuItem>
                                                {availableRoles.map((role) => (
                                                    <MenuItem 
                                                        key={role.id}
                                                        onClick={() => handleSwitchRole(role)}
                                                    >
                                                        <Box display="flex" alignItems="center" gap={1}>
                                                            <SwitchAccountIcon fontSize="small" />
                                                            <Typography>
                                                                {role.role.replace('_', ' ')}
                                                            </Typography>
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                                <Divider />
                                            </>
                                        )}
                                        <MenuItem 
                                            component={RouterLink} 
                                            to="/settings"
                                            onClick={handleClose}
                                        >
                                            <SettingsIcon sx={{ mr: 1, fontSize: 20 }} />
                                            Settings
                                        </MenuItem>
                                        <MenuItem 
                                            component={RouterLink} 
                                            to="/profile"
                                            onClick={handleClose}
                                        >
                                            Profile
                                        </MenuItem>
                                        <MenuItem onClick={handleLogout}>
                                            Logout
                                        </MenuItem>
                                    </Menu>
                                </Box>
                            )}
                        </>
                    )}
                </Toolbar>
            </Container>
            
            {/* Mobile drawer */}
            <Drawer
                variant="temporary"
                anchor="right"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{
                    keepMounted: true, // Better open performance on mobile.
                }}
                sx={{
                    display: { xs: 'block', md: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 250 },
                }}
            >
                {drawer}
            </Drawer>
        </AppBar>
    );
};

export default Navbar; 