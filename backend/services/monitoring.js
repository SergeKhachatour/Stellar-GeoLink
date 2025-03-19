const pool = require('../config/database');
const { sendWebhook } = require('./webhook');

class MonitoringService {
    async checkStaleLocations() {
        const result = await pool.query(`
            SELECT 
                wl.id,
                wl.public_key,
                wl.wallet_provider_id,
                wp.name as provider_name,
                EXTRACT(EPOCH FROM (NOW() - wl.last_updated)) as seconds_since_update
            FROM wallet_locations wl
            JOIN wallet_providers wp ON wp.id = wl.wallet_provider_id
            WHERE 
                wl.tracking_status = 'active'
                AND wl.last_updated < NOW() - INTERVAL '1 hour'
        `);

        // Notify providers about stale locations
        for (const location of result.rows) {
            await sendWebhook(location.wallet_provider_id, 'stale_location', {
                public_key: location.public_key,
                seconds_since_update: location.seconds_since_update,
                provider: location.provider_name
            });
        }

        return result.rows;
    }

    async detectAnomalies(providerId) {
        // Detect sudden large movements
        const result = await pool.query(`
            WITH consecutive_locations AS (
                SELECT 
                    wl.public_key,
                    le1.latitude as lat1,
                    le1.longitude as lon1,
                    le2.latitude as lat2,
                    le2.longitude as lon2,
                    le2.created_at,
                    ST_Distance(
                        ST_SetSRID(ST_MakePoint(le1.longitude, le1.latitude), 4326)::geography,
                        ST_SetSRID(ST_MakePoint(le2.longitude, le2.latitude), 4326)::geography
                    ) as distance,
                    EXTRACT(EPOCH FROM (le2.created_at - le1.created_at)) as time_diff
                FROM location_events le1
                JOIN location_events le2 ON 
                    le1.wallet_location_id = le2.wallet_location_id
                    AND le2.created_at > le1.created_at
                    AND le2.created_at <= le1.created_at + INTERVAL '5 minutes'
                JOIN wallet_locations wl ON le1.wallet_location_id = wl.id
                WHERE wl.wallet_provider_id = $1
            )
            SELECT *
            FROM consecutive_locations
            WHERE distance > 10000 -- More than 10km
            AND time_diff < 300 -- Within 5 minutes
            ORDER BY created_at DESC;
        `, [providerId]);

        return result.rows;
    }
}

module.exports = new MonitoringService(); 