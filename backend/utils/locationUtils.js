/**
 * Location utilities for GPS-based proximity verification
 * Implements Haversine formula for accurate distance calculations
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - First latitude in decimal degrees
 * @param {number} lon1 - First longitude in decimal degrees
 * @param {number} lat2 - Second latitude in decimal degrees
 * @param {number} lon2 - Second longitude in decimal degrees
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
}

/**
 * Verify if user is within collection radius of an NFT
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @param {number} nftLat - NFT's latitude
 * @param {number} nftLon - NFT's longitude
 * @param {number} radiusMeters - Collection radius in meters (default: 10)
 * @returns {object} Verification result with distance and success status
 */
function verifyLocation(userLat, userLon, nftLat, nftLon, radiusMeters = 10) {
    // Ensure all coordinates are numbers
    const userLatNum = parseFloat(userLat);
    const userLonNum = parseFloat(userLon);
    const nftLatNum = parseFloat(nftLat);
    const nftLonNum = parseFloat(nftLon);
    const radiusNum = parseFloat(radiusMeters);
    
    const distance = calculateDistance(userLatNum, userLonNum, nftLatNum, nftLonNum);
    const isWithinRange = distance <= radiusNum;
    
    return {
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        isWithinRange,
        radiusMeters: radiusNum,
        userLocation: { lat: userLatNum, lon: userLonNum },
        nftLocation: { lat: nftLatNum, lon: nftLonNum }
    };
}

/**
 * Find all NFTs within a specified radius of a user's location
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @param {Array} nfts - Array of NFT objects with lat/lon properties
 * @param {number} maxRadius - Maximum search radius in meters (default: 1000)
 * @returns {Array} Array of NFTs within range with distance information
 */
function findNearbyNFTs(userLat, userLon, nfts, maxRadius = 1000) {
    return nfts
        .map(nft => {
            const distance = calculateDistance(userLat, userLon, nft.latitude, nft.longitude);
            return {
                ...nft,
                distance: Math.round(distance * 100) / 100,
                is_within_range: distance <= nft.radius_meters
            };
        })
        .filter(nft => nft.distance <= maxRadius)
        .sort((a, b) => a.distance - b.distance);
}

/**
 * Validate GPS coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if coordinates are valid
 */
function validateCoordinates(lat, lon) {
    return (
        typeof lat === 'number' && 
        typeof lon === 'number' &&
        lat >= -90 && lat <= 90 &&
        lon >= -180 && lon <= 180 &&
        !isNaN(lat) && !isNaN(lon)
    );
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Degrees to convert
 * @returns {number} Radians
 */
function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param {number} radians - Radians to convert
 * @returns {number} Degrees
 */
function radiansToDegrees(radians) {
    return radians * (180 / Math.PI);
}

/**
 * Calculate bearing between two points
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} Bearing in degrees (0-360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = degreesToRadians(lon2 - lon1);
    const lat1Rad = degreesToRadians(lat1);
    const lat2Rad = degreesToRadians(lat2);
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = radiansToDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360; // Normalize to 0-360
}

/**
 * Check if a time window requirement is met
 * @param {string} timeWindow - Time window string (e.g., "2024-01-01T00:00:00Z to 2024-12-31T23:59:59Z")
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {boolean} True if current time is within the window
 */
function checkTimeWindow(timeWindow, currentTime = new Date()) {
    if (!timeWindow || timeWindow === 'none') {
        return true;
    }
    
    try {
        const [startStr, endStr] = timeWindow.split(' to ');
        const startTime = new Date(startStr);
        const endTime = new Date(endStr);
        
        return currentTime >= startTime && currentTime <= endTime;
    } catch (error) {
        console.error('Error parsing time window:', error);
        return false;
    }
}

module.exports = {
    calculateDistance,
    verifyLocation,
    findNearbyNFTs,
    validateCoordinates,
    degreesToRadians,
    radiansToDegrees,
    calculateBearing,
    checkTimeWindow
};
