/**
 * Stellar Wallet Connect Service
 * 
 * Provides integration with Stellar Wallets Kit for connecting to various
 * Stellar wallets including WalletConnect, Freighter, Albedo, etc.
 * 
 * Documentation: https://developers.stellar.org/docs/tools/developer-tools/wallets
 */

import { Networks } from '@stellar/stellar-sdk';

// Try to import Stellar Wallets Kit - handle gracefully if not available
let StellarWalletsKit, WalletNetwork;
let kitAvailable = false;
let kitModuleLoaded = false;

// Initialize kit availability check
const checkKitAvailability = async () => {
  if (kitModuleLoaded) return kitAvailable;
  
  try {
    const kitModule = await import('@creit.tech/stellar-wallets-kit');
    StellarWalletsKit = kitModule.StellarWalletsKit || kitModule.default?.StellarWalletsKit;
    WalletNetwork = kitModule.WalletNetwork || kitModule.default?.WalletNetwork;
    if (StellarWalletsKit && WalletNetwork) {
      kitAvailable = true;
    }
  } catch (error) {
    console.warn('Stellar Wallets Kit not available:', error.message);
    kitAvailable = false;
  } finally {
    kitModuleLoaded = true;
  }
  
  return kitAvailable;
};

// Import wallet modules dynamically to handle module resolution
// The package structure may vary, so we'll try multiple import methods
let FreighterModule, AlbedoModule, WalletConnectModule, HanaModule, RabetModule, LobstrModule, xBullModule;

// Try to import modules - handle cases where they might not be available
const initializeModules = async () => {
  const isAvailable = await checkKitAvailability();
  if (!isAvailable) {
    return; // Skip if kit is not available
  }
  
  try {
    // Try ES6 import first
    const kitPackage = await import('@creit.tech/stellar-wallets-kit');
    
    // Check if modules are exported directly
    if (kitPackage.FreighterModule) FreighterModule = kitPackage.FreighterModule;
    if (kitPackage.AlbedoModule) AlbedoModule = kitPackage.AlbedoModule;
    if (kitPackage.WalletConnectModule) WalletConnectModule = kitPackage.WalletConnectModule;
    if (kitPackage.HanaModule) HanaModule = kitPackage.HanaModule;
    if (kitPackage.RabetModule) RabetModule = kitPackage.RabetModule;
    if (kitPackage.LobstrModule) LobstrModule = kitPackage.LobstrModule;
    if (kitPackage.xBullModule) xBullModule = kitPackage.xBullModule;
    
    // If not found, try importing from subpaths (may fail if package structure is different)
    // We'll handle errors gracefully
  } catch (error) {
    console.warn('Could not import wallet modules, WalletConnect features may be limited:', error);
  }
};

// Initialize modules on first use
let modulesInitialized = false;
const ensureModulesInitialized = async () => {
  if (!modulesInitialized) {
    await initializeModules();
    modulesInitialized = true;
  }
};

// Determine network from environment
const getNetwork = () => {
  if (!WalletNetwork) {
    return null; // Return null if kit is not available
  }
  // Check if we're on testnet or mainnet
  // You can set this via environment variable or detect from Horizon URL
  const isTestnet = process.env.REACT_APP_STELLAR_NETWORK === 'testnet' || 
                    !process.env.REACT_APP_STELLAR_NETWORK;
  
  return isTestnet ? WalletNetwork.TESTNET : WalletNetwork.PUBLIC;
};

const getNetworkPassphrase = () => {
  const isTestnet = process.env.REACT_APP_STELLAR_NETWORK === 'testnet' || 
                    !process.env.REACT_APP_STELLAR_NETWORK;
  
  return isTestnet 
    ? Networks.TESTNET 
    : Networks.PUBLIC;
};

// Initialize the Stellar Wallets Kit
let kitInstance = null;

const getKit = async () => {
  // Check kit availability first
  const isAvailable = await checkKitAvailability();
  if (!isAvailable || !StellarWalletsKit) {
    throw new Error('Stellar Wallets Kit is not available. Please ensure @creit.tech/stellar-wallets-kit is installed.');
  }
  
  if (!kitInstance) {
    await ensureModulesInitialized();
    const network = getNetwork();
    
    if (!network) {
      throw new Error('Unable to determine network. Stellar Wallets Kit may not be properly initialized.');
    }
    
    const modules = [];
    
    // Add modules if they're available
    try {
      if (FreighterModule) modules.push(new FreighterModule());
      if (AlbedoModule) modules.push(new AlbedoModule());
      if (WalletConnectModule) {
        modules.push(new WalletConnectModule({
          // WalletConnect project ID for GeoLink
          projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || '846c36afd2060171e069dcad5dcc659d',
        }));
      }
      if (HanaModule) modules.push(new HanaModule());
      if (RabetModule) modules.push(new RabetModule());
      if (LobstrModule) modules.push(new LobstrModule());
      if (xBullModule) modules.push(new xBullModule());
    } catch (error) {
      console.warn('Error initializing wallet modules:', error);
    }
    
    // Initialize with available modules
    kitInstance = new StellarWalletsKit({
      network: network,
      modules: modules,
    });
  }
  
  return kitInstance;
};

