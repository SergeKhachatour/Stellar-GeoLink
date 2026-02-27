/**
 * Anchor Events Utility
 * Provides functions for generating cell IDs, event IDs, and anchor events
 * for event-boundary anchoring in GeoTrust
 */

const crypto = require('crypto');

/**
 * Calculate cell_id from latitude and longitude using a geospatial grid
 * Uses a grid system with configurable precision (default: ~100m cells)
 * 
 * @param {number} latitude - Latitude (-90 to 90)
 * @param {number} longitude - Longitude (-180 to 180)
 * @param {number} precision - Grid precision in degrees (default: 0.001, ~100m)
 * @returns {string} Cell ID string (e.g., "34.230_118.232")
 */
function calculateCellId(latitude, longitude, precision = 0.001) {
    // Round to grid precision
    const latCell = Math.floor(latitude / precision) * precision;
    const lonCell = Math.floor(longitude / precision) * precision;
    
    // Format as string with fixed precision
    const latStr = latCell.toFixed(6);
    const lonStr = lonCell.toFixed(6);
    
    return `${latStr}_${lonStr}`;
}

/**
 * Generate deterministic event ID using SHA-256 hash
 * Formula: sha256(account + event_type + occurred_at_bucket + cell_id + (rule_id || ''))
 * 
 * @param {string} account - Public key or account identifier
 * @param {string} eventType - Event type (CELL_TRANSITION, RULE_TRIGGERED, CHECKPOINT)
 * @param {string} occurredAtBucket - Time bucket (ISO timestamp rounded to nearest minute)
 * @param {string} cellId - Cell ID
 * @param {string} ruleId - Optional rule ID (for RULE_TRIGGERED events)
 * @returns {string} Hexadecimal hash of the event ID
 */
function generateEventId(account, eventType, occurredAtBucket, cellId, ruleId = '') {
    const input = `${account}${eventType}${occurredAtBucket}${cellId}${ruleId}`;
    return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Round timestamp to nearest minute for stable event ID generation
 * 
 * @param {Date|string} timestamp - ISO timestamp or Date object
 * @returns {string} ISO timestamp rounded to nearest minute
 */
function roundToNearestMinute(timestamp) {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const rounded = new Date(date);
    rounded.setSeconds(0, 0); // Round to nearest minute
    return rounded.toISOString();
}

/**
 * Create a CELL_TRANSITION event
 * 
 * @param {string} account - Public key
 * @param {string} cellId - Current cell ID
 * @param {string} prevCellId - Previous cell ID
 * @param {Date|string} occurredAt - Timestamp
 * @param {string} commitment - Optional commitment hash
 * @returns {object} Anchor event object
 */
function createCellTransitionEvent(account, cellId, prevCellId, occurredAt, commitment = null) {
    const occurredAtBucket = roundToNearestMinute(occurredAt);
    const eventId = generateEventId(account, 'CELL_TRANSITION', occurredAtBucket, cellId);
    
    return {
        event_id: eventId,
        event_type: 'CELL_TRANSITION',
        occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
        cell_id: cellId,
        prev_cell_id: prevCellId,
        commitment: commitment || '0x0000000000000000000000000000000000000000000000000000000000000000',
        zk_proof: null
    };
}

/**
 * Create a RULE_TRIGGERED event
 * 
 * @param {string} account - Public key
 * @param {string} cellId - Current cell ID
 * @param {string|number} ruleId - Rule ID
 * @param {Date|string} occurredAt - Timestamp
 * @param {string} commitment - Optional commitment hash
 * @returns {object} Anchor event object
 */
function createRuleTriggeredEvent(account, cellId, ruleId, occurredAt, commitment = null) {
    const ruleIdStr = String(ruleId);
    const occurredAtBucket = roundToNearestMinute(occurredAt);
    const eventId = generateEventId(account, 'RULE_TRIGGERED', occurredAtBucket, cellId, ruleIdStr);
    
    return {
        event_id: eventId,
        event_type: 'RULE_TRIGGERED',
        occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
        cell_id: cellId,
        rule_id: ruleIdStr,
        commitment: commitment || '0x0000000000000000000000000000000000000000000000000000000000000000',
        zk_proof: null
    };
}

/**
 * Create a CHECKPOINT event
 * 
 * @param {string} account - Public key
 * @param {string} cellId - Current cell ID
 * @param {Date|string} occurredAt - Timestamp
 * @param {string} commitment - Optional commitment hash
 * @returns {object} Anchor event object
 */
function createCheckpointEvent(account, cellId, occurredAt, commitment = null) {
    const occurredAtBucket = roundToNearestMinute(occurredAt);
    const eventId = generateEventId(account, 'CHECKPOINT', occurredAtBucket, cellId);
    
    return {
        event_id: eventId,
        event_type: 'CHECKPOINT',
        occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
        cell_id: cellId,
        commitment: commitment || '0x0000000000000000000000000000000000000000000000000000000000000000000',
        zk_proof: null
    };
}

module.exports = {
    calculateCellId,
    generateEventId,
    roundToNearestMinute,
    createCellTransitionEvent,
    createRuleTriggeredEvent,
    createCheckpointEvent
};
