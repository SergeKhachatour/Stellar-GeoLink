export const validateGeofence = (geofence) => {
    const errors = {};

    if (!geofence.name.trim()) {
        errors.name = 'Name is required';
    }

    if (!geofence.notification_url.trim()) {
        errors.notification_url = 'Webhook URL is required';
    } else {
        try {
            new URL(geofence.notification_url);
        } catch (error) {
            errors.notification_url = 'Invalid URL format';
        }
    }

    if (!geofence.coordinates.length || geofence.coordinates.length < 3) {
        errors.coordinates = 'Geofence must have at least 3 points';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}; 