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
  Card,
  CardContent,
  Chip
} from '@mui/material';
import {
  ViewInAr as View3DIcon,
  ViewModule as ViewModuleIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon,
  Settings as SettingsIcon,
  LocationOn as LocationIcon,
  Star as StarIcon,
  Public as PublicIcon
} from '@mui/icons-material';

const NFT3DMap = () => {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [viewMode, setViewMode] = useState('3d'); // '3d' or '2d'
  const [cameraSettings, setCameraSettings] = useState({
    zoom: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0
  });
  const [displaySettings, setDisplaySettings] = useState({
    showLabels: true,
    showConnections: true,
    showUserLocation: true,
    animationSpeed: 1
  });
  const [filters, setFilters] = useState({
    rarity: 'all',
    showCollected: true,
    showAvailable: true
  });
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    fetchNFTs();
    initialize3DScene();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (nfts.length > 0) {
      render3DScene();
    }
  }, [nfts, cameraSettings, displaySettings, filters]);

  const fetchNFTs = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await api.get('/nft/nearby', {
      //   params: {
      //     latitude: userLocation?.lat,
      //     longitude: userLocation?.lng,
      //     radius: 5000
      //   }
      // });
      // setNfts(response.data.nfts);
      
      // Mock data for now
      setNfts([
        {
          id: 1,
          collection_id: 1,
          latitude: 40.7128,
          longitude: -74.0060,
          radius_meters: 10,
          ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi',
          smart_contract_address: 'GTestAddress123456789',
          is_active: true,
          is_collected: false,
          collection: {
            name: 'Stellar Explorer',
            description: 'Discover the cosmos with Stellar NFTs',
            image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
            rarity_level: 'common'
          }
        },
        {
          id: 2,
          collection_id: 2,
          latitude: 40.7589,
          longitude: -73.9851,
          radius_meters: 5,
          ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi',
          smart_contract_address: 'GTestAddress987654321',
          is_active: true,
          is_collected: true,
          collection: {
            name: 'Galaxy Guardian',
            description: 'Rare NFTs for protecting the galaxy',
            image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
            rarity_level: 'rare'
          }
        },
        {
          id: 3,
          collection_id: 3,
          latitude: 40.7505,
          longitude: -73.9934,
          radius_meters: 3,
          ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi',
          smart_contract_address: 'GTestAddress555666777',
          is_active: true,
          is_collected: false,
          collection: {
            name: 'Cosmic Legend',
            description: 'Legendary NFTs from the depths of space',
            image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
            rarity_level: 'legendary'
          }
        }
      ]);
    } catch (err) {
      setError('Failed to fetch NFTs');
      console.error('Error fetching NFTs:', err);
    } finally {
      setLoading(false);
    }
  };

  const initialize3DScene = () => {
    // This would typically use Three.js or similar 3D library
    // For now, we'll create a mock 3D scene
    console.log('Initializing 3D scene...');
  };

  const render3DScene = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Draw 3D-like representation
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    
    // Draw NFT markers in 3D space
    nfts.forEach((nft, index) => {
      const x = (nft.longitude + 180) / 360 * canvas.width;
      const y = (90 - nft.latitude) / 180 * canvas.height;
      const z = Math.sin(Date.now() * 0.001 + index) * 50; // Animated Z position
      
      // Project 3D to 2D
      const scale = 1 + z / 100;
      const projectedX = x * scale;
      const projectedY = y * scale;
      
      // Draw NFT marker
      const radius = getRaritySize(nft.collection.rarity_level) * scale;
      const color = getRarityColor(nft.collection.rarity_level);
      
      ctx.beginPath();
      ctx.arc(projectedX, projectedY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      
      // Draw border
      ctx.strokeStyle = nft.is_collected ? '#4caf50' : '#ff9800';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label if enabled
      if (displaySettings.showLabels) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(nft.collection.name, projectedX, projectedY - radius - 10);
      }
    });
    
    // Continue animation
    animationRef.current = requestAnimationFrame(render3DScene);
  };

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'legendary': return '#ff6b35';
      case 'rare': return '#4ecdc4';
      case 'common': return '#45b7d1';
      default: return '#95a5a6';
    }
  };

  const getRaritySize = (rarity) => {
    switch (rarity) {
      case 'legendary': return 20;
      case 'rare': return 15;
      case 'common': return 10;
      default: return 8;
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

  const handleNFTClick = (nft) => {
    setSelectedNFT(nft);
    setOpenDialog(true);
  };

  const handleCameraControl = (axis, delta) => {
    setCameraSettings(prev => ({
      ...prev,
      [axis]: prev[axis] + delta
    }));
  };

  const handleZoom = (delta) => {
    setCameraSettings(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom + delta))
    }));
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
          3D NFT Map
        </Typography>
        <Box>
          <Button
            variant={viewMode === '3d' ? 'contained' : 'outlined'}
            startIcon={<View3DIcon />}
            onClick={() => setViewMode('3d')}
            sx={{ mr: 1 }}
          >
            3D View
          </Button>
          <Button
            variant={viewMode === '2d' ? 'contained' : 'outlined'}
            startIcon={<ViewModuleIcon />}
            onClick={() => setViewMode('2d')}
          >
            2D View
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                3D Visualization
              </Typography>
              <Box>
                <IconButton onClick={() => handleCameraControl('rotationY', -10)}>
                  <RotateLeftIcon />
                </IconButton>
                <IconButton onClick={() => handleCameraControl('rotationY', 10)}>
                  <RotateRightIcon />
                </IconButton>
                <IconButton onClick={() => handleZoom(0.1)}>
                  <ZoomInIcon />
                </IconButton>
                <IconButton onClick={() => handleZoom(-0.1)}>
                  <ZoomOutIcon />
                </IconButton>
                <IconButton>
                  <FullscreenIcon />
                </IconButton>
              </Box>
            </Box>
            
            <Box
              sx={{
                height: '500px',
                width: '100%',
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid #ddd',
                backgroundColor: '#1a1a1a',
                position: 'relative'
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  cursor: 'grab'
                }}
                onClick={(e) => {
                  // Handle NFT selection
                  const rect = canvasRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  
                  // Find clicked NFT
                  const clickedNFT = nfts.find(nft => {
                    const nftX = (nft.longitude + 180) / 360 * canvasRef.current.width;
                    const nftY = (90 - nft.latitude) / 180 * canvasRef.current.height;
                    const distance = Math.sqrt((x - nftX) ** 2 + (y - nftY) ** 2);
                    return distance < getRaritySize(nft.collection.rarity_level);
                  });
                  
                  if (clickedNFT) {
                    handleNFTClick(clickedNFT);
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Stack spacing={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Camera Controls
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Zoom: {cameraSettings.zoom.toFixed(1)}x
                  </Typography>
                  <Slider
                    value={cameraSettings.zoom}
                    onChange={(e, value) => setCameraSettings(prev => ({ ...prev, zoom: value }))}
                    min={0.1}
                    max={5}
                    step={0.1}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Rotation X: {cameraSettings.rotationX}°
                  </Typography>
                  <Slider
                    value={cameraSettings.rotationX}
                    onChange={(e, value) => setCameraSettings(prev => ({ ...prev, rotationX: value }))}
                    min={-180}
                    max={180}
                    step={5}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Rotation Y: {cameraSettings.rotationY}°
                  </Typography>
                  <Slider
                    value={cameraSettings.rotationY}
                    onChange={(e, value) => setCameraSettings(prev => ({ ...prev, rotationY: value }))}
                    min={-180}
                    max={180}
                    step={5}
                  />
                </Box>
              </Stack>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Display Settings
              </Typography>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={displaySettings.showLabels}
                      onChange={(e) => setDisplaySettings(prev => ({ ...prev, showLabels: e.target.checked }))}
                    />
                  }
                  label="Show Labels"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={displaySettings.showConnections}
                      onChange={(e) => setDisplaySettings(prev => ({ ...prev, showConnections: e.target.checked }))}
                    />
                  }
                  label="Show Connections"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={displaySettings.showUserLocation}
                      onChange={(e) => setDisplaySettings(prev => ({ ...prev, showUserLocation: e.target.checked }))}
                    />
                  }
                  label="Show User Location"
                />
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Animation Speed: {displaySettings.animationSpeed}x
                  </Typography>
                  <Slider
                    value={displaySettings.animationSpeed}
                    onChange={(e, value) => setDisplaySettings(prev => ({ ...prev, animationSpeed: value }))}
                    min={0}
                    max={3}
                    step={0.1}
                  />
                </Box>
              </Stack>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Filters
              </Typography>
              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Rarity</InputLabel>
                  <Select
                    value={filters.rarity}
                    onChange={(e) => setFilters(prev => ({ ...prev, rarity: e.target.value }))}
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
                      onChange={(e) => setFilters(prev => ({ ...prev, showAvailable: e.target.checked }))}
                    />
                  }
                  label="Show Available"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={filters.showCollected}
                      onChange={(e) => setFilters(prev => ({ ...prev, showCollected: e.target.checked }))}
                    />
                  }
                  label="Show Collected"
                />
              </Stack>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                NFT Summary
              </Typography>
              <Stack spacing={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Total NFTs:</Typography>
                  <Typography variant="body2" fontWeight="bold">{nfts.length}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Available:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {nfts.filter(nft => !nft.is_collected).length}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Collected:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {nfts.filter(nft => nft.is_collected).length}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Common:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {nfts.filter(nft => nft.collection.rarity_level === 'common').length}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Rare:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {nfts.filter(nft => nft.collection.rarity_level === 'rare').length}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Legendary:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {nfts.filter(nft => nft.collection.rarity_level === 'legendary').length}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

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
          <Button variant="contained">
            View in 3D
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFT3DMap;
