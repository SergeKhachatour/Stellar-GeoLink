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
  AccordionDetails
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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [memoryBoxOpen, setMemoryBoxOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [memoryChunks, setMemoryChunks] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { showMap, hideMap, mapVisible, mapData } = useAIMap();
  const { publicKey } = useWallet();

  // Get user's location on component mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.warn('Geolocation is not supported by this browser');
    }
  }, []);

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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const endpoint = isPublic ? '/ai/chat/public' : '/ai/chat';
      
      // Build user context with location and wallet public key
      const userContext = {
        location: userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude
        } : null,
        publicKey: publicKey || null
      };

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
    
    // Check if content contains HTML or markdown
    if (cleanedContent.includes('<') || cleanedContent.includes('```') || cleanedContent.includes('**')) {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Render HTML safely, but filter out comments
            html: ({ node, ...props }) => {
              const htmlContent = node.value?.replace(/<!--[\s\S]*?-->/g, '') || '';
              return <div dangerouslySetInnerHTML={{ __html: htmlContent }} {...props} />;
            }
          }}
        >
          {cleanedContent}
        </ReactMarkdown>
      );
    }
    return (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {cleanedContent}
      </Typography>
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
    zIndex: 9999,
    maxWidth: '100%',
    borderRadius: 0
  } : {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 1000,
    maxWidth: 400,
    width: '100%'
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
              p: 2,
              backgroundColor: 'primary.main',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => !isMaximized && setOpen(!open)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'white', color: 'primary.main' }}>
                <AIIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  GeoLink Agent
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  {isPublic ? 'Public Chat' : 'AI Assistant'}
                  {userLocation && ' • Location: Available'}
                </Typography>
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
                    if (!isMaximized) setOpen(true);
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
                    setOpen(!open);
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
                    <Chip
                      label="Find nearby wallets"
                      onClick={() => setInput('Find nearby wallets')}
                      sx={{ cursor: 'pointer' }}
                      size="small"
                    />
                    <Chip
                      label="Create a new Stellar account"
                      onClick={() => setInput('Create a new Stellar account')}
                      sx={{ cursor: 'pointer' }}
                      size="small"
                    />
                    <Chip
                      label="Show my account balance"
                      onClick={() => setInput('Show my account balance')}
                      sx={{ cursor: 'pointer' }}
                      size="small"
                    />
                  </Box>
                  {userLocation && (
                    <Typography variant="caption" color="success.main" sx={{ mt: 2, display: 'block' }}>
                      ✓ Your location is available and will be used automatically
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
                        <Box sx={{ '& p': { margin: 0, marginBottom: 1 }, '& p:last-child': { marginBottom: 0 } }}>
                          {renderMessageContent(message.content)}
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
    </>
  );
};

export default AIChat;
