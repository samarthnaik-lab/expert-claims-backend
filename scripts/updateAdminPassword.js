/**
 * Script to update admin password with proper bcrypt hash
 * 
 * Usage:
 * 1. Set the PLAIN_PASSWORD variable below to the desired password
 * 2. Run: node scripts/updateAdminPassword.js
 * 
 * This will update the admin@company.com user's password_hash to a proper bcrypt hash
 */

import supabase from '../config/database.js';
import bcrypt from 'bcryptjs';

const updateAdminPassword = async () => {
  try {
    // ⚠️ SET THIS TO YOUR DESIRED PASSWORD
    const PLAIN_PASSWORD = 'admin123'; // Change this to your desired password
    
    const ADMIN_EMAIL = 'admin@company.com';
    
    console.log('Updating admin password...');
    console.log('Email:', ADMIN_EMAIL);
    console.log('⚠️  New password will be:', PLAIN_PASSWORD);
    
    // Generate proper bcrypt hash
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, saltRounds);
    
    console.log('Generated bcrypt hash:', passwordHash.substring(0, 30) + '...');
    
    // Update user password
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_time: new Date().toISOString()
      })
      .eq('email', ADMIN_EMAIL)
      .eq('role', 'admin')
      .select('user_id, email, role')
      .single();
    
    if (updateError || !updatedUser) {
      console.error('❌ Error updating password:', updateError);
      return;
    }
    
    console.log('✅ Password updated successfully!');
    console.log('\nLogin credentials:');
    console.log('  Email:', ADMIN_EMAIL);
    console.log('  Password:', PLAIN_PASSWORD);
    console.log('\n⚠️  Remember to change this password after first login!');
    
    // Verify the hash works
    const verifyResult = await bcrypt.compare(PLAIN_PASSWORD, passwordHash);
    console.log('\n✅ Password verification test:', verifyResult ? 'PASSED' : 'FAILED');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Run the script
updateAdminPassword()
  .then(() => {
    console.log('\nScript completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });






