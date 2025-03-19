import React, { useState, useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import api from '../../utils/api';

const AlertSystem = () => {
    const [alerts, setAlerts] = useState([]);
    const [openAlert, setOpenAlert] = useState(false);
    const [currentAlert, setCurrentAlert] = useState(null);

    useEffect(() => {
        const checkAlerts = async () => {
            try {
                const [anomalies, staleLocations] = await Promise.all([
                    api.get('/analytics/anomalies'),
                    api.get('/monitoring/stale')
                ]);

                const newAlerts = [
                    ...anomalies.data.map(a => ({
                        id: `anomaly-${a.public_key}-${a.created_at}`,
                        type: 'warning',
                        message: `Unusual movement detected for wallet ${a.public_key}: ${(a.distance/1000).toFixed(2)}km in ${a.time_diff}s`
                    })),
                    ...staleLocations.data.map(l => ({
                        id: `stale-${l.public_key}`,
                        type: 'info',
                        message: `Stale location for wallet ${l.public_key}: No updates in ${Math.floor(l.seconds_since_update/3600)}h`
                    }))
                ];

                setAlerts(prev => {
                    const newOnes = newAlerts.filter(a => !prev.find(p => p.id === a.id));
                    if (newOnes.length > 0) {
                        setCurrentAlert(newOnes[0]);
                        setOpenAlert(true);
                    }
                    return [...prev, ...newOnes];
                });
            } catch (error) {
                console.error('Error checking alerts:', error);
            }
        };

        checkAlerts();
        const interval = setInterval(checkAlerts, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const handleCloseAlert = (event, reason) => {
        if (reason === 'clickaway') return;
        setOpenAlert(false);
        setAlerts(prev => prev.filter(a => a.id !== currentAlert.id));
    };

    return (
        <Snackbar
            open={openAlert}
            autoHideDuration={6000}
            onClose={handleCloseAlert}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            {currentAlert && (
                <Alert
                    onClose={handleCloseAlert}
                    severity={currentAlert.type}
                    variant="filled"
                >
                    {currentAlert.message}
                </Alert>
            )}
        </Snackbar>
    );
};

export default AlertSystem; 