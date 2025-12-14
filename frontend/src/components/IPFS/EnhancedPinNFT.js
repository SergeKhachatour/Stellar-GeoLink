import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
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
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CloudDone as PinIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import Mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '../../utils/api';
import { useWallet } from '../../contexts/WalletContext';
import { getApiUrl } from '../../utils/apiUrl';

// Set Mapbox token
Mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const EnhancedPinNFT = ({ onPinComplete, open, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [servers, setServers] = useState([]);
  const [uploads, setUploads] = useState([]);
  
  // Get wallet context
  const { isConnected, publicKey, secretKey } = useWallet();
  const [collections, setCollections] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Step 1: File Upload
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Step 2: NFT Details
  const [nftDetails, setNftDetails] = useState({
    collection_id: '',
    latitude: '',
    longitude: '',
    radius_meters: 10,
    smart_contract_address: '',
    rarity_requirements: {}
  });
  
  // Step 3: Review & Pin
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [pinning, setPinning] = useState(false);
  
  const fileInputRef = useRef(null);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    if (open) {
      fetchServers();
      fetchUploads();
      fetchCollections();
      fetchContracts();
      setActiveStep(0);
      setError('');
      setSuccess('');
    } else {
      // Cleanup polling interval when dialog closes
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [open]);

  // Initialize Mapbox map
  const initializeMap = () => {
    if (map.current || !mapContainer.current) return;

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      setError('Mapbox token not configured. Please set REACT_APP_MAPBOX_TOKEN in your .env file.');
      return;
    }

    try {
      map.current = new Mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-118.2437, 34.0522], // Default to LA
        zoom: 10,
        pitch: 0,
        bearing: 0,
        projection: 'globe',
        antialias: true,
        interactive: true
      });

      // Add navigation controls
      map.current.addControl(new Mapboxgl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        console.log('Map loaded for NFT pinning');
      });

      // Handle map clicks
      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        console.log('🗺️ Map clicked:', { lat: lat.toFixed(6), lng: lng.toFixed(6) });
        
        setNftDetails({
          ...nftDetails,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        });

        // Add a marker at the clicked location
        if (map.current.getSource('click-marker')) {
          map.current.removeLayer('click-marker');
          map.current.removeSource('click-marker');
        }

        map.current.addSource('click-marker', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            properties: {
              title: 'NFT Location'
            }
          }
        });

        map.current.addLayer({
          id: 'click-marker',
          type: 'circle',
          source: 'click-marker',
          paint: {
            'circle-radius': 8,
            'circle-color': '#ff0000',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
          }
        });
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setError('Failed to initialize map');
    }
  };

  // Initialize map when component mounts and map container is ready
  // Also re-initialize when step 2 becomes active (NFT Details step where map is shown)
  useEffect(() => {
    if (open && mapContainer.current && !map.current && activeStep >= 1) {
      // Small delay to ensure container is fully rendered
      setTimeout(() => {
        initializeMap();
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeStep]);

  const fetchServers = async () => {
    try {
      const response = await api.get('/ipfs/servers');
      setServers(response.data.servers);
      if (response.data.servers.length > 0) {
        const defaultServer = response.data.servers.find(s => s.is_default);
        setSelectedServer(defaultServer ? defaultServer.id : response.data.servers[0].id);
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    }
  };

  const fetchUploads = async () => {
    try {
      const response = await api.get('/ipfs/uploads');
      console.log('🔍 Frontend received uploads:', response.data.uploads);
      if (response.data.uploads.length > 0) {
        console.log('🔍 Sample upload in frontend:', {
          id: response.data.uploads[0].id,
          user_id: response.data.uploads[0].user_id,
          ipfs_hash: response.data.uploads[0].ipfs_hash,
          server_url: response.data.uploads[0].server_url,
          file_path: response.data.uploads[0].file_path
        });
      }
      // Show all uploads (uploaded, pinning, pinned) so users can see their files
      // Filter to show uploaded, pinning, and pinned statuses
      const visibleUploads = response.data.uploads.filter(upload => 
        ['uploaded', 'pinning', 'pinned'].includes(upload.upload_status)
      );
      setUploads(visibleUploads);
      
      // Log status summary for debugging
      const statusCounts = visibleUploads.reduce((acc, u) => {
        acc[u.upload_status] = (acc[u.upload_status] || 0) + 1;
        return acc;
      }, {});
      if (Object.keys(statusCounts).length > 0) {
        console.log('📊 Upload status summary:', statusCounts);
      }
    } catch (error) {
      console.error('Error fetching uploads:', error);
    }
  };

  const fetchCollections = async () => {
    try {
      const response = await api.get('/nft/collections');
      console.log('📦 Collections response:', response.data);
      // Handle both response formats
      const collectionsData = response.data.collections || response.data;
      setCollections(Array.isArray(collectionsData) ? collectionsData : []);
    } catch (error) {
      console.error('Error fetching collections:', error);
      setError('Failed to load collections');
    }
  };

  const fetchContracts = async () => {
    try {
      // Try to fetch contracts from API, fallback to mock/placeholder
      let contractsList = [];
      
      try {
        // Try to fetch from API if endpoint exists
        const response = await api.get('/nft/contracts');
        if (response.data && Array.isArray(response.data.contracts)) {
          contractsList = response.data.contracts;
        } else if (response.data && Array.isArray(response.data)) {
          contractsList = response.data;
        }
      } catch (apiError) {
        // API endpoint doesn't exist yet, use mock/placeholder
        console.log('Contracts API not available, using placeholder');
      }
      
      // Always include auto-deploy option
      const contracts = [
        {
          id: 'auto-deploy',
          name: 'Auto-Deploy New Contract',
          address: '',
          description: 'Automatically deploy a new LocationNFT contract'
        },
        ...contractsList
      ];
      
      // If no contracts from API, add default contract
      if (contractsList.length === 0) {
        // Use environment variable if set, otherwise use the default production contract
        const defaultContractAddress = process.env.REACT_APP_DEFAULT_CONTRACT_ADDRESS || 'CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q';
        contracts.push({
          id: 'default-contract',
          name: 'StellarGeoLinkNFT',
          address: defaultContractAddress,
          description: process.env.REACT_APP_DEFAULT_CONTRACT_ADDRESS 
            ? 'Contract from environment configuration' 
            : 'Default LocationNFT contract'
        });
      }
      
      setContracts(contracts);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      // Fallback to minimal contracts list
      setContracts([
        {
          id: 'auto-deploy',
          name: 'Auto-Deploy New Contract',
          address: '',
          description: 'Automatically deploy a new LocationNFT contract'
        }
      ]);
    }
  };

  const handleCollectionChange = async (value) => {
    if (value === 'create-new') {
      // Prompt for new collection name
      const collectionName = prompt('Enter collection name:');
      if (collectionName) {
        try {
          const response = await api.post('/nft/collections', {
            name: collectionName,
            description: `Collection created for NFT minting`,
            rarity_level: 'common'
          });
          
          setCollections([...collections, response.data.collection]);
          setNftDetails({ ...nftDetails, collection_id: response.data.collection.id });
          setSuccess('New collection created successfully!');
        } catch (error) {
          console.error('Error creating collection:', error);
          setError('Failed to create collection');
        }
      }
    } else {
      setNftDetails({ ...nftDetails, collection_id: value });
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      
      if (file.size > maxSize) {
        setError('File size exceeds 10MB limit');
        return;
      }
      
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Only images are allowed.');
        return;
      }
      
      setSelectedFile(file);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedServer) {
      setError('Please select a file and IPFS server');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setError('');

      // Use FormData for multipart/form-data upload (required by multer)
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (selectedServer) {
        formData.append('ipfs_server_id', selectedServer);
      }

      const uploadResponse = await api.post('/ipfs/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const uploadedFileId = uploadResponse.data.upload.id;
      
      setSuccess('File uploaded successfully! Pinning to IPFS...');
      setUploadProgress(50);
      
      // Auto-pin the file after upload
      try {
        const pinResponse = await api.post(`/ipfs/pin/${uploadedFileId}`);
        console.log('📌 Pin initiated:', pinResponse.data);
        
        // Poll for pin status
        setSuccess('File uploaded! Waiting for IPFS pinning to complete...');
        setUploadProgress(60);
        
        // Poll for pin completion (max 30 seconds)
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = 1000; // 1 second
        
        pollIntervalRef.current = setInterval(async () => {
          attempts++;
          try {
            // Refresh uploads to get latest status
            const uploadsResponse = await api.get('/ipfs/uploads');
            const updatedUpload = uploadsResponse.data.uploads.find(u => u.id === uploadedFileId);
            
            console.log(`🔄 Polling attempt ${attempts}/${maxAttempts} - Upload status:`, updatedUpload?.upload_status, 'IPFS Hash:', updatedUpload?.ipfs_hash);
            
            if (updatedUpload) {
              if (updatedUpload.upload_status === 'pinned' && updatedUpload.ipfs_hash) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setSuccess('File uploaded and pinned to IPFS successfully!');
                setUploadProgress(100);
                setUploading(false);
                await fetchUploads(); // Refresh list
                setSelectedUpload(uploadedFileId); // Auto-select
                return;
              } else if (updatedUpload.upload_status === 'failed') {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setError('IPFS pinning failed. Please check your Pinata API credentials in the IPFS server settings.');
                setUploadProgress(0);
                setUploading(false);
                await fetchUploads(); // Refresh list
                return;
              }
            }
            
            // Update progress (60% to 90%)
            setUploadProgress(60 + Math.min(30, attempts * 1));
            
            if (attempts >= maxAttempts) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setError('IPFS pinning is taking longer than expected. The file may still be pinning in the background. Please refresh the page to check the status.');
              setUploadProgress(0);
              setUploading(false);
              await fetchUploads(); // Refresh list
            }
          } catch (pollError) {
            console.error('Error polling pin status:', pollError);
            if (attempts >= maxAttempts) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setError('Error checking pin status. Please refresh and try again.');
              setUploadProgress(0);
              setUploading(false);
            }
          }
        }, pollInterval);
        
      } catch (pinError) {
        console.error('Error pinning file:', pinError);
        setError(pinError.response?.data?.error || 'Failed to start IPFS pinning. Please check your Pinata API credentials.');
        setUploadProgress(0);
        await fetchUploads(); // Refresh list anyway
      }
      
      // Clear selected file
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Move to next step
      setActiveStep(1);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file');
      setUploading(false);
    }
  };


  const handleNext = () => {
    if (activeStep === 0) {
      // Validate file upload step
      if (uploads.length === 0) {
        setError('Please upload and pin a file first');
        return;
      }
    }
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handlePinNFT = async () => {
    if (!selectedUpload) {
      setError('Please select a pinned file');
      return;
    }

    try {
      setPinning(true);
      setError('');

      // Get the server details for the selected upload
      const upload = uploads.find(u => u.id === selectedUpload);
      const server = servers.find(s => s.id === upload.ipfs_server_id);

      // First, pin to database
      // Include foreign key references for Workflow 2 (IPFS server workflow)
      const pinData = {
        collection_id: nftDetails.collection_id,
        latitude: parseFloat(nftDetails.latitude),
        longitude: parseFloat(nftDetails.longitude),
        radius_meters: parseInt(nftDetails.radius_meters),
        ipfs_hash: upload.ipfs_hash,
        server_url: server.server_url,
        smart_contract_address: nftDetails.smart_contract_address,
        rarity_requirements: nftDetails.rarity_requirements,
        filename: upload.original_filename,
        nft_upload_id: upload.id, // Link to nft_uploads table
        ipfs_server_id: upload.ipfs_server_id // Link to ipfs_servers table
      };

      console.log('🔗 Pinning NFT to database:', pinData);
      const response = await api.post('/nft/pin', pinData);
      
                  // Now mint on Stellar blockchain if wallet is connected
                  try {
                    // Import the real NFT service
                    const realNFTService = await import('../../services/realNFTService');
                    const { default: RealNFTService } = realNFTService;
                    
                    // Check if wallet is connected (using component-level wallet data)
                    if (isConnected && secretKey) {
          console.log('🚀 Minting NFT on Stellar blockchain...');
          
          // Auto-initialize contract if needed
          let contractId = nftDetails.smart_contract_address;
          if (!contractId) {
            console.log('📝 Auto-initializing contract...');
            const StellarSdk = await import('@stellar/stellar-sdk');
            const keypair = StellarSdk.Keypair.fromSecret(secretKey);
            
            const contractInfo = await RealNFTService.deployLocationNFTContract(
              keypair,
              'StellarGeoLinkNFT'
            );
            contractId = contractInfo.contractId;
            console.log('✅ Contract initialized:', contractId);
          }
          
          // Mint NFT on blockchain
          const StellarSdk = await import('@stellar/stellar-sdk');
          const keypair = StellarSdk.Keypair.fromSecret(secretKey);
          
          const mintResult = await RealNFTService.mintLocationNFT(
            contractId,
            publicKey,
            {
              name: upload.original_filename,
              description: `Location-based NFT at ${nftDetails.latitude}, ${nftDetails.longitude}`,
              ipfs_hash: upload.ipfs_hash,
              filename: upload.original_filename,
              attributes: {
                latitude: nftDetails.latitude,
                longitude: nftDetails.longitude,
                radius: nftDetails.radius_meters,
                collection: nftDetails.collection_id
              }
            },
            {
              latitude: parseFloat(nftDetails.latitude),
              longitude: parseFloat(nftDetails.longitude),
              radius: parseInt(nftDetails.radius_meters)
            },
            keypair
          );
          
          console.log('✅ NFT minted on blockchain:', mintResult);
          setSuccess('NFT pinned and minted on blockchain successfully!');
        } else {
          console.log('⚠️ Wallet not connected, skipping blockchain minting');
          setSuccess('NFT pinned to database successfully! (Blockchain minting skipped - wallet not connected)');
        }
      } catch (blockchainError) {
        console.error('❌ Blockchain minting failed:', blockchainError);
        setSuccess('NFT pinned to database successfully! (Blockchain minting failed - check console for details)');
      }
      
      if (onPinComplete) {
        onPinComplete(response.data.nft);
      }
      
      // Close dialog after a short delay
      setTimeout(() => {
        onClose();
        setActiveStep(0);
        setSelectedUpload(null);
        setNftDetails({
          collection_id: '',
          latitude: '',
          longitude: '',
          radius_meters: 10,
          smart_contract_address: '',
          rarity_requirements: {}
        });
      }, 3000);
      
    } catch (error) {
      console.error('Error pinning NFT:', error);
      setError('Failed to pin NFT');
    } finally {
      setPinning(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <PinIcon sx={{ mr: 1 }} />
          Enhanced Pin NFT (Blockchain)
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {/* Step 1: File Upload */}
            <Step>
              <StepLabel>Upload & Pin File</StepLabel>
              <StepContent>
                <Box>
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                      {error}
                    </Alert>
                  )}

                  {success && (
                    <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                      {success}
                    </Alert>
                  )}

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Button
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        fullWidth
                        sx={{ py: 2 }}
                      >
                        {selectedFile ? `Selected: ${selectedFile.name}` : 'Select File to Upload'}
                      </Button>
                      
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        style={{ display: 'none' }}
                      />
                    </Grid>

                    {/* File Preview */}
                    {selectedFile && (
                      <Grid item xs={12}>
                        <Card sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                          <Typography variant="subtitle2" gutterBottom>
                            File Preview:
                          </Typography>
                          <Box sx={{ textAlign: 'center' }}>
                            <img
                              src={URL.createObjectURL(selectedFile)}
                              alt={selectedFile.name}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '200px',
                                objectFit: 'contain',
                                border: '1px solid #ddd',
                                borderRadius: '8px'
                              }}
                            />
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                              {selectedFile.name} • {formatFileSize(selectedFile.size)}
                            </Typography>
                          </Box>
                        </Card>
                      </Grid>
                    )}

                    {selectedFile && (
                      <>
                        <Grid item xs={12} sm={6}>
                          <FormControl fullWidth>
                            <InputLabel>IPFS Server</InputLabel>
                            <Select
                              value={selectedServer}
                              onChange={(e) => setSelectedServer(e.target.value)}
                              label="IPFS Server"
                            >
                              {servers.map((server) => (
                                <MenuItem key={server.id} value={server.id}>
                                  {server.server_name} ({server.server_type})
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <Button
                            variant="contained"
                            onClick={handleUpload}
                            disabled={uploading || !selectedServer}
                            fullWidth
                          >
                            {uploading ? `Uploading... ${uploadProgress}%` : 'Upload & Pin'}
                          </Button>
                        </Grid>

                        {uploading && (
                          <Grid item xs={12}>
                            <LinearProgress variant="determinate" value={uploadProgress} />
                          </Grid>
                        )}
                      </>
                    )}

                    {/* Show pinned files */}
                    {uploads.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                          Available Pinned Files:
                        </Typography>
                        <List>
                          {uploads.map((upload) => (
                            <ListItem key={upload.id} divider>
                              <ListItemIcon>
                                {upload.mime_type && upload.mime_type.startsWith('image/') ? (
                                  <Box sx={{ width: 40, height: 40, borderRadius: 1, overflow: 'hidden', border: '1px solid #ddd' }}>
                                    {(() => {
                                      // Get the server details for this upload
                                      const server = servers.find(s => s.id === upload.ipfs_server_id);
                                      
                                      // Construct the IPFS URL
                                      let ipfsUrl = '';
                                      if (server && upload.ipfs_hash) {
                                        // Clean the server URL - remove any existing /ipfs/ path and trailing slashes
                                        let baseUrl = server.server_url.replace(/\/ipfs\/.*$/, '').replace(/\/$/, '');
                                        
                                        // Ensure it has https:// protocol
                                        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                                          baseUrl = `https://${baseUrl}`;
                                        }
                                        
                                        ipfsUrl = `${baseUrl}/ipfs/${upload.ipfs_hash}`;
                                        console.log('🖼️ Small preview IPFS URL:', ipfsUrl);
                                      }
                                      
                                      return (
                                        <img
                                          src={ipfsUrl || getApiUrl(`/ipfs/files/${upload.user_id || 'unknown'}/${upload.file_path}`)}
                                          alt={upload.original_filename}
                                          style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                          }}
                                          onError={(e) => {
                                            console.error('❌ Small preview failed:', e.target.src);
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                          }}
                                        />
                                      );
                                    })()}
                                    <Box 
                                      sx={{ 
                                        width: '100%', 
                                        height: '100%', 
                                        display: 'none', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        backgroundColor: '#f5f5f5'
                                      }}
                                    >
                                      <CheckIcon color="primary" />
                                    </Box>
                                  </Box>
                                ) : (
                                  <CheckIcon color="primary" />
                                )}
                              </ListItemIcon>
                              <ListItemText
                                primary={upload.original_filename}
                                secondary={`${formatFileSize(upload.file_size)} • ${upload.server_name}`}
                              />
                              <ListItemSecondaryAction>
                                <Button
                                  size="small"
                                  onClick={() => setSelectedUpload(upload.id)}
                                  variant={selectedUpload === upload.id ? 'contained' : 'outlined'}
                                >
                                  {selectedUpload === upload.id ? 'Selected' : 'Select'}
                                </Button>
                              </ListItemSecondaryAction>
                            </ListItem>
                          ))}
                        </List>
                      </Grid>
                    )}
                  </Grid>

                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      disabled={uploads.length === 0}
                    >
                      Next: NFT Details
                    </Button>
                  </Box>
                </Box>
              </StepContent>
            </Step>

            {/* Step 2: NFT Details */}
            <Step>
              <StepLabel>NFT Details</StepLabel>
              <StepContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required>
                      <InputLabel>Collection</InputLabel>
                      <Select
                        value={nftDetails.collection_id}
                        onChange={(e) => handleCollectionChange(e.target.value)}
                        label="Collection"
                      >
                        <MenuItem value="">
                          <em>Select a collection</em>
                        </MenuItem>
                        {collections.map((collection) => (
                          <MenuItem key={collection.id} value={collection.id}>
                            {collection.name} ({collection.id})
                          </MenuItem>
                        ))}
                        <MenuItem value="create-new">
                          <em>+ Create New Collection</em>
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Smart Contract</InputLabel>
                      <Select
                        value={nftDetails.smart_contract_address}
                        onChange={(e) => setNftDetails({ ...nftDetails, smart_contract_address: e.target.value })}
                        label="Smart Contract"
                      >
                        {contracts.map((contract) => (
                          <MenuItem key={contract.id} value={contract.address}>
                            {contract.name} {contract.address && `(${contract.address.slice(0, 8)}...)`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Latitude"
                      type="number"
                      value={nftDetails.latitude}
                      onChange={(e) => setNftDetails({ ...nftDetails, latitude: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Longitude"
                      type="number"
                      value={nftDetails.longitude}
                      onChange={(e) => setNftDetails({ ...nftDetails, longitude: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Radius (meters)"
                      type="number"
                      value={nftDetails.radius_meters}
                      onChange={(e) => setNftDetails({ ...nftDetails, radius_meters: e.target.value })}
                    />
                  </Grid>
                  
                  {/* Map Pinner */}
                  <Grid item xs={12}>
                    <Card sx={{ p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Location Selection
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Click on the map to set the exact location for your NFT
                      </Typography>
                      
                      <Box 
                        ref={mapContainer}
                        sx={{ 
                          height: 400, 
                          width: '100%',
                          borderRadius: 1,
                          overflow: 'hidden',
                          position: 'relative',
                          zIndex: 1,
                          pointerEvents: 'auto'
                        }}
                      />
                      
                      {/* Current coordinates display */}
                      <Box sx={{ mt: 2, p: 1, backgroundColor: 'white', borderRadius: 1 }}>
                        <Typography variant="body2">
                          <strong>Selected Location:</strong> {nftDetails.latitude && nftDetails.longitude 
                            ? `${nftDetails.latitude}, ${nftDetails.longitude}` 
                            : 'Click on the map to select a location'
                          }
                        </Typography>
                      </Box>
                    </Card>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                  <Button onClick={handleBack} sx={{ mr: 1 }}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={!nftDetails.collection_id || !nftDetails.latitude || !nftDetails.longitude}
                  >
                    Next: Review & Pin
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 3: Review & Pin */}
            <Step>
              <StepLabel>Review & Pin NFT</StepLabel>
              <StepContent>
                <Box>
                  {!selectedUpload && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Please go back to Step 1 and select an uploaded file.
                    </Alert>
                  )}
                  
                  {selectedUpload && !uploads.find(u => u.id === selectedUpload) && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Loading file details...
                    </Alert>
                  )}
                  
                  {selectedUpload && uploads.find(u => u.id === selectedUpload) && (
                    <>
                      <Typography variant="h6" gutterBottom>
                        Review NFT Details:
                      </Typography>
                      
                      <Card sx={{ mb: 2 }}>
                        <CardContent>
                          <Typography variant="body1" gutterBottom>
                            <strong>File:</strong> {uploads.find(u => u.id === selectedUpload)?.original_filename || 'N/A'}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            <strong>IPFS Hash:</strong> {uploads.find(u => u.id === selectedUpload)?.ipfs_hash || 'Pinning...'}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            <strong>Status:</strong> {uploads.find(u => u.id === selectedUpload)?.upload_status || 'unknown'}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            <strong>Collection ID:</strong> {nftDetails.collection_id || 'Not selected'}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            <strong>Location:</strong> {nftDetails.latitude && nftDetails.longitude 
                              ? `${nftDetails.latitude}, ${nftDetails.longitude}` 
                              : 'Not set'}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            <strong>Radius:</strong> {nftDetails.radius_meters || 10} meters
                          </Typography>
                          {nftDetails.smart_contract_address && (
                            <Typography variant="body1" gutterBottom>
                              <strong>Contract:</strong> {nftDetails.smart_contract_address}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>

                      {/* NFT Preview */}
                      <Card sx={{ mb: 2 }}>
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            NFT Preview:
                          </Typography>
                          <Box sx={{ textAlign: 'center' }}>
                            {(() => {
                              const upload = uploads.find(u => u.id === selectedUpload);
                              if (upload && upload.mime_type && upload.mime_type.startsWith('image/')) {
                                // Get the server details for this upload
                                const server = servers.find(s => s.id === upload.ipfs_server_id);
                                
                                // Construct the IPFS URL
                                let ipfsUrl = '';
                                if (server && upload.ipfs_hash) {
                                  // Clean the server URL - remove any existing /ipfs/ path and trailing slashes
                                  let baseUrl = server.server_url.replace(/\/ipfs\/.*$/, '').replace(/\/$/, '');
                                  
                                  // Ensure it has https:// protocol
                                  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                                    baseUrl = `https://${baseUrl}`;
                                  }
                                  
                                  // Construct full IPFS URL
                                  ipfsUrl = `${baseUrl}/ipfs/${upload.ipfs_hash}/${upload.original_filename}`;
                                }
                                
                                // Fallback to local file if IPFS hash not available yet
                                const fallbackUrl = upload.ipfs_hash 
                                  ? null 
                                  : (() => {
                                      const getApiBaseURL = () => {
                                        if (typeof window !== 'undefined' && window.location) {
                                          const hostname = window.location.hostname || '';
                                          const protocol = window.location.protocol || 'https:';
                                          if (hostname.includes('stellargeolink.com') || hostname.includes('azurewebsites.net') || protocol === 'https:') {
                                            return `${protocol}//${hostname}/api`;
                                          }
                                        }
                                        return process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
                                      };
                                      return `${getApiBaseURL()}/ipfs/files/${upload.user_id || 'unknown'}/${upload.file_path}`;
                                    })();
                                
                                return (
                                  <img
                                    src={ipfsUrl || fallbackUrl}
                                    alt={upload.original_filename}
                                    style={{
                                      maxWidth: '100%',
                                      maxHeight: '300px',
                                      objectFit: 'contain',
                                      border: '1px solid #ddd',
                                      borderRadius: '8px'
                                    }}
                                    onError={(e) => {
                                      console.error('❌ Preview failed:', e.target.src);
                                      if (e.target.nextSibling) {
                                        e.target.nextSibling.style.display = 'block';
                                      }
                                    }}
                                  />
                                );
                              }
                              return (
                                <Typography variant="body2" color="text.secondary">
                                  Preview not available for this file type
                                </Typography>
                              );
                            })()}
                            <Typography 
                              variant="body2" 
                              color="error" 
                              sx={{ display: 'none', mt: 2 }}
                            >
                              Preview not available
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>

                      <Box sx={{ mt: 2 }}>
                        <Button onClick={handleBack} sx={{ mr: 1 }}>
                          Back
                        </Button>
                        <Button
                          variant="contained"
                          onClick={handlePinNFT}
                          disabled={pinning || !uploads.find(u => u.id === selectedUpload)?.ipfs_hash}
                          startIcon={pinning ? <CircularProgress size={20} /> : <PinIcon />}
                        >
                          {pinning ? 'Pinning NFT...' : 'Pin NFT to Blockchain'}
                        </Button>
                        {!uploads.find(u => u.id === selectedUpload)?.ipfs_hash && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 2, display: 'inline-block' }}>
                            Waiting for IPFS pinning to complete...
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                </Box>
              </StepContent>
            </Step>
          </Stepper>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EnhancedPinNFT;
