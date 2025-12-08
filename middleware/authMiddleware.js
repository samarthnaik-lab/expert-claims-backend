import jwt from 'jsonwebtoken';
import SessionModel from '../models/SessionModel.js';

class AuthMiddleware {
  // Authenticate using Bearer token - verify JWT and check session in database
  static async authenticate(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];

      // Must have Authorization Bearer token
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 'error',
          message: 'Authorization Bearer token required',
          statusCode: 401
        });
      }

      const token = authHeader.substring(7);

      // Verify JWT token
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('JWT_SECRET is not configured');
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
        console.error('JWT verification error:', error.message);
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired token',
          statusCode: 401
        });
      }

      // Check session in database - verify jwt_token matches and expires_at is in future
      const { data: session, error: sessionError } = await SessionModel.findByJwtToken(token);

      if (sessionError || !session) {
        console.error('Session not found or expired:', sessionError);
        return res.status(401).json({
          status: 'error',
          message: 'Invalid or expired token',
          statusCode: 401
        });
      }

      // Attach user and session to request
      req.user = decoded;
      req.session = session;
      req.authType = 'bearer';

      console.log('Authenticated successfully for user:', decoded.user_id);
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Authentication error',
        statusCode: 500
      });
    }
  }

  // Extract profile headers
  static extractProfileHeaders(req, res, next) {
    req.contentProfile = req.headers['content-profile'] || req.headers['Content-Profile'];
    req.acceptProfile = req.headers['accept-profile'] || req.headers['Accept-Profile'];
    next();
  }
}

export default AuthMiddleware;

