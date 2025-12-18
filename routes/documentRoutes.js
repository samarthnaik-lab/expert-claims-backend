import express from 'express';
import DocumentController from '../controllers/documentController.js';
import { uploadDataFile } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// POST /api/upload - Upload document to S3
// Requires: jwt_token and session_id headers, case_id, category_id, is_customer_visible in body, file in 'data' field
router.post('/upload', uploadDataFile, DocumentController.uploadDocument);

// GET /api/upload/health - Health check endpoint
router.get('/upload/health', DocumentController.healthCheck);

export default router;

