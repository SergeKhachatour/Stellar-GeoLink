import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip
} from '@mui/material';
import { Delete as DeleteIcon, Warning as WarningIcon } from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const SessionManager = () => {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDialog, setConfirmDialog] = useState({ open: false, sessionId: null });
    const { user } = useAuth();

    const fetchSessions = async () => {
        try {
            const response = await api.get('/api/user/sessions');
            setSessions(response.data);
        } catch (error) {
            console.error('Error fetching sessions:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleRevokeSession = async (sessionId) => {
        try {
            await api.delete(`/api/user/sessions/${sessionId}`);
            setSessions(sessions.filter(s => s.session_id !== sessionId));
        } catch (error) {
            console.error('Error revoking session:', error);
        }
        setConfirmDialog({ open: false, sessionId: null });
    };

    const handleRevokeAllOthers = async () => {
        try {
            await api.delete('/api/user/sessions');
            fetchSessions(); // Refresh the list
        } catch (error) {
            console.error('Error revoking other sessions:', error);
        }
    };

    const isCurrentSession = (session) => {
        return session.ip_address === user?.ipAddress;
    };

    if (loading) {
        return <Typography>Loading sessions...</Typography>;
    }

    return (
        <Box sx={{ maxWidth: 800, margin: 'auto', mt: 3 }}>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Active Sessions
                    </Typography>
                    <List>
                        {sessions.map((session) => (
                            <ListItem 
                                key={session.session_id}
                                sx={{
                                    bgcolor: isCurrentSession(session) ? 'action.selected' : 'inherit'
                                }}
                            >
                                <ListItemText
                                    primary={
                                        <Typography>
                                            {session.device_info?.userAgent || 'Unknown Device'}
                                            {isCurrentSession(session) && ' (Current Session)'}
                                        </Typography>
                                    }
                                    secondary={
                                        <>
                                            <Typography variant="body2" component="span">
                                                Last activity: {formatDistanceToNow(new Date(session.last_activity))} ago
                                            </Typography>
                                            <br />
                                            <Typography variant="body2" component="span">
                                                IP: {session.ip_address}
                                            </Typography>
                                        </>
                                    }
                                />
                                <ListItemSecondaryAction>
                                    {!isCurrentSession(session) && (
                                        <Tooltip title="Revoke Session">
                                            <IconButton
                                                edge="end"
                                                onClick={() => setConfirmDialog({
                                                    open: true,
                                                    sessionId: session.session_id
                                                })}
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                    {sessions.length > 1 && (
                        <Box sx={{ mt: 2 }}>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<WarningIcon />}
                                onClick={handleRevokeAllOthers}
                            >
                                Revoke All Other Sessions
                            </Button>
                        </Box>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({ open: false, sessionId: null })}
            >
                <DialogTitle>Confirm Session Revocation</DialogTitle>
                <DialogContent>
                    Are you sure you want to revoke this session? The user will be logged out immediately.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialog({ open: false, sessionId: null })}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => handleRevokeSession(confirmDialog.sessionId)}
                        color="error"
                    >
                        Revoke
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SessionManager; 