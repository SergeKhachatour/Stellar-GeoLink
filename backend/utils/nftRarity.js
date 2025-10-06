/**
 * NFT Rarity System
 * Defines different rarity levels and their collection requirements
 */

const NFT_RARITY = {
    COMMON: { 
        collectionRadius: 10, 
        requirements: 'none',
        color: '#4CAF50',
        description: 'Easy to collect, no special requirements',
        weight: 70, // 70% chance of spawning
        maxPerUser: 10 // Maximum NFTs of this rarity per user
    },
    RARE: { 
        collectionRadius: 10, 
        requirements: 'verified_location',
        color: '#2196F3',
        description: 'Requires verified GPS location',
        weight: 25, // 25% chance of spawning
        maxPerUser: 5 // Maximum NFTs of this rarity per user
    },
    LEGENDARY: { 
        collectionRadius: 10, 
        requirements: 'verified_location + time_window',
        color: '#9C27B0',
        description: 'Requires verified location within specific time window',
        weight: 5, // 5% chance of spawning
        maxPerUser: 1 // Maximum NFTs of this rarity per user
    }
};

/**
 * Get rarity configuration by level
 * @param {string} rarityLevel - The rarity level ('common', 'rare', 'legendary')
 * @returns {object} Rarity configuration object
 */
function getRarityConfig(rarityLevel) {
    const upperLevel = rarityLevel.toUpperCase();
    return NFT_RARITY[upperLevel] || NFT_RARITY.COMMON;
}

/**
 * Check if user meets requirements for collecting an NFT
 * @param {string} rarityLevel - The rarity level
 * @param {object} userLocation - User's GPS coordinates
 * @param {object} nftLocation - NFT's GPS coordinates
 * @param {object} rarityRequirements - Additional requirements from NFT
 * @param {object} userStats - User's collection statistics
 * @returns {object} Collection eligibility result
 */
function checkCollectionEligibility(rarityLevel, userLocation, nftLocation, rarityRequirements = {}, userStats = {}) {
    const config = getRarityConfig(rarityLevel);
    const result = {
        eligible: true,
        reasons: [],
        requirements: config.requirements
    };

    // Check if user has reached maximum for this rarity
    const userRarityCount = userStats[`${rarityLevel}_count`] || 0;
    if (userRarityCount >= config.maxPerUser) {
        result.eligible = false;
        result.reasons.push(`Maximum ${rarityLevel} NFTs reached (${config.maxPerUser})`);
    }

    // Check location verification requirement
    if (config.requirements.includes('verified_location')) {
        if (!userLocation || !userLocation.lat || !userLocation.lon) {
            result.eligible = false;
            result.reasons.push('Verified GPS location required');
        }
    }

    // Check time window requirement
    if (config.requirements.includes('time_window')) {
        const timeWindow = rarityRequirements.time_window;
        if (!timeWindow || timeWindow === 'none') {
            result.eligible = false;
            result.reasons.push('Time window requirement not specified');
        } else {
            const { checkTimeWindow } = require('./locationUtils');
            if (!checkTimeWindow(timeWindow)) {
                result.eligible = false;
                result.reasons.push('Current time is outside the allowed time window');
            }
        }
    }

    return result;
}

/**
 * Calculate spawn probability for an NFT based on rarity
 * @param {string} rarityLevel - The rarity level
 * @param {object} locationFactors - Location-based factors (population density, etc.)
 * @returns {number} Spawn probability (0-1)
 */
function calculateSpawnProbability(rarityLevel, locationFactors = {}) {
    const config = getRarityConfig(rarityLevel);
    let probability = config.weight / 100;

    // Adjust probability based on location factors
    if (locationFactors.populationDensity === 'high') {
        probability *= 1.5; // Higher spawn rate in populated areas
    } else if (locationFactors.populationDensity === 'low') {
        probability *= 0.5; // Lower spawn rate in remote areas
    }

    // Adjust for time of day (legendary NFTs more likely at night)
    if (rarityLevel === 'legendary') {
        const hour = new Date().getHours();
        if (hour >= 22 || hour <= 6) {
            probability *= 2; // Double chance at night
        }
    }

    return Math.min(probability, 1); // Cap at 100%
}

/**
 * Generate rarity requirements for a new NFT
 * @param {string} rarityLevel - The rarity level
 * @param {object} options - Additional options
 * @returns {object} Rarity requirements object
 */
function generateRarityRequirements(rarityLevel, options = {}) {
    const config = getRarityConfig(rarityLevel);
    const requirements = {};

    if (config.requirements.includes('time_window')) {
        // Generate a random time window (1-7 days from now)
        const startTime = new Date();
        const endTime = new Date();
        endTime.setDate(endTime.getDate() + Math.floor(Math.random() * 7) + 1);
        
        requirements.time_window = `${startTime.toISOString()} to ${endTime.toISOString()}`;
    }

    if (config.requirements.includes('verified_location')) {
        requirements.location_verification = true;
    }

    return requirements;
}

/**
 * Get all rarity levels
 * @returns {Array} Array of rarity level objects
 */
function getAllRarityLevels() {
    return Object.keys(NFT_RARITY).map(key => ({
        level: key.toLowerCase(),
        ...NFT_RARITY[key]
    }));
}

/**
 * Get rarity statistics for analytics
 * @param {Array} nfts - Array of NFT objects
 * @returns {object} Rarity statistics
 */
function getRarityStatistics(nfts) {
    const stats = {
        total: nfts.length,
        byRarity: {},
        percentages: {}
    };

    // Initialize counters
    Object.keys(NFT_RARITY).forEach(key => {
        stats.byRarity[key.toLowerCase()] = 0;
        stats.percentages[key.toLowerCase()] = 0;
    });

    // Count NFTs by rarity
    nfts.forEach(nft => {
        const rarity = nft.rarity_level || 'common';
        if (stats.byRarity[rarity] !== undefined) {
            stats.byRarity[rarity]++;
        }
    });

    // Calculate percentages
    Object.keys(stats.byRarity).forEach(rarity => {
        stats.percentages[rarity] = stats.total > 0 
            ? Math.round((stats.byRarity[rarity] / stats.total) * 100) 
            : 0;
    });

    return stats;
}

module.exports = {
    NFT_RARITY,
    getRarityConfig,
    checkCollectionEligibility,
    calculateSpawnProbability,
    generateRarityRequirements,
    getAllRarityLevels,
    getRarityStatistics
};
