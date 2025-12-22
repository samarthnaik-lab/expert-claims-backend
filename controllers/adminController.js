import supabase from '../config/database.js';
import SessionModel from '../models/SessionModel.js';
import logger from '../utils/logger.js';
import BacklogModel from '../models/BacklogModel.js';
import BacklogCommentModel from '../models/BacklogCommentModel.js';
import path from 'path';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';

// Email configuration constants
const DEFAULT_EMPLOYEE_ID = 61;
const FALLBACK_USER_ID = 3; // Fallback user_id for partner lookup
const FALLBACK_EMAIL = process.env.FALLBACK_EMAIL || "analytics@expertclaims.co.in";
const FROM_EMAIL = process.env.FROM_EMAIL || "analytics@expertclaims.co.in";
const LOGIN_URL = process.env.LOGIN_URL || "https://expert-claims-g8p9.vercel.app/login";

// SMTP transporter helper function
function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.expertclaims.co.in",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || "analytics@expertclaims.co.in",
      pass: process.env.SMTP_PASS || "ExpertAnalysis@2025", // Should be set via environment variable for security
    },
    tls: {
      // Disable certificate hostname validation to handle certificate mismatch
      // The certificate is for us2.smtp.mailhostbox.com but we connect to smtp.expertclaims.co.in
      // This is safe when you trust the SMTP server
      rejectUnauthorized: false
    },
    // Require TLS encryption
    requireTLS: true,
  });
}

class AdminController {
  // GET /admin/admindashboard
  // Get admin dashboard statistics
  static async getAdminDashboard(req, res) {
    try {
      console.log('[Admin] Fetching admin dashboard statistics');

      // Status mapping (ticket_stage → status) - same as employee dashboard
      const statusMap = {
        "Under Evaluation": "Under Review",
        "Evaluation under review": "Under Review",
        "Evaluated": "Under Review",
        "Agreement pending": "Under Review",
        "1st Instalment Pending": "Under Review",
        "Under process": "Under Review",
        "Pending with grievance cell of insurance company": "Under Review",
        "Pending with Ombudsman": "Under Review",
        "Under Litigation/Consumer Forum": "Under Review",
        "Under Arbitration": "Under Review",
        "on hold": "Under Review",
        "Completed": "Approved",
        "Partner Payment Pending": "Approved",
        "Partner Payment Done": "Approved",
        "Cancelled": "Rejected"
      };

      // Fetch all cases (tasks) - not deleted
      const { data: allCases, error: casesError } = await supabase
        .from('cases')
        .select('ticket_stage')
        .eq('deleted_flag', false);

      if (casesError) {
        logger.logDatabaseError(casesError, 'SELECT', 'cases', {
          query: 'Fetching cases for dashboard',
          filters: { deleted_flag: false }
        });
        logger.logFailedOperation(req, 500, 'DASHBOARD_FETCH_ERROR', 'Failed to fetch cases data', {
          operation: 'getAdminDashboard',
          error: casesError.message || 'Unknown error'
        });
        console.error('[Admin] Error fetching cases:', casesError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch cases data',
          error_code: 'CASES_FETCH_ERROR',
          error: casesError.message || 'Unknown error'
        }]);
      }

      // Map ticket_stage to status and count
      const cases = (allCases || []).map(c => ({
        status: statusMap[c.ticket_stage] || "Under Review"
      }));

      const totalTasks = cases.length;
      const reviewCounts = cases.filter(c => c.status === "Under Review").length;
      const completedCounts = cases.filter(c => c.status === "Approved").length;
      const cancelledCounts = cases.filter(c => c.status === "Rejected").length;

      // Fetch pending approvals from backlog table (items that need approval)
      // Pending approvals are backlog items that are not deleted and might not have a status or have specific status
      let pendingApprovals = 0;
      const { data: backlogItems, error: backlogError } = await supabase
        .from('backlog')
        .select('status, deleted_flag')
        .eq('deleted_flag', false);

      if (backlogError) {
        logger.logDatabaseError(backlogError, 'SELECT', 'backlog', {
          query: 'Fetching backlog items for dashboard',
          filters: { deleted_flag: false }
        });
        console.error('[Admin] Error fetching backlog:', backlogError);
        // Set pendingApprovals to 0 if error
        pendingApprovals = 0;
      } else {
        // Count pending approvals - backlog items without status or with pending status
        pendingApprovals = (backlogItems || []).filter(item => {
          const status = item.status?.toLowerCase() || '';
          return !status ||
            status.includes('pending') ||
            status.includes('approval') ||
            status === 'new' ||
            status === '';
        }).length;
      }

      // Fetch active users - users with recent login (last 30 days) or not deleted
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch all non-deleted users
      let activeUsers = 0;
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('user_id, last_login, deleted_flag')
        .eq('deleted_flag', false);

      if (usersError) {
        console.error('[Admin] Error fetching active users:', usersError);
        // Set activeUsers to 0 if error
        activeUsers = 0;
      } else {
        // Count active users - users with login in last 30 days or no login record (new users)
        activeUsers = (allUsers || []).filter(user => {
          if (!user.last_login) return true; // New users without login record
          const lastLogin = new Date(user.last_login);
          return lastLogin >= thirtyDaysAgo;
        }).length;
      }

