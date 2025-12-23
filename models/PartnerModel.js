import supabase from '../config/database.js';

class PartnerModel {
  // Get partner by email - join with users table
  static async findByEmail(email) {
    // First get user_id from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('email', email)
      .eq('role', 'partner')
      .single();

    if (userError || !user) {
      return { data: null, error: userError || { message: 'User not found' } };
    }

    // Then get partner by user_id
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', user.user_id)
      .single();

    if (data) {
      // Add email to partner object
      data.email = email;
    }

    return { data, error };
  }

  // Get partner by partner_id - join with users table to get email
  static async findByPartnerId(partnerId) {
    // First get partner
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('partner_id', partnerId)
      .single();

    if (error || !data) {
      return { data, error };
    }

    // Then get email from users table if user_id exists
    if (data.user_id) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('user_id', data.user_id)
        .single();

      if (!userError && user) {
        data.email = user.email;
      }
    }

    return { data, error };
  }

  // Get partner by user_id
  static async findByUserId(userId) {
    // Use maybeSingle() to handle case where partner doesn't exist gracefully
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted_flag', false) // Only get non-deleted partners
      .maybeSingle();

    if (error) {
      return { data: null, error };
    }

    if (!data) {
      return { data: null, error: null };
    }

    // Get email from users table
    if (data.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('user_id', data.user_id)
        .maybeSingle();

      if (user) {
        data.email = user.email;
      }
    }

    return { data, error: null };
  }
}

export default PartnerModel;

