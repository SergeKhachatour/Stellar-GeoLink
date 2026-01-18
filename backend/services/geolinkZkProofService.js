/**
 * GeoLink ZK Proof Service for Protocol 25
 * Handles Protocol 25 (X-Ray) zero-knowledge proofs using BN254 and Poseidon
 * 
 * NOTE: This is separate from the existing zk_proofs table which handles
 * temporary transaction verification proofs (5-minute TTL).
 * 
 * This service handles:
 * - Location verification proofs (privacy-preserving)
 * - Quorum verification proofs (multi-wallet privacy)
 * - Compliance/audit proofs (long-term storage)
 */

const pool = require('../config/database');
const StellarSdk = require('@stellar/stellar-sdk');
const contractsConfig = require('../config/contracts');

class GeoLinkZkProofService {
  constructor() {
    this.sorobanServer = new StellarSdk.rpc.Server(contractsConfig.SOROBAN_RPC_URL);
    this.networkPassphrase = contractsConfig.NETWORK_PASSPHRASE;
    
    // Protocol 25 (X-Ray) is now LIVE on Testnet (Jan 7, 2026)
    // Host functions available:
    // - bn254_g1_add: Add two BN254 G1 points
    // - bn254_g1_mul: Multiply BN254 G1 point by scalar
    // - bn254_multi_pairing_check: Verify SNARK proof (multi-pairing check)
    // - Poseidon hash primitives: Efficient hashing for ZK circuits
    
    // NOTE: Actual ZK proof generation requires:
    // 1. ZK circuit definition (using circom, halo2, or similar)
    // 2. Soroban contract with Protocol 25 host function integration
    // 3. Proof generation library (e.g., snarkjs, arkworks)
    // 
    // This service provides the infrastructure. Actual proof generation
    // will be implemented when ZK circuits are defined and deployed.
  }

