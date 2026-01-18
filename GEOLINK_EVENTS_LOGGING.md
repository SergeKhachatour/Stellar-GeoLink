# GeoLink Events Logging - Public Events Feed

## Overview
This document describes the logging structure for the future **GeoLink Events** section on the home page. All logs are designed to be public-friendly with no sensitive information, suitable for display to the general public.

## Log Format

All public events use the `[GeoLink Events]` prefix for easy filtering and display.

## Event Types

### 1. Location Updates
**Format:** `[GeoLink Events] 📍 Location update received: {truncated_public_key}... at ({latitude}, {longitude})`

**Example:**
```
[GeoLink Events] 📍 Location update received: GDPMUX3X... at (34.0522, -118.2437)
```

**Logged in:** `backend/routes/location.js` - `/update` endpoint

**Data:**
- ✅ Truncated public key (first 8 characters)
- ✅ Coordinates (latitude, longitude)
- ❌ No user IDs
- ❌ No secret keys
- ❌ No full public keys

---

### 2. Rule Evaluation
**Format:** `[BackgroundAI] 🔍 Evaluating {count} rule(s) for location update {update_id}: Rule {id} ({name}), ...`

**Example:**
```
[BackgroundAI] 🔍 Evaluating 2 rule(s) for location update 3251: Rule 2 (Santa Monica - Send Payment), Rule 3 (Test Function)
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

**Data:**
- ✅ Rule IDs and names
- ✅ Location update ID
- ✅ Number of rules evaluated
- ❌ No user IDs
- ❌ No public keys (truncated in location update log)

---

### 3. Rule Matched (Added to Pending)
**Format:** `[BackgroundAI] ✅ Rule {id} ({name}) MATCHED - Added to pending rules (passed advanced settings, requires WebAuthn)`

**Example:**
```
[BackgroundAI] ✅ Rule 2 (Santa Monica - Send Payment) MATCHED - Added to pending rules (passed advanced settings, requires WebAuthn)
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

**Conditions:**
- ✅ Location matches (within radius/geofence)
- ✅ Rate limiting check passed (if configured)
- ✅ Location duration requirement met (if configured, e.g., 60 seconds)
- ✅ WebAuthn required (write operations)

**Data:**
- ✅ Rule ID and name
- ✅ Status (matched, pending)
- ❌ No user IDs
- ❌ No public keys
- ❌ No secret keys

---

### 4. Rule Execution Started
**Format:** `[GeoLink Events] ⚡ Rule {id} execution started: {function_name}() for {truncated_public_key}...`

**Example:**
```
[GeoLink Events] ⚡ Rule 2 execution started: execute_payment() for GDPMUX3X...
```

**Logged in:** `backend/routes/contracts.js` - `/:id/execute` endpoint

**Data:**
- ✅ Rule ID
- ✅ Function name
- ✅ Truncated public key (first 8 characters)
- ❌ No user IDs
- ❌ No secret keys
- ❌ No full public keys

---

### 5. Transaction Submitted
**Format:** `[GeoLink Events] ✅ Rule {id} transaction submitted: {transaction_hash}`

**Example:**
```
[GeoLink Events] ✅ Rule 2 transaction submitted: a1b2c3d4e5f6...
```

**Logged in:** 
- `backend/routes/contracts.js` - `/:id/execute` endpoint
- `backend/routes/smartWallet.js` - `/execute-payment` endpoint

**Data:**
- ✅ Rule ID (if available)
- ✅ Transaction hash (public blockchain data)
- ✅ Function name (if no rule_id)
- ❌ No user IDs
- ❌ No secret keys
- ❌ No public keys

---

### 6. Transaction Confirmed
**Format:** `[GeoLink Events] ✅ Rule {id} transaction confirmed on ledger {ledger_number}: {transaction_hash}`

**Example:**
```
[GeoLink Events] ✅ Rule 2 transaction confirmed on ledger 12345: a1b2c3d4e5f6...
```

**Logged in:**
- `backend/routes/contracts.js` - `/:id/execute` endpoint
- `backend/routes/smartWallet.js` - `/execute-payment` endpoint

**Data:**
- ✅ Rule ID (if available)
- ✅ Transaction hash (public blockchain data)
- ✅ Ledger number
- ❌ No user IDs
- ❌ No secret keys
- ❌ No public keys

---

### 7. Rule Completed
**Format:** `[GeoLink Events] ✅ Rule {id} completed - Transaction: {transaction_hash}`

**Example:**
```
[GeoLink Events] ✅ Rule 2 completed - Transaction: a1b2c3d4e5f6...
```

**Logged in:**
- `backend/routes/contracts.js` - `/:id/execute` endpoint (regular execution)
- `backend/routes/contracts.js` - `/:id/execute` endpoint (smart wallet routing)
- `backend/routes/smartWallet.js` - `/execute-payment` endpoint

**Data:**
- ✅ Rule ID
- ✅ Transaction hash (public blockchain data)
- ❌ No user IDs
- ❌ No secret keys
- ❌ No public keys

---

### 8. Payment Execution (Smart Wallet)
**Format:** `[GeoLink Events] 💳 Payment execution started: Rule {id} for {truncated_public_key}...`

**Example:**
```
[GeoLink Events] 💳 Payment execution started: Rule 2 for GDPMUX3X...
```

