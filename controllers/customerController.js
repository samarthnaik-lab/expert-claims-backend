import supabase from '../config/database.js';
import UserModel from '../models/UserModel.js';

class CustomerController {
  // GET /customer/getcustomersessiondetails?mobile_number={mobile_number}
  // Get customer session details by mobile number (n8n-style webhook response)
  static async getCustomerSessionDetails(req, res) {
    try {
      // Read query param and header (header is optional, for tracing only)
      let mobileNumber = req.query.mobile_number;
      const headerSessionId = req.headers['session_id'] || req.headers['session-id'] || null;

      // Validate mobile_number parameter
      if (!mobileNumber) {
        return res.status(400).json([{
          status: 'error',
          message: 'mobile_number parameter is required'
        }]);
      }

      mobileNumber = mobileNumber.toString().trim();

      console.log('[Customer] Get session details for mobile_number:', mobileNumber, 'header session_id:', headerSessionId);

      // 1) Find customer by mobile number
      // NOTE: We intentionally DO NOT filter by deleted_flag here,
      // because we still need to allow session lookup even if the
      // customer record has deleted_flag = true.
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('mobile_number', mobileNumber)
        .maybeSingle();

      if (customerError) {
        console.error('[Customer] Error fetching customer by mobile_number:', customerError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch customer',
          error: customerError.message || 'Unknown error'
        }]);
      }

      if (!customer) {
        return res.status(404).json([{
          status: 'error',
          message: 'Customer not found with the provided mobile number'
        }]);
      }

      console.log('[Customer] Customer found:', {
        customer_id: customer.customer_id,
        user_id: customer.user_id
      });

      // 2) Find user linked to this customer
      // Priority: Use customer.user_id first (even if user is deleted)
      let user = null;
      if (customer.user_id) {
        const { data: userData, error: userError } = await UserModel.findByUserId(customer.user_id);
        if (userError) {
          console.warn('[Customer] Error fetching user by user_id:', userError);
        }
        if (userData) {
          user = userData;
          console.log('[Customer] Found user by customer.user_id:', user.user_id);
        }
      }

      // Fallback: Only if customer.user_id didn't work, try mobile + role=customer
      // But warn if we're using a different user than expected
      if (!user) {
        console.warn('[Customer] User not found by customer.user_id, trying mobile fallback...');
        const { data: userData, error: userError } = await UserModel.findByMobileAndRole(mobileNumber, 'customer');
        if (userError) {
          console.warn('[Customer] Error fetching user by mobile & role=customer:', userError);
        }
        if (userData) {
          // Warn if fallback user_id doesn't match customer.user_id
          if (customer.user_id && userData.user_id !== customer.user_id) {
            console.warn(`[Customer] WARNING: Fallback user (${userData.user_id}) doesn't match customer.user_id (${customer.user_id})`);
          }
          user = userData;
        }
      }

      if (!user) {
        return res.status(404).json([{
          status: 'error',
          message: 'User account not found for this customer'
        }]);
      }

      console.log('[Customer] User found for customer session:', {
        user_id: user.user_id,
        email: user.email,
        role: user.role
      });

      // 3) Find latest active session for this user
      let jwtToken = null;
      let sessionId = null;
      let expiry = null;

      const { data: session, error: sessionError } = await supabase
        .from('user_session_details')
        .select('session_id, jwt_token, expires_at, is_active')
        .eq('user_id', user.user_id)
        .eq('is_active', true)
        .order('created_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        console.warn('[Customer] Error fetching session details:', sessionError);
      }

      if (session) {
        jwtToken = session.jwt_token || null;
        sessionId = session.session_id || null;
        expiry = session.expires_at || null;
      }

      // 4) Build response object (array-style, like n8n)
      const nameFromCustomer = (() => {
        const first = customer.first_name || '';
        const last = customer.last_name || '';
        const full = `${first} ${last}`.trim();
        if (full) return full;
        if (customer.company_name && customer.company_name.trim()) return customer.company_name.trim();
        return user.username || '';
      })();

