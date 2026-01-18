import React, { useState, useEffect, useCallback } from 'react';
import {
    Container,
    Typography,
    Box,
    Card,
    CardContent,
    CircularProgress,
    Alert,
    Chip,
    Grid,
    Paper,
    Link as MuiLink,
    Pagination,
    Stack
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
    LocationOn,
    CheckCircle,
    PlayArrow,
    Payment,
    Timeline,
    Event,
    FilterList
} from '@mui/icons-material';
import api from '../services/api';

const Events = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all'); // 'all', 'location_update', 'rule_matched', 'rule_executed', 'transaction_submitted'
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({
        total: 0,
        limit: 20,
        offset: 0,
        page: 1,
        totalPages: 1
    });

    const fetchEvents = useCallback(async (pageNum = page) => {
        try {
            setLoading(true);
            const response = await api.get('/events', {
                params: { 
                    limit: 20,
                    page: pageNum
                }
            });
            const allEvents = response.data.events || [];
            const paginationData = response.data.pagination || {};
            
            // Filter events if needed (client-side filtering for now)
            const filteredEvents = filter === 'all' 
                ? allEvents 
                : allEvents.filter(e => e.event_type === filter);
            
            setEvents(filteredEvents);
            setPagination(paginationData);
            setError(null);
        } catch (err) {
            console.error('Error fetching events:', err);
            setError('Failed to load events');
        } finally {
            setLoading(false);
        }
    }, [page, filter]);

    useEffect(() => {
        fetchEvents(page);
        // Refresh events every 30 seconds (only refresh current page)
        const interval = setInterval(() => fetchEvents(page), 30000);
        return () => clearInterval(interval);
    }, [page, fetchEvents]);

    // Refetch when filter changes (reset to page 1)
    useEffect(() => {
        setPage(1);
    }, [filter]);

    const handlePageChange = (event, value) => {
        setPage(value);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getEventIcon = (eventType) => {
        switch (eventType) {
            case 'location_update':
                return <LocationOn color="primary" sx={{ fontSize: 24 }} />;
            case 'rule_matched':
            case 'rule_executed':
                return <CheckCircle color="success" sx={{ fontSize: 24 }} />;
            case 'rule_execution_started':
                return <PlayArrow color="info" sx={{ fontSize: 24 }} />;
            case 'transaction_submitted':
            case 'payment_execution':
                return <Payment color="secondary" sx={{ fontSize: 24 }} />;
            default:
                return <Timeline color="action" sx={{ fontSize: 24 }} />;
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
        return date.toLocaleString();
    };

    const formatLocation = (eventData) => {
        if (!eventData || !eventData.latitude || !eventData.longitude) {
            return 'Location data not available';
        }
        
        return `${eventData.latitude}, ${eventData.longitude}`;
    };

    // Calculate event type counts from all events (for filter display)
    // Note: This is approximate since we're only showing one page
    const eventTypeCounts = events.reduce((acc, event) => {
        acc[event.event_type] = (acc[event.event_type] || 0) + 1;
        return acc;
    }, {});

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: 4, pb: 8 }}>
                <Container maxWidth="lg">
                    {/* Header */}
                    <Box sx={{ mb: 4, textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                            <Event sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                            <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold' }}>
                                GeoLink Events
                            </Typography>
                        </Box>
                        <Typography variant="h6" color="text.secondary" paragraph>
                            Public feed of rule executions and location updates
                        </Typography>
                    </Box>

                    {/* Filters */}
                    <Paper sx={{ p: 2, mb: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <FilterList sx={{ mr: 1 }} />
                            <Typography variant="h6">Filter Events</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip
                                label={`All (${pagination.total || events.length})`}
                                onClick={() => {
                                    setFilter('all');
                                    setPage(1);
                                }}
                                color={filter === 'all' ? 'primary' : 'default'}
                                clickable
                            />
                            {Object.entries(eventTypeCounts).map(([type, count]) => (
                                <Chip
                                    key={type}
                                    label={`${type.replace(/_/g, ' ')} (${count})`}
                                    onClick={() => {
                                        setFilter(type);
                                        setPage(1);
                                    }}
                                    color={filter === type ? 'primary' : 'default'}
                                    clickable
                                    sx={{ textTransform: 'capitalize' }}
                                />
                            ))}
                        </Box>
                    </Paper>

                    {/* Loading State */}
                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress />
                        </Box>
                    )}

                    {/* Error State */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 4 }}>
                            {error}
                        </Alert>
                    )}

                    {/* Events List */}
                    {!loading && !error && events.length === 0 && (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                No events found
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Events will appear here as they occur
                            </Typography>
                        </Paper>
                    )}

                    {!loading && !error && events.length > 0 && (
                        <Grid container spacing={3}>
                            {events.map((event) => (
                                <Grid item xs={12} key={event.id}>
                                    <Card sx={{ 
                                        height: '100%',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: 4
                                        }
                                    }}>
                                        <CardContent>
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                                                <Box sx={{ 
                                                    p: 1, 
                                                    borderRadius: 1, 
                                                    bgcolor: `${getEventColor(event.event_type)}.light`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {getEventIcon(event.event_type)}
                                                </Box>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                                        <Chip
                                                            label={event.event_type.replace(/_/g, ' ')}
                                                            size="small"
                                                            color={getEventColor(event.event_type)}
                                                            sx={{ textTransform: 'capitalize' }}
                                                        />
                                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                            {formatTime(event.created_at)}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body1" sx={{ mb: 1.5, fontWeight: 500 }}>
                                                        {event.event_message}
                                                    </Typography>
                                                    
                                                    {/* Event Data Details */}
                                                    {event.event_data && (
                                                        <Box sx={{ 
                                                            mt: 2, 
                                                            p: 2, 
                                                            bgcolor: 'grey.50', 
                                                            borderRadius: 1,
                                                            border: '1px solid',
                                                            borderColor: 'divider'
                                                        }}>
                                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', mb: 1, display: 'block' }}>
                                                                Event Details:
                                                            </Typography>
                                                            {event.event_data.latitude && event.event_data.longitude && (
                                                                <Box sx={{ mb: 1 }}>
                                                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                                                        Location: 
                                                                    </Typography>
                                                                    <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                                                                        {formatLocation(event.event_data)}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {event.event_data.rule_id && (
                                                                <Box sx={{ mb: 1 }}>
                                                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                                                        Rule ID: 
                                                                    </Typography>
                                                                    <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                                                                        {event.event_data.rule_id}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {event.event_data.rule_name && (
                                                                <Box sx={{ mb: 1 }}>
                                                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                                                        Rule: 
                                                                    </Typography>
                                                                    <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                                                                        {event.event_data.rule_name}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {event.event_data.transaction_hash && (
                                                                <Box>
                                                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                                                        Transaction: 
                                                                    </Typography>
                                                                    <Typography variant="body2" component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                                        {event.event_data.transaction_hash.substring(0, 16)}...
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                        </Box>
                                                    )}
                                                </Box>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    )}

                    {/* Pagination */}
                    {!loading && !error && events.length > 0 && pagination.totalPages > 1 && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                            <Stack spacing={2}>
                                <Pagination 
                                    count={pagination.totalPages} 
                                    page={pagination.page || page}
                                    onChange={handlePageChange}
                                    color="primary"
                                    size="large"
                                    showFirstButton
                                    showLastButton
                                />
                                <Typography variant="body2" color="text.secondary" textAlign="center">
                                    Showing {((pagination.page || page) - 1) * pagination.limit + 1} to {Math.min((pagination.page || page) * pagination.limit, pagination.total)} of {pagination.total} events
                                </Typography>
                            </Stack>
                        </Box>
                    )}

                    {/* Footer Info */}
                    <Box sx={{ mt: 6, textAlign: 'center' }}>
                        <Paper sx={{ p: 3, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                            <Typography variant="h6" gutterBottom>
                                About GeoLink Events
                            </Typography>
                            <Typography variant="body2" paragraph>
                                This feed shows public events from rule executions and location updates on the Stellar GeoLink platform.
                                All events are recorded on-chain and can be verified using Stellar's blockchain.
                            </Typography>
                            <MuiLink 
                                component={RouterLink} 
                                to="/contracts" 
                                sx={{ color: 'inherit', textDecoration: 'underline' }}
                            >
                                View Smart Contracts →
                            </MuiLink>
                        </Paper>
                    </Box>
                </Container>
            </Box>
    );
};

export default Events;
