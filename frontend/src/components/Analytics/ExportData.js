import React from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import { format } from 'date-fns';
import api from '../../utils/api';

const ExportData = ({ data, type }) => {
    const [anchorEl, setAnchorEl] = React.useState(null);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const exportToCSV = () => {
        let csvContent = '';
        switch (type) {
            case 'stats':
                csvContent = `Date,Total Wallets,Active Wallets,Updated 24h\n${
                    format(new Date(), 'yyyy-MM-dd')},${data.total_wallets},${data.active_wallets},${data.updated_24h}`;
                break;
            case 'anomalies':
                csvContent = 'Wallet,Distance (km),Time Difference (s),Detected At\n' +
                    data.map(a => `${a.public_key},${(a.distance/1000).toFixed(2)},${a.time_diff},${format(new Date(a.created_at), 'yyyy-MM-dd HH:mm:ss')}`).join('\n');
                break;
            default:
                return;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${type}_export_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
        link.click();
        handleClose();
    };

    const exportToJSON = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${type}_export_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
        link.click();
        handleClose();
    };

    return (
        <div>
            <Button
                variant="outlined"
                size="small"
                onClick={handleClick}
            >
                Export
            </Button>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
            >
                <MenuItem onClick={exportToCSV}>Export as CSV</MenuItem>
                <MenuItem onClick={exportToJSON}>Export as JSON</MenuItem>
            </Menu>
        </div>
    );
};

export default ExportData; 