# Stella's Response: Contract Introspection Implementation Guide

## Summary

Stella provided excellent guidance on how to implement dynamic contract introspection for Soroban contracts. The key insight is that **contract specs are embedded in the WASM binary** and can be extracted programmatically.

## Key Points from Stella

1. **Contract Spec is Embedded in WASM**: When you build a Soroban contract, the Rust SDK automatically generates a contract spec that describes all public functions, their parameters, and return types. This spec is embedded in the compiled WASM.

2. **Extract Spec Using Soroban CLI**:
   ```bash
   soroban contract inspect --wasm <contract.wasm>
   ```
   Or for deployed contracts:
   ```bash
   soroban contract fetch --id <CONTRACT_ID> --network testnet
   soroban contract inspect --wasm <fetched-contract.wasm>
   ```

3. **Programmatic Access**:
   - Fetch the WASM using Soroban RPC's `getContractData` method
   - Parse the spec (embedded as a custom section in the WASM binary)
   - Use Stellar SDK to parse XDR-encoded contract spec

4. **Best Practices**:
   - Cache contract specs (don't fetch on every interaction)
   - Use generated bindings for production (better performance and type safety)
   - Leverage XDR parsing utilities from Stellar SDK
   - Track contract spec versions to detect upgrades

## Implementation Plan

### Phase 1: WASM-Based Discovery (Recommended)

1. **Check for Uploaded WASM Files**
   - When a user uploads a WASM file via `/api/contracts/upload-wasm`, store it
   - During discovery, check if WASM exists for the contract
   - If available, parse the contract spec from WASM

2. **Parse Contract Spec from WASM**
   - The contract spec is in a custom section of the WASM binary
   - Section name: `"contractspecv0"` or similar
   - Format: XDR-encoded contract specification
   - Extract function names, parameter types, and return types

3. **Extract Functions**
   - Parse the contract spec XDR structure
   - Extract all public functions
   - Build function signatures with parameter types
   - Return structured function list

### Phase 2: Network-Based Discovery (Future Enhancement)

1. **Fetch WASM from Network**
   - Use Soroban RPC to fetch contract code (if available)
   - Or fetch from StellarExpert API (if they provide it)
   - Parse the fetched WASM to extract contract spec

2. **Cache Contract Specs**
   - Store parsed contract specs in database
   - Include version/hash to detect changes
   - Refresh when contract is upgraded

### Phase 3: Fallback to Simulation (Current Implementation)

- If WASM/spec is not available, fall back to simulation-based discovery
- Use pattern generation and transaction simulation
- This is less reliable but works for any contract

## Code Structure

```javascript
async discoverFunctions(contractAddress, network = 'testnet') {
  // Step 1: Try contract spec extraction (from WASM)
  const specFunctions = await this.extractFunctionsFromContractSpec(contractAddress);
  if (specFunctions && specFunctions.length > 0) {
    return specFunctions; // Most reliable method
  }
  
  // Step 2: Fallback to simulation-based discovery
  return await this.discoverFunctionsViaSimulation(contractAddress);
}
```

## Required Dependencies

For full WASM parsing, you may need:
- WASM parser library (e.g., `@wasm-tool/wasm-parser` or similar)
- XDR parsing utilities (available in Stellar SDK)
- Or use Soroban CLI as a subprocess (if available on server)

## Alternative: Use Soroban CLI

If Soroban CLI is available on the server:
```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function extractFunctionsViaCLI(wasmPath) {
  const { stdout } = await execPromise(`soroban contract inspect --wasm ${wasmPath}`);
  // Parse stdout JSON to extract functions
  return JSON.parse(stdout);
}
```

## Next Steps

1. ✅ **Implemented**: Basic structure for contract spec extraction
2. ⏳ **In Progress**: WASM parsing to extract contract spec section
3. ⏳ **Future**: Network-based WASM fetching
4. ⏳ **Future**: Contract spec caching in database

## Current Status

The contract introspection service now:
- ✅ Checks for uploaded WASM files
- ✅ Attempts to extract functions from contract spec (structure in place)
- ✅ Falls back to simulation-based discovery if WASM not available
- ⏳ Full WASM parsing implementation pending (requires WASM parser library)

## User Instructions

For best results, users should:
1. Upload the contract WASM file via `/api/contracts/upload-wasm`
2. This enables contract spec-based discovery (most reliable)
3. If WASM is not available, the system falls back to simulation-based discovery

## References

- [Stellar Developers: Contract Spec](https://developers.stellar.org/docs/learn/fundamentals/contract-development/types/fully-typed-contracts)
- [Soroban CLI Documentation](https://soroban.stellar.org/docs/getting-started/soroban-cli)
- [Stellar SDK XDR Utilities](https://stellar.github.io/js-stellar-sdk/)

