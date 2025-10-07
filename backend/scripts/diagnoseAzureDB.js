const { exec } = require('child_process');

async function diagnoseAzureDB() {
  const azureVMIP = '20.253.209.97';
  const azureVMUser = 'Serge369x33';
  
  console.log('🔍 Diagnosing Azure PostgreSQL database...');
  
  const commands = [
    'sudo systemctl status postgresql',
    'sudo -u postgres psql -l',
    'sudo -u postgres psql -d GeoLink -c "\\dt"',
    'sudo -u postgres psql -d GeoLink -c "SELECT * FROM pg_extension WHERE extname = \'postgis\';"',
    'sudo -u postgres psql -d GeoLink -c "SELECT COUNT(*) FROM pinned_nfts WHERE is_active = true;"',
    'sudo -u postgres psql -d GeoLink -c "SELECT id, name, latitude, longitude FROM pinned_nfts LIMIT 5;"',
    'sudo -u postgres psql -d GeoLink -c "SELECT id, email, role FROM users WHERE role = \'nft_manager\';"'
  ];
  
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    console.log(`\n🔧 Running: ${command}`);
    
    const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${azureVMUser}@${azureVMIP} "${command}"`;
    
    await new Promise((resolve) => {
      exec(sshCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error: ${error.message}`);
        } else {
          console.log('✅ Output:');
          console.log(stdout);
        }
        if (stderr) {
          console.log('⚠️  Stderr:', stderr);
        }
        resolve();
      });
    });
  }
}

diagnoseAzureDB();
