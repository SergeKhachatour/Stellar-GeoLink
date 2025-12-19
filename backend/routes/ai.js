const express = require('express');
const router = express.Router();
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
    const token = req.headers.authorization?.replace('Bearer ', '');

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
    const { messages, userContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

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

    const response = await processChatCompletion(messages, null, context);

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

module.exports = router;

