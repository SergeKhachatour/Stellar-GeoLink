import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Avatar,
  Chip,
  Fade,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as AIIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Close as CloseIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Memory as MemoryIcon,
  ContentCopy as CopyIcon,
  LocationOn as LocationIcon,
  Map as MapIcon
} from '@mui/icons-material';
import api from '../../utils/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAIMap } from '../../contexts/AIMapContext';
import { useWallet } from '../../contexts/WalletContext';
import AIMap from './AIMap';

const AIChat = ({ isPublic = false, initialOpen = false }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [memoryBoxOpen, setMemoryBoxOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [memoryChunks, setMemoryChunks] = useState([]);
  const [minimizeNotification, setMinimizeNotification] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const locationUpdateRef = useRef(false); // Track if we've already updated location
  const autoMinimizedRef = useRef(false); // Track if we've already auto-minimized for this map visibility
  const userManuallyOpenedRef = useRef(false); // Track if user manually opened the chat after map became visible
  const { showMap, hideMap, mapVisible, mapData, proximityRadius, updateUserLocation } = useAIMap();
  const { publicKey } = useWallet();

  // Get user's location on component mount with improved error handling
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('[AIChat] Geolocation is not supported by this browser');
      return;
    }

    console.log('[AIChat] Requesting geolocation...');
    
    // Try to get current position first
    const getLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          console.log('[AIChat] Location retrieved:', location);
          setUserLocation(location);
          // Update AIMapContext with location so it's available globally
          // Only update once to prevent infinite loops
          if (!locationUpdateRef.current) {
            updateUserLocation(location);
            locationUpdateRef.current = true;
          }
        },
        (error) => {
          console.error('[AIChat] Geolocation error:', error);
          let errorMessage = 'Unable to retrieve location';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.';
              break;
            default:
              errorMessage = `Location error: ${error.message || 'Unknown error'}`;
              break;
          }
          console.warn(`[AIChat] ${errorMessage}`);
          // Don't set userLocation to null - keep previous value if available
          
          // Try fallback with relaxed settings if timeout or unavailable
          if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
            console.log('[AIChat] Attempting fallback location request with relaxed settings...');
            setTimeout(() => {
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                  };
                  console.log('[AIChat] ✅ Fallback location retrieved:', location);
                  setUserLocation(location);
                  updateUserLocation(location);
                },
                (fallbackError) => {
                  console.warn('[AIChat] ❌ Fallback location request also failed:', fallbackError.message);
                },
                {
                  enableHighAccuracy: false,
                  timeout: 10000,
                  maximumAge: 600000 // Accept very old cached location (10 minutes)
                }
              );
            }, 1000); // Wait 1 second before retry
          }
        },
        {
          enableHighAccuracy: false, // Start with less accurate but faster location
          timeout: 30000, // Increased timeout to 30 seconds
          maximumAge: 300000 // Accept cached location up to 5 minutes old
        }
      );
    };

    // Initial location request
    getLocation();

    // Don't use watchPosition to prevent infinite loops
    // Instead, only get location once on mount
    // If location updates are needed, they can be requested manually or on user action

    // Cleanup on unmount (no watch to clean up, but keeping structure for future use)
    return () => {
      // No cleanup needed since we're not using watchPosition
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - don't include updateUserLocation to prevent infinite loop

  // Auto-minimize chat in mobile view when map FIRST becomes visible
  // Only minimize once per map visibility change, allow user to manually expand
  useEffect(() => {
    // Only auto-minimize if:
    // 1. Map is visible
    // 2. We're on mobile
    // 3. Chat is currently open/maximized
    // 4. We haven't already auto-minimized for this map visibility
    // 5. User hasn't manually opened the chat after map became visible
    if (mapVisible && isMobile && (open || isMaximized) && !autoMinimizedRef.current && !userManuallyOpenedRef.current) {
      // Use a timeout to allow manual clicks to work first
      const timeoutId = setTimeout(() => {
        // Double-check conditions after delay - don't auto-minimize if user manually opened
        if (mapVisible && isMobile && (open || isMaximized) && !autoMinimizedRef.current && !userManuallyOpenedRef.current) {
          console.log('[AIChat] Map became visible on mobile - auto-minimizing chat');
          setOpen(false);
          setIsMaximized(false);
          setMinimizeNotification(true);
          autoMinimizedRef.current = true; // Mark that we've auto-minimized
          // Auto-hide notification after 3 seconds
          setTimeout(() => {
            setMinimizeNotification(false);
          }, 3000);
        }
      }, 500); // 500ms delay to allow manual opening
      
      return () => clearTimeout(timeoutId);
    }
    
    // Reset flags when map is hidden, so it can auto-minimize again next time
    if (!mapVisible) {
      autoMinimizedRef.current = false;
      userManuallyOpenedRef.current = false;
    }
  }, [mapVisible, isMobile, open, isMaximized]);

  // Extract and chunk important information from messages
  useEffect(() => {
    const chunks = [];
    messages.forEach((message, index) => {
      if (message.role === 'assistant' && message.content) {
        // Extract key information patterns
        const content = message.content;
        
        // Extract Stellar addresses (G...)
        const stellarAddresses = content.match(/G[A-Z0-9]{55}/g);
        if (stellarAddresses) {
          chunks.push({
            type: 'stellar_address',
            data: [...new Set(stellarAddresses)],
            messageIndex: index
          });
        }

        // Extract transaction hashes
        const txHashes = content.match(/[a-f0-9]{64}/gi);
        if (txHashes && txHashes.length > 0) {
          chunks.push({
            type: 'transaction_hash',
            data: [...new Set(txHashes)],
            messageIndex: index
          });
        }

        // Extract balances
        const balances = content.match(/(?:balance|amount)[:\s]+([\d,]+\.?\d*)\s*(?:XLM|stellar)/gi);
        if (balances) {
          chunks.push({
            type: 'balance',
            data: balances,
            messageIndex: index
          });
        }

        // Extract locations (lat/lon)
        const locations = content.match(/(?:latitude|lat)[:\s]+(-?\d+\.?\d*)[,\s]+(?:longitude|lon)[:\s]+(-?\d+\.?\d*)/gi);
        if (locations) {
          chunks.push({
            type: 'location',
            data: locations,
            messageIndex: index
          });
        }

        // Extract NFT IDs
        const nftIds = content.match(/NFT\s+(?:ID|#)[:\s]+(\d+)/gi);
        if (nftIds) {
          chunks.push({
            type: 'nft_id',
            data: nftIds,
            messageIndex: index
          });
        }
      }
    });
    setMemoryChunks(chunks);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Removed auto-open behavior - chat will start minimized unless initialOpen is true

  const handleSend = async (messageText = null) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || loading) return;

    const userMessage = {
      role: 'user',
      content: textToSend
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const endpoint = isPublic ? '/ai/chat/public' : '/ai/chat';
      
      // Build user context with location, wallet public key, and proximity radius
      const userContext = {
        location: userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude
        } : null,
        publicKey: publicKey || null,
        proximityRadius: proximityRadius || 20000000 // Include proximity radius in context (20,000 km - matches xyz-wallet)
      };

      console.log('[AIChat] Sending request with userContext:', {
        hasLocation: !!userContext.location,
        location: userContext.location,
        hasPublicKey: !!userContext.publicKey,
        proximityRadius: userContext.proximityRadius,
        userLocationState: userLocation // Also log the component state
      });
      
      // Warn if location is missing
      if (!userContext.location) {
        console.warn('[AIChat] ⚠️ WARNING: No location available in userContext. Location-based features will not work.');
      }

      const response = await api.post(endpoint, {
        messages: [...messages, userMessage],
        userContext
      });

      if (response.data.choices && response.data.choices[0]) {
        let messageContent = response.data.choices[0].message.content || 'I apologize, but I could not generate a response.';
        
        // Check for map data in response
        let hasMapData = false;
        console.log('[AIChat] Response data:', response.data);
        console.log('[AIChat] Map data in response:', response.data.mapData);
        
        if (response.data.mapData) {
          console.log('[AIChat] Found mapData in response, showing map:', response.data.mapData);
          showMap(response.data.mapData);
          hasMapData = true;
        } else {
          // Parse response for map data and remove HTML comment from content
          const mapData = parseAndDisplayMap(response.data);
          if (mapData) {
            console.log('[AIChat] Parsed mapData from response, showing map:', mapData);
            showMap(mapData);
            // Remove HTML comment with map data from message content
            messageContent = messageContent.replace(/<!-- MAP_DATA:.*? -->/g, '').trim();
            hasMapData = true;
          } else {
            console.log('[AIChat] No map data found in response');
          }
        }
        
        // Also remove any HTML comments that might be in the content
        messageContent = messageContent.replace(/<!-- MAP_DATA:.*? -->/g, '').trim();
        
        // If no map data, hide the map
        if (!hasMapData && mapVisible) {
          console.log('[AIChat] No map data, hiding map');
          hideMap();
        }
        
        // Auto-minimize chat in mobile view when map shows (only if not already minimized)
        // The useEffect hook will handle the actual minimization, this just triggers it
        if (hasMapData && isMobile && (open || isMaximized) && !autoMinimizedRef.current) {
          // The useEffect will handle the minimization, we just need to ensure mapVisible is set
          // which happens when showMap is called above
        }

        const assistantMessage = {
          role: 'assistant',
          content: messageContent
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.response?.data?.message || error.message || 'Failed to get response from AI'}. Please try again.`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Parse AI response for map data and display map
  // Returns the map data if found, null otherwise
  const parseAndDisplayMap = (responseData) => {
    try {
      const message = responseData.choices?.[0]?.message;
      if (!message) return null;

      const content = message.content || '';
      
      // Look for HTML comment with map data
      const mapDataMatch = content.match(/<!-- MAP_DATA:(.*?) -->/);
      if (mapDataMatch) {
        try {
          const mapData = JSON.parse(mapDataMatch[1]);
          showMap(mapData);
          return mapData;
        } catch (e) {
          console.error('Error parsing map data from comment:', e);
        }
      }

      // Look for JSON data in code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          if (data.mapData) {
            showMap(data.mapData);
            return data.mapData;
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }

      // Check if content mentions showing a map and we have location data
      const mapKeywords = ['nearby wallets', 'nearby nfts', 'show map', 'display map', 'location', 'geographic'];
      const hasMapKeyword = mapKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );

      if (hasMapKeyword && userLocation) {
        // Show map centered on user location
        const mapData = {
          type: 'user_location',
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 12
        };
        showMap(mapData);
        return mapData;
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing map data:', error);
      return null;
    }
  };

  const handleCopyToInput = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const renderMessageContent = (content) => {
    // Clean content: remove any HTML comments that might have slipped through
    const cleanedContent = content.replace(/<!--[\s\S]*?-->/g, '').trim();
    
    // Always use ReactMarkdown to support links, HTML, and markdown
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Make links clickable and open in new tab
          a: ({ node, children, ...props }) => (
            <a
              {...props}
              href={props.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#1976d2',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                // Allow normal link behavior
                e.stopPropagation();
              }}
            >
              {children || props.href}
            </a>
          ),
          // Style paragraphs
          p: ({ node, ...props }) => (
            <Typography variant="body2" component="p" sx={{ margin: '0 0 8px 0', wordBreak: 'break-word' }} {...props} />
          ),
          // Style headings
          h1: ({ node, ...props }) => <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold', mb: 1 }} {...props} />,
          h2: ({ node, ...props }) => <Typography variant="h6" component="h2" sx={{ fontWeight: 'bold', mb: 1 }} {...props} />,
          h3: ({ node, ...props }) => <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 'bold', mb: 0.5 }} {...props} />,
          // Style lists
          ul: ({ node, ...props }) => <Box component="ul" sx={{ pl: 2, mb: 1 }} {...props} />,
          ol: ({ node, ...props }) => <Box component="ol" sx={{ pl: 2, mb: 1 }} {...props} />,
          li: ({ node, ...props }) => <Typography variant="body2" component="li" sx={{ mb: 0.5 }} {...props} />,
          // Style code blocks
          code: ({ node, inline, ...props }) => (
            <Typography
              component="code"
              sx={{
                backgroundColor: inline ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.1)',
                padding: inline ? '2px 4px' : '8px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.9em',
                display: inline ? 'inline' : 'block',
                overflow: 'auto',
                mb: inline ? 0 : 1
              }}
              {...props}
            />
          ),
          // Style blockquotes
          blockquote: ({ node, ...props }) => (
            <Box
              component="blockquote"
              sx={{
                borderLeft: '4px solid #1976d2',
                pl: 2,
                ml: 0,
                mb: 1,
                fontStyle: 'italic',
                color: 'text.secondary'
              }}
              {...props}
            />
          )
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    );
  };

  const chatContainerStyle = isMaximized ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100vh',
    zIndex: 10000, // Higher than map (9999) to ensure chat stays visible
    maxWidth: '100%',
    borderRadius: 0
  } : {
    position: 'fixed',
    bottom: isMobile ? 8 : 16, // Smaller bottom margin on mobile
    right: isMobile ? 8 : 16, // Smaller right margin on mobile
    zIndex: 10000, // Higher than map (9999) to ensure chat stays visible
    maxWidth: isMobile ? (open ? 'calc(100% - 16px)' : 200) : 400, // Smaller when closed on mobile
    width: isMobile ? (open ? 'calc(100% - 16px)' : 'auto') : '100%' // Auto width when closed on mobile
  };

  return (
    <>
      {/* AI Map - Renders behind chat */}
      <AIMap mapData={mapData} visible={mapVisible} />
      
      <Box sx={chatContainerStyle}>
        <Paper
          elevation={8}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: isMaximized ? '100vh' : (open ? 600 : 'auto'),
            maxHeight: isMaximized ? '100vh' : '80vh',
            borderRadius: isMaximized ? 0 : 2,
            overflow: 'hidden',
            backgroundColor: 'background.paper'
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: isMobile && !open ? 1 : 2, // Smaller padding on mobile when closed
              backgroundColor: 'primary.main',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => {
              if (!isMaximized) {
                const wasOpen = open;
                const willBeOpen = !open;
                setOpen(willBeOpen);
                
                // If user is manually opening the chat (was closed, now opening)
                if (!wasOpen && willBeOpen && mapVisible) {
                  // User manually opened the chat after map became visible
                  userManuallyOpenedRef.current = true;
                  autoMinimizedRef.current = false; // Reset so they can keep it open
                  console.log('[AIChat] User manually opened chat - preventing auto-minimize');
                }
                
                // If user is closing the chat, reset flags
                if (wasOpen && !willBeOpen) {
                  userManuallyOpenedRef.current = false;
                  autoMinimizedRef.current = false;
                }
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile && !open ? 0.5 : 1 }}>
              <Avatar sx={{ 
                bgcolor: 'white', 
                color: 'primary.main',
                width: isMobile && !open ? 32 : 40,
                height: isMobile && !open ? 32 : 40
              }}>
                <AIIcon sx={{ fontSize: isMobile && !open ? 18 : 24 }} />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ 
                  fontWeight: 'bold',
                  fontSize: isMobile && !open ? '0.875rem' : (isMobile ? '1rem' : '1.25rem')
                }}>
                  GeoLink Agent
                </Typography>
                {(!isMobile || open) && ( // Hide subtitle on mobile when closed
                  <Typography variant="caption" sx={{ opacity: 0.9, fontSize: isMobile ? '0.7rem' : '0.75rem' }}>
                    {isPublic ? 'Public Chat' : 'AI Assistant'}
                    {userLocation && ' • Location: Available'}
                  </Typography>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {userLocation && (
                <Tooltip title={`Location: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`}>
                  <LocationIcon sx={{ fontSize: 20, opacity: 0.9 }} />
                </Tooltip>
              )}
              <Tooltip title="Memory Box">
                <IconButton
                  size="small"
                  sx={{ color: 'white' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMemoryBoxOpen(true);
                  }}
                >
                  <MemoryIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              {/* Map button - always show if mapData exists, even if map is hidden */}
              {mapData && (
                <Tooltip title={mapVisible ? "Hide Map" : "Show Map"}>
                  <IconButton
                    size="small"
                    sx={{ color: 'white' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mapVisible) {
                        hideMap();
                      } else {
                        showMap(mapData);
                      }
                    }}
                  >
                    <MapIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={isMaximized ? 'Minimize' : 'Maximize'}>
                <IconButton
                  size="small"
                  sx={{ color: 'white' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMaximized(!isMaximized);
                    if (!isMaximized) {
                      setOpen(true);
                      // User manually expanded - prevent auto-minimize
                      userManuallyOpenedRef.current = true;
                      autoMinimizedRef.current = false;
                      console.log('[AIChat] User manually maximized chat - preventing auto-minimize');
                    }
                  }}
                >
                  {isMaximized ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
              {!isMaximized && (
                <IconButton
                  size="small"
                  sx={{ color: 'white' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const wasOpen = open;
                    setOpen(!open);
                    // If user is closing, reset flags so it can auto-minimize again next time
                    if (wasOpen && !open) {
                      userManuallyOpenedRef.current = false;
                      autoMinimizedRef.current = false;
                    }
                    // If user is opening, mark as manually opened
                    if (!wasOpen && open && mapVisible) {
                      userManuallyOpenedRef.current = true;
                      autoMinimizedRef.current = false;
                    }
                  }}
                >
                  {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              )}
            </Box>
          </Box>

          {/* Messages */}
          <Collapse in={open || isMaximized}>
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minHeight: isMaximized ? 'calc(100vh - 200px)' : 400,
                maxHeight: isMaximized ? 'calc(100vh - 200px)' : 400
              }}
            >
              {messages.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <AIIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                  <Typography variant="body1" gutterBottom>
                    Hi! I'm GeoLink Agent
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ask me anything about Stellar blockchain operations, or try:
                  </Typography>
                  <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Location & Map Shortcuts */}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', mt: 1 }}>
                      📍 Location & Map
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="📍 My Location"
                        onClick={() => {
                          handleSend('Show my location on the map');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                        color="primary"
                      />
                      <Chip
                        label="🗺️ Show Nearby NFTs"
                        onClick={() => {
                          handleSend('Show me nearby NFTs on the map');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="👥 Find Nearby Wallets"
                        onClick={() => {
                          handleSend('Find nearby wallets');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="🌍 Show All NFTs"
                        onClick={() => {
                          handleSend('Show me all NFTs on the map');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                    </Box>
                    
                    {/* Stellar Operations */}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', mt: 2 }}>
                      ⭐ Stellar Operations
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="➕ Create Account"
                        onClick={() => {
                          handleSend('Create a new Stellar account');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="💰 My Balance"
                        onClick={() => {
                          handleSend('Show my account balance');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="💸 Transfer Assets"
                        onClick={() => {
                          handleSend('How do I transfer Stellar assets?');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="🔗 Manage Trustlines"
                        onClick={() => {
                          handleSend('How do I manage trustlines?');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                    </Box>
                    
                    {/* NFT Operations */}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', mt: 2 }}>
                      🖼️ NFT Operations
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="📚 NFT Collections"
                        onClick={() => {
                          handleSend('Show me all NFT collections');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="📍 Verify NFT Location"
                        onClick={() => {
                          handleSend('How do I verify an NFT location?');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                    </Box>
                    
                    {/* Smart Wallet */}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', mt: 2 }}>
                      🏦 Smart Wallet
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="💳 Smart Wallet Balance"
                        onClick={() => {
                          handleSend('Show my smart wallet balance');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                      <Chip
                        label="📊 Geospatial Stats"
                        onClick={() => {
                          handleSend('Show geospatial statistics');
                        }}
                        sx={{ cursor: 'pointer' }}
                        size="small"
                      />
                    </Box>
                  </Box>
                  {userLocation ? (
                    <Typography variant="caption" color="success.main" sx={{ mt: 2, display: 'block' }}>
                      ✓ Your location is available ({userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)})
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="warning.main" sx={{ mt: 2, display: 'block' }}>
                      ⚠ Location not available. Please enable location permissions and ensure GPS is enabled.
                    </Typography>
                  )}
                </Box>
              )}

              {messages.map((message, index) => (
                <Fade in={true} key={index}>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1,
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-start'
                    }}
                  >
                    {message.role === 'assistant' && (
                      <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                        <AIIcon sx={{ fontSize: 20 }} />
                      </Avatar>
                    )}
                    <Paper
                      elevation={1}
                      sx={{
                        p: 1.5,
                        maxWidth: '75%',
                        backgroundColor: message.role === 'user' ? 'primary.main' : 'grey.100',
                        color: message.role === 'user' ? 'white' : 'text.primary',
                        borderRadius: 2
                      }}
                    >
                      {message.role === 'user' ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {message.content}
                        </Typography>
                      ) : (
                        <Box sx={{ 
                          '& p': { margin: '0 0 8px 0' }, 
                          '& p:last-child': { marginBottom: 0 },
                          '& a': { color: '#1976d2', textDecoration: 'underline', cursor: 'pointer' },
                          '& a:hover': { textDecoration: 'underline' }
                        }}>
                          {renderMessageContent(message.content)}
                          {/* Mini Map Preview - Show if mapData exists and this is the last assistant message with map-related content */}
                          {mapData && index === messages.length - 1 && message.role === 'assistant' && (
                            (message.content.toLowerCase().includes('map') || 
                             message.content.toLowerCase().includes('location') ||
                             message.content.toLowerCase().includes('nearby') ||
                             message.content.toLowerCase().includes('wallet') ||
                             message.content.toLowerCase().includes('nft'))
                          ) && (
                            <Box sx={{ mt: 2, mb: 1 }}>
                              <Paper
                                elevation={2}
                                sx={{
                                  p: 1,
                                  borderRadius: 2,
                                  cursor: 'pointer',
                                  border: '2px solid #1976d2',
                                  '&:hover': {
                                    borderColor: '#1565c0',
                                    boxShadow: 4
                                  }
                                }}
                                onClick={() => {
                                  showMap(mapData);
                                  setOpen(true);
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  <MapIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                    🗺️ Click to view on map
                                  </Typography>
                                </Box>
                                <Box
                                  sx={{
                                    height: 150,
                                    width: '100%',
                                    borderRadius: 1,
                                    backgroundColor: 'grey.200',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    overflow: 'hidden'
                                  }}
                                >
                                  {/* Mini map preview - show location count */}
                                  <Box sx={{ textAlign: 'center', zIndex: 1 }}>
                                    <LocationIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>
                                      {mapData.data?.length || 0} {mapData.data?.length === 1 ? 'location' : 'locations'}
                                    </Typography>
                                    {mapData.userLocation && (
                                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                        Your location included
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </Paper>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Paper>
                    {message.role === 'user' && (
                      <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                        <PersonIcon sx={{ fontSize: 20 }} />
                      </Avatar>
                    )}
                  </Box>
                </Fade>
              ))}

              {loading && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                    <AIIcon sx={{ fontSize: 20 }} />
                  </Avatar>
                  <Paper elevation={1} sx={{ p: 1.5, backgroundColor: 'grey.100', borderRadius: 2 }}>
                    <CircularProgress size={16} />
                  </Paper>
                </Box>
              )}

              <div ref={messagesEndRef} />
            </Box>
          </Collapse>

          {/* Input */}
          <Collapse in={open || isMaximized}>
            <Box
              sx={{
                p: 1.5,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                gap: 1,
                alignItems: 'flex-end'
              }}
            >
              {/* New Chat Button - Always visible near input when there are messages */}
              {messages.length > 0 && (
                <Tooltip title="New Chat">
                  <IconButton
                    color="secondary"
                    onClick={() => {
                      setMessages([]);
                      setInput('');
                      hideMap();
                      // Ensure chat is open to show suggestions
                      setOpen(true);
                    }}
                    sx={{ mb: 0.5 }}
                  >
                    <Typography sx={{ fontSize: 20 }}>💬</Typography>
                  </IconButton>
                </Tooltip>
              )}
              <TextField
                inputRef={inputRef}
                fullWidth
                multiline
                maxRows={4}
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                size="small"
                variant="outlined"
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                sx={{ mb: 0.5 }}
              >
                {loading ? <CircularProgress size={24} /> : <SendIcon />}
              </IconButton>
            </Box>
          </Collapse>
        </Paper>
      </Box>

      {/* Memory Box Dialog */}
      <Dialog
        open={memoryBoxOpen}
        onClose={() => setMemoryBoxOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MemoryIcon />
              <Typography variant="h6">Memory Box</Typography>
            </Box>
            <IconButton onClick={() => setMemoryBoxOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {memoryChunks.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              No key information extracted yet. Continue chatting to see extracted data chunks.
            </Typography>
          ) : (
            <Box>
              {memoryChunks.map((chunk, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                      {chunk.type.replace(/_/g, ' ')} ({Array.isArray(chunk.data) ? chunk.data.length : 1} items)
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Array.isArray(chunk.data) ? (
                        chunk.data.map((item, itemIndex) => (
                          <Box
                            key={itemIndex}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              p: 1,
                              bgcolor: 'grey.50',
                              borderRadius: 1
                            }}
                          >
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                              {item}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleCopyToInput(item)}
                              title="Copy to input"
                            >
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ))
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1,
                            bgcolor: 'grey.50',
                            borderRadius: 1
                          }}
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {chunk.data}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => handleCopyToInput(chunk.data)}
                            title="Copy to input"
                          >
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Minimize Notification */}
      <Snackbar
        open={minimizeNotification}
        autoHideDuration={3000}
        onClose={() => setMinimizeNotification(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setMinimizeNotification(false)} 
          severity="info" 
          sx={{ width: '100%' }}
        >
          Agent minimized
        </Alert>
      </Snackbar>
    </>
  );
};

export default AIChat;
