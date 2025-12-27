// Load environment variables
require('dotenv').config();

const pool = require('../config/database');

/**
 * Comprehensive diagnostic script for wallet and NFT data
 * Checks for common data issues and inconsistencies
 */

async function diagnoseWallets() {
  console.log('\n=== WALLET LOCATIONS DIAGNOSTICS ===\n');
  
  try {
    // Total count
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM wallet_locations');
    console.log(`📊 Total wallet locations: ${totalResult.rows[0].count}`);
    
    // Check for missing coordinates
    const missingCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM wallet_locations 
      WHERE latitude IS NULL OR longitude IS NULL
    `);
    console.log(`❌ Missing coordinates: ${missingCoords.rows[0].count}`);
    
    // Check for invalid coordinates (out of valid range)
    const invalidCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM wallet_locations 
      WHERE latitude < -90 OR latitude > 90 
         OR longitude < -180 OR longitude > 180
    `);
    console.log(`❌ Invalid coordinates (out of range): ${invalidCoords.rows[0].count}`);
    
    // Check for zero coordinates (0, 0) which might indicate missing data
    const zeroCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM wallet_locations 
      WHERE (latitude = 0 AND longitude = 0)
    `);
    console.log(`⚠️  Zero coordinates (0, 0): ${zeroCoords.rows[0].count}`);
    
    // Check for missing public_key
    const missingPublicKey = await pool.query(`
      SELECT COUNT(*) as count 
      FROM wallet_locations 
      WHERE public_key IS NULL OR public_key = ''
    `);
    console.log(`❌ Missing public_key: ${missingPublicKey.rows[0].count}`);
    
    // Check for duplicate public_keys
    const duplicates = await pool.query(`
      SELECT public_key, COUNT(*) as count 
      FROM wallet_locations 
      GROUP BY public_key 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log(`⚠️  Duplicate public_keys: ${duplicates.rows.length}`);
    if (duplicates.rows.length > 0) {
      console.log('   Top duplicates:');
      duplicates.rows.forEach(row => {
        console.log(`   - ${row.public_key}: ${row.count} entries`);
      });
    }
    
    // Check for invalid public_key format (should be 56 chars for Stellar)
    const invalidPublicKey = await pool.query(`
      SELECT COUNT(*) as count 
      FROM wallet_locations 
      WHERE LENGTH(public_key) != 56 OR public_key NOT LIKE 'G%'
    `);
    console.log(`❌ Invalid public_key format: ${invalidPublicKey.rows[0].count}`);
    
    // Check for wallets with location_enabled = false but have coordinates
    // Handle both boolean and varchar types - cast to text for comparison
    try {
      const disabledWithCoords = await pool.query(`
        SELECT COUNT(*) as count 
        FROM wallet_locations 
        WHERE COALESCE(location_enabled::text, '') IN ('false', 'f', '0')
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
      `);
      console.log(`⚠️  Location disabled but has coordinates: ${disabledWithCoords.rows[0].count}`);
    } catch (err) {
      // If column is boolean type, use boolean comparison
      const disabledWithCoords = await pool.query(`
        SELECT COUNT(*) as count 
        FROM wallet_locations 
        WHERE location_enabled = false
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
      `);
      console.log(`⚠️  Location disabled but has coordinates: ${disabledWithCoords.rows[0].count}`);
    }
    
    // Check for wallets with tracking_status = false but have coordinates
    // Handle both boolean and varchar types - cast to text for comparison
    try {
      const notTrackingWithCoords = await pool.query(`
        SELECT COUNT(*) as count 
        FROM wallet_locations 
        WHERE COALESCE(tracking_status::text, '') IN ('false', 'f', '0')
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
      `);
      console.log(`⚠️  Tracking disabled but has coordinates: ${notTrackingWithCoords.rows[0].count}`);
    } catch (err) {
      // If column is boolean type, use boolean comparison
      const notTrackingWithCoords = await pool.query(`
        SELECT COUNT(*) as count 
        FROM wallet_locations 
        WHERE tracking_status = false
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
      `);
      console.log(`⚠️  Tracking disabled but has coordinates: ${notTrackingWithCoords.rows[0].count}`);
    }
    
    // Sample of problematic records
    const problematic = await pool.query(`
      SELECT id, public_key, latitude, longitude, location_enabled, tracking_status, created_at
      FROM wallet_locations 
      WHERE (latitude IS NULL OR longitude IS NULL)
         OR (latitude = 0 AND longitude = 0)
         OR (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)
         OR (public_key IS NULL OR public_key = '' OR LENGTH(public_key) != 56)
      LIMIT 5
    `);
    
    if (problematic.rows.length > 0) {
      console.log('\n📋 Sample problematic records:');
      problematic.rows.forEach(row => {
        console.log(`   ID: ${row.id}, Public Key: ${row.public_key}, Lat: ${row.latitude}, Lon: ${row.longitude}`);
      });
    }
    
    return {
      total: parseInt(totalResult.rows[0].count),
      missingCoords: parseInt(missingCoords.rows[0].count),
      invalidCoords: parseInt(invalidCoords.rows[0].count),
      zeroCoords: parseInt(zeroCoords.rows[0].count),
      missingPublicKey: parseInt(missingPublicKey.rows[0].count),
      duplicates: duplicates.rows.length,
      invalidPublicKey: parseInt(invalidPublicKey.rows[0].count),
      problematic: problematic.rows
    };
  } catch (error) {
    console.error('❌ Error diagnosing wallets:', error);
    throw error;
  }
}

