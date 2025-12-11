import express from 'express';
import SupportController from '../controllers/supportController.js';

const router = express.Router();

// Support Team Routes
// GET /support/get_all_backlog_data?employee_id={employee_id} - Get all backlog data assigned to an employee
router.get('/get_all_backlog_data', SupportController.getAllBacklogData);

// GET /support/backlog_id?backlog_id={backlog_id} - Get backlog details by ID
router.get('/backlog_id', SupportController.getBacklogById);

// GET /support/gettechnicalconsultant - Get all technical consultants
router.get('/gettechnicalconsultant', SupportController.getTechnicalConsultants);

// PATCH /support/updatestatustechnicalconsultant - Update backlog status and assign technical consultant
router.patch('/updatestatustechnicalconsultant', SupportController.updateStatusTechnicalConsultant);

// POST /support/comments_insert - Insert backlog comment
router.post('/comments_insert', SupportController.insertComment);

// POST /support/partnerdocumentview - View partner document
router.post('/partnerdocumentview', SupportController.partnerDocumentView);

export default router;

