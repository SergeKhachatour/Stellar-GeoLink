/**
 * Contract Configuration
 * Centralized contract addresses for the application
 */

const StellarSdk = require('@stellar/stellar-sdk');

module.exports = {
  // Smart Wallet Contract (XYZ-Wallet)
  SMART_WALLET_CONTRACT_ID: process.env.SMART_WALLET_CONTRACT_ID || 
    'CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U',
  
  // WebAuthn Verifier Contract
  WEBAUTHN_VERIFIER_CONTRACT_ID: process.env.WEBAUTHN_VERIFIER_CONTRACT_ID || 
    'CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L',
  
  // WebAuthn Dispatcher Contract (optional - for universal WebAuthn execution)
  WEBAUTHN_DISPATCHER_CONTRACT_ID: process.env.WEBAUTHN_DISPATCHER_CONTRACT_ID || 
    'CDGRO2434K4NT37VZRILKJYCWNWNIF2M3DUTA47SCKO7TBPCDEF5ZICV',
  
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
    : 'https://horizon-testnet.stellar.org',
  NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET
};
