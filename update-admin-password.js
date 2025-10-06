const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database configuration for Azure
const pool = new Pool({
  host: '20.253.209.97',
  port: 5432,
  database: 'GeoLink',
  user: 'geolink_user',
  password: process.env.DB_PASSWORD || 'StellarGeoLink2024',
  ssl: false
});

async function updateAdminPassword() {
  try {
    console.log('Connecting to database...');
    
    // Hash the new password
    const newPassword = 'NewAdminPassword123!';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('Updating admin password...');
    
    // Update the admin password
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hashedPassword, 'admin@stellar-geolink.com']
    );
    
    if (result.rowCount > 0) {
      console.log('✅ Admin password updated successfully!');
      console.log('New password: NewAdminPassword123!');
      
      // Verify the update
      const user = await pool.query(
        'SELECT email, created_at FROM users WHERE email = $1',
        ['admin@stellar-geolink.com']
      );
      
      console.log('Admin user details:', user.rows[0]);
    } else {
      console.log('❌ Admin user not found');
    }
    
  } catch (error) {
    console.error('Error updating admin password:', error);
  } finally {
    await pool.end();
  }
}

updateAdminPassword();
