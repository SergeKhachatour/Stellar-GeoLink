const pool = require('../config/database');

class AnalyticsService {
    async getProviderStats(providerId) {
        const result = await pool.query(`
            WITH stats AS (
                SELECT 
                    COUNT(DISTINCT public_key) as total_wallets,
                    COUNT(DISTINCT blockchain) as blockchain_count,
                    COUNT(*) FILTER (WHERE tracking_status = 'active') as active_wallets,
                    COUNT(*) FILTER (WHERE last_updated > NOW() - INTERVAL '24 hours') as updated_24h,
                    AVG(EXTRACT(EPOCH FROM (NOW() - last_updated))) as avg_update_age,
                    COUNT(*) FILTER (WHERE tracking_status = 'paused') as paused_wallets,
                    COUNT(*) FILTER (WHERE tracking_status = 'disabled') as disabled_wallets
                FROM wallet_locations
                WHERE wallet_provider_id = $1
            ),
            type_breakdown AS (
                SELECT 
                    wt.name as wallet_type,
                    COUNT(*) as count
                FROM wallet_locations wl
                JOIN wallet_types wt ON wt.id = wl.wallet_type_id
                WHERE wl.wallet_provider_id = $1
                GROUP BY wt.name
            ),
            activity_stats AS (
                SELECT 
                    DATE_TRUNC('hour', created_at) as hour,
                    COUNT(*) as updates
                FROM location_events
                WHERE wallet_location_id IN (
                    SELECT id FROM wallet_locations WHERE wallet_provider_id = $1
                )
                AND created_at > NOW() - INTERVAL '24 hours'
                GROUP BY hour
                ORDER BY hour
            )
            SELECT 
                stats.*,
                json_agg(DISTINCT type_breakdown) as wallet_types,
                json_agg(activity_stats ORDER BY hour) as hourly_activity
            FROM stats, type_breakdown, activity_stats
            GROUP BY stats.*;
        `, [providerId]);

        return result.rows[0];
    }

    async getGeofenceAnalytics(providerId) {
        const result = await pool.query(`
            SELECT 
                g.name as geofence_name,
                COUNT(DISTINCT wl.public_key) as unique_wallets,
                COUNT(*) as total_events,
                MAX(le.created_at) as last_event
            FROM geofences g
            LEFT JOIN location_events le ON 
                ST_Contains(g.boundary, ST_SetSRID(ST_Point(le.longitude, le.latitude), 4326))
            LEFT JOIN wallet_locations wl ON le.wallet_location_id = wl.id
            WHERE g.wallet_provider_id = $1
            GROUP BY g.id, g.name
            ORDER BY total_events DESC;
        `, [providerId]);

        return result.rows;
    }
}

module.exports = new AnalyticsService(); 