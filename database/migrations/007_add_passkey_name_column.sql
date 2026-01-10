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
        
        -- Set default names for existing passkeys
        UPDATE user_passkeys 
        SET name = 'Passkey ' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY registered_at)
        WHERE name IS NULL;
        
        RAISE NOTICE 'Added name column to user_passkeys table';
    ELSE
        RAISE NOTICE 'name column already exists in user_passkeys table';
    END IF;
END $$;

-- Create index on name for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_user_passkeys_name 
ON user_passkeys(name);
