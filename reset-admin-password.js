const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database configuration for Azure
const pool = new Pool({
  host: '20.253.209.97',
  port: 5432,
  database: 'GeoLink',
  user: 'geolink_user',
  password: 'GeoLink2024Secure',
  ssl: false
});

async function resetAdminPassword() {
  try {
    console.log('=== RESETTING ADMIN PASSWORD ===\n');
    
    const email = 'admin@stellar-geolink.com';
    const newPassword = 'AdminPassword123!';
    
    console.log('Setting new password for:', email);
    console.log('New password:', newPassword);
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    console.log('Password hashed successfully');
    console.log('Hash length:', hashedPassword.length);
    
    // Update the password in the database
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hashedPassword, email]
    );
    
    console.log(`Updated ${result.rowCount} user(s)`);
    
    if (result.rowCount === 0) {
      console.log('❌ No user found to update');
      return;
    }
    
    // Verify the update by testing the password
    console.log('\nVerifying the new password...');
    const verifyResult = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [email]
    );
    
    if (verifyResult.rows.length > 0) {
      const storedHash = verifyResult.rows[0].password_hash;
      const isMatch = await bcrypt.compare(newPassword, storedHash);
      
      if (isMatch) {
        console.log('✅ Password updated successfully!');
        console.log('You can now login with:');
        console.log('Email:', email);
        console.log('Password:', newPassword);
      } else {
        console.log('❌ Password verification failed');
      }
    }
    
  } catch (error) {
    console.error('Error resetting password:', error.message);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();