/**
 * Get list of available wallets
 */
export const getAvailableWallets = async () => {
  const isAvailable = await checkKitAvailability();
  if (!isAvailable) {
    console.warn('Stellar Wallets Kit is not available');
    return [];
  }
  
  try {
    const kit = await getKit();
    return kit.getSupportedWallets();
  } catch (error) {
    console.error('Error getting available wallets:', error);
    // Return empty array if kit is not available
    return [];
  }
};

/**
 * Connect to a wallet
 * @param {string} walletId - The ID of the wallet to connect to
 * @returns {Promise<{address: string, wallet: object, walletId: string}>}
 */
export const connectWallet = async (walletId) => {
  try {
    const kit = await getKit();
    
    // Set the selected wallet
    kit.setWallet(walletId);
    
    // Track if connection was successful
    let connectionResolved = false;
    let connectionRejected = false;
    
    // Open the connection modal
    return new Promise((resolve, reject) => {
      // Set a timeout to check if connection succeeded after modal closes
      let closedTimeout = null;
      
      const checkConnectionAfterClose = async () => {
        // Wait a bit for async connection to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!connectionResolved && !connectionRejected) {
          try {
            // Try to get the address - if successful, connection worked
            const address = await kit.getAddress();
            if (address && address.address) {
              connectionResolved = true;
              resolve({
                address: address.address,
                wallet: { id: walletId },
                walletId: walletId,
              });
              return;
            }
          } catch (error) {
            // Address not available, connection failed
            console.log('Connection check failed:', error);
          }
          
          // If we get here, connection didn't succeed
          if (!connectionResolved) {
            connectionRejected = true;
            reject(new Error('Wallet connection cancelled or failed'));
          }
        }
      };
      
      kit.openModal({
        onWalletSelected: async (wallet) => {
          try {
            // Clear the closed timeout since we got a selection
            if (closedTimeout) {
              clearTimeout(closedTimeout);
              closedTimeout = null;
            }
            
            connectionResolved = true;
            
            // Get the connected address
            const address = await kit.getAddress();
            
            resolve({
              address: address.address,
              wallet: wallet,
              walletId: walletId,
            });
          } catch (error) {
            connectionRejected = true;
            reject(error);
          }
        },
        onClosed: () => {
          // For extension wallets like Freighter, the modal might close
          // immediately after user approves in the extension, but before
          // onWalletSelected is called. Give it a moment to complete.
          if (!connectionResolved && !connectionRejected) {
            closedTimeout = setTimeout(checkConnectionAfterClose, 100);
          } else if (!connectionResolved) {
            // Only reject if we haven't already resolved or rejected
            connectionRejected = true;
            reject(new Error('Wallet connection cancelled'));
          }
        },
      });
    });
  } catch (error) {
    console.error('Error connecting wallet:', error);
    throw error;
  }
};

/**
 * Sign a transaction using the connected wallet
 * @param {Transaction} transaction - Stellar transaction to sign
 * @param {string} walletId - The wallet ID to use for signing
 * @returns {Promise<Transaction>} - Signed transaction
 */
export const signTransaction = async (transaction, walletId) => {
  try {
    const kit = await getKit();
    kit.setWallet(walletId);
    
    // Convert transaction to XDR
    const xdr = transaction.toXDR();
    
    // Sign the transaction
    const signedXdr = await kit.signTransaction(xdr, {
      networkPassphrase: getNetworkPassphrase(),
    });
    
    // Parse and return the signed transaction
    const StellarSdk = await import('@stellar/stellar-sdk');
    return StellarSdk.TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase());
  } catch (error) {
    console.error('Error signing transaction:', error);
    throw error;
  }
};

/**
 * Sign a message using the connected wallet
 * @param {string} message - Message to sign
 * @param {string} walletId - The wallet ID to use for signing
 * @returns {Promise<{signedMessage: string, publicKey: string}>}
 */
export const signMessage = async (message, walletId) => {
  try {
    const kit = await getKit();
    kit.setWallet(walletId);
    
    // Get the current address
    const address = await kit.getAddress();
    
    // Sign the message
    const signature = await kit.signMessage(message, {
      networkPassphrase: getNetworkPassphrase(),
      address: address.address,
    });
    
    return {
      signedMessage: signature.signedMessage,
      publicKey: address.address,
    };
  } catch (error) {
    console.error('Error signing message:', error);
    throw error;
  }
};

/**
 * Disconnect the wallet
 */
export const disconnectWallet = () => {
  if (kitInstance) {
    kitInstance.disconnect();
    kitInstance = null;
  }
};

/**
 * Get the currently connected wallet address
 * @param {string} walletId - The wallet ID
 * @returns {Promise<string>} - The public key/address
 */
export const getWalletAddress = async (walletId) => {
  try {
    const kit = await getKit();
    kit.setWallet(walletId);
    const address = await kit.getAddress();
    return address.address;
  } catch (error) {
    console.error('Error getting wallet address:', error);
    throw error;
  }
};

const walletConnectService = {
  getAvailableWallets,
  connectWallet,
  signTransaction,
  signMessage,
  disconnectWallet,
  getWalletAddress,
  getNetwork,
  getNetworkPassphrase,
};

export default walletConnectService;

