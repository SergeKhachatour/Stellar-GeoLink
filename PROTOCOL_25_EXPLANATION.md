# Protocol 25 (X-Ray) - Explanation and Implementation Plan

## What is Protocol 25 (X-Ray)?

Protocol 25 is Stellar's upcoming upgrade that introduces **zero-knowledge proof capabilities** directly into the Stellar blockchain. It's called "X-Ray" because it allows you to verify things (like location) without revealing the actual data.

### Key Technologies:

1. **BN254 Elliptic Curve**: A cryptographic curve optimized for zero-knowledge proofs
2. **Poseidon Hash**: A hash function designed specifically for ZK circuits (very efficient)
3. **SNARK/STARK Proofs**: Mathematical proofs that verify statements without revealing the data

## What We're NOT Currently Implementing

**We are NOT currently implementing actual ZK proofs** because:
- Protocol 25 is not live yet (Testnet: Jan 7, 2026; Mainnet: Jan 22, 2026)
- The required host functions (`bn254_g1_add`, `bn254_g1_mul`, `bn254_multi_pairing_check`, Poseidon) are not available yet
- We cannot generate or verify real ZK proofs until Protocol 25 is deployed

## What We ARE Currently Implementing

### 1. Infrastructure Preparation
- **Database schema** for storing ZK proofs (`geolink_zk_proofs` table)
- **Service layer** (`geolinkZkProofService.js`) with placeholder methods
- **Privacy mode settings** in execution rules (public, private, partial)
- **Placeholder proof structures** that match the Protocol 25 format

### 2. Current Status
The `geolinkZkProofService.js` file has:
- ✅ Methods defined for proof generation and storage
- ✅ Database integration ready
- ⏳ **Placeholder implementations** (not real proofs yet)

## How Protocol 25 Will Work (After Upgrade)

### Example: Location Verification Proof

**Problem**: You want to prove a user is within 500m of a location without revealing their exact coordinates.

**Current (Without ZK)**:
```
User location: 34.0164, -118.4951 (EXACT - privacy risk)
Rule center: 34.0164, -118.4951
Distance: 0m (EXACT - privacy risk)
```

**With Protocol 25 ZK Proof**:
```
Private Inputs (hidden):
- User's actual latitude: 34.0164
- User's actual longitude: -118.4951

Public Inputs (visible):
- Rule center hash: Poseidon(34.0164, -118.4951)
- Rule radius: 500m
- Distance commitment: Poseidon(distance) where distance <= 500m

ZK Proof: SNARK proof that proves distance <= 500m
```

**Result**: The system can verify the user is within range WITHOUT knowing their exact location!

### The ZK Circuit Logic

```
ZK Circuit proves:
1. Calculate distance between (userLat, userLng) and (ruleLat, ruleLng)
2. Verify: distance <= ruleRadius
3. Generate proof using BN254 curve
4. Return proof + public inputs (hashes, not actual coordinates)
```

## What We'll Implement After Protocol 25 Goes Live

### Phase 1: Basic Location Verification (After Jan 7, 2026 - Testnet)

1. **Generate Real ZK Proofs**:
   - Use BN254 curve for proof generation
   - Use Poseidon hash for efficient hashing
   - Prove `distance(lat, lng, ruleLat, ruleLng) <= ruleRadius`

2. **On-Chain Verification**:
   - Use `bn254_multi_pairing_check` host function
   - Verify proof on Stellar blockchain
   - Store verification result

3. **Privacy Modes**:
   - **Public**: Show exact locations (current behavior)
   - **Private**: Only store ZK proofs, never store/show locations
   - **Partial**: Show approximate location + ZK proof

### Phase 2: Advanced Features (After Jan 22, 2026 - Mainnet)

1. **Quorum Verification**:
   - Prove multiple wallets are in range
   - Without revealing individual locations
   - Useful for multi-signature requirements

2. **Compliance Proofs**:
   - Long-term storage of proofs
   - Audit trails
   - Regulatory compliance

3. **On-Chain Storage**:
   - Store proofs directly on Stellar blockchain
   - Permanent, verifiable records

## Current Implementation Details

### What's Ready Now:

1. **Database Schema** (`geolink_zk_proofs` table):
   - Stores proof data (JSONB)
   - Stores public inputs (JSONB)
   - Supports on-chain and IPFS storage references

2. **Service Methods** (`geolinkZkProofService.js`):
   - `generateLocationVerificationProof()` - **Placeholder**
   - `generateQuorumVerificationProof()` - **Placeholder**
   - `verifyProofOnChain()` - **Placeholder**
   - `storeProof()` - **Working** (stores placeholder proofs)

3. **Privacy Settings** (in `contract_execution_rules`):
   - `use_zk_privacy` (BOOLEAN) - Enable/disable ZK privacy
   - `privacy_mode` (VARCHAR) - 'public', 'private', 'partial'
   - `require_zk_proof` (BOOLEAN) - Require proof for execution

### What's NOT Working Yet:

1. **Actual Proof Generation**: Returns placeholder structures
2. **On-Chain Verification**: Cannot verify until Protocol 25 is live
3. **Poseidon Hashing**: Not available until Protocol 25
4. **BN254 Operations**: Not available until Protocol 25

## How It Will Work (Future Implementation)

### Step-by-Step Flow:

1. **User's location update arrives** (e.g., 34.0164, -118.4951)

2. **Background AI checks rule** (e.g., "Payment rule at 34.0164, -118.4951, radius 500m")

3. **If `use_zk_privacy = true`**:
   - Generate ZK proof using Protocol 25:
     - Private: user's exact location
     - Public: rule center hash, radius, distance commitment
   - Store proof in `geolink_zk_proofs` table
   - **Do NOT store exact location** (only proof)

4. **On-chain verification** (if `require_zk_proof = true`):
   - Call Soroban contract with proof
   - Contract uses `bn254_multi_pairing_check` to verify
   - Returns: verified = true/false (without revealing location)

5. **Display** (based on `privacy_mode`):
   - **Public**: Show exact location
   - **Private**: Show "Location verified via ZK proof" (no coordinates)
   - **Partial**: Show approximate location (e.g., "~34.01, ~-118.49")

## Summary

**Current State**: 
- ✅ Infrastructure ready
- ✅ Database schema ready
- ✅ Service methods defined
- ⏳ **Placeholder implementations** (waiting for Protocol 25)

**After Protocol 25 (Jan 2026)**:
- ✅ Generate real ZK proofs
- ✅ Verify on-chain
- ✅ Privacy-preserving location verification
- ✅ No location data stored for private rules

**Key Benefit**: Users can prove they're in the right location for rule execution WITHOUT revealing their exact coordinates - perfect for privacy-sensitive applications!
