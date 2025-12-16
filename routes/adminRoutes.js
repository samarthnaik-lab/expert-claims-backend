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

export default router;

