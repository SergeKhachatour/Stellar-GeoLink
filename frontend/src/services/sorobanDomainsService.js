/**
 * Soroban Domains Service
 * Provides domain resolution capabilities using the Soroban Domains Query API
 * Based on: https://github.com/lightsail-network/sorobandomains-query
 */

const SOROBAN_DOMAINS_API_BASE = 'https://sorobandomains-query.lightsail.network';

class SorobanDomainsService {
  /**
   * Query address by domain name
   * @param {string} domain - The domain name (e.g., 'overcat.xlm')
   * @returns {Promise<string|null>} The resolved address or null if not found
   */
  static async resolveDomain(domain) {
    try {
      const response = await fetch(`${SOROBAN_DOMAINS_API_BASE}/query?q=${encodeURIComponent(domain)}&type=domain`);
      
      if (!response.ok) {
        console.warn(`Failed to resolve domain ${domain}:`, response.status);
        return null;
      }
      
      const data = await response.json();
      return data.address || null;
    } catch (error) {
      console.error('Error resolving domain:', error);
      return null;
    }
  }

  /**
   * Query domain name by address
   * @param {string} address - The Stellar address
   * @returns {Promise<string|null>} The resolved domain or null if not found
   */
  static async resolveAddress(address) {
    try {
      const response = await fetch(`${SOROBAN_DOMAINS_API_BASE}/query?q=${encodeURIComponent(address)}&type=address`);
      
      if (!response.ok) {
        console.warn(`Failed to resolve address ${address}:`, response.status);
        return null;
      }
      
      const data = await response.json();
      return data.domain || null;
    } catch (error) {
      console.error('Error resolving address:', error);
      return null;
    }
  }

  /**
   * Check if a string looks like a domain (contains a dot)
   * @param {string} input - The input string to check
   * @returns {boolean} True if it looks like a domain
   */
  static isDomain(input) {
    return typeof input === 'string' && input.includes('.') && !input.startsWith('G') && !input.startsWith('S');
  }

  /**
   * Check if a string looks like a Stellar address
   * @param {string} input - The input string to check
   * @returns {boolean} True if it looks like a Stellar address
   */
  static isStellarAddress(input) {
    return typeof input === 'string' && (input.startsWith('G') || input.startsWith('S')) && input.length === 56;
  }

  /**
   * Resolve input to address (handles both domains and addresses)
   * @param {string} input - Domain or address
   * @returns {Promise<string|null>} The resolved address
   */
  static async resolveToAddress(input) {
    if (!input) return null;
    
    // If it's already a Stellar address, return it
    if (this.isStellarAddress(input)) {
      return input;
    }
    
    // If it looks like a domain, resolve it
    if (this.isDomain(input)) {
      return await this.resolveDomain(input);
    }
    
    return null;
  }

  /**
   * Resolve input to domain (handles both domains and addresses)
   * @param {string} input - Domain or address
   * @returns {Promise<string|null>} The resolved domain
   */
  static async resolveToDomain(input) {
    if (!input) return null;
    
    // If it's already a domain, return it
    if (this.isDomain(input)) {
      return input;
    }
    
    // If it's a Stellar address, resolve it
    if (this.isStellarAddress(input)) {
      return await this.resolveAddress(input);
    }
    
    return null;
  }
}

export default SorobanDomainsService;
