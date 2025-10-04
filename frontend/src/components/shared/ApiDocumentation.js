import React, { useState } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Tabs,
    Tab,
    Paper,
    Container
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const ApiDocumentation = () => {
    const { user } = useAuth(); // Get the authenticated user
    const [activeTab, setActiveTab] = useState(0);

    const walletProviderDocs = {
        title: 'Wallet Provider API Documentation',
        endpoints: [
            {
                name: 'Update Single Wallet Location',
                method: 'POST',
                endpoint: '/api/location/update',
                description: 'Update or create a location for a single wallet',
                headers: {
                    'X-API-Key': 'Your API key',
                    'Content-Type': 'application/json'
                },
                body: {
                    public_key: 'string',
                    latitude: 'number',
                    longitude: 'number',
                    blockchain: 'string (optional, defaults to "Stellar")',
                    wallet_type_id: 'number (optional)',
                    description: 'string (optional)'
                }
            },
            {
                name: 'Batch Update Wallet Locations',
                method: 'POST',
                endpoint: '/api/location/batch-update',
                description: 'Update or create locations for multiple wallets',
                headers: {
                    'X-API-Key': 'Your API key',
                    'Content-Type': 'application/json'
                },
                body: {
                    locations: [{
                        public_key: 'string',
                        latitude: 'number',
                        longitude: 'number',
                        blockchain: 'string (optional)',
                        wallet_type_id: 'number (optional)',
                        description: 'string (optional)'
                    }]
                }
            }
        ]
    };

    const dataConsumerDocs = {
        title: 'Data Consumer API Documentation',
        endpoints: [
            {
                name: 'Get Wallet Locations',
                method: 'GET',
                endpoint: '/api/location/wallets',
                description: 'Retrieve all active wallet locations',
                headers: {
                    'X-API-Key': 'Your API key',
                    'Content-Type': 'application/json'
                }
            },
            {
                name: 'Get Wallet Location by ID',
                method: 'GET',
                endpoint: '/api/location/wallets/{id}',
                description: 'Retrieve details for a specific wallet location',
                headers: {
                    'X-API-Key': 'Your API key',
                    'Content-Type': 'application/json'
                }
            },
            {
                name: 'Search Wallets by Area',
                method: 'POST',
                endpoint: '/api/location/search',
                description: 'Search for wallets within a geographic area',
                headers: {
                    'X-API-Key': 'Your API key',
                    'Content-Type': 'application/json'
                },
                body: {
                    latitude: 'number',
                    longitude: 'number',
                    radius: 'number (in kilometers)',
                    blockchain: 'string (optional)',
                    wallet_type_id: 'number (optional)'
                }
            }
        ]
    };

    // Get documentation based on user role
    const getDocumentation = () => {
        if (user?.role === 'wallet_provider') {
            return walletProviderDocs;
        } else if (user?.role === 'data_consumer') {
            return dataConsumerDocs;
        }
        return { title: 'API Documentation', endpoints: [] };
    };

    const docs = getDocumentation();

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const downloadPostmanCollection = () => {
        window.location.href = '/api-docs/postman';
    };

    const pythonExample = `
import requests

api_key = 'your_api_key_here'
headers = {
    'X-API-Key': api_key
}

# Example API call
response = requests.get('${window.location.origin}/api/location/wallets', headers=headers)
data = response.json()
print(data)
    `.trim();

    const nodeExample = `
const axios = require('axios');

const apiKey = 'your_api_key_here';
const headers = {
    'X-API-Key': apiKey
};

// Example API call
axios.get('${window.location.origin}/api/location/wallets', { headers })
    .then(response => console.log(response.data))
    .catch(error => console.error(error));
    `.trim();

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" gutterBottom>
                    {docs.title}
                </Typography>
                <Button
                    variant="outlined"
                    onClick={downloadPostmanCollection}
                >
                    Download Postman Collection
                </Button>
            </Box>

            {docs.endpoints.map((endpoint, index) => (
                <Paper key={index} sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" color="primary">
                        {endpoint.name}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                        {endpoint.description}
                    </Typography>
                    
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1" color="text.secondary">
                            Endpoint
                        </Typography>
                        <Box sx={{ bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
                            <Typography variant="code">
                                {`${endpoint.method} ${endpoint.endpoint}`}
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1" color="text.secondary">
                            Headers
                        </Typography>
                        <pre style={{ 
                            backgroundColor: '#f5f5f5', 
                            padding: '1rem',
                            borderRadius: '4px'
                        }}>
                            {JSON.stringify(endpoint.headers, null, 2)}
                        </pre>
                    </Box>

                    {endpoint.body && (
                        <Box>
                            <Typography variant="subtitle1" color="text.secondary">
                                Request Body
                            </Typography>
                            <pre style={{ 
                                backgroundColor: '#f5f5f5', 
                                padding: '1rem',
                                borderRadius: '4px'
                            }}>
                                {JSON.stringify(endpoint.body, null, 2)}
                            </pre>
                        </Box>
                    )}
                </Paper>
            ))}
        </Container>
    );
};

export default ApiDocumentation; 