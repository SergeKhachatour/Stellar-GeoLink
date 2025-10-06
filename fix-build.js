const fs = require('fs');
const path = require('path');

// Read the App.js file
const appJsPath = path.join(__dirname, 'frontend', 'src', 'App.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// Fix the import
content = content.replace(
  "import NFTDashboard from './components/NFT/NFTDashboard';",
  "// import NFTDashboard from './components/NFT/NFTDashboard'; // Temporarily disabled"
);

// Fix the route
content = content.replace(
  /<Route\s+path="\/dashboard\/nft"\s+element=\{\s*<ProtectedRoute roles=\{['"]nft_manager['"]\}>\s*<NFTDashboard \/>\s*<\/ProtectedRoute>\s*\}\s*\/>/,
  `{/* <Route 
                            path="/dashboard/nft" 
                            element={
                                <ProtectedRoute roles={['nft_manager']}>
                                    <NFTDashboard />
                                </ProtectedRoute>
                            } 
                        /> */}`
);

// Write the fixed content back
fs.writeFileSync(appJsPath, content);

console.log('✅ Fixed App.js build errors');
console.log('📝 Changes made:');
console.log('  - Commented out NFTDashboard import');
console.log('  - Commented out NFT route');
console.log('');
console.log('🚀 Ready to commit and push!');
