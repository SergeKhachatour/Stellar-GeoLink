import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import stellarWalletService from '../services/stellarWallet';
import sorobanService from '../services/sorobanService';
import nftService from '../services/nftService';
import realNFTService from '../services/realNFTService';
import contractDeploymentService from '../services/contractDeployment';

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
  const [currentUser, setCurrentUser] = useState(null);

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

  // Function to set current user (called from components)
  const setUser = (user) => {
    console.log('WalletContext: Setting current user:', user);
    
    // Prevent multiple calls with the same user
    if (currentUser && user && currentUser.id === user.id) {
      console.log('WalletContext: Same user, skipping setUser call');
      return;
    }
    
    setCurrentUser(user);
  };

  // Load wallet from localStorage - supports both user-based and standalone connections
  useEffect(() => {
    const savedPublicKey = localStorage.getItem('stellar_public_key');
    const savedSecretKey = localStorage.getItem('stellar_secret_key');
    
    console.log('WalletContext: Checking saved wallet data:', { 
      savedPublicKey: savedPublicKey ? 'exists' : 'none',
      savedSecretKey: savedSecretKey ? 'exists' : 'none',
      userPublicKey: currentUser?.public_key,
      currentWalletState: { isConnected, publicKey }
    });

    // If we have saved wallet data, restore it
    if (savedPublicKey) {
      // If there's a current user, check if the saved wallet matches
      if (currentUser?.public_key) {
        if (savedPublicKey === currentUser.public_key) {
          // Wallet matches user, restore it
          console.log('WalletContext: Restoring wallet for current user');
          if (!isConnected || publicKey !== savedPublicKey) {
            setPublicKey(savedPublicKey);
            setSecretKey(savedSecretKey); // This could be null for view-only wallets
            setIsConnected(true);
            console.log('WalletContext: Wallet restored, loading account info...');
            loadAccountInfo(savedPublicKey).then(() => {
              console.log('WalletContext: Account info loaded successfully');
            }).catch(error => {
              console.error('WalletContext: Failed to load account info:', error);
            });
          }
        } else {
          // Different user, clear saved data
          console.log('WalletContext: Different user detected, clearing saved wallet data');
          localStorage.removeItem('stellar_public_key');
          localStorage.removeItem('stellar_secret_key');
          setPublicKey(null);
          setSecretKey(null);
          setIsConnected(false);
          setBalance(null);
          setAccount(null);
          setError(null);
        }
      } else {
        // No current user, but we have saved wallet - restore it for standalone connection
        // This allows Admin/Data Consumer/Wallet Provider dashboards to work without a user
        console.log('WalletContext: No current user, but restoring standalone wallet connection');
        if (!isConnected || publicKey !== savedPublicKey) {
          setPublicKey(savedPublicKey);
          setSecretKey(savedSecretKey);
          setIsConnected(true);
          console.log('WalletContext: Standalone wallet restored, loading account info...');
          loadAccountInfo(savedPublicKey).then(() => {
            console.log('WalletContext: Account info loaded successfully');
          }).catch(error => {
            console.error('WalletContext: Failed to load account info:', error);
          });
        }
      }
    } else if (currentUser?.public_key && !savedPublicKey) {
      // User has public key but no saved wallet data, let NFTDashboard handle auto-connection
      console.log('WalletContext: User has public key but no saved wallet, will auto-connect');
      if (isConnected) {
        // Don't clear if already connected (might be manually connected)
        return;
      }
      setPublicKey(null);
      setSecretKey(null);
      setIsConnected(false);
      setBalance(null);
      setAccount(null);
      setError(null);
    } else if (!currentUser && !savedPublicKey && isConnected) {
      // No user and no saved wallet, but somehow connected - keep it (manual connection)
      console.log('WalletContext: Standalone wallet connection active (no user, no saved data)');
    }
  }, [currentUser, loadAccountInfo, isConnected, publicKey]);

  // Clear wallet state when user logs out
  useEffect(() => {
    const handleUserLogout = () => {
      console.log('User logout detected, clearing wallet state');
      setCurrentUser(null);
      setPublicKey(null);
      setSecretKey(null);
      setIsConnected(false);
      setBalance(null);
      setAccount(null);
      setError(null);
      // Don't clear localStorage here as it might be needed for reconnection
    };

    const handleStorageChange = (e) => {
      if (e.key === 'token' && e.newValue === null) {
        // Token was removed (logout), clear wallet state
        console.log('Token removed, clearing wallet state');
        handleUserLogout();
      }
    };

    // Listen for custom logout event and storage changes
    window.addEventListener('userLogout', handleUserLogout);
    window.addEventListener('storage', handleStorageChange);
    
    // Also check if token exists on mount
    const token = localStorage.getItem('token');
    if (!token) {
      // No token, clear wallet state
      handleUserLogout();
    }

    return () => {
      window.removeEventListener('userLogout', handleUserLogout);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

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
      console.log('WalletContext: connectWalletViewOnly called with:', publicKeyInput);
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

      console.log('WalletContext: connectWalletViewOnly completed successfully');
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

  // Clear wallet state (for logout)
  const clearWallet = () => {
    setPublicKey(null);
    setSecretKey(null);
    setIsConnected(false);
    setBalance(null);
    setAccount(null);
    setError(null);
    // Don't clear localStorage as it might be needed for reconnection
  };

  // Clear wallet completely (including localStorage)
  const clearWalletCompletely = () => {
    setPublicKey(null);
    setSecretKey(null);
    setIsConnected(false);
    setBalance(null);
    setAccount(null);
    setError(null);
    localStorage.removeItem('stellar_public_key');
    localStorage.removeItem('stellar_secret_key');
  };

  // Upgrade from view-only to full access
  const upgradeToFullAccess = async (secretKeyInput) => {
    try {
      if (!(await initializeStellar())) {
        throw new Error('Failed to initialize Stellar SDK');
      }
      
      if (!publicKey) {
        throw new Error('No wallet connected. Please connect a wallet first.');
      }
      
      if (!secretKeyInput || secretKeyInput.length !== 56) {
        throw new Error('Invalid secret key format. Secret key must be 56 characters long.');
      }
      
      if (!secretKeyInput.startsWith('S')) {
        throw new Error('Invalid secret key format. Stellar secret keys start with "S".');
      }
      
      // Validate that the secret key corresponds to the current public key
      const StellarSdk = await import('@stellar/stellar-sdk');
      const Keypair = StellarSdk.Keypair;
      const keypair = Keypair.fromSecret(secretKeyInput);
      if (keypair.publicKey() !== publicKey) {
        throw new Error('Secret key does not match the current wallet. Please use the correct secret key.');
      }
      
      // Update to full access
      setSecretKey(secretKeyInput);
      localStorage.setItem('stellar_secret_key', secretKeyInput);
      
      console.log('WalletContext: Upgraded to full access');
      return true;
    } catch (error) {
      console.error('Failed to upgrade to full access:', error);
      setError(error.message);
      throw error;
    }
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

  // Enhanced Stellar wallet functions following Stellar Playbook
  const createNFTCollection = async (name, symbol, description, metadata = {}) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet must be connected with secret key to create NFT collections');
      }
      
      setLoading(true);
      const result = await nftService.createCollection(name, symbol, description, metadata);
      return result;
    } catch (error) {
      console.error('Failed to create NFT collection:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const mintNFT = async (contractId, recipient, metadata = {}) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet must be connected with secret key to mint NFTs');
      }
      
      setLoading(true);
      const result = await nftService.mintNFT(contractId, recipient, metadata);
      return result;
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const transferNFT = async (contractId, tokenId, from, to) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet must be connected with secret key to transfer NFTs');
      }
      
      setLoading(true);
      const result = await nftService.transferNFT(contractId, tokenId, from, to);
      return result;
    } catch (error) {
      console.error('Failed to transfer NFT:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const executeOnNFTTransfer = async (contractId, tokenId, from, to, actionContractId, actionFunction, actionArgs = []) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet must be connected with secret key to execute smart contracts');
      }
      
      setLoading(true);
      const result = await nftService.executeOnNFTTransfer(contractId, tokenId, from, to, actionContractId, actionFunction, actionArgs);
      return result;
    } catch (error) {
      console.error('Failed to execute on NFT transfer:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const createLocationNFT = async (contractId, recipient, location, metadata = {}) => {
    try {
      if (!isConnected || !secretKey) {
        throw new Error('Wallet must be connected with secret key to create location NFTs');
      }
      
      setLoading(true);
      const result = await nftService.createLocationNFT(contractId, recipient, location, metadata);
      return result;
    } catch (error) {
      console.error('Failed to create location NFT:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getNFTCollections = () => {
    return nftService.getCollections();
  };

  const getNFTMetadata = async (contractId, tokenId) => {
    try {
      return await nftService.getNFTMetadata(contractId, tokenId);
    } catch (error) {
      console.error('Failed to get NFT metadata:', error);
      setError(error.message);
      throw error;
    }
  };

  const getNFTBalance = async (contractId, account) => {
    try {
      return await nftService.getNFTBalance(contractId, account);
    } catch (error) {
      console.error('Failed to get NFT balance:', error);
      setError(error.message);
      throw error;
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
    
    // Basic Actions
    connectWallet,
    connectWalletViewOnly,
    generateWallet,
    disconnectWallet,
    clearWallet,
    clearWalletCompletely,
    upgradeToFullAccess,
    sendTransaction,
    signTransaction,
    getTransactionHistory,
    fundAccount,
    loadAccountInfo,
    setUser,
    
    // Enhanced Stellar Functions (Following Stellar Playbook)
    createNFTCollection,
    mintNFT,
    transferNFT,
    executeOnNFTTransfer,
    createLocationNFT,
    getNFTCollections,
    getNFTMetadata,
    getNFTBalance,
    
    // Services
    stellarWalletService,
    sorobanService,
    nftService,
    realNFTService,
    contractDeploymentService,
    
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
