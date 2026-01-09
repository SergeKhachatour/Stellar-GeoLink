# Migration 004: Custom Contracts & Multi-Wallet Quorum

## Overview

This migration creates all tables and functions needed for:
1. Custom smart contract management
2. Contract execution rules
3. Multi-wallet quorum support (NEW)

## What's Included

### 1. Custom Contracts Table (`custom_contracts`)
- Stores user-defined smart contract configurations
- Supports WASM file uploads (from StellarExpert or locally compiled)
- Function discovery and mapping
- Smart wallet and WebAuthn integration
- Available to ALL roles (NFT Manager, Data Consumer, Wallet Provider, Admin)

### 2. Contract Function Mappings Table (`contract_function_mappings`)
- Detailed function mappings for custom contracts
- GeoLink field mappings
- Function call configuration

### 3. Contract Execution Rules Table (`contract_execution_rules`)
- Location/geofence-based contract execution rules
- Supports ANY wallet (not just NFTs)
- **NEW**: Multi-wallet quorum support
  - `required_wallet_public_keys` - Array of required wallet addresses
  - `minimum_wallet_count` - Minimum number of wallets that must be in range
  - `quorum_type` - 'any' (at least minimum), 'all' (all required), or 'exact' (exactly minimum)

### 4. Smart Wallet Collection Rules Table (`smart_wallet_collection_rules`)
- Rules for smart wallets to automatically collect nearby NFTs
- Location, geofence, or proximity triggers

### 5. Database Functions

#### `check_wallets_in_range(rule_id, latitude, longitude)`
- Checks which required wallets are currently in range for a rule
- Returns: wallet_public_key, is_in_range, distance_meters

#### `validate_quorum_for_rule(rule_id)`
- Validates if quorum requirements are met
- Returns: quorum_met, wallets_in_range[], wallets_out_of_range[], count_in_range, minimum_required

## Multi-Wallet Quorum Feature

### Use Cases
- **Board Meeting**: Require 3 out of 5 board members to be present
- **Multi-Party Transactions**: Require multiple stakeholders in range
- **Security**: Require multiple authorized wallets for high-value transactions
- **Consensus**: Require quorum of wallets to approve execution

### Quorum Types
1. **`any`** (default): At least `minimum_wallet_count` wallets must be in range
2. **`all`**: ALL wallets in `required_wallet_public_keys` must be in range
3. **`exact`**: Exactly `minimum_wallet_count` wallets must be in range

### Example Rule
```sql
INSERT INTO contract_execution_rules (
    user_id, contract_id, rule_name, rule_type,
    center_latitude, center_longitude, radius_meters,
    function_name, required_wallet_public_keys,
    minimum_wallet_count, quorum_type
) VALUES (
    1, 1, 'Board Decision', 'location',
    34.0522, -118.2437, 50,
    'execute_decision',
    ARRAY['GABC123...', 'GDEF456...', 'GHIJ789...', 'GKLM012...', 'GNOP345...'],
    3, 'any'
);
```

## Running the Migration

```bash
psql -d your_database_name -f database/migrations/004_create_custom_contracts.sql
```

Or using psql interactively:
```sql
\i database/migrations/004_create_custom_contracts.sql
```

## Tables Created

1. ✅ `custom_contracts`
2. ✅ `contract_function_mappings`
3. ✅ `contract_execution_rules` (with quorum support)
4. ✅ `smart_wallet_collection_rules`

## Columns Added to Existing Tables

- `pinned_nfts.custom_contract_id` - Links NFTs to custom contracts

## Indexes Created

- All necessary indexes for performance optimization
- GIST indexes for geospatial queries
- Partial indexes for active rules

## Constraints

- Foreign key constraints
- Check constraints for valid rule configurations
- Check constraints for valid quorum configurations
- Unique constraints where needed

## Notes

- All tables support soft deletes (`is_active` flag)
- All tables have `created_at` and `updated_at` timestamps
- Foreign keys use `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate
- The migration is idempotent (uses `IF NOT EXISTS`)

## Testing Checklist

After running the migration, verify:

- [ ] All tables created successfully
- [ ] All indexes created
- [ ] All functions created
- [ ] Can insert a custom contract
- [ ] Can create an execution rule
- [ ] Can create a rule with quorum requirements
- [ ] `check_wallets_in_range()` function works
- [ ] `validate_quorum_for_rule()` function works
- [ ] Quorum validation returns correct results

