import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from '@mui/material';
import api from '../../services/api';

const NFTCollectionAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [reportType, setReportType] = useState('summary');
  const [startDate] = useState('');
  const [endDate] = useState('');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/nft/analytics');
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = useCallback(async () => {
    try {
      const params = new URLSearchParams({ report_type: reportType });
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      console.log('📊 Fetching reports with params:', params.toString());
      const response = await api.get(`/nft/reports?${params}`);
      console.log('📊 Reports response:', response.data);
      console.log('📊 Reports data type:', typeof response.data);
      console.log('📊 Is reports an array?', Array.isArray(response.data));
      
      // Handle the response data structure
      const reportsData = response.data.data || response.data;
      console.log('📊 Processed reports data:', reportsData);
      console.log('📊 Is processed data an array?', Array.isArray(reportsData));
      
      setReports(reportsData);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Failed to load reports');
    }
  }, [reportType, startDate, endDate]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (tabValue === 1) {
      fetchReports();
    }
  }, [tabValue, reportType, startDate, endDate, fetchReports]);

  const rarityColors = {
    legendary: '#FFD700',
    rare: '#C0C0C0',
    common: '#CD7F32',
    unknown: '#808080'
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTransactionHash = (hash) => {
    if (!hash) return 'N/A';
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFD700', mb: 3 }}>
          📊 NFT Collection Analytics
        </Typography>
        <Typography>Loading analytics...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFD700', mb: 3 }}>
          📊 NFT Collection Analytics
        </Typography>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFD700', mb: 3, textAlign: 'center' }}>
        📊 NFT Collection Analytics
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="📈 Analytics Dashboard" />
          <Tab label="📋 Reports" />
        </Tabs>
      </Box>

      {tabValue === 0 && analytics && (
        <Grid container spacing={3}>
          {/* Collection Stats */}
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>
                  🎯 Total Collected
                </Typography>
                <Typography variant="h4" sx={{ color: 'white' }}>
                  {analytics.collection_stats?.total_collected || 0}
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc' }}>
                  NFTs in collection
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>
                  📚 Collections
                </Typography>
                <Typography variant="h4" sx={{ color: 'white' }}>
                  {analytics.collection_stats?.unique_collections || 0}
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc' }}>
                  Unique collections
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>
                  ⭐ Legendary
                </Typography>
                <Typography variant="h4" sx={{ color: 'white' }}>
                  {analytics.collection_stats?.legendary_count || 0}
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc' }}>
                  Legendary NFTs
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>
                  🔄 Transfers
                </Typography>
                <Typography variant="h4" sx={{ color: 'white' }}>
                  {analytics.collection_stats?.avg_transfer_count || 0}
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc' }}>
                  Avg transfers per NFT
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Rarity Distribution */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#FFD700' }}>
                🎯 Rarity Distribution
              </Typography>
              <Box sx={{ mt: 2 }}>
                {analytics.rarity_distribution?.map((entry, index) => (
                  <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: rarityColors[entry.rarity_level] || '#808080' }}>
                      {entry.rarity_level}: {entry.count} NFTs
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#FFD700' }}>
                      {entry.percentage}%
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* Collection Timeline */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#FFD700' }}>
                📅 Collection Timeline (Last 30 Days)
              </Typography>
              <Box sx={{ mt: 2 }}>
                {analytics.timeline?.slice(0, 7).map((entry, index) => (
                  <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: 'white' }}>
                      {formatDate(entry.collection_date)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#FFD700' }}>
                      {entry.nfts_collected} NFTs
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* Transfer History Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#FFD700' }}>
                🔄 Recent Transfer History
              </Typography>
              <Box sx={{ mt: 2 }}>
                {analytics.transfer_history?.slice(0, 10).map((transfer, index) => (
                  <Box key={index} sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    mb: 1, 
                    p: 1, 
                    background: 'rgba(255, 215, 0, 0.1)', 
                    borderRadius: 1 
                  }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: 'white' }}>
                        {transfer.transfer_type} - {formatDate(transfer.transferred_at)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#ccc' }}>
                        TX: {formatTransactionHash(transfer.transaction_hash)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#FFD700' }}>
                      {transfer.nft_name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tabValue === 1 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Report Type</InputLabel>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                label="Report Type"
              >
                <MenuItem value="summary">Summary</MenuItem>
                <MenuItem value="rarity_breakdown">Rarity Breakdown</MenuItem>
                <MenuItem value="transfer_activity">Transfer Activity</MenuItem>
              </Select>
            </FormControl>
            <Button 
              variant="contained" 
              onClick={fetchReports}
              sx={{ 
                background: 'linear-gradient(45deg, #FFD700, #FFA500)',
                color: 'black',
                '&:hover': {
                  background: 'linear-gradient(45deg, #FFA500, #FFD700)',
                }
              }}
            >
              Generate Report
            </Button>
          </Box>

          {reports && (
            <Paper sx={{ p: 2, background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: 'white' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#FFD700' }}>
                📋 Generated Report
              </Typography>
              <Box sx={{ mt: 2 }}>
                {Array.isArray(reports) && reports.length > 0 ? (
                  reports.map((item, index) => (
                    <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ color: 'white' }}>
                        {item.metric}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#FFD700' }}>
                        {item.value}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ color: '#ccc' }}>
                    No report data available. Click "Generate Report" to create a report.
                  </Typography>
                )}
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
};

export default NFTCollectionAnalytics;