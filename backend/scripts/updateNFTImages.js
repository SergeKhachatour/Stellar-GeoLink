// Load environment variables
require('dotenv').config();

const { Pool } = require('pg');

const poolConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'GeoLink',
    password: process.env.DB_PASSWORD || 'your_password',
    port: process.env.DB_PORT || 5432
};

const pool = new Pool(poolConfig);

async function updateNFTImages() {
    try {
        console.log('Updating NFT collection images with real IPFS URLs...');
        
        // Update the Stellar Explorer collection with the real IPFS image
        const result = await pool.query(
            `UPDATE nft_collections 
             SET image_url = $1 
             WHERE name = 'Stellar Explorer'`,
            ['https://bronze-adjacent-barnacle-907.mypinata.cloud/ipfs/bafybeigdv2ccs3bighhgvqj65sgi6bz6qruz4r5bqxpwovem5m5t7xcifi/M25_01.jpg']
        );
        
        console.log(`✅ Updated ${result.rowCount} collection(s) with real IPFS image`);
        
        // Also add some other sample collections with real images
        const sampleCollections = [
            {
                name: 'Galaxy Warriors',
                description: 'Epic space warriors from distant galaxies',
                image_url: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=400&h=300&fit=crop',
                rarity_level: 'rare'
            },
            {
                name: 'Cosmic Legends',
                description: 'Legendary artifacts from the depths of space',
                image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop',
                rarity_level: 'legendary'
            }
        ];

        for (const collection of sampleCollections) {
            try {
                await pool.query(
                    `INSERT INTO nft_collections (name, description, image_url, rarity_level)
                     VALUES ($1, $2, $3, $4)`,
                    [collection.name, collection.description, collection.image_url, collection.rarity_level]
                );
                console.log(`✅ Added collection: ${collection.name}`);
            } catch (error) {
                if (error.code === '23505') { // Unique constraint violation
                    console.log(`⏭️  Collection already exists: ${collection.name}`);
                } else {
                    console.log(`⚠️  Error adding ${collection.name}:`, error.message);
                }
            }
        }

        console.log('NFT collection images updated successfully!');
    } catch (error) {
        console.error('Error updating NFT images:', error);
    } finally {
        await pool.end();
    }
}

updateNFTImages();
