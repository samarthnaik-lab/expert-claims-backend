import supabase from '../config/database.js';

class OTPModel {
  // Create a new OTP record
  static async create(otpData) {
    const { data, error } = await supabase
      .from('user_otp')
      .insert([otpData])
      .select()
      .single();

    return { data, error };
  }

  // Get active OTP by user_id and purpose
  static async findActiveOTP(userId, purpose = 'login') {
    const { data, error } = await supabase
      .from('user_otp')
      .select('*')
      .eq('user_id', userId)
      .eq('purpose', purpose)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_time', { ascending: false })
      .limit(1)
      .single();

    return { data, error };
  }

  // Verify OTP code
  static async verifyOTP(userId, otpCode, purpose = 'login') {
    const { data: otp, error } = await this.findActiveOTP(userId, purpose);

    if (error || !otp) {
      return { valid: false, error: 'OTP not found or expired' };
    }

    // Check if OTP code matches
    if (otp.otp_code.toString() !== otpCode.toString()) {
      return { valid: false, error: 'Invalid OTP code' };
    }

    // Check if max attempts exceeded
    const attempts = parseInt(otp.attempts || '0');
    const maxAttempts = parseInt(otp.max_attempts || '3');
    
    if (attempts >= maxAttempts) {
      return { valid: false, error: 'Maximum OTP attempts exceeded' };
    }

    // Mark OTP as used
    await this.markAsUsed(otp.otp_id);

    return { valid: true, otp, error: null };
  }

  // Mark OTP as used
  static async markAsUsed(otpId) {
    const { error } = await supabase
      .from('user_otp')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('otp_id', otpId);

    return { error };
  }

  // Increment OTP attempts
  static async incrementAttempts(otpId) {
    const { data: otp } = await supabase
      .from('user_otp')
      .select('attempts')
      .eq('otp_id', otpId)
      .single();

    const currentAttempts = parseInt(otp?.attempts || '0');
    
    const { error } = await supabase
      .from('user_otp')
      .update({
        attempts: (currentAttempts + 1).toString()
      })
      .eq('otp_id', otpId);

    return { error };
  }
}

export default OTPModel;

