import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Button } from '@mui/material';
import api from '../utils/api';

const DataConsumerDashboard = () => {
    const [apiKey, setApiKey] = useState(null);
    const [keyStatus, setKeyStatus] = useState(null);

    useEffect(() => {
        checkApiKeyStatus();
    }, []);

    const checkApiKeyStatus = async () => {
        try {
            const response = await api.get('/user/api-key-status');
            setKeyStatus(response.data.status);
            if (response.data.status === 'approved') {
                const keyResponse = await api.get('/user/api-key');
                setApiKey(keyResponse.data.apiKey);
            }
        } catch (error) {
            console.error('Error checking API key status:', error);
        }
    };

    return (
        <div className="data-consumer-dashboard">
            <Card>
                <CardContent>
                    <Typography variant="h5" gutterBottom>
                        API Access
                    </Typography>
                    {keyStatus === 'pending' && (
                        <Typography>
                            Your API key request is pending approval.
                        </Typography>
                    )}
                    {keyStatus === 'approved' && apiKey && (
                        <>
                            <Typography>Your API Key:</Typography>
                            <pre>{apiKey}</pre>
                            <Button
                                variant="outlined"
                                onClick={() => navigator.clipboard.writeText(apiKey)}
                            >
                                Copy to Clipboard
                            </Button>
                        </>
                    )}
                    {keyStatus === 'rejected' && (
                        <Typography color="error">
                            Your API key request was rejected. Please contact support.
                        </Typography>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default DataConsumerDashboard; 