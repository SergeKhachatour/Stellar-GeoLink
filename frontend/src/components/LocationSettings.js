import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  LocationOn as LocationIcon,
  LocationOff as LocationOffIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

const LocationSettings = ({ open, onClose, onLocationUpdate }) => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [highAccuracy, setHighAccuracy] = useState(true);

  useEffect(() => {
    if (open) {
      checkLocationPermission();
    }
  }, [open]);

  const checkLocationPermission = async () => {
    if ('geolocation' in navigator) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionGranted(permission.state === 'granted');
      } catch (err) {
        console.log('Permission API not supported');
        setPermissionGranted(true); // Assume granted if API not supported
      }
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setLoading(true);
    setError('');

    const options = {
      enableHighAccuracy: highAccuracy,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        
        setLocation(locationData);
        setError('');
        setLoading(false);
        
        if (onLocationUpdate) {
          onLocationUpdate(locationData);
        }
      },
      (error) => {
        let errorMessage = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location services and refresh the page.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
          default:
            errorMessage = 'An unknown error occurred while retrieving location.';
            break;
        }
        setError(errorMessage);
        setLoading(false);
      },
      options
    );
  };

  const handleClose = () => {
    setLocation(null);
    setError('');
    setLoading(false);
    onClose();
  };

  const handleLocationUpdate = () => {
    if (onLocationUpdate && location) {
      onLocationUpdate(location);
    }
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <LocationIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Location Services</Typography>
          </Box>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Location services are required to discover nearby NFTs and verify your position for collection.
        </Typography>

        {!permissionGranted && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Location Permission Required:</strong> Please enable location services in your browser settings to use NFT collection features.
            </Typography>
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Location Settings
            </Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={highAccuracy}
                  onChange={(e) => setHighAccuracy(e.target.checked)}
                />
              }
              label="High Accuracy Mode (Recommended for NFT collection)"
            />
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              High accuracy mode provides more precise location data but may use more battery.
            </Typography>
          </CardContent>
        </Card>

        {location && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Current Location
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Latitude:</strong> {location.latitude.toFixed(6)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Longitude:</strong> {location.longitude.toFixed(6)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Accuracy:</strong> ±{Math.round(location.accuracy)}m
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Last Updated:</strong> {new Date(location.timestamp).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box display="flex" justifyContent="center" sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
            onClick={getCurrentLocation}
            disabled={loading}
            fullWidth
          >
            {loading ? 'Getting Location...' : 'Get Current Location'}
          </Button>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Privacy Note:</strong> Your location data is only used locally to find nearby NFTs and is never stored on our servers.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        {location && (
          <Button
            variant="contained"
            onClick={handleLocationUpdate}
            startIcon={<LocationIcon />}
          >
            Use This Location
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default LocationSettings;
