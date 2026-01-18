# Cleanup All Executions Script

This script completely cleans up all execution data from the `location_update_queue` table. Use this when you want to start fresh with testing.

## What It Does

1. **Removes all execution_results** from all `location_update_queue` entries
2. **Deletes all location_update_queue entries** (empties the table)
3. **Resets all statuses** to 'matched'

This will remove:
- ✅ All pending rules
- ✅ All completed rules
- ✅ All rejected rules
- ✅ All execution history

## Usage

### Dry Run (Recommended First)

See what would be deleted without actually deleting anything:

```bash
node scripts/cleanup-all-executions.js --dry-run
```

### Actual Cleanup

**⚠️ WARNING: This will permanently delete all execution data!**

```bash
node scripts/cleanup-all-executions.js
```

## Prerequisites

- Node.js installed
- Your `backend/.env` file configured with PostgreSQL database credentials:
  - `DB_USER`
  - `DB_HOST`
  - `DB_NAME`
  - `DB_PASSWORD`
  - `DB_PORT`

## Example Output

```
🧹 Starting complete cleanup of all execution data...

📊 Current State:
   Total entries: 150
   Entries with execution_results: 120
   Entries without execution_results: 30
   Status - Matched: 50, Executed: 80, Pending: 20, Processing: 0

🗑️  Step 1: Removing all execution_results...
   ✅ Removed execution_results from 120 entries

🗑️  Step 2: Deleting all location_update_queue entries...
   ✅ Deleted 150 location_update_queue entries

📊 Final State:
   Total entries: 0

✅ Cleanup completed successfully!
   All execution data, pending rules, completed rules, and rejected rules have been removed.
   The location_update_queue table is now empty and ready for fresh testing.

✨ Done!
```

## Notes

- This script uses a database transaction, so if something goes wrong, all changes will be rolled back
- The script will show you the current state before and after cleanup
- After running this script, you'll have a clean slate for testing
