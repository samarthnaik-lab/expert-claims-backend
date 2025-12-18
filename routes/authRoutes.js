import express from 'express';
import AuthController from '../controllers/authController.js';

const router = express.Router();

// Login route
router.post('/login', AuthController.login);

// Logout route
router.post('/logout', AuthController.logout);

// Refresh session route
router.post('/refresh', AuthController.refreshSession);

// Validate session route
router.get('/validate-session', AuthController.validateSession);

export default router;

