#![cfg(test)]

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, Address, Bytes, BytesN, Env};

#[test]
fn test_initialize() {
    let env = Env::default();
    let dispatcher = WebAuthnDispatcher;
    let verifier_contract = Address::random(&env);
    
    dispatcher.initialize(&env, &verifier_contract);
    
    // Verify verifier contract is stored
    let stored: Address = env.storage().instance().get(&symbol_short!("WEBAUTHN_VERIFIER")).unwrap();
    assert_eq!(stored, verifier_contract);
}

#[test]
fn test_nonce_uniqueness() {
    let env = Env::default();
    let dispatcher = WebAuthnDispatcher;
    let signer = Address::random(&env);
    let nonce = BytesN::<32>::from_array(&env, &[0u8; 32]);
    
    // First check should return false (not used)
    assert_eq!(dispatcher.is_nonce_used(&env, &signer, &nonce), false);
    
    // After using nonce, it should be marked as used
    // Note: This requires calling execute_with_webauthn, which is not fully implemented
    // For now, this is a placeholder test
}
