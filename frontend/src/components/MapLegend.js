import React from 'react';
import { Box, Typography } from '@mui/material';
import { blockchainIcons } from '../assets/icons';

const MapLegend = () => {
    return (
        <Box
            sx={{
                position: 'absolute',
                bottom: 32,
                right: 32,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: 2,
                borderRadius: 1,
                boxShadow: 1,
                zIndex: 1
            }}
        >
            <Typography variant="subtitle2" gutterBottom>
                Blockchain Types
            </Typography>
            {Object.entries(blockchainIcons).map(([name, icon]) => (
                name !== 'default' && (
                    <Box key={name} sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        <img 
                            src={icon} 
                            alt={name} 
                            style={{ width: 20, height: 20, marginRight: 8 }} 
                        />
                        <Typography variant="body2">{name}</Typography>
                    </Box>
                )
            ))}
        </Box>
    );
};

export default MapLegend; 