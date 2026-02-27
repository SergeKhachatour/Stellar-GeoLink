# Anchor Events Implementation for GeoLink API

## Overview
This document describes the implementation of event-boundary anchoring support in the GeoLink API. The `/api/location/update` endpoint now returns `anchor_events[]` to support GeoTrust's event-boundary anchoring system, which reduces on-chain writes by >90%.

## Changes Made

### 1. New Utility Module: `backend/utils/anchorEvents.js`
Provides functions for:
- **Cell ID Calculation**: Generates deterministic cell IDs from lat/lng using a geospatial grid
- **Event ID Generation**: Creates deterministic SHA-256 hashed event IDs
- **Event Creation**: Factory functions for creating CELL_TRANSITION, RULE_TRIGGERED, and CHECKPOINT events

### 2. Modified Endpoint: `/api/location/update`
The endpoint now:
- Calculates `cell_id` from the current location
- Detects cell transitions by comparing with previous location
- Gets matched rules synchronously
- Generates anchor events for:
  - **CELL_TRANSITION**: When user crosses a cell boundary
  - **RULE_TRIGGERED**: When a location-based rule is triggered
  - **CHECKPOINT**: (Optional, not yet implemented)
- Tracks returned events to prevent duplicates
- Returns `anchor_events[]` in the response

### 3. Database Migration: `database/migrations/create_anchor_events_returned.sql`
Creates a table to track which events have been returned to prevent duplicates:
- `anchor_events_returned` table with indexes for fast lookups
- Cleanup function for removing old records (>24 hours)

## Response Format

### New Response (Backward Compatible)
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
      "event_id": "a1b2c3d4e5f6...",
      "event_type": "CELL_TRANSITION",
      "occurred_at": "2024-01-15T10:30:00Z",
      "cell_id": "34.230000_-118.232000",
      "prev_cell_id": "34.229000_-118.231000",
      "commitment": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "zk_proof": null
    },
    {
      "event_id": "f6e5d4c3b2a1...",
      "event_type": "RULE_TRIGGERED",
      "occurred_at": "2024-01-15T10:30:00Z",
      "cell_id": "34.230000_-118.232000",
      "rule_id": "123",
      "commitment": "0x...",
      "zk_proof": null
    }
  ],
  "success": true,
  "message": "Location updated successfully",
  "data": { ... }
}
```

### Empty Events (No Anchoring Needed)
```json
{
  "ok": true,
  "cell_id": "34.230000_-118.232000",
  "matched_rules": [],
  "anchor_events": []
}
```

## Event ID Generation

Event IDs are **deterministic** and **unique** per event, ensuring contract idempotency works correctly even if GeoLink restarts.

### Formula
```javascript
eventId = sha256(
  account + 
  event_type + 
  occurred_at_bucket +  // Rounded to nearest minute
  cell_id + 
  (rule_id || '')
);
```

### Example
- Account: `GABC123...`
- Event Type: `CELL_TRANSITION`
- Occurred At Bucket: `2024-01-15T10:30:00Z` (rounded to minute)
- Cell ID: `34.230000_-118.232000`
- Rule ID: `` (empty for CELL_TRANSITION)

## Cell ID Calculation

Cell IDs are generated using a geospatial grid system:
- **Precision**: 0.001 degrees (~100 meters)
- **Format**: `{lat}_{lon}` (e.g., `34.230000_-118.232000`)
- **Deterministic**: Same lat/lng always produces same cell_id

## Deduplication

The system prevents returning the same event twice using:
1. **Database Tracking**: `anchor_events_returned` table tracks returned events
2. **Time Window**: Events returned within the last hour are excluded
3. **Deterministic IDs**: Contract idempotency provides additional protection

## Database Setup

Run the migration script to create the tracking table:

```bash
psql -h localhost -U postgres -d GeoLink -f database/migrations/create_anchor_events_returned.sql
```

Or via SQL:
```sql
\i database/migrations/create_anchor_events_returned.sql
```

## Event Types

### 1. CELL_TRANSITION
- **When**: User crosses a cell boundary
- **Required Fields**: `event_id`, `event_type`, `occurred_at`, `cell_id`, `prev_cell_id`
- **Frequency**: Once per cell transition

### 2. RULE_TRIGGERED
- **When**: A location-based rule is triggered
- **Required Fields**: `event_id`, `event_type`, `occurred_at`, `cell_id`, `rule_id`
- **Frequency**: Per rule policy (once per rule per location update)

### 3. CHECKPOINT
- **When**: Periodic checkpoint anchor (e.g., every 5 minutes)
- **Required Fields**: `event_id`, `event_type`, `occurred_at`, `cell_id`
- **Status**: Not yet implemented (optional feature)

## Backward Compatibility

The implementation is **fully backward compatible**:
- If `anchor_events` is missing or empty, GeoTrust continues to work
- Legacy response fields (`success`, `message`, `data`) are still included
- Existing clients are not affected

## Testing Checklist

- [x] Empty `anchor_events` array works (no anchoring)
- [x] Single event in array works
- [x] Multiple events in array work
- [x] Event IDs are deterministic and unique
- [x] Same event_id is not returned twice
- [x] Cell transitions generate CELL_TRANSITION events
- [x] Rule triggers generate RULE_TRIGGERED events
- [ ] Checkpoints generate CHECKPOINT events (optional, not implemented)

## Integration Notes

- GeoTrust will process `anchor_events` automatically when present
- If `anchor_events` is missing, GeoTrust continues to work (backward compatible)
- GeoTrust has client-side and server-side deduplication caches
- Contract has idempotency built-in (event_id-based)
- Multiple layers of deduplication ensure no duplicate anchors

## Future Enhancements

1. **Checkpoint Events**: Implement periodic checkpoint anchoring
2. **Commitment Hashing**: Include off-chain evidence in commitment field
3. **ZK Proofs**: Add zero-knowledge proof support if needed
4. **Configurable Grid Precision**: Allow different cell sizes
5. **Event Batching**: Optimize for multiple events per update

## Questions & Answers

### Q: How should `occurred_at_bucket` be calculated?
**A**: Currently rounded to nearest minute for stability. Can be adjusted if needed.

### Q: Should checkpoints be implemented?
**A**: Optional. Can be added later if periodic anchoring is needed.

### Q: Should `commitment` hash include off-chain evidence?
**A**: Currently set to zero hash. Can be enhanced to include evidence if needed.

### Q: Should `zk_proof` be included?
**A**: Currently null. Can be added if zero-knowledge proof system is implemented.

### Q: How should rule triggers be deduplicated?
**A**: Once per rule per location update, tracked in `anchor_events_returned` table with 1-hour window.
