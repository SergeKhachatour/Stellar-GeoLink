import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Chip,
    Alert,
    CircularProgress
} from '@mui/material';
import { format } from 'date-fns';
import api from '../utils/api';

const ApiKeyManagement = () => {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        try {
            const response = await api.get('/user/api-keys');
            setKeys(response.data);
        } catch (err) {
            setError('Failed to fetch API keys');
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeKey = async (keyId) => {
        try {
            await api.delete(`/user/api-keys/${keyId}`);
            fetchKeys();
        } catch (err) {
            setError('Failed to revoke API key');
        }
    };

    if (loading) return <CircularProgress />;

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>
                API Key Management
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>API Key</TableCell>
                                    <TableCell>Created</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Last Used</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {keys.map((key) => (
                                    <TableRow key={key.id}>
                                        <TableCell>
                                            <Typography
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.875rem'
                                                }}
                                            >
                                                {key.api_key}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(key.created_at), 'PPP')}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={key.status ? 'Active' : 'Inactive'}
                                                color={key.status ? 'success' : 'error'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {key.last_used_at ? 
                                                format(new Date(key.last_used_at), 'PPP') : 
                                                'Never'
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                size="small"
                                                onClick={() => handleRevokeKey(key.id)}
                                            >
                                                Revoke
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>
        </Container>
    );
};

export default ApiKeyManagement; 