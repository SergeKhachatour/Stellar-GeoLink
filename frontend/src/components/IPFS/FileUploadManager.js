import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  LinearProgress,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import api from '../../utils/api';

const FileUploadManager = ({ user }) => {
  const [uploads, setUploads] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [viewLocalDialog, setViewLocalDialog] = useState({ open: false, url: '', filename: '' });
  const [viewIPFSDialog, setViewIPFSDialog] = useState({ open: false, url: '', filename: '' });
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, uploadId: null, filename: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchUploads();
    fetchServers();
  }, []);

  const fetchUploads = async () => {
    try {
      setLoading(true);
      const response = await api.get('/ipfs/uploads');
      setUploads(response.data.uploads);
    } catch (error) {
      console.error('Error fetching uploads:', error);
      setError('Failed to fetch uploads');
    } finally {
      setLoading(false);
    }
  };

  const fetchServers = async () => {
    try {
      const response = await api.get('/ipfs/servers');
      setServers(response.data.servers);
      if (response.data.servers.length > 0) {
        const defaultServer = response.data.servers.find(s => s.is_default);
        setSelectedServer(defaultServer ? defaultServer.id : response.data.servers[0].id);
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file - only JPG, PNG, JPEG allowed
      const maxSize = 5 * 1024 * 1024; // 5MB (base64 increases size by ~33%)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png'];
      
      // Check file size
      if (file.size > maxSize) {
        setError(`File size exceeds 5MB limit (current: ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        return;
      }
      
      // Check file type and extension
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
      
      if (!isValidType) {
        setError('Invalid file type. Only JPG, PNG, and JPEG files are allowed.');
        return;
      }
      
      setSelectedFile(file);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedServer) {
      setError('Please select a file and IPFS server');
      return;
    }

    // Check if the selected server has proper credentials for IPFS upload
    const server = servers.find(s => s.id === selectedServer);
    if (!server) {
      setError('Selected server not found');
      return;
    }

    // For Pinata servers, check if API key and secret are provided and not empty
    if (server.server_type === 'pinata' && (!server.api_key || server.api_key.trim() === '' || !server.api_secret || server.api_secret.trim() === '')) {
      setError('Please configure both API key and API secret for Pinata server before uploading');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setError('');

      // Convert file to base64 for upload
      const fileReader = new FileReader();
      fileReader.onload = async (e) => {
        try {
          const fileData = e.target.result;
          
          const uploadData = {
            filename: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
            fileData: fileData,
            ipfs_server_id: selectedServer
          };

          const response = await api.post('/ipfs/upload', uploadData, {
            headers: {
              'Content-Type': 'application/json',
            },
            onUploadProgress: (progressEvent) => {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(progress);
            },
          });

          setSuccess(`File uploaded and pinned to Pinata! Hash: ${response.data.ipfsHash}`);
          setSelectedFile(null);
          setSelectedServer('');
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          fetchUploads();
        } catch (error) {
          console.error('Upload error:', error);
          setError(error.response?.data?.error || 'Upload failed');
        } finally {
          setUploading(false);
        }
      };
      
      fileReader.readAsDataURL(selectedFile);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePinFile = async (uploadId) => {
    try {
      await api.post(`/ipfs/pin/${uploadId}`);
      setSuccess('File pinning initiated!');
      fetchUploads();
    } catch (error) {
      console.error('Error pinning file:', error);
      setError('Failed to pin file');
    }
  };

  const handleDeleteUpload = async (uploadId) => {
    const upload = uploads.find(u => u.id === uploadId);
    if (upload) {
      setDeleteConfirmDialog({ 
        open: true, 
        uploadId: uploadId, 
        filename: upload.original_filename 
      });
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/ipfs/uploads/${deleteConfirmDialog.uploadId}`);
      setSuccess('Upload deleted successfully!');
      fetchUploads();
      setDeleteConfirmDialog({ open: false, uploadId: null, filename: '' });
    } catch (error) {
      console.error('Error deleting upload:', error);
      setError('Failed to delete upload');
      setDeleteConfirmDialog({ open: false, uploadId: null, filename: '' });
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'uploaded': return <CheckIcon color="success" />;
      case 'pinning': return <CircularProgress size={20} />;
      case 'pinned': return <CheckIcon color="primary" />;
      case 'failed': return <ErrorIcon color="error" />;
      default: return <WarningIcon color="warning" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'uploaded': return 'success';
      case 'pinning': return 'info';
      case 'pinned': return 'primary';
      case 'failed': return 'error';
      default: return 'warning';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems="center" 
        mb={3}
        flexDirection={{ xs: 'column', sm: 'row' }}
        gap={{ xs: 2, sm: 0 }}
      >
        <Typography variant="h4" component="h2" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          File Uploads
        </Typography>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          size="large"
          sx={{ 
            minWidth: { xs: '100%', sm: 'auto' },
            fontSize: { xs: '0.875rem', sm: '1rem' }
          }}
        >
          Upload File
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Upload Dialog */}
      {selectedFile && (
        <Dialog 
          open={true} 
          onClose={() => setSelectedFile(null)} 
          maxWidth="md" 
          fullWidth
          PaperProps={{
            sx: { minHeight: { xs: 'auto', sm: '500px' } }
          }}
        >
          <DialogTitle>Upload File</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body1" gutterBottom>
                    <strong>File:</strong> {selectedFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Size:</strong> {formatFileSize(selectedFile.size)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Type:</strong> {selectedFile.type}
                  </Typography>
                  
                  <FormControl fullWidth sx={{ mt: 2 }}>
                    <InputLabel>IPFS Server</InputLabel>
                    <Select
                      value={selectedServer}
                      onChange={(e) => setSelectedServer(e.target.value)}
                      label="IPFS Server"
                    >
                      {servers.map((server) => {
                        const isConfigured = server.server_type === 'pinata' && server.api_key && server.api_key.trim() !== '' && server.api_secret && server.api_secret.trim() !== '';
                        
                        return (
                          <MenuItem key={server.id} value={server.id} disabled={!isConfigured}>
                            <Box display="flex" alignItems="center" width="100%">
                              <Box flexGrow={1}>
                                {server.server_name} ({server.server_type})
                              </Box>
                              <Box ml={1}>
                                {isConfigured ? (
                                  <CheckIcon color="success" fontSize="small" />
                                ) : (
                                  <WarningIcon color="warning" fontSize="small" />
                                )}
                              </Box>
                            </Box>
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>

                  {uploading && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        Uploading... {uploadProgress}%
                      </Typography>
                      <LinearProgress variant="determinate" value={uploadProgress} />
                    </Box>
                  )}
                </Grid>
                
                <Grid item xs={12} md={6}>
                  {/* File Preview */}
                  {selectedFile.type && selectedFile.type.startsWith('image/') && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Preview:</strong>
                      </Typography>
                      <Box
                        sx={{
                          width: '100%',
                          height: { xs: 200, sm: 250, md: 300 },
                          border: '1px solid #ddd',
                          borderRadius: 1,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#f5f5f5'
                        }}
                      >
                        <img
                          src={URL.createObjectURL(selectedFile)}
                          alt={selectedFile.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                        />
                      </Box>
                    </Box>
                  )}
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedFile(null)} disabled={uploading}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              variant="contained" 
              disabled={uploading || !selectedServer}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".jpg,.jpeg,.png,image/jpeg,image/jpg,image/png"
        style={{ display: 'none' }}
      />

      {/* Uploads List */}
      <Grid container spacing={3}>
        {uploads.map((upload) => (
          <Grid item xs={12} sm={6} md={6} lg={4} xl={3} key={upload.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box display="flex" alignItems="center" mb={2}>
                  {getStatusIcon(upload.upload_status)}
                  <Typography variant="h6" sx={{ ml: 1, flexGrow: 1, fontSize: { xs: '1rem', sm: '1.1rem' } }}>
                    {upload.original_filename}
                  </Typography>
                  <Chip
                    label={upload.upload_status}
                    size="small"
                    color={getStatusColor(upload.upload_status)}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Size:</strong> {formatFileSize(upload.file_size)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Type:</strong> {upload.mime_type}
                  </Typography>
                </Box>

                {/* Image Preview */}
                {upload.mime_type && upload.mime_type.startsWith('image/') && upload.ipfs_hash && (
                  <Box sx={{ mt: 2, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>Preview:</strong>
                    </Typography>
                    <Box
                      sx={{
                        width: '100%',
                        height: { xs: 120, sm: 150, md: 200, lg: 220 },
                        border: '1px solid #ddd',
                        borderRadius: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5'
                      }}
                    >
                      <img
                        src={(() => {
                          const getApiBaseURL = () => {
                            if (typeof window !== 'undefined' && window.location) {
                              const hostname = window.location.hostname || '';
                              const protocol = window.location.protocol || 'https:';
                              const port = window.location.port;
                              // PRIORITY: stellargeolink.com, azurewebsites.net, HTTPS, or any domain
                              if (hostname.includes('stellargeolink.com') || 
                                  hostname.includes('azurewebsites.net') || 
                                  protocol === 'https:' ||
                                  (!hostname.includes('localhost') && hostname.includes('.'))) {
                                return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
                              }
                            }
                            return process.env.REACT_APP_API_URL || 'http://localhost:4000';
                          };
                          return `${getApiBaseURL()}/api/ipfs/files/${user?.id}/${upload.file_path}`;
                        })()}
                        alt={upload.original_filename}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <Box
                        sx={{
                          display: 'none',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'text.secondary',
                          fontSize: '0.75rem'
                        }}
                      >
                        <WarningIcon />
                        <Typography variant="caption">
                          Preview unavailable
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {upload.server_name && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Server:</strong> {upload.server_name}
                    </Typography>
                  )}

                  {upload.ipfs_hash && (
                    <Typography variant="body2" color="text.secondary" sx={{ 
                      wordBreak: 'break-all',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      lineHeight: 1.4,
                      mb: 1
                    }}>
                      <strong>IPFS Hash:</strong> {upload.ipfs_hash}
                    </Typography>
                  )}
                </Box>

                {upload.validation_errors && upload.validation_errors.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      {upload.validation_errors.join(', ')}
                    </Typography>
                  </Alert>
                )}

                <Typography variant="body2" color="text.secondary">
                  Uploaded: {new Date(upload.created_at).toLocaleString()}
                </Typography>
              </CardContent>

              <CardActions sx={{ 
                flexWrap: 'wrap', 
                gap: 1, 
                justifyContent: 'space-between',
                '& .MuiButton-root': {
                  minWidth: 'auto',
                  flex: { xs: '1 1 auto', sm: '0 0 auto' }
                }
              }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flex: 1 }}>
                  {upload.upload_status === 'uploaded' && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handlePinFile(upload.id)}
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      Pin to IPFS
                    </Button>
                  )}
                  {upload.mime_type && upload.mime_type.startsWith('image/') && (
                    <Button
                      size="small"
                      startIcon={<ViewIcon />}
                      onClick={() => {
                        const getApiBaseURL = () => {
                          if (typeof window !== 'undefined' && window.location) {
                            const hostname = window.location.hostname || '';
                            const protocol = window.location.protocol || 'https:';
                            const port = window.location.port;
                            // PRIORITY: stellargeolink.com, azurewebsites.net, HTTPS, or any domain
                            if (hostname.includes('stellargeolink.com') || 
                                hostname.includes('azurewebsites.net') || 
                                protocol === 'https:' ||
                                (!hostname.includes('localhost') && hostname.includes('.'))) {
                              return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
                            }
                          }
                          return process.env.REACT_APP_API_URL || 'http://localhost:4000';
                        };
                        const localUrl = `${getApiBaseURL()}/api/ipfs/files/${user?.id}/${upload.file_path}`;
                        setViewLocalDialog({ 
                          open: true, 
                          url: localUrl, 
                          filename: upload.original_filename 
                        });
                      }}
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      View Local
                    </Button>
                  )}
                  {upload.ipfs_hash && upload.server_url && (
                    <Button
                      size="small"
                      startIcon={<ViewIcon />}
                      onClick={() => {
                        // Construct the full IPFS URL
                        console.log('🔍 Debug View IPFS:', {
                          server_url: upload.server_url,
                          ipfs_hash: upload.ipfs_hash,
                          upload: upload
                        });
                        
                        // Handle different server_url formats
                        let baseUrl = upload.server_url;
                        
                        // If server_url contains /ipfs/, extract just the base URL
                        if (baseUrl.includes('/ipfs/')) {
                          baseUrl = baseUrl.split('/ipfs/')[0];
                        }
                        
                        // Ensure it has https:// protocol
                        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                          baseUrl = `https://${baseUrl}`;
                        }
                        
                        // Remove trailing slash
                        baseUrl = baseUrl.replace(/\/$/, '');
                        
                        const ipfsUrl = `${baseUrl}/ipfs/${upload.ipfs_hash}`;
                        
                        console.log('🔗 Constructed IPFS URL:', ipfsUrl);
                        
                        setViewIPFSDialog({ 
                          open: true, 
                          url: ipfsUrl, 
                          filename: upload.original_filename 
                        });
                      }}
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      View IPFS
                    </Button>
                  )}
                </Box>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleDeleteUpload(upload.id)}
                  sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                >
                  Delete
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {uploads.length === 0 && (
        <Paper sx={{ 
          p: { xs: 3, sm: 4, md: 6 }, 
          textAlign: 'center',
          maxWidth: { xs: '100%', sm: '600px' },
          mx: 'auto'
        }}>
          <Typography variant="h5" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            No files uploaded yet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            Upload your first NFT file to get started with IPFS pinning
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            size="large"
            sx={{ 
              minWidth: { xs: '100%', sm: '200px' },
              fontSize: { xs: '0.875rem', sm: '1rem' }
            }}
          >
            Upload File
          </Button>
        </Paper>
      )}

      {/* View Local Dialog */}
      <Dialog 
        open={viewLocalDialog.open} 
        onClose={() => setViewLocalDialog({ open: false, url: '', filename: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">View Local File</Typography>
            <IconButton onClick={() => setViewLocalDialog({ open: false, url: '', filename: '' })}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>File:</strong> {viewLocalDialog.filename}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>URL:</strong> 
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                wordBreak: 'break-all', 
                fontFamily: 'monospace', 
                fontSize: '0.75rem',
                backgroundColor: '#f5f5f5',
                p: 1,
                borderRadius: 1,
                mb: 2
              }}
            >
              {viewLocalDialog.url}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <img
              src={viewLocalDialog.url}
              alt={viewLocalDialog.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '500px',
                objectFit: 'contain',
                border: '1px solid #ddd',
                borderRadius: '8px'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <Typography 
              variant="body2" 
              color="error" 
              sx={{ display: 'none', mt: 2 }}
            >
              Failed to load image
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => window.open(viewLocalDialog.url, '_blank')}
            startIcon={<OpenInNewIcon />}
          >
            Open in New Tab
          </Button>
          <Button 
            onClick={() => setViewLocalDialog({ open: false, url: '', filename: '' })}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* View IPFS Dialog */}
      <Dialog 
        open={viewIPFSDialog.open} 
        onClose={() => setViewIPFSDialog({ open: false, url: '', filename: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">View IPFS File</Typography>
            <IconButton onClick={() => setViewIPFSDialog({ open: false, url: '', filename: '' })}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>File:</strong> {viewIPFSDialog.filename}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>IPFS URL:</strong> 
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                wordBreak: 'break-all', 
                fontFamily: 'monospace', 
                fontSize: '0.75rem',
                backgroundColor: '#f5f5f5',
                p: 1,
                borderRadius: 1,
                mb: 2
              }}
            >
              {viewIPFSDialog.url}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <img
              src={viewIPFSDialog.url}
              alt={viewIPFSDialog.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '500px',
                objectFit: 'contain',
                border: '1px solid #ddd',
                borderRadius: '8px'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <Typography 
              variant="body2" 
              color="error" 
              sx={{ display: 'none', mt: 2 }}
            >
              Failed to load image from IPFS
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => window.open(viewIPFSDialog.url, '_blank')}
            startIcon={<OpenInNewIcon />}
          >
            Open in New Tab
          </Button>
          <Button 
            onClick={() => setViewIPFSDialog({ open: false, url: '', filename: '' })}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteConfirmDialog.open} 
        onClose={() => setDeleteConfirmDialog({ open: false, uploadId: null, filename: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <WarningIcon color="warning" sx={{ mr: 1 }} />
              <Typography variant="h6">Confirm Delete</Typography>
            </Box>
            <IconButton onClick={() => setDeleteConfirmDialog({ open: false, uploadId: null, filename: '' })}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete this upload?
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>File:</strong> {deleteConfirmDialog.filename}
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Warning:</strong> This action will:
            </Typography>
            <Typography variant="body2" component="div" sx={{ mt: 1 }}>
              • Delete the file from your local server
            </Typography>
            <Typography variant="body2" component="div">
              • Unpin the file from IPFS
            </Typography>
            <Typography variant="body2" component="div">
              • Remove all associated database records
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
              This action cannot be undone.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteConfirmDialog({ open: false, uploadId: null, filename: '' })}
            color="primary"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmDelete}
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
          >
            Delete Upload
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileUploadManager;
