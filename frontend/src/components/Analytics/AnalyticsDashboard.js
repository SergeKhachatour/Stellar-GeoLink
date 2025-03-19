import React, { useState, useEffect } from 'react';
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { DataGrid } from '@mui/x-data-grid';
import { format } from 'date-fns';
import api from '../../utils/api';
import AlertSystem from '../Monitoring/AlertSystem';
import ExportData from './ExportData';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [geofenceStats, setGeofenceStats] = useState([]);
    const [anomalies, setAnomalies] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 300000); // Refresh every 5 minutes
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [statsRes, geofenceRes, anomaliesRes] = await Promise.all([
                api.get('/analytics/stats'),
                api.get('/analytics/geofences'),
                api.get('/analytics/anomalies')
            ]);
            setStats(statsRes.data);
            setGeofenceStats(geofenceRes.data);
            setAnomalies(anomaliesRes.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }
    };

    if (loading || !stats) return <div>Loading analytics...</div>;

    const activityData = {
        labels: stats.hourly_activity.map(h => format(new Date(h.hour), 'HH:mm')),
        datasets: [{
            label: 'Location Updates',
            data: stats.hourly_activity.map(h => h.updates),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
        }]
    };

    const walletTypeData = {
        labels: stats.wallet_types.map(t => t.wallet_type),
        datasets: [{
            data: stats.wallet_types.map(t => t.count),
            backgroundColor: [
                'rgb(255, 99, 132)',
                'rgb(54, 162, 235)',
                'rgb(255, 205, 86)'
            ]
        }]
    };

    const anomalyColumns = [
        { field: 'public_key', headerName: 'Wallet', width: 200 },
        { field: 'distance', headerName: 'Distance (km)', width: 150,
            valueGetter: (params) => (params.row.distance / 1000).toFixed(2) },
        { field: 'time_diff', headerName: 'Time (seconds)', width: 150 },
        { field: 'created_at', headerName: 'Detected At', width: 200,
            valueGetter: (params) => format(new Date(params.row.created_at), 'PPpp') }
    ];

    return (
        <div className="analytics-dashboard">
            <AlertSystem />
            <div className="stats-overview">
                <div className="stat-card">
                    <h3>Total Wallets</h3>
                    <p>{stats.total_wallets}</p>
                </div>
                <div className="stat-card">
                    <h3>Active Wallets</h3>
                    <p>{stats.active_wallets}</p>
                </div>
                <div className="stat-card">
                    <h3>Updated in 24h</h3>
                    <p>{stats.updated_24h}</p>
                </div>
                <div className="export-controls">
                    <ExportData data={stats} type="stats" />
                </div>
            </div>

            <div className="charts-container">
                <div className="chart-card">
                    <h3>24h Activity</h3>
                    <Line data={activityData} />
                </div>
                <div className="chart-card">
                    <h3>Wallet Types</h3>
                    <Pie data={walletTypeData} />
                </div>
            </div>

            <div className="anomalies-section">
                <div className="section-header">
                    <h3>Detected Anomalies</h3>
                    <ExportData data={anomalies} type="anomalies" />
                </div>
                <DataGrid
                    rows={anomalies}
                    columns={anomalyColumns}
                    pageSize={5}
                    autoHeight
                    disableSelectionOnClick
                />
            </div>
        </div>
    );
};

export default AnalyticsDashboard; 