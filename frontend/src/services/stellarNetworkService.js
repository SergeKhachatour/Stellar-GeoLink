// Stellar Network API Service
// This service handles communication with Stellar Atlas API and Horizon API
// Uses backend proxy to avoid CORS issues

// Determine the API base URL based on environment (called at runtime, not build time)
const getApiBaseURL = () => {
  // Always check window.location at runtime (not build time)
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || '';
    const protocol = window.location.protocol || 'https:';
    const port = window.location.port;
    
    // Explicit check: if we're on HTTPS or have a domain (not localhost), use production URL
    const isLocalhost = hostname === 'localhost' || 
                       hostname === '127.0.0.1' || 
                       hostname.startsWith('192.168.') ||
                       hostname.startsWith('10.') ||
                       hostname === '' ||
                       hostname.includes('localhost');
    
    // If protocol is HTTPS or hostname contains a domain (not localhost), use production
    if (protocol === 'https:' || (!isLocalhost && hostname.includes('.'))) {
      // Production: use same domain as frontend
      return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
    }
  }
  // For local development only
  return process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
};

// Get API base URL dynamically (not at module load time)
const getAPI_BASE_URL = () => getApiBaseURL();

class StellarNetworkService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds cache
    this.isFetching = false; // Prevent concurrent fetches
  }

  // Get network information from Stellar Horizon API
  async getNetworkInformation() {
    try {
      // Use backend proxy to avoid CORS issues
      const response = await fetch(`${getAPI_BASE_URL()}/stellar/network-info`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Transform Horizon API response to our expected format
      return {
        networkPassphrase: data.network_passphrase,
        version: data.core_version,
        protocolVersion: data.protocol_version,
        currentLedger: data.ledger_version,
        networkId: 'mainnet',
        isMockData: false // Real data from Horizon API
      };
    } catch (error) {
      console.error('Error fetching network information:', error);
      throw error;
    }
  }

  // Get Stellar validators/nodes information - NO MOCK DATA
  async getStellarValidators() {
    try {
      // Use backend proxy to avoid CORS issues
      const endpoint = `${getAPI_BASE_URL()}/stellar/validators`;
      console.log(`Fetching from: ${endpoint}`);
      
      const response = await fetch(endpoint);
      
      // Try to parse error response if not ok
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
          console.error('Stellar Atlas API error:', errorData);
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Check if response is an error object
      if (data.error) {
        throw new Error(data.message || data.error);
      }
      
      console.log(`Successfully fetched ${Array.isArray(data) ? data.length : 'data'} nodes from Stellar Atlas API`);
      
      // Transform the API response to our expected format
      return this.transformValidatorData(data);
    } catch (error) {
      console.error('Error fetching Stellar validators:', error);
      // NO MOCK DATA - throw error instead
      throw new Error(`Failed to fetch Stellar validators: ${error.message}`);
    }
  }

  // Transform API response to our component format
  transformValidatorData(apiData) {
    // Handle the Stellar Atlas API v1/node response format
    const validators = Array.isArray(apiData) ? apiData : (apiData.validators || apiData.nodes || []);
    
    return validators.map((node, index) => ({
      id: node.publicKey || `node-${index}`,
      name: node.name || node.alias || `Stellar Node ${index + 1}`,
      publicKey: node.publicKey,
      location: {
        lat: node.geoData?.latitude || 0,
        lng: node.geoData?.longitude || 0
      },
      city: node.geoData?.countryName || 'Unknown',
      country: node.geoData?.countryName || 'Unknown',
      status: this.mapAtlasNodeStatus(node),
      version: node.versionStr || node.ledgerVersion?.toString() || 'Unknown',
      uptime: node.statistics?.active24HoursPercentage ? `${node.statistics.active24HoursPercentage.toFixed(1)}%` : 'Unknown',
      lastSeen: node.dateUpdated || new Date().toISOString(),
      network: 'mainnet',
      latency: node.lag ? `${node.lag}ms` : 'Unknown',
      ledgerSequence: null, // Not provided by Atlas API
      quorumSet: node.isValidator || false,
      validatorType: node.isFullValidator ? 'core' : 'watcher',
      // Additional Stellar-specific fields from Atlas API
      overlayVersion: node.overlayVersion,
      overlayMinVersion: node.overlayMinVersion,
      ledgerVersion: node.ledgerVersion,
      active: node.active,
      isValidating: node.isValidating,
      isFullValidator: node.isFullValidator,
      overLoaded: node.overLoaded,
      activeInScp: node.activeInScp,
      historyArchiveHasError: node.historyArchiveHasError,
      stellarCoreVersionBehind: node.stellarCoreVersionBehind,
      organizationId: node.organizationId,
      connectivityError: node.connectivityError,
      host: node.host,
      homeDomain: node.homeDomain,
      historyUrl: node.historyUrl,
      // Statistics
      statistics: node.statistics
    })).filter(validator => 
      // Only include validators with valid coordinates
      validator.location.lat && validator.location.lng && 
      !isNaN(validator.location.lat) && !isNaN(validator.location.lng) &&
      validator.location.lat !== 0 && validator.location.lng !== 0
    );
  }

  // Map Stellar Atlas API node status to our component status
  mapAtlasNodeStatus(node) {
    if (node.active && node.isValidating && !node.connectivityError) {
      return 'active';
    } else if (node.active && !node.isValidating && !node.connectivityError) {
      return 'syncing';
    } else if (!node.active || node.connectivityError) {
      return 'inactive';
    } else {
      return 'unknown';
    }
  }

  // Map API status values to our component status
  mapValidatorStatus(apiStatus) {
    const statusMap = {
      'active': 'active',
      'online': 'active',
      'running': 'active',
      'inactive': 'inactive',
      'offline': 'inactive',
      'stopped': 'inactive',
      'syncing': 'syncing',
      'catching_up': 'syncing',
      'starting': 'syncing'
    };
    
    return statusMap[apiStatus?.toLowerCase()] || 'unknown';
  }

  // Get ledger information from Horizon API
  async getLedgerInfo() {
    try {
      // Use backend proxy to avoid CORS issues
      const response = await fetch(`${getAPI_BASE_URL()}/stellar/ledger`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const ledger = data._embedded.records[0];
      
      // Transform to our expected format
      return {
        sequence: ledger.sequence,
        hash: ledger.hash,
        prev_hash: ledger.prev_hash,
        paging_token: ledger.paging_token,
        successful_transaction_count: ledger.successful_transaction_count,
        failed_transaction_count: ledger.failed_transaction_count,
        operation_count: ledger.operation_count,
        tx_set_operation_count: ledger.tx_set_operation_count,
        closed_at: ledger.closed_at,
        total_coins: ledger.total_coins,
        fee_pool: ledger.fee_pool,
        base_fee_in_stroops: ledger.base_fee_in_stroops,
        base_reserve_in_stroops: ledger.base_reserve_in_stroops,
        max_tx_set_size: ledger.max_tx_set_size,
        protocol_version: ledger.protocol_version,
        isMockData: false // Real data from Horizon API
      };
    } catch (error) {
      console.error('Error fetching ledger info:', error);
      return null;
    }
  }

  // Get network statistics - NO MOCK DATA
  async getNetworkStats() {
    try {
      const [networkInfo, ledgerInfo] = await Promise.all([
        this.getNetworkInformation(),
        this.getLedgerInfo()
      ]);

      return {
        networkInfo,
        ledgerInfo,
        timestamp: new Date().toISOString(),
        isMockData: false // Real data from APIs
      };
    } catch (error) {
      console.error('Error fetching network stats:', error);
      // NO MOCK DATA - throw error instead
      throw new Error(`Failed to fetch network stats: ${error.message}`);
    }
  }

  // Mock data for development (Stellar-specific with realistic coordinates)
  getMockValidators() {
    return [
      {
        id: 'stellar-core-nyc',
        name: 'Stellar Core NYC',
        publicKey: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        location: { lat: 40.7128, lng: -74.0060 },
        city: 'New York',
        country: 'USA',
        status: 'active',
        version: 'v20.2.0',
        uptime: '99.8%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '45ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-core-london',
        name: 'Stellar Core London',
        publicKey: 'GDEF4567890123456789ABCDEFGHIJKLMNOPQRSTUV',
        location: { lat: 51.5074, lng: -0.1278 },
        city: 'London',
        country: 'UK',
        status: 'active',
        version: 'v20.2.0',
        uptime: '99.5%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '52ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-core-tokyo',
        name: 'Stellar Core Tokyo',
        publicKey: 'GHIJ789012345678901234567890ABCDEFGHIJKLMN',
        location: { lat: 35.6762, lng: 139.6503 },
        city: 'Tokyo',
        country: 'Japan',
        status: 'active',
        version: 'v20.1.0',
        uptime: '98.9%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '38ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-watcher-sydney',
        name: 'Stellar Watcher Sydney',
        publicKey: 'GKLM0123456789012345678901234567890ABCDEFG',
        location: { lat: -33.8688, lng: 151.2093 },
        city: 'Sydney',
        country: 'Australia',
        status: 'syncing',
        version: 'v20.0.0',
        uptime: '95.2%',
        lastSeen: new Date(Date.now() - 300000).toISOString(),
        network: 'mainnet',
        latency: '120ms',
        ledgerSequence: 49999995,
        quorumSet: false,
        validatorType: 'watcher',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-core-paris',
        name: 'Stellar Core Paris',
        publicKey: 'GNOP34567890123456789012345678901234567890',
        location: { lat: 48.8566, lng: 2.3522 },
        city: 'Paris',
        country: 'France',
        status: 'active',
        version: 'v20.2.0',
        uptime: '99.1%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '41ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-core-singapore',
        name: 'Stellar Core Singapore',
        publicKey: 'GQRS6789012345678901234567890123456789012',
        location: { lat: 1.3521, lng: 103.8198 },
        city: 'Singapore',
        country: 'Singapore',
        status: 'active',
        version: 'v20.2.0',
        uptime: '99.3%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '35ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-core-frankfurt',
        name: 'Stellar Core Frankfurt',
        publicKey: 'GTUV9012345678901234567890123456789012345',
        location: { lat: 50.1109, lng: 8.6821 },
        city: 'Frankfurt',
        country: 'Germany',
        status: 'active',
        version: 'v20.2.0',
        uptime: '98.7%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '48ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-watcher-sao-paulo',
        name: 'Stellar Watcher São Paulo',
        publicKey: 'GWXY2345678901234567890123456789012345678',
        location: { lat: -23.5505, lng: -46.6333 },
        city: 'São Paulo',
        country: 'Brazil',
        status: 'inactive',
        version: 'v19.5.0',
        uptime: '92.1%',
        lastSeen: new Date(Date.now() - 600000).toISOString(),
        network: 'mainnet',
        latency: '180ms',
        ledgerSequence: 49999990,
        quorumSet: false,
        validatorType: 'watcher',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 19
      },
      {
        id: 'stellar-core-mumbai',
        name: 'Stellar Core Mumbai',
        publicKey: 'GZAB5678901234567890123456789012345678901',
        location: { lat: 19.0760, lng: 72.8777 },
        city: 'Mumbai',
        country: 'India',
        status: 'active',
        version: 'v20.2.0',
        uptime: '97.8%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '65ms',
        ledgerSequence: 50000000,
        quorumSet: true,
        validatorType: 'core',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      },
      {
        id: 'stellar-watcher-toronto',
        name: 'Stellar Watcher Toronto',
        publicKey: 'GCDE8901234567890123456789012345678901234',
        location: { lat: 43.6532, lng: -79.3832 },
        city: 'Toronto',
        country: 'Canada',
        status: 'active',
        version: 'v20.1.0',
        uptime: '96.5%',
        lastSeen: new Date().toISOString(),
        network: 'mainnet',
        latency: '55ms',
        ledgerSequence: 50000000,
        quorumSet: false,
        validatorType: 'watcher',
        baseFee: 100,
        baseReserve: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20
      }
    ];
  }

  getMockNetworkInfo() {
    return {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
      baseFee: 100,
      baseReserve: 5000000,
      maxTxSetSize: 1000,
      protocolVersion: 20,
      currentLedger: 50000000,
      networkId: 'mainnet'
    };
  }

  getMockNetworkStats() {
    // Generate a more realistic ledger sequence (current is around 50M+)
    const baseLedgerSequence = 50000000;
    const randomOffset = Math.floor(Math.random() * 1000); // Add some randomness
    const currentLedgerSequence = baseLedgerSequence + randomOffset;
    
    return {
      networkInfo: {
        ...this.getMockNetworkInfo(),
        isMockData: true // Flag to indicate this is mock data
      },
      ledgerInfo: {
        sequence: currentLedgerSequence,
        hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        prev_hash: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        paging_token: currentLedgerSequence.toString(),
        successful_transaction_count: Math.floor(Math.random() * 100) + 20,
        failed_transaction_count: Math.floor(Math.random() * 10) + 1,
        operation_count: Math.floor(Math.random() * 200) + 50,
        tx_set_operation_count: Math.floor(Math.random() * 200) + 50,
        closed_at: new Date().toISOString(),
        total_coins: '100000000000.0000000',
        fee_pool: '1000.0000000',
        base_fee_in_stroops: 100,
        base_reserve_in_stroops: 5000000,
        max_tx_set_size: 1000,
        protocol_version: 20,
        isMockData: true // Flag to indicate this is mock data
      },
      timestamp: new Date().toISOString(),
      isMockData: true // Flag to indicate this is mock data
    };
  }

  // Cache management
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Get validators with caching - NO MOCK DATA
  async getValidatorsCached() {
    const cacheKey = 'validators';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    // Prevent concurrent fetches
    if (this.isFetching) {
      // Wait for current fetch to complete
      while (this.isFetching) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Return cached data after fetch completes
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      // NO MOCK DATA - throw error if no cached data
      throw new Error('No cached data available and fetch failed');
    }

    this.isFetching = true;
    try {
      const data = await this.getStellarValidators();
      this.setCachedData(cacheKey, data);
      return data;
    } finally {
      this.isFetching = false;
    }
  }

  // Get network stats with caching - NO MOCK DATA
  async getNetworkStatsCached() {
    const cacheKey = 'networkStats';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    // Prevent concurrent fetches
    if (this.isFetching) {
      // Wait for current fetch to complete
      while (this.isFetching) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Return cached data after fetch completes
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      // NO MOCK DATA - throw error if no cached data
      throw new Error('No cached network stats available and fetch failed');
    }

    this.isFetching = true;
    try {
      const data = await this.getNetworkStats();
      this.setCachedData(cacheKey, data);
      return data;
    } finally {
      this.isFetching = false;
    }
  }
}

// Create singleton instance
const stellarNetworkService = new StellarNetworkService();

export default stellarNetworkService;
