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
    MenuItem
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AccountCircle from '@mui/icons-material/AccountCircle';

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = React.useState(null);

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
                            color: 'inherit'
                        }}
                    >
                        Stellar GeoLink
                    </Typography>

                    {!user ? (
                        // Public navigation
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Button 
                                color="inherit" 
                                component={RouterLink} 
                                to="/"
                            >
                                Home
                            </Button>
                            <Button 
                                color="inherit" 
                                component={RouterLink} 
                                to="/features"
                            >
                                Features
                            </Button>
                            <Button 
                                color="inherit" 
                                component={RouterLink} 
                                to="/login"
                                variant="outlined"
                            >
                                Login
                            </Button>
                        </Box>
                    ) : (
                        // Authenticated navigation
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {/* Show Dashboard link for all authenticated users */}
                            <Button 
                                color="inherit" 
                                component={RouterLink} 
                                to="/dashboard"
                            >
                                Dashboard
                            </Button>

                            {/* Show Admin link only for admin users */}
                            {user.role === 'admin' && (
                                <Button 
                                    color="inherit" 
                                    component={RouterLink} 
                                    to="/admin"
                                >
                                    Admin
                                </Button>
                            )}

                            {/* User menu */}
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
                </Toolbar>
            </Container>
        </AppBar>
    );
};

export default Navbar; 