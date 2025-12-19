import jwt from 'jsonwebtoken';
import AuthService from '../services/authService.js';
import SessionModel from '../models/SessionModel.js';

class AuthController {
  // Login endpoint handler
  static async login(req, res) {
    try {
      console.log('Login request received:', {
        body: req.body,
        hasEmail: !!req.body.email,
        hasPassword: !!req.body.password,
        hasRole: !!req.body.role
      });
      
      const { email, password, role, otp, mobile, step } = req.body;

      // Validate required fields
      if (!email || !password || !role) {
        console.error('Missing required fields:', { email: !!email, password: !!password, role: !!role });
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: email, password, and role are required',
          statusCode: 400
        });
      }

      // Validate role
      const validRoles = ['admin', 'employee', 'customer', 'partner'];
      const normalizedRole = role.toLowerCase();
      if (!validRoles.includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be one of: employee, partner, customer, admin',
          statusCode: 400
        });
      }

      
      if (normalizedRole === 'employee' || normalizedRole === 'partner') {
        return await AuthController.handleDirectLogin(email, password, normalizedRole, req, res);
      }


      if (normalizedRole === 'customer' || normalizedRole === 'admin') {
        return await AuthController.handleTwoStepLogin(email, password, normalizedRole, otp, mobile, step, req, res);
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid role',
        statusCode: 400
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  
  static async handleDirectLogin(email, password, role, req, res) {
    try {
      console.log('Login attempt:', { email, role });
      
      const { valid, user, error } = await AuthService.validateCredentials(email, password, role, true);

      if (!valid) {
        console.error('Invalid credentials:', { email, role, error });
        // Return specific error message without revealing too much
        const errorMessage = error || 'Invalid credentials';
        return res.status(401).json({
          status: 'error',
          success: false,
          message: errorMessage,
          statusCode: 401
        });
      }

      console.log('Credentials validated, creating session for user:', user.user_id);
      
      const userId = AuthService.getUserId(user);
      const jwtToken = AuthService.generateJWT(userId, user.email, role);
      console.log('JWT token generated');

      // 3 hours from now
      const expiresAt = new Date(Date.now() + (3 * 60 * 60 * 1000));

      const sessionResult = await AuthService.createSession(userId, jwtToken, expiresAt, req);

      if (!sessionResult.success) {
        console.error('Session creation failed:', sessionResult.error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create session: ' + (sessionResult.error || 'Unknown error'),
          statusCode: 500
        });
      }

      console.log('Login successful, returning response');
      
      // Calculate session expiry details for frontend display
      const expiresAtISO = expiresAt.toISOString();
      const expiresAtTimestamp = expiresAt.getTime();
      const expiresInSeconds = Math.floor((expiresAtTimestamp - Date.now()) / 1000);

      const response = {
        status: 'success', // For frontend to recognize success
        success: true, // For frontend to recognize success
        statusCode: 200, // HTTP status code
        message: 'Login successful',
        token: jwtToken,
        jwtToken: jwtToken, // For frontend localStorage compatibility
        session_id: sessionResult.sessionId,
        sessionId: sessionResult.sessionId, // For frontend localStorage compatibility
        userId: userId.toString(), // For frontend localStorage
        userRole: role, // For frontend localStorage
        expiry: expiresAtISO, // ISO string format
        expiresAt: expiresAtTimestamp, // Unix timestamp for frontend localStorage
        expiresIn: expiresInSeconds, // Seconds until expiry (for countdown)
        expiresAtFormatted: expiresAt.toLocaleString() // Human-readable format for display
      };
      
      console.log('Response data:', { 
        hasToken: !!response.jwtToken, 
        sessionId: response.sessionId, 
        userId: response.userId,
        expiresAt: response.expiresAtFormatted
      });
      
      return res.status(200).json(response);
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

 
  static async handleTwoStepLogin(email, password, role, otp, mobile, step, req, res) {
    
    // Step 1: Credential Validation (no OTP provided, no step specified)
    // After validation, automatically send OTP
    if (step === 'credential_validation' || (!step && !otp)) {
      const { valid, user, error } = await AuthService.validateCredentials(email, password, role);

      if (!valid) {
        console.error('Invalid credentials in two-step login (credential_validation):', { email, role, step, error });
        return res.status(401).json({
          success: false,
          message: error || 'Invalid credentials',
          statusCode: 401,
          nextStep: null // No next step if credentials invalid
        });
      }

      // Credentials are valid - automatically send OTP
      console.log('[AuthController] Credentials validated, automatically sending OTP...');
      const otpResult = await AuthService.generateAndSaveOTP(email, role, mobile || user.mobile_number);

      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: otpResult.error || 'Failed to send OTP',
          statusCode: 500
        });
      }

      // Return response indicating OTP was sent
      return res.status(200).json({
        success: true,
        message: `OTP sent to mobile number ${otpResult.mobile}. Please check your SMS.`,
        otp: null, // Widget API generates OTP - we don't have it
        contactType: otpResult.contactType,
        contactInfo: otpResult.mobile,
        expiresAt: otpResult.expiresAt,
        requestId: otpResult.requestId, // Include requestId for tracking
        nextStep: 'final_login', // Indicate next step
        requiresOtp: true // Frontend should show OTP field
      });
    }

   
    if (step === 'send_otp') {
      // First validate credentials
      const { valid, user, error } = await AuthService.validateCredentials(email, password, role);

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: error || 'Invalid credentials',
          statusCode: 401
        });
      }

      // Generate and save OTP (for admin, sends to email; for customer, sends to mobile)
      const otpResult = await AuthService.generateAndSaveOTP(email, role, mobile || user.mobile_number);

      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: otpResult.error || 'Failed to send OTP',
          statusCode: 500
        });
      }

      // Return response (OTP is sent via SMS, we don't have the value)
      return res.status(200).json({
        success: true,
        message: `OTP sent to mobile number ${otpResult.mobile}. Please check your SMS.`,
        otp: null, // Widget API generates OTP - we don't have it
        contactType: otpResult.contactType,
        contactInfo: otpResult.mobile,
        expiresAt: otpResult.expiresAt,
        requestId: otpResult.requestId, // Include requestId for tracking
        nextStep: 'final_login', // Indicate next step
        requiresOtp: true // Frontend should show OTP field
      });
    }

   
    if (step === 'final_login' || otp) {
      if (!otp) {
        return res.status(400).json({
          success: false,
          message: 'OTP is required for final login',
          statusCode: 400
        });
      }

      
      const { valid, user, error } = await AuthService.verifyOTP(email, role, otp);

      if (!valid) {
        console.error(`[AuthController] OTP verification failed for ${email}:`, error);
        return res.status(401).json({
          success: false,
          message: error || 'Invalid OTP',
          statusCode: 401,
          error: error || 'OTP verification failed'
        });
      }
      
      console.log(`[AuthController] OTP verified successfully for ${email}, proceeding with login`);
      // Also validate password (in case credentials changed) and update last_login
      const credCheck = await AuthService.validateCredentials(email, password, role, true);
      if (!credCheck.valid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
          statusCode: 401
        });
      }

      // Generate JWT token
      const userId = AuthService.getUserId(user);
      const jwtToken = AuthService.generateJWT(userId, user.email, role);

      // Calculate expiration (3 hours from now)
      const expiresAt = new Date(Date.now() + (3 * 60 * 60 * 1000));

      // Create session
      const sessionResult = await AuthService.createSession(userId, jwtToken, expiresAt, req);

      if (!sessionResult.success) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create session',
          statusCode: 500
        });
      }

      // Calculate session expiry details for frontend display
      const expiresAtISO = expiresAt.toISOString();
      const expiresAtTimestamp = expiresAt.getTime();
      const expiresInSeconds = Math.floor((expiresAtTimestamp - Date.now()) / 1000);

      return res.status(200).json({
        status: 'success', // For frontend to recognize success
        success: true, // For frontend to recognize success
        statusCode: 200, // HTTP status code
        message: 'Login successful',
        token: jwtToken,
        jwtToken: jwtToken, // For frontend localStorage compatibility
        session_id: sessionResult.sessionId,
        sessionId: sessionResult.sessionId, // For frontend localStorage compatibility
        userId: userId.toString(), // For frontend localStorage
        userRole: role, // For frontend localStorage
        expiry: expiresAtISO, // ISO string format
        expiresAt: expiresAtTimestamp, // Unix timestamp for frontend localStorage
        expiresIn: expiresInSeconds, // Seconds until expiry (for countdown)
        expiresAtFormatted: expiresAt.toLocaleString() // Human-readable format for display
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid step. Use: credential_validation, send_otp, or final_login',
      statusCode: 400
    });
  }

  // POST /api/refresh
  // Refresh session token and extend expiry
  static async refreshSession(req, res) {
    try {
      const authHeader = req.headers['authorization'];
      const { session_id, jwt_token } = req.body;

      // Get token from Authorization header or request body
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (jwt_token) {
        token = jwt_token;
      }

      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'Authorization Bearer token or jwt_token required',
          statusCode: 400
        });
      }

      // Verify current session exists and is valid
      const { data: session, error: sessionError } = await SessionModel.findByJwtToken(token);

      if (sessionError || !session) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired session',
          statusCode: 401
        });
      }

      // Verify JWT token is still valid
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({
          status: 'error',
          message: 'Server configuration error',
          statusCode: 500
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired token',
          statusCode: 401
        });
      }

      // Generate new JWT token
      const newJwtToken = AuthService.generateJWT(decoded.user_id, decoded.email, decoded.role);

      // Calculate new expiration (3 hours from now)
      const newExpiresAt = new Date(Date.now() + (3 * 60 * 60 * 1000));

      // Update session with new token and expiry
      const { error: updateError } = await SessionModel.updateSession(session.session_id, {
        jwt_token: newJwtToken,
        expires_at: newExpiresAt.toISOString(),
        updated_time: new Date().toISOString()
      });

      if (updateError) {
        console.error('Session update error:', updateError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to refresh session',
          statusCode: 500
        });
      }

      // Calculate session expiry details for frontend display
      const expiresAtISO = newExpiresAt.toISOString();
      const expiresAtTimestamp = newExpiresAt.getTime();
      const expiresInSeconds = Math.floor((expiresAtTimestamp - Date.now()) / 1000);

      return res.status(200).json({
        status: 'success',
        success: true,
        message: 'Session refreshed successfully',
        token: newJwtToken,
        jwtToken: newJwtToken,
        session_id: session.session_id,
        sessionId: session.session_id,
        userId: decoded.user_id.toString(),
        userRole: decoded.role,
        expiry: expiresAtISO, // ISO string format
        expiresAt: expiresAtTimestamp, // Unix timestamp for frontend localStorage
        expiresIn: expiresInSeconds, // Seconds until expiry (for countdown)
        expiresAtFormatted: newExpiresAt.toLocaleString(), // Human-readable format for display
        statusCode: 200
      });
    } catch (error) {
      console.error('Refresh session error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // GET /api/validate-session
  // Validate current session and return session info
  static async validateSession(req, res) {
    try {
      const authHeader = req.headers['authorization'];
      const { session_id, jwt_token } = req.query;

      // Get token from Authorization header or query params
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (jwt_token) {
        token = jwt_token;
      } else if (session_id) {
        // If only session_id provided, get session and use its jwt_token
        const { data: session } = await SessionModel.findBySessionId(session_id);
        if (session && session.jwt_token) {
          token = session.jwt_token;
        }
      }

      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'Authorization Bearer token, jwt_token, or session_id required',
          statusCode: 400,
          valid: false
        });
      }

      // Verify JWT token
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({
          status: 'error',
          message: 'Server configuration error',
          statusCode: 500,
          valid: false
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired token',
          statusCode: 401,
          valid: false
        });
      }

      // Check session in database
      const { data: session, error: sessionError } = await SessionModel.findByJwtToken(token);

      if (sessionError || !session) {
        return res.status(401).json({
          status: 'error',
          message: 'Session not found or expired',
          statusCode: 401,
          valid: false
        });
      }

      // Session is valid
      return res.status(200).json({
        status: 'success',
        valid: true,
        message: 'Session is valid',
        session: {
          session_id: session.session_id,
          user_id: session.user_id,
          expires_at: session.expires_at,
          created_time: session.created_time
        },
        user: {
          user_id: decoded.user_id,
          email: decoded.email,
          role: decoded.role
        },
        statusCode: 200
      });
    } catch (error) {
      console.error('Validate session error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500,
        valid: false
      });
    }
  }

  // POST /api/customer/login
  // Customer login flow: validate phone -> send OTP -> verify OTP -> create session
  static async customerLogin(req, res) {
    try {
      const { phone_number, otp, step } = req.body;
      
      console.log('[Customer Login] Request received:', {
        phone_number: phone_number ? phone_number.substring(0, 3) + '****' : null,
        hasOtp: !!otp,
        step: step
      });

      // Validate phone_number
      if (!phone_number) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required',
          statusCode: 400
        });
      }

      // Step 3: Verify OTP and create session (OTP provided - check this FIRST)
      if (otp || step === 'verify_otp') {
        if (!otp) {
          return res.status(400).json({
            success: false,
            message: 'OTP is required for verification',
            statusCode: 400
          });
        }

        console.log('[Customer Login] Step 3: Verifying OTP...');
        
        const verifyResult = await AuthService.verifyOTPForCustomer(phone_number, otp);

        if (!verifyResult.valid) {
          console.error(`[Customer Login] OTP verification failed:`, verifyResult.error);
          return res.status(401).json({
            success: false,
            message: verifyResult.error || 'Invalid OTP',
            statusCode: 401
          });
        }

        console.log(`[Customer Login] OTP verified successfully, creating session for customer ${verifyResult.customer.customer_id}`);
        
        // Generate JWT token
        const userId = AuthService.getUserId(verifyResult.user);
        const jwtToken = AuthService.generateJWT(userId, verifyResult.user.email || phone_number, 'customer');

        // Calculate expiration (3 hours from now)
        const expiresAt = new Date(Date.now() + (3 * 60 * 60 * 1000));

        // Create session
        const sessionResult = await AuthService.createSession(userId, jwtToken, expiresAt, req);

        if (!sessionResult.success) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to create session',
            statusCode: 500
          });
        }

        // Calculate session expiry details for frontend display
        const expiresAtISO = expiresAt.toISOString();
        const expiresAtTimestamp = expiresAt.getTime();
        const expiresInSeconds = Math.floor((expiresAtTimestamp - Date.now()) / 1000);

        console.log(`[Customer Login] Session created successfully: session_id=${sessionResult.sessionId}, user_id=${userId}`);

        return res.status(200).json({
          status: 'success',
          success: true,
          statusCode: 200,
          message: 'Login successful',
          token: jwtToken,
          jwtToken: jwtToken,
          session_id: sessionResult.sessionId,
          sessionId: sessionResult.sessionId,
          userId: userId.toString(),
          userRole: 'customer',
          expiry: expiresAtISO,
          expiresAt: expiresAtTimestamp,
          expiresIn: expiresInSeconds,
          expiresAtFormatted: expiresAt.toLocaleString()
        });
      }

      // Step 1: Validate phone number exists (step === 'validate_phone' or no step provided)
      else if (!step || step === 'validate_phone') {
        console.log('[Customer Login] Step 1: Validating phone number...');
        
        const checkResult = await AuthService.checkCustomerExists(phone_number);

        if (!checkResult.exists) {
          console.log(`[Customer Login] Customer not found with phone: ${phone_number}`);
          return res.status(404).json({
            success: false,
            message: checkResult.error || 'Customer not found with this phone number',
            statusCode: 404,
            customerExists: false
          });
        }

        console.log(`[Customer Login] Phone number validated. Customer exists: customer_id=${checkResult.customer.customer_id}`);
        
        return res.status(200).json({
          success: true,
          message: 'Phone number verified',
          statusCode: 200,
          customerExists: true,
          nextStep: 'send_otp'
        });
      }

      // Step 2: Send OTP (step === 'send_otp')
      else if (step === 'send_otp') {
        console.log('[Customer Login] Step 2: Sending OTP...');
        
        // First verify customer exists
        const checkResult = await AuthService.checkCustomerExists(phone_number);

        if (!checkResult.exists) {
          return res.status(404).json({
            success: false,
            message: 'Customer not found with this phone number',
            statusCode: 404
          });
        }

        // Generate and send OTP
        const otpResult = await AuthService.generateAndSaveOTPForCustomer(phone_number);

        if (!otpResult.success) {
          return res.status(500).json({
            success: false,
            message: otpResult.error || 'Failed to send OTP',
            statusCode: 500
          });
        }

        console.log(`[Customer Login] OTP sent successfully. RequestId: ${otpResult.requestId}`);

        return res.status(200).json({
          success: true,
          message: `OTP sent to mobile number ${otpResult.mobile}. Please check your SMS.`,
          otp: null, // Widget API generates OTP - we don't have it
          contactType: otpResult.contactType,
          contactInfo: otpResult.mobile,
          expiresAt: otpResult.expiresAt,
          requestId: otpResult.requestId,
          nextStep: 'verify_otp',
          requiresOtp: true
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid step. Use: validate_phone, send_otp, or verify_otp (or omit step and provide otp)',
        statusCode: 400
      });
    } catch (error) {
      console.error('[Customer Login] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // POST /api/logout
  static async logout(req, res) {
    try {
      const authHeader = req.headers['authorization'];
      const { session_id } = req.body;

      if (!authHeader && !session_id) {
        return res.status(400).json({
          status: 'error',
          message: 'Authorization Bearer token or session_id required',
          statusCode: 400
        });
      }

      let deleted = false;

      // Delete by jwt_token
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { error } = await SessionModel.deleteByJwtToken(token);
        if (!error) {
          deleted = true;
        }
      }

      // Delete by session_id
      if (session_id) {
        const { error } = await SessionModel.deleteBySessionId(session_id);
        if (!error) {
          deleted = true;
        }
      }

      if (deleted) {
        return res.status(200).json({
          status: 'success',
          message: 'Logout successful',
          statusCode: 200
        });
      } else {
        return res.status(404).json({
          status: 'error',
          message: 'Session not found',
          statusCode: 404
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }
}

export default AuthController;

