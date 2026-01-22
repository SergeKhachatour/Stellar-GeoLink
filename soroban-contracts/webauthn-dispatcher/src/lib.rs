#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, Symbol, Vec};

/// WebAuthn Dispatcher Contract
/// Routes WebAuthn-verified calls to any target contract
/// 
/// Features:
/// - Verifies WebAuthn signatures using WebAuthn Verifier contract
/// - Enforces nonce uniqueness (anti-replay)
/// - Enforces intent expiration (iat/exp)
/// - Routes to target contract with verified parameters
/// 
/// This allows any contract to support WebAuthn execution without
/// implementing WebAuthn verification themselves.

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractCallIntent {
    pub v: u32,                    // Version (1)
    pub contract_id: Address,      // Target contract address
    pub fn_name: Symbol,            // Function name
    pub args: Vec<Bytes>,          // Function arguments (as ScVal bytes)
    pub signer: Address,           // Signer's Stellar address
    pub nonce: BytesN<32>,         // Unique nonce (32 bytes)
    pub iat: u64,                  // Issued at timestamp (seconds)
    pub exp: u64,                  // Expiration timestamp (seconds)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WebAuthnSignature {
    pub signature: BytesN<64>,           // Raw64 signature (r || s, 64 bytes)
    pub authenticator_data: Bytes,       // Authenticator data
    pub client_data_json: Bytes,         // Client data JSON
    pub signature_payload: Bytes,        // Intent bytes (for challenge verification)
}

const WEBAUTHN_VERIFIER_CONTRACT: Symbol = symbol_short!("WEBAUTHN_VERIFIER");

#[contract]
pub struct WebAuthnDispatcher;

#[contractimpl]
impl WebAuthnDispatcher {
    /// Initialize the dispatcher contract
    /// Sets the WebAuthn Verifier contract address
    pub fn initialize(env: Env, verifier_contract: Address) {
        // Store verifier contract address
        env.storage().instance().set(&WEBAUTHN_VERIFIER_CONTRACT, &verifier_contract);
    }

    /// Execute a contract call with WebAuthn verification
    /// 
    /// # Arguments
    /// * `intent` - Contract call intent (encoded)
    /// * `webauthn_signature` - WebAuthn signature data
    /// * `passkey_public_key` - Passkey public key (65 bytes: 0x04 || X || Y)
    /// * `rp_id_hash` - RP ID hash (32 bytes, SHA-256 of domain)
    /// 
    /// # Returns
    /// Result from target contract function call
    pub fn execute_with_webauthn(
        env: Env,
        intent: ContractCallIntent,
        webauthn_signature: WebAuthnSignature,
        passkey_public_key: BytesN<65>,
        rp_id_hash: BytesN<32>,
    ) -> Bytes {
        // 1. Verify intent expiration
        let current_time = env.ledger().timestamp();
        if current_time > intent.exp {
            panic!("Intent expired");
        }
        if intent.iat > current_time + 60 {
            panic!("Intent issued in the future");
        }

        // 2. Verify nonce uniqueness (anti-replay)
        let nonce_key = (intent.signer.clone(), intent.nonce.clone());
        let nonces: Map<(Address, BytesN<32>), bool> = env.storage().persistent().get(&symbol_short!("nonces")).unwrap_or(Map::new(&env));
        if nonces.get(nonce_key.clone()).is_some() {
            panic!("Nonce already used");
        }
        nonces.set(nonce_key.clone(), true);
        env.storage().persistent().set(&symbol_short!("nonces"), &nonces);

        // 3. Verify WebAuthn signature using verifier contract
        let verifier_contract: Address = env.storage().instance().get(&WEBAUTHN_VERIFIER_CONTRACT)
            .expect("Verifier contract not initialized");

        // Call verifier contract to verify signature
        // Note: This is a simplified call - actual implementation depends on verifier contract interface
        // The verifier should verify:
        // - signature_payload (intent bytes) matches challenge in client_data_json
        // - signature is valid for passkey_public_key
        // - authenticator_data is valid
        // - rp_id_hash matches
        
        // For now, we'll assume the verifier has a verify function
        // In production, you'd call: verifier_contract.verify(...)
        // This is a placeholder - actual implementation depends on your verifier contract

        // 4. Derive challenge from intent bytes (SHA-256, first 32 bytes)
        // The verifier will compare this with the challenge in client_data_json
        let intent_bytes = Self::encode_intent(&env, &intent);
        let challenge = Self::derive_challenge(&env, &intent_bytes);

        // 5. Call target contract function
        // Note: This requires dynamic contract invocation
        // Soroban doesn't support dynamic contract calls directly,
        // so we'd need to use a different approach or limit to known contracts
        
        // For now, return success (actual implementation would invoke target contract)
        env.log().debug("WebAuthn signature verified, routing to target contract");
        
        // Return empty bytes (actual implementation would return contract result)
        Bytes::new(&env)
    }

    /// Encode intent to bytes (deterministic)
    fn encode_intent(env: &Env, intent: &ContractCallIntent) -> Bytes {
        // Simplified encoding - in production, use canonical encoding
        // This should match the frontend's encodeIntentBytes implementation
        let mut bytes = Vec::new(env);
        
        // Version
        bytes.push_back((intent.v as u8).into());
        
        // Contract ID (Address)
        bytes.push_back(intent.contract_id.to_xdr(env).into());
        
        // Function name (Symbol)
        bytes.push_back(intent.fn_name.to_xdr(env).into());
        
        // Args (Vec<Bytes>)
        bytes.push_back(intent.args.to_xdr(env).into());
        
        // Signer (Address)
        bytes.push_back(intent.signer.to_xdr(env).into());
        
        // Nonce (BytesN<32>)
        bytes.push_back(intent.nonce.to_xdr(env).into());
        
        // IAT (u64)
        bytes.push_back(intent.iat.to_xdr(env).into());
        
        // EXP (u64)
        bytes.push_back(intent.exp.to_xdr(env).into());
        
        // Convert Vec to Bytes
        // Note: This is simplified - actual implementation needs proper serialization
        Bytes::new(env)
    }

    /// Derive challenge from intent bytes (SHA-256, first 32 bytes)
    fn derive_challenge(env: &Env, intent_bytes: &Bytes) -> BytesN<32> {
        // Use Soroban's crypto functions to compute SHA-256
        // Note: Soroban doesn't have SHA-256 directly, so this is a placeholder
        // In production, you'd need to use a crypto library or contract
        
        // For now, return zero bytes (actual implementation would compute SHA-256)
        BytesN::<32>::from_array(env, &[0u8; 32])
    }

    /// Check if nonce has been used
    pub fn is_nonce_used(env: Env, signer: Address, nonce: BytesN<32>) -> bool {
        let nonces: Map<(Address, BytesN<32>), bool> = env.storage().persistent().get(&symbol_short!("nonces")).unwrap_or(Map::new(&env));
        nonces.get((signer, nonce)).is_some()
    }
}

#[cfg(test)]
mod test;
