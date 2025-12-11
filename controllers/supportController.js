import BacklogModel from '../models/BacklogModel.js';
import BacklogCommentModel from '../models/BacklogCommentModel.js';
import supabase from '../config/database.js';
import path from 'path';

class SupportController {
  // GET /support/get_all_backlog_data?employee_id={employee_id}
  // Support Team endpoint: Get all backlog entries assigned to a specific employee with full relationships
  static async getAllBacklogData(req, res) {
    try {
      const { employee_id } = req.query;

      // Validate employee_id parameter
      if (!employee_id) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id query parameter is required',
          statusCode: 400
        });
      }

      // Validate employee_id is a valid number (allow 0 to get all backlog entries)
      const employeeIdNum = parseInt(employee_id);
      if (isNaN(employeeIdNum) || employeeIdNum < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id must be a valid number (0 or positive)',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching all backlog data for employee_id: ${employeeIdNum}`);

      // Fetch all backlog entries assigned to this employee with relationships
      const { data: backlogList, error } = await BacklogModel.findByEmployeeId(employeeIdNum);

      if (error) {
        console.error('[Support Team] Error fetching backlog by employee_id:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch backlog data',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Return data as array (empty array if no backlog found)
      return res.status(200).json(backlogList || []);

    } catch (error) {
      console.error('[Support Team] Get all backlog data error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/backlog_id?backlog_id={backlog_id}
  // Support Team endpoint: Get backlog details by backlog_id with full relationships
  static async getBacklogById(req, res) {
    try {
      const { backlog_id } = req.query;

      // Validate backlog_id parameter
      if (!backlog_id || backlog_id === 'undefined') {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id query parameter is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching backlog data for backlog_id: ${backlog_id}`);

      // Fetch backlog with all nested relationships
      const { data: backlogData, error } = await BacklogModel.findByBacklogId(backlog_id);

      if (error) {
        console.error('[Support Team] Error fetching backlog:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch backlog data',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!backlogData) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Add partner_name from partners if exists
      if (backlogData.partners) {
        const firstName = backlogData.partners.first_name || '';
        const lastName = backlogData.partners.last_name || '';
        backlogData.partner_name = `${firstName}${lastName}`.trim() || null;
      } else {
        backlogData.partner_name = null;
      }

      // Return data as array (matching n8n format)
      return res.status(200).json([backlogData]);

    } catch (error) {
      console.error('[Support Team] Get backlog by ID error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /support/updatecunsultantpolicy
  // Support Team endpoint: Update consultant assignment for a backlog entry
  static async updateConsultantPolicy(req, res) {
    try {
      const { backlog_id, assigned_consultant_name, assigned_to, updated_by, user_id } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Updating consultant policy for backlog_id: ${backlog_id}`);

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      // Add assigned_consultant_name if provided
      if (assigned_consultant_name !== undefined && assigned_consultant_name !== null) {
        updateData.assigned_consultant_name = assigned_consultant_name;
      }

      // Add assigned_to if provided (can be from assigned_to or user_id)
      if (assigned_to !== undefined && assigned_to !== null) {
        const assignedToNum = parseInt(assigned_to);
        if (!isNaN(assignedToNum) && assignedToNum > 0) {
          updateData.assigned_to = assignedToNum;
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
      const { data: updatedBacklog, error } = await BacklogModel.update(backlog_id, updateData);

      if (error) {
        console.error('[Support Team] Error updating consultant policy:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update consultant policy',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!updatedBacklog) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Return updated backlog data
      return res.status(200).json({
        status: 'success',
        message: 'Consultant policy updated successfully',
        data: updatedBacklog,
        statusCode: 200
      });

    } catch (error) {
      console.error('[Support Team] Update consultant policy error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/gettechnicalconsultant
  // Support Team endpoint: Get all technical consultants (employees)
  static async getTechnicalConsultants(req, res) {
    try {
      console.log('[Support Team] Fetching technical consultants');

      // Fetch all employees who are technical consultants
      // Filter by designation containing "consultant" or "technical" (case-insensitive)
      // Also filter out deleted employees
      const { data: employees, error } = await supabase
        .from('employees')
        .select('*')
        .or('designation.ilike.%consultant%,designation.ilike.%technical%')
        .eq('deleted_flag', false)
        .order('first_name', { ascending: true });

      if (error) {
        console.error('[Support Team] Error fetching technical consultants:', error);
        
        // If the filter fails, try fetching all active employees
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch technical consultants',
            error: allError.message || 'Unknown error',
            statusCode: 500
          });
        }

        // Return all active employees if specific filter doesn't work
        return res.status(200).json(allEmployees || []);
      }

      // If no employees found with consultant designation, fetch all active employees
      if (!employees || employees.length === 0) {
        console.log('[Support Team] No consultants found with designation filter, fetching all active employees');
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch employees',
            error: allError.message || 'Unknown error',
            statusCode: 500
          });
        }

        return res.status(200).json(allEmployees || []);
      }

      // Return technical consultants
      return res.status(200).json(employees || []);

    } catch (error) {
      console.error('[Support Team] Get technical consultants error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /support/updatestatustechnicalconsultant
  // Support Team endpoint: Update backlog status and assign technical consultant
  static async updateStatusTechnicalConsultant(req, res) {
    try {
      const { backlog_id, status, expert_description, updated_by, user_id } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Updating backlog status and consultant for backlog_id: ${backlog_id}`);

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      // Add status if provided
      if (status !== undefined && status !== null) {
        updateData.status = status;
      }

      // Add expert_description if provided
      if (expert_description !== undefined && expert_description !== null) {
        updateData.expert_description = expert_description;
      }

      // Add updated_by if provided
      if (updated_by !== undefined && updated_by !== null) {
        updateData.updated_by = updated_by;
        // Also update assigned_consultant_name with the same value
        updateData.assigned_consultant_name = updated_by;
      }

      // Add assigned_to (from user_id) if provided
      if (user_id !== undefined && user_id !== null) {
        const userIdNum = parseInt(user_id);
        if (!isNaN(userIdNum) && userIdNum > 0) {
          updateData.assigned_to = userIdNum;
        }
      }

      // Update backlog entry
      const { data: updatedBacklog, error } = await BacklogModel.update(backlog_id, updateData);

      if (error) {
        console.error('[Support Team] Error updating backlog:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update backlog',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!updatedBacklog) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Return updated backlog data
      return res.status(200).json({
        status: 'success',
        message: 'Backlog updated successfully',
        data: updatedBacklog,
        statusCode: 200
      });

    } catch (error) {
      console.error('[Support Team] Update status technical consultant error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/comments_insert
  // Support Team endpoint: Insert backlog comment
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
        email, // Not stored in table, just for logging
        role // Not stored in table, just for logging
      } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required in request body',
          statusCode: 400
        });
      }

      if (!comment_text || comment_text.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'comment_text is required and cannot be empty',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Inserting comment for backlog_id: ${backlog_id}`);

      // Validate backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Validate created_by and updated_by if provided
      if (created_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(created_by))
          .single();

        if (!userCheck) {
          console.warn(`[Support Team] Warning: created_by ${created_by} does not exist in users table`);
        }
      }

      if (updated_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(updated_by))
          .single();

        if (!userCheck) {
          console.warn(`[Support Team] Warning: updated_by ${updated_by} does not exist in users table`);
        }
      }

      // Prepare comment data
      const commentData = {
        backlog_id: backlog_id,
        comment_text: comment_text.trim(),
        created_by: created_by ? parseInt(created_by) : null,
        updated_by: updated_by ? parseInt(updated_by) : null,
        createdby_name: createdby_name || null,
        updatedby_name: updatedby_name || null,
        department: department || null,
        created_time: new Date().toISOString(),
        updated_time: new Date().toISOString()
      };

      console.log(`[Support Team] Comment data:`, {
        backlog_id: commentData.backlog_id,
        created_by: commentData.created_by,
        department: commentData.department,
        comment_length: commentData.comment_text.length,
        email: email,
        role: role
      });

      // Insert comment into database
      const { data: insertedComment, error: insertError } = await BacklogCommentModel.create(commentData);

      if (insertError) {
        console.error('[Support Team] Error inserting comment:', insertError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to insert comment',
          error: insertError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Comment inserted successfully',
        data: insertedComment
      });

    } catch (error) {
      console.error('[Support Team] Insert comment error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/getemployees - Get all employees
  static async getEmployees(req, res) {
    try {
      console.log(`[Support Team] Getting all employees`);

      // Return employees
      const { data: employees, error } = await supabase
        .from('employees')
        .select('employee_id, first_name, last_name, deleted_flag')
        .eq('deleted_flag', false)
        .order('first_name', { ascending: true })
        .limit(10000);

      if (error) {
        console.error('[Support Team] Error fetching employees:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch employees',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Format employees to match n8n webhook response format
      const formattedEmployees = (employees || []).map(emp => ({
        employee_id: emp.employee_id,
        employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
      }));

      console.log(`[Support Team] Returning ${formattedEmployees.length} employees`);
      return res.status(200).json(formattedEmployees);

    } catch (error) {
      console.error('[Support Team] Get employees error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/case_type - Get all case types
  static async getCaseTypes(req, res) {
    try {
      console.log(`[Support Team] Getting all case types`);

      // Fetch all active case types (not deleted)
      const { data: caseTypes, error, count } = await supabase
        .from('case_types')
        .select('case_type_id, case_type_name, deleted_flag', { count: 'exact' })
        .or('deleted_flag.is.null,deleted_flag.eq.false') // Handle both null and false
        .eq('is_active', true) // Only active case types
        .order('case_type_id', { ascending: true }) // Order by ID
        .limit(10000);
      
      console.log(`[Support Team] Fetched ${caseTypes ? caseTypes.length : 0} case types (total count in DB: ${count})`);

      if (error) {
        console.error('[Support Team] Error fetching case types:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch case types',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Format case types to match n8n webhook response format
      // Return only case_type_id and case_type_name
      const formattedCaseTypes = (caseTypes || []).map(ct => ({
        case_type_id: ct.case_type_id,
        case_type_name: ct.case_type_name || ''
      }));

      console.log(`[Support Team] Returning ${formattedCaseTypes.length} case types`);
      
      // Return response wrapped in body, headers, statusCode, statusMessage format
      return res.status(200).json({
        body: formattedCaseTypes,
        headers: {},
        statusCode: 200,
        statusMessage: "OK"
      });

    } catch (error) {
      console.error('[Support Team] Get case types error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/getcustomers - Get all customers
  static async getCustomers(req, res) {
    try {
      console.log(`[Support Team] Getting all customers`);

      // Return customers
      const { data: customers, error, count } = await supabase
        .from('customers')
        .select('customer_id, first_name, last_name, company_name, deleted_flag', { count: 'exact' })
        .or('deleted_flag.is.null,deleted_flag.eq.false')
        .order('customer_id', { ascending: true })
        .limit(10000);
      
      console.log(`[Support Team] Fetched ${customers ? customers.length : 0} customers (total count in DB: ${count})`);

      if (error) {
        console.error('[Support Team] Error fetching customers:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch customers',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Format customers to match n8n webhook response format
      const formattedCustomers = (customers || [])
        .filter(cust => {
          return cust.company_name || cust.first_name || cust.last_name;
        })
        .map(cust => {
          let customerName = '';
          if (cust.company_name && cust.company_name.trim()) {
            customerName = cust.company_name.trim();
          } else {
            const firstName = cust.first_name || '';
            const lastName = cust.last_name || '';
            customerName = `${firstName} ${lastName}`.trim();
          }
          
          if (!customerName) {
            return null;
          }
          
          return {
            customer_id: cust.customer_id,
            customer_name: customerName
          };
        })
        .filter(cust => cust !== null);

      console.log(`[Support Team] Returning ${formattedCustomers.length} customers`);
      return res.status(200).json(formattedCustomers);

    } catch (error) {
      console.error('[Support Team] Get customers error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/{uuid} - Handle UUID-based routes (for backward compatibility)
  // Different UUIDs return different data types:
  // - 2d7eb946-588f-436d-8ebe-ccb118babf12 → employees
  // - 4b9270ad-fe64-49e2-a41b-a86a78e938e1 → customers
  static async handleUuidRoute(req, res) {
    try {
      const { uuid } = req.params;
      
      console.log(`[Support Team] UUID route accessed: ${uuid}`);

      // Check UUID to determine what to return
      if (uuid === '2d7eb946-588f-436d-8ebe-ccb118babf12' || uuid === 'getemployees') {
        // Return employees
        const { data: employees, error } = await supabase
          .from('employees')
          .select('employee_id, first_name, last_name, deleted_flag')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true })
          .limit(10000);

        if (error) {
          console.error('[Support Team] Error fetching employees:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch employees',
            error: error.message || 'Unknown error',
            statusCode: 500
          });
        }

        // Format employees to match n8n webhook response format
        const formattedEmployees = (employees || []).map(emp => ({
          employee_id: emp.employee_id,
          employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
        }));

        console.log(`[Support Team] Returning ${formattedEmployees.length} employees`);
        return res.status(200).json(formattedEmployees);

      } else if (uuid === '4b9270ad-fe64-49e2-a41b-a86a78e938e1' || uuid === 'getcustomers') {
        // Return customers
        const { data: customers, error, count } = await supabase
          .from('customers')
          .select('customer_id, first_name, last_name, company_name, deleted_flag', { count: 'exact' })
          .or('deleted_flag.is.null,deleted_flag.eq.false')
          .order('customer_id', { ascending: true })
          .limit(10000);
        
        console.log(`[Support Team] Fetched ${customers ? customers.length : 0} customers (total count in DB: ${count})`);

        if (error) {
          console.error('[Support Team] Error fetching customers:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch customers',
            error: error.message || 'Unknown error',
            statusCode: 500
          });
        }

        // Format customers to match n8n webhook response format
        const formattedCustomers = (customers || [])
          .filter(cust => {
            return cust.company_name || cust.first_name || cust.last_name;
          })
          .map(cust => {
            let customerName = '';
            if (cust.company_name && cust.company_name.trim()) {
              customerName = cust.company_name.trim();
            } else {
              const firstName = cust.first_name || '';
              const lastName = cust.last_name || '';
              customerName = `${firstName} ${lastName}`.trim();
            }
            
            if (!customerName) {
              return null;
            }
            
            return {
              customer_id: cust.customer_id,
              customer_name: customerName
            };
          })
          .filter(cust => cust !== null);

        console.log(`[Support Team] Returning ${formattedCustomers.length} customers`);
        return res.status(200).json(formattedCustomers);

      } else {
        // Unknown UUID - return error or default behavior
        return res.status(404).json({
          status: 'error',
          message: `Unknown UUID route: ${uuid}`,
          statusCode: 404
        });
      }

    } catch (error) {
      console.error('[Support Team] UUID route error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/partnerdocumentview
  // View partner document - simple version
  static async partnerDocumentView(req, res) {
    try {
      const { document_id } = req.body;

      if (!document_id) {
        return res.status(400).json({
          success: false,
          error: 'document_id is required'
        });
      }

      console.log(`[View Document] Fetching document_id: ${document_id}`);

      // Step 1: Get document from database
      const { data: document, error: docError } = await supabase
        .from('backlog_documents')
        .select('document_id, backlog_id, file_path')
        .eq('document_id', document_id)
        .maybeSingle();

      if (docError || !document) {
        console.error('[View Document] Document not found:', docError);
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      console.log(`[View Document] Found document: file_path=${document.file_path}`);

      // Step 2: Get backlog to find case_type_name
      const { data: backlog, error: backlogError } = await supabase
        .from('backlog')
        .select('case_type_id')
        .eq('backlog_id', document.backlog_id)
        .maybeSingle();

      if (backlogError || !backlog) {
        return res.status(404).json({
          success: false,
          error: 'Backlog not found'
        });
      }

      // Step 3: Get case_type_name
      const { data: caseType, error: caseError } = await supabase
        .from('case_types')
        .select('case_type_name')
        .eq('case_type_id', backlog.case_type_id)
        .maybeSingle();

      if (caseError || !caseType) {
        return res.status(404).json({
          success: false,
          error: 'Case type not found'
        });
      }

      // Step 4: Construct bucket name
      const bucketName = `expc-${caseType.case_type_name.trim().toLowerCase().replace(/\s+/g, '-')}`;
      console.log(`[View Document] Using bucket: ${bucketName}`);

      // Step 5: Extract file path
      let storagePath = document.file_path;
      
      console.log(`[View Document] Original file_path: ${storagePath}`);
      
      // If it's a full URL, extract just the path
      if (storagePath && storagePath.includes('/storage/v1/object/public/')) {
        const parts = storagePath.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          const pathParts = parts[1].split('/');
          // Remove bucket name (first part) and keep the rest
          if (pathParts.length > 1) {
            storagePath = pathParts.slice(1).join('/');
          } else {
            storagePath = parts[1];
          }
        }
      } else if (storagePath && storagePath.startsWith('bk-')) {
        // Already in correct format: bk-ECSI-GA-25-086/filename.pdf
        storagePath = storagePath;
      } else if (storagePath && storagePath.includes(bucketName + '/')) {
        // If path contains bucket name, remove it
        storagePath = storagePath.split(bucketName + '/')[1] || storagePath;
      }

      console.log(`[View Document] Extracted storage path: ${storagePath}`);

      // Step 6: Download file from storage - try multiple buckets
      const bucketVariations = [
        bucketName, // expc-{case_type_name}
        `public-${caseType.case_type_name.trim().toLowerCase().replace(/\s+/g, '-')}`, // public-{case_type_name}
        'backlog-documents', // Fallback bucket
        'public-fire' // Common bucket
      ];

      let fileData = null;
      let downloadError = null;
      let usedBucket = null;

      for (const bucket of bucketVariations) {
        console.log(`[View Document] Trying bucket: ${bucket}`);
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(storagePath);

        if (!error && data) {
          fileData = data;
          usedBucket = bucket;
          console.log(`[View Document] ✓ File found in bucket: ${bucket}`);
          break;
        } else {
          console.log(`[View Document] ✗ Not found in bucket: ${bucket}, error: ${error?.message}`);
          downloadError = error;
        }
      }

      if (!fileData) {
        console.error('[View Document] File not found in any bucket');
        console.error('[View Document] Tried buckets:', bucketVariations);
        console.error('[View Document] Storage path:', storagePath);
        return res.status(500).json({
          success: false,
          error: 'File not found in storage',
          details: {
            tried_buckets: bucketVariations,
            storage_path: storagePath,
            case_type_name: caseType.case_type_name
          }
        });
      }

      // Step 7: Return file
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = path.extname(storagePath).toLowerCase();
      
      // Determine Content-Type based on file extension
      // Supported: PDF, DOC, DOCX, JPG, PNG, TXT
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

      console.log(`[View Document] Returning file: ${buffer.length} bytes, type: ${contentType}, extension: ${ext}`);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(storagePath)}"`);
      return res.send(buffer);

    } catch (error) {
      console.error('[View Document] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error: ' + error.message
      });
    }
  }
}

export default SupportController;

