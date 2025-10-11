/**
 * Enhanced NFT Service
 * Following Stellar Playbook NFT recommendations
 * Integrates with Stellar wallet and Soroban smart contracts
 */

import stellarWalletService from './stellarWallet';
import sorobanService from './sorobanService';

class NFTService {
  constructor() {
    this.contracts = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize NFT service
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return true;
      }

      // Initialize underlying services
      await stellarWalletService.initialize();
      await sorobanService.initialize();
      
      this.isInitialized = true;
      console.log('NFT Service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize NFT service:', error);
      throw error;
    }
  }

  /**
   * Create new NFT collection
   */
  async createCollection(name, symbol, description, metadata = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const walletStatus = stellarWalletService.getStatus();
      if (!walletStatus.isConnected || !walletStatus.hasSecretKey) {
        throw new Error('Wallet must be connected with secret key to create collections');
      }

      // Create NFT contract
      const contract = await sorobanService.createNFTContract(
        stellarWalletService.keypair,
        name,
        symbol,
        description
      );

      // Store contract information
      this.contracts.set(contract.contractId, {
        ...contract,
        metadata,
        createdAt: new Date().toISOString()
      });

      return contract;
    } catch (error) {
      console.error('Failed to create NFT collection:', error);
      throw error;
    }
  }

  /**
   * Mint new NFT
   */
  async mintNFT(contractId, recipient, metadata = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const walletStatus = stellarWalletService.getStatus();
      if (!walletStatus.isConnected || !walletStatus.hasSecretKey) {
        throw new Error('Wallet must be connected with secret key to mint NFTs');
      }

      // Validate contract exists
      if (!this.contracts.has(contractId)) {
        throw new Error('Contract not found');
      }

      // Mint NFT using Soroban
      const result = await sorobanService.mintNFT(
        contractId,
        recipient,
        metadata,
        stellarWalletService.keypair
      );

      return {
        ...result,
        contractId,
        recipient,
        metadata
      };
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      throw error;
    }
  }

  /**
   * Transfer NFT
   */
  async transferNFT(contractId, tokenId, from, to) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const walletStatus = stellarWalletService.getStatus();
      if (!walletStatus.isConnected || !walletStatus.hasSecretKey) {
        throw new Error('Wallet must be connected with secret key to transfer NFTs');
      }

      // Validate contract exists
      if (!this.contracts.has(contractId)) {
        throw new Error('Contract not found');
      }

      // Transfer NFT using Soroban
      const result = await sorobanService.transferNFT(
        contractId,
        tokenId,
        from,
        to,
        stellarWalletService.keypair
      );

      return result;
    } catch (error) {
      console.error('Failed to transfer NFT:', error);
      throw error;
    }
  }

  /**
   * Execute smart contract when NFT is transferred
   * This enables automated actions on NFT transfers
   */
  async executeOnNFTTransfer(contractId, tokenId, from, to, actionContractId, actionFunction, actionArgs = []) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const walletStatus = stellarWalletService.getStatus();
      if (!walletStatus.isConnected || !walletStatus.hasSecretKey) {
        throw new Error('Wallet must be connected with secret key to execute smart contracts');
      }

      // Execute transfer with smart contract action
      const result = await sorobanService.executeOnNFTTransfer(
        contractId,
        tokenId,
        from,
        to,
        actionContractId,
        actionFunction,
        actionArgs,
        stellarWalletService.keypair
      );

      return result;
    } catch (error) {
      console.error('Failed to execute on NFT transfer:', error);
      throw error;
    }
  }

  /**
   * Get NFT metadata
   */
  async getNFTMetadata(contractId, tokenId) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      return await sorobanService.getNFTMetadata(contractId, tokenId);
    } catch (error) {
      console.error('Failed to get NFT metadata:', error);
      throw error;
    }
  }

  /**
   * Get NFT balance for an account
   */
  async getNFTBalance(contractId, account) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      return await sorobanService.getNFTBalance(contractId, account);
    } catch (error) {
      console.error('Failed to get NFT balance:', error);
      throw error;
    }
  }

  /**
   * Get all NFT collections
   */
  getCollections() {
    return Array.from(this.contracts.values());
  }

  /**
   * Get specific collection
   */
  getCollection(contractId) {
    return this.contracts.get(contractId);
  }

  /**
   * Create NFT with location data (for geo-located NFTs)
   */
  async createLocationNFT(contractId, recipient, location, metadata = {}) {
    try {
      const locationMetadata = {
        ...metadata,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address || '',
          timestamp: new Date().toISOString()
        }
      };

      return await this.mintNFT(contractId, recipient, locationMetadata);
    } catch (error) {
      console.error('Failed to create location NFT:', error);
      throw error;
    }
  }

  /**
   * Transfer NFT with location update
   */
  async transferLocationNFT(contractId, tokenId, from, to, newLocation) {
    try {
      // First transfer the NFT
      const transferResult = await this.transferNFT(contractId, tokenId, from, to);
      
      // Then update location metadata
      const metadata = await this.getNFTMetadata(contractId, tokenId);
      const updatedMetadata = {
        ...metadata,
        location: {
          ...metadata.location,
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          address: newLocation.address || metadata.location?.address || '',
          timestamp: new Date().toISOString()
        }
      };

      // Update metadata (this would typically involve calling a contract function)
      // For now, we'll just return the transfer result
      return {
        ...transferResult,
        updatedMetadata
      };
    } catch (error) {
      console.error('Failed to transfer location NFT:', error);
      throw error;
    }
  }

  /**
   * Get NFTs by location (within radius)
   */
  async getNFTsByLocation(contractId, centerLat, centerLng, radiusKm) {
    try {
      // This would typically involve querying a smart contract
      // For now, we'll return mock data
      return {
        nfts: [],
        center: { latitude: centerLat, longitude: centerLng },
        radius: radiusKm
      };
    } catch (error) {
      console.error('Failed to get NFTs by location:', error);
      throw error;
    }
  }

  /**
   * Validate NFT ownership
   */
  async validateOwnership(contractId, tokenId, account) {
    try {
      const balance = await this.getNFTBalance(contractId, account);
      return balance.balance > 0;
    } catch (error) {
      console.error('Failed to validate ownership:', error);
      return false;
    }
  }

  /**
   * Get NFT transaction history
   */
  async getNFTTransactionHistory(contractId, tokenId) {
    try {
      // This would typically involve querying the Stellar network for transactions
      // For now, we'll return mock data
      // eslint-disable-next-line no-unreachable
      return [];
    } catch (error) {
      console.error('Failed to get NFT transaction history:', error);
      throw error;
    }
  }
}

// Export singleton instance
// eslint-disable-next-line import/no-anonymous-default-export
const nftService = new NFTService();
export default nftService;
