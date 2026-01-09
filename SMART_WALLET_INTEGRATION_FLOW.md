# Smart Wallet Integration Flow

## Overview

When adding a smart contract, there are two optional settings in the "Smart Wallet Integration" section:

1. **Use Smart Wallet for Payments** (`use_smart_wallet`)
2. **Require WebAuthn/Passkey Authentication** (`requires_webauthn`)
3. **Smart Wallet Contract ID** (`smart_wallet_contract_id`)

## Current Implementation Status

### ✅ `requires_webauthn` - **FULLY IMPLEMENTED**

**How it works:**
- When `requires_webauthn` is enabled on a contract, the system automatically detects this during function execution
- The frontend checks this flag in two ways:
  1. **Contract-level check**: If `contract.requires_webauthn === true`, all functions require WebAuthn
  2. **Function-level check**: If function parameters include `webauthn_signature`, `webauthn_authenticator_data`, or `webauthn_client_data`, WebAuthn is required

**Execution Flow:**
1. User clicks "Execute" on a contract rule
2. System checks `requiresWebAuthn(rule, contract)` helper function
3. If WebAuthn is required:
   - Automatically retrieves user's passkeys from backend
   - Prompts user to authenticate with passkey (browser WebAuthn prompt)
   - Creates signature payload from function parameters
   - Processes WebAuthn signature (DER → raw 64 bytes)
   - Includes WebAuthn data in contract function call
4. Secret key is still required to sign the base Stellar transaction

**Where it's used:**
- `frontend/src/components/Contracts/ContractManagement.js` - `requiresWebAuthn()` helper
- `frontend/src/components/Contracts/ContractManagement.js` - `handleConfirmExecute()` function
- `backend/routes/contracts.js` - `/execute` endpoint processes WebAuthn signatures
- `backend/services/azureOpenAIService.js` - AI agent checks WebAuthn requirement before executing

### ✅ `use_smart_wallet` and `smart_wallet_contract_id` - **FULLY IMPLEMENTED**

**Current Status:**
- ✅ These fields are **saved** to the database when creating/editing contracts
- ✅ These fields are **returned** in GET `/api/contracts` endpoint
- ✅ These fields are **available** in the frontend contract objects
- ✅ These fields are **actively used** in the execution flow

**How It Works:**
When `use_smart_wallet === true` and a payment function is detected:
1. **Payment Function Detection:**
   - System checks function name for payment patterns: `transfer`, `payment`, `send`, `pay`, `withdraw`, `deposit`
   - System checks function parameters for payment fields: `destination`/`recipient`/`to` + `amount`

2. **Smart Wallet Routing:**
   - Extracts payment parameters (`destination`, `amount`, `asset`) from function parameters
   - Routes the payment through the smart wallet contract specified by `smart_wallet_contract_id`
   - Calls smart wallet's `execute_payment` function instead of the original contract function

3. **WebAuthn Integration:**
   - If `requires_webauthn === true`, WebAuthn signature is required
   - Processes WebAuthn signature (DER → raw 64 bytes)
   - Includes WebAuthn data in smart wallet function call

4. **Frontend Indicators:**
   - Contract cards show "💳 Smart Wallet Enabled" chip
   - Execute dialog shows "Payment will be routed through Smart Wallet" alert
   - Displays smart wallet contract ID

**Execution Flow:**
```
User executes payment function on Contract A
  ↓
System checks: use_smart_wallet === true?
  ↓ YES
System checks: function is payment-related?
  ↓ YES
System extracts: destination, amount, asset
  ↓
System checks: requires_webauthn === true?
  ↓ YES
System processes WebAuthn signature
  ↓
System routes to Smart Wallet Contract
  ↓
System calls Smart Wallet's execute_payment
  ↓
Payment executed via smart wallet
```

## Database Schema

```sql
custom_contracts (
  ...
  use_smart_wallet BOOLEAN DEFAULT false,
  smart_wallet_contract_id VARCHAR(56),
  requires_webauthn BOOLEAN DEFAULT false,
  ...
)
```

## Frontend UI

**Location:** `frontend/src/components/NFT/CustomContractDialog.js`

The UI shows:
- **"Use Smart Wallet for Payments"** switch - enables `use_smart_wallet`
- **"Smart Wallet Contract ID"** text field - sets `smart_wallet_contract_id` (only visible when switch is on)
- **"Require WebAuthn/Passkey Authentication"** switch - enables `requires_webauthn` (disabled if `use_smart_wallet` is off)

**Note:** The UI currently disables WebAuthn switch when smart wallet is off, but this is just a UI constraint. WebAuthn can work independently.

## Backend Endpoints

### GET `/api/contracts`
Returns contracts with all fields including:
- `use_smart_wallet`
- `smart_wallet_contract_id`
- `requires_webauthn`

### POST `/api/contracts/:id/execute`
**Uses:**
- ✅ `requires_webauthn` - checks contract flag and processes WebAuthn signatures
- ✅ `use_smart_wallet` - checks if payment should be routed through smart wallet
- ✅ `smart_wallet_contract_id` - identifies which smart wallet contract to use
- ✅ Payment function detection - automatically detects payment functions by name and parameters
- ✅ Parameter extraction - extracts `destination`, `amount`, `asset` from function parameters
- ✅ Smart wallet routing - routes payment through smart wallet's `execute_payment` function

## Implementation Details

### Payment Function Detection

The system automatically detects payment functions using:

1. **Function Name Patterns:**
   - `transfer`, `payment`, `send`, `pay`, `withdraw`, `deposit`
   - Case-insensitive matching

2. **Parameter Detection:**
   - Looks for `destination`, `recipient`, or `to` parameters
   - Looks for `amount`, `value`, or `quantity` parameters
   - If both are present, function is considered payment-related

### Parameter Extraction

When routing through smart wallet, the system extracts:
- **Destination**: From `destination`, `recipient`, `to`, `to_address`, or `destination_address`
- **Amount**: From `amount`, `value`, or `quantity` (auto-converts XLM to stroops if needed)
- **Asset**: From `asset`, `asset_address`, `token`, or `token_address` (defaults to native XLM)

### Smart Wallet Function Call

The system calls the smart wallet's `execute_payment` function with:
- `signer_address`: User's public key
- `destination`: Extracted destination address
- `amount`: Extracted amount (in stroops)
- `asset`: Extracted asset address (or native XLM)
- `signature_payload`: JSON string of transaction data
- `webauthn_signature`: Processed WebAuthn signature (if required)
- `webauthn_authenticator_data`: WebAuthn authenticator data (if required)
- `webauthn_client_data`: WebAuthn client data (if required)

## Example Usage

1. **Create Contract with Smart Wallet:**
   - Enable "Use Smart Wallet for Payments"
   - Enter smart wallet contract ID
   - Optionally enable "Require WebAuthn/Passkey Authentication"

2. **Create Execution Rule:**
   - Select a payment function (e.g., `transfer`, `send_payment`)
   - Set parameters: `destination`, `amount`, `asset`

3. **Execute Function:**
   - System detects it's a payment function
   - System routes through smart wallet
   - System prompts for passkey (if WebAuthn required)
   - Payment executed via smart wallet contract
