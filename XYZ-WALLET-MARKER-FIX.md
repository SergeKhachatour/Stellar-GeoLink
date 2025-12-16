# XYZ-Wallet Marker Animation Fix Guide

## Problem
NFT markers are animating/moving to their coordinates when zooming in/out on the map. This happens because CSS transitions and transforms are interfering with Mapbox GL JS's 3D globe projection transforms.

## Root Cause
1. **Missing CSS rule**: The critical `transition: none !important` rule is missing, which prevents Mapbox from properly transforming markers for 3D globe projection
2. **Inline styles**: Using inline `cssText` can override necessary CSS properties
3. **Map initialization**: May not have globe projection properly configured

## Solution

### 1. Add Global CSS Stylesheet

Add this CSS stylesheet **before** creating any markers. This should be injected into the document head or added to your global CSS file:

```typescript
// Add CSS styles for stable NFT markers (CRITICAL for 3D globe projection)
const nftMarkerStyles = `
  .nft-marker {
    width: 64px !important;
    height: 64px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 8px !important;
    border: 3px solid #FFD700 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
    overflow: hidden !important;
    /* CRITICAL: Allow Mapbox to transform markers for 3D globe projection */
    transition: none !important;
    /* Prevent any CSS transforms from interfering */
    transform: none !important;
    will-change: auto !important;
  }
  
  .nft-marker img,
  .nft-marker div {
    pointer-events: none !important;
  }
  
  /* Ensure popups appear above everything */
  .mapboxgl-popup {
    z-index: 2000 !important;
  }
  
  .mapboxgl-popup-content {
    z-index: 2001 !important;
  }
  
  .mapboxgl-popup-tip {
    z-index: 2002 !important;
  }
`;

// Inject styles into the document (do this once, before map initialization)
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = nftMarkerStyles;
  styleSheet.id = 'nft-marker-styles'; // Prevent duplicate injection
  if (!document.getElementById('nft-marker-styles')) {
    document.head.appendChild(styleSheet);
  }
}
```

### 2. Update Map Initialization

Ensure your map is initialized with **globe projection** and proper settings:

```typescript
const map = new mapboxgl.Map({
  container: mapContainer, // Your map container element
  style: mapStyles[currentStyle] || mapStyles['satellite-streets'],
  center: [0, 0], // Start with globe view
  zoom: 1,
  pitch: 0,
  bearing: 0,
  projection: 'globe', // CRITICAL: Enable globe projection
  antialias: true,
  optimizeForTerrain: true,
  maxPitch: 85,
  maxZoom: 22,
  minZoom: 0,
  maxBounds: [[-180, -85], [180, 85]],
  renderWorldCopies: false,
  interactive: true,
  globe: {
    enableAtmosphere: true,
    atmosphereColor: '#FFD700',
    atmosphereIntensity: 0.3,
    enableStars: true,
    starIntensity: 0.5
  }
});
```

### 3. Update Marker Creation Function

