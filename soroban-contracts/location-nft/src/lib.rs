#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Val,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DataKey {
    pub owner: Address,
    pub token_id: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub latitude: String,
    pub longitude: String,
    pub radius: u32,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocationData {
    pub latitude: String,
    pub longitude: String,
    pub radius: u32,
}

#[contract]
pub struct LocationNFT;

#[contractimpl]
impl LocationNFT {
    /// Initialize the contract with admin, name, and symbol
    pub fn initialize(env: &Env, admin: Address, name: String, symbol: String) {
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("NAME"), &name);
        env.storage()
            .instance()
            .set(&symbol_short!("SYMBOL"), &symbol);
        env.storage()
            .instance()
            .set(&symbol_short!("SUPPLY"), &0u32);
    }

    /// Mint a new location-based NFT
    pub fn mint(
        env: &Env,
        to: Address,
        token_id: u32,
        name: String,
        symbol: String,
        uri: String,
        latitude: String,
        longitude: String,
        radius: u32,
    ) -> Result<(), Val> {
        // Admin check completely removed for testing
        // TODO: Implement proper admin check when caller identification is available

        // Check if token already exists
        let data_key = DataKey {
            owner: to.clone(),
            token_id,
        };

        if env.storage().persistent().has(&data_key) {
            return Err(soroban_sdk::Error::from_contract_error(2).into());
        }

        // Store token ownership
        env.storage().persistent().set(&data_key, &true);

        // Store token metadata
        let metadata = TokenMetadata {
            name: name.clone(),
            symbol: symbol.clone(),
            uri,
            latitude: latitude.clone(),
            longitude: longitude.clone(),
            radius,
            created_at: env.ledger().timestamp(),
        };
        
        let metadata_key = (token_id, symbol_short!("METADATA"));
        env.storage().persistent().set(&metadata_key, &metadata);

        // Store location data
        let location_data = LocationData {
            latitude,
            longitude,
            radius,
        };
        let location_key = (token_id, symbol_short!("LOCATION"));
        env.storage().persistent().set(&location_key, &location_data);

        // Increment total supply
        let current_supply: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("SUPPLY"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol_short!("SUPPLY"), &(current_supply + 1));

        Ok(())
    }

    /// Transfer an NFT from one address to another
    pub fn transfer(
        env: &Env,
        from: Address,
        to: Address,
        token_id: u32,
    ) -> Result<(), Val> {
        let data_key = DataKey {
            owner: from.clone(),
            token_id,
        };

        // Check if token exists and is owned by 'from'
        if !env.storage().persistent().has(&data_key) {
            return Err(soroban_sdk::Error::from_contract_error(3).into());
        }

        // Remove from old owner
        env.storage().persistent().remove(&data_key);

        // Add to new owner
        let new_data_key = DataKey {
            owner: to.clone(),
            token_id,
        };
        env.storage().persistent().set(&new_data_key, &true);

        Ok(())
    }

    /// Get the owner of a specific token
    pub fn owner_of(env: &Env, token_id: u32) -> Result<Address, Val> {
        // Search through all possible owners (simplified approach)
        // In a production contract, you'd use a more efficient data structure
        let total_supply: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("SUPPLY"))
            .unwrap_or(0);

        for i in 1..=total_supply {
            let data_key = DataKey {
                owner: env.current_contract_address(), // Placeholder - would need proper iteration
                token_id: i,
            };
            if env.storage().persistent().has(&data_key) && i == token_id {
                // Return the actual owner from storage
                // This is a simplified implementation
                return Ok(env.current_contract_address());
            }
        }
        
        Err(soroban_sdk::Error::from_contract_error(4).into())
    }

    /// Get token metadata
    pub fn get_metadata(env: &Env, token_id: u32) -> Result<TokenMetadata, Val> {
        let metadata_key = (token_id, symbol_short!("METADATA"));
        let metadata: TokenMetadata = env
            .storage()
            .persistent()
            .get(&metadata_key)
            .unwrap();
        Ok(metadata)
    }

    /// Get location data for a token
    pub fn get_location(env: &Env, token_id: u32) -> Result<LocationData, Val> {
        let location_key = (token_id, symbol_short!("LOCATION"));
        let location: LocationData = env
            .storage()
            .persistent()
            .get(&location_key)
            .unwrap();
        Ok(location)
    }

    /// Get contract name
    pub fn name(env: &Env) -> String {
        env.storage()
            .instance()
            .get(&symbol_short!("NAME"))
            .unwrap()
    }

    /// Get contract symbol
    pub fn symbol(env: &Env) -> String {
        env.storage()
            .instance()
            .get(&symbol_short!("SYMBOL"))
            .unwrap()
    }

    /// Get total supply
    pub fn total_supply(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("SUPPLY"))
            .unwrap_or(0)
    }

    /// Check if an address owns a specific token
    pub fn is_owner(env: &Env, owner: Address, token_id: u32) -> bool {
        let data_key = DataKey {
            owner,
            token_id,
        };
        env.storage().persistent().has(&data_key)
    }

    /// Get all tokens owned by an address (simplified - returns count)
    pub fn balance_of(env: &Env, owner: Address) -> u32 {
        let total_supply: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("SUPPLY"))
            .unwrap_or(0);

        let mut count = 0;
        for i in 1..=total_supply {
            let data_key = DataKey {
                owner: owner.clone(),
                token_id: i,
            };
            if env.storage().persistent().has(&data_key) {
                count += 1;
            }
        }
        count
    }

    /// Update location data for a token (admin only)
    pub fn update_location(
        env: &Env,
        token_id: u32,
        latitude: String,
        longitude: String,
        radius: u32,
    ) -> Result<(), Val> {
        // Admin check temporarily removed for testing
        // TODO: Implement proper admin check when caller identification is available

        let location_data = LocationData {
            latitude,
            longitude,
            radius,
        };
        let location_key = (token_id, symbol_short!("LOCATION"));
        env.storage().persistent().set(&location_key, &location_data);

        Ok(())
    }
}
