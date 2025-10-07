const { exec } = require('child_process');
require('dotenv').config();

async function sshToAzure() {
  const azureVMIP = process.env.AZURE_VM_IP;
  const azureVMUser = process.env.AZURE_VM_USER || 'azureuser';
  const sshKeyPath = process.env.AZURE_SSH_KEY_PATH || '~/.ssh/id_rsa';
  
  if (!azureVMIP) {
    console.error('❌ AZURE_VM_IP not set in environment variables');
    return;
  }
  
  console.log(`🔑 SSH into Azure VM: ${azureVMUser}@${azureVMIP}`);
  console.log(`📁 Using SSH key: ${sshKeyPath}`);
  
  const sshCommand = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no ${azureVMUser}@${azureVMIP}`;
  
  console.log('🚀 Executing SSH command...');
  console.log('Command:', sshCommand);
  
  exec(sshCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ SSH Error:', error.message);
      return;
    }
    if (stderr) {
      console.error('❌ SSH Stderr:', stderr);
      return;
    }
    console.log('✅ SSH Output:', stdout);
  });
}

sshToAzure();