      const responseItem = {
        status: 'success',
        message: 'session customer id data Fetch Successfully',
        email: user.email || customer.email_address || '',
        userid: user.user_id,
        role: user.role || 'customer',
        name: nameFromCustomer,
        designation: 'customer',
        department: '',
        customer_id: customer.customer_id,
        employee_id: null,
        partner_id: customer.partner_id || null,
        admin_id: null,
        mobile_number: mobileNumber,
        jwt: jwtToken,
        sessionid: sessionId || headerSessionId || null,
        expiry: expiry
      };

      return res.status(200).json([responseItem]);

    } catch (error) {
      console.error('[Customer] getCustomerSessionDetails error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error',
        error: error.message
      }]);
    }
  }

  // POST /customer/customer-dashboard
  // Get customer dashboard data - cases for the customer
  static async getCustomerDashboard(req, res) {
    try {
      // Get user_id from multipart/form-data body
      const userId = req.body.user_id;

      // Validate user_id parameter
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'user_id is required in form-data body',
          statusCode: 400
        });
      }

      // Extract user_id number if it's in format like "user_7069221320_1765803403678" or just a number
      let userIdNum = null;
      if (typeof userId === 'string' && userId.includes('_')) {
        // Try to extract numeric user_id from string format
        const parts = userId.split('_');
        // Look for numeric parts
        for (const part of parts) {
          const num = parseInt(part);
          if (!isNaN(num) && num > 0) {
            userIdNum = num;
            break;
          }
        }
      } else {
        userIdNum = parseInt(userId);
      }

      if (!userIdNum || isNaN(userIdNum) || userIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'user_id must be a valid number',
          statusCode: 400
        });
      }

      console.log(`[Customer] Fetching dashboard data for user_id: ${userIdNum}`);

      // Get user details
      const { data: user, error: userError } = await UserModel.findByUserId(userIdNum);

      if (userError || !user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
          statusCode: 404
        });
      }

      // Get customer details linked to this user
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', userIdNum)
        .limit(1)
        .maybeSingle();

      if (customerError) {
        console.error('[Customer] Error fetching customer:', customerError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch customer data',
          error: customerError.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!customer) {
        return res.status(404).json({
          status: 'error',
          message: 'Customer not found for this user',
          statusCode: 404
        });
      }

      const customerId = customer.customer_id;
      console.log(`[Customer] Customer found: customer_id=${customerId}`);

      // Fetch cases for this customer
      const { data: rawCases, error: casesError } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*)
        `)
        .eq('customer_id', customerId)
        .eq('deleted_flag', false)
        .order('created_time', { ascending: false });

      if (casesError) {
        console.error('[Customer] Error fetching cases:', casesError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch cases data',
          error: casesError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Status mapping (ticket_stage → status)
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

      // Transform cases data
      const cases = (rawCases || []).map(c => {
        const copy = { ...c };
        
        // Map ticket_stage to status
        copy.status = statusMap[copy.ticket_stage] || "Under Review";

        // Flatten case_types if present
        if (copy.case_types && typeof copy.case_types === "object") {
          copy.case_type_name = copy.case_types.case_type_name || null;
          delete copy.case_types;
        }

        // Format amount_display
        if (copy.case_value != null && copy.value_currency) {
          const numeric = Number(copy.case_value);
          copy.amount_display = `${copy.value_currency} ${Number.isNaN(numeric) ? copy.case_value : numeric.toLocaleString()}`;
        }

        // Format last_update from updated_time
        if (copy.updated_time) {
          copy.last_update = copy.updated_time.split("T")[0];
        }

        return copy;
      });

      // Calculate counts based on mapped status
      const mappedUnderReview = cases.filter(c => c.status === "Under Review").length;
      const mappedCompletedCounts = cases.filter(c => c.status === "Approved").length;
      const mappedCancelledCounts = cases.filter(c => c.status === "Rejected").length;

      // Build response matching employee dashboard format
      const response = {
        totalTasks: cases.length,
        Newtask: mappedUnderReview,
        reviewCounts: mappedUnderReview,
        completedCounts: mappedCompletedCounts,
        cancelledCounts: mappedCancelledCounts,
        summary: {
          totalClaims: cases.length,
          underReview: mappedUnderReview,
          approved: mappedCompletedCounts,
          rejected: mappedCancelledCounts
        },
        claims: cases
      };

      return res.status(200).json(response);

    } catch (error) {
      console.error('[Customer] Get customer dashboard error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /customer/customer-case
  // Get customer cases with pagination (multipart/form-data with user_id, page, size)
  static async getCustomerCases(req, res) {
    try {
      // Get parameters from multipart/form-data body
      const userId = req.body.user_id;
      const page = req.body.page;
      const size = req.body.size;

      // Validate user_id parameter
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'user_id is required in form-data body',
          statusCode: 400
        });
      }

      // Extract user_id number if it's in format like "user_abhishek_pawar_aiklisolve_com_1765820076045" or just a number
      let userIdNum = null;
      if (typeof userId === 'string' && userId.includes('_')) {
        // Format: "user_abhishek_pawar_aiklisolve_com_1765820076045" or "user_7069221320_1765803403678"
        const parts = userId.split('_').filter(p => p !== 'user' && p !== ''); // Remove 'user' prefix and empty parts
        
        // First, try to reconstruct email from parts (format: firstname_lastname_domain_timestamp)
        // Example: ["abhishek", "pawar", "aiklisolve", "com", "1765820076045"]
        if (parts.length >= 4) {
          // Try to reconstruct email: firstname.lastname@domain.com
          const nameParts = [];
          const domainParts = [];
          let foundDomain = false;
          
          for (let i = 0; i < parts.length - 1; i++) { // Exclude last part (timestamp)
            const part = parts[i];
            // Check if this looks like a domain part (contains 'com', 'net', 'org', etc.)
            if (['com', 'net', 'org', 'in', 'co', 'io'].includes(part.toLowerCase())) {
              foundDomain = true;
              domainParts.push(part);
            } else if (!foundDomain) {
              nameParts.push(part);
            } else {
              domainParts.unshift(part); // Domain parts before TLD
            }
          }
          
          if (nameParts.length > 0 && domainParts.length > 0) {
            // Reconstruct email: firstname.lastname@domain.com
            const email = `${nameParts.join('.')}@${domainParts.join('.')}`;
            const { data: userByEmail } = await UserModel.findByEmail(email);
            if (userByEmail) {
              userIdNum = userByEmail.user_id;
              console.log(`[Customer] Found user by reconstructed email: ${email}, user_id: ${userIdNum}`);
            }
          }
        }
        
        // If not found by email, try to extract numeric user_id from parts
        if (!userIdNum) {
          for (const part of parts) {
            const num = parseInt(part);
            if (!isNaN(num) && num > 0 && num < 1000000) { // Reasonable user_id range
              // Check if this number exists as user_id
              const { data: userCheck } = await UserModel.findByUserId(num);
              if (userCheck) {
                userIdNum = num;
                console.log(`[Customer] Found user by numeric user_id: ${userIdNum}`);
                break;
              }
            }
          }
        }
      } else {
        userIdNum = parseInt(userId);
      }

      if (!userIdNum || isNaN(userIdNum) || userIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'user_id must be a valid number or valid user identifier',
          statusCode: 400
        });
      }

      // Handle pagination
      let pageNum = page ? parseInt(page) : 1;
      let sizeNum = size ? parseInt(size) : 10;
      
      if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
      if (isNaN(sizeNum) || sizeNum < 1) sizeNum = 10;
      if (sizeNum > 1000) sizeNum = 1000; // Max limit

      const offset = (pageNum - 1) * sizeNum;

      console.log(`[Customer] Fetching cases for user_id: ${userIdNum}, page: ${pageNum}, size: ${sizeNum}`);

      // Get user details
      const { data: user, error: userError } = await UserModel.findByUserId(userIdNum);

      if (userError || !user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
          statusCode: 404
        });
      }

      // Get customer details linked to this user
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', userIdNum)
        .limit(1)
        .maybeSingle();

      if (customerError) {
        console.error('[Customer] Error fetching customer:', customerError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch customer data',
          error: customerError.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!customer) {
        return res.status(404).json({
          status: 'error',
          message: 'Customer not found for this user',
          statusCode: 404
        });
      }

      const customerId = customer.customer_id;
      console.log(`[Customer] Customer found: customer_id=${customerId}`);

      // Fetch cases for this customer with pagination
      const { data: rawCases, error: casesError, count } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*),
          employees!cases_assigned_to_fkey(
            first_name,
            last_name
          )
        `, { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('deleted_flag', false)
        .order('created_time', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (casesError) {
        console.error('[Customer] Error fetching cases:', casesError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch cases data',
          error: casesError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Transform cases data to match desired format
      const cases = (rawCases || []).map(c => {
        // Build assigned_agent name from employee data
        let assignedAgent = null;
        if (c.employees && c.employees.first_name) {
          const firstName = c.employees.first_name || '';
          const lastName = c.employees.last_name || '';
          assignedAgent = `${firstName} ${lastName}`.trim() || null;
        }

        // Build case_types object
        const caseTypesObj = c.case_types ? {
          case_type_name: c.case_types.case_type_name || null
        } : null;

        // Return only the fields needed in the exact format
        return {
          case_id: c.case_id,
          case_summary: c.case_summary,
          case_description: c.case_description,
          ticket_stage: c.ticket_stage,
          case_types: caseTypesObj,
          assigned_agent: assignedAgent,
          created_time: c.created_time,
          priority: c.priority,
          case_value: c.case_value,
          value_currency: c.value_currency,
          customer_id: c.customer_id,
          assigned_to: c.assigned_to
        };
      });

      // Return as array directly
      return res.status(200).json(cases);

    } catch (error) {
      console.error('[Customer] Get customer cases error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /customer/getdocumentcatagories
  // Get all document categories with nested case_types information
  static async getDocumentCategoriesWebhook(req, res) {
    try {
      const jwtToken = req.headers['jwt_token'];
      const sessionId = req.headers['session_id'];

      console.log('[Customer] Fetching all document categories with case_types');

      // Fetch all document categories with nested case_types
      const { data: categories, error } = await supabase
        .from('document_categories')
        .select(`
          category_id,
          case_type_id,
          document_name,
          is_mandatory,
          is_active,
          created_time,
          case_types!document_categories_case_type_id_fkey(*)
        `)
        .eq('is_active', true)
        .order('category_id', { ascending: true });

      if (error) {
        console.error('[Customer] Error fetching document categories:', error);
        return res.status(500).json([]);
      }

      // Transform data to match exact response format
      const formattedCategories = (categories || []).map(cat => ({
        category_id: cat.category_id,
        case_type_id: cat.case_type_id,
        document_name: cat.document_name,
        is_mandatory: cat.is_mandatory,
        is_active: cat.is_active,
        created_time: cat.created_time,
        case_types: cat.case_types || null
      }));

      // Return as array directly
      return res.status(200).json(formattedCategories);

    } catch (error) {
      console.error('[Customer] Get document categories error:', error);
      return res.status(500).json([]);
    }
  }

  // POST /customer/list-documents
  // List all documents for a case
  static async listDocuments(req, res) {
    try {
      const { case_id } = req.body;
      const jwtToken = req.headers['jwt_token'];
      const sessionId = req.headers['session_id'];

      // Validate case_id
      if (!case_id || case_id === 'NaN') {
        return res.status(400).json({
          success: false,
          message: 'Invalid case_id'
        });
      }

      console.log(`[Customer] Fetching documents for case_id: ${case_id}`);

      // Query database for documents
      const { data: documents, error: docError } = await supabase
        .from('case_documents')
        .select(`
          document_id,
          file_path
        `)
        .eq('case_id', case_id)
        .eq('deleted_flag', false)
        .order('upload_time', { ascending: false });

      if (docError) {
        console.error('[Customer] Error fetching documents:', docError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch documents',
          documents: []
        });
      }

      // Transform documents to match response format (only document_id and file_path)
      const formattedDocuments = (documents || []).map(doc => ({
        document_id: doc.document_id,
        file_path: doc.file_path
      }));

      // Return response
      return res.status(200).json({
        success: true,
        case_id: case_id,
        documents: formattedDocuments
      });

    } catch (error) {
      console.error('[Customer] List documents error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch documents',
        documents: []
      });
    }
  }
}

export default CustomerController;


