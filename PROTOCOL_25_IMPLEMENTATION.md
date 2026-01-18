# Protocol 25 (X-Ray) Implementation for GeoLink

## Overview

This document outlines the implementation of Protocol 25 (X-Ray) zero-knowledge proof capabilities in GeoLink. Protocol 25 introduces BN254 elliptic curve and Poseidon hash functions to Stellar, enabling privacy-preserving location verification and smart contract execution.

## Key Dates

- **Protocol 25 Testnet**: January 7, 2026
- **Protocol 25 Mainnet**: January 22, 2026

## Architecture

### Table Separation

GeoLink uses **two separate ZK proof systems**:

1. **`zk_proofs` table** (Existing)
   - Purpose: Temporary transaction verification proofs for smart wallet operations
   - TTL: 5 minutes
   - Usage: XYZ-Wallet integration for transaction verification
   - Format: Simple hash-based proofs
   - Location: `backend/routes/zkProof.js`

2. **`geolink_zk_proofs` table** (New - Protocol 25)
   - Purpose: Protocol 25 SNARK/STARK proofs for privacy-preserving location operations
   - TTL: Configurable (can be permanent for compliance)
   - Usage: Location verification, quorum verification, compliance proofs
   - Format: BN254/Poseidon-based SNARK/STARK proofs
   - Location: `backend/services/geolinkZkProofService.js`

### Why Two Tables?

The existing `zk_proofs` table serves a different purpose:
- **Short-lived**: 5-minute expiration for transaction verification
- **Simple format**: Hash-based verification, not full ZK proofs
- **Different use case**: Smart wallet transaction signing, not location privacy

The new `geolink_zk_proofs` table is designed for Protocol 25:
- **Long-lived or permanent**: For compliance and audit trails
- **Full ZK proofs**: SNARK/STARK using BN254 and Poseidon
- **Location privacy**: Proves location without revealing coordinates

## Database Schema

### Migration: `011_add_zk_privacy_features.sql`

#### New Columns in `contract_execution_rules`:
- `use_zk_privacy` (BOOLEAN): Enable ZK privacy for this rule
- `privacy_mode` (VARCHAR): 'public', 'private', or 'partial'
- `approximate_radius_meters` (INTEGER): For partial privacy mode
- `zk_circuit_config` (JSONB): ZK circuit configuration
- `require_zk_proof` (BOOLEAN): Require ZK proof for execution
- `zk_proof_verification_contract_id` (VARCHAR): Soroban contract for verification

#### New Tables:

1. **`geolink_zk_proofs`**: Protocol 25 ZK proofs
   - Stores SNARK/STARK proofs using BN254 and Poseidon
   - Supports location verification, quorum, and compliance proofs
   - Can be stored in database, on-chain, or IPFS

2. **`zk_quorum_proofs`**: Privacy-preserving multi-wallet quorum proofs
   - Proves multiple wallets are in range without revealing individual locations
   - Uses ZK to verify quorum requirements

3. **`compliance_proofs`**: Regulatory and audit proofs
   - Long-term storage for compliance verification
   - Supports jurisdiction compliance, regulatory proofs
   - Includes audit trails

4. **`zk_circuit_configs`**: Reusable ZK circuit configurations
   - Pre-configured circuits for different proof types
   - Poseidon and BN254 settings

5. **`rule_approximate_locations`**: Approximate locations for partial privacy
   - Stores fuzzed locations for rules with `privacy_mode = 'partial'`
   - Protects exact location while showing approximate area

## Protocol 25 Features

### 1. Location Verification Proofs

**Purpose**: Prove a user is within a rule's radius without revealing their exact location.

**Implementation** (after Protocol 25 upgrade):
- ZK circuit proves: `distance(lat, lng, ruleLat, ruleLng) <= ruleRadius`
- Uses Poseidon hash for efficient hashing in ZK circuit
- Generates SNARK proof using BN254 curve
- Public inputs: rule center hash, radius, distance commitment (not actual location)

**Service Method**: `geolinkZkProofService.generateLocationVerificationProof()`

### 2. Privacy-Preserving Quorum Verification

**Purpose**: Prove multiple wallets meet quorum requirements without revealing individual locations.

**Implementation** (after Protocol 25 upgrade):
- ZK circuit proves each wallet is within radius (without revealing locations)
- Proves at least `minimumRequired` wallets are in range
- Uses Poseidon for efficient hashing
- Uses BN254 for proof verification

**Service Method**: `geolinkZkProofService.generateQuorumVerificationProof()`

### 3. Compliance/Audit Proofs

**Purpose**: Store long-term proofs for regulatory compliance and audit trails.

**Features**:
- Permanent storage (database, on-chain, or IPFS)
- Audit trail of verification attempts
- Regulatory requirements tracking
- On-chain verification support

**Service Method**: `geolinkZkProofService.getComplianceProofs()`

### 4. Privacy Modes

#### Public Mode (`privacy_mode = 'public'`)
- No privacy protection
- Exact locations stored and displayed
- Standard execution flow

