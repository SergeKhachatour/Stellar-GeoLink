const express = require('express');
const router = express.Router();
const { findNearbyLocations, calculateDistance, getBoundingBox, performDBSCAN, getGeospatialStats } = require('../utils/postgisUtils-simple');
const { authenticateUser } = require('../middleware/authUser');

/**
 * @swagger
 * components:
 *   schemas:
 *     GeospatialLocation:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         public_key:
 *           type: string
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         distance_meters:
 *           type: number
 *         location_wkt:
 *           type: string
 *     GeospatialStats:
 *       type: object
 *       properties:
 *         total_locations:
 *           type: integer
 *         bounding_box:
 *           type: string
 *         geographic_center:
 *           type: string
 *         coverage_area:
 *           type: number
 */

/**
 * @swagger
 * /api/geospatial/nearby:
 *   get:
 *     summary: Find locations within radius using PostGIS Geography
 *     description: Uses PostGIS Geography column for high-performance geospatial queries
 *     tags: [Geospatial]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center latitude
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center longitude
 *       - in: query
 *         name: radius
 *         required: false
 *         schema:
 *           type: number
 *           default: 1000
 *         description: Search radius in meters
 *     responses:
 *       200:
 *         description: Locations found within radius
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 locations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GeospatialLocation'
 *                 count:
 *                   type: integer
 *                 search_center:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     radius:
 *                       type: number
 */
// Make nearby endpoint public for AI chat (no authentication required)
router.get('/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 1000 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        const result = await findNearbyLocations(
            parseFloat(latitude), 
            parseFloat(longitude), 
            parseFloat(radius)
        );

        // findNearbyLocations returns an array directly, not an object with rows
        const locations = Array.isArray(result) ? result : (result?.rows || []);

        res.json({
            locations: locations,
            count: locations.length,
            search_center: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                radius: parseFloat(radius)
            }
        });
    } catch (error) {
        console.error('Error finding nearby locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/geospatial/nearest:
 *   get:
 *     summary: Find nearest location to a point
 *     description: Uses PostGIS Geography to find the closest location
 *     tags: [Geospatial]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center latitude
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Center longitude
 *     responses:
 *       200:
 *         description: Nearest location found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeospatialLocation'
 */
router.get('/nearest', authenticateUser, async (req, res) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        const result = await findNearbyLocations(
            parseFloat(latitude), 
            parseFloat(longitude), 
            10000 // 10km radius for nearest location
        );

        // findNearbyLocations returns an array directly, not an object with rows
        const locations = Array.isArray(result) ? result : (result?.rows || []);

        if (locations.length === 0) {
            return res.status(404).json({ error: 'No locations found' });
        }

        res.json(locations[0]);
    } catch (error) {
        console.error('Error finding nearest location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/geospatial/distance:
 *   get:
 *     summary: Calculate distance between two points
 *     description: Uses PostGIS Geography for accurate distance calculation
 *     tags: [Geospatial]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat1
 *         required: true
 *         schema:
 *           type: number
 *         description: First point latitude
 *       - in: query
 *         name: lon1
 *         required: true
 *         schema:
 *           type: number
 *         description: First point longitude
 *       - in: query
 *         name: lat2
 *         required: true
 *         schema:
 *           type: number
 *         description: Second point latitude
 *       - in: query
 *         name: lon2
 *         required: true
 *         schema:
 *           type: number
 *         description: Second point longitude
 *     responses:
 *       200:
 *         description: Distance calculated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 distance_meters:
 *                   type: number
 *                 distance_km:
 *                   type: number
 */
router.get('/distance', authenticateUser, async (req, res) => {
    try {
        const { lat1, lon1, lat2, lon2 } = req.query;

        if (!lat1 || !lon1 || !lat2 || !lon2) {
            return res.status(400).json({ error: 'All coordinates are required' });
        }

        const distance = await calculateDistance(
            parseFloat(lat1), 
            parseFloat(lon1), 
            parseFloat(lat2), 
            parseFloat(lon2)
        );

        const distanceMeters = parseFloat(distance);
        const distanceKm = distanceMeters / 1000;

        res.json({
            distance_meters: distanceMeters,
            distance_km: distanceKm
        });
    } catch (error) {
        console.error('Error calculating distance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/geospatial/stats:
 *   get:
 *     summary: Get geospatial statistics
 *     description: Returns comprehensive geospatial statistics for all locations
 *     tags: [Geospatial]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Geospatial statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeospatialStats'
 */
router.get('/stats', authenticateUser, async (req, res) => {
    try {
        const result = await getGeospatialStats();
        res.json(result);
    } catch (error) {
        console.error('Error getting geospatial stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/geospatial/migrate:
 *   post:
 *     summary: Migrate existing lat/lon data to geography column
 *     description: Updates the geography column for all existing records
 *     tags: [Geospatial]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Migration completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 migrated_count:
 *                   type: integer
 */
router.post('/migrate', authenticateUser, async (req, res) => {
    try {
        // Migration function not available in simple version
        res.json({ 
            success: true,
            message: 'Migration not available in simple version',
            migrated_count: 0
        });
    } catch (error) {
        console.error('Error migrating to geography:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
