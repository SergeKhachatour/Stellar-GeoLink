import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Grid,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Security as SecurityIcon,
  Api as ApiIcon,
  LocationOn as LocationIcon,
  Visibility as VisibilityIcon,
  PrivacyTip as PrivacyIcon,
  AccountBalanceWallet as WalletIcon
} from '@mui/icons-material';

const APIDocumentation = () => {
  const [copiedCode, setCopiedCode] = useState({});

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedCode(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const apiEndpoints = [
    {
      id: 'location-update',
      title: 'Update Wallet Location',
      method: 'POST',
      endpoint: '/api/location/update',
      description: 'Update or create a wallet location entry',
      role: 'wallet_provider',
      color: 'primary',
      icon: <LocationIcon />,
      requestBody: {
        public_key: 'GABC123...',
        blockchain: 'Stellar',
        latitude: 40.7128,
        longitude: -74.0060,
        wallet_type_id: 1,
        description: 'User wallet location'
      },
      response: {
        success: true,
        message: 'Location updated successfully',
        data: {
          id: 1,
          public_key: 'GABC123...',
          latitude: 40.7128,
          longitude: -74.0060,
          last_updated: '2024-01-15T10:30:00Z'
        }
      }
    },
    {
      id: 'privacy-settings',
      title: 'Update Privacy Settings',
      method: 'POST',
      endpoint: '/api/wallet-provider/privacy-settings',
      description: 'Update privacy settings for a specific wallet',
      role: 'wallet_provider',
      color: 'secondary',
      icon: <PrivacyIcon />,
      requestBody: {
        public_key: 'GABC123...',
        privacy_enabled: true,
        visibility_enabled: false
      },
      response: {
        message: 'Privacy settings updated successfully',
        settings: {
          public_key: 'GABC123...',
          privacy_enabled: true,
          visibility_enabled: false
        }
      }
    },
    {
      id: 'visibility-settings',
      title: 'Update Visibility Settings',
      method: 'POST',
      endpoint: '/api/wallet-provider/visibility-settings',
      description: 'Update visibility settings for a specific wallet',
      role: 'wallet_provider',
      color: 'info',
      icon: <VisibilityIcon />,
      requestBody: {
        public_key: 'GABC123...',
        is_visible: true
      },
      response: {
        message: 'Visibility settings updated successfully',
        settings: {
          public_key: 'GABC123...',
          is_visible: true
        }
      }
    },
    {
      id: 'user-locations',
      title: 'Get User Locations',
      method: 'GET',
      endpoint: '/api/wallet-provider/user-locations',
      description: 'Retrieve location history for a specific wallet',
      role: 'wallet_provider',
      color: 'success',
      icon: <WalletIcon />,
      parameters: {
        public_key: 'GABC123...'
      },
      response: {
        locations: [
          {
            id: 1,
            public_key: 'GABC123...',
            latitude: 40.7128,
            longitude: -74.0060,
            tracking_status: 'active',
            location_enabled: true,
            last_updated: '2024-01-15T10:30:00Z',
            created_at: '2024-01-15T10:30:00Z',
            wallet_type: 'Mobile Wallet',
            provider_name: 'XYZ Wallet'
          }
        ]
      }
    },
    {
      id: 'nearby-nfts',
      title: 'Get Nearby NFTs',
      method: 'GET',
      endpoint: '/api/nft/nearby',
      description: 'Find NFTs near a specific location',
      role: 'data_consumer',
      color: 'warning',
      icon: <ApiIcon />,
      parameters: {
        latitude: 34.2304971,
        longitude: -118.2321404,
        radius: 1000
      },
      response: {
        nfts: [
          {
            id: 1,
            latitude: '34.2304971',
            longitude: '-118.2321404',
            radius_meters: 100,
            ipfs_hash: 'QmHash...',
            collection_name: 'Collection Name',
            is_active: true
          }
        ],
        count: 1,
        search_center: {
          latitude: 34.2304971,
          longitude: -118.2321404
        },
        radius: 1000
      }
    }
  ];

  const CodeBlock = ({ code, language = 'json', id }) => (
    <Box sx={{ position: 'relative', mb: 2 }}>
      <Paper 
        sx={{ 
          p: 2, 
          backgroundColor: '#f5f5f5', 
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          overflow: 'auto'
        }}
      >
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {typeof code === 'string' ? code : JSON.stringify(code, null, 2)}
        </pre>
      </Paper>
      <Tooltip title={copiedCode[id] ? 'Copied!' : 'Copy to clipboard'}>
        <IconButton
          size="small"
          onClick={() => copyToClipboard(
            typeof code === 'string' ? code : JSON.stringify(code, null, 2),
            id
          )}
          sx={{ 
            position: 'absolute', 
            top: 8, 
            right: 8,
            backgroundColor: 'white',
            '&:hover': { backgroundColor: '#f5f5f5' }
          }}
        >
          {copiedCode[id] ? <CheckIcon color="success" /> : <CopyIcon />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box sx={{ py: 4, backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            🌐 GeoLink API Documentation
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
            Complete API reference for Wallet Providers and Data Consumers
          </Typography>
          <Alert severity="info" sx={{ maxWidth: 800, mx: 'auto' }}>
            <AlertTitle>API Access</AlertTitle>
            All endpoints require authentication using API keys. Contact support to obtain your API credentials.
          </Alert>
        </Box>

        {/* Base URL */}
        <Card sx={{ mb: 4, backgroundColor: '#fff3cd', border: '1px solid #ffeaa7' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon color="warning" />
              Base URL
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>
              Production: <strong>https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net</strong>
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '1.1rem', mt: 1 }}>
              Development: <strong>http://localhost:4000</strong>
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '1.1rem', mt: 1, color: 'primary.main' }}>
              Current: <strong>{window.location.origin}</strong>
            </Typography>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon color="primary" />
              Authentication
            </Typography>
            <Typography variant="body1" gutterBottom>
              All API requests must include an API key in the Authorization header:
            </Typography>
            <CodeBlock 
              code="Authorization: Bearer YOUR_API_KEY"
              id="auth-header"
            />
            <Typography variant="body2" color="text.secondary">
              Replace <code>YOUR_API_KEY</code> with your actual API key provided by GeoLink.
            </Typography>
          </CardContent>
        </Card>

        {/* API Endpoints */}
        <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
          📚 API Endpoints
        </Typography>

        {apiEndpoints.map((endpoint, index) => (
          <Accordion key={endpoint.id} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                {endpoint.icon}
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" component="div">
                    {endpoint.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {endpoint.description}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip 
                    label={endpoint.method} 
                    color={endpoint.color}
                    size="small"
                    sx={{ fontWeight: 'bold' }}
                  />
                  <Chip 
                    label={endpoint.role.replace('_', ' ').toUpperCase()} 
                    color="default"
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {/* Endpoint URL */}
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Endpoint
                  </Typography>
                  <CodeBlock 
                    code={`${endpoint.method} ${endpoint.endpoint}`}
                    id={`endpoint-${endpoint.id}`}
                  />
                </Grid>

                {/* Request Body/Parameters */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    {endpoint.method === 'GET' ? 'Parameters' : 'Request Body'}
                  </Typography>
                  <CodeBlock 
                    code={endpoint.requestBody || endpoint.parameters}
                    id={`request-${endpoint.id}`}
                  />
                </Grid>

                {/* Response */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Response
                  </Typography>
                  <CodeBlock 
                    code={endpoint.response}
                    id={`response-${endpoint.id}`}
                  />
                </Grid>

                {/* Example Usage */}
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Example Usage
                  </Typography>
                  <CodeBlock 
                    code={`curl -X ${endpoint.method} \\
  "${endpoint.method === 'GET' ? 
    `${window.location.origin}${endpoint.endpoint}?${Object.entries(endpoint.parameters || {}).map(([key, value]) => `${key}=${value}`).join('&')}` :
    `${window.location.origin}${endpoint.endpoint}`
  }" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"${
    endpoint.method !== 'GET' ? ` \\
  -d '${JSON.stringify(endpoint.requestBody, null, 2)}'` : ''
  }`}
                    id={`example-${endpoint.id}`}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))}

        {/* Role-based Access */}
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🔐 Role-Based Access
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Wallet Provider
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><LocationIcon color="primary" /></ListItemIcon>
                    <ListItemText primary="Update wallet locations" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><PrivacyIcon color="primary" /></ListItemIcon>
                    <ListItemText primary="Manage privacy settings" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><VisibilityIcon color="primary" /></ListItemIcon>
                    <ListItemText primary="Control visibility settings" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><WalletIcon color="primary" /></ListItemIcon>
                    <ListItemText primary="Access user location history" />
                  </ListItem>
                </List>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Data Consumer
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><ApiIcon color="warning" /></ListItemIcon>
                    <ListItemText primary="Query nearby NFTs" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><LocationIcon color="warning" /></ListItemIcon>
                    <ListItemText primary="Search wallet locations" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><WalletIcon color="warning" /></ListItemIcon>
                    <ListItemText primary="Access public wallet data" />
                  </ListItem>
                </List>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Support */}
        <Card sx={{ mt: 4, backgroundColor: '#e3f2fd' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🆘 Need Help?
            </Typography>
            <Typography variant="body1" gutterBottom>
              For API support, documentation questions, or to request API keys:
            </Typography>
            <List>
              <ListItem>
                <ListItemText 
                  primary="Email: sergekhachatour@gmail.com"
                  secondary="Technical support and API key requests"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Swagger Documentation"
                  secondary="Interactive API testing at /docs"
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default APIDocumentation;