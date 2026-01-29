# GeoLink Deposit Actions Implementation

## Overview

GeoLink users can now view and execute deposit actions directly within the GeoLink application, using the same endpoints that XYZ-Wallet uses. This enables users who are logged into GeoLink and have a matched wallet for a deposit rule to complete deposit transactions using WebAuthn authentication.

## Backend Changes

### Authentication Updates

All deposit endpoints now support **both** authentication methods:

1. **JWT Authentication** (for GeoLink users)
   - Uses standard JWT token from login
   - Filters results by user's `public_key`
   - Users can only see/execute deposits for their own wallet

2. **Wallet Provider API Key** (for XYZ-Wallet)
   - Uses `X-API-Key` header
   - Can see/execute deposits for any wallet they manage
   - Can filter by `public_key` query parameter

### Updated Endpoints

All 5 deposit endpoints have been updated to support JWT authentication:

1. `GET /api/contracts/rules/pending/deposits`
   - **JWT Users**: Returns deposits filtered by their `public_key`
   - **Wallet Providers**: Returns all deposits (or filtered by `public_key` query param)

2. `GET /api/contracts/rules/pending/deposits/:action_id`
   - **JWT Users**: Can only access deposits for their own `public_key`
   - **Wallet Providers**: Can access any deposit action

3. `POST /api/contracts/rules/pending/deposits/:action_id/execute`
   - **JWT Users**: Can only execute deposits for their own `public_key`
   - **Wallet Providers**: Can execute deposits for any wallet they manage
   - Requires `user_secret_key` for transaction signing

4. `POST /api/contracts/rules/pending/deposits/:action_id/complete`
   - **JWT Users**: Can only report completion for their own deposits
   - **Wallet Providers**: Can report completion for any deposit

5. `POST /api/contracts/rules/pending/deposits/:action_id/cancel`
   - **JWT Users**: Can only cancel their own deposits
   - **Wallet Providers**: Can cancel any deposit

### Security

- JWT users are automatically filtered to only see deposits matching their `public_key`
- All endpoints verify that the `public_key` in the request matches the `matched_public_key` from the deposit action
- JWT users cannot access or modify deposits belonging to other wallets

## Frontend Implementation

### Required Changes to ContractManagement.js

The following changes need to be made to `frontend/src/components/Contracts/ContractManagement.js`:

#### 1. Add State Variables (Already Added)

```javascript
const [pendingDeposits, setPendingDeposits] = useState([]);
const [loadingPendingDeposits, setLoadingPendingDeposits] = useState(false);
```

#### 2. Add Load Function (Already Added)

```javascript
const loadPendingDeposits = async () => {
  try {
    setLoadingPendingDeposits(true);
    const response = await api.get('/contracts/rules/pending/deposits');
    if (response.data.success) {
      setPendingDeposits(response.data.pending_deposits || []);
    }
  } catch (err) {
    console.error('Error loading pending deposits:', err);
    setError(err.response?.data?.error || 'Failed to load pending deposits');
  } finally {
    setLoadingPendingDeposits(false);
  }
};
```

#### 3. Update Tab Indices

- Current tabs: Contracts (0), Execution Rules (1), Pending Rules (2), Completed Rules (3), Rejected Rules (4)
- New tabs: Contracts (0), Execution Rules (1), Pending Rules (2), **Deposit Actions (3)**, Completed Rules (4), Rejected Rules (5)

Update the `useEffect` hook that loads data on tab change:

```javascript
useEffect(() => {
  if (isAuthenticated) {
    if (tabValue === 2) {
      loadPendingRules();
    } else if (tabValue === 3) {
      loadPendingDeposits(); // NEW
    } else if (tabValue === 4) {
      loadCompletedRules();
    } else if (tabValue === 5) {
      loadRejectedRules();
    }
  }
}, [tabValue, isAuthenticated]);
```

#### 4. Add Deposit Actions Tab

Add a new tab in the Tabs component:

```javascript
<Tab 
  label={
    <Box display="flex" alignItems="center" gap={1}>
      <Typography variant="body2" noWrap>Deposit Actions</Typography>
      {isAuthenticated && (
        <Chip 
          label={loadingPendingDeposits ? '...' : pendingDeposits.length} 
          size="small" 
          color="warning"
        />
      )}
    </Box>
  }
  {...a11yProps(3)} 
/>
```

#### 5. Add Deposit Actions TabPanel

Add a new TabPanel after the Pending Rules tab:

