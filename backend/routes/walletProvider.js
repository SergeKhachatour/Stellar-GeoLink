const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateUser } = require('../middleware/authUser');

// Update user privacy settings
router.post('/privacy-settings', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const { public_key, privacy_enabled, visibility_enabled } = req.body;

        if (!public_key) {
            return res.status(400).json({ error: 'public_key is required' });
        }

        // Insert or update privacy settings
        const result = await pool.query(
            `INSERT INTO user_privacy_settings (public_key, privacy_enabled, visibility_enabled)
             VALUES ($1, $2, $3)
             ON CONFLICT (public_key) 
             DO UPDATE SET 
                 privacy_enabled = EXCLUDED.privacy_enabled,
                 visibility_enabled = EXCLUDED.visibility_enabled,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [public_key, privacy_enabled, visibility_enabled]
        );

        res.json({
            message: 'Privacy settings updated successfully',
            settings: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating privacy settings:', error);
        res.status(500).json({ error: 'Failed to update privacy settings' });
    }
});

// Update user visibility settings
router.post('/visibility-settings', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const { public_key, is_visible } = req.body;

        if (!public_key) {
            return res.status(400).json({ error: 'public_key is required' });
        }

        // Insert or update visibility settings
        const result = await pool.query(
            `INSERT INTO user_visibility_settings (public_key, is_visible)
             VALUES ($1, $2)
             ON CONFLICT (public_key) 
             DO UPDATE SET 
                 is_visible = EXCLUDED.is_visible,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [public_key, is_visible]
        );

        res.json({
            message: 'Visibility settings updated successfully',
            settings: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating visibility settings:', error);
        res.status(500).json({ error: 'Failed to update visibility settings' });
    }
});

// Get user locations
router.get('/user-locations', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const { public_key } = req.query;

        if (!public_key) {
            return res.status(400).json({ error: 'public_key query parameter is required' });
        }

        // Get user locations from wallet_locations table
        const result = await pool.query(
            `SELECT 
                wl.id,
                wl.public_key,
                wl.latitude,
                wl.longitude,
                wl.tracking_status,
                wl.location_enabled,
                wl.last_updated,
                wl.created_at,
                wt.name as wallet_type,
                wp.name as provider_name
            FROM wallet_locations wl
            JOIN wallet_types wt ON wl.wallet_type_id = wt.id
            JOIN wallet_providers wp ON wl.wallet_provider_id = wp.id
            WHERE wl.public_key = $1 AND wp.user_id = $2
            ORDER BY wl.created_at DESC`,
            [public_key, req.user.id]
        );

        res.json({
            locations: result.rows
        });
    } catch (error) {
        console.error('Error fetching user locations:', error);
        res.status(500).json({ error: 'Failed to fetch user locations' });
    }
});

// Get user privacy settings
router.get('/privacy-settings/:public_key', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const { public_key } = req.params;

        const result = await pool.query(
            'SELECT * FROM user_privacy_settings WHERE public_key = $1',
            [public_key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Privacy settings not found for this public key' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching privacy settings:', error);
        res.status(500).json({ error: 'Failed to fetch privacy settings' });
    }
});

// Get user visibility settings
router.get('/visibility-settings/:public_key', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'wallet_provider') {
            return res.status(403).json({ error: 'Access denied. Wallet provider role required.' });
        }

        const { public_key } = req.params;

        const result = await pool.query(
            'SELECT * FROM user_visibility_settings WHERE public_key = $1',
            [public_key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Visibility settings not found for this public key' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching visibility settings:', error);
        res.status(500).json({ error: 'Failed to fetch visibility settings' });
    }
});

module.exports = router;
