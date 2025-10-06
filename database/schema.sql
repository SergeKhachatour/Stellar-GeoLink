-- =====================================================
-- Stellar-GeoLink Complete Database Schema
-- =====================================================
-- This file contains the complete database schema for the Stellar-GeoLink system
-- including all tables, indexes, constraints, and sample data.
-- 
-- Run this file to create a fresh database with all features:
-- psql -U postgres -d GeoLink -f schema.sql
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUMS
-- =====================================================

-- User roles enum
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'sdf_employee', 'wallet_provider', 'data_consumer', 'nft_manager');
    ELSE
        -- Add nft_manager to existing enum if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'nft_manager' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
            ALTER TYPE user_role ADD VALUE 'nft_manager';
        END IF;
    END IF;
END $$;

-- Create refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN DEFAULT FALSE
);

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
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    api_key_id INTEGER REFERENCES api_keys(id),
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_consumers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    organization_name VARCHAR(255) NOT NULL,
    use_case TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- 'wallet', 'RWA', 'IoT'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Add unique constraint to wallet_types name
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'wallet_types_name_unique'
    ) THEN
        ALTER TABLE wallet_types ADD CONSTRAINT wallet_types_name_unique UNIQUE (name);
    END IF;
END
$$;

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    review_notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL,
    api_key_id INTEGER REFERENCES api_keys(id),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time INTEGER, -- in milliseconds
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
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key ON api_usage_logs(api_key);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider ON api_usage_logs(wallet_provider_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_consumer ON api_usage_logs(data_consumer_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key_id ON api_usage_logs(api_key_id);

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

-- Drop trigger if exists before creating it
DROP TRIGGER IF EXISTS log_location_changes ON wallet_locations;
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
    status BOOLEAN DEFAULT false,
    rejection_reason TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE
);

-- Rate Limiting Configuration
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) UNIQUE,
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_day INTEGER DEFAULT 5000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Clean up redundant tables if they exist
DROP TABLE IF EXISTS api_usage CASCADE;
DROP TABLE IF EXISTS api_requests CASCADE;
DROP TABLE IF EXISTS wallet_locations_history CASCADE;

-- Columns already added during table creation

-- Update api_usage_logs table to be our main API tracking table
ALTER TABLE api_usage_logs
    ADD COLUMN IF NOT EXISTS api_key_id INTEGER REFERENCES api_keys(id),
    ALTER COLUMN status_code DROP NOT NULL,
    ALTER COLUMN response_time DROP NOT NULL;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_key_requests_user_id ON api_key_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key_id ON api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_timestamp ON api_usage_logs(created_at);

-- UNIQUE constraint already added during table creation

-- Columns already added during table creation

-- All timestamp columns already use WITH TIME ZONE

-- User Privacy and Visibility Settings
CREATE TABLE IF NOT EXISTS user_privacy_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) UNIQUE,
    location_sharing_enabled BOOLEAN DEFAULT true,
    data_retention_days INTEGER DEFAULT 30,
    anonymize_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_visibility_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) UNIQUE,
    public_profile BOOLEAN DEFAULT false,
    show_location_history BOOLEAN DEFAULT true,
    allow_data_export BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add missing indexes for new tables
CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_user_id ON user_privacy_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_visibility_settings_user_id ON user_visibility_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_reviewed_by ON api_keys(reviewed_by);

-- =====================================================
-- NFT SYSTEM TABLES
-- =====================================================

