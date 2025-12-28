const OpenAI = require('openai');
const stellarOperations = require('./stellarOperations');
const geolinkOperations = require('./geolinkOperations');

// Initialize Azure OpenAI client
function getAzureOpenAIClient() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT || `https://${process.env.AZURE_OPENAI_RESOURCE}.openai.azure.com`;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const apiVersion = process.env.AZURE_OPENAI_PREVIEW_API_VERSION || '2024-08-01-preview';
  const deployment = process.env.AZURE_OPENAI_MODEL;

  if (!apiKey || !deployment) {
    throw new Error('Azure OpenAI configuration missing: AZURE_OPENAI_KEY and AZURE_OPENAI_MODEL are required');
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey }
  });
}

// Define available tools/functions for the AI
function getAvailableTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'stellar_createAccount',
        description: 'Create a new Stellar account. Returns public key and secret key.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_issueAsset',
        description: 'Issue a new asset on the Stellar network. Requires issuer secret key and asset code (1-12 uppercase alphanumeric characters).',
        parameters: {
          type: 'object',
          properties: {
            issuerSecret: {
              type: 'string',
              description: 'The secret key of the issuer account (starts with S)'
            },
            assetCode: {
              type: 'string',
              description: 'The asset code (1-12 characters, uppercase letters and numbers only)'
            }
          },
          required: ['issuerSecret', 'assetCode']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_createTrustline',
        description: 'Create a trustline to allow an account to hold a specific asset. Required before receiving non-native assets.',
        parameters: {
          type: 'object',
          properties: {
            accountSecret: {
              type: 'string',
              description: 'The secret key of the account creating the trustline'
            },
            assetCode: {
              type: 'string',
              description: 'The asset code to create trustline for'
            },
            issuerPublicKey: {
              type: 'string',
              description: 'The public key of the asset issuer'
            }
          },
          required: ['accountSecret', 'assetCode', 'issuerPublicKey']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_showBalance',
        description: 'Show the balance of a Stellar account. Returns all asset balances including XLM and custom assets. IMPORTANT: If publicKey is not provided in the function call, the system will automatically use the user\'s public key from their wallet context. You should call this function without the publicKey parameter when the user asks for their account balance, and the system will use their wallet automatically.',
        parameters: {
          type: 'object',
          properties: {
            publicKey: {
              type: 'string',
              description: 'The Stellar account public key (starts with G). OPTIONAL - If not provided, system automatically uses user\'s public key from their wallet context.'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_transferAsset',
        description: 'Transfer assets between Stellar accounts. Can transfer XLM (native) or custom assets.',
        parameters: {
          type: 'object',
          properties: {
            senderSecret: {
              type: 'string',
              description: 'The secret key of the sending account'
            },
            recipientPublicKey: {
              type: 'string',
              description: 'The public key of the receiving account'
            },
            assetCode: {
              type: 'string',
              description: 'The asset code (XLM for native, or custom asset code)'
            },
            issuerPublicKey: {
              type: 'string',
              description: 'The issuer public key (use "native" for XLM)'
            },
            amount: {
              type: 'string',
              description: 'The amount to transfer'
            }
          },
          required: ['senderSecret', 'recipientPublicKey', 'assetCode', 'issuerPublicKey', 'amount']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_setupAsset',
        description: 'Set up an asset on Stellar by creating and issuing it. This is a complete asset setup operation.',
        parameters: {
          type: 'object',
          properties: {
            issuerSecret: {
              type: 'string',
              description: 'The secret key of the issuer account'
            },
            assetCode: {
              type: 'string',
              description: 'The asset code (1-12 characters, uppercase letters and numbers only)'
            }
          },
          required: ['issuerSecret', 'assetCode']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_testAssetCreation',
        description: 'Test asset creation on Stellar by attempting a payment transaction. Useful for debugging.',
        parameters: {
          type: 'object',
          properties: {
            issuerSecret: {
              type: 'string',
              description: 'The secret key of the issuer account'
            },
            assetCode: {
              type: 'string',
              description: 'The asset code to test'
            }
          },
          required: ['issuerSecret', 'assetCode']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_showTrustlines',
        description: 'Show all trustlines (non-native assets) for a Stellar account.',
        parameters: {
          type: 'object',
          properties: {
            publicKey: {
              type: 'string',
              description: 'The Stellar account public key'
            }
          },
          required: ['publicKey']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_showIssuedAssets',
        description: 'Show all assets issued by a specific account.',
        parameters: {
          type: 'object',
          properties: {
            issuerPublicKey: {
              type: 'string',
              description: 'The public key of the issuer account'
            }
          },
          required: ['issuerPublicKey']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'stellar_callContractMethod',
        description: 'Call a method on a Soroban smart contract.',
        parameters: {
          type: 'object',
          properties: {
            contractId: {
              type: 'string',
              description: 'The contract ID'
            },
            method: {
              type: 'string',
              description: 'The method name to call'
            },
            secret: {
              type: 'string',
              description: 'The secret key of the account calling the contract'
            },
            parameters: {
              type: 'array',
              description: 'Array of parameters to pass to the contract method',
              items: {
                type: 'string'
              }
            }
          },
          required: ['contractId', 'method', 'secret']
        }
      }
    },
    // GeoLink Location & Geospatial Tools
    {
      type: 'function',
      function: {
        name: 'geolink_findNearbyWallets',
        description: 'Find wallet locations near a specific geographic point. Uses PostGIS for high-performance geospatial queries. Returns wallets within the specified radius. IMPORTANT: If latitude/longitude are not provided in the function call, the system will automatically use the user\'s current location from their browser. You should call this function without latitude/longitude parameters when the user asks for nearby wallets, and the system will use their location automatically.',
        parameters: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Center latitude (-90 to 90). OPTIONAL - If not provided, system automatically uses user\'s current browser location.'
            },
            longitude: {
              type: 'number',
              description: 'Center longitude (-180 to 180). OPTIONAL - If not provided, system automatically uses user\'s current browser location.'
            },
            radius: {
              type: 'number',
              description: 'Search radius in meters (default: 1000)'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_getGeospatialStats',
        description: 'Get geospatial statistics about wallet locations in the GeoLink system. Returns total locations, bounding box, geographic center, and coverage area.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    // GeoLink NFT Tools
    {
      type: 'function',
      function: {
        name: 'geolink_getNFTCollections',
        description: 'Get all NFT collections available in GeoLink. Returns collection details including name, description, image URL, and rarity level.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_getPinnedNFTs',
        description: 'Get all pinned NFTs in GeoLink. Pinned NFTs are location-based NFTs that users have created.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_getNearbyNFTs',
        description: 'Find NFTs near a specific location. Returns NFTs within the specified radius of the given coordinates. IMPORTANT: If latitude/longitude are not provided in the function call, the system will automatically use the user\'s current location from their browser. You should call this function without latitude/longitude parameters when the user asks for nearby NFTs, and the system will use their location automatically.',
        parameters: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Center latitude. OPTIONAL - If not provided, system automatically uses user\'s current browser location.'
            },
            longitude: {
              type: 'number',
              description: 'Center longitude. OPTIONAL - If not provided, system automatically uses user\'s current browser location.'
            },
            radius: {
              type: 'number',
              description: 'Search radius in meters (default: 1000)'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_verifyNFTLocation',
        description: 'Verify if a user is at the correct location to interact with a specific NFT. Used for location-based NFT verification. If userLatitude/userLongitude are not provided, automatically uses the user\'s current location from their browser if available.',
        parameters: {
          type: 'object',
          properties: {
            nftId: {
              type: 'number',
              description: 'The NFT ID to verify location for'
            },
            userLatitude: {
              type: 'number',
              description: 'User\'s current latitude. If not provided, uses user\'s current location automatically.'
            },
            userLongitude: {
              type: 'number',
              description: 'User\'s current longitude. If not provided, uses user\'s current location automatically.'
            }
          },
          required: ['nftId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_createNFTCollection',
        description: 'Create a new NFT collection in GeoLink. Collections group related NFTs together.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Collection name'
            },
            description: {
              type: 'string',
              description: 'Collection description'
            },
            imageUrl: {
              type: 'string',
              description: 'Collection image URL (optional)'
            },
            rarityLevel: {
              type: 'string',
              enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
              description: 'Rarity level (default: common)'
            }
          },
          required: ['name', 'description']
        }
      }
    },
    // GeoLink Smart Wallet Tools
    {
      type: 'function',
      function: {
        name: 'geolink_getSmartWalletBalance',
        description: 'Get the balance of a smart wallet contract for a user. Returns balance in XLM or specified asset.',
        parameters: {
          type: 'object',
          properties: {
            userPublicKey: {
              type: 'string',
              description: 'User\'s Stellar public key'
            },
            assetAddress: {
              type: 'string',
              description: 'Asset contract address (optional, defaults to native XLM)'
            }
          },
          required: ['userPublicKey']
        }
      }
    },
    // GeoLink WebAuthn/Passkey Tools
    {
      type: 'function',
      function: {
        name: 'geolink_getPasskeys',
        description: 'Get all registered passkeys for the authenticated user. Passkeys enable passwordless authentication for smart wallet operations.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    // GeoLink Analytics Tools
    {
      type: 'function',
      function: {
        name: 'geolink_getAnalyticsStats',
        description: 'Get overall system statistics including total wallets, blockchains, providers, and active wallets in the last 24 hours.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_getBlockchainDistribution',
        description: 'Get distribution of wallets across different blockchains. Shows wallet count and percentage for each blockchain.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    // GeoLink Geofence Tools
    {
      type: 'function',
      function: {
        name: 'geolink_getGeofences',
        description: 'Get all geofences for the authenticated user. Geofences define geographic boundaries for location-based alerts and tracking.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'geolink_createGeofence',
        description: 'Create a new geofence. Geofences are geographic boundaries used for location-based alerts and tracking. You can create a geofence in multiple ways: 1) Provide a place name (e.g., "New York", "San Francisco", "Times Square") - the system will automatically geocode it, 2) Provide a center point (latitude, longitude) with a radius for a circular geofence, 3) Provide a custom GeoJSON polygon for complex shapes. If location parameters are not provided, the AI will automatically use the user\'s current location from context.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Geofence name'
            },
            description: {
              type: 'string',
              description: 'Geofence description (optional)'
            },
            placeName: {
              type: 'string',
              description: 'Place name to geocode (e.g., "New York", "San Francisco", "Central Park", "Times Square"). The system will automatically convert this to coordinates. If provided, latitude/longitude are not needed.'
            },
            polygon: {
              type: 'object',
              description: 'GeoJSON polygon coordinates defining the geofence boundary. Format: {"type": "Polygon", "coordinates": [[[lon1, lat1], [lon2, lat2], ...]]}. Optional if placeName or latitude/longitude/radius provided.'
            },
            latitude: {
              type: 'number',
              description: 'Center latitude for circular geofence. If not provided and placeName is not provided, AI will use user\'s current location from context.'
            },
            longitude: {
              type: 'number',
              description: 'Center longitude for circular geofence. If not provided and placeName is not provided, AI will use user\'s current location from context.'
            },
            radius: {
              oneOf: [
                { type: 'number', description: 'Radius in meters' },
                { type: 'string', description: 'Radius with units (e.g., "33 miles", "5 km", "1000 meters")' }
              ],
              description: 'Radius for circular geofence. Can be a number (in meters) or a string with units like "33 miles", "5 km", or "1000 meters". Default: 1000 meters. Used with latitude/longitude or placeName.'
            },
            blockchain: {
              type: 'string',
              description: 'Blockchain type (e.g., "stellar")'
            },
            webhookUrl: {
              type: 'string',
              description: 'Webhook URL for geofence event notifications (optional)'
            }
          },
          required: ['name', 'blockchain']
        }
      }
    }
  ];
}

// Execute a tool/function call
async function executeToolCall(toolCall, userContext = {}) {
  const functionName = toolCall.function.name;
  let functionArgs = JSON.parse(toolCall.function.arguments || '{}');
  const token = userContext.token || null;
  const userId = userContext.userId || null;
  
  // Auto-inject location for location-based tools if not provided
  const locationBasedTools = [
    'geolink_findNearbyWallets',
    'geolink_getNearbyNFTs',
    'geolink_verifyNFTLocation',
    'geolink_createGeofence'
  ];
  
  if (locationBasedTools.includes(functionName) && userContext.location) {
    // Only inject if not already provided
    if (!functionArgs.latitude && !functionArgs.longitude && 
        !functionArgs.userLatitude && !functionArgs.userLongitude) {
      console.log(`[AI Tool] ${functionName} - Auto-injecting user location:`, userContext.location);
      
      if (functionName === 'geolink_verifyNFTLocation') {
        functionArgs.userLatitude = userContext.location.latitude;
        functionArgs.userLongitude = userContext.location.longitude;
      } else {
        functionArgs.latitude = userContext.location.latitude;
        functionArgs.longitude = userContext.location.longitude;
      }
    }
  }
  
  // Auto-inject public key for Stellar balance operations if not provided
  const publicKeyTools = [
    'stellar_showBalance',
    'stellar_showTrustlines',
    'stellar_showIssuedAssets',
    'geolink_getSmartWalletBalance'
  ];
  
  if (publicKeyTools.includes(functionName) && userContext.publicKey && !functionArgs.publicKey && !functionArgs.userPublicKey) {
    console.log(`[AI Tool] ${functionName} - Auto-injecting user public key:`, userContext.publicKey);
    if (functionName === 'geolink_getSmartWalletBalance') {
      functionArgs.userPublicKey = userContext.publicKey;
    } else {
      functionArgs.publicKey = userContext.publicKey;
    }
  }
  
  // Log location context for debugging
  if (userContext.location) {
    console.log(`[AI Tool] ${functionName} - User location available:`, userContext.location);
    console.log(`[AI Tool] ${functionName} - Function args:`, functionArgs);
  } else {
    console.log(`[AI Tool] ${functionName} - No user location in context`);
    console.log(`[AI Tool] ${functionName} - Full userContext:`, JSON.stringify(userContext, null, 2));
  }

  try {
    switch (functionName) {
      // Stellar Operations
      case 'stellar_createAccount':
        return await stellarOperations.createAccount();

      case 'stellar_issueAsset':
        return await stellarOperations.issueAsset(
          functionArgs.issuerSecret,
          functionArgs.assetCode
        );

      case 'stellar_createTrustline':
        return await stellarOperations.createTrustline(
          functionArgs.accountSecret,
          functionArgs.assetCode,
          functionArgs.issuerPublicKey,
          functionArgs.limit
        );

      case 'stellar_showBalance':
        // Use public key from context if not provided
        const balancePublicKey = functionArgs.publicKey || userContext.publicKey;
        if (!balancePublicKey) {
          throw new Error('Public key is required. Please connect your wallet or provide your Stellar public key.');
        }
        return await stellarOperations.showBalance(balancePublicKey);

      case 'stellar_transferAsset':
        return await stellarOperations.transferAsset(
          functionArgs.senderSecret,
          functionArgs.recipientPublicKey,
          functionArgs.assetCode,
          functionArgs.issuerPublicKey,
          functionArgs.amount
        );

      case 'stellar_setupAsset':
        return await stellarOperations.setupAsset(
          functionArgs.issuerSecret,
          functionArgs.assetCode
        );

      case 'stellar_testAssetCreation':
        return await stellarOperations.testAssetCreation(
          functionArgs.issuerSecret,
          functionArgs.assetCode
        );

      case 'stellar_showTrustlines':
        return await stellarOperations.showTrustlines(functionArgs.publicKey);

      case 'stellar_showIssuedAssets':
        return await stellarOperations.showIssuedAssets(functionArgs.issuerPublicKey);

      case 'stellar_callContractMethod':
        return await stellarOperations.callContractMethod(
          functionArgs.contractId,
          functionArgs.method,
          functionArgs.secret,
          functionArgs.parameters || []
        );

      // GeoLink Location & Geospatial Operations
      case 'geolink_findNearbyWallets': {
        // Use user location from context if not provided
        const lat = functionArgs.latitude || userContext.location?.latitude;
        const lon = functionArgs.longitude || userContext.location?.longitude;
        
        if (!lat || !lon) {
          throw new Error('Location is required. Please provide latitude and longitude, or enable location sharing in your browser.');
        }
        
        const walletRadius = functionArgs.radius || 1000; // Use specified radius for wallets
        // Use proximity radius from context for NFTs (defaults to 20000000m for global)
        // This ensures NFTs are shown with the user's preferred search radius
        const nftRadius = userContext.proximityRadius || 20000000;
        
        console.log(`[AI Tool] geolink_findNearbyWallets - Using wallet radius: ${walletRadius}m, NFT radius: ${nftRadius}m (${(nftRadius / 1000).toFixed(0)}km)`);
        
        // Fetch both wallets and NFTs with their respective radii
        const [walletResult, nftResult] = await Promise.all([
          geolinkOperations.findNearbyWallets(lat, lon, walletRadius, token),
          geolinkOperations.getNearbyNFTs(lat, lon, nftRadius).catch(err => {
            console.warn('[AI Tool] Failed to fetch nearby NFTs:', err.message);
            return { nfts: [] };
          })
        ]);
        
        // Combine wallets and NFTs for map display
        const mapDataItems = [];
        
        // Add wallets to map data
        if (walletResult && walletResult.locations && Array.isArray(walletResult.locations)) {
          const validLocations = walletResult.locations.filter(loc => 
            loc.latitude != null && loc.longitude != null && 
            loc.latitude !== 0 && loc.longitude !== 0
          );
          
          validLocations.forEach(loc => {
            mapDataItems.push({
              type: 'wallet',
              latitude: parseFloat(loc.latitude),
              longitude: parseFloat(loc.longitude),
              public_key: loc.public_key,
              organization: loc.organization || loc.asset_name || loc.description || 'Unknown',
              blockchain: loc.blockchain || 'Stellar',
              last_updated: loc.last_updated,
              distance_meters: loc.distance || loc.distance_meters,
              radius: walletRadius // Use wallet radius for wallet items (from function args)
            });
          });
        }
        
        // Add NFTs to map data
        if (nftResult && nftResult.nfts && Array.isArray(nftResult.nfts)) {
          const validNFTs = nftResult.nfts.filter(nft => 
            nft.latitude != null && nft.longitude != null && 
            nft.latitude !== 0 && nft.longitude !== 0
          );
          
          validNFTs.forEach(nft => {
            mapDataItems.push({
              type: 'nft',
              latitude: parseFloat(nft.latitude),
              longitude: parseFloat(nft.longitude),
              id: nft.id,
              name: nft.name || `NFT #${nft.id}`,
              collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
              image_url: nft.image_url || null,
              server_url: nft.server_url || null,
              ipfs_hash: nft.ipfs_hash || null,
              rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
              distance_meters: nft.distance || nft.distance_meters,
              radius: nftRadius // Use NFT radius for map data
            });
          });
        }
        
        // Add explicit map data with combined wallets and NFTs
        if (mapDataItems.length > 0) {
          walletResult._mapData = {
            type: 'combined',
            data: mapDataItems,
            userLocation: {
              latitude: lat,
              longitude: lon
            },
            radius: nftRadius, // Use NFT radius for overall map radius (shows search area for NFTs)
            walletRadius: walletRadius, // Store wallet radius separately
            center: {
              latitude: lat,
              longitude: lon
            },
            zoom: 13
          };
          console.log(`[AI Tool] geolink_findNearbyWallets - Added _mapData with ${mapDataItems.length} items (${mapDataItems.filter(i => i.type === 'wallet').length} wallets, ${mapDataItems.filter(i => i.type === 'nft').length} NFTs)`);
          console.log(`[AI Tool] geolink_findNearbyWallets - Wallet radius: ${walletRadius}m, NFT radius: ${nftRadius}m (${(nftRadius / 1000).toFixed(0)}km)`);
        } else {
          console.warn(`[AI Tool] geolink_findNearbyWallets - No map data items found!`);
          console.warn(`[AI Tool] geolink_findNearbyWallets - walletResult:`, JSON.stringify(walletResult, null, 2));
          console.warn(`[AI Tool] geolink_findNearbyWallets - walletResult.locations:`, walletResult?.locations);
          console.warn(`[AI Tool] geolink_findNearbyWallets - nftResult:`, nftResult);
        }
        
        // Include NFTs in the result
        walletResult.nfts = nftResult.nfts || [];
        
        return walletResult;
      }

      case 'geolink_getGeospatialStats':
        return await geolinkOperations.getGeospatialStatistics(token);

      // GeoLink NFT Operations
      case 'geolink_getNFTCollections':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.getNFTCollections(token);

      case 'geolink_getPinnedNFTs':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.getPinnedNFTs(token);

      case 'geolink_getNearbyNFTs': {
        // Use user location from context if not provided
        const nftLat = functionArgs.latitude || userContext.location?.latitude;
        const nftLon = functionArgs.longitude || userContext.location?.longitude;
        
        // Default to global radius (20,000 km) to fetch all NFTs globally
        // This matches xyz-wallet which uses 20000000m (20,000 km) for global mode
        // Use proximity radius from user context if available, otherwise default to global radius
        let radius = functionArgs.radius || userContext.proximityRadius || 20000000;
        
        // If user asks for "all NFTs" or similar, always use global fetch (no location, very large radius)
        // This ensures we use the public endpoint which doesn't require authentication
        // Check if radius is very large (global) or no location provided - always use public endpoint
        const isGlobalRequest = !nftLat || !nftLon || radius >= 20000000;
        
        if (isGlobalRequest) {
          // No location provided or user explicitly asked for all - fetch all NFTs globally
          console.log(`[AI Tool] geolink_getNearbyNFTs - Global request detected, using NFT search radius: ${radius}m (Global mode)`);
          radius = 20000000; // 20,000 km - matches xyz-wallet global mode
          // Pass null/undefined to trigger public endpoint in getNearbyNFTs
          const nftResult = await geolinkOperations.getNearbyNFTs(
            null,
            null,
            radius
          );
          
          // Create map data for NFTs
          if (nftResult && nftResult.nfts && Array.isArray(nftResult.nfts)) {
            const validNFTs = nftResult.nfts.filter(nft => 
              nft.latitude != null && nft.longitude != null && 
              nft.latitude !== 0 && nft.longitude !== 0
            );
            
            if (validNFTs.length > 0) {
              const mapDataItems = validNFTs.map(nft => ({
                type: 'nft',
                latitude: parseFloat(nft.latitude),
                longitude: parseFloat(nft.longitude),
                id: nft.id,
                name: nft.name || `NFT #${nft.id}`,
                collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
                image_url: nft.image_url || null,
                server_url: nft.server_url || null,
                ipfs_hash: nft.ipfs_hash || null,
                rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
                distance_meters: nft.distance || nft.distance_meters,
                radius: radius // Use NFT radius for map data
              }));
              
              nftResult._mapData = {
                type: 'combined',
                data: mapDataItems,
                userLocation: userContext.location ? {
                  latitude: userContext.location.latitude,
                  longitude: userContext.location.longitude
                } : null,
                radius: radius, // Use NFT radius for map data
                center: userContext.location ? {
                  latitude: userContext.location.latitude,
                  longitude: userContext.location.longitude
                } : { latitude: 0, longitude: 0 },
                zoom: 2 // Global view
              };
              console.log(`[AI Tool] geolink_getNearbyNFTs - Added _mapData with ${mapDataItems.length} NFTs (global)`);
            }
          }
          
          return nftResult;
        } else if (!functionArgs.radius) {
          // Location provided but no radius specified - use proximity radius from context or default to global
          console.log('[AI Tool] geolink_getNearbyNFTs - Using proximity radius from context:', radius);
        }
        
        const nftResult = await geolinkOperations.getNearbyNFTs(
          nftLat,
          nftLon,
          radius
        );
        
        // Create map data for NFTs (similar to geolink_findNearbyWallets)
        if (nftResult && nftResult.nfts && Array.isArray(nftResult.nfts)) {
          const validNFTs = nftResult.nfts.filter(nft => 
            nft.latitude != null && nft.longitude != null && 
            nft.latitude !== 0 && nft.longitude !== 0
          );
          
          if (validNFTs.length > 0) {
            const mapDataItems = validNFTs.map(nft => ({
              type: 'nft',
              latitude: parseFloat(nft.latitude),
              longitude: parseFloat(nft.longitude),
              id: nft.id,
              name: nft.name || `NFT #${nft.id}`,
              collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
              image_url: nft.image_url || null,
              server_url: nft.server_url || null,
              ipfs_hash: nft.ipfs_hash || null,
              rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
              distance_meters: nft.distance || nft.distance_meters,
              radius: radius // Use NFT radius for map data
            }));
            
            nftResult._mapData = {
              type: 'combined',
              data: mapDataItems,
              userLocation: {
                latitude: nftLat,
                longitude: nftLon
              },
              radius: radius, // Use NFT radius for map data
              center: {
                latitude: nftLat,
                longitude: nftLon
              },
              zoom: 13
            };
            
            console.log(`[AI Tool] geolink_getNearbyNFTs - Added _mapData with ${mapDataItems.length} NFTs`);
          }
        }
        
        return nftResult;
      }

      case 'geolink_verifyNFTLocation':
        if (!token) throw new Error('Authentication required for this operation');
        
        // Use user location from context if not provided
        const verifyLat = functionArgs.userLatitude || userContext.location?.latitude;
        const verifyLon = functionArgs.userLongitude || userContext.location?.longitude;
        
        if (!verifyLat || !verifyLon) {
          throw new Error('Your location is required for NFT verification. Please enable location sharing in your browser.');
        }
        
        return await geolinkOperations.verifyNFTLocation(
          functionArgs.nftId,
          verifyLat,
          verifyLon,
          token
        );

      case 'geolink_createNFTCollection':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.createNFTCollection(
          functionArgs.name,
          functionArgs.description,
          functionArgs.imageUrl || null,
          functionArgs.rarityLevel || 'common',
          token
        );

      // GeoLink Smart Wallet Operations
      case 'geolink_getSmartWalletBalance':
        if (!token) throw new Error('Authentication required for this operation');
        // Use public key from context if not provided
        const walletPublicKey = functionArgs.userPublicKey || userContext.publicKey;
        if (!walletPublicKey) {
          throw new Error('Public key is required. Please connect your wallet or provide your Stellar public key.');
        }
        return await geolinkOperations.getSmartWalletBalance(
          walletPublicKey,
          token,
          functionArgs.assetAddress || null
        );

      // GeoLink WebAuthn/Passkey Operations
      case 'geolink_getPasskeys':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.getPasskeys(token);

      // GeoLink Analytics Operations
      case 'geolink_getAnalyticsStats':
        if (!token) throw new Error('API key required for this operation');
        return await geolinkOperations.getAnalyticsStats(token);

      case 'geolink_getBlockchainDistribution':
        if (!token) throw new Error('API key required for this operation');
        return await geolinkOperations.getBlockchainDistribution(token);

      // GeoLink Geofence Operations
      case 'geolink_getGeofences':
        if (!token) throw new Error('API key required for this operation');
        return await geolinkOperations.getGeofences(token);

      case 'geolink_createGeofence': {
        console.log(`[AI Tool] geolink_createGeofence - Token present:`, !!token);
        console.log(`[AI Tool] geolink_createGeofence - User context:`, { userId, hasLocation: !!userContext?.location, role: userContext?.role });
        if (!token) {
          console.error(`[AI Tool] geolink_createGeofence - No token provided!`);
          throw new Error('Authentication required for this operation. Please ensure you are logged in.');
        }
        // Automatically use user's location if not provided and available in context
        let latitude = functionArgs.latitude;
        let longitude = functionArgs.longitude;
        let placeName = functionArgs.placeName || null;
        
        // If place name is provided, use it (geocoding will happen in createGeofence)
        // Otherwise, use user's location if available
        if (!placeName && (latitude === undefined || longitude === undefined) && userContext?.location) {
          latitude = latitude ?? userContext.location.latitude;
          longitude = longitude ?? userContext.location.longitude;
          console.log(`[AI Tool] geolink_createGeofence - Using user location:`, { latitude, longitude });
        }
        
        // Handle radius conversion (support miles, km, meters)
        let radius = functionArgs.radius || 1000;
        if (typeof radius === 'string') {
          // Try to parse radius string (e.g., "33 miles", "5 km", "1000 meters")
          const radiusStr = radius.toLowerCase().trim();
          if (radiusStr.includes('mile')) {
            const miles = parseFloat(radiusStr.replace(/[^0-9.]/g, ''));
            radius = miles * 1609.34; // Convert miles to meters
            console.log(`[AI Tool] geolink_createGeofence - Converted ${miles} miles to ${radius} meters`);
          } else if (radiusStr.includes('km') || radiusStr.includes('kilometer')) {
            const km = parseFloat(radiusStr.replace(/[^0-9.]/g, ''));
            radius = km * 1000; // Convert km to meters
            console.log(`[AI Tool] geolink_createGeofence - Converted ${km} km to ${radius} meters`);
          } else {
            radius = parseFloat(radiusStr.replace(/[^0-9.]/g, '')) || 1000;
          }
        }
        
        console.log(`[AI Tool] geolink_createGeofence - Creating geofence with:`, {
          name: functionArgs.name,
          latitude,
          longitude,
          radius,
          placeName,
          blockchain: functionArgs.blockchain
        });
        
        const geofenceResult = await geolinkOperations.createGeofence(
          functionArgs.name,
          functionArgs.description || null,
          functionArgs.polygon || null,
          functionArgs.blockchain,
          functionArgs.webhookUrl || null,
          token,
          latitude,
          longitude,
          radius,
          placeName
        );
        
        // Return geofence with map data for visualization
        return {
          ...geofenceResult,
          _mapData: {
            type: 'geofence',
            data: geofenceResult
          }
        };
      }

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  } catch (error) {
    console.error(`[AI Tool] Error executing ${functionName}:`, error);
    // Return error in a format that can still be processed
    return {
      error: true,
      message: error.message || 'An error occurred while executing the tool',
      function: functionName
    };
  }
}

// Process chat completion with function calling
async function processChatCompletion(messages, userId = null, userContext = {}) {
  console.log('[processChatCompletion] Received userContext:', {
    hasLocation: !!userContext.location,
    location: userContext.location,
    hasPublicKey: !!userContext.publicKey,
    proximityRadius: userContext.proximityRadius,
    userId: userId,
    allKeys: Object.keys(userContext)
  });
  
  const client = getAzureOpenAIClient();
  const tools = getAvailableTools();
  
  // Build dynamic system message with user context
  let systemMessage = process.env.AZURE_OPENAI_SYSTEM_MESSAGE || 
    `You are GeoLink Agent, an AI assistant for the Stellar GeoLink platform. GeoLink is a location-based blockchain platform that combines Stellar blockchain operations with geospatial data and location-based NFTs.

Your primary focus areas are:
1. **Stellar Blockchain Operations**: Create accounts, issue assets, transfer assets, manage trustlines, interact with Soroban smart contracts
2. **GeoLink Location Services**: Find nearby wallets, get geospatial statistics, work with location-based data
3. **Location-Based NFTs**: Manage NFT collections, find nearby NFTs, verify NFT locations, create collections
4. **Smart Wallets**: Check balances, manage smart wallet contracts
5. **WebAuthn/Passkeys**: Help users register and manage passkeys for passwordless authentication
6. **Geofences**: Create and manage geographic boundaries for location-based alerts
7. **Analytics**: Provide insights on wallet distribution, blockchain statistics, and system activity

Always stay focused on GeoLink and Stellar-related topics. When users ask about operations that require authentication, guide them to authenticate first. For operations requiring API keys, explain that they need a data consumer or wallet provider API key.

**CRITICAL - Location Usage**: 
- You have DIRECT ACCESS to the user's current location in the userContext.
- When a user asks to find nearby wallets, NFTs, or perform location-based operations, you MUST IMMEDIATELY call the appropriate tool function WITHOUT providing latitude/longitude parameters.
- The system will AUTOMATICALLY use the user's location from userContext when those parameters are omitted.
- DO NOT ask the user for their location - you already have it!
- DO NOT ask for permission - the location is already available!
- Simply call the function (e.g., geolink_getNearbyNFTs, geolink_findNearbyWallets, or geolink_createGeofence) without latitude/longitude, and the system will use their location automatically.
- **IMPORTANT**: When a user asks "show me nearby wallets", "find nearby wallets", "nearby wallets", or similar, you MUST call geolink_findNearbyWallets() immediately. Do not just respond with text - call the function!

**CRITICAL - Wallet/Public Key Usage**:
- You have DIRECT ACCESS to the user's Stellar public key in the userContext (if they have a connected wallet).
- When a user asks to "show my account balance", "check my balance", "my balance", or similar requests, you MUST IMMEDIATELY call stellar_showBalance WITHOUT providing the publicKey parameter.
- The system will AUTOMATICALLY use the user's public key from userContext when the parameter is omitted.
- DO NOT ask the user for their public key - you already have it if their wallet is connected!
- Simply call stellar_showBalance() without the publicKey parameter, and the system will use their wallet automatically.

**CRITICAL - Map Visualization**:
- You have access to an INTERACTIVE MAP SYSTEM that can display locations visually.
- When users ask to "show my location", "show me on the map", "where am I", or similar requests, you MUST respond in a way that includes location information.
- The system will AUTOMATICALLY detect location-related responses and display the user's location on an interactive map.
- DO NOT just provide coordinates or Google Maps links - the system will show an interactive map automatically.
- When responding to location requests, mention that you're showing their location on the map, and the map will appear automatically.
- Example response: "I'll show your location on the map now!" (the system will automatically display it)

Be helpful, clear, and concise. If a user asks about something outside GeoLink/Stellar scope, politely redirect them back to GeoLink and Stellar topics.`;

  // Add user context information to system message
  if (userContext.location) {
    systemMessage += `\n\n**CURRENT USER CONTEXT:**
- User Location: Latitude ${userContext.location.latitude}, Longitude ${userContext.location.longitude}
- You have automatic access to this location. Use it immediately when users ask for nearby items without asking for permission.
- IMPORTANT: When users ask to "show my location" or "show me on the map", respond naturally and the system will automatically display their location on an interactive map. Just acknowledge their request and the map will appear!
- **CRITICAL**: When users ask about "nearby wallets", "show me nearby wallets", "find wallets near me", or similar requests, you MUST call geolink_findNearbyWallets() function immediately. Do not skip this step!`;
  }

  if (userContext.userId) {
    systemMessage += `\n- User ID: ${userContext.userId}`;
  }

  if (userContext.publicKey) {
    systemMessage += `\n- User Public Key: ${userContext.publicKey}`;
  }

  if (userContext.role) {
    systemMessage += `\n- User Role: ${userContext.role}`;
  }

  // Add location context as a user message if available (so AI is aware of it)
  const contextMessages = [...messages];
  if (userContext.location && messages.length > 0) {
    // Check if location was already mentioned in messages
    const hasLocationInMessages = messages.some(msg => 
      msg.content && (
        msg.content.includes('latitude') || 
        msg.content.includes('longitude') ||
        msg.content.includes('location')
      )
    );
    
    // If location not mentioned, add it as context
    if (!hasLocationInMessages) {
      contextMessages.unshift({
        role: 'user',
        content: `[System Context] My current location is available: Latitude ${userContext.location.latitude}, Longitude ${userContext.location.longitude}. Use this location automatically when I ask for nearby items.`
      });
    }
  }

  const modelArgs = {
    model: process.env.AZURE_OPENAI_MODEL_NAME || process.env.AZURE_OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemMessage },
      ...contextMessages
    ],
    tools: tools,
    tool_choice: process.env.AZURE_OPENAI_TOOL_CHOICE || 'auto',
    temperature: parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0'),
    max_tokens: parseInt(process.env.AZURE_OPENAI_MAX_TOKENS || '1000'),
    top_p: parseFloat(process.env.AZURE_OPENAI_TOP_P || '1.0')
  };

  // Add stop sequence only if provided
  if (process.env.AZURE_OPENAI_STOP_SEQUENCE) {
    modelArgs.stop = process.env.AZURE_OPENAI_STOP_SEQUENCE;
  }

  // Remove null/undefined values
  Object.keys(modelArgs).forEach(key => {
    if (modelArgs[key] === null || modelArgs[key] === undefined) {
      delete modelArgs[key];
    }
  });

  try {
    // Check if user is asking about nearby wallets or location-based queries BEFORE calling AI
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const walletKeywords = ['nearby wallets', 'wallets near', 'find wallets', 'show wallets', 'wallet locations', 'nearby wallet', 'wallets', 'wallet'];
    const locationKeywords = ['nearby', 'near me', 'around me', 'close to me', 'in my area', 'local', 'location', 'map', 'show me'];
    const isAskingAboutWallets = walletKeywords.some(keyword => lastUserMessage.includes(keyword));
    const isAskingAboutLocation = locationKeywords.some(keyword => lastUserMessage.includes(keyword));
    const shouldShowMap = isAskingAboutWallets || (isAskingAboutLocation && userContext.location);
    
    console.log(`[AI Request] User message: "${lastUserMessage.substring(0, 100)}"`);
    console.log(`[AI Request] Is asking about wallets: ${isAskingAboutWallets}`);
    console.log(`[AI Request] Is asking about location: ${isAskingAboutLocation}`);
    console.log(`[AI Request] Should show map: ${shouldShowMap}`);
    
    const response = await client.chat.completions.create(modelArgs);

    // Handle tool calls
    if (response.choices[0].message.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls;
      console.log(`[AI Response] AI made ${toolCalls.length} tool call(s):`, toolCalls.map(tc => ({
        id: tc.id,
        function: tc.function.name,
        arguments: tc.function.arguments ? JSON.parse(tc.function.arguments) : null
      })));
      
      const toolResults = [];

      for (const toolCall of toolCalls) {
        console.log(`[AI Tool] Executing tool call: ${toolCall.function.name}`);
        const result = await executeToolCall(toolCall, userContext);
        console.log(`[AI Tool] Tool call ${toolCall.function.name} completed, result keys:`, result ? Object.keys(result) : 'null');
        console.log(`[AI Tool] Tool call ${toolCall.function.name} has _mapData:`, !!(result?._mapData));
        console.log(`[AI Tool] Tool call ${toolCall.function.name} has locations:`, !!(result?.locations));
        if (result?.locations) {
          console.log(`[AI Tool] Tool call ${toolCall.function.name} locations count:`, result.locations.length);
        }
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: JSON.stringify(result)
        });
      }

      // Make a second call with tool results (use contextMessages to include location context)
      const followUpMessages = [
        ...contextMessages,
        response.choices[0].message,
        ...toolResults
      ];

      const followUpResponse = await client.chat.completions.create({
        ...modelArgs,
        messages: [
          { role: 'system', content: systemMessage },
          ...followUpMessages
        ]
      });

      // Extract map data from tool results for location-based queries
      let mapData = null;
      for (const toolResult of toolResults) {
        try {
          let result;
          try {
            result = JSON.parse(toolResult.content);
          } catch (parseError) {
            // If parsing fails, try to extract as string
            console.log(`[Map Data Extraction] Tool: ${toolResult.name}, Content is not JSON, trying to parse as string`);
            const contentStr = toolResult.content;
            // Try to extract JSON from string if it's wrapped
            const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            } else {
              console.log(`[Map Data Extraction] Tool: ${toolResult.name}, Could not parse content:`, contentStr.substring(0, 200));
              continue;
            }
          }
          
          console.log(`[Map Data Extraction] Tool: ${toolResult.name}, Result keys:`, Object.keys(result));
          
          // PRIORITY 1: Check if result contains _mapData property (explicit map data) FIRST
          // This should be checked before result.locations to ensure combined data (wallets + NFTs) is used
          if (result._mapData) {
            // Validate _mapData structure
            if (result._mapData.data && Array.isArray(result._mapData.data) && result._mapData.data.length > 0) {
              mapData = result._mapData;
              console.log(`[Map Data] Using explicit _mapData from ${toolResult.name} with ${result._mapData.data.length} items`);
              console.log(`[Map Data] _mapData breakdown:`, {
                type: mapData.type,
                totalItems: mapData.data.length,
                nftCount: mapData.data.filter(item => item.type === 'nft').length,
                walletCount: mapData.data.filter(item => item.type === 'wallet').length
              });
              break; // Found valid _mapData, use it and stop checking
            } else {
              console.warn(`[Map Data] _mapData from ${toolResult.name} has invalid or empty data array:`, {
                type: result._mapData.type,
                hasData: !!result._mapData.data,
                dataIsArray: Array.isArray(result._mapData.data),
                dataLength: result._mapData.data?.length || 0,
                hasNfts: !!result.nfts,
                nftsCount: result.nfts?.length || 0
              });
              // Don't break - continue to check other sources (like result.nfts)
            }
          }
          
          // Check if result is a geofence (has polygon property)
          if (result.polygon && (result.name || result.id)) {
            mapData = {
              type: 'geofence',
              data: result
            };
            console.log(`[Map Data] Found geofence: ${result.name || result.id}`);
            break;
          }
          
          // PRIORITY 2: Check if result contains location data (wallets) - only if _mapData wasn't found
          if (result.locations && Array.isArray(result.locations) && result.locations.length > 0) {
            // Filter to only include items with valid coordinates
            const validLocations = result.locations.filter(loc => 
              loc.latitude != null && loc.longitude != null && 
              loc.latitude !== 0 && loc.longitude !== 0
            );
            if (validLocations.length > 0) {
              mapData = {
                type: 'wallets',
                data: validLocations.map(loc => ({
                  type: 'wallet',
                  latitude: parseFloat(loc.latitude),
                  longitude: parseFloat(loc.longitude),
                  public_key: loc.public_key,
                  organization: loc.organization || loc.asset_name || 'Unknown',
                  last_updated: loc.last_updated,
                  distance_meters: loc.distance || loc.distance_meters
                }))
              };
              console.log(`[Map Data] Found ${validLocations.length} wallet locations`);
              console.log(`[Map Data] Sample location:`, validLocations[0]);
              break;
            } else {
              console.log(`[Map Data] Found ${result.locations.length} locations but none have valid coordinates`);
            }
          } else {
            console.log(`[Map Data] Result does not contain locations array. Result structure:`, {
              hasLocations: !!result.locations,
              isArray: Array.isArray(result.locations),
              keys: Object.keys(result)
            });
          }
          
          // This check is redundant since we already checked _mapData above, but keep it for safety
          // Check if result contains _mapData (combined wallets and NFTs)
          if (result._mapData && !mapData) {
            // Validate _mapData structure before using it
            if (result._mapData.data && Array.isArray(result._mapData.data) && result._mapData.data.length > 0) {
              mapData = result._mapData;
              console.log(`[Map Data] Using _mapData from result (second check):`, {
                type: mapData.type,
                dataCount: mapData.data.length,
                nftCount: mapData.data.filter(item => item.type === 'nft').length,
                walletCount: mapData.data.filter(item => item.type === 'wallet').length
              });
              break;
            } else {
              console.warn(`[Map Data] _mapData from result has invalid or empty data array:`, {
                type: result._mapData.type,
                hasData: !!result._mapData.data,
                dataIsArray: Array.isArray(result._mapData.data),
                dataLength: result._mapData.data?.length || 0,
                resultKeys: Object.keys(result)
              });
              // Don't break - continue to check other sources (like result.nfts)
            }
          }
          
          // Check if result contains NFT data (fallback if _mapData is invalid or empty)
          if (result.nfts && Array.isArray(result.nfts) && result.nfts.length > 0) {
            // Filter to only include NFTs with valid coordinates
            const validNFTs = result.nfts.filter(nft => 
              nft.latitude != null && nft.longitude != null && 
              nft.latitude !== 0 && nft.longitude !== 0
            );
            if (validNFTs.length > 0) {
              // Use user location from context or result if available
              const userLoc = userContext.location || result._mapData?.userLocation || null;
              const mapRadius = result._mapData?.radius || userContext.proximityRadius || 20000000;
              
              mapData = {
                type: 'combined', // Use 'combined' type to match expected format
                data: validNFTs.map(nft => ({
                  type: 'nft',
                  latitude: parseFloat(nft.latitude),
                  longitude: parseFloat(nft.longitude),
                  id: nft.id,
                  name: nft.name || `NFT #${nft.id}`,
                  collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
                  image_url: nft.image_url || null,
                  server_url: nft.server_url || null,
                  ipfs_hash: nft.ipfs_hash || null,
                  rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
                  distance_meters: nft.distance || nft.distance_meters,
                  radius: mapRadius
                })),
                userLocation: userLoc,
                radius: mapRadius,
                center: userLoc ? {
                  latitude: userLoc.latitude,
                  longitude: userLoc.longitude
                } : (validNFTs.length > 0 ? {
                  latitude: validNFTs[0].latitude,
                  longitude: validNFTs[0].longitude
                } : { latitude: 0, longitude: 0 }),
                zoom: userLoc ? 13 : 2
              };
              console.log(`[Map Data] Created mapData from result.nfts with ${validNFTs.length} NFT locations (fallback)`);
              break;
            }
          }
          
          // Check if result is an array with location data (direct array response)
          if (Array.isArray(result) && result.length > 0) {
            // Check first item for location fields
            const firstItem = result[0];
            if (firstItem.longitude != null && firstItem.latitude != null && 
                firstItem.latitude !== 0 && firstItem.longitude !== 0) {
              // Determine type based on data structure
              if (firstItem.public_key || firstItem.organization) {
                const validWallets = result.filter(loc => 
                  loc.latitude != null && loc.longitude != null
                );
                if (validWallets.length > 0) {
                  mapData = {
                    type: 'wallets',
                    data: validWallets.map(loc => ({
                      type: 'wallet',
                      latitude: parseFloat(loc.latitude),
                      longitude: parseFloat(loc.longitude),
                      public_key: loc.public_key,
                      organization: loc.organization
                    }))
                  };
                  console.log(`[Map Data] Found ${validWallets.length} wallet locations (array format)`);
                  break;
                }
              } else if (firstItem.id && (firstItem.image_url || firstItem.collection_name || firstItem.collection)) {
                const validNFTs = result.filter(nft => 
                  nft.latitude != null && nft.longitude != null
                );
                if (validNFTs.length > 0) {
                  mapData = {
                    type: 'nfts',
                    data: validNFTs.map(nft => ({
                      type: 'nft',
                      latitude: parseFloat(nft.latitude),
                      longitude: parseFloat(nft.longitude),
                      id: nft.id,
                      name: nft.name || `NFT #${nft.id}`,
                      collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
                      image_url: nft.image_url || null,
                      server_url: nft.server_url || null,
                      ipfs_hash: nft.ipfs_hash || null,
                      rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common'
                    }))
                  };
                  console.log(`[Map Data] Found ${validNFTs.length} NFT locations (array format)`);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error(`[Map Data Extraction] Error parsing tool result for ${toolResult.name}:`, e);
        }
      }

      const responseMessage = followUpResponse.choices[0].message;
      
      // Log all tool calls to see what functions were called
      if (followUpResponse.choices[0].message.tool_calls) {
        console.log(`[AI Response] Follow-up response has tool calls:`, followUpResponse.choices[0].message.tool_calls.map(tc => ({
          id: tc.id,
          function: tc.function.name,
          arguments: tc.function.arguments
        })));
      } else {
        console.log(`[AI Response] Follow-up response has no tool calls`);
      }
      
      // Log map data extraction summary
      console.log(`[Map Data] Extraction summary:`, {
        mapDataFound: !!mapData,
        mapDataType: mapData?.type,
        mapDataCount: mapData?.data?.length || 0,
        toolResultsCount: toolResults.length,
        toolResultNames: toolResults.map(tr => tr.name)
      });
      
      // Add map data hint to response if available
      if (mapData && responseMessage.content) {
        // Append map data as a hidden JSON comment that frontend can parse
        responseMessage.content += `\n\n<!-- MAP_DATA:${JSON.stringify(mapData)} -->`;
        console.log(`[Map Data] Added map data to response message`);
      } else {
        console.warn(`[Map Data] No map data to add to response!`);
        console.warn(`[Map Data] mapData value:`, mapData);
        console.warn(`[Map Data] Tool results processed:`, toolResults.length);
        if (toolResults.length > 0) {
          toolResults.forEach((tr, idx) => {
            try {
              const parsed = JSON.parse(tr.content);
              console.warn(`[Map Data] Tool result ${idx} (${tr.name}):`, {
                hasMapData: !!parsed._mapData,
                hasLocations: !!parsed.locations,
                locationsCount: parsed.locations?.length || 0,
                keys: Object.keys(parsed)
              });
            } catch (e) {
              console.warn(`[Map Data] Tool result ${idx} (${tr.name}): Could not parse content`);
            }
          });
        }
      }

      const finalResponse = {
        id: followUpResponse.id,
        model: followUpResponse.model,
        created: followUpResponse.created,
        choices: [{
          message: responseMessage,
          finish_reason: followUpResponse.choices[0].finish_reason
        }],
        usage: followUpResponse.usage,
        mapData: mapData // Include map data in response
      };
      
      // Log final response for debugging
      if (mapData) {
        console.log(`[Map Data] Returning map data in follow-up response:`, {
          type: mapData.type,
          dataCount: mapData.data?.length || 0
        });
      } else {
        console.log(`[Map Data] No map data in follow-up response`);
      }
      
      return finalResponse;
    }

    // Check for map data in regular response (non-tool-call responses)
    let mapData = null;
    const responseMessage = response.choices[0].message;
    
    // FALLBACK: Always show nearby wallets/NFTs when user has location enabled
    // This ensures the AI map always has useful data, regardless of what the user asks
    // Run this BEFORE checking for user_location so we can override it with actual wallet/NFT data
    if (userContext.location) {
      console.log(`[AI Fallback] User has location enabled, automatically fetching nearby wallets and NFTs for map...`);
      console.log(`[AI Fallback] User location: ${userContext.location.latitude}, ${userContext.location.longitude}`);
      console.log(`[AI Fallback] Should show map was: ${shouldShowMap}, isAskingAboutWallets: ${isAskingAboutWallets}, isAskingAboutLocation: ${isAskingAboutLocation}`);
      try {
        const lat = userContext.location.latitude;
        const lon = userContext.location.longitude;
        const walletRadius = 1000;
        const nftRadius = userContext.proximityRadius || 20000000;
        
        console.log(`[AI Fallback] Calling geolink_findNearbyWallets with location: ${lat}, ${lon}, walletRadius: ${walletRadius}, nftRadius: ${nftRadius}`);
        
        const [walletResult, nftResult] = await Promise.all([
          geolinkOperations.findNearbyWallets(lat, lon, walletRadius, null).catch(err => {
            console.error('[AI Fallback] Error fetching wallets:', err);
            console.error('[AI Fallback] Error stack:', err.stack);
            return { locations: [] };
          }),
          geolinkOperations.getNearbyNFTs(lat, lon, nftRadius).catch(err => {
            console.error('[AI Fallback] Error fetching NFTs:', err);
            console.error('[AI Fallback] Error stack:', err.stack);
            return { nfts: [] };
          })
        ]);
        
        console.log(`[AI Fallback] Wallet result:`, {
          hasLocations: !!walletResult.locations,
          locationsIsArray: Array.isArray(walletResult.locations),
          locationsCount: walletResult.locations?.length || 0,
          walletResultKeys: Object.keys(walletResult)
        });
        console.log(`[AI Fallback] NFT result:`, {
          hasNfts: !!nftResult.nfts,
          nftsIsArray: Array.isArray(nftResult.nfts),
          nftsCount: nftResult.nfts?.length || 0,
          nftResultKeys: Object.keys(nftResult)
        });
        
        // Build map data items
        const mapDataItems = [];
        
        // Add wallets
        if (walletResult.locations && Array.isArray(walletResult.locations)) {
          console.log(`[AI Fallback] Processing ${walletResult.locations.length} wallet locations`);
          walletResult.locations.forEach((wallet, idx) => {
            if (wallet.latitude != null && wallet.longitude != null) {
              mapDataItems.push({
                type: 'wallet',
                latitude: parseFloat(wallet.latitude),
                longitude: parseFloat(wallet.longitude),
                public_key: wallet.public_key,
                organization: wallet.organization || wallet.asset_name || 'Unknown',
                last_updated: wallet.last_updated,
                distance_meters: wallet.distance || wallet.distance_meters
              });
            } else {
              console.log(`[AI Fallback] Wallet ${idx} skipped - missing coordinates:`, wallet);
            }
          });
        } else {
          console.log(`[AI Fallback] Wallet result does not have valid locations array`);
        }
        
        // Add NFTs
        if (nftResult.nfts && Array.isArray(nftResult.nfts)) {
          console.log(`[AI Fallback] Processing ${nftResult.nfts.length} NFTs`);
          nftResult.nfts.forEach((nft, idx) => {
            if (nft.latitude != null && nft.longitude != null) {
              mapDataItems.push({
                type: 'nft',
                latitude: parseFloat(nft.latitude),
                longitude: parseFloat(nft.longitude),
                id: nft.id,
                name: nft.name || `NFT #${nft.id}`,
                collection_name: nft.collection_name || nft.collection?.name || 'Unknown Collection',
                image_url: nft.image_url || null,
                server_url: nft.server_url || null,
                ipfs_hash: nft.ipfs_hash || null,
                rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
                distance_meters: nft.distance || nft.distance_meters
              });
            } else {
              console.log(`[AI Fallback] NFT ${idx} skipped - missing coordinates:`, nft);
            }
          });
        } else {
          console.log(`[AI Fallback] NFT result does not have valid nfts array`);
        }
        
        console.log(`[AI Fallback] Total map data items created: ${mapDataItems.length}`);
        
        if (mapDataItems.length > 0) {
          mapData = {
            type: 'combined',
            data: mapDataItems,
            userLocation: {
              latitude: lat,
              longitude: lon
            },
            radius: nftRadius,
            walletRadius: walletRadius,
            center: {
              latitude: lat,
              longitude: lon
            },
            zoom: 13
          };
          console.log(`[AI Fallback] Created map data with ${mapDataItems.length} items (${mapDataItems.filter(i => i.type === 'wallet').length} wallets, ${mapDataItems.filter(i => i.type === 'nft').length} NFTs)`);
        } else {
          console.log(`[AI Fallback] No map data items found after calling function`);
          console.log(`[AI Fallback] walletResult:`, JSON.stringify(walletResult, null, 2));
          console.log(`[AI Fallback] nftResult:`, JSON.stringify(nftResult, null, 2));
        }
      } catch (error) {
        console.error(`[AI Fallback] Error calling geolink_findNearbyWallets:`, error);
      }
    }
    
    // Check if user asked to see their location - check ALL user messages, especially the last one
    if (userContext.location) {
      const userMessages = messages.filter(m => m.role === 'user');
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userContent = lastUserMessage?.content?.toLowerCase() || '';
      
      const showLocationKeywords = [
        'show my location', 'show me on the map', 'my location', 'where am i', 
        'show location', 'show me where i am', 'display my location', 'map my location',
        'on a map', 'show on map', 'view my location', 'see my location', 'show location on map'
      ];
      
      // Check if any user message contains location keywords
      const hasShowLocationKeyword = userMessages.some(msg => {
        const msgContent = msg.content?.toLowerCase() || '';
        return showLocationKeywords.some(keyword => msgContent.includes(keyword));
      });
      
      // Also check AI response for location-related content
      const aiContent = responseMessage.content?.toLowerCase() || '';
      const aiMentionedMap = (aiContent.includes('showing') || aiContent.includes('display') || 
                            aiContent.includes('here') || aiContent.includes('location')) && 
                            (aiContent.includes('map') || aiContent.includes('location') || 
                             aiContent.includes('coordinates'));
      
      // Also check if AI said "Sure!" or similar acknowledgment with location context
      const aiAcknowledgedLocation = (aiContent.includes('sure') || aiContent.includes('here') || 
                                     aiContent.includes('showing')) && 
                                     (aiContent.includes('location') || aiContent.includes('map'));
      
      if (hasShowLocationKeyword || aiMentionedMap || aiAcknowledgedLocation) {
        mapData = {
          type: 'user_location',
          center: [userContext.location.longitude, userContext.location.latitude],
          zoom: 15,
          data: [{
            type: 'user_location',
            latitude: userContext.location.latitude,
            longitude: userContext.location.longitude,
            label: 'Your Location'
          }]
        };
        console.log('[Map Data] Detected location request, showing user location on map');
        console.log('[Map Data] User message:', lastUserMessage?.content);
        console.log('[Map Data] Map data created:', mapData);
      }
    }

    const finalResponse = {
      ...response,
      mapData: mapData
    };
    
    // Log map data for debugging
    if (mapData) {
      console.log('[Map Data] Returning map data in response:', {
        type: mapData.type,
        hasData: !!mapData.data,
        dataCount: mapData.data?.length || 0,
        dataIsArray: Array.isArray(mapData.data),
        fullMapData: JSON.stringify(mapData, null, 2)
      });
    } else {
      console.log('[Map Data] No map data in response');
    }
    
    return finalResponse;
  } catch (error) {
    console.error('Azure OpenAI error:', error);
    throw new Error(`AI service error: ${error.message}`);
  }
}

module.exports = {
  getAzureOpenAIClient,
  getAvailableTools,
  executeToolCall,
  processChatCompletion
};

