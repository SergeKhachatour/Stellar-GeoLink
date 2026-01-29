# Test Pending Rules Script

This script validates pending rules by comparing database state with API responses.

## Usage

```bash
cd backend
node scripts/test-pending-rules.js
```

## What it does

1. **Fetches all active execution rules** with advanced settings:
   - Auto-execute
   - Requires confirmation
   - Requires WebAuthn
   - Rate limiting (max executions per time window)
   - Minimum location duration
   - Submit read-only to ledger
   - Target wallet filtering
   - Rule type and location settings

2. **Fetches location_update_queue entries** with execution results

3. **Analyzes execution results** to identify:
   - Skipped rules (should appear as pending)
   - Completed rules
   - Error rules

4. **Checks rule_location_tracking** table for duration tracking

5. **Checks rule_execution_history** table for rate limiting

6. **Validates pending rules** by comparing database state with what should appear in the API

## Environment Variables

The script uses the same database configuration as the backend:
- `DB_HOST` (default: localhost)
- `DB_PORT` (default: 5432)
- `DB_NAME` (default: GeoLink)
- `DB_USER` (default: postgres)
- `DB_PASSWORD` (required)
- `DB_SSL` (default: false)

## Output

The script provides detailed output showing:
- All active rules with their advanced settings
- Location updates with execution results
- Which rules are skipped and why
- Rate limit status for each rule
- Location duration tracking status
- Summary statistics

## Next Steps

After running this script, compare the output with:
1. The pending rules API response (`/api/contracts/rules/pending`)
2. Backend logs from `backgroundAIService.js`
3. The Execution Rules tab in the wallet provider dashboard

This will help identify any discrepancies between database state and API responses.
