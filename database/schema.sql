-- First check if the types exist before creating
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'sdf_employee', 'wallet_provider', 'data_consumer');
    END IF;
END $$;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role NOT NULL,
    organization VARCHAR(255),
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    rate_limit INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS data_consumers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wallet_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- 'wallet', 'RWA', 'IoT'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Run these commands in order:

-- 1. Add unique constraint to wallet_types name
ALTER TABLE wallet_types ADD CONSTRAINT wallet_types_name_unique UNIQUE (name);

-- 2. Now create the user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remember_me BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create the index
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);

INSERT INTO wallet_types (name, description) 
VALUES 
    ('wallet', 'Standard cryptocurrency wallet'),
    ('RWA', 'Real World Asset location tracker'),
    ('IoT', 'Internet of Things device wallet')
ON CONFLICT (name) DO NOTHING;

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS wallet_locations (
    id SERIAL PRIMARY KEY,
    public_key VARCHAR(255) NOT NULL,
    blockchain VARCHAR(50) NOT NULL, -- 'Stellar', 'Circle', etc.
    wallet_type_id INTEGER REFERENCES wallet_types(id),
    description TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location GEOGRAPHY(POINT, 4326), -- PostGIS geospatial type
    location_enabled BOOLEAN DEFAULT true,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tracking_status VARCHAR(20) 
        CHECK (tracking_status IN ('active', 'paused', 'disabled')) DEFAULT 'active'
);

-- Create spatial index for faster geospatial queries
CREATE INDEX IF NOT EXISTS idx_wallet_locations_location ON wallet_locations USING GIST(location);

-- Create a trigger to automatically update the location POINT when lat/long change
CREATE OR REPLACE FUNCTION update_location_point()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wallet_location_point ON wallet_locations;
CREATE TRIGGER update_wallet_location_point
    BEFORE INSERT OR UPDATE OF latitude, longitude
    ON wallet_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_location_point();

CREATE TABLE IF NOT EXISTS api_key_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    request_type VARCHAR(50) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_key_usage (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER NOT NULL, -- in milliseconds
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    data_consumer_id INTEGER REFERENCES data_consumers(id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_wallet_locations_public_key ON wallet_locations(public_key);
CREATE INDEX IF NOT EXISTS idx_wallet_providers_api_key ON wallet_providers(api_key);
CREATE INDEX IF NOT EXISTS idx_data_consumers_api_key ON data_consumers(api_key);
CREATE INDEX IF NOT EXISTS idx_wallet_locations_blockchain ON wallet_locations(blockchain);
CREATE INDEX IF NOT EXISTS idx_wallet_locations_wallet_type ON wallet_locations(wallet_type_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_api_key ON api_key_usage(api_key);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created_at ON api_key_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_provider ON api_key_usage(wallet_provider_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_consumer ON api_key_usage(data_consumer_id);

-- Historical location tracking
CREATE TABLE IF NOT EXISTS wallet_location_history (
    id SERIAL PRIMARY KEY,
    wallet_location_id INTEGER REFERENCES wallet_locations(id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location GEOGRAPHY(POINT, 4326),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for location history
CREATE OR REPLACE FUNCTION log_location_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.latitude != NEW.latitude OR OLD.longitude != NEW.longitude) THEN
        INSERT INTO wallet_location_history 
            (wallet_location_id, latitude, longitude, location)
        VALUES 
            (NEW.id, NEW.latitude, NEW.longitude, NEW.location);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_location_changes
    AFTER UPDATE ON wallet_locations
    FOR EACH ROW
    EXECUTE FUNCTION log_location_change();

-- Webhook configurations
CREATE TABLE IF NOT EXISTS webhook_configurations (
    id SERIAL PRIMARY KEY,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Geofencing support
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    name VARCHAR(255),
    boundary GEOGRAPHY(POLYGON, 4326),
    notification_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_location_history_wallet_id ON wallet_location_history(wallet_location_id);
CREATE INDEX IF NOT EXISTS idx_geofences_provider ON geofences(wallet_provider_id);
CREATE INDEX IF NOT EXISTS idx_geofences_boundary ON geofences USING GIST(boundary);

-- Add simple notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    email_notifications BOOLEAN DEFAULT true,
    webhook_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add basic location history
CREATE TABLE IF NOT EXISTS location_events (
    id SERIAL PRIMARY KEY,
    wallet_location_id INTEGER REFERENCES wallet_locations(id),
    event_type VARCHAR(50) NOT NULL, -- 'location_update', 'status_change'
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add alert preferences table
CREATE TABLE IF NOT EXISTS alert_preferences (
    id SERIAL PRIMARY KEY,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    stale_threshold_hours INTEGER DEFAULT 1,
    movement_threshold_km INTEGER DEFAULT 10,
    movement_time_window_minutes INTEGER DEFAULT 5,
    email_notifications BOOLEAN DEFAULT true,
    webhook_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add alert history
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    wallet_provider_id INTEGER REFERENCES wallet_providers(id),
    alert_type VARCHAR(50) NOT NULL,
    wallet_public_key VARCHAR(255),
    details JSONB,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index for session lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);


CREATE TABLE IF NOT EXISTS api_requests (
    id SERIAL PRIMARY KEY,
    consumer_id INTEGER REFERENCES data_consumers(id),
    endpoint VARCHAR(255) NOT NULL,
    response_time INTEGER NOT NULL, -- in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_locations_history (
    id SERIAL PRIMARY KEY,
    public_key VARCHAR(255) NOT NULL,
    blockchain VARCHAR(50) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    provider_id INTEGER REFERENCES wallet_providers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API Key Management Tables
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    api_key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100),
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE
);

-- API Usage Tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id),
    endpoint VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time INTEGER, -- in milliseconds
    status_code INTEGER
);

-- Rate Limiting Configuration
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_day INTEGER DEFAULT 5000
); 