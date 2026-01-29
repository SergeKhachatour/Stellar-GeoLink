# Rate Limit Cleanup Implementation

## Summary

Implemented automatic re-evaluation of expired rate limits to ensure that rules marked as `rate_limit_exceeded` are properly updated when the rate limit window expires.

## Implementation Details

### 1. New Function: `reEvaluateExpiredRateLimits()`

**Location**: `backend/services/backgroundAIService.js`

**Purpose**: 
- Finds all rules with `reason='rate_limit_exceeded'` in `execution_results`
- Checks if the rate limit window has expired
- Updates the reason to `requires_webauthn` if the rule requires WebAuthn and the window has expired
- Preserves metadata about the re-evaluation

**Key Features**:
- ✅ Checks current rate limit status against `rule_execution_history`
- ✅ Only updates rules where the rate limit window has expired
- ✅ Preserves original reason in `previous_reason` field
- ✅ Adds `rate_limit_expired: true` and `rate_limit_re_evaluated_at` timestamp
- ✅ Comprehensive logging of all re-evaluations

### 2. Integration with Periodic Cleanup

**Location**: `backend/services/backgroundAIService.js` - `runPeriodicCleanup()`

**Behavior**:
- Runs automatically every 10 minutes as part of the periodic cleanup
- Re-evaluates expired rate limits before other cleanup operations
- Ensures stale `rate_limit_exceeded` entries are kept up-to-date

### 3. Manual Cleanup Endpoint Enhancement

**Location**: `backend/routes/contracts.js` - `/api/contracts/rules/pending/cleanup`

**Enhancement**:
- Now includes rate limit re-evaluation as part of the cleanup process
- Returns statistics about re-evaluated rules in the response
- Can be triggered manually via API call

**Response Format**:
```json
{
  "success": true,
  "message": "Queue cleanup completed",
  "stats": {
    "markedSkipped": 0,
    "deletedEntries": 0,
    "rateLimitSkipped": 0,
    "supersededSkipped": 0,
    "rateLimitReEvaluated": 3,
    "rateLimitUpdatedToWebAuthn": 3,
    "rateLimitStillBlocked": 0
  },
  "rateLimitReEvaluation": {
    "reEvaluated": 3,
    "updatedToWebAuthn": 3,
    "stillBlocked": 0
  }
}
```

### 4. Test Script

**Location**: `backend/scripts/test-rate-limit-cleanup.js`

**Purpose**: 
- Tests the rate limit cleanup functionality
- Shows before/after state of rules with `rate_limit_exceeded` reason
- Verifies that expired rate limits are properly re-evaluated

## Test Results

### Before Cleanup:
- **3 rules** with `rate_limit_exceeded` reason
- All 3 had expired rate limit windows (0/1 executions, no recent executions)
- All 3 required WebAuthn

### After Cleanup:
- **0 rules** still with `rate_limit_exceeded` reason
- **3 rules** updated to `requires_webauthn` reason
- All rules now appear in the pending rules API (since they have `requires_webauthn` reason)

### Cleanup Stats:
```json
{
  "reEvaluated": 3,
  "updatedToWebAuthn": 3,
  "stillBlocked": 0
}
```

## How It Works

1. **Find Expired Rate Limits**:
   - Queries `location_update_queue` for entries with `reason='rate_limit_exceeded'`
   - Filters to only rules with active rate limiting configuration

2. **Check Current Status**:
   - Queries `rule_execution_history` for current execution count within the time window
   - Compares against `max_executions_per_public_key`

3. **Re-evaluate**:
   - If rate limit window has expired (current count < max):
     - Updates `execution_results` to change reason
     - If rule requires WebAuthn: changes to `requires_webauthn`
     - Adds metadata: `previous_reason`, `rate_limit_expired`, `rate_limit_re_evaluated_at`
   - If still blocked: logs and leaves unchanged

4. **Update Database**:
   - Updates `location_update_queue.execution_results` with new reason
   - Rules with `requires_webauthn` now appear in pending rules API

## Benefits

1. **Automatic Cleanup**: Expired rate limits are automatically re-evaluated every 10 minutes
2. **API Visibility**: Rules that were blocked by rate limits but have expired now appear in pending rules API
3. **Data Accuracy**: `execution_results` accurately reflects current state, not stale data
4. **Manual Trigger**: Can be triggered manually via cleanup endpoint for immediate re-evaluation
5. **Comprehensive Logging**: All re-evaluations are logged for debugging and monitoring

## Usage

### Automatic (Every 10 Minutes)
The cleanup runs automatically as part of the background service's periodic cleanup.

### Manual Trigger
```bash
POST /api/contracts/rules/pending/cleanup
Authorization: Bearer <token>
```

### Test Script
```bash
cd backend
node scripts/test-rate-limit-cleanup.js
```

## Future Enhancements

1. **Re-evaluation for Other Reasons**: Could extend to re-evaluate other expired conditions (e.g., location duration)
2. **Immediate Re-evaluation**: Could trigger re-evaluation immediately when rate limit window expires
3. **Notification**: Could notify users when rate-limited rules become available again

## Conclusion

The rate limit cleanup implementation successfully addresses the issue of stale `rate_limit_exceeded` entries. Rules are now automatically re-evaluated when their rate limit windows expire, ensuring accurate data and proper visibility in the pending rules API.
