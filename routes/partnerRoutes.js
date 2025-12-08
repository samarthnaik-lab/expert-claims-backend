import express from 'express';
import PartnerController from '../controllers/partnerController.js';
import AuthMiddleware from '../middleware/authMiddleware.js';
import { uploadMultipleFiles } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
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

// POST /api/createTask
router.post('/createTask', PartnerController.createTask);

// POST /api/partnerbacklogentry (with file upload support)
router.post('/partnerbacklogentry', uploadMultipleFiles, PartnerController.createPartnerBacklogEntry);

export default router;

