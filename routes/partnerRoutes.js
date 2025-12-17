import express from 'express';
import PartnerController from '../controllers/partnerController.js';
import AuthMiddleware from '../middleware/authMiddleware.js';
import { uploadMultipleFiles } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// POST /api/partnerbacklogentry (with file upload support) - NO AUTH REQUIRED
// This route is placed before auth middleware to bypass authentication
router.post('/partnerbacklogentry', uploadMultipleFiles, PartnerController.createPartnerBacklogEntry);

// Apply authentication middleware to all routes below
router.use(AuthMiddleware.authenticate);
router.use(AuthMiddleware.extractProfileHeaders);

// GET /api/getpartnerdetails?email={email}
router.get('/getpartnerdetails', PartnerController.getPartnerDetailsByEmail);

// GET /api/568419fb-3d1d-4178-9d39-002d4100a3c0?partner_id={partner_id}
router.get('/568419fb-3d1d-4178-9d39-002d4100a3c0', PartnerController.getPartnerDetailsById);

// GET /api/MyReferral?partner_id={partner_id}&page={page}&size={size}
router.get('/MyReferral', PartnerController.getReferrals);

// POST /api/partner-status-check
router.post('/partner-status-check', PartnerController.getPartnerStatusCheck);

// GET /api/referal_partner_id_data?backlog_referring_partner_id={partner_id}
router.get('/referal_partner_id_data', PartnerController.getBacklogData);

// GET /api/backlog_id?backlog_id=ECSI-GA-25-029 - Get backlog data by ID
router.get('/backlog_id', PartnerController.getBacklogById);

// POST /api/createTask
router.post('/createTask', PartnerController.createTask);

// PATCH /api/feedback - Update feedback for backlog entry
router.patch('/feedback', PartnerController.updateFeedback);

// POST /api/{uuid} - Support UUID routes for createTask (like n8n webhooks)
// This allows routes like /api/e4d7117c-66bb-4750-91d0-6462389b2fba to work
// Must be after all specific routes to avoid conflicts
router.post('/:uuid', (req, res, next) => {
  // Check if it's a UUID pattern (8-4-4-4-12 format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(req.params.uuid)) {
    // Route to createTask handler
    return PartnerController.createTask(req, res, next);
  }
  // If not a UUID, return 404
  return res.status(404).json({
    status: 'error',
    message: 'Route not found',
    statusCode: 404
  });
});

export default router;

