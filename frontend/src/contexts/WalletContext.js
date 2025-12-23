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
      
      // Retry logic for newly created accounts that might not be on Horizon yet
      let account;
      let retries = 3;
      let accountLoaded = false;
      
      while (retries > 0 && !accountLoaded) {
        try {
          account = await serverRef.current.loadAccount(pubKey);
          accountLoaded = true;
        } catch (err) {
          if (err.message && err.message.includes('Not Found')) {
            retries--;
            if (retries > 0) {
              console.log(`Account ${pubKey} not found yet, retrying in 2 seconds... (${retries} retries left)`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              // Account doesn't exist yet - set balance to 0 and continue
              console.warn('Account not found on network yet. It may still be funding.');
              setBalance(0);
              setError('Account not found on network. If this is a newly created account, please wait a few seconds for it to be funded.');
              return;
            }
          } else {
            throw err;
          }
        }
      }
      
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
          // Wallet matches user, restore it WITH secret key if available
          console.log('WalletContext: Restoring wallet for current user');
          if (!isConnected || publicKey !== savedPublicKey) {
            setPublicKey(savedPublicKey);
            setSecretKey(savedSecretKey); // Restore secret key if available
            setIsConnected(true);
            console.log('WalletContext: Wallet restored', { 
              hasSecretKey: !!savedSecretKey,
              publicKey: savedPublicKey.substring(0, 8) + '...'
            });
            loadAccountInfo(savedPublicKey).then(() => {
              console.log('WalletContext: Account info loaded successfully');
            }).catch(error => {
              console.error('WalletContext: Failed to load account info:', error);
            });
          } else if (isConnected && publicKey === savedPublicKey && !secretKey && savedSecretKey) {
            // Wallet is connected but missing secret key - restore it
            console.log('WalletContext: Restoring missing secret key for connected wallet');
            setSecretKey(savedSecretKey);
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
          setSecretKey(savedSecretKey); // Restore secret key if available
          setIsConnected(true);
          console.log('WalletContext: Standalone wallet restored', {
            hasSecretKey: !!savedSecretKey,
            publicKey: savedPublicKey.substring(0, 8) + '...'
          });
          loadAccountInfo(savedPublicKey).then(() => {
            console.log('WalletContext: Account info loaded successfully');
          }).catch(error => {
            console.error('WalletContext: Failed to load account info:', error);
          });
        } else if (isConnected && publicKey === savedPublicKey && !secretKey && savedSecretKey) {
          // Wallet is connected but missing secret key - restore it
          console.log('WalletContext: Restoring missing secret key for standalone wallet');
          setSecretKey(savedSecretKey);
        }
      }
    } else if (currentUser?.public_key && !savedPublicKey) {
      // User has public key but no saved wallet data
      // Check if there's a secret key in localStorage that matches (from wallet creation)
      const tempSecretKey = localStorage.getItem('stellar_secret_key');
      if (tempSecretKey) {
        // Try to derive public key from secret key to see if it matches
        // Use async IIFE since useEffect callback can't be async
        (async () => {
          try {
            const StellarSdk = await import('@stellar/stellar-sdk');
            const keypair = StellarSdk.Keypair.fromSecret(tempSecretKey);
            if (keypair.publicKey() === currentUser.public_key) {
              // Secret key matches user's public key - restore wallet with secret key
              console.log('WalletContext: Found matching secret key for user, restoring wallet');
              setPublicKey(currentUser.public_key);
              setSecretKey(tempSecretKey);
              setIsConnected(true);
              localStorage.setItem('stellar_public_key', currentUser.public_key);
              loadAccountInfo(currentUser.public_key).then(() => {
                console.log('WalletContext: Account info loaded successfully');
              }).catch(error => {
                console.error('WalletContext: Failed to load account info:', error);
              });
            }
          } catch (err) {
            console.warn('WalletContext: Could not verify secret key:', err);
          }
        })();
        return; // Exit early, async check in progress
      }
      
      // No matching secret key found, don't auto-connect in view-only mode
      // Let the user manually connect if needed
      console.log('WalletContext: User has public key but no saved wallet with secret key');
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
  }, [currentUser, loadAccountInfo, isConnected, publicKey, secretKey]);

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

      // Validate the keypair is valid (can derive public key from secret)
      // For newly created accounts, the account may not exist on Horizon yet
      // So we don't require the account to exist - we'll connect anyway and load it later
      console.log(`WalletContext: Connecting wallet with public key ${publicKey.substring(0, 8)}...`);

      // Save to state and localStorage immediately
      // This allows connection even for newly created accounts that aren't on Horizon yet
      setPublicKey(publicKey);
      setSecretKey(secretKeyInput);
      setIsConnected(true);
      
      localStorage.setItem('stellar_public_key', publicKey);
      localStorage.setItem('stellar_secret_key', secretKeyInput);

      console.log(`WalletContext: Wallet connected successfully - Public Key: ${publicKey.substring(0, 8)}...`);
      
      // Try to load account info (with retry logic for newly created accounts)
      // This will handle accounts that don't exist yet gracefully
      try {
        await loadAccountInfo(publicKey);
        console.log('WalletContext: Account info loaded successfully');
      } catch (loadError) {
        // If account doesn't exist yet, that's okay - it's a newly created account
        // The account will appear once Friendbot funds it
        if (loadError.message && (loadError.message.includes('Not Found') || loadError.message.includes('404'))) {
          console.log(`WalletContext: Account ${publicKey} not found yet (newly created). It will appear once Friendbot funds it.`);
          // Set balance to 0 for now
          setBalance(0);
          setAccount(null); // Clear account since it doesn't exist yet
        } else {
          // For other errors, log but don't fail the connection
          console.warn('WalletContext: Error loading account info (wallet still connected):', loadError.message);
        }
      }

      // Update user's public key in backend (only if user is logged in)
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await api.put('/auth/update-public-key', {
            public_key: publicKey
          });
          console.log('WalletContext: Updated public key in backend');
        } else {
          console.log('WalletContext: No auth token, skipping backend public key update');
        }
      } catch (err) {
        // Don't fail wallet connection if backend update fails
        console.warn('WalletContext: Failed to update public key in backend (wallet still connected):', err.message);
      }

      console.log('WalletContext: Wallet connection complete');

    } catch (err) {
      console.error('WalletContext: Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
      // Clear state on error
      setPublicKey(null);
      setSecretKey(null);
      setIsConnected(false);
      localStorage.removeItem('stellar_public_key');
      localStorage.removeItem('stellar_secret_key');
      throw err; // Re-throw so caller can handle it
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

  // Generate new wallet using backend StellarOperations service
  // Optionally registers a passkey automatically if WebAuthn is available
  const generateWallet = async (autoRegisterPasskey = true) => {
    try {
      setLoading(true);
      setError(null);

      // Call backend endpoint to create and fund account
      const response = await api.post('/stellar/create-account');
      const accountData = response.data;

      // Handle both possible response formats
      const publicKey = accountData.publicKey || accountData.public_key;
      const secretKey = accountData.secret || accountData.secretKey || accountData.secret_key;

      if (!publicKey || !secretKey) {
        throw new Error('Invalid response from server: missing publicKey or secret');
      }

      const wallet = {
        publicKey: publicKey,
        secretKey: secretKey
      };

      // Automatically register passkey if WebAuthn is available and enabled
      // Do this asynchronously - don't block wallet creation on passkey registration
      // Friendbot can take 30+ seconds to fund accounts, so we'll try to register
      // the passkey in the background with multiple attempts
      if (autoRegisterPasskey && navigator.credentials && navigator.credentials.create) {
        // Start passkey registration asynchronously (don't await)
        // This allows wallet creation to complete immediately
        (async () => {
          try {
            // Try to register passkey with extended retries
            // Friendbot can be slow, so we'll try multiple times with increasing waits
            let registered = false;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (!registered && attempts < maxAttempts) {
              attempts++;
              try {
                // Wait before each attempt (increasing wait time: 15s, 30s, 45s)
                const waitTime = attempts * 15000;
                if (attempts > 1) {
                  console.log(`⏳ Passkey registration attempt ${attempts}/${maxAttempts} - Waiting ${waitTime/1000} seconds for account to be funded...`);
                } else {
                  console.log(`⏳ Waiting ${waitTime/1000} seconds for account to be funded before first passkey registration attempt...`);
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Import webauthnService dynamically to avoid circular dependencies
                const webauthnService = (await import('../services/webauthnService')).default;
                
                // Register passkey with WebAuthn API
                console.log(`🔐 Attempting passkey registration (attempt ${attempts}/${maxAttempts})...`);
                const passkeyData = await webauthnService.registerPasskey(publicKey);
                
                // Register passkey on smart wallet contract via backend
                // Use userPublicKey and secretKey since user might not be authenticated yet
                await api.post('/webauthn/register', {
                  passkeyPublicKeySPKI: passkeyData.publicKey,
                  credentialId: passkeyData.credentialId,
                  userPublicKey: publicKey,
                  secretKey: secretKey
                });

                console.log('✅ Passkey automatically registered during wallet creation');
                registered = true;
              } catch (passkeyError) {
                console.warn(`⚠️ Passkey registration attempt ${attempts} failed:`, passkeyError.message);
                if (attempts >= maxAttempts) {
                  console.warn('⚠️ Passkey registration failed after all attempts. You can register it later via Passkey Manager.');
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Background passkey registration error:', error.message);
          }
        })();
        
        // Mark that passkey registration is in progress (non-blocking)
        wallet.passkeyRegistered = false;
        wallet.passkeyInProgress = true;
      } else {
        wallet.passkeyRegistered = false;
        if (!autoRegisterPasskey) {
          wallet.passkeySkipped = true;
        }
      }

      return wallet;
    } catch (err) {
      console.error('Error generating wallet:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to generate wallet';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
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
