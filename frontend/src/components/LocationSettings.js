import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Switch,
    FormControlLabel,
    Button,
    Alert,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField
} from '@mui/material';
import {
    LocationOn,
    MyLocation
} from '@mui/icons-material';

const LocationSettings = ({ onLocationUpdate, onClose }) => {
    const [locationEnabled, setLocationEnabled] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [manualLocation, setManualLocation] = useState({
        latitude: '',
        longitude: ''
    });

    useEffect(() => {
        // Check if location services are enabled
        const savedLocationEnabled = localStorage.getItem('locationEnabled') === 'true';
        setLocationEnabled(savedLocationEnabled);

        if (savedLocationEnabled) {
            getUserLocation();
        }
    }, []);

    const handleLocationToggle = (event) => {
        const enabled = event.target.checked;
        setLocationEnabled(enabled);
        localStorage.setItem('locationEnabled', enabled.toString());

        if (enabled) {
            getUserLocation();
        } else {
            setUserLocation(null);
            if (onLocationUpdate) {
                onLocationUpdate(null);
            }
        }
    };

    const getUserLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser');
            return;
        }

        setLoading(true);
        setError('');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                setUserLocation(location);
                setManualLocation({
                    latitude: location.lat.toString(),
                    longitude: location.lon.toString()
                });
                
                if (onLocationUpdate) {
                    onLocationUpdate(location);
                }
                setLoading(false);
            },
            (error) => {
                console.error('Error getting location:', error);
                let errorMessage = 'Failed to get location';
                
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location access denied. Please enable location services.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out.';
                        break;
                }
                
                setError(errorMessage);
                setLoading(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    };

    const handleManualLocationSubmit = () => {
        const lat = parseFloat(manualLocation.latitude);
        const lon = parseFloat(manualLocation.longitude);

        if (isNaN(lat) || isNaN(lon)) {
            setError('Please enter valid coordinates');
            return;
        }

        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            setError('Invalid coordinate range');
            return;
        }

        const location = { lat, lon };
        setUserLocation(location);
        
        if (onLocationUpdate) {
            onLocationUpdate(location);
        }
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Location Services Settings
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={locationEnabled}
                                onChange={handleLocationToggle}
                                color="primary"
                            />
                        }
                        label="Enable Location Services"
                    />
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                        Allow the app to access your location for NFT collection and pinning.
                    </Typography>

                    {locationEnabled && (
                        <Card sx={{ mb: 2 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Current Location
                                </Typography>
                                
                                {loading && (
                                    <Box display="flex" alignItems="center" gap={2}>
                                        <CircularProgress size={20} />
                                        <Typography>Getting your location...</Typography>
                                    </Box>
                                )}

                                {userLocation && !loading && (
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">
                                            Latitude: {userLocation.lat.toFixed(6)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Longitude: {userLocation.lon.toFixed(6)}
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<MyLocation />}
                                            onClick={getUserLocation}
                                            sx={{ mt: 1 }}
                                        >
                                            Refresh Location
                                        </Button>
                                    </Box>
                                )}

                                {error && (
                                    <Alert severity="error" sx={{ mt: 2 }}>
                                        {error}
                                    </Alert>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Manual Location Entry
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Enter coordinates manually if location services are unavailable.
                            </Typography>
                            
                            <Box display="flex" gap={2} sx={{ mb: 2 }}>
                                <TextField
                                    label="Latitude"
                                    type="number"
                                    value={manualLocation.latitude}
                                    onChange={(e) => setManualLocation({
                                        ...manualLocation,
                                        latitude: e.target.value
                                    })}
                                    fullWidth
                                    inputProps={{
                                        step: "any",
                                        min: -90,
                                        max: 90
                                    }}
                                />
                                <TextField
                                    label="Longitude"
                                    type="number"
                                    value={manualLocation.longitude}
                                    onChange={(e) => setManualLocation({
                                        ...manualLocation,
                                        longitude: e.target.value
                                    })}
                                    fullWidth
                                    inputProps={{
                                        step: "any",
                                        min: -180,
                                        max: 180
                                    }}
                                />
                            </Box>
                            
                            <Button
                                variant="contained"
                                onClick={handleManualLocationSubmit}
                                disabled={!manualLocation.latitude || !manualLocation.longitude}
                            >
                                Set Manual Location
                            </Button>
                        </CardContent>
                    </Card>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default LocationSettings;
