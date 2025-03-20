/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 * 
 * /api/user/api-keys:
 *   post:
 *     summary: Generate new API key
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: New API key generated
 * 
 * /api/user/api-usage:
 *   get:
 *     summary: Get API usage statistics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API usage statistics
 */ 