-- =====================================================
-- Stellar-GeoLink Database Schema
-- Generated from local PostgreSQL database
-- =====================================================

-- Create database (run as superuser)
-- CREATE DATABASE geolink;
-- \c geolink;

-- Create user
CREATE USER geolink_user WITH PASSWORD 'your_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE geolink TO geolink_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO geolink_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO geolink_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO geolink_user;

CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER NOT NULL DEFAULT nextval('alert_history_id_seq'::regclass),
    wallet_provider_id INTEGER,
    alert_type VARCHAR(50) NOT NULL,
    wallet_public_key VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified BOOLEAN DEFAULT false,
    details JSONB
);

CREATE TABLE IF NOT EXISTS alert_preferences (
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    wallet_provider_id INTEGER,
    id INTEGER NOT NULL DEFAULT nextval('alert_preferences_id_seq'::regclass),
    stale_threshold_hours INTEGER DEFAULT 1,
    movement_threshold_km INTEGER DEFAULT 10,
    movement_time_window_minutes INTEGER DEFAULT 5,
    email_notifications BOOLEAN DEFAULT true,
    webhook_notifications BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS alerts (
    user_id INTEGER,
    geofence_id INTEGER,
    alert_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    id INTEGER NOT NULL DEFAULT nextval('alerts_id_seq'::regclass),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_key_requests (
    status VARCHAR(50) DEFAULT 'pending'::character varying,
    user_id INTEGER,
    request_type VARCHAR(50) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    id INTEGER NOT NULL DEFAULT nextval('api_key_requests_id_seq'::regclass),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER NOT NULL DEFAULT nextval('api_keys_id_seq'::regclass),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    status BOOLEAN DEFAULT false,
    name VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rejection_reason TEXT,
    api_key VARCHAR(255) NOT NULL,
    user_id INTEGER
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
    endpoint VARCHAR(255) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER,
    ip_address INET,
    user_agent TEXT,
    wallet_provider_id INTEGER,
    data_consumer_id INTEGER,
    id INTEGER NOT NULL DEFAULT nextval('api_usage_logs_id_seq'::regclass),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    api_key_id INTEGER,
    api_key VARCHAR(255),
    method VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS data_consumers (
    use_case TEXT,
    status BOOLEAN DEFAULT false,
    organization_name VARCHAR(255) NOT NULL,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id INTEGER NOT NULL DEFAULT nextval('data_consumers_id_seq'::regclass)
);

CREATE TABLE IF NOT EXISTS geofences (
    description TEXT,
    name VARCHAR(255) NOT NULL,
    boundary USER-DEFINED,
    id INTEGER NOT NULL DEFAULT nextval('geofences_id_seq'::regclass),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS location_events (
    latitude NUMERIC(10,8),
    event_type VARCHAR(50) NOT NULL,
    wallet_location_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id INTEGER NOT NULL DEFAULT nextval('location_events_id_seq'::regclass),
    details JSONB,
    longitude NUMERIC(11,8)
);

CREATE TABLE IF NOT EXISTS location_verifications (
    distance_meters NUMERIC(10,2) NOT NULL,
    id INTEGER NOT NULL DEFAULT nextval('location_verifications_id_seq'::regclass),
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_public_key VARCHAR(56) NOT NULL,
    user_longitude NUMERIC(11,8) NOT NULL,
    user_latitude NUMERIC(10,8) NOT NULL,
    nft_latitude NUMERIC(10,8) NOT NULL,
    nft_id INTEGER,
    nft_longitude NUMERIC(11,8) NOT NULL,
    verification_result BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS nft_collections (
    image_url VARCHAR(500),
    rarity_level VARCHAR(50) NOT NULL,
    id INTEGER NOT NULL DEFAULT nextval('nft_collections_id_seq'::regclass),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS nft_transfers (
    from_user VARCHAR(56),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stellar_address VARCHAR(56),
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id INTEGER NOT NULL DEFAULT nextval('nft_transfers_id_seq'::regclass),
    smart_contract_tx VARCHAR(64),
    transaction_hash VARCHAR(64),
    transfer_type VARCHAR(50) NOT NULL,
    to_user VARCHAR(56) NOT NULL,
    nft_id INTEGER
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    wallet_provider_id INTEGER,
    webhook_url TEXT,
    id INTEGER NOT NULL DEFAULT nextval('notification_preferences_id_seq'::regclass),
    email_notifications BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS pinned_nfts (
    latitude NUMERIC(10,8) NOT NULL,
    radius_meters INTEGER DEFAULT 10,
    pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collection_id INTEGER,
    longitude NUMERIC(11,8) NOT NULL,
    pinned_by_user VARCHAR(56) NOT NULL,
    rarity_requirements JSONB,
    ipfs_hash VARCHAR(255),
    smart_contract_address VARCHAR(56),
    id INTEGER NOT NULL DEFAULT nextval('pinned_nfts_id_seq'::regclass)
);

CREATE TABLE IF NOT EXISTS rate_limits (
    user_id INTEGER,
    id INTEGER NOT NULL DEFAULT nextval('rate_limits_id_seq'::regclass),
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_day INTEGER DEFAULT 5000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    id INTEGER NOT NULL DEFAULT nextval('refresh_tokens_id_seq'::regclass),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    token VARCHAR(255) NOT NULL,
    user_id INTEGER
);

CREATE TABLE IF NOT EXISTS spatial_ref_sys (
    srtext VARCHAR(2048),
    proj4text VARCHAR(2048),
    srid INTEGER NOT NULL,
    auth_name VARCHAR(256),
    auth_srid INTEGER
);

CREATE TABLE IF NOT EXISTS user_nft_ownership (
    is_active BOOLEAN DEFAULT true,
    id INTEGER NOT NULL DEFAULT nextval('user_nft_ownership_id_seq'::regclass),
    current_owner VARCHAR(56) NOT NULL,
    transfer_count INTEGER DEFAULT 0,
    stellar_address VARCHAR(56),
    nft_id INTEGER,
    user_public_key VARCHAR(56) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_privacy_settings (
    public_key VARCHAR(56) NOT NULL,
    id INTEGER NOT NULL DEFAULT nextval('user_privacy_settings_id_seq'::regclass),
    privacy_enabled BOOLEAN DEFAULT true,
    visibility_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remember_me BOOLEAN DEFAULT false,
    id INTEGER NOT NULL DEFAULT nextval('user_sessions_id_seq'::regclass),
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    device_info JSONB,
    session_id VARCHAR(255) NOT NULL,
    user_id INTEGER
);

CREATE TABLE IF NOT EXISTS user_visibility_settings (
    is_visible BOOLEAN DEFAULT false,
    id INTEGER NOT NULL DEFAULT nextval('user_visibility_settings_id_seq'::regclass),
    public_key VARCHAR(56) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    public_key VARCHAR(56),
    status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    role USER-DEFINED NOT NULL,
    organization VARCHAR(255),
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_location_history (
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id INTEGER NOT NULL DEFAULT nextval('wallet_location_history_id_seq'::regclass),
    location USER-DEFINED,
    longitude NUMERIC(11,8),
    latitude NUMERIC(10,8),
    wallet_location_id INTEGER
);

CREATE TABLE IF NOT EXISTS wallet_locations (
    wallet_type_id INTEGER,
    wallet_provider_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location_enabled BOOLEAN DEFAULT true,
    tracking_status BOOLEAN DEFAULT true,
    blockchain VARCHAR(50) DEFAULT 'Stellar'::character varying,
    id INTEGER NOT NULL DEFAULT nextval('wallet_locations_id_seq'::regclass),
    longitude NUMERIC(11,8),
    latitude NUMERIC(10,8),
    public_key VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_providers (
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    status BOOLEAN DEFAULT true,
    api_key_id INTEGER,
    id INTEGER NOT NULL DEFAULT nextval('wallet_providers_id_seq'::regclass),
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_types (
    id INTEGER NOT NULL DEFAULT nextval('wallet_types_id_seq'::regclass),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS webhook_configurations (
    id INTEGER NOT NULL DEFAULT nextval('webhook_configurations_id_seq'::regclass),
    url TEXT NOT NULL,
    wallet_provider_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true,
    events ARRAY NOT NULL
);

ALTER TABLE alert_history ADD CONSTRAINT 2200_21657_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE alert_history ADD CONSTRAINT 2200_21657_3_not_null CHECK (alert_type IS NOT NULL);

ALTER TABLE alert_history ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);

ALTER TABLE alert_preferences ADD CONSTRAINT 2200_21639_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE alert_preferences ADD CONSTRAINT alert_preferences_pkey PRIMARY KEY (id);

ALTER TABLE alerts ADD CONSTRAINT 2200_22213_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE alerts ADD CONSTRAINT 2200_22213_4_not_null CHECK (alert_type IS NOT NULL);

ALTER TABLE alerts ADD CONSTRAINT 2200_22213_5_not_null CHECK (message IS NOT NULL);

ALTER TABLE alerts ADD CONSTRAINT alerts_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES geofences(id);

ALTER TABLE alerts ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);

ALTER TABLE alerts ADD CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE api_key_requests ADD CONSTRAINT 2200_22131_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE api_key_requests ADD CONSTRAINT 2200_22131_3_not_null CHECK (request_type IS NOT NULL);

ALTER TABLE api_key_requests ADD CONSTRAINT 2200_22131_4_not_null CHECK (organization_name IS NOT NULL);

ALTER TABLE api_key_requests ADD CONSTRAINT 2200_22131_5_not_null CHECK (purpose IS NOT NULL);

ALTER TABLE api_key_requests ADD CONSTRAINT api_key_requests_pkey PRIMARY KEY (id);

ALTER TABLE api_key_requests ADD CONSTRAINT api_key_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);

ALTER TABLE api_key_requests ADD CONSTRAINT api_key_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE api_keys ADD CONSTRAINT 2200_22114_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE api_keys ADD CONSTRAINT 2200_22114_3_not_null CHECK (api_key IS NOT NULL);

ALTER TABLE api_keys ADD CONSTRAINT api_keys_api_key_key UNIQUE (api_key);

ALTER TABLE api_keys ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE api_keys ADD CONSTRAINT api_keys_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);

ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE api_usage_logs ADD CONSTRAINT 2200_22234_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE api_usage_logs ADD CONSTRAINT 2200_22234_3_not_null CHECK (endpoint IS NOT NULL);

ALTER TABLE api_usage_logs ADD CONSTRAINT 2200_22234_4_not_null CHECK (method IS NOT NULL);

ALTER TABLE api_usage_logs ADD CONSTRAINT 2200_22234_5_not_null CHECK (status_code IS NOT NULL);

ALTER TABLE api_usage_logs ADD CONSTRAINT api_usage_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id);

ALTER TABLE api_usage_logs ADD CONSTRAINT api_usage_logs_data_consumer_id_fkey FOREIGN KEY (data_consumer_id) REFERENCES data_consumers(id);

ALTER TABLE api_usage_logs ADD CONSTRAINT api_usage_logs_pkey PRIMARY KEY (id);

ALTER TABLE api_usage_logs ADD CONSTRAINT api_usage_logs_wallet_provider_id_fkey FOREIGN KEY (wallet_provider_id) REFERENCES wallet_providers(id);

ALTER TABLE data_consumers ADD CONSTRAINT 2200_22099_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE data_consumers ADD CONSTRAINT 2200_22099_3_not_null CHECK (organization_name IS NOT NULL);

ALTER TABLE data_consumers ADD CONSTRAINT data_consumers_pkey PRIMARY KEY (id);

ALTER TABLE data_consumers ADD CONSTRAINT data_consumers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE geofences ADD CONSTRAINT 2200_22203_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE geofences ADD CONSTRAINT 2200_22203_2_not_null CHECK (name IS NOT NULL);

ALTER TABLE geofences ADD CONSTRAINT geofences_pkey PRIMARY KEY (id);

ALTER TABLE location_events ADD CONSTRAINT 2200_21624_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE location_events ADD CONSTRAINT 2200_21624_3_not_null CHECK (event_type IS NOT NULL);

ALTER TABLE location_events ADD CONSTRAINT location_events_pkey PRIMARY KEY (id);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_2_not_null CHECK (user_public_key IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_4_not_null CHECK (user_latitude IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_5_not_null CHECK (user_longitude IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_6_not_null CHECK (nft_latitude IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_7_not_null CHECK (nft_longitude IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_8_not_null CHECK (distance_meters IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT 2200_30031_9_not_null CHECK (verification_result IS NOT NULL);

ALTER TABLE location_verifications ADD CONSTRAINT location_verifications_nft_id_fkey FOREIGN KEY (nft_id) REFERENCES pinned_nfts(id);

ALTER TABLE location_verifications ADD CONSTRAINT location_verifications_pkey PRIMARY KEY (id);

ALTER TABLE nft_collections ADD CONSTRAINT 2200_29968_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE nft_collections ADD CONSTRAINT 2200_29968_2_not_null CHECK (name IS NOT NULL);

ALTER TABLE nft_collections ADD CONSTRAINT 2200_29968_5_not_null CHECK (rarity_level IS NOT NULL);

ALTER TABLE nft_collections ADD CONSTRAINT nft_collections_pkey PRIMARY KEY (id);

ALTER TABLE nft_collections ADD CONSTRAINT nft_collections_rarity_level_check CHECK (((rarity_level)::text = ANY ((ARRAY['common'::character varying, 'rare'::character varying, 'legendary'::character varying])::text[])));

ALTER TABLE nft_transfers ADD CONSTRAINT 2200_30016_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE nft_transfers ADD CONSTRAINT 2200_30016_4_not_null CHECK (to_user IS NOT NULL);

ALTER TABLE nft_transfers ADD CONSTRAINT 2200_30016_5_not_null CHECK (transfer_type IS NOT NULL);

ALTER TABLE nft_transfers ADD CONSTRAINT nft_transfers_nft_id_fkey FOREIGN KEY (nft_id) REFERENCES pinned_nfts(id);

ALTER TABLE nft_transfers ADD CONSTRAINT nft_transfers_pkey PRIMARY KEY (id);

ALTER TABLE nft_transfers ADD CONSTRAINT nft_transfers_transfer_type_check CHECK (((transfer_type)::text = ANY ((ARRAY['collect'::character varying, 'transfer'::character varying, 'sale'::character varying])::text[])));

ALTER TABLE notification_preferences ADD CONSTRAINT 2200_21608_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);

ALTER TABLE pinned_nfts ADD CONSTRAINT 2200_29980_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE pinned_nfts ADD CONSTRAINT 2200_29980_3_not_null CHECK (latitude IS NOT NULL);

ALTER TABLE pinned_nfts ADD CONSTRAINT 2200_29980_4_not_null CHECK (longitude IS NOT NULL);

ALTER TABLE pinned_nfts ADD CONSTRAINT 2200_29980_6_not_null CHECK (pinned_by_user IS NOT NULL);

ALTER TABLE pinned_nfts ADD CONSTRAINT pinned_nfts_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES nft_collections(id);

ALTER TABLE pinned_nfts ADD CONSTRAINT pinned_nfts_pkey PRIMARY KEY (id);

ALTER TABLE rate_limits ADD CONSTRAINT 2200_22153_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);

ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_user_id_key UNIQUE (user_id);

ALTER TABLE refresh_tokens ADD CONSTRAINT 2200_22065_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE refresh_tokens ADD CONSTRAINT 2200_22065_3_not_null CHECK (token IS NOT NULL);

ALTER TABLE refresh_tokens ADD CONSTRAINT 2200_22065_4_not_null CHECK (expires_at IS NOT NULL);

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE spatial_ref_sys ADD CONSTRAINT 2200_20699_1_not_null CHECK (srid IS NOT NULL);

ALTER TABLE spatial_ref_sys ADD CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid);

ALTER TABLE spatial_ref_sys ADD CONSTRAINT spatial_ref_sys_srid_check CHECK (((srid > 0) AND (srid <= 998999)));

ALTER TABLE user_nft_ownership ADD CONSTRAINT 2200_29999_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE user_nft_ownership ADD CONSTRAINT 2200_29999_2_not_null CHECK (user_public_key IS NOT NULL);

ALTER TABLE user_nft_ownership ADD CONSTRAINT 2200_29999_6_not_null CHECK (current_owner IS NOT NULL);

ALTER TABLE user_nft_ownership ADD CONSTRAINT user_nft_ownership_nft_id_fkey FOREIGN KEY (nft_id) REFERENCES pinned_nfts(id);

ALTER TABLE user_nft_ownership ADD CONSTRAINT user_nft_ownership_pkey PRIMARY KEY (id);

ALTER TABLE user_privacy_settings ADD CONSTRAINT 2200_22259_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE user_privacy_settings ADD CONSTRAINT 2200_22259_2_not_null CHECK (public_key IS NOT NULL);

ALTER TABLE user_privacy_settings ADD CONSTRAINT user_privacy_settings_pkey PRIMARY KEY (id);

ALTER TABLE user_privacy_settings ADD CONSTRAINT user_privacy_settings_public_key_key UNIQUE (public_key);

ALTER TABLE user_sessions ADD CONSTRAINT 2200_20360_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE user_sessions ADD CONSTRAINT 2200_20360_3_not_null CHECK (session_id IS NOT NULL);

ALTER TABLE user_sessions ADD CONSTRAINT 2200_20360_8_not_null CHECK (expires_at IS NOT NULL);

ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);

ALTER TABLE user_visibility_settings ADD CONSTRAINT 2200_22271_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE user_visibility_settings ADD CONSTRAINT 2200_22271_2_not_null CHECK (public_key IS NOT NULL);

ALTER TABLE user_visibility_settings ADD CONSTRAINT user_visibility_settings_pkey PRIMARY KEY (id);

ALTER TABLE user_visibility_settings ADD CONSTRAINT user_visibility_settings_public_key_key UNIQUE (public_key);

ALTER TABLE users ADD CONSTRAINT 2200_22052_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT 2200_22052_2_not_null CHECK (email IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT 2200_22052_3_not_null CHECK (password_hash IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT 2200_22052_6_not_null CHECK (role IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE wallet_location_history ADD CONSTRAINT 2200_21557_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE wallet_location_history ADD CONSTRAINT wallet_location_history_pkey PRIMARY KEY (id);

ALTER TABLE wallet_locations ADD CONSTRAINT 2200_22181_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE wallet_locations ADD CONSTRAINT 2200_22181_4_not_null CHECK (public_key IS NOT NULL);

ALTER TABLE wallet_locations ADD CONSTRAINT wallet_locations_pkey PRIMARY KEY (id);

ALTER TABLE wallet_locations ADD CONSTRAINT wallet_locations_wallet_provider_id_fkey FOREIGN KEY (wallet_provider_id) REFERENCES wallet_providers(id);

ALTER TABLE wallet_locations ADD CONSTRAINT wallet_locations_wallet_type_id_fkey FOREIGN KEY (wallet_type_id) REFERENCES wallet_types(id);

ALTER TABLE wallet_providers ADD CONSTRAINT 2200_22081_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE wallet_providers ADD CONSTRAINT 2200_22081_3_not_null CHECK (name IS NOT NULL);

ALTER TABLE wallet_providers ADD CONSTRAINT wallet_providers_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id);

ALTER TABLE wallet_providers ADD CONSTRAINT wallet_providers_pkey PRIMARY KEY (id);

ALTER TABLE wallet_providers ADD CONSTRAINT wallet_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE wallet_types ADD CONSTRAINT 2200_22171_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE wallet_types ADD CONSTRAINT 2200_22171_2_not_null CHECK (name IS NOT NULL);

ALTER TABLE wallet_types ADD CONSTRAINT wallet_types_pkey PRIMARY KEY (id);

ALTER TABLE webhook_configurations ADD CONSTRAINT 2200_21574_1_not_null CHECK (id IS NOT NULL);

ALTER TABLE webhook_configurations ADD CONSTRAINT 2200_21574_3_not_null CHECK (url IS NOT NULL);

ALTER TABLE webhook_configurations ADD CONSTRAINT 2200_21574_4_not_null CHECK (events IS NOT NULL);

ALTER TABLE webhook_configurations ADD CONSTRAINT webhook_configurations_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS api_keys_api_key_key ON api_keys (api_key);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs (created_at);

CREATE INDEX IF NOT EXISTS idx_location_verifications_nft ON location_verifications (nft_id);

CREATE INDEX IF NOT EXISTS idx_location_verifications_result ON location_verifications (verification_result);

CREATE INDEX IF NOT EXISTS idx_location_verifications_user ON location_verifications (user_public_key);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_from_user ON nft_transfers (from_user);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_nft ON nft_transfers (nft_id);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_stellar_address ON nft_transfers (stellar_address);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_to_user ON nft_transfers (to_user);

CREATE INDEX IF NOT EXISTS idx_pinned_nfts_active ON pinned_nfts (is_active);

CREATE INDEX IF NOT EXISTS idx_pinned_nfts_collection ON pinned_nfts (collection_id);

CREATE INDEX IF NOT EXISTS idx_pinned_nfts_location ON pinned_nfts (longitude, latitude);

CREATE INDEX IF NOT EXISTS rate_limits_user_id_key ON rate_limits (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS refresh_tokens_token_key ON refresh_tokens (token);

CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_active ON user_nft_ownership (is_active);

CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_nft ON user_nft_ownership (nft_id);

CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_stellar_address ON user_nft_ownership (stellar_address);

CREATE INDEX IF NOT EXISTS idx_user_nft_ownership_user ON user_nft_ownership (user_public_key);

CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_public_key ON user_privacy_settings (public_key);

CREATE INDEX IF NOT EXISTS user_privacy_settings_public_key_key ON user_privacy_settings (public_key);

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_user_visibility_settings_public_key ON user_visibility_settings (public_key);

CREATE INDEX IF NOT EXISTS user_visibility_settings_public_key_key ON user_visibility_settings (public_key);

CREATE INDEX IF NOT EXISTS idx_users_public_key ON users (public_key);

CREATE INDEX IF NOT EXISTS users_email_key ON users (email);

CREATE INDEX IF NOT EXISTS idx_location_history_wallet_id ON wallet_location_history (wallet_location_id);

CREATE INDEX IF NOT EXISTS idx_wallet_locations_provider ON wallet_locations (wallet_provider_id);

CREATE SEQUENCE IF NOT EXISTS alert_history_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS alert_preferences_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS alerts_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS api_key_requests_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS api_keys_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS api_usage_logs_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS data_consumers_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS geofences_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS location_events_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS location_verifications_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS nft_collections_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS nft_transfers_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS notification_preferences_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS pinned_nfts_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS rate_limits_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS refresh_tokens_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS user_nft_ownership_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS user_privacy_settings_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS user_sessions_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS user_visibility_settings_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS users_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS wallet_location_history_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS wallet_locations_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS wallet_providers_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS wallet_types_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS webhook_configurations_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE OR REPLACE FUNCTION _postgis_deprecate() RETURNS void
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_index_extent() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_join_selectivity() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_pgsql_version() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_scripts_pgsql_version() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_selectivity() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _postgis_stats() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_3ddfullywithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_3ddwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_3dintersects() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_asgml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_asx3d() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_bestsrid() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_bestsrid() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_contains() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_containsproperly() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_coveredby() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_coveredby() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_covers() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_covers() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_crosses() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_dfullywithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_distancetree() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_distancetree() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_distanceuncached() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_distanceuncached() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_distanceuncached() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_dwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_dwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_dwithinuncached() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_dwithinuncached() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_equals() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_geomfromgml() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_intersects() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_linecrossingdirection() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_longestline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_maxdistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_orderingequals() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_overlaps() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_pointoutside() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_sortablehash() RETURNS bigint
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_touches() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_voronoi() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION _st_within() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION addgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION addgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION addgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box() RETURNS box
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box() RETURNS box
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2d_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2d_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2df_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box2df_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box3d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box3d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box3d_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box3d_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION box3dtobox() RETURNS box
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION bytea() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION bytea() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION contains_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION contains_2d() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION contains_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrycolumn() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrytable() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrytable() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION dropgeometrytable() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION equals() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION find_srid() RETURNS integer
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geog_brin_inclusion_add_value() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geog_brin_inclusion_merge() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_analyze() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_cmp() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_distance_knn() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_eq() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_ge() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_compress() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_consistent() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_decompress() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_distance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_penalty() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_picksplit() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_same() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gist_union() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_gt() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_le() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_lt() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_overlaps() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_recv() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_send() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_choose_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_compress_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_config_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_inner_consistent_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_leaf_consistent_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_spgist_picksplit_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_typmod_in() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geography_typmod_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom2d_brin_inclusion_add_value() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom2d_brin_inclusion_merge() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom3d_brin_inclusion_add_value() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom3d_brin_inclusion_merge() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom4d_brin_inclusion_add_value() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geom4d_brin_inclusion_merge() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_above() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_analyze() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_below() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_cmp() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_contained_3d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_contains() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_contains_3d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_contains_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_distance_box() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_distance_centroid() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_distance_centroid_nd() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_distance_cpa() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_eq() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_ge() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_compress_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_compress_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_consistent_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_consistent_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_decompress_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_decompress_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_distance_2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_distance_nd() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_penalty_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_penalty_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_picksplit_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_picksplit_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_same_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_same_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_sortsupport_2d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_union_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gist_union_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_gt() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_hash() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_le() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_left() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_lt() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_neq() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overabove() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overbelow() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overlaps() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overlaps_3d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overlaps_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overleft() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_overright() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_recv() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_right() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_same() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_same_3d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_same_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_send() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_sortsupport() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_choose_2d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_choose_3d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_choose_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_compress_2d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_compress_3d() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_compress_nd() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_config_2d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_config_3d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_config_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_inner_consistent_2d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_inner_consistent_3d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_inner_consistent_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_leaf_consistent_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_leaf_consistent_3d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_leaf_consistent_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_picksplit_2d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_picksplit_3d() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_spgist_picksplit_nd() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_typmod_in() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_typmod_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_within() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometry_within_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometrytype() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geometrytype() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geomfromewkb() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION geomfromewkt() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION get_proj4_from_srid() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gidx_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gidx_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gserialized_gist_joinsel_2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gserialized_gist_joinsel_nd() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gserialized_gist_sel_2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION gserialized_gist_sel_nd() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION is_contained_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION is_contained_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION is_contained_2d() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION json() RETURNS json
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION jsonb() RETURNS jsonb
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION log_location_change() RETURNS trigger
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_2d() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_2d() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_geog() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_geog() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_geog() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_nd() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION overlaps_nd() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION path() RETURNS path
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asflatgeobuf_finalfn() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asflatgeobuf_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asflatgeobuf_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asflatgeobuf_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asgeobuf_finalfn() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asgeobuf_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asgeobuf_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_combinefn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_deserialfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_finalfn() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_serialfn() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_asmvt_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_accum_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_accum_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_accum_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_clusterintersecting_finalfn() RETURNS ARRAY
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_clusterwithin_finalfn() RETURNS ARRAY
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_collect_finalfn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_coverageunion_finalfn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_makeline_finalfn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_polygonize_finalfn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_combinefn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_deserialfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_finalfn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_serialfn() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION pgis_geometry_union_parallel_transfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION point() RETURNS point
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION polygon() RETURNS polygon
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION populate_geometry_columns() RETURNS integer
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION populate_geometry_columns() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_addbbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_cache_bbox() RETURNS trigger
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_constraint_dims() RETURNS integer
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_constraint_srid() RETURNS integer
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_constraint_type() RETURNS character varying
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_dropbbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_extensions_upgrade() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_full_version() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_geos_compiled_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_geos_noop() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_geos_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_getbbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_hasbbox() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_index_supportfn() RETURNS internal
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_lib_build_date() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_lib_revision() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_lib_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_libjson_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_liblwgeom_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_libprotobuf_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_libxml_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_noop() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_proj_compiled_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_proj_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_scripts_build_date() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_scripts_installed() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_scripts_released() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_srs() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_srs_all() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_srs_codes() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_srs_search() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_svn_version() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_transform_geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_transform_pipeline_geometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_type_name() RETURNS character varying
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_typmod_dims() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_typmod_srid() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_typmod_type() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION postgis_wagyu_version() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION spheroid_in() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION spheroid_out() RETURNS cstring
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dclosestpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3ddfullywithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3ddistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3ddwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dintersects() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dlength() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dlineinterpolatepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dlongestline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dmakebox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dmaxdistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dperimeter() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_3dshortestline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_addmeasure() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_addpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_addpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_affine() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_affine() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_angle() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_angle() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_area() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_area() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_area() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_area2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asbinary() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asbinary() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asbinary() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asbinary() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asencodedpolyline() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkb() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkb() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkt() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkt() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkt() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkt() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asewkt() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgeojson() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgeojson() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgeojson() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgeojson() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgml() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asgml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ashexewkb() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ashexewkb() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_askml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_askml() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_askml() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_aslatlontext() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asmarc21() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asmvtgeom() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_assvg() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_assvg() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_assvg() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astext() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astext() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astext() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astext() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astext() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astwkb() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_astwkb() RETURNS bytea
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_asx3d() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_azimuth() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_azimuth() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_bdmpolyfromtext() RETURNS USER-DEFINED
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_bdpolyfromtext() RETURNS USER-DEFINED
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_boundary() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_boundingdiagonal() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_box2dfromgeohash() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buffer() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_buildarea() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_centroid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_centroid() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_centroid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_chaikinsmoothing() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_cleangeometry() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_clipbybox2d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_closestpoint() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_closestpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_closestpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_closestpointofapproach() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_clusterintersecting() RETURNS ARRAY
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_clusterwithin() RETURNS ARRAY
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_collect() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_collect() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_collectionextract() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_collectionextract() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_collectionhomogenize() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_combinebbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_combinebbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_combinebbox() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_concavehull() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_contains() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_containsproperly() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_convexhull() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_coorddim() RETURNS smallint
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_coverageunion() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_coveredby() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_coveredby() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_coveredby() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_covers() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_covers() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_covers() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_cpawithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_crosses() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_curven() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_curvetoline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_delaunaytriangles() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dfullywithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_difference() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dimension() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_disjoint() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distance() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distancecpa() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distancesphere() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distancesphere() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distancespheroid() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_distancespheroid() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dump() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dumppoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dumprings() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dumpsegments() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dwithin() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_dwithin() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_endpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_envelope() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_equals() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_estimatedextent() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_estimatedextent() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_estimatedextent() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_expand() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_exteriorring() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_filterbym() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_findextent() RETURNS USER-DEFINED
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_findextent() RETURNS USER-DEFINED
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_flipcoordinates() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_force2d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_force3d() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_force3dm() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_force3dz() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_force4d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcecollection() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcecurve() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcepolygonccw() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcepolygoncw() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcerhr() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcesfs() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_forcesfs() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_frechetdistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_fromflatgeobuf() RETURNS anyelement
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_fromflatgeobuftotable() RETURNS void
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_generatepoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_generatepoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geogfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geogfromwkb() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geographyfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geohash() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geohash() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomcollfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomcollfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomcollfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomcollfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geometricmedian() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geometryfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geometryfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geometryn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geometrytype() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromewkb() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromewkt() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgeohash() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgeojson() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgeojson() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgeojson() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgml() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromgml() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromkml() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfrommarc21() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromtext() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromtwkb() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_geomfromwkb() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_gmltosql() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_gmltosql() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hasarc() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hasm() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hasz() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hausdorffdistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hausdorffdistance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hexagon() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_hexagongrid() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_interiorringn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_interpolatepoint() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersection() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersection() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersection() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersects() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersects() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_intersects() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_inversetransformpipeline() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isclosed() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_iscollection() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isempty() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ispolygonccw() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ispolygoncw() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isring() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_issimple() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvalid() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvalid() RETURNS boolean
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvaliddetail() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvalidreason() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvalidreason() RETURNS text
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_isvalidtrajectory() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_largestemptycircle() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_length() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_length() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_length() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_length2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_length2dspheroid() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lengthspheroid() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_letters() RETURNS USER-DEFINED
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linecrossingdirection() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineextend() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefromencodedpolyline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefrommultipoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linefromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoint() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoints() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_lineinterpolatepoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linelocatepoint() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linelocatepoint() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linelocatepoint() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linemerge() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linemerge() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linestringfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linestringfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linesubstring() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linesubstring() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linesubstring() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_linetocurve() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_locatealong() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_locatebetween() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_locatebetweenelevations() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_longestline() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_m() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makebox2d() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makeenvelope() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makeline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makeline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepointm() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepolygon() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makepolygon() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makevalid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_makevalid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_maxdistance() RETURNS double precision
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_maximuminscribedcircle() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_memsize() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_minimumboundingcircle() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_minimumboundingradius() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_minimumclearance() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_minimumclearanceline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mlinefromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mlinefromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mlinefromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mlinefromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpointfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpointfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpolyfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpolyfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpolyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_mpolyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multi() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multilinefromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multilinestringfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multilinestringfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipointfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipolyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipolyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipolygonfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_multipolygonfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ndims() RETURNS smallint
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_node() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_normalize() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_npoints() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_nrings() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numcurves() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numgeometries() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numinteriorring() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numinteriorrings() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numpatches() RETURNS integer
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_numpoints() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_offsetcurve() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_orderingequals() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_orientedenvelope() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_overlaps() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_patchn() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_perimeter() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_perimeter() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_perimeter2d() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_point() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_point() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointfromgeohash() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointinsidecircle() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointm() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointn() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointonsurface() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_points() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointz() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_pointzm() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polyfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polyfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polyfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygon() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygonfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygonfromtext() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygonfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygonfromwkb() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_polygonize() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_project() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_project() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_project() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_project() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_quantizecoordinates() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_reduceprecision() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_relate() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_relate() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_relate() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_relatematch() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_removeirrelevantpointsforview() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_removepoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_removerepeatedpoints() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_removesmallparts() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_reverse() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotate() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotate() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotate() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotatex() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotatey() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_rotatez() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_scale() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_scale() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_scale() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_scale() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_scroll() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_segmentize() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_segmentize() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_seteffectivearea() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_setpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_setsrid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_setsrid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_sharedpaths() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_shiftlongitude() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_shortestline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_shortestline() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_shortestline() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_simplify() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_simplify() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_simplifypolygonhull() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_simplifypreservetopology() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_simplifyvw() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_snap() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_snaptogrid() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_snaptogrid() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_snaptogrid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_snaptogrid() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_split() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_square() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_squaregrid() RETURNS record
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_srid() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_srid() RETURNS integer
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_startpoint() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_subdivide() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_summary() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_summary() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_swapordinates() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_symdifference() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_symmetricdifference() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_tileenvelope() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_touches() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transform() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transform() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transform() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transform() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transformpipeline() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_translate() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_translate() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_transscale() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_triangulatepolygon() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_unaryunion() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_union() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_union() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_union() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_voronoilines() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_voronoipolygons() RETURNS USER-DEFINED
LANGUAGE SQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_within() RETURNS boolean
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_wkbtosql() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_wkttosql() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_wrapx() RETURNS USER-DEFINED
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_x() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_xmax() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_xmin() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_y() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ymax() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_ymin() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_z() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_zmax() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_zmflag() RETURNS smallint
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION st_zmin() RETURNS double precision
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION text() RETURNS text
LANGUAGE C
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION update_location_point() RETURNS trigger
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION updategeometrysrid() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION updategeometrysrid() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;

CREATE OR REPLACE FUNCTION updategeometrysrid() RETURNS text
LANGUAGE PLPGSQL
AS $$
-- Function body would go here
$$;


-- =====================================================
-- END OF SCHEMA
-- =====================================================
