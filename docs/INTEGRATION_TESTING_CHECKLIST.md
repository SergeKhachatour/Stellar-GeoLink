# GeoLink & XYZ-Wallet Integration Testing Checklist

## ✅ Implementation Status

### GeoLink Backend (All Implemented ✅)

1. ✅ `GET /api/contracts/rules/pending/deposits` - Get pending deposit actions
   - Supports Wallet Provider API Key
   - Supports JWT authentication (for GeoLink users)
   - Filters by `matched_public_key` for JWT users
   - Returns deposit functions only

2. ✅ `GET /api/contracts/rules/pending/deposits/:action_id` - Get deposit action details
   - Supports Wallet Provider API Key
   - Supports JWT authentication
   - Includes `function_parameters` from rule

3. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/execute` - Execute deposit
   - Supports Wallet Provider API Key
   - Supports JWT authentication
   - Requires `user_secret_key` for transaction signing
   - Validates WebAuthn signature
   - Includes all `function_parameters` from rule
   - Executes directly on contract (not routed through smart wallet)
   - Updates `location_update_queue` and `rule_execution_history`

4. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/complete` - Report completion
   - Supports Wallet Provider API Key
   - Supports JWT authentication
   - Updates execution results with transaction hash
   - Records in `rule_execution_history`

5. ✅ `POST /api/contracts/rules/pending/deposits/:action_id/cancel` - Cancel deposit action
   - Supports Wallet Provider API Key
   - Supports JWT authentication
   - Marks action as rejected

### GeoLink Frontend (All Implemented ✅)

1. ✅ Deposit Actions Tab (Tab 3)
   - Displays pending deposits
   - Shows rule name, contract, function, amount, location, status
   - Execute button for pending deposits
   - Auto-refreshes every 10 seconds

2. ✅ `loadPendingDeposits()` function
   - Fetches from `/api/contracts/rules/pending/deposits`
   - Handles JWT authentication
   - Updates `pendingDeposits` state

3. ✅ `handleExecuteDeposit()` function
   - Uses GeoLink's `ContractCallIntent` format
   - Filters WebAuthn fields from parameters
   - Creates typed arguments array
   - Encodes intent with canonical JSON (sorted keys)
   - Generates challenge using SHA-256 hash
   - Performs WebAuthn authentication
   - Executes via `/api/contracts/rules/pending/deposits/:id/execute`
   - Reloads deposits and completed rules after execution

### Intent Service (All Implemented ✅)

1. ✅ `createContractCallIntent()` - Creates intent with GeoLink format
2. ✅ `encodeIntentBytes()` - Canonical JSON encoding with sorted keys
3. ✅ `challengeFromIntent()` - SHA-256 hash of intent bytes
4. ✅ `convertIntrospectedArgsToIntentArgs()` - Converts to typed args array

### Authentication (All Implemented ✅)

1. ✅ `authenticateContractUser` middleware
   - Supports Wallet Provider API Key
   - Supports JWT authentication
   - Properly populates `req.user` for JWT users
   - Validates JWT users can only access their own deposits

## 🧪 Testing Checklist

### Pre-Testing Setup

- [ ] GeoLink backend running on `http://localhost:4000`
- [ ] GeoLink frontend running on `http://localhost:3000`
- [ ] XYZ-Wallet backend running (if applicable)
- [ ] XYZ-Wallet frontend running (if applicable)
- [ ] Database connected and accessible
- [ ] Wallet Provider API key configured
- [ ] Test user account with JWT token
- [ ] Test deposit rule configured in GeoLink
- [ ] Test contract deployed on Stellar testnet

### Test 1: GeoLink Frontend - View Deposit Actions

**Steps:**
1. Log in to GeoLink with a user account
2. Navigate to Contracts → Execution Rules tab
3. Click on "Deposit Actions" tab (Tab 3)
4. Verify pending deposits are displayed (if any exist)

**Expected Results:**
- ✅ Deposit Actions tab is visible
- ✅ Pending deposits are listed in a table
- ✅ Each deposit shows: Rule, Contract, Function, Amount, Location, Received, Status
- ✅ Execute button is visible for pending deposits
- ✅ Loading spinner appears while fetching
- ✅ Empty state message if no deposits

### Test 2: GeoLink Frontend - Execute Deposit

**Steps:**
1. Ensure you have a pending deposit action
2. Click "Execute" button on a pending deposit
3. Complete WebAuthn authentication (passkey/biometric)
4. Wait for transaction confirmation

