import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Container,
    Paper,
    TextField,
    Button,
    Typography,
    Box,
    Alert,
    FormControlLabel,
    Checkbox,
    Link as MuiLink
} from '@mui/material';
import LoadingSpinner from './LoadingSpinner';

const Login = () => {
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const { login, error } = useAuth();
    const navigate = useNavigate();

    const validateForm = () => {
        const errors = {};
        if (!credentials.email) {
            errors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(credentials.email)) {
            errors.email = 'Email is invalid';
        }
        if (!credentials.password) {
            errors.password = 'Password is required';
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);
        try {
            const user = await login(credentials);
            console.log('Login successful:', user);
            if (rememberMe) {
                localStorage.setItem('rememberMe', 'true');
            }
            navigate(user.role === 'admin' ? '/admin' : '/dashboard');
        } catch (err) {
            console.error('Login error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 4, md: 8 }, mb: { xs: 4, md: 8 } }}>
                <Paper sx={{ p: { xs: 2, md: 4 } }}>
                    <Typography 
                        variant="h4" 
                        align="center" 
                        gutterBottom
                        sx={{ 
                            fontSize: { xs: '1.75rem', md: '2rem' },
                            mb: { xs: 2, md: 3 }
                        }}
                    >
                        Login to GeoLink
                    </Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            margin="normal"
                            value={credentials.email}
                            onChange={(e) => setCredentials({
                                ...credentials,
                                email: e.target.value
                            })}
                            error={!!validationErrors.email}
                            helperText={validationErrors.email}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }
                            }}
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            type="password"
                            margin="normal"
                            value={credentials.password}
                            onChange={(e) => setCredentials({
                                ...credentials,
                                password: e.target.value
                            })}
                            error={!!validationErrors.password}
                            helperText={validationErrors.password}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: { xs: '1rem', md: '1rem' }
                                }
                            }}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label="Remember me"
                            sx={{ 
                                mt: 1,
                                '& .MuiFormControlLabel-label': {
                                    fontSize: { xs: '0.9rem', md: '1rem' }
                                }
                            }}
                        />
                        <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            type="submit"
                            sx={{ 
                                mt: 3, 
                                mb: 2,
                                py: { xs: 1.5, md: 1.5 },
                                fontSize: { xs: '1rem', md: '1rem' }
                            }}
                            disabled={loading}
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>
                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <MuiLink 
                                component={Link} 
                                to="/register" 
                                variant="body2"
                                sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                            >
                                Don't have an account? Sign Up
                            </MuiLink>
                        </Box>
                    </form>
                </Paper>
            </Box>
        </Container>
    );
};

export default Login; 