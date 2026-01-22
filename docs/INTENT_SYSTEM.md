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

### Azure Deployment

For Azure deployment, React environment variables must be set **before** the build process:

#### Option 1: GitHub Secrets (Recommended)

1. **Go to GitHub Repository** → Settings → Secrets and variables → Actions
2. **Click "New repository secret"**
3. **Name**: `REACT_APP_USE_EXECUTION_ENGINE`
4. **Value**: `true`
5. **Click "Add secret"**
6. **Push a commit** to trigger automatic rebuild and deployment:
   ```bash
   git commit --allow-empty -m "Trigger rebuild with REACT_APP_USE_EXECUTION_ENGINE"
   git push
   ```

The GitHub Actions workflow will automatically use this secret during the frontend build.

#### Option 2: Azure Portal Application Settings

If your deployment process reads from Azure settings:

1. **Go to Azure Portal** → Your Web App → Configuration → Application Settings
2. **Click "+ New application setting"**
3. **Name**: `REACT_APP_USE_EXECUTION_ENGINE`
4. **Value**: `true`
5. **Click "OK" and "Save"**

**Note**: You may still need to trigger a rebuild for the frontend to pick up the new environment variable.

**Important Notes:**
- React environment variables must be prefixed with `REACT_APP_`
- Environment variables are baked into the build at compile time (not runtime)
- You must rebuild/restart after changing environment variables
- The flag is checked at runtime: `process.env.REACT_APP_USE_EXECUTION_ENGINE === 'true'`
- Local `.env` files are not deployed to Azure (they're in `.gitignore`)

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