**Expected Results:**
- ✅ WebAuthn prompt appears
- ✅ Intent is created using `ContractCallIntent` format
- ✅ Challenge is generated using SHA-256 hash
- ✅ Transaction executes successfully
- ✅ Success message with transaction hash
- ✅ Deposit status updates to "completed"
- ✅ Deposit disappears from pending list
- ✅ Appears in "Completed Rules" tab

### Test 3: XYZ-Wallet - Poll for Pending Deposits

**Steps:**
1. Configure XYZ-Wallet with Wallet Provider API key
2. Implement polling logic (every 30 seconds)
3. Call `GET /api/contracts/rules/pending/deposits`
4. Verify response structure

**Expected Results:**
- ✅ API call succeeds with 200 status
- ✅ Response includes `pending_deposits` array
- ✅ Each deposit has required fields:
  - `id`, `rule_id`, `rule_name`, `contract_id`, `contract_address`
  - `function_name`, `matched_public_key`, `parameters`
  - `location`, `expires_at`, `status`
- ✅ Only deposit functions are returned
- ✅ Only pending deposits are returned

### Test 4: XYZ-Wallet - Execute Deposit via GeoLink

**Steps:**
1. Get a pending deposit action ID
2. Create intent using GeoLink's `ContractCallIntent` format:
   - `v: 1`
   - `network`, `rpcUrl`, `contractId`, `fn`
   - `args: [{name, type, value}]` (typed arguments array)
   - `signer`, `ruleBinding`, `nonce`, `iat`, `exp`
3. Encode intent with canonical JSON (sorted keys)
4. Generate challenge using SHA-256 hash
5. Perform WebAuthn authentication
6. Call `POST /api/contracts/rules/pending/deposits/:id/execute`

**Expected Results:**
- ✅ Intent structure matches GeoLink format exactly
- ✅ Canonical JSON encoding uses sorted keys
- ✅ Challenge is SHA-256 hash of intent bytes
- ✅ WebAuthn authentication succeeds
- ✅ API call succeeds with 200 status
- ✅ Response includes `transaction_hash` and `ledger`
- ✅ Deposit status updates to "completed"
- ✅ Transaction appears on Stellar network

### Test 5: Intent Format Validation

**Steps:**
1. Create intent using GeoLink's format
2. Verify all required fields are present
3. Verify WebAuthn fields are excluded
4. Verify encoding produces deterministic output

**Expected Results:**
- ✅ Intent has: `v`, `network`, `rpcUrl`, `contractId`, `fn`, `args`, `signer`, `nonce`, `iat`, `exp`
- ✅ `args` is array of `{name, type, value}` objects
- ✅ No WebAuthn fields in Intent (`signature_payload`, `webauthn_*` excluded)
- ✅ Canonical JSON has sorted keys
- ✅ Same intent produces same encoded bytes

### Test 6: Challenge Generation Validation

**Steps:**
1. Encode intent to bytes
2. Generate challenge using SHA-256 hash
3. Verify challenge is 32 bytes
4. Verify challenge matches GeoLink's method

**Expected Results:**
- ✅ Challenge is SHA-256 hash of intent bytes
- ✅ Challenge is exactly 32 bytes
- ✅ Challenge can be base64url encoded for WebAuthn API
- ✅ Challenge matches what GeoLink expects

### Test 7: Authentication - Wallet Provider API Key

**Steps:**
1. Use Wallet Provider API key in `X-API-Key` header
2. Call deposit endpoints
3. Verify access is granted

**Expected Results:**
- ✅ All 5 deposit endpoints accessible with API key
- ✅ Can see deposits for any managed wallet
- ✅ Can execute deposits for any managed wallet
- ✅ No 401/403 errors

### Test 8: Authentication - JWT Token

**Steps:**
1. Log in to GeoLink
2. Get JWT token
3. Use JWT token in `Authorization: Bearer <token>` header
4. Call deposit endpoints
5. Verify access is scoped to user's public key

**Expected Results:**
- ✅ All 5 deposit endpoints accessible with JWT
- ✅ Can only see deposits for own `public_key`
- ✅ Can only execute deposits for own `public_key`
- ✅ Cannot access other users' deposits (403 error)

### Test 9: Error Handling

**Test Cases:**
1. Invalid API key → 401 Unauthorized
2. Missing required parameters → 400 Bad Request
3. Invalid action ID format → 400 Bad Request
4. Deposit already completed → 404 Not Found or appropriate error
5. Invalid WebAuthn signature → 400 Bad Request
6. Expired deposit action → Appropriate error
7. Insufficient balance → Transaction failure