**BEFORE (Current - Causes Animation):**
```typescript
const renderNFTMarkers = (mapInstance: mapboxgl.Map, markersRef: React.MutableRefObject<mapboxgl.Marker[]>) => {
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];
  
  nearbyNFTs.forEach((nft, index) => {
    if (nft.latitude && nft.longitude) {
      const imageUrl = constructImageUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/48x48?text=NFT';
      
      const el = document.createElement('div');
      el.className = 'nft-marker';
      el.style.cssText = `
        width: 64px;
        height: 64px;
        background-image: url('${imageUrl}');
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 8px;
        border: 3px solid #FFD700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      `;
      
      const nftMarker = new mapboxgl.Marker(el)
        .setLngLat([nft.longitude, nft.latitude])
        .addTo(mapInstance);
      
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Handle NFT click
      });
      
      markersRef.current.push(nftMarker);
    }
  });
};
```

**AFTER (Fixed - Stable Markers):**
```typescript
const renderNFTMarkers = (mapInstance: mapboxgl.Map, markersRef: React.MutableRefObject<mapboxgl.Marker[]>) => {
  // Clear existing markers
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];
  
  nearbyNFTs.forEach((nft, index) => {
    if (nft.latitude && nft.longitude) {
      const imageUrl = constructImageUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/48x48?text=NFT';
      
      // Create marker element
      const el = document.createElement('div');
      el.className = 'nft-marker'; // Use CSS class instead of inline styles
      
      // Set only the dynamic background-image via inline style
      // All other styles come from the CSS class
      el.style.backgroundImage = `url('${imageUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      
      // CRITICAL: Ensure no transitions or transforms that interfere
      el.style.transition = 'none';
      el.style.transform = 'none';
      el.style.willChange = 'auto';
      
      // Create marker WITHOUT draggable option (prevents animation)
      const nftMarker = new mapboxgl.Marker({
        element: el,
        draggable: false // CRITICAL: Must be false
      })
        .setLngLat([nft.longitude, nft.latitude])
        .addTo(mapInstance);
      
      // Add click event handler
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Handle NFT click (e.g., show NFT details)
      });
      
      markersRef.current.push(nftMarker);
    }
  });
};
```

### 4. Key Changes Summary

| Issue | Before | After |
|-------|--------|-------|
| **CSS Transitions** | Not disabled | `transition: none !important` in CSS class |
| **CSS Transforms** | May interfere | `transform: none !important` in CSS class |
| **Marker Creation** | `new mapboxgl.Marker(el)` | `new mapboxgl.Marker({ element: el, draggable: false })` |
| **Inline Styles** | All styles inline | Only dynamic styles (background-image) inline |
| **Map Projection** | May not be set | `projection: 'globe'` explicitly set |
| **CSS Class** | Minimal | Full CSS class with all critical rules |

### 5. Complete Updated Code Example

```typescript
// 1. Add CSS stylesheet (do this once, before map initialization)
const nftMarkerStyles = `
  .nft-marker {
    width: 64px !important;
    height: 64px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
    border-radius: 8px !important;
    border: 3px solid #FFD700 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
    overflow: hidden !important;
    transition: none !important;
    transform: none !important;
    will-change: auto !important;
  }
  
  .nft-marker img,
  .nft-marker div {
    pointer-events: none !important;
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('nft-marker-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'nft-marker-styles';
  styleSheet.textContent = nftMarkerStyles;
  document.head.appendChild(styleSheet);
}

// 2. Initialize map with globe projection
const map = new mapboxgl.Map({
  container: mapContainer,
  style: mapStyles['satellite-streets'],
  center: [0, 0],
  zoom: 1,
  pitch: 0,
  bearing: 0,
  projection: 'globe', // CRITICAL
  antialias: true,
  optimizeForTerrain: true,
  maxPitch: 85,
  maxZoom: 22,
  minZoom: 0,
  maxBounds: [[-180, -85], [180, 85]],
  renderWorldCopies: false,
  interactive: true,
  globe: {
    enableAtmosphere: true,
    atmosphereColor: '#FFD700',
    atmosphereIntensity: 0.3,
    enableStars: true,
    starIntensity: 0.5
  }
});

// 3. Create markers with stable positioning
const renderNFTMarkers = (mapInstance: mapboxgl.Map, markersRef: React.MutableRefObject<mapboxgl.Marker[]>) => {
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];
  
  nearbyNFTs.forEach((nft) => {
    if (nft.latitude && nft.longitude) {
      const imageUrl = constructImageUrl(nft.server_url, nft.ipfs_hash) || 
                       nft.image_url || 
                       'https://via.placeholder.com/48x48?text=NFT';
      
      const el = document.createElement('div');
      el.className = 'nft-marker';
      
      // Only set dynamic styles inline
      el.style.backgroundImage = `url('${imageUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      
      // CRITICAL: Disable transitions/transforms
      el.style.transition = 'none';
      el.style.transform = 'none';
      el.style.willChange = 'auto';
      
      // Create marker WITHOUT draggable
      const nftMarker = new mapboxgl.Marker({
        element: el,
        draggable: false // CRITICAL
      })
        .setLngLat([nft.longitude, nft.latitude])
        .addTo(mapInstance);
      
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Handle NFT click
      });
      
      markersRef.current.push(nftMarker);
    }
  });
};
```

## Testing Checklist

After implementing these changes, verify:

- [ ] Markers stay fixed to their coordinates when zooming in/out
- [ ] Markers don't animate or move when panning the map
- [ ] Markers appear correctly on the 3D globe projection
- [ ] Markers maintain their position when rotating the globe
- [ ] No console errors related to CSS or marker creation
- [ ] Marker images load correctly from IPFS URLs
- [ ] Click handlers still work properly

## Why This Works

1. **`transition: none !important`**: Prevents CSS transitions from interfering with Mapbox's internal transforms for 3D globe projection
2. **`transform: none !important`**: Ensures no CSS transforms override Mapbox's positioning
3. **`draggable: false`**: Prevents Mapbox from adding drag-related event handlers that can cause animation
4. **CSS Class instead of inline styles**: Allows the critical `!important` rules to take precedence
5. **Globe projection**: Enables proper 3D rendering that requires stable marker positioning

## Additional Notes

- The `!important` flags are necessary because Mapbox GL JS may apply inline styles that need to be overridden
- The CSS class approach is preferred over inline styles for maintainability
- These changes are compatible with all Mapbox map styles (satellite, streets, etc.)
- The markers will work correctly on both 2D and 3D globe views

