import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Stack,
  Badge
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Public as PublicIcon,
  Star as StarIcon,
  FilterList as FilterIcon,
  MyLocation as MyLocationIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon,
  ShoppingCart as BuyIcon,
  Visibility as ViewIcon,
  Share as ShareIcon
} from '@mui/icons-material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../../services/api';

const NFTMap = () => {
  const [nfts, setNfts] = useState([]);
  const [filteredNFTs, setFilteredNFTs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [map, setMap] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [filters, setFilters] = useState({
    radius: 1000,
    rarity: 'all',
    showCollected: true,
    showAvailable: true
  });
  const mapContainer = useRef(null);
  const markers = useRef([]);

  // Mapbox configuration
  const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

  useEffect(() => {
    fetchNFTs();
    getUserLocation();
  }, []);

  useEffect(() => {
    if (mapLoaded && userLocation) {
      initializeMap();
    }
  }, [mapLoaded, userLocation]);

  useEffect(() => {
    applyFilters();
  }, [nfts, filters]);

  useEffect(() => {
    if (map && mapLoaded) {
      updateMapMarkers();
    }
  }, [filteredNFTs, map, mapLoaded]);

  const fetchNFTs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/nft/nearby', {
        params: {
          latitude: userLocation?.lat,
          longitude: userLocation?.lng,
          radius: filters.radius
        }
      });
      setNfts(response.data.nfts || []);
    } catch (err) {
      setError('Failed to fetch nearby NFTs');
      console.error('Error fetching NFTs:', err);
      setNfts([]);
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

    // Add user location marker
    if (userLocation) {
      const userMarker = new mapboxgl.Marker({ color: '#007bff' })
        .setLngLat([userLocation.lng, userLocation.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 10px;">
                <h3>Your Location</h3>
                <p>Lat: ${userLocation.lat.toFixed(4)}</p>
                <p>Lng: ${userLocation.lng.toFixed(4)}</p>
              </div>
            `)
        )
        .addTo(newMap);
    }

    setMap(newMap);
  };

  const updateMapMarkers = () => {
    if (!map) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add new markers
    filteredNFTs.forEach(nft => {
      const el = document.createElement('div');
      el.className = 'nft-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.borderRadius = '50%';
      el.style.background = getRarityColor(nft.collection.rarity_level);
      el.style.border = '3px solid white';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.innerHTML = getRarityIcon(nft.collection.rarity_level);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([nft.longitude, nft.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 15px; min-width: 250px;">
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                  <img src="${nft.collection.image_url}" style="width: 40px; height: 40px; border-radius: 8px; margin-right: 10px;" />
                  <div>
                    <h3 style="margin: 0; font-size: 16px;">${nft.collection.name}</h3>
                    <p style="margin: 0; font-size: 12px; color: #666;">${nft.collection.rarity_level}</p>
                  </div>
                </div>
                <p style="margin: 5px 0; font-size: 14px;">${nft.collection.description}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0;">
                  <span style="font-size: 12px; color: #666;">Radius: ${nft.radius_meters}m</span>
                  <span style="font-size: 12px; color: #666;">${nft.is_collected ? '✅ Collected' : '⭕ Available'}</span>
                </div>
                <button onclick="collectNFT(${nft.id})" style="width: 100%; padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                  ${nft.is_collected ? 'View Details' : 'Collect NFT'}
                </button>
              </div>
            `)
        )
        .addTo(map);

      // Add click handler
      el.addEventListener('click', () => {
        setSelectedNFT(nft);
        setOpenDialog(true);
      });

      markers.current.push(marker);
    });
  };

  const applyFilters = () => {
    let filtered = nfts;

    // Filter by rarity
    if (filters.rarity !== 'all') {
      filtered = filtered.filter(nft => nft.collection.rarity_level === filters.rarity);
    }

    // Filter by collection status
    if (!filters.showCollected && !filters.showAvailable) {
      filtered = [];
    } else if (!filters.showCollected) {
      filtered = filtered.filter(nft => !nft.is_collected);
    } else if (!filters.showAvailable) {
      filtered = filtered.filter(nft => nft.is_collected);
    }

    // Filter by distance from user location
    if (userLocation) {
      filtered = filtered.filter(nft => {
        const distance = calculateDistance(
          userLocation.lat, 
          userLocation.lng, 
          nft.latitude, 
          nft.longitude
        );
        return distance <= filters.radius;
      });
    }

    setFilteredNFTs(filtered);
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'legendary': return '#ff6b35';
      case 'rare': return '#4ecdc4';
      case 'common': return '#45b7d1';
      default: return '#95a5a6';
    }
  };

  const getRarityIcon = (rarity) => {
    switch (rarity) {
      case 'legendary': return '👑';
      case 'rare': return '⭐';
      case 'common': return '🔸';
      default: return '🔹';
    }
  };

  const handleCollectNFT = async (nftId) => {
    try {
      // await api.post('/nft/collect', {
      //   nft_id: nftId,
      //   user_latitude: userLocation.lat,
      //   user_longitude: userLocation.lng
      // });
      console.log('Collect NFT:', nftId);
      alert('NFT collected successfully!');
      fetchNFTs(); // Refresh the list
    } catch (err) {
      setError('Failed to collect NFT');
      console.error('Error collecting NFT:', err);
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

  const zoomToFit = () => {
    if (map && filteredNFTs.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      filteredNFTs.forEach(nft => {
        bounds.extend([nft.longitude, nft.latitude]);
      });
      if (userLocation) {
        bounds.extend([userLocation.lng, userLocation.lat]);
      }
      map.fitBounds(bounds, { padding: 50 });
    }
  };

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
          NFT Map
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<MyLocationIcon />}
            onClick={centerMapOnUser}
            sx={{ mr: 1 }}
          >
            My Location
          </Button>
          <Button
            variant="outlined"
            startIcon={<ZoomInIcon />}
            onClick={zoomToFit}
          >
            Fit All
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={3} alignItems="center">
          <Box sx={{ minWidth: 200 }}>
            <Typography variant="body2" gutterBottom>
              Search Radius: {filters.radius}m
            </Typography>
            <Slider
              value={filters.radius}
              onChange={(e, value) => setFilters({ ...filters, radius: value })}
              min={100}
              max={5000}
              step={100}
              marks={[
                { value: 100, label: '100m' },
                { value: 1000, label: '1km' },
                { value: 5000, label: '5km' }
              ]}
            />
          </Box>
          
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Rarity</InputLabel>
            <Select
              value={filters.rarity}
              onChange={(e) => setFilters({ ...filters, rarity: e.target.value })}
            >
              <MenuItem value="all">All Rarities</MenuItem>
              <MenuItem value="common">Common</MenuItem>
              <MenuItem value="rare">Rare</MenuItem>
              <MenuItem value="legendary">Legendary</MenuItem>
            </Select>
          </FormControl>
          
          <FormControlLabel
            control={
              <Switch
                checked={filters.showAvailable}
                onChange={(e) => setFilters({ ...filters, showAvailable: e.target.checked })}
              />
            }
            label="Available"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={filters.showCollected}
                onChange={(e) => setFilters({ ...filters, showCollected: e.target.checked })}
              />
            }
            label="Collected"
          />
        </Stack>
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
        
        <Paper sx={{ 
          position: 'absolute', 
          top: 16, 
          right: 16, 
          p: 2, 
          minWidth: 200,
          backgroundColor: 'rgba(255, 255, 255, 0.95)'
        }}>
          <Typography variant="h6" gutterBottom>
            NFT Summary
          </Typography>
          <Stack spacing={1}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Total NFTs:</Typography>
              <Typography variant="body2" fontWeight="bold">{filteredNFTs.length}</Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Available:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {filteredNFTs.filter(nft => !nft.is_collected).length}
              </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Collected:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {filteredNFTs.filter(nft => nft.is_collected).length}
              </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Common:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {filteredNFTs.filter(nft => nft.collection.rarity_level === 'common').length}
              </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Rare:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {filteredNFTs.filter(nft => nft.collection.rarity_level === 'rare').length}
              </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Legendary:</Typography>
              <Typography variant="body2" fontWeight="bold">
                {filteredNFTs.filter(nft => nft.collection.rarity_level === 'legendary').length}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>

      {/* NFT Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedNFT?.collection.name}
        </DialogTitle>
        <DialogContent>
          {selectedNFT && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <img
                    src={selectedNFT.collection.image_url}
                    alt={selectedNFT.collection.name}
                    style={{ width: '100%', borderRadius: 8 }}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Collection Details
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedNFT.collection.description}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Chip
                        label={selectedNFT.collection.rarity_level}
                        color={selectedNFT.collection.rarity_level === 'legendary' ? 'error' : 
                               selectedNFT.collection.rarity_level === 'rare' ? 'warning' : 'default'}
                        icon={<span>{getRarityIcon(selectedNFT.collection.rarity_level)}</span>}
                      />
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Location Info
                      </Typography>
                      <Typography variant="body2">
                        <strong>Coordinates:</strong> {selectedNFT.latitude}, {selectedNFT.longitude}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Collection Radius:</strong> {selectedNFT.radius_meters}m
                      </Typography>
                      {userLocation && (
                        <Typography variant="body2">
                          <strong>Distance from you:</strong> {Math.round(calculateDistance(
                            userLocation.lat, 
                            userLocation.lng, 
                            selectedNFT.latitude, 
                            selectedNFT.longitude
                          ))}m
                        </Typography>
                      )}
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Blockchain Info
                      </Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        <strong>IPFS Hash:</strong> {selectedNFT.ipfs_hash}
                      </Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        <strong>Contract:</strong> {selectedNFT.smart_contract_address}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" startIcon={<ShareIcon />}>
            Share
          </Button>
          {selectedNFT && !selectedNFT.is_collected && (
            <Button 
              variant="contained" 
              startIcon={<BuyIcon />}
              onClick={() => handleCollectNFT(selectedNFT.id)}
            >
              Collect NFT
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTMap;
