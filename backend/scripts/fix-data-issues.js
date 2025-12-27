// Load environment variables
require('dotenv').config();

const pool = require('../config/database');

/**
 * Fix data issues in the database to ensure wallets and NFTs display correctly
 */

async function fixDuplicateWallets() {
  console.log('\n=== FIXING DUPLICATE WALLETS ===\n');
  
  try {
    // Find duplicate public_keys
    const duplicates = await pool.query(`
      SELECT public_key, COUNT(*) as count, 
             ARRAY_AGG(id ORDER BY created_at DESC) as ids,
             ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
      FROM wallet_locations 
      GROUP BY public_key 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length === 0) {
      console.log('✅ No duplicate wallets found');
      return { fixed: 0, removed: 0 };
    }
    
    console.log(`Found ${duplicates.rows.length} duplicate public_keys`);
    
    let fixed = 0;
    let removed = 0;
    
    for (const dup of duplicates.rows) {
      const ids = dup.ids;
      const createdDates = dup.created_dates;
      
      // Keep the most recent one (first in array since we ordered DESC)
      const keepId = ids[0];
      const removeIds = ids.slice(1);
      
      console.log(`\nPublic Key: ${dup.public_key}`);
      console.log(`  Keeping ID: ${keepId} (created: ${createdDates[0]})`);
      console.log(`  Removing IDs: ${removeIds.join(', ')}`);
      
      // Check if any of the duplicates to remove have different data
      for (const removeId of removeIds) {
        const checkResult = await pool.query(`
          SELECT latitude, longitude, location_enabled, tracking_status, last_updated
          FROM wallet_locations 
          WHERE id = $1
        `, [removeId]);
        
        const keepResult = await pool.query(`
          SELECT latitude, longitude, location_enabled, tracking_status, last_updated
          FROM wallet_locations 
          WHERE id = $1
        `, [keepId]);
        
        const removeData = checkResult.rows[0];
        const keepData = keepResult.rows[0];
        
        // If the one we're removing has more recent data, update the one we're keeping
        if (removeData.last_updated > keepData.last_updated) {
          console.log(`  ⚠️  Removing entry has more recent data, updating kept entry...`);
          await pool.query(`
            UPDATE wallet_locations 
            SET latitude = $1, 
                longitude = $2, 
                location_enabled = $3, 
                tracking_status = $4,
                last_updated = $5
            WHERE id = $6
          `, [
            removeData.latitude,
            removeData.longitude,
            removeData.location_enabled,
            removeData.tracking_status,
            removeData.last_updated,
            keepId
          ]);
        }
        
        // Delete the duplicate
        await pool.query('DELETE FROM wallet_locations WHERE id = $1', [removeId]);
        removed++;
      }
      
      fixed++;
    }
    
    console.log(`\n✅ Fixed ${fixed} duplicate public_keys, removed ${removed} duplicate entries`);
    return { fixed, removed };
  } catch (error) {
    console.error('❌ Error fixing duplicate wallets:', error);
    throw error;
  }
}

async function fixNFTImageUrls() {
  console.log('\n=== FIXING NFT IMAGE URLS ===\n');
  
  try {
    // Check for NFTs missing server_url or ipfs_hash
    // Note: nft_uploads table doesn't have server_url column
    const missingData = await pool.query(`
      SELECT pn.id, pn.ipfs_hash, pn.server_url, 
             pn.ipfs_server_id, pn.nft_upload_id,
             ips.server_url as ipfs_server_url,
             nu.ipfs_hash as upload_hash
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      LEFT JOIN nft_uploads nu ON pn.nft_upload_id = nu.id
      WHERE pn.is_active = true
        AND (
          (pn.ipfs_hash IS NULL OR pn.ipfs_hash = '')
          OR ((pn.server_url IS NULL OR pn.server_url = '') 
              AND (ips.server_url IS NULL OR ips.server_url = ''))
        )
    `);
    
    if (missingData.rows.length === 0) {
      console.log('✅ All NFTs have valid IPFS hash and server URL');
      return { fixed: 0 };
    }
    
    console.log(`Found ${missingData.rows.length} NFTs with missing IPFS data`);
    
    let fixed = 0;
    
    for (const nft of missingData.rows) {
      console.log(`\nNFT ID: ${nft.id}`);
      
      // Try to get data from related tables
      // Note: nft_uploads table doesn't have server_url, only ipfs_hash
      let ipfsHash = nft.ipfs_hash || nft.upload_hash;
      let serverUrl = nft.server_url || nft.ipfs_server_url;
      
      // If we found data in related tables, update the NFT
      if (ipfsHash && serverUrl) {
        console.log(`  Updating with hash: ${ipfsHash}, server: ${serverUrl}`);
        await pool.query(`
          UPDATE pinned_nfts 
          SET ipfs_hash = $1, 
              server_url = $2
          WHERE id = $3
        `, [ipfsHash, serverUrl, nft.id]);
        fixed++;
      } else if (ipfsHash && !serverUrl) {
        // If we have hash but no server, try to find an active IPFS server
        const activeServer = await pool.query(`
          SELECT server_url 
          FROM ipfs_servers 
          WHERE is_active = true 
          LIMIT 1
        `);
        
        if (activeServer.rows.length > 0) {
          console.log(`  Updating with hash: ${ipfsHash}, server: ${activeServer.rows[0].server_url}`);
          await pool.query(`
            UPDATE pinned_nfts 
            SET ipfs_hash = $1, 
                server_url = $2
            WHERE id = $3
          `, [ipfsHash, activeServer.rows[0].server_url, nft.id]);
          fixed++;
        } else {
          console.log(`  ⚠️  No active IPFS server found, cannot fix`);
        }
      } else {
        console.log(`  ⚠️  Cannot fix - missing both hash and server URL`);
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} NFTs with missing image data`);
    return { fixed };
  } catch (error) {
    console.error('❌ Error fixing NFT image URLs:', error);
    throw error;
  }
}

