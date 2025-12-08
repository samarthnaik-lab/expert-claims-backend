import express from 'express';
import AuthController from '../controllers/authController.js';

const router = express.Router();

// Login route
router.post('/login', AuthController.login);

// Logout route
router.post('/logout', AuthController.logout);

export default router;

