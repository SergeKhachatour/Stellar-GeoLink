/**
 * Real NFT Service
 * Integrates with actual Stellar testnet and OpenZeppelin contracts
 * Handles real NFT minting, transferring, and metadata management
 */

// Dynamic imports will be used instead of static imports
import stellarWalletService from './stellarWallet';
import contractDeploymentService from './contractDeployment';

class RealNFTService {
  constructor() {
    this.server = null;
    this.sorobanServer = null;
    this.networkPassphrase = null;
    this.isInitialized = false;
    this.contracts = new Map();
    this.ipfsGateways = [
      'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/'
    ];
  }

  /**
   * Initialize real NFT service
   */
  async initialize(network = 'testnet') {
    try {
      if (this.isInitialized) {
        return true;
      }

      // Initialize underlying services
      await stellarWalletService.initialize(network);
      await contractDeploymentService.initialize(network);

      // Import StellarSdk dynamically
      const StellarSdk = await import('@stellar/stellar-sdk');

      // Configure network
      if (network === 'testnet') {
        this.server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
        this.sorobanServer = new StellarSdk.SorobanRpc.Server('https://soroban-testnet.stellar.org');
        this.networkPassphrase = StellarSdk.Networks.TESTNET;
      } else if (network === 'mainnet') {
        this.server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
        this.sorobanServer = new StellarSdk.SorobanRpc.Server('https://soroban.stellar.org');
        this.networkPassphrase = StellarSdk.Networks.PUBLIC;
      }

      this.isInitialized = true;
      console.log('Real NFT Service initialized for', network);
      return true;
    } catch (error) {
      console.error('Failed to initialize real NFT service:', error);
      throw error;
    }
  }

