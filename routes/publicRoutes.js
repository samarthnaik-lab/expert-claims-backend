import express from 'express';
import PartnerController from '../controllers/partnerController.js';
import { uploadSingleFile } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public routes - NO authentication required
// GET /public/MyReferral?partner_id={partner_id}&page={page}&size={size} - Get partner referrals
router.get('/MyReferral', PartnerController.publicGetReferrals);

// GET /public/backlog_id?backlog_id=ECSI-GA-25-030 - Get backlog data by ID
router.get('/backlog_id', PartnerController.publicGetBacklogById);

// PATCH /public/update_backlog - Update backlog entry
router.patch('/update_backlog', PartnerController.publicUpdateBacklog);

// POST /public/comments_insert - Insert backlog comment
router.post('/comments_insert', PartnerController.publicInsertComment);

// POST /public/partnerbacklogentrydoc - Add document to existing backlog entry
router.post('/partnerbacklogentrydoc', uploadSingleFile, PartnerController.publicAddDocumentToBacklog);

// PATCH /public/removedocument?document_id={document_id} - Remove document (soft delete)
router.patch('/removedocument', PartnerController.publicRemoveDocument);

export default router;

