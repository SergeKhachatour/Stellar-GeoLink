# Intent System Documentation

## How Intents Work

### What is a ContractCallIntent?

A `ContractCallIntent` is a structured representation of a contract function call that includes:
- **Contract details**: contract ID, function name, typed arguments
- **Authentication info**: signer public key, auth mode (classic/webauthn)
- **Security features**: nonce (anti-replay), expiration (iat/exp)
- **Metadata**: network, RPC URL, optional rule binding

### Intent Flow

1. **Create Intent** → `createContractCallIntent()`
   - Generates nonce, sets timestamps
   - Validates all required fields

2. **Encode Intent** → `encodeIntentBytes()`
   - Converts to canonical JSON (stable key ordering)
   - Encodes as UTF-8 bytes
   - **Deterministic**: Same intent = same bytes

3. **Derive Challenge** → `challengeFromIntent()`
   - SHA-256 hash of intent bytes
   - Takes first 32 bytes
   - Used as WebAuthn challenge

4. **Authenticate** → Passkey signs the challenge
   - User authenticates with passkey
   - Returns signature, authenticatorData, clientDataJSON

5. **Execute** → ExecutionEngine submits transaction
   - Classic: Decrypt secret, sign locally, submit
   - WebAuthn: Submit with WebAuthn signature data

## UI Integration

### Intent Preview Dialog

Before executing a contract function, users see an intent preview dialog showing:
- Contract ID and function name
- Typed arguments
- Security details (nonce, expiration)
- Intent bytes (first 16 bytes)
- WebAuthn challenge (SHA-256 hash)
- Rule binding (if applicable)

### Execution Flow

```
User clicks Execute → 
  Create Intent → 
  Show Intent Preview → 
  User confirms → 
  Derive Challenge → 
  Authenticate with Passkey → 
  Execute with Intent → 
  Show Result
```

## Implementation Status

### ✅ Complete
- Intent creation and encoding
- Challenge derivation
- Intent preview UI component
- ExecutionEngine integration
- PasskeyManager with PRF support

## Configuration

### Enable Intent-Based Execution

To enable the intent-based execution flow, set the environment variable in your frontend `.env` file:

1. **Edit `frontend/.env` file** (create it if it doesn't exist):
   ```bash
   # Enable intent-based execution
   REACT_APP_USE_EXECUTION_ENGINE=true
   ```

2. **Restart your development server** (if running):
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   cd frontend
   npm start
   ```

3. **For production builds**, rebuild the frontend:
   ```bash
   cd frontend
   npm run build
   ```

**Important Notes:**
- React environment variables must be prefixed with `REACT_APP_`
- Environment variables are baked into the build at compile time
- You must rebuild/restart after changing environment variables
- The flag is checked at runtime: `process.env.REACT_APP_USE_EXECUTION_ENGINE === 'true'`

**What Happens When Enabled:**
- Contract execution will show an intent preview dialog before executing
- Uses the new ExecutionEngine for client-side execution
- Supports both classic (secret key) and WebAuthn (passkey) execution lanes
- Falls back to backend API execution if ExecutionEngine fails

**What Happens When Disabled (default):**
- Uses the legacy backend API execution flow
- No intent preview dialog
- Direct execution via backend endpoints

## Technical Details

### Deterministic Encoding

Intents are encoded using canonical JSON (stable key ordering) to ensure:
- Same intent always produces same bytes
- Challenge derivation is deterministic
- On-chain verification can reconstruct intent

### Security Features

- **Nonce**: 32-byte random hex string (anti-replay)
- **Expiration**: Default 5 minutes (configurable)
- **Challenge**: SHA-256 hash of intent bytes (first 32 bytes)
