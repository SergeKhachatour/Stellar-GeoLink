/**
 * GeoLink Events Routes
 * Public API for fetching GeoLink Events feed
 */

const express = require('express');
const router = express.Router();
const { getRecentEvents } = require('../utils/eventLogger');

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get recent GeoLink events
 *     description: Returns recent public-friendly events for the GeoLink Events feed
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of events to return
 *     responses:
 *       200:
 *         description: List of recent events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       event_type:
 *                         type: string
 *                       event_message:
 *                         type: string
 *                       event_data:
 *                         type: object
 *                       created_at:
 *                         type: string
 *                         format: date-time
 */
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Default 20, max 100
        const offset = Math.max(parseInt(req.query.offset) || 0, 0); // Default 0, min 0
        const page = Math.max(parseInt(req.query.page) || 1, 1); // Default 1, min 1
        
        // Calculate offset from page if page is provided
        const calculatedOffset = req.query.page ? (page - 1) * limit : offset;
        
        const result = await getRecentEvents(limit, calculatedOffset);
        
        res.json({
            events: result.events,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                page: req.query.page ? page : Math.floor(result.offset / result.limit) + 1,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error('[Events] ❌ Error fetching events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
