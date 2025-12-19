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
    if (!mapContainer.current || map.current || !MAPBOX_TOKEN) return;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 2,
        projection: 'globe'
      });

      map.current.on('load', () => {
        setMapInitialized(true);
        if (onMapReady) {
          onMapReady(map.current);
        }
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      return () => {
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
      };
    } catch (error) {
      console.error('Error initializing AI map:', error);
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

  // Update map based on mapData
  useEffect(() => {
    if (!map.current || !mapInitialized || !mapData) return;

    const { type, data, center, zoom } = mapData;

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
      case 'clear':
        clearMarkers();
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
  }, [mapData, mapInitialized, createWalletMarkers, createNFTMarkers, createStellarMarkers, clearMarkers]);

  if (!visible) return null;

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
        zIndex: 1, // Behind AI chat (z-index 1000)
        pointerEvents: visible ? 'auto' : 'none'
      }}
    />
  );
};

export default AIMap;

