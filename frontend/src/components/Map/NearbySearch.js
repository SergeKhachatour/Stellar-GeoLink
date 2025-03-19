import React, { useState } from 'react';
import api from '../../utils/api';
import WalletMap from './WalletMap';

const NearbySearch = () => {
    const [searchParams, setSearchParams] = useState({
        latitude: '',
        longitude: '',
        radius: 1000 // Default 1km radius
    });
    const [nearbyWallets, setNearbyWallets] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);

    const handleSearch = async () => {
        try {
            const response = await api.get(
                `/location/nearby/${searchParams.latitude}/${searchParams.longitude}/${searchParams.radius}`
            );
            setNearbyWallets(response.data);
        } catch (error) {
            console.error('Error fetching nearby wallets:', error);
        }
    };

    const handleMapClick = (location) => {
        setSelectedLocation(location);
        setSearchParams({
            ...searchParams,
            latitude: location.latitude,
            longitude: location.longitude
        });
    };

    return (
        <div className="nearby-search">
            <div className="search-controls">
                <div className="form-group">
                    <label>Radius (meters):</label>
                    <input
                        type="number"
                        value={searchParams.radius}
                        onChange={(e) => setSearchParams({
                            ...searchParams,
                            radius: e.target.value
                        })}
                        min="100"
                        max="10000"
                    />
                </div>
                <button onClick={handleSearch} disabled={!selectedLocation}>
                    Search Nearby
                </button>
            </div>

            <WalletMap
                wallets={nearbyWallets}
                center={selectedLocation && [selectedLocation.longitude, selectedLocation.latitude]}
                onLocationSelect={handleMapClick}
            />

            {nearbyWallets.length > 0 && (
                <div className="search-results">
                    <h3>Found {nearbyWallets.length} wallets nearby</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Blockchain</th>
                                <th>Distance</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nearbyWallets.map(wallet => (
                                <tr key={wallet.public_key}>
                                    <td>{wallet.wallet_type}</td>
                                    <td>{wallet.blockchain}</td>
                                    <td>{(wallet.distance / 1000).toFixed(2)} km</td>
                                    <td>{wallet.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default NearbySearch; 