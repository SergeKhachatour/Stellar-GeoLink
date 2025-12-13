import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip as MuiChip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CloudUpload as CloudIcon,
  Share as ShareIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import api from '../../utils/api';

const IPFSServerManager = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [formData, setFormData] = useState({
    server_name: '',
    server_url: '',
    server_type: 'pinata',
    api_key: '',
    api_secret: '',
    is_default: false,
    is_shared: false,
    shared_with_users: []
  });

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/ipfs/servers');
      setServers(response.data.servers);
    } catch (error) {
      console.error('Error fetching servers:', error);
      setError('Failed to fetch IPFS servers');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (server = null) => {
    if (server) {
      setEditingServer(server);
      setFormData({
        server_name: server.server_name,
        server_url: server.server_url,
        server_type: server.server_type,
        api_key: server.api_key || '',
        api_secret: server.api_secret || '',
        is_default: server.is_default,
        is_shared: server.is_shared,
        shared_with_users: server.shared_with_users || []
      });
    } else {
      setEditingServer(null);
      setFormData({
        server_name: '',
        server_url: '',
        server_type: 'pinata',
        api_key: '',
        api_secret: '',
        is_default: false,
        is_shared: false,
        shared_with_users: []
      });
    }
    setOpenDialog(true);
  };

  const handleSaveServer = async () => {
    try {
      if (editingServer) {
        await api.put(`/ipfs/servers/${editingServer.id}`, formData);
      } else {
        await api.post('/ipfs/servers', formData);
      }
      setOpenDialog(false);
      fetchServers();
    } catch (error) {
      console.error('Error saving server:', error);
      setError('Failed to save IPFS server');
    }
  };

  const handleDeleteServer = async (serverId) => {
    if (window.confirm('Are you sure you want to delete this IPFS server?')) {
      try {
        await api.delete(`/ipfs/servers/${serverId}`);
        fetchServers();
      } catch (error) {
        console.error('Error deleting server:', error);
        setError('Failed to delete IPFS server');
      }
    }
  };

  const getServerTypeIcon = (type) => {
    switch (type) {
      case 'pinata': return <CloudIcon />;
      case 'infura': return <CloudIcon />;
      case 'custom': return <CloudIcon />;
      default: return <CloudIcon />;
    }
  };

  const getServerTypeColor = (type) => {
    switch (type) {
      case 'pinata': return 'primary';
      case 'infura': return 'secondary';
      case 'custom': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          IPFS Servers
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Server
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {servers.map((server) => (
          <Grid item xs={12} md={6} lg={4} key={server.id}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  {getServerTypeIcon(server.server_type)}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {server.server_name}
                  </Typography>
                  {server.is_default && (
                    <Chip
                      label="Default"
                      size="small"
                      color="primary"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Box>

                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  gutterBottom
                  sx={{ 
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    lineHeight: 1.4
                  }}
                >
                  {server.server_url}
                </Typography>

                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <MuiChip
                    label={server.server_type}
                    size="small"
                    color={getServerTypeColor(server.server_type)}
                  />
                  <MuiChip
                    label={server.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={server.is_active ? 'success' : 'error'}
                    icon={server.is_active ? <CheckIcon /> : <ErrorIcon />}
                  />
                  {server.is_shared && (
                    <MuiChip
                      label="Shared"
                      size="small"
                      color="info"
                      icon={<ShareIcon />}
                    />
                  )}
                </Box>

                <Typography variant="body2" color="text.secondary">
                  Created: {new Date(server.created_at).toLocaleDateString()}
                </Typography>
              </CardContent>

              <CardActions>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => handleOpenDialog(server)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleDeleteServer(server.id)}
                >
                  Delete
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {servers.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No IPFS servers configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first IPFS server to start pinning NFTs
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Your First Server
          </Button>
        </Paper>
      )}

      {/* Add/Edit Server Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingServer ? 'Edit IPFS Server' : 'Add IPFS Server'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Server Name"
                  value={formData.server_name}
                  onChange={(e) => setFormData({ ...formData, server_name: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Server Type</InputLabel>
                  <Select
                    value={formData.server_type}
                    onChange={(e) => setFormData({ ...formData, server_type: e.target.value })}
                    label="Server Type"
                  >
                    <MenuItem value="pinata">Pinata</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Server URL"
                  value={formData.server_url}
                  onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
                  placeholder="https://orange-adorable-thrush-508.mypinata.cloud"
                  helperText="Enter your Pinata gateway URL (without /ipfs/ path)"
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="API Key"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  type="password"
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="API Secret"
                  value={formData.api_secret}
                  onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                  type="password"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_default}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    />
                  }
                  label="Set as default server"
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_shared}
                      onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
                    />
                  }
                  label="Allow sharing with other users"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveServer} variant="contained">
            {editingServer ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IPFSServerManager;
