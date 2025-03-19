import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import WalletMap from './Map/WalletMap';

const GeofenceManager = () => {
    const [geofences, setGeofences] = useState([]);
    const [drawingMode, setDrawingMode] = useState(false);
    const [newGeofence, setNewGeofence] = useState({
        name: '',
        coordinates: [],
        notification_url: ''
    });
    const [editingGeofence, setEditingGeofence] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});

    useEffect(() => {
        fetchGeofences();
    }, []);

    const fetchGeofences = async () => {
        try {
            const response = await api.get('/geofence');
            setGeofences(response.data);
        } catch (error) {
            console.error('Error fetching geofences:', error);
        }
    };

    const handleEdit = (geofence) => {
        setEditingGeofence(geofence);
        setNewGeofence({
            name: geofence.name,
            coordinates: geofence.boundary.coordinates[0],
            notification_url: geofence.notification_url
        });
        setDrawingMode(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate geofence data
        const { isValid, errors } = validateGeofence(newGeofence);
        if (!isValid) {
            setValidationErrors(errors);
            return;
        }

        try {
            if (editingGeofence) {
                await api.put(`/geofence/${editingGeofence.id}`, newGeofence);
            } else {
                await api.post('/geofence', newGeofence);
            }
            setNewGeofence({
                name: '',
                coordinates: [],
                notification_url: ''
            });
            setEditingGeofence(null);
            setValidationErrors({});
            fetchGeofences();
        } catch (error) {
            if (error.response?.data?.error === 'Geofence intersects with existing geofences') {
                setValidationErrors({
                    coordinates: 'This geofence overlaps with: ' + 
                        error.response.data.intersecting.map(g => g.name).join(', ')
                });
            } else {
                console.error('Error saving geofence:', error);
            }
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`