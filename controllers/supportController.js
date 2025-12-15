import BacklogModel from '../models/BacklogModel.js';
import BacklogCommentModel from '../models/BacklogCommentModel.js';
import CaseModel from '../models/CaseModel.js';
import UserModel from '../models/UserModel.js';
import PartnerModel from '../models/PartnerModel.js';
import Validators from '../utils/validators.js';
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

      // Return data as array with message if empty
      if (!backlogList || backlogList.length === 0) {
        return res.status(200).json({
          status: 'success',
          message: 'No backlog data found for this employee',
          data: []
        });
      }

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

  // GET /support/getemployedashboard?employee_id={employee_id}
  // Get employee dashboard data - cases assigned to employee with status mapping
  static async getEmployeeDashboard(req, res) {
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

      const employeeIdNum = parseInt(employee_id);
      if (isNaN(employeeIdNum) || employeeIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id must be a valid positive number',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching dashboard data for employee_id: ${employeeIdNum}`);

      // Fetch cases assigned to this employee from cases table
      const { data: rawCases, error: casesError } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*)
        `)
        .eq('assigned_to', employeeIdNum)
        .eq('deleted_flag', false)
        .order('created_time', { ascending: false });

      if (casesError) {
        console.error('[Support Team] Error fetching cases:', casesError);
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

      // Build response matching n8n workflow format
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
      console.error('[Support Team] Get employee dashboard error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/getemployeetasks?employee_id={employee_id}&page={page}&size={size}
  // Get employee tasks (cases) with pagination support
  static async getEmployeeTasks(req, res) {
    try {
      const { employee_id, page, size } = req.query;

      // Validate employee_id parameter
      if (!employee_id) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id query parameter is required',
          statusCode: 400
        });
      }

      const employeeIdNum = parseInt(employee_id);
      if (isNaN(employeeIdNum) || employeeIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id must be a valid positive number',
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

      console.log(`[Support Team] Fetching tasks for employee_id: ${employeeIdNum}, page: ${pageNum}, size: ${sizeNum}`);

      // Get session info from headers
      const sessionId = req.headers['session_id'] || null;
      const jwtToken = req.headers['jwt_token'] || null;
      
      // Calculate session end time (assuming 1 hour session)
      const sessionEndTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, -1); // Remove 'Z'

      // Fetch cases assigned to this employee with pagination and all relationships
      const { data: casesList, error: casesError, count } = await supabase
        .from('cases')
        .select(`
          *,
          case_types(*),
          customers(*),
          partners!cases_referring_partner_id_fkey(*)
        `, { count: 'exact' })
        .eq('assigned_to', employeeIdNum)
        .eq('deleted_flag', false)
        .order('created_time', { ascending: false })
        .range(offset, offset + sizeNum - 1);

      if (casesError) {
        console.error('[Support Team] Error fetching cases:', casesError);
        console.error('[Support Team] Error details:', JSON.stringify(casesError, null, 2));
        
        // Check if error is HTML (connection/network issue)
        let errorMessage = 'Failed to fetch employee tasks';
        let errorDetails = casesError.message || 'Unknown error';
        
        if (errorDetails && typeof errorDetails === 'string' && errorDetails.includes('<!DOCTYPE html>')) {
          errorMessage = 'Database connection error. Please check Supabase URL configuration in environment variables.';
          errorDetails = 'Supabase host not found - check SUPABASE_URL in .env file';
        } else if (errorDetails && typeof errorDetails === 'string' && errorDetails.length > 500) {
          errorDetails = errorDetails.substring(0, 500) + '...';
        }
        
        return res.status(500).json({
          status: 'error',
          message: errorMessage,
          error: errorDetails,
          statusCode: 500
        });
      }

      // Get assigned employee details
      const { data: assignedEmployee, error: employeeError } = await supabase
        .from('employees')
        .select('employee_id, first_name, last_name')
        .eq('employee_id', employeeIdNum)
        .single();

      if (employeeError) {
        console.warn('[Support Team] Error fetching employee details:', employeeError);
      }

      // Fetch customer partners for all cases in parallel (from customers.partner_id)
      const customerPartnerIds = [...new Set((casesList || [])
        .map(c => c.customers?.partner_id)
        .filter(id => id))];

      const customerPartnersMap = {};
      if (customerPartnerIds.length > 0) {
        const { data: customerPartners, error: partnerError } = await supabase
          .from('partners')
          .select('partner_id, user_id, first_name, last_name, mobile_number')
          .in('partner_id', customerPartnerIds);

        if (partnerError) {
          console.warn('[Support Team] Error fetching customer partners:', partnerError);
        } else if (customerPartners) {
          customerPartners.forEach(partner => {
            customerPartnersMap[partner.partner_id] = partner;
          });
        }
      }

      // Format cases with flattened structure
      const formattedCases = (casesList || []).map(caseItem => {
        const caseData = { ...caseItem };
        const customer = caseItem.customers || {};
        const casePartner = caseItem.partners || {};
        
        // Remove nested objects
        delete caseData.case_types;
        delete caseData.customers;
        delete caseData.partners;

        // Add assigned employee info
        if (assignedEmployee) {
          caseData.assigned_employee_id = assignedEmployee.employee_id;
          caseData.assigned_employee_first_name = assignedEmployee.first_name || null;
          caseData.assigned_employee_last_name = assignedEmployee.last_name || null;
          caseData.assigned_employee_name = `${assignedEmployee.first_name || ''} ${assignedEmployee.last_name || ''}`.trim() || null;
        } else {
          caseData.assigned_employee_id = null;
          caseData.assigned_employee_first_name = null;
          caseData.assigned_employee_last_name = null;
          caseData.assigned_employee_name = null;
        }

        // Add customer fields (flattened)
        caseData.cust_id = customer.customer_id || null;
        caseData.first_name = customer.first_name || null;
        caseData.last_name = customer.last_name || null;
        caseData.customer_name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null;
        caseData.company_name = customer.company_name || null;
        caseData.mobile_number = customer.mobile_number || null;
        caseData.emergency_contact = customer.emergency_contact || null;
        caseData.email_address = customer.email_address || null;
        caseData.address = customer.address || null;
        caseData.customer_type = customer.customer_type || null;
        caseData.source = customer.source || null;
        caseData.communication_preferences = customer.communication_preferences || null;
        caseData.language_preference = customer.language_preference || null;
        caseData.notes = customer.notes || null;
        caseData.customer_created_by = customer.created_by || null;
        caseData.customer_created_time = customer.created_time || null;
        caseData.customer_updated_by = customer.updated_by || null;
        caseData.customer_updated_time = customer.updated_time || null;
        caseData.customer_deleted_flag = customer.deleted_flag || false;

        // Add customer's partner info (from customer.partner_id)
        const customerPartnerId = customer.partner_id;
        if (customerPartnerId && customerPartnersMap[customerPartnerId]) {
          const customerPartner = customerPartnersMap[customerPartnerId];
          caseData.customer_partner_id = customerPartner.partner_id;
          caseData.customer_partner_user_id = customerPartner.user_id || null;
          caseData.customer_partner_first_name = customerPartner.first_name || null;
          caseData.customer_partner_last_name = customerPartner.last_name || null;
          caseData.customer_partner_full_name = `${customerPartner.first_name || ''} ${customerPartner.last_name || ''}`.trim() || null;
          caseData.customer_partner_mobile_number = customerPartner.mobile_number || null;
        } else {
          caseData.customer_partner_id = null;
          caseData.customer_partner_user_id = null;
          caseData.customer_partner_first_name = null;
          caseData.customer_partner_last_name = null;
          caseData.customer_partner_full_name = null;
          caseData.customer_partner_mobile_number = null;
        }

        // Add case partner info (from referring_partner_id)
        if (casePartner && casePartner.partner_id) {
          caseData.case_partner_id = casePartner.partner_id;
          caseData.case_partner_user_id = casePartner.user_id || null;
          caseData.case_partner_first_name = casePartner.first_name || null;
          caseData.case_partner_last_name = casePartner.last_name || null;
          caseData.case_partner_full_name = `${casePartner.first_name || ''} ${casePartner.last_name || ''}`.trim() || null;
          caseData.case_partner_mobile_number = casePartner.mobile_number || null;
        } else {
          caseData.case_partner_id = null;
          caseData.case_partner_user_id = null;
          caseData.case_partner_first_name = null;
          caseData.case_partner_last_name = null;
          caseData.case_partner_full_name = null;
          caseData.case_partner_mobile_number = null;
        }

        return caseData;
      });

      // Build response in the requested format
      const response = [{
        status: 'success',
        message: 'Task Management Data Fetch Successfully',
        session_id: sessionId,
        session_endtime: sessionEndTime,
        jwt_token: jwtToken,
        data: formattedCases
      }];

      return res.status(200).json(response);

    } catch (error) {
      console.error('[Support Team] Get employee tasks error:', error);
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
  // Support Team endpoint: Update backlog status and expert description
  // NOTE: This endpoint does NOT update assigned_to or assigned_consultant_name
  // Those fields should only be updated via /support/updatecunsultantpolicy endpoint
  static async updateStatusTechnicalConsultant(req, res) {
    try {
      const { backlog_id, status, expert_description, updated_by } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Updating backlog status and expert description for backlog_id: ${backlog_id}`);

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

      // Add updated_by if provided (to track who made the change)
      // NOTE: This does NOT update assigned_consultant_name or assigned_to
      // Those should only be updated via updateConsultantPolicy endpoint
      if (updated_by !== undefined && updated_by !== null && updated_by !== '') {
        updateData.updated_by = updated_by;
      }

      // NOTE: We intentionally do NOT update assigned_to or assigned_consultant_name here
      // These fields should only be updated via /support/updatecunsultantpolicy endpoint
      // This prevents accidentally changing the assigned consultant when someone just adds an expert description

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

  // GET /support/getpartner - Get all partners
  static async getPartners(req, res) {
    try {
      console.log(`[Support Team] Getting all partners`);

      // Fetch all partners with required fields
      const { data: partners, error } = await supabase
        .from('partners')
        .select('partner_id, first_name, last_name, deleted_flag')
        .order('partner_id', { ascending: true });

      if (error) {
        console.error('[Support Team] Error fetching partners:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch partners',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Format response - ensure deleted_flag is boolean (default to false if null)
      const formattedPartners = (partners || []).map(partner => ({
        partner_id: partner.partner_id,
        first_name: partner.first_name || null,
        last_name: partner.last_name || null,
        deleted_flag: partner.deleted_flag === true || partner.deleted_flag === 'true'
      }));

      console.log(`[Support Team] Returning ${formattedPartners.length} partners`);
      return res.status(200).json(formattedPartners);

    } catch (error) {
      console.error('[Support Team] Get partners error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/getdocumentcategories?case_type_id={case_type_id} - Get document categories by case type
  static async getDocumentCategories(req, res) {
    try {
      const { case_type_id } = req.query;

      if (!case_type_id) {
        return res.status(400).json({
          status: 'error',
          message: 'case_type_id query parameter is required',
          statusCode: 400
        });
      }

      const caseTypeIdNum = parseInt(case_type_id);
      if (isNaN(caseTypeIdNum) || caseTypeIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'case_type_id must be a valid positive number',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching document categories for case_type_id: ${caseTypeIdNum}`);

      // Fetch document categories filtered by case_type_id and is_active
      const { data: categories, error } = await supabase
        .from('document_categories')
        .select('category_id, document_name')
        .eq('case_type_id', caseTypeIdNum)
        .eq('is_active', true)
        .order('category_id', { ascending: true });

      if (error) {
        console.error('[Support Team] Error fetching document categories:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch document categories',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Remove duplicates by document_name - keep only the first occurrence (lowest category_id)
      const seenNames = new Map();
      const uniqueCategories = (categories || []).filter(cat => {
        const docName = (cat.document_name || '').trim();
        if (!docName) return false; // Skip empty document names
        
        // Normalize the name for comparison (trim and lowercase)
        const normalizedName = docName.toLowerCase();
        
        if (!seenNames.has(normalizedName)) {
          seenNames.set(normalizedName, cat.category_id);
          return true;
        }
        return false; // Skip duplicate
      });

      // Format document categories - only document_name and category_id
      const formattedCategories = uniqueCategories.map(cat => ({
        document_name: (cat.document_name || '').trim(),
        category_id: cat.category_id
      }));

      // Get current date for headers
      const now = new Date();
      const dateHeader = now.toUTCString();

      // Build response in Supabase-like format
      const response = [{
        body: formattedCategories,
        headers: {
          date: dateHeader,
          "content-type": "application/json; charset=utf-8",
          "transfer-encoding": "chunked",
          connection: "close",
          server: "nodejs",
          "content-range": `0-${formattedCategories.length - 1}/${formattedCategories.length}`,
          "content-location": `/document_categories?case_type_id=eq.${caseTypeIdNum}&select=document_name%2Ccategory_id`,
          "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
          vary: "Accept-Encoding",
          "x-content-type-options": "nosniff",
          "content-profile": "expc"
        },
        statusCode: 200,
        statusMessage: "OK"
      }];

      console.log(`[Support Team] Returning ${formattedCategories.length} document categories`);
      return res.status(200).json(response);

    } catch (error) {
      console.error('[Support Team] Get document categories error:', error);
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

  // POST /support/upload - Upload document for a case
  static async uploadDocument(req, res) {
    try {
      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'File is required',
          statusCode: 400
        });
      }

      const { case_id, category_id, emp_id } = req.body;

      if (!case_id) {
        return res.status(400).json({
          status: 'error',
          message: 'case_id is required',
          statusCode: 400
        });
      }

      if (!category_id) {
        return res.status(400).json({
          status: 'error',
          message: 'category_id is required',
          statusCode: 400
        });
      }

      const categoryIdNum = parseInt(category_id);
      if (isNaN(categoryIdNum) || categoryIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'category_id must be a valid positive number',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Uploading document for case_id: ${case_id}, category_id: ${categoryIdNum}`);

      // Step 1: Get case to find case_type_id
      const { data: caseData, error: caseError } = await CaseModel.findByCaseId(case_id);

      if (caseError || !caseData) {
        console.error('[Support Team] Error fetching case:', caseError);
        return res.status(404).json({
          status: 'error',
          message: `Case with ID ${case_id} not found`,
          statusCode: 404
        });
      }

      if (!caseData.case_type_id) {
        return res.status(400).json({
          status: 'error',
          message: `Case ${case_id} does not have a case_type_id`,
          statusCode: 400
        });
      }

      console.log(`[Support Team] Found case, case_type_id: ${caseData.case_type_id}`);

      // Step 2: Get case_type_name to construct bucket name
      const { data: caseTypeData, error: caseTypeError } = await supabase
        .from('case_types')
        .select('case_type_name')
        .eq('case_type_id', caseData.case_type_id)
        .single();

      if (caseTypeError || !caseTypeData) {
        console.error('[Support Team] Error fetching case_type:', caseTypeError);
        return res.status(500).json({
          status: 'error',
          message: 'Could not determine case type',
          statusCode: 500
        });
      }

      const caseTypeName = caseTypeData.case_type_name;
      const safeCaseType = caseTypeName.trim().toLowerCase().replace(/\s+/g, '-');
      let bucketName = `expc-${safeCaseType}`;

      console.log(`[Support Team] Using bucket: "${bucketName}"`);

      // Step 3: Verify category_id exists and matches case_type_id
      const { data: categoryData, error: categoryError } = await supabase
        .from('document_categories')
        .select('category_id, document_name, case_type_id')
        .eq('category_id', categoryIdNum)
        .single();

      if (categoryError || !categoryData) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid category_id: ${categoryIdNum} does not exist`,
          statusCode: 400
        });
      }

      if (categoryData.case_type_id !== caseData.case_type_id) {
        return res.status(400).json({
          status: 'error',
          message: `category_id ${categoryIdNum} does not match case_type_id ${caseData.case_type_id}`,
          statusCode: 400
        });
      }

      // Step 4: Check if bucket exists, create if not
      const { data: buckets, error: listBucketsError } = await supabase.storage.listBuckets();
      let bucketExists = false;
      if (!listBucketsError && buckets) {
        bucketExists = buckets.some(bucket => bucket.name === bucketName);
        console.log(`[Support Team] Bucket "${bucketName}" exists: ${bucketExists}`);
      }

      if (!bucketExists) {
        console.log(`[Support Team] Bucket "${bucketName}" does not exist, attempting to create...`);
        const { data: createBucketData, error: createBucketError } = await supabase.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          fileSizeLimit: 10485760 // 10MB
        });

        if (createBucketError) {
          console.error('[Support Team] Error creating bucket:', createBucketError);
          // Try fallback bucket
          bucketName = 'case-documents';
          console.log(`[Support Team] Using fallback bucket: "${bucketName}"`);
        } else {
          console.log(`[Support Team] ✓ Successfully created bucket: "${bucketName}"`);
        }
      }

      // Step 5: Upload file to Supabase Storage
      const file = req.file;
      const fileName = file.originalname;
      const fileExt = path.extname(fileName);
      const baseFileName = path.basename(fileName, fileExt).replace(/[^a-zA-Z0-9]/g, '_');
      
      // Generate timestamp for file path
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;
      
      const storagePath = `case-${case_id}/${categoryData.document_name}_${baseFileName}_${timestamp}${fileExt}`;
      
      console.log(`[Support Team] Uploading to bucket: "${bucketName}", path: "${storagePath}"`);

      let publicUrl = storagePath;
      let uploadError = null;
      
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: false
        });

      if (uploadErr) {
        console.error('[Support Team] Error uploading file:', uploadErr);
        
        // If bucket error, try fallback bucket
        if (uploadErr.message && (uploadErr.message.includes('Bucket') || uploadErr.message.includes('not found'))) {
          const fallbackBucket = 'case-documents';
          console.log(`[Support Team] Retrying with fallback bucket: "${fallbackBucket}"`);
          
          const { data: retryUploadData, error: retryUploadError } = await supabase.storage
            .from(fallbackBucket)
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype || 'application/octet-stream',
              upsert: false
            });

          if (retryUploadError) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to upload file to storage',
              error: retryUploadError.message || 'Unknown error',
              statusCode: 500
            });
          }

          // Get public URL from fallback bucket
          const { data: urlData } = supabase.storage
            .from(fallbackBucket)
            .getPublicUrl(storagePath);
          
          if (urlData?.publicUrl) {
            publicUrl = urlData.publicUrl;
          }
        } else {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload file to storage',
            error: uploadErr.message || 'Unknown error',
            statusCode: 500
          });
        }
      } else {
        console.log(`[Support Team] ✓ Successfully uploaded to bucket: "${bucketName}"`);
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(storagePath);

        if (urlData?.publicUrl) {
          publicUrl = urlData.publicUrl;
        }
      }

      // Step 6: Get user_id from employee_id if emp_id is provided
      let userId = null;
      if (emp_id) {
        const empIdNum = parseInt(emp_id);
        if (!isNaN(empIdNum) && empIdNum > 0) {
          // Get user_id from employees table
          const { data: employeeData, error: empError } = await supabase
            .from('employees')
            .select('user_id')
            .eq('employee_id', empIdNum)
            .single();

          if (!empError && employeeData && employeeData.user_id) {
            userId = employeeData.user_id;
            console.log(`[Support Team] Found user_id ${userId} for employee_id ${empIdNum}`);
          } else {
            console.warn(`[Support Team] Employee ${empIdNum} not found or has no user_id, uploaded_by will be null`);
          }
        }
      }

      // Step 7: Get next document_id
      const { data: maxDoc } = await supabase
        .from('case_documents')
        .select('document_id')
        .order('document_id', { ascending: false })
        .limit(1)
        .single();

      const nextDocumentId = (maxDoc?.document_id || 0) + 1;

      // Step 8: Insert document into case_documents table
      const documentData = {
        document_id: nextDocumentId,
        case_id: case_id,
        category_id: categoryIdNum,
        original_filename: fileName,
        stored_filename: `${categoryData.document_name}_${baseFileName}_${timestamp}${fileExt}`,
        file_path: publicUrl,
        file_size: file.size || null,
        file_type: categoryData.document_name || null,
        mime_type: file.mimetype || null,
        uploaded_by: userId, // Use user_id from employees table, or null
        upload_time: new Date().toISOString(),
        is_active: true,
        deleted_flag: false,
        is_customer_visible: true,
        version_number: 1
      };

      const { data: insertedDocument, error: insertError } = await supabase
        .from('case_documents')
        .insert([documentData])
        .select()
        .single();

      if (insertError) {
        console.error('[Support Team] Error inserting document:', insertError);
        console.error('[Support Team] Full error details:', JSON.stringify(insertError, null, 2));
        
        // Check for foreign key constraint violations
        let errorMessage = 'Failed to save document to database';
        if (insertError.message && insertError.message.includes('foreign key')) {
          if (insertError.message.includes('case_id')) {
            errorMessage = `Case ID "${case_id}" does not exist in cases table`;
          } else if (insertError.message.includes('category_id')) {
            errorMessage = `Category ID ${categoryIdNum} does not exist in document_categories table`;
          } else if (insertError.message.includes('uploaded_by')) {
            errorMessage = `User ID ${userId} does not exist in users table`;
          } else {
            errorMessage = `Foreign key constraint violation: ${insertError.message}`;
          }
        }
        
        return res.status(500).json({
          status: 'error',
          message: errorMessage,
          error: insertError.message || 'Unknown error',
          statusCode: 500,
          details: {
            case_id: case_id,
            category_id: categoryIdNum,
            uploaded_by: userId
          }
        });
      }

      console.log(`[Support Team] Document saved with document_id: ${insertedDocument.document_id}`);

      // Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Document uploaded successfully',
        data: {
          document_id: insertedDocument.document_id,
          case_id: case_id,
          file_path: publicUrl
        }
      });

    } catch (error) {
      console.error('[Support Team] Upload document error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/view
  // View case document by document_id
  static async viewDocument(req, res) {
    try {
      const { document_id } = req.body;

      if (!document_id) {
        return res.status(400).json({
          status: 'error',
          message: 'document_id is required in request body',
          statusCode: 400
        });
      }

      console.log(`[View Document] Fetching case document_id: ${document_id}`);

      // Step 1: Get document from case_documents table
      const { data: document, error: docError } = await supabase
        .from('case_documents')
        .select(`
          *,
          cases!case_documents_case_id_fkey(
            case_id,
            case_type_id
          )
        `)
        .eq('document_id', document_id)
        .eq('deleted_flag', false)
        .maybeSingle();

      if (docError || !document) {
        console.error('[View Document] Document not found:', docError);
        return res.status(404).json({
          status: 'error',
          message: 'Document not found',
          statusCode: 404
        });
      }

      console.log(`[View Document] Found document: file_path=${document.file_path}`);

      // Step 2: Get case_type_name
      let caseTypeName = null;
      if (document.cases && document.cases.case_type_id) {
        const { data: caseType, error: caseError } = await supabase
          .from('case_types')
          .select('case_type_name')
          .eq('case_type_id', document.cases.case_type_id)
          .maybeSingle();

        if (!caseError && caseType) {
          caseTypeName = caseType.case_type_name;
        }
      }

      // Step 3: Construct bucket name
      let bucketName = 'case-documents'; // Default fallback bucket
      if (caseTypeName) {
        bucketName = `expc-${caseTypeName.trim().toLowerCase().replace(/\s+/g, '-')}`;
      }
      console.log(`[View Document] Using bucket: ${bucketName}`);

      // Step 4: Extract file path
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
      } else if (storagePath && storagePath.includes(bucketName + '/')) {
        // If path contains bucket name, remove it
        storagePath = storagePath.split(bucketName + '/')[1] || storagePath;
      }

      console.log(`[View Document] Extracted storage path: ${storagePath}`);

      // Step 5: Download file from storage - try multiple buckets
      const bucketVariations = [
        bucketName, // expc-{case_type_name}
        'case-documents', // Fallback bucket
        'public-fire', // Common bucket
        'expc-general' // General bucket
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
          status: 'error',
          message: 'File not found in storage',
          details: {
            tried_buckets: bucketVariations,
            storage_path: storagePath
          },
          statusCode: 500
        });
      }

      // Step 6: Return file
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = path.extname(storagePath).toLowerCase();
      
      // Determine Content-Type based on file extension
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
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /support/removecrmdocument?document_id={document_id}
  // Soft delete a case document
  static async removeCrmDocument(req, res) {
    try {
      const { document_id } = req.query;
      const { case_id, emp_id } = req.body;

      // Validate document_id
      if (!document_id) {
        return res.status(400).json({
          status: 'error',
          message: 'document_id query parameter is required',
          statusCode: 400
        });
      }

      const documentIdNum = parseInt(document_id);
      if (isNaN(documentIdNum) || documentIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'document_id must be a valid positive number',
          statusCode: 400
        });
      }

      console.log(`[Remove Document] Removing document_id: ${documentIdNum}`);

      // Step 1: Verify document exists and get case_id if not provided
      const { data: existingDoc, error: docError } = await supabase
        .from('case_documents')
        .select('document_id, case_id, deleted_flag')
        .eq('document_id', documentIdNum)
        .maybeSingle();

      if (docError || !existingDoc) {
        return res.status(404).json({
          status: 'error',
          message: `Document with ID ${documentIdNum} not found`,
          statusCode: 404
        });
      }

      if (existingDoc.deleted_flag === true) {
        return res.status(400).json({
          status: 'error',
          message: 'Document is already deleted',
          statusCode: 400
        });
      }

      // Use case_id from document if not provided in body
      const actualCaseId = case_id || existingDoc.case_id;

      // Step 2: Verify case exists if case_id is provided
      if (actualCaseId) {
        const { data: caseData, error: caseError } = await CaseModel.findByCaseId(actualCaseId);
        if (caseError || !caseData) {
          console.warn(`[Remove Document] Case ${actualCaseId} not found, but proceeding with document deletion`);
        }
      }

      // Step 3: Soft delete the document (set deleted_flag = true)
      const { data: updatedDoc, error: updateError } = await supabase
        .from('case_documents')
        .update({ 
          deleted_flag: true,
          is_active: false
        })
        .eq('document_id', documentIdNum)
        .select()
        .single();

      if (updateError) {
        console.error('[Remove Document] Error updating document:', updateError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to remove document',
          error: updateError.message || 'Unknown error',
          statusCode: 500
        });
      }

      console.log(`[Remove Document] Successfully removed document_id: ${documentIdNum}`);

      // Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Document removed successfully',
        data: {
          document_id: documentIdNum,
          case_id: actualCaseId,
          deleted_flag: true
        },
        statusCode: 200
      });

    } catch (error) {
      console.error('[Remove Document] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/everything-cases
  // Get comprehensive case data including all related information
  static async getEverythingCases(req, res) {
    try {
      const { case_id } = req.body;

      // Validate case_id parameter
      if (!case_id) {
        return res.status(400).json({
          status: 'error',
          message: 'case_id is required in request body',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching comprehensive data for case_id: ${case_id}`);

      // Fetch case with basic relationships
      const { data: caseData, error: caseError } = await supabase
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
        `)
        .eq('case_id', case_id)
        .eq('deleted_flag', false)
        .single();

      if (caseError) {
        console.error('[Support Team] Error fetching case:', caseError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch case data',
          error: caseError.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!caseData) {
        return res.status(404).json({
          status: 'error',
          message: 'Case not found',
          statusCode: 404
        });
      }

      // Fetch all related data in parallel
      const [
        stakeholdersResult,
        commentsResult,
        documentsResult,
        paymentPhasesResult,
        stageHistoryResult
      ] = await Promise.all([
        // 1. Get case_stakeholders
        supabase
          .from('case_stakeholders')
          .select('*')
          .eq('case_id', case_id)
          .order('created_time', { ascending: false })
          .then(({ data, error }) => ({ data: data || [], error }))
          .catch(() => ({ data: [], error: null })),

        // 2. Get case_comments
        supabase
          .from('case_comments')
          .select(`
            *,
            users!case_comments_user_id_fkey(
              user_id,
              email,
              role
            )
          `)
          .eq('case_id', case_id)
          .order('created_time', { ascending: false })
          .then(({ data, error }) => ({ data: data || [], error }))
          .catch(() => ({ data: [], error: null })),

        // 3. Get case_documents (filter out deleted)
        supabase
          .from('case_documents')
          .select(`
            *,
            document_categories!case_documents_category_id_fkey(
              category_id,
              document_name,
              is_mandatory
            ),
            users!case_documents_uploaded_by_fkey(
              user_id,
              email
            )
          `)
          .eq('case_id', case_id)
          .eq('deleted_flag', false)
          .order('upload_time', { ascending: false })
          .then(({ data, error }) => ({ data: data || [], error }))
          .catch(() => ({ data: [], error: null })),

        // 4. Get case_payment_phases
        supabase
          .from('case_payment_phases')
          .select('*')
          .eq('case_id', case_id)
          .order('created_time', { ascending: false })
          .then(({ data, error }) => ({ data: data || [], error }))
          .catch(() => ({ data: [], error: null })),

        // 5. Get case_stage_history
        supabase
          .from('case_stage_history')
          .select(`
            *,
            users!case_stage_history_changed_by_fkey(
              user_id,
              email
            ),
            employees!case_stage_history_changed_to_fkey(
              employee_id,
              first_name,
              last_name
            )
          `)
          .eq('case_id', case_id)
          .eq('deleted_flag', false)
          .order('created_time', { ascending: false })
          .then(({ data, error }) => ({ data: data || [], error }))
          .catch(() => ({ data: [], error: null }))
      ]);

      // Extract numeric case_id from string (e.g., "ECSI-25-121" -> 121)
      // Try to extract the number after the last dash
      let numericCaseId = null;
      if (case_id && typeof case_id === 'string') {
        const parts = case_id.split('-');
        if (parts.length > 0) {
          const lastPart = parts[parts.length - 1];
          numericCaseId = parseInt(lastPart, 10);
          if (isNaN(numericCaseId)) {
            numericCaseId = null;
          }
        }
      }

      // Flatten case data and build response matching frontend requirements
      // All fields must be at root level with exact field names
      const response = {
        // Case fields (flattened from caseData)
        case_id: numericCaseId || caseData.case_id || case_id,
        case_summary: caseData.case_summary || null,
        case_description: caseData.case_description || null,
        priority: caseData.priority || null,
        ticket_stage: caseData.ticket_stage || null,
        due_date: caseData.due_date || null,
        case_value: caseData.case_value || null,
        value_currency: caseData.value_currency || null,
        customer_id: caseData.customer_id || null,
        assigned_to: caseData.assigned_to || null,
        updated_time: caseData.updated_time || null,
        created_time: caseData.created_time || null,
        referral_date: caseData.referral_date || null,
        referring_partner_id: caseData.referring_partner_id || null,
        case_type_id: caseData.case_type_id || null,
        resolution_summary: caseData.resolution_summary || null,
        customer_satisfaction_rating: caseData.customer_satisfaction_rating || null,
        referral_notes: caseData.referral_notes || null,
        bonus_eligible: caseData.bonus_eligible || null,
        value_confirmed: caseData.value_confirmed || null,
        value_confirmed_by: caseData.value_confirmed_by || null,
        value_confirmed_date: caseData.value_confirmed_date || null,
        created_by: caseData.created_by || null,
        updated_by: caseData.updated_by || null,
        task_type: caseData.task_type || null,
        service_amount: caseData.service_amount || null,
        claim_amount: caseData.claim_amount || null,
        
        // Related objects (flattened)
        case_types: caseData.case_types ? {
          case_type_id: caseData.case_types.case_type_id || null,
          case_type_name: caseData.case_types.case_type_name || null,
          description: caseData.case_types.description || null,
          is_commercial: caseData.case_types.is_commercial || null,
          is_active: caseData.case_types.is_active || null
        } : null,
        
        customers: caseData.customers ? {
          customer_id: caseData.customers.customer_id || null,
          first_name: caseData.customers.first_name || null,
          last_name: caseData.customers.last_name || null,
          email_address: caseData.customers.email_address || null,
          mobile_number: caseData.customers.mobile_number || null,
          emergency_contact: caseData.customers.emergency_contact || null,
          address: caseData.customers.address || null,
          customer_type: caseData.customers.customer_type || null,
          source: caseData.customers.source || null,
          user_id: caseData.customers.user_id || null,
          created_time: caseData.customers.created_time || null,
          updated_time: caseData.customers.updated_time || null,
          deleted_flag: caseData.customers.deleted_flag || false,
          notes: caseData.customers.notes || null,
          company_name: caseData.customers.company_name || null,
          language_preference: caseData.customers.language_preference || null,
          communication_preferences: caseData.customers.communication_preferences || null,
          gender: caseData.customers.gender || null,
          age: caseData.customers.age || null,
          partner_id: caseData.customers.partner_id || null,
          gstin: caseData.customers.gstin || null,
          pan: caseData.customers.pan || null,
          state: caseData.customers.state || null,
          pincode: caseData.customers.pincode || null
        } : null,
        
        employees: caseData.employees ? {
          employee_id: caseData.employees.employee_id || null,
          first_name: caseData.employees.first_name || null,
          last_name: caseData.employees.last_name || null,
          user_id: caseData.employees.user_id || null,
          department: caseData.employees.department || null,
          designation: caseData.employees.designation || null,
          mobile_number: caseData.employees.mobile_number || null,
          work_phone: caseData.employees.work_phone || null,
          email: caseData.employees.email || null
        } : null,
        
        // Related arrays with exact field names expected by frontend
        case_stakeholders: (stakeholdersResult.data || []).map(stakeholder => ({
          stakeholder_id: stakeholder.stakeholder_id || null,
          case_id: stakeholder.case_id || case_id,
          stakeholder_name: stakeholder.stakeholder_name || null,
          contact_email: stakeholder.contact_email || null,
          contact_phone: stakeholder.contact_phone || null,
          role: stakeholder.role || null,
          notes: stakeholder.notes || null,
          created_time: stakeholder.created_time || null,
          updated_time: stakeholder.updated_time || null,
          created_by: stakeholder.created_by || null,
          updated_by: stakeholder.updated_by || null
        })),
        
        case_comments: (commentsResult.data || []).map(comment => ({
          case_id: comment.case_id || case_id,
          user_id: comment.user_id || null,
          comment_id: comment.comment_id || null,
          is_internal: comment.is_internal || false,
          comment_text: comment.comment_text || null,
          created_time: comment.created_time || null,
          updated_time: comment.updated_time || null,
          parent_comment_id: comment.parent_comment_id || 0
        })),
        
        case_documents: (documentsResult.data || []).map(doc => ({
          document_id: doc.document_id || null,
          case_id: doc.case_id || case_id,
          category_id: doc.category_id || null,
          original_filename: doc.original_filename || null,
          stored_filename: doc.stored_filename || null,
          file_path: doc.file_path || null,
          file_size: doc.file_size || null,
          file_type: doc.file_type || null,
          mime_type: doc.mime_type || null,
          upload_time: doc.upload_time || null,
          uploaded_by: doc.uploaded_by || null,
          is_customer_visible: doc.is_customer_visible || null,
          is_active: doc.is_active || null,
          document_categories: doc.document_categories || null
        })),
        
        case_payment_phases: (paymentPhasesResult.data || []).map(phase => ({
          case_phase_id: phase.case_phase_id || null,
          case_id: phase.case_id || case_id,
          phase_name: phase.phase_name || null,
          case_type_id: phase.case_type_id || null,
          phase_amount: phase.phase_amount || null,
          due_date: phase.due_date || null,
          status: phase.status || null,
          paid_amount: phase.paid_amount || null,
          payment_date: phase.payment_date || null,
          payment_method: phase.payment_method || null,
          transaction_reference: phase.transaction_reference || null,
          invoice_number: phase.invoice_number || null,
          notes: phase.notes || null,
          created_time: phase.created_time || null,
          updated_time: phase.updated_time || null,
          created_by: phase.created_by || null,
          updated_by: phase.updated_by || null
        })),
        
        case_stage_history: (stageHistoryResult.data || []).map(history => ({
          stage_history_id: history.stage_history_id || null,
          case_id: history.case_id || case_id,
          previous_stage: history.previous_stage || null,
          new_stage: history.new_stage || null,
          changed_by: history.changed_by || null,
          changed_to: history.changed_to || null,
          changed_reason: history.changed_reason || null,
          created_time: history.created_time || null,
          created_by: history.created_by || null,
          users: history.users || null,
          employees: history.employees || null
        }))
      };

      // Return direct object (Option 1 - Recommended format)
      // Frontend can handle both array and object formats
      return res.status(200).json(response);

    } catch (error) {
      console.error('[Support Team] Unexpected error in getEverythingCases:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message || 'Unknown error',
        statusCode: 500
      });
    }
  }

  // PATCH /support/update_Task
  // Update a case/task with all related fields
  static async updateTask(req, res) {
    try {
      const {
        case_id,
        case_description,
        service_amount,
        claims_amount,
        due_date,
        partner_id,
        case_type,
        assignee,
        priority,
        ticket_stage,
        reviewer,
        stakeholder
      } = req.body;

      // Handle "changed reason" field (has space in name)
      const changedReason = req.body['changed reason'] || req.body['changed_reason'];

      // Validate required field
      if (!case_id) {
        return res.status(400).json({
          status: 'error',
          message: 'case_id is required',
          statusCode: 400
        });
      }

      console.log(`[Update Task] Updating case_id: ${case_id}`);

      // Step 1: Convert case_id to full format if needed (e.g., 121 -> ECSI-25-121)
      let fullCaseId = case_id;
      if (typeof case_id === 'number' || /^\d+$/.test(String(case_id))) {
        const currentYear = new Date().getFullYear() % 100;
        const yearPrefix = String(currentYear).padStart(2, '0');
        const caseNum = String(case_id).padStart(3, '0');
        fullCaseId = `ECSI-${yearPrefix}-${caseNum}`;
        console.log(`[Update Task] Converted case_id ${case_id} to ${fullCaseId}`);
      }

      // Step 2: Verify case exists and get current data
      const { data: existingCase, error: caseError } = await CaseModel.findByCaseId(fullCaseId);

      if (caseError || !existingCase) {
        return res.status(404).json({
          status: 'error',
          message: `Case with ID ${case_id} (${fullCaseId}) not found`,
          statusCode: 404
        });
      }

      // Step 3: Get user_id from reviewer if provided
      let userId = null;
      if (reviewer) {
        const reviewerNum = parseInt(reviewer);
        if (!isNaN(reviewerNum) && reviewerNum > 0) {
          // Get user_id from employees table
          const { data: employeeData, error: empError } = await supabase
            .from('employees')
            .select('user_id')
            .eq('employee_id', reviewerNum)
            .single();

          if (!empError && employeeData && employeeData.user_id) {
            userId = employeeData.user_id;
          }
        }
      }

      // Step 4: Prepare update data for cases table
      const updateData = {
        updated_time: new Date().toISOString()
      };

      if (case_description !== undefined) {
        updateData.case_description = case_description;
      }

      if (service_amount !== undefined) {
        updateData.service_amount = String(service_amount);
      }

      if (claims_amount !== undefined) {
        updateData.claim_amount = claims_amount ? String(claims_amount) : null;
      }

      if (due_date !== undefined && due_date !== null) {
        // Convert date format from "12/2/2025" to "2025-12-02" or keep as is if already formatted
        let formattedDate = due_date;
        if (typeof due_date === 'string' && due_date.includes('/')) {
          const parts = due_date.split('/');
          if (parts.length === 3) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            const year = parts[2];
            formattedDate = `${year}-${month}-${day}`;
          }
        }
        updateData.due_date = formattedDate;
      }

      if (partner_id !== undefined && partner_id !== null) {
        updateData.referring_partner_id = parseInt(partner_id);
      }

      if (case_type !== undefined && case_type !== null) {
        updateData.case_type_id = parseInt(case_type);
      }

      if (assignee !== undefined && assignee !== null) {
        updateData.assigned_to = parseInt(assignee);
      }

      if (priority !== undefined) {
        updateData.priority = priority;
      }

      if (ticket_stage !== undefined) {
        updateData.ticket_stage = ticket_stage;
      }

      if (userId !== null) {
        updateData.updated_by = userId;
      }

      // Step 5: Update the case
      const { data: updatedCase, error: updateError } = await supabase
        .from('cases')
        .update(updateData)
        .eq('case_id', fullCaseId)
        .select()
        .single();

      if (updateError) {
        console.error('[Update Task] Error updating case:', updateError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update case',
          error: updateError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Step 6: Create stage history entry if ticket_stage changed
      if (ticket_stage !== undefined && ticket_stage !== existingCase.ticket_stage) {
        // Get next stage_history_id
        const { data: maxHistory } = await supabase
          .from('case_stage_history')
          .select('stage_history_id')
          .order('stage_history_id', { ascending: false })
          .limit(1)
          .single();

        const nextHistoryId = (maxHistory?.stage_history_id || 0) + 1;

        const stageHistoryData = {
          stage_history_id: nextHistoryId,
          case_id: fullCaseId,
          previous_stage: existingCase.ticket_stage || null,
          new_stage: ticket_stage,
          changed_by: userId || existingCase.updated_by || null,
          changed_to: assignee ? parseInt(assignee) : existingCase.assigned_to || null,
          changed_reason: changedReason || 'Task updated',
          created_time: new Date().toISOString(),
          created_by: userId || existingCase.updated_by || null,
          deleted_flag: false
        };

        const { error: historyError } = await supabase
          .from('case_stage_history')
          .insert([stageHistoryData]);

        if (historyError) {
          console.error('[Update Task] Error creating stage history:', historyError);
          // Don't fail the request, just log the error
        }
      }

      // Step 7: Handle stakeholder update/creation
      if (stakeholder && typeof stakeholder === 'object') {
        // Check if stakeholder exists for this case
        const { data: existingStakeholder, error: stakeholderSearchError } = await supabase
          .from('case_stakeholders')
          .select('stakeholder_id')
          .eq('case_id', fullCaseId)
          .eq('stakeholder_name', stakeholder.stakeholder_name || '')
          .maybeSingle();

        const stakeholderData = {
          case_id: fullCaseId,
          stakeholder_name: stakeholder.stakeholder_name || null,
          contact_email: stakeholder.contact_email || null,
          contact_phone: stakeholder.contact_phone ? parseInt(stakeholder.contact_phone) : null,
          role: stakeholder.role || null,
          notes: stakeholder.notes || null,
          updated_time: new Date().toISOString()
        };

        if (stakeholder.created_by !== undefined && stakeholder.created_by !== null) {
          stakeholderData.created_by = parseInt(stakeholder.created_by);
        } else if (userId) {
          stakeholderData.created_by = userId;
        }

        if (stakeholder.updated_by !== undefined && stakeholder.updated_by !== null) {
          stakeholderData.updated_by = parseInt(stakeholder.updated_by);
        } else if (userId) {
          stakeholderData.updated_by = userId;
        }

        if (existingStakeholder && existingStakeholder.stakeholder_id) {
          // Update existing stakeholder
          const { error: updateStakeholderError } = await supabase
            .from('case_stakeholders')
            .update(stakeholderData)
            .eq('stakeholder_id', existingStakeholder.stakeholder_id);

          if (updateStakeholderError) {
            console.error('[Update Task] Error updating stakeholder:', updateStakeholderError);
          }
        } else {
          // Create new stakeholder
          // Get next stakeholder_id
          const { data: maxStakeholder } = await supabase
            .from('case_stakeholders')
            .select('stakeholder_id')
            .order('stakeholder_id', { ascending: false })
            .limit(1)
            .single();

          const nextStakeholderId = (maxStakeholder?.stakeholder_id || 0) + 1;

          stakeholderData.stakeholder_id = nextStakeholderId;
          stakeholderData.created_time = new Date().toISOString();

          const { error: insertStakeholderError } = await supabase
            .from('case_stakeholders')
            .insert([stakeholderData]);

          if (insertStakeholderError) {
            console.error('[Update Task] Error creating stakeholder:', insertStakeholderError);
          }
        }
      }

      // Step 8: Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Task updated successfully',
        data: {
          case_id: fullCaseId,
          ...updatedCase
        },
        statusCode: 200
      });

    } catch (error) {
      console.error('[Update Task] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/createcasepaymentphases
  // Create payment phases for a case
  static async createCasePaymentPhases(req, res) {
    try {
      const { case_id, payments } = req.body;

      // Validate required fields
      if (!case_id) {
        return res.status(400).json({
          status: 'error',
          message: 'case_id is required',
          statusCode: 400
        });
      }

      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'payments array is required and must not be empty',
          statusCode: 400
        });
      }

      console.log(`[Create Payment Phases] Creating payment phases for case_id: ${case_id}`);

      // Step 1: Convert case_id to full format if needed (e.g., 86 -> ECSI-25-086)
      let fullCaseId = case_id;
      if (typeof case_id === 'number' || /^\d+$/.test(String(case_id))) {
        const currentYear = new Date().getFullYear() % 100;
        const yearPrefix = String(currentYear).padStart(2, '0');
        const caseNum = String(case_id).padStart(3, '0');
        fullCaseId = `ECSI-${yearPrefix}-${caseNum}`;
        console.log(`[Create Payment Phases] Converted case_id ${case_id} to ${fullCaseId}`);
      }

      // Step 2: Verify case exists
      const { data: existingCase, error: caseError } = await CaseModel.findByCaseId(fullCaseId);

      if (caseError || !existingCase) {
        return res.status(404).json({
          status: 'error',
          message: `Case with ID ${case_id} (${fullCaseId}) not found`,
          statusCode: 404
        });
      }

      // Step 3: Get next case_phase_id
      const { data: maxPhase } = await supabase
        .from('case_payment_phases')
        .select('case_phase_id')
        .order('case_phase_id', { ascending: false })
        .limit(1)
        .single();

      let nextPhaseId = (maxPhase?.case_phase_id || 0) + 1;

      // Step 4: Prepare payment phases data
      const paymentPhasesData = [];
      const currentTime = new Date().toISOString();

      for (const payment of payments) {
        // Validate required fields in payment object
        if (!payment.phase_name) {
          return res.status(400).json({
            status: 'error',
            message: 'phase_name is required in each payment object',
            statusCode: 400
          });
        }

        const paymentPhaseData = {
          case_phase_id: nextPhaseId++,
          case_id: fullCaseId,
          phase_name: payment.phase_name || null,
          case_type_id: payment.case_type_id ? parseInt(payment.case_type_id) : existingCase.case_type_id || null,
          phase_amount: payment.phase_amount ? parseInt(payment.phase_amount) : null,
          due_date: payment.due_date || null,
          status: payment.status || 'pending',
          paid_amount: payment.paid_amount ? parseInt(payment.paid_amount) : null,
          payment_date: payment.payment_date || null,
          payment_method: payment.payment_method || null,
          transaction_reference: payment.transaction_reference || null,
          invoice_number: payment.invoice_number || null,
          notes: payment.notes || null,
          created_by: payment.created_by ? parseInt(payment.created_by) : null,
          created_time: currentTime,
          updated_by: payment.updated_by ? parseInt(payment.updated_by) : null,
          updated_time: currentTime
        };

        paymentPhasesData.push(paymentPhaseData);
      }

      // Step 5: Insert payment phases
      const { data: insertedPhases, error: insertError } = await supabase
        .from('case_payment_phases')
        .insert(paymentPhasesData)
        .select();

      if (insertError) {
        console.error('[Create Payment Phases] Error inserting payment phases:', insertError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create payment phases',
          error: insertError.message || 'Unknown error',
          statusCode: 500
        });
      }

      console.log(`[Create Payment Phases] Successfully created ${insertedPhases.length} payment phase(s)`);

      // Step 6: Return success response
      return res.status(200).json({
        status: 'success',
        message: `Successfully created ${insertedPhases.length} payment phase(s)`,
        data: {
          case_id: fullCaseId,
          payment_phases: insertedPhases
        },
        statusCode: 200
      });

    } catch (error) {
      console.error('[Create Payment Phases] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/getuserdetails?email={email}
  // Get user details by email
  static async getUserDetails(req, res) {
    try {
      // Get email from query parameter
      let email = req.query.email;

      // Validate email parameter
      if (!email) {
        return res.status(400).json([{
          status: 'error',
          message: 'Email parameter is required'
        }]);
      }

      // Decode URL encoded email (e.g., employee%40company.com -> employee@company.com)
      try {
        email = decodeURIComponent(email);
      } catch (decodeError) {
        // If decoding fails, use original email
        console.warn('[Get User Details] Email decode warning:', decodeError);
      }

      // Trim whitespace
      email = email.trim();

      // Validate email format
      if (!Validators.isValidEmail(email)) {
        return res.status(400).json([{
          status: 'error',
          message: 'Invalid email format'
        }]);
      }

      console.log(`[Get User Details] Fetching user details for email: ${email}`);

      // Get user by email
      const { data: user, error: userError } = await UserModel.findByEmail(email);

      if (userError) {
        console.error('[Get User Details] Error fetching user:', userError);
        return res.status(500).json([{
          status: 'error',
          message: 'Internal server error',
          error: userError.message || 'Unknown error'
        }]);
      }

      if (!user) {
        return res.status(404).json([{
          status: 'error',
          message: 'User not found'
        }]);
      }

      console.log(`[Get User Details] User found: user_id=${user.user_id}, role=${user.role}`);

      // Initialize response object
      let responseData = {
        status: 'success',
        message: 'session employee id data Fetch Successfully',
        email: user.email,
        userid: user.user_id,
        role: user.role || 'employee',
        name: '',
        designation: '',
        department: '',
        employee_id: null,
        partner_id: null,
        admin_id: null,
        customer_id: null,
        jwt: null,
        sessionid: null,
        expiry: null
      };

      // Get role-specific details based on user role
      const role = user.role?.toLowerCase();

      if (role === 'employee' && user.user_id) {
        // Get employee details (include deleted employees)
        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1);

        if (employeeError) {
          console.warn('[Get User Details] Error fetching employee details:', employeeError);
        }

        // Handle array response from limit(1)
        const employeeData = Array.isArray(employee) && employee.length > 0 ? employee[0] : employee;

        if (employeeData && !employeeError) {
          responseData.name = `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim() || user.username || '';
          responseData.department = employeeData.department || '';
          responseData.designation = employeeData.designation || 'employee';
          responseData.employee_id = employeeData.employee_id;
        } else {
          // Fallback to username if employee details not found
          responseData.name = user.username || '';
          responseData.designation = 'employee';
        }
      } else if (role === 'partner' && user.user_id) {
        // Get partner details
        const { data: partner, error: partnerError } = await PartnerModel.findByUserId(user.user_id);

        if (partnerError) {
          console.warn('[Get User Details] Error fetching partner details:', partnerError);
        }

        if (partner) {
          responseData.name = `${partner.first_name || ''} ${partner.last_name || ''}`.trim() || user.username || '';
          responseData.partner_id = partner.partner_id;
          responseData.designation = 'partner';
        } else {
          responseData.name = user.username || '';
          responseData.designation = 'partner';
        }
      } else if (role === 'admin' && user.user_id) {
        // Get admin details
        const { data: admin, error: adminError } = await supabase
          .from('admin')
          .select('*')
          .eq('user_id', user.user_id)
          .single();

        if (adminError) {
          console.warn('[Get User Details] Error fetching admin details:', adminError);
        }

        if (admin) {
          responseData.name = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || user.username || '';
          responseData.admin_id = admin.admin_id;
          responseData.designation = 'admin';
        } else {
          responseData.name = user.username || '';
          responseData.designation = 'admin';
        }
      } else if (role === 'customer' && user.user_id) {
        // Get customer details (include deleted customers)
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.user_id)
          .limit(1);

        if (customerError) {
          console.warn('[Get User Details] Error fetching customer details:', customerError);
        }

        // Handle array response from limit(1)
        const customerData = Array.isArray(customer) && customer.length > 0 ? customer[0] : customer;

        if (customerData && !customerError) {
          responseData.name = `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim() || user.username || '';
          responseData.customer_id = customerData.customer_id;
          responseData.designation = 'customer';
        } else {
          responseData.name = user.username || '';
          responseData.designation = 'customer';
        }
      } else {
        // Default: use username as name
        responseData.name = user.username || '';
        responseData.designation = role || 'employee';
      }

      // Get session details if available (optional)
      if (user.user_id) {
        const { data: session } = await supabase
          .from('user_session_details')
          .select('session_id, jwt_token, expires_at')
          .eq('user_id', user.user_id)
          .eq('is_active', true)
          .order('created_time', { ascending: false })
          .limit(1)
          .single();

        if (session) {
          responseData.jwt = session.jwt_token || null;
          responseData.sessionid = session.session_id || null;
          responseData.expiry = session.expires_at || null;
        }
      }

      // Return as array format as required
      return res.status(200).json([responseData]);

    } catch (error) {
      console.error('[Get User Details] Error:', error);
      return res.status(500).json([{
        status: 'error',
        message: 'Internal server error',
        error: error.message
      }]);
    }
  }
}

export default SupportController;


