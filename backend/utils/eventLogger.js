/**
 * GeoLink Events Logger
 * Stores public-friendly events for the GeoLink Events feed on the home page
 */

const pool = require('../config/database');

/**
 * Apply zkproof-like fuzzing to location data for privacy
 * Rounds coordinates to ~100m precision to protect exact location
 * @param {number} latitude - Original latitude
 * @param {number} longitude - Original longitude
 * @returns {object} Fuzzed coordinates
 */
function fuzzLocation(latitude, longitude) {
    // Round to ~100m precision (approximately 0.001 degrees)
    // This provides privacy while still showing approximate location
    const precision = 100; // meters
    const degreesPerMeter = 0.000009; // approximately
    const roundingFactor = 1 / (precision * degreesPerMeter);
    
    return {
        latitude: Math.round(latitude * roundingFactor) / roundingFactor,
        longitude: Math.round(longitude * roundingFactor) / roundingFactor,
        precision_meters: precision,
        note: 'Location data protected using zkproof-like fuzzing'
    };
}

/**
 * Log a public-friendly event to the database
 * @param {string} eventType - Type of event (location_update, rule_matched, rule_executed, etc.)
 * @param {string} message - Human-readable event message
 * @param {object} eventData - Additional event data (JSON) - no sensitive information
 */
async function logEvent(eventType, message, eventData = null) {
    try {
        await pool.query(
            `INSERT INTO geolink_events (event_type, event_message, event_data, created_at)
             VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)`,
            [eventType, message, eventData ? JSON.stringify(eventData) : null]
        );
    } catch (error) {
        // Don't fail the main operation if event logging fails
        console.error('[EventLogger] ❌ Error logging event:', error.message);
    }
}

/**
 * Get recent events for the public feed
 * @param {number} limit - Maximum number of events to return (default: 50)
 * @param {number} offset - Number of events to skip (default: 0)
 * @returns {Promise<Object>} Object with events array and total count
 */
async function getRecentEvents(limit = 50, offset = 0) {
    try {
        // Get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM geolink_events`
        );
        const total = parseInt(countResult.rows[0]?.total || 0);

        // Get paginated events
        const result = await pool.query(
            `SELECT id, event_type, event_message, event_data, created_at
             FROM geolink_events
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return {
            events: result.rows,
            total,
            limit,
            offset
        };
    } catch (error) {
        // Check if table doesn't exist (migration not run)
        if (error.code === '42P01') {
            console.warn('[EventLogger] ⚠️ geolink_events table does not exist. Please run migration 006_add_geolink_events.sql');
        } else {
            console.error('[EventLogger] ❌ Error fetching events:', error.message);
        }
        return {
            events: [],
            total: 0,
            limit,
            offset
        };
    }
}

module.exports = {
    logEvent,
    getRecentEvents,
    fuzzLocation
};
