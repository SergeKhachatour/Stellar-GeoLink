import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Link,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

const TransactionHistoryDialog = ({ open, onClose }) => {
  const { publicKey, getTransactionHistory } = useWallet();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && publicKey) {
      fetchTransactions();
    }
  }, [open, publicKey]);

  const fetchTransactions = async () => {
    if (!publicKey) {
      setError('No wallet connected');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const txHistory = await getTransactionHistory(20); // Get last 20 transactions
      setTransactions(txHistory || []);
    } catch (err) {
      console.error('Failed to fetch transaction history:', err);
      setError(err.message || 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

  const getStellarExpertUrl = (hash) => {
    // Use testnet for now - could be made dynamic based on network
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  };

  const getTransactionType = (tx) => {
    // Try to determine transaction type from operations
    if (tx.operations && tx.operations.length > 0) {
      const op = tx.operations[0];
      return op.type || 'Unknown';
    }
    return 'Transaction';
  };

  const getTransactionStatus = (tx) => {
    if (tx.successful === false) {
      return { label: 'Failed', color: 'error' };
    }
    return { label: 'Success', color: 'success' };
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon color="primary" />
            <Typography variant="h6">Transaction History</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        {publicKey && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Account: {publicKey.substring(0, 8)}...{publicKey.substring(publicKey.length - 8)}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            <Button size="small" onClick={fetchTransactions} sx={{ ml: 2 }}>
              Retry
            </Button>
          </Alert>
        )}

        {!loading && !error && transactions.length === 0 && (
          <Alert severity="info">
            No transactions found for this account.
          </Alert>
        )}

        {!loading && !error && transactions.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Hash</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx) => {
                  const status = getTransactionStatus(tx);
                  const txType = getTransactionType(tx);
                  const stellarExpertUrl = getStellarExpertUrl(tx.hash);

                  return (
                    <TableRow key={tx.id || tx.hash} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(tx.created_at || tx.ledger_close_time)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{txType}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={status.label}
                          color={status.color}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            wordBreak: 'break-all'
                          }}
                        >
                          {tx.hash.substring(0, 16)}...
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="View on Stellar Expert">
                          <IconButton
                            size="small"
                            component={Link}
                            href={stellarExpertUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            color="primary"
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={fetchTransactions} variant="outlined" disabled={loading}>
          Refresh
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TransactionHistoryDialog;

