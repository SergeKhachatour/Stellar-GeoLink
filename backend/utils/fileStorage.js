const fs = require('fs-extra');
const path = require('path');

class FileStorage {
    constructor() {
        this.uploadDir = path.join(__dirname, '../uploads');
        this.ensureUploadDir();
    }

    async ensureUploadDir() {
        try {
            await fs.ensureDir(this.uploadDir);
            console.log('✅ Upload directory ensured:', this.uploadDir);
        } catch (error) {
            console.error('❌ Error creating upload directory:', error);
        }
    }

    async saveFile(userId, fileData, filename) {
        try {
            // Create user-specific directory
            const userDir = path.join(this.uploadDir, userId.toString());
            await fs.ensureDir(userDir);

            // Generate unique filename
            const timestamp = Date.now();
            const fileExtension = path.extname(filename);
            const baseName = path.basename(filename, fileExtension);
            const uniqueFilename = `${timestamp}_${baseName}${fileExtension}`;
            
            const filePath = path.join(userDir, uniqueFilename);
            
            // For now, create a placeholder file since we don't have actual file data
            // In a real implementation, you would save the actual file buffer
            await fs.writeFile(filePath, `Placeholder file for ${filename}\nUploaded at: ${new Date().toISOString()}\nUser ID: ${userId}`);
            
            console.log('✅ File saved:', filePath);
            
            return {
                success: true,
                filePath: filePath,
                relativePath: `uploads/${userId}/${uniqueFilename}`,
                filename: uniqueFilename,
                size: (await fs.stat(filePath)).size
            };
        } catch (error) {
            console.error('❌ Error saving file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getFile(filePath) {
        try {
            const fullPath = path.join(__dirname, '..', filePath);
            const exists = await fs.pathExists(fullPath);
            
            if (!exists) {
                return { success: false, error: 'File not found' };
            }

            const stats = await fs.stat(fullPath);
            return {
                success: true,
                path: fullPath,
                size: stats.size,
                created: stats.birthtime
            };
        } catch (error) {
            console.error('❌ Error getting file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteFile(filePath) {
        try {
            const fullPath = path.join(__dirname, '..', filePath);
            await fs.remove(fullPath);
            console.log('✅ File deleted:', fullPath);
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new FileStorage();
