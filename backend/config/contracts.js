/**
 * Contract Configuration
 * Centralized contract addresses for the application
 */

module.exports = {
  // Smart Wallet Contract (XYZ-Wallet)
  SMART_WALLET_CONTRACT_ID: process.env.SMART_WALLET_CONTRACT_ID || 
    'CA7G33NKXPBMSRRKS4PVBCE56OZDXGQCDUEBJ36NX7NS6RXGBSSMNX6P',
  
  // WebAuthn Verifier Contract
  WEBAUTHN_VERIFIER_CONTRACT_ID: process.env.WEBAUTHN_VERIFIER_CONTRACT_ID || 
    'CBPGL7FWVKVQKRYRU32ZRH7RYKJ3T5UBI4KF2RVLT3BP2UXY7HPAVCWL',
  
  // Default LocationNFT Contract
  DEFAULT_NFT_CONTRACT_ID: process.env.DEFAULT_NFT_CONTRACT_ID || 
    'CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q',
  
  // Network configuration
  STELLAR_NETWORK: process.env.STELLAR_NETWORK || 'testnet',
  SOROBAN_RPC_URL: process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://soroban.stellar.org'
    : 'https://soroban-testnet.stellar.org',
  HORIZON_URL: process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
};

