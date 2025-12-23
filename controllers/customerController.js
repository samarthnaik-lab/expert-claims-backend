import supabase from '../config/database.js';
import UserModel from '../models/UserModel.js';
import SessionModel from '../models/SessionModel.js';
import jwt from 'jsonwebtoken';

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

      // Normalize mobile number: remove spaces, dashes, and common country codes
      const normalizeMobile = (num) => {
        if (!num) return null;
        // Convert to string and remove all non-digit characters
        let normalized = num.toString().replace(/\D/g, '');
        // Remove common Indian country codes (91, +91, 0091)
        if (normalized.startsWith('91') && normalized.length > 10) {
          normalized = normalized.substring(2);
        } else if (normalized.startsWith('0091') && normalized.length > 10) {
          normalized = normalized.substring(4);
        }
        return normalized;
      };

      const normalizedMobile = normalizeMobile(mobileNumber);
      console.log('[Customer] Normalized mobile_number:', normalizedMobile);

      // 1) Find customer by mobile number - try multiple formats
      // NOTE: We intentionally DO NOT filter by deleted_flag here,
      // because we still need to allow session lookup even if the
      // customer record has deleted_flag = true.
      
      let customer = null;
      let customerError = null;

      // First, try exact match with original number (trimmed)
      let { data: customerData, error: error1 } = await supabase
        .from('customers')
        .select('*')
        .eq('mobile_number', mobileNumber.trim())
        .maybeSingle();

      if (customerData) {
        customer = customerData;
        console.log('[Customer] Found customer with exact match:', mobileNumber);
      } else if (error1) {
        customerError = error1;
        console.error('[Customer] Error with exact match:', error1);
      }

      // If not found, try normalized number
      if (!customer && normalizedMobile && normalizedMobile !== mobileNumber) {
        const { data: customerData2, error: error2 } = await supabase
          .from('customers')
          .select('*')
          .eq('mobile_number', normalizedMobile)
          .maybeSingle();

        if (customerData2) {
          customer = customerData2;
          console.log('[Customer] Found customer with normalized match:', normalizedMobile);
        } else if (error2) {
          customerError = error2;
          console.error('[Customer] Error with normalized match:', error2);
        }
      }

      // If still not found, try with country code prefix (91)
      if (!customer && normalizedMobile) {
        const withCountryCode = '91' + normalizedMobile;
        const { data: customerData3, error: error3 } = await supabase
          .from('customers')
          .select('*')
          .eq('mobile_number', withCountryCode)
          .maybeSingle();

        if (customerData3) {
          customer = customerData3;
          console.log('[Customer] Found customer with country code:', withCountryCode);
        } else if (error3) {
          customerError = error3;
          console.error('[Customer] Error with country code match:', error3);
        }
      }

      // If still not found, try ILIKE for partial match (case-insensitive) - try both original and normalized
      if (!customer) {
        // Try with original number
        const { data: customerData4a, error: error4a } = await supabase
          .from('customers')
          .select('*')
          .ilike('mobile_number', `%${mobileNumber}%`)
          .limit(1)
          .maybeSingle();

        if (customerData4a) {
          customer = customerData4a;
          console.log('[Customer] Found customer with ILIKE match (original):', mobileNumber, 'stored as:', customerData4a.mobile_number);
        } else if (error4a) {
          customerError = error4a;
          console.error('[Customer] Error with ILIKE match (original):', error4a);
        }
      }

      // Try with normalized number
      if (!customer && normalizedMobile) {
        const { data: customerData4, error: error4 } = await supabase
          .from('customers')
          .select('*')
          .ilike('mobile_number', `%${normalizedMobile}%`)
          .limit(1)
          .maybeSingle();

        if (customerData4) {
          customer = customerData4;
          console.log('[Customer] Found customer with ILIKE match (normalized):', normalizedMobile, 'stored as:', customerData4.mobile_number);
        } else if (error4) {
          customerError = error4;
          console.error('[Customer] Error with ILIKE match (normalized):', error4);
        }
      }

      // Debug: If still not found, query for similar mobile numbers to see what format exists
      if (!customer) {
        console.log('[Customer] DEBUG: No customer found. Searching for similar mobile numbers...');
        
        // Try to find by last 6 digits
        const last6Digits = normalizedMobile ? normalizedMobile.substring(normalizedMobile.length - 6) : mobileNumber.substring(mobileNumber.length - 6);
        const first6Digits = normalizedMobile ? normalizedMobile.substring(0, 6) : mobileNumber.substring(0, 6);
        
        const { data: similarCustomers, error: debugError } = await supabase
          .from('customers')
          .select('customer_id, mobile_number, first_name, last_name')
          .or(`mobile_number.ilike.%${last6Digits}%,mobile_number.ilike.%${first6Digits}%`)
          .limit(10);

        if (!debugError && similarCustomers && similarCustomers.length > 0) {
          console.log('[Customer] DEBUG: Found similar mobile numbers in database:', similarCustomers.map(c => ({
            customer_id: c.customer_id,
            mobile_number: c.mobile_number,
            mobile_number_length: c.mobile_number ? c.mobile_number.length : 0,
            mobile_number_type: typeof c.mobile_number,
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim()
          })));
          
          // Check if any of these match when we normalize them
          for (const similar of similarCustomers) {
            if (similar.mobile_number) {
              const similarNormalized = normalizeMobile(similar.mobile_number);
              if (similarNormalized === normalizedMobile || similarNormalized === mobileNumber) {
                console.log('[Customer] DEBUG: Found match after normalization!', {
                  stored: similar.mobile_number,
                  normalized: similarNormalized,
                  searched: normalizedMobile
                });
                // Fetch full customer record
                const { data: fullCustomer } = await supabase
                  .from('customers')
                  .select('*')
                  .eq('customer_id', similar.customer_id)
                  .single();
                if (fullCustomer) {
                  customer = fullCustomer;
                  break;
                }
              }
            }
          }
        } else {
          console.log('[Customer] DEBUG: No similar mobile numbers found in database');
        }
      }

      if (customerError) {
        console.error('[Customer] Error fetching customer by mobile_number:', customerError);
        return res.status(500).json([{
          status: 'error',
          message: 'Failed to fetch customer',
          error: customerError.message || 'Unknown error'
        }]);
      }

      if (!customer) {
        console.log('[Customer] No customer found after trying all formats. Searched for:', {
          original: mobileNumber,
          normalized: normalizedMobile,
          withCountryCode: normalizedMobile ? '91' + normalizedMobile : null
        });
        
        // Try one more time with a broader search using the last 8 digits
        if (normalizedMobile && normalizedMobile.length >= 8) {
          const last8Digits = normalizedMobile.substring(normalizedMobile.length - 8);
          const { data: broadMatch, error: broadError } = await supabase
            .from('customers')
            .select('customer_id, mobile_number, first_name, last_name')
            .ilike('mobile_number', `%${last8Digits}%`)
            .limit(1)
            .maybeSingle();

          if (broadMatch) {
            console.log('[Customer] Found customer with last 8 digits match:', last8Digits, 'stored as:', broadMatch.mobile_number);
            customer = broadMatch;
          }
        }
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

      // Build customer_name from first_name and last_name
      const customerName = (() => {
        const first = customer.first_name || '';
        const last = customer.last_name || '';
        return `${first} ${last}`.trim();
      })();

      const responseItem = {
        status: 'success',
        message: 'session customer id data Fetch Successfully',
        email: user.email || customer.email_address || '',
        userid: user.user_id,
        role: user.role || 'customer',
        name: nameFromCustomer,
        customer_name: customerName, // Concatenated first_name + last_name from customers table
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

  // GET /customer/getuserid
  // Get user_id from session (jwt_token or session_id header)
  // This helps frontend get user_id when it's not stored locally
  static async getUserIdFromSession(req, res) {
    try {
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      const authHeader = req.headers['authorization'];

      console.log('[Customer Get User ID] Request received:', {
        hasJwtToken: !!jwtToken,
        hasSessionId: !!sessionId,
        hasAuthHeader: !!authHeader
      });

      let userId = null;

      // Try JWT token first
      if (jwtToken) {
        try {
          const secret = process.env.JWT_SECRET;
          if (secret) {
            const decoded = jwt.verify(jwtToken, secret);
            if (decoded && decoded.user_id) {
              userId = decoded.user_id;
              console.log(`[Customer Get User ID] Found user_id from JWT: ${userId}`);
            }
          }
        } catch (error) {
          console.warn('[Customer Get User ID] JWT verification failed:', error.message);
        }
      }

      // Try Authorization Bearer token
      if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const secret = process.env.JWT_SECRET;
          if (secret) {
            const decoded = jwt.verify(token, secret);
            if (decoded && decoded.user_id) {
              userId = decoded.user_id;
              console.log(`[Customer Get User ID] Found user_id from Authorization header: ${userId}`);
            }
          }
        } catch (error) {
          console.warn('[Customer Get User ID] Authorization token verification failed:', error.message);
        }
      }

      // Try session_id
      if (!userId && sessionId) {
        try {
          const { data: session, error: sessionError } = await SessionModel.findBySessionId(sessionId);
          if (!sessionError && session && session.user_id) {
            userId = session.user_id;
            console.log(`[Customer Get User ID] Found user_id from session_id: ${userId}`);
          }
        } catch (error) {
          console.warn('[Customer Get User ID] Session lookup failed:', error.message);
        }
      }

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Could not extract user_id from session. Provide jwt_token or session_id in headers.',
          statusCode: 401
        });
      }

      return res.status(200).json({
        status: 'success',
        user_id: userId,
        userId: userId.toString()
      });

    } catch (error) {
      console.error('[Customer Get User ID] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message,
        statusCode: 500
      });
    }
  }

  // Helper: Extract user_id from JWT token or session_id headers
  static async extractUserIdFromHeaders(req) {
    try {
      // Try to get user_id from JWT token in headers
      const jwtToken = req.headers['jwt_token'] || req.headers['jwt-token'];
      if (jwtToken) {
        try {
          const secret = process.env.JWT_SECRET;
          if (secret) {
            const decoded = jwt.verify(jwtToken, secret);
            if (decoded && decoded.user_id) {
              console.log(`[Customer] Extracted user_id from JWT token: ${decoded.user_id}`);
              return decoded.user_id;
            }
          }
        } catch (jwtError) {
          console.warn('[Customer] JWT token verification failed:', jwtError.message);
        }
      }

      // Try to get user_id from session_id header
      const sessionId = req.headers['session_id'] || req.headers['session-id'];
      if (sessionId) {
        const { data: session, error: sessionError } = await SessionModel.findBySessionId(sessionId);
        if (!sessionError && session && session.user_id) {
          console.log(`[Customer] Extracted user_id from session_id: ${session.user_id}`);
          return session.user_id;
        }
      }

      // Try Authorization Bearer token
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const secret = process.env.JWT_SECRET;
          if (secret) {
            const decoded = jwt.verify(token, secret);
            if (decoded && decoded.user_id) {
              console.log(`[Customer] Extracted user_id from Authorization header: ${decoded.user_id}`);
              return decoded.user_id;
            }
          }
        } catch (jwtError) {
          console.warn('[Customer] Authorization Bearer token verification failed:', jwtError.message);
        }
      }

      return null;
    } catch (error) {
      console.error('[Customer] Error extracting user_id from headers:', error);
      return null;
    }
  }

  // POST /customer/customer-dashboard
  // Get customer dashboard data - cases for the customer
  // Automatically extracts user_id from jwt_token/session_id headers if not provided in body
  static async getCustomerDashboard(req, res) {
    try {
      // Log all incoming data for debugging
      console.log('[Customer Dashboard] Request received:', {
        method: req.method,
        url: req.url,
        headers: {
          jwt_token: req.headers['jwt_token'] ? 'present' : 'missing',
          session_id: req.headers['session_id'] || req.headers['session-id'] || 'missing',
          authorization: req.headers['authorization'] ? 'present' : 'missing',
          'content-type': req.headers['content-type']
        },
        body: req.body,
        query: req.query
      });

      // Try to extract user_id from headers first (JWT token or session_id)
      let userId = await CustomerController.extractUserIdFromHeaders(req);
      
      // Fall back to body or query params if not found in headers
      if (!userId) {
        userId = req.body.user_id || req.query.user_id;
      }

      // Validate user_id parameter
      if (!userId) {
        console.error('[Customer Dashboard] Missing user_id in request:', {
          body: req.body,
          query: req.query,
          headers: {
            jwt_token: req.headers['jwt_token'] ? 'present' : 'missing',
            session_id: req.headers['session_id'] || req.headers['session-id'] || 'missing'
          }
        });
        return res.status(400).json({
          status: 'error',
          message: 'user_id is required. Provide it in jwt_token/session_id headers, body, or query params',
          statusCode: 400
        });
      }

      console.log(`[Customer Dashboard] Using user_id: ${userId} (from ${req.body.user_id ? 'body' : 'headers'})`);

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
      // Order by created_time descending (newest first)
      // Note: created_time is stored as text, but ISO format strings sort correctly
      const { data: rawCases, error: casesError } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*)
        `)
        .eq('customer_id', customerId)
        .eq('deleted_flag', false)
        .order('created_time', { ascending: false, nullsFirst: false });

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
      // Log all incoming data for debugging
      console.log('[Customer Cases] Request received:', {
        method: req.method,
        url: req.url,
        headers: {
          jwt_token: req.headers['jwt_token'] ? 'present' : 'missing',
          session_id: req.headers['session_id'] || req.headers['session-id'] || 'missing',
          authorization: req.headers['authorization'] ? 'present' : 'missing',
          'content-type': req.headers['content-type']
        },
        body: req.body,
        query: req.query
      });

      // Try to extract user_id from headers first (JWT token or session_id)
      let userId = await CustomerController.extractUserIdFromHeaders(req);
      
      // Fall back to body or query params if not found in headers
      if (!userId) {
        userId = req.body.user_id || req.query.user_id;
      }
      
      // Get page and size from body or query params
      const page = req.body.page || req.query.page;
      const size = req.body.size || req.query.size;

      // Validate user_id parameter
      if (!userId) {
        console.error('[Customer Cases] Missing user_id in request:', {
          body: req.body,
          query: req.query,
          headers: {
            jwt_token: req.headers['jwt_token'] ? 'present' : 'missing',
            session_id: req.headers['session_id'] || req.headers['session-id'] || 'missing'
          }
        });
        return res.status(400).json({
          status: 'error',
          message: 'user_id is required. Provide it in jwt_token/session_id headers, body, or query params',
          statusCode: 400
        });
      }

      console.log(`[Customer Cases] Using user_id: ${userId} (from ${req.body.user_id ? 'body' : 'headers'}), page: ${page}, size: ${size}`);

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
      // Order by created_time descending (newest first)
      // Note: created_time is stored as text, but ISO format strings sort correctly
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
        .order('created_time', { ascending: false, nullsFirst: false })
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

  // GET /customer/case-details?case_id={case_id} or POST /customer/case-details
  // Get case details for a specific case (only if it belongs to the logged-in customer)
  static async getCaseDetails(req, res) {
    try {
      // Get case_id from query params or body
      const caseId = req.query.case_id || req.body.case_id;

      // Log request
      console.log('[Customer Case Details] Request received:', {
        case_id: caseId,
        method: req.method,
        hasJwtToken: !!(req.headers['jwt_token'] || req.headers['jwt-token']),
        hasSessionId: !!(req.headers['session_id'] || req.headers['session-id'])
      });

      // Validate case_id
      if (!caseId || caseId === 'undefined' || caseId === '') {
        return res.status(400).json({
          status: 'error',
          message: 'case_id is required',
          statusCode: 400
        });
      }

      // Extract user_id from headers
      let userId = await CustomerController.extractUserIdFromHeaders(req);
      
      // Fall back to body if not in headers
      if (!userId) {
        userId = req.body.user_id || req.query.user_id;
      }

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required. Provide jwt_token or session_id in headers.',
          statusCode: 401
        });
      }

      // Get user details
      const { data: user, error: userError } = await UserModel.findByUserId(userId);
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
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (customerError) {
        console.error('[Customer Case Details] Error fetching customer:', customerError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch customer data',
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
      console.log(`[Customer Case Details] Customer found: customer_id=${customerId}, fetching case: ${caseId}`);

      // Fetch case details - IMPORTANT: Verify it belongs to this customer
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*),
          customers(*),
          employees!cases_assigned_to_fkey(
            first_name,
            last_name
          )
        `)
        .eq('case_id', caseId)
        .eq('customer_id', customerId) // CRITICAL: Only return if case belongs to this customer
        .eq('deleted_flag', false)
        .maybeSingle();

      if (caseError) {
        console.error('[Customer Case Details] Error fetching case:', caseError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch case data',
          error: caseError.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!caseData) {
        console.log(`[Customer Case Details] Case ${caseId} not found for customer ${customerId}`);
        return res.status(404).json({
          status: 'error',
          message: `Case with ID ${caseId} was not found in your account. This could be because:`,
          reasons: [
            'The case ID is incorrect',
            'The case belongs to another customer',
            'The case has been removed or archived'
          ],
          statusCode: 404
        });
      }

      // Fetch related documents (customer visible only)
      const { data: documents } = await supabase
        .from('case_documents')
        .select('*')
        .eq('case_id', caseId)
        .eq('is_customer_visible', true)
        .eq('deleted_flag', false)
        .order('upload_time', { ascending: false });

      // Fetch case comments (if customer visible)
      const { data: comments } = await supabase
        .from('case_comments')
        .select('*')
        .eq('case_id', caseId)
        .eq('is_internal', false) // Only non-internal comments for customers
        .order('created_time', { ascending: false });

      // Build response
      const response = {
        status: 'success',
        case: {
          ...caseData,
          documents: documents || [],
          comments: comments || []
        }
      };

      return res.status(200).json(response);

    } catch (error) {
      console.error('[Customer Case Details] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
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