async function fixInvalidCoordinates() {
  console.log('\n=== FIXING INVALID COORDINATES ===\n');
  
  try {
    // Check for invalid coordinates in wallets
    const invalidWalletCoords = await pool.query(`
      SELECT id, public_key, latitude, longitude
      FROM wallet_locations 
      WHERE latitude < -90 OR latitude > 90 
         OR longitude < -180 OR longitude > 180
         OR (latitude = 0 AND longitude = 0)
    `);
    
    if (invalidWalletCoords.rows.length > 0) {
      console.log(`Found ${invalidWalletCoords.rows.length} wallets with invalid coordinates`);
      // For now, just log them - we can't auto-fix without knowing the correct location
      invalidWalletCoords.rows.forEach(wallet => {
        console.log(`  Wallet ID ${wallet.id} (${wallet.public_key}): (${wallet.latitude}, ${wallet.longitude})`);
      });
    } else {
      console.log('✅ All wallet coordinates are valid');
    }
    
    // Check for invalid coordinates in NFTs
    const invalidNFTCoords = await pool.query(`
      SELECT id, latitude, longitude
      FROM pinned_nfts 
      WHERE is_active = true
        AND (latitude < -90 OR latitude > 90 
         OR longitude < -180 OR longitude > 180
         OR (latitude = 0 AND longitude = 0))
    `);
    
    if (invalidNFTCoords.rows.length > 0) {
      console.log(`Found ${invalidNFTCoords.rows.length} NFTs with invalid coordinates`);
      invalidNFTCoords.rows.forEach(nft => {
        console.log(`  NFT ID ${nft.id}: (${nft.latitude}, ${nft.longitude})`);
      });
    } else {
      console.log('✅ All NFT coordinates are valid');
    }
    
    return { 
      invalidWallets: invalidWalletCoords.rows.length,
      invalidNFTs: invalidNFTCoords.rows.length 
    };
  } catch (error) {
    console.error('❌ Error checking invalid coordinates:', error);
    throw error;
  }
}

