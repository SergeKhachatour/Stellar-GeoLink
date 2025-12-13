const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class IPFSPinner {
    constructor() {
        this.pinataApiUrl = 'https://api.pinata.cloud';
    }

    async getPinataConfig(serverConfig) {
        return {
            baseURL: this.pinataApiUrl,
            headers: {
                'pinata_api_key': serverConfig.api_key,
                'pinata_secret_api_key': serverConfig.api_secret
            }
        };
    }

    async pinFile(serverConfig, filePath, filename) {
        try {
            console.log('🔗 Starting real Pinata pin for:', filename);
            console.log('📁 File path:', filePath);
            console.log('🌐 Server:', serverConfig.server_name);
            
            // Validate that we have Pinata credentials
            if (!serverConfig.api_key || !serverConfig.api_secret) {
                throw new Error('Pinata API credentials are required');
            }

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Create FormData for file upload
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath), filename);
            
            // Add metadata
            const metadata = {
                name: filename,
                keyvalues: {
                    uploadedBy: 'Stellar-GeoLink',
                    uploadDate: new Date().toISOString()
                }
            };
            formData.append('pinataMetadata', JSON.stringify(metadata));

            // Add options
            const options = {
                cidVersion: 1
            };
            formData.append('pinataOptions', JSON.stringify(options));

            // Get Pinata config
            const config = await this.getPinataConfig(serverConfig);
            
            console.log('📤 Uploading to Pinata...');
            
            // Make the actual API call to Pinata
            const response = await axios.post('/pinning/pinFileToIPFS', formData, {
                ...config,
                headers: {
                    ...config.headers,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            console.log('✅ Pinata response:', response.data);

            if (response.data && response.data.IpfsHash) {
                // Construct the proper Pinata URL using the server's gateway URL
                // Extract the base gateway URL (remove any existing /ipfs/... path)
                let gatewayUrl = serverConfig.server_url;
                
                // If the server_url contains /ipfs/, extract just the base URL
                if (gatewayUrl.includes('/ipfs/')) {
                    gatewayUrl = gatewayUrl.split('/ipfs/')[0];
                }
                
                // Remove trailing slash
                gatewayUrl = gatewayUrl.replace(/\/$/, '');
                
                // Construct the full IPFS URL
                const pinataUrl = `${gatewayUrl}/ipfs/${response.data.IpfsHash}`;
                
                console.log('🔗 Constructed Pinata URL:', pinataUrl);
                
                return {
                    success: true,
                    ipfsHash: response.data.IpfsHash,
                    pinSize: response.data.PinSize || 0,
                    pinDate: new Date().toISOString(),
                    pinataUrl: pinataUrl
                };
            } else {
                throw new Error('Invalid response from Pinata API');
            }

        } catch (error) {
            console.error('❌ Error pinning file to Pinata:', error);
            
            // Enhanced error handling
            let errorMessage = error.message;
            if (error.response) {
                errorMessage = `Pinata API Error (${error.response.status}): ${error.response.data?.error || error.response.statusText}`;
            } else if (error.request) {
                errorMessage = 'Network error: Unable to reach Pinata API';
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    async getPinStatus(serverConfig, ipfsHash) {
        try {
            console.log('🔍 Checking Pinata pin status for:', ipfsHash);
            
            const config = await this.getPinataConfig(serverConfig);
            
            // Get pin list and check if our hash exists
            const response = await axios.get('/data/pinList', {
                ...config,
                params: {
                    hashContains: ipfsHash
                }
            });

            if (response.data && response.data.rows && response.data.rows.length > 0) {
                const pin = response.data.rows.find(p => p.ipfs_pin_hash === ipfsHash);
                if (pin) {
                    return {
                        success: true,
                        status: 'pinned',
                        ipfsHash: ipfsHash,
                        pinSize: pin.size,
                        lastChecked: new Date().toISOString(),
                        pinDate: pin.date_pinned
                    };
                }
            }

            return {
                success: true,
                status: 'not_found',
                ipfsHash: ipfsHash,
                lastChecked: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error checking pin status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async unpinFile(serverConfig, ipfsHash) {
        try {
            console.log('🗑️ Unpinning from Pinata:', ipfsHash);
            
            const config = await this.getPinataConfig(serverConfig);
            
            // Make the actual API call to Pinata to unpin
            const response = await axios.delete(`/pinning/unpin/${ipfsHash}`, config);
            
            console.log('✅ Unpin response:', response.data);
            
            return {
                success: true,
                message: 'File unpinned successfully from Pinata',
                ipfsHash: ipfsHash
            };

        } catch (error) {
            console.error('❌ Error unpinning file from Pinata:', error);
            
            let errorMessage = error.message;
            if (error.response) {
                errorMessage = `Pinata API Error (${error.response.status}): ${error.response.data?.error || error.response.statusText}`;
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }
}

module.exports = new IPFSPinner();