/**
 * Location utilities for NFT system
 * Provides distance calculation and location verification functions
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

/**
 * Verify if user location is within NFT collection radius
 * @param {number} userLat - User latitude
 * @param {number} userLng - User longitude
 * @param {number} nftLat - NFT latitude
 * @param {number} nftLng - NFT longitude
 * @param {number} radiusMeters - Collection radius in meters
 * @returns {object} Verification result with distance and status
 */
function verifyLocation(userLat, userLng, nftLat, nftLng, radiusMeters) {
    const distance = calculateDistance(userLat, userLng, nftLat, nftLng);
    const isWithinRange = distance <= radiusMeters;
    
    return {
        isWithinRange,
        distance: Math.round(distance),
        radiusMeters,
        accuracy: Math.round((1 - Math.min(distance / radiusMeters, 1)) * 100) // Accuracy percentage
    };
}

/**
 * Get location accuracy based on GPS coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} accuracy - GPS accuracy in meters
 * @returns {object} Location accuracy information
 */
function getLocationAccuracy(lat, lng, accuracy) {
    return {
        coordinates: { lat, lng },
        accuracy: accuracy,
        isAccurate: accuracy <= 10, // Consider accurate if within 10 meters
        confidence: Math.max(0, Math.min(100, 100 - (accuracy / 10) * 10)) // Confidence percentage
    };
}

/**
 * Check if coordinates are valid
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if coordinates are valid
 */
function isValidCoordinates(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Format coordinates for display
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} precision - Decimal places
 * @returns {string} Formatted coordinates
 */
function formatCoordinates(lat, lng, precision = 6) {
    return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}

module.exports = {
    calculateDistance,
    verifyLocation,
    getLocationAccuracy,
    isValidCoordinates,
    formatCoordinates
};
