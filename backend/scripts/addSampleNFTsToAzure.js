const { exec } = require('child_process');

async function addSampleNFTsToAzure() {
  console.log('🎯 Adding sample NFTs to Azure database...');
  
  // Sample NFT data
  const sampleNFTs = [
    {
      name: 'Stellar NFT #1',
      description: 'A rare Stellar-based NFT',
      latitude: 34.2305313,
      longitude: -118.2320378,
      collection_id: 1,
      ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_52.png',
      rarity_level: 'rare'
    },
    {
      name: 'Stellar NFT #2', 
      description: 'Another Stellar NFT',
      latitude: 34.2315313,
      longitude: -118.2330378,
      collection_id: 1,
      ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_53.png',
      rarity_level: 'common'
    },
    {
      name: 'Stellar NFT #3',
      description: 'Legendary Stellar NFT',
      latitude: 34.2325313,
      longitude: -118.2340378,
      collection_id: 1,
      ipfs_hash: 'bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_54.png',
      rarity_level: 'legendary'
    }
  ];
  
  // First, create a collection if it doesn't exist
  const createCollectionSQL = `
    INSERT INTO nft_collections (id, name, description, image_url, rarity_level, created_at, updated_at)
    VALUES (1, 'Stellar Collection', 'A collection of Stellar-based NFTs', 'https://example.com/collection.jpg', 'common', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `;
  
  console.log('📦 Creating NFT collection...');
  const collectionCommand = `ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d GeoLink -c \\"${createCollectionSQL.replace(/"/g, '\\"')}\\""`;
  
  await new Promise((resolve) => {
    exec(collectionCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error creating collection:', error.message);
      } else {
        console.log('✅ Collection created/verified');
        console.log(stdout);
      }
      resolve();
    });
  });
  
  // Add sample NFTs
  for (let i = 0; i < sampleNFTs.length; i++) {
    const nft = sampleNFTs[i];
    const insertSQL = `
      INSERT INTO pinned_nfts (name, description, latitude, longitude, collection_id, ipfs_hash, is_active, created_at, updated_at)
      VALUES ('${nft.name}', '${nft.description}', ${nft.latitude}, ${nft.longitude}, ${nft.collection_id}, '${nft.ipfs_hash}', true, NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `;
    
    console.log(`🎨 Adding NFT: ${nft.name}`);
    const insertCommand = `ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d GeoLink -c \\"${insertSQL.replace(/"/g, '\\"')}\\""`;
    
    await new Promise((resolve) => {
      exec(insertCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error adding NFT ${nft.name}:`, error.message);
        } else {
          console.log(`✅ NFT ${nft.name} added`);
          console.log(stdout);
        }
        resolve();
      });
    });
  }
  
  // Verify the data was added
  console.log('🔍 Verifying added NFTs...');
  const verifyCommand = `ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d GeoLink -c \\"SELECT id, name, latitude, longitude, is_active FROM pinned_nfts;\\""`;
  
  await new Promise((resolve) => {
    exec(verifyCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error verifying NFTs:', error.message);
      } else {
        console.log('✅ NFT verification:');
        console.log(stdout);
      }
      resolve();
    });
  });
}

addSampleNFTsToAzure();
