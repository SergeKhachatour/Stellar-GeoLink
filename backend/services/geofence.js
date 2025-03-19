const pool = require('../config/database');
const { sendWebhook } = require('./webhook');

const checkGeofenceIntersection = async (providerId, coordinates, excludeGeofenceId = null) => {
    try {
        const query = `
            SELECT id, name 
            FROM geofences 
            WHERE wallet_provider_id = $1
            AND id != COALESCE($3, -1)
            AND ST_Intersects(
                boundary,
                ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography
            )`;

        const result = await pool.query(query, [
            providerId,
            JSON.stringify({
                type: 'Polygon',
                coordinates: [coordinates]
            }),
            excludeGeofenceId
        ]);

        return result.rows;
    } catch (error) {
        console.error('Error checking geofence intersection:', error);
        throw error;
    }
};

const checkGeofences = async (providerId, location) => {
    try {
        // Get all geofences for this provider
        const result = await pool.query(
            `SELECT id, name, notification_url 
            FROM geofences 
            WHERE wallet_provider_id = $1 
            AND ST_Contains(
                boundary, 
                ST_SetSRID(ST_Point($2, $3), 4326)
            )`,
            [providerId, location.longitude, location.latitude]
        );

        // Send webhooks for each matching geofence
        await Promise.all(result.rows.map(geofence => 
            sendWebhook(geofence.notification_url, {
                event: 'geofence_trigger',
                geofence: {
                    id: geofence.id,
                    name: geofence.name
                },
                location: {
                    public_key: location.public_key,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    timestamp: new Date().toISOString()
                }
            })
        ));

        return result.rows;
    } catch (error) {
        console.error('Error checking geofences:', error);
        return [];
    }
};

module.exports = { 
    checkGeofences,
    checkGeofenceIntersection
}; 