# API Changes for XYZ-Wallet: `/api/nft/nearby` Endpoint

## Overview
This document outlines recent changes to the `/api/nft/nearby` endpoint that may affect XYZ-Wallet's integration. The endpoint has been enhanced to support dynamic IPFS server URLs and improved NFT hash handling for better image display.

---

## Endpoint Details

**Endpoint:** `GET /api/nft/nearby`  
**Authentication:** API Key (via `X-API-Key` header)  
**Base URL:** `https://your-domain.com/api/nft/nearby`

### Request Format

```
GET /api/nft/nearby?latitude=34.2228992&longitude=-118.2400512&radius=1000
Headers:
  X-API-Key: your-api-key-here
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | float | Yes | - | Latitude coordinate (-90 to 90) |
| `longitude` | float | Yes | - | Longitude coordinate (-180 to 180) |
| `radius` | integer | No | 1000 | Search radius in meters |

---

## Recent Changes

### 1. **Dynamic IPFS Server URL Support** ✅
**What Changed:**
- The endpoint now returns the `server_url` from the `ipfs_servers` table when available, falling back to the `server_url` stored in `pinned_nfts` for backward compatibility.

**Impact:**
- The `server_url` field in the response may now point to different IPFS gateways depending on the NFT's configuration.
- This allows users to configure custom IPFS servers, and the endpoint will automatically use the correct server URL.

**Before:**
```json
{
  "server_url": "https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/"
}
```

**After:**
```json
{
  "server_url": "orange-adorable-thrush-508.mypinata.cloud/ipfs/bafkreif6bioqqowqm6nim24g5o2vsaauzassdfudbseynofsmm5pnfxmiu/"
}
```

**Action Required:**
- Ensure your image URL construction logic handles different `server_url` formats correctly.
- The `server_url` may or may not include the `/ipfs/` path prefix.
- Always use the provided `server_url` to construct full image URLs.

---

### 2. **Improved IPFS Hash Handling for Workflow 2 NFTs** ✅
**What Changed:**
- For NFTs created via the "Pin NFT to Blockchain" workflow (Workflow 2), the endpoint now returns the actual IPFS hash from the `nft_uploads` table instead of the hash stored in `pinned_nfts`.
- This ensures the hash points directly to the image file and is correctly formatted.

**Impact:**
- The `ipfs_hash` field may now contain different values for Workflow 2 NFTs.
- This change fixes image display issues where some NFTs were returning 404 errors.

**Before:**
```json
{
  "ipfs_hash": "bafybeie4ujcwb7nxfcz434ng4znglsqbwkrggfsr6xyfnwxcoi24o6qrhy/M25_55.jpg"
}
```

**After:**
```json
{
  "ipfs_hash": "bafybeie4ujcwb7nxfcz434ng4znglsqbwkrggfsr6xyfnwxcoi24o6qrhy"
}
```

**Action Required:**
- Use the `ipfs_hash` value as-is from the API response.
- Do not append filenames to the hash - the hash already points directly to the file.
- Construct image URLs as: `${server_url}/ipfs/${ipfs_hash}` (after cleaning the server_url as described below).

---

### 3. **New Association Data Fields** ✅
**What Changed:**
- The endpoint now includes an `associations` object in each NFT response, providing metadata about Workflow 2 NFTs.

**New Fields:**
```json
{
  "associations": {
    "has_upload": true,
    "has_ipfs_server": true,
    "has_pin": true,
    "upload_filename": "M25_55.jpg",
    "upload_status": "pinned",
    "ipfs_server_name": "My IPFS Server X",
    "pin_status": "pinned"
  }
}
```

**Impact:**
- This is **optional metadata** - existing integrations will continue to work without using these fields.
- These fields can be used to identify which workflow was used to create the NFT and get additional context.

**Action Required:**
- No action required - these fields are optional and can be ignored if not needed.

---

## Response Format

### Success Response (200 OK)

```json
{
  "nfts": [
    {
      "id": 43,
      "name": "My NFT",
      "description": "NFT description",
      "latitude": 34.2228992,
      "longitude": -118.2400512,
      "ipfs_hash": "bafybeie4ujcwb7nxfcz434ng4znglsqbwkrggfsr6xyfnwxcoi24o6qrhy",
      "server_url": "orange-adorable-thrush-508.mypinata.cloud/ipfs/bafkreif6bioqqowqm6nim24g5o2vsaauzassdfudbseynofsmm5pnfxmiu/",
      "collection": {
        "name": "My Collection",
        "description": "Collection description",
        "image_url": "https://example.com/collection.jpg",
        "rarity_level": "common"
      },
      "associations": {
        "has_upload": true,
        "has_ipfs_server": true,
        "has_pin": true,
        "upload_filename": "M25_55.jpg",
        "upload_status": "pinned",
        "ipfs_server_name": "My IPFS Server X",
        "pin_status": "pinned"
      },
      "distance": 150.5
    }
  ],
  "count": 1,
  "search_center": {
    "latitude": 34.2228992,
    "longitude": -118.2400512
  },
  "radius": 1000
}
```

---

## Image URL Construction Guide

To construct a valid image URL from the API response, follow these steps:

### Step 1: Clean the Server URL
```javascript
function cleanServerUrl(serverUrl) {
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
```

### Step 2: Construct the Full Image URL
```javascript
function constructImageUrl(serverUrl, ipfsHash) {
  if (!ipfsHash) return null;
  
  const baseUrl = cleanServerUrl(serverUrl);
  if (!baseUrl) {
    // Fallback to public IPFS gateway
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }
  
  return `${baseUrl}/ipfs/${ipfsHash}`;
}
```

### Example Usage
```javascript
const nft = response.data.nfts[0];
const imageUrl = constructImageUrl(nft.server_url, nft.ipfs_hash);
// Result: "https://orange-adorable-thrush-508.mypinata.cloud/ipfs/bafybeie4ujcwb7nxfcz434ng4znglsqbwkrggfsr6xyfnwxcoi24o6qrhy"
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Latitude and longitude are required"
}
```

### 401 Unauthorized
```json
{
  "error": "API key required"
}
```
or
```json
{
  "error": "Invalid or inactive API key"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to fetch nearby NFTs"
}
```

---

## Backward Compatibility

✅ **The endpoint remains backward compatible:**
- All existing query parameters work the same way
- Response structure is unchanged (new fields are additive)
- Authentication method is unchanged
- Existing integrations will continue to work

⚠️ **Minor considerations:**
- Image URLs may need to be reconstructed if you were using hardcoded server URLs
- The `ipfs_hash` format may differ for Workflow 2 NFTs (but this fixes image display issues)

---

## Testing Recommendations

1. **Test with different NFT types:**
   - Test with Workflow 1 NFTs (direct pin)
   - Test with Workflow 2 NFTs (IPFS server pin)

2. **Verify image URLs:**
   - Ensure all returned NFTs have valid, accessible image URLs
   - Test with different IPFS server configurations

3. **Check error handling:**
   - Verify fallback behavior when `server_url` is missing
   - Test with invalid coordinates

---

## Support

If you encounter any issues with these changes or need clarification, please contact the GeoLink API support team.

**Last Updated:** December 2025  
**API Version:** 1.0

