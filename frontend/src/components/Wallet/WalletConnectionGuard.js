import React from 'react';
import { Box, Container, Typography, Button, Card, CardContent, Alert } from '@mui/material';
import { AccountBalanceWallet, Lock } from '@mui/icons-material';
import { useWallet } from '../../contexts/WalletContext';
import WalletConnectionDialog from './WalletConnectionDialog';
import PasskeyManager from './PasskeyManager';

/**
 * WalletConnectionGuard Component
 * 
 * Wraps pages that require wallet connection.
 * Shows wallet connection UI if wallet is not connected.
 * 
 * Usage:
 * <WalletConnectionGuard>
 *   <YourProtectedComponent />
 * </WalletConnectionGuard>
 */
const WalletConnectionGuard = ({ children, showPasskeyManager = true }) => {
  const { isConnected, publicKey, loading } = useWallet();
  const [showConnectionDialog, setShowConnectionDialog] = React.useState(false);

  // Debug logging
  React.useEffect(() => {
    console.log('WalletConnectionGuard: State update', { isConnected, publicKey: publicKey ? `${publicKey.substring(0, 8)}...` : null, loading });
  }, [isConnected, publicKey, loading]);

  // Close dialog when wallet successfully connects
  React.useEffect(() => {
    if (isConnected && publicKey && showConnectionDialog) {
      console.log('WalletConnectionGuard: Wallet connected, closing dialog');
      // Small delay to ensure state is fully propagated
      const timer = setTimeout(() => {
        setShowConnectionDialog(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConnected, publicKey, showConnectionDialog]);

  // If wallet is connected, render children
  if (isConnected && publicKey) {
    console.log('WalletConnectionGuard: Rendering protected content');
    return (
      <>
        {children}
        {showPasskeyManager && (
          <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <PasskeyManager />
          </Container>
        )}
      </>
    );
  }

  // Show wallet connection prompt
  return (
    <Container maxWidth="md" sx={{ mt: 8, mb: 8 }}>
      <Card sx={{ textAlign: 'center', py: 4 }}>
        <CardContent>
          <Box sx={{ mb: 3 }}>
            <AccountBalanceWallet sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Lock sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          </Box>
          
          <Typography variant="h4" gutterBottom>
            Wallet Required
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
            This page requires a Stellar wallet connection. Please connect your wallet to continue.
            You can import an existing wallet, create a new one, or connect with a passkey.
          </Typography>

          <Alert severity="info" sx={{ mb: 3, textAlign: 'left', maxWidth: 600, mx: 'auto' }}>
            <Box>
              <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                <strong>Why do I need a wallet?</strong>
              </Typography>
              <Typography variant="body2" component="div">
                This feature requires blockchain interaction. Your wallet allows you to:
              </Typography>
              <Box component="ul" sx={{ marginTop: 1, marginBottom: 0, paddingLeft: 3 }}>
                <Typography component="li" variant="body2">Mint and manage NFTs</Typography>
                <Typography component="li" variant="body2">Access admin features</Typography>
                <Typography component="li" variant="body2">Use wallet provider services</Typography>
                <Typography component="li" variant="body2">Access data consumer APIs</Typography>
              </Box>
            </Box>
          </Alert>

          <Button
            variant="contained"
            size="large"
            startIcon={<AccountBalanceWallet />}
            onClick={() => setShowConnectionDialog(true)}
            sx={{ mt: 2 }}
          >
            Connect Wallet
          </Button>
        </CardContent>
      </Card>

      <WalletConnectionDialog
        open={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
      />
    </Container>
  );
};

export default WalletConnectionGuard;

