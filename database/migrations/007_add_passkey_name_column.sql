-- Migration: Add name column to user_passkeys table
-- Allows users to give custom names to their passkeys

-- Add name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_passkeys' 
        AND column_name = 'name'
    ) THEN
        ALTER TABLE user_passkeys 
        ADD COLUMN name VARCHAR(255);
        
        RAISE NOTICE 'Added name column to user_passkeys table';
    ELSE
        RAISE NOTICE 'name column already exists in user_passkeys table';
    END IF;
END $$;

-- Set default names for existing passkeys using a subquery
-- This approach works around PostgreSQL's limitation with window functions in UPDATE
UPDATE user_passkeys up
SET name = 'Passkey ' || sub.row_num
FROM (
    SELECT 
        credential_id,
        user_id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY registered_at) as row_num
    FROM user_passkeys
    WHERE name IS NULL
) sub
WHERE up.credential_id = sub.credential_id 
  AND up.user_id = sub.user_id
  AND up.name IS NULL;

-- Create index on name for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_user_passkeys_name 
ON user_passkeys(name);
