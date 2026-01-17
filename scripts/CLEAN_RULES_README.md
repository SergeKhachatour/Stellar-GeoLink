# Clean Completed and Rejected Rules Scripts

These scripts help you clean out completed and rejected rules from the `location_update_queue` table to start fresh with testing.

## Files

- `clean-completed-rejected-rules.sql` - SQL script (can be run directly in PostgreSQL)
- `clean-completed-rejected-rules.js` - Node.js script (easier to use, includes dry-run mode)

## Usage

### Option 1: Node.js Script (Recommended)

```bash
# Dry run (see what would be cleaned without making changes)
node scripts/clean-completed-rejected-rules.js --dry-run

# Normal mode (removes only completed/rejected entries)
node scripts/clean-completed-rejected-rules.js

# Aggressive mode (removes ALL execution_results)
node scripts/clean-completed-rejected-rules.js --aggressive

# Combine options
node scripts/clean-completed-rejected-rules.js --dry-run --aggressive
```

### Option 2: SQL Script

```bash
# Run directly with psql
psql -h <host> -U <user> -d <database> -f scripts/clean-completed-rejected-rules.sql

# Or copy and paste into your PostgreSQL client
```

## What Each Mode Does

### Normal Mode (Default)
- Removes only entries marked as `completed: true` or `rejected: true` from `execution_results` arrays
- Keeps pending/skipped entries intact
- Resets status from `executed` to `matched` if there are still pending rules
- Sets `execution_results` to NULL if the array becomes empty

### Aggressive Mode
- Removes **ALL** `execution_results` from all entries
- Resets all `executed` status to `matched`
- Complete clean slate for testing

### Dry Run Mode
- Shows what would be cleaned without making any changes
- Safe to run anytime to see the impact

## What Gets Cleaned

1. **Completed rules**: All execution results with `completed: true`
2. **Rejected rules**: All execution results with `rejected: true`
3. **Status updates**: Entries with status `executed` are reset to `matched` if appropriate
4. **Empty arrays**: `execution_results` arrays that become empty are set to NULL

## What Stays Intact

- Location update entries themselves (latitude, longitude, timestamps, etc.)
- Pending/skipped rules (not yet completed or rejected)
- Contract execution rules configuration
- User data and other tables

## Safety Features

- The SQL script uses transactions (BEGIN/COMMIT) - you can ROLLBACK if needed
- The Node.js script shows before/after statistics
- Dry-run mode lets you preview changes
- Only affects `location_update_queue.execution_results`, not other data

## Example Output

```
📊 Initial State:
   Total entries: 150
   Entries with execution_results: 120
   Entries without execution_results: 30
   Status - Matched: 80, Executed: 40, Pending: 30

📋 Found 85 completed/rejected rule entries

🧹 NORMAL MODE: Removing only completed/rejected entries

✅ Step 1: Removed completed/rejected entries from 45 location_update_queue entries
✅ Step 2: Set 12 empty arrays to NULL
✅ Step 3: Reset status to 'matched' for 20 entries
✅ Step 4: Reset status for 12 entries with no execution_results

📊 Final State:
   Total entries: 150
   Entries with execution_results: 35
   Entries without execution_results: 115
   Status - Matched: 100, Executed: 20, Pending: 30

✅ Cleanup completed successfully!
```

## Notes

- **Backup first**: Consider backing up your database before running cleanup scripts
- **Testing**: These scripts are designed for development/testing environments
- **Production**: Use with extreme caution in production - consider archiving instead of deleting
