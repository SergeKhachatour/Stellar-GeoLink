import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Chip
} from '@mui/material';
import api from '../utils/api';

const ApiKeys = () => {
    const [apiKeys, setApiKeys] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchApiKeys = async () => {
            try {
                const response = await api.get('/api/user/api-keys');
                setApiKeys(response.data);
            } catch (error) {
                console.error('Error fetching API keys:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchApiKeys();
    }, []);

    if (loading) {
        return <Typography>Loading API keys...</Typography>;
    }

    return (
        <Box sx={{ maxWidth: 800, margin: 'auto', mt: 3 }}>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Your API Keys</Typography>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Type</TableCell>
                                <TableCell>API Key</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {apiKeys.map((key) => (
                                <TableRow key={key.id}>
                                    <TableCell>{key.type}</TableCell>
                                    <TableCell>{key.api_key}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={key.status ? 'Active' : 'Inactive'}
                                            color={key.status ? 'success' : 'error'}
                                            size="small"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </Box>
    );
};

export default ApiKeys; 