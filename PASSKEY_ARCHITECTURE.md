# Passkey Architecture with WebAuthn Verifier Contract

## Current Implementation Status

### ❌ Wallet Creation Does NOT Automatically Register Passkeys

Currently, when a user creates a new wallet:
1. A Stellar keypair is generated
2. The account is funded (on testnet via Friendbot)
3. **Passkey registration is NOT automatic** - it's a separate step

### ✅ Passkey Registration Flow (Separate Step)

Passkey registration happens via:
1. **Frontend**: User clicks "Register Passkey" in PasskeyManager component
2. **WebAuthn API**: Creates passkey using `navigator.credentials.create()`
3. **Backend**: `/api/webauthn/register` endpoint
4. **Smart Wallet Contract**: Calls `register_signer()` function
5. **Storage**: Passkey public key stored on Smart Wallet Contract

### 🔄 How WebAuthn Verifier Contract is Used

The **WEBAUTHN_VERIFIER_CONTRACT_ID** (`CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L`) is used **indirectly**:

1. **Registration**: 
   - Frontend/Backend calls `register_signer()` on **SMART_WALLET_CONTRACT_ID**
   - Smart Wallet Contract stores the passkey public key
   - WebAuthn Verifier Contract is NOT called during registration

2. **Verification** (when signing transactions):
   - User authenticates with passkey (WebAuthn API)
   - Frontend sends signature to Smart Wallet Contract
   - **Smart Wallet Contract internally calls** `verify()` on **WebAuthn Verifier Contract**
   - WebAuthn Verifier Contract verifies the secp256r1 signature
   - If valid, Smart Wallet Contract executes the transaction

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend/Backend                          │
│                                                              │
│  1. Create Wallet → StellarOperations.createAccount()       │
│     (No passkey registration)                               │
│                                                              │
│  2. Register Passkey → /api/webauthn/register               │
│     ↓                                                        │
│     register_signer() on SMART_WALLET_CONTRACT             │
│                                                              │
│  3. Sign Transaction → authenticateWithPasskey()            │
│     ↓                                                        │
│     Smart Wallet Contract function call                     │
│     ↓                                                        │
│     Smart Wallet Contract calls verify() on                 │
│     WEBAUTHN_VERIFIER_CONTRACT                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              SMART_WALLET_CONTRACT_ID                        │
│         CAAQTGMXO6VS7HUYH7YLBVSI6T64WWHAPQDR6QEO7EVEOD4CR3H3565U │
│                                                              │
│  - Stores passkey public keys (register_signer)             │
│  - Manages user balances                                    │
│  - When verifying signatures, calls:                        │
│    ↓                                                         │
│    WEBAUTHN_VERIFIER_CONTRACT.verify()                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         WEBAUTHN_VERIFIER_CONTRACT_ID                      │
│         CARLXTWOUIRQVQILCBSA3CNG6QIVO3PIPKF66LDHQXGQGUAAWPFLND3L │
│                                                              │
│  - verify(signature_payload, pub_key, sig_data) → bool      │
│  - Verifies secp256r1 signatures                            │
│  - Implements W3C WebAuthn specification                    │
│  - Shared contract (used by multiple smart wallets)         │
└─────────────────────────────────────────────────────────────┘
```

## Current Code Flow

### Wallet Creation (No Passkey)
```javascript
// frontend/src/contexts/WalletContext.js
generateWallet() → api.post('/stellar/create-account')
  ↓
// backend/services/StellarOperations.js
createAccount() → Creates keypair, funds account
  ↓
Returns: { publicKey, secret }
```

### Passkey Registration (Separate Step)
```javascript
// frontend/src/components/Wallet/PasskeyManager.js
handleRegisterPasskey() → webauthnService.registerPasskey()
  ↓
// frontend/src/services/webauthnService.js
registerPasskey() → WebAuthn API creates passkey
  ↓
api.post('/webauthn/register')
  ↓
// backend/routes/webauthn.js
register_signer() on SMART_WALLET_CONTRACT_ID
  ↓
// Smart Wallet Contract stores passkey
// (WebAuthn Verifier Contract NOT called here)
```

### Transaction Signing (Uses WebAuthn Verifier)
```javascript
// User authenticates with passkey
webauthnService.authenticateWithPasskey()
  ↓
// Call Smart Wallet Contract function
smartWalletContract.execute_payment(...)
  ↓
// Smart Wallet Contract internally calls:
WEBAUTHN_VERIFIER_CONTRACT.verify(
  signature_payload,
  passkey_pubkey,
  sig_data
)
  ↓
// If verify() returns true, transaction executes
```

## Answer to Your Question

**Q: Does wallet creation use passkeys with WEBAUTHN_VERIFIER_CONTRACT_ID?**

**A: No, not currently.**
- Wallet creation does NOT automatically register passkeys
- Passkey registration is a separate manual step
- The WEBAUTHN_VERIFIER_CONTRACT_ID is only used when the Smart Wallet Contract verifies signatures during transaction signing
- It's not called during wallet creation or passkey registration

## Recommendation

If you want automatic passkey registration during wallet creation, we could:
1. Prompt user to register passkey after wallet is created
2. Automatically attempt passkey registration (if WebAuthn is available)
3. Make it optional so users can skip if they prefer

Would you like me to implement automatic passkey registration during wallet creation?

