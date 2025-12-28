/**
 * Stellar Wallet Connect Service
 * 
 * Provides integration with Stellar Wallets Kit for connecting to various
 * Stellar wallets including WalletConnect, Freighter, Albedo, etc.
 * 
 * Documentation: https://developers.stellar.org/docs/tools/developer-tools/wallets
 */

import {
  StellarWalletsKit,
  WalletNetwork,
  ISupportedWallet,
} from '@creit.tech/stellar-wallets-kit';
import { Networks } from '@stellar/stellar-sdk';

// Import wallet modules dynamically to handle module resolution
// The package structure may vary, so we'll try multiple import methods
let FreighterModule, AlbedoModule, WalletConnectModule, HanaModule, RabetModule, LobstrModule, xBullModule;

// Determine network from environment
const getNetwork = () => {
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
  if (!kitInstance) {
    await ensureModulesInitialized();
    const network = getNetwork();
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
 * @returns {Promise<{address: string, wallet: ISupportedWallet}>}
 */
export const connectWallet = async (walletId) => {
  try {
    const kit = await getKit();
    
    // Set the selected wallet
    kit.setWallet(walletId);
    
    // Open the connection modal
    return new Promise((resolve, reject) => {
      kit.openModal({
        onWalletSelected: async (wallet) => {
          try {
            // Get the connected address
            const address = await kit.getAddress();
            
            resolve({
              address: address.address,
              wallet: wallet,
              walletId: walletId,
            });
          } catch (error) {
            reject(error);
          }
        },
        onClosed: () => {
          reject(new Error('Wallet connection cancelled'));
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

export default {
  getAvailableWallets,
  connectWallet,
  signTransaction,
  signMessage,
  disconnectWallet,
  getWalletAddress,
  getNetwork,
  getNetworkPassphrase,
};

