import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Tabs,
  Tab,
  Alert
} from '@mui/material';
import {
  Map as MapIcon,
  TrendingUp as TrendingUpIcon,
  LocationOn as LocationIcon,
  People as PeopleIcon,
  Analytics as AnalyticsIcon
} from '@mui/icons-material';

const GeospatialAnalytics = ({ userRole, userId }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchAnalytics();
  }, [userRole, userId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      let endpoint = '';
      
      switch (userRole) {
        case 'wallet_provider':
          endpoint = '/api/wallet-provider/analytics';
          break;
        case 'admin':
          endpoint = '/api/admin/geospatial/global-analytics';
          break;
        case 'data_consumer':
          endpoint = '/api/data-consumer/market-analysis';
          break;
        default:
          throw new Error('Invalid user role');
      }

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2, textAlign: 'center' }}>
          Loading geospatial analytics...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Error loading analytics: {error}
      </Alert>
    );
  }

  const renderWalletProviderAnalytics = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <LocationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Location Statistics
            </Typography>
            <Typography variant="h3" color="primary">
              {analytics?.analytics?.total_locations || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Locations Tracked
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <AnalyticsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Coverage Area
            </Typography>
            <Typography variant="h3" color="secondary">
              {analytics?.analytics?.coverage_area ? 
                `${(analytics.analytics.coverage_area / 1000000).toFixed(2)} km²` : 
                'N/A'
              }
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Geographic Coverage
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Activity (Last 24 Hours)
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Wallet Address</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Last Updated</TableCell>
                    <TableCell>Distance from Center</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics?.recent_activity?.slice(0, 5).map((activity, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {activity.public_key?.substring(0, 10)}...
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {activity.latitude?.toFixed(4)}, {activity.longitude?.toFixed(4)}
                      </TableCell>
                      <TableCell>
                        {new Date(activity.last_updated).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {activity.distance_meters ? `${activity.distance_meters.toFixed(0)}m` : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderAdminAnalytics = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <PeopleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Total Locations
            </Typography>
            <Typography variant="h3" color="primary">
              {analytics?.global_statistics?.total_locations || 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <MapIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Active Providers
            </Typography>
            <Typography variant="h3" color="secondary">
              {analytics?.global_statistics?.active_providers || 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Coverage Area
            </Typography>
            <Typography variant="h3" color="success.main">
              {analytics?.global_statistics?.global_coverage_area ? 
                `${(analytics.global_statistics.global_coverage_area / 1000000).toFixed(2)} km²` : 
                'N/A'
              }
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <LocationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Avg Distance
            </Typography>
            <Typography variant="h3" color="info.main">
              {analytics?.global_statistics?.avg_distance_from_center ? 
                `${(analytics.global_statistics.avg_distance_from_center / 1000).toFixed(1)} km` : 
                'N/A'
              }
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Provider Comparison
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Provider</TableCell>
                    <TableCell>Locations</TableCell>
                    <TableCell>Coverage Area</TableCell>
                    <TableCell>Recent Activity</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics?.provider_comparison?.slice(0, 10).map((provider, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {provider.provider_public_key?.substring(0, 15)}...
                        </Typography>
                      </TableCell>
                      <TableCell>{provider.location_count}</TableCell>
                      <TableCell>
                        {provider.coverage_area ? 
                          `${(provider.coverage_area / 1000000).toFixed(2)} km²` : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>{provider.recent_activity}</TableCell>
                      <TableCell>
                        <Chip 
                          label={provider.recent_activity > 0 ? 'Active' : 'Inactive'} 
                          color={provider.recent_activity > 0 ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderDataConsumerAnalytics = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <PeopleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Total Wallets
            </Typography>
            <Typography variant="h3" color="primary">
              {analytics?.global_statistics?.unique_wallets || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Unique Wallet Addresses
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <MapIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Market Coverage
            </Typography>
            <Typography variant="h3" color="secondary">
              {analytics?.global_statistics?.global_coverage_area ? 
                `${(analytics.global_statistics.global_coverage_area / 1000000).toFixed(2)} km²` : 
                'N/A'
              }
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Geographic Coverage
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <AnalyticsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Active Providers
            </Typography>
            <Typography variant="h3" color="success.main">
              {analytics?.global_statistics?.active_providers || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Data Sources
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Regional Market Analysis
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Region</TableCell>
                    <TableCell>Market Share</TableCell>
                    <TableCell>Unique Wallets</TableCell>
                    <TableCell>Providers</TableCell>
                    <TableCell>Activity Level</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics?.regional_analysis?.map((region, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Chip label={region.region} color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>{region.market_share_percent}%</TableCell>
                      <TableCell>{region.unique_wallets}</TableCell>
                      <TableCell>{region.providers}</TableCell>
                      <TableCell>
                        <Chip 
                          label={region.location_count > 100 ? 'High' : region.location_count > 50 ? 'Medium' : 'Low'} 
                          color={region.location_count > 100 ? 'success' : region.location_count > 50 ? 'warning' : 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        🗺️ Geospatial Analytics Dashboard
      </Typography>
      
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Heatmap" />
        <Tab label="Route Analysis" />
        <Tab label="Market Insights" />
      </Tabs>

      {userRole === 'wallet_provider' && renderWalletProviderAnalytics()}
      {userRole === 'admin' && renderAdminAnalytics()}
      {userRole === 'data_consumer' && renderDataConsumerAnalytics()}
    </Box>
  );
};

export default GeospatialAnalytics;
