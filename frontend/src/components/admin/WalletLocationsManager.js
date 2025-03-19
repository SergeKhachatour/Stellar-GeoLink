import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import WalletMap from '../Map/WalletMap';

const WalletLocationsManager = () => {
    const [locations, setLocations] = useState([]);
    const [walletTypes, setWalletTypes] = useState([]);
    const [filters, setFilters] = useState({
        blockchain: '',
        walletType: '',
        provider: ''
    });
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'map'

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [locationsRes, typesRes] = await Promise.all([
                api.get('/admin/locations'),
                api.get('/location/types/list')
            ]);
            setLocations(locationsRes.data);
            setWalletTypes(typesRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleToggleStatus = async (locationId, currentStatus) => {
        try {
            await api.patch(`/admin/locations/${locationId}`, {
                location_enabled: !currentStatus
            });
            fetchData();
        } catch (error) {
            console.error('Error updating location status:', error);
        }
    };

    const filteredLocations = locations.filter(location => {
        return (
            (!filters.blockchain || location.blockchain === filters.blockchain) &&
            (!filters.walletType || location.wallet_type_id === parseInt(filters.walletType)) &&
            (!filters.provider || location.wallet_provider_id === parseInt(filters.provider))
        );
    });

    return (
        <div className="wallet-locations-manager">
            <h2>Manage Wallet Locations</h2>

            <div className="view-controls">
                <button 
                    className={viewMode === 'table' ? 'active' : ''} 
                    onClick={() => setViewMode('table')}
                >
                    Table View
                </button>
                <button 
                    className={viewMode === 'map' ? 'active' : ''} 
                    onClick={() => setViewMode('map')}
                >
                    Map View
                </button>
            </div>

            <div className="filters">
                <select
                    value={filters.blockchain}
                    onChange={(e) => setFilters({...filters, blockchain: e.target.value})}
                >
                    <option value="">All Blockchains</option>
                    <option value="Stellar">Stellar</option>
                    <option value="Circle">Circle</option>
                </select>

                <select
                    value={filters.walletType}
                    onChange={(e) => setFilters({...filters, walletType: e.target.value})}
                >
                    <option value="">All Types</option>
                    {walletTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                </select>
            </div>

            {viewMode === 'map' ? (
                <WalletMap 
                    wallets={filteredLocations}
                    center={[-74.5, 40]} // Default center
                />
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Public Key</th>
                            <th>Blockchain</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Location</th>
                            <th>Provider</th>
                            <th>Status</th>
                            <th>Last Updated</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLocations.map(location => (
                            <tr key={location.id}>
                                <td>{location.public_key}</td>
                                <td>{location.blockchain}</td>
                                <td>{location.wallet_type}</td>
                                <td>{location.description}</td>
                                <td>{`${location.latitude}, ${location.longitude}`}</td>
                                <td>{location.provider_name}</td>
                                <td>{location.location_enabled ? 'Active' : 'Disabled'}</td>
                                <td>{new Date(location.last_updated).toLocaleString()}</td>
                                <td>
                                    <button 
                                        onClick={() => handleToggleStatus(location.id, location.location_enabled)}
                                        className={location.location_enabled ? 'disable-btn' : 'enable-btn'}
                                    >
                                        {location.location_enabled ? 'Disable' : 'Enable'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default WalletLocationsManager; 