```javascript
{/* Deposit Actions Tab */}
<TabPanel value={tabValue} index={3}>
  {!isAuthenticated ? (
    <Alert severity="info">
      Please log in to view deposit actions.
    </Alert>
  ) : (
    <>
      <Box mb={3}>
        <Alert severity="info" icon={<AccountBalanceWalletIcon />}>
          <Typography variant="subtitle2" gutterBottom>
            Pending Deposit Actions
          </Typography>
          <Typography variant="body2">
            Complete deposit transactions that require your authentication. These deposits were triggered by location-based execution rules.
          </Typography>
        </Alert>
      </Box>
      
      {loadingPendingDeposits ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : pendingDeposits.length === 0 ? (
        <Alert severity="success">
          No pending deposit actions. All deposits have been completed.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Rule</TableCell>
                <TableCell>Contract</TableCell>
                <TableCell>Function</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingDeposits.map((deposit) => (
                <TableRow key={deposit.id}>
                  <TableCell>{deposit.rule_name}</TableCell>
                  <TableCell>{deposit.contract_name}</TableCell>
                  <TableCell>{deposit.function_name}</TableCell>
                  <TableCell>
                    {deposit.parameters?.amount 
                      ? `${(parseInt(deposit.parameters.amount) / 10000000).toFixed(7)} XLM`
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {deposit.location?.latitude && deposit.location?.longitude
                      ? `${deposit.location.latitude.toFixed(4)}, ${deposit.location.longitude.toFixed(4)}`
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={deposit.status} 
                      color={
                        deposit.status === 'completed' ? 'success' :
                        deposit.status === 'failed' ? 'error' :
                        deposit.status === 'cancelled' ? 'default' : 'warning'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {deposit.status === 'pending' && (
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        onClick={() => handleExecuteDeposit(deposit)}
                        startIcon={<PlayArrowIcon />}
                      >
                        Execute
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )}
</TabPanel>
```

#### 6. Add Deposit Execution Handler

Add a function to handle deposit execution (similar to existing rule execution):

```javascript
const handleExecuteDeposit = async (deposit) => {
  try {
    // Get user's secret key (from wallet context or prompt)
    const { currentWallet } = useWallet();
    const userSecretKey = currentWallet?.secretKey || localStorage.getItem('stellar_secret_key');
    
    if (!userSecretKey) {
      setError('Secret key required to execute deposit');
      return;
    }

    // Create contract call intent
    const intent = intentService.createContractCallIntent({
      contract_id: deposit.contract_id,
      function_name: deposit.function_name,
      parameters: deposit.parameters,
      rule_id: deposit.rule_id,
      update_id: deposit.update_id
    });

    // Encode intent to bytes
    const intentBytes = intentService.encodeIntentBytes(intent);
    const signaturePayload = Buffer.from(intentBytes).toString('base64');

    // Generate WebAuthn challenge
    const challenge = crypto.subtle.digest('SHA-256', intentBytes);

    // Perform WebAuthn authentication
    const webauthnResult = await webauthnService.authenticateUser({
      challenge: challenge,
      publicKey: deposit.matched_public_key
    });

    // Execute deposit
    const response = await api.post(
      `/contracts/rules/pending/deposits/${deposit.id}/execute`,
      {
        public_key: deposit.matched_public_key,
        user_secret_key: userSecretKey,
        webauthn_signature: webauthnResult.signature,
        webauthn_authenticator_data: webauthnResult.authenticatorData,
        webauthn_client_data: webauthnResult.clientDataJSON,
        signature_payload: signaturePayload,
        passkey_public_key_spki: webauthnResult.publicKeySPKI
      }
    );

    if (response.data.success) {
      setSuccess(`Deposit executed successfully! Transaction: ${response.data.transaction_hash}`);
      await loadPendingDeposits();
    }
  } catch (err) {
    console.error('Error executing deposit:', err);
    setError(err.response?.data?.error || 'Failed to execute deposit');
  }
};
```

## Testing Checklist

- [ ] JWT-authenticated users can see their own pending deposits
- [ ] JWT-authenticated users cannot see other users' deposits
- [ ] Deposit actions tab displays correctly
- [ ] Deposit execution works with WebAuthn
- [ ] Transaction hashes are recorded correctly
- [ ] Completed deposits are removed from the list
- [ ] Error handling works correctly
- [ ] Auto-refresh updates deposit list

## Notes

- The deposit endpoints use the same logic as XYZ-Wallet endpoints
- JWT users are automatically scoped to their own `public_key`
- The frontend can reuse the existing WebAuthn and intent service logic
- Deposit execution requires both WebAuthn authentication and the user's secret key