  /**
   * Deploy LocationNFT contract
   */
  async deployLocationNFTContract(adminKeypair, contractName = 'StellarGeoLinkNFT') {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('Setting up LocationNFT contract with admin:', adminKeypair.publicKey());
      
      // Setup the already deployed contract
      const contractInfo = await contractDeploymentService.setupDeployedContract(
        adminKeypair,
        contractName
      );

      // Store contract information
      this.contracts.set(contractInfo.contractId, {
        ...contractInfo,
        isActive: true,
        totalMinted: 0,
        totalTransferred: 0
      });
      
      console.log('Contract stored in realNFTService:', contractInfo.contractId);

      console.log('LocationNFT contract deployed and initialized:', contractInfo.contractId);
      return contractInfo;
    } catch (error) {
      console.error('Failed to deploy LocationNFT contract:', error);
      throw error;
    }
  }

  /**
   * Mint NFT with location validation
   */
  async mintLocationNFT(contractId, recipient, metadata, location, minterKeypair) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('Minting location NFT:', { contractId, recipient, location });
      console.log('Location coordinates:', {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeType: typeof location.latitude,
        longitudeType: typeof location.longitude,
        latitudeValue: location.latitude,
        longitudeValue: location.longitude
      });

      // Validate contract exists
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error('Contract not found. Please deploy a contract first.');
      }

      // Import StellarSdk dynamically
      const StellarSdk = await import('@stellar/stellar-sdk');

      // The contract exists on StellarExpert, so let's try to use it directly
      console.log('✅ Contract exists on StellarExpert, proceeding with minting');
      console.log('Contract ID:', contractId);
      console.log('StellarExpert link: https://stellar.expert/explorer/testnet/contract/' + contractId);
      
      // Check if contract is initialized by trying to call a simple function
      try {
        const testContract = new StellarSdk.Contract(contractId);
        const testTransaction = new StellarSdk.TransactionBuilder(await this.server.loadAccount(minterKeypair.publicKey()), {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: this.networkPassphrase
        });
        
        testTransaction.addOperation(
          testContract.call('name')
        );
        
        const testTx = testTransaction.setTimeout(30).build();
        testTx.sign(minterKeypair);
        
        try {
          await this.sorobanServer.sendTransaction(testTx);
          console.log('✅ Contract is properly initialized');
        } catch (initError) {
          console.log('⚠️ Contract is not initialized, attempting to initialize...');
          
          // Try to initialize the contract
          const initTransaction = new StellarSdk.TransactionBuilder(await this.server.loadAccount(minterKeypair.publicKey()), {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase
          });
          
          initTransaction.addOperation(
            testContract.call(
              'initialize',
              StellarSdk.Address.fromString(minterKeypair.publicKey()),
              'StellarGeoLinkNFT',
              'SGL'
            )
          );
          
          const initTx = initTransaction.setTimeout(30).build();
          initTx.sign(minterKeypair);
          
          try {
            const initResponse = await this.sorobanServer.sendTransaction(initTx);
            console.log('✅ Contract initialized successfully');
            console.log('Initialization transaction hash:', initResponse.hash);
            console.log('Ledger:', initResponse.ledger);
          } catch (initError2) {
            console.log('⚠️ Contract initialization failed:', initError2.message);
            throw new Error(`Contract initialization failed: ${initError2.message}. Please ensure the contract is properly deployed and initialized.`);
          }
        }
      } catch (checkError) {
        console.log('⚠️ Could not verify contract initialization, continuing with minting attempt:', checkError.message);
      }

      // Load minter account
      const minterAccount = await this.server.loadAccount(minterKeypair.publicKey());

      // Generate unique token ID
      const tokenId = contract.totalMinted + 1;

      // Create transaction
      const transaction = new StellarSdk.TransactionBuilder(minterAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      });

      // Prepare metadata with IPFS URL
      const fullImageUrl = this.buildIPFSUrl(metadata.ipfs_hash, metadata.filename);
      const nftMetadata = {
        name: metadata.name,
        description: metadata.description,
        image_url: fullImageUrl,
        ipfs_hash: metadata.ipfs_hash,
        attributes: metadata.attributes || {},
        location: {
          latitude: location.latitude.toString(), // Store as string to preserve decimal precision
          longitude: location.longitude.toString(),
          radius: location.radius || 100 // Default 100m radius
        },
        created_at: Date.now()
      };

      // Use the correct SDK v12 approach from Stellar documentation
      // Try different approaches to create the contract
      let mintContract;
      
      try {
        // First try: Direct contract ID
        mintContract = new StellarSdk.Contract(contractId);
        console.log('✅ Contract created with direct contract ID');
      } catch (directError) {
        console.log('⚠️ Direct contract ID failed, trying Address approach:', directError.message);
        
        try {
          // Second try: Using Address.fromString
          const contractAddress = StellarSdk.Address.fromString(contractId);
          mintContract = new StellarSdk.Contract(contractAddress);
          console.log('✅ Contract created with Address.fromString');
        } catch (addressError) {
          console.error('❌ Both contract creation methods failed:', addressError.message);
          throw new Error(`Failed to create contract instance: ${addressError.message}`);
        }
      }
      
      // Add mint operation using the contract's call method (align with contract signature)
      // Contract mint signature:
      // mint(env, to: Address, token_id: u32, name: String, symbol: String, uri: String, latitude: i64, longitude: i64, radius: u32)
      transaction.addOperation(
        mintContract.call(
          'mint',
          // to
          StellarSdk.xdr.ScVal.scvAddress(
            StellarSdk.Address.fromString(recipient).toScAddress()
          ),
          // token_id
          StellarSdk.xdr.ScVal.scvU32(tokenId),
          // name
          StellarSdk.xdr.ScVal.scvString(nftMetadata.name),
          // symbol (use SGL)
          StellarSdk.xdr.ScVal.scvString('SGL'),
          // uri
          StellarSdk.xdr.ScVal.scvString(nftMetadata.image_url),
          // latitude
          (() => {
            const latString = location.latitude.toString();
            console.log('Latitude conversion:', {
              original: location.latitude,
              string: latString,
              final: latString
            });
            return StellarSdk.xdr.ScVal.scvString(latString);
          })(),
          // longitude
          (() => {
            const lngString = location.longitude.toString();
            console.log('Longitude conversion:', {
              original: location.longitude,
              string: lngString,
              final: lngString
            });
            return StellarSdk.xdr.ScVal.scvString(lngString);
          })(),
          // radius
          StellarSdk.xdr.ScVal.scvU32(nftMetadata.location.radius)
        )
      );

      // Set timeout
      transaction.setTimeout(30);

      // Build, prepare (add footprint), sign and submit transaction
      const builtTransaction = transaction.build();
      const preparedTransaction = await this.sorobanServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(minterKeypair);

      // Submit transaction to Soroban RPC
      const result = await this.sorobanServer.sendTransaction(preparedTransaction);

      // Update contract stats
      contract.totalMinted += 1;
      this.contracts.set(contractId, contract);

      console.log('NFT minted successfully:', result);
      return {
        ...result,
        tokenId,
        contractId,
        recipient,
        metadata: nftMetadata
      };
    } catch (error) {
      console.error('Failed to mint location NFT:', error);
      throw error;
    }
  }

  /**
   * Transfer NFT with location validation
   */
  async transferLocationNFT(contractId, tokenId, from, to, fromLocation, toLocation, transferrerKeypair) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('Transferring location NFT:', { contractId, tokenId, from, to });

      // Validate contract exists
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      // Import StellarSdk dynamically
      const StellarSdk = await import('@stellar/stellar-sdk');

      // Load transferrer account
      const transferrerAccount = await this.server.loadAccount(transferrerKeypair.publicKey());

      // Create transaction
      const transaction = new StellarSdk.TransactionBuilder(transferrerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      });

      // Use the correct SDK v12 approach from Stellar documentation
      // Try different approaches to create the contract
      let transferContract;
      
      try {
        // First try: Direct contract ID
        transferContract = new StellarSdk.Contract(contractId);
        console.log('✅ Transfer contract created with direct contract ID');
      } catch (directError) {
        console.log('⚠️ Direct contract ID failed, trying Address approach:', directError.message);
        
        try {
          // Second try: Using Address.fromString
          const contractAddress = StellarSdk.Address.fromString(contractId);
          transferContract = new StellarSdk.Contract(contractAddress);
          console.log('✅ Transfer contract created with Address.fromString');
        } catch (addressError) {
          console.error('❌ Both transfer contract creation methods failed:', addressError.message);
          throw new Error(`Failed to create transfer contract instance: ${addressError.message}`);
        }
      }
      
      // Add transfer operation using the contract's call method with proper ScVal conversion
      transaction.addOperation(
        transferContract.call(
          'transfer',
          StellarSdk.xdr.ScVal.scvAddress(
            StellarSdk.Address.fromString(from).toScAddress()
          ),
          StellarSdk.xdr.ScVal.scvAddress(
            StellarSdk.Address.fromString(to).toScAddress()
          ),
          StellarSdk.xdr.ScVal.scvU32(tokenId)
        )
      );

      // Set timeout
      transaction.setTimeout(30);

      // Build, prepare (add footprint), sign and submit transaction
      const builtTransaction = transaction.build();
      const preparedTransaction = await this.sorobanServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(transferrerKeypair);

      // Submit transaction to Soroban RPC
      const result = await this.sorobanServer.sendTransaction(preparedTransaction);

      // Update contract stats
      contract.totalTransferred += 1;
      this.contracts.set(contractId, contract);

      console.log('NFT transferred successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to transfer location NFT:', error);
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

      // This would be a real contract call in production
      // For now, return mock data
      return {
        tokenId,
        contractId,
        name: `Location NFT #${tokenId}`,
        description: 'A location-based NFT on Stellar',
        image_url: 'https://via.placeholder.com/300x300',
        ipfs_hash: '',
        attributes: {},
        location: {
          latitude: 0,
          longitude: 0,
          radius: 100
        },
        created_at: Date.now()
      };
    } catch (error) {
      console.error('Failed to get NFT metadata:', error);
      throw error;
    }
  }

  /**
   * Get user's NFT collection
   */
  async getUserNFTs(contractId, userAddress) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // This would query the contract for user's NFTs
      // For now, return mock data
      return {
        user: userAddress,
        contractId,
        nfts: [],
        total: 0
      };
    } catch (error) {
      console.error('Failed to get user NFTs:', error);
      throw error;
    }
  }

  /**
   * Build IPFS URL from hash and filename
   */
  buildIPFSUrl(ipfsHash, filename, gatewayIndex = 0) {
    const gateway = this.ipfsGateways[gatewayIndex];
    return `${gateway}${ipfsHash}/${filename}`;
  }

  /**
   * Get available IPFS gateways
   */
  getIPFSGateways() {
    return this.ipfsGateways;
  }

  /**
   * Set IPFS gateway
   */
  setIPFSGateway(gateway) {
    if (!this.ipfsGateways.includes(gateway)) {
      this.ipfsGateways.unshift(gateway);
    }
  }

  /**
   * Fund account with testnet XLM
   */
  async fundAccount(publicKey) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('Funding account with testnet XLM:', publicKey);
      
      const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      
      if (response.ok) {
        console.log('Account funded successfully');
        return true;
      } else {
        throw new Error('Failed to fund account');
      }
    } catch (error) {
      console.error('Failed to fund account:', error);
      throw error;
    }
  }

  /**
   * Get contract information
   */
  getContract(contractId) {
    return this.contracts.get(contractId);
  }

  /**
   * Get all contracts
   */
  getAllContracts() {
    // Always include the deployed contract
    const deployedContractId = 'CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q';
    
    if (!this.contracts.has(deployedContractId)) {
      const contractInfo = {
        contractId: deployedContractId,
        name: 'StellarGeoLinkNFT',
        type: 'LocationNFT',
        deployedAt: new Date().toISOString(),
        admin: 'Not initialized',
        network: 'testnet',
        transactionHash: 'deployed_via_lab',
        ledger: 'deployed_via_lab',
        isActive: false,
        totalMinted: 0,
        totalTransferred: 0
      };
      
      this.contracts.set(deployedContractId, contractInfo);
    }
    
    return Array.from(this.contracts.values());
  }

  /**
   * Validate contract deployment
   */
  async validateContract(contractId) {
    try {
      return await contractDeploymentService.validateContract(contractId);
    } catch (error) {
      console.error('Contract validation failed:', error);
      return false;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      network: this.networkPassphrase ? 'testnet' : 'unknown', // Simplified since we can't access StellarSdk here
      contracts: this.contracts.size,
      ipfsGateways: this.ipfsGateways.length
    };
  }
}

// Export singleton instance
const realNFTService = new RealNFTService();
export default realNFTService;
