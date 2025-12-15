import express from 'express';
import CustomerController from '../controllers/customerController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer();

// Customer role routes
// GET /customer/getcustomersessiondetails?mobile_number={mobile_number} - Get customer session details by mobile number
router.get('/getcustomersessiondetails', CustomerController.getCustomerSessionDetails);

// POST /customer/customer-dashboard - Get customer dashboard data (multipart/form-data with user_id)
router.post('/customer-dashboard', upload.none(), CustomerController.getCustomerDashboard);

// POST /customer/customer-case - Get customer cases with pagination (multipart/form-data with user_id, page, size)
router.post('/customer-case', upload.none(), CustomerController.getCustomerCases);

export default router;


