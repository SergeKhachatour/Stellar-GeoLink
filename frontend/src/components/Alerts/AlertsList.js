import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Container, 
    Paper, 
    Typography, 
    List, 
    ListItem, 
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Chip
} from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { alertApi } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';

const AlertsList = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        try {
            const response = await alertApi.getAll();
            setAlerts(response.data);
        } catch (err) {
            setError('Failed to load alerts');
            console.error('Error fetching alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (alertId) => {
        try {
            await alertApi.markAsRead(alertId);
            setAlerts(alerts.map(alert => 
                alert.id === alertId 
                    ? { ...alert, notified: true }
                    : alert
            ));
        } catch (err) {
            console.error('Error marking alert as read:', err);
        }
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <Typography color="error">{error}</Typography>;

    return (
        <Container maxWidth="lg">
            <Box sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Alerts
                </Typography>
                <Paper>
                    <List>
                        {alerts.length === 0 ? (
                            <ListItem>
                                <ListItemText primary="No alerts found" />
                            </ListItem>
                        ) : (
                            alerts.map(alert => (
                                <ListItem key={alert.id}>
                                    <ListItemText
                                        primary={alert.alert_type}
                                        secondary={
                                            <>
                                                <Typography component="span" variant="body2">
                                                    {alert.wallet_public_key}
                                                </Typography>
                                                <br />
                                                {new Date(alert.created_at).toLocaleString()}
                                            </>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        {!alert.notified && (
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleMarkAsRead(alert.id)}
                                            >
                                                <CheckIcon />
                                            </IconButton>
                                        )}
                                        <Chip 
                                            label={alert.notified ? "Read" : "Unread"}
                                            color={alert.notified ? "default" : "primary"}
                                            size="small"
                                            sx={{ ml: 1 }}
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))
                        )}
                    </List>
                </Paper>
            </Box>
        </Container>
    );
};

export default AlertsList; 