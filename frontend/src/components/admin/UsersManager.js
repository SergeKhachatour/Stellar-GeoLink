import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormControlLabel,
    Switch
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import api from '../../utils/api';

const UsersManager = () => {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
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

    const handleEditClick = (user) => {
        setSelectedUser(user);
        setEditingUser({
            ...user,
            status: user.status || false
        });
    };

    const handleClose = () => {
        setSelectedUser(null);
        setEditingUser(null);
    };

    const handleSave = async () => {
        try {
            if (editingUser.id) {
                // Update existing user
                await api.put(`/admin/users/${editingUser.id}`, editingUser);
            } else {
                // Create new user
                await api.post('/admin/users', editingUser);
            }
            fetchUsers();
            handleClose();
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    const handleChange = (e) => {
        const { name, value, checked } = e.target;
        setEditingUser(prev => ({
            ...prev,
            [name]: name === 'status' ? checked : value
        }));
    };

    return (
        <Box>
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                mb: 3
            }}>
                <Typography variant="h6" sx={{ fontWeight: 500, color: 'text.primary' }}>
                    Users Management
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                        setEditingUser({
                            email: '',
                            first_name: '',
                            last_name: '',
                            organization: '',
                            role: 'data_consumer',
                            status: true
                        });
                        setSelectedUser({});
                    }}
                    sx={{ textTransform: 'none' }}
                >
                    Add User
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={0}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 500 }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>Organization</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>Role</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map(user => (
                            <TableRow key={user.id}>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>{`${user.first_name} ${user.last_name}`}</TableCell>
                                <TableCell>{user.organization}</TableCell>
                                <TableCell>
                                    <Chip 
                                        label={user.role.replace('_', ' ')}
                                        size="small"
                                        color={
                                            user.role === 'admin' ? 'error' :
                                            user.role === 'wallet_provider' ? 'primary' : 
                                            'default'
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={user.status ? 'Active' : 'Inactive'}
                                        color={user.status ? 'success' : 'default'}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => handleEditClick(user)}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        Manage
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog 
                open={!!selectedUser || !!editingUser} 
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {selectedUser && selectedUser.id ? 'Manage User' : 'Add New User'}
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    {editingUser && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                fullWidth
                                label="Email"
                                name="email"
                                value={editingUser.email || ''}
                                onChange={handleChange}
                                margin="normal"
                            />
                            <TextField
                                fullWidth
                                label="First Name"
                                name="first_name"
                                value={editingUser.first_name || ''}
                                onChange={handleChange}
                                margin="normal"
                            />
                            <TextField
                                fullWidth
                                label="Last Name"
                                name="last_name"
                                value={editingUser.last_name || ''}
                                onChange={handleChange}
                                margin="normal"
                            />
                            <TextField
                                fullWidth
                                label="Organization"
                                name="organization"
                                value={editingUser.organization || ''}
                                onChange={handleChange}
                                margin="normal"
                            />
                            <FormControl fullWidth margin="normal">
                                <InputLabel>Role</InputLabel>
                                <Select
                                    name="role"
                                    value={editingUser.role || ''}
                                    label="Role"
                                    onChange={handleChange}
                                >
                                    <MenuItem value="admin">Admin</MenuItem>
                                    <MenuItem value="data_consumer">Data Consumer</MenuItem>
                                    <MenuItem value="wallet_provider">Wallet Provider</MenuItem>
                                    <MenuItem value="nft_manager">NFT Manager</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={editingUser.status || false}
                                        name="status"
                                        onChange={handleChange}
                                        color="primary"
                                    />
                                }
                                label="Account Active"
                                sx={{ mt: 2 }}
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} color="primary" variant="contained">
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default UsersManager; 