// Convert latitude and longitude to 3D coordinates on a sphere
export const latLngToVector3 = (lat, lng, radius = 1) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return { x, y, z };
};

// Convert 3D coordinates back to latitude and longitude
export const vector3ToLatLng = (x, y, z) => {
    const radius = Math.sqrt(x * x + y * y + z * z);
    const lat = 90 - (Math.acos(y / radius) * (180 / Math.PI));
    const lng = ((Math.atan2(z, -x) * (180 / Math.PI)) + 180) % 360 - 180;

    return { lat, lng };
};

// Calculate distance between two points on a sphere
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

// Group wallets by country
export const groupWalletsByCountry = async (wallets) => {
    const groupedWallets = {};
    
    for (const wallet of wallets) {
        // Use the country field directly from the wallet data
        const country = wallet.country;
        if (country) {
            if (!groupedWallets[country]) {
                groupedWallets[country] = [];
            }
            groupedWallets[country].push(wallet);
        }
    }
    
    return groupedWallets;
};

// Filter wallets by various criteria
export const filterWallets = (wallets, filters) => {
    return wallets.filter(wallet => {
        // Filter by blockchain
        if (filters.blockchain && wallet.blockchain !== filters.blockchain) {
            return false;
        }
        
        // Filter by organization
        if (filters.organization && !wallet.organization.toLowerCase().includes(filters.organization.toLowerCase())) {
            return false;
        }
        
        // Filter by asset name
        if (filters.assetName && !wallet.asset_name.toLowerCase().includes(filters.assetName.toLowerCase())) {
            return false;
        }
        
        // Filter by country
        if (filters.country && wallet.country !== filters.country) {
            return false;
        }
        
        return true;
    });
}; 