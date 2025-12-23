import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.ensureLogsDirectory();
  }

  // Generate unique request ID
  generateRequestId() {
    return uuidv4();
  }

  // Get memory usage
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    };
  }

  // Ensure logs directory exists
  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  // Get today's log file path
  getLogFilePath() {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `api-log-${dateString}.txt`;
    return path.join(this.logsDir, fileName);
  }

  // Format log message with better readability
  formatLogMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const separator = '='.repeat(100);
    
    let logEntry = `\n${separator}\n`;
    logEntry += `[${timestamp}] [${level}] ${message}\n`;
    logEntry += `${separator}\n`;
    
    if (Object.keys(metadata).length > 0) {
      // Format metadata in a readable way
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'object') {
            logEntry += `${key}:\n${JSON.stringify(value, null, 2)}\n`;
          } else {
            logEntry += `${key}: ${value}\n`;
          }
        }
      }
    }
    
    logEntry += `${separator}\n\n`;
    return logEntry;
  }

  // Write to log file asynchronously (non-blocking)
  writeToFile(message) {
    try {
      const logFilePath = this.getLogFilePath();
      // Use async appendFile to avoid blocking the event loop
      fs.appendFile(logFilePath, message, 'utf8', (error) => {
        if (error) {
          console.error('Error writing to log file:', error);
        }
      });
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  // Log API request with comprehensive details
  logRequest(req, res, responseTime = null, responseBody = null) {
    // Get request ID (generate if not exists)
    const requestId = req.requestId || this.generateRequestId();
    req.requestId = requestId;

    // Extract user information if available
    const userInfo = req.user ? {
      user_id: req.user.user_id || null,
      email: req.user.email || null,
      role: req.user.role || null
    } : null;

    // Get all relevant headers (sanitized)
    const relevantHeaders = {
      'content-type': req.headers['content-type'] || null,
      'accept': req.headers['accept'] || null,
      'accept-language': req.headers['accept-language'] || null,
      'accept-profile': req.headers['accept-profile'] || null,
      'content-profile': req.headers['content-profile'] || null,
      'origin': req.headers['origin'] || null,
      'referer': req.headers['referer'] || null,
      'session_id': req.headers['session_id'] || req.headers['session-id'] || null,
      'jwt_token': req.headers['jwt_token'] || req.headers['jwt-token'] ? '***REDACTED***' : null,
      'authorization': req.headers['authorization'] ? 'Bearer ***REDACTED***' : null,
      'apikey': req.headers['apikey'] ? '***REDACTED***' : null,
      'x-forwarded-for': req.headers['x-forwarded-for'] || null,
      'x-real-ip': req.headers['x-real-ip'] || null
    };

    // Calculate response size if available
    const responseSize = res.getHeader('content-length') || 
                         (responseBody ? JSON.stringify(responseBody).length : null);

    const logData = {
      requestId: requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      fullUrl: req.originalUrl || req.url,
      protocol: req.protocol || 'http',
      host: req.get('host') || null,
      ip: req.ip || 
          req.connection?.remoteAddress || 
          req.socket?.remoteAddress ||
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          req.headers['x-real-ip'] ||
          'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      statusCode: res.statusCode,
      statusMessage: res.statusMessage || null,
      responseTime: responseTime ? `${responseTime}ms` : null,
      responseSize: responseSize ? `${responseSize} bytes` : null,
      memoryUsage: this.getMemoryUsage(),
      queryParams: Object.keys(req.query).length > 0 ? req.query : null,
      requestBody: req.method !== 'GET' && req.method !== 'DELETE' ? this.sanitizeBody(req.body) : null,
      headers: relevantHeaders,
      user: userInfo,
      session: req.session ? {
        session_id: req.session.session_id || null,
        expires_at: req.session.expires_at || null
      } : null,
      responseBody: res.statusCode >= 400 && responseBody ? this.sanitizeBody(responseBody) : null,
      errorDetails: res.statusCode >= 400 ? {
        errorCode: responseBody?.error_code || null,
        errorMessage: responseBody?.message || null,
        fieldErrors: responseBody?.field_errors || null
      } : null
    };

    const level = res.statusCode >= 500 ? 'ERROR' : 
                  res.statusCode >= 400 ? 'WARN' : 'INFO';
    const message = `${req.method} ${req.path} - ${res.statusCode}${responseTime ? ` (${responseTime}ms)` : ''}`;
    
    this.writeToFile(this.formatLogMessage(level, message, logData));
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${level}] ${message}`, {
        requestId,
        statusCode: res.statusCode,
        responseTime: responseTime ? `${responseTime}ms` : null
      });
    }
  }

  // Log error with comprehensive details
  logError(error, req = null, context = {}) {
    const requestId = req?.requestId || this.generateRequestId();
    
    const logData = {
      requestId: requestId,
      timestamp: new Date().toISOString(),
      errorType: error.constructor?.name || 'Error',
      errorMessage: error.message || 'Unknown error',
      errorStack: error.stack || null,
      errorCode: error.code || null,
      errorStatus: error.status || error.statusCode || null,
      method: req?.method || null,
      path: req?.path || null,
      fullUrl: req?.originalUrl || req?.url || null,
      ip: req?.ip || 
          req?.connection?.remoteAddress || 
          req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
          'unknown',
      userAgent: req?.headers?.['user-agent'] || null,
      user: req?.user ? {
        user_id: req.user.user_id || null,
        email: req.user.email || null,
        role: req.user.role || null
      } : null,
      requestBody: req?.body ? this.sanitizeBody(req.body) : null,
      queryParams: req?.query || null,
      memoryUsage: this.getMemoryUsage(),
      context: Object.keys(context).length > 0 ? context : null,
      errorDetails: error.details || null,
      databaseError: error.hint || error.detail || null
    };

    this.writeToFile(this.formatLogMessage('ERROR', 'Exception occurred', logData));
    console.error('[ERROR]', {
      requestId,
      error: error.message,
      path: req?.path,
      stack: error.stack
    });
  }

  // Log info message
  logInfo(message, metadata = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      message: message,
      ...metadata,
      memoryUsage: this.getMemoryUsage()
    };
    this.writeToFile(this.formatLogMessage('INFO', message, logData));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[INFO]', message, metadata);
    }
  }

  // Log warning
  logWarning(message, metadata = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      message: message,
      ...metadata,
      memoryUsage: this.getMemoryUsage()
    };
    this.writeToFile(this.formatLogMessage('WARN', message, logData));
    console.warn('[WARN]', message, metadata);
  }

  // Log database operation
  logDatabaseOperation(operation, table, details = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation: operation, // SELECT, INSERT, UPDATE, DELETE
      table: table,
      ...details,
      memoryUsage: this.getMemoryUsage()
    };
    this.writeToFile(this.formatLogMessage('INFO', `Database ${operation} on ${table}`, logData));
  }

  // Log database error
  logDatabaseError(error, operation, table, queryDetails = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation: operation,
      table: table,
      errorMessage: error.message || 'Unknown database error',
      errorCode: error.code || null,
      errorHint: error.hint || null,
      errorDetail: error.detail || null,
      queryDetails: queryDetails,
      memoryUsage: this.getMemoryUsage()
    };
    this.writeToFile(this.formatLogMessage('ERROR', `Database ${operation} error on ${table}`, logData));
    console.error('[DB ERROR]', {
      operation,
      table,
      error: error.message,
      details: queryDetails
    });
  }

  // Log failed operation/validation error
  logFailedOperation(req, statusCode, errorCode, message, details = {}) {
    const requestId = req?.requestId || this.generateRequestId();
    
    const logData = {
      requestId: requestId,
      timestamp: new Date().toISOString(),
      statusCode: statusCode,
      errorCode: errorCode,
      errorMessage: message,
      method: req?.method || null,
      path: req?.path || null,
      fullUrl: req?.originalUrl || req?.url || null,
      ip: req?.ip || 
          req?.connection?.remoteAddress || 
          req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
          'unknown',
      userAgent: req?.headers?.['user-agent'] || null,
      user: req?.user ? {
        user_id: req.user.user_id || null,
        email: req.user.email || null,
        role: req.user.role || null
      } : null,
      requestBody: req?.body ? this.sanitizeBody(req.body) : null,
      queryParams: req?.query || null,
      details: Object.keys(details).length > 0 ? details : null,
      memoryUsage: this.getMemoryUsage()
    };

    const level = statusCode >= 500 ? 'ERROR' : 'WARN';
    const levelMessage = statusCode >= 500 ? 'Operation failed' : 'Validation failed';
    
    this.writeToFile(this.formatLogMessage(level, `${levelMessage}: ${message}`, logData));
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${level}] ${message}`, {
        requestId,
        statusCode,
        errorCode,
        path: req?.path
      });
    }
  }

  // Sanitize sensitive data from request body
  sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password', 
      'password_hash', 
      'token', 
      'jwt_token', 
      'apikey', 
      'authorization',
      'secret',
      'api_key',
      'access_token',
      'refresh_token',
      'private_key',
      'credit_card',
      'cvv',
      'ssn',
      'aadhar_number',
      'pan_number',
      'pan'
    ];
    
    const sanitized = Array.isArray(body) ? [...body] : { ...body };

    if (Array.isArray(sanitized)) {
      return sanitized.map(item => this.sanitizeBody(item));
    }

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
      // Also check nested objects
      Object.keys(sanitized).forEach(key => {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
          sanitized[key] = this.sanitizeBody(sanitized[key]);
        }
      });
    });

    return sanitized;
  }

  // Clean old log files (older than specified days)
  cleanOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logsDir);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (daysToKeep * 24 * 60 * 60 * 1000));

      files.forEach(file => {
        if (file.startsWith('api-log-') && file.endsWith('.txt')) {
          const dateMatch = file.match(/api-log-(\d{4}-\d{2}-\d{2})\.txt/);
          if (dateMatch) {
            const fileDate = new Date(dateMatch[1]);
            if (fileDate < cutoffDate) {
              const filePath = path.join(this.logsDir, file);
              fs.unlinkSync(filePath);
              this.logInfo(`Deleted old log file: ${file}`);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Clean old logs on startup (keep last 30 days)
logger.cleanOldLogs(30);

export default logger;