#### Private Mode (`privacy_mode = 'private'`)
- Full privacy protection
- Locations never stored or displayed
- Only ZK proofs stored
- Approximate locations not shown

#### Partial Privacy Mode (`privacy_mode = 'partial'`)
- Approximate location shown (fuzzed)
- Exact location protected by ZK proof
- Configurable fuzzing factor (default: 10%)
- Balance between privacy and usability

## Protocol 25 Host Functions

Once Protocol 25 is live, the following host functions will be available:

### BN254 Operations:
- `bn254_g1_add`: Add two BN254 G1 points
- `bn254_g1_mul`: Multiply BN254 G1 point by scalar
- `bn254_multi_pairing_check`: Verify SNARK proof (multi-pairing check)

### Poseidon Hash:
- Poseidon hash primitives for efficient ZK circuit hashing

## Implementation Status

### ✅ Completed:
1. Database schema for Protocol 25 ZK proofs
2. Privacy settings in execution rules
3. GeoLink Storage system (`geolink_zk_proofs` table)
4. Compliance/audit proof storage
5. Approximate location display for partial privacy
6. Service layer (`geolinkZkProofService.js`)
7. Separation from existing `zk_proofs` table

### ⏳ Pending (After Protocol 25 Upgrade):
1. Actual ZK proof generation (currently placeholder)
2. On-chain proof verification using `bn254_multi_pairing_check`
3. Poseidon hash implementation
4. UI controls for privacy settings
5. Frontend integration for privacy-preserving rules

## Service Layer

### `backend/services/geolinkZkProofService.js`

**Key Methods**:
- `storeProof()`: Store Protocol 25 ZK proof in GeoLink Storage
- `generateLocationVerificationProof()`: Generate location verification proof
- `generateQuorumVerificationProof()`: Generate quorum verification proof
- `verifyProofOnChain()`: Verify proof on-chain using Protocol 25 host functions
- `storeProofOnChain()`: Store proof permanently on-chain
- `storeProofOnIPFS()`: Store proof on IPFS
- `getProof()`: Retrieve proof by ID
- `updateVerificationStatus()`: Update proof verification status
- `getComplianceProofs()`: Get compliance proofs for a rule

**Note**: Proof generation methods currently return placeholder structures. Actual implementation will be added after Protocol 25 upgrade (Jan 7 testnet, Jan 22 mainnet).

## Integration with Existing System

### Compatibility with `zk_proofs` Table

The existing `zk_proofs` table continues to work independently:
- Used by XYZ-Wallet for transaction verification
- 5-minute TTL, one-time use
- Simple hash-based verification
- No changes required

### Background AI Service Integration

The background AI service will be updated to:
1. Check `use_zk_privacy` flag on rules
2. Generate ZK proofs when `privacy_mode = 'private'` or `'partial'`
3. Store proofs in `geolink_zk_proofs` table
4. Use approximate locations for display when `privacy_mode = 'partial'`

## Next Steps

1. **After Protocol 25 Testnet (Jan 7, 2026)**:
   - Implement actual ZK proof generation using BN254 and Poseidon
   - Test on-chain verification using `bn254_multi_pairing_check`
   - Update service methods with real proof generation

2. **After Protocol 25 Mainnet (Jan 22, 2026)**:
   - Deploy to production
   - Enable privacy-preserving rules for users
   - Add UI controls for privacy settings

3. **UI Implementation**:
   - Add privacy mode selector in rule creation form
   - Display approximate locations for partial privacy rules
   - Show ZK proof status in rule details
   - Add compliance proof viewer

## Testing

### Test Plan (After Protocol 25 Upgrade):

1. **Location Verification Proofs**:
   - Generate proof for user in range
   - Verify proof on-chain
   - Test with user out of range (should fail)

2. **Quorum Verification**:
   - Generate quorum proof with multiple wallets
   - Verify quorum met without revealing locations
   - Test with insufficient wallets (should fail)

3. **Privacy Modes**:
   - Test public mode (no privacy)
   - Test private mode (full privacy)
   - Test partial privacy (approximate location)

4. **Compliance Proofs**:
   - Store compliance proof
   - Verify on-chain
   - Test audit trail

## Security Considerations

1. **Proof Storage**: Proofs can be stored in database, on-chain, or IPFS
2. **Verification**: On-chain verification using Protocol 25 host functions
3. **Privacy**: Exact locations never stored in private/partial modes
4. **Audit Trail**: Compliance proofs include full audit trail
5. **Expiration**: Proofs can have expiration dates for temporary verification

## References

- Protocol 25 (X-Ray) Specification: [Stellar Protocol 25](https://developers.stellar.org/docs/encyclopedia/protocol-25)
- BN254 Curve: [BN254 Elliptic Curve](https://en.wikipedia.org/wiki/BN_curves)
- Poseidon Hash: [Poseidon Hash Function](https://www.poseidon-hash.info/)
