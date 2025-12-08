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
        console.error('Invalid credentials:', error);
        return res.status(401).json({
          status: 'error',
          message: error || 'Invalid credentials',
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
        expiry: expiresAt.toISOString(),
        expiresAt: expiresAt.getTime() // Unix timestamp for frontend localStorage
      };
      
      console.log('Response data:', { 
        hasToken: !!response.jwtToken, 
        sessionId: response.sessionId, 
        userId: response.userId 
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
    
    if (step === 'credential_validation' || (!step && !otp)) {
      const { valid, user, error } = await AuthService.validateCredentials(email, password, role);

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: error || 'Invalid credentials',
          statusCode: 401
        });
      }

      return res.status(200).json({
        success: true,
        message: 'valid details'
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

      const otpResult = await AuthService.generateAndSaveOTP(email, role, mobile || user.mobile_number);

      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: otpResult.error || 'Failed to send OTP',
          statusCode: 500
        });
      }

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
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
        return res.status(401).json({
          success: false,
          message: error || 'Invalid OTP',
          statusCode: 401
        });
      }
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
        expiry: expiresAt.toISOString(),
        expiresAt: expiresAt.getTime() // Unix timestamp for frontend localStorage
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid step. Use: credential_validation, send_otp, or final_login',
      statusCode: 400
    });
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

