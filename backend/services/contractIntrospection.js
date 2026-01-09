/**
 * Contract Introspection Service
 * 
 * Discovers and analyzes Soroban smart contract functions
 * Supports dynamic contract function discovery and parameter mapping
 */

const StellarSdk = require('@stellar/stellar-sdk');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const pool = require('../config/database');
const childProcess = require('child_process');
const util = require('util');
const execPromise = util.promisify(childProcess.exec);
const os = require('os');

class ContractIntrospection {
  constructor() {
    this.sorobanServer = null;
    this.networkPassphrase = null;
    this.initialize();
  }

  initialize() {
    // Get network configuration
    const networkEnv = (process.env.STELLAR_NETWORK || 'testnet').toUpperCase();
    this.networkPassphrase = StellarSdk.Networks[networkEnv] || StellarSdk.Networks.TESTNET;
    
    // Initialize Soroban RPC server
    // Use the same pattern as webauthn.js and smartWallet.js: StellarSdk.rpc.Server
    try {
      // Get RPC URL from config or environment
      const contracts = require('../config/contracts');
      const rpcUrl = process.env.SOROBAN_RPC_URL || contracts.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      
      // In @stellar/stellar-sdk v14+, SorobanRpc is accessed as StellarSdk.rpc.Server
      if (StellarSdk.rpc && StellarSdk.rpc.Server) {
        this.sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
        console.log('[ContractIntrospection] ✅ SorobanRpc initialized via StellarSdk.rpc.Server');
        console.log(`[ContractIntrospection]    RPC URL: ${rpcUrl}`);
      } 
      // Fallback: Try StellarSdk.SorobanRpc (for older SDK versions)
      else if (StellarSdk.SorobanRpc && StellarSdk.SorobanRpc.Server) {
        this.sorobanServer = new StellarSdk.SorobanRpc.Server(rpcUrl, { allowHttp: true });
        console.log('[ContractIntrospection] ✅ SorobanRpc initialized via StellarSdk.SorobanRpc.Server');
        console.log(`[ContractIntrospection]    RPC URL: ${rpcUrl}`);
      } 
      else {
        console.warn('[ContractIntrospection] ⚠️  SorobanRpc not available');
        console.warn('[ContractIntrospection]    Tried: StellarSdk.rpc.Server and StellarSdk.SorobanRpc.Server');
        const availableKeys = Object.keys(StellarSdk).filter(k => 
          k.toLowerCase().includes('rpc') || k.toLowerCase().includes('soroban')
        );
        if (availableKeys.length > 0) {
          console.warn('[ContractIntrospection]    Available keys:', availableKeys.join(', '));
        }
        console.warn('[ContractIntrospection]    Contract discovery will use fallback methods');
      }
    } catch (error) {
      console.error('[ContractIntrospection] ❌ Failed to initialize SorobanRpc:', error.message);
      console.error('[ContractIntrospection]    Error details:', error.stack);
      console.warn('[ContractIntrospection]    Contract discovery will use fallback methods');
    }
  }

  /**
   * Verify that a contract exists on the network
   * @param {string} contractAddress - Contract address to verify
   * @param {string} network - Network (testnet/mainnet)
   * @returns {Promise<{exists: boolean, error?: string}>}
   */
  async verifyContractExists(contractAddress, network = 'testnet') {
    if (!this.sorobanServer) {
      return { exists: false, error: 'SorobanRpc not available' };
    }

    try {
      console.log(`[ContractIntrospection] 🔍 Verifying contract exists on ${network}: ${contractAddress}`);
      
      const contractId = StellarSdk.Address.fromString(contractAddress);
      
      // Try to get contract code - if it exists, the contract is deployed
      // We'll use getLedgerEntries to check for contract data
      const contractKey = StellarSdk.xdr.LedgerKey.contractCode(
        new StellarSdk.xdr.LedgerKeyContractCode({
          hash: contractId.toScAddress()
        })
      );

      try {
        const entries = await this.sorobanServer.getLedgerEntries(contractKey);
        if (entries && entries.entries && entries.entries.length > 0) {
          console.log(`[ContractIntrospection] ✅ Contract verified on ${network}`);
          return { exists: true };
        }
      } catch (err) {
        // Contract code entry might not exist, try checking contract data instead
        // Any contract should have at least one data entry
        try {
          const contractDataKey = StellarSdk.xdr.LedgerKey.contractData(
            new StellarSdk.xdr.LedgerKeyContractData({
              contract: contractId.toScAddress(),
              key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
              durability: StellarSdk.xdr.ContractDataDurability.persistent()
            })
          );
          const dataEntries = await this.sorobanServer.getLedgerEntries(contractDataKey);
          if (dataEntries && dataEntries.entries && dataEntries.entries.length > 0) {
            console.log(`[ContractIntrospection] ✅ Contract verified on ${network} (via contract data)`);
            return { exists: true };
          }
        } catch (dataErr) {
          // Contract doesn't exist
          console.log(`[ContractIntrospection] ❌ Contract not found on ${network}: ${dataErr.message}`);
          return { exists: false, error: `Contract not found on ${network}` };
        }
      }

      return { exists: false, error: `Contract not found on ${network}` };
    } catch (error) {
      console.error(`[ContractIntrospection] ❌ Error verifying contract: ${error.message}`);
      return { exists: false, error: error.message };
    }
  }

  /**
   * Fetch contract WASM code from the network and calculate its hash
   * @param {string} contractAddress - Contract address
   * @param {string} network - Network (testnet/mainnet)
   * @returns {Promise<{hash: string, size: number, error?: string}>}
   */
  async getContractWasmHash(contractAddress, network = 'testnet') {
    if (!this.sorobanServer) {
      return { hash: null, size: 0, error: 'SorobanRpc not available' };
    }

    try {
      console.log(`[ContractIntrospection] 📥 Fetching contract WASM from ${network}...`);
      
      const contractId = StellarSdk.Address.fromString(contractAddress);
      
      // Get contract code from ledger
      const contractKey = StellarSdk.xdr.LedgerKey.contractCode(
        new StellarSdk.xdr.LedgerKeyContractCode({
          hash: contractId.toScAddress()
        })
      );

      const entries = await this.sorobanServer.getLedgerEntries(contractKey);
      
      if (!entries || !entries.entries || entries.entries.length === 0) {
        return { hash: null, size: 0, error: 'Contract code not found on network' };
      }

      const entry = entries.entries[0];
      if (!entry.val || !entry.val.contractCode) {
        return { hash: null, size: 0, error: 'Invalid contract code entry' };
      }

      // Extract WASM code
      const wasmCode = entry.val.contractCode.code();
      if (!wasmCode || wasmCode.length === 0) {
        return { hash: null, size: 0, error: 'Empty contract code' };
      }

      // Calculate hash
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(wasmCode).digest('hex');
      
      console.log(`[ContractIntrospection] ✅ Contract WASM hash: ${hash.substring(0, 16)}... (${wasmCode.length} bytes)`);
      
      return { hash, size: wasmCode.length };
    } catch (error) {
      console.error(`[ContractIntrospection] ❌ Error fetching contract WASM: ${error.message}`);
      return { hash: null, size: 0, error: error.message };
    }
  }

