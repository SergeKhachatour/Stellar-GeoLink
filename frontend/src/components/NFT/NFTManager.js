import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  LocationOn as LocationIcon,
  Public as PublicIcon,
  MonetizationOn as PriceIcon,
  Star as StarIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  Security as SecurityIcon
} from '@mui/icons-material';
import api from '../../services/api';

const NFTManager = () => {
  const [collections, setCollections] = useState([]);
  const [pinnedNFTs, setPinnedNFTs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    description: '',
    image_url: '',
    rarity_level: 'common',
    collection_requirements: {}
  });
  const [nftForm, setNftForm] = useState({
    collection_id: '',
    ipfs_hash: '',
    latitude: '',
    longitude: '',
    radius_meters: 10,
    rarity_requirements: {},
    smart_contract_address: '',
    is_active: true
  });

  useEffect(() => {
    fetchCollections();
    fetchPinnedNFTs();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const response = await api.get('/nft/collections');
      setCollections(response.data || []);
    } catch (err) {
      setError('Failed to fetch NFT collections');
      console.error('Error fetching collections:', err);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPinnedNFTs = async () => {
    try {
      const response = await api.get('/nft/pinned');
      setPinnedNFTs(response.data || []);
    } catch (err) {
      setError('Failed to fetch pinned NFTs');
      console.error('Error fetching pinned NFTs:', err);
      setPinnedNFTs([]);
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

  const handleCreateCollection = () => {
    setSelectedCollection(null);
    setCollectionForm({
      name: '',
      description: '',
      image_url: '',
      rarity_level: 'common',
      collection_requirements: {}
    });
    setOpenDialog(true);
  };

  const handleEditCollection = (collection) => {
    setSelectedCollection(collection);
    setCollectionForm({
      name: collection.name,
      description: collection.description,
      image_url: collection.image_url,
      rarity_level: collection.rarity_level,
      collection_requirements: collection.collection_requirements || {}
    });
    setOpenDialog(true);
  };

  const handleCreateNFT = () => {
    setSelectedNFT(null);
    setNftForm({
      collection_id: '',
      ipfs_hash: '',
      latitude: '',
      longitude: '',
      radius_meters: 10,
      rarity_requirements: {},
      smart_contract_address: '',
      is_active: true
    });
    setOpenDialog(true);
  };

  const handleEditNFT = (nft) => {
    setSelectedNFT(nft);
    setNftForm({
      collection_id: nft.collection_id,
      ipfs_hash: nft.ipfs_hash,
      latitude: nft.latitude,
      longitude: nft.longitude,
      radius_meters: nft.radius_meters,
      rarity_requirements: nft.rarity_requirements || {},
      smart_contract_address: nft.smart_contract_address,
      is_active: nft.is_active
    });
    setOpenDialog(true);
  };

  const handleSaveCollection = async () => {
    try {
      if (selectedCollection) {
        // Update existing collection
        // await api.put(`/nft/collections/${selectedCollection.id}`, collectionForm);
        console.log('Update collection:', collectionForm);
      } else {
        // Create new collection
        // await api.post('/nft/collections', collectionForm);
        console.log('Create collection:', collectionForm);
      }
      setOpenDialog(false);
      fetchCollections();
    } catch (err) {
      setError('Failed to save collection');
      console.error('Error saving collection:', err);
    }
  };

  const handleSaveNFT = async () => {
    try {
      if (selectedNFT) {
        // Update existing NFT
        // await api.put(`/nft/pinned/${selectedNFT.id}`, nftForm);
        console.log('Update NFT:', nftForm);
      } else {
        // Create new NFT
        // await api.post('/nft/pin', nftForm);
        console.log('Create NFT:', nftForm);
      }
      setOpenDialog(false);
      fetchPinnedNFTs();
    } catch (err) {
      setError('Failed to save NFT');
      console.error('Error saving NFT:', err);
    }
  };

  const handleDeleteCollection = async (collectionId) => {
    if (window.confirm('Are you sure you want to delete this collection? This will also delete all associated NFTs.')) {
      try {
        // await api.delete(`/nft/collections/${collectionId}`);
        console.log('Delete collection:', collectionId);
        fetchCollections();
      } catch (err) {
        setError('Failed to delete collection');
        console.error('Error deleting collection:', err);
      }
    }
  };

  const handleDeleteNFT = async (nftId) => {
    if (window.confirm('Are you sure you want to delete this NFT?')) {
      try {
        // await api.delete(`/nft/pinned/${nftId}`);
        console.log('Delete NFT:', nftId);
        fetchPinnedNFTs();
      } catch (err) {
        setError('Failed to delete NFT');
        console.error('Error deleting NFT:', err);
      }
    }
  };

  const handleToggleNFTStatus = async (nftId, isActive) => {
    try {
      // await api.patch(`/nft/pinned/${nftId}`, { is_active: !isActive });
      console.log('Toggle NFT status:', nftId, !isActive);
      fetchPinnedNFTs();
    } catch (err) {
      setError('Failed to update NFT status');
      console.error('Error updating NFT status:', err);
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
          NFT Manager
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleCreateCollection}
            sx={{ mr: 2 }}
          >
            New Collection
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateNFT}
          >
            Pin New NFT
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label={`Collections (${collections.length})`} />
          <Tab label={`Pinned NFTs (${pinnedNFTs.length})`} />
          <Tab label="Analytics" />
          <Tab label="Settings" />
        </Tabs>
      </Paper>

      {activeTab === 0 && (
        <Grid container spacing={3}>
          {collections.map((collection) => (
            <Grid item xs={12} sm={6} md={4} key={collection.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6" component="h2">
                      {collection.name}
                    </Typography>
                    <Chip
                      label={collection.rarity_level}
                      color={getRarityColor(collection.rarity_level)}
                      size="small"
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {collection.description}
                  </Typography>
                  
                  <Box display="flex" alignItems="center" mb={1}>
                    <PublicIcon sx={{ mr: 1, fontSize: 16 }} />
                    <Typography variant="body2">
                      Min Distance: {collection.collection_requirements.min_distance}m
                    </Typography>
                  </Box>
                  
                  <Box display="flex" alignItems="center" mb={1}>
                    <StarIcon sx={{ mr: 1, fontSize: 16 }} />
                    <Typography variant="body2">
                      Max per User: {collection.collection_requirements.max_per_user}
                    </Typography>
                  </Box>
                  
                  {collection.collection_requirements.time_restrictions && (
                    <Box display="flex" alignItems="center" mb={2}>
                      <Typography variant="body2" color="warning.main">
                        Time Restrictions: {collection.collection_requirements.time_restrictions}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
                
                <CardActions>
                  <IconButton size="small" onClick={() => handleEditCollection(collection)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small">
                    <ViewIcon />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDeleteCollection(collection.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {activeTab === 1 && (
        <Grid container spacing={3}>
          {pinnedNFTs.map((nft) => (
            <Grid item xs={12} sm={6} md={4} key={nft.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6" component="h2">
                      {nft.collection.name}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={nft.collection.rarity_level}
                        color={getRarityColor(nft.collection.rarity_level)}
                        size="small"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={nft.is_active}
                            onChange={() => handleToggleNFTStatus(nft.id, nft.is_active)}
                            size="small"
                          />
                        }
                        label="Active"
                      />
                    </Box>
                  </Box>
                  
                  <Box display="flex" alignItems="center" mb={1}>
                    <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                    <Typography variant="body2">
                      {nft.latitude.toFixed(4)}, {nft.longitude.toFixed(4)}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" alignItems="center" mb={1}>
                    <PublicIcon sx={{ mr: 1, fontSize: 16 }} />
                    <Typography variant="body2">
                      Radius: {nft.radius_meters}m
                    </Typography>
                  </Box>
                  
                  <Box display="flex" alignItems="center" mb={2}>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      IPFS: {nft.ipfs_hash.substring(0, 20)}...
                    </Typography>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary">
                    Pinned: {new Date(nft.pinned_at).toLocaleDateString()}
                  </Typography>
                </CardContent>
                
                <CardActions>
                  <IconButton size="small" onClick={() => handleEditNFT(nft)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small">
                    <ViewIcon />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDeleteNFT(nft.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {activeTab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            NFT Analytics
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h4" color="primary">
                    {collections.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Collections
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h4" color="secondary">
                    {pinnedNFTs.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pinned NFTs
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h4" color="success.main">
                    {pinnedNFTs.filter(nft => nft.is_active).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active NFTs
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h4" color="warning.main">
                    {pinnedNFTs.filter(nft => !nft.is_active).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Inactive NFTs
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      )}

      {activeTab === 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            NFT System Settings
          </Typography>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Collection Requirements</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">
                Configure global collection requirements and restrictions.
              </Typography>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Location Verification</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">
                Set up location verification accuracy and tolerance settings.
              </Typography>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Blockchain Integration</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">
                Configure Stellar blockchain integration for NFT transfers and sales.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Paper>
      )}

      {/* Create/Edit Collection Dialog */}
      <Dialog open={openDialog && selectedCollection !== undefined} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCollection ? 'Edit Collection' : 'Create New Collection'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Collection Name"
              value={collectionForm.name}
              onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
              margin="normal"
            />
            
            <TextField
              fullWidth
              label="Description"
              value={collectionForm.description}
              onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
              margin="normal"
              multiline
              rows={3}
            />
            
            <TextField
              fullWidth
              label="Image URL"
              value={collectionForm.image_url}
              onChange={(e) => setCollectionForm({ ...collectionForm, image_url: e.target.value })}
              margin="normal"
              placeholder="https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/..."
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel>Rarity Level</InputLabel>
              <Select
                value={collectionForm.rarity_level}
                onChange={(e) => setCollectionForm({ ...collectionForm, rarity_level: e.target.value })}
              >
                <MenuItem value="common">Common</MenuItem>
                <MenuItem value="rare">Rare</MenuItem>
                <MenuItem value="legendary">Legendary</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              label="Minimum Distance (meters)"
              value={collectionForm.collection_requirements.min_distance || ''}
              onChange={(e) => setCollectionForm({ 
                ...collectionForm, 
                collection_requirements: { 
                  ...collectionForm.collection_requirements, 
                  min_distance: e.target.value 
                } 
              })}
              margin="normal"
              type="number"
            />
            
            <TextField
              fullWidth
              label="Maximum per User"
              value={collectionForm.collection_requirements.max_per_user || ''}
              onChange={(e) => setCollectionForm({ 
                ...collectionForm, 
                collection_requirements: { 
                  ...collectionForm.collection_requirements, 
                  max_per_user: e.target.value 
                } 
              })}
              margin="normal"
              type="number"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveCollection} variant="contained">
            {selectedCollection ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit NFT Dialog */}
      <Dialog open={openDialog && selectedNFT !== undefined} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedNFT ? 'Edit NFT' : 'Pin New NFT'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Collection</InputLabel>
              <Select
                value={nftForm.collection_id}
                onChange={(e) => setNftForm({ ...nftForm, collection_id: e.target.value })}
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
              value={nftForm.ipfs_hash}
              onChange={(e) => setNftForm({ ...nftForm, ipfs_hash: e.target.value })}
              margin="normal"
              placeholder="bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi"
            />
            
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                label="Latitude"
                value={nftForm.latitude}
                onChange={(e) => setNftForm({ ...nftForm, latitude: e.target.value })}
                margin="normal"
                type="number"
                step="any"
              />
              <TextField
                fullWidth
                label="Longitude"
                value={nftForm.longitude}
                onChange={(e) => setNftForm({ ...nftForm, longitude: e.target.value })}
                margin="normal"
                type="number"
                step="any"
              />
            </Box>
            
            <TextField
              fullWidth
              label="Collection Radius (meters)"
              value={nftForm.radius_meters}
              onChange={(e) => setNftForm({ ...nftForm, radius_meters: e.target.value })}
              margin="normal"
              type="number"
            />
            
            <TextField
              fullWidth
              label="Smart Contract Address"
              value={nftForm.smart_contract_address}
              onChange={(e) => setNftForm({ ...nftForm, smart_contract_address: e.target.value })}
              margin="normal"
              placeholder="GTestAddress123456789"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={nftForm.is_active}
                  onChange={(e) => setNftForm({ ...nftForm, is_active: e.target.checked })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveNFT} variant="contained">
            {selectedNFT ? 'Update' : 'Pin NFT'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTManager;
