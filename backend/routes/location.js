const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');
const { logEvent, fuzzLocation } = require('../utils/eventLogger');
const {
    calculateCellId,
    createCellTransitionEvent,
    createRuleTriggeredEvent,
    createCheckpointEvent
} = require('../utils/anchorEvents');

// Basic API key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        // First check wallet_providers (using JOIN with api_keys table)
        const providerResult = await pool.query(
            `SELECT wp.id, wp.user_id FROM wallet_providers wp
             JOIN api_keys ak ON ak.id = wp.api_key_id
             WHERE ak.api_key = $1 AND wp.status = true`,
            [apiKey]
        );

        if (providerResult.rows.length > 0) {
            req.providerId = providerResult.rows[0].id;
            req.userId = providerResult.rows[0].user_id;
            req.userType = 'wallet_provider';
            return next();
        }

        // Then check data_consumers (they use api_keys table directly)
        const consumerResult = await pool.query(
            `SELECT dc.id, ak.user_id FROM data_consumers dc
             JOIN api_keys ak ON ak.user_id = dc.user_id
             WHERE ak.api_key = $1 AND dc.status = true`,
            [apiKey]
        );

        if (consumerResult.rows.length > 0) {
            req.consumerId = consumerResult.rows[0].id;
            req.userId = consumerResult.rows[0].user_id;
            req.userType = 'data_consumer';
            return next();
        }

        return res.status(401).json({ error: 'Invalid or inactive API key' });
    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * @swagger
 * /api/location/nearby:
 *   get:
 *     summary: Find wallets near a location
 *     description: Returns wallet locations within a specified radius of given coordinates
 *     tags: [Location]
 *     security:
 *       - DataConsumerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *           minimum: -90
 *           maximum: 90
 *         description: Latitude of the center point (-90 to 90)
 *         example: 40.7128
 *       - in: query
 *         name: lon
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *           minimum: -180
 *           maximum: 180
 *         description: Longitude of the center point (-180 to 180)
 *         example: -74.0060
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 100000
 *         description: Search radius in meters (default 1000)
 *         example: 1000
 *     responses:
 *       200:
 *         description: List of nearby wallet locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   public_key:
 *                     type: string
 *                     example: "GABC123..."
 *                   blockchain:
 *                     type: string
 *                     example: "Stellar"
 *                   latitude:
 *                     type: number
 *                     example: 40.7128
 *                   longitude:
 *                     type: number
 *                     example: -74.0060
 *                   last_updated:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-01-15T10:30:00Z"
 *                   provider_name:
 *                     type: string
 *                     example: "XYZ Wallet"
 */
// Nearby endpoint - supports both JWT and API key authentication
// Try JWT first (optional), then API key if JWT not available
const authenticateNearbyOptional = async (req, res, next) => {
    // authenticateUser already ran (it's optional and sets req.user = null if no token)
    // If user is authenticated via JWT, proceed
    if (req.user && req.user.id) {
        req.userId = req.user.id;
        return next();
    }
    
    // Fall back to API key authentication
    return authenticateApiKey(req, res, next);
};

