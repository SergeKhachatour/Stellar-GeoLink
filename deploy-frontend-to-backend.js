#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Building and deploying frontend to backend...');

// Step 1: Build the frontend
console.log('📦 Building frontend...');
try {
  execSync('cd frontend && npm run build', { stdio: 'inherit' });
  console.log('✅ Frontend build completed');
} catch (error) {
  console.error('❌ Frontend build failed:', error.message);
  process.exit(1);
}

// Step 2: Clear backend public directory (except specific files)
console.log('🧹 Cleaning backend public directory...');
const backendPublicDir = path.join(__dirname, 'backend', 'public');
const filesToKeep = ['location-picker.html', 'location-picker-demo.html'];

// Get list of files to remove
const existingFiles = fs.readdirSync(backendPublicDir);
const filesToRemove = existingFiles.filter(file => 
  !filesToKeep.includes(file) && 
  !file.startsWith('.') && 
  file !== 'index.html'
);

// Remove files that should be replaced
filesToRemove.forEach(file => {
  const filePath = path.join(backendPublicDir, file);
  if (fs.statSync(filePath).isDirectory()) {
    fs.rmSync(filePath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(filePath);
  }
});

// Step 3: Copy frontend build files to backend public directory
console.log('📋 Copying frontend build files to backend...');
const frontendBuildDir = path.join(__dirname, 'frontend', 'build');

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    files.forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy all build files
copyRecursive(frontendBuildDir, backendPublicDir);

console.log('✅ Frontend files copied to backend public directory');

// Step 4: Verify the deployment
console.log('🔍 Verifying deployment...');
const indexHtmlPath = path.join(backendPublicDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  console.log('✅ index.html found in backend public directory');
} else {
  console.error('❌ index.html not found in backend public directory');
  process.exit(1);
}

console.log('🎉 Frontend deployment to backend completed successfully!');
console.log('📝 Next steps:');
console.log('   1. Deploy the backend to Azure');
console.log('   2. The frontend will be served at the root URL');
console.log('   3. API endpoints will be available at /api/*');
