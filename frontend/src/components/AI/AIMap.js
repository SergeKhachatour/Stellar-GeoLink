import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box } from '@mui/material';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

/**
 * AI-Controlled Map Component
 * Displays dynamic map data based on AI responses
 * Supports: wallets, NFTs, Stellar accounts, network nodes
 */
const AIMap = ({ mapData, visible, onMapReady }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) {
      console.log('[AIMap] Map initialization skipped:', {
        hasContainer: !!mapContainer.current,
        hasMap: !!map.current
      });
      return;
    }
    
    if (!MAPBOX_TOKEN) {
      console.error('[AIMap] MAPBOX_TOKEN is missing! Map cannot be initialized.');
      return;
    }

    console.log('[AIMap] Initializing map...');
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 2,
        projection: 'globe'
      });

      map.current.on('load', () => {
        console.log('[AIMap] Map loaded successfully');
        setMapInitialized(true);
        if (onMapReady) {
          onMapReady(map.current);
        }
      });

      map.current.on('error', (e) => {
        console.error('[AIMap] Map error:', e);
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      return () => {
        if (map.current) {
          console.log('[AIMap] Cleaning up map');
          map.current.remove();
          map.current = null;
        }
      };
    } catch (error) {
      console.error('[AIMap] Error initializing AI map:', error);
    }
  }, [onMapReady]);

  // Clear all markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // Create wallet markers
  const createWalletMarkers = useCallback((wallets, mapInstance) => {
    if (!mapInstance || !wallets || wallets.length === 0) return;

    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    wallets.forEach((wallet, index) => {
      if (!wallet.longitude || !wallet.latitude) return;

      const el = document.createElement('div');
      el.className = 'ai-map-marker wallet-marker';
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#1976d2';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${wallet.organization || 'Wallet'}</h3>
            ${wallet.public_key ? `<p style="margin: 4px 0; font-size: 12px; word-break: break-all;"><strong>Public Key:</strong> ${wallet.public_key}</p>` : ''}
            ${wallet.blockchain ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Blockchain:</strong> ${wallet.blockchain}</p>` : ''}
            ${wallet.asset_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Asset:</strong> ${wallet.asset_name}</p>` : ''}
            ${wallet.distance_meters ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${Math.round(wallet.distance_meters)}m</p>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([wallet.longitude, wallet.latitude])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);
      bounds.extend([wallet.longitude, wallet.latitude]);
      hasBounds = true;
    });

    if (hasBounds && markersRef.current.length > 0) {
      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      });
    } else if (wallets.length > 0 && wallets[0].longitude && wallets[0].latitude) {
      // If only one marker, center on it
      mapInstance.flyTo({
        center: [wallets[0].longitude, wallets[0].latitude],
        zoom: 12,
        duration: 1000
      });
    }
  }, [clearMarkers]);

  // Create NFT markers
  const createNFTMarkers = useCallback((nfts, mapInstance) => {
    if (!mapInstance || !nfts || nfts.length === 0) return;

    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    nfts.forEach((nft, index) => {
      if (!nft.longitude || !nft.latitude) return;

      const el = document.createElement('div');
      el.className = 'ai-map-marker nft-marker';
      
      // Create NFT image marker
      if (nft.image_url || nft.server_url) {
        const img = document.createElement('img');
        img.src = nft.image_url || nft.server_url;
        img.style.width = '48px';
        img.style.height = '48px';
        img.style.borderRadius = '8px';
        img.style.border = '3px solid #FFD700';
        img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        img.style.objectFit = 'cover';
        img.style.cursor = 'pointer';
        img.onerror = () => {
          // Fallback to colored circle if image fails
          el.style.width = '24px';
          el.style.height = '24px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#FFD700';
          el.style.border = '2px solid white';
        };
        el.appendChild(img);
      } else {
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#FFD700';
        el.style.border = '2px solid white';
      }

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">NFT #${nft.id || index + 1}</h3>
            ${nft.name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Name:</strong> ${nft.name}</p>` : ''}
            ${nft.collection_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Collection:</strong> ${nft.collection_name}</p>` : ''}
            ${nft.rarity_level ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Rarity:</strong> ${nft.rarity_level}</p>` : ''}
            ${nft.distance_meters ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${Math.round(nft.distance_meters)}m</p>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([nft.longitude, nft.latitude])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);
      bounds.extend([nft.longitude, nft.latitude]);
      hasBounds = true;
    });

    if (hasBounds && markersRef.current.length > 0) {
      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [clearMarkers]);

  // Create Stellar account markers
  const createStellarMarkers = useCallback((accounts, mapInstance) => {
    if (!mapInstance || !accounts || accounts.length === 0) return;

    clearMarkers();

    accounts.forEach((account, index) => {
      if (!account.longitude || !account.latitude) return;

      const el = document.createElement('div');
      el.className = 'ai-map-marker stellar-marker';
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#7B68EE';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">Stellar Account</h3>
            ${account.public_key ? `<p style="margin: 4px 0; font-size: 12px; word-break: break-all;"><strong>Public Key:</strong> ${account.public_key}</p>` : ''}
            ${account.balance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Balance:</strong> ${account.balance} XLM</p>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([account.longitude, account.latitude])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  // Create geofence visualization
  const createGeofenceVisualization = useCallback((geofence, mapInstance) => {
    if (!mapInstance || !geofence) return;

    clearMarkers();

    // Remove existing geofence layers and sources if they exist
    if (mapInstance.getLayer('geofence-fill')) {
      mapInstance.removeLayer('geofence-fill');
    }
    if (mapInstance.getLayer('geofence-outline')) {
      mapInstance.removeLayer('geofence-outline');
    }
    if (mapInstance.getSource('geofence')) {
      mapInstance.removeSource('geofence');
    }

    const polygon = geofence.polygon || geofence;
    
    if (!polygon || !polygon.coordinates || !polygon.coordinates[0]) {
      console.error('Invalid geofence polygon data');
      return;
    }

    // Add geofence as a source
    mapInstance.addSource('geofence', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: polygon
      }
    });

    // Add fill layer
    mapInstance.addLayer({
      id: 'geofence-fill',
      type: 'fill',
      source: 'geofence',
      paint: {
        'fill-color': '#1976d2',
        'fill-opacity': 0.2
      }
    });

    // Add outline layer
    mapInstance.addLayer({
      id: 'geofence-outline',
      type: 'line',
      source: 'geofence',
      paint: {
        'line-color': '#1976d2',
        'line-width': 3,
        'line-opacity': 0.8
      }
    });

    // Calculate bounds from polygon coordinates
    const coordinates = polygon.coordinates[0];
    const bounds = new mapboxgl.LngLatBounds();
    
    coordinates.forEach(coord => {
      bounds.extend([coord[0], coord[1]]);
    });

    // Add center marker
    const center = bounds.getCenter();
    const el = document.createElement('div');
    el.className = 'ai-map-marker geofence-center';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#1976d2';
    el.style.border = '3px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${geofence.name || 'Geofence'}</h3>
          ${geofence.description ? `<p style="margin: 4px 0; font-size: 12px;">${geofence.description}</p>` : ''}
          ${geofence.id ? `<p style="margin: 4px 0; font-size: 12px;"><strong>ID:</strong> ${geofence.id}</p>` : ''}
          ${geofence.blockchain ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Blockchain:</strong> ${geofence.blockchain}</p>` : ''}
        </div>
      `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([center.lng, center.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    markersRef.current.push(marker);

    // Animate zoom to geofence with padding
    mapInstance.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 100, right: 100 },
      maxZoom: 16,
      duration: 2000, // 2 second animation
      easing: (t) => {
        // Ease-in-out cubic function for smooth animation
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
    });
  }, [clearMarkers]);

  // Create user location marker
  const createUserLocationMarker = useCallback((location, mapInstance) => {
    if (!mapInstance || !location) return;

    clearMarkers();

    const el = document.createElement('div');
    el.className = 'ai-map-marker user-location-marker';
    el.style.width = '32px';
    el.style.height = '32px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#4caf50';
    el.style.border = '4px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.5)';
    el.style.animation = 'pulse 2s infinite';

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 4px 12px rgba(76, 175, 80, 0.5); }
        50% { box-shadow: 0 4px 20px rgba(76, 175, 80, 0.8); }
        100% { box-shadow: 0 4px 12px rgba(76, 175, 80, 0.5); }
      }
    `;
    if (!document.head.querySelector('style[data-user-location-pulse]')) {
      style.setAttribute('data-user-location-pulse', 'true');
      document.head.appendChild(style);
    }

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">📍 Your Location</h3>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Latitude:</strong> ${location.latitude.toFixed(6)}</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Longitude:</strong> ${location.longitude.toFixed(6)}</p>
        </div>
      `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([location.longitude, location.latitude])
      .setPopup(popup)
      .addTo(mapInstance);

    markersRef.current.push(marker);

    // Animate zoom to user location
    mapInstance.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 15,
      duration: 1500,
      easing: (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
    });
  }, [clearMarkers]);

  // Update map based on mapData
  useEffect(() => {
    console.log('[AIMap] Map data effect triggered:', {
      hasMap: !!map.current,
      mapInitialized,
      hasMapData: !!mapData,
      mapData
    });
    
    if (!map.current || !mapInitialized || !mapData) {
      if (!map.current) console.log('[AIMap] Map not initialized yet');
      if (!mapInitialized) console.log('[AIMap] Map not loaded yet');
      if (!mapData) console.log('[AIMap] No map data provided');
      return;
    }

    const { type, data, center, zoom } = mapData;
    console.log('[AIMap] Processing map data:', { type, dataCount: data?.length, center, zoom });

    switch (type) {
      case 'wallets':
        createWalletMarkers(data, map.current);
        break;
      case 'nfts':
        createNFTMarkers(data, map.current);
        break;
      case 'stellar_accounts':
        createStellarMarkers(data, map.current);
        break;
      case 'geofence':
        createGeofenceVisualization(data, map.current);
        break;
      case 'user_location':
        if (data && data.length > 0) {
          createUserLocationMarker(data[0], map.current);
        } else if (center) {
          createUserLocationMarker({ latitude: center[1], longitude: center[0] }, map.current);
        }
        break;
      case 'clear':
        clearMarkers();
        // Remove geofence layers if they exist
        if (map.current.getLayer('geofence-fill')) {
          map.current.removeLayer('geofence-fill');
        }
        if (map.current.getLayer('geofence-outline')) {
          map.current.removeLayer('geofence-outline');
        }
        if (map.current.getSource('geofence')) {
          map.current.removeSource('geofence');
        }
        break;
      default:
        if (center && zoom) {
          map.current.flyTo({
            center,
            zoom,
            duration: 1000
          });
        }
    }
  }, [mapData, mapInitialized, createWalletMarkers, createNFTMarkers, createStellarMarkers, createGeofenceVisualization, createUserLocationMarker, clearMarkers]);

  useEffect(() => {
    console.log('[AIMap] Visibility changed:', visible);
  }, [visible]);

  if (!visible) {
    console.log('[AIMap] Map not visible, returning null');
    return null;
  }

  console.log('[AIMap] Rendering map container');

  return (
    <Box
      ref={mapContainer}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100vh',
        zIndex: visible ? 100 : 1, // Higher z-index when visible, but still behind chat (z-index 1000)
        pointerEvents: visible ? 'auto' : 'none',
        backgroundColor: visible ? 'transparent' : 'transparent' // Transparent so map shows through
      }}
    />
  );
};

export default AIMap;

