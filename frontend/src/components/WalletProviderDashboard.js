import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import WalletMap from './Map/WalletMap';

const WalletProviderDashboard = () => {
    const [wallets, setWallets] = useState([]);
    const [apiKey, setApiKey] = useState(null);
    const [apiUsage, setApiUsage] = useState([]);
    const [newWallet, setNewWallet] = useState({
        public_key: '',
        blockchain: 'Stellar',
        wallet_type_id: '',
        description: '',
        latitude: '',
        longitude: '',
        location_enabled: true
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [walletsRes, apiKeyRes, usageRes] = await Promise.all([
                api.get('/user/wallets'),
                api.get('/user/api-key'),
                api.get('/user/api-usage')
            ]);
            
            setWallets(walletsRes.data);
            setApiKey(apiKeyRes.data);
            setApiUsage(usageRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/location/update', newWallet);
            fetchData();
            setNewWallet({
                public_key: '',
                blockchain: 'Stellar',
                wallet_type_id: '',
                description: '',
                latitude: '',
                longitude: '',
                location_enabled: true
            });
        } catch (error) {
            console.error('Error adding wallet:', error);
        }
    };

    return (
        <div className="provider-dashboard">
            <h2>Wallet Provider Dashboard</h2>

            <section className="api-key-section">
                <h3>Your API Key</h3>
                {apiKey ? (
                    <div className="api-key-display">
                        <code>{apiKey.key}</code>
                        <p>Status: {apiKey.status ? 'Active' : 'Inactive'}</p>
                    </div>
                ) : (
                    <button onClick={() => api.post('/auth/api-key-request')}>
                        Request API Key
                    </button>
                )}
            </section>

            <section className="api-usage">
                <h3>Recent API Usage</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Endpoint</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Response Time</th>
                            <th>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apiUsage.map(usage => (
                            <tr key={usage.id}>
                                <td>{new Date(usage.created_at).toLocaleString()}</td>
                                <td>{usage.endpoint}</td>
                                <td>{usage.method}</td>
                                <td>{usage.status_code}</td>
                                <td>{usage.response_time}ms</td>
                                <td>{usage.ip_address}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="wallet-map">
                <h3>Wallet Locations</h3>
                <WalletMap 
                    wallets={wallets}
                    center={wallets[0] && [wallets[0].longitude, wallets[0].latitude]}
                />
            </section>

            <section className="wallet-management">
                <h3>Manage Wallets</h3>
                <form onSubmit={handleSubmit}>
                    {/* Form fields for new wallet */}
                </form>

                <table>
                    <thead>
                        <tr>
                            <th>Public Key</th>
                            <th>Blockchain</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Location</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {wallets.map(wallet => (
                            <tr key={wallet.id}>
                                <td>{wallet.public_key}</td>
                                <td>{wallet.blockchain}</td>
                                <td>{wallet.wallet_type}</td>
                                <td>{wallet.description}</td>
                                <td>{`${wallet.latitude}, ${wallet.longitude}`}</td>
                                <td>{wallet.location_enabled ? 'Active' : 'Disabled'}</td>
                                <td>
                                    <button onClick={() => handleEditWallet(wallet)}>Edit</button>
                                    <button onClick={() => handleToggleStatus(wallet)}>
                                        {wallet.location_enabled ? 'Disable' : 'Enable'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
};

export default WalletProviderDashboard; 