async function ensureActiveNFTsHaveData() {
  console.log('\n=== ENSURING ACTIVE NFTS HAVE COMPLETE DATA ===\n');
  
  try {
    // Find active NFTs that might be missing critical data
    const incompleteNFTs = await pool.query(`
      SELECT pn.id, pn.is_active, pn.latitude, pn.longitude, 
             pn.ipfs_hash, pn.server_url, pn.collection_id,
             COALESCE(ips.server_url, pn.server_url) as effective_server_url,
             COALESCE(nu.ipfs_hash, pn.ipfs_hash) as effective_hash,
             nu.id as has_upload
      FROM pinned_nfts pn
      LEFT JOIN ipfs_servers ips ON pn.ipfs_server_id = ips.id AND ips.is_active = true
      LEFT JOIN nft_uploads nu ON pn.nft_upload_id = nu.id
      WHERE pn.is_active = true
        AND (
          pn.latitude IS NULL OR pn.longitude IS NULL
          OR (pn.latitude = 0 AND pn.longitude = 0)
          OR (pn.ipfs_hash IS NULL OR pn.ipfs_hash = '')
          OR ((pn.server_url IS NULL OR pn.server_url = '') 
              AND (ips.server_url IS NULL OR ips.server_url = ''))
        )
    `);
    
    if (incompleteNFTs.rows.length === 0) {
      console.log('✅ All active NFTs have complete data');
      return { fixed: 0, deactivated: 0 };
    }
    
    console.log(`Found ${incompleteNFTs.rows.length} active NFTs with incomplete data`);
    
    let fixed = 0;
    let deactivated = 0;
    
    for (const nft of incompleteNFTs.rows) {
      // If we can fix it with data from related tables, do so
      if (nft.effective_hash && nft.effective_server_url) {
        // Has hash and server, just needs coordinates
        if (!nft.latitude || !nft.longitude || (nft.latitude === 0 && nft.longitude === 0)) {
          console.log(`  ⚠️  NFT ID ${nft.id}: Has image data but missing coordinates - cannot auto-fix`);
          // Deactivate if missing coordinates (can't display on map)
          await pool.query('UPDATE pinned_nfts SET is_active = false WHERE id = $1', [nft.id]);
          deactivated++;
        } else {
          // Update with effective hash and server
          await pool.query(`
            UPDATE pinned_nfts 
            SET ipfs_hash = $1, server_url = $2
            WHERE id = $3
          `, [nft.effective_hash, nft.effective_server_url, nft.id]);
          fixed++;
        }
      } else {
        // Missing critical image data - deactivate
        console.log(`  ⚠️  NFT ID ${nft.id}: Missing image data - deactivating`);
        await pool.query('UPDATE pinned_nfts SET is_active = false WHERE id = $1', [nft.id]);
        deactivated++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} NFTs, deactivated ${deactivated} incomplete NFTs`);
    return { fixed, deactivated };
  } catch (error) {
    console.error('❌ Error ensuring active NFTs have data:', error);
    throw error;
  }
}

async function validateCollectionReferences() {
  console.log('\n=== VALIDATING COLLECTION REFERENCES ===\n');
  
  try {
    // Find NFTs with invalid collection_id
    const orphanedNFTs = await pool.query(`
      SELECT pn.id, pn.collection_id
      FROM pinned_nfts pn
      LEFT JOIN nft_collections nc ON pn.collection_id = nc.id
      WHERE pn.collection_id IS NOT NULL AND nc.id IS NULL
    `);
    
    if (orphanedNFTs.rows.length === 0) {
      console.log('✅ All collection references are valid');
      return { fixed: 0 };
    }
    
    console.log(`Found ${orphanedNFTs.rows.length} NFTs with orphaned collection_id`);
    
    // Get or create default collection
    let defaultCollection = await pool.query(`
      SELECT id FROM nft_collections WHERE name = 'Default Collection' LIMIT 1
    `);
    
    if (defaultCollection.rows.length === 0) {
      // Create default collection
      const createResult = await pool.query(`
        INSERT INTO nft_collections (name, description, rarity_level)
        VALUES ('Default Collection', 'Default collection for NFTs without a specific collection', 'common')
        RETURNING id
      `);
      defaultCollection = createResult;
    }
    
    const defaultCollectionId = defaultCollection.rows[0].id;
    
    // Update orphaned NFTs to use default collection
    await pool.query(`
      UPDATE pinned_nfts 
      SET collection_id = $1
      WHERE collection_id IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM nft_collections WHERE id = pinned_nfts.collection_id)
    `, [defaultCollectionId]);
    
    console.log(`✅ Fixed ${orphanedNFTs.rows.length} NFTs with orphaned collection references`);
    return { fixed: orphanedNFTs.rows.length };
  } catch (error) {
    console.error('❌ Error validating collection references:', error);
    throw error;
  }
}

async function main() {
  console.log('🔧 Starting data fix process...\n');
  console.log('='.repeat(60));
  
  try {
    const results = {
      duplicates: await fixDuplicateWallets(),
      nftImages: await fixNFTImageUrls(),
      coordinates: await fixInvalidCoordinates(),
      activeNFTs: await ensureActiveNFTsHaveData(),
      collections: await validateCollectionReferences()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 FIX SUMMARY\n');
    
    console.log('WALLETS:');
    console.log(`  Duplicates fixed: ${results.duplicates.fixed}`);
    console.log(`  Duplicate entries removed: ${results.duplicates.removed}`);
    console.log(`  Invalid coordinates: ${results.coordinates.invalidWallets}`);
    
    console.log('\nNFTS:');
    console.log(`  Image URLs fixed: ${results.nftImages.fixed}`);
    console.log(`  Active NFTs fixed: ${results.activeNFTs.fixed}`);
    console.log(`  Incomplete NFTs deactivated: ${results.activeNFTs.deactivated}`);
    console.log(`  Invalid coordinates: ${results.coordinates.invalidNFTs}`);
    console.log(`  Collection references fixed: ${results.collections.fixed}`);
    
    console.log('\n✅ Data fix process complete!\n');
    
    return results;
  } catch (error) {
    console.error('\n❌ Fatal error during data fix:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { 
  fixDuplicateWallets, 
  fixNFTImageUrls, 
  fixInvalidCoordinates,
  ensureActiveNFTsHaveData,
  validateCollectionReferences
};

