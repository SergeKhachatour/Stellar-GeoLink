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
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Stack,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Send as SendIcon,
  Receipt as ReceiptIcon,
  History as HistoryIcon,
  MonetizationOn as PriceIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Visibility as ViewIcon,
  Edit as EditIcon
} from '@mui/icons-material';

const NFTTransfer = () => {
  const [userNFTs, setUserNFTs] = useState([]);
  const [transferHistory, setTransferHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [transferData, setTransferData] = useState({
    to_user: '',
    price: '',
    message: '',
    transfer_type: 'transfer',
    smart_contract_tx: ''
  });
  const [verificationData, setVerificationData] = useState({
    user_signature: '',
    recipient_signature: '',
    blockchain_verification: false
  });

  useEffect(() => {
    fetchUserNFTs();
    fetchTransferHistory();
  }, []);

  const fetchUserNFTs = async () => {
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
      setError('Failed to fetch user NFTs');
      console.error('Error fetching user NFTs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransferHistory = async () => {
    try {
      // TODO: Replace with actual API call
      // const response = await api.get('/nft/transfers');
      // setTransferHistory(response.data);
      
      // Mock data for now
      setTransferHistory([
        {
          id: 1,
          nft_id: 1,
          from_user: null,
          to_user: 'GTestUser123456789',
          transfer_type: 'collect',
          transferred_at: '2024-01-15T10:30:00Z',
          transaction_hash: 'tx123456789abcdef',
          smart_contract_tx: 'sc123456789abcdef',
          status: 'completed',
          nft: {
            collection: {
              name: 'Stellar Explorer',
              rarity_level: 'common'
            }
          }
        },
        {
          id: 2,
          nft_id: 2,
          from_user: 'GPreviousUser987654321',
          to_user: 'GTestUser123456789',
          transfer_type: 'transfer',
          transferred_at: '2024-01-16T14:20:00Z',
          transaction_hash: 'tx987654321fedcba',
          smart_contract_tx: 'sc987654321fedcba',
          status: 'completed',
          nft: {
            collection: {
              name: 'Galaxy Guardian',
              rarity_level: 'rare'
            }
          }
        }
      ]);
    } catch (err) {
      setError('Failed to fetch transfer history');
      console.error('Error fetching transfer history:', err);
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckIcon color="success" />;
      case 'pending': return <PendingIcon color="warning" />;
      case 'failed': return <CancelIcon color="error" />;
      default: return <PendingIcon />;
    }
  };

  const handleTransferNFT = (nft) => {
    setSelectedNFT(nft);
    setTransferData({
      to_user: '',
      price: '',
      message: '',
      transfer_type: 'transfer',
      smart_contract_tx: ''
    });
    setVerificationData({
      user_signature: '',
      recipient_signature: '',
      blockchain_verification: false
    });
    setActiveStep(0);
    setOpenDialog(true);
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmitTransfer = async () => {
    try {
      // await api.post('/nft/transfer', {
      //   nft_id: selectedNFT.nft_id,
      //   ...transferData,
      //   ...verificationData
      // });
      console.log('Transfer NFT:', selectedNFT.nft_id, transferData, verificationData);
      alert('NFT transfer initiated successfully!');
      setOpenDialog(false);
      fetchUserNFTs();
      fetchTransferHistory();
    } catch (err) {
      setError('Failed to transfer NFT');
      console.error('Error transferring NFT:', err);
    }
  };

  const steps = [
    'Transfer Details',
    'Verification',
    'Confirmation'
  ];

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
          NFT Transfer
        </Typography>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={() => setOpenDialog(true)}
        >
          New Transfer
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Your NFTs ({userNFTs.length})
            </Typography>
            <List>
              {userNFTs.map((userNFT) => (
                <ListItem key={userNFT.id}>
                  <ListItemAvatar>
                    <Avatar src={userNFT.nft.collection.image_url} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={userNFT.nft.collection.name}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {userNFT.nft.collection.description}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1} mt={1}>
                          <Chip
                            label={userNFT.nft.collection.rarity_level}
                            color={getRarityColor(userNFT.nft.collection.rarity_level)}
                            size="small"
                          />
                          <Typography variant="caption">
                            Transfers: {userNFT.transfer_count}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  <Button
                    size="small"
                    startIcon={<SendIcon />}
                    onClick={() => handleTransferNFT(userNFT)}
                  >
                    Transfer
                  </Button>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Transfer History
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>NFT</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>From</TableCell>
                    <TableCell>To</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transferHistory.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <Typography variant="body2">
                            {transfer.nft.collection.name}
                          </Typography>
                          <Chip
                            label={transfer.nft.collection.rarity_level}
                            color={getRarityColor(transfer.nft.collection.rarity_level)}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={transfer.transfer_type}
                          color={transfer.transfer_type === 'collect' ? 'success' : 'primary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.7rem">
                          {transfer.from_user ? `${transfer.from_user.substring(0, 8)}...` : 'Minted'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.7rem">
                          {transfer.to_user.substring(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(transfer.transferred_at).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getStatusIcon(transfer.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Transfer Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Transfer NFT: {selectedNFT?.nft.collection.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Stepper activeStep={activeStep} orientation="vertical">
              <Step>
                <StepLabel>Transfer Details</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <TextField
                      fullWidth
                      label="Recipient Public Key"
                      value={transferData.to_user}
                      onChange={(e) => setTransferData({ ...transferData, to_user: e.target.value })}
                      margin="normal"
                      placeholder="GRecipientAddress123456789"
                    />
                    
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Transfer Type</InputLabel>
                      <Select
                        value={transferData.transfer_type}
                        onChange={(e) => setTransferData({ ...transferData, transfer_type: e.target.value })}
                      >
                        <MenuItem value="transfer">Free Transfer</MenuItem>
                        <MenuItem value="sale">Sale</MenuItem>
                        <MenuItem value="gift">Gift</MenuItem>
                      </Select>
                    </FormControl>
                    
                    {transferData.transfer_type === 'sale' && (
                      <TextField
                        fullWidth
                        label="Sale Price (XLM)"
                        value={transferData.price}
                        onChange={(e) => setTransferData({ ...transferData, price: e.target.value })}
                        margin="normal"
                        type="number"
                        placeholder="0.00"
                      />
                    )}
                    
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
                  <Box>
                    <Button onClick={handleNext} variant="contained">
                      Next
                    </Button>
                  </Box>
                </StepContent>
              </Step>
              
              <Step>
                <StepLabel>Verification</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Please verify the transfer details and provide your digital signature.
                    </Alert>
                    
                    <TextField
                      fullWidth
                      label="Your Digital Signature"
                      value={verificationData.user_signature}
                      onChange={(e) => setVerificationData({ ...verificationData, user_signature: e.target.value })}
                      margin="normal"
                      placeholder="Enter your signature..."
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          checked={verificationData.blockchain_verification}
                          onChange={(e) => setVerificationData({ ...verificationData, blockchain_verification: e.target.checked })}
                        />
                      }
                      label="Enable blockchain verification"
                    />
                  </Box>
                  <Box>
                    <Button onClick={handleBack} sx={{ mr: 1 }}>
                      Back
                    </Button>
                    <Button onClick={handleNext} variant="contained">
                      Next
                    </Button>
                  </Box>
                </StepContent>
              </Step>
              
              <Step>
                <StepLabel>Confirmation</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Please review all details before confirming the transfer. This action cannot be undone.
                    </Alert>
                    
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Transfer Summary
                      </Typography>
                      <Stack spacing={1}>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">NFT:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {selectedNFT?.nft.collection.name}
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Recipient:</Typography>
                          <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                            {transferData.to_user}
                          </Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Type:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {transferData.transfer_type}
                          </Typography>
                        </Box>
                        {transferData.price && (
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2">Price:</Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {transferData.price} XLM
                            </Typography>
                          </Box>
                        )}
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2">Blockchain Verification:</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {verificationData.blockchain_verification ? 'Enabled' : 'Disabled'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </Box>
                  <Box>
                    <Button onClick={handleBack} sx={{ mr: 1 }}>
                      Back
                    </Button>
                    <Button onClick={handleSubmitTransfer} variant="contained" color="success">
                      Confirm Transfer
                    </Button>
                  </Box>
                </StepContent>
              </Step>
            </Stepper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default NFTTransfer;
