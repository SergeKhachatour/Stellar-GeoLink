const pool = require('../config/database');
const nodemailer = require('nodemailer');

class AlertPreferencesService {
    constructor() {
        this.defaultPreferences = {
            stale_threshold_hours: 1,
            movement_threshold_km: 10,
            movement_time_window_minutes: 5,
            email_notifications: true,
            webhook_notifications: true
        };
    }

    async getPreferences(providerId) {
        try {
            const result = await pool.query(
                'SELECT * FROM alert_preferences WHERE wallet_provider_id = $1',
                [providerId]
            );

            if (result.rows.length === 0) {
                return this._getDefaultPreferences(providerId);
            }

            return result.rows[0];
        } catch (error) {
            console.error('Error fetching alert preferences:', error);
            throw error;
        }
    }

    async updatePreferences(providerId, preferences) {
        try {
            const result = await pool.query(
                `INSERT INTO alert_preferences 
                (wallet_provider_id, stale_threshold_hours, movement_threshold_km, 
                movement_time_window_minutes, email_notifications, webhook_notifications)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (wallet_provider_id) DO UPDATE SET
                    stale_threshold_hours = EXCLUDED.stale_threshold_hours,
                    movement_threshold_km = EXCLUDED.movement_threshold_km,
                    movement_time_window_minutes = EXCLUDED.movement_time_window_minutes,
                    email_notifications = EXCLUDED.email_notifications,
                    webhook_notifications = EXCLUDED.webhook_notifications
                RETURNING *`,
                [
                    providerId,
                    preferences.stale_threshold_hours,
                    preferences.movement_threshold_km,
                    preferences.movement_time_window_minutes,
                    preferences.email_notifications,
                    preferences.webhook_notifications
                ]
            );

            return result.rows[0];
        } catch (error) {
            console.error('Error updating alert preferences:', error);
            throw error;
        }
    }

    async sendEmailAlert(providerId, alert) {
        const provider = await pool.query(
            `SELECT u.email 
            FROM wallet_providers wp 
            JOIN users u ON u.id = wp.user_id 
            WHERE wp.id = $1`,
            [providerId]
        );

        if (!provider.rows[0]?.email) return;

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: provider.rows[0].email,
            subject: `GeoLink Alert: ${alert.type}`,
            text: alert.message,
            html: `<p>${alert.message}</p>`
        });
    }

    _getDefaultPreferences(providerId) {
        return {
            wallet_provider_id: providerId,
            ...this.defaultPreferences
        };
    }
}

module.exports = new AlertPreferencesService(); 