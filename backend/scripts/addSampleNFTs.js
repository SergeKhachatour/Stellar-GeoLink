const pool = require('../config/database');

async function addSampleNFTs() {
    try {
        console.log('Adding sample NFT collections...');
        
        // Add sample collections
        const collections = [
            {
                name: 'Stellar Explorer',
                description: 'Discover the cosmos with Stellar NFTs',
                image_url: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=400&h=300&fit=crop',
                rarity_level: 'common'
            },
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

        for (const collection of collections) {
            const result = await pool.query(
                `INSERT INTO nft_collections (name, description, image_url, rarity_level)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (name) DO NOTHING
                 RETURNING *`,
                [collection.name, collection.description, collection.image_url, collection.rarity_level]
            );
            
            if (result.rows.length > 0) {
                console.log(`✅ Added collection: ${collection.name}`);
            } else {
                console.log(`⏭️  Collection already exists: ${collection.name}`);
            }
        }

        console.log('Sample NFT collections added successfully!');
    } catch (error) {
        console.error('Error adding sample NFTs:', error);
    } finally {
        await pool.end();
    }
}

addSampleNFTs();
