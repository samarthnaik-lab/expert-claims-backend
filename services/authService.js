import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import UserModel from '../models/UserModel.js';
import SessionModel from '../models/SessionModel.js';
import OTPModel from '../models/OTPModel.js';
import CustomerModel from '../models/CustomerModel.js';

class AuthService {
  
  static generateOTP() {
    // Generate 4-digit OTP (1000-9999)
    return Math.floor(1000 + Math.random() * 9000);
  }

  
  /**
   * Verify password against stored hash
   * Supports:
   * 1. Real bcrypt hashes (properly hashed passwords) - RECOMMENDED
   * 2. Fake bcrypt hashes (legacy - for migration period only)
   * 3. Plain text (legacy - for migration period only)
   * 
   * Expected: Frontend sends plain password, backend compares with stored bcrypt hash
   * Legacy: Frontend may send fake hash, backend compares fake hashes directly
   */
  static async verifyPassword(inputPassword, storedPassword) {
    if (!inputPassword || !storedPassword) {
      return false;
    }

    // Check if stored password is a bcrypt hash format (starts with $2a$, $2b$, or $2y$)
    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
      // Check if input is also a hash format (legacy fake hash from frontend)
      if (inputPassword.startsWith('$2a$') || inputPassword.startsWith('$2b$') || inputPassword.startsWith('$2y$')) {
        // Both are hash format - could be fake hashes or real bcrypt hashes
        // Try bcrypt comparison first (in case both are real bcrypt hashes - shouldn't happen but handle it)
        // If that fails, compare directly (for fake hashes)
        try {
          // Note: bcrypt.compare with two hashes won't work, but try anyway
          // Real bcrypt hashes can't be compared directly - need plain password
          // So if both are hashes, they're likely fake hashes - compare directly
          if (inputPassword === storedPassword) {
            // Check if it's a fake hash (fake hashes have predictable patterns)
            const isFakeHash = storedPassword.length < 60 || !storedPassword.match(/^\$2[ab]\$10\$[A-Za-z0-9./]{53}$/);
            if (isFakeHash) {
              console.warn('Using legacy fake hash comparison - should migrate to proper bcrypt');
            }
            return true;
          }
          return false;
        } catch (error) {
          // If comparison fails, return false
          return false;
        }
      } else {
        // Input is plain password, stored is hash - use proper bcrypt.compare
        try {
          const result = await bcrypt.compare(inputPassword, storedPassword);
          if (result) {
            console.log('Password verified using bcrypt.compare');
          }
          return result;
        } catch (error) {
          console.error('Bcrypt comparison error:', error);
          // If bcrypt comparison fails, it might be a fake hash stored in DB
          // Try comparing as strings (for fake hash migration)
          return false;
        }
      }
    }
    
