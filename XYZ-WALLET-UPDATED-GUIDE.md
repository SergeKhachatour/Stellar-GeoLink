# GeoLink Map Integration Guide (Updated with Stable Marker Fixes)

This document describes the map style configuration and NFT marker generation logic used in XYZ Wallet, so GeoLink can implement the same functionality. **This version includes fixes for marker animation issues on 3D globe projection.**

## Map Style Configuration

The application uses **Mapbox GL JS** with the following style options:

### Available Map Styles

```typescript
type MapStyle = 'satellite' | 'streets' | 'outdoors' | 'light' | 'dark' | 'satellite-streets';

const mapStyles: Record<MapStyle, string> = {
  'satellite': 'mapbox://styles/mapbox/satellite-v9',
  'streets': 'mapbox://styles/mapbox/streets-v12',
  'outdoors': 'mapbox://styles/mapbox/outdoors-v12',
  'light': 'mapbox://styles/mapbox/light-v11',
  'dark': 'mapbox://styles/mapbox/dark-v11',
  'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v12'
};
```

**Default Style**: `'satellite-streets'` (mapbox://styles/mapbox/satellite-streets-v12)

### Map Initialization

**CRITICAL UPDATE**: The map must be initialized with **globe projection** and proper settings to prevent marker animation:

```typescript
// Add CSS stylesheet FIRST (before map initialization)
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
  styleSheet.id = 'nft-marker-styles';
  styleSheet.textContent = nftMarkerStyles;
  if (!document.getElementById('nft-marker-styles')) {
    document.head.appendChild(styleSheet);
  }
}

// Map initialization with globe projection
const map = new mapboxgl.Map({
  container: mapContainer, // A div element with width: 100% and height: 100%
  style: mapStyles[currentStyle] || mapStyles['satellite-streets'],
  center: [0, 0], // Start with globe view
  zoom: 1,
  pitch: 0,
  bearing: 0,
  projection: 'globe', // CRITICAL: Enable globe projection for stable markers
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

**Key Map Initialization Settings:**
- **Style**: Uses `mapStyles[currentStyle]` where `currentStyle` defaults to `'satellite-streets'`
- **Container**: A div element with `width: 100%` and `height: 100%`
- **Projection**: `'globe'` - **REQUIRED** for stable marker positioning
- **Mapbox GL JS**: Requires Mapbox access token

## NFT Marker Generation

### Marker Creation Logic

**UPDATED**: NFT markers are created with stable positioning to prevent animation during zoom/pan:

```typescript
// Function to render NFT markers
const renderNFTMarkers = (mapInstance: mapboxgl.Map, markersRef: React.MutableRefObject<mapboxgl.Marker[]>) => {
  // Clear existing NFT markers
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];
  
  // Add markers for nearby NFTs
  nearbyNFTs.forEach((nft, index) => {
    if (nft.latitude && nft.longitude) {
      // Construct image URL using the utility function that handles dynamic IPFS server URLs
      const imageUrl = constructImageUrl(nft.server_url, nft.ipfs_hash) || nft.image_url || 'https://via.placeholder.com/48x48?text=NFT';
      
      // Create marker element
      const el = document.createElement('div');
      el.className = 'nft-marker'; // Use CSS class (defined in stylesheet above)
      
      // Set only dynamic styles inline (background-image)
      el.style.backgroundImage = `url('${imageUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      
      // CRITICAL: Disable transitions/transforms that interfere with Mapbox positioning
      el.style.transition = 'none';
      el.style.transform = 'none';
      el.style.willChange = 'auto';
      
      // Create Mapbox marker WITHOUT draggable (prevents animation)
      const nftMarker = new mapboxgl.Marker({
        element: el,
        draggable: false // CRITICAL: Must be false for stable positioning
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

### Marker Styling Details

- **Size**: 64px × 64px
- **Border**: 3px solid gold (#FFD700)
- **Border Radius**: 8px
- **Background**: NFT image using `background-image` CSS property
- **Background Properties**:
  - `background-size: cover` - Image covers entire marker
  - `background-repeat: no-repeat`
  - `background-position: center`
- **Shadow**: `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4)`
- **Cursor**: `pointer` (indicates clickable)
- **CRITICAL CSS Rules** (in global stylesheet):
  - `transition: none !important` - Prevents CSS transitions from interfering with Mapbox transforms
  - `transform: none !important` - Ensures no CSS transforms override Mapbox positioning
  - `will-change: auto !important` - Prevents browser optimization that can cause animation

### Marker Position

- **Coordinates**: `[nft.longitude, nft.latitude]` (longitude first, then latitude for Mapbox)
- **Validation**: Only creates markers if both `latitude` and `longitude` are present
- **Stability**: Markers stay fixed to coordinates during zoom/pan (no animation)

## NFT Image Source Logic

### Image URL Construction

The application uses a utility function `constructImageUrl()` to build NFT image URLs from IPFS hashes and server URLs.

#### Implementation

```typescript
/**
 * Clean server URL by removing existing /ipfs/ path and protocol
 * @param serverUrl - The server URL from the API response
 * @returns Cleaned base URL with https:// protocol
 */
export function cleanServerUrl(serverUrl: string | null | undefined): string | null {
  if (!serverUrl) return null;
  
  let baseUrl = serverUrl.trim();
  
  // Remove any existing /ipfs/ path and everything after it
  baseUrl = baseUrl.replace(/\/ipfs\/.*$/i, '');
  
  // Remove trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  // Remove protocol if present (we'll add https://)
  baseUrl = baseUrl.replace(/^https?:\/\//i, '');
  
  // Add https:// protocol
  if (baseUrl) {
    return `https://${baseUrl}`;
  }
  
  return null;
}

/**
 * Construct full image URL from server URL and IPFS hash
 * @param serverUrl - The server URL from the API response
 * @param ipfsHash - The IPFS hash from the API response
 * @returns Full image URL or fallback to public IPFS gateway
 */
export function constructImageUrl(serverUrl: string | null | undefined, ipfsHash: string | null | undefined): string {
  if (!ipfsHash) {
    return 'https://via.placeholder.com/200x200?text=NFT';
  }
  
  const baseUrl = cleanServerUrl(serverUrl);
  if (!baseUrl) {
    // Fallback to public IPFS gateway
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }
  
  return `${baseUrl}/ipfs/${ipfsHash}`;
}
```

### Image URL Priority

The image URL is constructed in the following priority order:

1. **Primary**: `constructImageUrl(nft.server_url, nft.ipfs_hash)`
   - Uses custom IPFS server if `server_url` is provided
   - Format: `https://{server_url}/ipfs/{ipfs_hash}`
   
2. **Fallback 1**: `nft.image_url`
   - Direct image URL from NFT data (if available)
   
3. **Fallback 2**: `'https://via.placeholder.com/48x48?text=NFT'`
   - Placeholder image if no valid image source is found

### Image URL Construction Flow

```
NFT Data:
├── server_url (optional): Custom IPFS server URL
├── ipfs_hash (required): IPFS content hash
└── image_url (optional): Direct image URL

Image URL Construction:
1. If ipfs_hash exists:
   ├── If server_url exists:
   │   └── Clean server_url → https://{cleaned_url}/ipfs/{ipfs_hash}
   └── If no server_url:
       └── Use public gateway → https://ipfs.io/ipfs/{ipfs_hash}
2. If no ipfs_hash:
   ├── Use image_url if available
   └── Use placeholder if no image_url
```

### Example NFT Data Structure

```typescript
interface NFT {
  id?: number;
  latitude: number;
  longitude: number;
  server_url?: string | null;      // e.g., "ipfs.example.com" or "https://ipfs.example.com"
  ipfs_hash?: string | null;       // e.g., "QmXxxx..."
  image_url?: string | null;       // e.g., "https://example.com/image.png"
  collection_name?: string;
  description?: string;
  radius_meters?: number;
  rarity_level?: string;
  is_active?: boolean;
  distance?: number;               // Calculated distance from user
}
```

### Example Image URLs

1. **With custom server**: 
   - Input: `server_url: "ipfs.example.com"`, `ipfs_hash: "QmXxxx..."`
   - Output: `"https://ipfs.example.com/ipfs/QmXxxx..."`

2. **With public gateway**:
   - Input: `server_url: null`, `ipfs_hash: "QmXxxx..."`
   - Output: `"https://ipfs.io/ipfs/QmXxxx..."`

3. **With direct image URL**:
   - Input: `ipfs_hash: null`, `image_url: "https://example.com/nft.png"`
   - Output: `"https://example.com/nft.png"`

4. **Placeholder**:
   - Input: `ipfs_hash: null`, `image_url: null`
   - Output: `"https://via.placeholder.com/48x48?text=NFT"`

## Integration Checklist for GeoLink

To replicate this functionality in GeoLink, ensure:

- [x] **CSS stylesheet is added with `transition: none !important` rule** (CRITICAL for stable markers)
- [x] **Map is initialized with `projection: 'globe'`** (REQUIRED for 3D globe view)
- [x] **Markers are created with `draggable: false`** (Prevents animation)
- [x] Mapbox GL JS is initialized with default style `'satellite-streets'`
- [x] Map style can be changed dynamically using the `mapStyles` configuration
- [x] NFT markers are created as DOM elements (div) with the specified CSS styling
- [x] Marker images use `background-image` CSS property (not `<img>` tags)
- [x] Image URLs are constructed using the `constructImageUrl()` logic
- [x] Markers are positioned at `[longitude, latitude]` coordinates
- [x] Markers have click handlers for NFT interaction
- [x] Existing markers are cleared before adding new ones
- [x] Only NFTs with valid `latitude` and `longitude` are displayed
- [x] Fallback placeholder image is used when image URL construction fails

## Critical Fixes for Marker Animation

### Problem
Markers were animating/moving to their coordinates when zooming in/out on the map. This happened because CSS transitions and transforms were interfering with Mapbox GL JS's 3D globe projection transforms.

### Solution
1. **Add global CSS stylesheet** with `transition: none !important` rule
2. **Initialize map with `projection: 'globe'`** and proper globe settings
3. **Create markers with `draggable: false`** explicitly set
4. **Use CSS class** instead of inline styles for static properties
5. **Set dynamic styles inline** only for `background-image` and related properties

### Key Changes from Original Guide

| Original | Updated | Reason |
|----------|---------|--------|
| No CSS stylesheet | Global CSS with `transition: none !important` | Prevents CSS transitions from interfering |
| Basic map initialization | Map with `projection: 'globe'` and globe settings | Enables proper 3D rendering |
| `new mapboxgl.Marker(el)` | `new mapboxgl.Marker({ element: el, draggable: false })` | Prevents drag-related animation |
| All styles inline via `cssText` | CSS class + minimal inline styles | Allows `!important` rules to work |

## Notes

- The application uses **Mapbox GL JS** for map rendering
- Markers are created using `mapboxgl.Marker` class
- **CRITICAL**: The `transition: none !important` CSS rule is essential for stable markers on 3D globe
- **CRITICAL**: Map must be initialized with `projection: 'globe'` for proper 3D rendering
- **CRITICAL**: Markers must be created with `draggable: false` to prevent animation
- Image loading errors should be handled gracefully (fallback to placeholder)
- Marker styling uses CSS class for static properties and inline styles only for dynamic image URLs
- The gold border (#FFD700) is a key visual identifier for NFT markers
- Markers will now stay fixed to their coordinates during zoom/pan operations (no animation)

## Testing Checklist

After implementing these changes, verify:

- [ ] Markers stay fixed to their coordinates when zooming in/out
- [ ] Markers don't animate or move when panning the map
- [ ] Markers appear correctly on the 3D globe projection
- [ ] Markers maintain their position when rotating the globe
- [ ] No console errors related to CSS or marker creation
- [ ] Marker images load correctly from IPFS URLs
- [ ] Click handlers still work properly
- [ ] Map style switching works correctly
- [ ] All map interactions (zoom, pan, rotate) work smoothly

