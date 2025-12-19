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
        description: 'Show the balance of a Stellar account. Returns all asset balances including XLM and custom assets.',
        parameters: {
          type: 'object',
          properties: {
            publicKey: {
              type: 'string',
              description: 'The Stellar account public key (starts with G)'
            }
          },
          required: ['publicKey']
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
              type: 'number',
              description: 'Radius in meters for circular geofence (default: 1000 meters). Used with latitude/longitude or placeName.'
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
  
  // Log location context for debugging
  if (userContext.location) {
    console.log(`[AI Tool] ${functionName} - User location available:`, userContext.location);
    console.log(`[AI Tool] ${functionName} - Function args:`, functionArgs);
  } else {
    console.log(`[AI Tool] ${functionName} - No user location in context`);
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
        return await stellarOperations.showBalance(functionArgs.publicKey);

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
      case 'geolink_findNearbyWallets':
        // Use user location from context if not provided
        const lat = functionArgs.latitude || userContext.location?.latitude;
        const lon = functionArgs.longitude || userContext.location?.longitude;
        
        if (!lat || !lon) {
          throw new Error('Location is required. Please provide latitude and longitude, or enable location sharing in your browser.');
        }
        
        return await geolinkOperations.findNearbyWallets(
          lat,
          lon,
          functionArgs.radius || 1000,
          token
        );

      case 'geolink_getGeospatialStats':
        return await geolinkOperations.getGeospatialStatistics(token);

      // GeoLink NFT Operations
      case 'geolink_getNFTCollections':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.getNFTCollections(token);

      case 'geolink_getPinnedNFTs':
        if (!token) throw new Error('Authentication required for this operation');
        return await geolinkOperations.getPinnedNFTs(token);

      case 'geolink_getNearbyNFTs':
        // Use user location from context if not provided
        const nftLat = functionArgs.latitude || userContext.location?.latitude;
        const nftLon = functionArgs.longitude || userContext.location?.longitude;
        
        if (!nftLat || !nftLon) {
          // Return a helpful error that includes context about location availability
          const errorMsg = userContext.location 
            ? 'Location should be automatically available from your browser. Please try again or check location permissions.'
            : 'Location is required. Please provide latitude and longitude, or enable location sharing in your browser.';
          throw new Error(errorMsg);
        }
        
        return await geolinkOperations.getNearbyNFTs(
          nftLat,
          nftLon,
          functionArgs.radius || 1000
        );

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
        return await geolinkOperations.getSmartWalletBalance(
          functionArgs.userPublicKey,
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

      case 'geolink_createGeofence':
        if (!token) throw new Error('Authentication required for this operation');
        // Automatically use user's location if not provided and available in context
        let latitude = functionArgs.latitude;
        let longitude = functionArgs.longitude;
        let placeName = functionArgs.placeName || null;
        
        // If place name is provided, use it (geocoding will happen in createGeofence)
        // Otherwise, use user's location if available
        if (!placeName && (latitude === undefined || longitude === undefined) && userContext?.location) {
          latitude = latitude ?? userContext.location.latitude;
          longitude = longitude ?? userContext.location.longitude;
        }
        
        const geofenceResult = await geolinkOperations.createGeofence(
          functionArgs.name,
          functionArgs.description || null,
          functionArgs.polygon || null,
          functionArgs.blockchain,
          functionArgs.webhookUrl || null,
          token,
          latitude,
          longitude,
          functionArgs.radius || 1000,
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

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  } catch (error) {
    return {
      error: error.message,
      function: functionName
    };
  }
}

// Process chat completion with function calling
async function processChatCompletion(messages, userId = null, userContext = {}) {
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

Be helpful, clear, and concise. If a user asks about something outside GeoLink/Stellar scope, politely redirect them back to GeoLink and Stellar topics.`;

  // Add user context information to system message
  if (userContext.location) {
    systemMessage += `\n\n**CURRENT USER CONTEXT:**
- User Location: Latitude ${userContext.location.latitude}, Longitude ${userContext.location.longitude}
- You have automatic access to this location. Use it immediately when users ask for nearby items without asking for permission.`;
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
    const response = await client.chat.completions.create(modelArgs);

    // Handle tool calls
    if (response.choices[0].message.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls;
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall, userContext);
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
          const result = JSON.parse(toolResult.content);
          
          console.log(`[Map Data Extraction] Tool: ${toolResult.name}, Result keys:`, Object.keys(result));
          
          // Check if result contains _mapData property (explicit map data)
          if (result._mapData) {
            mapData = result._mapData;
            console.log(`[Map Data] Using explicit _mapData from ${toolResult.name}`);
            break;
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
          
          // Check if result contains location data (wallets)
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
                  organization: loc.organization,
                  last_updated: loc.last_updated
                }))
              };
              console.log(`[Map Data] Found ${validLocations.length} wallet locations`);
              break;
            }
          }
          
          // Check if result contains NFT data
          if (result.nfts && Array.isArray(result.nfts) && result.nfts.length > 0) {
            // Filter to only include NFTs with valid coordinates
            const validNFTs = result.nfts.filter(nft => 
              nft.latitude != null && nft.longitude != null && 
              nft.latitude !== 0 && nft.longitude !== 0
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
                  image_url: nft.image_url || nft.server_url || null,
                  rarity_level: nft.rarity_level || nft.collection?.rarity_level || 'common',
                  distance: nft.distance
                }))
              };
              console.log(`[Map Data] Found ${validNFTs.length} NFT locations`);
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
                      image_url: nft.image_url || nft.server_url || null,
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
      
      // Add map data hint to response if available
      if (mapData && responseMessage.content) {
        // Append map data as a hidden JSON comment that frontend can parse
        responseMessage.content += `\n\n<!-- MAP_DATA:${JSON.stringify(mapData)} -->`;
      }

      return {
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
    }

    // Check for map data in regular response (non-tool-call responses)
    let mapData = null;
    const responseMessage = response.choices[0].message;
    
    // If response mentions location-based queries, we might want to show a map
    if (responseMessage.content) {
      const content = responseMessage.content.toLowerCase();
      const locationKeywords = ['nearby', 'location', 'map', 'geographic', 'coordinates'];
      const hasLocationKeyword = locationKeywords.some(keyword => content.includes(keyword));
      
      if (hasLocationKeyword && userContext.location) {
        mapData = {
          type: 'user_location',
          center: [userContext.location.longitude, userContext.location.latitude],
          zoom: 12
        };
      }
    }

    return {
      ...response,
      mapData: mapData
    };
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

