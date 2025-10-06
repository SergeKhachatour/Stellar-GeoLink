import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Typography,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    Grid,
    Chip,
    Divider
} from '@mui/material';
import {
    Send,
    AccountBalanceWallet,
    Warning,
    CheckCircle
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import api from '../../services/api';

const NFTTransfer = ({ open, onClose, nft, onTransferComplete }) => {
    const { 
        isConnected, 
        publicKey, 
        sendTransaction, 
        loading: walletLoading,
        error: walletError 
    } = useWallet();

    const [recipientAddress, setRecipientAddress] = useState('');
    const [memo, setMemo] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [recipientError, setRecipientError] = useState(false);

    const handleTransfer = async () => {
        if (!isConnected) {
            setError('Please connect your wallet first');
            return;
        }

        if (!recipientAddress.trim()) {
            setError('Please enter recipient address');
            return;
        }

        if (!nft) {
            setError('No NFT selected for transfer');
            return;
        }

        try {
            setTransferring(true);
            setError('');
            setSuccess('');

            // Step 1: Create the transfer transaction on Stellar
            const transferData = {
                nft_id: nft.nft_id || nft.id, // Use nft_id from ownership record, fallback to id
                recipient_address: recipientAddress.trim(),
                memo: memo.trim() || null,
                sender_public_key: publicKey
            };

            // Step 2: Call backend to initiate transfer
            const response = await api.post('/nft/transfer', transferData);
            
            if (response.data.message && response.data.message.includes('successfully')) {
                // Transfer completed successfully in database
                setSuccess('NFT transferred successfully!');
                
                // Call completion callback
                if (onTransferComplete) {
                    onTransferComplete();
                }

                // Reset form
                setRecipientAddress('');
                setMemo('');
                
                // Close dialog after a short delay
                setTimeout(() => {
                    onClose();
                }, 2000);
            } else {
                throw new Error('Failed to create transfer transaction');
            }

        } catch (err) {
            console.error('Transfer error:', err);
            setError(err.message || 'Failed to transfer NFT');
        } finally {
            setTransferring(false);
        }
    };

    const handleClose = () => {
        setRecipientAddress('');
        setMemo('');
        setError('');
        setSuccess('');
        onClose();
    };

    const validateStellarAddress = (address) => {
        return address && address.length === 56 && /^[A-Z0-9]{56}$/.test(address);
    };

    const isRecipientValid = validateStellarAddress(recipientAddress);
    
    // Update recipient error state
    React.useEffect(() => {
        setRecipientError(recipientAddress.length > 0 && !isRecipientValid);
    }, [recipientAddress, isRecipientValid]);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <Send color="primary" />
                    <Typography variant="h6">Transfer NFT</Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                {!isConnected ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            Please connect your Stellar wallet to transfer NFTs.
                        </Typography>
                    </Alert>
                ) : null}

                {nft && (
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                NFT Details
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Collection
                                    </Typography>
                                    <Typography variant="body1">
                                        {nft.collection_name}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Rarity
                                    </Typography>
                                    <Chip
                                        label={nft.rarity_level}
                                        color="primary"
                                        size="small"
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Current Owner
                                    </Typography>
                                    <Typography variant="body2" fontFamily="monospace">
                                        {nft.current_owner}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <CheckCircle />
                            <Typography>{success}</Typography>
                        </Box>
                    </Alert>
                )}

                <Box sx={{ mb: 3 }}>
                    <TextField
                        fullWidth
                        label="Recipient Stellar Address"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                        helperText={
                            isRecipientValid 
                                ? "Valid Stellar address" 
                                : "Enter a valid 56-character Stellar address"
                        }
                        error={recipientError}
                        disabled={transferring}
                        sx={{ mb: 2 }}
                    />

                    <TextField
                        fullWidth
                        label="Memo (Optional)"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="Add a note for this transfer"
                        multiline
                        rows={2}
                        disabled={transferring}
                    />
                </Box>

                <Alert severity="info">
                    <Typography variant="body2">
                        <strong>Transfer Process:</strong>
                        <br />
                        1. Your wallet will sign the transfer transaction
                        <br />
                        2. The NFT ownership will be updated on the blockchain
                        <br />
                        3. The recipient will receive the NFT in their collection
                    </Typography>
                </Alert>
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose} disabled={transferring}>
                    Cancel
                </Button>
                <Button
                    onClick={handleTransfer}
                    variant="contained"
                    disabled={!isConnected || !isRecipientValid || transferring}
                    startIcon={transferring ? <CircularProgress size={20} /> : <Send />}
                >
                    {transferring ? 'Transferring...' : 'Transfer NFT'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default NFTTransfer;
