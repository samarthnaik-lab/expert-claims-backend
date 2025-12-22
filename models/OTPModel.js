import supabase from '../config/database.js';

class OTPModel {
  // Generate a unique otp_id
  static async generateOtpId() {
    // Get the max otp_id from the table and increment it
    // If table is empty, start from 1
    const { data: maxRecord, error } = await supabase
      .from('user_otp')
      .select('otp_id')
      .order('otp_id', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // If error is not "no rows", log it but continue
      console.warn('Error getting max otp_id:', error);
    }

    // Use timestamp-based ID as fallback/primary method for uniqueness
    // Combine timestamp (milliseconds) with random number for uniqueness
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const generatedId = timestamp * 1000 + random;

    // If we got a max record, use max + 1, otherwise use generated ID
    const nextId = maxRecord && maxRecord.otp_id 
      ? maxRecord.otp_id + 1 
      : generatedId;

    return nextId;
  }

  // Create a new OTP record
  static async create(otpData) {
    // Remove otp_id from data if present - let database auto-generate it
    // otp_id is likely a SERIAL/BIGSERIAL column that auto-increments
    const { otp_id, ...dataToInsert } = otpData;

    const { data, error } = await supabase
      .from('user_otp')
      .insert([dataToInsert])
      .select()
      .single();

    return { data, error };
  }

  // Get active OTP by user_id and purpose
  static async findActiveOTP(userId, purpose = 'login') {
    try {
      const { data, error } = await supabase
        .from('user_otp')
        .select('*')
        .eq('user_id', userId)
        .eq('purpose', purpose)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_time', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() to return null instead of error when no rows

      // If no error but also no data, it means no active OTP found
      if (!error && !data) {
        // Try to find any recent OTP (even expired) for debugging
        const { data: recentOTP } = await supabase
          .from('user_otp')
          .select('*')
          .eq('user_id', userId)
          .eq('purpose', purpose)
          .order('created_time', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (recentOTP) {
          console.log(`[OTPModel] Found recent OTP (may be expired/used):`, {
            otp_id: recentOTP.otp_id,
            is_used: recentOTP.is_used,
            expires_at: recentOTP.expires_at,
            requestId: recentOTP.requestId
          });
        }
        
        return { data: null, error: { message: 'No active OTP found', code: 'NO_ACTIVE_OTP' } };
      }

      return { data, error };
    } catch (err) {
      console.error('[OTPModel] Exception in findActiveOTP:', err);
      return { data: null, error: err };
    }
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

  // Update requestId for an OTP record
  static async updateRequestId(otpId, requestId) {
    const { error } = await supabase
      .from('user_otp')
      .update({
        requestId: requestId
      })
      .eq('otp_id', otpId);

    return { error };
  }

  // Update OTP code when user enters it
  static async updateOTPCode(otpId, otpCode) {
    const { error } = await supabase
      .from('user_otp')
      .update({
        otp_code: otpCode
      })
      .eq('otp_id', otpId);

    return { error };
  }
}

export default OTPModel;

