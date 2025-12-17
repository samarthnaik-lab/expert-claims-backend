import express from 'express';
import AdminController from '../controllers/adminController.js';
import AuthMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /admin/admindashboard
// Get admin dashboard statistics
// Requires authentication via Bearer token
// router.get(
//   '/admindashboard',
//   AuthMiddleware.authenticate,
//   AdminController.getAdminDashboard
// );

router.get(
  '/admindashboard',
  // AuthMiddleware.authenticate,
  AdminController.getAdminDashboard
);

// GET /admin/getusers?page={page}&size={size}
// Get all users with pagination and role-specific data
// Requires authentication via Bearer token
router.get(
  '/getusers',
  // AuthMiddleware.authenticate,
  AdminController.getUsers
);

// POST /admin/createuser
// Create a new user with role-specific data
// Requires authentication via Bearer token
router.post(
  '/createuser',
  // AuthMiddleware.authenticate,
  AdminController.createUser
);

// PATCH /admin/updateuser
// Update an existing user with role-specific data
// Requires authentication via Bearer token
router.patch(
  '/updateuser',
  // AuthMiddleware.authenticate,
  AdminController.updateUser
);

// DELETE /admin/deleteuser?user_id={user_id}
// Soft delete user by setting deleted_flag = true
// Requires authentication via Bearer token
router.delete(
  '/deleteuser',
  // AuthMiddleware.authenticate,
  AdminController.deleteUser
);

// GET /admin/getleaves?page={page}&size={size}
// Get all leave applications with employee and leave type information
// Requires authentication via Bearer token
router.get(
  '/getleaves',
  // AuthMiddleware.authenticate,
  AdminController.getLeaveApplications
);

// PATCH /admin/updateleavestatus
// Update leave application status (approve or reject)
// Requires authentication via Bearer token
router.patch(
  '/updateleavestatus',
  // AuthMiddleware.authenticate,
  AdminController.updateLeaveStatus
);

// GET /admin/gapanalysis?employee_id={employee_id}
// Get all backlog/case data for gap analysis in Admin Dashboard
// When employee_id=0, returns all cases in the system
router.get(
  '/gapanalysis',
  // AuthMiddleware.authenticate,
  AdminController.getGapAnalysis
);

// GET /admin/backlog_id?backlog_id={backlog_id}
// Get detailed information for a specific backlog/case entry by backlog_id
// Returns comprehensive data including case details, related entities, comments, and documents
router.get(
  '/backlog_id',
  // AuthMiddleware.authenticate,
  AdminController.getBacklogDetail
);

// GET /admin/gettechnicalconsultant
// Get all technical consultants (employees) available for assignment
router.get(
  '/gettechnicalconsultant',
  // AuthMiddleware.authenticate,
  AdminController.getTechnicalConsultants
);

// PATCH /admin/update_backlog
// Update backlog case summary, description, and case type (Policy Type)
router.patch(
  '/update_backlog',
  // AuthMiddleware.authenticate,
  AdminController.updateBacklog
);

// PATCH /admin/updatecunsultantpolicy
// Assign consultant to a backlog/case
router.patch(
  '/updatecunsultantpolicy',
  // AuthMiddleware.authenticate,
  AdminController.updateConsultantPolicy
);

// PATCH /admin/updatestatustechnicalconsultant
// Update backlog status and/or expert description
router.patch(
  '/updatestatustechnicalconsultant',
  // AuthMiddleware.authenticate,
  AdminController.updateStatusTechnicalConsultant
);

// POST /admin/comments_insert
// Add a comment to a backlog/case
router.post(
  '/comments_insert',
  // AuthMiddleware.authenticate,
  AdminController.insertComment
);

// POST /admin/documentview
// View backlog document by document_id - Returns document URL or file data
router.post(
  '/documentview',
  // AuthMiddleware.authenticate,
  AdminController.viewDocument
);

// DELETE /admin/deletecase or PATCH /admin/deletecase
// Delete a backlog/case entry by setting deleted_flag = true (soft delete)
router.delete(
  '/deletecase',
  // AuthMiddleware.authenticate,
  AdminController.deleteCase
);

// Also support PATCH method as mentioned in documentation
router.patch(
  '/deletecase',
  // AuthMiddleware.authenticate,
  AdminController.deleteCase
);

export default router;

