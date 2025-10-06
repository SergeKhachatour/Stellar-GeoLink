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

  // Stellar server configuration - initialize lazily to avoid constructor issues
  let server = null;
  let networkPassphrase = null;
  
  const initializeStellar = React.useCallback(async () => {
    if (!server) {
      try {
        // Use dynamic import for browser environment
        const StellarSdk = await import('@stellar/stellar-sdk');
        
        // Use Horizon instead of Server (modern Stellar SDK v12 approach)
        const Horizon = StellarSdk.Horizon;
        // const Networks = StellarSdk.Networks;
        
        // Use hardcoded testnet configuration for now
        server = new Horizon.Server('https://horizon-testnet.stellar.org');
        networkPassphrase = 'Test SDF Network ; September 2015';
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
      const account = await server.loadAccount(pubKey);
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
  }, [initializeStellar, server]);

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
        throw new Error('Invalid secret key format');
      }

      // Create keypair from secret key
      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const keypair = Keypair.fromSecret(secretKeyInput);
      const publicKey = keypair.publicKey();

      // Test the keypair by loading account
      await server.loadAccount(publicKey);

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
      const sourceAccount = await server.loadAccount(publicKey);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase
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

      const result = await server.submitTransaction(transaction);
      
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
      const transaction = TransactionBuilder.fromXDR(transactionXDR, networkPassphrase);
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

      const transactions = await server.transactions()
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
    
    // Actions
    connectWallet,
    generateWallet,
    disconnectWallet,
    sendTransaction,
    signTransaction,
    getTransactionHistory,
    fundAccount,
    loadAccountInfo,
    
    // Utils
    server,
    networkPassphrase
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};
