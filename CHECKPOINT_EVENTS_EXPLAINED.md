# Checkpoint Events Explained

## Overview

Checkpoint events provide **periodic on-chain anchoring** of location data even when no cell transitions or rule triggers occur. This ensures regular blockchain anchoring for location tracking and compliance.

## How Checkpoint Events Work

### 1. **Purpose**
- **Regular Anchoring**: Ensures location is anchored on-chain periodically (e.g., every 5 minutes)
- **Compliance**: Provides audit trail even when user is stationary
- **Data Integrity**: Maintains continuous location history on-chain

### 2. **When Checkpoints Are Generated**

Checkpoints are generated when **ALL** of these conditions are met:

1. ✅ **Enough time has passed** since last checkpoint (default: 5 minutes / 300 seconds)
2. ✅ **No other events occurred** in this update (no cell transition, no rule trigger)
3. ✅ **User has a location** (at least one previous location update)

### 3. **When Checkpoints Are NOT Generated**

Checkpoints are **suppressed** when:
- ❌ User just crossed a cell boundary (CELL_TRANSITION event takes priority)
- ❌ A rule was triggered (RULE_TRIGGERED event takes priority)
- ❌ Less than 5 minutes since last checkpoint
- ❌ User is actively moving/triggering rules (checkpoint timer resets)

### 4. **Checkpoint Timer Reset**

When other events occur (cell transition or rule trigger), the checkpoint timer **resets**:
- This prevents checkpoint spam when user is actively moving
- Ensures checkpoints only occur during "quiet" periods
- Maintains focus on meaningful events (transitions, triggers)

## Example Scenarios

### Scenario 1: Stationary User (Checkpoint Generated)

```
Time 10:00:00 - User updates location
  → No events (first update, no rules)
  → anchor_events: []

Time 10:05:00 - User updates same location (5 minutes later)
  → No cell transition (same cell)
  → No rules triggered
  → 5 minutes since last update
  → anchor_events: [CHECKPOINT event] ✅

Time 10:10:00 - User updates same location (5 minutes later)
  → anchor_events: [CHECKPOINT event] ✅
```

### Scenario 2: Active User (No Checkpoints)

```
Time 10:00:00 - User updates location
  → anchor_events: []

Time 10:01:00 - User moves to new cell
  → anchor_events: [CELL_TRANSITION event] ✅
  → Checkpoint timer RESETS

Time 10:02:00 - User moves to another cell
  → anchor_events: [CELL_TRANSITION event] ✅
  → Checkpoint timer RESETS

Time 10:03:00 - User triggers a rule
  → anchor_events: [RULE_TRIGGERED event] ✅
  → Checkpoint timer RESETS
```

### Scenario 3: Mixed Activity (Checkpoint After Quiet Period)

```
Time 10:00:00 - User moves to new cell
  → anchor_events: [CELL_TRANSITION]
  → Checkpoint timer RESETS

Time 10:01:00 - User stays in same cell
  → anchor_events: []
  → Checkpoint timer: 1 minute elapsed

Time 10:05:00 - User still in same cell (5 minutes since last event)
  → anchor_events: [CHECKPOINT event] ✅
  → Checkpoint timer RESETS

Time 10:10:00 - User still in same cell (5 minutes since last checkpoint)
  → anchor_events: [CHECKPOINT event] ✅
```

## Configuration

### Environment Variable

```bash
# Set checkpoint interval (in seconds)
CHECKPOINT_INTERVAL_SECONDS=300  # Default: 5 minutes

# For testing (1 minute intervals)
CHECKPOINT_INTERVAL_SECONDS=60
```

### Database Table

The `checkpoint_tracking` table stores:
- `public_key` + `blockchain` (unique per wallet)
- `last_checkpoint_at` - When last checkpoint was generated
- `last_checkpoint_cell_id` - Cell where checkpoint was generated

## Checkpoint Event Format

```json
{
  "event_id": "sha256_hash...",
  "event_type": "CHECKPOINT",
  "occurred_at": "2024-01-15T10:30:00Z",
  "cell_id": "34.230000_-118.232000",
  "commitment": "0x0000000000000000000000000000000000000000000000000000000000000000000",
  "zk_proof": null
}
```

**Note**: CHECKPOINT events do NOT have:
- `prev_cell_id` (not a transition)
- `rule_id` (not a rule trigger)

## Response Field: `next_suggested_anchor_after_secs`

The API response includes a hint for when the next checkpoint might be generated:

```json
{
  "ok": true,
  "cell_id": "...",
  "matched_rules": [],
  "anchor_events": [],
  "next_suggested_anchor_after_secs": 240  // 4 minutes remaining
}
```

**Calculation:**
- Only provided when no events were generated
- Shows seconds remaining until next checkpoint
- Helps clients optimize polling/update frequency

## Implementation Details

### 1. Checkpoint Tracking

```sql
-- Table stores last checkpoint time per wallet
CREATE TABLE checkpoint_tracking (
    public_key VARCHAR(255),
    blockchain VARCHAR(50),
    last_checkpoint_at TIMESTAMP,
    last_checkpoint_cell_id VARCHAR(100),
    UNIQUE(public_key, blockchain)
);
```

### 2. Checkpoint Generation Logic

```javascript
// Pseudo-code
if (timeSinceLastCheckpoint >= CHECKPOINT_INTERVAL_SECONDS 
    && anchorEvents.length === 0) {
    // Generate checkpoint
    checkpointEvent = createCheckpointEvent(...);
    anchorEvents.push(checkpointEvent);
    // Update checkpoint_tracking
}
```

### 3. Timer Reset Logic

```javascript
// When other events occur, reset checkpoint timer
if (anchorEvents.length > 0) {
    // Update checkpoint_tracking with current time
    // This resets the timer
}
```

## Benefits

1. **Regular Anchoring**: Ensures location is anchored periodically
2. **Compliance**: Provides audit trail for stationary users
3. **Efficiency**: Only generates when no other events occur
4. **Flexibility**: Configurable interval via environment variable
5. **Smart Timing**: Resets when user is active (prevents spam)

## Use Cases

### Use Case 1: Compliance Tracking
- **Requirement**: Anchor location every 5 minutes for audit trail
- **Solution**: Checkpoint events provide regular anchoring
- **Result**: Continuous on-chain location history

### Use Case 2: Stationary Monitoring
- **Requirement**: Track location of stationary assets
- **Solution**: Checkpoints anchor location even when no movement
- **Result**: Regular updates without cell transitions

### Use Case 3: Quiet Period Anchoring
- **Requirement**: Anchor location during inactive periods
- **Solution**: Checkpoints only when no other events occur
- **Result**: Efficient anchoring without spam

## Testing

See `TEST_ANCHOR_EVENTS.md` for detailed testing scenarios, including:
- Test 5: Checkpoint Event Generation
- Database verification queries
- Troubleshooting guide

## Migration

Run the checkpoint tracking migration:

```bash
psql -h localhost -U postgres -d GeoLink -f database/migrations/create_checkpoint_tracking.sql
```

## Future Enhancements

1. **Configurable per-user intervals**: Different checkpoint intervals per wallet
2. **Adaptive intervals**: Adjust based on user activity patterns
3. **Checkpoint batching**: Group multiple checkpoints for efficiency
4. **Smart scheduling**: Coordinate with other events for optimal timing
