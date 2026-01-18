# Passkey Management & Execution Workflow Improvements

## Summary of Changes

### 1. Fixed Immediate Execution for Non-WebAuthn Rules

**Problem**: Rules with `requires_webauthn = false` were still going to pending if they had empty WebAuthn parameter names in the function parameters.

**Solution**: Updated `backend/services/backgroundAIService.js` to only check for WebAuthn parameters that have **actual values**, not just empty parameter names. Now:
- If `requires_webauthn = false` AND all WebAuthn parameters are empty/null/placeholders → **Execute immediately**
- If `requires_webauthn = true` OR WebAuthn parameters have values → **Go to pending**

**Code Change**:
```javascript
// OLD: Checked if parameter name exists (even if empty)
const hasWebAuthnParams = webauthnParamNames.some(paramName => 
  functionParams.hasOwnProperty(paramName)
);

// NEW: Checks if parameter has actual value
const hasWebAuthnParams = webauthnParamNames.some(paramName => {
  const paramValue = functionParams[paramName];
  return paramValue !== undefined && 
         paramValue !== null && 
         paramValue !== '' &&
         !paramValue.toString().includes('[Will be system-generated');
});
```

### 2. Automatic Passkey Re-Registration

**Problem**: When passkey mismatch occurs, users had to manually re-register their passkey.

**Solution**: Added automatic re-registration in `frontend/src/components/Contracts/ContractManagement.js`:
- Detects passkey mismatch errors
- Automatically attempts to re-register the passkey using the API endpoint
- Falls back to direct contract call if API fails
- Shows success message and prompts user to retry execution

**User Experience**:
1. User tries to execute a rule
2. Passkey mismatch detected
3. System automatically re-registers the passkey
4. User sees success message
5. User can retry execution immediately

### 3. Workflow Documentation

Created `SMART_CONTRACT_WORKFLOW.md` explaining:
- How "Use Smart Wallet for Payments" affects execution
- How "Require WebAuthn/Passkey Authentication" affects execution
- Combined scenarios and their behaviors
- Troubleshooting guide

## Passkey Management Page

### Current Functionality
- ✅ View all registered passkeys
- ✅ See which passkey is active on contract (`isOnContract` flag)
- ✅ Rename passkeys
- ✅ Delete passkeys (with warning if on contract)

### Known Issues
1. **No Default Passkey Selection**: Currently, the system uses the first passkey or one marked `isOnContract`. There's no explicit "default" flag.
2. **Deletion Limitations**: Passkeys registered on the contract cannot be deleted from the contract (only from database). A new passkey must be registered to overwrite.

### Recommendations for Future Improvements

1. **Add Default Passkey Flag**:
   - Add `is_default` column to `user_passkeys` table
   - Allow users to set one passkey as default
   - Use default passkey when multiple passkeys exist

2. **Improve Deletion**:
   - Show clearer warnings when deleting passkey on contract
   - Provide option to register new passkey before deleting old one
   - Auto-select passkey on contract as default

3. **Better Passkey Selection**:
   - Show which passkey will be used for each operation
   - Allow selection of specific passkey for execution
   - Display passkey registration date and last used date

## How Settings Affect Workflow

### Use Smart Wallet for Payments (`use_smart_wallet`)

**Enabled:**
- Payment functions route through smart wallet contract
- Uses vault balance (user must deposit first)
- Requires passkey if `requires_webauthn = true`

**Disabled:**
- Payment functions execute directly on target contract
- Uses direct wallet balance
- No smart wallet routing

### Require WebAuthn/Passkey Authentication (`requires_webauthn`)

**Enabled:**
- All functions require passkey authentication
- Rules go to pending (cannot execute automatically)
- User must execute manually via browser UI

**Disabled:**
- Functions can execute automatically
- Only goes to pending if WebAuthn parameters have actual values
- No passkey required for execution

## Testing the Fix

To test immediate execution:

1. Create a contract with:
   - `use_smart_wallet = false`
   - `requires_webauthn = false`

2. Create an execution rule for a simple function (e.g., `test` with no parameters)

3. Send a location update from xyz-wallet that matches the rule's location/radius

4. **Expected Result**: Rule should execute immediately, not go to pending

5. Check the completed rules tab to see the execution

## Next Steps

1. Consider adding default passkey functionality
2. Improve passkey deletion UX
3. Add passkey usage tracking
4. Consider multi-passkey support for different roles
