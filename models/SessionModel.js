import supabase from '../config/database.js';

class SessionModel {
  // Create a new session
  static async create(sessionData) {
    const { data, error } = await supabase
      .from('user_session_details')
      .insert([sessionData])
      .select()
      .single();

    return { data, error };
  }

  // Get session by sessionId
  static async findBySessionId(sessionId) {
    const { data, error } = await supabase
      .from('user_session_details')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    return { data, error };
  }

  // Get session by jwt_token and check if not expired
  static async findByJwtToken(jwtToken) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_session_details')
      .select('*')
      .eq('jwt_token', jwtToken)
      .gt('expires_at', now)
      .single();

    return { data, error };
  }

  // Delete session by jwt_token
  static async deleteByJwtToken(jwtToken) {
    const { error } = await supabase
      .from('user_session_details')
      .delete()
      .eq('jwt_token', jwtToken);

    return { error };
  }

  // Get session by userId
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('user_session_details')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('deleted_flag', false)
      .order('created_time', { ascending: false })
      .limit(1)
      .single();

    return { data, error };
  }

  // Delete session by sessionId
  static async deleteBySessionId(sessionId) {
    const { error } = await supabase
      .from('user_session_details')
      .delete()
      .eq('session_id', sessionId);

    return { error };
  }

  // Delete expired sessions
  static async deleteExpired() {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_session_details')
      .update({ is_active: false, deleted_flag: true })
      .lt('expires_at', now);

    return { error };
  }
}

export default SessionModel;