  /**
   * Discover functions in a contract
   * Tries common function names and uses simulation to infer signatures
   */
  async discoverFunctions(contractAddress, network = 'testnet') {
    // If SorobanRpc is not available, return a template for manual configuration
    if (!this.sorobanServer) {
      console.log(`[ContractIntrospection] SorobanRpc not available - returning template for manual configuration`);
      return [{
        name: 'mint',
        parameters: [],
        discovered: false,
        note: 'SorobanRpc not available. Please configure function parameters manually or ensure SorobanRpc is properly initialized.'
      }];
    }

    console.log(`[ContractIntrospection] Discovering functions for contract: ${contractAddress}`);

    // First, verify contract exists on the network
    const verification = await this.verifyContractExists(contractAddress, network);
    if (!verification.exists) {
      console.log(`[ContractIntrospection] ⚠️  Contract verification failed: ${verification.error}`);
      return [{
        name: 'mint',
        parameters: [],
        discovered: false,
        note: `Contract not found on ${network}. ${verification.error || 'Please verify the contract address and network.'}`
      }];
    }
    
    // ONLY use WASM parsing - no pattern matching, no simulation fallback
    console.log(`[ContractIntrospection] 🔍 Attempting to extract functions from contract spec (WASM metadata)`);
    try {
      const specFunctions = await this.extractFunctionsFromContractSpec(contractAddress);
      if (specFunctions && specFunctions.length > 0) {
        console.log(`[ContractIntrospection] ✅ Successfully extracted ${specFunctions.length} functions from contract spec!`);
        return specFunctions;
      } else {
        console.log(`[ContractIntrospection] ⚠️  No functions found in contract spec. Please upload WASM file via /api/contracts/upload-wasm`);
        return [{
          name: 'mint',
          parameters: [],
          discovered: false,
          note: 'No WASM file found for this contract. Please upload WASM file to enable function discovery.'
        }];
      }
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Could not extract from contract spec: ${error.message}`);
      return [{
        name: 'mint',
        parameters: [],
        discovered: false,
        note: `Failed to extract contract spec: ${error.message}. Please upload WASM file via /api/contracts/upload-wasm`
      }];
    }
  }

  /**
   * Extract functions from contract spec (embedded in WASM)
   * This is the ONLY method - per Stella's guidance, contract spec is embedded in WASM
   */
  async extractFunctionsFromContractSpec(contractAddress) {
    try {
      const contractId = StellarSdk.Address.fromString(contractAddress);
      
      // Try to read various contract data entries that might contain function info
      const metadataKeys = [
        StellarSdk.xdr.ScVal.scvString('interface'),
        StellarSdk.xdr.ScVal.scvString('functions'),
        StellarSdk.xdr.ScVal.scvString('metadata'),
        StellarSdk.xdr.ScVal.scvString('abi')
      ];
      
      for (const key of metadataKeys) {
        try {
          const contractKey = StellarSdk.xdr.LedgerKey.contractData(
            new StellarSdk.xdr.LedgerKeyContractData({
              contract: contractId.toScAddress(),
              key: key,
              durability: StellarSdk.xdr.ContractDataDurability.persistent()
            })
          );
          
          const entries = await this.sorobanServer.getLedgerEntries(contractKey);
          if (entries && entries.entries && entries.entries.length > 0) {
            console.log(`[ContractIntrospection] ✅ Found contract metadata entry`);
            // Could parse metadata here if it contains function info
          }
        } catch (err) {
          // Metadata entry doesn't exist - continue
        }
      }
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Could not read contract metadata:`, error.message);
    }
    
