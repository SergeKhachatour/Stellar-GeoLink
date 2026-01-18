# Smart Contract Execution Workflow Guide

## Overview
This document explains how the two key contract settings affect execution workflows:
- **Use Smart Wallet for Payments**
- **Require WebAuthn/Passkey Authentication**

## Settings Explained

### 1. Use Smart Wallet for Payments (`use_smart_wallet`)

**When Enabled:**
- Payment functions (e.g., `execute_payment`, `transfer`, `send`) are routed through the smart wallet contract
- Payments are made from the user's **smart wallet vault balance**, not their direct wallet balance
- The user must have funds deposited in the smart wallet contract first
- The smart wallet contract handles the payment execution and signature verification

**When Disabled:**
- Payment functions execute directly on the target contract
- Payments are made from the user's **direct wallet balance**
- No smart wallet routing occurs

**Workflow:**
```
Payment Function Call
    ↓
Is use_smart_wallet = true?
    ├─ YES → Route through Smart Wallet Contract
    │         ├─ Check vault balance
    │         ├─ Verify passkey (if WebAuthn required)
    │         └─ Execute payment from vault
    │
    └─ NO → Execute directly on target contract
            └─ Use wallet balance directly
```

### 2. Require WebAuthn/Passkey Authentication (`requires_webauthn`)

**When Enabled:**
- All contract function executions require WebAuthn/passkey authentication
- Rules that match location updates **cannot execute automatically**
- Matched rules go to the **Pending Rules** tab for manual execution
- User must authenticate with their passkey in the browser UI to execute

**When Disabled:**
- Functions can execute automatically when location updates match rules
- No passkey authentication required
- Rules execute immediately when matched (if no WebAuthn parameters have values)

**Workflow:**
```
Location Update Received
    ↓
Rule Matches Location
    ↓
Does requires_webauthn = true?
    ├─ YES → Skip automatic execution
    │         ├─ Mark as "matched" (not executed)
    │         ├─ Add to Pending Rules tab
    │         └─ Wait for user to execute manually
    │
    └─ NO → Check function parameters
            ├─ Has WebAuthn params with values? → Skip to pending
            └─ No WebAuthn params or all empty? → Execute immediately
```

## Combined Scenarios

### Scenario 1: Both Disabled
- **use_smart_wallet**: `false`
- **requires_webauthn**: `false`
- **Result**: Functions execute immediately when location matches, using wallet balance directly

### Scenario 2: Smart Wallet Only
- **use_smart_wallet**: `true`
- **requires_webauthn**: `false`
- **Result**: Payment functions execute immediately using vault balance (if sufficient funds)

### Scenario 3: WebAuthn Only
- **use_smart_wallet**: `false`
- **requires_webauthn**: `true`
- **Result**: All functions require manual execution via browser UI with passkey authentication

### Scenario 4: Both Enabled
- **use_smart_wallet**: `true`
- **requires_webauthn**: `true`
- **Result**: Payment functions require passkey authentication and use vault balance

## Important Notes

1. **Empty WebAuthn Parameters**: If a rule has WebAuthn parameter names but they are empty/null/placeholder values, the system will still execute automatically if `requires_webauthn = false`. Only actual values trigger the pending state.

2. **Passkey Registration**: When `requires_webauthn = true`, users must register a passkey on the smart wallet contract before executing rules. The contract stores only ONE passkey per public key (the last one registered).

3. **Multiple Roles**: If you have multiple roles (e.g., data consumer, wallet provider) with the same Stellar public key, only the last registered passkey exists on the contract. This can cause passkey mismatches if different roles use different passkeys.

4. **Pending Rules**: Rules that require WebAuthn are stored in the `location_update_queue` with `skipped: true` and `reason: 'requires_webauthn'`. Each unique combination of rule_id + public_key gets its own pending entry.

## Troubleshooting

### Rule Not Executing Automatically
- Check if `requires_webauthn = true` on the contract
- Check if function parameters have WebAuthn values (not just empty placeholders)
- Verify the rule is active and location matches

### Passkey Mismatch Error
- The passkey registered on the contract doesn't match the one being used
- Solution: Re-register the passkey using the same one you want to use
- The system will attempt automatic re-registration when this error occurs

### Payment Failing
- If `use_smart_wallet = true`: Check vault balance (not wallet balance)
- If `use_smart_wallet = false`: Check direct wallet balance
- Ensure sufficient funds in the appropriate account