  /**
   * Store a Protocol 25 ZK proof in GeoLink Storage
   * @param {Object} proofData - Proof data object
   * @returns {Promise<Object>} - Stored proof with ID
   */
  async storeProof(proofData) {
    try {
      const {
        rule_id,
        public_key,
        proof_type, // 'location_verification', 'quorum_verification', 'compliance_proof'
        proof_data, // SNARK/STARK proof (JSONB)
        public_inputs, // Public inputs for verification (JSONB)
        stored_location = 'database', // 'database', 'onchain', 'ipfs'
        onchain_storage_address = null,
        ipfs_hash = null,
        expires_at = null,
        metadata = {}
      } = proofData;

      console.log(`[GeoLinkZK] 📦 Storing ${proof_type} proof for rule ${rule_id}, public_key ${public_key?.substring(0, 8)}...`);

      const result = await pool.query(
        `SELECT store_geolink_zk_proof($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as proof_id`,
        [
          rule_id,
          public_key,
          proof_type,
          JSON.stringify(proof_data),
          JSON.stringify(public_inputs),
          stored_location,
          onchain_storage_address,
          ipfs_hash,
          expires_at,
          JSON.stringify(metadata)
        ]
      );

      const proofId = result.rows[0].proof_id;

      console.log(`[GeoLinkZK] ✅ Proof stored with ID: ${proofId}`);

      return {
        success: true,
        proof_id: proofId,
        stored_location,
        message: 'Proof stored successfully in GeoLink Storage'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error storing proof:', error);
      throw error;
    }
  }

  /**
   * Generate a location verification proof (Protocol 25)
   * This will use BN254 and Poseidon once Protocol 25 is live
   * 
   * @param {Object} params - Location verification parameters
   * @param {Number} params.latitude - User's actual latitude (private)
   * @param {Number} params.longitude - User's actual longitude (private)
   * @param {Number} params.ruleLatitude - Rule center latitude (public)
   * @param {Number} params.ruleLongitude - Rule center longitude (public)
   * @param {Number} params.ruleRadius - Rule radius in meters (public)
   * @param {String} params.publicKey - User's public key
   * @param {Number} params.ruleId - Rule ID
   * @returns {Promise<Object>} - Generated proof
   */
  async generateLocationVerificationProof(params) {
    try {
      const {
        latitude,
        longitude,
        ruleLatitude,
        ruleLongitude,
        ruleRadius,
        publicKey,
        ruleId
      } = params;

      console.log(`[GeoLinkZK] 🔨 Generating location verification proof for rule ${ruleId}...`);

      // Protocol 25 is now LIVE on Testnet!
      // TODO: Implement actual ZK proof generation:
      // 1. Define ZK circuit (using circom/halo2) that proves: distance(lat, lng, ruleLat, ruleLng) <= ruleRadius
      // 2. Use Poseidon hash for efficient hashing in ZK circuit
      // 3. Generate SNARK proof using BN254 curve (via snarkjs or arkworks)
      // 4. Return proof_data and public_inputs
      // 5. Deploy verification contract to Soroban that uses bn254_multi_pairing_check

      // For now, return a placeholder structure that matches Protocol 25 format
      // This will be replaced with actual proof generation once ZK circuits are defined
      
      const proofPlaceholder = {
        protocol_version: '25', // Protocol 25 (X-Ray)
        proof_system: 'snark', // or 'stark'
        curve: 'bn254',
        proof: {
          // Placeholder - will contain actual SNARK proof after Protocol 25
          a: '[BN254 G1 point - will be generated]',
          b: '[BN254 G2 point - will be generated]',
          c: '[BN254 G1 point - will be generated]'
        },
        public_inputs: {
          // Public inputs that don't reveal private location
          rule_center_hash: this.hashLocation(ruleLatitude, ruleLongitude), // Poseidon hash
          rule_radius: ruleRadius,
          distance_commitment: '[Poseidon hash of distance]', // Proves distance <= radius without revealing location
          public_key_hash: this.hashPublicKey(publicKey)
        },
        metadata: {
          generated_at: new Date().toISOString(),
          circuit_type: 'location_verification',
          protocol: 'stellar_xray_25'
        }
      };

      // Store proof in GeoLink Storage
      const stored = await this.storeProof({
        rule_id: ruleId,
        public_key: publicKey,
        proof_type: 'location_verification',
        proof_data: proofPlaceholder,
        public_inputs: proofPlaceholder.public_inputs,
        stored_location: 'database', // Can be moved to onchain/ipfs later
        metadata: {
          rule_latitude: ruleLatitude,
          rule_longitude: ruleLongitude,
          rule_radius: ruleRadius,
          // Note: actual user location (latitude, longitude) is NOT stored
        }
      });

      return {
        success: true,
        proof_id: stored.proof_id,
        proof_data: proofPlaceholder,
        public_inputs: proofPlaceholder.public_inputs,
        note: 'Placeholder proof structure. Actual proof generation will be implemented after Protocol 25 upgrade.'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error generating location verification proof:', error);
      throw error;
    }
  }

  /**
   * Generate a quorum verification proof (Protocol 25)
   * Proves multiple wallets are in range without revealing individual locations
   * 
   * @param {Object} params - Quorum verification parameters
   * @returns {Promise<Object>} - Generated quorum proof
   */
  async generateQuorumVerificationProof(params) {
    try {
      const {
        ruleId,
        walletLocations, // Array of {public_key, latitude, longitude} (private)
        ruleLatitude,
        ruleLongitude,
        ruleRadius,
        minimumRequired
      } = params;

      console.log(`[GeoLinkZK] 🔨 Generating quorum verification proof for rule ${ruleId}...`);

      // TODO: Once Protocol 25 is live, implement ZK proof that:
      // 1. Proves each wallet location is within radius (without revealing locations)
      // 2. Proves at least minimumRequired wallets are in range
      // 3. Uses Poseidon for efficient hashing
      // 4. Uses BN254 for proof verification

      const quorumProofPlaceholder = {
        protocol_version: '25',
        proof_system: 'snark',
        curve: 'bn254',
        proof: {
          a: '[BN254 G1 point]',
          b: '[BN254 G2 point]',
          c: '[BN254 G1 point]'
        },
        public_inputs: {
          rule_center_hash: this.hashLocation(ruleLatitude, ruleLongitude),
          rule_radius: ruleRadius,
          wallet_count: walletLocations.length,
          minimum_required: minimumRequired,
          wallet_commitments: walletLocations.map(w => ({
            public_key_hash: this.hashPublicKey(w.public_key),
            location_commitment: '[Poseidon hash of location]' // Doesn't reveal actual location
          })),
          quorum_met: walletLocations.length >= minimumRequired
        },
        metadata: {
          generated_at: new Date().toISOString(),
          circuit_type: 'quorum_verification',
          protocol: 'stellar_xray_25'
        }
      };

      // Store quorum proof
      const result = await pool.query(
        `INSERT INTO zk_quorum_proofs (
          rule_id, quorum_proof_id, proof_data, public_inputs,
          wallet_count, minimum_required, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, quorum_proof_id`,
        [
          ruleId,
          `quorum_${ruleId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          JSON.stringify(quorumProofPlaceholder),
          JSON.stringify(quorumProofPlaceholder.public_inputs),
          walletLocations.length,
          minimumRequired,
          JSON.stringify({ protocol: 'stellar_xray_25' })
        ]
      );

      return {
        success: true,
        quorum_proof_id: result.rows[0].quorum_proof_id,
        proof_data: quorumProofPlaceholder,
        public_inputs: quorumProofPlaceholder.public_inputs,
        note: 'Placeholder quorum proof. Actual proof generation will be implemented after Protocol 25 upgrade.'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error generating quorum verification proof:', error);
      throw error;
    }
  }

  /**
   * Verify a Protocol 25 ZK proof on-chain
   * Uses Protocol 25 host functions: bn254_multi_pairing_check
   * 
   * @param {Object} proofData - Proof to verify
   * @param {String} verificationContractId - Soroban contract for verification
   * @returns {Promise<Object>} - Verification result
   */
  async verifyProofOnChain(proofData, verificationContractId) {
    try {
      console.log(`[GeoLinkZK] 🔍 Verifying proof on-chain using contract ${verificationContractId}...`);

      // TODO: Once Protocol 25 is live, implement on-chain verification:
      // 1. Call Soroban contract with proof data
      // 2. Contract uses bn254_multi_pairing_check to verify SNARK proof
      // 3. Contract uses Poseidon hash verification
      // 4. Return verification result

      // Placeholder for now
      const contract = new StellarSdk.Contract(verificationContractId);
      
      // This will be implemented after Protocol 25 upgrade:
      // const verifyOp = contract.call('verify_proof', proofData);
      // const transaction = new StellarSdk.TransactionBuilder(...)
      //   .addOperation(verifyOp)
      //   .build();
      // const result = await this.sorobanServer.simulateTransaction(transaction);

      return {
        success: true,
        verified: false, // Will be true after actual verification
        note: 'On-chain verification will be implemented after Protocol 25 upgrade (Jan 7 testnet, Jan 22 mainnet)'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error verifying proof on-chain:', error);
      throw error;
    }
  }

  /**
   * Store proof on-chain (Protocol 25)
   * Stores proof data in a Soroban contract for permanent on-chain storage
   * 
   * @param {Object} proofData - Proof to store
   * @param {String} storageContractId - Contract for storage
   * @returns {Promise<Object>} - Storage result with on-chain address
   */
  async storeProofOnChain(proofData, storageContractId) {
    try {
      console.log(`[GeoLinkZK] 📤 Storing proof on-chain in contract ${storageContractId}...`);

      // TODO: Implement on-chain storage after Protocol 25 upgrade
      // This will store proof data in a Soroban contract for permanent storage

      return {
        success: true,
        onchain_storage_address: `[Will be generated after Protocol 25 upgrade]`,
        note: 'On-chain storage will be implemented after Protocol 25 upgrade'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error storing proof on-chain:', error);
      throw error;
    }
  }

  /**
   * Store proof on IPFS
   * Alternative storage option for proofs
   * 
   * @param {Object} proofData - Proof to store
   * @returns {Promise<Object>} - IPFS storage result
   */
  async storeProofOnIPFS(proofData) {
    try {
      // Use existing IPFS service if available
      const ipfsPinner = require('../utils/ipfsPinner');
      
      const proofJson = JSON.stringify(proofData);
      const ipfsHash = await ipfsPinner.pinJSON(proofJson);

      return {
        success: true,
        ipfs_hash: ipfsHash,
        note: 'Proof stored on IPFS'
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error storing proof on IPFS:', error);
      throw error;
    }
  }

  /**
   * Helper: Hash location using Poseidon (Protocol 25)
   * This will use Protocol 25 Poseidon primitives once available
   * 
   * @param {Number} latitude 
   * @param {Number} longitude 
   * @returns {String} - Poseidon hash (placeholder for now)
   */
  hashLocation(latitude, longitude) {
    // TODO: Use Protocol 25 Poseidon hash once available
    // For now, return placeholder
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(`${latitude},${longitude}`)
      .digest('hex')
      .substring(0, 64); // Placeholder - will use Poseidon after Protocol 25
  }

  /**
   * Helper: Hash public key using Poseidon
   * 
   * @param {String} publicKey 
   * @returns {String} - Poseidon hash (placeholder for now)
   */
  hashPublicKey(publicKey) {
    // TODO: Use Protocol 25 Poseidon hash once available
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .substring(0, 64); // Placeholder - will use Poseidon after Protocol 25
  }

  /**
   * Get proof by ID
   * 
   * @param {Number} proofId 
   * @returns {Promise<Object>} - Proof data
   */
  async getProof(proofId) {
    try {
      const result = await pool.query(
        'SELECT * FROM geolink_zk_proofs WHERE id = $1',
        [proofId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const proof = result.rows[0];
      return {
        id: proof.id,
        rule_id: proof.rule_id,
        public_key: proof.public_key,
        proof_type: proof.proof_type,
        proof_data: proof.proof_data,
        public_inputs: proof.public_inputs,
        verification_status: proof.verification_status,
        verified_at: proof.verified_at,
        transaction_hash: proof.transaction_hash,
        stored_location: proof.stored_location,
        onchain_storage_address: proof.onchain_storage_address,
        ipfs_hash: proof.ipfs_hash,
        created_at: proof.created_at
      };
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error getting proof:', error);
      throw error;
    }
  }

  /**
   * Update proof verification status
   * 
   * @param {Number} proofId 
   * @param {String} status - 'verified', 'failed', 'expired'
   * @param {String} transactionHash - Optional transaction hash
   * @param {String} contractId - Optional contract that verified
   */
  async updateVerificationStatus(proofId, status, transactionHash = null, contractId = null) {
    try {
      await pool.query(
        'SELECT update_geolink_proof_verification($1, $2, $3, $4, $5)',
        [proofId, status, new Date(), contractId, transactionHash]
      );

      console.log(`[GeoLinkZK] ✅ Updated proof ${proofId} verification status to ${status}`);
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error updating verification status:', error);
      throw error;
    }
  }

  /**
   * Get compliance proofs for a rule
   * 
   * @param {Number} ruleId 
   * @returns {Promise<Array>} - Array of compliance proofs
   */
  async getComplianceProofs(ruleId) {
    try {
      const result = await pool.query(
        `SELECT * FROM compliance_proofs 
         WHERE rule_id = $1 
         ORDER BY created_at DESC`,
        [ruleId]
      );

      return result.rows.map(row => ({
        id: row.id,
        rule_id: row.rule_id,
        public_key: row.public_key,
        compliance_type: row.compliance_type,
        proof_data: row.proof_data,
        public_inputs: row.public_inputs,
        regulatory_requirements: row.regulatory_requirements,
        verification_status: row.verification_status,
        verified_at: row.verified_at,
        transaction_hash: row.transaction_hash,
        stored_location: row.stored_location,
        audit_trail: row.audit_trail,
        created_at: row.created_at
      }));
    } catch (error) {
      console.error('[GeoLinkZK] ❌ Error getting compliance proofs:', error);
      throw error;
    }
  }
}

module.exports = new GeoLinkZkProofService();
