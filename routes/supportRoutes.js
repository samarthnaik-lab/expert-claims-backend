import express from 'express';
import SupportController from '../controllers/supportController.js';
import PartnerController from '../controllers/partnerController.js';
import { uploadDataFile } from '../middleware/uploadMiddleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer();

// Support Team Routes
// GET /support/get_all_backlog_data?employee_id={employee_id} - Get all backlog data assigned to an employee
router.get('/get_all_backlog_data', SupportController.getAllBacklogData);

// GET /support/getemployedashboard?employee_id={employee_id} - Get employee dashboard data
router.get('/getemployedashboard', SupportController.getEmployeeDashboard);

// GET /support/getemployeetasks?employee_id={employee_id}&page={page}&size={size} - Get employee tasks with pagination
router.get('/getemployeetasks', SupportController.getEmployeeTasks);

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

// GET /support/getpartner - Get all partners
router.get('/getpartner', SupportController.getPartners);

// GET /support/getdocumentcategories?case_type_id={case_type_id} - Get document categories by case type
router.get('/getdocumentcategories', SupportController.getDocumentCategories);

// POST /support/upload - Upload document for a case
router.post('/upload', uploadDataFile, SupportController.uploadDocument);

// POST /support/everything-cases - Get comprehensive case data with all related information
router.post('/everything-cases', SupportController.getEverythingCases);

// POST /support/invoice - Update invoice number for a payment phase (with duplicate check)
router.post('/invoice', SupportController.updateInvoice);

// GET /support/invoice_get - Get the latest invoice number from payment phases
router.get('/invoice_get', SupportController.getLatestInvoice);

// POST /support/view - View case document by document_id
router.post('/view', SupportController.viewDocument);

// PATCH /support/removecrmdocument?document_id={document_id} - Soft delete a case document
router.patch('/removecrmdocument', SupportController.removeCrmDocument);

// PATCH /support/update_Task - Update a case/task with all related fields
router.patch('/update_Task', SupportController.updateTask);

// POST /support/createcasepaymentphases - Create payment phases for a case
router.post('/createcasepaymentphases', SupportController.createCasePaymentPhases);

// PATCH /webhook/updatepayment - Update a payment phase (webhook endpoint for n8n)
router.patch('/updatepayment', SupportController.updatePayment);

// POST /webhook/partner_creation - Create partner account (webhook endpoint for n8n)
router.post('/partner_creation', PartnerController.createPartner);

// POST /assignee_comment_insert - n8n webhook to insert a comment on a case (maps to case_comments)
router.post('/assignee_comment_insert', SupportController.assigneeCommentInsert);

// GET /employee_all_task?user_id={user_id}&page={page}&size={size} - n8n-style webhook to fetch cases created by a user
router.get('/employee_all_task', SupportController.employeeAllTask);

// GET /support/getuserdetails?email={email} - Get user details by email
router.get('/getuserdetails', SupportController.getUserDetails);

// POST /support/list-documents - List all documents for a case (multipart/form-data with case_id)
router.post('/list-documents', upload.none(), SupportController.listDocuments);

// POST /support/apply-leave - Apply for leave (employee endpoint)
router.post('/apply-leave', SupportController.applyLeave);

// GET /support/getempleaves?employee_id={employee_id}&page={page}&size={size} - Get employee's leave applications
router.get('/getempleaves', SupportController.getEmployeeLeaves);

// GET /support/getlevetypes - Get all active leave types
router.get('/getlevetypes', SupportController.getLeaveTypes);

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

