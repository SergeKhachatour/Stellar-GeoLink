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
  FormLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Send as SendIcon,
  Create as CreateIcon,
  LocationOn as LocationIcon,
  CloudUpload as UploadIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import realNFTService from '../../services/realNFTService';

const RealPinNFT = ({ onClose, onSuccess }) => {
  const {
    isConnected,
    publicKey,
    secretKey,
    loading,
    error,
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
  
  const [successMessage, setSuccessMessage] = useState('');

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

  // Load contracts and user NFTs on mount
  useEffect(() => {
    if (isConnected) {
      loadContracts();
      loadUserNFTs();
    }
  }, [isConnected, loadUserNFTs]);

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

  const handleInitializeContract = async () => {
    try {
      if (!secretKey) {
        throw new Error('Secret key not available. Please ensure your wallet is properly connected with full access.');
      }

      if (!selectedContract) {
        throw new Error('Please select a contract to initialize.');
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      
      console.log('Initializing contract:', selectedContract);
      
      // Get contract deployment service
      const contractDeploymentService = await import('../../services/contractDeployment');
      const deploymentService = contractDeploymentService.default;
      await deploymentService.initialize();
      
      // Initialize the contract
      const result = await deploymentService.initializeContract(
        selectedContract,
        keypair,
        'StellarGeoLinkNFT',
        'SGL'
      );

      console.log('Contract initialized:', result);
      
      // Show success message
      setSuccessMessage(`✅ Contract is ready for use! The contract is already deployed and functional for minting NFTs!`);
      setTimeout(() => setSuccessMessage(''), 8000); // Clear after 8 seconds
      
    } catch (error) {
      console.error('Failed to initialize contract:', error);
      console.error(`❌ Contract initialization failed: ${error.message}`);
    }
  };

  const handleMintNFT = async () => {
    try {
      if (!secretKey) {
        throw new Error('Secret key required for minting');
      }

      if (!selectedContract) {
        throw new Error('Please select a contract');
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      
      // Mint NFT with location validation
      const result = await realNFTService.mintLocationNFT(
        selectedContract,
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
      
      // Show success message with StellarExpert link
      setSuccessMessage(`✅ NFT minted successfully on Stellar testnet! Token ID: ${result.tokenId}, Name: ${mintForm.name}, Contract: ${selectedContract}. View on StellarExpert: https://stellar.expert/explorer/testnet/contract/${selectedContract}`);
      setTimeout(() => setSuccessMessage(''), 8000); // Clear after 8 seconds
      
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
      
      onSuccess && onSuccess(result);
      onClose && onClose();
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      console.error(`❌ NFT minting failed: ${error.message}`);
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

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radius: 100
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {/* Contract Management */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Contract Management
          </Typography>
          {selectedContract && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Selected Contract:</strong> {contracts.find(c => c.contractId === selectedContract)?.name || selectedContract}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Contract ID:</strong> {selectedContract}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <a 
                  href={`https://stellar.expert/explorer/testnet/contract/${selectedContract}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#1976d2', textDecoration: 'underline' }}
                >
                  🔗 View on StellarExpert Testnet (Simulated Contract)
                </a>
              </Typography>
            </Alert>
          )}
          
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Select Contract ({contracts.length} available)</InputLabel>
                <Select
                  value={selectedContract}
                  onChange={(e) => {
                    console.log('Contract selection changed:', e.target.value);
                    setSelectedContract(e.target.value);
                  }}
                  sx={{ zIndex: 10000 }}
                  MenuProps={{
                    sx: { zIndex: 10000 }
                  }}
                >
                  {contracts.length === 0 ? (
                    <MenuItem disabled>No contracts available - Deploy a contract first</MenuItem>
                  ) : (
                    contracts.map((contract) => (
                      <MenuItem key={contract.contractId} value={contract.contractId}>
                        {contract.name} ({contract.contractId})
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleInitializeContract}
                fullWidth
                disabled={!selectedContract}
                sx={{ mb: 1 }}
              >
                Verify Contract Ready
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setDeployDialog(true)}
                fullWidth
              >
                Deploy New Contract
              </Button>
            </Grid>
          </Grid>

          {contracts.length === 0 && (
            <Alert severity="info">
              No contracts deployed. Deploy a new contract to get started.
            </Alert>
          )}
        </CardContent>
      </Card>

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
            {!selectedContract && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Please select a contract from the dropdown above to enable minting.
              </Alert>
            )}
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="NFT Name"
                  value={mintForm.name}
                  onChange={(e) => setMintForm({ ...mintForm, name: e.target.value })}
                  fullWidth
                  disabled={!selectedContract}
                  helperText={!selectedContract ? "Please select a contract first" : ""}
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
                  disabled={!selectedContract}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="IPFS Hash"
                  value={mintForm.ipfsHash}
                  onChange={(e) => setMintForm({ ...mintForm, ipfsHash: e.target.value })}
                  fullWidth
                  disabled={!selectedContract}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Filename"
                  value={mintForm.filename}
                  onChange={(e) => setMintForm({ ...mintForm, filename: e.target.value })}
                  fullWidth
                  disabled={!selectedContract}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Server URL"
                  value={mintForm.serverUrl}
                  onChange={(e) => setMintForm({ ...mintForm, serverUrl: e.target.value })}
                  fullWidth
                  disabled={!selectedContract}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Location: {location.latitude ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Not set'}
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<LocationIcon />}
                  onClick={getCurrentLocation}
                  fullWidth
                >
                  {location.latitude ? 'Update Location' : 'Set Location from Map Pin'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Note: For NFT minting, drop a pin on the map to set the location, then click this button to use that location.
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<CreateIcon />}
                  onClick={handleMintNFT}
                  disabled={loading || !selectedContract}
                  fullWidth
                >
                  {loading ? <CircularProgress size={20} /> : 'Mint NFT'}
                </Button>
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

    </Box>
  );
};

export default RealPinNFT;
