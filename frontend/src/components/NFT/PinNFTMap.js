import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Slider,
  Switch,
  FormControlLabel,
  Stack,
  Card,
  CardContent,
  Chip,
  Stepper,
  Step,
  StepLabel,
  StepContent
} from '@mui/material';
import {
  Add as AddIcon,
  LocationOn as LocationIcon,
  Public as PublicIcon,
  MonetizationOn as PriceIcon,
  Star as StarIcon,
  Security as SecurityIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  MyLocation as MyLocationIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon
} from '@mui/icons-material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const PinNFTMap = () => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [map, setMap] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [pinForm, setPinForm] = useState({
    collection_id: '',
    ipfs_hash: '',
    latitude: '',
    longitude: '',
    radius_meters: 10,
    rarity_requirements: {},
    smart_contract_address: '',
    is_active: true
  });
  const [verificationData, setVerificationData] = useState({
    location_accuracy: 0,
    gps_verification: false,
    admin_approval: false
  });
  const mapContainer = useRef(null);
  const markerRef = useRef(null);

  // Mapbox configuration
  const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1Ijoic3RlbGxhci1nZW9saW5rIiwiYSI6ImNsc2V4Z2V4ZzAwMDFyMmx0b2V4Z2V4Z2cifQ.example';

  useEffect(() => {
    fetchCollections();
    getUserLocation();
  }, []);

  useEffect(() => {
    if (mapLoaded && userLocation) {
      initializeMap();
    }
  }, [mapLoaded, userLocation]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await api.get('/nft/collections');
      // setCollections(response.data);
      
      // Mock data for now
      setCollections([
        {
          id: 1,
          name: 'Stellar Explorer',
          description: 'Discover the cosmos with Stellar NFTs',
          image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
          rarity_level: 'common',
          collection_requirements: {
            min_distance: 100,
            max_per_user: 5
          }
        },
        {
          id: 2,
          name: 'Galaxy Guardian',
          description: 'Rare NFTs for protecting the galaxy',
          image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
          rarity_level: 'rare',
          collection_requirements: {
            min_distance: 50,
            max_per_user: 3
          }
        },
        {
          id: 3,
          name: 'Cosmic Legend',
          description: 'Legendary NFTs from the depths of space',
          image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
          rarity_level: 'legendary',
          collection_requirements: {
            min_distance: 10,
            max_per_user: 1
          }
        }
      ]);
    } catch (err) {
      setError('Failed to fetch NFT collections');
      console.error('Error fetching collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          // Default to New York if location access is denied
          setUserLocation({ lat: 40.7128, lng: -74.0060 });
        }
      );
    } else {
      // Default to New York if geolocation is not supported
      setUserLocation({ lat: 40.7128, lng: -74.0060 });
    }
  };

  const initializeMap = () => {
    if (map || !mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: userLocation ? [userLocation.lng, userLocation.lat] : [-74.0060, 40.7128],
      zoom: 13
    });

    newMap.on('load', () => {
      setMapLoaded(true);
    });

    // Add click handler for map
    newMap.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      setSelectedLocation({ lat, lng });
      setPinForm(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng
      }));
      
      // Add marker at clicked location
      if (markerRef.current) {
        markerRef.current.remove();
      }
      
      markerRef.current = new mapboxgl.Marker({ color: '#ff6b35' })
        .setLngLat([lng, lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <h3>NFT Pin Location</h3>
                <p>Lat: ${lat.toFixed(6)}</p>
                <p>Lng: ${lng.toFixed(6)}</p>
                <p>Click "Pin NFT" to create NFT at this location</p>
              </div>
            `)
        )
        .addTo(newMap);
    });

    setMap(newMap);
  };

  const handlePinNFT = () => {
    if (!selectedLocation) {
      alert('Please select a location on the map first');
      return;
    }
    
    setPinForm(prev => ({
      ...prev,
      latitude: selectedLocation.lat,
      longitude: selectedLocation.lng
    }));
    setActiveStep(0);
    setOpenDialog(true);
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmitPin = async () => {
    try {
      // await api.post('/nft/pin', {
      //   ...pinForm,
      //   ...verificationData
      // });
      console.log('Pin NFT:', pinForm, verificationData);
      alert('NFT pinned successfully!');
      setOpenDialog(false);
      
      // Clear marker
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      setSelectedLocation(null);
    } catch (err) {
      setError('Failed to pin NFT');
      console.error('Error pinning NFT:', err);
    }
  };

  const centerMapOnUser = () => {
    if (map && userLocation) {
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 15
      });
    }
  };

  const steps = [
    'NFT Details',
    'Location Verification',
    'Confirmation'
  ];

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Pin NFT to Map
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handlePinNFT}
          disabled={!selectedLocation}
        >
          Pin NFT
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select Location
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Click on the map to select where you want to pin your NFT. Make sure you have the right to place NFTs at this location.
        </Typography>
        <Box display="flex" gap={2} mt={2}>
          <Button
            variant="outlined"
            startIcon={<MyLocationIcon />}
            onClick={centerMapOnUser}
          >
            My Location
          </Button>
          <Button
            variant="outlined"
            startIcon={<ZoomInIcon />}
            onClick={() => map?.zoomIn()}
          >
            Zoom In
          </Button>
          <Button
            variant="outlined"
            startIcon={<ZoomOutIcon />}
            onClick={() => map?.zoomOut()}
          >
            Zoom Out
          </Button>
        </Box>
      </Paper>

      <Box sx={{ position: 'relative' }}>
        <Box
          ref={mapContainer}
          sx={{
            height: '600px',
            width: '100%',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid #ddd'
          }}
        />
        
        {selectedLocation && (
          <Paper sx={{ 
            position: 'absolute', 
            top: 16, 
            left: 16, 
            p: 2, 
            minWidth: 250,
            backgroundColor: 'rgba(255, 255, 255, 0.95)'
          }}>
            <Typography variant="h6" gutterBottom>
              Selected Location
            </Typography>
            <Stack spacing={1}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Latitude:</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {selectedLocation.lat.toFixed(6)}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Longitude:</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {selectedLocation.lng.toFixed(6)}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Accuracy:</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {verificationData.location_accuracy}m
                </Typography>
              </Box>
            </Stack>
          </Paper>
        )}
      </Box>

      {/* Pin NFT Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Pin New NFT
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Stepper activeStep={activeStep} orientation="vertical">
              <Step>
                <StepLabel>NFT Details</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Collection</InputLabel>
                      <Select
                        value={pinForm.collection_id}
                        onChange={(e) => setPinForm({ ...pinForm, collection_id: e.target.value })}
                      >
                        {collections.map((collection) => (
                          <MenuItem key={collection.id} value={collection.id}>
                            {collection.name} ({collection.rarity_level})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    <TextField
                      fullWidth
                      label="IPFS Hash"
                      value={pinForm.ipfs_hash}
                      onChange={(e) => setPinForm({ ...pinForm, ipfs_hash: e.target.value })}
                      margin="normal"
                      placeholder="bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi"
                    />
                    
                    <Box display="flex" gap={2}>
                      <TextField
                        fullWidth
                        label="Latitude"
                        value={pinForm.latitude}
                        onChange={(e) => setPinForm({ ...pinForm, latitude: e.target.value })}
                        margin="normal"
                        type="number"
                        step="any"
                      />
                      <TextField
                        fullWidth
                        label="Longitude"
                        value={pinForm.longitude}
                        onChange={(e) => setPinForm({ ...pinForm, longitude: e.target.value })}
                        margin="normal"
                        type="number"
                        step="any"
                      />
                    </Box>
                    
                    <TextField
                      fullWidth
                      label="Collection Radius (meters)"
                      value={pinForm.radius_meters}
                      onChange={(e) => setPinForm({ ...pinForm, radius_meters: e.target.value })}
                      margin="normal"
                      type="number"
                    />
                    
                    <TextField
                      fullWidth
                      label="Smart Contract Address"
                      value={pinForm.smart_contract_address}
                      onChange={(e) => setPinForm({ ...pinForm, smart_contract_address: e.target.value })}
                      margin="normal"
                      placeholder="GTestAddress123456789"
                    />
                  </Box>
                  <Box>
                    <Button onClick={handleNext} variant="contained">
                      Next
                    </Button>
                  </Box>
                </StepContent>
              </Step>
              
              <Step>
                <StepLabel>Location Verification</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Verify your location accuracy and confirm you have permission to place NFTs at this location.
                    </Alert>
                    
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Location Accuracy: {verificationData.location_accuracy}m
                      </Typography>
                      <Slider
                        value={verificationData.location_accuracy}
                        onChange={(e, value) => setVerificationData({ ...verificationData, location_accuracy: value })}
                        min={0}
                        max={100}
                        step={1}
                        marks={[
                          { value: 0, label: '0m' },
                          { value: 25, label: '25m' },
                          { value: 50, label: '50m' },
                          { value: 100, label: '100m' }
                        ]}
                      />
                    </Box>
                    
                    <FormControlLabel
                      control={
                        <Switch
                          checked={verificationData.gps_verification}
                          onChange={(e) => setVerificationData({ ...verificationData, gps_verification: e.target.checked })}
                        />
                      }
                      label="GPS Verification Enabled"
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          checked={verificationData.admin_approval}
                          onChange={(e) => setVerificationData({ ...verificationData, admin_approval: e.target.checked })}
                        />
                      }
                      label="Admin Approval Required"
                    />
                  </Box>
                  <Box>
                    <Button onClick={handleBack} sx={{ mr: 1 }}>
                      Back
                    </Button>
                    <Button onClick={handleNext} variant="contained">
                      Next
                    </Button>
                  </Box>
                </StepContent>
              </Step>
              
              <Step>
                <StepLabel>Confirmation</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Please review all details before pinning the NFT. This action will create a new NFT at the specified location.
                    </Alert>
                    
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        NFT Pin Summary
                      </Typography>
                      <Stack spacing={1}>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Collection:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {collections.find(c => c.id === pinForm.collection_id)?.name}
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Location:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {pinForm.latitude}, {pinForm.longitude}
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Radius:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {pinForm.radius_meters}m
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">IPFS Hash:</Typography>
                          <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                            {pinForm.ipfs_hash.substring(0, 20)}...
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">GPS Verification:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {verificationData.gps_verification ? 'Enabled' : 'Disabled'}
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Admin Approval:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {verificationData.admin_approval ? 'Required' : 'Not Required'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </Box>
                  <Box>
                    <Button onClick={handleBack} sx={{ mr: 1 }}>
                      Back
                    </Button>
                    <Button onClick={handleSubmitPin} variant="contained" color="success">
                      Pin NFT
                    </Button>
                  </Box>
                </StepContent>
              </Step>
            </Stepper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PinNFTMap;
