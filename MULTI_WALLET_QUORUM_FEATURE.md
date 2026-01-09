# Multi-Wallet Quorum Feature

## Overview

The contract execution rules now support **multi-wallet quorum requirements**. This allows you to require multiple wallets (e.g., 3 out of 5) to be in proximity before a contract function can be executed.

## Use Cases

1. **Board Meeting**: Require 3 out of 5 board members to be present at a location before executing a contract
2. **Multi-Party Transactions**: Require multiple stakeholders to be in range before a payment is processed
3. **Security**: Require multiple authorized wallets to be present for high-value transactions
4. **Consensus**: Require a quorum of wallets to approve contract execution

## Database Schema Changes

### New Columns in `contract_execution_rules`:

1. **`required_wallet_public_keys`** (TEXT[])
   - Array of wallet public keys that must be present
   - NULL = no multi-wallet requirement

2. **`minimum_wallet_count`** (INTEGER)
   - Minimum number of wallets from `required_wallet_public_keys` that must be in range
   - Required if `required_wallet_public_keys` is provided

3. **`quorum_type`** (TEXT)
   - `'any'` (default): At least `minimum_wallet_count` must be in range
   - `'all'`: All wallets in `required_wallet_public_keys` must be in range
   - `'exact'`: Exactly `minimum_wallet_count` must be in range

### Database Functions:

1. **`check_wallets_in_range(rule_id, latitude, longitude)`**
   - Checks which required wallets are currently in range
   - Returns: wallet_public_key, is_in_range, distance_meters

2. **`validate_quorum_for_rule(rule_id)`**
   - Validates if quorum requirements are met
   - Returns: quorum_met, wallets_in_range[], wallets_out_of_range[], count_in_range, minimum_required

## API Changes

### 1. Create Rule with Quorum

**POST `/api/contracts/rules`**

```json
{
  "contract_id": 1,
  "rule_name": "Board Meeting Execution",
  "rule_type": "location",
  "center_latitude": 34.0522,
  "center_longitude": -118.2437,
  "radius_meters": 50,
  "function_name": "execute_decision",
  "function_parameters": {"decision": "approve"},
  "required_wallet_public_keys": [
    "GABC123...",
    "GDEF456...",
    "GHIJ789...",
    "GKLM012...",
    "GNOP345..."
  ],
  "minimum_wallet_count": 3,
  "quorum_type": "any"
}
```

### 2. Check Quorum Status

**GET `/api/contracts/rules/:id/quorum`**

Returns:
```json
{
  "quorum_met": true,
  "wallets_in_range": ["GABC123...", "GDEF456...", "GHIJ789..."],
  "wallets_out_of_range": ["GKLM012...", "GNOP345..."],
  "count_in_range": 3,
  "minimum_required": 3,
  "message": "Quorum met: 3 of 3 required wallets are in range"
}
```

### 3. Execute with Quorum Validation

**POST `/api/contracts/:id/execute`**

```json
{
  "function_name": "execute_decision",
  "parameters": {"decision": "approve"},
  "user_public_key": "GABC123...",
  "user_secret_key": "...",
  "rule_id": 1  // Optional: if provided, quorum will be validated
}
```

If quorum is not met:
```json
{
  "error": "Quorum requirement not met",
  "quorum_status": {
    "quorum_met": false,
    "wallets_in_range": ["GABC123..."],
    "wallets_out_of_range": ["GDEF456...", "GHIJ789..."],
    "count_in_range": 1,
    "minimum_required": 3,
    "message": "Required 3 wallet(s) in range, but only 1 are present. Missing: GDEF456..., GHIJ789..."
  }
}
```

## Quorum Types Explained

### 1. `quorum_type: "any"`
- **Requirement**: At least `minimum_wallet_count` wallets must be in range
- **Example**: 3 out of 5 wallets must be present
- **Use Case**: Flexible quorum where any combination of wallets works

### 2. `quorum_type: "all"`
- **Requirement**: ALL wallets in `required_wallet_public_keys` must be in range
- **Example**: All 5 wallets must be present
- **Use Case**: Unanimous decision required

### 3. `quorum_type: "exact"`
- **Requirement**: Exactly `minimum_wallet_count` wallets must be in range
- **Example**: Exactly 3 wallets (not 2, not 4, exactly 3)
- **Use Case**: Precise quorum requirement

## Migration

Run the migration script:
```bash
psql -d your_database -f database/migrations/005_add_multi_wallet_quorum.sql
```

## Example Scenarios

### Scenario 1: Board Meeting (3 of 5)
```json
{
  "rule_name": "Board Decision Execution",
  "required_wallet_public_keys": [
    "GCHAIR...",
    "GMEMBER1...",
    "GMEMBER2...",
    "GMEMBER3...",
    "GMEMBER4..."
  ],
  "minimum_wallet_count": 3,
  "quorum_type": "any"
}
```

### Scenario 2: Unanimous Decision (All 3)
```json
{
  "rule_name": "Unanimous Approval Required",
  "required_wallet_public_keys": [
    "GOWNER1...",
    "GOWNER2...",
    "GOWNER3..."
  ],
  "minimum_wallet_count": 3,
  "quorum_type": "all"
}
```

### Scenario 3: Exact Quorum (Exactly 2)
```json
{
  "rule_name": "Precise Quorum",
  "required_wallet_public_keys": [
    "GWALLET1...",
    "GWALLET2...",
    "GWALLET3..."
  ],
  "minimum_wallet_count": 2,
  "quorum_type": "exact"
}
```

## Validation Rules

1. If `required_wallet_public_keys` is provided:
   - Must be a non-empty array
   - `minimum_wallet_count` is required
   - `minimum_wallet_count` must be between 1 and array length
   - All wallet addresses must be valid Stellar addresses (56 chars, starts with 'G')

2. If `required_wallet_public_keys` is NULL:
   - No quorum requirement
   - `minimum_wallet_count` must also be NULL

## Integration Notes

- The quorum check happens **before** contract execution
- Wallets are checked in real-time when the rule is triggered
- Location data comes from the `wallet_locations` table
- Only wallets with `location_enabled = true` are considered
- Distance is calculated using PostGIS geography functions

## Next Steps

1. Run the migration: `005_add_multi_wallet_quorum.sql`
2. Update API calls to include quorum fields when creating rules
3. Use the quorum status endpoint to check requirements before execution
4. Handle quorum validation errors in your frontend

