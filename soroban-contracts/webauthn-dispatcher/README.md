# WebAuthn Dispatcher Contract

A Soroban smart contract that routes WebAuthn-verified calls to any target contract.

## Purpose

This contract enables universal WebAuthn execution for any Soroban contract without requiring each contract to implement WebAuthn verification themselves.

## Features

- ✅ Verifies WebAuthn signatures using WebAuthn Verifier contract
- ✅ Enforces nonce uniqueness (anti-replay protection)
- ✅ Enforces intent expiration (iat/exp validation)
- ✅ Routes to target contract with verified parameters

## Status

⚠️ **Placeholder Implementation**: This is a structural implementation. Full implementation requires:

1. **WebAuthn Verifier Integration**: Call the WebAuthn Verifier contract to verify signatures
2. **SHA-256 Hash**: Soroban doesn't have native SHA-256, may need crypto library
3. **Dynamic Contract Invocation**: Soroban doesn't support fully dynamic calls, may need contract registry

## Deployment

```bash
cd soroban-contracts/webauthn-dispatcher
soroban contract build
soroban contract deploy --wasm target/wasm32-unknown-unknown/release/webauthn_dispatcher.wasm --source-account <deployer>
```

## Initialization

After deployment, initialize with the WebAuthn Verifier contract address:

```javascript
const dispatcher = new StellarSdk.Contract(dispatcherContractId);
const verifier = new StellarSdk.Contract(verifierContractId);

const initOp = dispatcher.call('initialize', verifier.address());
// ... build and submit transaction
```

## Usage

```javascript
const intent = {
  v: 1,
  contract_id: targetContractId,
  fn_name: 'my_function',
  args: [...],
  signer: userPublicKey,
  nonce: nonceBytes,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300
};

const webauthnSignature = {
  signature: raw64Signature,
  authenticator_data: authenticatorData,
  client_data_json: clientDataJSON,
  signature_payload: intentBytes
};

const result = await dispatcher.call('execute_with_webauthn', 
  intent, webauthnSignature, passkeyPublicKey, rpIdHash
);
```

## Future Improvements

- Support for contract registry (for dynamic routing)
- Batch execution support
- Gas optimization
- Event emission for execution tracking
