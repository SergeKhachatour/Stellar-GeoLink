import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Alert,
    FormControlLabel,
    Switch
} from '@mui/material';

const UserManageDialog = ({ open, onClose, user, onSave }) => {
    if (!user) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>
                Manage User: {user.email}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    <TextField
                        fullWidth
                        label="Email"
                        name="email"
                        value={user.email || ''}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="First Name"
                        name="first_name"
                        value={user.first_name || ''}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Last Name"
                        name="last_name"
                        value={user.last_name || ''}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Organization"
                        name="organization"
                        value={user.organization || ''}
                        margin="normal"
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Role</InputLabel>
                        <Select
                            name="role"
                            value={user.role || ''}
                            label="Role"
                        >
                            <MenuItem value="admin">Admin</MenuItem>
                            <MenuItem value="data_consumer">Data Consumer</MenuItem>
                            <MenuItem value="wallet_provider">Wallet Provider</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={user.status || false}
                                name="status"
                                color="primary"
                            />
                        }
                        label="Account Active"
                        sx={{ mt: 2 }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">
                    Cancel
                </Button>
                <Button onClick={onSave} color="primary" variant="contained">
                    Save Changes
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default UserManageDialog; 