    // Step 2: Try to extract function names from contract data entries
    // Some contracts store function metadata or we can infer from data structure
    let inferredFunctionNames = new Set();
    try {
      const contractId = StellarSdk.Address.fromString(contractAddress);
      
      // Try to read contract data entries and infer function names
      // We'll look for common data patterns that might indicate function names
      const dataPatterns = await this.extractFunctionNamesFromContractData(contractId);
      dataPatterns.forEach(name => inferredFunctionNames.add(name));
      
      if (inferredFunctionNames.size > 0) {
        console.log(`[ContractIntrospection] ✅ Inferred ${inferredFunctionNames.size} potential function names from contract data`);
      }
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Could not extract function names from contract data:`, error.message);
    }
    
    // Step 3: Generate function name patterns dynamically based on common Rust/Soroban patterns
    // This creates potential function names without hardcoding specific names
    const generatedPatterns = this.generateFunctionNamePatterns();
    generatedPatterns.forEach(name => inferredFunctionNames.add(name));
    
    const functionNamePatterns = Array.from(inferredFunctionNames);
    console.log(`[ContractIntrospection] 📋 Total ${functionNamePatterns.length} function name patterns to test (${inferredFunctionNames.size - generatedPatterns.length} from contract data, ${generatedPatterns.length} generated)`);
    
    // Try to get contract instance data using getLedgerEntries
    try {
      const contractId = StellarSdk.Address.fromString(contractAddress);
      const contractKey = StellarSdk.xdr.LedgerKey.contractData(
        new StellarSdk.xdr.LedgerKeyContractData({
          contract: contractId.toScAddress(),
          key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: StellarSdk.xdr.ContractDataDurability.persistent()
        })
      );
      
      const entries = await this.sorobanServer.getLedgerEntries(contractKey);
      if (entries && entries.entries && entries.entries.length > 0) {
        console.log('[ContractIntrospection] ✅ Contract instance data found');
        // Contract exists and is accessible
      }
    } catch (error) {
      console.log('[ContractIntrospection] ⚠️  Could not read contract instance data:', error.message);
    }

    // Step 3: Test function name patterns dynamically
    console.log(`[ContractIntrospection] 🧪 Testing ${functionNamePatterns.length} function name patterns...`);
    for (const functionName of functionNamePatterns) {
      try {
        console.log(`[ContractIntrospection] Testing function: ${functionName}`);
        const functionInfo = await this.testFunction(contractAddress, functionName);
        if (functionInfo) {
          discoveredFunctions.push(functionInfo);
          console.log(`[ContractIntrospection] ✅ Discovered function: ${functionName}`, JSON.stringify(functionInfo, null, 2));
        } else {
          console.log(`[ContractIntrospection] ⚠️  Function ${functionName} returned null (doesn't exist or incompatible)`);
        }
      } catch (error) {
        // Function doesn't exist or has different signature - continue
        console.log(`[ContractIntrospection] ⚠️  Function ${functionName} error:`, error.message);
      }
    }

    // If no functions discovered, return a basic structure for manual entry
    if (discoveredFunctions.length === 0) {
      console.log('[ContractIntrospection] ⚠️  No common functions discovered, returning template');
      return [{
        name: 'mint',
        parameters: [],
        discovered: false,
        note: 'Function not auto-discovered. Please configure manually.'
      }];
    }

    return discoveredFunctions;
  }

  /**
   * Extract functions from contract spec (embedded in WASM)
   * This is the ONLY method - per Stella's guidance, contract spec is embedded in WASM
   */
  async extractFunctionsFromContractSpec(contractAddress) {
    try {
      console.log(`[ContractIntrospection] 📥 Attempting to extract functions from contract spec (WASM)...`);
      
      // Step 1: Check if WASM file is available in database (uploaded by user)
      const wasmResult = await pool.query(
        `SELECT wasm_file_path, wasm_file_name 
         FROM custom_contracts 
         WHERE contract_address = $1 AND wasm_file_path IS NOT NULL 
         LIMIT 1`,
        [contractAddress]
      );
      
      let wasmPath = null;
      if (wasmResult.rows.length > 0) {
        wasmPath = wasmResult.rows[0].wasm_file_path;
        console.log(`[ContractIntrospection] ✅ Found uploaded WASM file: ${wasmResult.rows[0].wasm_file_name}`);
      } else {
        console.log(`[ContractIntrospection] ⚠️  No uploaded WASM found for contract ${contractAddress}`);
        console.log(`[ContractIntrospection] 💡 Tip: Upload WASM file via /api/contracts/upload-wasm to enable spec-based discovery`);
        return null;
      }
      
      // Step 2: Parse WASM to extract contract spec
      if (wasmPath) {
        try {
          // Check if file exists
          await fs.access(wasmPath);
          
          // Read WASM file
          const wasmBuffer = await fs.readFile(wasmPath);
          console.log(`[ContractIntrospection] 📖 Reading WASM file (${wasmBuffer.length} bytes)...`);
          
          // Parse WASM to extract contract spec
          const functions = await this.parseWasmContractSpec(wasmBuffer, wasmPath);
          
          if (functions && functions.length > 0) {
            console.log(`[ContractIntrospection] ✅ Successfully extracted ${functions.length} functions from contract spec!`);
            return functions;
          } else {
            console.log(`[ContractIntrospection] ⚠️  Could not parse contract spec from WASM (may not have spec section)`);
            return null;
          }
        } catch (error) {
          console.log(`[ContractIntrospection] ⚠️  Error reading/parsing WASM file: ${error.message}`);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Error extracting from contract spec: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse WASM binary to extract contract spec
   * The contract spec is embedded as a custom section in the WASM binary
   */
  async parseWasmContractSpec(wasmBuffer, wasmPath) {
    try {
      console.log(`[ContractIntrospection] 🔧 Parsing WASM binary for contract spec...`);
      
      // Try to use Soroban CLI first (most reliable method per Stella's guidance)
      const cliFunctions = await this.parseContractSpecViaCLI(wasmPath);
      if (cliFunctions && cliFunctions.length > 0) {
        return cliFunctions;
      }
      
      // If CLI not available, try manual parsing
      // Check WASM magic number (0x6D736100 = "asm\0")
      if (wasmBuffer.length < 8) {
        console.log(`[ContractIntrospection] ⚠️  WASM file too small`);
        return null;
      }
      
      const magic = wasmBuffer.readUInt32LE(0);
      if (magic !== 0x6D736100) {
        console.log(`[ContractIntrospection] ⚠️  Invalid WASM file format (magic: 0x${magic.toString(16)})`);
        return null;
      }
      
      console.log(`[ContractIntrospection] ✅ Valid WASM file format`);
      console.log(`[ContractIntrospection] ⚠️  Manual WASM parsing not fully implemented - Soroban CLI recommended`);
      console.log(`[ContractIntrospection] 💡 Install Soroban CLI: https://soroban.stellar.org/docs/getting-started/soroban-cli`);
      
      return null;
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Error parsing WASM: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse contract spec using Soroban CLI (recommended method per Stella's guidance)
   */
  async parseContractSpecViaCLI(wasmPath) {
    try {
      console.log(`[ContractIntrospection] 🔧 Attempting to parse contract spec via Soroban CLI...`);
      
      // Determine Soroban CLI path (check custom install location first, then PATH)
      let sorobanCmd = 'soroban';
      const isAzure = process.env.WEBSITE_SITE_NAME || process.env.AZURE_WEBSITE_INSTANCE_ID;
      if (isAzure) {
        // On Azure, check custom installation path
        const customPath = '/home/soroban/soroban';
        try {
          await fs.access(customPath);
          sorobanCmd = customPath;
          console.log(`[ContractIntrospection] ✅ Found Soroban CLI at custom path: ${sorobanCmd}`);
        } catch {
          // Not found at custom path, try PATH (which might have been set by app.js)
          console.log(`[ContractIntrospection] ℹ️  Soroban CLI not found at ${customPath}, trying PATH...`);
          // Ensure PATH includes custom location
          if (!process.env.PATH.includes('/home/soroban')) {
            process.env.PATH = `/home/soroban:${process.env.PATH}`;
            console.log(`[ContractIntrospection] 🔧 Added /home/soroban to PATH`);
          }
        }
      }
      
      // Try to run: soroban contract inspect --wasm <file>
      // Use full path if custom, otherwise rely on PATH
      const command = sorobanCmd.includes('/') ? `"${sorobanCmd}"` : `soroban`;
      
      // Ensure PATH includes /home/soroban if on Azure
      let envPath = process.env.PATH || '';
      if (isAzure && !envPath.includes('/home/soroban')) {
        envPath = `/home/soroban:${envPath}`;
        console.log(`[ContractIntrospection] 🔧 Updated PATH to include /home/soroban`);
      }
      
      console.log(`[ContractIntrospection] 🔧 Executing: ${command} contract inspect --wasm "${wasmPath}"`);
      console.log(`[ContractIntrospection] 🔧 PATH: ${envPath.substring(0, 100)}...`);
      
      const { stdout, stderr } = await execPromise(`${command} contract inspect --wasm "${wasmPath}"`, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, PATH: envPath } // Ensure PATH includes custom location
      });
      
      // Parse the output (usually JSON or structured text)
      if (stdout) {
        try {
          // Try to parse as JSON first
          const spec = JSON.parse(stdout);
          const functions = this.extractFunctionsFromSpec(spec);
          if (functions.length > 0) {
            console.log(`[ContractIntrospection] ✅ Extracted ${functions.length} functions from contract spec via CLI`);
            return functions;
          }
        } catch (parseError) {
          // Not JSON, try to parse text output
          console.log(`[ContractIntrospection] ⚠️  CLI output is not JSON, trying text parsing...`);
          console.log(`[ContractIntrospection] 📄 CLI output (first 500 chars):`, stdout.substring(0, 500));
          const textFunctions = this.parseContractSpecFromText(stdout);
          if (textFunctions && textFunctions.length > 0) {
            console.log(`[ContractIntrospection] ✅ Extracted ${textFunctions.length} functions from text output`);
            return textFunctions;
          } else {
            console.log(`[ContractIntrospection] ⚠️  Text parsing found 0 functions.`);
            console.log(`[ContractIntrospection] 📄 Full CLI output (${stdout.length} chars):\n${stdout}`);
            console.log(`[ContractIntrospection] 📄 CLI output lines: ${stdout.split('\n').length}`);
          }
        }
      }
      
      return null;
    } catch (error) {
      // CLI not available or failed
      if (error.code === 'ENOENT') {
        console.log(`[ContractIntrospection] ⚠️  Soroban CLI not found in PATH`);
        console.log(`[ContractIntrospection] 💡 Install Soroban CLI: https://soroban.stellar.org/docs/getting-started/soroban-cli`);
      } else {
        console.log(`[ContractIntrospection] ⚠️  Soroban CLI error: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Extract functions from parsed contract spec structure
   */
  extractFunctionsFromSpec(spec) {
    const functions = [];
    
    // Handle different spec formats
    if (spec.functions && Array.isArray(spec.functions)) {
      for (const func of spec.functions) {
        const params = (func.params || func.parameters || []).map(p => ({
          name: p.name || p.param || 'unknown',
          type: p.type || 'unknown',
          mapped_from: this.inferParameterMapping(p.name || p.param || '', p.type || '')
        }));
        
        functions.push({
          name: func.name || func.function || 'unknown',
          parameters: params,
          return_type: func.return || func.return_type || 'void',
          discovered: true,
          note: 'Extracted from contract spec'
        });
      }
    } else if (spec.entries && Array.isArray(spec.entries)) {
      // Alternative format
      for (const entry of spec.entries) {
        if (entry.type === 'Function' || entry.kind === 'function') {
          const params = (entry.params || entry.parameters || []).map(p => ({
            name: p.name || p.param || 'unknown',
            type: p.type || 'unknown',
            mapped_from: this.inferParameterMapping(p.name || p.param || '', p.type || '')
          }));
          
          functions.push({
            name: entry.name || 'unknown',
            parameters: params,
            return_type: entry.return || entry.return_type || 'void',
            discovered: true,
            note: 'Extracted from contract spec'
          });
        }
      }
    }
    
    return functions;
  }

  /**
   * Parse contract spec from text output (Soroban CLI text format)
   * Soroban CLI output format:
   *   Types:
   *     TypeName
   *   Functions:
   *     function_name
   *       Args:
   *         arg_name: type
   *       Returns: return_type
   */
  parseContractSpecFromText(text) {
    const functions = [];
    
    if (!text || typeof text !== 'string') {
      return functions;
    }

    try {
      const lines = text.split('\n');
      let currentFunction = null;
      let inFunctionsSection = false;
      let inTypesSection = false;
      let inArgs = false;
      let inReturns = false;
      
      // Common Rust type names to skip (these are types, not functions)
      const rustTypes = new Set([
        'string', 'stringm', 'option', 'vec', 'map', 'set', 'result', 'tuple',
        'i32', 'i64', 'u32', 'u64', 'i128', 'u128', 'bool', 'bytes', 'bytesn',
        'address', 'symbol', 'account', 'contract', 'scval', 'scmap', 'scvec',
        'void', 'unit', 'none', 'some', 'ok', 'err'
      ]);
      
      // Parse Soroban CLI format: " • Function: function_name" followed by Inputs/Output sections
      console.log(`[ContractIntrospection] 📋 Total lines in CLI output: ${lines.length}`);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const originalLine = lines[i];
        
        // Skip empty lines
        if (!line) continue;
        
        // Match function declaration: " • Function: function_name" or " * Function: function_name"
        // Simple pattern: just look for "Function:" followed by function name
        let functionName = null;
        if (line.includes('Function:')) {
          const functionMatch = line.match(/Function:\s*([a-z_][a-z0-9_]*)/i);
          if (functionMatch) {
            functionName = functionMatch[1];
          }
        }
        
        if (functionName) {
          // Save previous function if exists
          if (currentFunction) {
            functions.push(currentFunction);
          }
          
          console.log(`[ContractIntrospection] 📋 Found function: ${functionName}`);
          
          currentFunction = {
            name: functionName,
            parameters: [],
            return_type: 'void',
            discovered: true,
            note: 'Extracted from contract spec'
          };
          inArgs = false;
          inReturns = false;
          continue;
        }
        
        // Match Inputs section: "     Inputs: VecM(" or "     Inputs:"
        // Check both trimmed and original line since Inputs might be indented
        if (currentFunction && (line.match(/Inputs?:/i) || originalLine.match(/^\s+Inputs?:/i))) {
          inArgs = true;
          inReturns = false;
          console.log(`[ContractIntrospection] 📋 Entered Inputs section for function: ${currentFunction.name} at line ${i}`);
          console.log(`[ContractIntrospection] 📋 Inputs line (trimmed): ${line.substring(0, 100)}`);
          console.log(`[ContractIntrospection] 📋 Inputs line (original): ${originalLine.substring(0, 100)}`);
          continue;
        }
        
        // Match Output section: "     Output: VecM("
        if (currentFunction && line.match(/^\s+Outputs?:/i)) {
          inArgs = false;
          inReturns = true;
          continue;
        }
        
        // Parse parameter from Inputs section
        // Format: "                 ScSpecFunctionInputV0 { name: StringM(param_name), type_: Type }"
        // Check both trimmed and original line since ScSpecFunctionInputV0 might be indented
        // Also check if we're in Args section even if Inputs wasn't explicitly detected
        if (currentFunction && (line.match(/ScSpecFunctionInputV0/) || originalLine.match(/ScSpecFunctionInputV0/))) {
          // If we're not in Args section but found ScSpecFunctionInputV0, we're probably in the Inputs section
          if (!inArgs) {
            inArgs = true;
            inReturns = false;
            console.log(`[ContractIntrospection] 📋 Auto-entered Inputs section (found ScSpecFunctionInputV0) for function: ${currentFunction.name} at line ${i}`);
          }
          console.log(`[ContractIntrospection] 📋 Found ScSpecFunctionInputV0 at line ${i} for function: ${currentFunction.name}`);
          console.log(`[ContractIntrospection] 📋 Line content (trimmed): ${line.substring(0, 100)}`);
          console.log(`[ContractIntrospection] 📋 Line content (original): ${originalLine.substring(0, 100)}`);
          // This is the start of a parameter definition
          // The name and type will be on following lines
          let paramName = null;
          let paramType = null;
          
          // Look ahead for name and type (within next 20 lines to be safe)
          for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            const lookAheadLine = lines[j].trim();
            
            // Skip empty lines but log first few for debugging
            if (!lookAheadLine) {
              if (j <= i + 5) {
                console.log(`[ContractIntrospection] 📋 Line ${j} is empty`);
              }
              continue;
            }
            
            // Debug: log first few lines we're checking
            if (j <= i + 5) {
              console.log(`[ContractIntrospection] 📋 Checking line ${j}: ${lookAheadLine.substring(0, 80)}`);
            }
            
            // Extract name: "name: StringM(param_name),"
            const nameMatch = lookAheadLine.match(/name:\s*StringM\(([^)]+)\)/i);
            if (nameMatch && !paramName) {
              paramName = nameMatch[1].trim();
              console.log(`[ContractIntrospection] 📋 Found parameter name: ${paramName} at line ${j}`);
            }
            
            // Extract type: "type_: Address," or "type_: Bytes," or "type_: I128,"
            const typeMatch = lookAheadLine.match(/type_:\s*([A-Za-z0-9_]+)/i);
            if (typeMatch && !paramType) {
              paramType = typeMatch[1].trim();
              console.log(`[ContractIntrospection] 📋 Found parameter type: ${paramType} at line ${j}`);
            }
            
            // If we found both, we can break
            if (paramName && paramType) {
              break;
            }
            
            // If we hit the closing brace of this ScSpecFunctionInputV0 block, check if we have what we need
            if (lookAheadLine.match(/^\},?$/)) {
              // If we have at least the name, we can try to infer the type or use 'unknown'
              if (paramName && !paramType) {
                paramType = 'unknown';
                console.log(`[ContractIntrospection] ⚠️  Parameter ${paramName} has no type, using 'unknown'`);
              }
              break;
            }
            
            // If we hit the next ScSpecFunctionInputV0, we've gone too far
            if (j > i + 1 && lookAheadLine.match(/ScSpecFunctionInputV0/)) {
              break;
            }
          }
          
          if (paramName && paramType) {
            currentFunction.parameters.push({
              name: paramName,
              type: paramType,
              mapped_from: this.inferParameterMapping(paramName, paramType)
            });
            console.log(`[ContractIntrospection] 📋 Added parameter: ${paramName}: ${paramType}`);
          } else if (paramName) {
            // At least add the parameter with unknown type
            currentFunction.parameters.push({
              name: paramName,
              type: 'unknown',
              mapped_from: this.inferParameterMapping(paramName, 'unknown')
            });
            console.log(`[ContractIntrospection] 📋 Added parameter (type unknown): ${paramName}`);
          } else {
            console.log(`[ContractIntrospection] ⚠️  Could not parse parameter from ScSpecFunctionInputV0 block starting at line ${i}`);
          }
        }
        
        // Parse return type from Output section
        // Format: "                 Bool," or "                 Address," or "                 I128,"
        if (inReturns && currentFunction && line.match(/^\s+[A-Z][a-zA-Z0-9_]+/)) {
          const returnTypeMatch = line.match(/^\s+([A-Z][a-zA-Z0-9_]+)/);
          if (returnTypeMatch && currentFunction.return_type === 'void') {
            let returnType = returnTypeMatch[1].trim();
            // Remove trailing comma
            returnType = returnType.replace(/,\s*$/, '');
            currentFunction.return_type = returnType;
            console.log(`[ContractIntrospection] 📋 Set return type: ${currentFunction.return_type}`);
          }
        }
      }
      
      // Don't forget the last function
      if (currentFunction) {
        functions.push(currentFunction);
      }
      
      // Fallback: If any function has no parameters but we found ScSpecFunctionInputV0 blocks,
      // try to extract parameters from the raw text more aggressively
      // This handles cases where the Inputs section wasn't detected
      if (functions.length > 0) {
        console.log(`[ContractIntrospection] 📋 Running fallback parameter extraction for ${functions.length} functions`);
        // Re-scan the text looking for parameter patterns near function names
        for (const func of functions) {
          if (!func.parameters || func.parameters.length === 0) {
            // Find the function in the text and look for parameters after it
            const funcIndex = text.indexOf(`Function: ${func.name}`);
            if (funcIndex !== -1) {
              // Get the section after this function (up to next function or 500 chars)
              const nextFuncIndex = text.indexOf('Function:', funcIndex + 1);
              const sectionEnd = nextFuncIndex !== -1 ? nextFuncIndex : Math.min(funcIndex + 1000, text.length);
              const functionSection = text.substring(funcIndex, sectionEnd);
              
              // Look for all ScSpecFunctionInputV0 blocks in this section (multi-line)
              // Pattern: ScSpecFunctionInputV0 { ... name: StringM(param_name) ... type_: Type ... }
              const scSpecBlockRegex = /ScSpecFunctionInputV0\s*\{[\s\S]*?name:\s*StringM\(([^)]+)\)[\s\S]*?type_:\s*([A-Za-z0-9_]+)[\s\S]*?\}/gi;
              let scSpecMatch;
              while ((scSpecMatch = scSpecBlockRegex.exec(functionSection)) !== null) {
                const paramName = scSpecMatch[1]?.trim();
                const paramType = scSpecMatch[2]?.trim();
                if (paramName && paramType) {
                  if (!func.parameters) func.parameters = [];
                  func.parameters.push({
                    name: paramName,
                    type: paramType,
                    mapped_from: this.inferParameterMapping(paramName, paramType)
                  });
                  console.log(`[ContractIntrospection] 📋 Fallback: Added parameter ${paramName}: ${paramType} to ${func.name}`);
                }
              }
            }
          }
        }
      }
      
      // Log function details for debugging
      functions.forEach(func => {
        console.log(`[ContractIntrospection] 📋 Function: ${func.name}, Parameters: ${func.parameters?.length || 0}`);
        if (func.parameters && func.parameters.length > 0) {
          func.parameters.forEach(param => {
            console.log(`[ContractIntrospection]   - ${param.name}: ${param.type} (mapped from: ${param.mapped_from})`);
          });
        }
      });
      
      console.log(`[ContractIntrospection] 📋 Parsed ${functions.length} functions from text spec`);
      return functions;
    } catch (error) {
      console.log(`[ContractIntrospection] ⚠️  Error parsing text spec: ${error.message}`);
      return functions;
    }
  }

  /**
   * Infer parameter mapping based on parameter name and type
   * Maps common parameter names to GeoLink fields (like latitude/longitude)
   */
  inferParameterMapping(paramName, paramType) {
    if (!paramName) return 'custom_value';
    
    const name = paramName.toLowerCase();
    
    // Location-based mappings
    if (name.includes('lat') || name === 'latitude') {
      return 'latitude';
    }
    if (name.includes('lon') || name.includes('lng') || name === 'longitude') {
      return 'longitude';
    }
    if (name.includes('location') || name.includes('coord')) {
      // Could be a struct, but for now map to latitude
      return 'latitude';
    }
    
    // Common mappings
    if (name.includes('owner') || name.includes('to') || name.includes('recipient')) {
      return 'user_public_key';
    }
    if (name.includes('amount') || name.includes('value') || name.includes('quantity')) {
      return 'amount';
    }
    if (name.includes('token') || name.includes('asset')) {
      return 'asset_code';
    }
    if (name.includes('id') || name.includes('nft_id')) {
      return 'nft_id';
    }
    
    // Default to custom value
    return 'custom_value';
  }

  /**
   * REMOVED: Pattern matching is no longer used
   * Only WASM-based contract spec extraction is used
   */
  generateFunctionNamePatterns() {
    const patterns = new Set(); // Use Set to avoid duplicates
    
    // Common Rust/Soroban function naming patterns
    const prefixes = ['', 'get_', 'set_', 'add_', 'remove_', 'update_', 'delete_', 'create_', 'init_', 'is_', 'has_', 'can_', 'should_', 'do_', 'try_'];
    const suffixes = ['', '_of', '_by', '_for', '_with', '_from', '_to', '_at', '_in', '_on'];
    
    // Common action verbs (Rust/Soroban style)
    const verbs = [
      // CRUD
      'create', 'read', 'update', 'delete', 'get', 'set', 'add', 'remove', 'modify', 'edit',
      // State
      'init', 'initialize', 'setup', 'configure', 'reset', 'clear', 'destroy',
      // Query
      'query', 'find', 'search', 'list', 'count', 'exists', 'contains', 'has',
      // Transfer
      'transfer', 'send', 'receive', 'deposit', 'withdraw', 'mint', 'burn', 'issue',
      // Auth
      'authorize', 'approve', 'revoke', 'grant', 'deny', 'check', 'verify', 'validate',
      // Contract ops
      'upgrade', 'deploy', 'install', 'uninstall', 'enable', 'disable', 'activate', 'deactivate',
      // Entities (common in contracts)
      'signer', 'account', 'user', 'owner', 'admin', 'member', 'participant',
      'plugin', 'extension', 'module', 'component',
      'payment', 'balance', 'token', 'asset', 'currency', 'coin',
      'nft', 'collection', 'item', 'metadata',
      'rule', 'policy', 'permission', 'role',
      'event', 'log', 'record', 'entry'
    ];
    
    // Generate verb-based patterns
    for (const verb of verbs) {
      patterns.add(verb);
      
      for (const prefix of prefixes) {
        if (prefix && !verb.startsWith(prefix.replace('_', ''))) {
          patterns.add(prefix + verb);
        }
      }
      
      for (const suffix of suffixes) {
        if (suffix) {
          patterns.add(verb + suffix);
        }
      }
    }
    
    // Generate compound patterns (verb_noun style - common in Rust)
    const nouns = ['signer', 'account', 'user', 'plugin', 'token', 'nft', 'balance', 'payment', 'auth', 'data', 'info', 'state'];
    for (const verb of verbs.slice(0, 20)) { // Limit to avoid too many combinations
      for (const noun of nouns) {
        if (verb !== noun) {
          patterns.add(`${verb}_${noun}`);
          patterns.add(`get_${noun}`);
          patterns.add(`set_${noun}`);
          patterns.add(`add_${noun}`);
          patterns.add(`remove_${noun}`);
          patterns.add(`update_${noun}`);
          patterns.add(`is_${noun}`);
          patterns.add(`has_${noun}`);
        }
      }
    }
    
    // Special Soroban/Stellar patterns
    patterns.add('__constructor');
    patterns.add('__init');
    patterns.add('__check_auth');
    patterns.add('__upgrade');
    
    // Convert to array, remove duplicates, and sort
    const uniquePatterns = Array.from(patterns).sort();
    console.log(`[ContractIntrospection] 📋 Generated ${uniquePatterns.length} dynamic function name patterns for testing`);
    
    return uniquePatterns;
  }

  /**
   * Test if a function exists and try to infer its signature
   */
  async testFunction(contractAddress, functionName) {
    if (!this.sorobanServer) {
      return null;
    }

    try {
      const contract = new StellarSdk.Contract(contractAddress);
      
      // Create a valid test account for simulation
      // On testnet, we can create and fund an account via Friendbot
      // On mainnet, we need to use an existing account or skip simulation
      let sourceAccount = null;
      let testKeypair = null;
      
      // REMOVED: Pattern matching and simulation-based discovery
      // Only WASM-based contract spec extraction is used
      return null;

      for (const params of testParams) {
        try {

          const operation = contract.call(functionName, ...params);
          
          const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase
          })
            .addOperation(operation)
            .setTimeout(30)
            .build();

          // Simulate the transaction
          const simulation = await this.sorobanServer.simulateTransaction(transaction);
          
          // If simulation succeeds (or returns a specific error), function exists
          if (simulation && !simulation.error) {
            // Try to infer parameter types from successful simulation
            const parameters = this.inferParameters(params, simulation);
            
            return {
              name: functionName,
              parameters: parameters,
              discovered: true,
              note: 'Auto-discovered via simulation'
            };
          }
        } catch (simError) {
          // Check if this is a JavaScript error (not a contract error)
          const errorStr = simError.toString().toLowerCase();
          const errorMessage = simError.message ? simError.message.toLowerCase() : '';
          const fullError = JSON.stringify(simError, Object.getOwnPropertyNames(simError));
          
          // Skip JavaScript/runtime errors - these don't indicate function existence
          if (errorStr.includes('is not defined') || 
              errorStr.includes('undefined') && errorStr.includes('variable') ||
              errorStr.includes('referenceerror') ||
              errorStr.includes('typeerror') && !errorStr.includes('contract') ||
              errorMessage.includes('is not defined') ||
              errorMessage.includes('undefined variable')) {
            console.log(`[ContractIntrospection] ⚠️  JavaScript error for ${functionName}, skipping:`, errorMessage.substring(0, 100));
            continue; // Try next parameter set
          }
          
          console.log(`[ContractIntrospection] Simulation error for ${functionName} with ${params.length} params:`, errorMessage.substring(0, 200));
          
          // If error mentions the function name or indicates it exists, function likely exists
          // But only if it's a contract-related error, not a JavaScript error
          if ((errorStr.includes('invalid') || 
              errorStr.includes('wrong') || 
              errorStr.includes('type') ||
              errorStr.includes('parameter') ||
              errorStr.includes('argument') ||
              errorStr.includes('missing') ||
              errorStr.includes('expected') ||
              errorStr.includes('count') ||
              errorStr.includes('length') ||
              errorStr.includes('contract') ||
              errorStr.includes('soroban') ||
              errorMessage.includes(functionName.toLowerCase()) ||
              fullError.toLowerCase().includes(functionName.toLowerCase()) ||
              (simError.response && simError.response.data && 
               typeof simError.response.data === 'string' && 
               simError.response.data.toLowerCase().includes(functionName.toLowerCase()))) &&
              !errorStr.includes('is not defined') &&
              !errorStr.includes('undefined variable')) {
            // Function exists but parameters don't match - return basic structure
            // Try to infer from function name
            const inferredParams = this.inferParametersFromName(functionName, params);
            
            if (inferredParams.length > 0) {
              console.log(`[ContractIntrospection] ✅ Function ${functionName} exists (inferred from contract error), params:`, inferredParams);
              
              return {
                name: functionName,
                parameters: inferredParams,
                discovered: true,
                note: 'Function exists but signature inferred from name. Please verify and configure manually.'
              };
            }
          }
          
          // Check for "function not found" type errors - these mean function doesn't exist
          if (errorStr.includes('not found') || 
              errorStr.includes('does not exist') ||
              errorStr.includes('unknown function') ||
              errorStr.includes('no such function') ||
              errorStr.includes('undefined function')) {
            console.log(`[ContractIntrospection] ❌ Function ${functionName} does not exist`);
            return null;
          }
        }
      }
      
      // Don't use name inference as a fallback - only return functions we actually verified exist
      // This prevents returning the same functions for every contract
      // If we can't verify via simulation, return null
    } catch (error) {
      // Function doesn't exist or contract is invalid
      console.log(`[ContractIntrospection] ❌ Error testing function ${functionName}:`, error.message);
      return null;
    }

    return null;
  }

  /**
   * Infer parameter types from simulation result
   */
  inferParameters(testParams, simulation) {
    const parameters = [];
    
    testParams.forEach((param, index) => {
      const paramType = this.getScValType(param);
      parameters.push({
        name: `param_${index + 1}`,
        type: paramType,
        required: true
      });
    });

    return parameters;
  }

  /**
   * Get ScVal type as string
   */
  getScValType(scVal) {
    try {
      if (scVal.switch() === StellarSdk.xdr.ScValType.scvString().value) {
        return 'String';
      } else if (scVal.switch() === StellarSdk.xdr.ScValType.scvU32().value) {
        return 'u32';
      } else if (scVal.switch() === StellarSdk.xdr.ScValType.scvI128().value) {
        return 'i128';
      } else if (scVal.switch() === StellarSdk.xdr.ScValType.scvAddress().value) {
        return 'Address';
      } else if (scVal.switch() === StellarSdk.xdr.ScValType.scvBytes().value) {
        return 'Bytes';
      }
    } catch (error) {
      // Fallback
    }
    return 'Unknown';
  }

  /**
   * Infer parameters from function name (heuristic approach)
   */
    inferParametersFromName(functionName, testParams) {
        const params = [];
        const name = functionName.toLowerCase();
        
        // Account/Plugin management functions
        if (name === 'upgrade') {
          return [
            { name: 'new_wasm_hash', type: 'BytesN<32>', required: true }
          ];
        }
        
        if (name === '__constructor' && name.includes('account')) {
          return [
            { name: 'signers', type: 'Vec<Signer>', required: true },
            { name: 'plugins', type: 'Vec<Address>', required: true }
          ];
        }
        
        if (name === 'add_signer' || name === 'update_signer') {
          return [
            { name: 'signer', type: 'Signer', required: true }
          ];
        }
        
        if (name === 'revoke_signer' || name === 'get_signer' || name === 'has_signer') {
          return [
            { name: 'signer_key', type: 'SignerKey', required: true }
          ];
        }
        
        if (name === 'install_plugin' || name === 'uninstall_plugin' || name === 'is_plugin_installed') {
          return [
            { name: 'plugin', type: 'Address', required: true }
          ];
        }
        
        if (name === 'is_deployed') {
          return [];
        }
        
        if (name === '__check_auth') {
          return [
            { name: 'signature_payload', type: 'BytesN<32>', required: true },
            { name: 'auth_payloads', type: 'SignatureProofs', required: true },
            { name: 'auth_contexts', type: 'Vec<Context>', required: true }
          ];
        }
        
        // Smart wallet function signatures based on common patterns
        if (name === 'execute_payment' || name === 'test_execute_payment_signature') {
      return [
        { name: 'signer_address', type: 'Address', required: true },
        { name: 'destination', type: 'Address', required: true },
        { name: 'amount', type: 'i128', required: true },
        { name: 'asset', type: 'Address', required: true },
        { name: 'signature_payload', type: 'Bytes', required: true },
        { name: 'webauthn_signature', type: 'Bytes', required: true },
        { name: 'webauthn_authenticator_data', type: 'Bytes', required: true },
        { name: 'webauthn_client_data', type: 'Bytes', required: true }
      ];
    }
    
    if (name === 'register_signer' || name === 'test_register_signer_signature') {
      return [
        { name: 'signer_address', type: 'Address', required: true },
        { name: 'passkey_pubkey', type: 'Bytes', required: true },
        { name: 'rp_id_hash', type: 'Bytes', required: true }
      ];
    }
    
    if (name === 'deposit') {
      return [
        { name: 'user_address', type: 'Address', required: true },
        { name: 'asset', type: 'Address', required: true },
        { name: 'amount', type: 'i128', required: true },
        { name: 'signature_payload', type: 'Bytes', required: true },
        { name: 'webauthn_signature', type: 'Bytes', required: true },
        { name: 'webauthn_authenticator_data', type: 'Bytes', required: true },
        { name: 'webauthn_client_data', type: 'Bytes', required: true }
      ];
    }
    
    if (name === 'get_balance') {
      return [
        { name: 'user_address', type: 'Address', required: true },
        { name: 'asset', type: 'Address', required: true }
      ];
    }
    
    if (name === 'get_passkey_pubkey' || name === 'is_signer_registered') {
      return [
        { name: 'signer_address', type: 'Address', required: true }
      ];
    }
    
    if (name === 'test_address') {
      return [
        { name: 'addr', type: 'Address', required: true }
      ];
    }
    
    if (name === 'test_address_bytes') {
      return [
        { name: 'addr', type: 'Address', required: true },
        { name: 'data', type: 'Bytes', required: true }
      ];
    }
    
    if (name === 'test_multiple_addresses') {
      return [
        { name: 'addr1', type: 'Address', required: true },
        { name: 'addr2', type: 'Address', required: true },
        { name: 'addr3', type: 'Address', required: true }
      ];
    }
    
    if (name === '__constructor') {
      return [
        { name: 'webauthn_verifier', type: 'Address', required: true }
      ];
    }
    
    // Use testParams if available
    if (testParams && testParams.length > 0) {
      return this.inferParameters(testParams, null);
    }
    
    return [];
  }

  /**
   * Get function signature (for manual entry)
   */
  async getFunctionSignature(contractAddress, functionName, parameters = []) {
    // This is a placeholder - in a real implementation, we'd try to call
    // the function with various parameter types and infer from errors
    return {
      name: functionName,
      parameters: parameters
    };
  }

  /**
   * Map GeoLink fields to contract parameters
   */
  mapFieldsToContract(geolinkData, mapping) {
    const contractParams = [];
    
    if (!mapping || !mapping.parameters) {
      return contractParams;
    }

    mapping.parameters.forEach(param => {
      let value = null;
      
      if (param.mapped_from === 'auto_generate') {
        value = this.generateValue(param.name, param.type);
      } else if (param.mapped_from === 'custom_value') {
        value = geolinkData.custom_values?.[param.name];
      } else {
        value = geolinkData[param.mapped_from];
        
        // Apply transform if specified
        if (param.transform) {
          value = this.applyTransform(value, param.transform);
        }
      }
      
      contractParams.push({
        name: param.name,
        type: param.type,
        value: value
      });
    });

    return contractParams;
  }

  /**
   * Generate a value for auto-generated parameters
   */
  generateValue(paramName, paramType) {
    if (paramName.toLowerCase().includes('id') || paramName.toLowerCase().includes('token')) {
      // Generate a unique token ID
      return Math.floor(Math.random() * 1000000);
    }
    
    // Default based on type
    switch (paramType) {
      case 'u32':
        return 0;
      case 'i128':
        return '0';
      case 'String':
        return '';
      case 'Address':
        return null; // Should be provided
      default:
        return null;
    }
  }

  /**
   * Apply transformation to a value
   */
  applyTransform(value, transform) {
    switch (transform) {
      case 'to_string':
        return String(value);
      case 'build_ipfs_url':
        return `https://ipfs.io/ipfs/${value}`;
      case 'to_lowercase':
        return String(value).toLowerCase();
      case 'to_uppercase':
        return String(value).toUpperCase();
      default:
        return value;
    }
  }

  /**
   * Convert value to ScVal based on type
   */
  convertToScVal(value, type) {
    switch (type) {
      case 'Address':
        return StellarSdk.xdr.ScVal.scvAddress(
          StellarSdk.Address.fromString(value).toScAddress()
        );
      case 'String':
        return StellarSdk.xdr.ScVal.scvString(String(value));
      case 'u32':
        return StellarSdk.xdr.ScVal.scvU32(parseInt(value));
      case 'i128':
        const bigIntValue = BigInt(value);
        return StellarSdk.xdr.ScVal.scvI128(
          StellarSdk.xdr.Int128Parts({
            lo: bigIntValue & 0xFFFFFFFFFFFFFFFFn,
            hi: bigIntValue >> 64n
          })
        );
      case 'Bytes':
        const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
        return StellarSdk.xdr.ScVal.scvBytes(buffer);
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }
}

// Export singleton instance
module.exports = new ContractIntrospection();

