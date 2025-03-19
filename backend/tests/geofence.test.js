const request = require('supertest');
const app = require('../app');
const pool = require('../config/database');

describe('Geofence API', () => {
    let apiKey;
    let geofenceId;

    beforeAll(async () => {
        // Create test provider and get API key
        const result = await pool.query(
            `INSERT INTO wallet_providers (name, api_key, user_id)
            VALUES ($1, $2, $3) RETURNING api_key`,
            ['Test Provider', 'test-api-key', 1]
        );
        apiKey = result.rows[0].api_key;
    });

    test('Create geofence', async () => {
        const response = await request(app)
            .post('/api/geofence')
            .set('x-api-key', apiKey)
            .send({
                name: 'Test Geofence',
                coordinates: [
                    [-74.5, 40],
                    [-74.4, 40],
                    [-74.4, 40.1],
                    [-74.5, 40.1],
                    [-74.5, 40]
                ],
                notification_url: 'https://example.com/webhook'
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        geofenceId = response.body.id;
    });

    test('Get geofences', async () => {
        const response = await request(app)
            .get('/api/geofence')
            .set('x-api-key', apiKey);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
    });

    test('Update geofence', async () => {
        const response = await request(app)
            .put(`/api/geofence/${geofenceId}`)
            .set('x-api-key', apiKey)
            .send({
                name: 'Updated Test Geofence',
                coordinates: [
                    [-74.5, 40],
                    [-74.3, 40],
                    [-74.3, 40.2],
                    [-74.5, 40.2],
                    [-74.5, 40]
                ],
                notification_url: 'https://example.com/webhook2'
            });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Updated Test Geofence');
    });

    test('Delete geofence', async () => {
        const response = await request(app)
            .delete(`/api/geofence/${geofenceId}`)
            .set('x-api-key', apiKey);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('Validate geofence input', async () => {
        const invalidGeofence = await request(app)
            .post('/api/geofence')
            .set('x-api-key', apiKey)
            .send({
                name: 'Invalid Geofence',
                coordinates: [
                    [-74.5, 40],
                    [-74.4, 40] // Only 2 points, should be at least 3
                ],
                notification_url: 'not-a-url'
            });

        expect(invalidGeofence.status).toBe(400);
        expect(invalidGeofence.body.error).toBeDefined();
    });

    test('Check unauthorized access', async () => {
        const response = await request(app)
            .get('/api/geofence')
            .set('x-api-key', 'invalid-key');

        expect(response.status).toBe(401);
    });

    // Add more tests...
}); 