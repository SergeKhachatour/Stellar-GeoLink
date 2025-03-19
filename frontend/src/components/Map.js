import React, { useState } from 'react';
import ReactMapGL, { Marker, Popup, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getBlockchainIcon } from '../assets/icons';
import MapLegend from './MapLegend';

const CustomMarker = ({ blockchain, zoom }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    const baseSize = 24;
    const size = Math.max(baseSize * (zoom / 10), 16);
    
    return (
        <motion.img 
            src={getBlockchainIcon(blockchain)} 
            alt={blockchain}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
                scale: isHovered ? 1.2 : 1, 
                opacity: 1,
                width: size,
                height: size
            }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            whileHover={{ scale: 1.2 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                cursor: 'pointer',
                filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))',
                transformOrigin: 'bottom center'
            }}
        />
    );
};

const MapComponent = ({ locations = [] }) => {
    const [popupInfo, setPopupInfo] = useState(null);
    const [viewport, setViewport] = useState({
        latitude: 40.7128,
        longitude: -74.0060,
        zoom: 11,
        width: '100%',
        height: '100%'
    });

    return (
        <div style={{ position: 'relative', width: '100%', height: '600px' }}>
            <ReactMapGL
                {...viewport}
                onViewportChange={setViewport}
                mapStyle="mapbox://styles/mapbox/streets-v11"
                mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
            >
                <NavigationControl style={{ right: 10, top: 10 }} />
                
                <AnimatePresence>
                    {locations.map((location, index) => (
                        <Marker
                            key={index}
                            latitude={location.latitude}
                            longitude={location.longitude}
                            offsetLeft={-12}
                            offsetTop={-24}
                        >
                            <div onClick={() => setPopupInfo(location)}>
                                <CustomMarker 
                                    blockchain={location.blockchain} 
                                    zoom={viewport.zoom}
                                />
                            </div>
                        </Marker>
                    ))}
                </AnimatePresence>

                {popupInfo && (
                    <Popup
                        tipSize={5}
                        anchor="bottom"
                        longitude={popupInfo.longitude}
                        latitude={popupInfo.latitude}
                        closeOnClick={false}
                        onClose={() => setPopupInfo(null)}
                    >
                        <div>
                            <h3 style={{ margin: '0 0 8px 0' }}>
                                {popupInfo.description || 'Wallet Location'}
                            </h3>
                            <p style={{ margin: '4px 0' }}>
                                Type: {popupInfo.wallet_type}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                                Blockchain: {popupInfo.blockchain}
                            </p>
                        </div>
                    </Popup>
                )}

                <MapLegend />
            </ReactMapGL>
        </div>
    );
};

export default MapComponent; 