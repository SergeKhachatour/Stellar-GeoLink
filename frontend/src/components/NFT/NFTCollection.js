import React, { useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
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
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Tooltip,
  Badge,
  CardMedia,
  Stack
} from '@mui/material';
import api from '../../services/api';
import {
  Visibility as ViewIcon,
  MonetizationOn as PriceIcon,
  Share as ShareIcon,
  Star as StarIcon,
  Public as PublicIcon,
  LocationOn as LocationIcon,
  ShoppingCart as BuyIcon,
  TransferWithinAStation as TransferIcon,
  Sell as SellIcon,
  FilterList as FilterIcon,
  Search as SearchIcon
} from '@mui/icons-material';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
mapboxgl.accessToken = MAPBOX_TOKEN;

const NFTCollection = () => {
  const [userNFTs, setUserNFTs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [miniMap, setMiniMap] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRarity, setFilterRarity] = useState('all');
  const [transferData, setTransferData] = useState({
    to_user: '',
    price: '',
    message: ''
  });

  useEffect(() => {
    fetchUserCollection();
  }, []);

  // Initialize mini map when NFT details dialog opens
  useEffect(() => {
    if (openDialog && selectedNFT) {
      const initializeMiniMap = () => {
        const mapContainer = document.getElementById('nft-collection-mini-map');
        if (mapContainer && !miniMap) {
          // Clear any existing map first
          if (miniMap && typeof miniMap.remove === 'function') {
            try {
              miniMap.remove();
            } catch (error) {
              console.warn('Error removing existing mini map:', error);
            }
          }
          const miniMapInstance = new mapboxgl.Map({
            container: 'nft-collection-mini-map',
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [parseFloat(selectedNFT.nft.longitude), parseFloat(selectedNFT.nft.latitude)],
            zoom: 15,
            interactive: true
          });

          // Add marker for NFT location
          new mapboxgl.Marker({ color: 'red' })
            .setLngLat([parseFloat(selectedNFT.nft.longitude), parseFloat(selectedNFT.nft.latitude)])
            .addTo(miniMapInstance);

          // Add circle for collection radius
          miniMapInstance.on('load', () => {
            miniMapInstance.addSource('nft-radius', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [parseFloat(selectedNFT.nft.longitude), parseFloat(selectedNFT.nft.latitude)]
                }
              }
            });

            miniMapInstance.addLayer({
              id: 'nft-radius-circle',
              type: 'circle',
              source: 'nft-radius',
              paint: {
                'circle-radius': {
                  stops: [
                    [0, 0],
                    [20, selectedNFT.nft.radius_meters || 50]
                  ],
                  base: 2
                },
                'circle-color': '#ff0000',
                'circle-opacity': 0.2,
                'circle-stroke-color': '#ff0000',
                'circle-stroke-width': 2
              }
            });
          });

          setMiniMap(miniMapInstance);
        }
      };

      // Small delay to ensure DOM is ready
      setTimeout(initializeMiniMap, 100);
    }

    // Cleanup mini map when dialog closes
    return () => {
      if (miniMap && typeof miniMap.remove === 'function') {
        try {
          miniMap.remove();
        } catch (error) {
          console.warn('Error removing mini map:', error);
        }
        setMiniMap(null);
      }
    };
  }, [openDialog, selectedNFT]);

  const fetchUserCollection = async () => {
    try {
      setLoading(true);
      const response = await api.get('/nft/user-collection');
      setUserNFTs(response.data.collection || []);
    } catch (err) {
      setError('Failed to fetch NFT collection');
      console.error('Error fetching collection:', err);
      setUserNFTs([]);
    } finally {
      setLoading(false);
    }
  };

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'legendary': return 'error';
      case 'rare': return 'warning';
      case 'common': return 'default';
      default: return 'default';
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

  const handleViewNFT = (nft) => {
    setSelectedNFT(nft);
    setOpenDialog(true);
  };

  const handleTransferNFT = async () => {
    try {
      // await api.post('/nft/transfer', {
      //   nft_id: selectedNFT.nft_id,
      //   to_user: transferData.to_user,
      //   price: transferData.price,
      //   message: transferData.message
      // });
      console.log('Transfer NFT:', selectedNFT.nft_id, transferData);
      alert('NFT transfer initiated successfully!');
      setOpenDialog(false);
      fetchUserCollection();
    } catch (err) {
      setError('Failed to transfer NFT');
      console.error('Error transferring NFT:', err);
    }
  };

  const handleSellNFT = async (nft) => {
    try {
      // await api.post('/nft/sell', {
      //   nft_id: nft.nft_id,
      //   price: prompt('Enter sale price (XLM):')
      // });
      console.log('Sell NFT:', nft.nft_id);
      alert('NFT listed for sale successfully!');
      fetchUserCollection();
    } catch (err) {
      setError('Failed to list NFT for sale');
      console.error('Error selling NFT:', err);
    }
  };

  const filteredNFTs = userNFTs.filter(nft => {
    const matchesSearch = nft.nft.collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         nft.nft.collection.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRarity = filterRarity === 'all' || nft.nft.collection.rarity_level === filterRarity;
    return matchesSearch && matchesRarity;
  });

  const groupedNFTs = {
    all: filteredNFTs,
    common: filteredNFTs.filter(nft => nft.nft.collection.rarity_level === 'common'),
    rare: filteredNFTs.filter(nft => nft.nft.collection.rarity_level === 'rare'),
    legendary: filteredNFTs.filter(nft => nft.nft.collection.rarity_level === 'legendary')
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
          My NFT Collection
        </Typography>
        <Box display="flex" gap={2}>
          <TextField
            size="small"
            placeholder="Search NFTs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
          <TextField
            size="small"
            select
            size="small"
            value={filterRarity}
            onChange={(e) => setFilterRarity(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <option value="all">All Rarities</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="legendary">Legendary</option>
          </TextField>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label={`All (${groupedNFTs.all.length})`} />
          <Tab label={`Common (${groupedNFTs.common.length})`} />
          <Tab label={`Rare (${groupedNFTs.rare.length})`} />
          <Tab label={`Legendary (${groupedNFTs.legendary.length})`} />
        </Tabs>
      </Paper>

      {groupedNFTs.all.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No NFTs in your collection yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Start exploring locations to collect your first NFT!
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {groupedNFTs.all.map((userNFT) => (
            <Grid item xs={12} sm={6} md={4} key={userNFT.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardMedia
                  component="img"
                  height="200"
                  image={userNFT.nft.collection.image_url}
                  alt={userNFT.nft.collection.name}
                  sx={{ objectFit: 'cover' }}
                />
                
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6" component="h2" noWrap>
                      {userNFT.nft.collection.name}
                    </Typography>
                    <Chip
                      label={userNFT.nft.collection.rarity_level}
                      color={getRarityColor(userNFT.nft.collection.rarity_level)}
                      size="small"
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {userNFT.nft.collection.description}
                  </Typography>
                  
                  <Stack spacing={1}>
                    <Box display="flex" alignItems="center">
                      <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                      <Typography variant="body2">
                        Collected: {new Date(userNFT.collected_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    
                    <Box display="flex" alignItems="center">
                      <PublicIcon sx={{ mr: 1, fontSize: 16 }} />
                      <Typography variant="body2">
                        Transfers: {userNFT.transfer_count}
                      </Typography>
                    </Box>
                    
                    <Box display="flex" alignItems="center">
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        IPFS: {userNFT.nft.ipfs_hash.substring(0, 20)}...
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
                
                <CardActions sx={{ justifyContent: 'space-between', p: 2 }}>
                  <Button
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() => handleViewNFT(userNFT)}
                  >
                    View
                  </Button>
                  
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleSellNFT(userNFT)}
                      title="Sell NFT"
                    >
                      <SellIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelectedNFT(userNFT);
                        setTransferData({ to_user: '', price: '', message: '' });
                        setOpenDialog(true);
                      }}
                      title="Transfer NFT"
                    >
                      <TransferIcon />
                    </IconButton>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* NFT Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedNFT?.nft.collection.name}
        </DialogTitle>
        <DialogContent>
          {selectedNFT && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <img
                    src={selectedNFT.nft.collection.image_url}
                    alt={selectedNFT.nft.collection.name}
                    style={{ width: '100%', borderRadius: 8 }}
                  />
                  
                  {/* Mini Map for NFT Location */}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      NFT Location
                    </Typography>
                    <Box 
                      id="nft-collection-mini-map"
                      sx={{ 
                        height: '200px', 
                        width: '100%', 
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0',
                        overflow: 'hidden'
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Collection Details
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedNFT.nft.collection.description}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Rarity & Stats
                      </Typography>
                      <Chip
                        label={selectedNFT.nft.collection.rarity_level}
                        color={getRarityColor(selectedNFT.nft.collection.rarity_level)}
                        icon={<span>{getRarityIcon(selectedNFT.nft.collection.rarity_level)}</span>}
                      />
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Location Info
                      </Typography>
                      <Typography variant="body2">
                        <strong>Coordinates:</strong> {selectedNFT.nft.latitude}, {selectedNFT.nft.longitude}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Collection Radius:</strong> {selectedNFT.nft.radius_meters}m
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Ownership History
                      </Typography>
                      <Typography variant="body2">
                        <strong>Collected:</strong> {new Date(selectedNFT.collected_at).toLocaleString()}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Transfer Count:</strong> {selectedNFT.transfer_count}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Current Owner:</strong> {selectedNFT.current_owner}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Blockchain Info
                      </Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        <strong>IPFS Hash:</strong> {selectedNFT.nft.ipfs_hash}
                      </Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        <strong>Contract:</strong> {selectedNFT.nft.smart_contract_address}
                      </Typography>
                      {selectedNFT.blockchain_transaction_hash && (
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                          <strong>Transaction Hash:</strong> {selectedNFT.blockchain_transaction_hash}
                        </Typography>
                      )}
                      {selectedNFT.blockchain_ledger && (
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                          <strong>Ledger:</strong> {selectedNFT.blockchain_ledger}
                        </Typography>
                      )}
                      {selectedNFT.blockchain_network && (
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                          <strong>Network:</strong> {selectedNFT.blockchain_network}
                        </Typography>
                      )}
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
        </DialogActions>
      </Dialog>

      {/* Transfer NFT Dialog */}
      <Dialog open={openDialog && transferData.to_user !== undefined} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Transfer NFT
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Recipient Public Key"
              value={transferData.to_user}
              onChange={(e) => setTransferData({ ...transferData, to_user: e.target.value })}
              margin="normal"
              placeholder="GRecipientAddress123456789"
            />
            
            <TextField
              fullWidth
              label="Transfer Price (XLM)"
              value={transferData.price}
              onChange={(e) => setTransferData({ ...transferData, price: e.target.value })}
              margin="normal"
              type="number"
              placeholder="0.00"
            />
            
            <TextField
              fullWidth
              label="Message (Optional)"
              value={transferData.message}
              onChange={(e) => setTransferData({ ...transferData, message: e.target.value })}
              margin="normal"
              multiline
              rows={3}
              placeholder="Add a personal message..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleTransferNFT} variant="contained">
            Transfer NFT
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTCollection;