    // Legacy: plain text comparison (for migration period only)
    // This allows existing plain text passwords to work during transition
    console.warn('Using plain text password comparison - should migrate to bcrypt');
    return inputPassword === storedPassword;
  }

  /**
   * Hash a plain password using bcrypt
   * @param {string} plainPassword - Plain text password to hash
   * @returns {Promise<string>} - Bcrypt hash
   */
  static async hashPassword(plainPassword) {
    const saltRounds = 10;
    return await bcrypt.hash(plainPassword, saltRounds);
  }

  static async validateCredentials(email, password, role, updateLastLogin = false) {
    try {
      console.log('Validating credentials:', { email, role, hasPassword: !!password });
      
      // Validate input parameters
      if (!email || !password || !role) {
        return { valid: false, user: null, error: 'Email, password, and role are required' };
      }

      // Check email and role
      const { data: user, error } = await UserModel.findByEmailAndRole(email, role);

      if (error) {
        // Check if it's a "no rows" error (PGRST116) vs actual database error
        if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
          console.error('User not found:', { email, role });
          return { valid: false, user: null, error: 'Invalid email or role' };
        }
        console.error('Database error finding user:', error);
        return { valid: false, user: null, error: 'Database error occurred. Please try again.' };
      }

      if (!user) {
        console.error('User not found:', { email, role });
        // Log failed login attempt (user doesn't exist)
        return { valid: false, user: null, error: 'Invalid email or role' };
      }

      // Note: deleted_flag check is now handled in UserModel.findByEmailAndRole
      // But we keep this as a safety check
      if (user.deleted_flag === true) {
        console.error('Attempted login with deleted user:', { userId: user.user_id, email });
        return { valid: false, user: null, error: 'Account not found' };
      }

      console.log('User found:', { userId: user.user_id, email: user.email });

      // Check password
      // Note: If frontend sends bcrypt hash, we compare hashes directly (legacy)
      // If frontend sends plain password, we use bcrypt.compare (recommended)
      const passwordMatch = await this.verifyPassword(password, user.password_hash);
      
      console.log('Password verification result:', passwordMatch ? 'MATCH' : 'NO MATCH');

      if (!passwordMatch) {
        console.error('Password mismatch for user:', user.user_id);
        // Log failed login attempt
        try {
          await UserModel.incrementFailedLoginAttempts(user.user_id);
        } catch (logError) {
          console.error('Failed to log failed login attempt:', logError);
        }
        return { valid: false, user: null, error: 'Invalid password' };
      }

      // Update last_login timestamp if requested
      if (updateLastLogin) {
        try {
          const { error: updateError } = await UserModel.updateLastLogin(user.user_id);
          if (updateError) {
            console.error('Failed to update last_login:', updateError);
            // Don't fail login if last_login update fails, just log it
          } else {
            console.log('Last login updated for user:', user.user_id);
          }
        } catch (error) {
          console.error('Error updating last_login:', error);
          // Continue with login even if last_login update fails
        }
      }

      console.log('Credentials validated successfully');
      return { valid: true, user, error: null };
    } catch (error) {
      console.error('Error in validateCredentials:', error);
      return { valid: false, user: null, error: 'An error occurred during validation. Please try again.' };
    }
  }

  /**
   * Format mobile number with country code
   * @param {string} mobileNumber - Mobile number to format
   * @returns {string} - Formatted mobile number with country code
   */
  static formatMobileNumber(mobileNumber) {
    // Clean mobile number (remove any non-digit characters except +)
    let cleanMobile = mobileNumber.replace(/[^\d+]/g, '');
    
    // Add +91 country code if not present
    if (cleanMobile.startsWith('+91')) {
      return cleanMobile;
    } else if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      return '+' + cleanMobile;
    } else if (cleanMobile.startsWith('0')) {
      return '+91' + cleanMobile.substring(1);
    } else if (cleanMobile.length === 10) {
      return '+91' + cleanMobile;
    } else if (!cleanMobile.startsWith('+')) {
      return '+91' + cleanMobile;
    }
    return cleanMobile;
  }

  /**
   * Send OTP using msg91 Widget API
   * Widget API generates and sends OTP - we don't generate it ourselves
   * @param {string} mobileNumber - Mobile number to send OTP to
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>}
   */
  static async sendOTP(mobileNumber) {
    try {
      const widgetId = process.env.MSG91_WIDGET_ID;
      const msg91ApiKey = process.env.MSG91_API_KEY;

      if (!widgetId || !msg91ApiKey) {
        console.error('MSG91 configuration missing. Please set MSG91_WIDGET_ID and MSG91_API_KEY in environment variables.');
        return { success: false, error: 'SMS service configuration missing' };
      }

      // Format mobile number with country code
      const cleanMobile = this.formatMobileNumber(mobileNumber);
      
      const requestBody = {
        widgetId: widgetId,
        identifier: cleanMobile
      };

      console.log(`[MSG91 Widget] Sending OTP request to ${cleanMobile}`);

      const response = await axios.post('https://api.msg91.com/api/v5/widget/sendOtp', requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'authkey': msg91ApiKey
        }
      });

      // Log the full response to understand what msg91 returns
      console.log(`[MSG91 Widget] sendOtp Response:`, {
        status: response.status,
        statusText: response.statusText,
        fullResponse: JSON.stringify(response.data, null, 2),
        dataType: typeof response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        headers: response.headers ? Object.keys(response.headers) : [],
        fullHeaders: response.headers
      });
      
      // Also check if reqId might be in headers
      if (response.headers) {
        console.log(`[MSG91 Widget] Checking headers for reqId/requestId:`, {
          'x-request-id': response.headers['x-request-id'],
          'request-id': response.headers['request-id'],
          'x-req-id': response.headers['x-req-id']
        });
      }

      if (response.data && response.data.type === 'success') {
        // msg91 widget API returns reqId in the "message" field!
        // The message field contains the reqId (hex string like "356c7268306d333932333833")
        const reqId = response.data.message || null;
        
        // Also try other possible field names (for compatibility)
        const requestId = reqId || 
                         response.data.requestId || 
                         response.data.request_id || 
                         response.data.reqId || 
                         response.data.req_id ||
                         response.data.id ||
                         null;
        
        // Log what we extracted
        console.log(`[MSG91 Widget] Response extraction:`, {
          'response.data.message': response.data.message,
          'response.data.requestId': response.data.requestId,
          'response.data.request_id': response.data.request_id,
          'response.data.reqId': response.data.reqId,
          'response.data.req_id': response.data.req_id,
          'response.data.id': response.data.id,
          'Final reqId (from message)': reqId,
          'Final requestId': requestId
        });
        
        // Store all relevant response data
        const responseData = {
          requestId: requestId, // Store reqId as requestId in database
          reqId: reqId, // Also store as reqId for clarity
          message: response.data.message, // Original message field
          type: response.data.type,
          fullResponse: response.data // Store full response for reference
        };
        
        console.log(`[MSG91 Widget] OTP sent successfully. Extracted data:`, responseData);
        
        if (!reqId) {
          console.error('[MSG91 Widget] ERROR: reqId (message field) is null in response. Cannot proceed.');
          return { success: false, error: 'Failed to get reqId from msg91 response' };
        }
        
        return { success: true, requestId: reqId, responseData };
      } else {
        console.error('[MSG91 Widget] API error:', response.data);
        return { success: false, error: response.data.message || 'Failed to send OTP', responseData: response.data };
      }
    } catch (error) {
      console.error('[MSG91 Widget] Error:', error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message || 'Failed to send OTP' 
      };
    }
  }

  /**
   * Verify OTP using msg91 Widget API
   * 
   * verifyOtp Request Body Requirements:
   * - widgetId: From environment variable (MSG91_WIDGET_ID)
   * - identifier: Mobile number (MUST match exact format used in sendOtp)
   * - otp: OTP code entered by user
   * 
   * These values come from:
   * - widgetId: process.env.MSG91_WIDGET_ID
   * - identifier: stored in user_otp.mobile_number (from sendOtp)
   * - otp: user input (also stored in user_otp.otp_code when user enters it)
   * 
   * Note: requestId is NOT sent in verifyOtp request body - it's only for tracking/logging
   * 
   * @param {string} mobileNumber - Mobile number (identifier) - from user_otp.mobile_number
   * @param {string} otpCode - OTP code entered by user - also stored in user_otp.otp_code
   * @param {string} requestId - RequestId from sendOtp (for logging only, not sent to API)
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  static async verifyOTPWithMsg91(mobileNumber, otpCode, requestId) {
    try {
      const widgetId = process.env.MSG91_WIDGET_ID;
      const msg91ApiKey = process.env.MSG91_API_KEY;

      if (!widgetId || !msg91ApiKey) {
        console.error('[MSG91 Widget] Missing widgetId or API key');
        return { valid: false, error: 'MSG91 configuration missing' };
      }

      // Format mobile number exactly the same way as when sending OTP
      let cleanMobile = this.formatMobileNumber(mobileNumber);
      
      // msg91 widget API might expect identifier without + sign or in a specific format
      // Try both with and without + sign - but first check what format was used during send
      // For now, let's use the format as-is (with +91)
      let identifier = cleanMobile;
      
      // Some msg91 APIs expect number without +, let's try removing it
      // But we need to be consistent with what we sent during sendOtp
      // If sendOtp used +917780633994, verify should use the same
      
      // msg91 verifyOtp requires reqId in the request body
      // Use the requestId stored in database (maps to reqId)
      const reqId = requestId; // Use the requestId we stored
      
      if (!reqId) {
        console.error('[MSG91 Widget] ERROR: reqId is required for verifyOtp but is null. Cannot verify without reqId.');
        return { 
          valid: false, 
          error: 'OTP verification failed: Missing request ID. Please request a new OTP.' 
        };
      }
      
      const requestBody = {
        widgetId: widgetId,
        identifier: identifier, // Use the same format as sendOtp
        otp: otpCode.toString().trim(), // Ensure OTP is string and trimmed
        reqId: reqId // msg91 REQUIRES this field - must come from sendOtp response
      };

      console.log(`[MSG91 Widget] Verifying OTP:`, {
        widgetId: widgetId,
        identifier: identifier,
        otp: otpCode,
        requestId: requestId,
        mobileNumber: mobileNumber
      });

      const response = await axios.post('https://api.msg91.com/api/v5/widget/verifyOtp', requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'authkey': msg91ApiKey
        }
      });

      console.log(`[MSG91 Widget] Verification response:`, {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });

      if (response.data && response.data.type === 'success') {
        console.log(`[MSG91 Widget] OTP verified successfully`);
        return { valid: true };
      } else {
        const errorMsg = response.data?.message || response.data?.error || 'Invalid OTP';
        console.error('[MSG91 Widget] OTP verification failed:', {
          response: response.data,
          message: errorMsg
        });
        return { valid: false, error: errorMsg };
      }
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      console.error('[MSG91 Widget] Verification error:', errorDetails);
      
      const errorMsg = error.response?.data?.message || 
                      error.response?.data?.error || 
                      error.message || 
                      'OTP verification failed';
      
      return { 
        valid: false, 
        error: errorMsg 
      };
    }
  }

  /**
   * Send OTP to email (for admin role)
   */
  static async sendOTPToEmail(email, otp) {
    console.log(`OTP ${otp} sent to email ${email}`);
    // TODO: Implement actual email sending service
    // For now, return OTP so frontend can display it
    return { success: true, otp };
  }

  /**
   * Generate and save OTP request for user using msg91 Widget API
   * Widget API generates and sends OTP - we only store metadata
   */
  static async generateAndSaveOTP(email, role, mobile) {
    const { data: user, error: userError } = await UserModel.findByEmailAndRole(email, role);
    
    if (userError || !user) {
      return { success: false, error: 'User not found' };
    }

    // Always use mobile_number from users table (user has updated it)
    const mobileNumber = user.mobile_number || mobile;
    
    if (!mobileNumber) {
      return { success: false, error: 'Mobile number not found. Please update your mobile number in the system.' };
    }

    // Store original mobile number (without +91 extension) for database
    // This is the number as stored in users table (e.g., "7780633994")
    const originalMobileNumber = mobileNumber;
    
    // Format the mobile number for msg91 API (add +91 extension)
    const formattedMobile = this.formatMobileNumber(mobileNumber);
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    console.log(`[MSG91 Widget] Requesting OTP for user ${user.user_id} (${email}) - Original: ${originalMobileNumber}, Formatted for msg91: ${formattedMobile}`);

    // Send OTP request via msg91 Widget API (widget generates OTP)
    // Use formatted mobile number (with +91) for msg91 API
    const sendResult = await this.sendOTP(formattedMobile);
    
    if (!sendResult.success) {
      console.error('[MSG91 Widget] Failed to send OTP:', sendResult.error);
      return { 
        success: false, 
        error: sendResult.error || 'Failed to send OTP. Please try again.' 
      };
    }

    // Prepare OTP metadata for database
    // From sendOtp API response, we receive:
    // - requestId (required for verifyOtp) - comes from message field
    // - message (contains reqId)
    // - type: 'success'
    // The actual OTP code is generated by msg91 and sent to user - we don't receive it
    
    const otpData = {
      user_id: user.user_id,
      mobile_number: originalMobileNumber, // Store WITHOUT +91 extension (original format)
      otp_code: null, // Widget API generates OTP - we don't receive it in response, will be stored when user enters it
      purpose: 'login',
      expires_at: expiresAt.toISOString(),
      is_used: false,
      attempts: '0',
      max_attempts: 3,
      created_by: user.user_id.toString(),
      created_time: new Date().toISOString(),
      requestId: sendResult.requestId || null // requestId from sendOtp response (required for verifyOtp)
    };

    // Save OTP metadata to database
    console.log(`[MSG91 Widget] Saving OTP metadata to database:`, {
      requestId: sendResult.requestId,
      mobile_number: formattedMobile,
      user_id: user.user_id,
      fullOtpData: otpData
    });
    const { data: otpRecord, error: otpError } = await OTPModel.create(otpData);

    if (otpError) {
      console.error('[MSG91 Widget] Failed to save OTP metadata:', otpError);
      return { success: false, error: 'Failed to save OTP metadata: ' + (otpError.message || JSON.stringify(otpError)) };
    }

    console.log(`[MSG91 Widget] OTP request sent successfully. RequestId: ${sendResult.requestId}, OTP ID: ${otpRecord?.otp_id}`);

    return { 
      success: true, 
      otp: null, // Widget API generates OTP - we don't know it
      mobile: originalMobileNumber, // Return original mobile (without extension) for display
      contactType: 'mobile',
      expiresAt: expiresAt.toISOString(),
      requestId: sendResult.requestId
    };
  }

  static async verifyOTP(email, role, otpCode) {
    console.log(`[OTP Verify] Starting verification for ${email}, role: ${role}, OTP: ${otpCode}`);
    
    const { data: user, error: userError } = await UserModel.findByEmailAndRole(email, role);

    if (userError || !user) {
      console.error(`[OTP Verify] User not found:`, userError);
      return { valid: false, error: 'User not found' };
    }

    console.log(`[OTP Verify] User found: ${user.user_id}, mobile: ${user.mobile_number}`);

    // Get the active OTP record to get requestId
    const { data: activeOTP, error: otpRecordError } = await OTPModel.findActiveOTP(user.user_id, 'login');

    if (otpRecordError) {
      console.error(`[OTP Verify] Error finding OTP record:`, otpRecordError);
    }

    if (!activeOTP) {
      console.error(`[OTP Verify] No active OTP found for user ${user.user_id}`);
      return { valid: false, error: 'OTP request not found or expired. Please request a new OTP.' };
    }

    console.log(`[OTP Verify] Found OTP record:`, {
      otp_id: activeOTP.otp_id,
      requestId: activeOTP.requestId,
      mobile_number: activeOTP.mobile_number,
      is_used: activeOTP.is_used,
      expires_at: activeOTP.expires_at
    });

    // requestId (reqId) is REQUIRED for verifyOtp API
    // It comes from the message field in sendOtp response
    if (!activeOTP.requestId) {
      console.error(`[OTP Verify] ERROR: requestId (reqId) is required for verifyOtp but is null in OTP record.`);
      return { valid: false, error: 'OTP verification failed: Missing request ID. Please request a new OTP.' };
    }

    // Get mobile number from OTP record (stored WITHOUT +91 extension)
    // Format it with +91 for msg91 API (same format as sendOtp)
    const originalMobileNumber = activeOTP.mobile_number || user.mobile_number;
    const mobileForVerification = this.formatMobileNumber(originalMobileNumber);
    
    console.log(`[OTP Verify] Mobile from DB: ${originalMobileNumber}, Formatted for msg91: ${mobileForVerification}`);
    
    // Store the user-entered OTP in the database row
    console.log(`[OTP Verify] Storing user-entered OTP '${otpCode}' in database row ${activeOTP.otp_id}...`);
    const updateError = await OTPModel.updateOTPCode(activeOTP.otp_id, otpCode);
    if (updateError.error) {
      console.warn(`[OTP Verify] Failed to update OTP code in database (non-critical):`, updateError.error);
    }
    
    // Verify OTP using msg91 Widget API
    // verifyOtp request body requires:
    // - widgetId (from env)
    // - identifier (mobile_number with +91 - same format as sendOtp)
    // - otp (user-entered OTP code)
    // - reqId (from requestId stored in database)
    const verifyResult = await this.verifyOTPWithMsg91(
      mobileForVerification, // Use formatted number (with +91) for msg91
      otpCode, 
      activeOTP.requestId // reqId for verifyOtp request
    );

    if (!verifyResult.valid) {
      console.error(`[OTP Verify] msg91 verification failed:`, verifyResult.error);
      // Increment attempts
      await OTPModel.incrementAttempts(activeOTP.otp_id);
      return { valid: false, error: verifyResult.error || 'Invalid OTP' };
    }

    console.log(`[OTP Verify] OTP verified successfully, marking as used`);
    // Mark OTP as used in our database
    await OTPModel.markAsUsed(activeOTP.otp_id);

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

  /**
   * Check if customer exists by mobile number
   * @param {string} phoneNumber - Phone number to check
   * @returns {Promise<{exists: boolean, customer?: object, error?: string}>}
   */
  static async checkCustomerExists(phoneNumber) {
    try {
      console.log(`[Customer Login] Checking if customer exists with phone: ${phoneNumber}`);
      
      const { data: customer, error } = await CustomerModel.findByMobileNumber(phoneNumber);
      
      if (error) {
        console.error(`[Customer Login] Error finding customer:`, error);
        return { exists: false, customer: null, error: 'Database error occurred' };
      }
      
      if (!customer) {
        console.log(`[Customer Login] Customer not found with phone: ${phoneNumber}`);
        return { exists: false, customer: null, error: null };
      }
      
      console.log(`[Customer Login] Customer found:`, {
        customer_id: customer.customer_id,
        user_id: customer.user_id,
        mobile_number: customer.mobile_number
      });
      
      return { exists: true, customer, error: null };
    } catch (error) {
      console.error(`[Customer Login] Exception checking customer:`, error);
      return { exists: false, customer: null, error: 'An error occurred while checking customer' };
    }
  }

  /**
   * Generate and save OTP for customer login
   * @param {string} phoneNumber - Customer's phone number
   * @returns {Promise<{success: boolean, requestId?: string, mobile?: string, expiresAt?: string, error?: string}>}
   */
  static async generateAndSaveOTPForCustomer(phoneNumber) {
    try {
      console.log(`[Customer Login] Generating OTP for customer phone: ${phoneNumber}`);
      
      // Find customer by phone number
      const { data: customer, error: customerError } = await CustomerModel.findByMobileNumber(phoneNumber);
      
      if (customerError || !customer) {
        console.error(`[Customer Login] Customer not found:`, customerError);
        return { success: false, error: 'Customer not found' };
      }
      
      if (!customer.user_id) {
        console.error(`[Customer Login] Customer has no user_id:`, customer.customer_id);
        return { success: false, error: 'Customer account is not properly linked' };
      }
      
      // Store original mobile number (without +91 extension) for database
      const originalMobileNumber = phoneNumber.replace(/[^\d]/g, '');
      // Remove +91 prefix if present
      let cleanMobile = originalMobileNumber;
      if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
        cleanMobile = cleanMobile.substring(2);
      }
      
      // Format the mobile number for msg91 API (add +91 extension)
      const formattedMobile = this.formatMobileNumber(cleanMobile);
      
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
      
      console.log(`[Customer Login] Requesting OTP for customer ${customer.customer_id} (user_id: ${customer.user_id}) - Original: ${cleanMobile}, Formatted for msg91: ${formattedMobile}`);
      
      // Send OTP request via msg91 Widget API
      const sendResult = await this.sendOTP(formattedMobile);
      
      if (!sendResult.success) {
        console.error('[Customer Login] Failed to send OTP:', sendResult.error);
        return { 
          success: false, 
          error: sendResult.error || 'Failed to send OTP. Please try again.' 
        };
      }
      
      // Prepare OTP metadata for database
      const otpData = {
        user_id: customer.user_id,
        mobile_number: cleanMobile, // Store WITHOUT +91 extension
        otp_code: null, // Widget API generates OTP - we don't receive it
        purpose: 'login',
        expires_at: expiresAt.toISOString(),
        is_used: false,
        attempts: '0',
        max_attempts: 3,
        created_by: customer.user_id.toString(),
        created_time: new Date().toISOString(),
        requestId: sendResult.requestId || null // requestId from sendOtp response
      };
      
      // Save OTP metadata to database
      console.log(`[Customer Login] Saving OTP metadata to database:`, {
        requestId: sendResult.requestId,
        mobile_number: formattedMobile,
        user_id: customer.user_id,
        fullOtpData: otpData
      });
      
      const { data: otpRecord, error: otpError } = await OTPModel.create(otpData);
      
      if (otpError) {
        console.error('[Customer Login] Failed to save OTP metadata:', otpError);
        return { success: false, error: 'Failed to save OTP metadata: ' + (otpError.message || JSON.stringify(otpError)) };
      }
      
      console.log(`[Customer Login] OTP request sent successfully. RequestId: ${sendResult.requestId}, OTP ID: ${otpRecord?.otp_id}`);
      
      return { 
        success: true, 
        otp: null, // Widget API generates OTP - we don't know it
        mobile: cleanMobile, // Return original mobile (without extension) for display
        contactType: 'mobile',
        expiresAt: expiresAt.toISOString(),
        requestId: sendResult.requestId
      };
    } catch (error) {
      console.error('[Customer Login] Exception in generateAndSaveOTPForCustomer:', error);
      return { success: false, error: 'An error occurred while generating OTP' };
    }
  }

  /**
   * Verify OTP for customer login
   * @param {string} phoneNumber - Customer's phone number
   * @param {string} otpCode - OTP code entered by user
   * @returns {Promise<{valid: boolean, customer?: object, user?: object, error?: string}>}
   */
  static async verifyOTPForCustomer(phoneNumber, otpCode) {
    try {
      console.log(`[Customer Login] Verifying OTP for phone: ${phoneNumber}, OTP: ${otpCode}`);
      
      // Find customer by phone number
      const { data: customer, error: customerError } = await CustomerModel.findByMobileNumber(phoneNumber);
      
      if (customerError || !customer) {
        console.error(`[Customer Login] Customer not found:`, customerError);
        return { valid: false, error: 'Customer not found' };
      }
      
      if (!customer.user_id) {
        console.error(`[Customer Login] Customer has no user_id:`, customer.customer_id);
        return { valid: false, error: 'Customer account is not properly linked' };
      }
      
      console.log(`[Customer Login] Customer found: customer_id=${customer.customer_id}, user_id=${customer.user_id}`);
      
      // Get the active OTP record to get requestId
      const { data: activeOTP, error: otpRecordError } = await OTPModel.findActiveOTP(customer.user_id, 'login');
      
      if (otpRecordError) {
        console.error(`[Customer Login] Error finding OTP record:`, otpRecordError);
      }
      
      if (!activeOTP) {
        console.error(`[Customer Login] No active OTP found for user ${customer.user_id}`);
        return { valid: false, error: 'OTP request not found or expired. Please request a new OTP.' };
      }
      
      console.log(`[Customer Login] Found OTP record:`, {
        otp_id: activeOTP.otp_id,
        requestId: activeOTP.requestId,
        mobile_number: activeOTP.mobile_number,
        is_used: activeOTP.is_used,
        expires_at: activeOTP.expires_at
      });
      
      // requestId (reqId) is REQUIRED for verifyOtp API
      if (!activeOTP.requestId) {
        console.error(`[Customer Login] ERROR: requestId (reqId) is required for verifyOtp but is null in OTP record.`);
        return { valid: false, error: 'OTP verification failed: Missing request ID. Please request a new OTP.' };
      }
      
      // Get mobile number from OTP record (stored WITHOUT +91 extension)
      // Format it with +91 for msg91 API (same format as sendOtp)
      const originalMobileNumber = activeOTP.mobile_number || phoneNumber.replace(/[^\d]/g, '');
      // Remove +91 prefix if present
      let cleanMobile = originalMobileNumber;
      if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
        cleanMobile = cleanMobile.substring(2);
      }
      const mobileForVerification = this.formatMobileNumber(cleanMobile);
      
      console.log(`[Customer Login] Mobile from DB: ${cleanMobile}, Formatted for msg91: ${mobileForVerification}`);
      
      // Store the user-entered OTP in the database row
      console.log(`[Customer Login] Storing user-entered OTP '${otpCode}' in database row ${activeOTP.otp_id}...`);
      const updateError = await OTPModel.updateOTPCode(activeOTP.otp_id, otpCode);
      if (updateError.error) {
        console.warn(`[Customer Login] Failed to update OTP code in database (non-critical):`, updateError.error);
      }
      
      // Verify OTP using msg91 Widget API
      const verifyResult = await this.verifyOTPWithMsg91(
        mobileForVerification, // Use formatted number (with +91) for msg91
        otpCode, 
        activeOTP.requestId // reqId for verifyOtp request
      );
      
      if (!verifyResult.valid) {
        console.error(`[Customer Login] msg91 verification failed:`, verifyResult.error);
        // Increment attempts
        await OTPModel.incrementAttempts(activeOTP.otp_id);
        return { valid: false, error: verifyResult.error || 'Invalid OTP' };
      }
      
      console.log(`[Customer Login] OTP verified successfully, marking as used`);
      // Mark OTP as used in our database
      await OTPModel.markAsUsed(activeOTP.otp_id);
      
      // Get user details for session creation
      const { data: user, error: userError } = await UserModel.findByUserId(customer.user_id);
      
      if (userError || !user) {
        console.error(`[Customer Login] User not found for user_id ${customer.user_id}:`, userError);
        return { valid: false, error: 'User account not found' };
      }
      
      return { valid: true, customer, user, error: null };
    } catch (error) {
      console.error('[Customer Login] Exception in verifyOTPForCustomer:', error);
      return { valid: false, error: 'An error occurred during OTP verification' };
    }
  }
}

export default AuthService;
