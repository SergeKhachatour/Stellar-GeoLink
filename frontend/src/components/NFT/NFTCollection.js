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

const NFTCollection = () => {
  const [userNFTs, setUserNFTs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
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

  const fetchUserCollection = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await api.get('/nft/user-collection');
      // setUserNFTs(response.data.collection);
      
      // Mock data for now
      setUserNFTs([
        {
          id: 1,
          nft_id: 1,
          user_public_key: 'GTestUser123456789',
          collected_at: '2024-01-15T10:30:00Z',
          transfer_count: 0,
          current_owner: 'GTestUser123456789',
          is_active: true,
          nft: {
            id: 1,
            collection_id: 1,
            latitude: 40.7128,
            longitude: -74.0060,
            radius_meters: 10,
            ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi',
            smart_contract_address: 'GTestAddress123456789',
            collection: {
              name: 'Stellar Explorer',
              description: 'Discover the cosmos with Stellar NFTs',
              image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
              rarity_level: 'common'
            }
          }
        },
        {
          id: 2,
          nft_id: 2,
          user_public_key: 'GTestUser123456789',
          collected_at: '2024-01-16T14:20:00Z',
          transfer_count: 1,
          current_owner: 'GTestUser123456789',
          is_active: true,
          nft: {
            id: 2,
            collection_id: 2,
            latitude: 40.7589,
            longitude: -73.9851,
            radius_meters: 5,
            ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi',
            smart_contract_address: 'GTestAddress987654321',
            collection: {
              name: 'Galaxy Guardian',
              description: 'Rare NFTs for protecting the galaxy',
              image_url: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
              rarity_level: 'rare'
            }
          }
        }
      ]);
    } catch (err) {
      setError('Failed to fetch NFT collection');
      console.error('Error fetching collection:', err);
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
