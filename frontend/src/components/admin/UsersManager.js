import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const UsersManager = () => {
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({
        email: '',
        firstName: '',
        lastName: '',
        organization: '',
        role: 'wallet_provider'
    });
    const [editingUser, setEditingUser] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await api.get('/admin/users');
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await api.put(`/admin/users/${editingUser.id}`, newUser);
            } else {
                await api.post('/admin/users', newUser);
            }
            fetchUsers();
            setNewUser({
                email: '',
                firstName: '',
                lastName: '',
                organization: '',
                role: 'wallet_provider'
            });
            setEditingUser(null);
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            await api.patch(`/admin/users/${userId}`, {
                status: !currentStatus
            });
            fetchUsers();
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    };

    return (
        <div className="users-manager">
            <h2>Manage Users</h2>

            <form onSubmit={handleSubmit} className="user-form">
                <div className="form-row">
                    <div className="form-group">
                        <label>Email:</label>
                        <input
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>First Name:</label>
                        <input
                            type="text"
                            value={newUser.firstName}
                            onChange={(e) => setNewUser({...newUser, firstName: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Last Name:</label>
                        <input
                            type="text"
                            value={newUser.lastName}
                            onChange={(e) => setNewUser({...newUser, lastName: e.target.value})}
                            required
                        />
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>Organization:</label>
                        <input
                            type="text"
                            value={newUser.organization}
                            onChange={(e) => setNewUser({...newUser, organization: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Role:</label>
                        <select
                            value={newUser.role}
                            onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                            required
                        >
                            <option value="wallet_provider">Wallet Provider</option>
                            <option value="sdf_employee">SDF Employee</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                </div>
                <button type="submit" className="submit-btn">
                    {editingUser ? 'Update User' : 'Create User'}
                </button>
            </form>

            <table className="users-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Organization</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td>{`${user.first_name} ${user.last_name}`}</td>
                            <td>{user.email}</td>
                            <td>{user.organization}</td>
                            <td>{user.role}</td>
                            <td>{user.status ? 'Active' : 'Disabled'}</td>
                            <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                            <td className="action-buttons">
                                <button 
                                    onClick={() => setEditingUser(user)}
                                    className="edit-btn"
                                >
                                    Edit
                                </button>
                                <button 
                                    onClick={() => handleToggleStatus(user.id, user.status)}
                                    className={user.status ? 'disable-btn' : 'enable-btn'}
                                >
                                    {user.status ? 'Disable' : 'Enable'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default UsersManager; 