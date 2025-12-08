import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import UserModel from '../models/UserModel.js';
import SessionModel from '../models/SessionModel.js';
import OTPModel from '../models/OTPModel.js';

class AuthService {
  
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
  }

  
  static verifyPassword(inputPassword, storedPassword) {
    console.log('Password comparison:', { 
      inputLength: inputPassword?.length, 
      storedLength: storedPassword?.length,
      inputPreview: inputPassword?.substring(0, 10) + '...',
      storedPreview: storedPassword?.substring(0, 10) + '...'
    });
    return inputPassword === storedPassword;
  }

  static async validateCredentials(email, password, role, updateLastLogin = false) {
    try {
      console.log('Validating credentials:', { email, role, hasPassword: !!password });
      
      // Check email and role
      const { data: user, error } = await UserModel.findByEmailAndRole(email, role);

      if (error) {
        console.error('Database error finding user:', error);
        return { valid: false, user: null, error: 'Invalid email or role' };
      }

      if (!user) {
        console.error('User not found:', { email, role });
        return { valid: false, user: null, error: 'Invalid email or role' };
      }

      console.log('User found:', { userId: user.user_id, email: user.email });

      // Check password
      const passwordMatch = this.verifyPassword(password, user.password_hash);

      if (!passwordMatch) {
        console.error('Password mismatch for user:', user.user_id);
        return { valid: false, user: null, error: 'Invalid password' };
      }

      console.log('Credentials validated successfully');
      return { valid: true, user, error: null };
    } catch (error) {
      console.error('Error in validateCredentials:', error);
      return { valid: false, user: null, error: 'Validation error' };
    }
  }

  static async sendOTP(mobile, otp) {
    console.log(`OTP ${otp} sent to ${mobile}`);
    return { success: true };
  }

  static async generateAndSaveOTP(email, role, mobile) {
    const { data: user, error: userError } = await UserModel.findByEmailAndRole(email, role);
    
    if (userError || !user) {
      return { success: false, error: 'User not found' };
    }

    const mobileNumber = mobile || user.mobile_number;
    
    if (!mobileNumber) {
      return { success: false, error: 'Mobile number not found' };
    }

    const otpCode = this.generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { data: otpRecord, error: otpError } = await OTPModel.create({
      user_id: user.user_id,
      mobile_number: mobileNumber,
      otp_code: otpCode,
      purpose: 'login',
      expires_at: expiresAt.toISOString(),
      is_used: false,
      attempts: '0',
      max_attempts: 3,
      created_time: new Date().toISOString()
    });

    if (otpError) {
      return { success: false, error: 'Failed to save OTP' };
    }

    await this.sendOTP(mobileNumber, otpCode);

    return { success: true, otp: otpCode, mobile: mobileNumber };
  }

  static async verifyOTP(email, role, otpCode) {
    const { data: user, error: userError } = await UserModel.findByEmailAndRole(email, role);

    if (userError || !user) {
      return { valid: false, error: 'User not found' };
    }

    const { valid, error } = await OTPModel.verifyOTP(user.user_id, otpCode, 'login');

    if (!valid) {
      const { data: activeOTP } = await OTPModel.findActiveOTP(user.user_id, 'login');
      if (activeOTP) {
        await OTPModel.incrementAttempts(activeOTP.otp_id);
      }
      return { valid: false, error: error || 'Invalid OTP' };
    }

    return { valid: true, user, error: null };
  }

  static generateJWT(userId, email, role) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }
    return jwt.sign(
      {
        user_id: userId,
        email,
        role: role.toLowerCase()
      },
      secret,
      { expiresIn: '3h' }
    );
  }

  static generateSessionId() {
    return uuidv4();
  }

  static async createSession(userId, jwtToken, expiresAt, req = null) {
    const sessionId = uuidv4();
    const expiresAtISO = new Date(expiresAt).toISOString();
    const now = new Date().toISOString();

    const sessionData = {
      session_id: sessionId,
      user_id: userId,
      jwt_token: jwtToken,
      updated_time: now,
      expires_at: expiresAtISO,
      created_by: 'system',
      updated_by: 'system'
    };

    // Add optional fields if available
    if (req) {
      sessionData.ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      sessionData.user_agent = req.headers['user-agent'] || null;
    }

    const { data, error } = await SessionModel.create(sessionData);

    if (error) {
      console.error('Session creation error:', error);
      return { success: false, error: 'Failed to create session', sessionId: null };
    }

    return { success: true, sessionId, error: null };
  }

  static getUserId(user) {
    return user.user_id || user.id || user.userId;
  }
}

export default AuthService;
