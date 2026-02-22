# Security: Secret Key Migration to Signed XDR

## Current Security Issue

The application currently sends Stellar secret keys in HTTP request bodies to the backend. While this is done over HTTPS (encrypted in transit), it presents several security risks:

### Risks:
1. **Server-side exposure**: Secret keys are visible in server logs, error messages, and memory
2. **Man-in-the-middle attacks**: If HTTPS is compromised, keys are exposed
3. **Server compromise**: If the backend is compromised, all secret keys in transit are exposed
4. **Compliance**: Some security standards require that secret keys never leave the client

### Current Status:
- ⚠️ **Warning only**: The middleware (`validateSignedXDR.js`) logs warnings but doesn't block requests
- ✅ **HTTPS required**: All requests use HTTPS in production
- ⚠️ **Backward compatibility**: Current implementation allows secret keys for compatibility

## Recommended Solution: Signed XDR

### What is Signed XDR?
- **XDR (eXternal Data Representation)**: Stellar's binary format for transactions
- **Signed XDR**: A transaction that has been signed client-side with the secret key
- **Benefit**: The backend receives only the signed transaction, never the secret key

### How It Works:
1. **Frontend**: Builds and signs the transaction using the secret key (client-side)
2. **Frontend**: Sends only the signed XDR to the backend
3. **Backend**: Validates and submits the signed XDR without ever seeing the secret key

## Migration Path

### Phase 1: Infrastructure (Current)
- ✅ Middleware exists to validate signed XDR
- ✅ Backend can accept signed XDR
- ⚠️ Frontend still sends secret keys

### Phase 2: Frontend Migration (Recommended Next Steps)

#### For Simple Transactions (Payments, Deposits):
```javascript
// OLD WAY (Current - Insecure)
await api.post('/smart-wallet/deposit', {
  userPublicKey: publicKey,
  userSecretKey: secretKey, // ❌ Secret key sent to server
  amount: amountInStroops,
  // ...
});

// NEW WAY (Secure - Recommended)
// 1. Build transaction client-side
const StellarSdk = require('@stellar/stellar-sdk');
const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
const sourceAccount = await server.loadAccount(publicKey);

const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET
})
  .addOperation(/* deposit operation */)
  .setTimeout(30)
  .build();

// 2. Sign transaction client-side
transaction.sign(StellarSdk.Keypair.fromSecret(secretKey));

// 3. Send only signed XDR
await api.post('/smart-wallet/deposit', {
  signedXDR: transaction.toXDR(), // ✅ Only signed XDR, no secret key
  amount: amountInStroops,
  // ...
});
```

#### For Soroban Contract Calls:
```javascript
// OLD WAY (Current - Insecure)
await api.post('/api/contracts/4/execute', {
  function_name: 'deposit',
  parameters: { /* ... */ },
  user_secret_key: secretKey, // ❌ Secret key sent to server
  // ...
});

// NEW WAY (Secure - More Complex)
// 1. Build Soroban transaction client-side
const StellarSdk = require('@stellar/stellar-sdk');
const rpcServer = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
const sourceAccount = await rpcServer.getAccount(publicKey);

const contract = new StellarSdk.Contract(contractAddress);
const operation = contract.call('deposit', ...args);

const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET
})
  .addOperation(operation)
  .setTimeout(30)
  .build();

// 2. Simulate and prepare (for Soroban)
const simulateResult = await rpcServer.simulateTransaction(transaction);
const preparedTx = await rpcServer.prepareTransaction(transaction);

// 3. Sign transaction client-side
preparedTx.sign(StellarSdk.Keypair.fromSecret(secretKey));

// 4. Send only signed XDR
await api.post('/api/contracts/4/execute', {
  signedXDR: preparedTx.toXDR(), // ✅ Only signed XDR, no secret key
  function_name: 'deposit',
  parameters: { /* ... */ },
  // ...
});
```

### Phase 3: Backend Updates

The backend already supports signed XDR. Update endpoints to:
1. Accept `signedXDR` in addition to `user_secret_key`
2. Prioritize `signedXDR` if both are provided
3. Eventually deprecate `user_secret_key` parameter

### Phase 4: Enforcement (Future)

Once migration is complete:
1. Enable `requireSignedXDR` middleware on all endpoints
2. Remove secret key handling from backend
3. Update API documentation

## Implementation Priority

### High Priority (Security Critical):
- **Deposit endpoints** (`/smart-wallet/deposit`, `/api/contracts/rules/pending/deposits/:action_id/execute`)
- **Payment endpoints** (`/smart-wallet/execute-payment`)
- **Contract execution** (`/api/contracts/:id/execute`)

### Medium Priority:
- **Passkey registration** (`/smart-wallet/register-signer`)
- **Other write operations**

### Low Priority:
- **Read-only operations** (don't require signing anyway)

## Current Mitigations

While migration is in progress:
1. ✅ **HTTPS enforced**: All production traffic uses HTTPS
2. ✅ **Logging**: Secret keys are detected and logged (for monitoring)
3. ✅ **No storage**: Backend doesn't persist secret keys
4. ⚠️ **Memory exposure**: Secret keys exist in server memory during request processing

## Testing

When implementing signed XDR:
1. Test with testnet first
2. Verify transaction signatures are valid
3. Ensure backward compatibility during migration
4. Test error handling for invalid XDR

## References

- [Stellar SDK Documentation](https://developers.stellar.org/docs/sdks/javascript)
- [Soroban Transaction Building](https://developers.stellar.org/docs/smart-contracts/getting-started)
- Middleware: `backend/middleware/validateSignedXDR.js`

## Migration Checklist

- [ ] Update deposit endpoints to accept signed XDR
- [ ] Update payment endpoints to accept signed XDR
- [ ] Update contract execution endpoints to accept signed XDR
- [ ] Update frontend deposit flow
- [ ] Update frontend payment flow
- [ ] Update frontend contract execution flow
- [ ] Test all flows with signed XDR
- [ ] Update API documentation
- [ ] Enable `requireSignedXDR` middleware
- [ ] Remove secret key handling from backend
- [ ] Update security documentation
