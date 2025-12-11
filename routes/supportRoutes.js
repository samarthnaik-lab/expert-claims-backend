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

// PATCH /support/updatecunsultantpolicy - Update consultant assignment for backlog entry
router.patch('/updatecunsultantpolicy', SupportController.updateConsultantPolicy);

// POST /support/comments_insert - Insert backlog comment
router.post('/comments_insert', SupportController.insertComment);

// POST /support/partnerdocumentview - View partner document
router.post('/partnerdocumentview', SupportController.partnerDocumentView);

// GET /support/getemployees - Get all employees
router.get('/getemployees', SupportController.getEmployees);

// GET /support/getcustomers - Get all customers
router.get('/getcustomers', SupportController.getCustomers);

// GET /support/case_type - Get all case types
router.get('/case_type', SupportController.getCaseTypes);

// GET /support/{uuid} - Support UUID routes (like n8n webhooks) - for backward compatibility
// This allows routes like /support/2d7eb946-588f-436d-8ebe-ccb118babf12 to work
// Must be after all specific routes to avoid conflicts
router.get('/:uuid', (req, res, next) => {
  // Check if it's a UUID pattern (8-4-4-4-12 format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(req.params.uuid)) {
    // Route to a generic handler or specific functionality
    // For now, return a success response (can be customized based on requirements)
    return SupportController.handleUuidRoute(req, res, next);
  }
  // If not a UUID, return 404
  return res.status(404).json({
    status: 'error',
    message: 'Route not found',
    statusCode: 404
  });
});

export default router;

