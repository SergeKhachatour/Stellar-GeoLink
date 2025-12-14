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
import webauthnService from '../../services/webauthnService';

// Set Mapbox token
Mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const EnhancedPinNFT = ({ onPinComplete, open, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [servers, setServers] = useState([]);
  const [uploads, setUploads] = useState([]);
  
  // Get wallet context
  const { isConnected, publicKey, secretKey, upgradeToFullAccess, loading: walletLoading } = useWallet();
  const [collections, setCollections] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Upgrade dialog state
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeSecretKey, setUpgradeSecretKey] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  
  // Payment flow state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [smartWalletBalance, setSmartWalletBalance] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [selectedPasskey, setSelectedPasskey] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('1.0'); // Default 1 XLM
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [checkingBalance, setCheckingBalance] = useState(false);
  
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
      // Fetch smart wallet balance and passkeys if user is connected
      const savedPublicKey = localStorage.getItem('stellar_public_key');
      const effectivePublicKey = publicKey || savedPublicKey;
      if (effectivePublicKey) {
        fetchSmartWalletBalance(effectivePublicKey);
        fetchPasskeys();
      }
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

  // Fetch smart wallet balance
  const fetchSmartWalletBalance = async (userPublicKey) => {
    if (!userPublicKey) return null;
    
    setCheckingBalance(true);
    try {
      const response = await api.get('/smart-wallet/balance', {
        params: { userPublicKey }
      });
      setSmartWalletBalance(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching smart wallet balance:', error);
      // Return zero balance if error (contract might not be initialized)
      return { balance: '0', balanceInXLM: '0' };
    } finally {
      setCheckingBalance(false);
    }
  };

  // Fetch user's registered passkeys
  const fetchPasskeys = async () => {
    try {
      const response = await api.get('/webauthn/passkeys');
      setPasskeys(response.data.passkeys || []);
      return response.data.passkeys || [];
    } catch (error) {
      console.error('Error fetching passkeys:', error);
      setPasskeys([]);
      return [];
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
        console.log('🚀 Starting pin request for upload:', uploadedFileId);
        const pinResponse = await api.post(`/ipfs/pin/${uploadedFileId}`);
        console.log('📌 Pin initiated:', pinResponse.data);
        
        // Poll for pin status
        setSuccess('File uploaded! Waiting for IPFS pinning to complete...');
        setUploadProgress(60);
        console.log('🔄 Starting polling for pin status...');
        
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
            
            const status = updatedUpload?.upload_status || 'not found';
            const hash = updatedUpload?.ipfs_hash || 'none';
            console.log(`🔄 [${new Date().toLocaleTimeString()}] Polling attempt ${attempts}/${maxAttempts} - Upload ID: ${uploadedFileId}, Status: ${status}, IPFS Hash: ${hash}`);
            
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
        console.error('❌ Error pinning file:', pinError);
        console.error('❌ Pin error response:', pinError.response?.data);
        console.error('❌ Pin error status:', pinError.response?.status);
        console.error('❌ Pin error message:', pinError.message);
        const errorMessage = pinError.response?.data?.error 
          ? `IPFS pinning failed: ${pinError.response.data.error}` 
          : (pinError.response?.data?.details 
            ? `IPFS pinning failed: ${pinError.response.data.details}` 
            : `Failed to start IPFS pinning: ${pinError.message || 'Unknown error'}. Please check your Pinata API credentials in the IPFS server settings.`);
        setError(errorMessage);
        setUploadProgress(0);
        setUploading(false);
        await fetchUploads(); // Refresh list anyway
      } finally {
        setUploading(false);
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

  // Execute payment and then mint NFT
  const executePaymentAndMint = async (userPublicKey, userSecretKey, upload, contractId) => {
    try {
      setPaymentLoading(true);
      setPaymentError('');
      
      // Get contract ID for NFT minting
      let nftContractId = contractId || nftDetails.smart_contract_address;
      if (!nftContractId) {
        // Auto-initialize contract if needed
        console.log('📝 Auto-initializing contract...');
        const realNFTService = await import('../../services/realNFTService');
        const { default: RealNFTService } = realNFTService;
        const StellarSdk = await import('@stellar/stellar-sdk');
        const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
        
        const contractInfo = await RealNFTService.deployLocationNFTContract(
          keypair,
          'StellarGeoLinkNFT'
        );
        nftContractId = contractInfo.contractId;
        console.log('✅ Contract initialized:', nftContractId);
      }
      
      // Get selected passkey (should be set before calling this function)
      if (!selectedPasskey) {
        throw new Error('No passkey selected');
      }
      
      // Get passkey public key from backend
      const passkeysResponse = await api.get('/webauthn/passkeys');
      const passkeyInfo = passkeysResponse.data.passkeys.find(
        p => p.credentialId === selectedPasskey.credentialId
      );
      
      if (!passkeyInfo || !passkeyInfo.publicKey) {
        throw new Error('Passkey data not found. Please ensure your passkey is properly registered with a public key.');
      }
      
      console.log('💳 Executing payment via smart wallet...');
      
      // Create transaction data for signature
      const transactionData = {
        source: userPublicKey,
        destination: nftContractId, // NFT contract receives payment
        amount: (parseFloat(paymentAmount) * 10000000).toString(), // Convert to stroops
        asset: 'native'
      };
      const signaturePayload = JSON.stringify(transactionData);
      
      // Authenticate with passkey
      const authResult = await webauthnService.authenticateWithPasskey(
        selectedPasskey.credentialId,
        signaturePayload
      );
      
      // Call backend to execute payment
      const paymentResponse = await api.post('/smart-wallet/execute-payment', {
        userPublicKey,
        userSecretKey,
        destinationAddress: nftContractId,
        amount: transactionData.amount, // In stroops
        assetAddress: null, // Native XLM
        signaturePayload,
        passkeyPublicKeySPKI: passkeyInfo.publicKey, // SPKI format from backend
        webauthnSignature: authResult.signature,
        webauthnAuthenticatorData: authResult.authenticatorData,
        webauthnClientData: authResult.clientDataJSON
      });
      
      const paymentResult = paymentResponse.data;
      
      console.log('✅ Payment executed:', paymentResult);
      
      // Step 4: Mint NFT after successful payment
      console.log('🚀 Minting NFT on blockchain...');
      const realNFTService = await import('../../services/realNFTService');
      const { default: RealNFTService } = realNFTService;
      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(userSecretKey);
      
      const mintResult = await RealNFTService.mintLocationNFT(
        nftContractId,
        userPublicKey,
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
      setSuccess('Payment executed and NFT minted successfully!');
      setShowPaymentDialog(false);
      
      // Return mint result for onPinComplete
      return mintResult;
      
    } catch (error) {
      console.error('❌ Payment or minting failed:', error);
      setPaymentError(error.message || 'Payment or minting failed');
      throw error;
    } finally {
      setPaymentLoading(false);
    }
  };

  // Handle payment dialog confirmation
  const handleConfirmPayment = async () => {
    if (!selectedPasskey) {
      setPaymentError('Please select a passkey');
      return;
    }
    
    try {
      setPaymentLoading(true);
      setPaymentError('');
      
      const savedSecretKey = localStorage.getItem('stellar_secret_key');
      const savedPublicKey = localStorage.getItem('stellar_public_key');
      const effectiveSecretKey = secretKey || savedSecretKey;
      const effectivePublicKey = publicKey || savedPublicKey;
      
      const upload = uploads.find(u => u.id === selectedUpload);
      let contractId = nftDetails.smart_contract_address;
      
      // Execute payment and mint
      const mintResult = await executePaymentAndMint(
        effectivePublicKey,
        effectiveSecretKey,
        upload,
        contractId
      );
      
      // Update mintResult for onPinComplete
      setPinning(false);
      
      // Call onPinComplete with results
      if (onPinComplete) {
        const response = await api.post('/nft/pin', {
          collection_id: nftDetails.collection_id,
          latitude: parseFloat(nftDetails.latitude),
          longitude: parseFloat(nftDetails.longitude),
          radius_meters: parseInt(nftDetails.radius_meters),
          ipfs_hash: upload.ipfs_hash,
          smart_contract_address: contractId,
          filename: upload.original_filename,
          nft_upload_id: upload.id
        });
        
        const dbNft = response.data.nft;
        const successData = {
          tokenId: mintResult.tokenId,
          name: upload.original_filename,
          contractId: mintResult.contractId || contractId,
          transactionHash: mintResult.hash || mintResult.transactionHash,
          status: 'success',
          ledger: mintResult.latestLedger || mintResult.ledger,
          location: {
            latitude: parseFloat(nftDetails.latitude),
            longitude: parseFloat(nftDetails.longitude),
            radius: parseInt(nftDetails.radius_meters)
          },
          nft: dbNft
        };
        onPinComplete(successData);
      }
      
    } catch (error) {
      console.error('Payment confirmation failed:', error);
      // Error already set in executePaymentAndMint
    }
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
      
      // Store mint result for passing to onPinComplete
      let mintResult = null;
      
      // Now mint on Stellar blockchain if wallet is connected
      try {
        // Import the real NFT service
        const realNFTService = await import('../../services/realNFTService');
        const { default: RealNFTService } = realNFTService;
        
        // Check if wallet is connected (using component-level wallet data)
        // Also check localStorage as fallback in case context values are stale
        const savedSecretKey = localStorage.getItem('stellar_secret_key');
        const savedPublicKey = localStorage.getItem('stellar_public_key');
        const effectiveSecretKey = secretKey || savedSecretKey;
        const effectivePublicKey = publicKey || savedPublicKey;
        
        // Check if we have the necessary credentials (don't rely solely on isConnected state)
        const hasCredentials = effectiveSecretKey && effectivePublicKey;
        
        // Expanded logging to see actual values
        console.log('🔍 Wallet connection check:');
        console.log('  isConnected:', isConnected);
        console.log('  secretKey from context:', secretKey ? `${secretKey.substring(0, 8)}...` : 'null');
        console.log('  savedSecretKey from localStorage:', savedSecretKey ? `${savedSecretKey.substring(0, 8)}...` : 'null');
        console.log('  effectiveSecretKey:', effectiveSecretKey ? `${effectiveSecretKey.substring(0, 8)}...` : 'null');
        console.log('  publicKey from context:', publicKey || 'null');
        console.log('  savedPublicKey from localStorage:', savedPublicKey || 'null');
        console.log('  effectivePublicKey:', effectivePublicKey || 'null');
        console.log('  hasCredentials:', hasCredentials);
        console.log('  willMint:', hasCredentials);
        
        // If wallet is connected but view-only (has public key but no secret key), prompt for upgrade
        if (effectivePublicKey && !effectiveSecretKey && isConnected) {
          console.log('⚠️ Wallet is view-only, prompting for secret key upgrade...');
          setPinning(false);
          setShowUpgradeDialog(true);
          return; // Exit early, will retry after upgrade
        }
        
        if (hasCredentials) {
          console.log('🚀 Starting NFT minting process with payment...');
          
          // Step 1: Check smart wallet balance
          const balanceData = await fetchSmartWalletBalance(effectivePublicKey);
          const balanceInXLM = parseFloat(balanceData?.balanceInXLM || '0');
          const requiredAmount = parseFloat(paymentAmount || '1.0');
          
          console.log('💰 Smart wallet balance check:', {
            balanceInXLM,
            requiredAmount,
            sufficient: balanceInXLM >= requiredAmount
          });
          
          if (balanceInXLM < requiredAmount) {
            setPinning(false);
            setError(`Insufficient balance. Required: ${requiredAmount} XLM, Available: ${balanceInXLM.toFixed(7)} XLM`);
            return;
          }
          
          // Step 2: Check for passkeys and prompt for payment
          const userPasskeys = await fetchPasskeys();
          
          if (userPasskeys.length === 0) {
            setPinning(false);
            setError('No passkeys registered. Please register a passkey in the Wallet Provider Dashboard before minting NFTs.');
            return;
          }
          
          // If only one passkey, auto-select it
          if (userPasskeys.length === 1) {
            setSelectedPasskey(userPasskeys[0]);
          } else {
            // Show payment dialog to select passkey
            setPinning(false);
            setShowPaymentDialog(true);
            return; // Exit early, will continue after payment
          }
          
          // Step 3: Execute payment (if we reach here, passkey is selected)
          await executePaymentAndMint(effectivePublicKey, effectiveSecretKey, upload, contractId);
          
        } else {
          console.log('⚠️ Wallet not connected, skipping blockchain minting', {
            isConnected,
            hasSecretKey: !!secretKey,
            hasSavedSecretKey: !!savedSecretKey,
            hasPublicKey: !!publicKey,
            hasSavedPublicKey: !!savedPublicKey
          });
          setSuccess('NFT pinned to database successfully! (Blockchain minting skipped - wallet not connected or no secret key)');
        }
      } catch (blockchainError) {
        console.error('❌ Blockchain minting failed:', blockchainError);
        setSuccess('NFT pinned to database successfully! (Blockchain minting failed - check console for details)');
      }
      
      // Prepare success data for onPinComplete callback
      if (onPinComplete) {
        const dbNft = response.data.nft;
        
        // If blockchain minting succeeded, format the data like RealPinNFT does
        if (mintResult) {
          const successData = {
            tokenId: mintResult.tokenId,
            name: upload.original_filename,
            contractId: mintResult.contractId || nftDetails.smart_contract_address,
            transactionHash: mintResult.hash || mintResult.transactionHash,
            status: mintResult.status || 'success',
            ledger: mintResult.latestLedger || mintResult.ledger,
            location: {
              latitude: parseFloat(nftDetails.latitude),
              longitude: parseFloat(nftDetails.longitude),
              radius: parseInt(nftDetails.radius_meters)
            },
            imageUrl: mintResult.metadata?.image_url || (server ? `${server.server_url.replace(/\/$/, '')}/ipfs/${upload.ipfs_hash}` : ''),
            stellarExpertUrl: mintResult.hash || mintResult.transactionHash 
              ? `https://stellar.expert/explorer/testnet/tx/${mintResult.hash || mintResult.transactionHash}` 
              : null,
            contractUrl: mintResult.contractId || nftDetails.smart_contract_address
              ? `https://stellar.expert/explorer/testnet/contract/${mintResult.contractId || nftDetails.smart_contract_address}`
              : null,
            nft: dbNft // Include database NFT data as well
          };
          console.log('📤 Passing success data to parent:', successData);
          onPinComplete(successData);
        } else {
          // If no blockchain minting, format database NFT data for success overlay
          const successData = {
            tokenId: dbNft.id || dbNft.token_id || 'N/A',
            name: upload.original_filename || dbNft.name || 'Unnamed NFT',
            contractId: nftDetails.smart_contract_address || dbNft.smart_contract_address || 'N/A',
            transactionHash: null,
            status: 'pinned_to_database',
            ledger: null,
            location: {
              latitude: parseFloat(nftDetails.latitude) || parseFloat(dbNft.latitude) || 0,
              longitude: parseFloat(nftDetails.longitude) || parseFloat(dbNft.longitude) || 0,
              radius: parseInt(nftDetails.radius_meters) || parseInt(dbNft.radius_meters) || 0
            },
            imageUrl: server ? `${server.server_url.replace(/\/$/, '')}/ipfs/${upload.ipfs_hash}` : null,
            stellarExpertUrl: null,
            contractUrl: nftDetails.smart_contract_address 
              ? `https://stellar.expert/explorer/testnet/contract/${nftDetails.smart_contract_address}`
              : null,
            nft: dbNft // Include database NFT data as well
          };
          console.log('📤 Passing database NFT data to parent (no blockchain minting):', successData);
          onPinComplete(successData);
        }
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
                                          src={ipfsUrl || (() => {
                                            // Fix double slash issue - remove leading slash from file_path if present
                                            const filePath = upload.file_path && upload.file_path.startsWith('/') 
                                              ? upload.file_path.substring(1) 
                                              : upload.file_path;
                                            return getApiUrl(`/ipfs/files/${upload.user_id || 'unknown'}/${filePath}`);
                                          })()}
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
                                  
                                  // Construct full IPFS URL (IPFS hash is the content identifier, no filename needed)
                                  ipfsUrl = `${baseUrl}/ipfs/${upload.ipfs_hash}`;
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
                                      // Fix double slash issue - remove leading slash from file_path if present
                                      const filePath = upload.file_path && upload.file_path.startsWith('/') 
                                        ? upload.file_path.substring(1) 
                                        : upload.file_path;
                                      return `${getApiBaseURL()}/ipfs/files/${upload.user_id || 'unknown'}/${filePath}`;
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

      {/* Upgrade to Full Access Dialog */}
      <Dialog 
        open={showUpgradeDialog} 
        onClose={() => {
          setShowUpgradeDialog(false);
          setUpgradeSecretKey('');
          setUpgradeError('');
        }} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Upgrade to Full Access</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your wallet is currently in view-only mode. To mint NFTs on the blockchain, 
            you need to provide your secret key to upgrade to full access.
          </Typography>
          
          <TextField
            label="Secret Key"
            type="password"
            value={upgradeSecretKey}
            onChange={(e) => {
              setUpgradeSecretKey(e.target.value);
              setUpgradeError('');
            }}
            fullWidth
            placeholder="Enter your secret key (starts with S...)"
            helperText="Your secret key will be stored locally and used for transactions"
            sx={{ mb: 2 }}
            error={!!upgradeError}
          />
          
          {upgradeError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {upgradeError}
            </Alert>
          )}
          
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Security Note:</strong> Your secret key is stored locally in your browser. 
              Make sure you're on a secure device and network.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setShowUpgradeDialog(false);
              setUpgradeSecretKey('');
              setUpgradeError('');
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={async () => {
              if (!upgradeSecretKey.trim()) {
                setUpgradeError('Please enter your secret key');
                return;
              }

              try {
                setUpgradeError('');
                await upgradeToFullAccess(upgradeSecretKey.trim());
                setShowUpgradeDialog(false);
                setUpgradeSecretKey('');
                
                // Retry pinning after upgrade
                setTimeout(() => {
                  handlePinNFT();
                }, 500);
              } catch (err) {
                setUpgradeError(err.message || 'Failed to upgrade wallet. Please check your secret key.');
              }
            }}
            variant="contained" 
            disabled={walletLoading || !upgradeSecretKey.trim()}
          >
            {walletLoading ? <CircularProgress size={20} /> : 'Upgrade to Full Access'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog 
        open={showPaymentDialog} 
        onClose={() => {
          if (!paymentLoading) {
            setShowPaymentDialog(false);
            setPaymentError('');
            setSelectedPasskey(null);
          }
        }} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Confirm Payment & Mint NFT</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            To mint this NFT, you need to pay {paymentAmount} XLM from your smart wallet using WebAuthn authentication.
          </Typography>
          
          {smartWalletBalance && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Smart Wallet Balance:</strong> {parseFloat(smartWalletBalance.balanceInXLM || '0').toFixed(7)} XLM
              </Typography>
              <Typography variant="body2">
                <strong>Required:</strong> {paymentAmount} XLM
              </Typography>
              {parseFloat(smartWalletBalance.balanceInXLM || '0') < parseFloat(paymentAmount) && (
                <Typography variant="body2" color="error">
                  ⚠️ Insufficient balance
                </Typography>
              )}
            </Alert>
          )}
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Passkey</InputLabel>
            <Select
              value={selectedPasskey?.credentialId || ''}
              onChange={(e) => {
                const passkey = passkeys.find(p => p.credentialId === e.target.value);
                setSelectedPasskey(passkey);
              }}
              label="Select Passkey"
            >
              {passkeys.map((passkey) => (
                <MenuItem key={passkey.credentialId} value={passkey.credentialId}>
                  Passkey registered {new Date(passkey.registeredAt).toLocaleDateString()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            label="Payment Amount (XLM)"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            fullWidth
            inputProps={{ min: '0.0000001', step: '0.0000001' }}
            sx={{ mb: 2 }}
            helperText="Amount to pay from smart wallet"
          />
          
          {paymentError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {paymentError}
            </Alert>
          )}
          
          {paymentLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">
                Processing payment and minting NFT...
              </Typography>
            </Box>
          )}
          
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Note:</strong> You will be prompted to authenticate with your passkey (fingerprint, Face ID, etc.) to authorize the payment.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setShowPaymentDialog(false);
              setPaymentError('');
              setSelectedPasskey(null);
            }}
            disabled={paymentLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmPayment}
            variant="contained"
            disabled={paymentLoading || !selectedPasskey || parseFloat(smartWalletBalance?.balanceInXLM || '0') < parseFloat(paymentAmount)}
            startIcon={paymentLoading ? <CircularProgress size={20} /> : null}
          >
            {paymentLoading ? 'Processing...' : 'Confirm & Pay'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default EnhancedPinNFT;
