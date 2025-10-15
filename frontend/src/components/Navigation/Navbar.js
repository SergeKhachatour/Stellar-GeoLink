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
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AccountCircle from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    
    const [anchorEl, setAnchorEl] = React.useState(null);
    const [mobileOpen, setMobileOpen] = React.useState(false);

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
                        <ListItemButton component={RouterLink} to="/" onClick={handleDrawerToggle}>
                            <ListItemText primary="Home" />
                        </ListItemButton>
                        <ListItemButton component={RouterLink} to="/features" onClick={handleDrawerToggle}>
                            <ListItemText primary="Features" />
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
                            <ListItemText primary={user.email} secondary="Logged in" />
                        </ListItem>
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
                                        <MenuItem>
                                            {user.email}
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