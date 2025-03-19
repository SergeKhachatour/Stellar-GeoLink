const pool = require('../config/database');
const { sendWebhook } = require('./webhook');

class LocationService {
    async updateLocation(providerId, locationData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update location
            const result = await client.query(
                `INSERT INTO wallet_locations 
                (public_key, blockchain, wallet_type_id, latitude, longitude, wallet_provider_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (public_key) 
                DO UPDATE SET 
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    last_updated = CURRENT_TIMESTAMP
                RETURNING id`,
                [
                    locationData.public_key,
                    locationData.blockchain,
                    locationData.wallet_type_id,
                    locationData.latitude,
                    locationData.longitude,
                    providerId
                ]
            );

            // Log event
            await client.query(
                `INSERT INTO location_events 
                (wallet_location_id, event_type, latitude, longitude)
                VALUES ($1, $2, $3, $4)`,
                [
                    result.rows[0].id,
                    'location_update',
                    locationData.latitude,
                    locationData.longitude
                ]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getLocationHistory(publicKey, timeRange = '24 hours') {
        const result = await pool.query(
            `SELECT 
                le.event_type,
                le.latitude,
                le.longitude,
                le.created_at,
                le.details
            FROM location_events le
            JOIN wallet_locations wl ON wl.id = le.wallet_location_id
            WHERE wl.public_key = $1
            AND le.created_at > NOW() - INTERVAL $2
            ORDER BY le.created_at DESC`,
            [publicKey, timeRange]
        );
        return result.rows;
    }
}

module.exports = new LocationService(); 