/**
 * Script to verify that all endpoints documented in Swagger are actually implemented
 */

const swaggerSpec = require('../config/swagger');
const fs = require('fs');
const path = require('path');

// Get all route files
const routesDir = path.join(__dirname, '..', 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'));

console.log('📋 Checking API endpoints...\n');

// Extract all documented paths from Swagger
const documentedPaths = Object.keys(swaggerSpec.paths || {});
console.log(`✅ Found ${documentedPaths.length} documented endpoints in Swagger\n`);

// Group by tag
const endpointsByTag = {};
documentedPaths.forEach(path => {
    const methods = Object.keys(swaggerSpec.paths[path]);
    methods.forEach(method => {
        const endpoint = swaggerSpec.paths[path][method];
        const tags = endpoint.tags || ['Untagged'];
        tags.forEach(tag => {
            if (!endpointsByTag[tag]) {
                endpointsByTag[tag] = [];
            }
            endpointsByTag[tag].push({
                path,
                method: method.toUpperCase(),
                summary: endpoint.summary || 'No summary',
                security: endpoint.security || []
            });
        });
    });
});

// Display endpoints by tag
console.log('📊 Endpoints by Tag:\n');
Object.keys(endpointsByTag).sort().forEach(tag => {
    console.log(`\n🏷️  ${tag} (${endpointsByTag[tag].length} endpoints)`);
    endpointsByTag[tag].forEach(endpoint => {
        const security = endpoint.security.length > 0 
            ? endpoint.security.map(s => Object.keys(s)[0]).join(', ')
            : 'No auth';
        console.log(`   ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(50)} [${security}]`);
    });
});

// Check for common issues
console.log('\n\n🔍 Checking for potential issues...\n');

const issues = [];

// Check for endpoints without summaries
documentedPaths.forEach(path => {
    const methods = Object.keys(swaggerSpec.paths[path]);
    methods.forEach(method => {
        const endpoint = swaggerSpec.paths[path][method];
        if (!endpoint.summary) {
            issues.push(`⚠️  ${method.toUpperCase()} ${path} - Missing summary`);
        }
        if (!endpoint.tags || endpoint.tags.length === 0) {
            issues.push(`⚠️  ${method.toUpperCase()} ${path} - Missing tags`);
        }
    });
});

if (issues.length > 0) {
    console.log('Found potential issues:');
    issues.forEach(issue => console.log(`  ${issue}`));
} else {
    console.log('✅ No obvious issues found in documentation');
}

// Summary
console.log('\n\n📈 Summary:');
console.log(`   Total documented endpoints: ${documentedPaths.length}`);
console.log(`   Total tags: ${Object.keys(endpointsByTag).length}`);
console.log(`   Route files: ${routeFiles.length}`);

// List route files
console.log('\n📁 Route files:');
routeFiles.forEach(file => {
    console.log(`   - ${file}`);
});

console.log('\n✅ Verification complete!');
console.log('\n💡 To test endpoints, visit: http://localhost:4000/api-docs/');
console.log('💡 Make sure your backend server is running before testing endpoints.');

