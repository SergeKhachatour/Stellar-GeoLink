import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';

const WalletMap = ({ wallets, geofences, center, drawingMode, onLocationSelect, onGeofenceDrawn }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);

    useEffect(() => {
        if (!map.current) {
            const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';
            
            if (!mapboxToken) {
                console.error('REACT_APP_MAPBOX_TOKEN is not set. Please check your environment variables.');
                return;
            }
            
            mapboxgl.accessToken = mapboxToken;
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: 'mapbox://styles/mapbox/streets-v11',
                center: center || [-74.5, 40],
                zoom: 9
            });

            // Add navigation controls
            map.current.addControl(new mapboxgl.NavigationControl());

            // Initialize drawing controls
            draw.current = new MapboxDraw({
                displayControlsDefault: false,
                controls: {
                    polygon: true,
                    trash: true
                },
                styles: [
                    // Polygon fill
                    {
                        'id': 'gl-draw-polygon-fill-inactive',
                        'type': 'fill',
                        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                        'paint': {
                            'fill-color': '#3fb1ce',
                            'fill-outline-color': '#3fb1ce',
                            'fill-opacity': 0.1
                        }
                    },
                    // Polygon fill active
                    {
                        'id': 'gl-draw-polygon-fill-active',
                        'type': 'fill',
                        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                        'paint': {
                            'fill-color': '#fbb03b',
                            'fill-outline-color': '#fbb03b',
                            'fill-opacity': 0.1
                        }
                    },
                    // Polygon outline
                    {
                        'id': 'gl-draw-polygon-stroke-inactive',
                        'type': 'line',
                        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                        'layout': {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        'paint': {
                            'line-color': '#3fb1ce',
                            'line-width': 2
                        }
                    },
                    // Polygon outline active
                    {
                        'id': 'gl-draw-polygon-stroke-active',
                        'type': 'line',
                        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                        'layout': {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        'paint': {
                            'line-color': '#fbb03b',
                            'line-width': 2
                        }
                    },
                    // Line inactive
                    {
                        'id': 'gl-draw-line-inactive',
                        'type': 'line',
                        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
                        'layout': {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        'paint': {
                            'line-color': '#3fb1ce',
                            'line-width': 2
                        }
                    },
                    // Line active
                    {
                        'id': 'gl-draw-line-active',
                        'type': 'line',
                        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
                        'layout': {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        'paint': {
                            'line-color': '#fbb03b',
                            'line-width': 2
                        }
                    },
                    // Point inactive
                    {
                        'id': 'gl-draw-point-inactive',
                        'type': 'circle',
                        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
                        'paint': {
                            'circle-radius': 5,
                            'circle-color': '#3fb1ce'
                        }
                    },
                    // Point active
                    {
                        'id': 'gl-draw-point-active',
                        'type': 'circle',
                        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['==', 'meta', 'feature']],
                        'paint': {
                            'circle-radius': 7,
                            'circle-color': '#fbb03b'
                        }
                    }
                ]
            });
            map.current.addControl(draw.current);

            // Handle draw completion
            map.current.on('draw.create', (e) => {
                const coordinates = e.features[0].geometry.coordinates[0];
                onGeofenceDrawn && onGeofenceDrawn(coordinates);
                draw.current.deleteAll(); // Clear the drawing
            });

            // Add click handler for location selection
            if (onLocationSelect) {
                map.current.on('click', (e) => {
                    onLocationSelect({
                        latitude: e.lngLat.lat,
                        longitude: e.lngLat.lng
                    });
                });
            }
        }

        // Toggle drawing mode
        if (draw.current) {
            if (drawingMode) {
                draw.current.changeMode('draw_polygon');
            } else {
                draw.current.deleteAll();
                draw.current.changeMode('simple_select');
            }
        }

        // Add wallet markers
        if (wallets && wallets.length > 0) {
            wallets.forEach(wallet => {
                const el = document.createElement('div');
                el.className = `marker ${wallet.wallet_type.toLowerCase()}`;
                
                new mapboxgl.Marker(el)
                    .setLngLat([wallet.longitude, wallet.latitude])
                    .setPopup(new mapboxgl.Popup({ offset: 25 })
                        .setHTML(`
                            <h3>${wallet.blockchain}</h3>
                            <p>${wallet.description || 'No description'}</p>
                            <p>Type: ${wallet.wallet_type}</p>
                            ${wallet.distance ? `<p>Distance: ${(wallet.distance / 1000).toFixed(2)} km</p>` : ''}
                        `))
                    .addTo(map.current);
            });
        }

        // Add geofence polygons
        if (geofences && geofences.length > 0) {
            if (map.current.getSource('geofences')) {
                map.current.removeLayer('geofences-fill');
                map.current.removeLayer('geofences-outline');
                map.current.removeSource('geofences');
            }

            map.current.addSource('geofences', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: geofences.map(geofence => ({
                        type: 'Feature',
                        geometry: geofence.boundary,
                        properties: {
                            name: geofence.name,
                            id: geofence.id
                        }
                    }))
                }
            });

            map.current.addLayer({
                id: 'geofences-fill',
                type: 'fill',
                source: 'geofences',
                paint: {
                    'fill-color': '#0080ff',
                    'fill-opacity': 0.2
                }
            });

            map.current.addLayer({
                id: 'geofences-outline',
                type: 'line',
                source: 'geofences',
                paint: {
                    'line-color': '#0080ff',
                    'line-width': 2
                }
            });
        }

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [wallets, geofences, center, drawingMode, onLocationSelect, onGeofenceDrawn]);

    return (
        <div 
            ref={mapContainer} 
            className="map-container" 
            style={{ height: '500px', width: '100%' }}
        />
    );
};

export default WalletMap; 