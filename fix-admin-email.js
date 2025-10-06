const { Pool } = require('pg');

// Database configuration for Azure
const pool = new Pool({
  host: '20.253.209.97',
  port: 5432,
  database: 'GeoLink',
  user: 'geolink_user',
  password: 'GeoLink2024Secure',
  ssl: false
});

async function fixAdminEmail() {
  try {
    console.log('Fixing admin email address...');
    
    // Update the email address to include the hyphen
    const result = await pool.query(
      'UPDATE users SET email = $1 WHERE email = $2',
      ['admin@stellar-geolink.com', 'admin@stellargeolink.com']
    );
    
    console.log(`Updated ${result.rowCount} user(s)`);
    
    // Verify the change
    const verifyResult = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      ['admin@stellar-geolink.com']
    );
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ Admin user now has correct email:', verifyResult.rows[0]);
    } else {
      console.log('❌ Email update failed');
    }
    
  } catch (error) {
    console.error('Error fixing admin email:', error.message);
  } finally {
    await pool.end();
  }
}

fixAdminEmail();
