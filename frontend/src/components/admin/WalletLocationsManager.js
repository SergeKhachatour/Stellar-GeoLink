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
    FormControl,
    Select,
    MenuItem,
    InputLabel,
    ToggleButtonGroup,
    ToggleButton,
    Chip
} from '@mui/material';
import { MapOutlined, TableChart } from '@mui/icons-material';
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
    const [viewMode, setViewMode] = useState('map'); // Changed default to 'map'

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
        <Box>
            <Typography variant="h6" gutterBottom sx={{ 
                fontWeight: 500,
                color: 'text.primary'
            }}>
                Wallet Locations
            </Typography>

            <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(e, newValue) => newValue && setViewMode(newValue)}
                    size="small"
                >
                    <ToggleButton value="map">
                        <MapOutlined sx={{ mr: 1 }} />
                        Map View
                    </ToggleButton>
                    <ToggleButton value="table">
                        <TableChart sx={{ mr: 1 }} />
                        Table View
                    </ToggleButton>
                </ToggleButtonGroup>

                <Box sx={{ display: 'flex', gap: 2, ml: 'auto' }}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Blockchain</InputLabel>
                        <Select
                            value={filters.blockchain}
                            onChange={(e) => setFilters({...filters, blockchain: e.target.value})}
                            label="Blockchain"
                        >
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="Stellar">Stellar</MenuItem>
                            <MenuItem value="Circle">Circle</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Wallet Type</InputLabel>
                        <Select
                            value={filters.walletType}
                            onChange={(e) => setFilters({...filters, walletType: e.target.value})}
                            label="Wallet Type"
                        >
                            <MenuItem value="">All</MenuItem>
                            {Array.isArray(walletTypes) && walletTypes.map(type => (
                                <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>
            </Box>

            {viewMode === 'map' ? (
                <Box sx={{ height: '600px', width: '100%', borderRadius: 1, overflow: 'hidden' }}>
                    <WalletMap 
                        wallets={filteredLocations}
                        center={[-74.5, 40]}
                    />
                </Box>
            ) : (
                <TableContainer component={Paper} elevation={0}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 500 }}>Public Key</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Blockchain</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Location</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Provider</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Last Updated</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredLocations.map(location => (
                                <TableRow key={location.id}>
                                    <TableCell>{location.public_key}</TableCell>
                                    <TableCell>{location.blockchain}</TableCell>
                                    <TableCell>{location.wallet_type}</TableCell>
                                    <TableCell>{location.description}</TableCell>
                                    <TableCell>{`${location.latitude}, ${location.longitude}`}</TableCell>
                                    <TableCell>{location.provider_name}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={location.location_enabled ? 'Active' : 'Disabled'}
                                            color={location.location_enabled ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {new Date(location.last_updated).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            color={location.location_enabled ? 'error' : 'success'}
                                            onClick={() => handleToggleStatus(location.id, location.location_enabled)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            {location.location_enabled ? 'Disable' : 'Enable'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default WalletLocationsManager; 