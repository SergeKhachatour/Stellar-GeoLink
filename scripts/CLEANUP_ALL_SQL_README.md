# Cleanup All Executions - SQL Script

This SQL script completely cleans up all execution data from the `location_update_queue` table. Use this when you want to start fresh with testing.

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

### Step 1: Open the Script

Open `scripts/cleanup-all-executions.sql` in:
- **pgAdmin** (recommended for GUI)
- **psql** (command line)
- **Azure Data Studio**
- Any PostgreSQL client

### Step 2: Connect to Your Database

Connect to your database (local or Azure).

### Step 3: Review Current State

The script starts with a `SELECT` query that shows you the current state:
- Total entries
- Entries with execution_results
- Entries without execution_results
- Status breakdown (matched, executed, pending, processing)

**Review this output before proceeding!**

### Step 4: Uncomment and Execute

1. **Uncomment STEP 2** (removes execution_results):
   ```sql
   UPDATE location_update_queue
   SET execution_results = NULL,
       status = 'matched',
       processed_at = NULL
   WHERE execution_results IS NOT NULL;
   ```

2. **Uncomment STEP 3** (deletes all entries):
   ```sql
   DELETE FROM location_update_queue;
   ```

3. **Execute the script** (F5 in pgAdmin, or run in psql)

4. **Review STEP 4** to verify deletion (should show 0 entries)

### Step 5: Commit or Rollback

- **If satisfied**: Uncomment `COMMIT;` and execute
- **If something looks wrong**: Uncomment `ROLLBACK;` and execute

## Example Workflow

```sql
-- 1. First, run STEP 1 to see current state
SELECT COUNT(*) FROM location_update_queue;
-- Result: 150 entries

-- 2. Uncomment and run STEP 2
UPDATE location_update_queue SET execution_results = NULL ...;
-- Result: 120 rows updated

-- 3. Uncomment and run STEP 3
DELETE FROM location_update_queue;
-- Result: 150 rows deleted

-- 4. Verify with STEP 4
SELECT COUNT(*) FROM location_update_queue;
-- Result: 0 entries

-- 5. Commit
COMMIT;
```

## Safety Features

- ✅ Uses a transaction (all changes can be rolled back)
- ✅ Shows current state before making changes
- ✅ Requires explicit uncommenting of destructive operations
- ✅ Includes verification step

## Notes

- The script is **idempotent** (safe to run multiple times)
- All changes are in a transaction, so you can review before committing
- After running this script, you'll have a clean slate for testing

## Alternative: Quick Cleanup

If you want to do it all at once without reviewing:

```sql
BEGIN;
DELETE FROM location_update_queue;
COMMIT;
```

This will delete everything immediately (no review steps).
