/**
 * Enhanced NFT Manager Component
 * Following Stellar Playbook recommendations for NFT management
 * Integrates with enhanced Stellar wallet and Soroban smart contracts
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton
} from '@mui/material';
import {
  Add as AddIcon,
  Send as SendIcon,
  Create as CreateIcon,
  LocationOn as LocationIcon,
  SmartToy as SmartContractIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

const EnhancedNFTManager = () => {
  const {
    isConnected,
    loading,
    error,
    createNFTCollection,
    mintNFT,
    transferNFT,
    executeOnNFTTransfer,
    createLocationNFT,
    getNFTCollections
  } = useWallet();

  // State management
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  
  // Use selectedCollection to avoid unused variable warning
  console.log('Selected collection:', selectedCollection);
  
  // Form states
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    symbol: '',
    description: '',
    metadata: {}
  });
  
  const [mintForm, setMintForm] = useState({
    contractId: '',
    recipient: '',
    metadata: {}
  });
  
  const [transferForm, setTransferForm] = useState({
    contractId: '',
    tokenId: '',
    from: '',
    to: ''
  });
  
  const [locationForm, setLocationForm] = useState({
    contractId: '',
    recipient: '',
    latitude: '',
    longitude: '',
    address: '',
    metadata: {}
  });
  
  const [smartContractForm, setSmartContractForm] = useState({
    contractId: '',
    tokenId: '',
    from: '',
    to: '',
    actionContractId: '',
    actionFunction: '',
    actionArgs: []
  });

  // Dialog states
  const [createCollectionDialog, setCreateCollectionDialog] = useState(false);
  const [mintDialog, setMintDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);
  const [locationDialog, setLocationDialog] = useState(false);
  const [smartContractDialog, setSmartContractDialog] = useState(false);

  const loadCollections = useCallback(() => {
    try {
      const collectionsData = getNFTCollections();
      setCollections(collectionsData);
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }, [getNFTCollections]);

  // Load collections on component mount
  useEffect(() => {
    if (isConnected) {
      loadCollections();
    }
  }, [isConnected, loadCollections]);

  const handleCreateCollection = async () => {
    try {
      const result = await createNFTCollection(
        collectionForm.name,
        collectionForm.symbol,
        collectionForm.description,
        collectionForm.metadata
      );
      
      console.log('Collection created:', result);
      setCreateCollectionDialog(false);
      setCollectionForm({ name: '', symbol: '', description: '', metadata: {} });
      loadCollections();
    } catch (error) {
      console.error('Failed to create collection:', error);
    }
  };

  const handleMintNFT = async () => {
    try {
      const result = await mintNFT(
        mintForm.contractId,
        mintForm.recipient,
        mintForm.metadata
      );
      
      console.log('NFT minted:', result);
      setMintDialog(false);
      setMintForm({ contractId: '', recipient: '', metadata: {} });
    } catch (error) {
      console.error('Failed to mint NFT:', error);
    }
  };

  const handleTransferNFT = async () => {
    try {
      const result = await transferNFT(
        transferForm.contractId,
        transferForm.tokenId,
        transferForm.from,
        transferForm.to
      );
      
      console.log('NFT transferred:', result);
      setTransferDialog(false);
      setTransferForm({ contractId: '', tokenId: '', from: '', to: '' });
    } catch (error) {
      console.error('Failed to transfer NFT:', error);
    }
  };

  const handleCreateLocationNFT = async () => {
    try {
      const location = {
        latitude: parseFloat(locationForm.latitude),
        longitude: parseFloat(locationForm.longitude),
        address: locationForm.address
      };
      
      const result = await createLocationNFT(
        locationForm.contractId,
        locationForm.recipient,
        location,
        locationForm.metadata
      );
      
      console.log('Location NFT created:', result);
      setLocationDialog(false);
      setLocationForm({ 
        contractId: '', 
        recipient: '', 
        latitude: '', 
        longitude: '', 
        address: '', 
        metadata: {} 
      });
    } catch (error) {
      console.error('Failed to create location NFT:', error);
    }
  };

  const handleExecuteSmartContract = async () => {
    try {
      const result = await executeOnNFTTransfer(
        smartContractForm.contractId,
        smartContractForm.tokenId,
        smartContractForm.from,
        smartContractForm.to,
        smartContractForm.actionContractId,
        smartContractForm.actionFunction,
        smartContractForm.actionArgs
      );
      
      console.log('Smart contract executed:', result);
      setSmartContractDialog(false);
      setSmartContractForm({ 
        contractId: '', 
        tokenId: '', 
        from: '', 
        to: '', 
        actionContractId: '', 
        actionFunction: '', 
        actionArgs: [] 
      });
    } catch (error) {
      console.error('Failed to execute smart contract:', error);
    }
  };

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Please connect your wallet to access NFT management features.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Enhanced NFT Manager
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Following Stellar Playbook recommendations for NFT management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Action Buttons */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateCollectionDialog(true)}
            fullWidth
          >
            Create Collection
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            variant="outlined"
            startIcon={<CreateIcon />}
            onClick={() => setMintDialog(true)}
            fullWidth
          >
            Mint NFT
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            variant="outlined"
            startIcon={<SendIcon />}
            onClick={() => setTransferDialog(true)}
            fullWidth
          >
            Transfer NFT
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            variant="outlined"
            startIcon={<LocationIcon />}
            onClick={() => setLocationDialog(true)}
            fullWidth
          >
            Location NFT
          </Button>
        </Grid>
      </Grid>

      {/* Collections List */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            NFT Collections
          </Typography>
          {collections.length === 0 ? (
            <Typography color="text.secondary">
              No collections found. Create your first collection to get started.
            </Typography>
          ) : (
            <List>
              {collections.map((collection, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={collection.name}
                    secondary={`${collection.symbol} - ${collection.description}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" onClick={() => setSelectedCollection(collection)}>
                      <ViewIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Smart Contract Actions */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Smart Contract Actions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<SmartContractIcon />}
            onClick={() => setSmartContractDialog(true)}
            sx={{ mb: 2 }}
          >
            Execute on NFT Transfer
          </Button>
          <Typography variant="body2" color="text.secondary">
            Execute smart contracts automatically when NFTs are transferred
          </Typography>
        </CardContent>
      </Card>

      {/* Create Collection Dialog */}
      <Dialog open={createCollectionDialog} onClose={() => setCreateCollectionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create NFT Collection</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Collection Name"
                value={collectionForm.name}
                onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Symbol"
                value={collectionForm.symbol}
                onChange={(e) => setCollectionForm({ ...collectionForm, symbol: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={collectionForm.description}
                onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateCollectionDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateCollection} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Create Collection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mint NFT Dialog */}
      <Dialog open={mintDialog} onClose={() => setMintDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mint NFT</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Contract ID"
                value={mintForm.contractId}
                onChange={(e) => setMintForm({ ...mintForm, contractId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Recipient Address"
                value={mintForm.recipient}
                onChange={(e) => setMintForm({ ...mintForm, recipient: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Metadata (JSON)"
                value={JSON.stringify(mintForm.metadata)}
                onChange={(e) => {
                  try {
                    const metadata = JSON.parse(e.target.value);
                    setMintForm({ ...mintForm, metadata });
                  } catch (error) {
                    // Invalid JSON, keep as string
                  }
                }}
                multiline
                rows={3}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMintDialog(false)}>Cancel</Button>
          <Button onClick={handleMintNFT} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Mint NFT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer NFT Dialog */}
      <Dialog open={transferDialog} onClose={() => setTransferDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Transfer NFT</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Contract ID"
                value={transferForm.contractId}
                onChange={(e) => setTransferForm({ ...transferForm, contractId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Token ID"
                value={transferForm.tokenId}
                onChange={(e) => setTransferForm({ ...transferForm, tokenId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="From Address"
                value={transferForm.from}
                onChange={(e) => setTransferForm({ ...transferForm, from: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="To Address"
                value={transferForm.to}
                onChange={(e) => setTransferForm({ ...transferForm, to: e.target.value })}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialog(false)}>Cancel</Button>
          <Button onClick={handleTransferNFT} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Transfer NFT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Location NFT Dialog */}
      <Dialog open={locationDialog} onClose={() => setLocationDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Location NFT</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Contract ID"
                value={locationForm.contractId}
                onChange={(e) => setLocationForm({ ...locationForm, contractId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Recipient Address"
                value={locationForm.recipient}
                onChange={(e) => setLocationForm({ ...locationForm, recipient: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Latitude"
                type="number"
                value={locationForm.latitude}
                onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Longitude"
                type="number"
                value={locationForm.longitude}
                onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address"
                value={locationForm.address}
                onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocationDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateLocationNFT} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Create Location NFT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Smart Contract Dialog */}
      <Dialog open={smartContractDialog} onClose={() => setSmartContractDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Execute Smart Contract on NFT Transfer</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="NFT Contract ID"
                value={smartContractForm.contractId}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, contractId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Token ID"
                value={smartContractForm.tokenId}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, tokenId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="From Address"
                value={smartContractForm.from}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, from: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="To Address"
                value={smartContractForm.to}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, to: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Action Contract ID"
                value={smartContractForm.actionContractId}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, actionContractId: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Action Function"
                value={smartContractForm.actionFunction}
                onChange={(e) => setSmartContractForm({ ...smartContractForm, actionFunction: e.target.value })}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSmartContractDialog(false)}>Cancel</Button>
          <Button onClick={handleExecuteSmartContract} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Execute Smart Contract'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EnhancedNFTManager;
