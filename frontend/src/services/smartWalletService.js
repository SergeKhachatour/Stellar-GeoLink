/**
 * Smart Wallet Service
 * Handles interactions with XYZ-Wallet smart wallet contract
 * Based on CUSTOM_CONTRACT_INTEGRATION_ANALYSIS.md
 */

class SmartWalletService {
  constructor() {
    this.sorobanServer = null;
    this.networkPassphrase = null;
    this.isInitialized = false;
  }

  /**
   * Initialize smart wallet service
   */
  async initialize(network = 'testnet') {
    try {
      if (this.isInitialized) {
        return true;
      }

      const StellarSdk = await import('@stellar/stellar-sdk');

      // Configure network
      if (network === 'testnet') {
        this.sorobanServer = new StellarSdk.SorobanRpc.Server('https://soroban-testnet.stellar.org');
        this.networkPassphrase = StellarSdk.Networks.TESTNET;
      } else if (network === 'mainnet') {
        this.sorobanServer = new StellarSdk.SorobanRpc.Server('https://soroban.stellar.org');
        this.networkPassphrase = StellarSdk.Networks.PUBLIC;
      } else {
        throw new Error('Invalid network. Use "testnet" or "mainnet"');
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize smart wallet service:', error);
      throw error;
    }
  }

  /**
   * Get balance from smart wallet contract
   * Calls: get_balance(user: Address, asset: Address) -> i128
   */
  async getBalance(contractId, userPublicKey, assetAddress = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const StellarSdk = await import('@stellar/stellar-sdk');

      // Create contract instance
      const contract = new StellarSdk.Contract(contractId);

      // Build get_balance call
      // If assetAddress is null, use native XLM (Address with all zeros)
      const assetAddr = assetAddress 
        ? StellarSdk.Address.fromString(assetAddress)
        : StellarSdk.Address.fromString('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'); // Native asset placeholder

      const userAddr = StellarSdk.Address.fromString(userPublicKey);

      // Create a dummy account for simulation (we don't need to sign for read-only calls)
      const dummyKeypair = StellarSdk.Keypair.random();
      const dummyAccount = await this.sorobanServer.getAccount(dummyKeypair.publicKey()).catch(() => {
        // Account doesn't exist, create a minimal account object for simulation
        return {
          accountId: dummyKeypair.publicKey(),
          sequenceNumber: '0'
        };
      });

      // Build transaction for simulation
      const transaction = new StellarSdk.TransactionBuilder(
        typeof dummyAccount === 'string' ? { accountId: dummyKeypair.publicKey(), sequenceNumber: '0' } : dummyAccount,
        {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: this.networkPassphrase
        }
      )
        .addOperation(
          contract.call(
            'get_balance',
            StellarSdk.xdr.ScVal.scvAddress(userAddr.toScAddress()),
            StellarSdk.xdr.ScVal.scvAddress(assetAddr.toScAddress())
          )
        )
        .setTimeout(30)
        .build();

      // Simulate transaction (read-only, no signing needed)
      const simulation = await this.sorobanServer.simulateTransaction(transaction);

      if (simulation.errorResult) {
        throw new Error(`Smart wallet simulation failed: ${simulation.errorResult.value()}`);
      }

      // Extract balance from result
      const result = simulation.result.retval;
      if (!result) {
        return '0';
      }

      // Handle i128 result
      if (result.i128) {
        const parts = result.i128();
        const lo = parts.lo().toString();
        const hi = parts.hi().toString();
        // Combine hi and lo parts (hi is high 64 bits, lo is low 64 bits)
        // For most balances, lo should be sufficient
        return lo;
      }

      // Fallback: try to get value directly
      return result.toString() || '0';
    } catch (error) {
      console.error('Failed to get smart wallet balance:', error);
      throw error;
    }
  }

  /**
   * Get balance via backend API (recommended for production)
   */
  async getBalanceViaAPI(userPublicKey, contractId = null, assetAddress = null) {
    try {
      const api = (await import('./api')).default;
      
      const params = new URLSearchParams();
      params.append('userPublicKey', userPublicKey);
      if (contractId) params.append('contractId', contractId);
      if (assetAddress) params.append('assetAddress', assetAddress);

      const response = await api.get(`/smart-wallet/balance?${params.toString()}`);
      return response.data.balance || '0';
    } catch (error) {
      console.error('Failed to get balance via API:', error);
      throw error;
    }
  }
}

// Create singleton instance
const smartWalletService = new SmartWalletService();

export default smartWalletService;

