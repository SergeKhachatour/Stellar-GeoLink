/**
 * Enhanced Stellar Wallet Service
 * Following Stellar Wallet Playbook best practices
 * https://stellarplaybook.com/category/wallets
 */

import { 
  StellarSdk, 
  Horizon, 
  Networks, 
  Keypair, 
  TransactionBuilder, 
  Operation,
  Asset,
  Memo
} from '@stellar/stellar-sdk';

class StellarWalletService {
  constructor() {
    this.server = null;
    this.networkPassphrase = null;
    this.isInitialized = false;
    this.account = null;
    this.keypair = null;
    this.balances = [];
    this.sequenceNumber = null;
  }

  /**
   * Initialize Stellar SDK with proper network configuration
   * Following Stellar Playbook infrastructure recommendations
   */
  async initialize(network = 'testnet') {
    try {
      if (this.isInitialized) {
        return true;
      }

      // Configure network based on environment
      if (network === 'testnet') {
        this.server = new Horizon.Server('https://horizon-testnet.stellar.org');
        this.networkPassphrase = Networks.TESTNET;
      } else if (network === 'mainnet') {
        this.server = new Horizon.Server('https://horizon.stellar.org');
        this.networkPassphrase = Networks.PUBLIC;
      } else {
        throw new Error('Invalid network. Use "testnet" or "mainnet"');
      }

      // Test connection
      await this.server.fetchTimebounds();
      this.isInitialized = true;
      
      console.log(`Stellar SDK initialized for ${network} network`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Stellar SDK:', error);
      throw error;
    }
  }

  /**
   * Connect wallet with keypair (following Stellar Playbook key management)
   */
  async connectWallet(secretKey) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate and create keypair
      this.keypair = Keypair.fromSecret(secretKey);
      this.publicKey = this.keypair.publicKey();

      // Load account information
      await this.loadAccount();
      
      return {
        publicKey: this.publicKey,
        account: this.account,
        balances: this.balances
      };
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }

  /**
   * Connect wallet in view-only mode (public key only)
   */
  async connectWalletViewOnly(publicKey) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      this.publicKey = publicKey;
      this.keypair = null; // No secret key for view-only mode

      // Load account information
      await this.loadAccount();
      
