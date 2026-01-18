# Running Database Migrations

## Quick Check

First, verify which migrations need to be run:

```bash
psql -h <host> -U <user> -d <database> -f database/migrations/check_migrations.sql
```

Or in psql:
```sql
\i database/migrations/check_migrations.sql
```

## Migration Order

Run migrations in this order:

### 1. Migration 009: Execution Rule Controls
```bash
psql -h <host> -U <user> -d <database> -f database/migrations/009_add_execution_rule_controls.sql
```

**What it adds:**
- Rate limiting columns (`max_executions_per_public_key`, `execution_time_window_seconds`)
- Time-based trigger columns (`min_location_duration_seconds`)
- Auto-deactivation columns (`auto_deactivate_on_balance_threshold`, `balance_threshold_xlm`, etc.)
- Tables: `rule_execution_history`, `rule_location_tracking`
- Functions: `can_execute_rule()`, `has_min_location_duration()`, `update_rule_location_tracking()`, `record_rule_execution()`

### 2. Migration 010: Default Passkey Support
```bash
psql -h <host> -U <user> -d <database> -f database/migrations/010_add_default_passkey.sql
```

**What it adds:**
- Column: `is_default` in `user_passkeys` table
- Function: `set_default_passkey()` - ensures only one default per user
- Function: `get_default_passkey()` - retrieves default passkey for a user

### 3. Migration 011: ZK Privacy Features (Protocol 25)
```bash
psql -h <host> -U <user> -d <database> -f database/migrations/011_add_zk_privacy_features.sql
```

**What it adds:**
- Privacy columns in `contract_execution_rules`: `use_zk_privacy`, `privacy_mode`, `approximate_radius_meters`, `zk_circuit_config`, `require_zk_proof`, `zk_proof_verification_contract_id`
- Tables: `geolink_zk_proofs`, `zk_quorum_proofs`, `compliance_proofs`, `zk_circuit_configs`, `rule_approximate_locations`
- Functions: `store_geolink_zk_proof()`, `update_geolink_proof_verification()`, `generate_approximate_location()`, `get_rule_approximate_location()`

## Using psql Interactively

```bash
psql -h <host> -U <user> -d <database>
```

Then run:
```sql
\i database/migrations/009_add_execution_rule_controls.sql
\i database/migrations/010_add_default_passkey.sql
\i database/migrations/011_add_zk_privacy_features.sql
```

## Verification

After running migrations, verify they were applied:

```sql
\i database/migrations/check_migrations.sql
```

You should see:
- ✅ Migration 009 (Execution Rule Controls) - APPLIED
- ✅ Migration 010 (Default Passkey) - APPLIED
- ✅ Migration 011 (ZK Privacy Features) - APPLIED

## Important Notes

1. **Migration 009** must be run before the backend uses rate limiting features
2. **Migration 010** must be run before the frontend can set default passkeys
3. **Migration 011** is for Protocol 25 preparation (actual ZK proof generation will be implemented after Protocol 25 upgrade)

## Rollback

These migrations use `IF NOT EXISTS` clauses, so they're safe to run multiple times. However, if you need to rollback:

- **Migration 009**: Can be rolled back by dropping the new columns and tables (not recommended if data exists)
- **Migration 010**: Can be rolled back by dropping the `is_default` column (data will be lost)
- **Migration 011**: Can be rolled back by dropping the new tables and columns (not recommended)

## Troubleshooting

If you encounter errors:

1. **"column already exists"**: The migration has already been applied. This is safe to ignore.
2. **"table already exists"**: The migration has already been applied. This is safe to ignore.
3. **"function already exists"**: The migration has already been applied. This is safe to ignore.

All migrations use `IF NOT EXISTS` and `CREATE OR REPLACE`, so they're idempotent (safe to run multiple times).
