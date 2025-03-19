import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box,
    Container
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <AppBar position="static">
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <Typography
                        variant="h6"
                        component={Link}
                        to="/"
                        sx={{
                            flexGrow: 1,
                            textDecoration: 'none',
                            color: 'inherit'
                        }}
                    >
                        GeoLink
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        {user ? (
                            // Logged in menu items
                            <>
                                {user.role === 'admin' && (
                                    <Button
                                        color="inherit"
                                        onClick={() => navigate('/admin')}
                                    >
                                        Admin
                                    </Button>
                                )}
                                <Button
                                    color="inherit"
                                    onClick={() => navigate('/dashboard')}
                                >
                                    Dashboard
                                </Button>
                                <Button
                                    color="inherit"
                                    onClick={() => navigate('/profile')}
                                >
                                    Profile
                                </Button>
                                <Button color="inherit" onClick={handleLogout}>
                                    Logout
                                </Button>
                            </>
                        ) : (
                            // Logged out menu items
                            <>
                                <Button
                                    color="inherit"
                                    onClick={() => navigate('/login')}
                                >
                                    Login
                                </Button>
                                <Button
                                    color="inherit"
                                    onClick={() => navigate('/register')}
                                >
                                    Register
                                </Button>
                            </>
                        )}
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    );
};

export default Navbar; 