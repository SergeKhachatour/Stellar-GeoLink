import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
const NFTLocationMap = ({ nft, userLocation }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [distance, setDistance] = useState(null);

  // Calculate distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  useEffect(() => {
    if (!mapContainer.current || !nft || !nft.latitude || !nft.longitude) {
      return;
    }

    if (!process.env.REACT_APP_MAPBOX_TOKEN) {
      console.warn('Mapbox token not configured for NFT location map');
      return;
    }

    mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

    const nftLat = parseFloat(nft.latitude);
    const nftLng = parseFloat(nft.longitude);

    // Calculate distance if user location is available
    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const dist = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        nftLat,
        nftLng
      );
      setDistance(dist);
    }

    // Create map
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [nftLng, nftLat],
      zoom: 13,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      // Create NFT marker with image
      const constructIPFSUrl = (serverUrl, hash) => {
        if (!hash) return null;
        if (!serverUrl) return `https://ipfs.io/ipfs/${hash}`;
        
        let baseUrl = serverUrl.trim();
        baseUrl = baseUrl.replace(/\/ipfs\/.*$/i, '');
        baseUrl = baseUrl.replace(/\/+$/, '');
        baseUrl = baseUrl.replace(/^https?:\/\//i, '');
        
        return `https://${baseUrl}/ipfs/${hash}`;
      };

      const imageUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash) 
        || nft.image_url 
        || nft.full_ipfs_url
        || 'https://via.placeholder.com/64x64?text=NFT';

      const nftMarkerEl = document.createElement('div');
      nftMarkerEl.style.cssText = `
        width: 64px;
        height: 64px;
        border-radius: 8px;
        background-image: url('${imageUrl}');
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        border: 3px solid #FFD700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      `;

      const nftMarker = new mapboxgl.Marker({ element: nftMarkerEl })
        .setLngLat([nftLng, nftLat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="padding: 8px;">
            <strong>🎨 ${nft.name || 'NFT'}</strong><br/>
            <small>Collection: ${nft.collection?.name || 'Unknown'}</small>
          </div>
        `))
        .addTo(map);
      markersRef.current.push(nftMarker);

      // Create custom user icon marker
      const createUserIcon = (color) => {
        const el = document.createElement('div');
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = color;
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '18px';
        el.innerHTML = '👤';
        return el;
      };

      // Add user location marker if available
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        const userIcon = createUserIcon('#1976d2');
        const userMarkerLngLat = [userLocation.longitude, userLocation.latitude];
        const userMarker = new mapboxgl.Marker({ element: userIcon })
          .setLngLat(userMarkerLngLat)
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="padding: 8px;">
              <strong>👤 Your Location</strong><br/>
              <small>Distance: ${distance ? `${(distance / 1000).toFixed(2)} km` : 'Calculating...'}</small>
            </div>
          `))
          .addTo(map);
        markersRef.current.push(userMarker);

        // Add dotted line from user location to NFT location
        const lineCoordinates = [
          userMarkerLngLat,
          [nftLng, nftLat]
        ];
        
        const lineFeature = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: lineCoordinates
          }
        };

        if (!map.getSource('user-to-nft-line')) {
          map.addSource('user-to-nft-line', {
            type: 'geojson',
            data: lineFeature
          });
        } else {
          map.getSource('user-to-nft-line').setData(lineFeature);
        }

        if (!map.getLayer('user-to-nft-line-layer')) {
          map.addLayer({
            id: 'user-to-nft-line-layer',
            type: 'line',
            source: 'user-to-nft-line',
            paint: {
              'line-color': '#FFD700',
              'line-width': 2,
              'line-opacity': 0.6,
              'line-dasharray': [2, 2]
            }
          });
        }
      }

      // Fit bounds to show all markers
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([nftLng, nftLat]);
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        bounds.extend([userLocation.longitude, userLocation.latitude]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50 });
      }
    });

    return () => {
      // Clean up markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [nft, userLocation, distance]);

  return (
    <Box>
      {distance !== null && (
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Distance: {distance < 1000 ? `${distance.toFixed(0)} m` : `${(distance / 1000).toFixed(2)} km`}
        </Typography>
      )}
      <Box
        ref={mapContainer}
        sx={{
          width: '100%',
          height: '400px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #e0e0e0',
          mt: 1
        }}
      />
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            if (mapRef.current && nft.latitude && nft.longitude) {
              mapRef.current.flyTo({
                center: [parseFloat(nft.longitude), parseFloat(nft.latitude)],
                zoom: 18,
                duration: 1000
              });
            }
          }}
        >
          🔍 Zoom to NFT
        </Button>
        {userLocation && userLocation.latitude && userLocation.longitude && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.flyTo({
                  center: [userLocation.longitude, userLocation.latitude],
                  zoom: 18,
                  duration: 1000
                });
              }
            }}
          >
            👤 Zoom to Me
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default NFTLocationMap;
