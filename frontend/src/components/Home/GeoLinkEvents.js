import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Box,
    CircularProgress,
    Alert,
    Chip,
    Link
} from '@mui/material';
import {
    LocationOn,
    CheckCircle,
    PlayArrow,
    Payment,
    Timeline,
    ArrowForward
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import api from '../../services/api';

const GeoLinkEvents = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEvents = async () => {
        try {
            const response = await api.get('/events', {
                params: { limit: 4 }
            });
            setEvents(response.data.events || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching events:', err);
            setError('Failed to load events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        // Refresh events every 10 seconds
        const interval = setInterval(fetchEvents, 10000);
        return () => clearInterval(interval);
    }, []);

    const getEventIcon = (eventType) => {
        switch (eventType) {
            case 'location_update':
                return <LocationOn color="primary" sx={{ fontSize: 20 }} />;
            case 'rule_matched':
            case 'rule_executed':
                return <CheckCircle color="success" sx={{ fontSize: 20 }} />;
            case 'rule_execution_started':
                return <PlayArrow color="info" sx={{ fontSize: 20 }} />;
            case 'transaction_submitted':
            case 'payment_execution':
                return <Payment color="secondary" sx={{ fontSize: 20 }} />;
            default:
                return <Timeline color="action" sx={{ fontSize: 20 }} />;
        }
    };

    const getEventColor = (eventType) => {
        switch (eventType) {
            case 'location_update':
                return 'primary';
            case 'rule_matched':
            case 'rule_executed':
                return 'success';
            case 'rule_execution_started':
                return 'info';
            case 'transaction_submitted':
            case 'payment_execution':
                return 'secondary';
            default:
                return 'default';
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);

        if (diffSecs < 60) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    return (
        <Card sx={{ 
            height: '100%',
            backgroundColor: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: 2,
            border: '1px solid rgba(0, 0, 0, 0.1)'
        }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Timeline sx={{ fontSize: 24, mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6" component="h3" sx={{ fontWeight: 'bold', color: '#000000' }}>
                        GeoLink Events
                    </Typography>
                </Box>

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {!loading && !error && events.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                            No events yet. Events will appear here as they occur.
                        </Typography>
                    </Box>
                )}

                {!loading && !error && events.length > 0 && (
                    <Box sx={{ 
                        maxHeight: '400px', 
                        overflowY: 'auto',
                        '&::-webkit-scrollbar': {
                            width: '8px',
                        },
                        '&::-webkit-scrollbar-track': {
                            backgroundColor: 'rgba(0,0,0,0.05)',
                        },
                        '&::-webkit-scrollbar-thumb': {
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '4px',
                        },
                    }}>
                        {events.map((event) => (
                            <Box
                                key={event.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    py: 1.5,
                                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                                    '&:last-child': {
                                        borderBottom: 'none'
                                    }
                                }}
                            >
                                <Box sx={{ mr: 1.5, mt: 0.5 }}>
                                    {getEventIcon(event.event_type)}
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                                        <Chip
                                            label={event.event_type.replace(/_/g, ' ')}
                                            size="small"
                                            color={getEventColor(event.event_type)}
                                            sx={{ 
                                                fontSize: '0.7rem',
                                                height: '20px',
                                                textTransform: 'capitalize'
                                            }}
                                        />
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                            {formatTime(event.created_at)}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ color: '#000000', lineHeight: 1.5 }}>
                                        {event.event_message}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Show More Link */}
                <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    mt: 2,
                    pt: 2,
                    borderTop: '1px solid rgba(0,0,0,0.05)'
                }}>
                    <Link
                        component={RouterLink}
                        to="/events"
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            textDecoration: 'none',
                            color: 'primary.main',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            '&:hover': {
                                textDecoration: 'underline'
                            },
                            '@keyframes subtleBlink': {
                                '0%, 100%': {
                                    opacity: 1
                                },
                                '50%': {
                                    opacity: 0.6
                                }
                            },
                            animation: 'subtleBlink 2s ease-in-out infinite'
                        }}
                    >
                        Show more
                        <ArrowForward sx={{ fontSize: 16 }} />
                    </Link>
                </Box>
            </CardContent>
        </Card>
    );
};

export default GeoLinkEvents;
