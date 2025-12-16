import supabase from '../config/database.js';
import SessionModel from '../models/SessionModel.js';

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
        console.error('[Admin] Error fetching cases:', casesError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch cases data',
          error: casesError.message || 'Unknown error',
          statusCode: 500
        });
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
      console.error('[Admin] Get admin dashboard error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
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

      console.log(`[Admin] Fetching users - page: ${pageNum}, size: ${sizeNum}`);

      // Calculate pagination
      const offset = (pageNum - 1) * sizeNum;

      // Fetch users with pagination (exclude deleted users)
      const { data: users, error: usersError, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('deleted_flag', false)
        .order('user_id', { ascending: true })
        .range(offset, offset + sizeNum - 1);

      if (usersError) {
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
            status: user.deleted_flag ? 'inactive' : 'active',
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
        status: user.deleted_flag ? 'inactive' : 'active',
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
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: {
            email_address: 'Invalid email format'
          }
        }]);
      }

      // Validate password format (should be bcrypt hash)
      if (!password.startsWith('$2b$') && !password.startsWith('$2a$') && !password.startsWith('$2y$')) {
        return res.status(400).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'VALIDATION_ERROR',
          field_errors: {
            password: 'Password must be a valid bcrypt hash'
          }
        }]);
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

      // Validate age if provided (must be a number)
      if (age !== undefined && age !== null) {
        const ageNum = typeof age === 'string' ? parseInt(age) : age;
        if (isNaN(ageNum) || ageNum < 0) {
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

      // Generate user_id by finding max and incrementing
      const { data: maxUsers, error: maxUserError } = await supabase
        .from('users')
        .select('user_id')
        .order('user_id', { ascending: false })
        .limit(1);

      let nextUserId = 1;
      if (!maxUserError && maxUsers && maxUsers.length > 0 && maxUsers[0].user_id) {
        nextUserId = parseInt(maxUsers[0].user_id) + 1;
      }

      // Create user in users table
      const now = new Date().toISOString();
      const userData = {
        user_id: nextUserId,
        username: username,
        email: email_address,
        mobile_number: mobile_number || null,
        password_hash: password, // Password is already hashed from frontend
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
        const employeeData = {
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
          console.error('[Admin] Error creating employee record:', employeeError);
          // Rollback user creation
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create user',
            error_code: 'INTERNAL_ERROR'
          }]);
        }
      } else if (normalizedRole === 'partner') {
        const partnerData = {
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
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create user',
            error_code: 'INTERNAL_ERROR'
          }]);
        }
      } else if (normalizedRole === 'customer') {
        const customerData = {
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
          await supabase.from('users').delete().eq('user_id', userId);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to create user',
            error_code: 'INTERNAL_ERROR'
          }]);
        }
      } else if (normalizedRole === 'admin') {
        const adminData = {
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

        // Get next admin_id by finding max and incrementing
        const { data: maxAdmins, error: maxError } = await supabase
          .from('admin')
          .select('admin_id')
          .order('admin_id', { ascending: false })
          .limit(1);

        let nextAdminId = 1;
        if (!maxError && maxAdmins && maxAdmins.length > 0 && maxAdmins[0].admin_id) {
          nextAdminId = parseInt(maxAdmins[0].admin_id) + 1;
        }

        adminData.admin_id = nextAdminId;

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

      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdateData)
        .eq('user_id', user_id);

      if (userUpdateError) {
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
          console.error('[Admin] Error updating admin record:', adminUpdateError);
          return res.status(500).json([{
            status: 'error',
            message: 'Failed to update admin record',
            error_code: 'ADMIN_UPDATE_ERROR',
            error: adminUpdateError.message
          }]);
        }
      }

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'User updated successfully',
        data: {
          user_id: user_id,
          updated_time: now
        }
      }]);

    } catch (error) {
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
        return res.status(400).json([{
          status: 'error',
          message: 'user_id query parameter is required',
          error_code: 'MISSING_USER_ID'
        }]);
      }

      const userIdNum = parseInt(user_id);
      if (isNaN(userIdNum) || userIdNum < 1) {
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
        return res.status(404).json([{
          status: 'error',
          message: 'User not found',
          error_code: 'USER_NOT_FOUND'
        }]);
      }

      if (existingUser.deleted_flag === true) {
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
      console.error('[Admin] Delete user error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Failed to delete user',
        error_code: 'INTERNAL_ERROR'
      }]);
    }
  }
}

export default AdminController;

