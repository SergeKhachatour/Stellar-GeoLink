import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    TextField,
    Switch,
    FormControlLabel,
    Button,
    Snackbar,
    Alert
} from '@mui/material';
import api from '../../utils/api';

const AlertPreferences = () => {
    const [preferences, setPreferences] = useState({
        stale_threshold_hours: 1,
        movement_threshold_km: 10,
        movement_time_window_minutes: 5,
        email_notifications: true,
        webhook_notifications: true
    });
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        try {
            const response = await api.get('/alerts/preferences');
            setPreferences(response.data);
        } catch (error) {
            console.error('Error fetching preferences:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put('/alerts/preferences', preferences);
            setMessage({ type: 'success', text: 'Preferences updated successfully' });
        } catch (error) {
            setMessage({ type: 'error', text: 'Error updating preferences' });
        }
    };

    return (
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    Alert Preferences
                </Typography>
                <form onSubmit={handleSubmit}>
                    <TextField
                        label="Stale Location Threshold (hours)"
                        type="number"
                        value={preferences.stale_threshold_hours}
                        onChange={(e) => setPreferences({
                            ...preferences,
                            stale_threshold_hours: parseInt(e.target.value)
                        })}
                        fullWidth
                        margin="normal"
                    />
                    <TextField
                        label="Movement Threshold (km)"
                        type="number"
                        value={preferences.movement_threshold_km}
                        onChange={(e) => setPreferences({
                            ...preferences,
                            movement_threshold_km: parseInt(e.target.value)
                        })}
                        fullWidth
                        margin="normal"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={preferences.email_notifications}
                                onChange={(e) => setPreferences({
                                    ...preferences,
                                    email_notifications: e.target.checked
                                })}
                            />
                        }
                        label="Email Notifications"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={preferences.webhook_notifications}
                                onChange={(e) => setPreferences({
                                    ...preferences,
                                    webhook_notifications: e.target.checked
                                })}
                            />
                        }
                        label="Webhook Notifications"
                    />
                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        fullWidth
                        style={{ marginTop: 16 }}
                    >
                        Save Preferences
                    </Button>
                </form>
            </CardContent>
            <Snackbar
                open={!!message}
                autoHideDuration={6000}
                onClose={() => setMessage(null)}
            >
                <Alert severity={message?.type} onClose={() => setMessage(null)}>
                    {message?.text}
                </Alert>
            </Snackbar>
        </Card>
    );
};

export default AlertPreferences; 