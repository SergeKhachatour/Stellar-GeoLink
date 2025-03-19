import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
    const { user } = useAuth();

    return (
        <Box sx={{ maxWidth: 800, margin: 'auto', mt: 3 }}>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Profile Information</Typography>
                    <Typography>Name: {user?.firstName} {user?.lastName}</Typography>
                    <Typography>Email: {user?.email}</Typography>
                    <Typography>Role: {user?.role}</Typography>
                    <Typography>Organization: {user?.organization}</Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Profile; 