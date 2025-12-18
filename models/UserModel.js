import supabase from '../config/database.js';

class UserModel {
  // Get user by email and role (excludes deleted users)
  static async findByEmailAndRole(email, role) {
    try {
      const normalizedEmail = email?.trim().toLowerCase();
      const normalizedRole = role?.toLowerCase();
      
      console.log('[UserModel] Searching for user:', { 
        email: normalizedEmail, 
        role: normalizedRole,
        originalEmail: email,
        originalRole: role
      });

      // First, let's check if user exists at all (without deleted_flag filter)
      const { data: allUsers, error: checkError } = await supabase
        .from('users')
        .select('user_id, email, role, deleted_flag')
        .eq('email', normalizedEmail)
        .eq('role', normalizedRole);

      if (checkError) {
        console.error('[UserModel] Error checking users:', checkError);
        return { data: null, error: checkError };
      }

      console.log('[UserModel] Found users (including deleted):', allUsers?.length || 0);
      if (allUsers && allUsers.length > 0) {
        allUsers.forEach(user => {
          console.log('[UserModel] User found:', {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            deleted_flag: user.deleted_flag
          });
        });
      }

      // Now query with deleted_flag filter
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('role', normalizedRole)
        .eq('deleted_flag', false) // Exclude deleted users
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error on 0 rows

      // maybeSingle() returns null data instead of error when no rows found
      if (error && error.code !== 'PGRST116') {
        console.error('[UserModel] Query error:', error);
        return { data: null, error };
      }

      if (!data) {
        console.log('[UserModel] No active user found. User may be deleted or not exist.');
      } else {
        console.log('[UserModel] Active user found:', { user_id: data.user_id, email: data.email });
      }

      return { data: data || null, error: null };
    } catch (err) {
      console.error('[UserModel] Exception:', err);
      return { data: null, error: err };
    }
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

  // Get user by email (any role) - includes deleted users
  static async findByEmail(email) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .limit(1);

      if (error) {
        return { data: null, error };
      }

      if (data && Array.isArray(data) && data.length > 0) {
        return { data: data[0], error: null };
      }

      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Get user by user_id (includes deleted users)
  static async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        return { data: null, error };
      }

      if (data && Array.isArray(data) && data.length > 0) {
        return { data: data[0], error: null };
      }

      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
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