async function diagnoseNFTs() {
  console.log('\n=== PINNED NFTS DIAGNOSTICS ===\n');
  
  try {
    // Total count
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM pinned_nfts');
    console.log(`📊 Total pinned NFTs: ${totalResult.rows[0].count}`);
    
    // Active vs inactive
    const activeCheck = await pool.query(`
      SELECT is_active, COUNT(*) as count 
      FROM pinned_nfts 
      GROUP BY is_active
    `);
    console.log(`📊 Active status distribution:`);
    activeCheck.rows.forEach(row => {
      console.log(`   - is_active = ${row.is_active}: ${row.count}`);
    });
    
    // Check for missing coordinates
    const missingCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE latitude IS NULL OR longitude IS NULL
    `);
    console.log(`❌ Missing coordinates: ${missingCoords.rows[0].count}`);
    
    // Check for invalid coordinates
    const invalidCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE latitude < -90 OR latitude > 90 
         OR longitude < -180 OR longitude > 180
    `);
    console.log(`❌ Invalid coordinates (out of range): ${invalidCoords.rows[0].count}`);
    
    // Check for zero coordinates
    const zeroCoords = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE (latitude = 0 AND longitude = 0)
    `);
    console.log(`⚠️  Zero coordinates (0, 0): ${zeroCoords.rows[0].count}`);
    
    // Check for missing ipfs_hash
    const missingIpfsHash = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE ipfs_hash IS NULL OR ipfs_hash = ''
    `);
    console.log(`❌ Missing ipfs_hash: ${missingIpfsHash.rows[0].count}`);
    
    // Check for missing server_url (check both server_url column and ipfs_servers join)
    const missingServerUrl = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      WHERE (pn.server_url IS NULL OR pn.server_url = '')
        AND (ips.server_url IS NULL OR ips.server_url = '')
    `);
    console.log(`❌ Missing server_url (both column and ipfs_servers): ${missingServerUrl.rows[0].count}`);
    
    // Check for missing both ipfs_hash and server_url
    const missingBoth = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      WHERE (pn.ipfs_hash IS NULL OR pn.ipfs_hash = '')
        AND ((pn.server_url IS NULL OR pn.server_url = '')
          AND (ips.server_url IS NULL OR ips.server_url = ''))
    `);
    console.log(`❌ Missing both ipfs_hash and server_url: ${missingBoth.rows[0].count}`);
    
    // Check for invalid collection_id (orphaned records)
    const orphanedCollections = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
      WHERE pn.collection_id IS NOT NULL AND nc.id IS NULL
    `);
    console.log(`❌ Orphaned collection_id (references non-existent collection): ${orphanedCollections.rows[0].count}`);
    
    // Check for missing pinned_by_user
    const missingPinnedBy = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE pinned_by_user IS NULL OR pinned_by_user = ''
    `);
    console.log(`❌ Missing pinned_by_user: ${missingPinnedBy.rows[0].count}`);
    
    // Check for invalid pinned_by_user format
    const invalidPinnedBy = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts 
      WHERE pinned_by_user IS NOT NULL 
        AND (LENGTH(pinned_by_user) != 56 OR pinned_by_user NOT LIKE 'G%')
    `);
    console.log(`❌ Invalid pinned_by_user format: ${invalidPinnedBy.rows[0].count}`);
    
    // Check for NFTs with nft_upload_id but no matching upload
    const orphanedUploads = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN nft_uploads nu ON pn.nft_upload_id = nu.id
      WHERE pn.nft_upload_id IS NOT NULL AND nu.id IS NULL
    `);
    console.log(`❌ Orphaned nft_upload_id: ${orphanedUploads.rows[0].count}`);
    
    // Check for NFTs with ipfs_server_id but no matching server
    const orphanedServers = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id
      WHERE pn.ipfs_server_id IS NOT NULL AND ips.id IS NULL
    `);
    console.log(`❌ Orphaned ipfs_server_id: ${orphanedServers.rows[0].count}`);
    
    // Check for NFTs with pin_id but no matching pin
    const orphanedPins = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN ipfs_pins ip ON pn.pin_id = ip.id
      WHERE pn.pin_id IS NOT NULL AND ip.id IS NULL
    `);
    console.log(`❌ Orphaned pin_id: ${orphanedPins.rows[0].count}`);
    
    // Sample of problematic records
    const problematic = await pool.query(`
      SELECT pn.id, pn.latitude, pn.longitude, pn.ipfs_hash, 
             pn.server_url, pn.collection_id, pn.pinned_by_user,
             pn.is_active, pn.nft_upload_id, pn.ipfs_server_id, pn.pin_id,
             COALESCE(ips.server_url, pn.server_url) as effective_server_url,
             nu.ipfs_hash as upload_hash
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      LEFT JOIN nft_uploads nu ON pn.nft_upload_id = nu.id
      WHERE (pn.latitude IS NULL OR pn.longitude IS NULL)
         OR (pn.latitude = 0 AND pn.longitude = 0)
         OR (pn.latitude < -90 OR pn.latitude > 90 OR pn.longitude < -180 OR pn.longitude > 180)
         OR (pn.ipfs_hash IS NULL OR pn.ipfs_hash = '')
         OR ((pn.server_url IS NULL OR pn.server_url = '') AND (ips.server_url IS NULL OR ips.server_url = ''))
         OR (pn.collection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM nft_collections WHERE id = pn.collection_id))
      LIMIT 10
    `);
    
    if (problematic.rows.length > 0) {
      console.log('\n📋 Sample problematic records:');
      problematic.rows.forEach(row => {
        console.log(`   ID: ${row.id}`);
        console.log(`      Coordinates: (${row.latitude}, ${row.longitude})`);
        console.log(`      IPFS Hash: ${row.ipfs_hash || 'MISSING'}`);
        console.log(`      Server URL: ${row.effective_server_url || 'MISSING'}`);
        console.log(`      Collection ID: ${row.collection_id || 'NULL'}`);
        console.log(`      Pinned By: ${row.pinned_by_user || 'MISSING'}`);
        console.log(`      Active: ${row.is_active}`);
        console.log(`      Upload ID: ${row.nft_upload_id || 'NULL'}, Server ID: ${row.ipfs_server_id || 'NULL'}, Pin ID: ${row.pin_id || 'NULL'}`);
        console.log('');
      });
    }
    
    // Check data quality for active NFTs (ones that should be visible)
    const activeNFTs = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      WHERE pn.is_active = true
        AND pn.latitude IS NOT NULL 
        AND pn.longitude IS NOT NULL
        AND pn.latitude != 0 
        AND pn.longitude != 0
        AND pn.latitude BETWEEN -90 AND 90
        AND pn.longitude BETWEEN -180 AND 180
        AND (pn.ipfs_hash IS NOT NULL AND pn.ipfs_hash != '')
        AND (COALESCE(ips.server_url, pn.server_url) IS NOT NULL 
             AND COALESCE(ips.server_url, pn.server_url) != '')
    `);
    console.log(`✅ Active NFTs with valid data: ${activeNFTs.rows[0].count}`);
    
    return {
      total: parseInt(totalResult.rows[0].count),
      active: activeCheck.rows.find(r => r.is_active === true)?.count || 0,
      inactive: activeCheck.rows.find(r => r.is_active === false)?.count || 0,
      missingCoords: parseInt(missingCoords.rows[0].count),
      invalidCoords: parseInt(invalidCoords.rows[0].count),
      zeroCoords: parseInt(zeroCoords.rows[0].count),
      missingIpfsHash: parseInt(missingIpfsHash.rows[0].count),
      missingServerUrl: parseInt(missingServerUrl.rows[0].count),
      missingBoth: parseInt(missingBoth.rows[0].count),
      orphanedCollections: parseInt(orphanedCollections.rows[0].count),
      missingPinnedBy: parseInt(missingPinnedBy.rows[0].count),
      invalidPinnedBy: parseInt(invalidPinnedBy.rows[0].count),
      orphanedUploads: parseInt(orphanedUploads.rows[0].count),
      orphanedServers: parseInt(orphanedServers.rows[0].count),
      orphanedPins: parseInt(orphanedPins.rows[0].count),
      validActive: parseInt(activeNFTs.rows[0].count),
      problematic: problematic.rows
    };
  } catch (error) {
    console.error('❌ Error diagnosing NFTs:', error);
    throw error;
  }
}

async function diagnoseCollections() {
  console.log('\n=== NFT COLLECTIONS DIAGNOSTICS ===\n');
  
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM nft_collections');
    console.log(`📊 Total collections: ${totalResult.rows[0].count}`);
    
    // Check for collections with no NFTs
    const emptyCollections = await pool.query(`
      SELECT nc.id, nc.name, COUNT(pn.id) as nft_count
      FROM nft_collections nc
      LEFT JOIN pinned_nfts pn ON nc.id = pn.collection_id
      GROUP BY nc.id, nc.name
      HAVING COUNT(pn.id) = 0
    `);
    console.log(`⚠️  Collections with no NFTs: ${emptyCollections.rows.length}`);
    if (emptyCollections.rows.length > 0) {
      console.log('   Empty collections:');
      emptyCollections.rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Name: ${row.name}`);
      });
    }
    
    // Check for missing required fields
    const missingName = await pool.query(`
      SELECT COUNT(*) as count 
      FROM nft_collections 
      WHERE name IS NULL OR name = ''
    `);
    console.log(`❌ Missing name: ${missingName.rows[0].count}`);
    
    return {
      total: parseInt(totalResult.rows[0].count),
      empty: emptyCollections.rows.length,
      missingName: parseInt(missingName.rows[0].count)
    };
  } catch (error) {
    console.error('❌ Error diagnosing collections:', error);
    throw error;
  }
}

