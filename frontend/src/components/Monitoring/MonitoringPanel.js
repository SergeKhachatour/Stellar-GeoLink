import React, { useState, useEffect } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { format } from 'date-fns';
import api from '../../utils/api';
import './MonitoringPanel.css';

const MonitoringPanel = () => {
    const [staleLocations, setStaleLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkStaleLocations = async () => {
            try {
                const response = await api.get('/monitoring/stale');
                setStaleLocations(response.data);
                setLoading(false);
            } catch (error) {
                console.error('Error checking stale locations:', error);
            }
        };

        checkStaleLocations();
        const interval = setInterval(checkStaleLocations, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

    const columns = [
        { field: 'public_key', headerName: 'Wallet', width: 200 },
        { field: 'provider_name', headerName: 'Provider', width: 150 },
        { 
            field: 'seconds_since_update', 
            headerName: 'Time Since Update', 
            width: 200,
            valueGetter: (params) => {
                const hours = Math.floor(params.value / 3600);
                const minutes = Math.floor((params.value % 3600) / 60);
                return `${hours}h ${minutes}m`;
            }
        }
    ];

    return (
        <div className="monitoring-panel">
            <h2>Monitoring</h2>
            <div className="stale-locations">
                <h3>Stale Locations</h3>
                <DataGrid
                    rows={staleLocations}
                    columns={columns}
                    pageSize={10}
                    autoHeight
                    loading={loading}
                    disableSelectionOnClick
                />
            </div>
        </div>
    );
};

export default MonitoringPanel; 