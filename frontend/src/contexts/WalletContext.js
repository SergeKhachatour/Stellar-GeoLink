import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const WalletContext = createContext();

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [secretKey, setSecretKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stellar server configuration - use useRef to persist values across renders
  const serverRef = React.useRef(null);
  const networkPassphraseRef = React.useRef(null);
  
  const initializeStellar = React.useCallback(async () => {
    if (!serverRef.current) {
      try {
        // Use dynamic import for browser environment
        const StellarSdk = await import('@stellar/stellar-sdk');
        
        // Use Horizon instead of Server (modern Stellar SDK v12 approach)
        const Horizon = StellarSdk.Horizon;
        // const Networks = StellarSdk.Networks;
        
        // Use hardcoded testnet configuration for now
        serverRef.current = new Horizon.Server('https://horizon-testnet.stellar.org');
        networkPassphraseRef.current = 'Test SDF Network ; September 2015';
      } catch (error) {
        console.error('Failed to initialize Stellar SDK:', error);
        return false;
      }
    }
    return true;
  }, []);

  // Load account information from Stellar network
  const loadAccountInfo = React.useCallback(async (pubKey) => {
    try {
      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }
      setLoading(true);
      const account = await serverRef.current.loadAccount(pubKey);
      setAccount(account);
      
      // Get XLM balance
      const xlmBalance = account.balances.find(balance => balance.asset_type === 'native');
      setBalance(xlmBalance ? parseFloat(xlmBalance.balance) : 0);
      
      setError(null);
    } catch (err) {
      console.error('Error loading account info:', err);
      setError('Failed to load account information');
    } finally {
      setLoading(false);
    }
  }, [initializeStellar]);

  // Load wallet from localStorage on mount
  useEffect(() => {
    const savedPublicKey = localStorage.getItem('stellar_public_key');
    const savedSecretKey = localStorage.getItem('stellar_secret_key');
    
    if (savedPublicKey && savedSecretKey) {
      setPublicKey(savedPublicKey);
      setSecretKey(savedSecretKey);
      setIsConnected(true);
      loadAccountInfo(savedPublicKey);
    }
  }, [loadAccountInfo]);

  // Connect wallet with secret key
  const connectWallet = async (secretKeyInput) => {
    try {
      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }
      setLoading(true);
      setError(null);

      // Validate secret key format
      if (!secretKeyInput || secretKeyInput.length !== 56) {
        throw new Error('Invalid secret key format. Secret key must be 56 characters long.');
      }

      // Check if it starts with 'S' (Stellar secret key format)
      if (!secretKeyInput.startsWith('S')) {
        // Check if it might be a public key instead
        if (secretKeyInput.startsWith('G')) {
          throw new Error('This appears to be a public key (starts with "G"). Please use your secret key (starts with "S") to import your wallet.');
        }
        throw new Error('Invalid secret key format. Stellar secret keys start with "S".');
      }

      // Create keypair from secret key
      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const keypair = Keypair.fromSecret(secretKeyInput);
      const publicKey = keypair.publicKey();

      // Test the keypair by loading account
      await serverRef.current.loadAccount(publicKey);

      // Save to state and localStorage
      setPublicKey(publicKey);
      setSecretKey(secretKeyInput);
      setIsConnected(true);
      
      localStorage.setItem('stellar_public_key', publicKey);
      localStorage.setItem('stellar_secret_key', secretKeyInput);

      // Load account info
      await loadAccountInfo(publicKey);

      // Update user's public key in backend
      try {
        await api.put('/auth/update-public-key', {
          public_key: publicKey
        });
      } catch (err) {
        console.warn('Failed to update public key in backend:', err);
      }

    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  // Connect wallet with public key only (for viewing)
  const connectWalletViewOnly = async (publicKeyInput) => {
    try {
      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }
      setLoading(true);
      setError(null);

      // Validate public key format
      if (!publicKeyInput || publicKeyInput.length !== 56) {
        throw new Error('Invalid public key format');
      }

      // Test the public key by loading account
      await serverRef.current.loadAccount(publicKeyInput);

      // Save to state and localStorage (view-only mode)
      setPublicKey(publicKeyInput);
      setSecretKey(null); // No secret key for view-only
      setIsConnected(true);
      
      localStorage.setItem('stellar_public_key', publicKeyInput);
      localStorage.removeItem('stellar_secret_key'); // Remove secret key

      // Load account info
      await loadAccountInfo(publicKeyInput);

      // Update user's public key in backend
      try {
        await api.put('/auth/update-public-key', {
          public_key: publicKeyInput
        });
      } catch (err) {
        console.warn('Failed to update public key in backend:', err);
      }

    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  // Generate new wallet
  const generateWallet = async () => {
    try {
      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const keypair = Keypair.random();
      const newSecretKey = keypair.secret();
      const newPublicKey = keypair.publicKey();

      return {
        publicKey: newPublicKey,
        secretKey: newSecretKey
      };
    } catch (err) {
      console.error('Error generating wallet:', err);
      setError('Failed to generate wallet');
      return null;
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setPublicKey(null);
    setSecretKey(null);
    setIsConnected(false);
    setBalance(null);
    setAccount(null);
    setError(null);
    
    localStorage.removeItem('stellar_public_key');
    localStorage.removeItem('stellar_secret_key');
  };

  // Send XLM transaction
  const sendTransaction = async (destination, amount, memo = null) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet not connected');
      }

      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }

      setLoading(true);
      setError(null);

      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const TransactionBuilder = StellarSdk.TransactionBuilder;
      const Operation = StellarSdk.Operation;
      
      const keypair = Keypair.fromSecret(secretKey);
      const sourceAccount = await serverRef.current.loadAccount(publicKey);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: networkPassphraseRef.current
      })
        .addOperation(Operation.payment({
          destination,
          asset: 'XLM',
          amount: amount.toString()
        }))
        .setTimeout(30)
        .build();

      if (memo) {
        transaction.addMemo(memo);
      }

      transaction.sign(keypair);

      const result = await serverRef.current.submitTransaction(transaction);
      
      // Reload account info
      await loadAccountInfo(publicKey);
      
      return result;
    } catch (err) {
      console.error('Error sending transaction:', err);
      setError(err.message || 'Failed to send transaction');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Sign transaction
  const signTransaction = async (transactionXDR) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet not connected');
      }

      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }

      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const TransactionBuilder = StellarSdk.TransactionBuilder;
      
      const keypair = Keypair.fromSecret(secretKey);
      const transaction = TransactionBuilder.fromXDR(transactionXDR, networkPassphraseRef.current);
      transaction.sign(keypair);
      
      return transaction.toXDR();
    } catch (err) {
      console.error('Error signing transaction:', err);
      setError(err.message || 'Failed to sign transaction');
      throw err;
    }
  };

  // Get transaction history
  const getTransactionHistory = async (limit = 10) => {
    try {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }

      const transactions = await serverRef.current.transactions()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit)
        .call();

      return transactions.records;
    } catch (err) {
      console.error('Error getting transaction history:', err);
      setError(err.message || 'Failed to get transaction history');
      return [];
    }
  };

  // Fund account with testnet XLM (for testing)
  const fundAccount = async () => {
    try {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      setLoading(true);
      setError(null);

      const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      
      if (response.ok) {
        await loadAccountInfo(publicKey);
        return true;
      } else {
        throw new Error('Failed to fund account');
      }
    } catch (err) {
      console.error('Error funding account:', err);
      setError(err.message || 'Failed to fund account');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    // State
    isConnected,
    publicKey,
    secretKey,
    balance,
    account,
    loading,
    error,
    wallet: { publicKey, secretKey, isConnected },
    
    // Actions
    connectWallet,
    connectWalletViewOnly,
    generateWallet,
    disconnectWallet,
    sendTransaction,
    signTransaction,
    getTransactionHistory,
    fundAccount,
    loadAccountInfo,
    
    // Utils
    server: serverRef.current,
    networkPassphrase: networkPassphraseRef.current
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};
