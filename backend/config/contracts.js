/**
 * Contract Configuration
 * Centralized contract addresses for the application
 */

module.exports = {
  // Smart Wallet Contract (XYZ-Wallet)
  SMART_WALLET_CONTRACT_ID: process.env.SMART_WALLET_CONTRACT_ID || 
    'CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U',
  
  // WebAuthn Verifier Contract
  WEBAUTHN_VERIFIER_CONTRACT_ID: process.env.WEBAUTHN_VERIFIER_CONTRACT_ID || 
    'CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L',
  
  // Default LocationNFT Contract
  DEFAULT_NFT_CONTRACT_ID: process.env.DEFAULT_NFT_CONTRACT_ID || 
    'CCDHRZSNWGW2KTRVPOW5QXR32DTWFLXHXDBC3OZO6CSW2JY7PYV2N4AQ',
  
  // Network configuration
  STELLAR_NETWORK: process.env.STELLAR_NETWORK || 'testnet',
  SOROBAN_RPC_URL: process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://soroban.stellar.org'
    : 'https://soroban-testnet.stellar.org',
  HORIZON_URL: process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
};

