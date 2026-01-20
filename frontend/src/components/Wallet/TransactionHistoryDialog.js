import React, { useState, useEffect, useCallback } from 'react';
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
  Tooltip,
  TablePagination,
  Card,
  CardContent,
  Divider,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';

const TransactionHistoryDialog = ({ open, onClose }) => {
  const { publicKey, getTransactionHistory } = useWallet();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [transactions, setTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]); // Store all transactions
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchTransactions = useCallback(async () => {
    if (!publicKey) {
      setError('No wallet connected');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch more transactions (100) to support pagination
      const txHistory = await getTransactionHistory(100);
      setAllTransactions(txHistory || []);
      setTransactions((txHistory || []).slice(0, rowsPerPage));
    } catch (err) {
      console.error('Failed to fetch transaction history:', err);
      setError(err.message || 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [publicKey, getTransactionHistory, rowsPerPage]);

  // Update displayed transactions when page or rowsPerPage changes
  useEffect(() => {
    if (allTransactions.length > 0) {
      const startIndex = page * rowsPerPage;
      const endIndex = startIndex + rowsPerPage;
      setTransactions(allTransactions.slice(startIndex, endIndex));
    }
  }, [page, rowsPerPage, allTransactions]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  useEffect(() => {
    if (open && publicKey) {
      setPage(0); // Reset to first page when dialog opens
      fetchTransactions();
    }
  }, [open, publicKey, fetchTransactions]);

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
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      fullScreen={isMobile}
    >
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
          <>
            {/* Mobile Card View */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {transactions.map((tx) => {
                const status = getTransactionStatus(tx);
                const txType = getTransactionType(tx);
                const stellarExpertUrl = getStellarExpertUrl(tx.hash);

                return (
                  <Card key={tx.id || tx.hash} sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          {txType}
                        </Typography>
                        <Chip
                          label={status.label}
                          color={status.color}
                          size="small"
                        />
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Date:
                        </Typography>
                        <Typography variant="body2">
                          {formatDate(tx.created_at || tx.ledger_close_time)}
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Hash:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            wordBreak: 'break-all'
                          }}
                        >
                          {tx.hash.substring(0, 20)}...{tx.hash.substring(tx.hash.length - 8)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                          size="small"
                          component={Link}
                          href={stellarExpertUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="outlined"
                          startIcon={<OpenInNewIcon />}
                        >
                          View Details
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>

            {/* Desktop Table View */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
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
            </Box>
          </>
        )}

        {/* Pagination */}
        {!loading && !error && allTransactions.length > 0 && (
          <Box sx={{ 
            mt: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
            p: { xs: 1, sm: 0 }
          }}>
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{ 
                textAlign: { xs: 'center', sm: 'left' },
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Page {page + 1} of {Math.ceil(allTransactions.length / rowsPerPage)} 
              ({allTransactions.length} total)
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              gap: 1,
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'center', sm: 'flex-end' }
            }}>
              <Button 
                disabled={page === 0}
                onClick={(e) => handleChangePage(e, page - 1)}
                size="small"
                variant="outlined"
                sx={{ 
                  minWidth: { xs: '80px', sm: 'auto' },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}
              >
                Previous
              </Button>
              <Button 
                disabled={page >= Math.ceil(allTransactions.length / rowsPerPage) - 1}
                onClick={(e) => handleChangePage(e, page + 1)}
                size="small"
                variant="outlined"
                sx={{ 
                  minWidth: { xs: '80px', sm: 'auto' },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}
              >
                Next
              </Button>
            </Box>
            <Box sx={{ 
              display: { xs: 'none', sm: 'block' }
            }}>
              <TablePagination
                component="div"
                count={allTransactions.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </Box>
          </Box>
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

