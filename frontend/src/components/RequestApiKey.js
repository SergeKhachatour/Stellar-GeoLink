import React, { useState } from 'react';
import { Container, Typography, Box, Button, Paper } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import ApiKeyRequestForm from './ApiKeyRequestForm';

const RequestApiKey = () => {
    const [showForm, setShowForm] = useState(false);

    const handleSuccess = (data) => {
        console.log('Request submitted successfully:', data);
        // You could redirect or show a success message here
    };

    const handleCancel = () => {
        setShowForm(false);
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box mb={3}>
                <Button
                    component={Link}
                    to="/dashboard"
                    startIcon={<ArrowBack />}
                    sx={{ mb: 2 }}
                >
                    Back to Dashboard
                </Button>
                <Typography variant="h4" component="h1" gutterBottom>
                    Request API Key
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Submit a request for API access to integrate with Stellar GeoLink services.
                </Typography>
            </Box>

            <Paper sx={{ p: 3 }}>
                <ApiKeyRequestForm 
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            </Paper>
        </Container>
    );
};

export default RequestApiKey;
