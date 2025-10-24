const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

/**
 * @swagger
 * /api-docs:
 *   get:
 *     summary: Get API documentation landing page
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: API documentation landing page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
// Serve custom API documentation landing page
router.get('/', (req, res) => {
    const docsPath = path.join(__dirname, '../public/test-docs.html');
    res.sendFile(docsPath);
});

/**
 * @swagger
 * /api-docs/postman:
 *   get:
 *     summary: Download Postman collection
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: Postman collection file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// Serve Postman collection download
router.get('/postman', (req, res) => {
    const postmanPath = path.join(__dirname, '../postman/GeoLink-API-Collection.json');
    
    if (fs.existsSync(postmanPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="GeoLink-API-Collection.json"');
        res.sendFile(postmanPath);
    } else {
        res.status(404).json({ error: 'Postman collection not found' });
    }
});

module.exports = router;