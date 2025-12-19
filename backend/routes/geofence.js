const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const axios = require('axios');
const { validateConsumerApiKey } = require('../middleware/apiKey');
const { authenticateUser, requireAuth } = require('../middleware/authUser');
const geofenceService = require('../services/geofence');

// Mapbox Geocoding API
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.REACT_APP_MAPBOX_TOKEN;

// Helper function to generate circular polygon from center point and radius
function generateCircularPolygon(latitude, longitude, radiusMeters) {
  const numPoints = 32;
  const points = [];
  
  const latRadius = radiusMeters / 111320;
  const lonRadius = radiusMeters / (111320 * Math.cos(latitude * Math.PI / 180));
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 360 / numPoints) * (Math.PI / 180);
    const lat = latitude + latRadius * Math.cos(angle);
    const lon = longitude + lonRadius * Math.sin(angle);
    points.push([lon, lat]); // GeoJSON format: [longitude, latitude]
  }
  
  return {
    type: 'Polygon',
    coordinates: [points]
  };
}

// Middleware to handle both API key and JWT authentication
const authenticateGeofence = async (req, res, next) => {
  // Try API key first (for data consumers)
  const apiKey = req.header('X-API-Key');
  if (apiKey) {
    return validateConsumerApiKey(req, res, next);
  }
  
  // Fall back to JWT authentication (for other roles)
  await authenticateUser(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  });
};

// Helper to get user ID from request (works for both API key and JWT)
const getUserId = (req) => {
  if (req.consumerId) {
    // For data consumers, we need to get user_id from data_consumers table
    return req.userId || null;
  }
  return req.user?.id || null;
};