      return {
        publicKey: this.publicKey,
        account: this.account,
        balances: this.balances
      };
    } catch (error) {
      console.error('Failed to connect wallet (view-only):', error);
      throw error;
    }
  }

  /**
   * Load account information from Stellar network
   */
  async loadAccount() {
    try {
      if (!this.publicKey) {
        throw new Error('No public key available');
      }

      this.account = await this.server.loadAccount(this.publicKey);
      this.sequenceNumber = this.account.sequenceNumber();
      this.balances = this.account.balances;

      return this.account;
    } catch (error) {
      console.error('Failed to load account:', error);
      throw error;
    }
  }

  /**
   * Get account balance for specific asset
   */
  getBalance(assetCode = 'XLM', assetIssuer = null) {
    if (!this.balances || this.balances.length === 0) {
      return '0';
    }

    const balance = this.balances.find(b => {
      if (assetCode === 'XLM') {
        return b.asset_type === 'native';
      }
      return b.asset_code === assetCode && b.asset_issuer === assetIssuer;
    });

    return balance ? balance.balance : '0';
  }

  /**
   * Send XLM transaction (following Stellar Playbook transaction patterns)
   */
  async sendTransaction(destination, amount, memo = null) {
    try {
      if (!this.keypair) {
        throw new Error('Secret key required for sending transactions');
      }

      if (!this.account) {
        await this.loadAccount();
      }

      // Create transaction builder
      const transaction = new TransactionBuilder(this.account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      });

      // Add payment operation
      transaction.addOperation(
        Operation.payment({
          destination: destination,
          asset: Asset.native(),
          amount: amount.toString()
        })
      );

      // Add memo if provided
      if (memo) {
        transaction.addMemo(Memo.text(memo));
      }

      // Set timeout
      transaction.setTimeout(30);

      // Build and sign transaction
      const builtTransaction = transaction.build();
      builtTransaction.sign(this.keypair);

      // Submit transaction
      const result = await this.server.submitTransaction(builtTransaction);
      
      // Reload account after successful transaction
      await this.loadAccount();

      return result;
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw error;
    }
  }

  /**
   * Create and manage Soroban smart contract interactions
   * Following Stellar Playbook Soroban recommendations
   */
  async invokeSorobanContract(contractId, method, args = [], options = {}) {
    try {
      if (!this.keypair) {
        throw new Error('Secret key required for smart contract interactions');
      }

      if (!this.account) {
        await this.loadAccount();
      }

      // Create Soroban transaction
      const transaction = new TransactionBuilder(this.account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      });

      // Add Soroban invoke operation
      transaction.addOperation(
        Operation.invokeHostFunction({
          func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
            StellarSdk.xdr.ScAddress.scAddressTypeContract(
              StellarSdk.xdr.ContractId.fromXDR(contractId, 'hex')
            ),
            StellarSdk.xdr.ScSymbol(method),
            args
          ),
          auth: []
        })
      );

      // Set timeout
      transaction.setTimeout(30);

      // Build and sign transaction
      const builtTransaction = transaction.build();
      builtTransaction.sign(this.keypair);

      // Submit transaction
      const result = await this.server.submitTransaction(builtTransaction);
      
      return result;
    } catch (error) {
      console.error('Failed to invoke Soroban contract:', error);
      throw error;
    }
  }

  /**
   * Mint NFT using Soroban smart contract
   * Following Stellar Playbook NFT recommendations
   */
  async mintNFT(contractId, recipient, metadata = {}) {
    try {
      if (!this.keypair) {
        throw new Error('Secret key required for minting NFTs');
      }

      // Prepare arguments for mint function
      const args = [
        StellarSdk.xdr.ScVal.scvAddress(
          StellarSdk.xdr.ScAddress.scAddressTypeAccount(
            StellarSdk.xdr.PublicKey.fromString(recipient)
          )
        ),
        StellarSdk.xdr.ScVal.scvString(JSON.stringify(metadata))
      ];

      // Invoke mint function
      const result = await this.invokeSorobanContract(contractId, 'mint', args);
      
      return result;
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      throw error;
    }
  }

  /**
   * Transfer NFT using Soroban smart contract
   */
  async transferNFT(contractId, tokenId, from, to) {
    try {
      if (!this.keypair) {
        throw new Error('Secret key required for transferring NFTs');
      }

      // Prepare arguments for transfer function
      const args = [
        StellarSdk.xdr.ScVal.scvAddress(
          StellarSdk.xdr.ScAddress.scAddressTypeAccount(
            StellarSdk.xdr.PublicKey.fromString(from)
          )
        ),
        StellarSdk.xdr.ScVal.scvAddress(
          StellarSdk.xdr.ScAddress.scAddressTypeAccount(
            StellarSdk.xdr.PublicKey.fromString(to)
          )
        ),
        StellarSdk.xdr.ScVal.scvU32(tokenId)
      ];

      // Invoke transfer function
      const result = await this.invokeSorobanContract(contractId, 'transfer', args);
      
      return result;
    } catch (error) {
      console.error('Failed to transfer NFT:', error);
      throw error;
    }
  }

  /**
   * Execute smart contract when NFT is transferred
   * This can be used for automated actions on NFT transfers
   */
  async executeOnNFTTransfer(contractId, tokenId, from, to, actionContractId, actionMethod, actionArgs = []) {
    try {
      // First transfer the NFT
      const transferResult = await this.transferNFT(contractId, tokenId, from, to);
      
      // Then execute the smart contract action
      const actionResult = await this.invokeSorobanContract(actionContractId, actionMethod, actionArgs);
      
      return {
        transfer: transferResult,
        action: actionResult
      };
    } catch (error) {
      console.error('Failed to execute on NFT transfer:', error);
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(limit = 10) {
    try {
      if (!this.publicKey) {
        throw new Error('No public key available');
      }

      const transactions = await this.server
        .transactions()
        .forAccount(this.publicKey)
        .order('desc')
        .limit(limit)
        .call();

      return transactions.records;
    } catch (error) {
      console.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  /**
   * Fund account with testnet XLM (for development)
   */
  async fundAccount(publicKey = null) {
    try {
      const address = publicKey || this.publicKey;
      if (!address) {
        throw new Error('No public key available');
      }

      const response = await fetch(`https://friendbot.stellar.org?addr=${address}`);
      
      if (response.ok) {
        await this.loadAccount();
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
   * Generate new keypair
   */
  generateKeypair() {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret()
    };
  }

  /**
   * Validate public key format
   */
  isValidPublicKey(publicKey) {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate secret key format
   */
  isValidSecretKey(secretKey) {
    try {
      Keypair.fromSecret(secretKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect() {
    this.keypair = null;
    this.publicKey = null;
    this.account = null;
    this.balances = [];
    this.sequenceNumber = null;
  }

  /**
   * Get wallet status
   */
  getStatus() {
    return {
      isConnected: !!this.publicKey,
      hasSecretKey: !!this.keypair,
      publicKey: this.publicKey,
      account: this.account,
      balances: this.balances
    };
  }
}

// Export singleton instance
const stellarWalletService = new StellarWalletService();
export default stellarWalletService;