      // Build response matching the expected format
      const dashboardStats = {
        totalTasks,
        activeUsers,
        pendingApprovals,
        reviewCounts,
        cancelledCounts,
        completedCounts
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([dashboardStats]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getAdminDashboard',
        context: 'Admin Dashboard API',
        errorType: 'DashboardFetchError'
      });
      console.error('[Admin] Get admin dashboard error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_SERVER_ERROR'
      }]);
    }
  }

  // GET /admin/getusers?page={page}&size={size} OR /admin/getusers?id={id}&type=edit
  // Get all users with pagination and role-specific data OR get single user by ID for editing
  static async getUsers(req, res) {
    try {
      const { page, size, id, type } = req.query;
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];

      // Handle single user fetch for editing (type=edit)
      if (type === 'edit' && id) {
        return await AdminController.getUserById(req, res, id, sessionId, jwtToken);
      }

      // Default pagination values if not provided
      const pageNum = page ? parseInt(page) : 1;
      const sizeNum = size ? parseInt(size) : 10000; // Default to large number to get all users

      // Validate pagination parameters if provided
      if (page && (isNaN(pageNum) || pageNum < 1)) {
        logger.logFailedOperation(req, 400, 'INVALID_PARAMETERS', 'page must be a valid positive number', {
          operation: 'getUsers',
          providedPage: page,
          pageNum: pageNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'page must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      if (size && (isNaN(sizeNum) || sizeNum < 1)) {
        logger.logFailedOperation(req, 400, 'INVALID_PARAMETERS', 'size must be a valid positive number', {
          operation: 'getUsers',
          providedSize: size,
          sizeNum: sizeNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'size must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      console.log(`[Admin] Fetching users - page: ${pageNum}, size: ${sizeNum}`);

      // Calculate pagination
      const offset = (pageNum - 1) * sizeNum;

      // Fetch users with pagination (exclude deleted users)
      // Order by user_id in descending order (newest first)
      const { data: users, error: usersError, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('deleted_flag', false)
        .order('user_id', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (usersError) {
        logger.logDatabaseError(usersError, 'SELECT', 'users', {
          query: 'Fetching users with pagination',
          page: pageNum,
          size: sizeNum,
          offset: offset
        });
        logger.logFailedOperation(req, 500, 'USER_FETCH_ERROR', 'Failed to fetch users', {
          operation: 'getUsers',
          error: usersError.message
        });
        console.error('[Admin] Error fetching users:', usersError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch users',
          error_code: 'USER_FETCH_ERROR',
          error: usersError.message || 'Unknown error'
        }]);
      }

      // Fetch role-specific data for each user
      const usersWithRoleData = await Promise.all(
        (users || []).map(async (user) => {
          const role = user.role?.toLowerCase();
          let employees = null;
          let partners = null;
          let customers = null;
          let admin = null;

          // Fetch role-specific data based on user role
          if (role === 'employee' && user.user_id) {
            const { data: employeeData, error: employeeError } = await supabase
              .from('employees')
              .select('*')
              .eq('user_id', user.user_id)
              .limit(1)
              .maybeSingle();

            if (!employeeError && employeeData) {
              employees = employeeData;
            }
          } else if (role === 'partner' && user.user_id) {
            const { data: partnerData, error: partnerError } = await supabase
              .from('partners')
              .select('*')
              .eq('user_id', user.user_id)
              .limit(1)
              .maybeSingle();

            if (!partnerError && partnerData) {
              partners = partnerData;
            }
          } else if (role === 'customer' && user.user_id) {
            const { data: customerData, error: customerError } = await supabase
              .from('customers')
              .select('*')
              .eq('user_id', user.user_id)
              .limit(1)
              .maybeSingle();

            if (!customerError && customerData) {
              customers = customerData;
            }
          } else if (role === 'admin' && user.user_id) {
            const { data: adminData, error: adminError } = await supabase
              .from('admin')
              .select('*')
              .eq('user_id', user.user_id)
              .limit(1)
              .maybeSingle();

            if (!adminError && adminData) {
              admin = adminData;
            }
          }

          // Format user object
          return {
            user_id: user.user_id,
            username: user.username || '',
            email: user.email || '',
            role: user.role || '',
            status: user.status || (user.deleted_flag ? 'inactive' : 'active'), // Use status field from DB, fallback to deleted_flag
            created_time: user.created_time || user.created_at || null,
            employees: employees,
            partners: partners,
            customers: customers,
            admin: admin
          };
        })
      );

      // Get session information
      let sessionData = null;
      let sessionEndtime = null;

      if (sessionId) {
        const { data: session } = await SessionModel.findBySessionId(sessionId);
        if (session) {
          sessionData = session;
          sessionEndtime = session.expires_at;
        }
      } else if (jwtToken) {
        const { data: session } = await SessionModel.findByJwtToken(jwtToken);
        if (session) {
          sessionData = session;
          sessionEndtime = session.expires_at;
        }
      }

      // If no session found, use request headers or defaults
      const finalSessionId = sessionData?.session_id || sessionId || '';
      const finalJwtToken = sessionData?.jwt_token || jwtToken || '';
      const finalSessionEndtime = sessionEndtime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default 24 hours

      // Build response
      const response = {
        status: 'success',
        message: 'Users retrieved successfully',
        session_id: finalSessionId,
        session_endtime: finalSessionEndtime,
        jwt_token: finalJwtToken,
        data: usersWithRoleData
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getUsers',
        context: 'Get Users API',
        errorType: 'UserFetchError',
        queryParams: req.query,
        mode: req.query.id ? 'single_user' : 'pagination'
      });
      console.error('[Admin] Get users error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_SERVER_ERROR'
      }]);
    }
  }

  // Helper method to get single user by ID with role-specific data
  static async getUserById(req, res, userId, sessionId, jwtToken) {
    try {
      const userIdNum = parseInt(userId);

      if (isNaN(userIdNum) || userIdNum < 1) {
        logger.logFailedOperation(req, 400, 'INVALID_PARAMETERS', 'id must be a valid positive number', {
          operation: 'getUserById',
          providedId: userId,
          userIdNum: userIdNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'id must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      console.log(`[Admin] Fetching user by ID for editing - user_id: ${userIdNum}`);

      // Fetch user by ID (exclude deleted users)
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userIdNum)
        .eq('deleted_flag', false)
        .single();

      if (userError || !user) {
        if (userError) {
          logger.logDatabaseError(userError, 'SELECT', 'users', {
            query: 'Fetching user by ID',
            user_id: userIdNum
          });
        }
        logger.logFailedOperation(req, 404, 'USER_NOT_FOUND', 'User not found', {
          operation: 'getUserById',
          user_id: userIdNum,
          error: userError?.message || 'User not found'
        });
        console.error('[Admin] Error fetching user:', userError);
        return res.status(404).json([{
          status: 'error',
          message: 'User not found',
          error_code: 'USER_NOT_FOUND'
        }]);
      }

      // Fetch role-specific data based on user role
      const role = user.role?.toLowerCase();
      let employees = null;
      let partners = null;
      let customers = null;
      let admin = null;

      if (role === 'employee' && user.user_id) {
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1)
          .maybeSingle();

        if (!employeeError && employeeData) {
          employees = employeeData;
        }
      } else if (role === 'partner' && user.user_id) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1)
          .maybeSingle();

        if (!partnerError && partnerData) {
          partners = partnerData;
        }
      } else if (role === 'customer' && user.user_id) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1)
          .maybeSingle();

        if (!customerError && customerData) {
          customers = customerData;
        }
      } else if (role === 'admin' && user.user_id) {
        const { data: adminData, error: adminError } = await supabase
          .from('admin')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1)
          .maybeSingle();

        if (!adminError && adminData) {
          admin = adminData;
        }
      }

      // Format user object
      const userWithRoleData = {
        user_id: user.user_id,
        username: user.username || '',
        email: user.email || '',
        role: user.role || '',
        status: user.status || (user.deleted_flag ? 'inactive' : 'active'), // Use status field from DB, fallback to deleted_flag
        created_time: user.created_time || user.created_at || null,
        employees: employees,
        partners: partners,
        customers: customers,
        admin: admin
      };

      // Get session information
      let sessionData = null;
      let sessionEndtime = null;

      if (sessionId) {
        const { data: session } = await SessionModel.findBySessionId(sessionId);
        if (session) {
          sessionData = session;
          sessionEndtime = session.expires_at;
        }
      } else if (jwtToken) {
        const { data: session } = await SessionModel.findByJwtToken(jwtToken);
        if (session) {
          sessionData = session;
          sessionEndtime = session.expires_at;
        }
      }

      // If no session found, use request headers or defaults
      const finalSessionId = sessionData?.session_id || sessionId || '';
      const finalJwtToken = sessionData?.jwt_token || jwtToken || '';
      const finalSessionEndtime = sessionEndtime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default 24 hours

      // Build response - data as array with single user
      const response = {
        status: 'success',
        message: 'User retrieved successfully',
        session_id: finalSessionId,
        session_endtime: finalSessionEndtime,
        jwt_token: finalJwtToken,
        data: [userWithRoleData] // Wrap in array as expected by frontend
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getUserById',
        context: 'Get User By ID API',
        errorType: 'UserFetchError',
        userId: userId,
        sessionId: sessionId
      });
      console.error('[Admin] Get user by ID error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to retrieve user',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // POST /admin/createuser
  // Create a new user with role-specific data
  static async createUser(req, res) {
    try {
      const {
        first_name,
        last_name,
        email_address,
        password,
        username,
        role,
        mobile_number,
        emergency_contact,
        gender,
        age,
        address,
        // Employee fields
        designation,
        department,
        work_phone_number,
        aadhar_number,
        manager_name,
        joining_date,
        employment_status,
        pan_number,
        // Partner fields
        partner_type,
        license_id,
        license_expiring_date,
        gstin,
        pan,
        state,
        pincode,
        // Customer fields
        customer_type,
        source,
        communication_preference,
        language_preference,
        partner_id,
        notes,
        company_name
      } = req.body;

      console.log('[Admin] Creating user:', { email_address, role });

      // Validate required fields with field-specific errors
      const fieldErrors = {};
      if (!first_name) fieldErrors.first_name = 'First name is required';
      if (!last_name) fieldErrors.last_name = 'Last name is required';
      if (!email_address) fieldErrors.email_address = 'Email address is required';
      if (!password) fieldErrors.password = 'Password is required';
      if (!username) fieldErrors.username = 'Username is required';
      if (!role) fieldErrors.role = 'Role is required';

      if (Object.keys(fieldErrors).length > 0) {
        logger.logFailedOperation(req, 400, 'VALIDATION_ERROR', 'Validation failed - missing required fields', {
          operation: 'createUser',
          fieldErrors: fieldErrors
        });
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: fieldErrors
        }]);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email_address)) {
        logger.logFailedOperation(req, 400, 'VALIDATION_ERROR', 'Invalid email format', {
          operation: 'createUser',
          email: email_address
        });
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: {
            email_address: 'Invalid email format'
          }
        }]);
      }

      // Validate and hash password
      let passwordHash = password;
      
      // Check if password is already a valid bcrypt hash
      const isBcryptHash = password && typeof password === 'string' && 
        (password.startsWith('$2b$') || password.startsWith('$2a$') || password.startsWith('$2y$'));
      
      if (!isBcryptHash) {
        // Generate password based on first_name and last_name if password is not a valid hash
        // Use first_name + last_name + a random number as the password
        const nameBasedPassword = `${first_name || 'user'}${last_name || ''}${Date.now()}`.toLowerCase();
        
        try {
          // Generate bcrypt hash with salt rounds 10
          passwordHash = await bcrypt.hash(nameBasedPassword, 10);
          console.log('[Admin] Auto-generated password hash for user:', email_address);
          logger.logInfo('[Admin] Auto-generated password hash', {
            operation: 'createUser',
            email: email_address,
            reason: 'Password was not a valid bcrypt hash'
          });
        } catch (hashError) {
          logger.logError(hashError, req, {
            operation: 'createUser',
            context: 'Password Hashing',
            errorType: 'PasswordHashError'
          });
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to hash password',
            error_code: 'INTERNAL_ERROR',
            error_details: hashError?.message || 'Unknown error'
          }]);
        }
      }

      // Validate role
      const validRoles = ['admin', 'employee', 'customer', 'partner'];
      const normalizedRole = role.toLowerCase();
      if (!validRoles.includes(normalizedRole)) {
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: {
            role: 'Invalid role. Must be one of: admin, employee, partner, customer'
          }
        }]);
      }

      // Validate role-specific required fields
      const roleFieldErrors = {};
      if (normalizedRole === 'employee') {
        if (!designation || (typeof designation === 'string' && designation.trim() === '')) {
          roleFieldErrors.designation = 'Designation is required for employee role';
        }
        if (!department || (typeof department === 'string' && department.trim() === '')) {
          roleFieldErrors.department = 'Department is required for employee role';
        }
        if (!joining_date || (typeof joining_date === 'string' && joining_date.trim() === '')) {
          roleFieldErrors.joining_date = 'Joining date is required for employee role';
        }
        if (!employment_status || (typeof employment_status === 'string' && employment_status.trim() === '')) {
          roleFieldErrors.employment_status = 'Employment status is required for employee role';
        }
      } else if (normalizedRole === 'partner') {
        if (!partner_type || (typeof partner_type === 'string' && partner_type.trim() === '')) {
          roleFieldErrors.partner_type = 'Partner type is required for partner role';
        }
      }

      // Return validation errors if any role-specific fields are missing
      if (Object.keys(roleFieldErrors).length > 0) {
        logger.logFailedOperation(req, 400, 'VALIDATION_ERROR', 'Validation failed - missing role-specific required fields', {
          operation: 'createUser',
          role: normalizedRole,
          fieldErrors: roleFieldErrors
        });
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: roleFieldErrors
        }]);
      }

      // Validate age if provided (must be a number)
      if (age !== undefined && age !== null) {
        const ageNum = typeof age === 'string' ? parseInt(age) : age;
        if (isNaN(ageNum) || ageNum < 0) {
          logger.logFailedOperation(req, 400, 'VALIDATION_ERROR', 'Invalid age value', {
            operation: 'createUser',
            providedAge: age,
            ageNum: ageNum
          });
          return res.status(400).json([{
            status: 'error',
            message: 'Validation failed',
            error_code: 'VALIDATION_ERROR',
            field_errors: {
              age: 'Age must be a valid positive number'
            }
          }]);
        }
      }

      // Check if email already exists
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('user_id, email, username')
        .or(`email.eq.${email_address},username.eq.${username}`);

      if (checkError) {
        logger.logDatabaseError(checkError, 'SELECT', 'users', {
          query: 'Checking for existing users with email or username',
          email: email_address,
          username: username
        });
        logger.logFailedOperation(req, 500, 'INTERNAL_ERROR', 'Failed to check existing users', {
          operation: 'createUser',
          error: checkError.message
        });
        console.error('[Admin] Error checking existing users:', checkError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to create user',
          error_code: 'INTERNAL_ERROR'
        }]);
      }

      if (existingUsers && existingUsers.length > 0) {
        const fieldErrors = {};
        const emailExists = existingUsers.some(u => u.email === email_address);
        const usernameExists = existingUsers.some(u => u.username === username);

        if (emailExists) {
          fieldErrors.email = 'Email address is already registered';
        }
        if (usernameExists) {
          fieldErrors.username = 'Username is already taken';
        }
        logger.logFailedOperation(req, 409, 'USER_001',
          emailExists && usernameExists
            ? 'Email and username already exist'
            : emailExists
              ? 'Email already exists'
              : 'Username already exists', {
          operation: 'createUser',
          email: email_address,
          username: username,
          fieldErrors: fieldErrors
        });
        return res.status(409).json([{
          status: 'error',
          message: emailExists && usernameExists
            ? 'Email and username already exist'
            : emailExists
              ? 'Email already exists'
              : 'Username already exists',
          error_code: 'USER_001',
          field_errors: fieldErrors
        }]);
      }

      // Note: user_id is GENERATED ALWAYS AS IDENTITY (auto-incrementing), so we don't set it manually

      // Create user in users table
      const now = new Date().toISOString();
      const userData = {
        // user_id is auto-generated by database - don't include it
        username: username,
        email: email_address,
        mobile_number: mobile_number || null,
        password_hash: passwordHash, // Use the hashed password (either provided or auto-generated)
        role: normalizedRole,
        status: 'active',
        created_time: now,
        updated_time: now,
        deleted_flag: false
      };

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([userData])
        .select('user_id, username, email, role, created_time')
        .single();

      if (userError || !newUser) {
        logger.logDatabaseError(userError || new Error('User creation returned null'), 'INSERT', 'users', {
          query: 'Creating new user',
          userData: { email: email_address, username: username, role: normalizedRole }
        });
        console.error('[Admin] Error creating user:', userError);
        console.error('[Admin] User error details:', JSON.stringify(userError, null, 2));
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to create user',
          error_code: 'INTERNAL_ERROR',
          error_details: userError?.message || 'Unknown error'
        }]);
      }

      const userId = newUser.user_id;

      // Create role-specific record
      if (normalizedRole === 'employee') {
        // Note: employee_id is GENERATED ALWAYS AS IDENTITY (auto-incrementing), so we don't set it manually
        const employeeData = {
          // employee_id is auto-generated by database - don't include it
          user_id: userId,
          first_name: first_name,
          last_name: last_name,
          mobile_number: mobile_number || null,
          emergency_contact: emergency_contact || null,
          gender: gender || null,
          age: age ? String(age) : null,
          address: address || null,
          designation: designation || null,
          department: department || null,
          work_phone: work_phone_number || null,
          aadhar_number: aadhar_number ? (typeof aadhar_number === 'string' ? parseInt(aadhar_number) : aadhar_number) : null,
          manager: manager_name || null,
          joining_date: joining_date || null,
          employment_status: employment_status || null,
          pan_number: pan_number || null,
          created_time: now,
          updated_time: now,
          deleted_flag: false
        };

        const { error: employeeError } = await supabase
          .from('employees')
          .insert([employeeData]);

        if (employeeError) {
          logger.logDatabaseError(employeeError, 'INSERT', 'employees', {
            query: 'Creating employee record for new user',
            user_id: userId,
            rollback: 'Deleting user record due to employee creation failure'
          });
          console.error('[Admin] Error creating employee record:', employeeError);
          console.error('[Admin] Employee error details:', JSON.stringify(employeeError, null, 2));
          // Rollback user creation
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create employee record',
            error_code: 'INTERNAL_ERROR',
            error_details: employeeError?.message || 'Unknown error',
            error_hint: employeeError?.hint || null
          }]);
        }
      } else if (normalizedRole === 'partner') {
        // Note: partner_id is GENERATED ALWAYS AS IDENTITY (auto-incrementing), so we don't set it manually
        const partnerData = {
          // partner_id is auto-generated by database - don't include it
          user_id: userId,
          first_name: first_name,
          last_name: last_name,
          mobile_number: mobile_number || null,
          emergency_contact: emergency_contact || null,
          gender: gender || null,
          age: age ? parseInt(age) : null,
          address: address || null,
          partner_type: partner_type || null,
          license_id: license_id || null,
          license_expire_date: license_expiring_date || null,
          gstin: gstin || null,
          pan: pan || null,
          state: state || null,
          pincode: pincode || null,
          created_at: now,
          updated_at: now,
          deleted_flag: false
        };

        const { error: partnerError } = await supabase
          .from('partners')
          .insert([partnerData]);

        if (partnerError) {
          console.error('[Admin] Error creating partner record:', partnerError);
          console.error('[Admin] Partner error details:', JSON.stringify(partnerError, null, 2));
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create partner record',
            error_code: 'INTERNAL_ERROR',
            error_details: partnerError?.message || 'Unknown error',
            error_hint: partnerError?.hint || null
          }]);
        }
      } else if (normalizedRole === 'customer') {
        // Note: customer_id is GENERATED ALWAYS AS IDENTITY (auto-incrementing), so we don't set it manually
        const customerData = {
          // customer_id is auto-generated by database - don't include it
          user_id: userId,
          first_name: first_name,
          last_name: last_name,
          mobile_number: mobile_number || null,
          emergency_contact: emergency_contact || null,
          gender: gender || null,
          age: age ? String(age) : null,
          address: address || null,
          customer_type: customer_type || null,
          source: source || null,
          communication_preferences: communication_preference || null,
          language_preference: language_preference || null,
          partner_id: partner_id || null,
          notes: notes || null,
          company_name: company_name || null,
          gstin: gstin || null,
          pan: pan || null,
          state: state || null,
          pincode: pincode || null,
          created_time: now,
          updated_time: now,
          deleted_flag: false
        };

        const { error: customerError } = await supabase
          .from('customers')
          .insert([customerData]);

        if (customerError) {
          console.error('[Admin] Error creating customer record:', customerError);
          console.error('[Admin] Customer error details:', JSON.stringify(customerError, null, 2));
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create customer record',
            error_code: 'INTERNAL_ERROR',
            error_details: customerError?.message || 'Unknown error',
            error_hint: customerError?.hint || null
          }]);
        }
      } else if (normalizedRole === 'admin') {
        // Note: admin_id is GENERATED ALWAYS AS IDENTITY (auto-incrementing), so we don't set it manually
        const adminData = {
          // admin_id is auto-generated by database - don't include it
          user_id: userId,
          first_name: first_name,
          last_name: last_name,
          mobile_number: mobile_number || null,
          emergency_contact: emergency_contact || null,
          gender: gender || null,
          age: age ? parseInt(age) : null,
          address: address || null,
          created_at: now,
          updated_at: now
        };

        const { error: adminError } = await supabase
          .from('admin')
          .insert([adminData]);

        if (adminError) {
          console.error('[Admin] Error creating admin record:', adminError);
          console.error('[Admin] Admin error details:', JSON.stringify(adminError, null, 2));
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create user',
            error_code: 'INTERNAL_ERROR',
            error_details: adminError?.message || 'Unknown error'
          }]);
        }
      }

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'User created successfully',
        data: {
          user_id: newUser.user_id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          status: 'active',
          created_time: newUser.created_time
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'createUser',
        context: 'Create User API',
        errorType: 'UserCreationError',
        userData: {
          email: req.body?.email_address,
          username: req.body?.username,
          role: req.body?.role
        }
      });
      console.error('[Admin] Create user error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to create user',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // PATCH /admin/updateuser
  // Update an existing user with role-specific data
  static async updateUser(req, res) {
    try {
      const {
        user_id,
        first_name,
        last_name,
        email_address,
        password,
        username,
        role,
        status,
        mobile_number,
        emergency_contact,
        gender,
        age,
        address,
        // Employee fields
        designation,
        department,
        work_phone_number,
        aadhar_number,
        manager_name,
        joining_date,
        employment_status,
        pan,
        // Partner fields
        partner,
        // Customer fields
        customer_details
      } = req.body;

      console.log('[Admin] Updating user:', { user_id, email_address, role });

      // Validate required fields
      if (!user_id) {
        logger.logFailedOperation(req, 400, 'MISSING_USER_ID', 'user_id is required', {
          operation: 'updateUser'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'user_id is required',
          error_code: 'MISSING_USER_ID'
        }]);
      }

      // Check if user exists
      const { data: existingUser, error: userFetchError } = await supabase
        .from('users')
        .select('user_id, email, username, role')
        .eq('user_id', user_id)
        .single();

      if (userFetchError || !existingUser) {
        if (userFetchError) {
          logger.logDatabaseError(userFetchError, 'SELECT', 'users', {
            query: 'Fetching user for update',
            user_id: user_id
          });
        }
        logger.logFailedOperation(req, 404, 'USER_NOT_FOUND', 'User not found', {
          operation: 'updateUser',
          user_id: user_id,
          error: userFetchError?.message || 'User not found'
        });
        return res.status(404).json([{
          status: 'error',
          message: 'User not found',
          error_code: 'USER_NOT_FOUND'
        }]);
      }

      const normalizedRole = existingUser.role?.toLowerCase() || role?.toLowerCase();

      // Update user in users table
      const now = new Date().toISOString();
      const userUpdateData = {
        updated_time: now
      };

      if (email_address) userUpdateData.email = email_address;
      if (username) userUpdateData.username = username;
      if (mobile_number !== undefined) userUpdateData.mobile_number = mobile_number || null;
      if (password && password !== '') userUpdateData.password_hash = password; // Only update if password provided
      // Update status field - allow null, empty string, or valid enum values
      if (status !== undefined) {
        userUpdateData.status = (status === null || status === '') ? null : status;
        console.log(`[Admin] Updating user status: ${status} -> ${userUpdateData.status} for user_id: ${user_id}`);
        
        // If status is "inactive" or "suspended", also set deleted_flag to true
        const statusLower = (status || '').toLowerCase();
        if (statusLower === 'inactive' || statusLower === 'suspended') {
          userUpdateData.deleted_flag = true;
          console.log(`[Admin] Setting deleted_flag to true for user_id: ${user_id} due to status: ${status}`);
        } else if (statusLower === 'active') {
          // If status is "active", set deleted_flag to false
          userUpdateData.deleted_flag = false;
          console.log(`[Admin] Setting deleted_flag to false for user_id: ${user_id} due to status: ${status}`);
        }
      }

      console.log('[Admin] User update data:', JSON.stringify(userUpdateData, null, 2));

      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdateData)
        .eq('user_id', user_id);

      if (userUpdateError) {
        logger.logDatabaseError(userUpdateError, 'UPDATE', 'users', {
          query: 'Updating user',
          user_id: user_id,
          updateData: Object.keys(userUpdateData)
        });
        logger.logFailedOperation(req, 500, 'USER_UPDATE_ERROR', 'Failed to update user', {
          operation: 'updateUser',
          user_id: user_id,
          error: userUpdateError.message
        });
        console.error('[Admin] Error updating user:', userUpdateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update user',
          error_code: 'USER_UPDATE_ERROR',
          error: userUpdateError.message
        }]);
      }

      // Update role-specific record
      if (normalizedRole === 'employee') {
        const employeeUpdateData = {
          updated_time: now
        };

        if (first_name) employeeUpdateData.first_name = first_name;
        if (last_name) employeeUpdateData.last_name = last_name;
        if (mobile_number !== undefined) employeeUpdateData.mobile_number = mobile_number || null;
        if (emergency_contact !== undefined) employeeUpdateData.emergency_contact = emergency_contact || null;
        if (gender) employeeUpdateData.gender = gender;
        if (age !== undefined) employeeUpdateData.age = age ? String(age) : null;
        if (address !== undefined) employeeUpdateData.address = address || null;
        if (designation) employeeUpdateData.designation = designation;
        if (department) employeeUpdateData.department = department;
        if (work_phone_number !== undefined) employeeUpdateData.work_phone = work_phone_number || null;
        if (aadhar_number !== undefined) employeeUpdateData.aadhar_number = aadhar_number ? (typeof aadhar_number === 'string' ? parseInt(aadhar_number) : aadhar_number) : null;
        if (manager_name !== undefined) employeeUpdateData.manager = manager_name || null;
        if (joining_date !== undefined) employeeUpdateData.joining_date = joining_date || null;
        if (employment_status !== undefined) employeeUpdateData.employment_status = employment_status || null;
        if (pan !== undefined) employeeUpdateData.pan_number = pan || null;

        const { error: employeeUpdateError } = await supabase
          .from('employees')
          .update(employeeUpdateData)
          .eq('user_id', user_id);

        if (employeeUpdateError) {
          logger.logDatabaseError(employeeUpdateError, 'UPDATE', 'employees', {
            query: 'Updating employee record',
            user_id: user_id
          });
          logger.logFailedOperation(req, 500, 'EMPLOYEE_UPDATE_ERROR', 'Failed to update employee record', {
            operation: 'updateUser',
            user_id: user_id,
            role: 'employee',
            error: employeeUpdateError.message
          });
          console.error('[Admin] Error updating employee record:', employeeUpdateError);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to update employee record',
            error_code: 'EMPLOYEE_UPDATE_ERROR',
            error: employeeUpdateError.message
          }]);
        }
      } else if (normalizedRole === 'partner') {
        const partnerUpdateData = {
          updated_at: now
        };

        // Handle partner object or direct fields
        if (partner) {
          if (partner.first_name) partnerUpdateData.first_name = partner.first_name;
          if (partner.last_name) partnerUpdateData.last_name = partner.last_name;
          if (partner.mobile_number !== undefined) partnerUpdateData.mobile_number = partner.mobile_number || null;
          if (partner.emergency_contact !== undefined) partnerUpdateData.emergency_contact = partner.emergency_contact || null;
          if (partner.gender) partnerUpdateData.gender = partner.gender;
          if (partner.age !== undefined) partnerUpdateData.age = partner.age ? parseInt(partner.age) : null;
          if (partner.address !== undefined) partnerUpdateData.address = partner.address || null;
          if (partner.gstin !== undefined) partnerUpdateData.gstin = partner.gstin || null;
          if (partner.pan !== undefined) partnerUpdateData.pan = partner.pan || null;
          if (partner.state !== undefined) partnerUpdateData.state = partner.state || null;
          if (partner.pincode !== undefined) partnerUpdateData.pincode = partner.pincode || null;
        } else {
          if (first_name) partnerUpdateData.first_name = first_name;
          if (last_name) partnerUpdateData.last_name = last_name;
          if (mobile_number !== undefined) partnerUpdateData.mobile_number = mobile_number || null;
          if (emergency_contact !== undefined) partnerUpdateData.emergency_contact = emergency_contact || null;
          if (gender) partnerUpdateData.gender = gender;
          if (age !== undefined) partnerUpdateData.age = age ? parseInt(age) : null;
          if (address !== undefined) partnerUpdateData.address = address || null;
        }

        const { error: partnerUpdateError } = await supabase
          .from('partners')
          .update(partnerUpdateData)
          .eq('user_id', user_id);

        if (partnerUpdateError) {
          logger.logDatabaseError(partnerUpdateError, 'UPDATE', 'partners', {
            query: 'Updating partner record',
            user_id: user_id
          });
          logger.logFailedOperation(req, 500, 'PARTNER_UPDATE_ERROR', 'Failed to update partner record', {
            operation: 'updateUser',
            user_id: user_id,
            role: 'partner',
            error: partnerUpdateError.message
          });
          console.error('[Admin] Error updating partner record:', partnerUpdateError);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to update partner record',
            error_code: 'PARTNER_UPDATE_ERROR',
            error: partnerUpdateError.message
          }]);
        }
      } else if (normalizedRole === 'customer') {
        const customerUpdateData = {
          updated_time: now
        };

        // Handle customer_details object or direct fields
        if (customer_details) {
          if (customer_details.first_name !== undefined) customerUpdateData.first_name = customer_details.first_name;
          if (customer_details.last_name !== undefined) customerUpdateData.last_name = customer_details.last_name;
          if (customer_details.customer_type !== undefined) customerUpdateData.customer_type = customer_details.customer_type || null;
          if (customer_details.company_name !== undefined) customerUpdateData.company_name = customer_details.company_name || null;
          if (customer_details.source !== undefined) customerUpdateData.source = customer_details.source || null;
          if (customer_details.communication_preference !== undefined) customerUpdateData.communication_preferences = customer_details.communication_preference || null;
          if (customer_details.language_preference !== undefined) customerUpdateData.language_preference = customer_details.language_preference || null;
          if (customer_details.partner_id !== undefined) customerUpdateData.partner_id = customer_details.partner_id || null;
          if (customer_details.notes !== undefined) customerUpdateData.notes = customer_details.notes || null;
          if (customer_details.gstin !== undefined) customerUpdateData.gstin = customer_details.gstin || null;
          if (customer_details.pan !== undefined) customerUpdateData.pan = customer_details.pan || null;
          if (customer_details.state !== undefined) customerUpdateData.state = customer_details.state || null;
          if (customer_details.pincode !== undefined) customerUpdateData.pincode = customer_details.pincode || null;
          if (customer_details.created_by !== undefined) customerUpdateData.created_by = customer_details.created_by || null;
          if (customer_details.updated_by !== undefined) customerUpdateData.updated_by = customer_details.updated_by || null;
        } else {
          if (first_name) customerUpdateData.first_name = first_name;
          if (last_name) customerUpdateData.last_name = last_name;
          if (mobile_number !== undefined) customerUpdateData.mobile_number = mobile_number || null;
          if (emergency_contact !== undefined) customerUpdateData.emergency_contact = emergency_contact || null;
          if (gender) customerUpdateData.gender = gender;
          if (age !== undefined) customerUpdateData.age = age ? String(age) : null;
          if (address !== undefined) customerUpdateData.address = address || null;
        }

        const { error: customerUpdateError } = await supabase
          .from('customers')
          .update(customerUpdateData)
          .eq('user_id', user_id);

        if (customerUpdateError) {
          logger.logDatabaseError(customerUpdateError, 'UPDATE', 'customers', {
            query: 'Updating customer record',
            user_id: user_id
          });
          logger.logFailedOperation(req, 500, 'CUSTOMER_UPDATE_ERROR', 'Failed to update customer record', {
            operation: 'updateUser',
            user_id: user_id,
            role: 'customer',
            error: customerUpdateError.message
          });
          console.error('[Admin] Error updating customer record:', customerUpdateError);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to update customer record',
            error_code: 'CUSTOMER_UPDATE_ERROR',
            error: customerUpdateError.message
          }]);
        }
      } else if (normalizedRole === 'admin') {
        const adminUpdateData = {
          updated_at: now
        };

        if (first_name) adminUpdateData.first_name = first_name;
        if (last_name) adminUpdateData.last_name = last_name;
        if (mobile_number !== undefined) adminUpdateData.mobile_number = mobile_number || null;
        if (emergency_contact !== undefined) adminUpdateData.emergency_contact = emergency_contact || null;
        if (gender) adminUpdateData.gender = gender;
        if (age !== undefined) adminUpdateData.age = age ? parseInt(age) : null;
        if (address !== undefined) adminUpdateData.address = address || null;

        const { error: adminUpdateError } = await supabase
          .from('admin')
          .update(adminUpdateData)
          .eq('user_id', user_id);

        if (adminUpdateError) {
          logger.logDatabaseError(adminUpdateError, 'UPDATE', 'admin', {
            query: 'Updating admin record',
            user_id: user_id
          });
          logger.logFailedOperation(req, 500, 'ADMIN_UPDATE_ERROR', 'Failed to update admin record', {
            operation: 'updateUser',
            user_id: user_id,
            role: 'admin',
            error: adminUpdateError.message
          });
          console.error('[Admin] Error updating admin record:', adminUpdateError);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to update admin record',
            error_code: 'ADMIN_UPDATE_ERROR',
            error: adminUpdateError.message
          }]);
        }
      }

      // Fetch updated user to return complete data including status
      const { data: updatedUser, error: fetchError } = await supabase
        .from('users')
        .select('user_id, email, username, role, status, mobile_number, updated_time')
        .eq('user_id', user_id)
        .single();

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'User updated successfully',
        data: {
          user_id: user_id,
          updated_time: now,
          status: updatedUser?.status || null,
          ...(updatedUser || {})
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'updateUser',
        context: 'Update User API',
        errorType: 'UserUpdateError',
        userId: req.body?.user_id,
        role: req.body?.role
      });
      console.error('[Admin] Update user error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to update user',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // DELETE /admin/deleteuser?user_id={user_id}
  // Soft delete user by setting deleted_flag = true
  static async deleteUser(req, res) {
    try {
      const { user_id } = req.query;
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];

      console.log('[Admin] Deleting user:', { user_id });

      // Validate user_id parameter
      if (!user_id) {
        logger.logFailedOperation(req, 400, 'MISSING_USER_ID', 'user_id query parameter is required', {
          operation: 'deleteUser'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'user_id query parameter is required',
          error_code: 'MISSING_USER_ID'
        }]);
      }

      const userIdNum = parseInt(user_id);
      if (isNaN(userIdNum) || userIdNum < 1) {
        logger.logFailedOperation(req, 400, 'INVALID_USER_ID', 'user_id must be a valid positive number', {
          operation: 'deleteUser',
          providedUserId: user_id,
          userIdNum: userIdNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'user_id must be a valid positive number',
          error_code: 'INVALID_USER_ID'
        }]);
      }

      // Check if user exists and is not already deleted
      const { data: existingUser, error: userFetchError } = await supabase
        .from('users')
        .select('user_id, email, role, deleted_flag')
        .eq('user_id', userIdNum)
        .single();

      if (userFetchError || !existingUser) {
        if (userFetchError) {
          logger.logDatabaseError(userFetchError, 'SELECT', 'users', {
            query: 'Fetching user for deletion',
            user_id: userIdNum
          });
        }
        logger.logFailedOperation(req, 404, 'USER_NOT_FOUND', 'User not found', {
          operation: 'deleteUser',
          user_id: userIdNum,
          error: userFetchError?.message || 'User not found'
        });
        return res.status(404).json([{
          status: 'error',
          message: 'User not found',
          error_code: 'USER_NOT_FOUND'
        }]);
      }

      if (existingUser.deleted_flag === true) {
        logger.logFailedOperation(req, 400, 'USER_ALREADY_DELETED', 'User is already deleted', {
          operation: 'deleteUser',
          user_id: userIdNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'User is already deleted',
          error_code: 'USER_ALREADY_DELETED'
        }]);
      }

      const now = new Date().toISOString();

      // Soft delete user by setting deleted_flag = true
      const { error: deleteError } = await supabase
        .from('users')
        .update({
          deleted_flag: true,
          updated_time: now
        })
        .eq('user_id', userIdNum);

      if (deleteError) {
        logger.logDatabaseError(deleteError, 'UPDATE', 'users', {
          query: 'Soft deleting user',
          user_id: userIdNum,
          operation: 'set deleted_flag = true'
        });
        logger.logFailedOperation(req, 500, 'INTERNAL_ERROR', 'Failed to delete user', {
          operation: 'deleteUser',
          user_id: userIdNum,
          error: deleteError.message || 'Unknown error'
        });
        console.error('[Admin] Error deleting user:', deleteError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to delete user',
          error_code: 'INTERNAL_ERROR',
          error_details: deleteError.message || 'Unknown error'
        }]);
      }

      // Also soft delete role-specific records if they exist
      const role = existingUser.role?.toLowerCase();

      if (role === 'employee') {
        await supabase
          .from('employees')
          .update({ deleted_flag: true, updated_time: now })
          .eq('user_id', userIdNum);
      } else if (role === 'partner') {
        await supabase
          .from('partners')
          .update({ deleted_flag: true, updated_at: now })
          .eq('user_id', userIdNum);
      } else if (role === 'customer') {
        await supabase
          .from('customers')
          .update({ deleted_flag: true, updated_time: now })
          .eq('user_id', userIdNum);
      }
      // Note: admin table doesn't have deleted_flag, so we skip it

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'User deleted successfully',
        data: {
          user_id: userIdNum,
          deleted_time: now
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'deleteUser',
        context: 'Delete User API',
        errorType: 'UserDeletionError',
        userId: req.query?.user_id
      });
      console.error('[Admin] Delete user error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to delete user',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // GET /admin/getleaves?page={page}&size={size}
  // Get all leave applications with employee and leave type information
  static async getLeaveApplications(req, res) {
    try {
      const { page, size } = req.query;
      
      // Default pagination values if not provided
      const pageNum = page ? parseInt(page) : 1;
      const sizeNum = size ? parseInt(size) : 10;

      // Validate pagination parameters if provided
      if (page && (isNaN(pageNum) || pageNum < 1)) {
        return res.status(400).json([{
          status: 'error',
          message: 'page must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      if (size && (isNaN(sizeNum) || sizeNum < 1)) {
        return res.status(400).json([{
          status: 'error',
          message: 'size must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      console.log(`[Admin] Fetching leave applications - page: ${pageNum}, size: ${sizeNum}`);

      // Calculate pagination
      const offset = (pageNum - 1) * sizeNum;

      // Fetch leave applications with pagination
      const { data: leaveApplications, error: leaveError, count } = await supabase
        .from('leave_applications')
        .select('*', { count: 'exact' })
        .order('application_id', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (leaveError) {
        console.error('[Admin] Error fetching leave applications:', leaveError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch leave applications',
          error_code: 'LEAVE_FETCH_ERROR',
          error: leaveError.message || 'Unknown error'
        }]);
      }

      // Get unique employee_ids and leave_type_ids for batch fetching
      const employeeIds = [...new Set((leaveApplications || []).map(la => la.employee_id).filter(Boolean))];
      const leaveTypeIds = [...new Set((leaveApplications || []).map(la => la.leave_type_id).filter(Boolean))];

      // Fetch employees data with user info for designation, email, and mobile
      let employeesMap = {};
      let designationsMap = {};
      let employeeEmailsMap = {};
      if (employeeIds.length > 0) {
        const { data: employees, error: employeesError } = await supabase
          .from('employees')
          .select('employee_id, first_name, last_name, user_id, department, mobile_number')
          .in('employee_id', employeeIds);

        if (!employeesError && employees) {
          employeesMap = employees.reduce((acc, emp) => {
            acc[emp.employee_id] = emp;
            return acc;
          }, {});

          // Get user_ids for email and role lookup
          const userIds = [...new Set(employees.map(emp => emp.user_id).filter(Boolean))];
          
          if (userIds.length > 0) {
            const { data: users, error: usersError } = await supabase
              .from('users')
              .select('user_id, role, email')
              .in('user_id', userIds);

            if (!usersError && users) {
              users.forEach(user => {
                employees.forEach(emp => {
                  if (emp.user_id === user.user_id) {
                    // Use department from employees table, fallback to role from users table
                    designationsMap[emp.employee_id] = emp.department || user.role || 'N/A';
                    employeeEmailsMap[emp.employee_id] = user.email || 'N/A';
                  }
                });
              });
            }
          }
        }
      }

      // Fetch leave types data
      let leaveTypesMap = {};
      if (leaveTypeIds.length > 0) {
        const { data: leaveTypes, error: leaveTypesError } = await supabase
          .from('leave_types')
          .select('leave_type_id, type_name')
          .in('leave_type_id', leaveTypeIds);

        if (!leaveTypesError && leaveTypes) {
          leaveTypesMap = leaveTypes.reduce((acc, lt) => {
            acc[lt.leave_type_id] = lt;
            return acc;
          }, {});
        }
      }

      // Format the response to match frontend expectations
      const formattedLeaves = (leaveApplications || []).map(leave => {
        const employee = leave.employee_id ? employeesMap[leave.employee_id] : null;
        const leaveType = leave.leave_type_id ? leaveTypesMap[leave.leave_type_id] : null;
        const designation = leave.employee_id ? (designationsMap[leave.employee_id] || 'N/A') : 'N/A';
        const employeeEmail = leave.employee_id ? (employeeEmailsMap[leave.employee_id] || 'N/A') : 'N/A';
        const contactNumber = employee?.mobile_number || null;

        return {
          application_id: leave.application_id,
          employee_id: leave.employee_id,
          leave_type_id: leave.leave_type_id,
          start_date: leave.start_date,
          end_date: leave.end_date,
          total_days: leave.total_days,
          reason: leave.reason,
          status: leave.status || 'pending',
          applied_date: leave.applied_date,
          designation: designation,
          employee_email: employeeEmail,
          contact_number: contactNumber,
          emergency_contact: leave.emergency_contact || null,
          employees: {
            employee_id: employee?.employee_id || null,
            first_name: employee?.first_name || '',
            last_name: employee?.last_name || ''
          },
          leave_types: {
            leave_type_id: leaveType?.leave_type_id || null,
            type_name: leaveType?.type_name || 'N/A'
          }
        };
      });

      // Build response matching the expected format
      const response = {
        status: 'success',
        message: 'Leave applications retrieved successfully',
        data: formattedLeaves,
        pagination: {
          page: pageNum,
          size: sizeNum,
          total: count || 0,
          totalPages: count ? Math.ceil(count / sizeNum) : 0
        }
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      console.error('[Admin] Get leave applications error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // PATCH /admin/updateleavestatus
  // Update leave application status (approve or reject)
  static async updateLeaveStatus(req, res) {
    try {
      const { application_id, status, approved_by, approved_date, rejection_reason } = req.body;
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];

      console.log('[Admin] Updating leave application status:', { application_id, status, approved_by });

      // Validate required fields
      if (!application_id) {
        return res.status(400).json([{
          status: 'error',
          message: 'application_id is required',
          error_code: 'MISSING_APPLICATION_ID'
        }]);
      }

      if (!status) {
        return res.status(400).json([{
          status: 'error',
          message: 'status is required',
          error_code: 'MISSING_STATUS'
        }]);
      }

      // Validate status value
      const validStatuses = ['approved', 'rejected', 'pending'];
      const normalizedStatus = status.toLowerCase();
      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json([{
          status: 'error',
          message: 'status must be one of: approved, rejected, pending',
          error_code: 'INVALID_STATUS'
        }]);
      }

      // Validate application_id is a number
      const applicationIdNum = parseInt(application_id);
      if (isNaN(applicationIdNum) || applicationIdNum < 1) {
        return res.status(400).json([{
          status: 'error',
          message: 'application_id must be a valid positive number',
          error_code: 'INVALID_APPLICATION_ID'
        }]);
      }

      // Check if leave application exists
      const { data: existingLeave, error: fetchError } = await supabase
        .from('leave_applications')
        .select('application_id, status')
        .eq('application_id', applicationIdNum)
        .single();

      if (fetchError || !existingLeave) {
        console.error('[Admin] Error fetching leave application:', fetchError);
        return res.status(404).json([{
          status: 'error',
          message: 'Leave application not found',
          error_code: 'LEAVE_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const now = new Date().toISOString();
      const updateData = {
        status: normalizedStatus,
        updated_time: now
      };

      // If approving or rejecting, set approved_by and approved_date
      if (normalizedStatus === 'approved' || normalizedStatus === 'rejected') {
        if (approved_by) {
          const approvedByNum = parseInt(approved_by);
          if (isNaN(approvedByNum) || approvedByNum < 1) {
            return res.status(400).json([{
              status: 'error',
              message: 'approved_by must be a valid positive number',
              error_code: 'INVALID_APPROVED_BY'
            }]);
          }
          updateData.approved_by = approvedByNum;
        }

        if (approved_date) {
          updateData.approved_date = approved_date;
        } else {
          // Use current date if not provided
          updateData.approved_date = new Date().toISOString().slice(0, 10);
        }

        // If rejecting, set rejection_reason if provided
        if (normalizedStatus === 'rejected' && rejection_reason) {
          updateData.rejection_reason = rejection_reason;
        } else if (normalizedStatus === 'rejected') {
          // Clear rejection_reason if not provided (optional)
          updateData.rejection_reason = null;
        }
      } else if (normalizedStatus === 'pending') {
        // If setting back to pending, clear approval fields
        updateData.approved_by = null;
        updateData.approved_date = null;
        updateData.rejection_reason = null;
      }

      // Update the leave application
      const { data: updatedLeave, error: updateError } = await supabase
        .from('leave_applications')
        .update(updateData)
        .eq('application_id', applicationIdNum)
        .select()
        .single();

      if (updateError) {
        console.error('[Admin] Error updating leave application:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update leave application',
          error_code: 'UPDATE_ERROR',
          error: updateError.message || 'Unknown error'
        }]);
      }

      // Build success response
      const response = {
        status: 'success',
        message: `Leave application ${normalizedStatus} successfully`,
        data: {
          application_id: updatedLeave.application_id,
          status: updatedLeave.status,
          approved_by: updatedLeave.approved_by,
          approved_date: updatedLeave.approved_date,
          rejection_reason: updatedLeave.rejection_reason,
          updated_time: updatedLeave.updated_time
        }
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      console.error('[Admin] Update leave status error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

// GET /admin/gapanalysis?employee_id={employee_id}

  // GET /admin/gapanalysis?employee_id={employee_id}
  // Get all backlog/case data for gap analysis in Admin Dashboard
  // When employee_id=0, returns all cases in the system
  static async getGapAnalysis(req, res) {
    try {
      const { employee_id } = req.query;

      // Validate employee_id parameter
      if (employee_id === undefined || employee_id === null || employee_id === '') {
        logger.logFailedOperation(req, 400, 'MISSING_EMPLOYEE_ID', 'employee_id parameter is required', {
          operation: 'getGapAnalysis'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'employee_id is required',
          error_code: 'MISSING_EMPLOYEE_ID'
        }]);
      }

      const employeeIdNum = parseInt(employee_id);
      if (isNaN(employeeIdNum) || employeeIdNum < 0) {
        logger.logFailedOperation(req, 400, 'INVALID_EMPLOYEE_ID', 'employee_id must be a valid number', {
          operation: 'getGapAnalysis',
          providedEmployeeId: employee_id
        });
        return res.status(400).json([{
          status: 'error',
          message: 'employee_id must be a valid number',
          error_code: 'INVALID_EMPLOYEE_ID'
        }]);
      }

      // Fetch backlog data - filter out deleted entries
      let query = supabase
        .from('backlog')
        .select('*')
        .eq('deleted_flag', false);

      if (employeeIdNum !== 0) {
        // Get backlog entries assigned to specific employee
        query = query.eq('assigned_to', employeeIdNum);
      }

      // Order by backlog_id in descending order (newest backlog entries first)
      const { data: backlogList, error: backlogError } = await query.order('backlog_id', { ascending: false });

      if (backlogError) {
        logger.logDatabaseError(backlogError, 'SELECT', 'backlog', {
          query: 'Fetching backlog data for gap analysis',
          employee_id: employeeIdNum,
          filters: { deleted_flag: false }
        });
        logger.logFailedOperation(req, 500, 'BACKLOG_FETCH_ERROR', 'Failed to fetch backlog data', {
          operation: 'getGapAnalysis',
          error: backlogError.message
        });
        console.error('[Admin] Error fetching backlog data:', backlogError);
        return res.status(500).json([{
          status: 'error',
          message: 'An error occurred while fetching backlog data',
          error_code: 'BACKLOG_FETCH_ERROR'
        }]);
      }

      if (!backlogList || backlogList.length === 0) {
        return res.status(200).json([]);
      }

      // Fetch relationships for all backlog entries (similar to BacklogModel.findByEmployeeId)
      const backlogWithRelations = await Promise.all(
        backlogList.map(async (backlog) => {
          // Fetch all relationships for this backlog entry
          const [caseType, partner, employee, comments, documents] = await Promise.all([
            // 1. Get case_types by case_type_id
            backlog.case_type_id
              ? supabase
                .from('case_types')
                .select('*')
                .eq('case_type_id', backlog.case_type_id)
                .single()
                .then(({ data, error }) => ({ data, error }))
                .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 2. Get partners by backlog_referring_partner_id
            backlog.backlog_referring_partner_id
              ? supabase
                .from('partners')
                .select('*')
                .eq('partner_id', backlog.backlog_referring_partner_id)
                .eq('deleted_flag', false)
                .single()
                .then(({ data, error }) => ({ data, error }))
                .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 3. Get employees by assigned_to
            backlog.assigned_to
              ? supabase
                .from('employees')
                .select('*')
                .eq('employee_id', backlog.assigned_to)
                .eq('deleted_flag', false)
                .single()
                .then(({ data, error }) => ({ data, error }))
                .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 4. Get backlog_comments
            supabase
              .from('backlog_comments')
              .select('*')
              .eq('backlog_id', backlog.backlog_id)
              .order('created_time', { ascending: false })
              .then(({ data, error }) => ({ data: data || [], error }))
              .catch(() => ({ data: [], error: null })),

            // 5. Get backlog_documents (filter out deleted documents)
            supabase
              .from('backlog_documents')
              .select('*')
              .eq('backlog_id', backlog.backlog_id)
              .order('upload_time', { ascending: false })
              .then(({ data, error }) => {
                const activeDocs = (data || []).filter(doc => doc.deleted_flag !== true);
                return {
                  data: activeDocs.map(doc => ({
                    ...doc,
                    access_count: doc.access_count ? (isNaN(parseInt(doc.access_count)) ? doc.access_count : parseInt(doc.access_count)) : 0
                  })),
                  error
                };
              })
              .catch(() => ({ data: [], error: null }))
          ]);

          // Attach relationships to backlog entry
          backlog.case_types = caseType.data;
          backlog.partners = partner.data;
          backlog.employees = employee.data;
          backlog.backlog_comments = comments.data || [];
          backlog.backlog_documents = documents.data || [];

          return backlog;
        })
      );

      // Batch fetch all customers and users needed for transformation
      const customerIds = [...new Set(backlogWithRelations.map(b => b.customer_id).filter(Boolean))];
      const userIds = new Set();
      backlogWithRelations.forEach(backlog => {
        (backlog.backlog_comments || []).forEach(comment => {
          if (comment.created_by) userIds.add(comment.created_by);
          if (comment.updated_by) userIds.add(comment.updated_by);
        });
      });
      const userIdsArray = Array.from(userIds);

      // Batch fetch customers and users in parallel
      const [customersResult, usersResult] = await Promise.all([
        customerIds.length > 0
          ? supabase
              .from('customers')
              .select('customer_id, first_name, last_name, email_address')
              .in('customer_id', customerIds)
              .eq('deleted_flag', false)
              .then(({ data, error }) => ({ data: data || [], error }))
              .catch(() => ({ data: [], error: null }))
          : Promise.resolve({ data: [], error: null }),
        userIdsArray.length > 0
          ? supabase
              .from('users')
              .select('user_id, first_name, last_name')
              .in('user_id', userIdsArray)
              .then(({ data, error }) => ({ data: data || [], error }))
              .catch(() => ({ data: [], error: null }))
          : Promise.resolve({ data: [], error: null })
      ]);

      // Create lookup maps for O(1) access
      const customersMap = new Map((customersResult.data || []).map(c => [c.customer_id, c]));
      const usersMap = new Map((usersResult.data || []).map(u => [u.user_id, u]));

      // Transform and enhance the data according to documentation
      const transformedData = backlogWithRelations.map((backlog) => {
          // Get assigned consultant name
          let assignedConsultantName = null;
          if (backlog.employees) {
            const firstName = backlog.employees.first_name || '';
            const lastName = backlog.employees.last_name || '';
            assignedConsultantName = `${firstName} ${lastName}`.trim() || null;
          }

          // Get entity name from multiple sources
          let entityName = null;
          if (backlog.partners) {
            entityName = backlog.partners.entity_name ||
              backlog.partners['name of entity'] ||
              null;
          }
          if (!entityName && backlog.employees) {
            entityName = backlog.employees.entity_name || null;
          }
          if (!entityName && backlog.entity_name) {
            entityName = backlog.entity_name;
          }

          // Get partner name
          let partnerName = null;
          if (backlog.partners) {
            partnerName = backlog.partners.partner_name ||
              (backlog.partners.first_name && backlog.partners.last_name
                ? `${backlog.partners.first_name} ${backlog.partners.last_name}`.trim()
                : null) ||
              null;
          }

          // Get customer data from batch-fetched map
          let customerData = null;
          if (backlog.customer_id) {
            const customer = customersMap.get(backlog.customer_id);
            if (customer) {
              customerData = {
                customer_id: customer.customer_id,
                first_name: customer.first_name || null,
                last_name: customer.last_name || null,
                email_address: customer.email_address || null
              };
            }
          }

          // Format backlog comments with user names from batch-fetched map
          const formattedComments = (backlog.backlog_comments || []).map((comment) => {
              let createdByName = null;
              let updatedByName = null;

              // Get created_by user name from map
              if (comment.created_by) {
                const createdByUser = usersMap.get(comment.created_by);
                if (createdByUser) {
                  const firstName = createdByUser.first_name || '';
                  const lastName = createdByUser.last_name || '';
                  createdByName = `${firstName} ${lastName}`.trim() || null;
                }
              }

              // Get updated_by user name from map
              if (comment.updated_by) {
                const updatedByUser = usersMap.get(comment.updated_by);
                if (updatedByUser) {
                  const firstName = updatedByUser.first_name || '';
                  const lastName = updatedByUser.last_name || '';
                  updatedByName = `${firstName} ${lastName}`.trim() || null;
                }
              }

              return {
                backlog_commentid: comment.backlog_commentid || null,
                backlog_id: comment.backlog_id || backlog.backlog_id || null,
                comment_text: comment.comment_text || null,
                created_by: comment.created_by || null,
                created_time: comment.created_time || null,
                createdby_name: createdByName || comment.createdby_name || null,
                updated_by: comment.updated_by || null,
                updated_time: comment.updated_time || null,
                updatedby_name: updatedByName || comment.updatedby_name || null,
                department: comment.department || null
              };
            });

          // Format backlog documents
          const formattedDocuments = (backlog.backlog_documents || []).map((doc) => ({
            document_id: doc.document_id || null,
            category_id: doc.category_id || null,
            original_filename: doc.original_filename || null,
            stored_filename: doc.stored_filename || null,
            access_count: doc.access_count ? parseInt(doc.access_count) : 0,
            checksum: doc.checksum || null
          }));

          // Format case_types
          const caseTypes = backlog.case_types ? {
            case_type_id: backlog.case_types.case_type_id || null,
            case_type_name: backlog.case_types.case_type_name || null
          } : null;

          // Format partners
          const partners = backlog.partners ? {
            partner_id: backlog.partners.partner_id || null,
            partner_name: partnerName || null,
            entity_name: backlog.partners.entity_name || backlog.partners['name of entity'] || null,
            'name of entity': backlog.partners['name of entity'] || backlog.partners.entity_name || null,
            department: backlog.partners.department || null,
            partner_type: backlog.partners.partner_type || null
          } : null;

          // Format employees
          const employees = backlog.employees ? {
            employee_id: backlog.employees.employee_id || null,
            first_name: backlog.employees.first_name || null,
            last_name: backlog.employees.last_name || null,
            department: backlog.employees.department || null,
            entity_name: backlog.employees.entity_name || null
          } : null;

          // Return formatted backlog entry
          return {
            backlog_id: backlog.backlog_id || null,
            case_summary: backlog.case_summary || null,
            case_description: backlog.case_description || null,
            case_type_id: backlog.case_type_id || null,
            backlog_referring_partner_id: backlog.backlog_referring_partner_id || null,
            backlog_referral_date: backlog.backlog_referral_date || null,
            status: backlog.status || null,
            created_time: backlog.created_time || null,
            created_by: backlog.created_by || null,
            updated_by: backlog.updated_by || null,
            updated_time: backlog.updated_time || null,
            deleted_flag: backlog.deleted_flag || false,
            assigned_to: backlog.assigned_to || null,
            assigned_consultant_name: assignedConsultantName,
            expert_description: backlog.expert_description || null,
            partner_name: partnerName,
            entity_name: entityName,
            case_types: caseTypes,
            partners: partners,
            employees: employees,
            customers: customerData,
            backlog_comments: formattedComments,
            backlog_documents: formattedDocuments
          };
        });

      return res.status(200).json(transformedData);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getGapAnalysis',
        context: 'Gap Analysis API',
        errorType: 'GapAnalysisFetchError'
      });
      console.error('[Admin] Gap Analysis error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'An error occurred while fetching backlog data',
        error_code: 'GAP_ANALYSIS_ERROR'
      }]);
    }
  }

  // GET /admin/backlog_id?backlog_id={backlog_id}
  // Get detailed information for a specific backlog/case entry by backlog_id
  // Returns comprehensive data including case details, related entities, comments, and documents
  static async getBacklogDetail(req, res) {
    try {
      const { backlog_id } = req.query;

      console.log('[Admin] Fetching backlog detail for backlog_id:', backlog_id);

      // Validate backlog_id parameter
      if (!backlog_id || backlog_id === 'undefined' || backlog_id === '') {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id parameter is required', {
          operation: 'getBacklogDetail'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required and must be a valid string',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      // Fetch backlog with all nested relationships using BacklogModel
      const { data: backlogData, error: backlogError } = await BacklogModel.findByBacklogId(backlog_id);

      if (backlogError) {
        logger.logDatabaseError(backlogError, 'SELECT', 'backlog', {
          query: 'Fetching backlog detail by backlog_id',
          backlog_id: backlog_id
        });
        logger.logFailedOperation(req, 500, 'BACKLOG_FETCH_ERROR', 'Failed to fetch backlog data', {
          operation: 'getBacklogDetail',
          backlog_id: backlog_id,
          error: backlogError.message
        });
        console.error('[Admin] Error fetching backlog:', backlogError);
        return res.status(500).json([{
          status: 'error',
          message: 'An error occurred while fetching backlog details',
          error_code: 'BACKLOG_DETAIL_FETCH_ERROR'
        }]);
      }

      // Return empty array if not found (as per documentation)
      if (!backlogData) {
        return res.status(200).json([]);
      }

      // Check if backlog is deleted
      if (backlogData.deleted_flag === true) {
        return res.status(200).json([]);
      }

      // Fetch customer data if customer_id exists
      let customerData = null;
      if (backlogData.customer_id) {
        try {
          const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('customer_id, first_name, last_name, email_address, mobile_number, address')
            .eq('customer_id', backlogData.customer_id)
            .eq('deleted_flag', false)
            .single();

          if (!customerError && customer) {
            customerData = {
              customer_id: customer.customer_id,
              first_name: customer.first_name || null,
              last_name: customer.last_name || null,
              email_address: customer.email_address || null,
              mobile_number: customer.mobile_number || null,
              address: customer.address || null
            };
          }
        } catch (err) {
          console.error('[Admin] Error fetching customer:', err);
        }
      }

      // Get assigned consultant name
      let assignedConsultantName = null;
      if (backlogData.employees) {
        const firstName = backlogData.employees.first_name || '';
        const lastName = backlogData.employees.last_name || '';
        assignedConsultantName = `${firstName} ${lastName}`.trim() || null;
      }

      // Get partner name
      let partnerName = null;
      if (backlogData.partners) {
        partnerName = backlogData.partners.partner_name ||
          (backlogData.partners.first_name && backlogData.partners.last_name
            ? `${backlogData.partners.first_name} ${backlogData.partners.last_name}`.trim()
            : null) ||
          null;
      }

      // Format case_types
      const caseTypes = backlogData.case_types ? {
        case_type_id: backlogData.case_types.case_type_id || null,
        case_type_name: backlogData.case_types.case_type_name || null
      } : null;

      // Format partners with all required fields
      const partners = backlogData.partners ? {
        partner_id: backlogData.partners.partner_id || null,
        partner_name: partnerName || null,
        entity_name: backlogData.partners.entity_name || backlogData.partners['name of entity'] || null,
        'name of entity': backlogData.partners['name of entity'] || backlogData.partners.entity_name || null,
        department: backlogData.partners.department || null,
        partner_type: backlogData.partners.partner_type || null,
        email: backlogData.partners.email || null,
        mobile_number: backlogData.partners.mobile_number || null
      } : null;

      // Format employees with all required fields
      const employees = backlogData.employees ? {
        employee_id: backlogData.employees.employee_id || null,
        first_name: backlogData.employees.first_name || null,
        last_name: backlogData.employees.last_name || null,
        full_name: assignedConsultantName || null,
        department: backlogData.employees.department || null,
        email: backlogData.employees.email || null,
        mobile_number: backlogData.employees.mobile_number || null,
        entity_name: backlogData.employees.entity_name || null
      } : null;

      // Format backlog comments with user names
      const formattedComments = await Promise.all(
        (backlogData.backlog_comments || []).map(async (comment) => {
          let createdByName = null;
          let updatedByName = null;

          // Get created_by user name
          if (comment.created_by) {
            try {
              const { data: createdByUser } = await supabase
                .from('users')
                .select('first_name, last_name')
                .eq('user_id', comment.created_by)
                .single();

              if (createdByUser) {
                const firstName = createdByUser.first_name || '';
                const lastName = createdByUser.last_name || '';
                createdByName = `${firstName} ${lastName}`.trim() || null;
              }
            } catch (err) {
              // Use existing createdby_name if available
              createdByName = comment.createdby_name || null;
            }
          }

          // Get updated_by user name
          if (comment.updated_by) {
            try {
              const { data: updatedByUser } = await supabase
                .from('users')
                .select('first_name, last_name')
                .eq('user_id', comment.updated_by)
                .single();

              if (updatedByUser) {
                const firstName = updatedByUser.first_name || '';
                const lastName = updatedByUser.last_name || '';
                updatedByName = `${firstName} ${lastName}`.trim() || null;
              }
            } catch (err) {
              // Use existing updatedby_name if available
              updatedByName = comment.updatedby_name || null;
            }
          }

          return {
            backlog_commentid: comment.backlog_commentid || null,
            backlog_id: comment.backlog_id || backlog_id || null,
            comment_text: comment.comment_text || null,
            created_by: comment.created_by || null,
            created_time: comment.created_time || null,
            createdby_name: createdByName || comment.createdby_name || null,
            updated_by: comment.updated_by || null,
            updated_time: comment.updated_time || null,
            updatedby_name: updatedByName || comment.updatedby_name || null,
            department: comment.department || null
          };
        })
      );

      // Format backlog documents with document categories
      const formattedDocuments = await Promise.all(
        (backlogData.backlog_documents || []).map(async (doc) => {
          let documentCategory = null;

          // Fetch document category if category_id exists
          if (doc.category_id) {
            try {
              const { data: category, error: categoryError } = await supabase
                .from('document_categories')
                .select('category_id, category_name')
                .eq('category_id', doc.category_id)
                .single();

              if (!categoryError && category) {
                documentCategory = {
                  category_id: category.category_id || null,
                  category_name: category.category_name || null
                };
              }
            } catch (err) {
              console.error('[Admin] Error fetching document category:', err);
            }
          }

          return {
            document_id: doc.document_id || null,
            category_id: doc.category_id || null,
            original_filename: doc.original_filename || null,
            stored_filename: doc.stored_filename || null,
            access_count: doc.access_count ? parseInt(doc.access_count) : 0,
            checksum: doc.checksum || null,
            uploaded_by: doc.uploaded_by || null,
            uploaded_time: doc.upload_time || doc.uploaded_at || null,
            document_category: documentCategory
          };
        })
      );

      // Build the final response object matching documentation format
      const responseData = {
        backlog_id: backlogData.backlog_id || null,
        case_summary: backlogData.case_summary || null,
        case_description: backlogData.case_description || null,
        expert_description: backlogData.expert_description || null,
        case_type_id: backlogData.case_type_id || null,
        backlog_referring_partner_id: backlogData.backlog_referring_partner_id || null,
        backlog_referral_date: backlogData.backlog_referral_date || null,
        status: backlogData.status || null,
        created_time: backlogData.created_time || null,
        created_by: backlogData.created_by || null,
        updated_by: backlogData.updated_by || null,
        updated_time: backlogData.updated_time || null,
        deleted_flag: backlogData.deleted_flag || false,
        comment_text: backlogData.comment_text || null,
        feedback: backlogData.feedback || null,
        assigned_to: backlogData.assigned_to || null,
        assigned_consultant_name: assignedConsultantName,
        partner_name: partnerName,
        case_types: caseTypes,
        partners: partners,
        employees: employees,
        customers: customerData,
        backlog_comments: formattedComments,
        backlog_documents: formattedDocuments
      };

      // Return as array for consistency with documentation
      return res.status(200).json([responseData]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getBacklogDetail',
        context: 'Backlog Detail API',
        errorType: 'BacklogDetailFetchError',
        backlog_id: req.query?.backlog_id
      });
      console.error('[Admin] Get backlog detail error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'An error occurred while fetching backlog details',
        error_code: 'BACKLOG_DETAIL_ERROR'
      }]);
    }
  }

  // GET /admin/gettechnicalconsultant
  // Get all technical consultants (employees) available for assignment
  static async getTechnicalConsultants(req, res) {
    try {
      console.log('[Admin] Fetching technical consultants');

      // Fetch all employees who are technical consultants
      // Filter by designation containing "consultant" or "technical" (case-insensitive)
      // Also filter out deleted employees
      // Use select('*') to get all fields, then filter in response if needed
      const { data: employees, error } = await supabase
        .from('employees')
        .select('*')
        .or('designation.ilike.%consultant%,designation.ilike.%technical%')
        .eq('deleted_flag', false)
        .order('first_name', { ascending: true });

      if (error) {
        logger.logDatabaseError(error, 'SELECT', 'employees', {
          query: 'Fetching technical consultants',
          filter: 'designation contains consultant or technical',
          errorMessage: error.message,
          errorCode: error.code
        });
        logger.logFailedOperation(req, 500, 'CONSULTANT_FETCH_ERROR', 'Failed to fetch technical consultants', {
          operation: 'getTechnicalConsultants',
          error: error.message,
          errorCode: error.code
        });
        console.error('[Admin] Error fetching technical consultants:', error);

        // Fallback: try fetching all active employees
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          logger.logDatabaseError(allError, 'SELECT', 'employees', {
            query: 'Fetching all active employees as fallback',
            errorMessage: allError.message,
            errorCode: allError.code
          });
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to fetch technical consultants',
            error_code: 'CONSULTANT_FETCH_ERROR'
          }]);
        }

        // Return all active employees if specific filter doesn't work
        return res.status(200).json(allEmployees || []);
      }

      // If no employees found with consultant designation, fetch all active employees
      if (!employees || employees.length === 0) {
        console.log('[Admin] No consultants found with designation filter, fetching all active employees');
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          logger.logDatabaseError(allError, 'SELECT', 'employees', {
            query: 'Fetching all active employees as fallback',
            errorMessage: allError.message,
            errorCode: allError.code
          });
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to fetch technical consultants',
            error_code: 'CONSULTANT_FETCH_ERROR'
          }]);
        }

        return res.status(200).json(allEmployees || []);
      }

      // Return technical consultants
      return res.status(200).json(employees || []);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getTechnicalConsultants',
        context: 'Get Technical Consultants API',
        errorType: 'ConsultantFetchError'
      });
      console.error('[Admin] Get technical consultants error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to fetch technical consultants',
        error_code: 'CONSULTANT_FETCH_ERROR'
      }]);
    }
  }

  // PATCH /admin/update_backlog
  // Update backlog case summary, description, and case type (Policy Type)
  static async updateBacklog(req, res) {
    try {
      const { backlog_id, case_summary, case_description, case_type_id } = req.body;

      console.log('[Admin] Updating backlog:', { backlog_id, case_summary, case_description, case_type_id });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'updateBacklog'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      // Check if backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logFailedOperation(req, 404, 'BACKLOG_NOT_FOUND', 'Backlog not found', {
          operation: 'updateBacklog',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      if (existingBacklog.deleted_flag === true) {
        logger.logFailedOperation(req, 404, 'BACKLOG_DELETED', 'Backlog is deleted', {
          operation: 'updateBacklog',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      if (case_summary !== undefined && case_summary !== null) {
        updateData.case_summary = case_summary;
      }

      if (case_description !== undefined && case_description !== null) {
        updateData.case_description = case_description;
      }

      if (case_type_id !== undefined && case_type_id !== null) {
        const caseTypeIdNum = parseInt(case_type_id);
        if (!isNaN(caseTypeIdNum) && caseTypeIdNum > 0) {
          // Validate case_type_id exists
          const { data: caseType, error: caseTypeError } = await supabase
            .from('case_types')
            .select('case_type_id')
            .eq('case_type_id', caseTypeIdNum)
            .single();

          if (caseTypeError || !caseType) {
            logger.logFailedOperation(req, 400, 'INVALID_CASE_TYPE', 'Invalid case_type_id', {
              operation: 'updateBacklog',
              case_type_id: caseTypeIdNum
            });
            return res.status(400).json([{
              status: 'error',
              message: `Invalid case_type_id: ${caseTypeIdNum} does not exist`,
              error_code: 'INVALID_CASE_TYPE_ID'
            }]);
          }

          updateData.case_type_id = caseTypeIdNum;
        }
      }

      // Update backlog entry
      const { data: updatedBacklog, error: updateError } = await BacklogModel.update(backlog_id, updateData);

      if (updateError) {
        logger.logDatabaseError(updateError, 'UPDATE', 'backlog', {
          query: 'Updating backlog policy type',
          backlog_id: backlog_id,
          updateData: Object.keys(updateData)
        });
        logger.logFailedOperation(req, 500, 'BACKLOG_UPDATE_ERROR', 'Failed to update backlog', {
          operation: 'updateBacklog',
          backlog_id: backlog_id,
          error: updateError.message
        });
        console.error('[Admin] Error updating backlog:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update backlog',
          error_code: 'BACKLOG_UPDATE_ERROR'
        }]);
      }

      if (!updatedBacklog) {
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      return res.status(200).json([{
        status: 'success',
        message: 'Backlog updated successfully',
        data: {
          backlog_id: updatedBacklog.backlog_id,
          case_summary: updatedBacklog.case_summary,
          case_description: updatedBacklog.case_description,
          case_type_id: updatedBacklog.case_type_id,
          updated_time: updatedBacklog.updated_time
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'updateBacklog',
        context: 'Update Backlog API',
        errorType: 'BacklogUpdateError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Update backlog error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to update backlog',
        error_code: 'BACKLOG_UPDATE_ERROR'
      }]);
    }
  }

  // PATCH /admin/updatecunsultantpolicy
  // Assign consultant to a backlog/case
  static async updateConsultantPolicy(req, res) {
    try {
      const { backlog_id, assigned_consultant_name, assigned_to, updated_by, user_id } = req.body;

      console.log('[Admin] Updating consultant policy:', { backlog_id, assigned_consultant_name, assigned_to });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'updateConsultantPolicy'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      // Check if backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logFailedOperation(req, 404, 'BACKLOG_NOT_FOUND', 'Backlog not found', {
          operation: 'updateConsultantPolicy',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      // Add assigned_consultant_name if provided
      if (assigned_consultant_name !== undefined && assigned_consultant_name !== null) {
        updateData.assigned_consultant_name = assigned_consultant_name;
      }

      // Add assigned_to if provided
      if (assigned_to !== undefined && assigned_to !== null) {
        const assignedToNum = parseInt(assigned_to);
        if (!isNaN(assignedToNum) && assignedToNum > 0) {
          // Validate employee exists
          const { data: employee, error: employeeError } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name')
            .eq('employee_id', assignedToNum)
            .eq('deleted_flag', false)
            .single();

          if (employeeError || !employee) {
            logger.logFailedOperation(req, 400, 'INVALID_EMPLOYEE_ID', 'Invalid assigned_to employee_id', {
              operation: 'updateConsultantPolicy',
              assigned_to: assignedToNum
            });
            return res.status(400).json([{
              status: 'error',
              message: `Invalid assigned_to: Employee ID ${assignedToNum} does not exist`,
              error_code: 'INVALID_EMPLOYEE_ID'
            }]);
          }

          updateData.assigned_to = assignedToNum;

          // Auto-set assigned_consultant_name if not provided
          if (!assigned_consultant_name && employee) {
            const firstName = employee.first_name || '';
            const lastName = employee.last_name || '';
            updateData.assigned_consultant_name = `${firstName} ${lastName}`.trim() || null;
          }
        }
      } else if (user_id !== undefined && user_id !== null) {
        // Fallback to user_id if assigned_to not provided
        const userIdNum = parseInt(user_id);
        if (!isNaN(userIdNum) && userIdNum > 0) {
          updateData.assigned_to = userIdNum;
        }
      }

      // Add updated_by if provided
      if (updated_by !== undefined && updated_by !== null) {
        updateData.updated_by = updated_by;
      }

      // Update backlog entry
      const { data: updatedBacklog, error: updateError } = await BacklogModel.update(backlog_id, updateData);

      if (updateError) {
        logger.logDatabaseError(updateError, 'UPDATE', 'backlog', {
          query: 'Updating consultant assignment',
          backlog_id: backlog_id,
          updateData: Object.keys(updateData)
        });
        logger.logFailedOperation(req, 500, 'CONSULTANT_UPDATE_ERROR', 'Failed to update consultant policy', {
          operation: 'updateConsultantPolicy',
          backlog_id: backlog_id,
          error: updateError.message
        });
        console.error('[Admin] Error updating consultant policy:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update consultant policy',
          error_code: 'CONSULTANT_UPDATE_ERROR'
        }]);
      }

      if (!updatedBacklog) {
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Email notification logic
      try {
        // Only send email if assigned_to was set
        if (updatedBacklog.assigned_to) {
          const assignedTo = updatedBacklog.assigned_to;

          // Get employee's user_id
          const { data: employeeData, error: employeeError } = await supabase
            .from('employees')
            .select('user_id')
            .eq('employee_id', assignedTo)
            .single();

          if (!employeeError && employeeData?.user_id) {
            // Get user's email
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('email')
              .eq('user_id', employeeData.user_id)
              .single();

            if (!userError && userData?.email) {
              const transporter = getMailer();

              const mailText =
                `Dear Sir/Madam,\n\n` +
                `We have referred/updated assignment No:${backlog_id} for Gap Analysis. Kindly do the needful.\n` +
                `Click here to visit ${LOGIN_URL}\n\n` +
                `Best Regards,\nExpert Claim Solutions Team`;

              await transporter.sendMail({
                from: FROM_EMAIL,
                to: userData.email,
                subject: "Expert Claims Policy Assigned",
                text: mailText,
              });

              logger.logInfo('[Admin] Email sent to consultant', {
                backlog_id: backlog_id,
                email: userData.email,
                employee_id: assignedTo,
                reason: 'consultant_assigned'
              });
            } else {
              logger.logWarning('[Admin] Could not find consultant email', {
                backlog_id: backlog_id,
                employee_id: assignedTo,
                user_id: employeeData.user_id,
                error: userError?.message
              });
            }
          } else {
            logger.logWarning('[Admin] Could not find employee user_id', {
              backlog_id: backlog_id,
              employee_id: assignedTo,
              error: employeeError?.message
            });
          }
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        logger.logError(emailError, req, {
          operation: 'updateConsultantPolicy',
          context: 'Email Notification',
          errorType: 'EmailError',
          backlog_id: backlog_id
        });
        console.error('[Admin] Error sending email notification:', emailError);
      }

      return res.status(200).json([{
        status: 'success',
        message: 'Consultant assigned successfully',
        data: {
          backlog_id: updatedBacklog.backlog_id,
          assigned_to: updatedBacklog.assigned_to,
          assigned_consultant_name: updatedBacklog.assigned_consultant_name,
          updated_time: updatedBacklog.updated_time
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'updateConsultantPolicy',
        context: 'Update Consultant Policy API',
        errorType: 'ConsultantUpdateError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Update consultant policy error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to update consultant policy',
        error_code: 'CONSULTANT_UPDATE_ERROR'
      }]);
    }
  }

  // PATCH /admin/updatestatustechnicalconsultant
  // Update backlog status and/or expert description
  static async updateStatusTechnicalConsultant(req, res) {
    try {
      const { backlog_id, status, expert_description, updated_by, user_id } = req.body;

      console.log('[Admin] Updating backlog status/expert description:', { backlog_id, status, expert_description });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'updateStatusTechnicalConsultant'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      // Check if backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logFailedOperation(req, 404, 'BACKLOG_NOT_FOUND', 'Backlog not found', {
          operation: 'updateStatusTechnicalConsultant',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      // Add status if provided
      if (status !== undefined && status !== null && status !== '') {
        updateData.status = status;
      }

      // Add expert_description if provided
      if (expert_description !== undefined && expert_description !== null && expert_description !== '') {
        updateData.expert_description = expert_description;
      }

      // Add updated_by if provided
      if (updated_by !== undefined && updated_by !== null && updated_by !== '') {
        updateData.updated_by = updated_by;
      } else if (user_id !== undefined && user_id !== null) {
        const userIdNum = parseInt(user_id);
        if (!isNaN(userIdNum) && userIdNum > 0) {
          updateData.updated_by = userIdNum;
        }
      }

      // Update backlog entry
      const { data: updatedBacklog, error: updateError } = await BacklogModel.update(backlog_id, updateData);

      if (updateError) {
        logger.logDatabaseError(updateError, 'UPDATE', 'backlog', {
          query: 'Updating backlog status/expert description',
          backlog_id: backlog_id,
          updateData: Object.keys(updateData)
        });
        logger.logFailedOperation(req, 500, 'STATUS_UPDATE_ERROR', 'Failed to update backlog status', {
          operation: 'updateStatusTechnicalConsultant',
          backlog_id: backlog_id,
          error: updateError.message
        });
        console.error('[Admin] Error updating backlog status:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update backlog',
          error_code: 'BACKLOG_UPDATE_ERROR'
        }]);
      }

      if (!updatedBacklog) {
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Email notification logic
      try {
        // Fetch backlog details to get partner information
        const { data: backlogDetails, error: backlogFetchError } = await supabase
          .from('backlog')
          .select('backlog_id, backlog_referring_partner_id')
          .eq('backlog_id', backlog_id)
          .single();

        if (!backlogFetchError && backlogDetails) {
          // Get partner_id (with fallback to FALLBACK_USER_ID)
          const partnerId = backlogDetails.backlog_referring_partner_id || FALLBACK_USER_ID;

          // Get partner's user_id
          const { data: partnerData, error: partnerError } = await supabase
            .from('partners')
            .select('partner_id, user_id')
            .eq('partner_id', partnerId)
            .single();

          const userId = partnerData?.user_id || FALLBACK_USER_ID;

          // Get user's email
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('user_id, email')
            .eq('user_id', userId)
            .single();

          if (!userError && userData?.email) {
            const transporter = getMailer();

            const mailText =
              `Dear Sir/Madam,\n\n` +
              `You have an update from Expert Claim Solutions Team on the Gap Analysis Case referred by you.\n` +
              `Please login to ${LOGIN_URL}.\n\n` +
              `Best Regards,\nExpert Claim Solutions`;

            await transporter.sendMail({
              from: FROM_EMAIL,
              to: userData.email,
              subject: "Expert Claims Policy Status Changed",
              text: mailText,
            });

            logger.logInfo('[Admin] Email sent to partner', {
              backlog_id: backlog_id,
              email: userData.email,
              partner_id: partnerId,
              user_id: userId,
              reason: 'status_updated'
            });
          } else {
            logger.logWarning('[Admin] Could not find partner email', {
              backlog_id: backlog_id,
              partner_id: partnerId,
              user_id: userId,
              error: userError?.message
            });
          }
        } else {
          logger.logWarning('[Admin] Could not fetch backlog details for email notification', {
            backlog_id: backlog_id,
            error: backlogFetchError?.message
          });
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        logger.logError(emailError, req, {
          operation: 'updateStatusTechnicalConsultant',
          context: 'Email Notification',
          errorType: 'EmailError',
          backlog_id: backlog_id
        });
        console.error('[Admin] Error sending email notification:', emailError);
      }

      const responseMessage = expert_description
        ? 'Expert summary added successfully'
        : 'Status updated successfully';

      return res.status(200).json([{
        status: 'success',
        message: responseMessage,
        data: {
          backlog_id: updatedBacklog.backlog_id,
          status: updatedBacklog.status,
          expert_description: updatedBacklog.expert_description,
          updated_time: updatedBacklog.updated_time
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'updateStatusTechnicalConsultant',
        context: 'Update Status Technical Consultant API',
        errorType: 'StatusUpdateError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Update status technical consultant error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to update backlog',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // POST /admin/addsummary
  // Add expert summary/description to a backlog case
  static async addSummary(req, res) {
    try {
      const { backlog_id, expert_description, updated_by, user_id } = req.body;

      console.log('[Admin] Adding summary to backlog:', { backlog_id, expert_description });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'addSummary'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      if (!expert_description || expert_description.trim() === '') {
        logger.logFailedOperation(req, 400, 'MISSING_EXPERT_DESCRIPTION', 'expert_description is required', {
          operation: 'addSummary'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'expert_description is required and cannot be empty',
          error_code: 'MISSING_EXPERT_DESCRIPTION'
        }]);
      }

      // Handle updated_by - can be string or number, convert to string
      let updatedByValue = updated_by;
      if (updated_by !== undefined && updated_by !== null) {
        updatedByValue = String(updated_by).trim();
      }
      
      if (!updatedByValue || updatedByValue === '') {
        logger.logFailedOperation(req, 400, 'MISSING_UPDATED_BY', 'updated_by is required', {
          operation: 'addSummary'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'updated_by is required',
          error_code: 'MISSING_UPDATED_BY'
        }]);
      }

      if (!user_id || isNaN(parseInt(user_id))) {
        logger.logFailedOperation(req, 400, 'MISSING_USER_ID', 'user_id is required and must be a valid number', {
          operation: 'addSummary'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'user_id is required and must be a valid number',
          error_code: 'MISSING_USER_ID'
        }]);
      }

      // Check if backlog exists and is not deleted
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logFailedOperation(req, 404, 'BACKLOG_NOT_FOUND', 'Backlog not found', {
          operation: 'addSummary',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      if (existingBacklog.deleted_flag === true) {
        logger.logFailedOperation(req, 404, 'BACKLOG_DELETED', 'Backlog is deleted', {
          operation: 'addSummary',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const updateData = {
        expert_description: expert_description.trim(),
        updated_by: updatedByValue,
        updated_time: new Date().toISOString()
      };

      // Update backlog entry
      const { data: updatedBacklog, error: updateError } = await BacklogModel.update(backlog_id, updateData);

      if (updateError) {
        logger.logDatabaseError(updateError, 'UPDATE', 'backlog', {
          query: 'Adding expert summary',
          backlog_id: backlog_id,
          updateData: Object.keys(updateData)
        });
        logger.logFailedOperation(req, 500, 'SUMMARY_UPDATE_ERROR', 'Failed to add summary', {
          operation: 'addSummary',
          backlog_id: backlog_id,
          error: updateError.message
        });
        console.error('[Admin] Error adding summary:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to add summary',
          error_code: 'SUMMARY_UPDATE_ERROR',
          error: updateError.message || 'Unknown error'
        }]);
      }

      if (!updatedBacklog) {
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'Summary added successfully',
        data: {
          backlog_id: updatedBacklog.backlog_id,
          expert_description: updatedBacklog.expert_description,
          updated_by: updatedBacklog.updated_by,
          user_id: parseInt(user_id),
          updated_time: updatedBacklog.updated_time
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'addSummary',
        context: 'Add Summary API',
        errorType: 'SummaryAddError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Add summary error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to add summary: ' + error.message,
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // POST /admin/comments_insert
  // Add a comment to a backlog/case
  static async insertComment(req, res) {
    try {
      const {
        backlog_id,
        comment_text,
        created_by,
        createdby_name,
        updated_by,
        updatedby_name,
        department,
        email,
        role
      } = req.body;

      console.log('[Admin] Inserting comment:', { backlog_id, created_by, department });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'insertComment'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required in request body',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      if (!comment_text || comment_text.trim() === '') {
        logger.logFailedOperation(req, 400, 'MISSING_COMMENT_TEXT', 'comment_text is required', {
          operation: 'insertComment'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'comment_text is required and cannot be empty',
          error_code: 'MISSING_COMMENT_TEXT'
        }]);
      }

      // Validate backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logFailedOperation(req, 404, 'BACKLOG_NOT_FOUND', 'Backlog not found', {
          operation: 'insertComment',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      if (existingBacklog.deleted_flag === true) {
        return res.status(404).json([{
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          error_code: 'BACKLOG_NOT_FOUND'
        }]);
      }

      // Validate created_by and updated_by if provided
      if (created_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(created_by))
          .single();

        if (!userCheck) {
          console.warn(`[Admin] Warning: created_by ${created_by} does not exist in users table`);
        }
      }

      if (updated_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(updated_by))
          .single();

        if (!userCheck) {
          console.warn(`[Admin] Warning: updated_by ${updated_by} does not exist in users table`);
        }
      }

      // Prepare comment data
      const commentData = {
        backlog_id: backlog_id,
        comment_text: comment_text.trim(),
        created_by: created_by ? parseInt(created_by) : null,
        updated_by: updated_by ? parseInt(updated_by) : (created_by ? parseInt(created_by) : null),
        createdby_name: createdby_name || null,
        updatedby_name: updatedby_name || createdby_name || null,
        department: department || 'admin',
        created_time: new Date().toISOString(),
        updated_time: new Date().toISOString()
      };

      // Insert comment into database
      const { data: insertedComment, error: insertError } = await BacklogCommentModel.create(commentData);

      if (insertError) {
        logger.logDatabaseError(insertError, 'INSERT', 'backlog_comments', {
          query: 'Inserting backlog comment',
          backlog_id: backlog_id
        });
        logger.logFailedOperation(req, 500, 'COMMENT_INSERT_ERROR', 'Failed to insert comment', {
          operation: 'insertComment',
          backlog_id: backlog_id,
          error: insertError.message
        });
        console.error('[Admin] Error inserting comment:', insertError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to add comment',
          error_code: 'COMMENT_INSERT_ERROR'
        }]);
      }

      // Email notification logic
      try {
        // Fetch backlog details for email notification
        const { data: backlogDetails, error: backlogFetchError } = await supabase
          .from('backlog')
          .select('backlog_id, assigned_to, assigned_consultant_name, backlog_referring_partner_id')
          .eq('backlog_id', backlog_id)
          .single();

        if (!backlogFetchError && backlogDetails) {
          const transporter = getMailer();
          const isConsultantEmpty =
            backlogDetails.assigned_consultant_name === null ||
            backlogDetails.assigned_consultant_name === undefined ||
            String(backlogDetails.assigned_consultant_name).trim() === "";

          if (isConsultantEmpty) {
            // Notify partner user if consultant is not assigned
            const partnerId = backlogDetails.backlog_referring_partner_id;
            let emailToSend = FALLBACK_EMAIL;

            if (partnerId) {
              // Get partner's user_id
              const { data: partnerData, error: partnerError } = await supabase
                .from('partners')
                .select('user_id')
                .eq('partner_id', partnerId)
                .single();

              if (!partnerError && partnerData?.user_id) {
                // Get user's email
                const { data: userData, error: userError } = await supabase
                  .from('users')
                  .select('email')
                  .eq('user_id', partnerData.user_id)
                  .single();

                if (!userError && userData?.email) {
                  emailToSend = userData.email;
                }
              }
            }

            // Send email to partner
            await transporter.sendMail({
              from: FROM_EMAIL,
              to: emailToSend,
              subject: "Expert Claims Policy Commented",
              text:
                `Alert!!!!\n\n` +
                `Hey there,\n\n` +
                `Someone has Commented on the Policy: ${backlog_id}.\n` +
                `Please Check And Verify it.\n` +
                `Click here to visit the ExpertClaims site : ${LOGIN_URL}\n\n` +
                `Best Regards,\nExpert Claims Solutions`,
            });

            logger.logInfo('[Admin] Email sent to partner', {
              backlog_id: backlog_id,
              email: emailToSend,
              reason: 'consultant_not_assigned'
            });
          } else {
            // Notify assigned employee user
            const assignedTo = backlogDetails.assigned_to || DEFAULT_EMPLOYEE_ID;

            // Get employee's user_id
            const { data: employeeData, error: employeeError } = await supabase
              .from('employees')
              .select('user_id')
              .eq('employee_id', assignedTo)
              .single();

            let consultantEmail = FALLBACK_EMAIL;

            if (!employeeError && employeeData?.user_id) {
              // Query users table to get email
              const { data: userData, error: userError } = await supabase
                .from('users')
                .select('email')
                .eq('user_id', employeeData.user_id)
                .single();

              if (!userError && userData?.email) {
                consultantEmail = userData.email;
              }
            }

            // Send email to consultant
            await transporter.sendMail({
              from: FROM_EMAIL,
              to: consultantEmail,
              subject: "Expert Claims Policy Commented",
              text:
                `Alert!!!!\n\n` +
                `Hey there,\n\n` +
                `"Someone" has added a new comment for the Policy: ${backlog_id}.\n` +
                `Please Check And Verify it.\n` +
                `Click here to visit the ExpertClaims site : ${LOGIN_URL}\n\n` +
                `Regards,\nExpert Claims Solutions\n`,
            });

            logger.logInfo('[Admin] Email sent to consultant', {
              backlog_id: backlog_id,
              email: consultantEmail,
              employee_id: assignedTo,
              reason: 'consultant_assigned'
            });
          }
        } else {
          logger.logWarning('[Admin] Could not fetch backlog details for email notification', {
            backlog_id: backlog_id,
            error: backlogFetchError?.message
          });
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        logger.logError(emailError, req, {
          operation: 'insertComment',
          context: 'Email Notification',
          errorType: 'EmailError',
          backlog_id: backlog_id
        });
        console.error('[Admin] Error sending email notification:', emailError);
      }

      return res.status(200).json([{
        status: 'success',
        message: 'Comment added successfully',
        data: {
          backlog_commentid: insertedComment.backlog_commentid,
          backlog_id: insertedComment.backlog_id,
          comment_text: insertedComment.comment_text,
          created_by: insertedComment.created_by,
          created_time: insertedComment.created_time,
          createdby_name: insertedComment.createdby_name,
          updated_by: insertedComment.updated_by,
          updated_time: insertedComment.updated_time,
          updatedby_name: insertedComment.updatedby_name,
          department: insertedComment.department
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'insertComment',
        context: 'Insert Comment API',
        errorType: 'CommentInsertError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Insert comment error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to add comment',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // POST /admin/documentview
  // View backlog document by document_id - Returns document URL or file data
  static async viewDocument(req, res) {
    try {
      const { document_id } = req.body;

      console.log('[Admin] View document request:', { document_id });

      // Validate required fields
      if (!document_id) {
        logger.logFailedOperation(req, 400, 'MISSING_DOCUMENT_ID', 'document_id is required', {
          operation: 'viewDocument'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'document_id is required',
          error_code: 'MISSING_DOCUMENT_ID'
        }]);
      }

      const documentIdNum = parseInt(document_id);
      if (isNaN(documentIdNum) || documentIdNum < 1) {
        logger.logFailedOperation(req, 400, 'INVALID_DOCUMENT_ID', 'Invalid document_id', {
          operation: 'viewDocument',
          document_id: document_id
        });
        return res.status(400).json([{
          status: 'error',
          message: 'Invalid document_id',
          error_code: 'INVALID_DOCUMENT_ID'
        }]);
      }

      console.log(`[Admin] Fetching backlog document_id: ${documentIdNum}`);

      // Get document from backlog_documents table
      const { data: document, error: docError } = await supabase
        .from('backlog_documents')
        .select('*')
        .eq('document_id', documentIdNum)
        .eq('deleted_flag', false)
        .single();

      if (docError || !document) {
        logger.logDatabaseError(docError, 'SELECT', 'backlog_documents', {
          query: 'Fetching document by document_id',
          document_id: documentIdNum
        });
        logger.logFailedOperation(req, 404, 'DOCUMENT_NOT_FOUND', 'Document not found', {
          operation: 'viewDocument',
          document_id: documentIdNum,
          error: docError?.message
        });
        return res.status(404).json([{
          status: 'error',
          message: `Document with ID ${documentIdNum} not found`,
          error_code: 'DOCUMENT_NOT_FOUND'
        }]);
      }

      // Fetch document category if category_id exists
      let categoryName = null;
      if (document.category_id) {
        try {
          const { data: category, error: categoryError } = await supabase
            .from('document_categories')
            .select('category_id, category_name')
            .eq('category_id', document.category_id)
            .single();

          if (!categoryError && category) {
            categoryName = category.category_name;
          }
        } catch (err) {
          console.error('[Admin] Error fetching document category:', err);
        }
      }

      // Increment access count
      const currentAccessCount = document.access_count ? parseInt(document.access_count) : 0;
      await supabase
        .from('backlog_documents')
        .update({ access_count: currentAccessCount + 1 })
        .eq('document_id', documentIdNum);

      // Get file path from document
      const filePath = document.file_path || document.stored_filename;

      if (!filePath) {
        logger.logFailedOperation(req, 404, 'FILE_PATH_NOT_FOUND', 'Document file path not found', {
          operation: 'viewDocument',
          document_id: documentIdNum
        });
        return res.status(404).json([{
          status: 'error',
          message: 'Document file path not found',
          error_code: 'FILE_PATH_NOT_FOUND'
        }]);
      }

      // Determine content type from file extension
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // If it's already a full URL, return it directly
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return res.status(200).json([{
          status: 'success',
          url: filePath,
          document_url: filePath,
          document_id: document.document_id,
          original_filename: document.original_filename || null,
          stored_filename: document.stored_filename || null,
          content_type: contentType,
          access_count: currentAccessCount + 1,
          uploaded_time: document.upload_time || document.uploaded_at || null,
          uploaded_by: document.uploaded_by || null,
          category_id: document.category_id || null,
          category_name: categoryName || null
        }]);
      }

      // Construct Supabase storage URL
      // Try to extract bucket name from path or use default
      let bucketName = 'backlog-documents'; // Default bucket

      // Check if path contains bucket name pattern (e.g., "bk-{backlog_id}/...")
      if (filePath.includes('bk-')) {
        bucketName = 'backlog-documents';
      }

      // Get Supabase URL from environment or config
      const supabaseUrl = process.env.SUPABASE_URL || '';

      if (supabaseUrl) {
        // Construct public URL
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;

        return res.status(200).json([{
          status: 'success',
          url: publicUrl,
          document_url: publicUrl,
          document_id: document.document_id,
          original_filename: document.original_filename || null,
          stored_filename: document.stored_filename || null,
          content_type: contentType,
          file_size: document.file_size ? parseInt(document.file_size) : null,
          access_count: currentAccessCount + 1,
          uploaded_time: document.upload_time || document.uploaded_at || null,
          uploaded_by: document.uploaded_by || null,
          category_id: document.category_id || null,
          category_name: categoryName || null
        }]);
      } else {
        // If no Supabase URL, return relative path
        return res.status(200).json([{
          status: 'success',
          url: filePath,
          document_url: filePath,
          document_id: document.document_id,
          original_filename: document.original_filename || null,
          stored_filename: document.stored_filename || null,
          content_type: contentType,
          file_size: document.file_size ? parseInt(document.file_size) : null,
          access_count: currentAccessCount + 1,
          uploaded_time: document.upload_time || document.uploaded_at || null,
          uploaded_by: document.uploaded_by || null,
          category_id: document.category_id || null,
          category_name: categoryName || null
        }]);
      }

    } catch (error) {
      logger.logError(error, req, {
        operation: 'viewDocument',
        context: 'View Document API',
        errorType: 'DocumentViewError',
        document_id: req.body?.document_id
      });
      console.error('[Admin] View document error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'An error occurred while retrieving the document',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // DELETE /admin/deletecase or PATCH /admin/deletecase
  // Delete a backlog/case entry by setting deleted_flag = true (soft delete)
  static async deleteCase(req, res) {
    try {
      const { backlog_id } = req.body;

      console.log('[Admin] Deleting case:', { backlog_id });

      // Validate required fields
      if (!backlog_id) {
        logger.logFailedOperation(req, 400, 'MISSING_BACKLOG_ID', 'backlog_id is required', {
          operation: 'deleteCase'
        });
        return res.status(400).json([{
          status: 'error',
          message: 'backlog_id is required',
          error_code: 'MISSING_BACKLOG_ID'
        }]);
      }

      // Check if backlog exists and is not already deleted
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id, case_summary, deleted_flag')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        logger.logDatabaseError(fetchError, 'SELECT', 'backlog', {
          query: 'Fetching backlog for deletion',
          backlog_id: backlog_id
        });
        logger.logFailedOperation(req, 404, 'CASE_NOT_FOUND', 'Case not found', {
          operation: 'deleteCase',
          backlog_id: backlog_id,
          error: fetchError?.message
        });
        return res.status(404).json([{
          status: 'error',
          message: `Case with ID '${backlog_id}' not found`,
          error_code: 'CASE_NOT_FOUND'
        }]);
      }

      if (existingBacklog.deleted_flag === true) {
        logger.logFailedOperation(req, 404, 'CASE_ALREADY_DELETED', 'Case is already deleted', {
          operation: 'deleteCase',
          backlog_id: backlog_id
        });
        return res.status(404).json([{
          status: 'error',
          message: `Case with ID '${backlog_id}' not found`,
          error_code: 'CASE_NOT_FOUND'
        }]);
      }

      // Get current user ID from headers, session, or request body
      // backlog table has updated_by field (text type) but not deleted_by
      const deletedBy = req.body.deleted_by || req.body.user_id || req.user?.user_id || null;
      const now = new Date().toISOString();

      // Perform soft delete - update deleted_flag to true
      // Note: backlog table doesn't have deleted_time or deleted_by columns
      // We use updated_time and updated_by to track deletion
      const updateData = {
        deleted_flag: true,
        updated_time: now
      };

      // Add updated_by if provided (this will track who deleted it)
      if (deletedBy) {
        updateData.updated_by = deletedBy.toString();
      }

      const { data: updatedBacklog, error: updateError } = await supabase
        .from('backlog')
        .update(updateData)
        .eq('backlog_id', backlog_id)
        .select()
        .single();

      if (updateError) {
        logger.logDatabaseError(updateError, 'UPDATE', 'backlog', {
          query: 'Soft deleting backlog',
          backlog_id: backlog_id,
          updateData: Object.keys(updateData)
        });
        logger.logFailedOperation(req, 500, 'DELETE_ERROR', 'Failed to delete case', {
          operation: 'deleteCase',
          backlog_id: backlog_id,
          error: updateError.message
        });
        console.error('[Admin] Error deleting case:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'An error occurred while deleting the case',
          error_code: 'INTERNAL_ERROR'
        }]);
      }

      if (!updatedBacklog) {
        return res.status(404).json([{
          status: 'error',
          message: `Case with ID '${backlog_id}' not found`,
          error_code: 'CASE_NOT_FOUND'
        }]);
      }

      // Optionally soft delete related records (comments and documents)
      // Note: backlog_comments table doesn't have deleted_flag column
      // So we skip soft deleting comments (they remain for audit trail)

      // Soft delete documents (backlog_documents has deleted_flag column)
      try {
        const { error: docDeleteError } = await supabase
          .from('backlog_documents')
          .update({ deleted_flag: true })
          .eq('backlog_id', backlog_id)
          .eq('deleted_flag', false);

        if (docDeleteError) {
          console.error('[Admin] Error soft deleting documents:', docDeleteError);
          // Log but don't fail the request
          logger.logDatabaseError(docDeleteError, 'UPDATE', 'backlog_documents', {
            query: 'Soft deleting documents for deleted backlog',
            backlog_id: backlog_id
          });
        }
      } catch (err) {
        console.error('[Admin] Error soft deleting documents:', err);
        // Continue even if documents deletion fails
      }

      return res.status(200).json([{
        status: 'success',
        message: `Case ${backlog_id} has been deleted successfully`,
        data: {
          backlog_id: backlog_id,
          case_summary: existingBacklog.case_summary || null,
          deleted_flag: true,
          deleted_time: updatedBacklog.updated_time || now,
          deleted_by: deletedBy || updatedBacklog.updated_by || null
        }
      }]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'deleteCase',
        context: 'Delete Case API',
        errorType: 'CaseDeletionError',
        backlog_id: req.body?.backlog_id
      });
      console.error('[Admin] Delete case error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'An error occurred while deleting the case',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // GET /admin/gettasks
  // Get tasks (cases) with pagination for admin dashboard
  static async getTasks(req, res) {
    try {
      const { page, size } = req.query;
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];

      // Default pagination values if not provided
      const pageNum = page ? parseInt(page) : 1;
      const sizeNum = size ? parseInt(size) : 10000; // Default to large number to get all tasks

      // Validate pagination parameters if provided
      if (page && (isNaN(pageNum) || pageNum < 1)) {
        logger.logFailedOperation(req, 400, 'INVALID_PARAMETERS', 'page must be a valid positive number', {
          operation: 'getTasks',
          providedPage: page,
          pageNum: pageNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'page must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      if (size && (isNaN(sizeNum) || sizeNum < 1)) {
        logger.logFailedOperation(req, 400, 'INVALID_PARAMETERS', 'size must be a valid positive number', {
          operation: 'getTasks',
          providedSize: size,
          sizeNum: sizeNum
        });
        return res.status(400).json([{
          status: 'error',
          message: 'size must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      console.log(`[Admin] Fetching tasks - page: ${pageNum}, size: ${sizeNum}`);

      // Calculate pagination
      const offset = (pageNum - 1) * sizeNum;

      // Fetch cases (tasks) with pagination and all relationships
      // Order by case_id in descending order (newest cases first)
      const { data: casesList, error: casesError, count } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*),
          customers(*),
          partners!cases_referring_partner_id_fkey(*),
          employees!cases_assigned_to_fkey(
            employee_id,
            first_name,
            last_name,
            department,
            designation
          )
        `, { count: 'exact' })
        .eq('deleted_flag', false)
        .order('case_id', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (casesError) {
        logger.logDatabaseError(casesError, 'SELECT', 'cases', {
          query: 'Fetching tasks with pagination',
          page: pageNum,
          size: sizeNum,
          offset: offset
        });
        logger.logFailedOperation(req, 500, 'TASKS_FETCH_ERROR', 'Failed to fetch tasks', {
          operation: 'getTasks',
          error: casesError.message
        });
        console.error('[Admin] Error fetching tasks:', casesError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch tasks',
          error_code: 'TASKS_FETCH_ERROR',
          error: casesError.message || 'Unknown error'
        }]);
      }

      // Valid ticket_stage values (same as statusMap in dashboard)
      const validTicketStages = [
        "Under Evaluation",
        "Evaluation under review",
        "Evaluated",
        "Agreement pending",
        "1st Instalment Pending",
        "Under process",
        "Pending with grievance cell of insurance company",
        "Pending with Ombudsman",
        "Under Litigation/Consumer Forum",
        "Under Arbitration",
        "on hold",
        "Completed",
        "Partner Payment Pending",
        "Partner Payment Done",
        "Cancelled"
      ];

      // Transform and flatten cases data to match frontend requirements
      const flattenedTasks = (casesList || []).map(caseItem => {
        const caseData = { ...caseItem };
        const customer = caseItem.customers || {};
        const employee = caseItem.employees || {};

        // Remove nested objects (they will be flattened)
        delete caseData.case_types;
        delete caseData.customers;
        delete caseData.partners;
        delete caseData.employees;

        // Validate and sanitize ticket_stage
        let validTicketStage = caseData.ticket_stage || null;
        if (validTicketStage && !validTicketStages.includes(validTicketStage)) {
          // Invalid ticket_stage found - set to null or log warning
          console.warn(`[Admin] Invalid ticket_stage found: "${validTicketStage}" for case_id: ${caseData.case_id}`);
          validTicketStage = null;
        }

        // Required fields as per frontend requirements
        // Basic case fields (already in caseData)
        const task = {
          case_id: caseData.case_id || null,
          case_summary: caseData.case_summary || null,
          ticket_stage: validTicketStage,
          case_description: caseData.case_description || null,
          priority: caseData.priority || null,
          case_value: caseData.case_value || null,
          value_currency: caseData.value_currency || null,
          created_time: caseData.created_time || null,
          due_date: caseData.due_date || null,
          customer_id: caseData.customer_id || customer.customer_id || null,

          // Assigned employee fields (flattened)
          assigned_employee_name: employee && employee.first_name
            ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || null
            : null,

          // Customer fields (flattened) - required by frontend
          customer_name: customer && customer.first_name
            ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null
            : null,
          email_address: customer.email_address || null,
          mobile_number: customer.mobile_number || null,
          address: customer.address || null
        };

        return task;
      });

      // Build response in array format (frontend expects array with single object)
      const response = {
        status: 'success',
        data: flattenedTasks
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      logger.logError(error, req, {
        operation: 'getTasks',
        context: 'Get Tasks API',
        errorType: 'TasksFetchError',
        queryParams: req.query
      });
      console.error('[Admin] Get tasks error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_SERVER_ERROR'
      }]);
    }
  }

  // GET /admin/getleaves?page={page}&size={size}
  // Get all leave applications with employee and leave type information
  static async getLeaveApplications(req, res) {
    try {
      const { page, size } = req.query;
      
      // Default pagination values if not provided
      const pageNum = page ? parseInt(page) : 1;
      const sizeNum = size ? parseInt(size) : 10;

      // Validate pagination parameters if provided
      if (page && (isNaN(pageNum) || pageNum < 1)) {
        return res.status(400).json([{
          status: 'error',
          message: 'page must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      if (size && (isNaN(sizeNum) || sizeNum < 1)) {
        return res.status(400).json([{
          status: 'error',
          message: 'size must be a valid positive number',
          error_code: 'INVALID_PARAMETERS'
        }]);
      }

      console.log(`[Admin] Fetching leave applications - page: ${pageNum}, size: ${sizeNum}`);

      // Calculate pagination
      const offset = (pageNum - 1) * sizeNum;

      // Fetch leave applications with pagination
      const { data: leaveApplications, error: leaveError, count } = await supabase
        .from('leave_applications')
        .select('*', { count: 'exact' })
        .order('application_id', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (leaveError) {
        console.error('[Admin] Error fetching leave applications:', leaveError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch leave applications',
          error_code: 'LEAVE_FETCH_ERROR',
          error: leaveError.message || 'Unknown error'
        }]);
      }

      // Get unique employee_ids and leave_type_ids for batch fetching
      const employeeIds = [...new Set((leaveApplications || []).map(la => la.employee_id).filter(Boolean))];
      const leaveTypeIds = [...new Set((leaveApplications || []).map(la => la.leave_type_id).filter(Boolean))];

      // Fetch employees data with user info for designation, email, and mobile
      let employeesMap = {};
      let designationsMap = {};
      let employeeEmailsMap = {};
      if (employeeIds.length > 0) {
        const { data: employees, error: employeesError } = await supabase
          .from('employees')
          .select('employee_id, first_name, last_name, user_id, department, mobile_number')
          .in('employee_id', employeeIds);

        if (!employeesError && employees) {
          employeesMap = employees.reduce((acc, emp) => {
            acc[emp.employee_id] = emp;
            return acc;
          }, {});

          // Get user_ids for email and role lookup
          const userIds = [...new Set(employees.map(emp => emp.user_id).filter(Boolean))];
          
          if (userIds.length > 0) {
            const { data: users, error: usersError } = await supabase
              .from('users')
              .select('user_id, role, email')
              .in('user_id', userIds);

            if (!usersError && users) {
              users.forEach(user => {
                employees.forEach(emp => {
                  if (emp.user_id === user.user_id) {
                    // Use department from employees table, fallback to role from users table
                    designationsMap[emp.employee_id] = emp.department || user.role || 'N/A';
                    employeeEmailsMap[emp.employee_id] = user.email || 'N/A';
                  }
                });
              });
            }
          }
        }
      }

      // Fetch leave types data
      let leaveTypesMap = {};
      if (leaveTypeIds.length > 0) {
        const { data: leaveTypes, error: leaveTypesError } = await supabase
          .from('leave_types')
          .select('leave_type_id, type_name')
          .in('leave_type_id', leaveTypeIds);

        if (!leaveTypesError && leaveTypes) {
          leaveTypesMap = leaveTypes.reduce((acc, lt) => {
            acc[lt.leave_type_id] = lt;
            return acc;
          }, {});
        }
      }

      // Format the response to match frontend expectations
      const formattedLeaves = (leaveApplications || []).map(leave => {
        const employee = leave.employee_id ? employeesMap[leave.employee_id] : null;
        const leaveType = leave.leave_type_id ? leaveTypesMap[leave.leave_type_id] : null;
        const designation = leave.employee_id ? (designationsMap[leave.employee_id] || 'N/A') : 'N/A';
        const employeeEmail = leave.employee_id ? (employeeEmailsMap[leave.employee_id] || 'N/A') : 'N/A';
        const contactNumber = employee?.mobile_number || null;

        return {
          application_id: leave.application_id,
          employee_id: leave.employee_id,
          leave_type_id: leave.leave_type_id,
          start_date: leave.start_date,
          end_date: leave.end_date,
          total_days: leave.total_days,
          reason: leave.reason,
          status: leave.status || 'pending',
          applied_date: leave.applied_date,
          designation: designation,
          employee_email: employeeEmail,
          contact_number: contactNumber,
          emergency_contact: leave.emergency_contact || null,
          employees: {
            employee_id: employee?.employee_id || null,
            first_name: employee?.first_name || '',
            last_name: employee?.last_name || ''
          },
          leave_types: {
            leave_type_id: leaveType?.leave_type_id || null,
            type_name: leaveType?.type_name || 'N/A'
          }
        };
      });

      // Build response matching the expected format
      const response = {
        status: 'success',
        message: 'Leave applications retrieved successfully',
        data: formattedLeaves,
        pagination: {
          page: pageNum,
          size: sizeNum,
          total: count || 0,
          totalPages: count ? Math.ceil(count / sizeNum) : 0
        }
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      console.error('[Admin] Get leave applications error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }

  // PATCH /admin/updateleavestatus
  // Update leave application status (approve or reject)
  static async updateLeaveStatus(req, res) {
    try {
      const { application_id, status, approved_by, approved_date, rejection_reason } = req.body;
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];

      console.log('[Admin] Updating leave application status:', { application_id, status, approved_by });

      // Validate required fields
      if (!application_id) {
        return res.status(400).json([{
          status: 'error',
          message: 'application_id is required',
          error_code: 'MISSING_APPLICATION_ID'
        }]);
      }

      if (!status) {
        return res.status(400).json([{
          status: 'error',
          message: 'status is required',
          error_code: 'MISSING_STATUS'
        }]);
      }

      // Validate status value
      const validStatuses = ['approved', 'rejected', 'pending'];
      const normalizedStatus = status.toLowerCase();
      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json([{
          status: 'error',
          message: 'status must be one of: approved, rejected, pending',
          error_code: 'INVALID_STATUS'
        }]);
      }

      // Validate application_id is a number
      const applicationIdNum = parseInt(application_id);
      if (isNaN(applicationIdNum) || applicationIdNum < 1) {
        return res.status(400).json([{
          status: 'error',
          message: 'application_id must be a valid positive number',
          error_code: 'INVALID_APPLICATION_ID'
        }]);
      }

      // Check if leave application exists
      const { data: existingLeave, error: fetchError } = await supabase
        .from('leave_applications')
        .select('application_id, status')
        .eq('application_id', applicationIdNum)
        .single();

      if (fetchError || !existingLeave) {
        console.error('[Admin] Error fetching leave application:', fetchError);
        return res.status(404).json([{
          status: 'error',
          message: 'Leave application not found',
          error_code: 'LEAVE_NOT_FOUND'
        }]);
      }

      // Prepare update data
      const now = new Date().toISOString();
      const updateData = {
        status: normalizedStatus,
        updated_time: now
      };

      // If approving or rejecting, set approved_by and approved_date
      if (normalizedStatus === 'approved' || normalizedStatus === 'rejected') {
        if (approved_by) {
          const approvedByNum = parseInt(approved_by);
          if (isNaN(approvedByNum) || approvedByNum < 1) {
            return res.status(400).json([{
              status: 'error',
              message: 'approved_by must be a valid positive number',
              error_code: 'INVALID_APPROVED_BY'
            }]);
          }
          updateData.approved_by = approvedByNum;
        }

        if (approved_date) {
          updateData.approved_date = approved_date;
        } else {
          // Use current date if not provided
          updateData.approved_date = new Date().toISOString().slice(0, 10);
        }

        // If rejecting, set rejection_reason if provided
        if (normalizedStatus === 'rejected' && rejection_reason) {
          updateData.rejection_reason = rejection_reason;
        } else if (normalizedStatus === 'rejected') {
          // Clear rejection_reason if not provided (optional)
          updateData.rejection_reason = null;
        }
      } else if (normalizedStatus === 'pending') {
        // If setting back to pending, clear approval fields
        updateData.approved_by = null;
        updateData.approved_date = null;
        updateData.rejection_reason = null;
      }

      // Update the leave application
      const { data: updatedLeave, error: updateError } = await supabase
        .from('leave_applications')
        .update(updateData)
        .eq('application_id', applicationIdNum)
        .select()
        .single();

      if (updateError) {
        console.error('[Admin] Error updating leave application:', updateError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to update leave application',
          error_code: 'UPDATE_ERROR',
          error: updateError.message || 'Unknown error'
        }]);
      }

      // Build success response
      const response = {
        status: 'success',
        message: `Leave application ${normalizedStatus} successfully`,
        data: {
          application_id: updatedLeave.application_id,
          status: updatedLeave.status,
          approved_by: updatedLeave.approved_by,
          approved_date: updatedLeave.approved_date,
          rejection_reason: updatedLeave.rejection_reason,
          updated_time: updatedLeave.updated_time
        }
      };

      // Return as array with single object (as expected by frontend)
      return res.status(200).json([response]);

    } catch (error) {
      console.error('[Admin] Update leave status error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error: ' + error.message,
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }
}
export default AdminController;

