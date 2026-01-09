-- Migration: Fix wallet_location_history table structure
-- Ensures wallet_location_id column exists for the trigger function

-- Check if wallet_location_history table exists, if not create it
CREATE TABLE IF NOT EXISTS wallet_location_history (
    id SERIAL PRIMARY KEY,
    wallet_location_id INTEGER,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    location GEOGRAPHY(POINT, 4326),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add wallet_location_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wallet_location_history' 
        AND column_name = 'wallet_location_id'
    ) THEN
        ALTER TABLE wallet_location_history 
        ADD COLUMN wallet_location_id INTEGER;
        
        RAISE NOTICE 'Added wallet_location_id column to wallet_location_history';
    ELSE
        RAISE NOTICE 'wallet_location_id column already exists in wallet_location_history';
    END IF;
END $$;

-- Create index on wallet_location_id for better query performance
CREATE INDEX IF NOT EXISTS idx_wallet_location_history_wallet_location_id 
ON wallet_location_history(wallet_location_id);

-- Create index on recorded_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_wallet_location_history_recorded_at 
ON wallet_location_history(recorded_at DESC);

-- Create spatial index on location if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wallet_location_history' 
        AND column_name = 'location'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_wallet_location_history_location 
        ON wallet_location_history USING GIST (location);
    END IF;
END $$;
