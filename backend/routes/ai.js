const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { processChatCompletion } = require('../services/azureOpenAIService');
const { authenticateUser } = require('../middleware/authUser');

/**
 * @swagger
 * /api/ai/chat:
 *   post:
 *     summary: Chat with AI assistant
 *     description: Send a message to the AI assistant and get a response. The AI can perform Stellar blockchain operations.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI response
 *       500:
 *         description: Error processing request
 */
router.post('/chat', authenticateUser, async (req, res) => {
  try {
    const { messages, userContext } = req.body;
    const userId = req.user?.id || null;
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '') || authHeader; // Remove Bearer prefix if present

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build user context for tool execution
    const context = {
      userId,
      token,
      publicKey: req.user?.public_key,
      role: req.user?.role,
      ...userContext
    };

    // Log authentication context for debugging
    console.log('[AI Chat] Authentication context:', {
      userId,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      role: req.user?.role,
      email: req.user?.email
    });

    // Log location context for debugging
    if (context.location) {
      console.log('[AI Chat] User location in context:', context.location);
    } else {
      console.log('[AI Chat] No user location in context');
    }

    const response = await processChatCompletion(messages, userId, context);

    res.json({
      id: response.id,
      model: response.model,
      created: response.created,
      choices: response.choices,
      usage: response.usage,
      mapData: response.mapData || null
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat request',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/ai/chat/public:
 *   post:
 *     summary: Public chat with AI assistant (no authentication required)
 *     description: Send a message to the AI assistant without authentication. Limited functionality.
 *     tags: [AI Assistant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI response
 *       500:
 *         description: Error processing request
 */
router.post('/chat/public', async (req, res) => {
  try {
    console.log('[AI Chat Public] Request received');
    const { messages, userContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    console.log('[AI Chat Public] Messages count:', messages.length);
    console.log('[AI Chat Public] Last user message:', messages[messages.length - 1]?.content?.substring(0, 100));

    // Public chat has limited context (no authentication)
    const context = {
      userId: null,
      token: null,
      ...userContext
    };

    // Log location context for debugging
    if (context.location) {
      console.log('[AI Chat Public] User location in context:', context.location);
    } else {
      console.log('[AI Chat Public] No user location in context');
    }

    console.log('[AI Chat Public] Calling processChatCompletion...');
    const response = await processChatCompletion(messages, null, context);
    console.log('[AI Chat Public] Response received, mapData:', response.mapData ? 'present' : 'null');
    if (response.mapData) {
      console.log('[AI Chat Public] Map data type:', response.mapData.type);
      console.log('[AI Chat Public] Map data count:', response.mapData.data?.length || 0);
    }

    res.json({
      id: response.id,
      model: response.model,
      created: response.created,
      choices: response.choices,
      usage: response.usage,
      mapData: response.mapData || null
    });
  } catch (error) {
    console.error('[AI Chat Public] Error:', error);
    console.error('[AI Chat Public] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process chat request',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/ai/health:
 *   get:
 *     summary: AI service health check
 *     description: Check if the AI service is available
 *     tags: [AI Assistant]
 *     responses:
 *       200:
 *         description: AI service is available
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'GeoLink AI Agent',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/ai/background-logs:
 *   get:
 *     summary: Get background AI service logs and contexts
 *     description: Retrieve background AI service logs, sessions, and activity for the authenticated user. Filter by public_key for multi-role users.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: session_id
 *         schema:
 *           type: integer
 *         description: Filter by specific AI session ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of log entries to return
 *       - in: query
 *         name: activity_type
 *         schema:
 *           type: string
 *           enum: [location_received, rule_analyzed, rule_matched, execution_triggered, error, user_feedback]
 *         description: Filter by activity type
 *     responses:
 *       200:
 *         description: Background AI service logs and contexts
 *       401:
 *         description: Authentication required
 */
router.get('/background-logs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const publicKey = req.user?.public_key;
    const { session_id, limit = 50, activity_type } = req.query;

    if (!userId && !publicKey) {
      return res.status(401).json({ error: 'User ID or public key not found' });
    }

    // Get user ID from public_key if needed (for multi-role users)
    let actualUserId = userId;
    if (!actualUserId && publicKey) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE public_key = $1',
        [publicKey]
      );
      if (userResult.rows.length > 0) {
        actualUserId = userResult.rows[0].id;
      }
    }

    if (!actualUserId) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Get AI sessions for this user
    let sessionsQuery = `
      SELECT 
        bas.id,
        bas.session_name,
        bas.session_type,
        bas.ai_model,
        bas.is_active,
        bas.is_paused,
        bas.last_activity_at,
        bas.created_at,
        bas.updated_at,
        COUNT(DISTINCT luq.id) as location_updates_count,
        COUNT(DISTINCT arm.id) as rule_matches_count
      FROM background_ai_sessions bas
      LEFT JOIN location_update_queue luq ON luq.ai_session_id = bas.id
      LEFT JOIN ai_rule_matches arm ON arm.ai_session_id = bas.id
      WHERE bas.user_id = $1
    `;
    const sessionsParams = [actualUserId];

    if (session_id) {
      sessionsQuery += ` AND bas.id = $2`;
      sessionsParams.push(session_id);
    }

    sessionsQuery += ` GROUP BY bas.id ORDER BY bas.last_activity_at DESC LIMIT 20`;

    const sessionsResult = await pool.query(sessionsQuery, sessionsParams);
    const sessions = sessionsResult.rows;

    // Get activity logs
    let logsQuery = `
      SELECT 
        asal.id,
        asal.session_id,
        asal.activity_type,
        asal.activity_data,
        asal.message,
        asal.error_message,
        asal.created_at,
        bas.session_name,
        bas.session_type
      FROM ai_session_activity_logs asal
      JOIN background_ai_sessions bas ON bas.id = asal.session_id
      WHERE bas.user_id = $1
    `;
    const logsParams = [actualUserId];
    let paramIndex = 2;

    if (session_id) {
      logsQuery += ` AND asal.session_id = $${paramIndex}`;
      logsParams.push(session_id);
      paramIndex++;
    }

    if (activity_type) {
      logsQuery += ` AND asal.activity_type = $${paramIndex}`;
      logsParams.push(activity_type);
      paramIndex++;
    }

    logsQuery += ` ORDER BY asal.created_at DESC LIMIT $${paramIndex}`;
    logsParams.push(parseInt(limit));

    const logsResult = await pool.query(logsQuery, logsParams);
    const logs = logsResult.rows;

    // Get recent location updates processed
    const updatesQuery = `
      SELECT 
        luq.id,
        luq.public_key,
        luq.latitude,
        luq.longitude,
        luq.status,
        luq.matched_rule_ids,
        luq.execution_results,
        luq.received_at,
        luq.processed_at,
        bas.session_name
      FROM location_update_queue luq
      LEFT JOIN background_ai_sessions bas ON bas.id = luq.ai_session_id
      WHERE luq.user_id = $1
      ORDER BY luq.received_at DESC
      LIMIT 20
    `;
    const updatesResult = await pool.query(updatesQuery, [actualUserId]);
    const updates = updatesResult.rows;

    // Get recent rule matches
    const matchesQuery = `
      SELECT 
        arm.id,
        arm.rule_id,
        arm.confidence_score,
        arm.reasoning,
        arm.should_execute,
        arm.executed,
        arm.execution_result,
        arm.execution_error,
        arm.created_at,
        arm.executed_at,
        cer.rule_name,
        bas.session_name
      FROM ai_rule_matches arm
      JOIN contract_execution_rules cer ON cer.id = arm.rule_id
      LEFT JOIN background_ai_sessions bas ON bas.id = arm.ai_session_id
      WHERE cer.user_id = $1
      ORDER BY arm.created_at DESC
      LIMIT 20
    `;
    const matchesResult = await pool.query(matchesQuery, [actualUserId]);
    const matches = matchesResult.rows;

    res.json({
      success: true,
      data: {
        sessions,
        logs,
        location_updates: updates,
        rule_matches: matches,
        summary: {
          total_sessions: sessions.length,
          total_logs: logs.length,
          total_updates: updates.length,
          total_matches: matches.length
        }
      }
    });
  } catch (error) {
    console.error('[AI Background Logs] Error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve background AI logs',
      message: error.message 
    });
  }
});

module.exports = router;