**Logged in:** `backend/routes/smartWallet.js` - `/execute-payment` endpoint

**Data:**
- ✅ Rule ID
- ✅ Truncated public key (first 8 characters)
- ❌ No user IDs
- ❌ No secret keys
- ❌ No full public keys

---

### 9. Read-Only Function Executed
**Format:** `[BackgroundAI] ✅ Rule {id} ({name}) EXECUTED - Transaction: {transaction_hash}...`

**Example:**
```
[BackgroundAI] ✅ Rule 3 (Test Function) EXECUTED - Transaction: a1b2c3d4e5f6...
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

**Conditions:**
- ✅ Read-only function (get_, is_, has_, check_, query_, view_, read_, fetch_, test)
- ✅ No WebAuthn required
- ✅ Advanced settings passed

**Data:**
- ✅ Rule ID and name
- ✅ Transaction hash (public blockchain data)
- ❌ No user IDs
- ❌ No public keys
- ❌ No secret keys

---

### 10. Processing Summary
**Format:** `[BackgroundAI] 📊 Location update {id} processed: {pending_count} added to pending, {executed_count} executed`

**Example:**
```
[BackgroundAI] 📊 Location update 3251 processed: 1 added to pending, 1 executed
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

**Data:**
- ✅ Location update ID
- ✅ Count of rules added to pending
- ✅ Count of rules executed
- ❌ No user IDs
- ❌ No public keys
- ❌ No secret keys

---

## Advanced Settings Warnings

### Rate Limit Exceeded
**Format:** `[BackgroundAI] ⚠️ Rule {id} ({name}) - Rate limit exceeded: {max} per {window}s`

**Example:**
```
[BackgroundAI] ⚠️ Rule 2 (Santa Monica - Send Payment) - Rate limit exceeded: 5 per 60s
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

---

### Location Duration Not Met
**Format:** `[BackgroundAI] ⚠️ Rule {id} ({name}) - Location duration not met: requires {seconds}s at location`

**Example:**
```
[BackgroundAI] ⚠️ Rule 2 (Santa Monica - Send Payment) - Location duration not met: requires 60s at location
```

**Logged in:** `backend/services/backgroundAIService.js` - `processLocationUpdate()`

**Note:** The system tracks location updates over time (every ~5 seconds from XYZ-Wallet) to accumulate duration. This warning appears when the required duration (e.g., 60 seconds) has not been met yet.

---

## Error Logs

Error logs are kept minimal and only show error messages (no stack traces, no sensitive data):

- `[BackgroundAI] ❌ Error processing location update {id}: {error_message}`
- `[Execute] ❌ Error executing contract function: {error_message}`
- `[Smart Wallet] ❌ Error executing payment: {error_message}`

---

## Future: ZK-Proof Integration

For the public events feed, sensitive data can be zk-proofed using Stellar's x-ray methodologies:

1. **Public Keys**: Already truncated (first 8 characters) - can be further zk-proofed if needed
2. **User IDs**: Not logged in public events
3. **Secret Keys**: Never logged
4. **Transaction Hashes**: Public blockchain data - safe to display
5. **Coordinates**: Can be zk-proofed to show general area without exact location

---

## Implementation Notes

1. **All public events use `[GeoLink Events]` prefix** for easy filtering
2. **Background AI logs use `[BackgroundAI]` prefix** for rule matching events
3. **Transaction hashes are public blockchain data** - safe to display
4. **Public keys are truncated** to first 8 characters
5. **No user IDs, secret keys, or full public keys** in public logs
6. **Error logs are simplified** - only error messages, no stack traces

---

## Log Filtering for Public Events Feed

To extract only public-friendly events for the home page:

```javascript
// Filter logs for public display
const publicEvents = logs.filter(log => 
  log.includes('[GeoLink Events]') || 
  log.includes('[BackgroundAI]') && (
    log.includes('📍 Processing location update') ||
    log.includes('🔍 Evaluating') ||
    log.includes('✅ Rule') && (log.includes('MATCHED') || log.includes('EXECUTED')) ||
    log.includes('📊 Location update') && log.includes('processed')
  )
);
```

---

## Example Public Events Feed Output

```
[GeoLink Events] 📍 Location update received: GDPMUX3X... at (34.0522, -118.2437)
[BackgroundAI] 🔍 Evaluating 2 rule(s) for location update 3251: Rule 2 (Santa Monica - Send Payment), Rule 3 (Test Function)
[BackgroundAI] ✅ Rule 2 (Santa Monica - Send Payment) MATCHED - Added to pending rules (passed advanced settings, requires WebAuthn)
[BackgroundAI] ✅ Rule 3 (Test Function) EXECUTED - Transaction: a1b2c3d4e5f6...
[BackgroundAI] 📊 Location update 3251 processed: 1 added to pending, 1 executed
[GeoLink Events] ⚡ Rule 2 execution started: execute_payment() for GDPMUX3X...
[GeoLink Events] ✅ Rule 2 transaction submitted: a1b2c3d4e5f6...
[GeoLink Events] ✅ Rule 2 transaction confirmed on ledger 12345: a1b2c3d4e5f6...
[GeoLink Events] ✅ Rule 2 completed - Transaction: a1b2c3d4e5f6...
```
