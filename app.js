import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import partnerRoutes from './routes/partnerRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman, webhooks, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    // Allow the configured origin
    if (origin === 'http://localhost:8080') {
      return callback(null, true);
    }
    // Allow all origins for webhook endpoints
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware with response time tracking
app.use((req, res, next) => {
  const startTime = Date.now();
  req.requestId = logger.generateRequestId();
  
  // Store response body for logging
  const originalSend = res.send;
  const originalJson = res.json;
  let responseBody = null;
  
  // Override res.send to capture response body
  res.send = function(body) {
    responseBody = body;
    return originalSend.call(this, body);
  };
  
  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };
  
  // Override res.end to capture response time and log
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    
    // Parse response body if it's a buffer
    let parsedBody = responseBody;
    if (chunk && !responseBody) {
      try {
        parsedBody = JSON.parse(chunk.toString());
      } catch (e) {
        parsedBody = chunk.toString().substring(0, 500); // Limit size
      }
    }
    
    // Call original end method FIRST to send response immediately
    originalEnd.call(this, chunk, encoding);
    
    // Log the request asynchronously AFTER response is sent (non-blocking)
    // Use setImmediate to ensure response is fully sent before logging
    setImmediate(() => {
      logger.logRequest(req, res, responseTime, parsedBody);
    });
  };
  
  next();
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'chale chhe' });
});

// Public routes (no authentication required)
app.use('/public', publicRoutes);

// Support Team routes
app.use('/support', supportRoutes);

// Webhook routes (for n8n and external integrations)
// Previously we mounted support routes under '/webhook' for backwards compatibility.
// To ensure the endpoints are available under the `/support` prefix only,
// remove the duplicate '/webhook' mount. Use `/support` paths (e.g. /support/assignee_comment_insert).
// app.use('/webhook', supportRoutes);

// Customer routes (new role)
app.use('/customer', customerRoutes);

// API routes (authentication required)
app.use('/api', authRoutes);
app.use('/api', documentRoutes);  // Document routes before partnerRoutes to avoid auth middleware conflict
app.use('/api', partnerRoutes);

// Admin routes (authentication required)
app.use('/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.logError(err, req, {
    errorType: 'UnhandledException',
    route: req.path,
    method: req.method
  });
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    statusCode: err.status || 500,
    error_code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    statusCode: 404
  });
});

app.listen(PORT, () => {
  logger.logInfo(`Server started on port ${PORT}`, { port: PORT, environment: process.env.NODE_ENV || 'development' });
  console.log(`Server running on port ${PORT}`);
});
