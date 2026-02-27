# Testing Guide for Anchor Events

## Prerequisites

1. ✅ Database migrations run:
   - `create_anchor_events_returned.sql`
   - `create_checkpoint_tracking.sql` (for checkpoint events)

2. ✅ Environment variables (optional):
   - `CHECKPOINT_INTERVAL_SECONDS` - Default: 300 (5 minutes)

## Test Scenarios

### 1. Test Empty Anchor Events (No Events)

**Request:**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2304879,
    "longitude": -118.2321767
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "cell_id": "34.230000_-118.232000",
  "matched_rules": [],
  "anchor_events": [],
  "next_suggested_anchor_after_secs": null,
  "success": true,
  "message": "Location updated successfully",
  "data": { ... }
}
```

**Verification:**
- ✅ `anchor_events` is an empty array
- ✅ `cell_id` is present and correctly formatted
- ✅ Backward compatibility fields (`success`, `message`, `data`) are present

---

### 2. Test Cell Transition Event

**Step 1: First location update**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2304879,
    "longitude": -118.2321767
  }'
```

**Step 2: Update to a different cell (move >100m)**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2314879,  # Different cell (~111m north)
    "longitude": -118.2321767
  }'
```

**Expected Response (Step 2):**
```json
{
  "ok": true,
  "cell_id": "34.231000_-118.232000",
  "matched_rules": [],
  "anchor_events": [
    {
      "event_id": "a1b2c3d4e5f6...",
      "event_type": "CELL_TRANSITION",
      "occurred_at": "2024-01-15T10:30:00Z",
      "cell_id": "34.231000_-118.232000",
      "prev_cell_id": "34.230000_-118.232000",
      "commitment": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "zk_proof": null
    }
  ],
  "next_suggested_anchor_after_secs": null,
  ...
}
```

**Verification:**
- ✅ `anchor_events` contains exactly one CELL_TRANSITION event
- ✅ `prev_cell_id` matches the previous cell
- ✅ `cell_id` matches the new cell
- ✅ `event_id` is a valid SHA-256 hash (64 hex characters)

---

### 3. Test Rule Triggered Event

**Prerequisites:**
- Create a location-based rule that matches the test location

**Request:**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2304879,
    "longitude": -118.2321767
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "cell_id": "34.230000_-118.232000",
  "matched_rules": [
    {
      "rule_id": "123",
      "rule_name": "Entered restricted zone",
      "rule_type": "location"
    }
  ],
  "anchor_events": [
    {
      "event_id": "f6e5d4c3b2a1...",
      "event_type": "RULE_TRIGGERED",
      "occurred_at": "2024-01-15T10:30:00Z",
      "cell_id": "34.230000_-118.232000",
      "rule_id": "123",
      "commitment": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "zk_proof": null
    }
  ],
  ...
}
```

**Verification:**
- ✅ `matched_rules` contains the matched rule
- ✅ `anchor_events` contains a RULE_TRIGGERED event
- ✅ `rule_id` in event matches the rule ID
- ✅ Event ID is deterministic (same rule + location + time = same event_id)

---

### 4. Test Deduplication (Same Event Not Returned Twice)

**Step 1: First update (generates event)**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2304879,
    "longitude": -118.2321767
  }'
```

**Step 2: Same location update within 1 hour**
```bash
# Same request as Step 1
```

**Expected Response (Step 2):**
```json
{
  "ok": true,
  "cell_id": "34.230000_-118.232000",
  "matched_rules": [...],
  "anchor_events": [],  # Empty - event was already returned
  ...
}
```

**Verification:**
- ✅ Same event is not returned twice within 1 hour
- ✅ Database table `anchor_events_returned` contains the event_id

**Database Check:**
```sql
SELECT * FROM anchor_events_returned 
WHERE public_key = 'GABC123...' 
ORDER BY returned_at DESC;
```

---

### 5. Test Checkpoint Event

**Prerequisites:**
- No cell transitions or rule triggers for 5+ minutes
- Checkpoint tracking table exists

**Step 1: Initial location update**
```bash
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2304879,
    "longitude": -118.2321767
  }'