async function main() {
  console.log('🔍 Starting database diagnostics...\n');
  console.log('='.repeat(60));
  
  try {
    const walletResults = await diagnoseWallets();
    const nftResults = await diagnoseNFTs();
    const collectionResults = await diagnoseCollections();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 SUMMARY\n');
    
    console.log('WALLETS:');
    console.log(`  Total: ${walletResults.total}`);
    console.log(`  Issues: ${walletResults.missingCoords + walletResults.invalidCoords + walletResults.missingPublicKey + walletResults.invalidPublicKey}`);
    console.log(`  Valid: ${walletResults.total - walletResults.missingCoords - walletResults.invalidCoords - walletResults.missingPublicKey - walletResults.invalidPublicKey}`);
    
    console.log('\nNFTS:');
    console.log(`  Total: ${nftResults.total}`);
    console.log(`  Active: ${nftResults.active}`);
    console.log(`  Inactive: ${nftResults.inactive}`);
    console.log(`  Valid Active: ${nftResults.validActive}`);
    console.log(`  Issues: ${nftResults.missingCoords + nftResults.invalidCoords + nftResults.missingBoth + nftResults.orphanedCollections}`);
    
    console.log('\nCOLLECTIONS:');
    console.log(`  Total: ${collectionResults.total}`);
    console.log(`  Empty: ${collectionResults.empty}`);
    
    console.log('\n✅ Diagnostics complete!\n');
    
    // Return results for potential programmatic use
    return {
      wallets: walletResults,
      nfts: nftResults,
      collections: collectionResults
    };
  } catch (error) {
    console.error('\n❌ Fatal error during diagnostics:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { diagnoseWallets, diagnoseNFTs, diagnoseCollections };

