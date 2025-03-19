import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const WalletTypesManager = () => {
    const [walletTypes, setWalletTypes] = useState([]);
    const [newType, setNewType] = useState({ name: '', description: '' });
    const [editingType, setEditingType] = useState(null);

    useEffect(() => {
        fetchWalletTypes();
    }, []);

    const fetchWalletTypes = async () => {
        try {
            const response = await api.get('/location/types/list');
            setWalletTypes(response.data);
        } catch (error) {
            console.error('Error fetching wallet types:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingType) {
                await api.put(`/admin/wallet-types/${editingType.id}`, newType);
            } else {
                await api.post('/admin/wallet-types', newType);
            }
            fetchWalletTypes();
            setNewType({ name: '', description: '' });
            setEditingType(null);
        } catch (error) {
            console.error('Error saving wallet type:', error);
        }
    };

    return (
        <div className="wallet-types-manager">
            <h2>Manage Wallet Types</h2>
            
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <input
                        type="text"
                        placeholder="Type Name"
                        value={newType.name}
                        onChange={(e) => setNewType({...newType, name: e.target.value})}
                        required
                    />
                </div>
                <div className="form-group">
                    <textarea
                        placeholder="Description"
                        value={newType.description}
                        onChange={(e) => setNewType({...newType, description: e.target.value})}
                        required
                    />
                </div>
                <button type="submit">
                    {editingType ? 'Update Type' : 'Add New Type'}
                </button>
            </form>

            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {walletTypes.map(type => (
                        <tr key={type.id}>
                            <td>{type.name}</td>
                            <td>{type.description}</td>
                            <td>
                                <button onClick={() => setEditingType(type)}>Edit</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default WalletTypesManager; 