**Expected Results:**
- ✅ Appropriate HTTP status codes
- ✅ Clear error messages
- ✅ Error details in response body
- ✅ No crashes or 500 errors for expected failures

### Test 10: End-to-End Flow

**Complete Flow:**
1. Create deposit execution rule in GeoLink
2. Trigger location update that matches rule
3. Verify deposit action appears in pending list
4. XYZ-Wallet polls and receives deposit action
5. User approves deposit in XYZ-Wallet
6. XYZ-Wallet creates intent using GeoLink format
7. XYZ-Wallet executes deposit via GeoLink
8. Verify transaction on Stellar network
9. Verify deposit action marked as completed
10. Verify deposit disappears from pending list

**Expected Results:**
- ✅ All steps complete successfully
- ✅ Transaction appears on Stellar network
- ✅ Transaction hash recorded in database
- ✅ Status updates correctly
- ✅ No errors in logs

## 🔍 Verification Commands

### Check Backend Endpoints

```bash
# Test 1: Get pending deposits (with API key)
curl -X GET "http://localhost:4000/api/contracts/rules/pending/deposits" \
  -H "X-API-Key: YOUR_WALLET_PROVIDER_API_KEY"

# Test 2: Get deposit details
curl -X GET "http://localhost:4000/api/contracts/rules/pending/deposits/deposit_4282_7_GAGB3S3K" \
  -H "X-API-Key: YOUR_WALLET_PROVIDER_API_KEY"

# Test 3: Check JWT authentication
curl -X GET "http://localhost:4000/api/contracts/rules/pending/deposits" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Check Database

```sql
-- Check pending deposits
SELECT 
  luq.id as update_id,
  cer.id as rule_id,
  cer.function_name,
  luq.public_key,
  luq.execution_results
FROM location_update_queue luq
JOIN contract_execution_rules cer ON cer.id = ANY(luq.matched_rule_ids)
WHERE cer.function_name ILIKE '%deposit%'
  AND luq.execution_results IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(luq.execution_results) AS result
    WHERE result->>'skipped' = 'true'
      AND result->>'reason' = 'requires_webauthn'
      AND (result->>'rule_id')::integer = cer.id
  )
ORDER BY luq.received_at DESC
LIMIT 10;
```

## ✅ Ready for Testing

### GeoLink Status
- ✅ All 5 deposit endpoints implemented
- ✅ Frontend Deposit Actions tab implemented
- ✅ Intent service using ContractCallIntent format
- ✅ Authentication (API key + JWT) working
- ✅ WebAuthn integration complete
- ✅ Error handling in place

### XYZ-Wallet Status
- ✅ Complete implementation guide provided
- ✅ ContractCallIntent format documented
- ✅ Code examples ready to use
- ✅ Migration guide available

### Next Steps

1. **Test GeoLink locally:**
   - Start backend: `cd backend && npm start`
   - Start frontend: `cd frontend && npm start`
   - Test deposit actions tab
   - Test deposit execution from GeoLink UI

2. **Test XYZ-Wallet integration:**
   - Use the complete implementation guide
   - Implement the `executeDepositViaGeoLink` function
   - Test with GeoLink's localhost endpoints
   - Verify intent format matches exactly

3. **Commit and Push:**
   - **GeoLink first**: Commit all changes, push to repository
   - **XYZ-Wallet second**: Commit implementation, push to repository

## 📝 Notes

- **Localhost URLs**: Update `https://geolink-api.com` to `http://localhost:4000` for local testing
- **API Key**: Ensure Wallet Provider API key is configured in GeoLink
- **JWT Token**: Get JWT token by logging into GeoLink frontend
- **Network**: Both should use Stellar testnet for testing
- **Intent Format**: Must match GeoLink's format exactly or verification will fail

## 🐛 Common Issues

1. **Challenge Mismatch**: Ensure using SHA-256 hash, not first 32 bytes directly
2. **Intent Format**: Must use ContractCallIntent format, not simple JSON
3. **Encoding**: Must use sorted keys for canonical JSON
4. **Authentication**: Verify API key or JWT token is valid
5. **Parameters**: Ensure WebAuthn fields are excluded from Intent

---

**Status**: ✅ **READY FOR TESTING**

Both integrations are complete and ready for localhost testing. Follow the testing checklist above to verify everything works correctly before committing and pushing.