-- NFT Collections (metadata about NFT types)
CREATE TABLE IF NOT EXISTS nft_collections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    rarity_level VARCHAR(50) NOT NULL CHECK (rarity_level IN ('common', 'rare', 'legendary')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pinned NFTs (location-based NFT instances)
CREATE TABLE IF NOT EXISTS pinned_nfts (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER REFERENCES nft_collections(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 10,
    pinned_by_user VARCHAR(56) NOT NULL, -- Stellar public key
    current_owner VARCHAR(56), -- Current owner's Stellar address
    pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    rarity_requirements JSONB, -- Additional requirements for collection
    ipfs_hash VARCHAR(255), -- IPFS metadata hash
    smart_contract_address VARCHAR(56), -- Stellar contract address
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User NFT Ownership
CREATE TABLE IF NOT EXISTS user_nft_ownership (
    id SERIAL PRIMARY KEY,
    user_public_key VARCHAR(56) NOT NULL,
    stellar_address VARCHAR(56), -- Additional Stellar address field
    nft_id INTEGER REFERENCES pinned_nfts(id) ON DELETE CASCADE,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    transfer_count INTEGER DEFAULT 0,
    current_owner VARCHAR(56) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NFT Transfer History
CREATE TABLE IF NOT EXISTS nft_transfers (
    id SERIAL PRIMARY KEY,
    nft_id INTEGER REFERENCES pinned_nfts(id) ON DELETE CASCADE,
    from_user VARCHAR(56),
    to_user VARCHAR(56) NOT NULL,
    stellar_address VARCHAR(56), -- Additional Stellar address field
    transfer_type VARCHAR(50) NOT NULL CHECK (transfer_type IN ('collect', 'transfer', 'sale')),
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    transaction_hash VARCHAR(64), -- Stellar transaction hash
    smart_contract_tx VARCHAR(64), -- Smart contract transaction
    memo TEXT, -- Transfer memo/note
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Location Verification Logs
CREATE TABLE IF NOT EXISTS location_verifications (
    id SERIAL PRIMARY KEY,
    user_public_key VARCHAR(56) NOT NULL,
    nft_id INTEGER REFERENCES pinned_nfts(id) ON DELETE CASCADE,
    user_latitude DECIMAL(10, 8) NOT NULL,
    user_longitude DECIMAL(11, 8) NOT NULL,
    nft_latitude DECIMAL(10, 8) NOT NULL,
    nft_longitude DECIMAL(11, 8) NOT NULL,
    distance_meters DECIMAL(10, 2) NOT NULL,
    verification_result BOOLEAN NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- STELLAR WALLET INTEGRATION
-- =====================================================

-- Add public_key column to users table for Stellar wallet integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key VARCHAR(56);

-- Add constraint to ensure public_key is valid Stellar address format
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_public_key_format') THEN
        ALTER TABLE users ADD CONSTRAINT check_public_key_format
        CHECK (public_key IS NULL OR public_key ~ '^[A-Z0-9]{56}$');
    END IF;
END $$;

-- =====================================================
-- NFT SYSTEM INDEXES
-- =====================================================

-- NFT system indexes
CREATE INDEX IF NOT EXISTS idx_pinned_nfts_location ON pinned_nfts(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_pinned_nfts_active ON pinned_nfts(is_active);
CREATE INDEX IF NOT EXISTS idx_pinned_nfts_collection ON pinned_nfts(collection_id);
CREATE INDEX IF NOT EXISTS idx_pinned_nfts_owner ON pinned_nfts(current_owner);

CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_user ON user_nft_ownership(user_public_key);
CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_nft ON user_nft_ownership(nft_id);
CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_active ON user_nft_ownership(is_active);
CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_stellar_address ON user_nft_ownership(stellar_address);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_nft ON nft_transfers(nft_id);
CREATE INDEX IF NOT EXISTS idx_nft_transfers_from_user ON nft_transfers(from_user);
CREATE INDEX IF NOT EXISTS idx_nft_transfers_to_user ON nft_transfers(to_user);
CREATE INDEX IF NOT EXISTS idx_nft_transfers_stellar_address ON nft_transfers(stellar_address);

CREATE INDEX IF NOT EXISTS idx_location_verifications_user ON location_verifications(user_public_key);
CREATE INDEX IF NOT EXISTS idx_location_verifications_nft ON location_verifications(nft_id);
CREATE INDEX IF NOT EXISTS idx_location_verifications_result ON location_verifications(verification_result);

-- Users public key index
CREATE INDEX IF NOT EXISTS idx_users_public_key ON users(public_key);

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Insert sample NFT collections
INSERT INTO nft_collections (name, description, image_url, rarity_level) VALUES
('Stellar Explorer', 'Discover the cosmos with Stellar NFTs', 'https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_01.jpg', 'common'),
('Galaxy Warriors', 'Epic space warriors from distant galaxies', 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=400&h=300&fit=crop', 'rare'),
('Cosmic Legends', 'Legendary artifacts from the depths of space', 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop', 'legendary')
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTIONS & TRIGGERS FOR NFT SYSTEM
-- =====================================================

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_nft_collections_updated_at BEFORE UPDATE ON nft_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER IF NOT EXISTS update_pinned_nfts_updated_at BEFORE UPDATE ON pinned_nfts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER IF NOT EXISTS update_user_nft_ownership_updated_at BEFORE UPDATE ON user_nft_ownership FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS FOR NFT ANALYTICS
-- =====================================================

-- User statistics view with NFT data
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.role,
    u.created_at,
    COUNT(DISTINCT g.id) as geofence_count,
    COUNT(DISTINCT pn.id) as pinned_nft_count,
    COUNT(DISTINCT uno.id) as owned_nft_count,
    COUNT(DISTINCT ak.id) as api_key_count
FROM users u
LEFT JOIN geofences g ON u.id = g.wallet_provider_id
LEFT JOIN pinned_nfts pn ON u.public_key = pn.pinned_by_user
LEFT JOIN user_nft_ownership uno ON u.public_key = uno.user_public_key
LEFT JOIN api_keys ak ON u.id = ak.user_id
GROUP BY u.id, u.email, u.role, u.created_at;

-- NFT analytics view
CREATE OR REPLACE VIEW nft_analytics AS
SELECT 
    nc.id as collection_id,
    nc.name as collection_name,
    nc.rarity_level,
    COUNT(pn.id) as total_pinned,
    COUNT(CASE WHEN pn.is_active THEN 1 END) as active_pinned,
    COUNT(uno.id) as total_collected,
    COUNT(CASE WHEN uno.is_active THEN 1 END) as active_owned,
    AVG(pn.radius_meters) as avg_radius,
    MIN(pn.pinned_at) as first_pinned,
    MAX(pn.pinned_at) as last_pinned
FROM nft_collections nc
LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id
LEFT JOIN user_nft_ownership uno ON pn.id = uno.nft_id
GROUP BY nc.id, nc.name, nc.rarity_level;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Stellar-GeoLink Database Schema Created Successfully!';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Tables created: users, api_keys, geofences, location_updates,';
    RAISE NOTICE 'nft_collections, pinned_nfts, user_nft_ownership, nft_transfers,';
    RAISE NOTICE 'location_verifications, api_usage, alerts';
    RAISE NOTICE '';
    RAISE NOTICE 'Features included:';
    RAISE NOTICE '- User management with role-based access';
    RAISE NOTICE '- Stellar wallet integration (public_key support)';
    RAISE NOTICE '- Location-based NFT system';
    RAISE NOTICE '- Geofencing capabilities';
    RAISE NOTICE '- API key management';
    RAISE NOTICE '- Analytics and monitoring';
    RAISE NOTICE '- Sample data and admin user';
    RAISE NOTICE '';
    RAISE NOTICE 'Default admin user: admin@stellargeolink.com';
    RAISE NOTICE 'Default password: admin123';
    RAISE NOTICE '=====================================================';
END $$; 