```

**Step 2: Wait 5+ minutes, then update same location**
```bash
# Wait 5 minutes (or set CHECKPOINT_INTERVAL_SECONDS to lower value for testing)
# Then send same request
```

**Expected Response (Step 2):**
```json
{
  "ok": true,
  "cell_id": "34.230000_-118.232000",
  "matched_rules": [],
  "anchor_events": [
    {
      "event_id": "c3d4e5f6a1b2...",
      "event_type": "CHECKPOINT",
      "occurred_at": "2024-01-15T10:35:00Z",
      "cell_id": "34.230000_-118.232000",
      "commitment": "0x0000000000000000000000000000000000000000000000000000000000000000000",
      "zk_proof": null
    }
  ],
  "next_suggested_anchor_after_secs": 300,
  ...
}
```

**Verification:**
- ✅ CHECKPOINT event is generated after interval
- ✅ Only generated when no other events occur
- ✅ `next_suggested_anchor_after_secs` provides hint for next checkpoint

**Database Check:**
```sql
SELECT * FROM checkpoint_tracking 
WHERE public_key = 'GABC123...';
```

---

### 6. Test Multiple Events (Cell Transition + Rule Trigger)

**Request:**
```bash
# Update location to trigger both cell transition and rule match
curl -X POST http://localhost:3000/api/location/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "public_key": "GABC123...",
    "blockchain": "Stellar",
    "latitude": 34.2314879,  # New cell
    "longitude": -118.2321767
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "cell_id": "34.231000_-118.232000",
  "matched_rules": [...],
  "anchor_events": [
    {
      "event_type": "CELL_TRANSITION",
      ...
    },
    {
      "event_type": "RULE_TRIGGERED",
      ...
    }
  ],
  ...
}
```

**Verification:**
- ✅ Multiple events can be returned in one response
- ✅ GeoTrust limits to 2 events per tick (handled client-side)

---

## Event ID Determinism Test

**Test that same inputs produce same event_id:**

```javascript
const { generateEventId, roundToNearestMinute } = require('./backend/utils/anchorEvents');

const account = 'GABC123...';
const eventType = 'CELL_TRANSITION';
const occurredAt = '2024-01-15T10:30:45Z';
const occurredAtBucket = roundToNearestMinute(occurredAt); // Rounds to 10:30:00
const cellId = '34.230000_-118.232000';

const eventId1 = generateEventId(account, eventType, occurredAtBucket, cellId);
const eventId2 = generateEventId(account, eventType, occurredAtBucket, cellId);

console.assert(eventId1 === eventId2, 'Event IDs must be deterministic');
```

---

## Database Verification Queries

### Check returned events:
```sql
SELECT 
    public_key,
    event_id,
    returned_at,
    NOW() - returned_at as age
FROM anchor_events_returned
WHERE public_key = 'GABC123...'
ORDER BY returned_at DESC
LIMIT 10;
```

### Check checkpoint tracking:
```sql
SELECT 
    public_key,
    last_checkpoint_at,
    last_checkpoint_cell_id,
    NOW() - last_checkpoint_at as time_since_checkpoint
FROM checkpoint_tracking
WHERE public_key = 'GABC123...';
```

### Check location history:
```sql
SELECT 
    wl.public_key,
    wlh.latitude,
    wlh.longitude,
    wlh.recorded_at
FROM wallet_location_history wlh
JOIN wallet_locations wl ON wlh.wallet_location_id = wl.id
WHERE wl.public_key = 'GABC123...'
ORDER BY wlh.recorded_at DESC
LIMIT 10;
```

---

## Troubleshooting

### Issue: No anchor_events returned
**Possible causes:**
- No cell transition (user in same cell)
- No rules matched
- Checkpoint interval not reached
- Events were already returned (deduplication)

**Solution:** Check database tables and verify location actually changed.

### Issue: Same event returned twice
**Possible causes:**
- `anchor_events_returned` table not created
- Database connection issue
- Time window expired (>1 hour)

**Solution:** Verify table exists and check database logs.

### Issue: Checkpoint not generating
**Possible causes:**
- `checkpoint_tracking` table not created
- Other events occurred (checkpoint only when no other events)
- Interval not reached

**Solution:** Check table exists, verify interval setting, ensure no other events.

---

## Performance Testing

### Load Test (Multiple Updates)
```bash
# Send 100 location updates rapidly
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/location/update \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_API_KEY" \
    -d "{
      \"public_key\": \"GABC123...\",
      \"blockchain\": \"Stellar\",
      \"latitude\": $(echo "34.2304879 + $i * 0.0001" | bc),
      \"longitude\": -118.2321767
    }" &
done
wait
```

**Expected:** All requests succeed, deduplication works correctly.

---

## Integration with GeoTrust

Once tested, GeoTrust will:
1. Receive `anchor_events[]` in location update responses
2. Process events (limit 2 per tick)
3. Use client-side and server-side deduplication
4. Anchor events on-chain using contract idempotency

**No changes needed in GeoTrust** - it automatically processes `anchor_events` when present.