/**
 * @swagger
 * /api/geofence:
 *   post:
 *     summary: Create a new geofence
 *     tags: [Geofences]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - polygon
 *               - blockchain
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the geofence
 *               description:
 *                 type: string
 *                 description: Description of the geofence
 *               polygon:
 *                 type: object
 *                 description: GeoJSON polygon coordinates
 *               blockchain:
 *                 type: string
 *                 description: Blockchain type (e.g., stellar)
 *               webhook_url:
 *                 type: string
 *                 description: Webhook URL for notifications
 *     responses:
 *       201:
 *         description: Geofence created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 polygon:
 *                   type: object
 *                 blockchain:
 *                   type: string
 *                 webhook_url:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
// Create a new geofence (supports both API key and JWT authentication)
router.post('/', authenticateGeofence, async (req, res) => {
    const { name, description, polygon, blockchain, webhook_url, latitude, longitude, radius, placeName } = req.body;

    if (!name || !blockchain) {
        return res.status(400).json({ error: 'Missing required fields: name and blockchain are required' });
    }

    // Validate that either polygon OR (latitude + longitude) OR placeName is provided
    if (!polygon && (latitude === undefined || longitude === undefined) && !placeName) {
        return res.status(400).json({ 
            error: 'Either polygon (GeoJSON), latitude/longitude/radius, or placeName must be provided' 
        });
    }

    try {
        let geofencePolygon = polygon;
        let finalLatitude = latitude;
        let finalLongitude = longitude;
        
        // If place name is provided, geocode it first
        if (placeName && !latitude && !longitude && !polygon) {
            if (!MAPBOX_TOKEN) {
                return res.status(500).json({ 
                    error: 'Mapbox token not configured. Place name geocoding is not available.' 
                });
            }
            
            try {
                const geocodeResponse = await axios.get(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeName)}.json`,
                    {
                        params: {
                            access_token: MAPBOX_TOKEN,
                            limit: 1,
                            types: 'place,poi,address,neighborhood,locality'
                        }
                    }
                );
                
                if (!geocodeResponse.data.features || geocodeResponse.data.features.length === 0) {
                    return res.status(400).json({ 
                        error: `Could not find location: ${placeName}. Please try a more specific place name.` 
                    });
                }
                
                const feature = geocodeResponse.data.features[0];
                [finalLongitude, finalLatitude] = feature.center;
                
                // Update description to include the geocoded place name if not already set
                if (!description) {
                    description = `Geofence for ${feature.place_name || placeName}`;
                }
            } catch (geocodeError) {
                return res.status(400).json({ 
                    error: `Failed to geocode place name "${placeName}": ${geocodeError.response?.data?.message || geocodeError.message}` 
                });
            }
        }
        
        // If latitude and longitude are provided (or geocoded), generate a circular polygon
        if (finalLatitude !== undefined && finalLongitude !== undefined && !polygon) {
            const radiusMeters = radius || 1000;
            geofencePolygon = generateCircularPolygon(finalLatitude, finalLongitude, radiusMeters);
        }

        // Validate polygon format
        if (!geofencePolygon || !geofencePolygon.type || geofencePolygon.type !== 'Polygon') {
            return res.status(400).json({ 
                error: 'Invalid polygon format. Must be a GeoJSON Polygon object with type "Polygon" and coordinates array' 
            });
        }

        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        // Insert geofence - support both data_consumer_id (for API key) and user_id (for JWT)
        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = `INSERT INTO geofences 
                (name, description, polygon, blockchain, webhook_url, data_consumer_id, user_id)
                VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4, $5, $6, $7)
                RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url, created_at, updated_at`;
            params = [name, description, JSON.stringify(geofencePolygon), blockchain, webhook_url, req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = `INSERT INTO geofences 
                (name, description, polygon, blockchain, webhook_url, user_id)
                VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4, $5, $6)
                RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url, created_at, updated_at`;
            params = [name, description, JSON.stringify(geofencePolygon), blockchain, webhook_url, userId];
        }

        const result = await pool.query(query, params);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating geofence:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get all geofences for the user (supports both API key and JWT authentication)
router.get('/', authenticateGeofence, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE data_consumer_id = $1 OR user_id = $2
            ORDER BY created_at DESC`;
            params = [req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE user_id = $1
            ORDER BY created_at DESC`;
            params = [userId];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching geofences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific geofence (supports both API key and JWT authentication)
router.get('/:id', authenticateGeofence, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE id = $1 AND (data_consumer_id = $2 OR user_id = $3)`;
            params = [req.params.id, req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = `SELECT 
                id, 
                name, 
                description, 
                ST_AsGeoJSON(polygon)::json as polygon,
                blockchain,
                webhook_url,
                created_at,
                updated_at
            FROM geofences
            WHERE id = $1 AND user_id = $2`;
            params = [req.params.id, userId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a geofence (supports both API key and JWT authentication)
router.put('/:id', authenticateGeofence, async (req, res) => {
    const { name, description, polygon, blockchain, webhook_url, latitude, longitude, radius } = req.body;

    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        let geofencePolygon = polygon;
        
        // If latitude and longitude are provided, generate a circular polygon
        if (latitude !== undefined && longitude !== undefined && !polygon) {
            const radiusMeters = radius || 1000;
            geofencePolygon = generateCircularPolygon(latitude, longitude, radiusMeters);
        }

        // Validate polygon format if provided
        if (geofencePolygon && (!geofencePolygon.type || geofencePolygon.type !== 'Polygon')) {
            return res.status(400).json({ 
                error: 'Invalid polygon format. Must be a GeoJSON Polygon object with type "Polygon" and coordinates array' 
            });
        }

        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = `UPDATE geofences 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                polygon = CASE WHEN $3::json IS NOT NULL THEN ST_GeomFromGeoJSON($3) ELSE polygon END,
                blockchain = COALESCE($4, blockchain),
                webhook_url = COALESCE($5, webhook_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND (data_consumer_id = $7 OR user_id = $8)
            RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url, created_at, updated_at`;
            params = [name, description, geofencePolygon ? JSON.stringify(geofencePolygon) : null, blockchain, webhook_url, req.params.id, req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = `UPDATE geofences 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                polygon = CASE WHEN $3::json IS NOT NULL THEN ST_GeomFromGeoJSON($3) ELSE polygon END,
                blockchain = COALESCE($4, blockchain),
                webhook_url = COALESCE($5, webhook_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND user_id = $7
            RETURNING id, name, description, ST_AsGeoJSON(polygon)::json as polygon, blockchain, webhook_url, created_at, updated_at`;
            params = [name, description, geofencePolygon ? JSON.stringify(geofencePolygon) : null, blockchain, webhook_url, req.params.id, userId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a geofence (supports both API key and JWT authentication)
router.delete('/:id', authenticateGeofence, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = 'DELETE FROM geofences WHERE id = $1 AND (data_consumer_id = $2 OR user_id = $3) RETURNING id';
            params = [req.params.id, req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = 'DELETE FROM geofences WHERE id = $1 AND user_id = $2 RETURNING id';
            params = [req.params.id, userId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting geofence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get geofence events (supports both API key and JWT authentication)
router.get('/:id/events', authenticateGeofence, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ error: 'Unable to determine user ID' });
        }

        let query, params;
        if (req.consumerId) {
            // Data consumer using API key
            query = `SELECT 
                ge.id,
                ge.event_type,
                ge.wallet_public_key,
                ge.blockchain,
                ge.latitude,
                ge.longitude,
                ge.created_at
            FROM geofence_events ge
            JOIN geofences g ON g.id = ge.geofence_id
            WHERE g.id = $1 AND (g.data_consumer_id = $2 OR g.user_id = $3)
            ORDER BY ge.created_at DESC
            LIMIT 100`;
            params = [req.params.id, req.consumerId, userId];
        } else {
            // Other roles using JWT
            query = `SELECT 
                ge.id,
                ge.event_type,
                ge.wallet_public_key,
                ge.blockchain,
                ge.latitude,
                ge.longitude,
                ge.created_at
            FROM geofence_events ge
            JOIN geofences g ON g.id = ge.geofence_id
            WHERE g.id = $1 AND g.user_id = $2
            ORDER BY ge.created_at DESC
            LIMIT 100`;
            params = [req.params.id, userId];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching geofence events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 