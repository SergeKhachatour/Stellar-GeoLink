import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import {
  Settings as SettingsIcon,
  VpnKey as PasskeyIcon,
  Api as ApiIcon,
} from '@mui/icons-material';
import PasskeyManager from '../Wallet/PasskeyManager';
import ApiDocumentation from '../shared/ApiDocumentation';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `settings-tab-${index}`,
    'aria-controls': `settings-tabpanel-${index}`,
  };
}

const SettingsPage = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your account settings, passkeys, and API documentation
        </Typography>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="settings tabs"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '1rem'
              }
            }}
          >
            <Tab
              icon={<PasskeyIcon />}
              iconPosition="start"
              label="Passkeys"
              {...a11yProps(0)}
            />
            <Tab
              icon={<ApiIcon />}
              iconPosition="start"
              label="API Documentation"
              {...a11yProps(1)}
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <PasskeyIcon />
                Passkey Management
              </Typography>
              <Divider sx={{ mb: 3 }} />
              <PasskeyManager />
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <ApiIcon />
                API Documentation
              </Typography>
              <Divider sx={{ mb: 3 }} />
              <ApiDocumentation />
            </CardContent>
          </Card>
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default SettingsPage;
