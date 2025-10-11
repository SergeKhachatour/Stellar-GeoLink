# Wallet Context System Documentation

## Overview

The Stellar-GeoLink platform implements a sophisticated wallet management system that handles wallet connections, reconnections, and cross-session persistence. This system ensures seamless user experience across login/logout cycles and prevents common wallet connection issues.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Connection Flow](#connection-flow)
4. [State Management](#state-management)
5. [Event System](#event-system)
6. [Security Features](#security-features)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)

## Architecture Overview

The wallet system is built around three core components that work together to provide seamless wallet management. **The system now includes user coordination to prevent race conditions:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AuthContext   │    │  WalletContext  │    │   NFTDashboard  │
│                 │    │                 │    │                 │
│ • User Login    │───▶│ • Wallet State  │◀───│ • Auto-Reconnect│
│ • Logout Events │    │ • Stellar SDK   │    │ • User Detection│
│ • Token Mgmt    │    │ • Persistence   │    │ • Retry Logic   │
│                 │    │ • User Coord.   │    │ • setUser()     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              ▲                        │
                              │                        │
                              └─── User Coordination ──┘
```

### 🔧 **Race Condition Fix**

The system now includes a **user coordination mechanism** that prevents race conditions between wallet restoration and user authentication:

1. **WalletContext** waits for user information before restoring wallet
2. **NFTDashboard** calls `setUser()` to coordinate user changes
3. **User validation** ensures wallet matches current user
4. **Automatic cleanup** for different users

## Core Components

### 1. WalletContext (`frontend/src/contexts/WalletContext.js`)

The central wallet management system that handles all wallet-related operations.

#### Key Responsibilities:
- **Wallet Connection State**: Tracks connection status, keys, balance, and account info
- **Stellar SDK Integration**: Manages Stellar network connections and transactions
- **Cross-Session Persistence**: Automatically restores wallet connections after page refresh
- **User Change Detection**: Clears wallet state when different users log in
- **Event-Driven Updates**: Responds to logout events and storage changes
- **User Coordination**: Waits for user authentication before wallet restoration (NEW)
- **Race Condition Prevention**: Prevents premature wallet connections (NEW)

#### State Variables:
```javascript
const [isConnected, setIsConnected] = useState(false);
const [publicKey, setPublicKey] = useState(null);
const [secretKey, setSecretKey] = useState(null);
const [balance, setBalance] = useState(null);
const [account, setAccount] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
const [currentUser, setCurrentUser] = useState(null);  // NEW: User coordination
```

#### New Functions:
```javascript
// User coordination function (NEW)
setUser(user)  // Set current user for wallet coordination
```

### 2. AuthContext Integration (`frontend/src/contexts/AuthContext.js`)

Enhanced authentication system that coordinates with the wallet system.

#### Key Features:
- **Logout Event Dispatch**: Sends custom `userLogout` events to notify wallet context
- **Token Management**: Handles JWT token lifecycle and cleanup
- **Cross-Tab Synchronization**: Ensures consistent state across browser tabs

#### Logout Process:
```javascript
const logout = async () => {
  try {
    // API logout call
    await authApi.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setError(null);
    
    // Notify wallet context
    window.dispatchEvent(new CustomEvent('userLogout'));
  }
};
```

### 3. NFTDashboard Auto-Reconnection (`frontend/src/components/NFT/NFTDashboard.js`)

Smart wallet reconnection logic that handles user changes and automatic connections.

#### Key Features:
- **User Detection**: Identifies when different users log in
- **Automatic Reconnection**: Connects to the correct user's wallet automatically
- **Retry Logic**: Implements robust retry mechanisms for connection failures
- **State Validation**: Ensures wallet state matches current user

## Connection Flow

### App Startup Process (Fixed Race Condition)

1. **WalletContext Mounts**: Initializes but waits for user information
2. **AuthContext Loads**: Authenticates user and sets user data
3. **User Coordination**: NFTDashboard calls `setUser()` to notify WalletContext
4. **Wallet Validation**: WalletContext checks if saved wallet matches current user
5. **Smart Restoration**: 
   - **Same User**: Restores wallet from localStorage
   - **Different User**: Clears saved data and prepares for new connection
   - **No Saved Data**: Prepares for auto-connection

### Initial Connection Process

1. **User Login**: AuthContext authenticates user and sets user data
2. **User Notification**: NFTDashboard calls `setUser()` to coordinate with WalletContext
3. **Wallet Detection**: NFTDashboard detects user has a public key
4. **Auto-Connection**: Automatically connects to user's wallet using `connectWalletViewOnly()`
5. **State Persistence**: Wallet state is saved to localStorage for future sessions
6. **Backend Sync**: User's public key is updated in the backend database

### Logout Process

1. **Logout Trigger**: User clicks logout or session expires
2. **Event Dispatch**: AuthContext dispatches `userLogout` custom event
3. **User Clearing**: NFTDashboard calls `setUser(null)` to notify WalletContext
4. **Wallet Clearing**: WalletContext clears wallet state (but preserves localStorage)
5. **Cross-Tab Sync**: All browser tabs receive logout notification
6. **State Reset**: All wallet-related state is reset to initial values

### Reconnection Process

1. **User Login**: New user logs in with their credentials
2. **User Notification**: NFTDashboard calls `setUser()` with new user data
3. **User Validation**: WalletContext validates saved wallet against current user
4. **State Management**: 
   - **Same User**: Restores wallet from localStorage automatically
   - **Different User**: Clears all wallet data and connects to new user's wallet
5. **Automatic Connection**: Wallet connects automatically without user intervention
6. **Retry Logic**: Implements retry mechanism for failed connections

## State Management

### Wallet State Variables

| Variable | Type | Description |
|----------|------|-------------|
| `isConnected` | Boolean | Indicates wallet connection status |
| `publicKey` | String | User's Stellar public key |
| `secretKey` | String | User's Stellar secret key (null for view-only) |
| `balance` | Number | XLM balance from Stellar network |
| `account` | Object | Full account object from Stellar network |
| `loading` | Boolean | Loading state for async operations |
| `error` | String | Error messages for failed operations |

### localStorage Keys

| Key | Purpose | Persistence |
|-----|---------|------------|
| `stellar_public_key` | Stores user's public key | Cleared on different user login |
| `stellar_secret_key` | Stores user's secret key | Cleared on different user login |
| `token` | JWT authentication token | Cleared on logout |
| `refreshToken` | JWT refresh token | Cleared on logout |

## Event System

### Custom Events

The system uses custom events for cross-component communication:

```javascript
// Dispatch logout event
window.dispatchEvent(new CustomEvent('userLogout'));

// Listen for logout event
window.addEventListener('userLogout', handleUserLogout);
```

### Storage Events

The system listens for localStorage changes to handle cross-tab synchronization:

```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'token' && e.newValue === null) {
    // Token was removed (logout), clear wallet state
    handleUserLogout();
  }
});
```

## Security Features

### Data Protection

- **Secret Key Handling**: Secret keys are only stored in memory during active sessions
- **View-Only Mode**: Public key connections don't store secret keys
- **Automatic Cleanup**: Wallet state is cleared on logout
- **Cross-Tab Security**: Logout in one tab affects all tabs

### User Isolation

- **User-Specific Data**: Each user's wallet data is isolated
- **Automatic Switching**: System automatically switches wallets when users change
- **State Validation**: Ensures wallet state matches current authenticated user

## Troubleshooting

### Common Issues and Solutions

#### 1. Wallet Not Reconnecting After Login (FIXED)

**Symptoms:**
- User logs in but wallet doesn't connect automatically
- Manual wallet connection required
- Wallet not connecting after app restart

**Cause:**
- **Race condition** between wallet restoration and user authentication
- WalletContext trying to restore before user is authenticated

**Solution:**
- Added user coordination mechanism with `setUser()` function
- Wallet restoration now waits for user authentication
- Proper sequencing of authentication and wallet restoration

**Prevention:**
- Implement user coordination between contexts
- Test app restart and login flows thoroughly

#### 2. Wrong User's Wallet Connected (FIXED)

**Symptoms:**
- Previous user's wallet data persists
- Wrong balance or account info displayed

**Cause:**
- Wallet restored from localStorage before user validation
- No user coordination between contexts

**Solution:**
- User validation ensures wallet matches current user
- Automatic cleanup for different users
- User coordination prevents cross-user contamination

**Prevention:**
- Implement user change detection
- Clear wallet data when users change

#### 3. Wallet Connection Fails

**Symptoms:**
- Connection attempts fail repeatedly
- Error messages displayed

**Cause:**
- Network issues or invalid public key
- Stellar network connectivity problems

**Solution:**
- Retry logic with exponential backoff
- Robust error handling and user feedback

**Prevention:**
- Implement retry mechanisms
- Provide clear error messages

#### 4. Cross-Tab Inconsistency

**Symptoms:**
- Wallet state differs between browser tabs
- Logout in one tab doesn't affect others

**Cause:**
- Wallet state not synchronized across tabs
- Storage events not properly handled

**Solution:**
- Storage event listeners for cross-tab sync
- Event-driven state management

**Prevention:**
- Implement cross-tab synchronization
- Test multi-tab scenarios

### Debug Information

The system provides comprehensive logging for debugging:

```javascript
console.log('User logged in with public key:', user.public_key);
console.log('Current wallet connection state:', { isConnected, publicKey });
console.log('Wallet needs reconnection:', { 
  needsReconnection, 
  currentPublicKey: publicKey, 
  userPublicKey: user.public_key 
});
console.log('User logout detected, clearing wallet state');
```

## API Reference

### WalletContext Functions

#### Core Connection Functions

```javascript
// Connect with secret key (full access)
connectWallet(secretKey: string): Promise<void>

// Connect with public key (view-only)
connectWalletViewOnly(publicKey: string): Promise<void>

// Disconnect and clear localStorage
disconnectWallet(): void

// Clear state but keep localStorage
clearWallet(): void

// Clear everything including localStorage
clearWalletCompletely(): void

// User coordination (NEW)
setUser(user: Object | null): void
```

#### Account Management Functions

```javascript
// Load account details from Stellar network
loadAccountInfo(publicKey: string): Promise<void>

// Send XLM transactions
sendTransaction(destination: string, amount: number, memo?: string): Promise<Object>

// Get transaction history
getTransactionHistory(limit?: number): Promise<Array>

// Fund account with testnet XLM
fundAccount(): Promise<boolean>
```

#### State Management Functions

```javascript
// Generate new wallet keypair
generateWallet(): Promise<{publicKey: string, secretKey: string}>

// Sign transaction
signTransaction(transactionXDR: string): Promise<string>
```

### Event System

#### Custom Events

```javascript
// Dispatch logout event
window.dispatchEvent(new CustomEvent('userLogout'));

// Listen for logout event
window.addEventListener('userLogout', (event) => {
  // Handle logout
});
```

#### Storage Events

```javascript
// Listen for storage changes
window.addEventListener('storage', (event) => {
  if (event.key === 'token' && event.newValue === null) {
    // Token was removed (logout)
  }
});
```

### Auto-Reconnection Logic

```javascript
// NFTDashboard user coordination (NEW)
useEffect(() => {
  if (user) {
    setUser(user);  // Notify WalletContext of current user
  } else {
    setUser(null);  // Clear user in WalletContext
  }
}, [user, setUser]);

// NFTDashboard auto-reconnection useEffect
useEffect(() => {
  if (user && user.public_key) {
    // Check if we need to reconnect
    const needsReconnection = !isConnected || (publicKey && publicKey !== user.public_key);
    const isDifferentUser = publicKey && publicKey !== user.public_key;
    
    if (isDifferentUser) {
      // Clear wallet completely for different user
      clearWalletCompletely();
    }
    
    if (needsReconnection) {
      // Attempt automatic reconnection
      connectWalletViewOnly(user.public_key);
    }
  }
}, [user, isConnected, publicKey, connectWalletViewOnly, clearWalletCompletely]);
```

### User Coordination Logic (NEW)

```javascript
// WalletContext user coordination
useEffect(() => {
  if (!currentUser) {
    // No user, clear wallet state
    return;
  }

  const savedPublicKey = localStorage.getItem('stellar_public_key');
  
  if (savedPublicKey && currentUser.public_key && savedPublicKey === currentUser.public_key) {
    // Same user, restore wallet
    restoreWallet(savedPublicKey);
  } else if (savedPublicKey && currentUser.public_key && savedPublicKey !== currentUser.public_key) {
    // Different user, clear saved data
    clearWalletCompletely();
  }
}, [currentUser]);
```

## User Experience Benefits

- **Seamless Login**: Wallet automatically connects when user logs in
- **No Manual Reconnection**: Users don't need to manually reconnect wallets
- **Cross-Session Persistence**: Wallet stays connected across browser sessions
- **Multi-Tab Support**: Consistent wallet state across all browser tabs
- **Automatic User Switching**: System handles user changes transparently
- **Error Recovery**: Automatic retry and recovery from connection failures

## Best Practices

1. **Always use the provided functions** instead of directly manipulating wallet state
2. **Test logout/login flows** thoroughly to ensure proper state management
3. **Implement proper error handling** for all wallet operations
4. **Use the event system** for cross-component communication
5. **Test multi-tab scenarios** to ensure consistency
6. **Monitor console logs** for debugging information
7. **Validate user changes** before attempting wallet operations

This wallet context system ensures a smooth, professional user experience while maintaining security and data integrity across all user sessions.
