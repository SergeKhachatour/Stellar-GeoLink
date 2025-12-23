import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box } from '@mui/material';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Helper function to construct IPFS URL from server_url and hash
// Matches the implementation in NFT Dashboard for consistency
// Handles cases where server_url might already contain /ipfs/ path
// Always uses the hash from ipfs_hash field, not from server_url
const constructIPFSUrl = (serverUrl, hash) => {
  if (!hash) return null;
  if (!serverUrl) return `https://ipfs.io/ipfs/${hash}`; // Fallback to public gateway
  
  let baseUrl = serverUrl.trim();
  
  // Remove any existing /ipfs/ path and everything after it
  // This handles cases where server_url might be: 
  // - "domain.com/ipfs/somehash" 
  // - "domain.com/ipfs/somehash/"
  // - "https://domain.com/ipfs/somehash"
  // - "domain.com/ipfs/" (just the path without hash)
  // IMPORTANT: We always use the hash from ipfs_hash field, not from server_url
  baseUrl = baseUrl.replace(/\/ipfs\/.*$/i, '');
  
  // Remove trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  // Remove protocol if present (we'll add https://)
  baseUrl = baseUrl.replace(/^https?:\/\//i, '');
  
  // Ensure it has https:// protocol
  if (baseUrl) {
    baseUrl = `https://${baseUrl}`;
  } else {
    // If baseUrl is empty after cleaning, fallback to public gateway
    return `https://ipfs.io/ipfs/${hash}`;
  }
  
  // Construct full IPFS URL using the hash from ipfs_hash field
  // Note: hash might already include filename for Workflow 2 NFTs (e.g., "hash/filename.png")
  return `${baseUrl}/ipfs/${hash}`;
};

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

  // Initialize map function
  const initializeMap = useCallback(() => {
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

      // Add navigation controls (zoom, rotate, pitch)
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add geolocate control for user location
      map.current.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }),
        'top-right'
      );
    } catch (error) {
      console.error('[AIMap] Error initializing AI map:', error);
    }
  }, [onMapReady]);

  // Initialize map when visible
  useEffect(() => {
    // Only initialize if visible and container is available
    if (!visible) {
      console.log('[AIMap] Map not visible, skipping initialization');
      return;
    }
    
    if (!mapContainer.current) {
      console.log('[AIMap] Map container not available yet, will retry');
      // Retry after a short delay to allow ref to be set
      const timer = setTimeout(() => {
        if (mapContainer.current && !map.current) {
          initializeMap();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    
    if (map.current) {
      console.log('[AIMap] Map already initialized');
      // If map exists but container was removed from DOM, we need to reattach
      // Check if map's container is still in the DOM
      if (map.current.getContainer() && !document.body.contains(map.current.getContainer())) {
        console.log('[AIMap] Map container was removed from DOM, reinitializing...');
        // Remove old map instance
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
        // Reinitialize
        initializeMap();
      }
      return;
    }
    
    initializeMap();
  }, [visible, initializeMap]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        console.log('[AIMap] Cleaning up map');
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  // Clear all markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }, []);

  // Create radius circle around a point
  const createRadiusCircle = useCallback((center, radiusMeters, mapInstance) => {
    if (!mapInstance || !center || !radiusMeters) return null;

    // Convert radius from meters to degrees (approximate)
    const radiusDegrees = radiusMeters / 111000; // Rough conversion

    // Create circle points
    const points = 64;
    const circle = [];
    for (let i = 0; i <= points; i++) {
      const angle = (i * 360) / points;
      const lat = center[1] + radiusDegrees * Math.cos(angle * Math.PI / 180);
      const lng = center[0] + radiusDegrees * Math.cos(angle * Math.PI / 180) / Math.cos(center[1] * Math.PI / 180);
      circle.push([lng, lat]);
    }
    circle.push(circle[0]); // Close the circle

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [circle]
      }
    };
  }, []);

  // Create wallet markers with distance and navigation
  const createWalletMarkers = useCallback((wallets, mapInstance, userLocation = null) => {
    if (!mapInstance || !wallets || wallets.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    wallets.forEach((wallet, index) => {
      if (!wallet.longitude || !wallet.latitude) return;

      // Calculate distance if user location is available
      let distance = wallet.distance_meters || wallet.distance;
      if (!distance && userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          wallet.latitude,
          wallet.longitude
        );
      }

      const el = document.createElement('div');
      el.className = 'ai-map-marker wallet-marker';
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#1976d2';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      // Create radius circle for this wallet if radius is provided
      if (wallet.radius && wallet.radius > 0) {
        const circleFeature = createRadiusCircle(
          [wallet.longitude, wallet.latitude],
          wallet.radius,
          mapInstance
        );

        if (circleFeature && !mapInstance.getSource(`wallet-radius-${index}`)) {
          mapInstance.addSource(`wallet-radius-${index}`, {
            type: 'geojson',
            data: circleFeature
          });

          mapInstance.addLayer({
            id: `wallet-radius-${index}-fill`,
            type: 'fill',
            source: `wallet-radius-${index}`,
            paint: {
              'fill-color': '#1976d2',
              'fill-opacity': 0.05
            }
          });

          mapInstance.addLayer({
            id: `wallet-radius-${index}-outline`,
            type: 'line',
            source: `wallet-radius-${index}`,
            paint: {
              'line-color': '#1976d2',
              'line-width': 1,
              'line-opacity': 0.3
            }
          });
        }
      }

      const distanceText = distance 
        ? distance < 1000 
          ? `${Math.round(distance)}m` 
          : `${(distance / 1000).toFixed(2)}km`
        : 'Unknown';

      // Create navigation URL
      const navUrl = userLocation 
        ? `https://www.google.com/maps/dir/${userLocation.latitude},${userLocation.longitude}/${wallet.latitude},${wallet.longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${wallet.latitude},${wallet.longitude}`;

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${wallet.organization || 'Wallet'}</h3>
            ${wallet.public_key ? `<p style="margin: 4px 0; font-size: 12px; word-break: break-all;"><strong>Public Key:</strong> ${wallet.public_key.substring(0, 20)}...</p>` : ''}
            ${wallet.blockchain ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Blockchain:</strong> ${wallet.blockchain}</p>` : ''}
            ${wallet.asset_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Asset:</strong> ${wallet.asset_name}</p>` : ''}
            ${distance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${distanceText}</p>` : ''}
            ${userLocation ? `<a href="${navUrl}" target="_blank" style="display: inline-block; margin-top: 8px; padding: 6px 12px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">🗺️ Navigate</a>` : ''}
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
  }, [clearMarkers, calculateDistance, createRadiusCircle]);

  // Create NFT markers with distance and navigation
  const createNFTMarkers = useCallback((nfts, mapInstance, userLocation = null) => {
    if (!mapInstance || !nfts || nfts.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    nfts.forEach((nft, index) => {
      if (!nft.longitude || !nft.latitude) return;

      // Calculate distance if user location is available
      let distance = nft.distance_meters || nft.distance;
      if (!distance && userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          nft.latitude,
          nft.longitude
        );
      }

      const el = document.createElement('div');
      el.className = 'ai-map-marker nft-marker';
      
      // Construct proper IPFS URL - matching NFT Dashboard logic
      // Priority: 1) constructIPFSUrl(server_url, ipfs_hash), 2) image_url, 3) server_url, 4) placeholder
      let imageUrl = null;
      
      // Try to construct IPFS URL if we have ipfs_hash (works for both Workflow 1 and Workflow 2)
      if (nft.ipfs_hash) {
        imageUrl = constructIPFSUrl(nft.server_url, nft.ipfs_hash);
        console.log(`[AIMap] NFT ${nft.id}: Constructed IPFS URL from server_url and ipfs_hash:`, {
          server_url: nft.server_url,
          ipfs_hash: nft.ipfs_hash,
          constructed_url: imageUrl
        });
      }
      
      // Fallback to direct image_url if IPFS construction failed or no ipfs_hash
      if (!imageUrl && nft.image_url) {
        imageUrl = nft.image_url;
        console.log(`[AIMap] NFT ${nft.id}: Using direct image_url:`, imageUrl);
      }
      
      // Last resort: use server_url directly (shouldn't happen, but handle it)
      if (!imageUrl && nft.server_url) {
        imageUrl = nft.server_url;
        console.warn(`[AIMap] NFT ${nft.id}: Using server_url as fallback (no ipfs_hash or image_url):`, imageUrl);
      }
      
      // Log if we still don't have an image URL
      if (!imageUrl) {
        console.warn(`[AIMap] NFT ${nft.id}: No image URL available. NFT data:`, {
          id: nft.id,
          name: nft.name,
          server_url: nft.server_url,
          ipfs_hash: nft.ipfs_hash,
          image_url: nft.image_url
        });
      }
      
      // Create NFT image marker
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = '48px';
        img.style.height = '48px';
        img.style.borderRadius = '8px';
        img.style.border = '3px solid #FFD700';
        img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        img.style.objectFit = 'cover';
        img.style.cursor = 'pointer';
        img.crossOrigin = 'anonymous'; // Allow CORS for IPFS images
        img.onerror = () => {
          console.warn(`[AIMap] Failed to load NFT image: ${imageUrl}`);
          // Fallback to colored circle if image fails
          el.innerHTML = ''; // Clear the img element
          el.style.width = '24px';
          el.style.height = '24px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#FFD700';
          el.style.border = '2px solid white';
        };
        img.onload = () => {
          console.log(`[AIMap] Successfully loaded NFT image: ${imageUrl}`);
        };
        el.appendChild(img);
      } else {
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#FFD700';
        el.style.border = '2px solid white';
      }

      // Create radius circle for this NFT if radius is provided
      if (nft.radius && nft.radius > 0) {
        const circleFeature = createRadiusCircle(
          [nft.longitude, nft.latitude],
          nft.radius,
          mapInstance
        );

        if (circleFeature && !mapInstance.getSource(`nft-radius-${index}`)) {
          mapInstance.addSource(`nft-radius-${index}`, {
            type: 'geojson',
            data: circleFeature
          });

          mapInstance.addLayer({
            id: `nft-radius-${index}-fill`,
            type: 'fill',
            source: `nft-radius-${index}`,
            paint: {
              'fill-color': '#FFD700',
              'fill-opacity': 0.05
            }
          });

          mapInstance.addLayer({
            id: `nft-radius-${index}-outline`,
            type: 'line',
            source: `nft-radius-${index}`,
            paint: {
              'line-color': '#FFD700',
              'line-width': 1,
              'line-opacity': 0.3
            }
          });
        }
      }

      const distanceText = distance 
        ? distance < 1000 
          ? `${Math.round(distance)}m` 
          : `${(distance / 1000).toFixed(2)}km`
        : 'Unknown';

      // Create navigation URL
      const navUrl = userLocation 
        ? `https://www.google.com/maps/dir/${userLocation.latitude},${userLocation.longitude}/${nft.latitude},${nft.longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${nft.latitude},${nft.longitude}`;

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">NFT #${nft.id || index + 1}</h3>
            ${nft.name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Name:</strong> ${nft.name}</p>` : ''}
            ${nft.collection_name ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Collection:</strong> ${nft.collection_name}</p>` : ''}
            ${nft.rarity_level ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Rarity:</strong> ${nft.rarity_level}</p>` : ''}
            ${distance ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Distance:</strong> ${distanceText}</p>` : ''}
            ${userLocation ? `<a href="${navUrl}" target="_blank" style="display: inline-block; margin-top: 8px; padding: 6px 12px; background-color: #FFD700; color: #000; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold;">🗺️ Navigate</a>` : ''}
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
  }, [clearMarkers, calculateDistance, createRadiusCircle]);

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

  // Create user location marker with radius circle
  const createUserLocationMarker = useCallback((location, mapInstance, radius = null) => {
    if (!mapInstance || !location) return;

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
          ${radius ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Search Radius:</strong> ${(radius / 1000).toFixed(2)} km</p>` : ''}
        </div>
      `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([location.longitude, location.latitude])
      .setPopup(popup)
      .addTo(mapInstance);

    markersRef.current.push(marker);

    // Add radius circle if provided
    if (radius && radius > 0) {
      const circleFeature = createRadiusCircle(
        [location.longitude, location.latitude],
        radius,
        mapInstance
      );

      if (circleFeature) {
        // Remove existing user radius circle if it exists
        if (mapInstance.getLayer('user-radius-fill')) {
          mapInstance.removeLayer('user-radius-fill');
        }
        if (mapInstance.getLayer('user-radius-outline')) {
          mapInstance.removeLayer('user-radius-outline');
        }
        if (mapInstance.getSource('user-radius')) {
          mapInstance.removeSource('user-radius');
        }

        mapInstance.addSource('user-radius', {
          type: 'geojson',
          data: circleFeature
        });

        mapInstance.addLayer({
          id: 'user-radius-fill',
          type: 'fill',
          source: 'user-radius',
          paint: {
            'fill-color': '#4caf50',
            'fill-opacity': 0.1
          }
        });

        mapInstance.addLayer({
          id: 'user-radius-outline',
          type: 'line',
          source: 'user-radius',
          paint: {
            'line-color': '#4caf50',
            'line-width': 2,
            'line-opacity': 0.5
          }
        });
      }
    }

    // Animate zoom to user location
    mapInstance.flyTo({
      center: [location.longitude, location.latitude],
      zoom: radius && radius > 0 ? Math.max(10, 15 - Math.log10(radius / 100)) : 15,
      duration: 1500,
      easing: (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
    });
  }, [clearMarkers, createRadiusCircle]);

  // Update map based on mapData
  useEffect(() => {
    console.log('[AIMap] Map data effect triggered:', {
      hasMap: !!map.current,
      mapInitialized,
      hasMapData: !!mapData,
      mapDataType: mapData?.type,
      mapDataKeys: mapData ? Object.keys(mapData) : [],
      dataCount: mapData?.data?.length
    });
    
    if (!map.current || !mapInitialized || !mapData) {
      if (!map.current) console.log('[AIMap] Map not initialized yet');
      if (!mapInitialized) console.log('[AIMap] Map not loaded yet');
      if (!mapData) console.log('[AIMap] No map data provided');
      return;
    }

    const { type, data, center, zoom } = mapData;
    console.log('[AIMap] Processing map data:', { 
      type, 
      dataCount: data?.length, 
      center, 
      zoom,
      dataSample: data?.[0]
    });
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[AIMap] Map data has no valid data array:', { type, data });
      return;
    }

    const userLocation = mapData.userLocation || null;
    const radius = mapData.radius || null;

    switch (type) {
      case 'combined':
        console.log('[AIMap] Creating combined markers (wallets + NFTs)');
        clearMarkers();
        
        // Separate wallets and NFTs
        const wallets = data.filter(item => item.type === 'wallet');
        const nfts = data.filter(item => item.type === 'nft');
        
        // Create user location marker first if available
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        
        // Create wallet markers
        if (wallets.length > 0) {
          createWalletMarkers(wallets, map.current, userLocation);
        }
        
        // Create NFT markers
        if (nfts.length > 0) {
          createNFTMarkers(nfts, map.current, userLocation);
        }
        
        // Fit bounds to show all markers
        if (wallets.length > 0 || nfts.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          [...wallets, ...nfts].forEach(item => {
            if (item.longitude && item.latitude) {
              bounds.extend([item.longitude, item.latitude]);
            }
          });
          if (userLocation) {
            bounds.extend([userLocation.longitude, userLocation.latitude]);
          }
          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, {
              padding: { top: 50, bottom: 50, left: 50, right: 50 },
              maxZoom: 15,
              duration: 1000
            });
          }
        }
        break;
      case 'wallets':
        console.log('[AIMap] Creating wallet markers for type "wallets"');
        console.log('[AIMap] Wallet data array:', data);
        console.log('[AIMap] First wallet sample:', data?.[0]);
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn('[AIMap] No wallet data to display');
          return;
        }
        clearMarkers();
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        createWalletMarkers(data, map.current, userLocation);
        break;
      case 'nfts':
        clearMarkers();
        if (userLocation) {
          createUserLocationMarker(userLocation, map.current, radius);
        }
        createNFTMarkers(data, map.current, userLocation);
        break;
      case 'stellar_accounts':
        createStellarMarkers(data, map.current);
        break;
      case 'geofence':
        createGeofenceVisualization(data, map.current);
        break;
      case 'user_location':
        if (data && data.length > 0) {
          createUserLocationMarker(data[0], map.current, radius);
        } else if (center) {
          createUserLocationMarker({ latitude: center[1], longitude: center[0] }, map.current, radius);
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
        // Remove user radius layers
        if (map.current.getLayer('user-radius-fill')) {
          map.current.removeLayer('user-radius-fill');
        }
        if (map.current.getLayer('user-radius-outline')) {
          map.current.removeLayer('user-radius-outline');
        }
        if (map.current.getSource('user-radius')) {
          map.current.removeSource('user-radius');
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
    
    // When map becomes visible, ensure it's properly displayed
    if (visible && map.current && mapInitialized) {
      // Resize map to ensure it renders correctly
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
          console.log('[AIMap] Map resized after becoming visible');
        }
      }, 100);
    }
  }, [visible, mapInitialized]);

  // Always render the container, but hide it when not visible
  // This ensures the map instance stays attached to the DOM
  console.log('[AIMap] Rendering map container, visible:', visible);

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
        zIndex: visible ? 9999 : -1, // High z-index to be above all other components when visible
        pointerEvents: visible ? 'auto' : 'none',
        display: visible ? 'block' : 'none', // Hide with display instead of returning null
        backgroundColor: 'transparent'
      }}
    />
  );
};

export default AIMap;

