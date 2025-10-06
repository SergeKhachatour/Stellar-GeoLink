import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Typography,
    Box,
    TextField,
    Alert,
    CircularProgress
} from '@mui/material';
import api from '../utils/api';

const Profile = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await api.get('/user/profile');
            setProfile(response.data);
        } catch (err) {
            setError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="sm">
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Profile
                </Typography>
                
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                {profile && (
                    <Box>
                        <TextField
                            fullWidth
                            label="Email"
                            value={profile.email}
                            margin="normal"
                            disabled
                        />
                        <TextField
                            fullWidth
                            label="First Name"
                            value={profile.first_name}
                            margin="normal"
                            disabled
                        />
                        <TextField
                            fullWidth
                            label="Last Name"
                            value={profile.last_name}
                            margin="normal"
                            disabled
                        />
                        <TextField
                            fullWidth
                            label="Organization"
                            value={profile.organization}
                            margin="normal"
                            disabled
                        />
                        <TextField
                            fullWidth
                            label="Role"
                            value={profile.role}
                            margin="normal"
                            disabled
                        />
                    </Box>
                )}
            </Paper>
        </Container>
    );
};

export default Profile; 