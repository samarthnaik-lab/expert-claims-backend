import supabase from '../config/database.js';

class UserModel {
  // Get user by email and role
  static async findByEmailAndRole(email, role) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('role', role.toLowerCase())
      .single();

    return { data, error };
  }

  // Get user by mobile and role
  static async findByMobileAndRole(mobile, role) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('mobile_number', mobile)
      .eq('role', role.toLowerCase())
      .eq('deleted_flag', false)
      .single();

    return { data, error };
  }

  // Get user by user_id
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted_flag', false)
      .single();

    return { data, error };
  }

  // Update last login timestamp
  static async updateLastLogin(userId) {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(),
        failed_login_attempts: 0 // Reset failed attempts on successful login
      })
      .eq('user_id', userId)
      .select()
      .single();

    return { data, error };
  }

  // Increment failed login attempts
  static async incrementFailedLoginAttempts(userId, maxAttempts = 5, lockDurationMinutes = 30) {
    // Get current failed attempts
    const { data: user } = await this.findByUserId(userId);
    if (!user) {
      return { error: 'User not found' };
    }

    const currentAttempts = (user.failed_login_attempts || 0) + 1;
    const updateData = { failed_login_attempts: currentAttempts };

    // Lock account if max attempts reached
    if (currentAttempts >= maxAttempts) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + lockDurationMinutes);
      updateData.account_locked_until = lockUntil.toISOString();
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    return { data, error };
  }
}

export default UserModel;
