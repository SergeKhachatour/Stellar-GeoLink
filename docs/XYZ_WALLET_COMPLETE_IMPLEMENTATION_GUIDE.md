# XYZ-Wallet Implementation Guide: Secure Stellar Account Management with WebAuthn

## Overview

This document explains how XYZ-Wallet implements secure Stellar account creation and management without storing secret keys in plaintext local storage. The system uses WebAuthn passkeys for authentication and integrates with GeoLink for location-based deposit execution rules.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Stellar Account Creation](#stellar-account-creation)
3. [Secret Key Management](#secret-key-management)
4. [WebAuthn Integration](#webauthn-integration)
5. [Smart Wallet Signer Registration](#smart-wallet-signer-registration)
6. [Deposit Flow](#deposit-flow)
7. [Smart Contract Call Flow](#smart-contract-call-flow)
8. [GeoLink Deposit Integration](#geolink-deposit-integration) ⬅️ **UPDATED TO USE GEOLINK'S FORMAT**

---

## Architecture Overview

### Key Components

1. **Frontend (React/TypeScript)**
   - `PasskeyService`: Handles WebAuthn passkey registration and authentication
   - `EncryptionService`: Encrypts/decrypts secret keys using WebCrypto API
   - `WalletContext`: Manages wallet state and operations
   - `SmartWalletService`: Interfaces with smart wallet contract

2. **Backend (Node.js/Express)**
   - `/api/smart-wallet/deposit`: Handles token deposits
   - `/api/smart-wallet/execute-transaction`: Executes smart contract calls
   - Both endpoints require WebAuthn signature verification

3. **Smart Contracts (Soroban/Rust)**
   - `SmartWalletContract`: Main contract managing user balances and transactions
   - `WebauthnVerifierContract`: Verifies WebAuthn signatures on-chain

4. **GeoLink Integration**
   - Deposit execution rules triggered by location
   - Uses GeoLink's `ContractCallIntent` format for WebAuthn authentication
   - 5 API endpoints for deposit action management

### Security Principles

- **No Plaintext Secret Keys**: Secret keys are never stored in plaintext in localStorage
- **WebAuthn Authentication**: All sensitive operations require passkey authentication
- **On-Chain Verification**: WebAuthn signatures are verified on-chain via smart contract
- **Encrypted Storage**: Secret keys are encrypted using AES-GCM with key derivation from passkey
- **Standardized Intent Format**: Uses GeoLink's `ContractCallIntent` for deterministic encoding

---

## Stellar Account Creation

### Step 1: Generate Stellar Keypair

```typescript
// client/src/contexts/WalletContext.tsx
const createWalletWithPasskey = async (): Promise<boolean> => {
  // Generate a new Stellar keypair
  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();
  
  // Store public key immediately (safe to store)
  localStorage.setItem('wallet_publicKey', publicKey);
  
  // DO NOT store secret key in plaintext
  // It will be encrypted and stored securely
}
```

### Step 2: Register WebAuthn Passkey

```typescript
// client/src/services/passkeyService.ts
async registerPasskey(userId: string): Promise<PasskeyRegistration> {
  // Generate random challenge (32 bytes)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  
  // Create credential using WebAuthn API
  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "XYZ Wallet",
      id: window.location.hostname, // Relying Party ID
    },
    user: {
      id: new TextEncoder().encode(userId),
      name: userId,
      displayName: userId,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256 (secp256r1)
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
    timeout: 60000,
    attestation: 'direct',
  };
  
  const credential = await navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions,
  }) as PublicKeyCredential;
  
  // Extract credential data
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKeySPKI = this.arrayBufferToBase64(
    response.getPublicKey()!
  );
  const credentialId = this.arrayBufferToBase64(credential.rawId);
  
  return {
    credentialId,
    publicKey: publicKeySPKI,
  };
}
```

### Step 3: Encrypt and Store Secret Key

```typescript
// client/src/services/encryptionService.ts
async encryptAndStoreSecretKey(
  secretKey: string,
  kekParams: KEKDerivationParams
): Promise<EncryptedWalletData> {
  // 1. Generate Data Encryption Key (DEK)
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // 2. Generate IV for encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 3. Encrypt secret key with DEK
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dek,
    new TextEncoder().encode(secretKey)
  );
  
  // 4. Derive Key Encryption Key (KEK) from passkey credential ID
  const kek = await this.deriveKEK(kekParams);
  
  // 5. Generate wrap IV for KEK
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  
  // 6. Wrap (encrypt) DEK with KEK
  const wrappedDEK = await crypto.subtle.wrapKey(
    'raw',
    dek,
    kek,
    { name: 'AES-GCM', iv: wrapIv }
  );
  
  // 7. Store encrypted data structure
  const encryptedData: EncryptedWalletData = {
    wrappedDEK: this.arrayBufferToBase64(wrappedDEK),
    ciphertext: this.arrayBufferToBase64(ciphertext),
    iv: this.arrayBufferToBase64(iv),
    wrapIv: this.arrayBufferToBase64(wrapIv), // CRITICAL: Must be stored
    metadata: {
      algorithm: 'AES-GCM',
      keyDerivation: 'PBKDF2',
      createdAt: new Date().toISOString(),
    },
  };
  
  // Store in localStorage (encrypted, not plaintext)
  localStorage.setItem('xyz_encrypted_wallet', JSON.stringify(encryptedData));
  
  // Remove any plaintext secret key
  localStorage.removeItem('wallet_secretKey');
  
  return encryptedData;
}
```

### Step 4: Store Passkey Credential

```typescript
// client/src/services/passkeyService.ts
async storePasskeyData(
  credentialId: string,
  publicKey: string,
  secretKey?: string
): Promise<void> {
  const passkeyData: PasskeyCredential = {
    id: credentialId,
    publicKey,
    counter: 0,
    deviceType: this.getDeviceType(),
    createdAt: new Date().toISOString(),
  };
  
  // Encrypt passkey data
  const encryptedData = await this.encryptData(JSON.stringify(passkeyData));
  localStorage.setItem('xyz_passkey_data', encryptedData);
  localStorage.setItem('xyz_passkey_enabled', 'true');
  
  // If secret key provided, encrypt and store it
  if (secretKey) {
    const kekParams: KEKDerivationParams = {
      srpSecret: credentialId, // Use credential ID as session secret
      salt: btoa(publicKey) // Use public key as salt
    };
    await encryptionService.encryptAndStoreSecretKey(secretKey, kekParams);
  }
}
```

---

## Secret Key Management

### Key Principles

1. **Never store secret keys in plaintext**
2. **Encrypt using WebCrypto API (AES-GCM)**
3. **Derive encryption key from passkey credential ID**
4. **Decrypt on-demand when needed for transactions**

### Decryption Flow

```typescript
// client/src/services/encryptionService.ts
async decryptSecretKey(
  encryptedData: EncryptedWalletData,
  kekParams: KEKDerivationParams
): Promise<string> {
  // 1. Validate wrapIv exists (critical for decryption)
  if (!encryptedData.wrapIv || encryptedData.wrapIv.trim() === '') {
    throw new Error('Missing wrap IV - wallet cannot be decrypted');
  }
  
  // 2. Derive KEK from passkey credential ID
  const kek = await this.deriveKEK(kekParams);
  
  // 3. Unwrap (decrypt) DEK using KEK
  const wrappedDEK = this.base64ToArrayBuffer(encryptedData.wrappedDEK);
  const wrapIv = this.base64ToArrayBuffer(encryptedData.wrapIv);
  
  const dek = await crypto.subtle.unwrapKey(
    'raw',
    wrappedDEK,
    kek,
    { name: 'AES-GCM', iv: wrapIv },
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );
  
  // 4. Decrypt secret key using DEK
  const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
  const iv = this.base64ToArrayBuffer(encryptedData.iv);
  
  const decryptedBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    dek,
    ciphertext
  );
  
  // 5. Return decrypted secret key
  return new TextDecoder().decode(decryptedBytes);
}
```

### Usage Pattern

```typescript
// When secret key is needed (e.g., for transaction signing)
try {
  // 1. Get encrypted wallet data
  const encryptedData = encryptionService.getEncryptedWalletData();
  
  // 2. Get passkey credential
  const passkeyData = await passkeyService.getStoredPasskeyData();
  
  // 3. Derive KEK parameters
  const kekParams: KEKDerivationParams = {
    srpSecret: passkeyData.id, // Credential ID
    salt: btoa(publicKey) // Public key as salt
  };
  
  // 4. Decrypt secret key
  const secretKey = await encryptionService.decryptSecretKey(
    encryptedData,
    kekParams
  );
  
  // 5. Use secret key for transaction (e.g., sign Stellar transaction)
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  transaction.sign(keypair);
  
  // 6. DO NOT store decrypted secret key - it's only in memory
} catch (error) {
  // Handle decryption failure
  console.error('Failed to decrypt secret key:', error);
}
```

---

## WebAuthn Integration

### WebAuthn Verifier Contract

The system uses an on-chain WebAuthn verifier contract to verify signatures:

```rust
// soroban-contracts/webauthn-verifier/src/contract.rs
pub fn verify(
    e: &Env,
    signature_payload: Bytes,
    pub_key: BytesN<65>,
    sig_data: WebAuthnSigData,
) -> bool {
    // 1. Parse client data JSON
    let client_data_json: ClientDataJson = parse_client_data(&client_data);
    
    // 2. Validate type is "webauthn.get"
    validate_expected_type(&e, &client_data_json);
    
    // 3. Validate challenge matches (first 32 bytes of signature_payload)
    validate_challenge(&e, &client_data_json, &signature_payload);
    
    // 4. Validate authenticator flags (User Present, User Verified)
    validate_user_present_bit_set(&e, flags);
    validate_user_verified_bit_set(&e, flags);
    
    // 5. Compute message hash
    let client_data_hash = e.crypto().sha256(&client_data);
    let mut message_digest = authenticator_data.clone();
    message_digest.extend_from_array(&client_data_hash.to_array());
    let message_hash = e.crypto().sha256(&message_digest);
    
    // 6. Verify secp256r1 signature
    e.crypto().secp256r1_verify(
        &pub_key,
        &message_hash,
        &sig_data.signature
    )
}
```

### Frontend WebAuthn Authentication

```typescript
// client/src/services/passkeyService.ts
async authenticatePasskey(
  credentialId?: string,
  customChallenge?: Uint8Array
): Promise<WebAuthnAuthResult> {
  // 1. Generate or use custom challenge (32 bytes)
  const challenge = customChallenge || (() => {
    const randomChallenge = new Uint8Array(32);
    crypto.getRandomValues(randomChallenge);
    return randomChallenge;
  })();
  
  // 2. Create authentication request
  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60000,
    rpId: window.location.hostname,
    userVerification: 'required',
    allowCredentials: credentialId ? [{
      id: this.base64ToArrayBuffer(credentialId),
      type: 'public-key',
    }] : undefined,
  };
  
  // 3. Authenticate with passkey
  const credential = await navigator.credentials.get({
    publicKey: publicKeyCredentialRequestOptions,
  }) as PublicKeyCredential;
  
  // 4. Extract response data
  const response = credential.response as AuthenticatorAssertionResponse;
  const signature = this.arrayBufferToBase64(response.signature);
  const authenticatorData = this.arrayBufferToBase64(response.authenticatorData);
  const clientDataJSON = this.arrayBufferToBase64(response.clientDataJSON);
  
  return {
    credentialId: this.arrayBufferToBase64(credential.rawId),
    signature,
    authenticatorData,
    clientDataJSON,
  };
}
```

---

## Smart Wallet Signer Registration

### Contract Function

```rust
// soroban-contracts/src/contract.rs
pub fn register_signer(
    e: &Env,
    signer_address: Address,
    passkey_pubkey: Bytes,
    rp_id_hash: Bytes,
) -> bool {
    // Validate inputs
    if passkey_pubkey.len() == 0 || rp_id_hash.len() != 32 {
        return false;
    }
    
    // Store passkey public key
    let mut passkey_map: Map<Address, Bytes> = e.storage()
        .persistent()
        .get(&PASSKEY_MAP_KEY)
        .unwrap_or_else(|| Map::new(e));
    passkey_map.set(signer_address.clone(), passkey_pubkey);
    e.storage().persistent().set(&PASSKEY_MAP_KEY, &passkey_map);
    
    // Store RP ID hash
    let mut rp_id_map: Map<Address, Bytes> = e.storage()
        .persistent()
        .get(&RP_ID_MAP_KEY)
        .unwrap_or_else(|| Map::new(e));
    rp_id_map.set(signer_address.clone(), rp_id_hash);
    e.storage().persistent().set(&RP_ID_MAP_KEY, &rp_id_map);
    
    true
}
```

### Registration Flow

```typescript
// server/routes/smartWallet.js
router.post('/deposit', async (req, res) => {
  // 1. Check if signer is already registered
  const checkRegisteredOp = contract.call('is_signer_registered', userScVal);
  const checkResult = await sorobanServer.simulateTransaction(preparedCheckTx);
  
  if (!signerAlreadyRegistered) {
    // 2. Extract passkey public key from SPKI format
    const spkiBytes = Buffer.from(passkeyPublicKey, 'base64');
    let passkeyPubkeyBytes;
    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
      passkeyPubkeyBytes = spkiBytes;
    } else {
      passkeyPubkeyBytes = extractPublicKeyFromSPKI(spkiBytes);
    }
    
    // 3. Generate RP ID hash (32 bytes)
    const rpIdHash = crypto.createHash('sha256')
      .update(window.location.hostname)
      .digest();
    
    // 4. Create ScVal parameters
    const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);
    const passkeyPubkeyScVal = StellarSdk.xdr.ScVal.scvBytes(passkeyPubkeyBytes);
    const rpIdHashScVal = StellarSdk.xdr.ScVal.scvBytes(rpIdHash);
    
    // 5. Call register_signer
    const registerOp = contract.call('register_signer',
      userScVal,
      passkeyPubkeyScVal,
      rpIdHashScVal
    );
    
    // 6. Build and send transaction
    const registerTransaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(userPublicKey, accountSequence),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      }
    )
      .addOperation(registerOp)
      .setTimeout(30)
      .build();
    
    const preparedRegTx = await sorobanServer.prepareTransaction(registerTransaction);
    preparedRegTx.sign(signingKeypair);
    const regSend = await sorobanServer.sendTransaction(preparedRegTx);
    
    // 7. Poll for confirmation
    await pollTransactionStatus(sorobanServer, regSend.hash);
  }
});
```

---

## Deposit Flow

### Frontend: Create Deposit Request

```typescript
// client/src/contexts/WalletContext.tsx
const depositToContract = async (
  amount: string,
  asset: string
): Promise<boolean> => {
  // 1. Decrypt secret key (on-demand)
  const encryptedData = encryptionService.getEncryptedWalletData();
  const passkeyData = await passkeyService.getStoredPasskeyData();
  const kekParams = {
    srpSecret: passkeyData.id,
    salt: btoa(publicKey)
  };
  const userSecretKey = await encryptionService.decryptSecretKey(
    encryptedData,
    kekParams
  );
  
  // 2. Create deposit data JSON (this becomes the signature payload)
  const timestamp = Date.now();
  const depositData = {
    source: publicKey,
    asset: asset,
    amount: amount,
    action: 'deposit',
    timestamp: timestamp
  };
  const depositDataJSON = JSON.stringify(depositData);
  
  // 3. Create challenge from first 32 bytes of deposit data
  const depositDataBytes = new TextEncoder().encode(depositDataJSON);
  const challengeBytes = depositDataBytes.slice(0, 32);
  const paddedChallenge = new Uint8Array(32);
  paddedChallenge.set(challengeBytes, 0);
  
  // 4. Authenticate with passkey (using custom challenge)
  const authResult = await passkeyService.authenticatePasskey(
    passkeyData.id,
    paddedChallenge
  );
  
  // 5. Send deposit request to backend
  const response = await fetch(`${backendUrl}/api/smart-wallet/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId: process.env.REACT_APP_SMART_WALLET_CONTRACT_ID,
      userAddress: publicKey,
      assetAddress: asset,
      amount: amount,
      userSecretKey: userSecretKey, // Only sent to backend, never stored
      networkPassphrase: networkPassphrase,
      rpcUrl: rpcUrl,
      // WebAuthn signature data
      signature: authResult.signature,
      passkeyPublicKey: passkeyData.publicKey,
      authenticatorData: authResult.authenticatorData,
      clientDataJSON: authResult.clientDataJSON,
      signaturePayload: depositDataJSON, // Full JSON string
    }),
  });
};
```

### Backend: Process Deposit

```javascript
// server/routes/smartWallet.js
router.post('/deposit', async (req, res) => {
  const {
    contractId,
    userAddress,
    assetAddress,
    amount,
    userSecretKey, // Received from frontend, not stored
    signature,
    passkeyPublicKey,
    authenticatorData,
    clientDataJSON,
    signaturePayload
  } = req.body;
  
  // 1. Derive user public key from secret key
  const signingKeypair = StellarSdk.Keypair.fromSecret(userSecretKey);
  const userPublicKey = signingKeypair.publicKey();
  
  // 2. Check if signer is registered (register if not)
  // ... (registration logic from previous section)
  
  // 3. Prepare signature payload buffer
  const signaturePayloadBuffer = Buffer.from(signaturePayload, 'utf8');
  
  // 4. Extract and normalize WebAuthn signature
  const signatureBytes = Buffer.from(signature, 'base64');
  let rawSignatureBytes;
  if (signatureBytes.length === 64) {
    rawSignatureBytes = normalizeECDSASignature(signatureBytes);
  } else if (signatureBytes.length >= 70 && signatureBytes.length <= 72) {
    const decodedSignature = decodeDERSignature(signatureBytes);
    rawSignatureBytes = normalizeECDSASignature(decodedSignature);
  }
  
  // 5. Create ScVal parameters for contract call
  const userScVal = StellarSdk.xdr.ScVal.scvAddress(userScAddress);
  const assetScVal = StellarSdk.xdr.ScVal.scvAddress(assetScAddress);
  const amountScVal = StellarSdk.xdr.ScVal.scvI128(amountI128);
  const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(signaturePayloadBuffer);
  const signatureScVal = StellarSdk.xdr.ScVal.scvBytes(rawSignatureBytes);
  const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(
    Buffer.from(authenticatorData, 'base64')
  );
  const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(
    Buffer.from(clientDataJSON, 'base64')
  );
  
  // 6. Call deposit function
  const depositOp = contract.call('deposit',
    userScVal,
    assetScVal,
    amountScVal,
    signaturePayloadScVal,
    signatureScVal,
    authenticatorDataScVal,
    clientDataScVal
  );
  
  // 7. Build and send transaction
  const transaction = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(userPublicKey, accountSequence),
    {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    }
  )
    .addOperation(depositOp)
    .setTimeout(30)
    .build();
  
  const preparedTx = await sorobanServer.prepareTransaction(transaction);
  preparedTx.sign(signingKeypair);
  const sendResult = await sorobanServer.sendTransaction(preparedTx);
  
  // 8. Poll for confirmation
  const result = await pollTransactionStatus(sorobanServer, sendResult.hash);
});
```

### Contract: Verify and Execute Deposit

```rust
// soroban-contracts/src/contract.rs
pub fn deposit(
    e: &Env,
    user_address: Address,
    asset: Address,
    amount: i128,
    signature_payload: Bytes,
    webauthn_signature: Bytes,
    webauthn_authenticator_data: Bytes,
    webauthn_client_data: Bytes,
) -> bool {
    // 1. Get passkey public key from storage
    let passkey_pubkey_bytes = Self::get_passkey_pubkey(e, user_address.clone())
        .expect("Signer not registered");
    
    // 2. Convert to BytesN<65>
    let passkey_pubkey: BytesN<65> = convert_to_bytesn65(passkey_pubkey_bytes);
    
    // 3. Create WebAuthnSigData struct
    let webauthn_sig_data = WebAuthnSigDataVerifier {
        signature: convert_to_bytesn64(webauthn_signature),
        authenticator_data: webauthn_authenticator_data,
        client_data: webauthn_client_data,
    };
    
    // 4. Verify WebAuthn signature via verifier contract
    let verifier_client = WebauthnVerifierClient::new(e, &verifier_address);
    let is_valid = verifier_client.verify(
        &signature_payload,
        &passkey_pubkey,
        &webauthn_sig_data
    );
    
    if !is_valid {
        return false;
    }
    
    // 5. Require authorization (Soroban framework)
    user_address.require_auth();
    
    // 6. Transfer tokens from user to contract
    let token_client = token::Client::new(e, &asset);
    token_client.transfer(&user_address, &contract_address, &amount);
    
    // 7. Update user's logical balance
    update_balance(e, &user_address, &asset, amount);
    
    true
}
```

---

## Smart Contract Call Flow

### Frontend: Execute Payment

```typescript
// client/src/contexts/WalletContext.tsx
const sendPayment = async (
  destination: string,
  amount: string,
  asset: string
): Promise<boolean> => {
  // 1. Decrypt secret key (on-demand)
  const userSecretKey = await decryptSecretKeyOnDemand();
  
  // 2. Create transaction data JSON
  const transactionData = {
    source: publicKey,
    destination: destination,
    amount: amount,
    asset: asset,
    action: 'execute_payment',
    timestamp: Date.now()
  };
  const transactionDataJSON = JSON.stringify(transactionData);
  
  // 3. Create challenge from first 32 bytes
  const transactionDataBytes = new TextEncoder().encode(transactionDataJSON);
  const challengeBytes = transactionDataBytes.slice(0, 32);
  const paddedChallenge = new Uint8Array(32);
  paddedChallenge.set(challengeBytes, 0);
  
  // 4. Authenticate with passkey
  const authResult = await passkeyService.authenticatePasskey(
    passkeyData.id,
    paddedChallenge
  );
  
  // 5. Send execute transaction request
  const response = await fetch(`${backendUrl}/api/smart-wallet/execute-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId: process.env.REACT_APP_SMART_WALLET_CONTRACT_ID,
      transactionData: transactionDataJSON,
      userSecretKey: userSecretKey, // Only sent, never stored
      signature: authResult.signature,
      passkeyPublicKey: passkeyData.publicKey,
      authenticatorData: authResult.authenticatorData,
      clientDataJSON: authResult.clientDataJSON,
      signaturePayload: transactionDataJSON,
      networkPassphrase: networkPassphrase,
      rpcUrl: rpcUrl,
    }),
  });
};
```

### Backend: Execute Payment

```javascript
// server/routes/smartWallet.js
router.post('/execute-transaction', async (req, res) => {
  const {
    contractId,
    transactionData,
    userSecretKey,
    signature,
    passkeyPublicKey,
    authenticatorData,
    clientDataJSON,
    signaturePayload
  } = req.body;
  
  // 1. Parse transaction data
  const txData = JSON.parse(transactionData);
  
  // 2. Derive user public key
  const signingKeypair = StellarSdk.Keypair.fromSecret(userSecretKey);
  const userPublicKey = signingKeypair.publicKey();
  
  // 3. Prepare contract call parameters
  const signerAddressScVal = createAddressScVal(userPublicKey);
  const destinationScVal = createAddressScVal(txData.destination);
  const assetScVal = createAddressScVal(txData.asset);
  const amountScVal = createI128ScVal(txData.amount);
  const signaturePayloadScVal = StellarSdk.xdr.ScVal.scvBytes(
    Buffer.from(signaturePayload, 'utf8')
  );
  const signatureScVal = StellarSdk.xdr.ScVal.scvBytes(
    normalizeSignature(Buffer.from(signature, 'base64'))
  );
  const authenticatorDataScVal = StellarSdk.xdr.ScVal.scvBytes(
    Buffer.from(authenticatorData, 'base64')
  );
  const clientDataScVal = StellarSdk.xdr.ScVal.scvBytes(
    Buffer.from(clientDataJSON, 'base64')
  );
  
  // 4. Call execute_payment
  const executeOp = contract.call('execute_payment',
    signerAddressScVal,
    destinationScVal,
    amountScVal,
    assetScVal,
    signaturePayloadScVal,
    signatureScVal,
    authenticatorDataScVal,
    clientDataScVal
  );
  
  // 5. Build and send transaction
  const transaction = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(userPublicKey, accountSequence),
    {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: networkPassphrase
    }
  )
    .addOperation(executeOp)
    .setTimeout(30)
    .build();
  
  const preparedTx = await sorobanServer.prepareTransaction(transaction);
  preparedTx.sign(signingKeypair);
  const sendResult = await sorobanServer.sendTransaction(preparedTx);
  
  // 6. Poll for confirmation
  const result = await pollTransactionStatus(sorobanServer, sendResult.hash);
});
```

### Contract: Execute Payment

```rust
// soroban-contracts/src/contract.rs
pub fn execute_payment(
    e: &Env,
    signer_address: Address,
    destination: Address,
    amount: i128,
    asset: Address,
    signature_payload: Bytes,
    webauthn_signature: Bytes,
    webauthn_authenticator_data: Bytes,
    webauthn_client_data: Bytes,
) -> bool {
    // 1. Get passkey public key
    let passkey_pubkey = Self::get_passkey_pubkey(e, signer_address.clone())
        .expect("Signer not registered");
    
    // 2. Verify WebAuthn signature
    let verifier_client = WebauthnVerifierClient::new(e, &verifier_address);
    let is_valid = verifier_client.verify(
        &signature_payload,
        &passkey_pubkey,
        &webauthn_sig_data
    );
    
    if !is_valid {
        return false;
    }
    
    // 3. Require authorization
    signer_address.require_auth();
    
    // 4. Check user's balance
    let user_balance = Self::get_balance(e, signer_address.clone(), asset.clone());
    if user_balance < amount {
        return false;
    }
    
    // 5. Deduct from user's balance
    update_balance(e, &signer_address, &asset, -amount);
    
    // 6. Transfer tokens to destination
    let token_client = token::Client::new(e, &asset);
    token_client.transfer(&contract_address, &destination, &amount);
    
    true
}
```

---

## GeoLink Deposit Integration

### ⚠️ CRITICAL: Must Use GeoLink's ContractCallIntent Format

**XYZ-Wallet must use GeoLink's `ContractCallIntent` format for all deposit executions via GeoLink.** This ensures compatibility with GeoLink's WebAuthn verification system.

### Overview

This section describes how XYZ-Wallet integrates with GeoLink's deposit rule execution system. When a deposit rule is triggered in GeoLink, the matched public key (wallet owner) must initiate the deposit transaction using GeoLink's standardized intent format.

### Architecture Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  GeoLink    │         │  XYZ-Wallet  │         │   Stellar   │
│  Backend    │◄───────►│   (Client)   │◄───────►│   Network   │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │ 1. Rule Triggered      │                        │
      │    (deposit function)   │                        │
      ├────────────────────────►│                        │
      │                        │                        │
      │ 2. Poll for Pending    │                        │
      │    Deposit Actions     │                        │
      │◄────────────────────────┤                        │
      │                        │                        │
      │                        │ 3. User Initiates      │
      │                        │    Deposit (WebAuthn)  │
      │                        │    Using GeoLink Format│
      │                        ├───────────────────────►│
      │                        │                        │
      │                        │ 4. Transaction         │
      │                        │    Confirmed           │
      │                        │◄───────────────────────┤
      │                        │                        │
      │ 5. Report Completion   │                        │
      │◄────────────────────────┤                        │
```

### Authentication

XYZ-Wallet uses **Wallet Provider API Key** for all deposit-related endpoints. The API key should be included in the request header:

```
X-API-Key: <wallet_provider_api_key>
```

**Note:** XYZ-Wallet has both `wallet_provider` and `data_consumer` roles, but deposit operations should use the `wallet_provider` API key for security and proper access control.

### API Endpoints

#### 1. Get Pending Deposit Actions

**Endpoint:** `GET /api/contracts/rules/pending/deposits`

**Authentication:** Wallet Provider API Key

**Query Parameters:**
- `public_key` (optional): Filter by specific wallet public key
- `limit` (optional, default: 50): Maximum number of results
- `status` (optional): Filter by status (`pending`, `in_progress`, `completed`, `failed`)

**Response:**
```json
{
  "success": true,
  "pending_deposits": [
    {
      "id": "deposit_4282_7_GAGB3S3K",
      "rule_id": 7,
      "rule_name": "Deposit Rule",
      "contract_id": 4,
      "contract_name": "Payment Contract",
      "contract_address": "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
      "function_name": "deposit",
      "matched_public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
      "update_id": 4282,
      "received_at": "2026-01-28T20:31:08.758Z",
      "parameters": {
        "user_address": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
        "asset": "XLM",
        "amount": "1000000000"
      },
      "location": {
        "latitude": 34.0522,
        "longitude": -118.2437
      },
      "expires_at": "2026-01-28T21:31:08.758Z",
      "status": "pending"
    }
  ],
  "total": 1
}
```

#### 2. Get Deposit Action Details

**Endpoint:** `GET /api/contracts/rules/pending/deposits/:action_id`

**Authentication:** Wallet Provider API Key

**Parameters:**
- `action_id`: Deposit action ID (format: `deposit_{update_id}_{rule_id}_{public_key_prefix}`)

**Response:**
```json
{
  "success": true,
  "deposit_action": {
    "id": "deposit_4282_7_GAGB3S3K",
    "rule_id": 7,
    "rule_name": "Deposit Rule",
    "contract_id": 4,
    "contract_name": "Payment Contract",
    "contract_address": "CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U",
    "function_name": "deposit",
    "function_parameters": {
      "user_address": {
        "type": "Address",
        "required": true
      },
      "asset": {
        "type": "Address",
        "required": true
      },
      "amount": {
        "type": "I128",
        "required": true
      }
    },
    "matched_public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
    "parameters": {
      "user_address": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
      "asset": "XLM",
      "amount": "1000000000"
    },
    "location": {
      "latitude": 34.0522,
      "longitude": -118.2437
    },
    "expires_at": "2026-01-28T21:31:08.758Z",
    "status": "pending"
  }
}
```

#### 3. Execute Deposit

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/execute`

**Authentication:** Wallet Provider API Key

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "user_secret_key": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "webauthn_signature": "base64_encoded_signature",
  "webauthn_authenticator_data": "base64_encoded_authenticator_data",
  "webauthn_client_data": "base64_encoded_client_data",
  "signature_payload": "base64_encoded_intent_bytes",
  "passkey_public_key_spki": "base64_encoded_spki"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deposit executed successfully",
  "transaction_hash": "eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704",
  "ledger": 727905,
  "stellar_expert_url": "https://stellar.expert/explorer/testnet/tx/eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704"
}
```

#### 4. Report Deposit Completion

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/complete`

**Authentication:** Wallet Provider API Key

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "transaction_hash": "eb4df62cd3de9e1e338c06936d76f6f0e3f76f42d7ebeecf2cdffee05af6b704",
  "ledger": 727905
}
```

#### 5. Cancel Deposit Action

**Endpoint:** `POST /api/contracts/rules/pending/deposits/:action_id/cancel`

**Authentication:** Wallet Provider API Key

**Request Body:**
```json
{
  "public_key": "GAGB3S3KY5ITELOWLGWP5OPGGRHVVW5ZNABDE2SULKD7YKZLW5FY4DJB",
  "reason": "user_declined"
}
```

### WebAuthn Integration for GeoLink Deposits

**CRITICAL:** XYZ-Wallet must use GeoLink's `ContractCallIntent` format exactly as shown below.

#### Complete Implementation Example

```typescript
const executeDepositViaGeoLink = async (
  actionId: string,
  depositAction: PendingDepositAction
): Promise<boolean> => {
  try {
    // 1. Decrypt secret key on-demand
    const encryptedData = encryptionService.getEncryptedWalletData();
    const passkeyData = await passkeyService.getStoredPasskeyData();
    const kekParams = {
      srpSecret: passkeyData.id,
      salt: btoa(depositAction.matched_public_key)
    };
    const userSecretKey = await encryptionService.decryptSecretKey(
      encryptedData,
      kekParams
    );
    
    // 2. Helper function to generate 32-byte hex nonce
    function generateNonce(): string {
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      return Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    
    // 3. Filter out WebAuthn fields from parameters
    const webauthnFieldNames = [
      'signature_payload',
      'webauthn_signature',
      'webauthn_authenticator_data',
      'webauthn_client_data',
      'webauthn_client_data_json'
    ];
    const intentParams = {};
    for (const [key, value] of Object.entries(depositAction.parameters || {})) {
      if (!webauthnFieldNames.includes(key) && 
          value && 
          typeof value === 'string' && 
          !value.includes('[Will be') && 
          !value.includes('system-generated')) {
        intentParams[key] = value;
      }
    }
    
    // 4. Create typed arguments array
    // Note: Ideally use contract introspection for actual types (Address, I128, etc.)
    const typedArgs = Object.entries(intentParams).map(([name, value]) => ({
      name,
      type: 'String', // Default - use contract introspection if available
      value
    }));
    
    // 5. Create ContractCallIntent (GeoLink format) - REQUIRED
    const now = Math.floor(Date.now() / 1000);
    const intent = {
      v: 1, // Version (required)
      network: depositAction.network || 'testnet',
      rpcUrl: depositAction.network === 'mainnet' 
        ? 'https://rpc.mainnet.stellar.org:443'
        : 'https://soroban-testnet.stellar.org:443',
      contractId: depositAction.contract_address, // Stellar contract address (starts with C)
      fn: depositAction.function_name, // e.g., "deposit"
      args: typedArgs, // Array of {name, type, value} objects
      signer: depositAction.matched_public_key, // User's Stellar public key
      ruleBinding: depositAction.rule_id ? depositAction.rule_id.toString() : null, // Optional rule ID
      nonce: generateNonce(), // 32-byte hex string (64 characters) - REQUIRED
      iat: now, // Issued at (seconds since epoch) - REQUIRED
      exp: now + 300 // Expiration (5 minutes from now) - REQUIRED
      // Note: authMode is NOT part of canonical Intent
    };
    
    // 6. Encode intent to canonical JSON bytes (REQUIRED: sorted keys)
    const canonical = {
      v: intent.v,
      network: intent.network,
      rpcUrl: intent.rpcUrl,
      contractId: intent.contractId,
      fn: intent.fn,
      args: intent.args.map(arg => ({
        name: arg.name,
        type: arg.type,
        value: arg.value
      })),
      signer: intent.signer,
      ...(intent.ruleBinding && { ruleBinding: intent.ruleBinding }),
      nonce: intent.nonce,
      iat: intent.iat,
      exp: intent.exp
    };
    
    // Convert to canonical JSON string (sorted keys for deterministic encoding)
    const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());
    
    // Encode as UTF-8 bytes
    const intentBytes = new TextEncoder().encode(jsonString);
    
    // Convert to base64 for signature_payload
    const signaturePayload = Buffer.from(intentBytes).toString('base64');
    
    // 7. Generate WebAuthn Challenge (GeoLink Method: SHA-256 hash) - REQUIRED
    const hashBuffer = await crypto.subtle.digest('SHA-256', intentBytes);
    const hash = new Uint8Array(hashBuffer);
    const challenge = hash.slice(0, 32); // SHA-256 is already 32 bytes
    
    // 8. Authenticate with passkey
    const authResult = await passkeyService.authenticatePasskey(
      passkeyData.id,
      challenge // Pass as Uint8Array
    );
    
    // 9. Execute deposit via GeoLink
    const response = await fetch(
      `http://localhost:4000/api/contracts/rules/pending/deposits/${actionId}/execute`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': WALLET_PROVIDER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          public_key: depositAction.matched_public_key,
          user_secret_key: userSecretKey,
          webauthn_signature: authResult.signature,
          webauthn_authenticator_data: authResult.authenticatorData,
          webauthn_client_data: authResult.clientDataJSON,
          signature_payload: signaturePayload,
          passkey_public_key_spki: passkeyData.publicKey
        })
      }
    );
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error executing deposit:', error);
    return false;
  }
};
```

### Implementation Flow

#### XYZ-Wallet Side

1. **Poll for Pending Deposits:**
   ```typescript
   // Poll every 30 seconds
   setInterval(async () => {
     const response = await fetch(
       'http://localhost:4000/api/contracts/rules/pending/deposits',
       {
         headers: {
           'X-API-Key': WALLET_PROVIDER_API_KEY
         }
       }
     );
     const { pending_deposits } = await response.json();
     
     // Display to users
     pending_deposits.forEach(deposit => {
       showDepositAction(deposit);
     });
   }, 30000);
   ```

2. **Display Deposit Action:**
   - Show deposit details to the user
   - Display amount, asset, contract name, location
   - Provide "Approve" and "Decline" buttons

3. **User Approves - Execute via GeoLink:**
   - Use the `executeDepositViaGeoLink` function shown above
   - This uses GeoLink's `ContractCallIntent` format
   - GeoLink will execute the transaction and return the result

4. **Handle Completion:**
   - Update UI to show completed status
   - Display transaction hash and StellarExpert link

### Key Differences from Internal Deposit Flow

| Aspect | Internal Deposit (Smart Wallet) | GeoLink Deposit Integration |
|--------|--------------------------------|----------------------------|
| **Intent Format** | Simple JSON object | GeoLink's `ContractCallIntent` format |
| **Encoding** | `JSON.stringify()` | Canonical JSON with sorted keys |
| **Challenge** | First 32 bytes of JSON | SHA-256 hash of intent bytes |
| **Parameters** | Simple object | Typed arguments array |
| **Nonce** | Not required | Required (64-char hex) |
| **Timestamps** | Milliseconds | Seconds |
| **Endpoint** | `/api/smart-wallet/deposit` | `/api/contracts/rules/pending/deposits/:id/execute` |

### Testing Checklist

- [ ] Poll for pending deposits from GeoLink
- [ ] Create intent using GeoLink's `ContractCallIntent` format
- [ ] Encode intent with canonical JSON (sorted keys)
- [ ] Generate challenge using SHA-256 hash
- [ ] Execute deposit via GeoLink endpoint
- [ ] Verify transaction completion
- [ ] Test with both testnet and mainnet (when available)
- [ ] Verify WebAuthn challenge validation
- [ ] Test error handling (expired actions, invalid signatures, etc.)

---

## Key Implementation Notes

### Critical Security Requirements

1. **Never store secret keys in plaintext**
   - Always encrypt using WebCrypto API
   - Use AES-GCM with proper key derivation
   - Store `wrapIv` - it's critical for decryption

2. **WebAuthn Challenge Matching (GeoLink)**
   - Challenge is SHA-256 hash of intent bytes (first 32 bytes of hash)
   - Verifier contract validates challenge matches first 32 bytes of `signaturePayload` (decoded)
   - Must use GeoLink's `ContractCallIntent` format for compatibility

3. **Signature Format**
   - WebAuthn signatures are DER-encoded (70-72 bytes)
   - Must decode to raw format (64 bytes: 32 for r, 32 for s)
   - Contract expects `BytesN<64>` for signature

4. **Passkey Public Key Format**
   - Stored in SPKI format from WebAuthn API
   - Must extract 65-byte uncompressed secp256r1 public key
   - Contract expects `BytesN<65>`

5. **RP ID Hash**
   - Must be 32-byte SHA-256 hash of domain name
   - Use `window.location.hostname` as RP ID
   - Stored during signer registration

### Common Pitfalls

1. **Missing wrapIv**: If wallet was created before encryption improvements, `wrapIv` may be missing. Cannot decrypt without it.

2. **Challenge Mismatch (GeoLink)**: Must use SHA-256 hash of intent bytes, not first 32 bytes directly. Intent must be in GeoLink's `ContractCallIntent` format.

3. **Intent Format Mismatch**: Using simple JSON instead of GeoLink's `ContractCallIntent` format will cause verification failures.

4. **Signature Format**: DER-encoded signatures must be decoded to raw format before sending to contract.

5. **Public Key Format**: SPKI format must be converted to 65-byte uncompressed format.

6. **Signer Not Registered**: Must call `register_signer` before first deposit or transaction.

---

## Testing Checklist

### Wallet Operations
- [ ] Wallet creation with passkey
- [ ] Secret key encryption/decryption
- [ ] Signer registration on smart wallet contract
- [ ] Internal deposit with WebAuthn verification
- [ ] Execute payment with WebAuthn verification

### GeoLink Integration
- [ ] Poll for pending deposits
- [ ] Execute deposit successfully via GeoLink
- [ ] Verify completion status
- [ ] User declines deposit (cancel action)
- [ ] WebAuthn failure handling
- [ ] Expired action handling
- [ ] Concurrent deposits for same wallet
- [ ] API key authentication
- [ ] Public key validation
- [ ] Intent encoding/decoding (GeoLink's ContractCallIntent format)
- [ ] Challenge matching (SHA-256 hash method)
- [ ] Canonical JSON encoding with sorted keys
- [ ] WebAuthn fields filtered from Intent
- [ ] Typed arguments array conversion
- [ ] Nonce generation and validation
- [ ] Timestamp validation (iat, exp)

---

## Conclusion

This implementation provides a secure, non-custodial wallet system that:
- Never stores secret keys in plaintext
- Uses WebAuthn for user authentication
- Verifies signatures on-chain via smart contracts
- Supports deposits and smart contract calls
- Maintains security best practices
- **Integrates with GeoLink using standardized ContractCallIntent format**

**CRITICAL:** All GeoLink deposit integrations must use the `ContractCallIntent` format as shown in the "GeoLink Deposit Integration" section. This ensures compatibility with GeoLink's WebAuthn verification system.

### Reference Documentation

- **GeoLink Deposit Integration Guide**: `docs/XYZ_WALLET_DEPOSIT_INTEGRATION.md`
- **GeoLink Intent Service**: `frontend/src/services/intentService.js` in GeoLink codebase
