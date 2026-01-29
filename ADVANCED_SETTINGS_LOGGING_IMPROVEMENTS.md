# Advanced Settings Logging Improvements

## Summary

Enhanced logging throughout the backend to capture all scenarios of the advanced settings section in execution rule creation. This ensures complete visibility into how rules are processed, why they're skipped, and what advanced settings are being applied.

## Changes Made

### 1. Enhanced Background AI Service Logging (`backend/services/backgroundAIService.js`)

#### Added Comprehensive Advanced Settings Logging
- **Full Advanced Settings Display**: Logs all advanced settings for each rule being processed:
  - `auto_execute`
  - `requires_confirmation`
  - `requires_webauthn` (both rule-level and contract-level)
  - `max_executions_per_public_key` (rate limiting)
  - `execution_time_window_seconds` (rate limiting window)
  - `min_location_duration_seconds` (time-based triggers)
  - `submit_readonly_to_ledger`
  - `target_wallet_public_key` (wallet filtering)
  - `rule_type`, `center_latitude`, `center_longitude`, `radius_meters`

#### Added Advanced Settings Validation Logging
- **Target Wallet Check**: Logs when a rule is skipped due to target wallet mismatch
- **Auto-Execute Check**: Logs when a rule is skipped because auto-execute is disabled
- **Confirmation Check**: Logs when a rule is skipped because it requires confirmation
- **Rate Limit Check**: Detailed logging showing:
  - Current execution count vs. max allowed
  - Time window
  - Last execution time
  - Whether the check passed or failed
- **Location Duration Check**: Detailed logging showing:
  - Required duration vs. actual duration
  - Whether the wallet is in range
  - When the wallet entered the location
  - Last update time

#### Enhanced Execution Result Logging
- Logs execution results with full advanced settings context
- Shows which advanced settings passed/failed
- Includes summary of all advanced settings in execution result

#### Enhanced Summary Logging
- Comprehensive summary showing:
  - Total rules evaluated
  - Executed count
  - Pending (WebAuthn) count
  - Blocked by rate limit count
  - Blocked by duration count
  - Blocked by target wallet count
  - Blocked by auto-execute count
  - Blocked by confirmation count
  - Error count
  - Full execution results breakdown

### 2. Enhanced Pending Rules API Logging (`backend/routes/contracts.js`)

#### Added Processing Logging
- Logs when processing database rows to extract pending rules
- Logs each pending rule being added with full details:
  - Rule ID and name
  - Update ID
  - Public keys (both queue and matched)
  - Reason for being pending
  - Location coordinates
  - WebAuthn requirement
  - System-generated parameters

#### Added Summary Logging
- Summary showing:
  - Total pending rules
  - Breakdown by reason (requires_webauthn, rate_limit_exceeded, etc.)
  - Unique rules count
  - Unique public keys count

### 3. Test Script (`backend/scripts/test-pending-rules.js`)

Created a comprehensive test script that:
- Connects to the local database
- Fetches all active execution rules with advanced settings
- Fetches location_update_queue entries with execution results
- Analyzes execution results to identify skipped/completed/error rules
- Checks rate limiting status for each rule
- Checks location duration tracking for each rule
- Provides detailed output for comparison with API responses

## Advanced Settings Captured

The logging now captures all advanced settings scenarios:

1. **Auto-Execute** (`auto_execute`)
   - ✅ Enabled: Rule can execute automatically
   - ⚠️ Disabled: Rule requires manual execution

2. **Requires Confirmation** (`requires_confirmation`)
   - ✅ False: Rule can execute automatically
   - ⚠️ True: Rule requires user confirmation

3. **Requires WebAuthn** (`requires_webauthn`)
   - ✅ False: Rule can execute without WebAuthn
   - ⚠️ True: Rule requires WebAuthn (added to pending)

4. **Rate Limiting** (`max_executions_per_public_key`, `execution_time_window_seconds`)
   - ✅ Within limit: Rule can execute
   - ⚠️ Exceeded: Rule blocked, added to pending with reason

5. **Minimum Location Duration** (`min_location_duration_seconds`)
   - ✅ Duration met: Rule can execute
   - ⚠️ Duration not met: Rule blocked, added to pending with reason

6. **Submit Read-Only to Ledger** (`submit_readonly_to_ledger`)
   - ✅ Enabled: Read-only functions submitted to ledger
   - ℹ️ Disabled: Read-only functions simulated

7. **Target Wallet** (`target_wallet_public_key`)
   - ✅ NULL (any wallet): Rule applies to all wallets
   - ✅ Matches: Rule applies to this wallet
   - ⚠️ Mismatch: Rule blocked, doesn't apply to this wallet

## How to Use

### 1. Run the Test Script

```bash
cd backend
node scripts/test-pending-rules.js
```

This will show you:
- All active rules with their advanced settings
- Location updates with execution results
- Which rules are pending and why
- Rate limit and duration tracking status

### 2. Monitor Backend Logs

When location updates are processed, you'll now see detailed logs showing:
- Which rules are being evaluated
- All advanced settings for each rule
- Why each rule passes or fails each check
- Summary of what was processed

### 3. Compare with API Response

Compare the test script output with:
- `/api/contracts/rules/pending` API response
- Execution Rules tab in the wallet provider dashboard
- Backend logs from `backgroundAIService.js`

## Example Log Output

```
[BackgroundAI] 🔄 Processing Rule 7 (Test) - function: test
[BackgroundAI] ⚙️ Advanced Settings for Rule 7: {
  rule_id: 7,
  rule_name: 'Test',
  auto_execute: true,
  requires_confirmation: false,
  requires_webauthn: false,
  max_executions_per_public_key: 1,
  execution_time_window_seconds: 120,
  min_location_duration_seconds: null,
  submit_readonly_to_ledger: false,
  target_wallet_public_key: null,
  ...
}
[BackgroundAI] ✅ Target wallet check passed for rule 7: wallet matches target
[BackgroundAI] ✅ Auto-execute check passed for rule 7: auto_execute=true
[BackgroundAI] ✅ Confirmation check passed for rule 7: requires_confirmation=false
[BackgroundAI] ⏱️ Rate limit check for rule 7: {
  current_executions_in_window: 0,
  max_executions: 1,
  can_execute: true
}
[BackgroundAI] ✅ Rate limit check passed for rule 7: 0/1 executions in 120s window
[BackgroundAI] 📊 Location update 4282 processing summary: {
  total_rules_evaluated: 1,
  executed: 1,
  pending_webauthn: 0,
  blocked_by_rate_limit: 0,
  ...
}
```

## Next Steps

1. Run the test script to see current database state
2. Launch XYZ-Wallet locally to generate location updates
3. Monitor backend logs to see detailed processing
4. Compare test script output with API responses
5. Verify all advanced settings scenarios are being captured correctly
