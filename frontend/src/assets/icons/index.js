import stellarIcon from './stellar-logo.svg';
import usdcIcon from './usdc-logo.svg';

export const blockchainIcons = {
    'Stellar': stellarIcon,
    'USDC': usdcIcon,
    // Add more blockchain icons as needed
    'default': '/default-marker.svg'
};

export const getBlockchainIcon = (blockchain) => {
    return blockchainIcons[blockchain] || blockchainIcons.default;
}; 