router.get('/nearby', authenticateUser, authenticateNearbyOptional, async (req, res) => {
    const { lat, lon, radius } = req.query;
    
    if (!lat || !lon || !radius) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        // Check if privacy and visibility settings tables exist
        const privacyTableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_privacy_settings'
        `);
        const hasPrivacySettings = privacyTableCheck.rows.length > 0;
        
        const visibilityTableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_visibility_settings'
        `);
        const hasVisibilitySettings = visibilityTableCheck.rows.length > 0;
        
        // Build privacy and visibility filters
        let privacyFilter = '';
        let visibilityFilter = '';
        let joinClause = '';
        
        if (hasPrivacySettings && hasVisibilitySettings) {
            joinClause = `
                LEFT JOIN user_privacy_settings ups ON w.public_key = ups.public_key AND wp.user_id = ups.user_id
                LEFT JOIN user_visibility_settings uvs ON w.public_key = uvs.public_key AND wp.user_id = uvs.user_id
            `;
            // If settings don't exist (NULL), allow visibility (backward compatibility)
            // If settings exist, require: location_sharing = true AND privacy_level = 'public'
            // AND show_location = true AND visibility_level = 'public'
            privacyFilter = `AND (ups.public_key IS NULL OR (ups.location_sharing = true AND ups.privacy_level = 'public'))`;
            visibilityFilter = `AND (uvs.public_key IS NULL OR (uvs.show_location = true AND uvs.visibility_level = 'public'))`;
        } else if (hasPrivacySettings) {
            joinClause = `LEFT JOIN user_privacy_settings ups ON w.public_key = ups.public_key AND wp.user_id = ups.user_id`;
            privacyFilter = `AND (ups.public_key IS NULL OR (ups.location_sharing = true AND ups.privacy_level = 'public'))`;
        } else if (hasVisibilitySettings) {
            joinClause = `LEFT JOIN user_visibility_settings uvs ON w.public_key = uvs.public_key AND wp.user_id = uvs.user_id`;
            visibilityFilter = `AND (uvs.public_key IS NULL OR (uvs.show_location = true AND uvs.visibility_level = 'public'))`;
        }
        
        const result = await pool.query(
            `SELECT 
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.last_updated,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            ${joinClause}
            WHERE w.location_enabled = true
            AND ST_DWithin(
                ST_MakePoint(w.longitude, w.latitude)::geography,
                ST_MakePoint($1, $2)::geography,
                $3
            )
            ${privacyFilter}
            ${visibilityFilter}`,
            [lon, lat, radius]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching nearby locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/location/update:
 *   post:
 *     summary: Update wallet location
 *     description: Update or create a wallet location entry
 *     tags: [Location]
 *     security:
 *       - WalletProviderAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - public_key
 *               - blockchain
 *               - latitude
 *               - longitude
 *             properties:
 *               public_key:
 *                 type: string
 *                 description: Stellar wallet public key
 *                 example: "GABC123..."
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "Stellar"
 *               latitude:
 *                 type: number
 *                 format: float
 *                 description: Latitude coordinate (-90 to 90)
 *                 example: 40.7128
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 format: float
 *                 description: Longitude coordinate (-180 to 180)
 *                 example: -74.0060
 *                 minimum: -180
 *                 maximum: 180
 *               wallet_type_id:
 *                 type: integer
 *                 description: Wallet type ID
 *                 example: 1
 *               description:
 *                 type: string
 *                 description: Location description
 *                 example: "User wallet location"
 *     responses:
 *       200:
 *         description: Location updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   description: Success indicator (GeoTrust format)
 *                   example: true
 *                 cell_id:
 *                   type: string
 *                   description: Current geospatial cell ID
 *                   example: "34.230000_-118.232000"
 *                 matched_rules:
 *                   type: array
 *                   description: Array of matched location-based rules
 *                   items:
 *                     type: object
 *                     properties:
 *                       rule_id:
 *                         type: string
 *                         example: "123"
 *                       rule_name:
 *                         type: string
 *                         example: "Entered restricted zone"
 *                       rule_type:
 *                         type: string
 *                         example: "location"
 *                 anchor_events:
 *                   type: array
 *                   description: Array of events to anchor on-chain (GeoTrust event-boundary anchoring)
 *                   items:
 *                     type: object
 *                     properties:
 *                       event_id:
 *                         type: string
 *                         description: Deterministic SHA-256 hash of the event
 *                         example: "a1b2c3d4e5f6..."
 *                       event_type:
 *                         type: string
 *                         enum: [CELL_TRANSITION, RULE_TRIGGERED, CHECKPOINT]
 *                         example: "CELL_TRANSITION"
 *                       occurred_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00Z"
 *                       cell_id:
 *                         type: string
 *                         example: "34.230000_-118.232000"
 *                       prev_cell_id:
 *                         type: string
 *                         description: Previous cell ID (for CELL_TRANSITION events)
 *                         example: "34.229000_-118.231000"
 *                       rule_id:
 *                         type: string
 *                         description: Rule ID (for RULE_TRIGGERED events)
 *                         example: "123"
 *                       commitment:
 *                         type: string
 *                         description: Hash of off-chain evidence (optional)
 *                         example: "0x0000000000000000000000000000000000000000000000000000000000000000"
 *                       zk_proof:
 *                         type: string
 *                         description: Zero-knowledge proof (optional, currently null)
 *                         nullable: true
 *                 next_suggested_anchor_after_secs:
 *                   type: integer
 *                   description: Optional hint for next anchor (not yet implemented)
 *                   nullable: true
 *                 success:
 *                   type: boolean
 *                   description: Legacy success indicator (backward compatibility)
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: Legacy message (backward compatibility)
 *                   example: "Location updated successfully"
 *                 data:
 *                   type: object
 *                   description: Legacy data object (backward compatibility)
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Access denied - wallet provider role required
 *       500:
 *         description: Internal server error
 */
router.post('/update', authenticateApiKey, async (req, res) => {
    if (req.userType !== 'wallet_provider') {
        return res.status(403).json({ error: 'Only wallet providers can update locations' });
    }

    const { public_key, blockchain, latitude, longitude, wallet_type_id, description } = req.body;
    
    if (!public_key || !blockchain || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields: public_key, blockchain, latitude, longitude' });
    }

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: 'Latitude and longitude must be valid numbers' });
    }

    if (latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
    }

    if (longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
    }

    try {
        // Get default wallet type if not provided
        let walletTypeId = wallet_type_id;
        if (!walletTypeId) {
            const defaultType = await pool.query('SELECT id FROM wallet_types ORDER BY id LIMIT 1');
            walletTypeId = defaultType.rows[0]?.id || 1;
        }

        // PUBLIC-FRIENDLY LOG: Location update received (for GeoLink Events feed)
        const eventMessage = `📍 Location update received: ${public_key.substring(0, 8)}... at (${latitude}, ${longitude})`;
        console.log(`[GeoLink Events] ${eventMessage}`);
        // Also log to database for public events feed
        await logEvent('location_update', eventMessage, {
            truncated_public_key: `${public_key.substring(0, 8)}...`,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude)
        });

        // Calculate current cell_id
        const currentCellId = calculateCellId(parseFloat(latitude), parseFloat(longitude));
        const occurredAt = new Date();

        // Get previous location to detect cell transitions
        // Query current wallet_locations table (before update) to get previous cell
        let prevCellId = null;
        try {
            const prevLocationResult = await pool.query(
                `SELECT latitude, longitude 
                 FROM wallet_locations
                 WHERE public_key = $1 AND blockchain = $2
                 LIMIT 1`,
                [public_key, blockchain]
            );
            
            if (prevLocationResult.rows.length > 0 && 
                prevLocationResult.rows[0].latitude !== null && 
                prevLocationResult.rows[0].longitude !== null) {
                const prevLoc = prevLocationResult.rows[0];
                prevCellId = calculateCellId(
                    parseFloat(prevLoc.latitude),
                    parseFloat(prevLoc.longitude)
                );
            }
        } catch (prevError) {
            // If location doesn't exist or query fails, prevCellId remains null
            // This is fine for first-time location updates
            console.warn('⚠️  Could not get previous location:', prevError.message);
        }

        // Get matched rules synchronously for anchor events
        let matchedRules = [];
        try {
            const rulesResult = await pool.query(
                `SELECT cer.id, cer.rule_name, cer.rule_type
                 FROM contract_execution_rules cer
                 JOIN custom_contracts cc ON cer.contract_id = cc.id
                 WHERE cer.is_active = true
                   AND cc.is_active = true
                   AND (
                     cer.target_wallet_public_key IS NULL 
                     OR cer.target_wallet_public_key = $3
                   )
                   AND (
                     -- Location-based rules
                     (cer.rule_type = 'location' 
                      AND cer.center_latitude IS NOT NULL 
                      AND cer.center_longitude IS NOT NULL
                      AND cer.radius_meters IS NOT NULL
                      AND ST_DWithin(
                        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                        ST_SetSRID(ST_MakePoint(cer.center_longitude, cer.center_latitude), 4326)::geography,
                        cer.radius_meters
                      ))
                     OR
                     -- Geofence-based rules
                     (cer.rule_type = 'geofence' AND cer.geofence_id IS NOT NULL AND
                      EXISTS (
                        SELECT 1 FROM geofences g
                        WHERE g.id = cer.geofence_id
                          AND ST_Within(
                            ST_SetSRID(ST_MakePoint($2, $1), 4326),
                            g.boundary
                          )
                      ))
                     OR
                     -- Proximity-based rules
                     (cer.rule_type = 'proximity' 
                      AND cer.center_latitude IS NOT NULL 
                      AND cer.center_longitude IS NOT NULL
                      AND cer.radius_meters IS NOT NULL
                      AND ST_DWithin(
                        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                        ST_SetSRID(ST_MakePoint(cer.center_longitude, cer.center_latitude), 4326)::geography,
                        cer.radius_meters
                      ))
                   )
                 ORDER BY cer.created_at ASC`,
                [parseFloat(latitude), parseFloat(longitude), public_key]
            );
            matchedRules = rulesResult.rows;
        } catch (rulesError) {
            console.warn('⚠️  Error getting matched rules for anchor events:', rulesError.message);
        }

        // Generate anchor events
        const anchorEvents = [];

        // 1. Cell transition event (if cell changed)
        if (prevCellId && prevCellId !== currentCellId) {
            const transitionEvent = createCellTransitionEvent(
                public_key,
                currentCellId,
                prevCellId,
                occurredAt
            );
            anchorEvents.push(transitionEvent);
        }

        // 2. Rule triggered events (for each matched rule)
        // Check which rule events have already been returned to prevent duplicates
        const returnedEventIds = new Set();
        try {
            const returnedEventsResult = await pool.query(
                `SELECT event_id 
                 FROM anchor_events_returned 
                 WHERE public_key = $1 AND blockchain = $2
                   AND returned_at > NOW() - INTERVAL '1 hour'`,
                [public_key, blockchain]
            );
            returnedEventsResult.rows.forEach(row => returnedEventIds.add(row.event_id));
        } catch (trackError) {
            // Table might not exist yet, that's okay - we'll create it if needed
            console.warn('⚠️  Could not check returned events (table may not exist):', trackError.message);
        }

        // Generate rule triggered events for new rule matches
        for (const rule of matchedRules) {
            const ruleEvent = createRuleTriggeredEvent(
                public_key,
                currentCellId,
                rule.id,
                occurredAt
            );
            
            // Only add if we haven't returned this event recently
            if (!returnedEventIds.has(ruleEvent.event_id)) {
                anchorEvents.push(ruleEvent);
                
                // Track that we're returning this event
                try {
                    await pool.query(
                        `INSERT INTO anchor_events_returned (public_key, blockchain, event_id, returned_at)
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (public_key, blockchain, event_id) 
                         DO UPDATE SET returned_at = NOW()`,
                        [public_key, blockchain, ruleEvent.event_id]
                    );
                } catch (trackError) {
                    // Table might not exist, log but don't fail
                    console.warn('⚠️  Could not track returned event:', trackError.message);
                }
            }
        }

        // 3. Checkpoint events (periodic anchoring)
        // Generate checkpoint if enough time has passed since last checkpoint
        // Default interval: 5 minutes (300 seconds)
        const CHECKPOINT_INTERVAL_SECONDS = parseInt(process.env.CHECKPOINT_INTERVAL_SECONDS || '300', 10);
        
        let shouldGenerateCheckpoint = false;
        let lastCheckpointAt = null; // Declared in outer scope for use in response calculation
        
        try {
            const checkpointResult = await pool.query(
                `SELECT last_checkpoint_at, last_checkpoint_cell_id
                 FROM checkpoint_tracking
                 WHERE public_key = $1 AND blockchain = $2`,
                [public_key, blockchain]
            );
            
            if (checkpointResult.rows.length > 0) {
                lastCheckpointAt = checkpointResult.rows[0].last_checkpoint_at;
                const timeSinceLastCheckpoint = (occurredAt.getTime() - new Date(lastCheckpointAt).getTime()) / 1000;
                
                // Generate checkpoint if:
                // 1. Enough time has passed since last checkpoint
                // 2. No other events were generated (cell transition or rule trigger)
                // 3. We're still in the same cell (or no previous checkpoint exists)
                if (timeSinceLastCheckpoint >= CHECKPOINT_INTERVAL_SECONDS && anchorEvents.length === 0) {
                    shouldGenerateCheckpoint = true;
                }
            } else {
                // No previous checkpoint - generate one if no other events
                // This ensures first-time users get an initial checkpoint
                if (anchorEvents.length === 0) {
                    shouldGenerateCheckpoint = true;
                }
            }
        } catch (checkpointError) {
            // Table might not exist yet, that's okay
            console.warn('⚠️  Could not check checkpoint tracking (table may not exist):', checkpointError.message);
        }
        
        if (shouldGenerateCheckpoint) {
            const checkpointEvent = createCheckpointEvent(
                public_key,
                currentCellId,
                occurredAt
            );
            
            // Only add if we haven't returned this checkpoint recently
            if (!returnedEventIds.has(checkpointEvent.event_id)) {
                anchorEvents.push(checkpointEvent);
                
                // Track that we're returning this checkpoint
                try {
                    await pool.query(
                        `INSERT INTO anchor_events_returned (public_key, blockchain, event_id, returned_at)
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (public_key, blockchain, event_id) 
                         DO UPDATE SET returned_at = NOW()`,
                        [public_key, blockchain, checkpointEvent.event_id]
                    );
                } catch (trackError) {
                    console.warn('⚠️  Could not track returned checkpoint event:', trackError.message);
                }
                
                // Update checkpoint tracking
                try {
                    await pool.query(
                        `INSERT INTO checkpoint_tracking (public_key, blockchain, last_checkpoint_at, last_checkpoint_cell_id, updated_at)
                         VALUES ($1, $2, $3, $4, NOW())
                         ON CONFLICT (public_key, blockchain) 
                         DO UPDATE SET 
                             last_checkpoint_at = $3,
                             last_checkpoint_cell_id = $4,
                             updated_at = NOW()`,
                        [public_key, blockchain, occurredAt, currentCellId]
                    );
                } catch (updateError) {
                    console.warn('⚠️  Could not update checkpoint tracking:', updateError.message);
                }
            }
        } else if (anchorEvents.length > 0) {
            // If other events occurred, reset checkpoint timer
            // This prevents checkpoint spam when user is actively moving/triggering rules
            try {
                await pool.query(
                    `INSERT INTO checkpoint_tracking (public_key, blockchain, last_checkpoint_at, last_checkpoint_cell_id, updated_at)
                     VALUES ($1, $2, $3, $4, NOW())
                     ON CONFLICT (public_key, blockchain) 
                     DO UPDATE SET 
                         last_checkpoint_at = $3,
                         last_checkpoint_cell_id = $4,
                         updated_at = NOW()`,
                    [public_key, blockchain, occurredAt, currentCellId]
                );
            } catch (updateError) {
                // Silently fail - checkpoint tracking is optional
            }
        }

        // Update wallet location (trigger will automatically populate history table)
        const result = await pool.query(
            `INSERT INTO wallet_locations 
            (public_key, blockchain, latitude, longitude, wallet_type_id, description, wallet_provider_id, location, location_enabled)
            VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6, $7, ST_SetSRID(ST_MakePoint($4::numeric, $3::numeric), 4326)::geography, true)
            ON CONFLICT (public_key, blockchain) 
            DO UPDATE SET 
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                wallet_type_id = EXCLUDED.wallet_type_id,
                description = EXCLUDED.description,
                wallet_provider_id = EXCLUDED.wallet_provider_id,
                location = ST_SetSRID(ST_MakePoint(EXCLUDED.longitude::numeric, EXCLUDED.latitude::numeric), 4326)::geography,
                location_enabled = true,
                last_updated = CURRENT_TIMESTAMP
            RETURNING *`,
            [public_key, blockchain, parseFloat(latitude), parseFloat(longitude), walletTypeId, description || null, req.providerId]
        );
        
        // Note: wallet_location_history is automatically populated by database trigger
        // No need to manually insert into history table

        // console.log('✅ Location updated successfully');

        // Queue location update for background AI processing
        // Get user_id from wallet_providers table using providerId
        try {
            let userId = null;
            if (req.providerId) {
                const userResult = await pool.query(
                    'SELECT user_id FROM wallet_providers WHERE id = $1',
                    [req.providerId]
                );
                userId = userResult.rows[0]?.user_id || null;
            }
            
            // If we have a user_id, queue the update for AI processing
            if (userId) {
                await pool.query(
                    `INSERT INTO location_update_queue 
                     (user_id, public_key, latitude, longitude, accuracy_meters, source, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        userId,
                        public_key,
                        parseFloat(latitude),
                        parseFloat(longitude),
                        null, // accuracy_meters - can be added if provided
                        'xyz-wallet',
                        JSON.stringify({
                            blockchain,
                            wallet_type_id: walletTypeId,
                            description,
                            wallet_provider_id: req.providerId
                        })
                    ]
                );
                // console.log('📍 Location update queued for AI processing');
            }
        } catch (queueError) {
            // Don't fail the location update if queueing fails
            console.error('⚠️  Error queueing location update for AI processing:', queueError.message);
        }

        // Build response with backward compatibility
        const response = {
            ok: true,
            cell_id: currentCellId,
            matched_rules: matchedRules.map(rule => ({
                rule_id: String(rule.id),
                rule_name: rule.rule_name,
                rule_type: rule.rule_type
            })),
            anchor_events: anchorEvents,
            next_suggested_anchor_after_secs: (() => {
                // Calculate when next checkpoint should be suggested
                // Only suggest if no events were generated and checkpoint tracking exists
                if (anchorEvents.length === 0 && lastCheckpointAt) {
                    const timeSinceLastCheckpoint = (occurredAt.getTime() - new Date(lastCheckpointAt).getTime()) / 1000;
                    const CHECKPOINT_INTERVAL_SECONDS = parseInt(process.env.CHECKPOINT_INTERVAL_SECONDS || '300', 10);
                    const remaining = CHECKPOINT_INTERVAL_SECONDS - timeSinceLastCheckpoint;
                    return Math.max(0, Math.ceil(remaining));
                }
                return null;
            })(),
            // Legacy fields for backward compatibility
            success: true,
            message: 'Location updated successfully',
            data: result.rows[0]
        };

        res.json(response);
    } catch (error) {
        console.error('❌ Error updating location:', error.message);
        // console.error('Error details:', {
        //     message: error.message,
        //     code: error.code,
        //     detail: error.detail
        // });
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get specific wallet location
router.get('/:publicKey', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                wl.public_key,
                wl.blockchain,
                wl.description,
                wt.name as wallet_type,
                wl.latitude,
                wl.longitude,
                wl.location_enabled,
                wl.last_updated
            FROM wallet_locations wl
            JOIN wallet_types wt ON wt.id = wl.wallet_type_id
            WHERE wl.public_key = $1 AND wl.location_enabled = true`,
            [req.params.publicKey]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get location history
router.get('/:publicKey/history', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                latitude,
                longitude,
                recorded_at as last_updated
            FROM wallet_location_history wlh
            JOIN wallet_locations wl ON wlh.wallet_location_id = wl.id
            WHERE wl.public_key = $1
            ORDER BY recorded_at DESC
            LIMIT 100`,
            [req.params.publicKey]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching location history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update tracking status
router.patch('/:publicKey/tracking', authenticateApiKey, async (req, res) => {
    if (req.userType !== 'wallet_provider') {
        return res.status(403).json({ error: 'Only wallet providers can update tracking status' });
    }

    const { status } = req.body;
    
    if (!['active', 'paused', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await pool.query(
            `UPDATE wallet_locations 
            SET tracking_status = $1
            WHERE public_key = $2 AND wallet_provider_id = $3`,
            [status, req.params.publicKey, req.providerId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tracking status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint for wallet locations - accessible by data consumers
// JWT-authenticated version for dashboard use
router.get('/dashboard/wallet-locations', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                w.id,
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.tracking_status,
                w.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_types wt ON w.wallet_type_id = wt.id
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            WHERE w.location_enabled = true
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Failed to fetch wallet locations' });
    }
});

// API key authenticated version for external API use
router.get('/wallet-locations', authenticateApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                w.id,
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.tracking_status,
                w.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations w
            JOIN wallet_types wt ON w.wallet_type_id = wt.id
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            WHERE w.location_enabled = true
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint for all map markers (wallets, contract rules, NFTs)
// JWT-authenticated version for dashboard use
router.get('/all-markers', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Get wallets
        const walletsResult = await pool.query(`
            SELECT 
                w.id,
                w.public_key,
                w.blockchain,
                w.latitude,
                w.longitude,
                w.tracking_status,
                w.last_updated,
                wt.name as wallet_type,
                wp.name as provider_name,
                'wallet' as marker_type,
                'wallet' as type
            FROM wallet_locations w
            JOIN wallet_types wt ON w.wallet_type_id = wt.id
            JOIN wallet_providers wp ON w.wallet_provider_id = wp.id
            WHERE w.location_enabled = true
        `);

        // Get contract execution rules with locations
        const rulesResult = await pool.query(`
            SELECT 
                cer.id,
                cer.rule_name,
                cer.rule_type,
                cer.center_latitude as latitude,
                cer.center_longitude as longitude,
                cer.radius_meters,
                cer.function_name,
                cer.is_active,
                cer.trigger_on,
                cer.auto_execute,
                cc.contract_name,
                cc.contract_address,
                cc.network,
                'contract_rule' as marker_type,
                'contract_rule' as type
            FROM contract_execution_rules cer
            LEFT JOIN custom_contracts cc ON cer.contract_id = cc.id
            WHERE cer.user_id = $1 
                AND cer.rule_type = 'location'
                AND cer.center_latitude IS NOT NULL 
                AND cer.center_longitude IS NOT NULL
                AND cer.is_active = true
        `, [userId]);

        // Get NFTs (only if location is enabled and active)
        const nftsResult = await pool.query(`
            SELECT 
                n.id,
                n.name,
                n.latitude,
                n.longitude,
                n.is_active,
                n.pinned_by_user as public_key,
                n.ipfs_hash,
                n.server_url,
                'nft' as marker_type,
                'nft' as type
            FROM nfts n
            WHERE n.latitude IS NOT NULL 
                AND n.longitude IS NOT NULL
                AND n.is_active = true
        `);

        res.json({
            success: true,
            wallets: walletsResult.rows,
            contract_rules: rulesResult.rows,
            nfts: nftsResult.rows,
            all: [
                ...walletsResult.rows,
                ...rulesResult.rows,
                ...nftsResult.rows
            ]
        });
    } catch (error) {
        console.error('Error fetching all markers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint for wallet types list
router.get('/types/list', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, description, created_at
            FROM wallet_types
            ORDER BY name ASC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wallet types:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 