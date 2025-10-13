/**
 * Real PIN NFT Component
 * Integrates with actual Stellar testnet for real NFT minting and transferring
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  InputAdornment,
  Paper
} from '@mui/material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Send as SendIcon,
  Create as CreateIcon,
  LocationOn as LocationIcon,
  CloudUpload as UploadIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import realNFTService from '../../services/realNFTService';

// Mapbox Token
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';
mapboxgl.accessToken = MAPBOX_TOKEN;

const RealPinNFT = ({ onClose, onSuccess }) => {
  const {
    isConnected,
    publicKey,
    secretKey,
    loading,
    fundAccount,
    upgradeToFullAccess
  } = useWallet();

  // State management
  const [contracts, setContracts] = useState([]);
  const [selectedContract, setSelectedContract] = useState('');
  const [nftAction, setNftAction] = useState('mint'); // 'mint' or 'transfer'
  const [userNFTs, setUserNFTs] = useState([]);
  const [selectedNFT, setSelectedNFT] = useState(null);
  
  // Form states
  const [mintForm, setMintForm] = useState({
    name: '',
    description: '',
    ipfsHash: '',
    filename: '',
    serverUrl: 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/',
    attributes: {}
  });
  
  const [transferForm, setTransferForm] = useState({
    recipient: '',
    fromLocation: { latitude: 0, longitude: 0, radius: 100 },
    toLocation: { latitude: 0, longitude: 0, radius: 100 }
  });
  
  const [location, setLocation] = useState({
    latitude: 0,
    longitude: 0,
    radius: 100
  });
  
  const [userRadius, setUserRadius] = useState(100);
  
  const [successMessage, setSuccessMessage] = useState('');
  const [mintError, setMintError] = useState('');

  const [errorDialog, setErrorDialog] = useState(null);
  const [locationUpdateDialog, setLocationUpdateDialog] = useState(false);
  const [mapContainer, setMapContainer] = useState(null);
  const [map, setMap] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [currentMarkerPosition, setCurrentMarkerPosition] = useState(null);

  // Collection states
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [newCollectionForm, setNewCollectionForm] = useState({
    name: '',
    description: '',
    image_url: '',
    rarity_level: 'common'
  });

  // Dialog states
  const [deployDialog, setDeployDialog] = useState(false);
  const [upgradeDialog, setUpgradeDialog] = useState(false);
  const [upgradeForm, setUpgradeForm] = useState({
    secretKey: ''
  });
  const [deployForm, setDeployForm] = useState({
    name: 'StellarGeoLinkNFT',
    symbol: 'SGL'
  });

  const loadContracts = async () => {
    try {
      const contractsData = realNFTService.getAllContracts();
      console.log('Loading contracts:', contractsData);
      setContracts(contractsData);
    } catch (error) {
      console.error('Failed to load contracts:', error);
    }
  };

  const loadUserNFTs = useCallback(async () => {
    try {
      if (selectedContract) {
        const nfts = await realNFTService.getUserNFTs(selectedContract, publicKey);
        setUserNFTs(nfts.nfts);
      }
    } catch (error) {
      console.error('Failed to load user NFTs:', error);
    }
  }, [selectedContract, publicKey]);

  // Fetch collections
  const fetchCollections = async () => {
    try {
      const apiBaseURL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
      console.log('🔍 Fetching collections from:', `${apiBaseURL}/nft/collections`);
      const response = await fetch(`${apiBaseURL}/nft/collections`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('📡 Collections response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Collections data:', data);
        console.log('📦 Collections array:', data.collections);
        setCollections(data.collections || []);
        console.log('📦 Collections state set to:', data.collections);
        // Auto-select first collection if available
        if (data.collections && data.collections.length > 0) {
          setSelectedCollectionId(data.collections[0].id.toString());
          console.log('✅ Auto-selected collection:', data.collections[0].id);
        }
      } else {
        console.error('❌ Collections fetch failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('❌ Failed to fetch collections:', error);
    }
  };

  // Load contracts, user NFTs, and collections on mount
  useEffect(() => {
    if (isConnected) {
      loadContracts();
      loadUserNFTs();
      fetchCollections();
    }
  }, [isConnected, loadUserNFTs]);

  // Debug collections state changes
  useEffect(() => {
    console.log('🔄 Collections state changed:', collections);
  }, [collections]);

  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radius: userRadius
          });
          setSuccessMessage('Location automatically detected!');
        },
        (error) => {
          console.log('Automatic location detection failed:', error.message);
          setMintError('Please enable location services or manually set your location');
        }
      );
    } else {
      setMintError('Geolocation is not supported by this browser');
    }
  }, [userRadius]);

  // Auto-get location when component mounts
  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  // Initialize map for location update dialog
  const initializeLocationMap = useCallback(() => {
    if (!mapContainer || map) return;

    try {
      if (!mapboxgl) {
        console.error('Mapbox GL JS not loaded');
        setMintError('Mapbox GL JS is not loaded. Please refresh the page.');
        return;
      }

      const newMap = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: location ? [location.longitude, location.latitude] : [-74.5, 40],
        zoom: location ? 15 : 2
      });

      newMap.on('load', () => {
        
        // Create a draggable marker
        const marker = new mapboxgl.Marker({ 
          color: '#ff9800',
          draggable: true 
        });
        
        // Set initial position
        if (location && location.latitude && location.longitude) {
          marker.setLngLat([location.longitude, location.latitude]);
        } else {
          marker.setLngLat([-74.5, 40]); // Default to New York
        }
        
        marker.addTo(newMap);
        
        // Store marker reference for later use
        newMap._draggableMarker = marker;

        // Add click handler for new location selection
        newMap.on('click', (e) => {
          // Move the draggable marker to clicked location
          marker.setLngLat([e.lngLat.lng, e.lngLat.lat]);
          // Update current marker position
          setCurrentMarkerPosition({
            latitude: e.lngLat.lat,
            longitude: e.lngLat.lng
          });
        });
        
        // Add drag end handler to update location
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          setCurrentMarkerPosition({
            latitude: lngLat.lat,
            longitude: lngLat.lng
          });
          console.log('Marker moved to:', lngLat.lng, lngLat.lat);
        });
        
        // Initialize current marker position
        const initialLngLat = marker.getLngLat();
        setCurrentMarkerPosition({
          latitude: initialLngLat.lat,
          longitude: initialLngLat.lng
        });
      });

      newMap.on('error', (e) => {
        console.error('Map error:', e);
        setMintError('Failed to load map. Please check your Mapbox token.');
      });

      setMap(newMap);
    } catch (error) {
      console.error('Error initializing map:', error);
      setMintError('Failed to initialize map. Please refresh the page.');
    }
  }, [mapContainer, location, map]);

  // Initialize map when dialog opens
  useEffect(() => {
    if (locationUpdateDialog && mapContainer) {
      const timer = setTimeout(() => {
        initializeLocationMap();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [locationUpdateDialog, mapContainer, initializeLocationMap]);

  // Cleanup map when dialog closes
  useEffect(() => {
    if (!locationUpdateDialog && map) {
      try {
        map.remove();
        setMap(null);
      } catch (error) {
        console.error('Error cleaning up map:', error);
      }
    }
  }, [locationUpdateDialog, map]);

  // Search functionality for address lookup
  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      if (!mapboxToken) {
        setMintError('Mapbox token not configured. Please contact administrator.');
        return;
      }

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&limit=5`
      );
      
      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchResults(true);
      } else {
        setMintError('No locations found for your search.');
      }
    } catch (error) {
      console.error('Address search failed:', error);
      setMintError('Address search failed. Please try again.');
    }
  };

  // Handle search result selection
  const handleSearchResultClick = (result) => {
    try {
      const [lng, lat] = result.center;
      
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 1000
        });
        
        // Move the draggable marker to the search result location
        if (map._draggableMarker) {
          map._draggableMarker.setLngLat([lng, lat]);
          setCurrentMarkerPosition({
            latitude: lat,
            longitude: lng
          });
        }
      }
      
      setShowSearchResults(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error handling search result:', error);
      setMintError('Failed to update map location. Please try again.');
    }
  };

  // Handle location update confirmation
  const handleLocationUpdate = () => {
    try {
      if (map && map._draggableMarker) {
        const markerPosition = map._draggableMarker.getLngLat();
        setLocation({
          latitude: markerPosition.lat,
          longitude: markerPosition.lng,
          radius: userRadius
        });
        setLocationUpdateDialog(false);
        setSuccessMessage('Location updated successfully!');
      } else {
        setMintError('Map not loaded. Please try again.');
      }
    } catch (error) {
      console.error('Error updating location:', error);
      setMintError('Failed to update location. Please try again.');
    }
  };

  const handleDeployContract = async () => {
    try {
      console.log('Deploy contract - Wallet state:', { isConnected, publicKey, secretKey: secretKey ? 'Available' : 'Not available' });
      
      if (!isConnected) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      if (!secretKey) {
        throw new Error('Secret key not available. Please ensure your wallet is properly connected with full access.');
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      console.log('Deploying contract with keypair:', keypair.publicKey());
      
      const contractInfo = await realNFTService.deployLocationNFTContract(
        keypair,
        deployForm.name
      );

      console.log('Contract deployed:', contractInfo);
      
      // Show success message with StellarExpert link
      setSuccessMessage(`✅ Contract ready! Contract ID: ${contractInfo.contractId}, Name: ${contractInfo.name}, Symbol: ${contractInfo.symbol}. The contract is deployed and ready for minting NFTs! View on StellarExpert: https://stellar.expert/explorer/testnet/contract/${contractInfo.contractId}`);
      setTimeout(() => setSuccessMessage(''), 8000); // Clear after 8 seconds
      
      // Close dialog and reset form
      setDeployDialog(false);
      setDeployForm({ name: 'StellarGeoLinkNFT', symbol: 'SGL' });
      
      // Reload contracts to show the new one
      await loadContracts();
      
      // Auto-select the newly deployed contract
      setSelectedContract(contractInfo.contractId);
      
      console.log('✅ Contract deployment complete. Contract is now available for use.');
    } catch (error) {
      console.error('Failed to deploy contract:', error);
      console.error(`❌ Contract deployment failed: ${error.message}`);
    }
  };


  // Form validation function
  const validateMintForm = () => {
    const errors = [];
    
    if (!mintForm.name || mintForm.name.trim() === '') {
      errors.push('NFT name is required');
    }
    
    if (!mintForm.ipfsHash || mintForm.ipfsHash.trim() === '') {
      errors.push('IPFS hash is required');
    }
    
    if (!location || !location.latitude || !location.longitude) {
      errors.push('Location is required. Please get your current location first.');
    }
    
    if (!userRadius || userRadius <= 0) {
      errors.push('Radius must be greater than 0');
    }
    
    if (!secretKey) {
      errors.push('Secret key is required');
    }
    
    return errors;
  };

  const handleMintNFT = async () => {
    try {
      // Validate form before proceeding
      const validationErrors = validateMintForm();
      if (validationErrors.length > 0) {
        setMintError(validationErrors.join('. '));
        return;
      }

      if (!secretKey) {
        throw new Error('Secret key required for minting');
      }

      // Auto-select or create contract if none selected
      let contractId = selectedContract;
      if (!contractId) {
        console.log('No contract selected, auto-initializing...');
        const StellarSdk = await import('@stellar/stellar-sdk');
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        
        // Auto-initialize the default contract
        const contractInfo = await realNFTService.deployLocationNFTContract(
          keypair,
          'StellarGeoLinkNFT'
        );
        contractId = contractInfo.contractId;
        setSelectedContract(contractId);
        console.log('✅ Auto-initialized contract:', contractId);
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      
      // Mint NFT with location validation
      const result = await realNFTService.mintLocationNFT(
        contractId,
        publicKey, // Mint to current user
        {
          name: mintForm.name,
          description: mintForm.description,
          ipfs_hash: mintForm.ipfsHash,
          filename: mintForm.filename,
          attributes: mintForm.attributes
        },
        location,
        keypair
      );

      console.log('NFT minted successfully:', result);
      
      // Create success overlay with transaction details
      const successData = {
        tokenId: result.tokenId,
        name: mintForm.name,
        contractId: contractId,
        transactionHash: result.hash,
        status: result.status,
        ledger: result.latestLedger,
        location: location,
        imageUrl: realNFTService.buildIPFSUrl(mintForm.ipfsHash, mintForm.filename),
        stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
        contractUrl: `https://stellar.expert/explorer/testnet/contract/${contractId}`
      };
      
      // Pass success data to parent component
      console.log('Passing success data to parent:', successData);
      onSuccess(successData);
      
      // Also persist to localStorage for restoration
      localStorage.setItem('nftMintSuccess', JSON.stringify(successData));
      
      // Add NFT to database for nearby display
      try {
        await addNFTToDatabase(successData);
      } catch (dbError) {
        console.warn('Failed to add NFT to database:', dbError);
        // Don't fail the whole operation if database add fails
      }
      
      // Reset form
      setMintForm({
        name: '',
        description: '',
        ipfsHash: '',
        filename: '',
        attributes: []
      });
      
      // Reload user NFTs to show the new one
      await loadUserNFTs();
      
      onClose && onClose();
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      console.error(`❌ NFT minting failed: ${error.message}`);
      
      // Show detailed error dialog with user-friendly message
      setErrorDialog({
        title: 'NFT Minting Failed',
        message: getErrorMessage(error),
        details: error.message,
        suggestions: getErrorSuggestions(error),
        onRetry: () => {
          setErrorDialog(null);
          handleMintNFT();
        }
      });
    }
  };

  const handleTransferNFT = async () => {
    try {
      if (!secretKey) {
        throw new Error('Secret key required for transferring');
      }

      if (!selectedContract || !selectedNFT) {
        throw new Error('Please select a contract and NFT');
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      
      // Transfer NFT with location validation
      const result = await realNFTService.transferLocationNFT(
        selectedContract,
        selectedNFT.tokenId,
        publicKey, // From current user
        transferForm.recipient,
        transferForm.fromLocation,
        transferForm.toLocation,
        keypair
      );

      console.log('NFT transferred successfully:', result);
      
      // Show success message with StellarExpert link
      setSuccessMessage(`✅ NFT transferred successfully on Stellar testnet! Token ID: ${selectedNFT.tokenId}, From: ${publicKey}, To: ${transferForm.recipient}, Transaction: ${result.transactionHash}. View on StellarExpert: https://stellar.expert/explorer/testnet/tx/${result.transactionHash}`);
      setTimeout(() => setSuccessMessage(''), 8000); // Clear after 8 seconds
      
      // Reset form
      setTransferForm({
        recipient: '',
        fromLocation: { latitude: 0, longitude: 0 },
        toLocation: { latitude: 0, longitude: 0 }
      });
      
      // Reload user NFTs to reflect the transfer
      await loadUserNFTs();
      
      onSuccess && onSuccess(result);
      onClose && onClose();
    } catch (error) {
      console.error('Failed to transfer NFT:', error);
      console.error(`❌ NFT transfer failed: ${error.message}`);
    }
  };

  const handleFundAccount = async () => {
    try {
      await fundAccount(publicKey);
      console.log('Account funded successfully');
    } catch (error) {
      console.error('Failed to fund account:', error);
    }
  };

  const handleUpgradeToFullAccess = async () => {
    try {
      if (!upgradeForm.secretKey.trim()) {
        throw new Error('Please enter your secret key');
      }
      
      await upgradeToFullAccess(upgradeForm.secretKey);
      console.log('Upgraded to full access successfully');
      setUpgradeDialog(false);
      setUpgradeForm({ secretKey: '' });
    } catch (error) {
      console.error('Failed to upgrade to full access:', error);
    }
  };


  // Create new collection
  const createNewCollection = async () => {
    try {
      const apiBaseURL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
      console.log('🔍 Creating collection:', newCollectionForm);
      console.log('📡 API URL:', `${apiBaseURL}/nft/collections`);
      
      const response = await fetch(`${apiBaseURL}/nft/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newCollectionForm)
      });

      console.log('📡 Create collection response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Collection created:', data);
        setCollections(prev => [data.collection, ...prev]);
        setSelectedCollectionId(data.collection.id.toString());
        setShowNewCollectionDialog(false);
        setNewCollectionForm({ name: '', description: '', image_url: '', rarity_level: 'common' });
      } else {
        const errorText = await response.text();
        console.error('❌ Create collection failed:', response.status, errorText);
        throw new Error(`Failed to create collection: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to create collection:', error);
    }
  };

  const addNFTToDatabase = async (nftData) => {
    try {
      // Use the configured API base URL
      const apiBaseURL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
      const response = await fetch(`${apiBaseURL}/nft/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          collection_id: selectedCollectionId ? parseInt(selectedCollectionId) : null,
          latitude: nftData.location.latitude,
          longitude: nftData.location.longitude,
          radius_meters: nftData.location.radius,
          ipfs_hash: mintForm.ipfsHash,
          smart_contract_address: nftData.contractId,
          rarity_requirements: {
            token_id: nftData.tokenId,
            transaction_hash: nftData.transactionHash,
            blockchain: 'stellar_testnet'
          },
          is_active: true
        })
      });

      if (!response.ok) {
        throw new Error(`Database error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ NFT added to database:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to add NFT to database:', error);
      throw error;
    }
  };

  const getErrorMessage = (error) => {
    if (error.message.includes('Error(Contract, #2)')) {
      return 'Token ID already exists. The system will automatically retry with a new ID.';
    }
    if (error.message.includes('insufficient')) {
      return 'Insufficient XLM balance. Please fund your account with testnet XLM.';
    }
    if (error.message.includes('network')) {
      return 'Network connection failed. Please check your internet connection.';
    }
    if (error.message.includes('contract')) {
      return 'Contract error. The contract may not be properly initialized.';
    }
    return 'An unexpected error occurred during NFT minting.';
  };

  const getErrorSuggestions = (error) => {
    if (error.message.includes('insufficient')) {
      return [
        'Fund your account with testnet XLM using the "Fund Account" button',
        'Visit Stellar Laboratory to get testnet XLM',
        'Check your wallet balance'
      ];
    }
    if (error.message.includes('contract')) {
      return [
        'Try clicking "Verify Contract Ready" first',
        'Ensure the contract is properly deployed',
        'Check the contract on StellarExpert'
      ];
    }
    return [
      'Check your internet connection',
      'Try again in a few moments',
      'Contact support if the issue persists'
    ];
  };

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Please connect your wallet to use PIN NFT features.
        </Alert>
      </Box>
    );
  }

  if (!secretKey) {
    console.log('Rendering secret key error, upgradeDialog state:', upgradeDialog);
    return (
      <>
        <Box sx={{ p: 3 }}>
          <Alert severity="error">
            Secret key not available. Your wallet is connected in view-only mode.
            <br />
            <small>Current wallet state: Connected={isConnected ? 'Yes' : 'No'}, PublicKey={publicKey || 'None'}</small>
            <br />
            <Button 
              variant="contained" 
              color="primary" 
              onClick={() => {
                console.log('Upgrade button clicked, setting upgradeDialog to true');
                setUpgradeDialog(true);
              }}
              sx={{ mt: 2 }}
            >
              Upgrade to Full Access
            </Button>
          </Alert>
          
          {/* Debug info */}
          <Typography variant="caption" color="text.secondary">
            Debug: upgradeDialog = {upgradeDialog ? 'true' : 'false'}
          </Typography>
        </Box>

        {/* Upgrade to Full Access Dialog - Moved here so it renders even with early return */}
        <Dialog 
          open={upgradeDialog} 
          onClose={() => {
            console.log('Upgrade dialog closing');
            setUpgradeDialog(false);
          }} 
          maxWidth="sm" 
          fullWidth
          sx={{ zIndex: 1700 }}
        >
          <DialogTitle>Upgrade to Full Access</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Your wallet is currently in view-only mode. To deploy contracts and perform transactions, 
              you need to provide your secret key to upgrade to full access.
            </Typography>
            
            <TextField
              label="Secret Key"
              type="password"
              value={upgradeForm.secretKey}
              onChange={(e) => setUpgradeForm({ ...upgradeForm, secretKey: e.target.value })}
              fullWidth
              placeholder="Enter your secret key (starts with S...)"
              helperText="Your secret key will be stored locally and used for transactions"
              sx={{ mb: 2 }}
            />
            
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Security Note:</strong> Your secret key is stored locally in your browser. 
                Make sure you're on a secure device and network.
              </Typography>
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUpgradeDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleUpgradeToFullAccess} 
              variant="contained" 
              disabled={loading || !upgradeForm.secretKey.trim()}
            >
              {loading ? <CircularProgress size={20} /> : 'Upgrade to Full Access'}
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return (
    <Box sx={{ p: 3, position: 'relative', zIndex: 10 }}>
      <Typography variant="h5" gutterBottom>
        Real PIN NFT - Stellar Testnet
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Deploy, mint, and transfer NFTs on the Stellar blockchain testnet. Attempts real deployment first, falls back to realistic simulation if needed.
      </Typography>
      
      {/* Wallet Status Debug Info */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Wallet Status:</strong> Connected={isConnected ? 'Yes' : 'No'}, 
          PublicKey={publicKey || 'None'}, 
          SecretKey={secretKey ? 'Available' : 'Not Available'}
        </Typography>
      </Alert>

      {mintError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mintError}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {/* Simplified Contract Status */}
      {selectedContract && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>✅ Contract Ready:</strong> {contracts.find(c => c.contractId === selectedContract)?.name || 'StellarGeoLinkNFT'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <a 
              href={`https://stellar.expert/explorer/testnet/contract/${selectedContract}`} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#1976d2', textDecoration: 'underline' }}
            >
              🔗 View on StellarExpert
            </a>
          </Typography>
        </Alert>
      )}

      {/* NFT Action Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            NFT Action
          </Typography>
          
          <FormControl component="fieldset">
            <FormLabel component="legend">Choose Action</FormLabel>
            <RadioGroup
              value={nftAction}
              onChange={(e) => setNftAction(e.target.value)}
            >
              <FormControlLabel
                value="mint"
                control={<Radio />}
                label="Mint New NFT"
              />
              <FormControlLabel
                value="transfer"
                control={<Radio />}
                label="Transfer Existing NFT"
              />
            </RadioGroup>
          </FormControl>
        </CardContent>
      </Card>

      {/* Mint NFT Form */}
      {nftAction === 'mint' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Mint New NFT
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>🚀 One-Click Minting:</strong> Just fill in the details below and click "Mint NFT". 
                The system will automatically handle contract setup and initialization.
              </Typography>
            </Alert>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="NFT Name"
                  value={mintForm.name}
                  onChange={(e) => setMintForm({ ...mintForm, name: e.target.value })}
                  fullWidth
                  required
                  error={!mintForm.name || mintForm.name.trim() === ''}
                  helperText={(!mintForm.name || mintForm.name.trim() === '') ? 'NFT name is required' : 'Enter a unique name for your NFT'}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Description"
                  value={mintForm.description}
                  onChange={(e) => setMintForm({ ...mintForm, description: e.target.value })}
                  multiline
                  rows={3}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="IPFS Hash"
                  value={mintForm.ipfsHash}
                  onChange={(e) => setMintForm({ ...mintForm, ipfsHash: e.target.value })}
                  fullWidth
                  required
                  error={!mintForm.ipfsHash || mintForm.ipfsHash.trim() === ''}
                  helperText={(!mintForm.ipfsHash || mintForm.ipfsHash.trim() === '') ? 'IPFS hash is required' : 'Enter the IPFS hash for your NFT image'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Filename"
                  value={mintForm.filename}
                  onChange={(e) => setMintForm({ ...mintForm, filename: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Server URL"
                  value={mintForm.serverUrl}
                  onChange={(e) => setMintForm({ ...mintForm, serverUrl: e.target.value })}
                  fullWidth
                />
              </Grid>
              
              {/* Collection Selection */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Collection</InputLabel>
                  <Select
                    value={selectedCollectionId}
                    onChange={(e) => {
                      if (e.target.value === 'new') {
                        setShowNewCollectionDialog(true);
                      } else {
                        setSelectedCollectionId(e.target.value);
                      }
                    }}
                    label="Collection"
                  >
                    {console.log('🎨 Rendering dropdown with collections:', collections)}
                    {collections.map((collection) => (
                      <MenuItem key={collection.id} value={collection.id.toString()}>
                        {collection.name} ({collection.rarity_level})
                      </MenuItem>
                    ))}
                    <MenuItem value="new">
                      <em>+ Create New Collection</em>
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Radius (meters)"
                  type="number"
                  value={userRadius}
                  onChange={(e) => setUserRadius(parseInt(e.target.value) || 100)}
                  fullWidth
                  required
                  error={!userRadius || userRadius <= 0}
                  inputProps={{ min: 1, max: 10000 }}
                  helperText={(!userRadius || userRadius <= 0) ? 'Radius must be greater than 0' : 'Collection radius in meters (1-10000)'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="outlined"
                  startIcon={<LocationIcon />}
                  onClick={() => setLocationUpdateDialog(true)}
                  fullWidth
                >
                  {location.latitude ? 'Update Location' : 'Set Location'}
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Location: {location.latitude ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Not set'}
                  {location.latitude && (
                    <span> | Radius: {location.radius}m</span>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Location is automatically detected. Click "Update Location" to change it using the interactive map.
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<CreateIcon />}
                  onClick={handleMintNFT}
                  disabled={loading || validateMintForm().length > 0}
                  fullWidth
                  size="large"
                >
                  {loading ? <CircularProgress size={20} /> : 'Mint NFT'}
                </Button>
                {validateMintForm().length > 0 && (
                  <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                    Missing: {validateMintForm().join(', ')}
                  </Typography>
                )}
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Transfer NFT Form */}
      {nftAction === 'transfer' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Transfer NFT
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Select NFT to Transfer</InputLabel>
                  <Select
                    value={selectedNFT?.tokenId || ''}
                    onChange={(e) => {
                      const nft = userNFTs.find(n => n.tokenId === e.target.value);
                      setSelectedNFT(nft);
                    }}
                  >
                    {userNFTs.map((nft) => (
                      <MenuItem key={nft.tokenId} value={nft.tokenId}>
                        {nft.name} (#{nft.tokenId})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Recipient Address"
                  value={transferForm.recipient}
                  onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={handleTransferNFT}
                  disabled={loading || !selectedContract || !selectedNFT}
                  fullWidth
                >
                  {loading ? <CircularProgress size={20} /> : 'Transfer NFT'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Account Funding */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Testnet Funding
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your wallet address: <strong>{publicKey}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            To fund your account with testnet XLM, visit: <br/>
            <a href={`https://laboratory.stellar.org/#account-creator?network=testnet&address=${publicKey}`} target="_blank" rel="noopener noreferrer">
              Stellar Laboratory - Account Creator
            </a>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            View your account on StellarExpert: <br/>
            <a href={`https://stellar.expert/explorer/testnet/account/${publicKey}`} target="_blank" rel="noopener noreferrer">
              🔗 View Account on StellarExpert
            </a>
          </Typography>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={handleFundAccount}
            disabled={loading}
          >
            Fund Account with Testnet XLM
          </Button>
        </CardContent>
      </Card>

      {/* Deploy Contract Dialog */}
        <Dialog
        open={deployDialog}
        onClose={() => setDeployDialog(false)} 
        maxWidth="sm" 
        fullWidth
        sx={{ zIndex: 9999 }}
        PaperProps={{
          sx: { zIndex: 9999 }
        }}
        BackdropProps={{
          sx: { zIndex: 9998 }
        }}
      >
        <DialogTitle>Initialize Contract</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set up the deployed LocationNFT contract for use. The contract is already deployed on Stellar testnet and ready for minting NFTs.
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Contract Name"
                value={deployForm.name}
                onChange={(e) => setDeployForm({ ...deployForm, name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Symbol"
                value={deployForm.symbol}
                onChange={(e) => setDeployForm({ ...deployForm, symbol: e.target.value })}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialog(false)}>Cancel</Button>
          <Button onClick={handleDeployContract} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Initialize Contract'}
          </Button>
        </DialogActions>
      </Dialog>


      {/* Error Dialog */}
      <Dialog
        open={!!errorDialog}
        onClose={() => setErrorDialog(null)}
        maxWidth="sm"
        fullWidth
        sx={{ zIndex: 10000 }}
      >
        <DialogTitle sx={{ color: 'error.main' }}>
          ❌ {errorDialog?.title}
        </DialogTitle>
        <DialogContent>
          {errorDialog && (
            <Box>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {errorDialog.message}
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>Technical Details:</strong>
                <br />
                <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>
                  {errorDialog.details}
                </code>
              </Typography>

              <Typography variant="h6" gutterBottom>
                💡 Suggestions:
              </Typography>
              <ul>
                {errorDialog.suggestions?.map((suggestion, index) => (
                  <li key={index}>
                    <Typography variant="body2">{suggestion}</Typography>
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialog(null)}>
            Close
          </Button>
          <Button 
            onClick={errorDialog?.onRetry} 
            variant="contained" 
            color="primary"
          >
            Retry
          </Button>
        </DialogActions>
      </Dialog>

      {/* Location Update Dialog */}
      <Dialog
        open={locationUpdateDialog}
        onClose={() => setLocationUpdateDialog(false)}
        maxWidth="lg"
        fullWidth
        sx={{ zIndex: 10000 }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 2 }}>
          📍 Update NFT Location
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Search for an address or click on the map to set your NFT location
            </Typography>
            
            {/* Address Search */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small"
                placeholder="Search for an address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  )
                }}
              />
              <Button
                variant="outlined"
                onClick={handleAddressSearch}
                disabled={!searchQuery.trim()}
              >
                Search
              </Button>
            </Box>

            {/* Search Results */}
            {showSearchResults && searchResults.length > 0 && (
              <Paper sx={{ mb: 2, maxHeight: 200, overflow: 'auto' }}>
                {searchResults.map((result, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      '&:hover': { backgroundColor: '#f5f5f5' },
                      '&:last-child': { borderBottom: 'none' }
                    }}
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <Typography variant="body2" fontWeight="bold">
                      {result.place_name}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            )}

            {/* Map Container */}
            <Box
              ref={setMapContainer}
              sx={{
                height: '400px',
                width: '100%',
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid #ddd'
              }}
            />

            {/* Current Location Display */}
            <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight="bold">
                Selected Location:
              </Typography>
              {currentMarkerPosition ? (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {currentMarkerPosition.latitude.toFixed(6)}, {currentMarkerPosition.longitude.toFixed(6)}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Drag the orange marker or click on the map to select a new location
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocationUpdateDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleLocationUpdate}
            disabled={!map}
          >
            Update Location
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Collection Dialog */}
      <Dialog
        open={showNewCollectionDialog}
        onClose={() => setShowNewCollectionDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Collection</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Collection Name"
                value={newCollectionForm.name}
                onChange={(e) => setNewCollectionForm({ ...newCollectionForm, name: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={newCollectionForm.description}
                onChange={(e) => setNewCollectionForm({ ...newCollectionForm, description: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Image URL"
                value={newCollectionForm.image_url}
                onChange={(e) => setNewCollectionForm({ ...newCollectionForm, image_url: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Rarity Level</InputLabel>
                <Select
                  value={newCollectionForm.rarity_level}
                  onChange={(e) => setNewCollectionForm({ ...newCollectionForm, rarity_level: e.target.value })}
                  label="Rarity Level"
                >
                  <MenuItem value="common">Common</MenuItem>
                  <MenuItem value="rare">Rare</MenuItem>
                  <MenuItem value="legendary">Legendary</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewCollectionDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={createNewCollection}
            disabled={!newCollectionForm.name.trim()}
          >
            Create Collection
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default RealPinNFT;
